const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine - Integration Tests', () => {
  let engine;
  let mockRuntime;
  let mockLogger;
  let mockMemories;

  beforeEach(() => {
    mockMemories = [];
    
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {}
    };

    mockRuntime = {
      getSetting: (key) => {
        const settings = {
          NOSTR_SELF_REFLECTION_ENABLE: 'true',
          NOSTR_PUBLIC_KEY: 'agent-pubkey-123'
        };
        return settings[key] || null;
      },
      agentId: 'test-agent-id',
      getMemories: async ({ tableName, roomId, count, agentId }) => {
        return mockMemories.slice(0, count);
      },
      createMemory: async (memory) => ({ created: true, id: memory.id }),
      getMemoryById: async (id) => {
        return mockMemories.find(m => m.id === id) || null;
      }
    };

    engine = new SelfReflectionEngine(mockRuntime, mockLogger, {
      createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
    });
  });

  describe('storeReflection', () => {
    it('stores reflection with all payload data', async () => {
      const payload = {
        analysis: {
          strengths: ['clear communication'],
          weaknesses: ['verbose'],
          recommendations: ['be concise']
        },
        raw: 'Raw LLM output',
        prompt: 'The prompt used',
        interactions: [
          {
            userMessage: 'Hello',
            yourReply: 'Hi there',
            engagement: 'avg=0.5',
            conversation: [],
            feedback: [],
            signals: []
          }
        ],
        contextSignals: ['signal1'],
        previousReflections: [],
        longitudinalAnalysis: null
      };

      const result = await engine.storeReflection(payload);
      expect(result).toBe(true);
    });

    it('handles storage when runtime lacks createMemory', async () => {
      const noMemoryRuntime = { ...mockRuntime };
      delete noMemoryRuntime.createMemory;
      
      const testEngine = new SelfReflectionEngine(noMemoryRuntime, mockLogger, {});
      const result = await testEngine.storeReflection({ analysis: {} });
      
      expect(result).toBe(false);
    });

    it('updates insights cache after storing', async () => {
      const payload = {
        analysis: {
          strengths: ['good work'],
          weaknesses: []
        },
        interactions: []
      };

      await engine.storeReflection(payload);
      
      expect(engine._latestInsightsCache).toBeTruthy();
      expect(engine._latestInsightsCache.data).toBeTruthy();
    });
  });

  describe('getReflectionHistory', () => {
    it('retrieves reflection history', async () => {
      const now = Date.now();
      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - 1000,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - 1000).toISOString(),
              analysis: {
                strengths: ['clarity'],
                weaknesses: []
              }
            }
          }
        }
      ];

      const history = await engine.getReflectionHistory({ limit: 5 });
      
      expect(history.length).toBe(1);
      expect(history[0].strengths).toContain('clarity');
    });

    it('respects maxAgeHours parameter', async () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      mockMemories = [
        {
          id: 'mem-recent',
          createdAt: now - 1000,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - 1000).toISOString(),
              analysis: { strengths: ['recent'] }
            }
          }
        },
        {
          id: 'mem-old',
          createdAt: now - (2 * oneDay),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (2 * oneDay)).toISOString(),
              analysis: { strengths: ['old'] }
            }
          }
        }
      ];

      const history = await engine.getReflectionHistory({ limit: 10, maxAgeHours: 12 });
      
      expect(history.length).toBe(1);
      expect(history[0].strengths).toContain('recent');
    });

    it('returns empty array when disabled', async () => {
      engine.enabled = false;
      const history = await engine.getReflectionHistory();
      expect(history).toEqual([]);
    });

    it('returns empty array when no runtime', async () => {
      engine.runtime = null;
      const history = await engine.getReflectionHistory();
      expect(history).toEqual([]);
    });

    it('limits results to requested count', async () => {
      mockMemories = Array.from({ length: 20 }, (_, i) => ({
        id: `mem-${i}`,
        createdAt: Date.now() - i * 1000,
        content: {
          type: 'self_reflection',
          data: {
            generatedAt: new Date(Date.now() - i * 1000).toISOString(),
            analysis: { strengths: [`strength-${i}`] }
          }
        }
      }));

      const history = await engine.getReflectionHistory({ limit: 3 });
      
      expect(history.length).toBe(3);
    });
  });

  describe('getLatestInsights', () => {
    it('retrieves latest insights from memory', async () => {
      const now = Date.now();
      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now).toISOString(),
              analysis: {
                strengths: ['excellent'],
                weaknesses: ['needs work']
              },
              interactionsAnalyzed: 5
            }
          }
        }
      ];

      const insights = await engine.getLatestInsights();
      
      expect(insights).toBeTruthy();
      expect(insights.strengths).toContain('excellent');
      expect(insights.weaknesses).toContain('needs work');
      expect(insights.interactionsAnalyzed).toBe(5);
    });

    it('uses cache when available and fresh', async () => {
      engine._latestInsightsCache = {
        timestamp: Date.now(),
        data: { strengths: ['cached'] }
      };

      const insights = await engine.getLatestInsights({ cacheMs: 60000 });
      
      expect(insights.strengths).toContain('cached');
    });

    it('refreshes cache when expired', async () => {
      const now = Date.now();
      engine._latestInsightsCache = {
        timestamp: now - 100000, // Old cache
        data: { strengths: ['old'] }
      };

      mockMemories = [
        {
          id: 'mem-new',
          createdAt: now,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now).toISOString(),
              analysis: { strengths: ['fresh'] }
            }
          }
        }
      ];

      const insights = await engine.getLatestInsights({ cacheMs: 5000 });
      
      expect(insights.strengths).toContain('fresh');
    });

    it('falls back to lastAnalysis when no memories', async () => {
      mockMemories = [];
      engine.lastAnalysis = {
        timestamp: Date.now(),
        interactionsAnalyzed: 3,
        strengths: ['fallback-strength'],
        weaknesses: ['fallback-weakness']
      };

      const insights = await engine.getLatestInsights();
      
      expect(insights).toBeTruthy();
      expect(insights.strengths).toContain('fallback-strength');
    });

    it('returns null when disabled', async () => {
      engine.enabled = false;
      const insights = await engine.getLatestInsights();
      expect(insights).toBe(null);
    });

    it('respects maxAgeHours parameter', async () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      
      mockMemories = [
        {
          id: 'mem-old',
          createdAt: now - (2 * oneDay),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (2 * oneDay)).toISOString(),
              analysis: { strengths: ['too old'] }
            }
          }
        }
      ];

      const insights = await engine.getLatestInsights({ maxAgeHours: 12 });
      
      expect(insights).toBe(null);
    });
  });

  describe('getRecentInteractions', () => {
    it('retrieves and processes agent reply memories', async () => {
      const now = Date.now();
      
      mockMemories = [
        {
          id: 'parent-1',
          createdAt: now - 2000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: {
              pubkey: 'user-pubkey-1',
              content: 'Hello Pixel!'
            },
            text: 'Hello Pixel!'
          }
        },
        {
          id: 'reply-1',
          createdAt: now - 1000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: 'Hi! How can I help?',
            inReplyTo: 'parent-1'
          }
        }
      ];

      const { interactions, contextSignals } = await engine.getRecentInteractions(5);
      
      expect(interactions.length).toBe(1);
      expect(interactions[0].userMessage).toContain('Hello Pixel');
      expect(interactions[0].yourReply).toContain('Hi! How can I help');
    });

    it('returns empty when no runtime', async () => {
      engine.runtime = null;
      const result = await engine.getRecentInteractions();
      
      expect(result.interactions).toEqual([]);
      expect(result.contextSignals).toEqual([]);
    });

    it('returns empty when runtime lacks getMemories', async () => {
      const noMemoriesRuntime = { agentId: 'test-id' };
      const testEngine = new SelfReflectionEngine(noMemoriesRuntime, mockLogger, {});
      
      const result = await testEngine.getRecentInteractions();
      
      expect(result.interactions).toEqual([]);
      expect(result.contextSignals).toEqual([]);
    });

    it('fetches parent memory when not in cache', async () => {
      const now = Date.now();
      
      mockMemories = [
        {
          id: 'reply-1',
          createdAt: now,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            text: 'My reply',
            inReplyTo: 'parent-external'
          }
        },
        {
          id: 'parent-external',
          createdAt: now - 1000,
          roomId: 'room-1',
          content: {
            source: 'nostr',
            event: {
              pubkey: 'user-1',
              content: 'External parent message'
            },
            text: 'External parent message'
          }
        }
      ];

      const { interactions } = await engine.getRecentInteractions(5);
      
      expect(interactions.length).toBe(1);
      expect(interactions[0].userMessage).toContain('External parent');
    });

    it('limits interactions to requested count', async () => {
      const now = Date.now();
      
      mockMemories = [];
      for (let i = 0; i < 20; i++) {
        mockMemories.push({
          id: `parent-${i}`,
          createdAt: now - (i * 1000) - 500,
          roomId: `room-${i}`,
          content: {
            source: 'nostr',
            event: { pubkey: 'user', content: `Message ${i}` },
            text: `Message ${i}`
          }
        });
        mockMemories.push({
          id: `reply-${i}`,
          createdAt: now - (i * 1000),
          roomId: `room-${i}`,
          content: {
            source: 'nostr',
            text: `Reply ${i}`,
            inReplyTo: `parent-${i}`
          }
        });
      }

      const { interactions } = await engine.getRecentInteractions(5);
      
      expect(interactions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('_buildConversationWindow', () => {
    it('builds conversation window with before/after messages', () => {
      const now = Date.now();
      const roomMemories = [
        { id: 'msg-1', createdAt: now - 5000, content: { text: 'Message 1' } },
        { id: 'msg-2', createdAt: now - 4000, content: { text: 'Message 2' } },
        { id: 'parent', createdAt: now - 3000, content: { text: 'Parent message' } },
        { id: 'reply', createdAt: now - 2000, content: { text: 'Reply message' } },
        { id: 'msg-3', createdAt: now - 1000, content: { text: 'Message 3' } },
        { id: 'msg-4', createdAt: now, content: { text: 'Message 4' } }
      ];
      
      const replyMemory = roomMemories.find(m => m.id === 'reply');
      const parentMemory = roomMemories.find(m => m.id === 'parent');
      
      const conversation = engine._buildConversationWindow(roomMemories, replyMemory, parentMemory);
      
      expect(conversation.length).toBeGreaterThan(0);
      expect(conversation.some(entry => entry.text.includes('Parent message'))).toBe(true);
      expect(conversation.some(entry => entry.text.includes('Reply message'))).toBe(true);
    });

    it('returns empty array for empty roomMemories', () => {
      const replyMemory = { id: 'reply', content: { text: 'Reply' } };
      const parentMemory = { id: 'parent', content: { text: 'Parent' } };
      
      const conversation = engine._buildConversationWindow([], replyMemory, parentMemory);
      
      expect(conversation).toEqual([]);
    });

    it('includes parent memory if not in slice', () => {
      const now = Date.now();
      const roomMemories = [
        { id: 'reply', createdAt: now, content: { text: 'Reply' } }
      ];
      const replyMemory = roomMemories[0];
      const parentMemory = { id: 'external-parent', createdAt: now - 10000, content: { text: 'External parent' } };
      
      const conversation = engine._buildConversationWindow(roomMemories, replyMemory, parentMemory);
      
      expect(conversation.some(entry => entry.text.includes('External parent'))).toBe(true);
    });
  });

  describe('_formatConversationEntry', () => {
    const replyMemory = { id: 'reply-1', content: { text: 'My reply' } };

    it('formats conversation entry with all fields', () => {
      const memory = {
        id: 'msg-1',
        createdAt: Date.parse('2025-10-05T10:00:00.000Z'),
        content: {
          type: 'nostr_mention',
          text: 'Hello there!',
          event: { pubkey: 'user-pubkey-123' }
        }
      };

      const entry = engine._formatConversationEntry(memory, replyMemory);
      
      expect(entry.id).toBe('msg-1');
      expect(entry.text).toBe('Hello there!');
      expect(entry.type).toBe('nostr_mention');
      expect(entry.createdAtIso).toBe('2025-10-05T10:00:00.000Z');
      expect(entry.role).toBe('user');
    });

    it('extracts text from event content', () => {
      const memory = {
        id: 'msg-1',
        content: {
          event: { 
            pubkey: 'user-123',
            content: 'Text from event'
          }
        }
      };

      const entry = engine._formatConversationEntry(memory, replyMemory);
      
      expect(entry.text).toBe('Text from event');
    });

    it('truncates long text', () => {
      const memory = {
        id: 'msg-1',
        content: {
          text: 'a'.repeat(500)
        }
      };

      const entry = engine._formatConversationEntry(memory, replyMemory);
      
      expect(entry.text.length).toBe(320);
      expect(entry.text.endsWith('…')).toBe(true);
    });
  });

  describe('_collectFeedback', () => {
    it('collects feedback messages after reply', () => {
      const conversationEntries = [
        { id: 'parent', role: 'user', text: 'Question', author: 'user1' },
        { id: 'reply', role: 'you', text: 'Answer', author: 'you', isReply: true },
        { id: 'feedback1', role: 'user', text: 'Thanks!', author: 'user1', createdAtIso: '2025-10-05T10:00:00.000Z' },
        { id: 'feedback2', role: 'user', text: 'Very helpful', author: 'user2', createdAtIso: '2025-10-05T10:01:00.000Z' }
      ];

      const feedback = engine._collectFeedback(conversationEntries, 'reply');
      
      expect(feedback.length).toBe(2);
      expect(feedback[0].summary).toBe('Thanks!');
      expect(feedback[1].summary).toBe('Very helpful');
    });

    it('limits feedback to 3 items', () => {
      const conversationEntries = [
        { id: 'reply', role: 'you', isReply: true },
        { id: 'f1', role: 'user', text: 'Feedback 1', author: 'u1' },
        { id: 'f2', role: 'user', text: 'Feedback 2', author: 'u2' },
        { id: 'f3', role: 'user', text: 'Feedback 3', author: 'u3' },
        { id: 'f4', role: 'user', text: 'Feedback 4', author: 'u4' },
        { id: 'f5', role: 'user', text: 'Feedback 5', author: 'u5' }
      ];

      const feedback = engine._collectFeedback(conversationEntries, 'reply');
      
      expect(feedback.length).toBe(3);
    });

    it('filters out agent messages', () => {
      const conversationEntries = [
        { id: 'reply', role: 'you', isReply: true },
        { id: 'f1', role: 'user', text: 'User feedback', author: 'user1' },
        { id: 'f2', role: 'you', text: 'Agent message', author: 'you' }
      ];

      const feedback = engine._collectFeedback(conversationEntries, 'reply');
      
      expect(feedback.length).toBe(1);
      expect(feedback[0].summary).toBe('User feedback');
    });

    it('returns empty array for empty conversation', () => {
      const feedback = engine._collectFeedback([], 'reply-id');
      expect(feedback).toEqual([]);
    });

    it('returns empty array when reply not found', () => {
      const conversationEntries = [
        { id: 'msg1', role: 'user', text: 'Message' }
      ];

      const feedback = engine._collectFeedback(conversationEntries, 'nonexistent-reply');
      
      expect(feedback).toEqual([]);
    });
  });

  describe('_deriveTimeWindow', () => {
    it('derives time window from conversation timestamps', () => {
      const conversationEntries = [
        { createdAt: 1000 },
        { createdAt: 2000 },
        { createdAt: 3000 }
      ];

      const window = engine._deriveTimeWindow(conversationEntries, 4000, 500);
      
      expect(window).toBeTruthy();
      expect(window.start).toBeLessThan(1000);
      expect(window.end).toBeGreaterThan(4000);
    });

    it('includes reply and parent timestamps', () => {
      const conversationEntries = [];
      const window = engine._deriveTimeWindow(conversationEntries, 5000, 1000);
      
      expect(window).toBeTruthy();
      expect(window.start).toBeLessThan(1000);
      expect(window.end).toBeGreaterThan(5000);
    });

    it('returns null for empty data', () => {
      const window = engine._deriveTimeWindow([], null, null);
      expect(window).toBe(null);
    });

    it('adds padding to time window', () => {
      const conversationEntries = [{ createdAt: 10000 }];
      const window = engine._deriveTimeWindow(conversationEntries, 10000, 10000);
      
      const padding = 15 * 60 * 1000; // 15 minutes
      expect(window.start).toBe(10000 - padding);
      expect(window.end).toBe(10000 + padding);
    });
  });

  describe('_collectSignalsForInteraction', () => {
    it('collects signals within time window', () => {
      const now = Date.now();
      const replyMemory = { id: 'reply-1', createdAt: now };
      const timeWindow = { start: now - 30 * 60 * 1000, end: now + 30 * 60 * 1000 };
      
      const allMemories = [
        {
          id: 'signal-1',
          createdAt: now - 10 * 60 * 1000,
          content: {
            type: 'zap_received',
            data: { summary: 'Received 1000 sats' }
          }
        },
        {
          id: 'signal-2',
          createdAt: now - 5 * 60 * 1000,
          content: {
            type: 'engagement_metrics',
            text: 'High engagement detected'
          }
        }
      ];

      const signals = engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);
      
      expect(signals.length).toBe(2);
      expect(signals[0]).toContain('zap_received');
      expect(signals[1]).toContain('engagement_metrics');
    });

    it('excludes signals outside time window', () => {
      const now = Date.now();
      const replyMemory = { id: 'reply-1', createdAt: now };
      const timeWindow = { start: now - 10 * 60 * 1000, end: now + 10 * 60 * 1000 };
      
      const allMemories = [
        {
          id: 'too-old',
          createdAt: now - 60 * 60 * 1000,
          content: { type: 'old_signal', text: 'Too old' }
        },
        {
          id: 'in-window',
          createdAt: now - 5 * 60 * 1000,
          content: { type: 'good_signal', text: 'Within window' }
        }
      ];

      const signals = engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);
      
      expect(signals.length).toBe(1);
      expect(signals[0]).toContain('good_signal');
    });

    it('excludes self_reflection and nostr_thread_context types', () => {
      const now = Date.now();
      const replyMemory = { id: 'reply-1', createdAt: now };
      const timeWindow = { start: now - 30 * 60 * 1000, end: now + 30 * 60 * 1000 };
      
      const allMemories = [
        {
          id: 'excluded-1',
          createdAt: now - 1000,
          content: { type: 'self_reflection', text: 'Should be excluded' }
        },
        {
          id: 'excluded-2',
          createdAt: now - 2000,
          content: { type: 'nostr_thread_context', text: 'Should be excluded' }
        }
      ];

      const signals = engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);
      
      expect(signals.length).toBe(0);
    });

    it('limits signals to 5', () => {
      const now = Date.now();
      const replyMemory = { id: 'reply-1', createdAt: now };
      const timeWindow = { start: now - 30 * 60 * 1000, end: now + 30 * 60 * 1000 };
      
      const allMemories = Array.from({ length: 10 }, (_, i) => ({
        id: `signal-${i}`,
        createdAt: now - i * 1000,
        content: { type: `signal_type_${i}`, text: `Signal ${i}` }
      }));

      const signals = engine._collectSignalsForInteraction(allMemories, replyMemory, timeWindow);
      
      expect(signals.length).toBe(5);
    });

    it('returns empty array for empty memories', () => {
      const replyMemory = { id: 'reply', createdAt: Date.now() };
      const signals = engine._collectSignalsForInteraction([], replyMemory, null);
      expect(signals).toEqual([]);
    });
  });

  describe('_collectGlobalSignals', () => {
    it('collects diverse signal types', () => {
      const now = Date.now();
      const sortedMemories = [
        {
          id: 'signal-1',
          createdAt: now - 5000,
          roomId: 'room-1',
          content: {
            type: 'zap_received',
            data: { summary: 'Received zap' }
          }
        },
        {
          id: 'signal-2',
          createdAt: now - 3000,
          roomId: 'room-2',
          content: {
            type: 'engagement_update',
            text: 'High engagement'
          }
        }
      ];

      const signals = engine._collectGlobalSignals(sortedMemories);
      
      expect(signals.length).toBe(2);
      expect(signals[0]).toContain('zap_received');
      expect(signals[1]).toContain('engagement_update');
    });

    it('excludes self_reflection type', () => {
      const sortedMemories = [
        {
          id: 'reflection',
          createdAt: Date.now(),
          content: { type: 'self_reflection', text: 'Should be excluded' }
        },
        {
          id: 'signal',
          createdAt: Date.now(),
          content: { type: 'valid_signal', text: 'Should be included' }
        }
      ];

      const signals = engine._collectGlobalSignals(sortedMemories);
      
      expect(signals.length).toBe(1);
      expect(signals[0]).toContain('valid_signal');
    });

    it('deduplicates by type and roomId', () => {
      const sortedMemories = [
        {
          id: 'signal-1',
          createdAt: Date.now(),
          roomId: 'room-1',
          content: { type: 'zap_received', text: 'First zap' }
        },
        {
          id: 'signal-2',
          createdAt: Date.now(),
          roomId: 'room-1',
          content: { type: 'zap_received', text: 'Second zap' }
        }
      ];

      const signals = engine._collectGlobalSignals(sortedMemories);
      
      expect(signals.length).toBe(1);
    });

    it('limits signals to 8', () => {
      const sortedMemories = Array.from({ length: 20 }, (_, i) => ({
        id: `signal-${i}`,
        createdAt: Date.now() - i * 1000,
        roomId: `room-${i}`,
        content: { type: `type_${i}`, text: `Signal ${i}` }
      }));

      const signals = engine._collectGlobalSignals(sortedMemories);
      
      expect(signals.length).toBe(8);
    });

    it('includes timestamp in signal when available', () => {
      const timestamp = Date.parse('2025-10-05T10:00:00.000Z');
      const sortedMemories = [
        {
          id: 'signal-1',
          createdAt: timestamp,
          content: { type: 'test_signal', text: 'Test' }
        }
      ];

      const signals = engine._collectGlobalSignals(sortedMemories);
      
      expect(signals[0]).toContain('2025-10-05T10:00:00.000Z');
    });

    it('returns empty array for empty input', () => {
      const signals = engine._collectGlobalSignals([]);
      expect(signals).toEqual([]);
    });

    it('returns empty array for null input', () => {
      const signals = engine._collectGlobalSignals(null);
      expect(signals).toEqual([]);
    });
  });
});
