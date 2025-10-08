import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NostrService } from '../lib/service.js';

// Mock dependencies
vi.mock('@elizaos/core', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  createUniqueUuid: vi.fn(() => 'mock-uuid'),
  ChannelType: {},
  ModelType: {},
}));

vi.mock('../lib/utils', () => ({
  parseRelays: vi.fn(() => []),
}));

vi.mock('../lib/keys', () => ({
  parseSk: vi.fn(),
  parsePk: vi.fn(),
}));

vi.mock('../lib/scoring', () => ({
  _scoreEventForEngagement: vi.fn(() => 0.5),
  _isQualityContent: vi.fn(() => true),
}));

vi.mock('../lib/discovery', () => ({
  pickDiscoveryTopics: vi.fn(() => ['test']),
  isSemanticMatch: vi.fn(() => true),
  isQualityAuthor: vi.fn(() => true),
  selectFollowCandidates: vi.fn(() => []),
}));

vi.mock('../lib/text', () => ({
  buildPostPrompt: vi.fn(() => 'prompt'),
  buildReplyPrompt: vi.fn(() => 'reply prompt'),
  extractTextFromModelResult: vi.fn(() => 'text'),
  sanitizeWhitelist: vi.fn((s) => s),
}));

vi.mock('../lib/nostr', () => ({
  getConversationIdFromEvent: vi.fn(() => 'conv-id'),
  extractTopicsFromEvent: vi.fn(() => ['topic']),
  isSelfAuthor: vi.fn(() => false),
}));

vi.mock('../lib/zaps', () => ({
  getZapAmountMsats: vi.fn(() => 1000),
  getZapTargetEventId: vi.fn(() => 'target-id'),
  generateThanksText: vi.fn(() => 'thanks'),
  getZapSenderPubkey: vi.fn(() => 'sender-pk'),
}));

vi.mock('../lib/eventFactory', () => ({
  buildTextNote: vi.fn(() => ({ content: 'note' })),
  buildReplyNote: vi.fn(() => ({ content: 'reply' })),
  buildReaction: vi.fn(() => ({ content: '+' })),
  buildRepost: vi.fn(() => ({ content: 'repost' })),
  buildQuoteRepost: vi.fn(() => ({ content: 'quote' })),
  buildContacts: vi.fn(() => ({ content: 'contacts' })),
  buildMuteList: vi.fn(() => ({ content: 'mute' })),
}));

vi.mock('../lib/context', () => ({
  ensureNostrContext: vi.fn(() => ({ roomId: 'room-id', entityId: 'entity-id' })),
  createMemorySafe: vi.fn(() => Promise.resolve(true)),
  saveInteractionMemory: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/generation', () => ({
  generateWithModelOrFallback: vi.fn(() => Promise.resolve('YES, relevant to creativity.')),
}));

vi.mock('../lib/replyText', () => ({
  pickReplyTextFor: vi.fn(() => 'reply text'),
}));

