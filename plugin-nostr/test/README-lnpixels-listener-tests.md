# LNPixels Listener Test Suite

## Overview

Comprehensive test suite for `lib/lnpixels-listener.js` designed to achieve 100% code coverage.

## Test Coverage

### 1. Connection Management (8 tests)
- ✅ Establishes WebSocket connection with correct URL
- ✅ Uses default URL when LNPIXELS_WS_URL not set
- ✅ Logs connection success
- ✅ Updates health status on connect
- ✅ Handles disconnection
- ✅ Handles connection errors
- ✅ Resets consecutive errors on successful connection
- ✅ Disconnects gracefully on cleanup (SIGTERM/SIGINT)

### 2. Event Handling (6 tests)
- ✅ Receives and processes activity.append events
- ✅ Ignores pixel.update events
- ✅ Updates health metrics on event processing
- ✅ Handles processing errors gracefully
- ✅ Continues processing after errors
- ✅ Tracks consecutive errors

### 3. Activity Validation (12 tests)
- ✅ Accepts valid single pixel events
- ✅ Rejects events with missing coordinates
- ✅ Rejects events with invalid coordinates (out of range)
- ✅ Rejects payment events
- ✅ Accepts bulk purchases with metadata.pixelUpdates
- ✅ Accepts bulk purchases with summary
- ✅ Rejects bulk purchases when disabled via env
- ✅ Rejects null or undefined activities
- ✅ Validates sats range (0-1000000)
- ✅ Validates letter length (<= 10 characters)
- ✅ Validates coordinate ranges (-1000 to 1000)
- ✅ Validates activity structure

### 4. Rate Limiting (5 tests)
- ✅ Allows posts within rate limit
- ✅ Drops events when rate limit exceeded
- ✅ Refills tokens over time
- ✅ Does not exceed max tokens
- ✅ Tracks rate limiter state in health metrics

### 5. Deduplication (7 tests)
- ✅ Deduplicates events with same event_id
- ✅ Deduplicates events with same coordinates and timestamp
- ✅ Tracks deduplication cache size
- ✅ Cleans expired entries from cache
- ✅ Allows events with different identifiers
- ✅ Uses payment_hash for deduplication when available
- ✅ Uses multiple fallback keys (event_id, payment_hash, paymentId, etc.)

### 6. Memory Integration (4 tests)
- ✅ Creates delegation memory when enabled
- ✅ Skips memory creation when disabled
- ✅ Handles memory creation errors gracefully
- ✅ Validates memory structure

### 7. Health Monitoring (7 tests)
- ✅ Provides health check endpoint (_pixelHealth)
- ✅ Tracks total events
- ✅ Tracks total posts
- ✅ Tracks total errors
- ✅ Updates lastEvent timestamp
- ✅ Resets consecutive errors on success
- ✅ Exposes rate limiter and deduplication metrics

### 8. Integration with Runtime (3 tests)
- ✅ Calls runtime.process with pixel activity
- ✅ Handles runtime.process errors gracefully
- ✅ Works without runtime.process

### 9. Memory Helper Functions (5 tests)
- ✅ Exports createLNPixelsMemory function
- ✅ Exports createLNPixelsEventMemory function
- ✅ Creates memory with correct structure
- ✅ Creates event memory when throttled
- ✅ Handles missing runtime.createMemory
- ✅ Handles memory creation errors

### 10. Error Recovery (2 tests)
- ✅ Continues processing after validation errors
- ✅ Handles catastrophic errors in event handler

## Total Test Count: 59 tests

## Running the Tests

```bash
# From the plugin-nostr directory
npm test test/lnpixels-listener.test.js

# Run with coverage
npm run test:coverage -- test/lnpixels-listener.test.js

# Watch mode
npm run test:watch -- test/lnpixels-listener.test.js
```

## Coverage Goals

- **Statements**: 100% (from 41.95%)
- **Branches**: 100% (from 15.62%)
- **Functions**: 100% (from 33.33%)
- **Lines**: 100% (from 41.95%)

## Key Features Tested

### WebSocket Management
- Connection lifecycle (connect/disconnect/reconnect)
- Error handling and recovery
- Health monitoring
- Graceful shutdown

### Event Processing
- Activity validation
- Rate limiting (token bucket)
- Deduplication (TTL-based cache)
- Bridge integration

### Memory Integration
- LNPixels post memories
- LNPixels event memories
- Context creation
- Error handling

### Observability
- Health metrics
- Event counters
- Error tracking
- Rate limiter status

## Test Patterns

The test suite follows the established patterns in the repository:
- Uses Vitest as the test runner
- Comprehensive mocking of external dependencies
- Async/await for promise handling
- Proper cleanup in afterEach hooks
- Descriptive test names and organization

## Dependencies Mocked

- `socket.io-client`: Custom EventEmitter-based mock
- `../lib/bridge.js`: EventEmitter instance
- `../lib/context.js`: Context management functions
- `@elizaos/core`: UUID generation and channel types

## Environment Variables Tested

- `LNPIXELS_WS_URL`: WebSocket URL configuration
- `LNPIXELS_CREATE_DELEGATION_MEMORY`: Memory creation toggle
- `LNPIXELS_ALLOW_BULK_SUMMARY`: Bulk purchase handling

## Related Files

- **Source**: `lib/lnpixels-listener.js`
- **Integration**: `lib/service.js` (consumes pixel.bought events)
- **Bridge**: `lib/bridge.js` (event emitter)
- **Context**: `lib/context.js` (LNPixels context management)
- **Related Test**: `test/service.pixelBought.test.js` (service-level tests)
