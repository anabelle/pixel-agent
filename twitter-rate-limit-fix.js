/**
 * Twitter Plugin Rate Limit Fix
 *
 * This module patches the @elizaos/plugin-twitter to handle rate limits gracefully
 * instead of crashing the application.
 */

const originalTwitterPlugin = require('@elizaos/plugin-twitter');

// Store original methods
const originalAuth = originalTwitterPlugin.TwitterAuth;

// Rate limit status tracking
let globalRateLimitStatus = {
  isRateLimited: false,
  retryAfter: null,
  pausedUntil: null
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

    globalRateLimitStatus = {
      isRateLimited: true,
      retryAfter,
      pausedUntil: new Date(Date.now() + (retryAfter * 1000))
    };

    console.warn(`Twitter API rate limited. Pausing operations until ${globalRateLimitStatus.pausedUntil.toISOString()}`);
  }

  return rateLimit;
}

/**
 * Check if operations should be paused due to rate limits
 */
function shouldPauseOperations() {
  if (!globalRateLimitStatus.pausedUntil) return false;
  return new Date() < globalRateLimitStatus.pausedUntil;
}

/**
 * Enhanced TwitterAuth class with rate limit handling
 */
class RateLimitAwareTwitterAuth extends originalAuth {
  constructor(appKey, appSecret, accessToken, accessSecret) {
    super(appKey, appSecret, accessToken, accessSecret);
    this.rateLimitStatus = null;
  }

  /**
   * Enhanced isLoggedIn with rate limit handling
   */
  async isLoggedIn() {
    // If we're rate limited, skip the check but return true (assume still authenticated)
    if (shouldPauseOperations()) {
      console.warn("Skipping Twitter authentication check due to rate limit");
      return true;
    }

    try {
      return await super.isLoggedIn();
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        parseRateLimitHeaders(error.headers || error.response?.headers);
        console.warn("Twitter authentication rate limited, continuing in read-only mode");
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
      console.warn("Skipping Twitter profile fetch due to rate limit");
      return this.profile || undefined;
    }

    try {
      return await super.me();
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        parseRateLimitHeaders(error.headers || error.response?.headers);
        console.warn("Twitter profile fetch rate limited, using cached profile");
        return this.profile || undefined;
      }
      throw error;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    return globalRateLimitStatus;
  }

  /**
   * Check if writes should be paused
   */
  shouldPauseWrites() {
    return shouldPauseOperations();
  }
}

// Patch the plugin exports
const patchedPlugin = { ...originalTwitterPlugin };
patchedPlugin.TwitterAuth = RateLimitAwareTwitterAuth;

// Add utility functions to the plugin
patchedPlugin.getRateLimitStatus = () => globalRateLimitStatus;
patchedPlugin.shouldPauseOperations = shouldPauseOperations;

module.exports = patchedPlugin;