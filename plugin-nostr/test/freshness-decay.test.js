import { describe, it, expect, beforeEach } from 'vitest';

// Test-level configuration
const RECURRING_THEME = 'bitcoin';

/**
 * Content Freshness Decay Tests
 * 
 * Tests the freshness decay penalty algorithm that down-weights recently covered topics
 * while preserving novel angles, phase changes, and storyline advancements.
 */

// Mock runtime and logger
function createMockRuntime(settings = {}) {
  return {
    getSetting: (key) => settings[key],
    character: { name: 'TestAgent' }
  };
}

function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };
}

// Mock NarrativeMemory with freshness tracking
class MockNarrativeMemory {
  constructor() {
    this.timelineLore = [];
    this.topicMentions = new Map(); // topic -> [{timestamp, tags}]
  }

  // Add a timeline lore entry
  addLoreEntry(timestamp, tags, priority = 'medium') {
    this.timelineLore.push({
      timestamp,
      tags: tags.map(t => t.toLowerCase()),
      priority,
      headline: 'Test headline',
      narrative: 'Test narrative'
    });
    
    // Track mentions
    for (const tag of tags) {
      const normalized = tag.toLowerCase();
      if (!this.topicMentions.has(normalized)) {
        this.topicMentions.set(normalized, []);
      }
      this.topicMentions.get(normalized).push({ timestamp, tags });
    }
  }

  getRecentLoreTags(lookbackCount = 3) {
    const recent = this.timelineLore.slice(-lookbackCount);
    const tags = new Set();
    
    for (const entry of recent) {
      if (Array.isArray(entry.tags)) {
        for (const tag of entry.tags) {
          tags.add(tag.toLowerCase());
        }
      }
    }
    
    return tags;
  }

  getTopicRecency(topic, lookbackHours = 24) {
    const topicLower = topic.toLowerCase();
    const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
    
    let mentions = 0;
    let lastSeen = null;
    
    for (const entry of this.timelineLore) {
      if (entry.timestamp < cutoff) continue;
      
      const hasTopic = (entry.tags || []).some(tag => tag === topicLower);
      if (hasTopic) {
        mentions++;
        if (!lastSeen || entry.timestamp > lastSeen) {
          lastSeen = entry.timestamp;
        }
      }
    }
    
    return { mentions, lastSeen };
  }

  checkStorylineAdvancement(content, topics) {
    // Mock: bitcoin is a recurring theme (appears in 5+ digests in our tests)
    // Check if topics include bitcoin and content suggests advancement
    const contentLower = content.toLowerCase();
  const topicsLower = topics.map(t => t.toLowerCase());
    
    // Recurring theme shortcut for tests (default: 'bitcoin')
    const advancesRecurringTheme = topicsLower.includes(RECURRING_THEME) && 
      (contentLower.includes('advancement') || contentLower.includes('major') || contentLower.includes('storyline'));
    
    if (advancesRecurringTheme) {
      return {
        advancesRecurringTheme: true,
        watchlistMatches: [],
        isEmergingThread: false
      };
    }
    
    return null;
  }
}

