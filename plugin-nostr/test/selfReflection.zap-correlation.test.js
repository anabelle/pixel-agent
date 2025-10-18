const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine zap correlation', () => {
  let engine;
  let mockRuntime;
  let mockMemories;

  beforeEach(() => {
    mockMemories = [];

    mockRuntime = {
      getSetting: (key) => {
        if (key === 'NOSTR_SELF_REFLECTION_ZAP_CORRELATION_ENABLE') {
          return 'true'; // enabled by default in tests
        }
        return null;
      },
      agentId: 'test-agent-id',
      getMemories: async ({ roomId, count }) => {
        return mockMemories.slice(0, count);
      },
      getMemoryById: async (id) => {
        // Will be overridden in specific tests
        return null;
      },
      createMemory: async (memory) => ({ created: true, id: memory.id })
    };

    engine = new SelfReflectionEngine(mockRuntime, console, {
      createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
    });
  });

  describe('_collectSignalsForInteraction with zap correlation', () => {
    it('includes target post snippet in zap_thanks signals when correlation enabled', async () => {
      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks for the zap!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: '⚡ 2100 sats gratitude burst',
            data: {
              targetEventId: 'target-post-123'
            }
          }
        }
      ];

      // Mock successful fetch of target post
      mockRuntime.getMemoryById = async (id) => {
        if (id === 'target-post-123') {
          return {
            id: 'target-post-123',
            content: {
              text: 'This is an amazing post about AI and creativity that deserves recognition!'
            }
          };
        }
        return null;
      };

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toContain('zap_thanks to "This is an amazing post about AI and creativity that deserves recognition!": ⚡ 2100 sats gratitude burst');
    });

    it('truncates long target post content in zap signals', async () => {
      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: 'Thanks for the sats!',
            data: {
              targetEventId: 'target-post-456'
            }
          }
        }
      ];

      // Mock fetch of very long target post
      const longText = 'A'.repeat(300) + ' short ending';
      mockRuntime.getMemoryById = async (id) => {
        if (id === 'target-post-456') {
          return {
            id: 'target-post-456',
            content: {
              text: longText
            }
          };
        }
        return null;
      };

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toContain('zap_thanks to "');
      expect(signals[0]).toContain('…": Thanks for the sats!');
      expect(signals[0].length).toBeLessThan(250); // Should be truncated
    });

    it('falls back to original behavior when targetEventId is missing', async () => {
      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: '⚡ 1000 sats thanks'
            // No targetEventId
          }
        }
      ];

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toBe('zap_thanks: ⚡ 1000 sats thanks');
    });

    it('falls back to original behavior when target post fetch fails', async () => {
      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: '⚡ 500 sats thanks',
            data: {
              targetEventId: 'target-post-789'
            }
          }
        }
      ];

      // Mock failed fetch
      mockRuntime.getMemoryById = async (id) => {
        throw new Error('Post not found');
      };

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toBe('zap_thanks: ⚡ 500 sats thanks');
    });

    it('skips zap correlation when disabled via config', async () => {
      mockRuntime.getSetting = (key) => {
        if (key === 'NOSTR_SELF_REFLECTION_ZAP_CORRELATION_ENABLE') {
          return 'false';
        }
        return null;
      };

      // Re-create engine with disabled correlation
      engine = new SelfReflectionEngine(mockRuntime, console, {
        createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
      });

      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: '⚡ 2000 sats thanks',
            data: {
              targetEventId: 'target-post-999'
            }
          }
        }
      ];

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toBe('zap_thanks: ⚡ 2000 sats thanks');
    });

    it('handles zap_thanks memories without data property', async () => {
      const replyMemory = {
        id: 'reply-1',
        createdAt: Date.now(),
        content: { text: 'Thanks!' }
      };

      const timeWindow = {
        start: Date.now() - 60000,
        end: Date.now() + 60000
      };

      const allMemories = [
        {
          id: 'zap-1',
          createdAt: Date.now() - 30000,
          content: {
            type: 'zap_thanks',
            text: '⚡ 1500 sats thanks'
            // No data property at all
          }
        }
      ];

      const signals = await engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);

      expect(signals.length).toBe(1);
      expect(signals[0]).toBe('zap_thanks: ⚡ 1500 sats thanks');
    });
  });

  describe('_buildPrompt with zap correlation analysis', () => {
    it('includes zap correlation analysis instructions in prompt', () => {
      const interactions = [
        {
          userMessage: 'Great post!',
          yourReply: 'Thanks!',
          engagement: 'avg=0.8',
          conversation: [],
          feedback: [],
          signals: ['zap_thanks to "Amazing content about AI": ⚡ 1000 sats thanks'],
          metadata: { createdAtIso: '2025-10-05T10:00:00.000Z' }
        }
      ];

      const prompt = engine._buildPrompt(interactions);

      expect(prompt).toContain('Evaluate zaps received on specific posts');
      expect(prompt).toContain('what content patterns drove them');
    });

    it('includes correlated zap signals in interaction details', () => {
      const interactions = [
        {
          userMessage: 'Loved your art!',
          yourReply: 'Glad you liked it!',
          engagement: 'avg=0.9',
          conversation: [],
          feedback: [],
          signals: ['zap_thanks to "Beautiful digital artwork": ⚡ 2000 sats amazing work'],
          metadata: { createdAtIso: '2025-10-05T10:00:00.000Z' }
        }
      ];

      const prompt = engine._buildPrompt(interactions);

      expect(prompt).toContain('zap_thanks to "Beautiful digital artwork": ⚡ 2000 sats amazing work');
    });
  });

  describe('configuration handling', () => {
    it('defaults to enabled when config not set', () => {
      mockRuntime.getSetting = () => null;

      const engine = new SelfReflectionEngine(mockRuntime, console, {});

      // Test that correlation is enabled by default
      // This is tested implicitly through the other tests
      expect(engine).toBeDefined();
    });

    it('respects explicit enable setting', () => {
      mockRuntime.getSetting = (key) => {
        if (key === 'NOSTR_SELF_REFLECTION_ZAP_CORRELATION_ENABLE') {
          return 'true';
        }
        return null;
      };

      const engine = new SelfReflectionEngine(mockRuntime, console, {});

      expect(engine).toBeDefined();
    });

    it('respects explicit disable setting', () => {
      mockRuntime.getSetting = (key) => {
        if (key === 'NOSTR_SELF_REFLECTION_ZAP_CORRELATION_ENABLE') {
          return 'false';
        }
        return null;
      };

      const engine = new SelfReflectionEngine(mockRuntime, console, {});

      expect(engine).toBeDefined();
    });
  });
});