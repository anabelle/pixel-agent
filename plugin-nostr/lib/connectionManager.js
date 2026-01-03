"use strict";

/**
 * Connection Manager
 * Extracted from service.js (lines 5648-5800) for better separation.
 * Handles pool lifecycle, health monitoring, and reconnection logic.
 */

class ConnectionManager {
  constructor({ poolFactory, relays, pkHex, runtime, handlers, config, logger }) {
    this.poolFactory = poolFactory;
    this.relays = relays;
    this.pkHex = pkHex;
    this.runtime = runtime;
    this.handlers = handlers; // { onevent, oneose, onclose }
    this.config = config; // { checkIntervalMs, maxTimeSinceLastEventMs, maxReconnectAttempts, reconnectDelayMs }
    this.logger = logger || console;

    this.pool = null;
    this.listenUnsub = null;
    this.homeFeedUnsub = null;
    this.monitorTimer = null;
    this.reconnectAttempts = 0;
    this.lastEventReceived = Date.now();
  }

  // Placeholder - T019
  async setup() { throw new Error('Not implemented - see T019'); }

  // Placeholder - T020
  startMonitoring() { throw new Error('Not implemented - see T020'); }
  checkHealth() { throw new Error('Not implemented - see T020'); }
  async attemptReconnection() { throw new Error('Not implemented - see T020'); }

  stop() {
    if (this.monitorTimer) clearTimeout(this.monitorTimer);
    if (this.listenUnsub) try { this.listenUnsub(); } catch {}
    if (this.homeFeedUnsub) try { this.homeFeedUnsub(); } catch {}
    if (this.pool) try { this.pool.close([]); } catch {}
  }
}

module.exports = { ConnectionManager };
