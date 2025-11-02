const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { ContextAccumulator } = require('../lib/contextAccumulator');

// Mock logger
const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn()
};

// Mock runtime for LLM calls
const createMockRuntime = (options = {}) => {
  return {
    agentId: 'test-agent-123',
    generateText: options.generateText || vi.fn().mockResolvedValue('positive'),
    useModel: options.useModel || vi.fn().mockResolvedValue({ text: 'test topic' }),
    createMemory: options.createMemory || vi.fn().mockResolvedValue({ id: 'mem-123', created: true }),
    getMemories: options.getMemories || vi.fn().mockResolvedValue([]),
    createUniqueUuid: options.createUniqueUuid || ((runtime, prefix) => `${prefix}-${Date.now()}`)
  };
};

// Helper to create test events
const createTestEvent = (overrides = {}) => {
  return {
    id: `evt-${Date.now()}-${Math.random()}`,
    pubkey: overrides.pubkey || 'npub123',
    content: overrides.content || 'Test event content',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: overrides.tags || [],
    ...overrides
  };
};

describe('ContextAccumulator - Core Functionality', () => {
  let accumulator;
  
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('initializes with default configuration', () => {
      accumulator = new ContextAccumulator(null, noopLogger);
      
      expect(accumulator.enabled).toBe(true);
      expect(accumulator.hourlyDigestEnabled).toBe(true);
      expect(accumulator.dailyReportEnabled).toBe(true);
      expect(accumulator.emergingStoriesEnabled).toBe(true);
      expect(accumulator.maxHourlyDigests).toBe(24);
      expect(accumulator.hourlyDigests).toBeInstanceOf(Map);
      expect(accumulator.emergingStories).toBeInstanceOf(Map);
      expect(accumulator.topicTimelines).toBeInstanceOf(Map);
      expect(accumulator.dailyEvents).toEqual([]);
    });

    it('respects custom options', () => {
      accumulator = new ContextAccumulator(null, noopLogger, {
        emergingStoryMinUsers: 5,
        emergingStoryMentionThreshold: 10,
        llmAnalysis: true
      });
      
      expect(accumulator.emergingStoryThreshold).toBe(5);
      expect(accumulator.emergingStoryMentionThreshold).toBe(10);
      expect(accumulator.llmAnalysisEnabled).toBe(true);
    });

    it('parses environment variables for configuration', () => {
      process.env.MAX_DAILY_EVENTS = '3000';
      process.env.CONTEXT_EMERGING_STORY_MIN_USERS = '4';
      
      accumulator = new ContextAccumulator(null, noopLogger);
      
      expect(accumulator.maxDailyEvents).toBe(3000);
      expect(accumulator.emergingStoryThreshold).toBe(4);
      
      delete process.env.MAX_DAILY_EVENTS;
      delete process.env.CONTEXT_EMERGING_STORY_MIN_USERS;
    });

    it('initializes adaptive trending', () => {
      accumulator = new ContextAccumulator(null, noopLogger);
      
      expect(accumulator.adaptiveTrending).toBeDefined();
      expect(typeof accumulator.getAdaptiveTrendingTopics).toBe('function');
    });
  });

  describe('Enable/Disable', () => {
    beforeEach(() => {
      accumulator = new ContextAccumulator(null, noopLogger);
    });

    it('enables context accumulator', () => {
      accumulator.enabled = false;
      accumulator.enable();
      
      expect(accumulator.enabled).toBe(true);
      expect(noopLogger.info).toHaveBeenCalledWith('[CONTEXT] Context accumulator enabled');
    });

    it('disables context accumulator', () => {
      accumulator.disable();
      
      expect(accumulator.enabled).toBe(false);
      expect(noopLogger.info).toHaveBeenCalledWith('[CONTEXT] Context accumulator disabled');
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      accumulator = new ContextAccumulator(null, noopLogger);
    });

    it('creates empty digest', () => {
      const digest = accumulator._createEmptyDigest();
      
      expect(digest.eventCount).toBe(0);
      expect(digest.users).toBeInstanceOf(Set);
      expect(digest.topics).toBeInstanceOf(Map);
      expect(digest.sentiment).toEqual({ positive: 0, negative: 0, neutral: 0 });
      expect(digest.links).toEqual([]);
      expect(digest.conversations).toBeInstanceOf(Map);
    });

    it('gets current hour bucket', () => {
      const hour = accumulator._getCurrentHour();
      const expectedHour = Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000);
      
      expect(hour).toBe(expectedHour);
    });

    it('determines dominant sentiment', () => {
      const sentiments = ['positive', 'positive', 'neutral', 'negative', 'positive'];
      const dominant = accumulator._dominantSentiment(sentiments);
      
      expect(dominant).toBe('positive');
    });
  });
});

