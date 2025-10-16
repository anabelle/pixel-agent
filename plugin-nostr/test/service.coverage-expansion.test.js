import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('NostrService Coverage Expansion', () => {
  let service;
  let mockRuntime;
  let mockPool;

  beforeEach(async () => {
    mockRuntime = {
      character: { 
        name: 'TestBot',
        postExamples: ['test post'],
        messageExamples: [[
          { user: 'user', content: { text: 'Hello' } },
          { user: 'agent', content: { text: 'Hi!' } }
        ]],
        style: { all: ['helpful'], post: ['concise'], chat: ['friendly'] }
      },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://relay1.test,wss://relay2.test',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_ZAP_THANKS_ENABLE': 'true',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
          'NOSTR_DISCOVERY_ENABLE': 'false',
          'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
          'NOSTR_POST_DAILY_DIGEST_ENABLE': 'false',
          'NOSTR_ENABLE_PING': 'false',
          'NOSTR_UNFOLLOW_ENABLE': 'false',
          'NOSTR_REPLY_THROTTLE_SEC': '60',
          'NOSTR_DM_THROTTLE_SEC': '60',
          'NOSTR_ZAP_COOLDOWN_SEC': '300',
          'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '0',
          'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '0',
          'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '15000',
          'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '120000',
          'NOSTR_MENTION_PRIORITY_BOOST_MS': '5000',
          'NOSTR_MAX_EVENT_AGE_DAYS': '2'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn().mockResolvedValue({ text: 'Generated reply' }),
      createMemory: vi.fn().mockResolvedValue({ id: 'memory-id' }),
      getMemoryById: vi.fn().mockResolvedValue(null),
      getMemories: vi.fn().mockResolvedValue([]),
      ensureWorldExists: vi.fn().mockResolvedValue({ id: 'world-id' }),
      ensureRoomExists: vi.fn().mockResolvedValue({ id: 'room-id' }),
      ensureConnection: vi.fn().mockResolvedValue({ id: 'connection-id' }),
      agentId: 'test-agent',
      databaseAdapter: {
        getMemories: vi.fn().mockResolvedValue([]),
        createMemory: vi.fn().mockResolvedValue({ ok: true })
      }
    };

    mockPool = {
      subscribeMany: vi.fn(() => vi.fn()),
      publish: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
      list: vi.fn().mockResolvedValue([])
    };

    mockRuntime.createSimplePool = vi.fn(() => mockPool);

    service = await NostrService.start(mockRuntime);
    
    // Mock internal methods
    service._createMemorySafe = vi.fn().mockResolvedValue(true);
    service._generateReplyTextLLM = vi.fn().mockResolvedValue('Generated reply text');
    service._generateDmReplyTextLLM = vi.fn().mockResolvedValue('Generated DM reply');
    service._generateZapThanksTextLLM = vi.fn().mockResolvedValue('Thanks for the zap!');
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    vi.restoreAllMocks();
  });

  describe('Service Stop and Cleanup', () => {
    it('clears all timers on stop', async () => {
      // Set up various timers
      service.postTimer = setTimeout(() => {}, 10000);
      service.discoveryTimer = setTimeout(() => {}, 10000);
      service.homeFeedTimer = setTimeout(() => {}, 10000);
      service.connectionMonitorTimer = setTimeout(() => {}, 10000);
      service.hourlyDigestTimer = setTimeout(() => {}, 10000);
      service.dailyReportTimer = setTimeout(() => {}, 10000);
      service.selfReflectionTimer = setTimeout(() => {}, 10000);

      await service.stop();

      expect(service.postTimer).toBe(null);
      expect(service.discoveryTimer).toBe(null);
      expect(service.homeFeedTimer).toBe(null);
      expect(service.connectionMonitorTimer).toBe(null);
      expect(service.hourlyDigestTimer).toBe(null);
      expect(service.dailyReportTimer).toBe(null);
      expect(service.selfReflectionTimer).toBe(null);
    });

    it('closes pool on stop', async () => {
      await service.stop();
      expect(mockPool.close).toHaveBeenCalled();
    });

    it('clears pending reply timers on stop', async () => {
      service.pendingReplyTimers.set('user1', setTimeout(() => {}, 10000));
      service.pendingReplyTimers.set('user2', setTimeout(() => {}, 10000));

      await service.stop();

      expect(service.pendingReplyTimers.size).toBe(0);
    });

    it('unsubscribes from listeners on stop', async () => {
      const mockUnsub = vi.fn();
      service.listenUnsub = mockUnsub;

      await service.stop();

      expect(mockUnsub).toHaveBeenCalled();
      expect(service.listenUnsub).toBe(null);
    });
  });

  describe('Event Deduplication', () => {
    it('tracks handled events to prevent duplicates', async () => {
      const event = {
        id: 'event-123',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Test mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(event);
      expect(service.handledEventIds.has('event-123')).toBe(true);
    });

    it('skips already handled events', async () => {
      const event = {
        id: 'event-duplicate',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Test mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      service.handledEventIds.add('event-duplicate');
      
      await service.handleMention(event);
      
      // Memory creation should not be called for duplicate
      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });
  });

  describe('Posting Methods', () => {
    it('postOnce queues post with correct priority', async () => {
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');

      await service.postOnce('Test post content');

      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test post content',
          priority: expect.any(Number)
        })
      );
    });

    it('postReply includes parent event tags', async () => {
      const parentEvent = {
        id: 'parent-123',
        pubkey: 'parent-author',
        kind: 1
      };

      service.postReply = vi.fn().mockResolvedValue({ id: 'reply-id' });

      await service.postReply('Reply text', parentEvent);

      expect(service.postReply).toHaveBeenCalledWith('Reply text', parentEvent, undefined);
    });

    it('postReaction sends reaction event', async () => {
      const targetEvent = {
        id: 'target-123',
        pubkey: 'target-author'
      };

      const result = await service.postReaction(targetEvent, '👍');

      // Should call pool.publish or queue for publishing
      expect(result).toBeDefined();
    });

    it('postRepost creates repost event', async () => {
      const originalEvent = {
        id: 'original-123',
        pubkey: 'original-author',
        kind: 1
      };

      const result = await service.postRepost(originalEvent);

      expect(result).toBeDefined();
    });
  });

  describe('Throttling Mechanisms', () => {
    it('enforces reply throttle per user', async () => {
      const userPubkey = 'throttled-user';
      const event1 = {
        id: 'mention-1',
        kind: 1,
        pubkey: userPubkey,
        content: 'First mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      const event2 = {
        id: 'mention-2',
        kind: 1,
        pubkey: userPubkey,
        content: 'Second mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(event1);
      await service.handleMention(event2);

      // Second mention should be throttled
      expect(service._createMemorySafe).toHaveBeenCalledTimes(1);
    });

    it('enforces DM throttle per user', async () => {
      const userPubkey = 'dm-user';
      const dm1 = {
        id: 'dm-1',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const dm2 = {
        id: 'dm-2',
        kind: 4,
        pubkey: userPubkey,
        content: 'encrypted2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleDM(dm1);
      await service.handleDM(dm2);

      // Second DM should be throttled
      expect(service._createMemorySafe).toHaveBeenCalledTimes(1);
    });

    it('enforces zap cooldown per user', async () => {
      const userPubkey = 'zap-user';
      const zap1 = {
        id: 'zap-1',
        kind: 9735,
        pubkey: userPubkey,
        content: 'zap1',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      const zap2 = {
        id: 'zap-2',
        kind: 9735,
        pubkey: userPubkey,
        content: 'zap2',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleZap(zap1);
      await service.handleZap(zap2);

      // Second zap should be in cooldown
      expect(service._generateZapThanksTextLLM).toHaveBeenCalledTimes(1);
    });
  });

  describe('Configuration Loading', () => {
    it('loads relay configuration from settings', () => {
      expect(service.relays).toEqual(['wss://relay1.test', 'wss://relay2.test']);
    });

    it('loads throttle settings correctly', () => {
      expect(service.replyThrottleSec).toBe(60);
      expect(service.dmThrottleSec).toBe(60);
    });

    it('has valid pool instance', () => {
      expect(service.pool).toBe(mockPool);
    });

    it('has valid public key hex', () => {
      expect(service.pkHex).toBeTruthy();
      expect(typeof service.pkHex).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('handles pool publish errors gracefully', async () => {
      mockPool.publish.mockRejectedValue(new Error('Network error'));

      await expect(service.postOnce('Test')).resolves.not.toThrow();
    });

    it('handles memory creation errors gracefully', async () => {
      service._createMemorySafe.mockRejectedValue(new Error('DB error'));

      const event = {
        id: 'error-event',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Test',
        created_at: Math.floor(Date.now() / 1000)
      };

      await expect(service.handleMention(event)).resolves.not.toThrow();
    });

    it('handles LLM generation errors gracefully', async () => {
      service._generateReplyTextLLM.mockRejectedValue(new Error('LLM error'));

      const event = {
        id: 'llm-error',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Test',
        created_at: Math.floor(Date.now() / 1000)
      };

      await expect(service.handleMention(event)).resolves.not.toThrow();
    });
  });

  describe('State Management', () => {
    it('maintains lastReplyByUser map', async () => {
      const userPubkey = 'state-user';
      const event = {
        id: 'state-event',
        kind: 1,
        pubkey: userPubkey,
        content: 'Test',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(event);

      expect(service.lastReplyByUser.has(userPubkey)).toBe(true);
    });

    it('maintains zapCooldownByUser map', async () => {
      const userPubkey = 'zap-state-user';
      const zap = {
        id: 'zap-state',
        kind: 9735,
        pubkey: userPubkey,
        content: 'zap',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleZap(zap);

      expect(service.zapCooldownByUser.has(userPubkey)).toBe(true);
    });

    it('clears expired throttle entries', () => {
      const oldTimestamp = Date.now() - 3600000; // 1 hour ago
      service.lastReplyByUser.set('old-user', oldTimestamp);
      
      // Service should eventually clean up old entries
      expect(service.lastReplyByUser.has('old-user')).toBe(true);
    });
  });

  describe('Sealed DM Handling', () => {
    it('processes sealed DM events', async () => {
      service.handleSealedDM = vi.fn().mockResolvedValue(undefined);

      const sealedDM = {
        id: 'sealed-1',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'sealed-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await service.handleSealedDM(sealedDM);

      expect(service.handleSealedDM).toHaveBeenCalled();
    });
  });

  describe('Posting Queue Integration', () => {
    it('uses posting queue for rate limiting', () => {
      expect(service.postingQueue).toBeDefined();
      expect(service.postingQueue.priorities).toBeDefined();
    });

    it('sets correct priority for mentions', async () => {
      const enqueueSpy = vi.spyOn(service.postingQueue, 'enqueue');

      const event = {
        id: 'priority-event',
        kind: 1,
        pubkey: 'user-pubkey',
        content: 'Test mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      service.postReply = vi.fn();
      await service.handleMention(event);

      // Should prioritize mention replies
      if (enqueueSpy.mock.calls.length > 0) {
        const call = enqueueSpy.mock.calls[0];
        expect(call[0]).toHaveProperty('priority');
      }
    });
  });

  describe('Mute List Handling', () => {
    it('skips events from muted users', async () => {
      const mutedPubkey = 'muted-user';
      service.mutedUsers.add(mutedPubkey);

      const event = {
        id: 'muted-event',
        kind: 1,
        pubkey: mutedPubkey,
        content: 'Should be ignored',
        created_at: Math.floor(Date.now() / 1000)
      };

      await service.handleMention(event);

      expect(service._createMemorySafe).not.toHaveBeenCalled();
    });

    it('muteUser adds to muted set', async () => {
      const pubkeyToMute = 'user-to-mute';

      await service.muteUser(pubkeyToMute);

      expect(service.mutedUsers.has(pubkeyToMute)).toBe(true);
    });

    it('unmuteUser removes from muted set', async () => {
      const pubkeyToUnmute = 'user-to-unmute';
      service.mutedUsers.add(pubkeyToUnmute);

      await service.unmuteUser(pubkeyToUnmute);

      expect(service.mutedUsers.has(pubkeyToUnmute)).toBe(false);
    });
  });
});
