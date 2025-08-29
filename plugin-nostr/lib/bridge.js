// Lightweight bridge so external modules can request a Nostr post
const { EventEmitter } = require('events');

const emitter = new EventEmitter();

// Prevent memory leak warnings and add basic error handling
emitter.setMaxListeners(10);
emitter.on('error', (err) => {
  console.warn('[Bridge] Event error:', err.message);
});

// Override emit to add validation
const originalEmit = emitter.emit.bind(emitter);
emitter.emit = function(event, payload) {
  if (event === 'external.post') {
    if (!payload?.text?.trim()) return false;
    if (payload.text.length > 1000) return false; // Sanity check
  }
  return originalEmit(event, payload);
};

// Add helper for safe emit with validation (deprecated, use direct emit)
const safeEmit = (event, payload) => {
  return emitter.emit(event, payload);
};

module.exports = { emitter, safeEmit };
