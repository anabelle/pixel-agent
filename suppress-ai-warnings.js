// Preload Module for ElizaOS Agent
// This is loaded before @elizaos/cli starts

// 1. Suppress AI SDK warnings about unsupported model settings
globalThis.AI_SDK_LOG_WARNINGS = false;

// 2. Load the worldId + useModel patches to fix Telegram plugin issues
try {
  require('./telegram-worldid-patch.cjs');
} catch (e) {
  console.log('[preload] WorldId/useModel patch not available:', e.message);
}
