/**
 * Twitter Plugin Replacement with Rate Limit Protection
 *
 * A drop-in replacement for @elizaos/plugin-twitter that handles rate limits gracefully
 */

// Rate limit status tracking
const rateLimitStatus = {
  isRateLimited: false,
  retryAfter: null,
  pausedUntil: null,
  lastChecked: null
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

    console.warn(`[TWITTER SAFE] Rate limited detected. Pausing operations until ${rateLimitStatus.pausedUntil.toISOString()}`);
    console.warn(`[TWITTER SAFE] Rate limit details: limit=${rateLimit.userLimit || rateLimit.limit || 0}, remaining=${rateLimit.userRemaining || rateLimit.remaining || 0}, reset=${rateLimit.userReset || rateLimit.reset ? new Date((rateLimit.userReset || rateLimit.reset) * 1000).toISOString() : 'unknown'}`);
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

  if (isPaused && rateLimitStatus.pausedUntil) {
    const remaining = Math.ceil((rateLimitStatus.pausedUntil.getTime() - now.getTime()) / 1000);
    console.warn(`[TWITTER SAFE] Operations paused. ${remaining} seconds remaining.`);
  }

  return isPaused;
}

/**
 * Enhanced TwitterAuth class with rate limit handling
 */
class RateLimitAwareTwitterAuth {
  constructor(appKey, appSecret, accessToken, accessSecret) {
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.accessToken = accessToken;
    this.accessSecret = accessSecret;
    this.v2Client = null;
    this.authenticated = false;
    this.profile = null;
    this.initializeClient();
  }

  initializeClient() {
    // Dynamic import for ES module compatibility
    import('twitter-api-v2').then(({ TwitterApi }) => {
      this.v2Client = new TwitterApi({
        appKey: this.appKey,
        appSecret: this.appSecret,
        accessToken: this.accessToken,
        accessSecret: this.accessSecret
      });
      this.authenticated = true;
    }).catch(error => {
      console.error('[TWITTER SAFE] Failed to initialize Twitter client:', error.message);
    });
  }

  /**
   * Get the Twitter API v2 client
   */
  getV2Client() {
    if (!this.v2Client) {
      throw new Error("Twitter API client not initialized");
    }
    return this.v2Client;
  }

  /**
   * Enhanced isLoggedIn with rate limit handling
   */
  async isLoggedIn() {
    // If we're rate limited, skip the check but return true (assume still authenticated)
    if (shouldPauseOperations()) {
      console.warn('[TWITTER SAFE] Skipping authentication check due to rate limit');
      return true;
    }

    if (!this.authenticated || !this.v2Client) {
      return false;
    }

    try {
      const me = await this.v2Client.v2.me();
      return !!me.data;
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        parseRateLimitHeaders(error.headers || error.response?.headers);
        console.warn('[TWITTER SAFE] Authentication rate limited, continuing in read-only mode');
        return true; // Consider still authenticated
      }
      console.error("Failed to verify authentication:", error);
      return false;
    }
  }

  /**
   * Enhanced me() method with rate limit handling
   */
  async me() {
    if (this.profile) {
      return this.profile;
    }

    // If we're rate limited, return cached profile or skip
    if (shouldPauseOperations()) {
      console.warn('[TWITTER SAFE] Skipping profile fetch due to rate limit');
      return this.profile || undefined;
    }

    if (!this.v2Client) {
      throw new Error("Not authenticated");
    }

    try {
      const { data: user } = await this.v2Client.v2.me({
        "user.fields": [
          "id",
          "name",
          "username",
          "description",
          "profile_image_url",
          "public_metrics",
          "verified",
          "location",
          "created_at"
        ]
      });

      this.profile = {
        userId: user.id,
        username: user.username,
        name: user.name,
        biography: user.description,
        avatar: user.profile_image_url,
        followersCount: user.public_metrics?.followers_count,
        followingCount: user.public_metrics?.following_count,
        isVerified: user.verified,
        location: user.location || "",
        joined: user.created_at ? new Date(user.created_at) : undefined,
      };

      return this.profile;
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        parseRateLimitHeaders(error.headers || error.response?.headers);
        console.warn('[TWITTER SAFE] Profile fetch rate limited, using cached profile');
        return this.profile || undefined;
      }
      console.error("Failed to get user profile:", error);
      return undefined;
    }
  }

  /**
   * Logout (clear credentials)
   */
  async logout() {
    this.v2Client = null;
    this.authenticated = false;
    this.profile = undefined;
  }

  /**
   * For compatibility - always returns true since we use API keys
   */
  hasToken() {
    return this.authenticated;
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

// Create a replacement plugin that mimics the original structure
const twitterReplacementPlugin = {
  // Mimic the original plugin structure
  TwitterAuth: RateLimitAwareTwitterAuth,

  // Add utility functions
  getRateLimitStatus: () => ({ ...rateLimitStatus }),
  shouldPauseOperations,
  parseRateLimitHeaders,

  // Add other components that might be expected
  name: '@elizaos/plugin-twitter',
  description: 'Twitter plugin with rate limit protection',
};

module.exports = twitterReplacementPlugin;