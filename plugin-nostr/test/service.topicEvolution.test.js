const { describe, it, expect, beforeEach, vi } = globalThis;

// Mock dependencies before requiring service
let mockLogger;
let mockRuntime;
let mockNarrativeMemory;
let mockTopicEvolutionTracker;
let NostrService;

describe('Service Integration - Topic Evolution', () => {
  beforeEach(() => {
    // Reset mocks
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRuntime = {
      getSetting: vi.fn(() => null),
      character: {
        name: 'TestBot'
      },
      generateText: vi.fn()
    };

    // Create mock narrative memory
    const { NarrativeMemory } = require('../lib/narrativeMemory');
    mockNarrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);

    // Create mock topic evolution tracker
    const { TopicEvolutionTracker } = require('../lib/topicEvolution');
    const mockSemanticAnalyzer = {
      llmSemanticEnabled: true,
      labelSubtopic: vi.fn(async () => 'test subtopic')
    };
    mockTopicEvolutionTracker = new TopicEvolutionTracker(
      mockRuntime,
      mockNarrativeMemory,
      mockSemanticAnalyzer,
      mockLogger
    );
  });

  describe('_evaluateTimelineLoreCandidate with topic evolution', () => {
    it('integrates topic evolution analysis', async () => {
      // Lazy load NostrService after mocks are ready
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      // Mock evolution analysis to return high score
      const mockEvolution = {
        subtopic: 'bitcoin ETF approval',
        isNovelAngle: true,
        isPhaseChange: true,
        phase: 'announcement',
        evolutionScore: 0.8,
        signals: ['novel angle: bitcoin ETF approval', 'phase shift to announcement', 'high evolution score']
      };

      vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution').mockResolvedValue(mockEvolution);

      const mockEvent = {
        id: 'test-event-1',
        pubkey: 'test-pubkey',
        content: 'Breaking: Bitcoin ETF officially approved by SEC',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['bitcoin', 'ETF', 'SEC'];

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      expect(result).not.toBe(null);
      expect(result.topicEvolution).toBeDefined();
      expect(result.topicEvolution.evolutionScore).toBe(0.8);
      expect(result.score).toBeGreaterThan(1.0); // Should get evolution bonus
      expect(result.signals.some(s => s.includes('novel angle'))).toBe(true);
      expect(result.signals.some(s => s.includes('phase shift'))).toBe(true);
    });

    it('applies evolution score bonus to candidate score', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      // High evolution score
      const highEvolution = {
        subtopic: 'novel subtopic',
        isNovelAngle: true,
        isPhaseChange: true,
        phase: 'announcement',
        evolutionScore: 1.0,
        signals: ['novel angle: novel subtopic', 'phase shift to announcement']
      };

      vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution').mockResolvedValue(highEvolution);

      const mockEvent = {
        id: 'test-event-high',
        pubkey: 'test-pubkey',
        content: 'This is a long enough message with multiple topics and interesting angles',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['bitcoin', 'announcement'] }
      );

      expect(result.topicEvolution.evolutionScore).toBe(1.0);
      // Evolution bonus should be 1.0 * 0.5 = 0.5
      expect(result.score).toBeGreaterThan(1.5);
    });

    it('includes evolution signals in candidate metadata', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvolution = {
        subtopic: 'lightning adoption',
        isNovelAngle: true,
        isPhaseChange: false,
        phase: 'adoption',
        evolutionScore: 0.6,
        signals: ['novel angle: lightning adoption', 'phase: adoption']
      };

      vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution').mockResolvedValue(mockEvolution);

      const mockEvent = {
        id: 'test-event-signals',
        pubkey: 'test-pubkey',
        content: 'Lightning network seeing widespread adoption in payment systems',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['lightning', 'adoption'] }
      );

      expect(result.signals).toContain('novel angle: lightning adoption');
      expect(result.signals).toContain('phase: adoption');
    });

    it('handles evolution tracking failures gracefully', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      // Make tracker throw error
      vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution').mockRejectedValue(
        new Error('Tracker failed')
      );

      const mockEvent = {
        id: 'test-event-error',
        pubkey: 'test-pubkey',
        content: 'This is a message that should still be evaluated even if evolution tracking fails',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['bitcoin'] }
      );

      // Should still return a result, just without evolution data
      expect(result).not.toBe(null);
      expect(result.topicEvolution).toBe(null);
    });

    it('skips evolution tracking when tracker not available', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = null; // No tracker
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-no-tracker',
        pubkey: 'test-pubkey',
        content: 'Message without evolution tracking',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['bitcoin'] }
      );

      expect(result).not.toBe(null);
      expect(result.topicEvolution).toBe(null);
    });

    it('passes context hints to evolution tracker', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      // Mock context accumulator for trending topics
      service.getCurrentActivity = vi.fn(() => ({
        topics: [
          { topic: 'bitcoin' },
          { topic: 'lightning' }
        ]
      }));

      const analyzeEvolutionSpy = vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution');
      analyzeEvolutionSpy.mockResolvedValue({
        subtopic: 'test',
        isNovelAngle: false,
        isPhaseChange: false,
        phase: 'general',
        evolutionScore: 0,
        signals: []
      });

      const mockEvent = {
        id: 'test-event-hints',
        pubkey: 'test-pubkey',
        content: 'Bitcoin and lightning network discussion',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['bitcoin', 'lightning'] }
      );

      // Check that context hints were passed
      const call = analyzeEvolutionSpy.mock.calls[0];
      const contextHints = call[2];
      expect(contextHints).toBeDefined();
      expect(contextHints).toHaveProperty('trending');
    });

    it('combines evolution bonus with other scoring factors', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.topicEvolutionTracker = mockTopicEvolutionTracker;
      service.logger = mockLogger;
      service.userQualityScores = new Map([['test-pubkey', 0.8]]);

      const mockEvolution = {
        subtopic: 'novel angle',
        isNovelAngle: true,
        isPhaseChange: true,
        phase: 'announcement',
        evolutionScore: 0.8,
        signals: ['novel angle: novel angle', 'phase shift to announcement']
      };

      vi.spyOn(mockTopicEvolutionTracker, 'analyzeEvolution').mockResolvedValue(mockEvolution);

      const mockEvent = {
        id: 'test-event-combined',
        pubkey: 'test-pubkey', // High quality author
        content: 'This is a long form message with multiple interesting topics and quality content that should score well across all dimensions',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        mockEvent.content,
        { topics: ['bitcoin', 'lightning', 'nostr'] }
      );

      // Should get bonuses from:
      // - Word count (long form)
      // - Multiple topics
      // - Good author score
      // - Evolution score
      expect(result.score).toBeGreaterThan(2.5);
      expect(result.authorScore).toBe(0.8);
      expect(result.topicEvolution.evolutionScore).toBe(0.8);
    });
  });

  describe('TopicEvolutionTracker initialization', () => {
    it('initializes tracker in service constructor', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);

      expect(service.topicEvolutionTracker).toBeDefined();
      expect(service.topicEvolutionTracker).toHaveProperty('analyzeEvolution');
      expect(service.topicEvolutionTracker).toHaveProperty('labelSubtopic');
      expect(service.topicEvolutionTracker).toHaveProperty('detectPhase');
    });

    it('logs initialization status', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/Topic evolution tracker initialized/)
      );
    });
  });
});
