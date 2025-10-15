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

// Mock helper modules
const {
  getConversationIdFromEventMock,
  extractTopicsFromEventMock,
  getZapAmountMsatsMock,
  getZapSenderPubkeyMock,
  buildReplyNoteMock
} = vi.hoisted(() => ({
  getConversationIdFromEventMock: vi.fn().mockReturnValue('conversation-id'),
  extractTopicsFromEventMock: vi.fn().mockResolvedValue(['topic1', 'topic2']),
  getZapAmountMsatsMock: vi.fn().mockReturnValue(1000000),
  getZapSenderPubkeyMock: vi.fn().mockReturnValue('sender-pubkey'),
  buildReplyNoteMock: vi.fn().mockReturnValue({
    id: 'reply-id',
    content: 'Reply text',
    kind: 1
  })
}));

vi.mock('../lib/nostr', () => ({
  getConversationIdFromEvent: getConversationIdFromEventMock,
  extractTopicsFromEvent: extractTopicsFromEventMock,
  isSelfAuthor: vi.fn().mockReturnValue(false)
}));

vi.mock('../lib/zaps', () => ({
  getZapAmountMsats: getZapAmountMsatsMock,
  getZapTargetEventId: vi.fn().mockReturnValue('target-event-id'),
  getZapSenderPubkey: getZapSenderPubkeyMock,
  generateThanksText: vi.fn().mockReturnValue('Thanks for the zap!')
}));

vi.mock('../lib/eventFactory', () => ({
  buildReplyNote: buildReplyNoteMock,
  buildTextNote: vi.fn().mockReturnValue({ id: 'note-id', content: 'Note text', kind: 1 })
}));

