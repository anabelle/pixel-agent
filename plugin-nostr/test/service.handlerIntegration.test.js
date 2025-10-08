
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module before importing the service
vi.mock('@elizaos/core', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

const {
  decryptDirectMessageMock,
  isSelfAuthorMock,
  getConversationIdFromEventMock,
  extractTopicsFromEventMock,
  buildZapThanksPostMock,
} = vi.hoisted(() => ({
  decryptDirectMessageMock: vi.fn().mockResolvedValue('Decrypted DM content'),
  isSelfAuthorMock: vi.fn().mockReturnValue(false),
  getConversationIdFromEventMock: vi.fn().mockReturnValue('conversation-id'),
  extractTopicsFromEventMock: vi.fn().mockReturnValue([]),
  buildZapThanksPostMock: vi.fn(() => ({
    parent: { id: 'parent-event-id', pubkey: 'sender-pubkey' },
    text: 'Thanks for the zap!',
    options: {},
  })),
}));

function nostrMockFactory() {
  return {
    decryptDirectMessage: decryptDirectMessageMock,
    isSelfAuthor: isSelfAuthorMock,
    getConversationIdFromEvent: getConversationIdFromEventMock,
    extractTopicsFromEvent: extractTopicsFromEventMock,
  };
}

vi.mock('../lib/nostr', nostrMockFactory);
vi.mock('../lib/nostr.js', nostrMockFactory);

vi.mock('../lib/image-vision.js', () => ({
  processImageContent: vi.fn().mockResolvedValue({ imageDescriptions: [], imageUrls: [] })
}));

vi.mock('../lib/zapHandler.js', () => ({
  buildZapThanksPost: buildZapThanksPostMock
}));

import { NostrService } from '../lib/service.js';

describe('NostrService Handler Integration', () => {
  let service;
  let mockRuntime;

  beforeEach(() => {
    // Mock global logger
    global.logger = {
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn()
    };

    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test response'],
        style: { post: ['helpful'] }
      },
      logger: {
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_REPLY_THROTTLE_SEC': '5' // Short for testing
        };
        return settings[key] || '';
      }),
      useModel: vi.fn().mockResolvedValue({ text: 'Generated response' }),
      createMemory: vi.fn().mockResolvedValue(true),
      getMemoryById: vi.fn().mockResolvedValue(null),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue(true),
      ensureRoomExists: vi.fn().mockResolvedValue(true),
      ensureConnection: vi.fn().mockResolvedValue(true),
      agentId: 'test-agent'
    };

    service = new NostrService(mockRuntime);
    service.pool = {
      subscribeMany: vi.fn(),
      publish: vi.fn().mockResolvedValue(true),
      close: vi.fn()
    };
    service.pkHex = 'bot-pubkey-hex';
    service.sk = 'bot-private-key';
    service.relays = ['wss://test.relay'];
    
    // Mock common service methods
    service.isSelfAuthor = vi.fn().mockReturnValue(false);
    service.shouldReplyToMention = vi.fn().mockReturnValue(true);
    service.postReply = vi.fn().mockResolvedValue(true);
    service.saveInteractionMemory = vi.fn().mockResolvedValue(true);
    service._createMemorySafe = vi.fn().mockResolvedValue(true);
    service.generateReplyTextLLM = vi.fn().mockResolvedValue('Reply text');
    service.generateZapThanksTextLLM = vi.fn(async () => {
      await mockRuntime.useModel('zap-thanks', { prompt: 'zap' });
      return 'Thanks for the zap!';
    });
    service._isActualMention = vi.fn().mockReturnValue(true);
    service._isRelevantMention = vi.fn().mockResolvedValue(true);
    service._isUserMuted = vi.fn().mockResolvedValue(false);
    service._ensureNostrContext = vi.fn().mockResolvedValue({ roomId: 'room-1', entityId: 'entity-1' });
    service._getThreadContext = vi.fn().mockResolvedValue({ thread: [], isRoot: true });
    service.postDM = vi.fn().mockResolvedValue(true);
    service.postingQueue.enqueue = vi.fn().mockResolvedValue(true);
    service.replyInitialDelayMinMs = 0;
    service.replyInitialDelayMaxMs = 0;
    service.dmThrottleSec = 30;
    service._decryptDirectMessage = decryptDirectMessageMock;
  });

  afterEach(() => {
    decryptDirectMessageMock.mockClear();
    decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');
    isSelfAuthorMock.mockReturnValue(false);
    buildZapThanksPostMock.mockClear();
    if (service?.pendingReplyTimers) {
      for (const timer of service.pendingReplyTimers.values()) {
        clearTimeout(timer);
      }
      service.pendingReplyTimers.clear();
    }
    vi.clearAllTimers();
  });

  describe('handleMention', () => {
    it('processes mention correctly', async () => {
      const mentionEvent = {
        id: 'mention-123',
        kind: 1,
        pubkey: 'user-pubkey',
        content: '@bot hello there!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mentionEvent);

      expect(service._createMemorySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: '@bot hello there!',
            source: 'nostr'
          })
        }),
        'messages'
      );
    });

    it('skips self-authored mentions', async () => {
      const selfMention = {
        id: 'self-mention-123',
        kind: 1,
        pubkey: service.pkHex, // Same as bot
        content: 'My own post',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(selfMention);

      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });

    it('respects throttling between replies', async () => {
      const userPubkey = 'frequent-user';
      
      // First mention
      const mention1 = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'First message',
        created_at: Math.floor(Date.now() / 1000)
      };

      // Second mention from same user (should be throttled)
      const mention2 = {
        id: 'mention-2', 
        kind: 1,
        pubkey: userPubkey,
        content: 'Second message',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(mention1);
      await service.handleMention(mention2);

      // Should create memory for both but only reply to first
      expect(service._createMemorySafe).toHaveBeenCalledTimes(2);
      
      // Check that second reply was scheduled (pendingReplyTimers)
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(true);
    });
  });

  describe('handleDM', () => {
    beforeEach(() => {
      service.shouldReplyToDM = vi.fn().mockReturnValue(true);
      service.postReply = vi.fn().mockResolvedValue(true);
      service.saveInteractionMemory = vi.fn().mockResolvedValue(true);
    });

    it('processes DM correctly when decryption succeeds', async () => {
      decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');
      const dmEvent = {
        id: 'dm-123',
        kind: 4,
        pubkey: 'user-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);

      expect(service._createMemorySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            source: 'nostr'
          })
        }),
        'messages'
      );
    });

    it('skips DM when decryption fails', async () => {
      // Mock decryption failure
      decryptDirectMessageMock.mockResolvedValueOnce(null);

      const dmEvent = {
        id: 'dm-fail-123',
        kind: 4,
        pubkey: 'user-pubkey',
        content: 'bad-encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dmEvent);

      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });

    it('respects DM-specific throttling', async () => {
      const userPubkey = 'dm-user';
      decryptDirectMessageMock.mockResolvedValue('Decrypted DM content');

      const dm1 = {
        id: 'dm-1',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const dm2 = {
        id: 'dm-2',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dm1);
      await service.handleDM(dm2);

      // Should schedule second DM reply
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(true);
    });
  });

  describe('handleZap', () => {
    it('processes zap correctly', async () => {
      const zapEvent = {
        id: 'zap-123',
        kind: 9735,
        pubkey: 'zapper-pubkey',
        content: 'zap-receipt-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', service.pkHex],
          ['bolt11', 'lnbc...invoice...'],
          ['description', '{"amount":1000}']
        ]
      };

      await service.handleZap(zapEvent);

      // Should generate thanks response
      expect(mockRuntime.useModel).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt: expect.stringContaining('zap')
        })
      );
    });

    it('respects zap cooldown per user', async () => {
      const zapperPubkey = 'frequent-zapper';
      
      const zap1 = {
        id: 'zap-1',
        kind: 9735,
        pubkey: zapperPubkey,
        content: 'zap-1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const zap2 = {
        id: 'zap-2',
        kind: 9735,
        pubkey: zapperPubkey,
        content: 'zap-2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleZap(zap1);
      await service.handleZap(zap2);

      // Second zap should be ignored due to cooldown
      expect(mockRuntime.useModel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cross-Handler Interactions', () => {
    it('handles mixed event types from same user correctly', async () => {
      const userPubkey = 'multi-user';
      
      const mention = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'Hello bot!',
        created_at: Math.floor(Date.now() / 1000)
      };

      const zap = {
        id: 'zap-1',
        kind: 9735,
        pubkey: userPubkey,
        content: 'zap receipt',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mention);
      await service.handleZap(zap);

      // Zap should cancel any pending mention reply
      expect(service.pendingReplyTimers.has(userPubkey)).toBe(false);
    });

    it('maintains separate throttling for mentions vs DMs', async () => {
      const userPubkey = 'mixed-user';
      
      const mention = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'Public mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      const dm = {
        id: 'dm-1',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted-dm',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleMention(mention);
      await service.handleDM(dm);

      // Both should be processed (different throttling pools)
      expect(service._createMemorySafe).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('continues processing after handler errors', async () => {
      // Mock memory creation failure
      service._createMemorySafe.mockRejectedValueOnce(new Error('Database error'));

      const mention = {
        id: 'mention-error',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'This will fail',
        created_at: Math.floor(Date.now() / 1000)
      };

      // Should not throw
      await expect(service.handleMention(mention)).resolves.toBeUndefined();
    });

    it('handles missing event properties gracefully', async () => {
      const malformedEvent = {
        // Missing id, kind, etc.
        pubkey: 'user-pubkey',
        content: 'Malformed event'
      };

      await expect(service.handleMention(malformedEvent)).resolves.toBeUndefined();
      await expect(service.handleDM(malformedEvent)).resolves.toBeUndefined();
      await expect(service.handleZap(malformedEvent)).resolves.toBeUndefined();
    });
  });
});
