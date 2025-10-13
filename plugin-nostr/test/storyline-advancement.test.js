const { describe, it, expect, beforeEach } = globalThis;

const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { 
  info: () => {}, 
  warn: () => {}, 
  debug: () => {} 
};

function createNarrativeMemory() {
  return new NarrativeMemory(null, noopLogger);
}

describe('Storyline Advancement Detection', () => {
  let nm;

  beforeEach(() => {
    nm = createNarrativeMemory();
  });

  describe('checkStorylineAdvancement', () => {
    it('returns null when no continuity data exists', () => {
      const result = nm.checkStorylineAdvancement('Some content about bitcoin', ['bitcoin']);
      expect(result).toBe(null);
    });

    it('returns null when insufficient timeline lore exists', async () => {
      // Only add one entry (need at least 2 for continuity)
      await nm.storeTimelineLore({
        headline: 'Bitcoin price update',
        tags: ['bitcoin', 'price'],
        priority: 'medium',
        narrative: 'Bitcoin hits new highs',
        insights: ['Strong momentum'],
        watchlist: ['price action'],
        tone: 'bullish'
      });

      const result = nm.checkStorylineAdvancement('Bitcoin continues rallying', ['bitcoin']);
      expect(result).toBe(null);
    });

    it('detects content that advances recurring themes', async () => {
      // Create a recurring theme across multiple digests
      await nm.storeTimelineLore({
        headline: 'Lightning adoption grows',
        tags: ['lightning', 'adoption', 'payments'],
        priority: 'medium',
        narrative: 'More merchants accepting Lightning',
        insights: ['Growing network effect'],
        watchlist: ['merchant adoption'],
        tone: 'optimistic'
      });

      await nm.storeTimelineLore({
        headline: 'Lightning network expansion continues',
        tags: ['lightning', 'network', 'growth'],
        priority: 'high',
        narrative: 'Lightning capacity increasing',
        insights: ['Steady growth'],
        watchlist: ['network capacity'],
        tone: 'positive'
      });

      await nm.storeTimelineLore({
        headline: 'Lightning payment volumes surge',
        tags: ['lightning', 'payments', 'volume'],
        priority: 'high',
        narrative: 'Record payment volumes on Lightning',
        insights: ['Mass adoption phase'],
        watchlist: ['payment metrics'],
        tone: 'excited'
      });

      // Test with content that advances the recurring "lightning" theme
      const result = nm.checkStorylineAdvancement(
        'New Lightning wallet launched with innovative features',
        ['lightning', 'wallet', 'innovation']
      );

      expect(result).not.toBe(null);
      expect(result.advancesRecurringTheme).toBe(true);
    });

    it('detects content matching watchlist items', async () => {
      // Create digests with watchlist items
      await nm.storeTimelineLore({
        headline: 'Protocol upgrade proposed',
        tags: ['protocol', 'upgrade', 'governance'],
        priority: 'high',
        narrative: 'New protocol upgrade being discussed',
        insights: ['Community debate needed'],
        watchlist: ['upgrade timeline', 'community sentiment'],
        tone: 'anticipatory'
      });

      await nm.storeTimelineLore({
        headline: 'Upgrade discussion intensifies',
        tags: ['protocol', 'debate', 'governance'],
        priority: 'high',
        narrative: 'Heated debate over upgrade',
        insights: ['Polarized opinions'],
        watchlist: ['consensus building', 'technical details'],
        tone: 'tense'
      });

      // Test with content mentioning a watchlist item
      const result = nm.checkStorylineAdvancement(
        'Major breakthrough in achieving consensus on upgrade timeline',
        ['upgrade', 'consensus', 'timeline']
      );

      expect(result).not.toBe(null);
      expect(result.watchlistMatches.length).toBeGreaterThan(0);
      expect(result.watchlistMatches.some(item => 
        item.toLowerCase().includes('upgrade timeline')
      )).toBe(true);
    });

    it('detects content relating to emerging threads', async () => {
      // Create digests where a new topic emerges in the latest
      await nm.storeTimelineLore({
        headline: 'Bitcoin and Ethereum discussion',
        tags: ['bitcoin', 'ethereum'],
        priority: 'medium',
        narrative: 'Comparing bitcoin and ethereum',
        insights: ['Different use cases'],
        watchlist: [],
        tone: 'analytical'
      });

      await nm.storeTimelineLore({
        headline: 'New topic emerges: AI integration',
        tags: ['bitcoin', 'ai', 'innovation'],
        priority: 'high',
        narrative: 'AI tools being integrated',
        insights: ['New frontier'],
        watchlist: ['ai adoption'],
        tone: 'excited'
      });

      // Test with content about the emerging "ai" topic
      const result = nm.checkStorylineAdvancement(
        'Exploring AI applications in bitcoin development',
        ['ai', 'bitcoin', 'development']
      );

      expect(result).not.toBe(null);
      expect(result.isEmergingThread).toBe(true);
    });

    it('handles content with multiple storyline signals', async () => {
      // Create recurring themes with watchlist
      await nm.storeTimelineLore({
        headline: 'Nostr protocol improvements',
        tags: ['nostr', 'protocol', 'development'],
        priority: 'high',
        narrative: 'Nostr protocol getting upgrades',
        insights: ['Active development'],
        watchlist: ['relay improvements', 'client features'],
        tone: 'optimistic'
      });

      await nm.storeTimelineLore({
        headline: 'Nostr adoption accelerates',
        tags: ['nostr', 'adoption', 'growth'],
        priority: 'high',
        narrative: 'More users joining Nostr',
        insights: ['Network effect visible'],
        watchlist: ['user metrics', 'relay performance'],
        tone: 'bullish'
      });

      await nm.storeTimelineLore({
        headline: 'Nostr ecosystem expands with new zaps feature',
        tags: ['nostr', 'zaps', 'innovation'],
        priority: 'high',
        narrative: 'Zaps integration rolling out',
        insights: ['Monetization unlock'],
        watchlist: ['zap adoption'],
        tone: 'excited'
      });

      // Content that advances recurring theme, matches watchlist, AND relates to emerging thread
      const result = nm.checkStorylineAdvancement(
        'Major relay improvements deployed, enhancing zap adoption metrics significantly',
        ['nostr', 'relay', 'zaps', 'metrics']
      );

      expect(result).not.toBe(null);
      expect(result.advancesRecurringTheme).toBe(true);
      expect(result.watchlistMatches.length).toBeGreaterThan(0);
      expect(result.isEmergingThread).toBe(true);
    });

    it('handles content with no storyline signals', async () => {
      // Create unrelated storyline
      await nm.storeTimelineLore({
        headline: 'Bitcoin mining discussion',
        tags: ['bitcoin', 'mining', 'energy'],
        priority: 'medium',
        narrative: 'Mining energy debate',
        insights: ['Renewable energy trends'],
        watchlist: ['energy costs'],
        tone: 'neutral'
      });

      await nm.storeTimelineLore({
        headline: 'Mining difficulty adjustment',
        tags: ['bitcoin', 'mining', 'difficulty'],
        priority: 'low',
        narrative: 'Difficulty adjusted',
        insights: ['Network stability'],
        watchlist: ['hashrate changes'],
        tone: 'neutral'
      });

      // Content about completely different topic
      const result = nm.checkStorylineAdvancement(
        'My cat did something funny today',
        ['cat', 'funny', 'pet']
      );

      expect(result).not.toBe(null);
      expect(result.advancesRecurringTheme).toBe(false);
      expect(result.watchlistMatches.length).toBe(0);
      expect(result.isEmergingThread).toBe(false);
    });

    it('is case-insensitive for theme matching', async () => {
      await nm.storeTimelineLore({
        headline: 'Lightning Network Update',
        tags: ['Lightning', 'Network', 'Update'],
        priority: 'high',
        narrative: 'Lightning update',
        insights: ['Progress'],
        watchlist: ['Network Metrics'],
        tone: 'positive'
      });

      await nm.storeTimelineLore({
        headline: 'Lightning Growth Continues',
        tags: ['LIGHTNING', 'growth'],
        priority: 'medium',
        narrative: 'Lightning growing',
        insights: ['Adoption'],
        watchlist: [],
        tone: 'optimistic'
      });

      // Test with lowercase
      const result = nm.checkStorylineAdvancement(
        'lightning network reaches new milestone',
        ['lightning', 'network', 'milestone']
      );

      expect(result).not.toBe(null);
      expect(result.advancesRecurringTheme).toBe(true);
    });

    it('handles empty topics array gracefully', async () => {
      await nm.storeTimelineLore({
        headline: 'Test headline',
        tags: ['test', 'topic'],
        priority: 'medium',
        narrative: 'Test narrative',
        insights: ['Test insight'],
        watchlist: ['test item'],
        tone: 'neutral'
      });

      await nm.storeTimelineLore({
        headline: 'Another test',
        tags: ['test', 'another'],
        priority: 'medium',
        narrative: 'Another narrative',
        insights: ['Another insight'],
        watchlist: [],
        tone: 'neutral'
      });

      const result = nm.checkStorylineAdvancement('Content about test', []);
      
      expect(result).not.toBe(null);
      // Should still detect if content matches theme
      expect(result.advancesRecurringTheme).toBe(true);
    });
  });

  describe('Integration with analyzeLoreContinuity', () => {
    it('uses continuity analysis results correctly', async () => {
      // Build a storyline with clear evolution
      const now = Date.now();
      
      await nm.storeTimelineLore({
        id: 'digest-1',
        headline: 'Bitcoin rally begins',
        tags: ['bitcoin', 'price', 'rally'],
        priority: 'medium',
        narrative: 'Bitcoin starting to rally',
        insights: ['Momentum building'],
        watchlist: ['price targets', 'volume'],
        tone: 'bullish',
        timestamp: now - 3600000 * 3
      });

      await nm.storeTimelineLore({
        id: 'digest-2',
        headline: 'Bitcoin rally continues',
        tags: ['bitcoin', 'price', 'momentum'],
        priority: 'high',
        narrative: 'Strong momentum',
        insights: ['Breaking resistance'],
        watchlist: ['$50k target', 'institutional buying'],
        tone: 'excited',
        timestamp: now - 3600000 * 2
      });

      await nm.storeTimelineLore({
        id: 'digest-3',
        headline: 'Bitcoin hits price targets',
        tags: ['bitcoin', 'price', 'milestone'],
        priority: 'high',
        narrative: 'Major milestone reached',
        insights: ['$50k achieved'],
        watchlist: ['consolidation', 'next resistance'],
        tone: 'euphoric',
        timestamp: now - 3600000
      });

      // Verify continuity analysis is working
      const continuity = await nm.analyzeLoreContinuity(3);
      expect(continuity).not.toBe(null);
      expect(continuity.recurringThemes).toContain('bitcoin');
      expect(continuity.recurringThemes).toContain('price');

      // Test storyline advancement detection
      const result = nm.checkStorylineAdvancement(
        'Bitcoin consolidates at $50k target with institutional buying accelerating',
        ['bitcoin', 'price', 'institutional']
      );

      expect(result).not.toBe(null);
      expect(result.advancesRecurringTheme).toBe(true);
      expect(result.watchlistMatches).toContain('$50k target');
      expect(result.watchlistMatches).toContain('institutional buying');
    });
  });
});