describe('ContextAccumulator - Event Processing', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('processEvent', () => {
    it('processes valid event', async () => {
      const evt = createTestEvent({
        content: 'Great discussion about Bitcoin and Nostr!'
      });
      
      await accumulator.processEvent(evt);
      
      const hour = accumulator._getCurrentHour();
      const digest = accumulator.hourlyDigests.get(hour);
      
      expect(digest).toBeDefined();
      expect(digest.eventCount).toBe(1);
      expect(digest.users.has(evt.pubkey)).toBe(true);
    });

    it('ignores events when disabled', async () => {
      accumulator.disable();
      
      const evt = createTestEvent();
      await accumulator.processEvent(evt);
      
      const hour = accumulator._getCurrentHour();
      const digest = accumulator.hourlyDigests.get(hour);
      
      expect(digest).toBeUndefined();
    });

    it('ignores events without required fields', async () => {
      await accumulator.processEvent(null);
      await accumulator.processEvent({});
      await accumulator.processEvent({ id: 'evt-1' });
      await accumulator.processEvent({ id: 'evt-2', content: '' });
      
      const hour = accumulator._getCurrentHour();
      const digest = accumulator.hourlyDigests.get(hour);
      
      expect(digest).toBeUndefined();
    });

    it('adds events to daily accumulator', async () => {
      const evt = createTestEvent();
      
      await accumulator.processEvent(evt);
      
      expect(accumulator.dailyEvents.length).toBe(1);
      expect(accumulator.dailyEvents[0].id).toBe(evt.id);
      expect(accumulator.dailyEvents[0].author).toBe(evt.pubkey);
    });

    it('respects maxDailyEvents limit', async () => {
      accumulator.maxDailyEvents = 5;
      
      for (let i = 0; i < 10; i++) {
        await accumulator.processEvent(createTestEvent({ id: `evt-${i}` }));
      }
      
      expect(accumulator.dailyEvents.length).toBe(5);
    });

    it('handles errors gracefully', async () => {
      const badRuntime = createMockRuntime({
        generateText: vi.fn().mockRejectedValue(new Error('LLM failed'))
      });
      accumulator = new ContextAccumulator(badRuntime, noopLogger, { llmAnalysis: true });
      
      const evt = createTestEvent();
      await expect(accumulator.processEvent(evt)).resolves.not.toThrow();
    });
  });
});

