import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('NostrService Event Routing', () => {
  let service;
  let mockRuntime;
  let mockPool;
  let capturedOnevent;

  beforeEach(() => {
    capturedOnevent = null;
    
    // Mock runtime with minimal required interface
    mockRuntime = {
      character: { name: 'Test', postExamples: ['test'] },
      getSetting: vi.fn((key) => {
        const settings = {
          'NOSTR_RELAYS': 'wss://test.relay',
          'NOSTR_PRIVATE_KEY': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          'NOSTR_LISTEN_ENABLE': 'true',
          'NOSTR_POST_ENABLE': 'false',
          'NOSTR_REPLY_ENABLE': 'true',
          'NOSTR_DM_ENABLE': 'true',
          'NOSTR_DM_REPLY_ENABLE': 'true',
          'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
          'NOSTR_CONTEXT_LLM_ANALYSIS': 'false',
          'NOSTR_HOME_FEED_ENABLE': 'false',
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
          'NOSTR_HOME_FEED_MAX_INTERACTIONS': '1',
          'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '15000',
          'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '120000',
          'NOSTR_MENTION_PRIORITY_BOOST_MS': '5000',
          'NOSTR_MAX_EVENT_AGE_DAYS': '2',
          'NOSTR_ZAP_THANKS_ENABLE': 'true'
        };
        return settings[key] || '';
      }),
      useModel: vi.fn(),
      createMemory: vi.fn(),
      getMemoryById: vi.fn(),
      getMemories: vi.fn(() => []),
      ensureWorldExists: vi.fn(),
      ensureRoomExists: vi.fn(),
      ensureConnection: vi.fn(),
      agentId: 'test-agent'
    };

    // Mock pool with subscribeMap (current API used by service)
    mockPool = {
      subscribeMap: vi.fn((requests, callbacks) => {
        // Capture the onevent handler for tests
        capturedOnevent = callbacks.onevent;
        return vi.fn(); // unsub function
      }),
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

  describe('Subscription Setup', () => {
    it('subscribes to correct event kinds via subscribeMap', async () => {
      service = await NostrService.start(mockRuntime);

      expect(mockPool.subscribeMap).toHaveBeenCalled();
      const call = mockPool.subscribeMap.mock.calls[0];
      const requests = call[0];
      
      // subscribeMap gets an array of { url, filter } objects
      const kinds = requests.map(r => r.filter.kinds[0]);
      expect(kinds).toContain(1);  // Text notes (mentions)
      expect(kinds).toContain(4);  // DMs
      expect(kinds).toContain(14); // Sealed DMs
      expect(kinds).toContain(9735); // Zaps
    });

    it('includes pubkey in subscription filters', async () => {
      service = await NostrService.start(mockRuntime);

      const call = mockPool.subscribeMap.mock.calls[0];
      const requests = call[0];
      
      requests.forEach(req => {
        expect(req.filter['#p']).toContain(service.pkHex);
      });
    });
  });

  describe('Event Routing Logic', () => {
    beforeEach(async () => {
      service = await NostrService.start(mockRuntime);
      // Spy on the handlers
      vi.spyOn(service, 'handleMention').mockImplementation(async () => {});
      vi.spyOn(service, 'handleDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleSealedDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleZap').mockImplementation(async () => {});
    });

    it('routes kind 1 events to handleMention', async () => {
      if (!capturedOnevent) {
        // If no handler was captured (listen disabled), skip
        return;
      }
      
      const mentionEvent = {
        id: 'mention-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: 'Hello @pixel!',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await capturedOnevent(mentionEvent);

      expect(service.handleMention).toHaveBeenCalledWith(mentionEvent);
      expect(service.handleDM).not.toHaveBeenCalled();
      expect(service.handleSealedDM).not.toHaveBeenCalled();
      expect(service.handleZap).not.toHaveBeenCalled();
    });

    it('routes kind 4 events to handleDM', async () => {
      if (!capturedOnevent) return;
      
      const dmEvent = {
        id: 'dm-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await capturedOnevent(dmEvent);

      expect(service.handleDM).toHaveBeenCalledWith(dmEvent);
      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleSealedDM).not.toHaveBeenCalled();
      expect(service.handleZap).not.toHaveBeenCalled();
    });

    it('routes kind 14 events to handleSealedDM', async () => {
      if (!capturedOnevent) return;
      
      const sealedDmEvent = {
        id: 'sealed-dm-id',
        kind: 14,
        pubkey: 'sender-pubkey',
        content: 'sealed-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await capturedOnevent(sealedDmEvent);

      expect(service.handleSealedDM).toHaveBeenCalledWith(sealedDmEvent);
      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleDM).not.toHaveBeenCalled();
      expect(service.handleZap).not.toHaveBeenCalled();
    });

    it('routes kind 9735 events to handleZap', async () => {
      if (!capturedOnevent) return;
      
      const zapEvent = {
        id: 'zap-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap-content',
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', service.pkHex]]
      };

      await capturedOnevent(zapEvent);

      expect(service.handleZap).toHaveBeenCalledWith(zapEvent);
      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleDM).not.toHaveBeenCalled();
      expect(service.handleSealedDM).not.toHaveBeenCalled();
    });

    it('ignores unknown event kinds', async () => {
      if (!capturedOnevent) return;
      
      const unknownEvent = {
        id: 'unknown-id',
        kind: 99999,
        pubkey: 'sender-pubkey',
        content: 'unknown content',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(unknownEvent);

      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleDM).not.toHaveBeenCalled();
      expect(service.handleSealedDM).not.toHaveBeenCalled();
      expect(service.handleZap).not.toHaveBeenCalled();
    });

    it('skips self-authored events', async () => {
      if (!capturedOnevent) return;
      
      const selfEvent = {
        id: 'self-id',
        kind: 1,
        pubkey: service.pkHex, // Same as service pubkey
        content: 'Self post',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(selfEvent);

      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleDM).not.toHaveBeenCalled();
      expect(service.handleSealedDM).not.toHaveBeenCalled();
      expect(service.handleZap).not.toHaveBeenCalled();
    });
  });

  describe('Handler Error Resilience', () => {
    beforeEach(async () => {
      service = await NostrService.start(mockRuntime);
      vi.spyOn(service, 'handleMention').mockImplementation(async () => {});
      vi.spyOn(service, 'handleDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleSealedDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleZap').mockImplementation(async () => {});
    });

    it('continues processing after handleMention error', async () => {
      service.handleMention.mockRejectedValue(new Error('Mention handler failed'));

      const mentionEvent = {
        id: 'mention-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: 'Hello!',
        created_at: Math.floor(Date.now() / 1000)
      };

      // Should not throw
      await capturedOnevent(mentionEvent);
      expect(service.handleMention).toHaveBeenCalled();
    });

    it('continues processing after handleDM error', async () => {
      service.handleDM.mockRejectedValue(new Error('DM handler failed'));

      const dmEvent = {
        id: 'dm-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(dmEvent);
      expect(service.handleDM).toHaveBeenCalled();
    });

    it('continues processing after handleZap error', async () => {
      service.handleZap.mockRejectedValue(new Error('Zap handler failed'));

      const zapEvent = {
        id: 'zap-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(zapEvent);
      expect(service.handleZap).toHaveBeenCalled();
    });
  });

  describe('Regression Prevention', () => {
    beforeEach(async () => {
      service = await NostrService.start(mockRuntime);
      vi.spyOn(service, 'handleMention').mockImplementation(async () => {});
      vi.spyOn(service, 'handleDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleSealedDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleZap').mockImplementation(async () => {});
    });

    it('REGRESSION: mentions (kind 1) must not be handled by DM handler', async () => {
      const mentionEvent = {
        id: 'mention-id',
        kind: 1,
        pubkey: 'sender-pubkey',
        content: 'This is a mention, not a DM',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(mentionEvent);

      expect(service.handleMention).toHaveBeenCalledWith(mentionEvent);
      expect(service.handleDM).not.toHaveBeenCalled();
    });

    it('REGRESSION: DMs (kind 4) must not be handled by mention handler', async () => {
      const dmEvent = {
        id: 'dm-id',
        kind: 4,
        pubkey: 'sender-pubkey',
        content: 'This is a DM, not a mention',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(dmEvent);

      expect(service.handleDM).toHaveBeenCalledWith(dmEvent);
      expect(service.handleMention).not.toHaveBeenCalled();
    });

    it('REGRESSION: zaps (kind 9735) must not fall through to mention handler', async () => {
      const zapEvent = {
        id: 'zap-id',
        kind: 9735,
        pubkey: 'sender-pubkey',
        content: 'zap receipt',
        created_at: Math.floor(Date.now() / 1000)
      };

      await capturedOnevent(zapEvent);

      expect(service.handleZap).toHaveBeenCalledWith(zapEvent);
      expect(service.handleMention).not.toHaveBeenCalled();
      expect(service.handleDM).not.toHaveBeenCalled();
    });

    it('REGRESSION: all handlers must have explicit kind checks', async () => {
      // This test ensures that adding new event kinds doesn't break existing handlers
      const events = [
        { id: '1', kind: 1, pubkey: 'test', content: 'mention', created_at: Math.floor(Date.now() / 1000) },
        { id: '2', kind: 4, pubkey: 'test', content: 'dm', created_at: Math.floor(Date.now() / 1000) },
        { id: '3', kind: 14, pubkey: 'test', content: 'sealed', created_at: Math.floor(Date.now() / 1000) },
        { id: '4', kind: 9735, pubkey: 'test', content: 'zap', created_at: Math.floor(Date.now() / 1000) },
        { id: '5', kind: 999, pubkey: 'test', content: 'unknown', created_at: Math.floor(Date.now() / 1000) }
      ];

      for (const event of events) {
        // Reset all mocks
        service.handleMention.mockClear();
        service.handleDM.mockClear();
        service.handleSealedDM.mockClear();
        service.handleZap.mockClear();

        await capturedOnevent(event);

        // Count total handler calls
        const totalCalls = 
          service.handleMention.mock.calls.length +
          service.handleDM.mock.calls.length +
          service.handleSealedDM.mock.calls.length +
          service.handleZap.mock.calls.length;

        if (event.kind === 999) {
          // Unknown kinds should call no handlers
          expect(totalCalls).toBe(0);
        } else {
          // Known kinds should call exactly one handler
          expect(totalCalls).toBe(1);
        }
      }
    });
  });

  describe('Event Processing Flow', () => {
    beforeEach(async () => {
      service = await NostrService.start(mockRuntime);
      vi.spyOn(service, 'handleMention').mockImplementation(async () => {});
      vi.spyOn(service, 'handleDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleSealedDM').mockImplementation(async () => {});
      vi.spyOn(service, 'handleZap').mockImplementation(async () => {});
    });

    it('processes multiple events in sequence correctly', async () => {
      const events = [
        { id: '1', kind: 1, pubkey: 'user1', content: 'mention 1', created_at: Math.floor(Date.now() / 1000) },
        { id: '2', kind: 4, pubkey: 'user2', content: 'dm 1', created_at: Math.floor(Date.now() / 1000) },
        { id: '3', kind: 9735, pubkey: 'user3', content: 'zap 1', created_at: Math.floor(Date.now() / 1000) },
        { id: '4', kind: 1, pubkey: 'user4', content: 'mention 2', created_at: Math.floor(Date.now() / 1000) },
      ];

      for (const event of events) {
        await capturedOnevent(event);
      }

      expect(service.handleMention).toHaveBeenCalledTimes(2);
      expect(service.handleDM).toHaveBeenCalledTimes(1);
      expect(service.handleZap).toHaveBeenCalledTimes(1);
    });

    it('handles concurrent events correctly', async () => {
      const events = [
        { id: '1', kind: 1, pubkey: 'user1', content: 'mention', created_at: Math.floor(Date.now() / 1000) },
        { id: '2', kind: 4, pubkey: 'user2', content: 'dm', created_at: Math.floor(Date.now() / 1000) },
        { id: '3', kind: 9735, pubkey: 'user3', content: 'zap', created_at: Math.floor(Date.now() / 1000) },
      ];

      // Process all events concurrently
      await Promise.all(events.map(event => capturedOnevent(event)));

      expect(service.handleMention).toHaveBeenCalledTimes(1);
      expect(service.handleDM).toHaveBeenCalledTimes(1);
      expect(service.handleZap).toHaveBeenCalledTimes(1);
    });
  });
});
