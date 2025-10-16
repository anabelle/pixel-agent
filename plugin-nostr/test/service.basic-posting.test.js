import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module before importing the service
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

const buildTextNoteMock = vi.fn().mockReturnValue({
  id: 'note-id-123',
  kind: 1,
  content: 'Test note',
  pubkey: 'test-pubkey',
  created_at: Math.floor(Date.now() / 1000),
  tags: [],
  sig: 'signature'
});

const buildReplyNoteMock = vi.fn().mockReturnValue({
  id: 'reply-id-456',
  kind: 1,
  content: 'Test reply',
  pubkey: 'test-pubkey',
  created_at: Math.floor(Date.now() / 1000),
  tags: [['e', 'parent-id']],
  sig: 'signature'
});

vi.mock('../lib/eventFactory', () => ({
  buildTextNote: buildTextNoteMock,
  buildReplyNote: buildReplyNoteMock,
  buildReaction: vi.fn().mockReturnValue({ id: 'reaction-id', kind: 7 }),
  buildRepost: vi.fn().mockReturnValue({ id: 'repost-id', kind: 6 })
}));

vi.mock('../lib/nostr', () => ({
  isSelfAuthor: vi.fn().mockReturnValue(false),
  getConversationIdFromEvent: vi.fn().mockReturnValue('conversation-id'),
  extractTopicsFromEvent: vi.fn().mockResolvedValue([])
}));

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ imageDescriptions: [], imageUrls: [] })
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Basic Posting', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(() => {
    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test post'],
        style: { all: ['helpful'], post: ['concise'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay1.test,wss://relay2.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '15000',
          'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '120000'
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
      logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    };

    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };

    service = new NostrService(mockRuntime);
    service.pool = mockPool;
    service.relays = ['wss://relay1.test', 'wss://relay2.test'];
    service.sk = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service.pkHex = 'test-pubkey-hex';
  });

  afterEach(async () => {
    if (service && typeof service.stop === 'function') {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('postOnce()', () => {
    it('should queue a post with content', async () => {
      const content = 'Test post content';
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue').mockResolvedValue(true);

      await service.postOnce(content);

      expect(enqueueSpy).toHaveBeenCalled();
      const callArg = enqueueSpy.mock.calls[0][0];
      expect(callArg.action).toBeDefined();
      expect(typeof callArg.action).toBe('function');
    });

    it('should reject empty content', async () => {
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');

      await service.postOnce('');

      expect(enqueueSpy).not.toHaveBeenCalled();
    });

    it('should reject content exceeding max length', async () => {
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');
      const longContent = 'a'.repeat(10001); // Assuming 10000 is max

      await service.postOnce(longContent);

      expect(enqueueSpy).not.toHaveBeenCalled();
    });

    it('should handle posting without pool', async () => {
      service.pool = null;
      
      await expect(service.postOnce('Test content')).resolves.not.toThrow();
    });
  });

  describe('postReply()', () => {
    it('should post a reply to an event', async () => {
      const parentEvent = {
        id: 'parent-event-id',
        kind: 1,
        pubkey: 'author-pubkey',
        content: 'Original post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };
      const replyText = 'This is a reply';

      await service.postReply(parentEvent, replyText);

      expect(buildReplyNoteMock).toHaveBeenCalledWith(
        service.sk,
        replyText,
        parentEvent
      );
      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should publish reply to all relays', async () => {
      const parentEvent = {
        id: 'parent-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await service.postReply(parentEvent, 'Reply text');

      expect(mockPool.publish).toHaveBeenCalledWith(
        service.relays,
        expect.objectContaining({ kind: 1 })
      );
    });

    it('should handle reply without pool', async () => {
      service.pool = null;
      const parentEvent = {
        id: 'parent-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.postReply(parentEvent, 'Reply')).resolves.not.toThrow();
    });
  });

  describe('postReaction()', () => {
    it('should post a reaction to an event', async () => {
      const targetEvent = {
        id: 'target-event-id',
        kind: 1,
        pubkey: 'author-pubkey',
        content: 'Target post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };
      const reactionContent = '❤️';

      await service.postReaction(targetEvent, reactionContent);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should use default reaction emoji if not specified', async () => {
      const targetEvent = {
        id: 'target-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await service.postReaction(targetEvent);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle reaction without pool', async () => {
      service.pool = null;
      const targetEvent = {
        id: 'target-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.postReaction(targetEvent, '👍')).resolves.not.toThrow();
    });
  });

  describe('postRepost()', () => {
    it('should repost an event', async () => {
      const originalEvent = {
        id: 'original-event-id',
        kind: 1,
        pubkey: 'original-author',
        content: 'Original content',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await service.postRepost(originalEvent);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should add optional comment to repost', async () => {
      const originalEvent = {
        id: 'original-id',
        kind: 1,
        pubkey: 'author',
        content: 'Content',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };
      const comment = 'Great post!';

      await service.postRepost(originalEvent, comment);

      expect(mockPool.publish).toHaveBeenCalled();
    });

    it('should handle repost without pool', async () => {
      service.pool = null;
      const originalEvent = {
        id: 'original-id',
        kind: 1,
        pubkey: 'author',
        content: 'Content',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.postRepost(originalEvent)).resolves.not.toThrow();
    });
  });

  describe('Posting Queue Integration', () => {
    it('should have posting queue initialized', () => {
      expect(service.postingQueue).toBeDefined();
      expect(service.postingQueue.enqueue).toBeDefined();
    });

    it('should respect min delay between posts', () => {
      expect(service.postingQueue.minDelayBetweenPosts).toBeGreaterThanOrEqual(15000);
    });

    it('should respect max delay between posts', () => {
      expect(service.postingQueue.maxDelayBetweenPosts).toBeGreaterThanOrEqual(service.postingQueue.minDelayBetweenPosts);
    });

    it('should have priority system', () => {
      expect(service.postingQueue.priorities).toBeDefined();
      expect(service.postingQueue.priorities.CRITICAL).toBeDefined();
      expect(service.postingQueue.priorities.HIGH).toBeDefined();
      expect(service.postingQueue.priorities.NORMAL).toBeDefined();
      expect(service.postingQueue.priorities.LOW).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle pool publish errors gracefully', async () => {
      mockPool.publish.mockRejectedValue(new Error('Publish failed'));
      const parentEvent = {
        id: 'parent-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.postReply(parentEvent, 'Reply')).resolves.not.toThrow();
    });

    it('should handle missing relays gracefully', async () => {
      service.relays = [];
      const parentEvent = {
        id: 'parent-id',
        kind: 1,
        pubkey: 'author',
        content: 'Post',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      await expect(service.postReply(parentEvent, 'Reply')).resolves.not.toThrow();
    });
  });
});