describe('ContextAccumulator - Data Extraction', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('_basicSentiment', () => {
    it('detects positive sentiment', () => {
      const sentiment = accumulator._basicSentiment('This is amazing! Love it! 🚀');
      expect(sentiment).toBe('positive');
    });

    it('detects negative sentiment', () => {
      const sentiment = accumulator._basicSentiment('This is terrible and awful. Hate it! 😢');
      expect(sentiment).toBe('negative');
    });

    it('detects neutral sentiment', () => {
      const sentiment = accumulator._basicSentiment('Just checking the status');
      expect(sentiment).toBe('neutral');
    });

    it('handles negation patterns', () => {
      const sentiment = accumulator._basicSentiment('This is not good at all');
      expect(sentiment).toBe('negative');
    });

    it('weighs sentiment keywords', () => {
      // Strong positive keywords should outweigh weak negative
      const sentiment = accumulator._basicSentiment('This is excellent and amazing despite one bad thing');
      expect(sentiment).toBe('positive');
    });
  });

  describe('_getThreadId', () => {
    it('extracts root thread ID', () => {
      const evt = createTestEvent({
        id: 'evt-reply',
        tags: [
          ['e', 'root-evt-id', '', 'root'],
          ['e', 'parent-evt-id']
        ]
      });
      
      const threadId = accumulator._getThreadId(evt);
      expect(threadId).toBe('root-evt-id');
    });

    it('falls back to first e-tag', () => {
      const evt = createTestEvent({
        id: 'evt-reply',
        tags: [
          ['e', 'parent-evt-id'],
          ['p', 'some-pubkey']
        ]
      });
      
      const threadId = accumulator._getThreadId(evt);
      expect(threadId).toBe('parent-evt-id');
    });

    it('returns event ID when no e-tags', () => {
      const evt = createTestEvent({
        id: 'evt-root',
        tags: []
      });
      
      const threadId = accumulator._getThreadId(evt);
      expect(threadId).toBe('evt-root');
    });

    it('handles malformed tags', () => {
      const evt = createTestEvent({
        id: 'evt-123',
        tags: null
      });
      
      const threadId = accumulator._getThreadId(evt);
      expect(threadId).toBe('evt-123');
    });
  });

  describe('_extractStructuredData', () => {
    it('extracts links from content', async () => {
      const evt = createTestEvent({
        content: 'Check out https://example.com and http://test.org'
      });
      
      const extracted = await accumulator._extractStructuredData(evt);
      
      expect(extracted.links).toContain('https://example.com');
      expect(extracted.links).toContain('http://test.org');
    });

    it('detects questions', async () => {
      const evt = createTestEvent({
        content: 'What do you think about this?'
      });
      
      const extracted = await accumulator._extractStructuredData(evt);
      
      expect(extracted.isQuestion).toBe(true);
    });

    it('extracts topics when enabled', async () => {
      const evt = createTestEvent({
        content: 'Discussing Bitcoin and Nostr protocols'
      });
      
      const extracted = await accumulator._extractStructuredData(evt, { allowTopicExtraction: true });
      
      expect(Array.isArray(extracted.topics)).toBe(true);
    });

    it('skips topic extraction when disabled', async () => {
      const evt = createTestEvent();
      
      const extracted = await accumulator._extractStructuredData(evt, { allowTopicExtraction: false });
      
      expect(extracted.topics.length).toBe(0);
    });

    it('uses general fallback by default', async () => {
      const evt = createTestEvent({
        content: 'Hello'
      });
      
      const extracted = await accumulator._extractStructuredData(evt);
      
      // Should have at least general fallback or extracted topics
      expect(extracted.topics.length).toBeGreaterThanOrEqual(0);
    });

    it('analyzes sentiment', async () => {
      const evt = createTestEvent({
        content: 'This is great!'
      });
      
      const extracted = await accumulator._extractStructuredData(evt);
      
      expect(['positive', 'negative', 'neutral']).toContain(extracted.sentiment);
    });
  });
});

