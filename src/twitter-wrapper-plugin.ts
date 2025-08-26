/**
 * Twitter Plugin Wrapper with Rate Limit Handling
 *
 * This wrapper provides the same interface as @elizaos/plugin-twitter
 * but with enhanced rate limit handling to prevent crashes.
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

class RateLimitAwareTwitterService extends Service {
  static serviceType = 'twitter-with-rate-limit';
  capabilityDescription = 'Twitter service with rate limit handling';

  private v2Client: TwitterApi | null = null;
  private rateLimitStatus: RateLimitStatus = {
    isRateLimited: false,
    retryAfter: null,
    pausedUntil: null,
    lastChecked: null
  };

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<RateLimitAwareTwitterService> {
    logger.info('[TWITTER WRAPPER] Starting Twitter service with rate limit handling');

    const service = new RateLimitAwareTwitterService(runtime);

    // Initialize Twitter client
    const appKey = runtime.getSetting('TWITTER_API_KEY');
    const appSecret = runtime.getSetting('TWITTER_API_SECRET_KEY');
    const accessToken = runtime.getSetting('TWITTER_ACCESS_TOKEN');
    const accessSecret = runtime.getSetting('TWITTER_ACCESS_TOKEN_SECRET');

    if (!appKey || !appSecret || !accessToken || !accessSecret) {
      logger.warn('[TWITTER WRAPPER] Twitter credentials not configured, service will be disabled');
      return service;
    }

    service.v2Client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret
    });

    logger.info('[TWITTER WRAPPER] Twitter service initialized successfully');
    return service;
  }

  /**
   * Parse rate limit headers from error response
   */
  private parseRateLimitHeaders(headers: any): void {
    if (!headers) return;

    let isRateLimited = false;
    let userLimit, userRemaining, userReset;

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

      logger.warn(`[TWITTER WRAPPER] Rate limited detected. Pausing operations until ${this.rateLimitStatus.pausedUntil?.toISOString() || 'unknown'}`);
      logger.warn(`[TWITTER WRAPPER] Rate limit details: limit=${userLimit || 0}, remaining=${userRemaining || 0}, reset=${userReset ? new Date(userReset * 1000).toISOString() : 'unknown'}`);
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
      logger.warn(`[TWITTER WRAPPER] Operations paused. ${remaining} seconds remaining.`);
    }

    return isPaused;
  }

  /**
   * Enhanced me() method with rate limit handling
   */
  async getMe() {
    if (!this.v2Client) {
      throw new Error('Twitter client not initialized');
    }

    // If we're rate limited, return cached profile or skip
    if (this.shouldPauseOperations()) {
      logger.warn('[TWITTER WRAPPER] Skipping profile fetch due to rate limit');
      return null; // Return null instead of throwing
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

      return {
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
    } catch (error: any) {
      // Handle rate limit errors gracefully
      if (error.code === 429 || error.statusCode === 429) {
        this.parseRateLimitHeaders(error.headers || error.response?.headers);
        logger.warn('[TWITTER WRAPPER] Profile fetch rate limited, continuing gracefully');
        return null; // Return null instead of throwing
      }
      throw error;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  async stop(): Promise<void> {
    logger.info('[TWITTER WRAPPER] Twitter service stopped');
  }
}

// Create the plugin wrapper
export const twitterWrapperPlugin: Plugin = {
  name: 'twitter-wrapper',
  description: 'Twitter plugin with rate limit handling',

  services: [RateLimitAwareTwitterService],

  // Add any actions, providers, etc. that the original Twitter plugin has
  // For now, we'll keep it minimal and focused on the rate limit issue
};

export default twitterWrapperPlugin;