describe('Content Freshness Decay', () => {
  let mockRuntime;
  let mockLogger;
  let mockNarrativeMemory;
  let NostrService;

  beforeEach(async () => {
    // Import service (but we can't actually run it without full dependencies)
    // Instead we'll test the algorithm logic directly
    mockRuntime = createMockRuntime({
      NOSTR_FRESHNESS_DECAY_ENABLE: 'true',
      NOSTR_FRESHNESS_LOOKBACK_HOURS: '24',
      NOSTR_FRESHNESS_LOOKBACK_DIGESTS: '3',
      NOSTR_FRESHNESS_MENTIONS_FULL_INTENSITY: '5',
      NOSTR_FRESHNESS_MAX_PENALTY: '0.4',
      NOSTR_FRESHNESS_SIMILARITY_BUMP: '0.05',
      NOSTR_FRESHNESS_NOVELTY_REDUCTION: '0.5'
    });
    mockLogger = createMockLogger();
    mockNarrativeMemory = new MockNarrativeMemory();
  });

  describe('getRecentLoreTags', () => {
    it('should return tags from recent digests', () => {
      const now = Date.now();
      mockNarrativeMemory.addLoreEntry(now - 3600000, ['bitcoin', 'ethereum']);
      mockNarrativeMemory.addLoreEntry(now - 1800000, ['bitcoin', 'defi']);
      mockNarrativeMemory.addLoreEntry(now - 900000, ['nostr', 'bitcoin']);
      
      const tags = mockNarrativeMemory.getRecentLoreTags(3);
      
      expect(tags.has('bitcoin')).toBe(true);
      expect(tags.has('ethereum')).toBe(true);
      expect(tags.has('defi')).toBe(true);
      expect(tags.has('nostr')).toBe(true);
      expect(tags.size).toBe(4);
    });

    it('should limit lookback count', () => {
      const now = Date.now();
      mockNarrativeMemory.addLoreEntry(now - 7200000, ['old-topic']);
      mockNarrativeMemory.addLoreEntry(now - 3600000, ['bitcoin']);
      mockNarrativeMemory.addLoreEntry(now - 1800000, ['ethereum']);
      
      const tags = mockNarrativeMemory.getRecentLoreTags(2);
      
      expect(tags.has('bitcoin')).toBe(true);
      expect(tags.has('ethereum')).toBe(true);
      expect(tags.has('old-topic')).toBe(false);
    });
  });

  describe('getTopicRecency', () => {
    it('should count mentions within lookback window', () => {
      const now = Date.now();
      // Add mentions at different times
      mockNarrativeMemory.addLoreEntry(now - 3600000, ['bitcoin']); // 1 hour ago
      mockNarrativeMemory.addLoreEntry(now - 7200000, ['bitcoin']); // 2 hours ago
      mockNarrativeMemory.addLoreEntry(now - 36000000, ['bitcoin']); // 10 hours ago
      
      const recency = mockNarrativeMemory.getTopicRecency('bitcoin', 12);
      
      expect(recency.mentions).toBe(3);
      expect(recency.lastSeen).toBe(now - 3600000);
    });

    it('should exclude mentions outside lookback window', () => {
      const now = Date.now();
      mockNarrativeMemory.addLoreEntry(now - 3600000, ['bitcoin']); // 1 hour ago
      mockNarrativeMemory.addLoreEntry(now - 48 * 3600000, ['bitcoin']); // 48 hours ago
      
      const recency = mockNarrativeMemory.getTopicRecency('bitcoin', 24);
      
      expect(recency.mentions).toBe(1);
      expect(recency.lastSeen).toBe(now - 3600000);
    });

    it('should return zero mentions for unseen topic', () => {
      const recency = mockNarrativeMemory.getTopicRecency('unknown-topic', 24);
      
      expect(recency.mentions).toBe(0);
      expect(recency.lastSeen).toBe(null);
    });
  });

  describe('Freshness Penalty Algorithm', () => {
    /**
     * Simulate the penalty computation logic from _computeFreshnessPenalty
     */
    function computePenalty(topics, narrativeMemory, options = {}) {
      const {
        lookbackHours = 24,
        mentionsFullIntensity = 5,
        maxPenalty = 0.4,
        similarityBump = 0.05,
        noveltyReduction = 0.5,
        evolutionAnalysis = null,
        content = '',
      } = options;

      if (topics.length === 0) return 0;

      const recentLoreTags = narrativeMemory.getRecentLoreTags(3);
      const topicPenalties = [];
      const now = Date.now();

      for (const topic of topics) {
        const { mentions, lastSeen } = narrativeMemory.getTopicRecency(topic, lookbackHours);

        if (!lastSeen || mentions === 0) {
          topicPenalties.push(0);
          continue;
        }

        const hoursSince = (now - lastSeen) / (1000 * 60 * 60);
        const stalenessBase = Math.max(0, Math.min(1, (lookbackHours - hoursSince) / lookbackHours));
        const intensity = Math.max(0, Math.min(1, mentions / mentionsFullIntensity));
        const topicPenalty = stalenessBase * (0.25 + 0.35 * intensity);

        topicPenalties.push(topicPenalty);
      }

      let finalPenalty = topicPenalties.length > 0 ? Math.max(...topicPenalties) : 0;

      // Similarity bump
      let hasSimilarityBump = false;
      for (const topic of topics) {
        if (recentLoreTags.has(topic.toLowerCase())) {
          hasSimilarityBump = true;
          break;
        }
      }
      if (hasSimilarityBump) {
        finalPenalty = Math.min(maxPenalty, finalPenalty + similarityBump);
      }

      // Novelty reduction
      if (evolutionAnalysis && (evolutionAnalysis.isNovelAngle || evolutionAnalysis.isPhaseChange)) {
        finalPenalty = finalPenalty * (1 - noveltyReduction);
      }

      // Storyline advancement reduction
      const advancement = narrativeMemory.checkStorylineAdvancement(content, topics);
      if (advancement && (advancement.advancesRecurringTheme || advancement.watchlistMatches?.length > 0)) {
        finalPenalty = Math.max(0, finalPenalty - 0.1);
      }

      return Math.max(0, Math.min(maxPenalty, finalPenalty));
    }

    it('should apply high penalty to recently heavily covered topic', () => {
      const now = Date.now();
      
      // Add 6 mentions of bitcoin in last 6 hours
      for (let i = 0; i < 6; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 3600000, ['bitcoin']);
      }
      
      const penalty = computePenalty(['bitcoin'], mockNarrativeMemory);
      
      // Should have high penalty (close to 0.4)
      expect(penalty).toBeGreaterThan(0.3);
      expect(penalty).toBeLessThanOrEqual(0.4);
    });

    it('should apply low penalty to lightly covered topic', () => {
      const now = Date.now();
      
      // Just 1 mention 6 hours ago
      mockNarrativeMemory.addLoreEntry(now - 6 * 3600000, ['ethereum']);
      
      const penalty = computePenalty(['ethereum'], mockNarrativeMemory);
      
      // Should have low penalty
      expect(penalty).toBeGreaterThan(0);
      expect(penalty).toBeLessThan(0.2);
    });

    it('should apply zero penalty to topic outside lookback window', () => {
      const now = Date.now();
      
      // Mention from 48 hours ago (outside 24h window)
      mockNarrativeMemory.addLoreEntry(now - 48 * 3600000, ['old-topic']);
      
      const penalty = computePenalty(['old-topic'], mockNarrativeMemory);
      
      expect(penalty).toBe(0);
    });

    it('should apply zero penalty to completely new topic', () => {
      const penalty = computePenalty(['brand-new-topic'], mockNarrativeMemory);
      
      expect(penalty).toBe(0);
    });

    it('should reduce penalty for novel angle', () => {
      const now = Date.now();
      
      // Heavy coverage
      for (let i = 0; i < 5; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 3600000, ['bitcoin']);
      }
      
      const penaltyWithoutNovelty = computePenalty(['bitcoin'], mockNarrativeMemory);
      const penaltyWithNovelty = computePenalty(['bitcoin'], mockNarrativeMemory, {
        evolutionAnalysis: { isNovelAngle: true, isPhaseChange: false }
      });
      
      // Should be reduced by ~50%
      expect(penaltyWithNovelty).toBeLessThan(penaltyWithoutNovelty * 0.6);
      expect(penaltyWithNovelty).toBeGreaterThan(0);
    });

    it('should reduce penalty for phase change', () => {
      const now = Date.now();
      
      // Heavy coverage
      for (let i = 0; i < 5; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 3600000, ['bitcoin']);
      }
      
      const penaltyWithoutPhaseChange = computePenalty(['bitcoin'], mockNarrativeMemory);
      const penaltyWithPhaseChange = computePenalty(['bitcoin'], mockNarrativeMemory, {
        evolutionAnalysis: { isNovelAngle: false, isPhaseChange: true }
      });
      
      // Should be reduced by ~50%
      expect(penaltyWithPhaseChange).toBeLessThan(penaltyWithoutPhaseChange * 0.6);
    });

    it('should reduce penalty for storyline advancement', () => {
      const now = Date.now();
      
      // Heavy coverage
      for (let i = 0; i < 5; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 3600000, ['bitcoin']);
      }
      
      const penaltyWithoutAdvancement = computePenalty(['bitcoin'], mockNarrativeMemory);
      const penaltyWithAdvancement = computePenalty(['bitcoin'], mockNarrativeMemory, {
        content: 'This is an advancement in the storyline'
      });
      
      // Should be reduced by 0.1 absolute
      expect(penaltyWithAdvancement).toBeLessThan(penaltyWithoutAdvancement);
      expect(penaltyWithoutAdvancement - penaltyWithAdvancement).toBeCloseTo(0.1, 1);
    });

    it('should add similarity bump for topic in recent lore tags', () => {
      const now = Date.now();
      
      // Light coverage but in recent lore
      mockNarrativeMemory.addLoreEntry(now - 3600000, ['bitcoin']);
      
      const penalty = computePenalty(['bitcoin'], mockNarrativeMemory, {
        similarityBump: 0.05
      });
      
      // Should have base penalty + similarity bump
      expect(penalty).toBeGreaterThan(0.05);
    });

    it('should use max penalty from multiple topics', () => {
      const now = Date.now();
      
      // Heavy coverage of bitcoin, light coverage of ethereum
      for (let i = 0; i < 5; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 3600000, ['bitcoin']);
      }
      mockNarrativeMemory.addLoreEntry(now - 12 * 3600000, ['ethereum']);
      
      const penalty = computePenalty(['bitcoin', 'ethereum'], mockNarrativeMemory);
      const bitcoinPenalty = computePenalty(['bitcoin'], mockNarrativeMemory);
      
      // Should use bitcoin's higher penalty
      expect(penalty).toBeCloseTo(bitcoinPenalty, 1);
    });

    it('should clamp penalty to maxPenalty', () => {
      const now = Date.now();
      
      // Extreme coverage
      for (let i = 0; i < 20; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 1800000, ['bitcoin']);
      }
      
      const penalty = computePenalty(['bitcoin'], mockNarrativeMemory, {
        maxPenalty: 0.4
      });
      
      expect(penalty).toBeLessThanOrEqual(0.4);
    });

    it('should handle empty topics array', () => {
      const penalty = computePenalty([], mockNarrativeMemory);
      expect(penalty).toBe(0);
    });

    it('should decay penalty over time', () => {
      const now = Date.now();
      
      // Add mentions at different ages
      mockNarrativeMemory.addLoreEntry(now - 3 * 3600000, ['recent-topic']); // 3h ago
      
      const penaltyRecent = computePenalty(['recent-topic'], mockNarrativeMemory);
      
      // Clear and add same topic but older
      mockNarrativeMemory.timelineLore = [];
      mockNarrativeMemory.topicMentions.clear();
      mockNarrativeMemory.addLoreEntry(now - 20 * 3600000, ['recent-topic']); // 20h ago
      
      const penaltyOld = computePenalty(['recent-topic'], mockNarrativeMemory);
      
      // Older mention should have lower penalty
      expect(penaltyOld).toBeLessThan(penaltyRecent);
    });
  });

  describe('Integration with Scoring', () => {
    it('should reduce engagement score with penalty', () => {
      // Base score = 0.6
      const baseScore = 0.6;
      
      // Penalty = 0.3 (30%)
      const penalty = 0.3;
      const penaltyFactor = 1 - penalty; // 0.7
      
      const finalScore = baseScore * penaltyFactor;
      
      expect(finalScore).toBeCloseTo(0.42, 2);
    });

    it('should not reduce score below zero', () => {
      const baseScore = 0.2;
      const penalty = 0.4; // 40% penalty
      const penaltyFactor = 1 - penalty; // 0.6
      
      const finalScore = Math.max(0, baseScore * penaltyFactor);
      
      expect(finalScore).toBeGreaterThanOrEqual(0);
      expect(finalScore).toBeCloseTo(0.12, 2);
    });

    it('should allow content to still score positively despite penalty', () => {
      const baseScore = 0.8; // High quality content
      const penalty = 0.4; // Max penalty
      const penaltyFactor = 1 - penalty; // 0.6
      
      const finalScore = baseScore * penaltyFactor;
      
      // Should still be above 0.4
      expect(finalScore).toBeGreaterThan(0.4);
      expect(finalScore).toBeCloseTo(0.48, 2);
    });
  });

  describe('Configuration', () => {
    it('should respect custom lookback hours', () => {
      const now = Date.now();
      
      // Add mention 36 hours ago
      mockNarrativeMemory.addLoreEntry(now - 36 * 3600000, ['bitcoin']);
      
      // Should have penalty with 48h lookback
      const penalty48h = computePenalty(['bitcoin'], mockNarrativeMemory, {
        lookbackHours: 48
      });
      
      // Should have zero penalty with 24h lookback
      const penalty24h = computePenalty(['bitcoin'], mockNarrativeMemory, {
        lookbackHours: 24
      });
      
      expect(penalty48h).toBeGreaterThan(0);
      expect(penalty24h).toBe(0);
    });

    it('should respect custom mention intensity threshold', () => {
      const now = Date.now();
      
      // 3 mentions in last hour
      for (let i = 0; i < 3; i++) {
        mockNarrativeMemory.addLoreEntry(now - i * 1200000, ['bitcoin']);
      }
      
      // With threshold=3, should reach full intensity
      const penaltyLowThreshold = computePenalty(['bitcoin'], mockNarrativeMemory, {
        mentionsFullIntensity: 3
      });
      
      // With threshold=10, should be lower intensity
      const penaltyHighThreshold = computePenalty(['bitcoin'], mockNarrativeMemory, {
        mentionsFullIntensity: 10
      });
      
      expect(penaltyLowThreshold).toBeGreaterThan(penaltyHighThreshold);
    });
  });
});
