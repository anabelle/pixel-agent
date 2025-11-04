const { describe, it, expect, beforeEach, vi } = globalThis;
const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };

function createMockRuntime(overrides = {}) {
  return {
    agentId: 'test-agent-id',
    getSetting: vi.fn((key) => overrides.settings?.[key] || null),
    getMemories: vi.fn(async () => []),
    createMemory: vi.fn(async (memory) => ({ created: true, ...memory })),
    createUniqueUuid: vi.fn((runtime, seed) => `uuid-${seed}-${Date.now()}`),
    generateText: vi.fn(async (prompt, options) => JSON.stringify({
      headline: 'Weekly headline',
      summary: 'Weekly summary with details',
      arc: 'Beginning → Middle → End',
      majorThemes: ['theme1', 'theme2'],
      shifts: ['shift1', 'shift2'],
      outlook: 'Next week outlook'
    })),
    ...overrides
  };
}

describe('NarrativeMemory - Weekly Summaries', () => {
  describe('generateWeeklySummary()', () => {
    it('returns null when insufficient data', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      // Add only 3 daily narratives
      for (let i = 0; i < 3; i++) {
        await nm.storeDailyNarrative({ id: i });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary).toBeNull();
    });

    it('generates summary from 7 days of data', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: {
            totalEvents: 100 + i,
            activeUsers: 50 + i,
            topTopics: [{ topic: 'bitcoin', count: 10 }]
          },
          timestamp: Date.now() - (6 - i) * 24 * 60 * 60 * 1000
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary).toBeDefined();
      expect(summary.startDate).toBeDefined();
      expect(summary.endDate).toBeDefined();
      expect(summary.totalEvents).toBe(721); // 100+101+102+103+104+105+106
    });

    it('calculates unique users correctly', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: {
            activeUsers: [1, 2, 3, 4, 5] // Same users each day
          }
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary.uniqueUsers).toBe(5);
    });

    it('aggregates top topics', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: {
            topTopics: [
              { topic: 'bitcoin', count: 10 },
              { topic: 'lightning', count: 5 }
            ]
          }
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary.topTopics).toBeDefined();
      const bitcoin = summary.topTopics.find(t => t.topic === 'bitcoin');
      expect(bitcoin.count).toBe(70); // 10 * 7 days
    });

    it('identifies weekly stories', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      // Topic that appears 5 days
      for (let i = 0; i < 7; i++) {
        const topics = i < 5 ? [{ topic: 'recurring-topic', count: 10 }] : [];
        await nm.storeDailyNarrative({
          summary: { topTopics: topics }
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary.emergingStories).toBeDefined();
      const story = summary.emergingStories.find(s => s.topic === 'recurring-topic');
      expect(story).toBeDefined();
      expect(story.days).toBe(5);
    });

    it('collects key moments from daily narratives', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          narrative: {
            keyMoments: [`Moment ${i}A`, `Moment ${i}B`]
          }
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary.keyMoments).toBeDefined();
      expect(summary.keyMoments.length).toBe(7); // Limited to 7
    });

    it('generates LLM narrative when runtime available', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({
          summary: { totalEvents: 100 },
          narrative: { summary: `Day ${i} summary` }
        });
      }
      
      const summary = await nm.generateWeeklySummary();
      
      expect(summary.narrative).toBeDefined();
      expect(summary.narrative.headline).toBe('Weekly headline');
      expect(runtime.generateText).toHaveBeenCalled();
    });

    it('stores weekly summary in cache', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      expect(nm.weeklyNarratives.length).toBe(0);
      
      await nm.generateWeeklySummary();
      
      expect(nm.weeklyNarratives.length).toBe(1);
      expect(nm.weeklyNarratives[0].type).toBe('weekly');
    });

    it('persists weekly summary to database', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      const persistSpy = vi.spyOn(nm, '_persistNarrative').mockResolvedValue();
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      await nm.generateWeeklySummary();
      
      expect(persistSpy).toHaveBeenCalledWith(expect.any(Object), 'weekly');
    });

    it('trims weekly cache to max size', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      nm.maxWeeklyCache = 2;
      
      // Generate 3 weekly summaries
      for (let week = 0; week < 3; week++) {
        // Add 7 daily narratives for each week
        for (let i = 0; i < 7; i++) {
          await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
        }
        await nm.generateWeeklySummary();
      }
      
      expect(nm.weeklyNarratives.length).toBe(2);
    });
  });

  describe('_generateWeeklyNarrative()', () => {
    it('generates narrative with LLM', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const summary = {
        totalEvents: 1000,
        uniqueUsers: 100,
        topTopics: [{ topic: 'bitcoin', count: 50 }],
        dominantSentiment: 'positive'
      };
      
      const dailyNarratives = [
        { narrative: { summary: 'Day 1 summary' } },
        { narrative: { summary: 'Day 2 summary' } }
      ];
      
      const narrative = await nm._generateWeeklyNarrative(summary, dailyNarratives);
      
      expect(narrative).toBeDefined();
      expect(narrative.headline).toBeDefined();
      expect(narrative.summary).toBeDefined();
    });

    it('includes daily summaries in prompt', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const summary = {
        totalEvents: 1000,
        uniqueUsers: 100,
        topTopics: [{ topic: 'bitcoin', count: 50 }],
        dominantSentiment: 'positive'
      };
      
      const dailyNarratives = [
        { narrative: { summary: 'Unique day 1 content' } }
      ];
      
      await nm._generateWeeklyNarrative(summary, dailyNarratives);
      
      const promptCall = runtime.generateText.mock.calls[0][0];
      expect(promptCall).toContain('Unique day 1 content');
    });

    it('handles LLM errors gracefully', async () => {
      const runtime = createMockRuntime();
      runtime.generateText = vi.fn().mockRejectedValue(new Error('LLM error'));
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const summary = {
        totalEvents: 1000,
        uniqueUsers: 100,
        topTopics: [],
        dominantSentiment: 'neutral'
      };
      
      const narrative = await nm._generateWeeklyNarrative(summary, []);
      
      expect(narrative).toBeNull();
    });

    it('handles JSON parsing errors', async () => {
      const runtime = createMockRuntime();
      runtime.generateText = vi.fn().mockResolvedValue('invalid json response');
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const summary = {
        totalEvents: 1000,
        uniqueUsers: 100,
        topTopics: [],
        dominantSentiment: 'neutral'
      };
      
      const narrative = await nm._generateWeeklyNarrative(summary, []);
      
      expect(narrative).toBeNull();
    });

    it('truncates long daily summaries', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const longSummary = 'a'.repeat(3000);
      const dailyNarratives = [
        { narrative: { summary: longSummary } }
      ];
      
      const summary = {
        totalEvents: 1000,
        uniqueUsers: 100,
        topTopics: [],
        dominantSentiment: 'neutral'
      };
      
      await nm._generateWeeklyNarrative(summary, dailyNarratives);
      
      const promptCall = runtime.generateText.mock.calls[0][0];
      // Should be truncated to 2000 characters
      expect(promptCall.length).toBeLessThan(3000);
    });
  });

  describe('_maybeGenerateWeeklySummary()', () => {
    it('generates first weekly summary after 7 daily narratives', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      const generateSpy = vi.spyOn(nm, 'generateWeeklySummary').mockResolvedValue({});
      
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      expect(generateSpy).toHaveBeenCalled();
    });

    it('does not generate before 7 daily narratives', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      const generateSpy = vi.spyOn(nm, 'generateWeeklySummary').mockResolvedValue({});
      
      for (let i = 0; i < 5; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it('generates weekly summary every 7 days', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      const generateSpy = vi.spyOn(nm, 'generateWeeklySummary').mockResolvedValue({});
      
      // First week
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      expect(generateSpy).toHaveBeenCalledTimes(1);
      
      // Simulate 7 days passing
      nm.weeklyNarratives[0].timestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);
      
      // Add one more daily narrative
      await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      
      expect(generateSpy).toHaveBeenCalledTimes(2);
    });

    it('does not generate before 7 days have passed', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      const generateSpy = vi.spyOn(nm, 'generateWeeklySummary').mockResolvedValue({});
      
      // First week
      for (let i = 0; i < 7; i++) {
        await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      }
      
      expect(generateSpy).toHaveBeenCalledTimes(1);
      
      // Only 3 days have passed
      nm.weeklyNarratives[0].timestamp = Date.now() - (3 * 24 * 60 * 60 * 1000);
      
      await nm.storeDailyNarrative({ summary: { totalEvents: 100 } });
      
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('_identifyWeeklyStories()', () => {
    it('identifies topics appearing multiple days', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const narratives = [
        { summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] } },
        { summary: { topTopics: [{ topic: 'bitcoin', count: 15 }] } },
        { summary: { topTopics: [{ topic: 'bitcoin', count: 20 }] } },
        { summary: { topTopics: [{ topic: 'lightning', count: 5 }] } },
        { summary: { topTopics: [{ topic: 'lightning', count: 8 }] } }
      ];
      
      const stories = nm._identifyWeeklyStories(narratives);
      
      expect(stories.find(s => s.topic === 'bitcoin')).toBeDefined();
      expect(stories.find(s => s.topic === 'bitcoin').days).toBe(3);
    });

    it('filters out topics appearing less than 3 days', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const narratives = [
        { summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] } },
        { summary: { topTopics: [{ topic: 'bitcoin', count: 15 }] } },
        { summary: { topTopics: [{ topic: 'rare-topic', count: 5 }] } }
      ];
      
      const stories = nm._identifyWeeklyStories(narratives);
      
      expect(stories.find(s => s.topic === 'rare-topic')).toBeUndefined();
    });

    it('sorts stories by frequency', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const narratives = [];
      
      // bitcoin appears 5 days
      for (let i = 0; i < 5; i++) {
        narratives.push({ summary: { topTopics: [{ topic: 'bitcoin', count: 10 }] } });
      }
      
      // lightning appears 3 days
      for (let i = 0; i < 3; i++) {
        narratives.push({ summary: { topTopics: [{ topic: 'lightning', count: 5 }] } });
      }
      
      const stories = nm._identifyWeeklyStories(narratives);
      
      expect(stories[0].topic).toBe('bitcoin');
      expect(stories[1].topic).toBe('lightning');
    });

    it('limits to top 5 stories', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const narratives = [];
      
      // Create 10 topics that each appear 3 days
      for (let topic = 0; topic < 10; topic++) {
        for (let day = 0; day < 3; day++) {
          narratives.push({
            summary: { topTopics: [{ topic: `topic${topic}`, count: 10 - topic }] }
          });
        }
      }
      
      const stories = nm._identifyWeeklyStories(narratives);
      
      expect(stories.length).toBe(5);
    });

    it('handles empty narratives', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const stories = nm._identifyWeeklyStories([]);
      
      expect(stories).toEqual([]);
    });
  });

  describe('_summarizeEvolution()', () => {
    it('summarizes evolution with trend', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const evolution = [
        { mentions: 5 },
        { mentions: 10 },
        { mentions: 15 }
      ];
      
      const summary = nm._summarizeEvolution(evolution);
      
      expect(summary).toContain('rising');
      expect(summary).toContain('10');
    });

    it('handles empty evolution', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const summary = nm._summarizeEvolution([]);
      
      expect(summary).toBe('No data available');
    });

    it('calculates average mentions', () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const evolution = [
        { mentions: 10 },
        { mentions: 20 },
        { mentions: 30 }
      ];
      
      const summary = nm._summarizeEvolution(evolution);
      
      expect(summary).toContain('20'); // Average of 10, 20, 30
    });
  });
});
