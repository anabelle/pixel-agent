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

// 3. Filter Twitter rate limit spam from console output
// The twitter-api-v2 library logs full HTTP headers on rate limit errors
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

// Patterns that indicate Twitter rate limit header spam
const TWITTER_SPAM_PATTERNS = [
  /^\s*"x-rate-limit-/,
  /^\s*"x-user-limit-/,
  /^\s*"x-access-level"/,
  /^\s*"x-transaction-id"/,
  /^\s*"x-response-time"/,
  /^\s*"x-served-by"/,
  /^\s*"x-cache"/,
  /^\s*"x-cache-hits"/,
  /^\s*"x-timer"/,
  /^\s*"x-xss-protection"/,
  /^\s*"x-frame-options"/,
  /^\s*"x-content-type-options"/,
  /^\s*"content-disposition".*json\.json/,
  /^\s*"strict-transport-security"/,
  /^\s*"accept-ranges"/,
  /^\s*perf:/,
  /^\s*server: "envoy"/,
  /^\s*"api-version"/,
  /^\s*via: "1\.1 varnish/,
  /^\s*"set-cookie".*x\.com/,
  /^\s*"guest_id/,
  /^\s*"personalization_id/,
  /^\s*rateLimit: \{/,
  /^\s*limit: \d+,$/,
  /^\s*remaining: \d+,$/,
  /^\s*reset: \d+,$/,
];

let suppressingTwitterBlock = false;
let suppressLineCount = 0;
const MAX_SUPPRESS_LINES = 50; // Safety limit

function shouldSuppressLine(str) {
  if (typeof str !== 'string') return false;
  
  // Check if this looks like Twitter rate limit header spam
  for (const pattern of TWITTER_SPAM_PATTERNS) {
    if (pattern.test(str)) {
      suppressingTwitterBlock = true;
      suppressLineCount = 0;
      return true;
    }
  }
  
  // Continue suppressing if we're in a spam block (JSON structure)
  if (suppressingTwitterBlock) {
    suppressLineCount++;
    // Stop suppressing after safety limit or when we hit a clear end
    if (suppressLineCount > MAX_SUPPRESS_LINES || /^agent-1\s+\|\s+\[/.test(str)) {
      suppressingTwitterBlock = false;
      return false;
    }
    // Keep suppressing JSON-like content
    if (/^\s*[\[\]{},]?\s*$/.test(str) || /^\s*"[^"]+":/.test(str)) {
      return true;
    }
  }
  
  return false;
}

process.stdout.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  if (!shouldSuppressLine(str)) {
    return originalStdoutWrite(chunk, encoding, callback);
  }
  if (typeof callback === 'function') callback();
  return true;
};

process.stderr.write = (chunk, encoding, callback) => {
  const str = chunk.toString();
  if (!shouldSuppressLine(str)) {
    return originalStderrWrite(chunk, encoding, callback);
  }
  if (typeof callback === 'function') callback();
  return true;
};
