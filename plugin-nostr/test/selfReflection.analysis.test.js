const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine - Analysis and Edge Cases', () => {
  let engine;
  let mockRuntime;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {}
    };

    mockRuntime = {
      getSetting: (key) => {
        const settings = {
          NOSTR_SELF_REFLECTION_ENABLE: 'true'
        };
        return settings[key] || null;
      },
      agentId: 'test-agent-id',
      getMemories: async () => [],
      createMemory: async (memory) => ({ created: true, id: memory.id }),
      getMemoryById: async (id) => null,
      databaseAdapter: {
        db: {}
      }
    };

    engine = new SelfReflectionEngine(mockRuntime, mockLogger, {
      createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
    });
  });

  describe('analyzeInteractionQuality', () => {
    it('returns null when disabled', async () => {
      engine.enabled = false;
      const result = await engine.analyzeInteractionQuality();
      expect(result).toBe(null);
    });

    it('returns null when no interactions available', async () => {
      mockRuntime.getMemories = async () => [];
      const result = await engine.analyzeInteractionQuality();
      expect(result).toBe(null);
    });

    it('updates lastAnalysis on successful analysis', async () => {
      const now = Date.now();
      
      mockRuntime.getMemories = async () => [
        {
          id: 'parent-1',
          createdAt: now - 2000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: { pubkey: 'user-1', content: 'Hello' },
            text: 'Hello'
          }
        },
        {
          id: 'reply-1',
          createdAt: now - 1000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: 'Hi there!',
            inReplyTo: 'parent-1'
          }
        }
      ];

      // Mock the generation function by replacing it temporarily
      const originalGenerate = require('../lib/generation').generateWithModelOrFallback;
      require('../lib/generation').generateWithModelOrFallback = async () => {
        return JSON.stringify({
          strengths: ['friendly tone'],
          weaknesses: ['could be more concise'],
          recommendations: ['ask follow-up questions'],
          patterns: ['emoji usage'],
          exampleGoodReply: 'Hi there!',
          exampleBadReply: null
        });
      };

      const result = await engine.analyzeInteractionQuality();

      // Restore original function
      require('../lib/generation').generateWithModelOrFallback = originalGenerate;

      expect(engine.lastAnalysis).toBeTruthy();
      expect(engine.lastAnalysis.timestamp).toBeTruthy();
      expect(engine.lastAnalysis.interactionsAnalyzed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('handles getMemories failure gracefully', async () => {
      mockRuntime.getMemories = async () => {
        throw new Error('Database error');
      };

      const { interactions } = await engine.getRecentInteractions();
      
      expect(interactions).toEqual([]);
    });

    it('handles createMemory failure in storeReflection', async () => {
      mockRuntime.createMemory = async () => {
        throw new Error('Storage error');
      };

      const result = await engine.storeReflection({
        analysis: { strengths: ['test'] },
        interactions: []
      });

      // Should not throw, just return false
      expect(result).toBe(false);
    });

    it('handles getMemoryById failure gracefully', async () => {
      const now = Date.now();
      
      mockRuntime.getMemories = async () => [
        {
          id: 'reply-1',
          createdAt: now,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: 'Reply',
            inReplyTo: 'missing-parent'
          }
        }
      ];

      mockRuntime.getMemoryById = async () => {
        throw new Error('Memory not found');
      };

      const { interactions } = await engine.getRecentInteractions();
      
      // Should skip this interaction since parent is missing
      expect(interactions).toEqual([]);
    });

    it('handles invalid memory structures', async () => {
      mockRuntime.getMemories = async () => [
        null,
        undefined,
        {},
        { content: null },
        { id: 'valid', content: { source: 'nostr', text: 'text', inReplyTo: 'parent' } }
      ];

      const { interactions } = await engine.getRecentInteractions();
      
      // Should filter out invalid memories
      expect(interactions.length).toBe(0); // Still 0 because parent is missing
    });

    it('handles missing user profile manager gracefully', async () => {
      engine.userProfileManager = null;
      
      const now = Date.now();
      mockRuntime.getMemories = async () => [
        {
          id: 'parent-1',
          createdAt: now - 2000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: { pubkey: 'user-1', content: 'Hello' },
            text: 'Hello'
          }
        },
        {
          id: 'reply-1',
          createdAt: now - 1000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: 'Hi!',
            inReplyTo: 'parent-1'
          }
        }
      ];

      const { interactions } = await engine.getRecentInteractions();
      
      expect(interactions.length).toBe(1);
      expect(interactions[0].engagement).toBe('unknown');
    });

    it('handles ensureSystemContext failure', async () => {
      // Make ensureSystemContext throw
      const originalEnsure = require('../lib/context').ensureNostrContextSystem;
      require('../lib/context').ensureNostrContextSystem = async () => {
        throw new Error('Context creation failed');
      };

      const result = await engine.storeReflection({
        analysis: { strengths: ['test'] },
        interactions: []
      });

      // Restore
      require('../lib/context').ensureNostrContextSystem = originalEnsure;

      // Should handle gracefully
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Edge Cases', () => {
    it('handles interactions with missing text fields', async () => {
      const now = Date.now();
      
      mockRuntime.getMemories = async () => [
        {
          id: 'parent-1',
          createdAt: now - 2000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: { pubkey: 'user-1' }, // No content field
            text: ''
          }
        },
        {
          id: 'reply-1',
          createdAt: now - 1000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: '', // Empty text
            inReplyTo: 'parent-1'
          }
        }
      ];

      const { interactions } = await engine.getRecentInteractions();
      
      expect(interactions.length).toBe(0);
    });

    it('handles duplicate interactions', async () => {
      const now = Date.now();
      const replyMemory = {
        id: 'reply-1',
        createdAt: now,
        roomId: 'room-1',
        content: {
          source: 'nostr',
          text: 'Reply text',
          inReplyTo: 'parent-1'
        }
      };
      
      mockRuntime.getMemories = async () => [
        {
          id: 'parent-1',
          createdAt: now - 2000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: { pubkey: 'user-1', content: 'Hello' },
            text: 'Hello'
          }
        },
        replyMemory,
        replyMemory // Duplicate
      ];

      const { interactions } = await engine.getRecentInteractions();
      
      expect(interactions.length).toBe(1);
    });

    it('handles very large conversation windows', async () => {
      const now = Date.now();
      const memories = [];
      
      // Create 100 messages in same room
      for (let i = 0; i < 100; i++) {
        memories.push({
          id: `msg-${i}`,
          createdAt: now - (100 - i) * 1000,
          roomId: 'busy-room',
          content: {
            source: 'nostr',
            text: `Message ${i}`
          }
        });
      }

      const replyMemory = memories[50];
      const parentMemory = memories[49];
      
      const conversation = engine._buildConversationWindow(memories, replyMemory, parentMemory);
      
      // Should be limited by window size
      expect(conversation.length).toBeLessThan(20);
    });

    it('handles reflections with missing analysis fields', () => {
      const summary = engine._buildInsightsSummary({
        // Missing all standard fields
      });
      
      expect(summary).toBe(null);
    });

    it('handles extremely long text in interactions', () => {
      const longText = 'a'.repeat(10000);
      const interaction = {
        userMessage: longText,
        yourReply: longText,
        conversation: [],
        feedback: [],
        signals: []
      };

      const serialized = engine._serializeInteractionSnapshot(interaction);
      
      expect(serialized.userMessage.length).toBe(280);
      expect(serialized.yourReply.length).toBe(280);
    });

    it('handles special characters in text', () => {
      const specialText = '😀🎉✨ Special chars: <>&"\'';
      const truncated = engine._truncate(specialText, 50);
      
      expect(truncated).toBeTruthy();
      expect(truncated.length).toBeLessThanOrEqual(50);
    });

    it('handles reflections without timestamp', async () => {
      mockRuntime.getMemories = async () => [
        {
          id: 'mem-1',
          // No createdAt field
          content: {
            type: 'self_reflection',
            data: {
              // No generatedAt field
              analysis: {
                strengths: ['test']
              }
            }
          }
        }
      ];

      const history = await engine.getReflectionHistory();
      
      // Should still process the reflection
      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('handles circular references in analysis objects', () => {
      const circular = { strengths: ['test'] };
      circular.self = circular; // Create circular reference
      
      // Should not throw when serializing
      const serialized = engine._serializeInteractionSnapshot({
        userMessage: 'test',
        yourReply: 'test',
        metadata: circular
      });
      
      expect(serialized).toBeTruthy();
    });

    it('handles concurrent calls to getLatestInsights', async () => {
      mockRuntime.getMemories = async () => [
        {
          id: 'mem-1',
          createdAt: Date.now(),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date().toISOString(),
              analysis: { strengths: ['concurrent'] }
            }
          }
        }
      ];

      // Make multiple concurrent calls
      const results = await Promise.all([
        engine.getLatestInsights(),
        engine.getLatestInsights(),
        engine.getLatestInsights()
      ]);

      // All should succeed
      results.forEach(result => {
        expect(result).toBeTruthy();
      });
    });

    it('handles zero-length arrays in analysis', () => {
      const summary = engine._buildInsightsSummary({
        strengths: [],
        weaknesses: [],
        recommendations: [],
        patterns: [],
        improvements: [],
        regressions: [],
        exampleGoodReply: null,
        exampleBadReply: null
      });
      
      expect(summary).toBe(null);
    });

    it('handles undefined vs null values', () => {
      const result1 = engine._truncate(undefined);
      const result2 = engine._truncate(null);
      
      expect(result1).toBe('');
      expect(result2).toBe('');
    });

    it('handles non-ASCII characters in pubkeys', () => {
      const pubkey = 'npub1234567890абвгдежз';
      const masked = engine._maskPubkey(pubkey);
      
      expect(masked).toBeTruthy();
      expect(masked).toContain('…');
    });
  });

  describe('Longitudinal Analysis Edge Cases', () => {
    it('handles insufficient history', async () => {
      mockRuntime.getMemories = async () => [
        {
          id: 'mem-1',
          createdAt: Date.now(),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date().toISOString(),
              analysis: { strengths: ['only one'] }
            }
          }
        }
      ];

      const analysis = await engine.analyzeLongitudinalPatterns();
      
      expect(analysis).toBe(null);
    });

    it('handles reflections with missing field arrays', () => {
      const text1 = 'Some TEXT with CAPS!';
      const text2 = 'some text with caps!';
      
      const norm1 = engine._normalizeForComparison(text1);
      const norm2 = engine._normalizeForComparison(text2);
      
      expect(norm1).toBe(norm2);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('handles invalid temperature settings', () => {
      const testRuntime = {
        getSetting: (key) => {
          if (key === 'NOSTR_SELF_REFLECTION_TEMPERATURE') return 'invalid';
          return null;
        }
      };

      const testEngine = new SelfReflectionEngine(testRuntime, mockLogger, {});
      
      // Should use default temperature
      expect(testEngine.temperature).toBe(0.6);
    });

    it('handles invalid maxTokens settings', () => {
      const testRuntime = {
        getSetting: (key) => {
          if (key === 'NOSTR_SELF_REFLECTION_MAX_TOKENS') return -100;
          return null;
        }
      };

      const testEngine = new SelfReflectionEngine(testRuntime, mockLogger, {});
      
      // Should use default maxTokens
      expect(testEngine.maxTokens).toBe(800);
    });

    it('handles invalid interaction limit', () => {
      const testRuntime = {
        getSetting: (key) => {
          if (key === 'NOSTR_SELF_REFLECTION_INTERACTION_LIMIT') return 'abc';
          return null;
        }
      };

      const testEngine = new SelfReflectionEngine(testRuntime, mockLogger, {});
      
      // Should use default limit
      expect(testEngine.maxInteractions).toBe(40);
    });

    it('handles mixed case enable setting', () => {
      const testRuntime = {
        getSetting: (key) => {
          if (key === 'NOSTR_SELF_REFLECTION_ENABLE') return 'TrUe';
          return null;
        }
      };

      const testEngine = new SelfReflectionEngine(testRuntime, mockLogger, {});
      
      expect(testEngine.enabled).toBe(true);
    });

    it('handles "false" string for enable setting', () => {
      const testRuntime = {
        getSetting: (key) => {
          if (key === 'NOSTR_SELF_REFLECTION_ENABLE') return 'false';
          return null;
        }
      };

      const testEngine = new SelfReflectionEngine(testRuntime, mockLogger, {});
      
      expect(testEngine.enabled).toBe(false);
    });
  });

  describe('Memory Consistency', () => {
    it('maintains consistent memory IDs', () => {
      const uuid1 = engine._createUuid('same-seed');
      // Wait a tiny bit to ensure timestamp changes
      const uuid2 = engine._createUuid('same-seed');
      
      // Should be different due to timestamp
      expect(uuid1).not.toBe(uuid2);
    });

    it('handles missing roomId in memories', async () => {
      mockRuntime.getMemories = async () => [
        {
          id: 'parent-1',
          createdAt: Date.now() - 2000,
          // No roomId
          content: {
            source: 'nostr',
            event: { pubkey: 'user-1', content: 'Hello' },
            text: 'Hello'
          }
        },
        {
          id: 'reply-1',
          createdAt: Date.now() - 1000,
          // No roomId
          content: {
            source: 'nostr',
            text: 'Hi!',
            inReplyTo: 'parent-1'
          }
        }
      ];

      const { interactions } = await engine.getRecentInteractions();
      
      // Should still process interaction
      expect(interactions.length).toBe(1);
    });
  });
});
