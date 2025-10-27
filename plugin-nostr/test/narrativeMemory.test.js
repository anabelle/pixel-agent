const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };

function createNarrativeMemory(runtime = null, logger = noopLogger) {
  return new NarrativeMemory(runtime, logger);
}

function createMockRuntime(overrides = {}) {
  return {
    agentId: 'test-agent-id',
    getSetting: vi.fn((key) => overrides.settings?.[key] || null),
    getMemories: vi.fn(async () => []),
    createMemory: vi.fn(async (memory) => ({ created: true, ...memory })),
    createUniqueUuid: vi.fn((runtime, seed) => `uuid-${seed}-${Date.now()}`),
    generateText: vi.fn(async (prompt, options) => JSON.stringify({
      headline: 'Test headline',
      summary: 'Test summary',
      arc: 'Test arc',
      keyMoments: ['moment1', 'moment2'],
      communities: ['community1'],
      insights: ['insight1'],
      vibe: 'active',
      tomorrow: 'Test tomorrow'
    })),
    ...overrides
  };
}

describe('NarrativeMemory', () => {
  describe('Constructor', () => {
    it('initializes with default values', () => {
      const nm = createNarrativeMemory();
      
      expect(nm.hourlyNarratives).toEqual([]);
      expect(nm.dailyNarratives).toEqual([]);
      expect(nm.weeklyNarratives).toEqual([]);
      expect(nm.monthlyNarratives).toEqual([]);
      expect(nm.timelineLore).toEqual([]);
      expect(nm.initialized).toBe(false);
    });

    it('initializes with provided runtime and logger', () => {
      const runtime = { agentId: 'test' };
      const logger = { info: vi.fn() };
      const nm = new NarrativeMemory(runtime, logger);
      
      expect(nm.runtime).toBe(runtime);
      expect(nm.logger).toBe(logger);
    });

    it('sets default logger to console when not provided', () => {
      const nm = new NarrativeMemory(null);
      
      expect(nm.logger).toBe(console);
    });

    it('initializes Maps for tracking', () => {
      const nm = createNarrativeMemory();
      
      expect(nm.topicTrends).toBeInstanceOf(Map);
      expect(nm.sentimentTrends).toBeInstanceOf(Map);
      expect(nm.topicClusters).toBeInstanceOf(Map);
      expect(nm.activeWatchlist).toBeInstanceOf(Map);
    });

    it('sets cache size limits from configuration', () => {
      const nm = createNarrativeMemory();
      
      expect(nm.maxHourlyCache).toBe(7 * 24);
      expect(nm.maxDailyCache).toBe(90);
      expect(nm.maxWeeklyCache).toBe(52);
      expect(nm.maxMonthlyCache).toBe(24);
      expect(nm.maxTimelineLoreCache).toBe(120);
    });

    it('respects TOPIC_CLUSTER_MAX_ENTRIES setting', () => {
      const runtime = createMockRuntime({
        settings: { TOPIC_CLUSTER_MAX_ENTRIES: '1000' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      expect(nm.maxTopicClusterEntries).toBe(1000);
    });

    it('uses default value for invalid TOPIC_CLUSTER_MAX_ENTRIES', () => {
      const runtime = createMockRuntime({
        settings: { TOPIC_CLUSTER_MAX_ENTRIES: 'invalid' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      expect(nm.maxTopicClusterEntries).toBe(500);
    });

    it('initializes adaptive storylines when enabled', () => {
      const runtime = createMockRuntime({
        settings: { ADAPTIVE_STORYLINES: 'true' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      expect(nm.adaptiveStorylinesEnabled).toBe(true);
      expect(nm.storylineTracker).toBeDefined();
    });

    it('does not initialize storylines when disabled', () => {
      const runtime = createMockRuntime({
        settings: { ADAPTIVE_STORYLINES: 'false' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      expect(nm.adaptiveStorylinesEnabled).toBe(false);
      expect(nm.storylineTracker).toBeUndefined();
    });
  });

  describe('initialize()', () => {
    it('sets initialized flag to true', async () => {
      const nm = createNarrativeMemory();
      
      expect(nm.initialized).toBe(false);
      await nm.initialize();
      expect(nm.initialized).toBe(true);
    });

    it('only initializes once', async () => {
      const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
      const nm = new NarrativeMemory(null, logger);
      
      await nm.initialize();
      const firstCallCount = logger.info.mock.calls.length;
      
      await nm.initialize();
      const secondCallCount = logger.info.mock.calls.length;
      
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('calls _loadRecentNarratives and _rebuildTrends', async () => {
      const nm = createNarrativeMemory();
      const loadSpy = vi.spyOn(nm, '_loadRecentNarratives').mockResolvedValue();
      const rebuildSpy = vi.spyOn(nm, '_rebuildTrends').mockResolvedValue();
      
      await nm.initialize();
      
      expect(loadSpy).toHaveBeenCalled();
      expect(rebuildSpy).toHaveBeenCalled();
    });
  });

  describe('storeHourlyNarrative()', () => {
    it('adds narrative to cache with timestamp and type', async () => {
      const nm = createNarrativeMemory();
      const narrative = {
        summary: { totalEvents: 100, activeUsers: 50 },
        topics: ['bitcoin', 'lightning']
      };
      
      await nm.storeHourlyNarrative(narrative);
      
      expect(nm.hourlyNarratives.length).toBe(1);
      expect(nm.hourlyNarratives[0]).toMatchObject({
        ...narrative,
        type: 'hourly'
      });
      expect(nm.hourlyNarratives[0].timestamp).toBeDefined();
    });

    it('trims cache when exceeding max size', async () => {
      const nm = createNarrativeMemory();
      nm.maxHourlyCache = 3;
      
      for (let i = 0; i < 5; i++) {
        await nm.storeHourlyNarrative({ id: i });
      }
      
      expect(nm.hourlyNarratives.length).toBe(3);
      expect(nm.hourlyNarratives[0].id).toBe(2); // First two removed
    });

    it('updates trends from narrative', async () => {
      const nm = createNarrativeMemory();
      const updateSpy = vi.spyOn(nm, '_updateTrendsFromNarrative');
      const narrative = { summary: { topTopics: [{ topic: 'bitcoin', count: 5 }] } };
      
      await nm.storeHourlyNarrative(narrative);
      
      expect(updateSpy).toHaveBeenCalledWith(narrative);
    });

    it('persists narrative to database', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      const persistSpy = vi.spyOn(nm, '_persistNarrative').mockResolvedValue();
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm.storeHourlyNarrative(narrative);
      
      expect(persistSpy).toHaveBeenCalledWith(narrative, 'hourly');
    });
  });

  describe('storeDailyNarrative()', () => {
    it('adds narrative to cache with timestamp and type', async () => {
      const nm = createNarrativeMemory();
      const narrative = {
        summary: { totalEvents: 1000, activeUsers: 200 },
        narrative: { headline: 'Daily summary' }
      };
      
      await nm.storeDailyNarrative(narrative);
      
      expect(nm.dailyNarratives.length).toBe(1);
      expect(nm.dailyNarratives[0]).toMatchObject({
        ...narrative,
        type: 'daily'
      });
    });

    it('trims cache when exceeding max size', async () => {
      const nm = createNarrativeMemory();
      nm.maxDailyCache = 2;
      
      for (let i = 0; i < 4; i++) {
        await nm.storeDailyNarrative({ id: i });
      }
      
      expect(nm.dailyNarratives.length).toBe(2);
      expect(nm.dailyNarratives[0].id).toBe(2);
    });

    it('updates trends from narrative', async () => {
      const nm = createNarrativeMemory();
      const updateSpy = vi.spyOn(nm, '_updateTrendsFromNarrative');
      const narrative = { summary: { topTopics: [{ topic: 'nostr', count: 10 }] } };
      
      await nm.storeDailyNarrative(narrative);
      
      expect(updateSpy).toHaveBeenCalledWith(narrative);
    });

    it('checks for weekly summary generation', async () => {
      const nm = createNarrativeMemory();
      const maybeSpy = vi.spyOn(nm, '_maybeGenerateWeeklySummary').mockResolvedValue();
      
      await nm.storeDailyNarrative({ summary: {} });
      
      expect(maybeSpy).toHaveBeenCalled();
    });
  });

  describe('storeTimelineLore()', () => {
    it('returns early for invalid input', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeTimelineLore(null);
      expect(nm.timelineLore.length).toBe(0);
      
      await nm.storeTimelineLore(undefined);
      expect(nm.timelineLore.length).toBe(0);
      
      await nm.storeTimelineLore('string');
      expect(nm.timelineLore.length).toBe(0);
    });

    it('adds lore entry with timestamp and type', async () => {
      const nm = createNarrativeMemory();
      const entry = {
        headline: 'Test lore',
        tags: ['test'],
        priority: 'high'
      };
      
      await nm.storeTimelineLore(entry);
      
      expect(nm.timelineLore.length).toBe(1);
      expect(nm.timelineLore[0]).toMatchObject({
        ...entry,
        type: 'timeline'
      });
      expect(nm.timelineLore[0].timestamp).toBeDefined();
    });

    it('uses provided timestamp if available', async () => {
      const nm = createNarrativeMemory();
      const timestamp = 1234567890;
      const entry = {
        headline: 'Test',
        tags: ['test'],
        timestamp
      };
      
      await nm.storeTimelineLore(entry);
      
      expect(nm.timelineLore[0].timestamp).toBe(timestamp);
    });

    it('trims cache when exceeding max size', async () => {
      const nm = createNarrativeMemory();
      nm.maxTimelineLoreCache = 3;
      
      for (let i = 0; i < 5; i++) {
        await nm.storeTimelineLore({ headline: `Entry ${i}`, tags: ['test'] });
      }
      
      expect(nm.timelineLore.length).toBe(3);
      expect(nm.timelineLore[0].headline).toBe('Entry 2');
    });

    it('extracts and tracks watchlist items', async () => {
      const nm = createNarrativeMemory();
      const addSpy = vi.spyOn(nm, 'addWatchlistItems');
      
      const entry = {
        headline: 'Test',
        tags: ['test'],
        watchlist: ['item1', 'item2'],
        id: 'test-id'
      };
      
      await nm.storeTimelineLore(entry);
      
      expect(addSpy).toHaveBeenCalledWith(['item1', 'item2'], 'digest', 'test-id');
    });

    it('persists lore entry to database', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      const persistSpy = vi.spyOn(nm, '_persistNarrative').mockResolvedValue();
      
      await nm.storeTimelineLore({ headline: 'Test', tags: ['test'] });
      
      expect(persistSpy).toHaveBeenCalled();
    });

    it('handles persistence errors gracefully', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      vi.spyOn(nm, '_persistNarrative').mockRejectedValue(new Error('DB error'));
      
      await expect(nm.storeTimelineLore({ headline: 'Test', tags: ['test'] })).resolves.not.toThrow();
    });

    it('adds storyline context when adaptive storylines enabled', async () => {
      const runtime = createMockRuntime({
        settings: { ADAPTIVE_STORYLINES: 'true' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      vi.spyOn(nm, 'getStorylineContext').mockReturnValue({
        currentPhase: 'test-phase',
        confidence: 0.8
      });
      
      const entry = {
        headline: 'Test',
        tags: ['bitcoin', 'regulation'],
        priority: 'high'
      };
      
      await nm.storeTimelineLore(entry);
      
      expect(nm.timelineLore[0].storylineContext).toBeDefined();
    });
  });

  describe('getTimelineLore()', () => {
    beforeEach(async () => {
      // Helper to add test lore
    });

    it('returns empty array when no lore exists', () => {
      const nm = createNarrativeMemory();
      const lore = nm.getTimelineLore();
      expect(lore).toEqual([]);
    });

    it('returns lore sorted by priority and recency', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeTimelineLore({
        headline: 'Low priority',
        tags: ['test'],
        priority: 'low',
        timestamp: 1000
      });
      
      await nm.storeTimelineLore({
        headline: 'High priority',
        tags: ['test'],
        priority: 'high',
        timestamp: 2000
      });
      
      await nm.storeTimelineLore({
        headline: 'Medium priority',
        tags: ['test'],
        priority: 'medium',
        timestamp: 3000
      });
      
      const lore = nm.getTimelineLore(5);
      
      expect(lore[0].headline).toBe('High priority');
      expect(lore[1].headline).toBe('Medium priority');
      expect(lore[2].headline).toBe('Low priority');
    });

    it('limits results to specified count', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 10; i++) {
        await nm.storeTimelineLore({
          headline: `Entry ${i}`,
          tags: ['test'],
          priority: 'medium'
        });
      }
      
      const lore = nm.getTimelineLore(3);
      expect(lore.length).toBe(3);
    });

    it('defaults to 5 results', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 10; i++) {
        await nm.storeTimelineLore({
          headline: `Entry ${i}`,
          tags: ['test'],
          priority: 'medium'
        });
      }
      
      const lore = nm.getTimelineLore();
      expect(lore.length).toBe(5);
    });

    it('handles invalid limit values', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 10; i++) {
        await nm.storeTimelineLore({
          headline: `Entry ${i}`,
          tags: ['test'],
          priority: 'medium'
        });
      }
      
      expect(nm.getTimelineLore(0).length).toBe(5);
      expect(nm.getTimelineLore(-1).length).toBe(5);
      expect(nm.getTimelineLore(NaN).length).toBe(5);
    });

    it('sorts by timestamp when priorities are equal', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeTimelineLore({
        headline: 'Older',
        tags: ['test'],
        priority: 'high',
        timestamp: 1000
      });
      
      await nm.storeTimelineLore({
        headline: 'Newer',
        tags: ['test'],
        priority: 'high',
        timestamp: 2000
      });
      
      const lore = nm.getTimelineLore(5);
      
      expect(lore[0].headline).toBe('Newer');
      expect(lore[1].headline).toBe('Older');
    });
  });

  describe('getHistoricalContext()', () => {
    beforeEach(async () => {
      const nm = createNarrativeMemory();
      // Populate with test data
      for (let i = 0; i < 30; i++) {
        await nm.storeHourlyNarrative({ id: i, type: 'hourly' });
      }
      for (let i = 0; i < 40; i++) {
        await nm.storeDailyNarrative({ id: i, type: 'daily' });
      }
    });

    it('returns 1 hour of context', async () => {
      const nm = createNarrativeMemory();
      await nm.storeHourlyNarrative({ id: 1 });
      
      const context = await nm.getHistoricalContext('1h');
      
      expect(context.hourly.length).toBe(1);
    });

    it('returns 24 hours of context', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 30; i++) {
        await nm.storeHourlyNarrative({ id: i });
      }
      await nm.storeDailyNarrative({ id: 1 });
      
      const context = await nm.getHistoricalContext('24h');
      
      expect(context.hourly.length).toBe(24);
      expect(context.daily.length).toBe(1);
    });

    it('returns 7 days of context', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 10; i++) {
        await nm.storeDailyNarrative({ id: i });
      }
      
      const context = await nm.getHistoricalContext('7d');
      
      expect(context.daily.length).toBe(7);
    });

    it('returns 30 days of context', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 40; i++) {
        await nm.storeDailyNarrative({ id: i });
      }
      
      const context = await nm.getHistoricalContext('30d');
      
      expect(context.daily.length).toBe(30);
    });

    it('defaults to 7 days for unknown timeframe', async () => {
      const nm = createNarrativeMemory();
      
      for (let i = 0; i < 10; i++) {
        await nm.storeDailyNarrative({ id: i });
      }
      
      const context = await nm.getHistoricalContext('unknown');
      
      expect(context.daily.length).toBe(7);
    });
  });

  describe('getStats()', () => {
    it('returns basic statistics', () => {
      const nm = createNarrativeMemory();
      const stats = nm.getStats();
      
      expect(stats).toHaveProperty('hourlyNarratives');
      expect(stats).toHaveProperty('dailyNarratives');
      expect(stats).toHaveProperty('weeklyNarratives');
      expect(stats).toHaveProperty('monthlyNarratives');
      expect(stats).toHaveProperty('timelineLore');
      expect(stats).toHaveProperty('trackedTopics');
      expect(stats).toHaveProperty('engagementDataPoints');
      expect(stats).toHaveProperty('topicClusters');
    });

    it('includes oldest and newest narrative dates', async () => {
      const nm = createNarrativeMemory();
      
      await nm.storeDailyNarrative({ id: 1, timestamp: 1000 });
      await nm.storeDailyNarrative({ id: 2, timestamp: 2000 });
      
      const stats = nm.getStats();
      
      expect(stats.oldestNarrative).toBeDefined();
      expect(stats.newestNarrative).toBeDefined();
    });

    it('includes adaptive storylines stats when enabled', () => {
      const runtime = createMockRuntime({
        settings: { ADAPTIVE_STORYLINES: 'true' }
      });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const stats = nm.getStats();
      
      expect(stats.adaptiveStorylines.enabled).toBe(true);
    });

    it('shows disabled for adaptive storylines when not enabled', () => {
      const nm = createNarrativeMemory();
      
      const stats = nm.getStats();
      
      expect(stats.adaptiveStorylines.enabled).toBe(false);
    });
  });
});
