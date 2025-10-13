const { describe, it, expect, beforeEach } = globalThis;

// Mock dependencies
let NarrativeMemory;
let NostrService;

describe('Novelty-Based Candidate Scoring', () => {
  let narrativeMemory;
  let mockLogger;
  let mockRuntime;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {}
    };

    // Create mock runtime
    mockRuntime = {
      getSetting: () => null
    };

    // Lazy load to avoid import issues in test environment
    if (!NarrativeMemory) {
      const { NarrativeMemory: NM } = require('../lib/narrativeMemory.js');
      NarrativeMemory = NM;
    }

    narrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);
  });

  describe('getTopicRecency', () => {
    it('returns zero mentions for new topic', () => {
      const recency = narrativeMemory.getTopicRecency('quantum-computing', 24);
      expect(recency.mentions).toBe(0);
      expect(recency.lastSeen).toBe(null);
    });

    it('counts mentions of a topic in recent timeline lore', () => {
      // Add timeline lore entries with topics
      const now = Date.now();
      narrativeMemory.timelineLore = [
        {
          timestamp: now - 1000 * 60 * 60, // 1 hour ago
          tags: ['bitcoin', 'lightning']
        },
        {
          timestamp: now - 1000 * 60 * 60 * 2, // 2 hours ago
          tags: ['bitcoin', 'nostr']
        },
        {
          timestamp: now - 1000 * 60 * 60 * 3, // 3 hours ago
          tags: ['bitcoin', 'freedom']
        }
      ];

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBe(3);
      expect(recency.lastSeen).toBeGreaterThan(0);
    });

    it('respects lookback window', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        {
          timestamp: now - 1000 * 60 * 60, // 1 hour ago
          tags: ['bitcoin']
        },
        {
          timestamp: now - 1000 * 60 * 60 * 25, // 25 hours ago (outside 24h window)
          tags: ['bitcoin']
        }
      ];

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBe(1); // Only counts the recent one
    });

    it('is case-insensitive', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        {
          timestamp: now - 1000 * 60 * 60,
          tags: ['Bitcoin', 'NOSTR', 'lightning']
        }
      ];

      expect(narrativeMemory.getTopicRecency('bitcoin', 24).mentions).toBe(1);
      expect(narrativeMemory.getTopicRecency('nostr', 24).mentions).toBe(1);
      expect(narrativeMemory.getTopicRecency('LIGHTNING', 24).mentions).toBe(1);
    });

    it('handles empty timeline lore', () => {
      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBe(0);
      expect(recency.lastSeen).toBe(null);
    });

    it('handles missing tags in entries', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        {
          timestamp: now - 1000 * 60 * 60,
          // no tags field
        },
        {
          timestamp: now - 1000 * 60 * 60 * 2,
          tags: null
        },
        {
          timestamp: now - 1000 * 60 * 60 * 3,
          tags: ['bitcoin']
        }
      ];

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBe(1);
    });
  });

  describe('_getLastTopicMention', () => {
    it('returns null for topic that was never mentioned', () => {
      const lastSeen = narrativeMemory._getLastTopicMention('quantum-computing');
      expect(lastSeen).toBe(null);
    });

    it('returns timestamp of most recent mention', () => {
      const now = Date.now();
      const timestamps = [
        now - 1000 * 60 * 60 * 3, // oldest
        now - 1000 * 60 * 60 * 2,
        now - 1000 * 60 * 60 // newest
      ];

      narrativeMemory.timelineLore = [
        { timestamp: timestamps[0], tags: ['bitcoin'] },
        { timestamp: timestamps[1], tags: ['bitcoin'] },
        { timestamp: timestamps[2], tags: ['bitcoin'] }
      ];

      const lastSeen = narrativeMemory._getLastTopicMention('bitcoin');
      expect(lastSeen).toBe(timestamps[2]);
    });

    it('is case-insensitive', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now, tags: ['Bitcoin'] }
      ];

      expect(narrativeMemory._getLastTopicMention('bitcoin')).toBe(now);
      expect(narrativeMemory._getLastTopicMention('BITCOIN')).toBe(now);
      expect(narrativeMemory._getLastTopicMention('BiTcOiN')).toBe(now);
    });

    it('handles invalid input', () => {
      expect(narrativeMemory._getLastTopicMention(null)).toBe(null);
      expect(narrativeMemory._getLastTopicMention(undefined)).toBe(null);
      expect(narrativeMemory._getLastTopicMention('')).toBe(null);
    });
  });

  describe('Novelty scoring integration', () => {
    it('should detect frequently covered topics', () => {
      const now = Date.now();
      // Simulate bitcoin being mentioned 5 times in last 24h
      narrativeMemory.timelineLore = Array(5).fill(null).map((_, i) => ({
        timestamp: now - (i * 1000 * 60 * 60), // Spread over 5 hours
        tags: ['bitcoin']
      }));

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBeGreaterThan(3); // Should trigger penalty
    });

    it('should identify new topics', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin', 'lightning'] },
        { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin', 'nostr'] }
      ];

      // quantum-computing is new
      const recency = narrativeMemory.getTopicRecency('quantum-computing', 24);
      expect(recency.mentions).toBe(0); // Should trigger bonus
    });

    it('should handle topics mentioned exactly once', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin'] }
      ];

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBe(1);
      // Between 0 (bonus) and >3 (penalty) - no adjustment
    });

    it('should track multiple topics independently', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin', 'ai'] },
        { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin', 'ai'] },
        { timestamp: now - 1000 * 60 * 60 * 3, tags: ['bitcoin', 'ai'] },
        { timestamp: now - 1000 * 60 * 60 * 4, tags: ['bitcoin', 'ai'] },
        { timestamp: now - 1000 * 60 * 60 * 5, tags: ['bitcoin'] }
      ];

      const bitcoinRecency = narrativeMemory.getTopicRecency('bitcoin', 24);
      const aiRecency = narrativeMemory.getTopicRecency('ai', 24);
      
      expect(bitcoinRecency.mentions).toBe(5); // Overexposed
      expect(aiRecency.mentions).toBe(4); // Also overexposed
    });
  });

  describe('Scoring scenarios', () => {
    it('new topic should get bonus points', () => {
      // Simulate a post with a completely new topic
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin', 'lightning'] }
      ];

      const newTopicRecency = narrativeMemory.getTopicRecency('quantum-ai', 24);
      expect(newTopicRecency.mentions).toBe(0);
      // In scoring logic, this would add +0.4 to the score
    });

    it('overexposed topic should get penalty', () => {
      const now = Date.now();
      // Bitcoin mentioned 4 times (> 3 threshold)
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 3, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 4, tags: ['bitcoin'] }
      ];

      const recency = narrativeMemory.getTopicRecency('bitcoin', 24);
      expect(recency.mentions).toBeGreaterThan(3);
      // In scoring logic, this would subtract -0.5 from the score
    });

    it('mixed topics should apply both adjustments', () => {
      const now = Date.now();
      narrativeMemory.timelineLore = [
        { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 3, tags: ['bitcoin'] },
        { timestamp: now - 1000 * 60 * 60 * 4, tags: ['bitcoin'] }
      ];

      // Post has both overexposed topic (bitcoin) and new topic (quantum-ai)
      const bitcoinRecency = narrativeMemory.getTopicRecency('bitcoin', 24);
      const quantumRecency = narrativeMemory.getTopicRecency('quantum-ai', 24);

      expect(bitcoinRecency.mentions).toBeGreaterThan(3); // -0.5 penalty
      expect(quantumRecency.mentions).toBe(0); // +0.4 bonus
      // Net adjustment: -0.1
    });
  });
});
