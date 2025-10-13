const { describe, it, expect, beforeEach, vi } = globalThis;

const { TopicEvolutionTracker, PHASE_TAXONOMY } = require('../lib/topicEvolution');

describe('TopicEvolutionTracker', () => {
  let tracker;
  let mockRuntime;
  let mockNarrativeMemory;
  let mockSemanticAnalyzer;
  let mockLogger;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock runtime with generateText
    mockRuntime = {
      generateText: vi.fn()
    };

    // Mock narrative memory with cluster management
    mockNarrativeMemory = {
      getTopicCluster: vi.fn((topic) => ({
        subtopics: new Set(),
        entries: [],
        lastPhase: null,
        lastMentions: new Map()
      })),
      updateTopicCluster: vi.fn()
    };

    // Mock semantic analyzer
    mockSemanticAnalyzer = {
      llmSemanticEnabled: true
    };

    // Create tracker instance
    tracker = new TopicEvolutionTracker(
      mockRuntime,
      mockNarrativeMemory,
      mockSemanticAnalyzer,
      mockLogger
    );
  });

  describe('analyzeEvolution', () => {
    it('returns default response when topic or content is missing', async () => {
      const result = await tracker.analyzeEvolution('', 'content');
      expect(result.evolutionScore).toBe(0);
      expect(result.phase).toBe('general');
      expect(result.isNovelAngle).toBe(false);
    });

    it('analyzes evolution and generates signals', async () => {
      mockRuntime.generateText.mockResolvedValue('bitcoin price');

      const result = await tracker.analyzeEvolution(
        'bitcoin',
        'Bitcoin price volatility is increasing with recent market movements',
        { trending: ['bitcoin', 'price'], watchlist: [] }
      );

      expect(result).toHaveProperty('subtopic');
      expect(result).toHaveProperty('isNovelAngle');
      expect(result).toHaveProperty('isPhaseChange');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('evolutionScore');
      expect(result).toHaveProperty('signals');
      expect(Array.isArray(result.signals)).toBe(true);
    });

    it('detects novel angles for new subtopics', async () => {
      mockRuntime.generateText.mockResolvedValue('bitcoin ETF');

      // Empty cluster = novel
      mockNarrativeMemory.getTopicCluster.mockReturnValue({
        subtopics: new Set(),
        entries: [],
        lastPhase: null,
        lastMentions: new Map()
      });

      const result = await tracker.analyzeEvolution(
        'bitcoin',
        'Bitcoin ETF approval announcement expected soon'
      );

      expect(result.isNovelAngle).toBe(true);
      expect(result.signals.some(s => s.includes('novel angle'))).toBe(true);
    });

    it('detects phase changes', async () => {
      mockRuntime.generateText.mockResolvedValue('bitcoin announcement');

      // Cluster with different phase
      mockNarrativeMemory.getTopicCluster.mockReturnValue({
        subtopics: new Set(['bitcoin speculation']),
        entries: [{ phase: 'speculation', timestamp: Date.now() - 1000 }],
        lastPhase: 'speculation',
        lastMentions: new Map()
      });

      const result = await tracker.analyzeEvolution(
        'bitcoin',
        'Official announcement: Bitcoin ETF approved by SEC'
      );

      expect(result.phase).toBe('announcement');
      expect(result.isPhaseChange).toBe(true);
      expect(result.signals.some(s => s.includes('phase shift'))).toBe(true);
    });

    it('calculates evolution score based on novelty and phase change', async () => {
      mockRuntime.generateText.mockResolvedValue('bitcoin adoption');

      mockNarrativeMemory.getTopicCluster.mockReturnValue({
        subtopics: new Set(['bitcoin price']),
        entries: [
          { subtopic: 'bitcoin price', phase: 'speculation', timestamp: Date.now() - 10000 }
        ],
        lastPhase: 'speculation',
        lastMentions: new Map([['bitcoin price', Date.now() - 10000]])
      });

      const result = await tracker.analyzeEvolution(
        'bitcoin',
        'Major companies now accepting Bitcoin as payment - widespread adoption'
      );

      expect(result.isNovelAngle).toBe(true);
      expect(result.phase).toBe('adoption');
      expect(result.evolutionScore).toBeGreaterThan(0);
    });
  });

  describe('labelSubtopic', () => {
    it('uses LLM when enabled and available', async () => {
      mockRuntime.generateText.mockResolvedValue('price volatility');

      const subtopic = await tracker.labelSubtopic(
        'bitcoin',
        'Bitcoin price swings wildly as market reacts to news'
      );

      expect(mockRuntime.generateText).toHaveBeenCalled();
      expect(subtopic).toBe('price volatility');
    });

    it('falls back to heuristics when LLM fails', async () => {
      mockRuntime.generateText.mockRejectedValue(new Error('LLM unavailable'));

      const subtopic = await tracker.labelSubtopic(
        'bitcoin',
        'Bitcoin development continues with new protocol updates'
      );

      expect(subtopic).toContain('development');
    });

    it('uses fallback when LLM disabled', async () => {
      tracker.llmEnabled = false;

      const subtopic = await tracker.labelSubtopic(
        'lightning',
        'Lightning network adoption growing rapidly among users'
      );

      expect(subtopic).toContain('adoption');
    });

    it('caches subtopic labels', async () => {
      mockRuntime.generateText.mockResolvedValue('technical analysis');

      const content = 'Bitcoin technical indicators show bullish trends';
      
      await tracker.labelSubtopic('bitcoin', content);
      await tracker.labelSubtopic('bitcoin', content);

      // Should only call LLM once due to caching
      expect(mockRuntime.generateText).toHaveBeenCalledTimes(1);
    });

    it('includes context hints in LLM prompt', async () => {
      mockRuntime.generateText.mockResolvedValue('regulatory news');

      await tracker.labelSubtopic(
        'bitcoin',
        'SEC announces new rules',
        { trending: ['regulation', 'SEC'], watchlist: ['ETF approval'] }
      );

      const call = mockRuntime.generateText.mock.calls[0][0];
      expect(call).toContain('Trending');
      expect(call).toContain('Watchlist');
    });
  });

  describe('detectPhase', () => {
    it('detects speculation phase', async () => {
      const content = 'Rumor has it that Bitcoin might reach new highs soon';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('speculation');
    });

    it('detects announcement phase', async () => {
      const content = 'Official release: Bitcoin ETF approved by regulators';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('announcement');
    });

    it('detects analysis phase', async () => {
      const content = 'Deep dive technical analysis of Bitcoin network upgrades';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('analysis');
    });

    it('detects adoption phase', async () => {
      const content = 'Companies implementing Bitcoin payments in production systems';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('adoption');
    });

    it('detects backlash phase', async () => {
      const content = 'Major criticism and controversy surrounding Bitcoin energy usage';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('backlash');
    });

    it('defaults to general phase when no keywords match', async () => {
      const content = 'Just talking about Bitcoin in general';
      const phase = await tracker.detectPhase(content, {});

      expect(phase).toBe('general');
    });

    it('uses LLM for ambiguous cases with history', async () => {
      tracker.llmEnabled = true;
      mockRuntime.generateText.mockResolvedValue('adoption');

      const cluster = {
        entries: [
          { phase: 'speculation', timestamp: Date.now() - 10000 },
          { phase: 'announcement', timestamp: Date.now() - 5000 },
          { phase: 'analysis', timestamp: Date.now() - 2000 }
        ]
      };

      const phase = await tracker.detectPhase('Complex content without clear keywords', cluster);

      expect(mockRuntime.generateText).toHaveBeenCalled();
      expect(phase).toBe('adoption');
    });
  });

  describe('scoreEvolution', () => {
    it('gives high score for novel angle and phase change', () => {
      const cluster = {
        subtopics: new Set(['topic1']),
        entries: [{ subtopic: 'topic1', timestamp: Date.now() - 1000 }]
      };

      const score = tracker.scoreEvolution(cluster, 'new-topic', true, true);

      expect(score).toBeGreaterThan(0.6); // novelty + phaseChange weights
    });

    it('gives lower score for existing subtopic without phase change', () => {
      const cluster = {
        subtopics: new Set(['existing']),
        entries: [{ subtopic: 'existing', timestamp: Date.now() - 1000 }]
      };

      const score = tracker.scoreEvolution(cluster, 'existing', false, false);

      expect(score).toBeLessThan(0.5);
    });

    it('factors in diversity score', () => {
      const diverseCluster = {
        subtopics: new Set(['topic1', 'topic2', 'topic3', 'topic4']),
        entries: [
          { subtopic: 'topic1' },
          { subtopic: 'topic2' },
          { subtopic: 'topic3' },
          { subtopic: 'topic4' }
        ]
      };

      const score = tracker.scoreEvolution(diverseCluster, 'topic5', true, false);

      expect(score).toBeGreaterThan(0);
    });

    it('normalizes score to 0-1 range', () => {
      const cluster = {
        subtopics: new Set(),
        entries: []
      };

      const score = tracker.scoreEvolution(cluster, 'topic', true, true);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('_isNovelAngle', () => {
    it('returns true for first mention', () => {
      const emptyCluster = {
        subtopics: new Set(),
        lastMentions: new Map()
      };

      const isNovel = tracker._isNovelAngle(emptyCluster, 'new subtopic');
      expect(isNovel).toBe(true);
    });

    it('returns false for recently mentioned subtopic', () => {
      const cluster = {
        subtopics: new Set(['existing']),
        lastMentions: new Map([['existing', Date.now() - 1000]]) // 1 second ago
      };

      const isNovel = tracker._isNovelAngle(cluster, 'existing');
      expect(isNovel).toBe(false);
    });

    it('returns true if subtopic not mentioned in 24+ hours', () => {
      const cluster = {
        subtopics: new Set(['old']),
        lastMentions: new Map([['old', Date.now() - 25 * 60 * 60 * 1000]]) // 25 hours ago
      };

      const isNovel = tracker._isNovelAngle(cluster, 'old');
      expect(isNovel).toBe(true);
    });

    it('returns false for similar subtopics', () => {
      const cluster = {
        subtopics: new Set(['bitcoin price volatility']),
        lastMentions: new Map()
      };

      const isNovel = tracker._isNovelAngle(cluster, 'bitcoin price swings');
      expect(isNovel).toBe(false); // Similar words = not novel
    });
  });

  describe('_areSimilarSubtopics', () => {
    it('detects similar subtopics with word overlap', () => {
      const similar = tracker._areSimilarSubtopics(
        'bitcoin price volatility',
        'bitcoin price swings'
      );
      expect(similar).toBe(true);
    });

    it('detects different subtopics', () => {
      const similar = tracker._areSimilarSubtopics(
        'bitcoin price',
        'lightning adoption'
      );
      expect(similar).toBe(false);
    });
  });

  describe('PHASE_TAXONOMY', () => {
    it('includes all expected phases', () => {
      expect(PHASE_TAXONOMY).toHaveProperty('speculation');
      expect(PHASE_TAXONOMY).toHaveProperty('announcement');
      expect(PHASE_TAXONOMY).toHaveProperty('analysis');
      expect(PHASE_TAXONOMY).toHaveProperty('adoption');
      expect(PHASE_TAXONOMY).toHaveProperty('backlash');
      expect(PHASE_TAXONOMY).toHaveProperty('general');
    });

    it('has keywords for each phase', () => {
      for (const [phase, data] of Object.entries(PHASE_TAXONOMY)) {
        expect(data).toHaveProperty('keywords');
        expect(data).toHaveProperty('description');
        expect(Array.isArray(data.keywords)).toBe(true);
      }
    });
  });

  describe('getStats', () => {
    it('returns tracker statistics', () => {
      const stats = tracker.getStats();

      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('llmEnabled');
      expect(stats).toHaveProperty('weights');
      expect(stats.weights).toHaveProperty('novelty');
      expect(stats.weights).toHaveProperty('phaseChange');
      expect(stats.weights).toHaveProperty('recency');
    });
  });
});