vi.mock('../lib/zapHandler.js', () => ({
  buildZapThanksPost: vi.fn(() => ({
    parent: { id: 'parent-event-id', pubkey: 'sender-pubkey' },
    text: 'Thanks for the zap!',
    options: {}
  }))
}));

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ 
    imageDescriptions: [], 
    imageUrls: [] 
  })
}));

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn().mockResolvedValue('Generated response text')
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Message Handling', () => {
  let service;
  let mockRuntime;

  beforeEach(async () => {
    mockRuntime = {
      character: {
        name: 'TestBot',
        postExamples: ['test response'],
        style: { all: ['helpful'], post: ['concise'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'false',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
          'NOSTR_ZAP_THANKS_ENABLE': 'true',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_DM_THROTTLE_SEC': '60',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '0',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '0'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(),
      createMemory: vi.fn().mockResolvedValue({ id: 'memory-id' }),
      getMemoryById: vi.fn().mockResolvedValue(null),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue({ id: 'world-id' }),
      ensureRoomExists: vi.fn().mockResolvedValue({ id: 'room-id' }),
      ensureConnection: vi.fn().mockResolvedValue({ id: 'connection-id' }),
      agentId: 'test-agent',
      logger: mockLogger
    };

    service = await NostrService.start(mockRuntime);
    service.pool = {
      publish: vi.fn().mockResolvedValue(true)
    };
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
  });

  describe('handleMention', () => {
    it('should process mention and create memory', async () => {
      const mentionEvent = {
        id: 'mention-event-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
      expect(service.handledEventIds.has('mention-event-id')).toBe(true);
    });

    it('should skip already handled events', async () => {
      const mentionEvent = {
        id: 'duplicate-event-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.handledEventIds.add('duplicate-event-id');
      service.postReply = vi.fn();

      await service.handleMention(mentionEvent);

      expect(service.postReply).not.toHaveBeenCalled();
    });

    it('should respect throttling by user', async () => {
      const mentionEvent = {
        id: 'throttled-event-id',
        kind: 1,
        pubkey: 'throttled-user',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      // Set last reply time to recent
      service.lastReplyByUser.set('throttled-user', Date.now() - 1000);
      service.replyThrottleSec = 60;
      service.postReply = vi.fn();

      await service.handleMention(mentionEvent);

      // Should not reply due to throttling
      expect(service.postReply).not.toHaveBeenCalled();
    });

    it('should allow reply after throttle period', async () => {
      const mentionEvent = {
        id: 'allowed-event-id',
        kind: 1,
        pubkey: 'allowed-user',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      // Set last reply time to old
      service.lastReplyByUser.set('allowed-user', Date.now() - 120000);
      service.replyThrottleSec = 60;
      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mentionEvent = {
        id: 'error-event-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      mockRuntime.createMemory.mockRejectedValue(new Error('Memory creation failed'));

      await expect(service.handleMention(mentionEvent)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle missing event id', async () => {
      const mentionEvent = {
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await expect(service.handleMention(mentionEvent)).resolves.not.toThrow();
    });

    it('should handle reply when enabled', async () => {
      service.replyEnabled = true;
      const mentionEvent = {
        id: 'reply-enabled-event',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot What time is it?',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should not reply when replies disabled', async () => {
      service.replyEnabled = false;
      const mentionEvent = {
        id: 'reply-disabled-event',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot What time is it?',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn();

      await service.handleMention(mentionEvent);

      expect(service.postReply).not.toHaveBeenCalled();
    });
  });

  describe('handleDM', () => {
    it('should process DM when enabled', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = true;

      const dmEvent = {
        id: 'dm-event-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service._decryptDirectMessage = vi.fn().mockResolvedValue('Decrypted message');
      service.postDM = vi.fn().mockResolvedValue(true);

      await service.handleDM(dmEvent);

      expect(service.handledEventIds.has('dm-event-id')).toBe(true);
    });

    it('should skip DM when disabled', async () => {
      service.dmEnabled = false;

      const dmEvent = {
        id: 'dm-disabled-event',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postDM = vi.fn();

      await service.handleDM(dmEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should skip already handled DMs', async () => {
      service.dmEnabled = true;

      const dmEvent = {
        id: 'duplicate-dm-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.handledEventIds.add('duplicate-dm-id');
      service.postDM = vi.fn();

      await service.handleDM(dmEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should respect DM throttling', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = true;

      const dmEvent = {
        id: 'throttled-dm-id',
        kind: 4,
        pubkey: 'throttled-dm-user',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.lastReplyByUser.set('throttled-dm-user', Date.now() - 1000);
      service.dmThrottleSec = 60;
      service.postDM = vi.fn();

      await service.handleDM(dmEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });

    it('should handle decryption errors', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = true;

      const dmEvent = {
        id: 'decrypt-error-dm',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service._decryptDirectMessage = vi.fn().mockRejectedValue(new Error('Decryption failed'));

      await expect(service.handleDM(dmEvent)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not reply to DM when reply disabled', async () => {
      service.dmEnabled = true;
      service.dmReplyEnabled = false;

      const dmEvent = {
        id: 'no-reply-dm',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service._decryptDirectMessage = vi.fn().mockResolvedValue('Decrypted message');
      service.postDM = vi.fn();

      await service.handleDM(dmEvent);

      expect(service.postDM).not.toHaveBeenCalled();
    });
  });

  describe('handleZap', () => {
    it('should process zap and send thanks', async () => {
      const zapEvent = {
        id: 'zap-event-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', service.pkHex],
          ['bolt11', 'lnbc1000...']
        ]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleZap(zapEvent);

      expect(service.handledEventIds.has('zap-event-id')).toBe(true);
    });

    it('should skip already handled zaps', async () => {
      const zapEvent = {
        id: 'duplicate-zap-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.handledEventIds.add('duplicate-zap-id');
      service.postReply = vi.fn();

      await service.handleZap(zapEvent);

      expect(service.postReply).not.toHaveBeenCalled();
    });

    it('should respect zap cooldown', async () => {
      const zapEvent = {
        id: 'cooldown-zap-id',
        kind: 9735,
        pubkey: 'cooldown-user',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.zapCooldownByUser.set('cooldown-user', Date.now() - 1000);
      service.postReply = vi.fn();

      await service.handleZap(zapEvent);

      expect(service.postReply).not.toHaveBeenCalled();
    });

    it('should handle zap after cooldown period', async () => {
      const zapEvent = {
        id: 'allowed-zap-id',
        kind: 9735,
        pubkey: 'allowed-zap-user',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.zapCooldownByUser.set('allowed-zap-user', Date.now() - 7200000);
      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleZap(zapEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });

    it('should handle errors in zap processing', async () => {
      const zapEvent = {
        id: 'error-zap-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      mockRuntime.createMemory.mockRejectedValue(new Error('Memory creation failed'));

      await expect(service.handleZap(zapEvent)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle missing zap amount', async () => {
      getZapAmountMsatsMock.mockReturnValueOnce(0);

      const zapEvent = {
        id: 'zero-amount-zap',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap-receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleZap(zapEvent);

      // Should still handle the zap even with zero amount
      expect(service.handledEventIds.has('zero-amount-zap')).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should continue after handler errors', async () => {
      const event1 = {
        id: 'event-1',
        kind: 1,
        pubkey: 'user1',
        content: 'Message 1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const event2 = {
        id: 'event-2',
        kind: 1,
        pubkey: 'user2',
        content: 'Message 2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      mockRuntime.createMemory
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ id: 'memory-2' });

      await service.handleMention(event1);
      await service.handleMention(event2);

      expect(service.handledEventIds.has('event-1')).toBe(true);
      expect(service.handledEventIds.has('event-2')).toBe(true);
    });

    it('should handle null or undefined events', async () => {
      await expect(service.handleMention(null)).resolves.not.toThrow();
      await expect(service.handleMention(undefined)).resolves.not.toThrow();
    });

    it('should handle events with missing fields', async () => {
      const incompleteEvent = {
        id: 'incomplete-event',
        kind: 1
        // missing pubkey, content, etc.
      };

      await expect(service.handleMention(incompleteEvent)).resolves.not.toThrow();
    });
  });

  describe('Integration with Context', () => {
    it('should pass context to memory creation', async () => {
      const mentionEvent = {
        id: 'context-event-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot What is the weather?',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: expect.any(String)
          })
        }),
        expect.any(String)
      );
    });

    it('should integrate with context accumulator when enabled', async () => {
      service.contextAccumulator.enabled = true;
      service.contextAccumulator.processEvent = vi.fn();

      const mentionEvent = {
        id: 'accumulator-event',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: '@testbot Hello!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      service.postReply = vi.fn().mockResolvedValue(true);

      await service.handleMention(mentionEvent);

      expect(mockRuntime.createMemory).toHaveBeenCalled();
    });
  });
});