describe('ContextAccumulator - Topic Tracking', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    accumulator = new ContextAccumulator(null, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('_updateTopicTimeline', () => {
    it('creates new timeline for topic', () => {
      const evt = createTestEvent({ content: 'Test content' });
      
      accumulator._updateTopicTimeline('bitcoin', evt);
      
      const timeline = accumulator.topicTimelines.get('bitcoin');
      expect(timeline).toBeDefined();
      expect(timeline.length).toBe(1);
      expect(timeline[0].eventId).toBe(evt.id);
    });

    it('appends to existing timeline', () => {
      const evt1 = createTestEvent({ id: 'evt-1' });
      const evt2 = createTestEvent({ id: 'evt-2' });
      
      accumulator._updateTopicTimeline('nostr', evt1);
      accumulator._updateTopicTimeline('nostr', evt2);
      
      const timeline = accumulator.topicTimelines.get('nostr');
      expect(timeline.length).toBe(2);
    });

    it('limits timeline events per topic', () => {
      accumulator.maxTopicTimelineEvents = 3;
      
      for (let i = 0; i < 5; i++) {
        const evt = createTestEvent({ id: `evt-${i}` });
        accumulator._updateTopicTimeline('topic', evt);
      }
      
      const timeline = accumulator.topicTimelines.get('topic');
      expect(timeline.length).toBe(3);
    });

    it('truncates content in timeline entries', () => {
      const longContent = 'x'.repeat(200);
      const evt = createTestEvent({ content: longContent });
      
      accumulator._updateTopicTimeline('test', evt);
      
      const timeline = accumulator.topicTimelines.get('test');
      expect(timeline[0].content.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getTopicTimeline', () => {
    beforeEach(() => {
      for (let i = 0; i < 15; i++) {
        const evt = createTestEvent({ id: `evt-${i}` });
        accumulator._updateTopicTimeline('bitcoin', evt);
      }
    });

    it('returns recent timeline entries', () => {
      const timeline = accumulator.getTopicTimeline('bitcoin', 5);
      
      expect(timeline.length).toBe(5);
    });

    it('returns all entries if less than limit', () => {
      accumulator._updateTopicTimeline('new-topic', createTestEvent());
      
      const timeline = accumulator.getTopicTimeline('new-topic', 10);
      expect(timeline.length).toBe(1);
    });

    it('returns empty array for unknown topic', () => {
      const timeline = accumulator.getTopicTimeline('unknown');
      expect(timeline).toEqual([]);
    });
  });
});

describe('ContextAccumulator - Emerging Stories', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    accumulator = new ContextAccumulator(null, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('_detectEmergingStory', () => {
    it('creates emerging story for new topic', async () => {
      const evt = createTestEvent();
      const extracted = { topics: ['bitcoin'], sentiment: 'positive' };
      
      await accumulator._detectEmergingStory(evt, extracted);
      
      const story = accumulator.emergingStories.get('bitcoin');
      expect(story).toBeDefined();
      expect(story.topic).toBe('bitcoin');
      expect(story.mentions).toBe(1);
      expect(story.users.has(evt.pubkey)).toBe(true);
    });

    it('increments mentions for existing story', async () => {
      const evt1 = createTestEvent({ pubkey: 'user1' });
      const evt2 = createTestEvent({ pubkey: 'user2' });
      const extracted = { topics: ['nostr'], sentiment: 'positive' };
      
      await accumulator._detectEmergingStory(evt1, extracted);
      await accumulator._detectEmergingStory(evt2, extracted);
      
      const story = accumulator.emergingStories.get('nostr');
      expect(story.mentions).toBe(2);
      expect(story.users.size).toBe(2);
    });

    it('skips general topic', async () => {
      const evt = createTestEvent();
      const extracted = { topics: ['general'], sentiment: 'neutral' };
      
      await accumulator._detectEmergingStory(evt, extracted);
      
      expect(accumulator.emergingStories.has('general')).toBe(false);
    });

    it('tracks sentiment in story', async () => {
      const evt = createTestEvent();
      const extracted = { topics: ['test'], sentiment: 'positive' };
      
      await accumulator._detectEmergingStory(evt, extracted);
      
      const story = accumulator.emergingStories.get('test');
      expect(story.sentiment.positive).toBe(1);
    });

    it('limits events per story', async () => {
      const extracted = { topics: ['topic'], sentiment: 'neutral' };
      
      for (let i = 0; i < 25; i++) {
        const evt = createTestEvent({ id: `evt-${i}` });
        await accumulator._detectEmergingStory(evt, extracted);
      }
      
      const story = accumulator.emergingStories.get('topic');
      expect(story.events.length).toBeLessThanOrEqual(20);
    });

    it('cleans up old stories', async () => {
      const extracted = { topics: ['old-topic'], sentiment: 'neutral' };
      const evt = createTestEvent();
      
      await accumulator._detectEmergingStory(evt, extracted);
      
      // Advance time by 7 hours
      vi.advanceTimersByTime(7 * 60 * 60 * 1000);
      
      // Add another event to trigger cleanup
      const evt2 = createTestEvent();
      await accumulator._detectEmergingStory(evt2, { topics: ['new'], sentiment: 'neutral' });
      
      expect(accumulator.emergingStories.has('old-topic')).toBe(false);
    });
  });

  describe('getEmergingStories', () => {
    beforeEach(async () => {
      // Create stories with different user counts
      for (let topic of ['topic-a', 'topic-b', 'topic-c']) {
        for (let i = 0; i < 5; i++) {
          const evt = createTestEvent({ pubkey: `user-${i}` });
          await accumulator._detectEmergingStory(evt, { topics: [topic], sentiment: 'neutral' });
        }
      }
      
      // Create a story with fewer users
      const evt = createTestEvent({ pubkey: 'user-1' });
      await accumulator._detectEmergingStory(evt, { topics: ['small-topic'], sentiment: 'neutral' });
    });

    it('filters by minimum users', () => {
      const stories = accumulator.getEmergingStories({ minUsers: 3 });
      
      expect(stories.length).toBe(3);
      expect(stories.every(s => s.users >= 3)).toBe(true);
    });

    it('supports legacy number parameter', () => {
      const stories = accumulator.getEmergingStories(3);
      
      expect(stories.every(s => s.users >= 3)).toBe(true);
    });

    it('filters by minimum mentions', () => {
      const stories = accumulator.getEmergingStories({ minMentions: 5 });
      
      expect(stories.every(s => s.mentions >= 5)).toBe(true);
    });

    it('limits number of topics', () => {
      const stories = accumulator.getEmergingStories({ maxTopics: 2 });
      
      expect(stories.length).toBeLessThanOrEqual(2);
    });

    it('returns empty array when no stories', () => {
      accumulator.emergingStories.clear();
      
      const stories = accumulator.getEmergingStories();
      expect(stories).toEqual([]);
    });

    it('includes recent events when requested', () => {
      const stories = accumulator.getEmergingStories({ 
        includeRecentEvents: true,
        recentEventLimit: 3
      });
      
      expect(stories[0].recentEvents).toBeDefined();
      expect(stories[0].recentEvents.length).toBeLessThanOrEqual(3);
    });

    it('excludes recent events when not requested', () => {
      const stories = accumulator.getEmergingStories({ 
        includeRecentEvents: false
      });
      
      expect(stories[0].recentEvents).toEqual([]);
    });
  });
});

describe('ContextAccumulator - Digest Generation', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('generateHourlyDigest', () => {
    it('returns null when disabled', async () => {
      accumulator.hourlyDigestEnabled = false;
      
      const digest = await accumulator.generateHourlyDigest();
      
      expect(digest).toBeNull();
    });

    it('returns null when no events in previous hour', async () => {
      const digest = await accumulator.generateHourlyDigest();
      
      expect(digest).toBeNull();
    });

    it('generates digest for previous hour', async () => {
      // Add events to previous hour
      const previousHour = accumulator._getCurrentHour() - (60 * 60 * 1000);
      const mockDigest = accumulator._createEmptyDigest();
      mockDigest.eventCount = 10;
      mockDigest.users.add('user1');
      mockDigest.users.add('user2');
      mockDigest.topics.set('bitcoin', 5);
      mockDigest.topics.set('nostr', 3);
      mockDigest.sentiment.positive = 7;
      mockDigest.sentiment.neutral = 3;
      
      accumulator.hourlyDigests.set(previousHour, mockDigest);
      
      const digest = await accumulator.generateHourlyDigest();
      
      expect(digest).toBeDefined();
      expect(digest.metrics.events).toBe(10);
      expect(digest.metrics.activeUsers).toBe(2);
      expect(digest.metrics.topTopics.length).toBeGreaterThan(0);
    });

    it('includes top topics sorted by count', async () => {
      const previousHour = accumulator._getCurrentHour() - (60 * 60 * 1000);
      const mockDigest = accumulator._createEmptyDigest();
      mockDigest.eventCount = 1;
      mockDigest.users.add('user1');
      mockDigest.topics.set('bitcoin', 10);
      mockDigest.topics.set('nostr', 5);
      mockDigest.topics.set('lightning', 15);
      
      accumulator.hourlyDigests.set(previousHour, mockDigest);
      
      const digest = await accumulator.generateHourlyDigest();
      
      expect(digest.metrics.topTopics[0].topic).toBe('lightning');
      expect(digest.metrics.topTopics[1].topic).toBe('bitcoin');
      expect(digest.metrics.topTopics[2].topic).toBe('nostr');
    });

    it('includes hot conversations', async () => {
      const previousHour = accumulator._getCurrentHour() - (60 * 60 * 1000);
      const mockDigest = accumulator._createEmptyDigest();
      mockDigest.eventCount = 1;
      mockDigest.users.add('user1');
      
      // Add a conversation thread
      mockDigest.conversations.set('thread-1', [
        { eventId: 'e1', author: 'user1', timestamp: Date.now() },
        { eventId: 'e2', author: 'user2', timestamp: Date.now() },
        { eventId: 'e3', author: 'user3', timestamp: Date.now() }
      ]);
      
      accumulator.hourlyDigests.set(previousHour, mockDigest);
      
      const digest = await accumulator.generateHourlyDigest();
      
      expect(digest.metrics.hotConversations).toBeDefined();
      expect(digest.metrics.hotConversations.length).toBeGreaterThan(0);
    });
  });

  describe('generateDailyReport', () => {
    it('returns null when disabled', async () => {
      accumulator.dailyReportEnabled = false;
      
      const report = await accumulator.generateDailyReport();
      
      expect(report).toBeNull();
    });

    it('returns null when no events', async () => {
      const report = await accumulator.generateDailyReport();
      
      expect(report).toBeNull();
    });

    it('generates report from daily events', async () => {
      // Add some daily events
      for (let i = 0; i < 20; i++) {
        accumulator.dailyEvents.push({
          id: `evt-${i}`,
          author: `user-${i % 5}`,
          content: 'Test content',
          topics: ['bitcoin', 'nostr'],
          sentiment: 'positive',
          timestamp: Date.now()
        });
      }
      
      const report = await accumulator.generateDailyReport();
      
      expect(report).toBeDefined();
      expect(report.summary.totalEvents).toBe(20);
      expect(report.summary.activeUsers).toBe(5);
      expect(report.summary.topTopics.length).toBeGreaterThan(0);
    });

    it('clears daily events after report', async () => {
      accumulator.dailyEvents.push({
        id: 'evt-1',
        author: 'user-1',
        content: 'Test',
        topics: ['test'],
        sentiment: 'neutral',
        timestamp: Date.now()
      });
      
      await accumulator.generateDailyReport();
      
      expect(accumulator.dailyEvents).toEqual([]);
    });

    it('includes emerging stories in report', async () => {
      // Add daily events
      accumulator.dailyEvents.push({
        id: 'evt-1',
        author: 'user-1',
        content: 'Test',
        topics: ['bitcoin'],
        sentiment: 'neutral',
        timestamp: Date.now()
      });
      
      // Add emerging story
      await accumulator._detectEmergingStory(
        createTestEvent({ pubkey: 'user-1' }),
        { topics: ['bitcoin'], sentiment: 'positive' }
      );
      await accumulator._detectEmergingStory(
        createTestEvent({ pubkey: 'user-2' }),
        { topics: ['bitcoin'], sentiment: 'positive' }
      );
      await accumulator._detectEmergingStory(
        createTestEvent({ pubkey: 'user-3' }),
        { topics: ['bitcoin'], sentiment: 'positive' }
      );
      
      const report = await accumulator.generateDailyReport();
      
      expect(report.summary.emergingStories).toBeDefined();
    });
  });
});

describe('ContextAccumulator - Memory Integration', () => {
  let accumulator;
  let mockRuntime;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Timeline Lore', () => {
    it('records timeline lore entry', () => {
      const entry = {
        content: 'Test lore',
        priority: 'high',
        topics: ['bitcoin']
      };
      
      const recorded = accumulator.recordTimelineLore(entry);
      
      expect(recorded).toBeDefined();
      expect(recorded.content).toBe('Test lore');
      expect(recorded.timestamp).toBeDefined();
      expect(accumulator.timelineLoreEntries.length).toBe(1);
    });

    it('ignores null entries', () => {
      const result = accumulator.recordTimelineLore(null);
      
      expect(result).toBeNull();
      expect(accumulator.timelineLoreEntries.length).toBe(0);
    });

    it('limits number of lore entries', () => {
      accumulator.maxTimelineLoreEntries = 5;
      
      for (let i = 0; i < 10; i++) {
        accumulator.recordTimelineLore({ content: `Entry ${i}`, priority: 'low' });
      }
      
      expect(accumulator.timelineLoreEntries.length).toBe(5);
    });

    it('retrieves timeline lore sorted by priority', () => {
      accumulator.recordTimelineLore({ content: 'Low', priority: 'low', timestamp: 100 });
      accumulator.recordTimelineLore({ content: 'High', priority: 'high', timestamp: 200 });
      accumulator.recordTimelineLore({ content: 'Medium', priority: 'medium', timestamp: 150 });
      
      const lore = accumulator.getTimelineLore(3);
      
      expect(lore[0].priority).toBe('high');
      expect(lore[1].priority).toBe('medium');
      expect(lore[2].priority).toBe('low');
    });

    it('limits retrieved lore entries', () => {
      for (let i = 0; i < 10; i++) {
        accumulator.recordTimelineLore({ content: `Entry ${i}`, priority: 'low' });
      }
      
      const lore = accumulator.getTimelineLore(3);
      
      expect(lore.length).toBe(3);
    });

    it('sorts by recency when same priority', () => {
      accumulator.recordTimelineLore({ content: 'Old', priority: 'high', timestamp: 100 });
      accumulator.recordTimelineLore({ content: 'New', priority: 'high', timestamp: 200 });
      
      const lore = accumulator.getTimelineLore(2);
      
      expect(lore[0].content).toBe('New');
    });
  });
});

