const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {} };

function createNarrativeMemory() {
  return new NarrativeMemory(null, noopLogger);
}

describe('NarrativeMemory recent digest context', () => {
  let nm;

  beforeEach(() => {
    nm = createNarrativeMemory();
  });

  it('returns empty array when no timeline lore exists', () => {
    const summaries = nm.getRecentDigestSummaries(3);
    expect(summaries).toEqual([]);
  });

  it('returns recent digest summaries with key fields', async () => {
    // Add some timeline lore entries
    await nm.storeTimelineLore({
      headline: 'Bitcoin price reaches new highs',
      tags: ['bitcoin', 'price', 'trading'],
      priority: 'high',
      narrative: 'Bitcoin surges past $50k...',
      insights: ['Strong buying pressure'],
      watchlist: ['price momentum'],
      tone: 'bullish'
    });

    await nm.storeTimelineLore({
      headline: 'Lightning network adoption grows',
      tags: ['lightning', 'adoption', 'payments'],
      priority: 'medium',
      narrative: 'More merchants accepting Lightning...',
      insights: ['Network effect visible'],
      watchlist: ['merchant adoption'],
      tone: 'optimistic'
    });

    await nm.storeTimelineLore({
      headline: 'Nostr client updates released',
      tags: ['nostr', 'development', 'clients'],
      priority: 'low',
      narrative: 'Several clients pushed updates...',
      insights: ['Continuous improvement'],
      watchlist: ['client features'],
      tone: 'neutral'
    });

    const summaries = nm.getRecentDigestSummaries(3);

    expect(summaries.length).toBe(3);
    expect(summaries[0]).toHaveProperty('headline');
    expect(summaries[0]).toHaveProperty('tags');
    expect(summaries[0]).toHaveProperty('priority');
    expect(summaries[0]).toHaveProperty('timestamp');
    
    // Verify it includes narrative context (updated for storyline integration)
    expect(summaries[0]).toHaveProperty('narrative');
    expect(summaries[0]).toHaveProperty('insights');
  });

  it('limits returned summaries to lookback count', async () => {
    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      await nm.storeTimelineLore({
        headline: `Entry ${i + 1}`,
        tags: [`tag${i}`],
        priority: 'medium',
        narrative: 'Some narrative',
        insights: ['Some insight'],
        watchlist: ['Some item'],
        tone: 'neutral'
      });
    }

    const summaries = nm.getRecentDigestSummaries(2);
    expect(summaries.length).toBe(2);
    
    // Should get the 2 most recent
    expect(summaries[0].headline).toBe('Entry 4');
    expect(summaries[1].headline).toBe('Entry 5');
  });

  it('returns most recent entries when lookback exceeds available', async () => {
    await nm.storeTimelineLore({
      headline: 'Only entry',
      tags: ['test'],
      priority: 'medium',
      narrative: 'Test',
      insights: [],
      watchlist: [],
      tone: 'neutral'
    });

    const summaries = nm.getRecentDigestSummaries(10);
    expect(summaries.length).toBe(1);
  });

  it('handles invalid lookback values', async () => {
    await nm.storeTimelineLore({
      headline: 'Test entry',
      tags: ['test'],
      priority: 'medium',
      narrative: 'Test',
      insights: [],
      watchlist: [],
      tone: 'neutral'
    });

    // Should default to 3 for invalid values
    expect(nm.getRecentDigestSummaries(0).length).toBe(0);
    expect(nm.getRecentDigestSummaries(-1).length).toBe(0);
    expect(nm.getRecentDigestSummaries(null).length).toBe(0);
    expect(nm.getRecentDigestSummaries(undefined).length).toBe(1);
  });

  it('verifies compact summary structure matches expected format', async () => {
    const now = Date.now();
    await nm.storeTimelineLore({
      headline: 'Test headline',
      tags: ['tag1', 'tag2'],
      priority: 'high',
      narrative: 'This should not be in summary',
      insights: ['This should not be in summary'],
      watchlist: ['This should not be in summary'],
      tone: 'excited'
    });

    const summaries = nm.getRecentDigestSummaries(1);
    const summary = summaries[0];

    expect(summary.headline).toBe('Test headline');
    expect(summary.tags).toEqual(['tag1', 'tag2']);
    expect(summary.priority).toBe('high');
    expect(summary.timestamp).toBeGreaterThanOrEqual(now);
    expect(Object.keys(summary).length).toBe(8); // Updated: now includes storyline fields
  });
});