describe('NostrService Interaction Limits', () => {
  let runtime;
  let service;

  beforeEach(() => {
    runtime = {
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay1.com,wss://relay2.com',
          'NOSTR_PRIVATE_KEY': 'sk123',
          'NOSTR_PUBLIC_KEY': 'pk123',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
        };
        return settings[key];
      }),
      getMemories: vi.fn(() => Promise.resolve([])),
      agentId: 'agent-id',
    };

     service = new NostrService(runtime);
     service.pool = { publish: vi.fn().mockResolvedValue(true) };
     service.relays = ['wss://relay1.com'];
     service.sk = 'sk123';
     service.pkHex = 'pk123';
     // Set logger for the service
     service.logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };
     service._createMemorySafe = vi.fn().mockResolvedValue(true);
  });

  describe('_loadInteractionCounts', () => {
    it('should load interaction counts from memory', async () => {
      const mockMemories = [
        {
          content: { source: 'nostr', type: 'interaction_counts', counts: { 'user1': 1, 'user2': 2 } },
          createdAt: Date.now(),
        },
      ];
      runtime.getMemories.mockResolvedValue(mockMemories);

      await service._loadInteractionCounts();

      expect(service.userInteractionCount.get('user1')).toBe(1);
      expect(service.userInteractionCount.get('user2')).toBe(2);
    });

    it('should handle no memories', async () => {
      runtime.getMemories.mockResolvedValue([]);

      await service._loadInteractionCounts();

      expect(service.userInteractionCount.size).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      runtime.getMemories.mockRejectedValue(new Error('DB error'));

      await service._loadInteractionCounts();

      expect(service.userInteractionCount.size).toBe(0);
    });
  });

  describe('_saveInteractionCounts', () => {
    it('should save interaction counts to memory', async () => {
      service.userInteractionCount.set('user1', 1);

      await service._saveInteractionCounts();

      expect(service._createMemorySafe).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          entityId: expect.any(String),
          agentId: 'agent-id',
          roomId: expect.any(String),
          content: { source: 'nostr', type: 'interaction_counts', counts: { 'user1': 1 } },
          createdAt: expect.any(Number),
        }),
        'messages'
      );
    });
  });

  describe('postReply with interaction limits', () => {
    it('should reply if count < 2 and not mention', async () => {
      const mockEvent = { id: 'event-id', pubkey: 'user1', content: 'test' };
      service.userInteractionCount.set('user1', 1);

      const result = await service.postReply(mockEvent, 'reply text');

      expect(result).toBe(true);
      expect(service.userInteractionCount.get('user1')).toBe(2);
    });

    it('should skip if count >= 2 and not mention', async () => {
      const mockEvent = { id: 'event-id', pubkey: 'user1', content: 'test' };
      service.userInteractionCount.set('user1', 2);

      const result = await service.postReply(mockEvent, 'reply text');

      expect(result).toBe(false);
    });

    it('should always reply if mention', async () => {
      const mockEvent = { id: 'event-id', pubkey: 'user1', content: '@pixel test' };
      service.userInteractionCount.set('user1', 2);
      // Mock _isActualMention to return true for mentions
      service._isActualMention = vi.fn(() => true);

      const result = await service.postReply(mockEvent, 'reply text');

      expect(result).toBe(true);
      expect(service.userInteractionCount.get('user1')).toBe(2); // Not incremented for mentions
    });
  });

   describe('postRepost with interaction limits', () => {
     it('should repost if count < 2', async () => {
       const mockEvent = { id: 'event-id', pubkey: 'user1' };
       service.userInteractionCount.set('user1', 1);

       const result = await service.postRepost(mockEvent);

       expect(result).toBe(true);
       expect(service.userInteractionCount.get('user1')).toBe(2);
     });

     it('should skip repost if count >= 2', async () => {
       const mockEvent = { id: 'event-id', pubkey: 'user1' };
       service.userInteractionCount.set('user1', 2);

       const result = await service.postRepost(mockEvent);

       expect(result).toBe(false);
     });
   });

   describe('postQuoteRepost with interaction limits', () => {
     it('should quote repost if count < 2', async () => {
       const mockEvent = { id: 'event-id', pubkey: 'user1' };
       service.userInteractionCount.set('user1', 1);

       const result = await service.postQuoteRepost(mockEvent, 'quote text');

       expect(result).toBe(true);
       expect(service.userInteractionCount.get('user1')).toBe(2);
     });

     it('should skip quote repost if count >= 2', async () => {
       const mockEvent = { id: 'event-id', pubkey: 'user1' };
       service.userInteractionCount.set('user1', 2);

       const result = await service.postQuoteRepost(mockEvent, 'quote text');

       expect(result).toBe(false);
     });
   });

   describe('_setupResetTimer', () => {
     it('should set up weekly reset timer', () => {
       const setIntervalSpy = vi.spyOn(global, 'setInterval');

       service._setupResetTimer();

       expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 7 * 24 * 60 * 60 * 1000);
     });
   });
 });