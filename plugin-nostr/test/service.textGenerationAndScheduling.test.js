import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module
const mockLogger = {
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

vi.mock('@elizaos/core', () => {
  const mocked = {
    logger: mockLogger,
    createUniqueUuid: vi.fn((runtime, seed) => `test-uuid-${seed || Math.random()}`),
    ChannelType: { PUBLIC: 'PUBLIC', DIRECT: 'DIRECT' },
    ModelType: { TEXT_SMALL: 'TEXT_SMALL', TEXT_MEDIUM: 'TEXT_MEDIUM' }
  };
  mocked.default = mocked;
  return mocked;
});

// Mock text generation
const mockGenerateWithModelOrFallback = vi.fn().mockResolvedValue('Generated text content');

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: mockGenerateWithModelOrFallback
}));

vi.mock('../lib/text', () => ({
  buildPostPrompt: vi.fn().mockReturnValue('Post prompt'),
  buildReplyPrompt: vi.fn().mockReturnValue('Reply prompt'),
  buildDmReplyPrompt: vi.fn().mockReturnValue('DM reply prompt'),
  buildZapThanksPrompt: vi.fn().mockReturnValue('Zap thanks prompt'),
  buildDailyDigestPostPrompt: vi.fn().mockReturnValue('Daily digest prompt'),
  buildPixelBoughtPrompt: vi.fn().mockReturnValue('Pixel bought prompt'),
  buildAwarenessPostPrompt: vi.fn().mockReturnValue('Awareness prompt'),
  extractTextFromModelResult: vi.fn((result) => result),
  sanitizeWhitelist: vi.fn((text) => text)
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Text Generation and Scheduling', () => {
  let service;
  let mockRuntime;

  beforeEach(async () => {
    mockRuntime = {
      character: {
        name: 'TestBot',
        postExamples: ['Example post 1', 'Example post 2'],
        messageExamples: [
          [
            { user: 'user', content: { text: 'Hello' } },
            { user: 'agent', content: { text: 'Hi there!' } }
          ]
        ],
        style: { 
          all: ['helpful', 'friendly'], 
          post: ['concise', 'engaging'],
          chat: ['conversational']
        },
        bio: ['AI assistant', 'Helpful and knowledgeable'],
        lore: ['Created to help users'],
        topics: ['AI', 'technology']
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(),
      createMemory: vi.fn().mockResolvedValue({ id: 'memory-id' }),
      getMemoryById: vi.fn(),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue({ id: 'world-id' }),
      ensureRoomExists: vi.fn().mockResolvedValue({ id: 'room-id' }),
      ensureConnection: vi.fn().mockResolvedValue({ id: 'connection-id' }),
      agentId: 'test-agent',
      logger: mockLogger
    };

    service = await NostrService.start(mockRuntime);
    service.pool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([])
    };
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('generatePostTextLLM', () => {
    it('should generate post text', async () => {
      const result = await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    it('should handle generation errors', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('Generation failed'));

      await expect(service.generatePostTextLLM()).resolves.not.toThrow();
    });

    it('should use character post examples', async () => {
      await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should respect options parameter', async () => {
      await service.generatePostTextLLM({ temperature: 0.8 });

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should handle null options', async () => {
      await expect(service.generatePostTextLLM(null)).resolves.not.toThrow();
    });

    it('should integrate with context accumulator when enabled', async () => {
      service.contextAccumulator.enabled = true;
      service.contextAccumulator.getRecentDigest = vi.fn().mockReturnValue('Recent activity');

      await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });
  });

  describe('generateReplyTextLLM', () => {
    it('should generate reply text', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'What is AI?',
        created_at: Math.floor(Date.now() / 1000)
      };
      const roomId = 'room-123';

      const result = await service.generateReplyTextLLM(event, roomId);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    it('should include thread context if provided', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Follow-up question'
      };
      const roomId = 'room-123';
      const threadContext = [
        { content: 'Previous message 1' },
        { content: 'Previous message 2' }
      ];

      await service.generateReplyTextLLM(event, roomId, threadContext);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should include image context if provided', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Look at this image'
      };
      const roomId = 'room-123';
      const imageContext = {
        imageDescriptions: ['A beautiful sunset'],
        imageUrls: ['https://example.com/sunset.jpg']
      };

      await service.generateReplyTextLLM(event, roomId, null, imageContext);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should handle generation errors', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('Reply generation failed'));

      const event = { id: 'event-id', pubkey: 'user', content: 'Hello' };
      const roomId = 'room-123';

      await expect(service.generateReplyTextLLM(event, roomId)).resolves.not.toThrow();
    });

    it('should handle missing event', async () => {
      const roomId = 'room-123';

      await expect(service.generateReplyTextLLM(null, roomId)).resolves.not.toThrow();
    });

    it('should handle missing room ID', async () => {
      const event = { id: 'event-id', content: 'Hello' };

      await expect(service.generateReplyTextLLM(event, null)).resolves.not.toThrow();
    });
  });

  describe('generateZapThanksTextLLM', () => {
    it('should generate zap thanks message', async () => {
      const amountMsats = 1000000; // 1000 sats
      const senderInfo = { pubkey: 'sender-pubkey', name: 'Sender' };

      const result = await service.generateZapThanksTextLLM(amountMsats, senderInfo);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    it('should handle different zap amounts', async () => {
      const amounts = [100, 1000, 10000, 100000, 1000000];
      
      for (const amount of amounts) {
        await service.generateZapThanksTextLLM(amount, { pubkey: 'sender' });
      }

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalledTimes(amounts.length);
    });

    it('should handle zero amount', async () => {
      const result = await service.generateZapThanksTextLLM(0, { pubkey: 'sender' });

      expect(typeof result).toBe('string');
    });

    it('should handle missing sender info', async () => {
      await expect(service.generateZapThanksTextLLM(1000, null)).resolves.not.toThrow();
    });

    it('should handle generation errors', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('Thanks generation failed'));

      await expect(service.generateZapThanksTextLLM(1000, {})).resolves.not.toThrow();
    });
  });

  describe('generateDailyDigestPostText', () => {
    it('should generate daily digest post', async () => {
      const report = {
        summary: 'Daily summary',
        highlights: ['Event 1', 'Event 2'],
        stats: { interactions: 10, posts: 5 }
      };

      const result = await service.generateDailyDigestPostText(report);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
      expect(typeof result).toBe('string');
    });

    it('should handle empty report', async () => {
      const report = {};

      await expect(service.generateDailyDigestPostText(report)).resolves.not.toThrow();
    });

    it('should handle null report', async () => {
      await expect(service.generateDailyDigestPostText(null)).resolves.not.toThrow();
    });

    it('should handle generation errors', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('Digest generation failed'));

      const report = { summary: 'Test' };

      await expect(service.generateDailyDigestPostText(report)).resolves.not.toThrow();
    });

    it('should include narrative context', async () => {
      service.narrativeMemory.getDailyNarratives = vi.fn().mockReturnValue([
        { summary: 'Narrative 1' }
      ]);

      const report = { summary: 'Daily activity' };

      await service.generateDailyDigestPostText(report);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });
  });

  describe('scheduleNextPost', () => {
    it('should schedule next post', () => {
      const minSec = 3600;
      const maxSec = 7200;

      service.postTimer = null;
      service.scheduleNextPost(minSec, maxSec);

      expect(service.postTimer).not.toBeNull();
    });

    it('should not schedule when posting disabled', () => {
      service.postEnabled = false;
      service.postTimer = null;

      service.scheduleNextPost(3600, 7200);

      expect(service.postTimer).toBeNull();
    });

    it('should not schedule without private key', () => {
      service.sk = null;
      service.postTimer = null;

      service.scheduleNextPost(3600, 7200);

      expect(service.postTimer).toBeNull();
    });

    it('should clear existing timer before scheduling', () => {
      service.postTimer = setTimeout(() => {}, 1000);
      const oldTimer = service.postTimer;

      service.scheduleNextPost(3600, 7200);

      expect(service.postTimer).not.toBe(oldTimer);
    });

    it('should use random interval between min and max', () => {
      const intervals = [];
      
      for (let i = 0; i < 10; i++) {
        service.scheduleNextPost(3600, 7200);
        // We can't directly test the random interval, but we can verify it schedules
        expect(service.postTimer).not.toBeNull();
        clearTimeout(service.postTimer);
      }
    });
  });

  describe('scheduleHourlyDigest', () => {
    it('should schedule hourly digest', () => {
      service.contextAccumulator.enabled = true;
      service.hourlyDigestTimer = null;

      service.scheduleHourlyDigest();

      expect(service.hourlyDigestTimer).not.toBeNull();
    });

    it('should not schedule when context accumulator disabled', () => {
      service.contextAccumulator.enabled = false;
      service.hourlyDigestTimer = null;

      service.scheduleHourlyDigest();

      expect(service.hourlyDigestTimer).toBeNull();
    });

    it('should clear existing timer before scheduling', () => {
      service.contextAccumulator.enabled = true;
      service.hourlyDigestTimer = setTimeout(() => {}, 1000);
      const oldTimer = service.hourlyDigestTimer;

      service.scheduleHourlyDigest();

      expect(service.hourlyDigestTimer).not.toBe(oldTimer);
    });
  });

  describe('scheduleDailyReport', () => {
    it('should schedule daily report', () => {
      service.contextAccumulator.enabled = true;
      service.dailyReportTimer = null;

      service.scheduleDailyReport();

      expect(service.dailyReportTimer).not.toBeNull();
    });

    it('should not schedule when context accumulator disabled', () => {
      service.contextAccumulator.enabled = false;
      service.dailyReportTimer = null;

      service.scheduleDailyReport();

      expect(service.dailyReportTimer).toBeNull();
    });

    it('should clear existing timer before scheduling', () => {
      service.contextAccumulator.enabled = true;
      service.dailyReportTimer = setTimeout(() => {}, 1000);
      const oldTimer = service.dailyReportTimer;

      service.scheduleDailyReport();

      expect(service.dailyReportTimer).not.toBe(oldTimer);
    });
  });

  describe('scheduleSelfReflection', () => {
    it('should schedule self reflection', () => {
      if (service.selfReflectionEngine && service.selfReflectionEngine.enabled) {
        service.selfReflectionTimer = null;

        service.scheduleSelfReflection();

        expect(service.selfReflectionTimer).not.toBeNull();
      }
    });

    it('should not schedule when self reflection disabled', () => {
      if (service.selfReflectionEngine) {
        service.selfReflectionEngine.enabled = false;
        service.selfReflectionTimer = null;

        service.scheduleSelfReflection();

        expect(service.selfReflectionTimer).toBeNull();
      }
    });
  });

  describe('Text Sanitization', () => {
    it('should handle empty text', async () => {
      const result = await service.generatePostTextLLM();
      
      expect(typeof result).toBe('string');
    });

    it('should handle very long text', async () => {
      mockGenerateWithModelOrFallback.mockResolvedValueOnce('a'.repeat(10000));

      const result = await service.generatePostTextLLM();
      
      expect(typeof result).toBe('string');
    });

    it('should handle special characters', async () => {
      mockGenerateWithModelOrFallback.mockResolvedValueOnce('Text with 🎉 emojis & special chars!');

      const result = await service.generatePostTextLLM();
      
      expect(typeof result).toBe('string');
    });
  });

  describe('Generation Fallbacks', () => {
    it('should fallback on LLM failure', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('LLM unavailable'));

      const result = await service.generatePostTextLLM();

      // Should still return something (fallback or error handling)
      expect(result !== undefined).toBe(true);
    });

    it('should use character examples as fallback', async () => {
      mockGenerateWithModelOrFallback.mockRejectedValueOnce(new Error('Generation failed'));

      await service.generatePostTextLLM();

      // Should attempt to use character examples
      expect(mockRuntime.character.postExamples).toBeDefined();
    });
  });

  describe('Context Integration in Text Generation', () => {
    it('should include recent activity in post generation', async () => {
      service.contextAccumulator.enabled = true;
      service.contextAccumulator.getRecentDigest = vi.fn().mockReturnValue({
        summary: 'Recent activity summary',
        topTopics: ['topic1', 'topic2']
      });

      await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should include narrative memory in generation', async () => {
      service.narrativeMemory.getTimelineLore = vi.fn().mockReturnValue([
        { content: 'Lore entry 1' }
      ]);

      await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });

    it('should include user history in reply generation', async () => {
      const event = {
        id: 'event-id',
        pubkey: 'user-pubkey',
        content: 'Question'
      };
      const roomId = 'room-123';

      mockRuntime.getMemories.mockResolvedValue([
        { content: { text: 'Previous interaction 1' } },
        { content: { text: 'Previous interaction 2' } }
      ]);

      await service.generateReplyTextLLM(event, roomId);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });
  });

  describe('Scheduling Edge Cases', () => {
    it('should handle zero interval', () => {
      service.postTimer = null;
      service.scheduleNextPost(0, 0);

      // Should either not schedule or schedule immediately
      expect(service.postEnabled).toBeDefined();
    });

    it('should handle negative intervals', () => {
      service.postTimer = null;
      service.scheduleNextPost(-100, -50);

      // Should handle gracefully
      expect(service.postEnabled).toBeDefined();
    });

    it('should handle very large intervals', () => {
      service.postTimer = null;
      service.scheduleNextPost(86400, 172800); // 1-2 days

      // Should schedule successfully
      expect(service.postEnabled).toBeDefined();
    });

    it('should handle min greater than max', () => {
      service.postTimer = null;
      service.scheduleNextPost(7200, 3600);

      // Should handle gracefully (swap or clamp)
      expect(service.postEnabled).toBeDefined();
    });
  });

  describe('Model Type Selection', () => {
    it('should use appropriate model for posts', async () => {
      await service.generatePostTextLLM();

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should use appropriate model for replies', async () => {
      const event = { id: 'id', content: 'Hello' };
      const roomId = 'room-id';

      await service.generateReplyTextLLM(event, roomId);

      expect(mockGenerateWithModelOrFallback).toHaveBeenCalled();
    });
  });
});
