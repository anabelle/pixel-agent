const { describe, it, expect, beforeEach, vi } = globalThis;

const { NarrativeContextProvider } = require('../lib/narrativeContextProvider');
const { NarrativeMemory } = require('../lib/narrativeMemory');

describe('NarrativeContextProvider - Topic Evolution Context', () => {
  let provider;
  let mockNarrativeMemory;
  let mockContextAccumulator;
  let mockLogger;
  let mockRuntime;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRuntime = {
      getMemories: async () => []
    };

    // Create real narrative memory for testing
    mockNarrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);

    // Set up topic evolution data
    mockNarrativeMemory.updateTopicCluster('bitcoin', {
      subtopic: 'bitcoin price',
      phase: 'speculation',
      timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000
    });
    mockNarrativeMemory.updateTopicCluster('bitcoin', {
      subtopic: 'bitcoin adoption',
      phase: 'adoption',
      timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000
    });
    mockNarrativeMemory.updateTopicCluster('bitcoin', {
      subtopic: 'bitcoin ETF',
      phase: 'announcement',
      timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000
    });

    // Add daily narratives for evolution tracking
    const now = Date.now();
    mockNarrativeMemory.dailyNarratives = [
      {
        timestamp: now - 5 * 24 * 60 * 60 * 1000,
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }],
          overallSentiment: { positive: 0.6, negative: 0.2, neutral: 0.2 }
        },
        narrative: { summary: 'Bitcoin discussion active' }
      },
      {
        timestamp: now - 3 * 24 * 60 * 60 * 1000,
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 15 }],
          overallSentiment: { positive: 0.7, negative: 0.1, neutral: 0.2 }
        },
        narrative: { summary: 'Bitcoin momentum building' }
      },
      {
        timestamp: now - 1 * 24 * 60 * 60 * 1000,
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 20 }],
          overallSentiment: { positive: 0.8, negative: 0.1, neutral: 0.1 }
        },
        narrative: { summary: 'Bitcoin adoption accelerating' }
      }
    ];

    mockContextAccumulator = {
      getEmergingStories: vi.fn(() => []),
      getCurrentActivity: vi.fn(() => ({ events: 15, users: 8, topics: [] })),
      getRecentDigest: vi.fn(() => null)
    };

    provider = new NarrativeContextProvider(
      mockNarrativeMemory,
      mockContextAccumulator,
      mockLogger
    );
  });

  describe('getRelevantContext with topic evolution', () => {
    it('includes topic evolution data when enabled', async () => {
      const message = 'What is happening with bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      expect(context.topicEvolution).toBeDefined();
      expect(context.topicEvolution.topic).toBe('bitcoin');
      expect(context.topicEvolution.subtopics).toBeDefined();
      expect(context.topicEvolution.currentPhase).toBe('announcement');
    });

    it('skips topic evolution when disabled', async () => {
      const message = 'What is happening with bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: false
      });

      expect(context.topicEvolution).toBe(null);
    });

    it('extracts topics from message for evolution lookup', async () => {
      const message = 'Bitcoin and lightning network updates';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // Should extract bitcoin as primary topic
      if (context.topicEvolution) {
        expect(['bitcoin', 'lightning']).toContain(context.topicEvolution.topic);
      }
    });

    it('requires sufficient datapoints for evolution', async () => {
      // Clear narratives to have insufficient data
      mockNarrativeMemory.dailyNarratives = [
        {
          timestamp: Date.now(),
          summary: {
            topTopics: [{ topic: 'new-topic', count: 1 }]
          }
        }
      ];

      const message = 'What about new-topic?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // Should not include evolution with < 3 datapoints
      expect(context.topicEvolution).toBe(null);
    });

    it('handles evolution lookup failures gracefully', async () => {
      // Break the narrative memory method
      vi.spyOn(mockNarrativeMemory, 'getTopicEvolution').mockRejectedValue(
        new Error('Evolution lookup failed')
      );

      const message = 'Bitcoin discussion';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // Should not crash, just skip evolution
      expect(context.topicEvolution).toBe(null);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringMatching(/Topic evolution failed/),
        expect.any(String)
      );
    });
  });

  describe('_buildContextSummary with evolution data', () => {
    it('includes phase information in summary', async () => {
      const message = 'Bitcoin news?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      if (context.topicEvolution && context.topicEvolution.currentPhase !== 'general') {
        expect(context.summary).toContain('phase:');
        expect(context.summary).toContain(context.topicEvolution.currentPhase);
      }
    });

    it('includes top subtopics in summary', async () => {
      const message = 'What about bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      if (context.topicEvolution && context.topicEvolution.subtopics?.length > 0) {
        expect(context.summary).toContain('angles:');
        // Should include at least one subtopic name
        const subtopicNames = context.topicEvolution.subtopics.map(s => s.subtopic);
        const hasSubtopic = subtopicNames.some(name => context.summary.includes(name));
        expect(hasSubtopic).toBe(true);
      }
    });

    it('includes trend when not stable', async () => {
      const message = 'Bitcoin trends?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      if (context.topicEvolution && context.topicEvolution.trend !== 'stable') {
        expect(context.summary).toContain(context.topicEvolution.trend);
      }
    });

    it('formats evolution context concisely', async () => {
      const message = 'Bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true,
        maxContext: 500
      });

      // Summary should be concise and within limit
      expect(context.summary.length).toBeLessThanOrEqual(500);
    });

    it('combines evolution with other context types', async () => {
      // Add emerging stories
      mockContextAccumulator.getEmergingStories.mockReturnValue([
        { topic: 'bitcoin', mentions: 25, users: 10 }
      ]);

      const message = 'Bitcoin activity?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true,
        includeEmergingStories: true,
        includeHistoricalComparison: false,
        includeSimilarMoments: false
      });

      expect(context.hasContext).toBe(true);
      // Should have both emerging stories and evolution
      expect(context.emergingStories.length).toBeGreaterThan(0);
      if (context.topicEvolution) {
        expect(context.summary).toContain('BITCOIN');
      }
    });

    it('limits subtopics to top 2 in summary', async () => {
      // Add many subtopics
      for (let i = 0; i < 10; i++) {
        mockNarrativeMemory.updateTopicCluster('bitcoin', {
          subtopic: `subtopic-${i}`,
          phase: 'general',
          timestamp: Date.now() - i * 1000
        });
      }

      const message = 'Bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // Summary should only mention top 2 subtopics
      const anglesMatch = context.summary.match(/angles: ([^;|]+)/);
      if (anglesMatch) {
        const angles = anglesMatch[1].split(',');
        expect(angles.length).toBeLessThanOrEqual(2);
      }
    });

    it('omits evolution section when no meaningful data', async () => {
      // Set up topic with only general phase and no trend
      mockNarrativeMemory.dailyNarratives = [
        {
          timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
          summary: {
            topTopics: [{ topic: 'stable-topic', count: 10 }]
          }
        },
        {
          timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
          summary: {
            topTopics: [{ topic: 'stable-topic', count: 10 }]
          }
        },
        {
          timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
          summary: {
            topTopics: [{ topic: 'stable-topic', count: 10 }]
          }
        }
      ];

      const message = 'stable-topic discussion';
      
      const context = await provider.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // If evolution has no interesting data (stable trend, general phase, no subtopics),
      // summary might not include evolution section
      if (context.topicEvolution) {
        const hasEvolutionInfo = 
          context.topicEvolution.trend !== 'stable' ||
          context.topicEvolution.currentPhase !== 'general' ||
          (context.topicEvolution.subtopics && context.topicEvolution.subtopics.length > 0);
        
        if (!hasEvolutionInfo) {
          expect(context.summary).not.toContain('STABLE-TOPIC:');
        }
      }
    });
  });

  describe('integration with existing context features', () => {
    it('works alongside emerging stories', async () => {
      mockContextAccumulator.getEmergingStories.mockReturnValue([
        { topic: 'bitcoin', mentions: 30, users: 12 }
      ]);

      const message = 'Bitcoin?';
      
      const context = await provider.getRelevantContext(message, {
        includeEmergingStories: true,
        includeTopicEvolution: true
      });

      expect(context.emergingStories.length).toBeGreaterThan(0);
      expect(context.topicEvolution).toBeDefined();
      expect(context.hasContext).toBe(true);
    });

    it('does not break when narrative memory unavailable', async () => {
      const providerNoMemory = new NarrativeContextProvider(
        null,
        mockContextAccumulator,
        mockLogger
      );

      const message = 'Bitcoin?';
      
      const context = await providerNoMemory.getRelevantContext(message, {
        includeTopicEvolution: true
      });

      // Should handle gracefully
      expect(context.topicEvolution).toBe(null);
    });
  });
});