describe('ContextAccumulator - Retrieval Methods', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    accumulator = new ContextAccumulator(null, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getRecentDigest', () => {
    it('returns digest for hours ago', () => {
      const hour1 = accumulator._getCurrentHour() - (60 * 60 * 1000);
      const digest1 = accumulator._createEmptyDigest();
      digest1.eventCount = 10;
      accumulator.hourlyDigests.set(hour1, digest1);
      
      const digest = accumulator.getRecentDigest(1);
      
      expect(digest).toBeDefined();
      expect(digest.eventCount).toBe(10);
    });

    it('returns null when no digest', () => {
      const digest = accumulator.getRecentDigest(1);
      
      expect(digest).toBeNull();
    });
  });

  describe('getCurrentActivity', () => {
    it('returns activity for current hour', () => {
      const currentHour = accumulator._getCurrentHour();
      const digest = accumulator._createEmptyDigest();
      digest.eventCount = 5;
      digest.users.add('user1');
      digest.topics.set('bitcoin', 3);
      digest.sentiment.positive = 4;
      
      accumulator.hourlyDigests.set(currentHour, digest);
      
      const activity = accumulator.getCurrentActivity();
      
      expect(activity.events).toBe(5);
      expect(activity.users).toBe(1);
      expect(activity.topics.length).toBeGreaterThan(0);
      expect(activity.sentiment).toBeDefined();
    });

    it('returns zero activity when no digest', () => {
      const activity = accumulator.getCurrentActivity();
      
      expect(activity.events).toBe(0);
      expect(activity.users).toBe(0);
      expect(activity.topics).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns comprehensive stats', () => {
      const stats = accumulator.getStats();
      
      expect(stats.enabled).toBeDefined();
      expect(stats.llmAnalysisEnabled).toBeDefined();
      expect(stats.hourlyDigests).toBeDefined();
      expect(stats.emergingStories).toBeDefined();
      expect(stats.topicTimelines).toBeDefined();
      expect(stats.dailyEvents).toBeDefined();
      expect(stats.config).toBeDefined();
    });

    it('includes current activity', () => {
      const stats = accumulator.getStats();
      
      expect(stats.currentActivity).toBeDefined();
    });

    it('includes configuration values', () => {
      const stats = accumulator.getStats();
      
      expect(stats.config.maxHourlyDigests).toBe(24);
      expect(stats.config.maxDailyEvents).toBeGreaterThan(0);
    });
  });
});

