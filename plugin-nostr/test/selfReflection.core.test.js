const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine - Core Functionality', () => {
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
          NOSTR_SELF_REFLECTION_ENABLE: 'true',
          NOSTR_SELF_REFLECTION_INTERACTION_LIMIT: '40',
          NOSTR_SELF_REFLECTION_TEMPERATURE: '0.6',
          NOSTR_SELF_REFLECTION_MAX_TOKENS: '800'
        };
        return settings[key] || null;
      },
      agentId: 'test-agent-id',
      getMemories: async () => [],
      createMemory: async (memory) => ({ created: true, id: memory.id }),
      getMemoryById: async (id) => null
    };

    engine = new SelfReflectionEngine(mockRuntime, mockLogger, {
      createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
    });
  });

  describe('Initialization', () => {
    it('initializes with default configuration', () => {
      expect(engine.enabled).toBe(true);
      expect(engine.maxInteractions).toBe(40);
      expect(engine.temperature).toBe(0.6);
      expect(engine.maxTokens).toBe(800);
    });

    it('handles disabled state', () => {
      const disabledRuntime = {
        getSetting: (key) => key === 'NOSTR_SELF_REFLECTION_ENABLE' ? 'false' : null
      };
      const disabledEngine = new SelfReflectionEngine(disabledRuntime, mockLogger, {});
      expect(disabledEngine.enabled).toBe(false);
    });

    it('accepts custom maxInteractions via options', () => {
      const customEngine = new SelfReflectionEngine(mockRuntime, mockLogger, {
        maxInteractions: 25
      });
      expect(customEngine.maxInteractions).toBe(25);
    });

    it('accepts custom temperature via options', () => {
      const customEngine = new SelfReflectionEngine(mockRuntime, mockLogger, {
        temperature: 0.8
      });
      expect(customEngine.temperature).toBe(0.8);
    });

    it('accepts custom maxTokens via options', () => {
      const customEngine = new SelfReflectionEngine(mockRuntime, mockLogger, {
        maxTokens: 1000
      });
      expect(customEngine.maxTokens).toBe(1000);
    });

    it('initializes with null system context', () => {
      expect(engine._systemContext).toBe(null);
      expect(engine._systemContextPromise).toBe(null);
    });

    it('initializes with null lastAnalysis', () => {
      expect(engine.lastAnalysis).toBe(null);
    });
  });

  describe('_extractJson', () => {
    it('extracts JSON from string response', () => {
      const response = 'Some text before {"key": "value", "number": 42} some text after';
      const result = engine._extractJson(response);
      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('extracts complex JSON with nested objects', () => {
      const response = '{"strengths": ["one", "two"], "weaknesses": [], "nested": {"key": "val"}}';
      const result = engine._extractJson(response);
      expect(result).toEqual({
        strengths: ['one', 'two'],
        weaknesses: [],
        nested: { key: 'val' }
      });
    });

    it('returns null for invalid JSON', () => {
      const response = 'No JSON here at all';
      const result = engine._extractJson(response);
      expect(result).toBe(null);
    });

    it('returns null for malformed JSON', () => {
      const response = '{"incomplete": ';
      const result = engine._extractJson(response);
      expect(result).toBe(null);
    });

    it('returns null for null input', () => {
      const result = engine._extractJson(null);
      expect(result).toBe(null);
    });

    it('returns null for non-string input', () => {
      const result = engine._extractJson(123);
      expect(result).toBe(null);
    });
  });

  describe('_truncate', () => {
    it('truncates text longer than limit', () => {
      const text = 'a'.repeat(400);
      const result = engine._truncate(text, 320);
      expect(result.length).toBe(320);
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns text unchanged if within limit', () => {
      const text = 'Short text';
      const result = engine._truncate(text, 320);
      expect(result).toBe('Short text');
    });

    it('trims and normalizes whitespace', () => {
      const text = '  Multiple   spaces   here  ';
      const result = engine._truncate(text, 320);
      expect(result).toBe('Multiple spaces here');
    });

    it('returns empty string for null input', () => {
      const result = engine._truncate(null);
      expect(result).toBe('');
    });

    it('uses default limit of 320', () => {
      const text = 'a'.repeat(400);
      const result = engine._truncate(text);
      expect(result.length).toBe(320);
    });
  });

  describe('_trim', () => {
    it('trims text to specified limit', () => {
      const text = 'a'.repeat(5000);
      const result = engine._trim(text, 4000);
      expect(result.length).toBe(4001); // 4000 + ellipsis
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns text unchanged if within limit', () => {
      const text = 'Short text';
      const result = engine._trim(text, 1000);
      expect(result).toBe('Short text');
    });

    it('returns text unchanged if no limit provided', () => {
      const text = 'Any length text';
      const result = engine._trim(text);
      expect(result).toBe('Any length text');
    });

    it('handles non-string input', () => {
      const result = engine._trim(123, 100);
      expect(result).toBe(123);
    });

    it('returns null for null input', () => {
      const result = engine._trim(null, 100);
      expect(result).toBe(null);
    });
  });

  describe('_maskPubkey', () => {
    it('masks a pubkey showing only first 6 and last 4 characters', () => {
      const pubkey = 'npub1234567890abcdefghijklmnopqrstuvwxyz';
      const result = engine._maskPubkey(pubkey);
      expect(result).toBe('npub12…wxyz');
    });

    it('returns "unknown" for null input', () => {
      const result = engine._maskPubkey(null);
      expect(result).toBe('unknown');
    });

    it('returns "unknown" for non-string input', () => {
      const result = engine._maskPubkey(123);
      expect(result).toBe('unknown');
    });

    it('handles short pubkeys', () => {
      const pubkey = 'short';
      const result = engine._maskPubkey(pubkey);
      expect(result).toBe('short…hort');
    });
  });

  describe('_formatEngagement', () => {
    it('formats complete engagement stats', () => {
      const stats = {
        averageEngagement: 0.72,
        successRate: 0.80,
        totalInteractions: 15,
        dominantSentiment: 'positive'
      };
      const result = engine._formatEngagement(stats);
      expect(result).toContain('avg=0.72');
      expect(result).toContain('success=80%');
      expect(result).toContain('total=15');
      expect(result).toContain('sentiment=positive');
    });

    it('handles partial stats', () => {
      const stats = {
        averageEngagement: 0.5,
        totalInteractions: 10
      };
      const result = engine._formatEngagement(stats);
      expect(result).toContain('avg=0.50');
      expect(result).toContain('total=10');
      expect(result).not.toContain('success');
      expect(result).not.toContain('sentiment');
    });

    it('returns "unknown" for null stats', () => {
      const result = engine._formatEngagement(null);
      expect(result).toBe('unknown');
    });

    it('returns "unknown" for empty stats', () => {
      const result = engine._formatEngagement({});
      expect(result).toBe('unknown');
    });

    it('handles NaN values gracefully', () => {
      const stats = {
        averageEngagement: NaN,
        successRate: 0.5
      };
      const result = engine._formatEngagement(stats);
      expect(result).toContain('success=50%');
      expect(result).not.toContain('avg');
    });
  });

  describe('_toIsoString', () => {
    it('converts timestamp to ISO string', () => {
      const timestamp = Date.parse('2025-10-05T10:00:00.000Z');
      const result = engine._toIsoString(timestamp);
      expect(result).toBe('2025-10-05T10:00:00.000Z');
    });

    it('returns null for non-finite timestamp', () => {
      const result = engine._toIsoString(NaN);
      expect(result).toBe(null);
    });

    it('returns null for null input', () => {
      const result = engine._toIsoString(null);
      expect(result).toBe(null);
    });

    it('returns null for undefined input', () => {
      const result = engine._toIsoString(undefined);
      expect(result).toBe(null);
    });

    it('handles current timestamp', () => {
      const now = Date.now();
      const result = engine._toIsoString(now);
      expect(result).toBeTruthy();
      expect(result).toContain('T');
      expect(result).toContain('Z');
    });
  });

  describe('_toLimitedList', () => {
    it('limits array to specified size', () => {
      const arr = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'];
      const result = engine._toLimitedList(arr, 4);
      expect(result.length).toBe(4);
      expect(result).toEqual(['item1', 'item2', 'item3', 'item4']);
    });

    it('truncates long strings in array', () => {
      const arr = ['a'.repeat(300)];
      const result = engine._toLimitedList(arr, 4);
      expect(result[0].length).toBe(220);
      expect(result[0].endsWith('…')).toBe(true);
    });

    it('filters out falsy values', () => {
      const arr = ['item1', null, '', 'item2', undefined, 'item3'];
      const result = engine._toLimitedList(arr, 10);
      expect(result).toEqual(['item1', 'item2', 'item3']);
    });

    it('returns empty array for non-array input', () => {
      const result = engine._toLimitedList('not an array', 4);
      expect(result).toEqual([]);
    });

    it('uses default limit of 4', () => {
      const arr = ['1', '2', '3', '4', '5', '6'];
      const result = engine._toLimitedList(arr);
      expect(result.length).toBe(4);
    });
  });

  describe('_normalizeForComparison', () => {
    it('normalizes text to lowercase', () => {
      const result = engine._normalizeForComparison('Hello World');
      expect(result).toBe('hello world');
    });

    it('removes punctuation', () => {
      const result = engine._normalizeForComparison('Hello, World! How are you?');
      expect(result).toBe('hello world how are you');
    });

    it('normalizes multiple spaces', () => {
      const result = engine._normalizeForComparison('too    many     spaces');
      expect(result).toBe('too many spaces');
    });

    it('trims whitespace', () => {
      const result = engine._normalizeForComparison('  text with spaces  ');
      expect(result).toBe('text with spaces');
    });

    it('returns empty string for null input', () => {
      const result = engine._normalizeForComparison(null);
      expect(result).toBe('');
    });

    it('returns empty string for non-string input', () => {
      const result = engine._normalizeForComparison(123);
      expect(result).toBe('');
    });
  });

  describe('_createUuid', () => {
    it('uses injected createUniqueUuid function', () => {
      const uuid = engine._createUuid('test-seed');
      expect(uuid).toContain('uuid-test-seed-');
    });

    it('falls back to default UUID generation', () => {
      const engineWithoutUuid = new SelfReflectionEngine(
        { ...mockRuntime, createUniqueUuid: null },
        mockLogger,
        {}
      );
      const uuid = engineWithoutUuid._createUuid('fallback-seed');
      expect(uuid).toContain('fallback-seed:');
      expect(uuid).toContain(':');
    });

    it('generates unique UUIDs for different seeds', () => {
      const uuid1 = engine._createUuid('seed1');
      const uuid2 = engine._createUuid('seed2');
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('_getLargeModelType', () => {
    it('returns a valid model type', () => {
      const modelType = engine._getLargeModelType();
      expect(modelType).toBeTruthy();
      expect(typeof modelType).toBe('string');
    });
  });

  describe('_buildInsightsSummary', () => {
    it('builds summary from complete analysis', () => {
      const analysis = {
        strengths: ['strength1', 'strength2'],
        weaknesses: ['weakness1'],
        recommendations: ['rec1', 'rec2'],
        patterns: ['pattern1'],
        improvements: ['improvement1'],
        regressions: ['regression1'],
        exampleGoodReply: 'This is a great reply!',
        exampleBadReply: 'Bad reply'
      };
      const meta = {
        generatedAt: Date.now(),
        generatedAtIso: '2025-10-05T10:00:00.000Z',
        interactionsAnalyzed: 10
      };
      
      const summary = engine._buildInsightsSummary(analysis, meta);
      
      expect(summary).toBeTruthy();
      expect(summary.strengths).toEqual(['strength1', 'strength2']);
      expect(summary.weaknesses).toEqual(['weakness1']);
      expect(summary.recommendations).toEqual(['rec1', 'rec2']);
      expect(summary.patterns).toEqual(['pattern1']);
      expect(summary.improvements).toEqual(['improvement1']);
      expect(summary.regressions).toEqual(['regression1']);
      expect(summary.exampleGoodReply).toBe('This is a great reply!');
      expect(summary.exampleBadReply).toBe('Bad reply');
      expect(summary.interactionsAnalyzed).toBe(10);
      expect(summary.generatedAtIso).toBe('2025-10-05T10:00:00.000Z');
    });

    it('returns null for empty analysis', () => {
      const analysis = {
        strengths: [],
        weaknesses: [],
        recommendations: [],
        patterns: []
      };
      const summary = engine._buildInsightsSummary(analysis);
      expect(summary).toBe(null);
    });

    it('returns null for null analysis', () => {
      const summary = engine._buildInsightsSummary(null);
      expect(summary).toBe(null);
    });

    it('returns null for non-object analysis', () => {
      const summary = engine._buildInsightsSummary('not an object');
      expect(summary).toBe(null);
    });

    it('limits lists to specified size', () => {
      const analysis = {
        strengths: ['1', '2', '3', '4', '5', '6', '7', '8']
      };
      const summary = engine._buildInsightsSummary(analysis, { limit: 3 });
      expect(summary.strengths.length).toBe(3);
    });

    it('generates ISO string from timestamp if not provided', () => {
      const timestamp = Date.parse('2025-10-05T12:00:00.000Z');
      const analysis = { strengths: ['one'] };
      const summary = engine._buildInsightsSummary(analysis, { generatedAt: timestamp });
      expect(summary.generatedAtIso).toBe('2025-10-05T12:00:00.000Z');
    });
  });

  describe('_isAgentReplyMemory', () => {
    it('identifies agent reply memory correctly', () => {
      const memory = {
        content: {
          source: 'nostr',
          text: 'This is a reply',
          inReplyTo: 'parent-id'
        }
      };
      expect(engine._isAgentReplyMemory(memory)).toBe(true);
    });

    it('rejects memory without inReplyTo', () => {
      const memory = {
        content: {
          source: 'nostr',
          text: 'This is not a reply'
        }
      };
      expect(engine._isAgentReplyMemory(memory)).toBe(false);
    });

    it('rejects memory without text', () => {
      const memory = {
        content: {
          source: 'nostr',
          inReplyTo: 'parent-id'
        }
      };
      expect(engine._isAgentReplyMemory(memory)).toBe(false);
    });

    it('rejects memory from non-nostr source', () => {
      const memory = {
        content: {
          source: 'twitter',
          text: 'Reply text',
          inReplyTo: 'parent-id'
        }
      };
      expect(engine._isAgentReplyMemory(memory)).toBe(false);
    });

    it('rejects memory without content', () => {
      const memory = {};
      expect(engine._isAgentReplyMemory(memory)).toBe(false);
    });

    it('rejects null memory', () => {
      expect(engine._isAgentReplyMemory(null)).toBe(false);
    });
  });

  describe('_inferRoleFromMemory', () => {
    const replyMemory = { id: 'reply-1', content: { text: 'my reply' } };

    it('identifies reply memory as "you"', () => {
      const result = engine._inferRoleFromMemory(replyMemory, replyMemory);
      expect(result).toBe('you');
    });

    it('identifies memory with agent pubkey as "you"', () => {
      engine.agentPubkey = 'agent-pubkey-123';
      const memory = {
        id: 'mem-1',
        content: {
          event: { pubkey: 'agent-pubkey-123' }
        }
      };
      const result = engine._inferRoleFromMemory(memory, replyMemory);
      expect(result).toBe('you');
    });

    it('identifies memory with different pubkey as "user"', () => {
      const memory = {
        id: 'mem-1',
        content: {
          event: { pubkey: 'user-pubkey-456' }
        }
      };
      const result = engine._inferRoleFromMemory(memory, replyMemory);
      expect(result).toBe('user');
    });

    it('identifies nostr memory without event as "you"', () => {
      const memory = {
        id: 'mem-1',
        content: {
          source: 'nostr',
          text: 'some text'
        }
      };
      const result = engine._inferRoleFromMemory(memory, replyMemory);
      expect(result).toBe('you');
    });

    it('identifies system memory with triggerEvent as "system"', () => {
      const memory = {
        id: 'mem-1',
        content: {
          source: 'nostr',
          data: { triggerEvent: 'some-event' }
        }
      };
      const result = engine._inferRoleFromMemory(memory, replyMemory);
      expect(result).toBe('system');
    });

    it('returns "unknown" for unidentifiable memory', () => {
      const memory = {
        id: 'mem-1',
        content: {}
      };
      const result = engine._inferRoleFromMemory(memory, replyMemory);
      expect(result).toBe('unknown');
    });

    it('returns "unknown" for null memory', () => {
      const result = engine._inferRoleFromMemory(null, replyMemory);
      expect(result).toBe('unknown');
    });
  });

  describe('_serializeInteractionSnapshot', () => {
    it('serializes complete interaction', () => {
      const interaction = {
        userMessage: 'User message here',
        yourReply: 'Agent reply here',
        engagement: 'avg=0.8',
        metadata: { pubkey: 'npub123', createdAtIso: '2025-10-05T10:00:00.000Z' },
        conversation: [
          { role: 'user', author: 'user1', text: 'Hello', createdAtIso: '2025-10-05T10:00:00.000Z', type: 'mention' }
        ],
        feedback: [
          { author: 'user2', summary: 'Great response!', createdAtIso: '2025-10-05T10:01:00.000Z' }
        ],
        signals: ['signal1: info', 'signal2: more info']
      };

      const result = engine._serializeInteractionSnapshot(interaction);

      expect(result).toBeTruthy();
      expect(result.userMessage).toBe('User message here');
      expect(result.yourReply).toBe('Agent reply here');
      expect(result.engagement).toBe('avg=0.8');
      expect(result.conversation.length).toBe(1);
      expect(result.feedback.length).toBe(1);
      expect(result.signals.length).toBe(2);
    });

    it('handles missing optional fields', () => {
      const interaction = {
        userMessage: 'Message',
        yourReply: 'Reply'
      };

      const result = engine._serializeInteractionSnapshot(interaction);

      expect(result).toBeTruthy();
      expect(result.engagement).toBe(null);
      expect(result.conversation).toEqual([]);
      expect(result.feedback).toEqual([]);
      expect(result.signals).toEqual([]);
    });

    it('truncates long text fields', () => {
      const interaction = {
        userMessage: 'a'.repeat(500),
        yourReply: 'b'.repeat(500)
      };

      const result = engine._serializeInteractionSnapshot(interaction);

      expect(result.userMessage.length).toBe(280);
      expect(result.yourReply.length).toBe(280);
    });

    it('returns null for null interaction', () => {
      const result = engine._serializeInteractionSnapshot(null);
      expect(result).toBe(null);
    });

    it('returns null for non-object interaction', () => {
      const result = engine._serializeInteractionSnapshot('not an object');
      expect(result).toBe(null);
    });
  });
});
