# Nostr Connection Monitoring Fix

## Problem

The Nostr agent was only listening to DMs at startup and not when they came in while the agent was running. This was due to a lack of connection monitoring and automatic reconnection logic for Nostr relay WebSocket connections.

## Root Cause

WebSocket connections to Nostr relays can drop silently due to:
- Network issues
- Relay restarts or maintenance
- Connection timeouts
- Temporary network interruptions

The original code had no mechanism to detect these disconnections or automatically reconnect, resulting in the agent becoming "deaf" to new events after connection loss.

## Solution

Added comprehensive connection monitoring and automatic reconnection functionality:

### 1. Connection Health Monitoring
- Tracks the timestamp of the last received event (`lastEventReceived`)
- Periodically checks if too much time has passed without receiving events
- Configurable check interval and maximum time without events

### 2. Automatic Reconnection
- Attempts to reconnect when connection health issues are detected
- Exponential backoff for retry attempts
- Configurable maximum retry attempts and delay
- Cleanly closes existing connections before reconnecting

### 3. Event Tracking
- Updates `lastEventReceived` timestamp on all event types (DMs, mentions, zaps, etc.)
- Also updates on EOSE (End of Stored Events) signals
- Tracks both main subscription and home feed subscription events

## Configuration

New environment variables to control connection monitoring:

| Variable | Default | Description |
|----------|---------|-------------|
| `NOSTR_CONNECTION_MONITOR_ENABLE` | `true` | Enable/disable connection monitoring |
| `NOSTR_CONNECTION_CHECK_INTERVAL_SEC` | `60` | How often to check connection health (seconds) |
| `NOSTR_MAX_TIME_SINCE_LAST_EVENT_SEC` | `300` | Max time without events before reconnecting (seconds) |
| `NOSTR_RECONNECT_DELAY_SEC` | `30` | Delay between reconnection attempts (seconds) |
| `NOSTR_MAX_RECONNECT_ATTEMPTS` | `5` | Maximum number of reconnection attempts |

## Implementation Details

### Connection Monitoring Flow
1. Service starts and establishes initial connections
2. Connection monitoring timer starts (if enabled)
3. Every event received updates `lastEventReceived` timestamp
4. Periodic health checks compare current time with last event time
5. If threshold exceeded, reconnection is triggered

### Reconnection Process
1. Close existing subscriptions and pool connections
2. Wait for configured delay (with exponential backoff on retries)
3. Recreate SimplePool and reestablish subscriptions
4. Resume monitoring on successful reconnection
5. Give up after maximum attempts reached

### Key Methods Added
- `_startConnectionMonitoring()` - Starts the monitoring timer
- `_checkConnectionHealth()` - Checks if connection is healthy
- `_attemptReconnection()` - Handles reconnection logic
- `_setupConnection()` - Establishes pool and subscriptions (extracted from start method)

## Benefits

1. **Reliability**: Agent continues to receive DMs even after connection drops
2. **Automatic Recovery**: No manual intervention required for connection issues
3. **Configurable**: All timing parameters can be tuned for different environments
4. **Logging**: Clear logs show connection health and reconnection attempts
5. **Resource Management**: Properly cleans up connections before reconnecting

## Backwards Compatibility

- All existing functionality remains unchanged
- Connection monitoring is enabled by default
- Can be disabled by setting `NOSTR_CONNECTION_MONITOR_ENABLE=false`
- No changes required to existing configuration

## Testing

Added comprehensive test suite covering:
- Configuration validation
- Health monitoring logic
- Reconnection attempts and retry logic
- Timer cleanup and resource management
- Integration with event handlers

## Logging

New log messages help monitor connection health:
- `[NOSTR] Connection healthy, last event received Xs ago`
- `[NOSTR] No events received in Xs, checking connection health`
- `[NOSTR] Attempting reconnection X/Y`
- `[NOSTR] Reconnection X successful`
- `[NOSTR] Subscription closed: reason`

This fix ensures the Nostr agent maintains reliable connectivity and continues to respond to DMs throughout its runtime, not just at startup.