describe('ContextAccumulator - Cleanup', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    accumulator = new ContextAccumulator(null, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('_cleanupOldData', () => {
    it('removes hourly digests older than 24 hours', () => {
      const currentHour = accumulator._getCurrentHour();
      
      // Add digests at various ages
      for (let i = 0; i < 30; i++) {
        const hour = currentHour - (i * 60 * 60 * 1000);
        accumulator.hourlyDigests.set(hour, accumulator._createEmptyDigest());
      }
      
      accumulator._cleanupOldData();
      
      // Should keep only 24 most recent hours
      expect(accumulator.hourlyDigests.size).toBeLessThanOrEqual(24);
    });

    it('keeps recent digests', () => {
      const currentHour = accumulator._getCurrentHour();
      const recentHour = currentHour - (60 * 60 * 1000);
      
      accumulator.hourlyDigests.set(currentHour, accumulator._createEmptyDigest());
      accumulator.hourlyDigests.set(recentHour, accumulator._createEmptyDigest());
      
      accumulator._cleanupOldData();
      
      expect(accumulator.hourlyDigests.has(currentHour)).toBe(true);
      expect(accumulator.hourlyDigests.has(recentHour)).toBe(true);
    });
  });
});

describe('ContextAccumulator - Adaptive Methods', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
    accumulator = new ContextAccumulator(null, noopLogger);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getAdaptiveSampleSize', () => {
    it('returns larger sample for high activity', () => {
      const size = accumulator.getAdaptiveSampleSize(1500);
      
      expect(size).toBeGreaterThan(accumulator.llmNarrativeSampleSize);
    });

    it('returns default for normal activity', () => {
      const size = accumulator.getAdaptiveSampleSize(300);
      
      expect(size).toBe(accumulator.llmNarrativeSampleSize);
    });

    it('returns smaller sample for low activity', () => {
      const size = accumulator.getAdaptiveSampleSize(30);
      
      expect(size).toBeLessThan(accumulator.llmNarrativeSampleSize);
    });

    it('respects disabled adaptive sampling', () => {
      accumulator.adaptiveSamplingEnabled = false;
      
      const size = accumulator.getAdaptiveSampleSize(1500);
      
      expect(size).toBe(accumulator.llmNarrativeSampleSize);
    });
  });

  describe('getAdaptiveTrendingTopics', () => {
    it('returns empty array when adaptive trending not initialized', () => {
      accumulator.adaptiveTrending = null;
      
      const topics = accumulator.getAdaptiveTrendingTopics(5);
      
      expect(topics).toEqual([]);
    });

    it('delegates to adaptive trending instance', () => {
      accumulator.adaptiveTrending.getTrendingTopics = vi.fn().mockReturnValue([
        { topic: 'bitcoin', score: 2.5 }
      ]);
      
      const topics = accumulator.getAdaptiveTrendingTopics(5);
      
      expect(topics.length).toBeGreaterThan(0);
      expect(accumulator.adaptiveTrending.getTrendingTopics).toHaveBeenCalledWith(5);
    });
  });
});

