import { NostrService } from '../lib/service.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('NostrService Home Feed Reply Deduplication', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(() => {
    // Mock runtime with minimal required interface
    mockRuntime = {
      character: { name: 'Test', postExamples: ['test'] },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // Test fixture - not a real secret
          'NOSTR_LISTEN_ENABLE': 'false', // Disable listening to prevent subscriptions
          'NOSTR_POST_ENABLE': 'false', // Disable posting to prevent scheduled posts
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'false',
          'NOSTR_DM_REPLY_ENABLE': 'false',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_CONTEXT_LLM_ANALYSIS': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'true',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_ENABLE_PING': 'false',
          'NOSTR_POST_DAILY_DIGEST_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
          'NOSTR_UNFOLLOW_ENABLE': 'false',
          'NOSTR_DM_THROTTLE_SEC': '60',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '0',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '0',
          'NOSTR_DISCOVERY_INTERVAL_MIN': '900',
          'NOSTR_DISCOVERY_INTERVAL_MAX': '1800',
          'NOSTR_HOME_FEED_INTERVAL_MIN': '300',
          'NOSTR_HOME_FEED_INTERVAL_MAX': '900',
          'NOSTR_HOME_FEED_REACTION_CHANCE': '0',
          'NOSTR_HOME_FEED_REPOST_CHANCE': '0',
          'NOSTR_HOME_FEED_QUOTE_CHANCE': '0',
          'NOSTR_HOME_FEED_REPLY_CHANCE': '1.0', // Always choose reply for testing
          'NOSTR_HOME_FEED_MAX_INTERACTIONS': '10',
          'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '0',
          'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '0',
          'NOSTR_MENTION_PRIORITY_BOOST_MS': '5000',
          'NOSTR_MAX_EVENT_AGE_DAYS': '2',
          'NOSTR_ZAP_THANKS_ENABLE': 'false',
          'NOSTR_IMAGE_PROCESSING_ENABLED': 'false'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(() => Promise.resolve({ text: 'Test reply' })),
      createMemory: vi.fn(),
      getMemoryById: vi.fn(),
      getMemories: vi.fn(() => []),
      ensureWorldExists: vi.fn(),
      ensureRoomExists: vi.fn(),
      ensureConnection: vi.fn(),
      agentId: 'test-agent',
      createUniqueUuid: vi.fn((_, seed) => `uuid-${seed}`)
    };

    // Mock pool
    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn(),
      close: vi.fn()
    };

    mockRuntime.createSimplePool = vi.fn(() => mockPool);

    service = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper function to set up common mocks
  function setupHomeFeedMocks(service) {
    service.pool = mockPool; // Ensure pool is set for processHomeFeed
    service.sk = 'test-sk'; // Mock private key
    service.relays = ['wss://test.relay']; // Mock relays
    service.pkHex = 'test-pk-hex'; // Mock public key hex
    service._loadCurrentContacts = vi.fn(() => Promise.resolve(new Set(['test-pubkey'])));
    service._list = vi.fn(() => Promise.resolve([{
      id: 'test-event-id',
      pubkey: 'test-pubkey',
      content: 'Test post content',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1
    }]));
    service._isQualityContent = vi.fn(() => true);
    service._analyzePostForInteraction = vi.fn(() => Promise.resolve(true));
    service._isUserMuted = vi.fn(() => Promise.resolve(false));
    service._getThreadContext = vi.fn(() => Promise.resolve([]));
    service._getConversationIdFromEvent = vi.fn(() => 'test-conv-id');
    service._ensureNostrContext = vi.fn(() => Promise.resolve({ roomId: 'test-room-id' }));
    service._shouldEngageWithThread = vi.fn(() => true);
    service.generateReplyTextLLM = vi.fn(() => Promise.resolve('Test reply text'));
    service.postReply = vi.fn(() => Promise.resolve(true));
    service.imageProcessingEnabled = false;
    service.createUniqueUuid = vi.fn((_, seed) => `uuid-${seed}`);
    service._chooseInteractionType = vi.fn(() => 'reply');
  }

  describe('processHomeFeed Reply Deduplication', () => {
    it('should not reply twice to the same home feed post', async () => {
      service = await NostrService.start(mockRuntime);

      setupHomeFeedMocks(service);

      // Mock getMemories to return existing reply on second call
      let callCount = 0;
      mockRuntime.getMemories = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First call - no existing replies
          return Promise.resolve([]);
        } else {
          // Second call - existing reply found
          return Promise.resolve([{
            content: { inReplyTo: 'uuid-test-event-id' }
          }]);
        }
      });

      // First call to processHomeFeed - should reply
      await service.processHomeFeed();
      expect(service.postReply).toHaveBeenCalledTimes(1);

      // Reset call count and mocks for second call
      callCount = 0;
      service.postReply.mockClear();

      // Second call to processHomeFeed - should NOT reply due to deduplication
      await service.processHomeFeed();
      expect(service.postReply).not.toHaveBeenCalled();
    });

    it('should reply when no existing reply is found', async () => {
      service = await NostrService.start(mockRuntime);

      setupHomeFeedMocks(service);

      // Mock getMemories to always return no existing replies
      mockRuntime.getMemories = vi.fn(() => Promise.resolve([]));

      // Process home feed - should reply
      await service.processHomeFeed();
      expect(service.postReply).toHaveBeenCalledTimes(1);
    });
  });
});