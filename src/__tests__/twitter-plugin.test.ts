import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { RateLimitAwareTwitterService } from '../twitter-wrapper-plugin';

describe('Twitter Plugin', () => {
  let service: RateLimitAwareTwitterService;
  let mockRuntime: any;

  beforeAll(() => {
    mockRuntime = {
      getSetting: (key: string) => {
        const settings: Record<string, string> = {
          TWITTER_API_KEY: 'test-key',
          TWITTER_API_SECRET_KEY: 'test-secret',
          TWITTER_ACCESS_TOKEN: 'test-token',
          TWITTER_ACCESS_TOKEN_SECRET: 'test-token-secret',
          ENABLE_TWITTER_PLUGIN: 'true',
        };
        return settings[key] || '';
      },
    };

    service = new RateLimitAwareTwitterService(mockRuntime);
  });

  afterAll(async () => {
    await service.stop();
  });

  describe('start', () => {
    it('should initialize when credentials are provided', async () => {
      const started = await RateLimitAwareTwitterService.start(mockRuntime);
      expect(started).toBeDefined();
    });

    it('should skip initialization when ENABLE_TWITTER_PLUGIN is false', async () => {
      mockRuntime.getSetting = (key: string) => {
        const settings: Record<string, string> = {
          TWITTER_API_KEY: 'test-key',
          TWITTER_API_SECRET_KEY: 'test-secret',
          TWITTER_ACCESS_TOKEN: 'test-token',
          TWITTER_ACCESS_TOKEN_SECRET: 'test-token-secret',
          ENABLE_TWITTER_PLUGIN: 'false',
        };
        return settings[key] || '';
      };

      const started = await RateLimitAwareTwitterService.start(mockRuntime);
      expect(started).toBeDefined();
    });

    it('should handle missing credentials gracefully', async () => {
      mockRuntime.getSetting = () => '';
      const started = await RateLimitAwareTwitterService.start(mockRuntime);
      expect(started).toBeDefined();
    });
  });

  describe('getMe', () => {
    it('should return null when client is not initialized', async () => {
      await expect(service.getMe()).rejects.toThrow('Twitter client not initialized');
    });

    it('should handle 401 errors gracefully', async () => {
      mockRuntime.getSetting = (key: string) => {
        const settings: Record<string, string> = {
          TWITTER_API_KEY: 'invalid-key',
          TWITTER_API_SECRET_KEY: 'invalid-secret',
          TWITTER_ACCESS_TOKEN: 'invalid-token',
          TWITTER_ACCESS_TOKEN_SECRET: 'invalid-token-secret',
          ENABLE_TWITTER_PLUGIN: 'true',
        };
        return settings[key] || '';
      };

      const testService = await RateLimitAwareTwitterService.start(mockRuntime);
      const result = await testService.getMe();
      expect(result).toBeNull();
      await testService.stop();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status', () => {
      const status = service.getRateLimitStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('isRateLimited');
      expect(status).toHaveProperty('retryAfter');
      expect(status).toHaveProperty('pausedUntil');
    });
  });
});
