// Lightweight bridge so external modules can request a Nostr post
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Location of the bridge file inside the agent container.
// This is mounted to ./data/eliza/nostr_bridge.jsonl on the host.
const BRIDGE_FILE = '/app/.eliza/nostr_bridge.jsonl';

class BridgeEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
    this.on('error', (err) => {
      console.warn('[Bridge] Event error:', err.message);
    });
    console.log('[Bridge] Initialization: File-based watcher starting at', BRIDGE_FILE);
    this.startWatcher();
  }

  startWatcher() {
    // Check for bridge file periodically (every 5 seconds)
    // This allows cross-process communication without shared memory
    setInterval(() => {
      try {
        if (fs.existsSync(BRIDGE_FILE)) {
          const content = fs.readFileSync(BRIDGE_FILE, 'utf-8');
          // Immediately unlink to "consume" the message and prevent loops
          try { fs.unlinkSync(BRIDGE_FILE); } catch { }

          const lines = content.split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const payload = JSON.parse(line);
              if (payload.text) {
                console.log('[Bridge] Consumed external post request from file');
                this.emit('external.post', payload);
              }
            } catch (e) {
              console.warn('[Bridge] Failed to parse bridge line:', e.message);
            }
          }
        }
      } catch (err) {
        // Silent fail for watcher
      }
    }, 5000);
  }

  // Override emit to add validation
  emit(event, payload) {
    if (event === 'external.post') {
      if (!payload?.text?.trim()) return false;
      if (payload.text.length > 2000) return false; // Sanity check
    }
    return super.emit(event, payload);
  }
}

const emitter = new BridgeEmitter();

module.exports = {
  emitter,
  safeEmit: (ev, p) => emitter.emit(ev, p)
};