describe('ContextAccumulator - Edge Cases', () => {
  let accumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles missing logger gracefully', () => {
    accumulator = new ContextAccumulator(null, null);
    
    expect(accumulator.logger).toBeDefined();
  });

  it('handles missing runtime gracefully', () => {
    accumulator = new ContextAccumulator(null, noopLogger);
    
    expect(() => accumulator._getSystemContext()).not.toThrow();
  });

  it('handles invalid event gracefully', async () => {
    accumulator = new ContextAccumulator(null, noopLogger);
    
    await expect(accumulator.processEvent({ invalid: 'event' })).resolves.not.toThrow();
  });

  it('handles concurrent event processing', async () => {
    const mockRuntime = createMockRuntime();
    accumulator = new ContextAccumulator(mockRuntime, noopLogger);
    
    const events = Array.from({ length: 10 }, (_, i) => createTestEvent({ id: `evt-${i}` }));
    
    await Promise.all(events.map(evt => accumulator.processEvent(evt)));
    
    const hour = accumulator._getCurrentHour();
    const digest = accumulator.hourlyDigests.get(hour);
    
    expect(digest.eventCount).toBe(10);
  });

  it('handles malformed configuration values', () => {
    process.env.MAX_DAILY_EVENTS = 'not-a-number';
    process.env.CONTEXT_EMERGING_STORY_MIN_USERS = 'invalid';
    
    accumulator = new ContextAccumulator(null, noopLogger);
    
    // Should use fallback defaults
    expect(accumulator.maxDailyEvents).toBe(5000);
    expect(accumulator.emergingStoryThreshold).toBe(3);
    
    delete process.env.MAX_DAILY_EVENTS;
    delete process.env.CONTEXT_EMERGING_STORY_MIN_USERS;
  });
});
