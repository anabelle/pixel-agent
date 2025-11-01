const { describe, it, expect } = globalThis;
const {
  buildPostPrompt,
  buildReplyPrompt,
  buildDmReplyPrompt,
  buildZapThanksPrompt,
  buildDailyDigestPostPrompt,
  buildPixelBoughtPrompt,
  buildAwarenessPostPrompt,
  extractTextFromModelResult,
  sanitizeWhitelist,
} = require('../lib/text.js');

describe('text module', () => {
  describe('extractTextFromModelResult', () => {
    it('returns empty string for null/undefined', () => {
      expect(extractTextFromModelResult(null)).toBe('');
      expect(extractTextFromModelResult(undefined)).toBe('');
    });

    it('extracts and trims string result', () => {
      expect(extractTextFromModelResult('  Hello World  ')).toBe('Hello World');
    });

    it('extracts from result.text', () => {
      expect(extractTextFromModelResult({ text: '  Response  ' })).toBe('Response');
    });

    it('extracts from result.content', () => {
      expect(extractTextFromModelResult({ content: '  Content  ' })).toBe('Content');
    });

    it('extracts from OpenAI-style choices array', () => {
      const result = {
        choices: [
          {
            message: {
              content: '  OpenAI Response  '
            }
          }
        ]
      };
      expect(extractTextFromModelResult(result)).toBe('OpenAI Response');
    });

    it('converts non-string to string', () => {
      expect(extractTextFromModelResult(123)).toBe('123');
      expect(extractTextFromModelResult({ foo: 'bar' })).toBe('[object Object]');
    });

    it('handles errors gracefully', () => {
      expect(extractTextFromModelResult({})).toBe('[object Object]');
    });
  });

  describe('sanitizeWhitelist', () => {
    it('returns empty string for falsy input', () => {
      expect(sanitizeWhitelist(null)).toBe('');
      expect(sanitizeWhitelist(undefined)).toBe('');
      expect(sanitizeWhitelist('')).toBe('');
    });

    it('preserves allowed ln.pixel.xx.kg URLs', () => {
      const text = 'Check out https://ln.pixel.xx.kg';
      expect(sanitizeWhitelist(text)).toBe('Check out https://ln.pixel.xx.kg');
    });

    it('preserves allowed pixel.xx.kg URLs', () => {
      const text = 'Visit https://pixel.xx.kg';
      expect(sanitizeWhitelist(text)).toBe('Visit https://pixel.xx.kg');
    });

    it('preserves allowed github.com/anabelle URLs', () => {
      const text = 'Code at https://github.com/anabelle/pixel';
      expect(sanitizeWhitelist(text)).toBe('Code at https://github.com/anabelle/pixel');
    });

    it('removes disallowed URLs', () => {
      const text = 'Bad link https://example.com should be removed';
      expect(sanitizeWhitelist(text)).toBe('Bad link should be removed');
    });

    it('removes multiple disallowed URLs', () => {
      const text = 'https://example.com and https://bad.com';
      expect(sanitizeWhitelist(text)).toBe('and');
    });

    it('replaces em-dashes with comma and space', () => {
      expect(sanitizeWhitelist('hello—world')).toBe('hello, world');
      expect(sanitizeWhitelist('hello–world')).toBe('hello, world');
    });

    it('normalizes multiple spaces', () => {
      expect(sanitizeWhitelist('hello    world')).toBe('hello world');
    });

    it('handles mixed URLs (allowed and disallowed)', () => {
      const text = 'Good https://ln.pixel.xx.kg bad https://evil.com more https://pixel.xx.kg';
      expect(sanitizeWhitelist(text)).toBe('Good https://ln.pixel.xx.kg bad more https://pixel.xx.kg');
    });

    it('handles http and https protocols', () => {
      expect(sanitizeWhitelist('http://example.com')).toBe('');
      expect(sanitizeWhitelist('http://ln.pixel.xx.kg')).toBe('');
      expect(sanitizeWhitelist('https://ln.pixel.xx.kg')).toBe('https://ln.pixel.xx.kg');
    });
  });

  describe('buildPostPrompt', () => {
    it('builds basic prompt with minimal character', () => {
      const prompt = buildPostPrompt({ name: 'TestBot' });
      expect(prompt).toContain('You are TestBot');
      expect(prompt).toContain('Whitelist rules');
    });

    it('includes character name in prompt', () => {
      const prompt = buildPostPrompt({ name: 'MyAgent' });
      expect(prompt).toContain('You are MyAgent');
    });

    it('defaults to "Agent" when no name provided', () => {
      const prompt = buildPostPrompt({});
      expect(prompt).toContain('You are Agent');
    });

    it('handles null character', () => {
      const prompt = buildPostPrompt(null);
      expect(prompt).toContain('You are Agent');
    });

    it('includes system persona when provided', () => {
      const prompt = buildPostPrompt({ name: 'Bot', system: 'I am a helpful assistant' });
      expect(prompt).toContain('Persona/system: I am a helpful assistant');
    });

    it('includes topics when provided', () => {
      const prompt = buildPostPrompt({ 
        name: 'Bot',
        topics: ['art', 'technology', 'philosophy']
      });
      expect(prompt).toContain('art, technology, philosophy');
    });

    it('limits topics to TOPIC_LIST_LIMIT', () => {
      const topics = Array(30).fill(0).map((_, i) => `topic${i}`);
      const prompt = buildPostPrompt({ name: 'Bot', topics });
      // Should contain some topics but not all 30
      const topicMatches = prompt.match(/topic\d+/g) || [];
      expect(topicMatches.length).toBeLessThan(30);
      expect(topicMatches.length).toBeGreaterThan(0);
    });

    it('includes style guidelines from all and post', () => {
      const prompt = buildPostPrompt({
        name: 'Bot',
        style: {
          all: ['Be concise', 'Use humor'],
          post: ['Add emojis', 'Keep it short']
        }
      });
      expect(prompt).toContain('Be concise');
      expect(prompt).toContain('Use humor');
      expect(prompt).toContain('Add emojis');
      expect(prompt).toContain('Keep it short');
    });

    it('handles missing style gracefully', () => {
      const prompt = buildPostPrompt({ name: 'Bot', style: {} });
      expect(prompt).toBeTruthy();
    });

    it('includes post examples up to 10', () => {
      const examples = ['Example 1', 'Example 2', 'Example 3'];
      const prompt = buildPostPrompt({
        name: 'Bot',
        postExamples: examples
      });
      expect(prompt).toContain('Example 1');
      expect(prompt).toContain('Example 2');
      expect(prompt).toContain('Example 3');
    });

    it('limits post examples to 10', () => {
      const examples = Array(20).fill(0).map((_, i) => `Example ${i}`);
      const prompt = buildPostPrompt({
        name: 'Bot',
        postExamples: examples
      });
      const exampleMatches = prompt.match(/Example \d+/g) || [];
      expect(exampleMatches.length).toBeLessThanOrEqual(10);
    });

    it('includes emerging stories from context data', () => {
      const contextData = {
        emergingStories: [
          {
            topic: 'AI revolution',
            mentions: 42,
            users: 15,
            sentiment: { positive: 30, neutral: 10, negative: 2 }
          }
        ]
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('AI revolution');
      expect(prompt).toContain('42');
      expect(prompt).toContain('15');
    });

    it('includes top topics from context data', () => {
      const contextData = {
        topTopics: [
          { topic: 'bitcoin', count: 100 },
          { topic: 'nostr', count: 80 }
        ]
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('nostr');
    });

    it('includes current activity from context data', () => {
      const contextData = {
        currentActivity: {
          events: 20,
          users: 10,
          topics: [{ topic: 'lightning' }]
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('20');
      expect(prompt).toContain('10');
    });

    it('includes timeline lore from context data', () => {
      const contextData = {
        timelineLore: [
          {
            headline: 'Community celebrates milestone',
            insights: ['Great engagement', 'Positive vibes']
          }
        ]
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('TIMELINE LORE');
      expect(prompt).toContain('Community celebrates milestone');
    });

    it('includes tone trend from context data', () => {
      const contextData = {
        toneTrend: {
          detected: true,
          shift: 'positive',
          timespan: '24h'
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('MOOD SHIFT DETECTED');
      expect(prompt).toContain('positive');
    });

    it('includes stable mood from context data', () => {
      const contextData = {
        toneTrend: {
          stable: true,
          tone: 'optimistic',
          duration: '3 days'
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('MOOD STABLE');
      expect(prompt).toContain('optimistic');
    });

    it('includes reflection strengths', () => {
      const reflection = {
        strengths: ['Clear communication', 'Engaging tone'],
        weaknesses: ['Too verbose'],
        recommendations: ['Be more concise']
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('SELF-REFLECTION');
      expect(prompt).toContain('Clear communication');
      expect(prompt).toContain('Engaging tone');
    });

    it('includes reflection weaknesses', () => {
      const reflection = {
        weaknesses: ['Too verbose', 'Repetitive']
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('Too verbose');
      expect(prompt).toContain('Repetitive');
    });

    it('includes reflection patterns', () => {
      const reflection = {
        patterns: ['Starting with "Ah"', 'Overusing emojis']
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('Starting with "Ah"');
    });

    it('includes good and bad reply examples from reflection', () => {
      const reflection = {
        exampleGoodReply: 'This was a great response',
        exampleBadReply: 'This was a poor response'
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('This was a great response');
      expect(prompt).toContain('This was a poor response');
    });

    it('formats reflection timestamp from ISO string', () => {
      const reflection = {
        generatedAtIso: '2023-10-15T12:00:00Z',
        strengths: ['Good']
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('2023-10-15T12:00:00Z');
    });

    it('formats reflection timestamp from number', () => {
      const reflection = {
        generatedAt: 1697371200000,
        strengths: ['Good']
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, reflection);
      expect(prompt).toContain('T');
    });

    it('handles scheduled post option', () => {
      const options = { isScheduled: true };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, null, options);
      expect(prompt).toContain('Scheduled mode');
      expect(prompt).toContain('Awareness mandate');
    });

    it('handles non-scheduled post', () => {
      const options = { isScheduled: false };
      const prompt = buildPostPrompt({ name: 'Bot' }, null, null, options);
      expect(prompt).not.toContain('Scheduled mode');
    });

    it('includes context hints when available', () => {
      const contextData = {
        topTopics: [{ topic: 'bitcoin', count: 50 }],
        recentDigest: {
          metrics: {
            events: 100,
            activeUsers: 25,
            topTopics: [{ topic: 'lightning' }]
          }
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('CONTEXT HINTS');
    });

    it('includes watchlist items in context hints', () => {
      const contextData = {
        watchlistState: {
          items: ['topic1', 'topic2', 'topic3']
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('watch:');
    });

    it('includes daily narrative in context hints', () => {
      const contextData = {
        dailyNarrative: {
          summary: 'Community focused on innovation'
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('daily:');
    });

    it('includes weekly narrative in context hints', () => {
      const contextData = {
        weeklyNarrative: {
          summary: 'Week of growth'
        }
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('weekly:');
    });

    it('handles empty context data gracefully', () => {
      const prompt = buildPostPrompt({ name: 'Bot' }, {});
      expect(prompt).toBeTruthy();
    });

    it('includes sample content from top topics', () => {
      const contextData = {
        topTopics: [
          {
            topic: 'bitcoin',
            count: 50,
            sample: { content: 'Sample post about bitcoin' }
          }
        ]
      };
      const prompt = buildPostPrompt({ name: 'Bot' }, contextData);
      expect(prompt).toContain('Sample post about bitcoin');
    });
  });

  describe('buildReplyPrompt', () => {
    const mockEvent = {
      id: 'event123',
      pubkey: 'pubkey123',
      content: 'Hello, how are you?'
    };

    it('builds basic reply prompt', () => {
      const prompt = buildReplyPrompt({ name: 'Bot' }, mockEvent, []);
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('Hello, how are you?');
    });

    it('includes character system in prompt', () => {
      const prompt = buildReplyPrompt(
        { name: 'Bot', system: 'Helpful assistant' },
        mockEvent,
        []
      );
      expect(prompt).toContain('Persona/system: Helpful assistant');
    });

    it('includes style guidelines from all and chat', () => {
      const prompt = buildReplyPrompt(
        {
          name: 'Bot',
          style: {
            all: ['Be helpful'],
            chat: ['Be conversational']
          }
        },
        mockEvent,
        []
      );
      expect(prompt).toContain('Be helpful');
      expect(prompt).toContain('Be conversational');
    });

    it('includes recent conversation history', () => {
      const messages = [
        { role: 'user', text: 'Hi there' },
        { role: 'agent', text: 'Hello!' }
      ];
      const prompt = buildReplyPrompt({ name: 'Bot' }, mockEvent, messages);
      expect(prompt).toContain('Recent conversation');
      expect(prompt).toContain('Hi there');
      expect(prompt).toContain('Hello!');
    });

    it('handles empty message history', () => {
      const prompt = buildReplyPrompt({ name: 'Bot' }, mockEvent, []);
      expect(prompt).toBeTruthy();
    });

    it('includes thread context when available', () => {
      const threadContext = {
        thread: [
          { id: 'msg1', pubkey: 'user1', content: 'First message' },
          { id: 'event123', pubkey: 'user2', content: 'Target message' }
        ],
        isRoot: false,
        contextQuality: 0.9
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        threadContext
      );
      expect(prompt).toContain('Thread Context');
      expect(prompt).toContain('First message');
      expect(prompt).toContain('TARGET');
    });

    it('identifies root posts in thread context', () => {
      const threadContext = {
        thread: [
          { id: 'event123', pubkey: 'user1', content: 'Hello, how are you?' },
          { id: 'event456', pubkey: 'user2', content: 'Another message' }
        ],
        isRoot: true,
        contextQuality: 1.0
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        threadContext
      );
      expect(prompt).toContain('root post');
    });

    it('includes image context when available', () => {
      const imageContext = {
        imageDescriptions: ['A sunset over mountains', 'A city skyline']
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        imageContext
      );
      expect(prompt).toContain('Image Context');
      expect(prompt).toContain('sunset over mountains');
      expect(prompt).toContain('city skyline');
    });

    it('includes narrative context when available', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Community discussing AI developments'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('COMMUNITY NARRATIVE CONTEXT');
      expect(prompt).toContain('AI developments');
    });

    it('includes emerging stories from narrative context', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Summary',
        emergingStories: [
          {
            topic: 'Bitcoin scaling',
            mentions: 50,
            users: 20,
            recentEvents: [
              { content: 'Recent discussion about scaling solutions' }
            ]
          }
        ]
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('Bitcoin scaling');
      expect(prompt).toContain('50 mentions');
    });

    it('includes historical insights from narrative context', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Summary',
        historicalInsights: {
          topicChanges: {
            emerging: ['lightning', 'privacy']
          },
          eventTrend: {
            change: 45
          }
        }
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('NEW TOPICS EMERGING');
      expect(prompt).toContain('lightning');
      expect(prompt).toContain('ACTIVITY ALERT');
    });

    it('includes topic evolution from narrative context', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Summary',
        topicEvolution: {
          topic: 'bitcoin',
          trend: 'rising',
          summary: 'Growing interest'
        }
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('TOPIC MOMENTUM');
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('rising');
    });

    it('includes similar moments from narrative context', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Summary',
        similarMoments: [
          {
            date: '2023-09-15',
            summary: 'Similar discussion happened before'
          }
        ]
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('DÉJÀ VU');
      expect(prompt).toContain('2023-09-15');
    });

    it('includes user profile context when available', () => {
      const userProfile = {
        totalInteractions: 15,
        relationshipDepth: 'regular',
        topInterests: ['bitcoin', 'art'],
        dominantSentiment: 'positive'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        userProfile
      );
      expect(prompt).toContain('USER CONTEXT');
      expect(prompt).toContain('regular');
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('positive');
    });

    it('handles familiar relationship depth', () => {
      const userProfile = {
        totalInteractions: 5,
        relationshipDepth: 'familiar'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        userProfile
      );
      expect(prompt).toContain('chatted with this person a few times');
    });

    it('handles new connection relationship', () => {
      const userProfile = {
        totalInteractions: 1,
        relationshipDepth: 'new'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        userProfile
      );
      expect(prompt).toContain('new connection');
    });

    it('includes author posts section when provided', () => {
      const authorPostsSection = 'Recent posts about technology';
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        authorPostsSection
      );
      expect(prompt).toContain('AUTHOR CONTEXT');
      expect(prompt).toContain('Recent posts about technology');
    });

    it('includes proactive insight when available', () => {
      const proactiveInsight = {
        message: 'This user often asks about scaling',
        type: 'pattern',
        priority: 'high'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        null,
        proactiveInsight
      );
      expect(prompt).toContain('PROACTIVE INSIGHT');
      expect(prompt).toContain('scaling');
      expect(prompt).toContain('🔥');
    });

    it('includes medium priority proactive insight', () => {
      const proactiveInsight = {
        message: 'Pattern detected',
        type: 'trend',
        priority: 'medium'
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        null,
        proactiveInsight
      );
      expect(prompt).toContain('📈');
    });

    it('includes self-reflection when available', () => {
      const selfReflection = {
        strengths: ['Clear'],
        weaknesses: ['Verbose'],
        recommendations: ['Be concise'],
        patterns: ['Repetitive']
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        null,
        null,
        selfReflection
      );
      expect(prompt).toContain('SELF-REFLECTION');
      expect(prompt).toContain('Clear');
      expect(prompt).toContain('Verbose');
    });

    it('includes timeline lore section when provided', () => {
      const timelineLoreSection = 'Community lore content';
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        timelineLoreSection
      );
      expect(prompt).toContain('TIMELINE LORE');
      expect(prompt).toContain('Community lore content');
    });

    it('includes lore continuity evolution when available', () => {
      const loreContinuity = {
        hasEvolution: true,
        recurringThemes: ['privacy', 'freedom'],
        priorityTrend: 'escalating',
        watchlistFollowUp: ['bitcoin'],
        toneProgression: { from: 'neutral', to: 'optimistic' },
        emergingThreads: ['lightning']
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        loreContinuity
      );
      expect(prompt).toContain('LORE EVOLUTION');
      expect(prompt).toContain('privacy');
      expect(prompt).toContain('escalating');
    });

    it('includes context hints when narrative context has data', () => {
      const narrativeContext = {
        hasContext: true,
        summary: 'Summary',
        emergingStories: [{ topic: 'bitcoin' }],
        topicEvolution: { trend: 'rising', topic: 'lightning' }
      };
      const prompt = buildReplyPrompt(
        { name: 'Bot' },
        mockEvent,
        [],
        null,
        null,
        narrativeContext
      );
      expect(prompt).toContain('CONTEXT HINTS');
    });

    it('truncates long event content', () => {
      const longEvent = {
        id: 'event123',
        content: 'A'.repeat(1000)
      };
      const prompt = buildReplyPrompt({ name: 'Bot' }, longEvent, []);
      expect(prompt.length).toBeLessThan(10000);
    });

    it('handles missing event content', () => {
      const evt = { id: 'event123' };
      const prompt = buildReplyPrompt({ name: 'Bot' }, evt, []);
      expect(prompt).toBeTruthy();
    });
  });

  describe('buildDmReplyPrompt', () => {
    const mockEvent = {
      id: 'dm123',
      content: 'Private message'
    };

    it('builds basic DM reply prompt', () => {
      const prompt = buildDmReplyPrompt({ name: 'Bot' }, mockEvent, []);
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('direct message');
      expect(prompt).toContain('Private message');
    });

    it('includes DM-specific whitelist rules', () => {
      const prompt = buildDmReplyPrompt({ name: 'Bot' }, mockEvent, []);
      expect(prompt).toContain('Whitelist rules (DM)');
    });

    it('includes style guidelines from all and chat', () => {
      const prompt = buildDmReplyPrompt(
        {
          name: 'Bot',
          style: {
            all: ['Be helpful'],
            chat: ['Be concise']
          }
        },
        mockEvent,
        []
      );
      expect(prompt).toContain('Be helpful');
      expect(prompt).toContain('Be concise');
    });

    it('includes DM conversation history', () => {
      const messages = [
        { role: 'user', text: 'Hello' },
        { role: 'agent', text: 'Hi!' }
      ];
      const prompt = buildDmReplyPrompt({ name: 'Bot' }, mockEvent, messages);
      expect(prompt).toContain('Recent DM context');
      expect(prompt).toContain('Hello');
    });

    it('limits post examples to 8 in DMs', () => {
      const examples = Array(15).fill(0).map((_, i) => `Example ${i}`);
      const prompt = buildDmReplyPrompt(
        { name: 'Bot', postExamples: examples },
        mockEvent,
        []
      );
      const exampleMatches = prompt.match(/Example \d+/g) || [];
      expect(exampleMatches.length).toBeLessThanOrEqual(8);
    });

    it('emphasizes short and private focus', () => {
      const prompt = buildDmReplyPrompt({ name: 'Bot' }, mockEvent, []);
      expect(prompt).toContain('extra short');
      expect(prompt).toContain('private');
    });
  });

  describe('buildZapThanksPrompt', () => {
    it('builds basic zap thanks prompt', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 21000, null);
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('zapped you');
      expect(prompt).toContain('21 sats');
    });

    it('handles null amount', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, null, null);
      expect(prompt).toContain('some sats');
    });

    it('categorizes very large zaps', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 10000000, null);
      expect(prompt).toContain('very large zap');
    });

    it('categorizes substantial zaps', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 1000000, null);
      expect(prompt).toContain('substantial zap');
    });

    it('categorizes nice zaps', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 100000, null);
      expect(prompt).toContain('nice zap');
    });

    it('categorizes small zaps', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 50000, null);
      expect(prompt).toContain('small but appreciated');
    });

    it('includes sender info when provided', () => {
      const senderInfo = { pubkey: 'sender123' };
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 21000, senderInfo);
      expect(prompt).toContain('known community member');
    });

    it('handles anonymous zaps', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 21000, null);
      expect(prompt).toContain('anonymous supporter');
    });

    it('includes character post examples', () => {
      const prompt = buildZapThanksPrompt(
        {
          name: 'Bot',
          postExamples: ['Thanks!', 'Grateful!']
        },
        21000,
        null
      );
      expect(prompt).toContain('Character examples');
      expect(prompt).toContain('Thanks!');
    });

    it('includes static format examples', () => {
      const prompt = buildZapThanksPrompt({ name: 'Bot' }, 21000, null);
      expect(prompt).toContain('⚡️');
      expect(prompt).toContain('sats!');
    });

    it('limits examples to 8', () => {
      const examples = Array(15).fill(0).map((_, i) => `Thanks ${i}`);
      const prompt = buildZapThanksPrompt(
        { name: 'Bot', postExamples: examples },
        21000,
        null
      );
      const exampleMatches = prompt.match(/Thanks \d+/g) || [];
      expect(exampleMatches.length).toBeLessThanOrEqual(8);
    });
  });

  describe('buildDailyDigestPostPrompt', () => {
    it('builds basic daily digest prompt', () => {
      const report = {
        summary: {},
        narrative: {}
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('community pulse');
    });

    it('includes top topics from summary', () => {
      const report = {
        summary: {
          topTopics: [
            { topic: 'bitcoin', count: 100 },
            { topic: 'nostr', count: 80 }
          ]
        },
        narrative: {}
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('100');
    });

    it('includes emerging stories from summary', () => {
      const report = {
        summary: {
          emergingStories: [
            { topic: 'lightning', mentions: 50 }
          ]
        },
        narrative: {}
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('lightning');
      expect(prompt).toContain('50');
    });

    it('includes metrics from summary', () => {
      const report = {
        summary: {
          totalEvents: 500,
          activeUsers: 150,
          eventsPerUser: 3.3
        },
        narrative: {}
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('500');
      expect(prompt).toContain('150');
    });

    it('includes sentiment from summary', () => {
      const report = {
        summary: {
          overallSentiment: {
            positive: 200,
            neutral: 50,
            negative: 10
          }
        },
        narrative: {}
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('200');
      expect(prompt).toContain('50');
      expect(prompt).toContain('10');
    });

    it('includes narrative headline', () => {
      const report = {
        summary: {},
        narrative: {
          headline: 'Community celebrates new milestone'
        }
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('Community celebrates new milestone');
    });

    it('includes narrative summary', () => {
      const report = {
        summary: {},
        narrative: {
          summary: 'Active discussions about technology'
        }
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('Active discussions about technology');
    });

    it('includes key moments', () => {
      const report = {
        summary: {},
        narrative: {
          keyMoments: ['Milestone reached', 'New feature launched']
        }
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('Milestone reached');
      expect(prompt).toContain('New feature launched');
    });

    it('includes communities', () => {
      const report = {
        summary: {},
        narrative: {
          communities: ['Bitcoin', 'Nostr', 'Lightning']
        }
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('Bitcoin');
      expect(prompt).toContain('Nostr');
    });

    it('includes vibe and arc', () => {
      const report = {
        summary: {},
        narrative: {
          vibe: 'Optimistic',
          arc: 'Rising interest in technology',
          tomorrow: 'Continued growth expected'
        }
      };
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, report);
      expect(prompt).toContain('Optimistic');
      expect(prompt).toContain('Rising interest');
    });

    it('handles empty report gracefully', () => {
      const prompt = buildDailyDigestPostPrompt({ name: 'Bot' }, {});
      expect(prompt).toBeTruthy();
    });
  });

  describe('buildPixelBoughtPrompt', () => {
    it('builds prompt for single pixel purchase', () => {
      const activity = {
        x: 10,
        y: 20,
        letter: 'A',
        color: '#ff0000',
        sats: 21
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('(10,20)');
      expect(prompt).toContain('letter "A"');
      expect(prompt).toContain('#ff0000');
      expect(prompt).toContain('21 sats');
    });

    it('handles missing coordinates', () => {
      const activity = {
        letter: 'B',
        sats: 21
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('letter "B"');
      // Note: Prompt may still contain '(' from examples, just verify it doesn't have coords
      const coordsMatch = prompt.match(/at \(\d+,\d+\)/);
      if (coordsMatch) {
        throw new Error('Should not contain coordinate pattern "at (x,y)"');
      }
    });

    it('handles missing letter', () => {
      const activity = {
        x: 5,
        y: 10,
        sats: 21
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('a pixel');
    });

    it('handles missing color', () => {
      const activity = {
        letter: 'C',
        sats: 21
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).not.toContain('with color');
    });

    it('handles bulk purchase with pixel count', () => {
      const activity = {
        type: 'bulk_purchase',
        pixelCount: 100,
        totalSats: 2100
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('BULK PURCHASE');
      expect(prompt).toContain('100');
      expect(prompt).toContain('2100');
    });

    it('handles bulk purchase with summary', () => {
      const activity = {
        type: 'bulk_purchase',
        summary: '50 pixels purchased',
        totalSats: 1050
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('BULK PURCHASE');
      expect(prompt).toContain('50');
    });

    it('parses pixel count from summary text', () => {
      const activity = {
        type: 'bulk_purchase',
        summary: 'User purchased 75 pixels'
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('75');
    });

    it('includes bulk-specific guidance', () => {
      const activity = {
        type: 'bulk_purchase',
        pixelCount: 200
      };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('explosion');
    });

    it('includes post examples', () => {
      const activity = { letter: 'X', sats: 21 };
      const prompt = buildPixelBoughtPrompt(
        {
          name: 'Bot',
          postExamples: ['Example 1', 'Example 2']
        },
        activity
      );
      expect(prompt).toContain('Example 1');
    });

    it('limits examples to 8', () => {
      const activity = { letter: 'Y', sats: 21 };
      const examples = Array(15).fill(0).map((_, i) => `Ex ${i}`);
      const prompt = buildPixelBoughtPrompt(
        { name: 'Bot', postExamples: examples },
        activity
      );
      const exampleMatches = prompt.match(/Ex \d+/g) || [];
      expect(exampleMatches.length).toBeLessThanOrEqual(8);
    });

    it('handles zero sats', () => {
      const activity = { letter: 'Z', sats: 0 };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('0 sats');
    });

    it('handles missing sats', () => {
      const activity = { letter: 'W' };
      const prompt = buildPixelBoughtPrompt({ name: 'Bot' }, activity);
      expect(prompt).toContain('some sats');
    });
  });

  describe('buildAwarenessPostPrompt', () => {
    it('builds basic awareness prompt', () => {
      const prompt = buildAwarenessPostPrompt({ name: 'Bot' });
      expect(prompt).toContain('You are Bot');
      expect(prompt).toContain('pure awareness');
    });

    it('includes style guidelines', () => {
      const prompt = buildAwarenessPostPrompt({
        name: 'Bot',
        style: {
          all: ['Be thoughtful'],
          post: ['Be reflective']
        }
      });
      expect(prompt).toContain('Be thoughtful');
      expect(prompt).toContain('Be reflective');
    });

    it('includes emerging stories from context', () => {
      const contextData = {
        emergingStories: [{ topic: 'innovation' }]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('innovation');
    });

    it('includes top topics from context', () => {
      const contextData = {
        topTopics: [
          { topic: 'bitcoin', count: 50 },
          { topic: 'lightning', count: 30 }
        ]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('bitcoin');
      expect(prompt).toContain('lightning');
    });

    it('includes sample content from top topics', () => {
      const contextData = {
        topTopics: [
          {
            topic: 'nostr',
            sample: { content: 'Great discussion about nostr' }
          }
        ]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Great discussion');
    });

    it('includes current activity vibe', () => {
      const contextData = {
        currentActivity: { events: 15 }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('alive');
    });

    it('detects quiet activity', () => {
      const contextData = {
        currentActivity: { events: 3 }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('quiet');
    });

    it('includes tone trend when detected', () => {
      const contextData = {
        toneTrend: {
          detected: true,
          shift: 'optimistic'
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Mood shift');
      expect(prompt).toContain('optimistic');
    });

    it('includes stable mood', () => {
      const contextData = {
        toneTrend: {
          stable: true,
          tone: 'reflective'
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Mood steady');
      expect(prompt).toContain('reflective');
    });

    it('includes timeline lore', () => {
      const contextData = {
        timelineLore: [
          {
            headline: 'Community milestone',
            insights: ['Great engagement'],
            watchlist: ['topic1']
          }
        ]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('TIMELINE LORE');
      expect(prompt).toContain('Community milestone');
    });

    it('includes recent digest headline', () => {
      const contextData = {
        recentDigest: {
          headline: 'Active day for the community'
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Active day');
    });

    it('handles legacy digest array format', () => {
      const contextData = {
        recentDigest: [
          { headline: 'Legacy headline' }
        ]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Legacy headline');
    });

    it('includes topic evolution momentum', () => {
      const contextData = {
        topicEvolution: {
          trend: 'rising',
          summary: 'Growing interest'
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('rising');
    });

    it('includes similar moments', () => {
      const contextData = {
        similarMoments: [
          {
            date: '2023-08-20',
            summary: 'Similar vibe detected'
          }
        ]
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('2023-08-20');
    });

    it('includes daily narrative', () => {
      const contextData = {
        dailyNarrative: {
          narrative: { summary: 'Day of innovation' }
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Day of innovation');
    });

    it('includes weekly narrative', () => {
      const contextData = {
        weeklyNarrative: {
          narrative: { summary: 'Week of growth' }
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Week of growth');
    });

    it('includes monthly narrative', () => {
      const contextData = {
        monthlyNarrative: {
          narrative: { summary: 'Month of transformation' }
        }
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        contextData
      );
      expect(prompt).toContain('Month of transformation');
    });

    it('includes lore continuity arc', () => {
      const loreContinuity = {
        hasEvolution: true,
        summary: 'Ongoing narrative arc'
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        null,
        null,
        null,
        loreContinuity
      );
      expect(prompt).toContain('Arc:');
      expect(prompt).toContain('Ongoing narrative arc');
    });

    it('includes optional topic hint', () => {
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        null,
        null,
        'bitcoin scaling'
      );
      expect(prompt).toContain('bitcoin scaling');
    });

    it('includes reflection strengths', () => {
      const reflection = {
        strengths: ['Insightful', 'Concise']
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        null,
        reflection
      );
      expect(prompt).toContain('Insightful');
    });

    it('includes reflection patterns', () => {
      const reflection = {
        patterns: ['Repetitive phrasing']
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        null,
        reflection
      );
      expect(prompt).toContain('Repetitive phrasing');
    });

    it('limits reflection to 2 strengths and 1 pattern', () => {
      const reflection = {
        strengths: ['S1', 'S2', 'S3', 'S4'],
        patterns: ['P1', 'P2', 'P3']
      };
      const prompt = buildAwarenessPostPrompt(
        { name: 'Bot' },
        null,
        reflection
      );
      const strengthMatches = prompt.match(/S\d/g) || [];
      const patternMatches = prompt.match(/P\d/g) || [];
      expect(strengthMatches.length).toBeLessThanOrEqual(2);
      expect(patternMatches.length).toBeLessThanOrEqual(1);
    });

    it('emphasizes no links or hashtags', () => {
      const prompt = buildAwarenessPostPrompt({ name: 'Bot' });
      expect(prompt).toContain('No links');
      expect(prompt).toContain('No hashtags');
    });
  });
});
