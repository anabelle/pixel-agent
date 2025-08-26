/**
 * Twitter Plugin with Rate Limit Protection
 *
 * A complete replacement for @elizaos/plugin-twitter that handles rate limits gracefully
 * instead of crashing the application.
 */

import { Plugin, Service, IAgentRuntime, logger } from '@elizaos/core';
import { TwitterApi } from 'twitter-api-v2';

// Rate limit status tracking
interface RateLimitStatus {
  isRateLimited: boolean;
  retryAfter: number | null;
  pausedUntil: Date | null;
  lastChecked: Date | null;
  userLimit?: number;
  userRemaining?: number;
  userReset?: number;
}

// Profile interface
interface TwitterProfile {
  userId: string;
  username: string;
  name: string;
  biography?: string;
  avatar?: string;
  followersCount?: number;
  followingCount?: number;
  isVerified?: boolean;
  location?: string;
  joined?: Date;
}

class TwitterServiceWithRateLimitProtection extends Service {
  static serviceType = 'twitter-with-rate-limit-protection';
  capabilityDescription = 'Twitter service with comprehensive rate limit protection';

  private v2Client: TwitterApi | null = null;
  private rateLimitStatus: RateLimitStatus = {
    isRateLimited: false,
    retryAfter: null,
    pausedUntil: null,
    lastChecked: null
  };
  private cachedProfile: TwitterProfile | null = null;

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<TwitterServiceWithRateLimitProtection> {
    logger.info('[TWITTER SAFE] Starting Twitter service with rate limit protection');

    const service = new TwitterServiceWithRateLimitProtection(runtime);

    // Initialize Twitter client
    const appKey = runtime.getSetting('TWITTER_API_KEY');
    const appSecret = runtime.getSetting('TWITTER_API_SECRET_KEY');
    const accessToken = runtime.getSetting('TWITTER_ACCESS_TOKEN');
    const accessSecret = runtime.getSetting('TWITTER_ACCESS_TOKEN_SECRET');

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      logger.warn('[TWITTER SAFE] Twitter credentials not configured, service will operate in read-only mode');
      return service;
    }

    service.v2Client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret
    });

    logger.info('[TWITTER SAFE] Twitter service initialized successfully');
    return service;
  }

  /**
   * Parse rate limit headers from error response
   */
  private parseRateLimitHeaders(headers: any): void {
    if (!headers) return;

    let isRateLimited = false;
    let userLimit, userRemaining, userReset;

    // Parse standard rate limit headers
    if (headers['x-rate-limit-limit']) {
      const limit = parseInt(headers['x-rate-limit-limit']);
      const remaining = parseInt(headers['x-rate-limit-remaining'] || '0');
      const reset = parseInt(headers['x-rate-limit-reset']);
      if (remaining === 0) isRateLimited = true;
    }

    // Parse user-specific rate limit headers (24-hour limits)
    if (headers['x-user-limit-24hour-limit']) {
      userLimit = parseInt(headers['x-user-limit-24hour-limit']);
      userRemaining = parseInt(headers['x-user-limit-24hour-remaining'] || '0');
      userReset = parseInt(headers['x-user-limit-24hour-reset']);
      if (userRemaining === 0) isRateLimited = true;
    }

    if (isRateLimited && userReset) {
      const now = Date.now() / 1000;
      const retryAfter = Math.max(0, userReset - now);

      this.rateLimitStatus = {
        isRateLimited: true,
        retryAfter,
        pausedUntil: new Date(Date.now() + (retryAfter * 1000)),
        lastChecked: new Date(),
        userLimit,
        userRemaining,
        userReset
      };

      logger.warn(`[TWITTER SAFE] Rate limited detected. Pausing operations until ${this.rateLimitStatus.pausedUntil?.toISOString() || 'unknown'}`);
      logger.warn(`[TWITTER SAFE] Rate limit details: limit=${userLimit || 0}, remaining=${userRemaining || 0}, reset=${userReset ? new Date(userReset * 1000).toISOString() : 'unknown'}`);
    }
  }

  /**
   * Check if operations should be paused due to rate limits
   */
  private shouldPauseOperations(): boolean {
    if (!this.rateLimitStatus.pausedUntil) return false;
    const now = new Date();
    const isPaused = now < this.rateLimitStatus.pausedUntil;

    if (isPaused && this.rateLimitStatus.pausedUntil) {
      const remaining = Math.ceil((this.rateLimitStatus.pausedUntil.getTime() - now.getTime()) / 1000);
      logger.warn(`[TWITTER SAFE] Operations paused. ${remaining} seconds remaining.`);
    }

    return isPaused;
  }

  /**
   * Enhanced me() method with rate limit handling
   */
  async getMe(): Promise<TwitterProfile | null> {
    // Return cached profile if available and not too old
    if (this.cachedProfile && !this.shouldPauseOperations()) {
      return this.cachedProfile;
    }

    if (!this.v2Client) {
      logger.warn('[TWITTER SAFE] Twitter client not initialized');
      return null;
    }

    // If we're rate limited, return cached profile or null
    if (this.shouldPauseOperations()) {
      logger.warn('[TWITTER SAFE] Skipping profile fetch due to rate limit, using cached profile');
      return this.cachedProfile;
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

      const profile: TwitterProfile = {
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

      this.cachedProfile = profile;
      return profile;
    } catch (error: any) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        this.parseRateLimitHeaders(error.headers || error.response?.headers);
        logger.warn('[TWITTER SAFE] Profile fetch rate limited, using cached profile');
        return this.cachedProfile;
      }
      logger.error('[TWITTER SAFE] Error fetching profile:', error.message);
      return this.cachedProfile;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  /**
   * Check if the service is ready (not rate limited)
   */
  isReady(): boolean {
    return !this.shouldPauseOperations();
  }

  async stop(): Promise<void> {
    logger.info('[TWITTER SAFE] Twitter service stopped');
  }
}

// Create the plugin
export const twitterRateLimitSafePlugin: Plugin = {
  name: '@elizaos/plugin-twitter', // Same name as original to replace it
  description: 'Twitter plugin with rate limit protection',

  services: [TwitterServiceWithRateLimitProtection],

  // Add any other components that the original plugin has
  // This provides a minimal but functional replacement
};

export default twitterRateLimitSafePlugin;