/**
 * Twitter Plugin Rate Limit Patch
 *
 * This script patches the @elizaos/plugin-twitter module at runtime to handle
 * rate limits gracefully instead of crashing the application.
 */

// Store the original require function
const originalRequire = require;

// Rate limit status tracking
const rateLimitStatus = {
  isRateLimited: false,
  retryAfter: null,
  pausedUntil: null,
  lastChecked: null
};

// Handle ES modules vs CommonJS
const isESModule = (obj) => obj && obj.__esModule;

// For ES modules, we need to use dynamic import
const loadESModule = async (modulePath) => {
  try {
    const module = await import(modulePath);
    return module.default || module;
  } catch (error) {
    // Fallback to CommonJS
    return originalRequire(modulePath);
  }
};

/**
 * Parse rate limit headers from error response
 */
function parseRateLimitHeaders(headers) {
  if (!headers) return null;

  const rateLimit = {};
  let isRateLimited = false;

  // Parse standard rate limit headers
  if (headers['x-rate-limit-limit']) {
    rateLimit.limit = parseInt(headers['x-rate-limit-limit']);
    rateLimit.remaining = parseInt(headers['x-rate-limit-remaining'] || '0');
    rateLimit.reset = parseInt(headers['x-rate-limit-reset']);
    if (rateLimit.remaining === 0) isRateLimited = true;
  }

  // Parse user-specific rate limit headers (24-hour limits)
  if (headers['x-user-limit-24hour-limit']) {
    rateLimit.userLimit = parseInt(headers['x-user-limit-24hour-limit']);
    rateLimit.userRemaining = parseInt(headers['x-user-limit-24hour-remaining'] || '0');
    rateLimit.userReset = parseInt(headers['x-user-limit-24hour-reset']);
    if (rateLimit.userRemaining === 0) isRateLimited = true;
  }

  if (isRateLimited) {
    const now = Date.now() / 1000;
    const resetTime = rateLimit.userReset || rateLimit.reset;
    const retryAfter = resetTime ? Math.max(0, resetTime - now) : 900; // 15 min default

    rateLimitStatus.isRateLimited = true;
    rateLimitStatus.retryAfter = retryAfter;
    rateLimitStatus.pausedUntil = new Date(Date.now() + (retryAfter * 1000));
    rateLimitStatus.lastChecked = new Date();

    console.warn(`[TWITTER PATCH] Rate limited detected. Pausing operations until ${rateLimitStatus.pausedUntil.toISOString()}`);
    console.warn(`[TWITTER PATCH] Rate limit details:`, {
      limit: rateLimit.userLimit || rateLimit.limit,
      remaining: rateLimit.userRemaining || rateLimit.remaining,
      resetTime: new Date((rateLimit.userReset || rateLimit.reset) * 1000).toISOString()
    });
  }

  return rateLimit;
}

/**
 * Check if operations should be paused due to rate limits
 */
function shouldPauseOperations() {
  if (!rateLimitStatus.pausedUntil) return false;
  const now = new Date();
  const isPaused = now < rateLimitStatus.pausedUntil;

  if (isPaused) {
    const remaining = Math.ceil((rateLimitStatus.pausedUntil - now) / 1000);
    console.warn(`[TWITTER PATCH] Operations paused. ${remaining} seconds remaining.`);
  }

  return isPaused;
}

// Override the require function to patch the Twitter plugin
require = function(id) {
  const module = originalRequire(id);

  // Patch the Twitter plugin specifically
  if (id === '@elizaos/plugin-twitter') {
    console.log('[TWITTER PATCH] Applying rate limit patch to @elizaos/plugin-twitter');

    // Store original TwitterAuth class
    const OriginalTwitterAuth = module.TwitterAuth;

    // Create enhanced TwitterAuth class
    class PatchedTwitterAuth extends OriginalTwitterAuth {
      constructor(appKey, appSecret, accessToken, accessSecret) {
        super(appKey, appSecret, accessToken, accessSecret);
        this.rateLimitStatus = rateLimitStatus;
      }

      /**
       * Enhanced isLoggedIn with rate limit handling
       */
      async isLoggedIn() {
        // If we're rate limited, skip the check but return true (assume still authenticated)
        if (shouldPauseOperations()) {
          console.warn('[TWITTER PATCH] Skipping authentication check due to rate limit');
          return true;
        }

        try {
          const result = await super.isLoggedIn();
          return result;
        } catch (error) {
          // Handle rate limit errors gracefully
          if (error.code === 429 || error.statusCode === 429) {
            parseRateLimitHeaders(error.headers || error.response?.headers);
            console.warn('[TWITTER PATCH] Authentication rate limited, continuing in read-only mode');
            return true; // Consider still authenticated
          }
          throw error;
        }
      }

      /**
       * Enhanced me() method with rate limit handling
       */
      async me() {
        // If we're rate limited, return cached profile or skip
        if (shouldPauseOperations()) {
          console.warn('[TWITTER PATCH] Skipping profile fetch due to rate limit');
          return this.profile || undefined;
        }

        try {
          const result = await super.me();
          return result;
        } catch (error) {
          // Handle rate limit errors gracefully
          if (error.code === 429 || error.statusCode === 429) {
            parseRateLimitHeaders(error.headers || error.response?.headers);
            console.warn('[TWITTER PATCH] Profile fetch rate limited, using cached profile');
            return this.profile || undefined;
          }
          throw error;
        }
      }

      /**
       * Get current rate limit status
       */
      getRateLimitStatus() {
        return { ...rateLimitStatus };
      }

      /**
       * Check if writes should be paused
       */
      shouldPauseWrites() {
        return shouldPauseOperations();
      }
    }

    // Replace the TwitterAuth class in the module
    module.TwitterAuth = PatchedTwitterAuth;

    // Add utility functions to the module
    module.getRateLimitStatus = () => ({ ...rateLimitStatus });
    module.shouldPauseOperations = shouldPauseOperations;
    module.parseRateLimitHeaders = parseRateLimitHeaders;

    console.log('[TWITTER PATCH] Successfully patched @elizaos/plugin-twitter');
  }

  return module;
};

// Export the patch utilities for external use
module.exports = {
  getRateLimitStatus: () => ({ ...rateLimitStatus }),
  shouldPauseOperations,
  parseRateLimitHeaders,
  rateLimitStatus
};