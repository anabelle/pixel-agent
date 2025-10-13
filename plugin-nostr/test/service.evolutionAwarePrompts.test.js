const { describe, it, expect, beforeEach, vi } = globalThis;

// Mock dependencies
let mockLogger;
let mockRuntime;
let mockNarrativeMemory;
let NostrService;

describe('Evolution-Aware Prompt Redesign', () => {
  beforeEach(() => {
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
      generateText: vi.fn() // Mock LLM generation
    };

    const { NarrativeMemory } = require('../lib/narrativeMemory');
    mockNarrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);
  });

  describe('_screenTimelineLoreWithLLM evolution awareness', () => {
    it('includes recent narrative context in screening prompt', async () => {
      // Set up recent context
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Bitcoin price reaches new highs',
        tags: ['bitcoin', 'price', 'trading'],
        priority: 'high',
        narrative: 'Price action discussion',
        insights: ['Bullish sentiment'],
        watchlist: ['price levels'],
        tone: 'excited'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Lightning network adoption accelerates',
        tags: ['lightning', 'adoption', 'growth'],
        priority: 'medium',
        narrative: 'Network effects visible',
        insights: ['Usage metrics up'],
        watchlist: ['channel count'],
        tone: 'optimistic'
      });

      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;

      // Mock LLM response with evolution metadata
      const mockLLMResponse = JSON.stringify({
        accept: true,
        evolutionType: 'progression',
        summary: 'Lightning adoption metrics show continued growth',
        rationale: 'Advances existing storyline with new data',
        noveltyScore: 0.7,
        tags: ['lightning', 'metrics', 'adoption'],
        priority: 'medium',
        signals: ['data-driven', 'progression']
      });

      // Mock the generation function to capture the prompt
      let capturedPrompt = '';
      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation((runtime, type, prompt, options, extractFn) => {
          capturedPrompt = prompt;
          return Promise.resolve(mockLLMResponse);
        });

      const heuristics = {
        score: 1.5,
        wordCount: 30,
        charCount: 150,
        authorScore: 0.6,
        trendingMatches: ['lightning'],
        signals: ['trending: lightning']
      };

      const content = 'Lightning network channel count reaches 80,000 milestone showing sustained growth';
      
      const result = await service._screenTimelineLoreWithLLM(content, heuristics);

      // Verify recent context was included in prompt
      expect(capturedPrompt).toContain('RECENT NARRATIVE CONTEXT');
      expect(capturedPrompt).toContain('Bitcoin price reaches new highs');
      expect(capturedPrompt).toContain('Lightning network adoption accelerates');
      
      // Verify evolution-focused instructions
      expect(capturedPrompt).toContain('NARRATIVE TRIAGE');
      expect(capturedPrompt).toContain('evolving Bitcoin/Nostr community narratives');
      expect(capturedPrompt).toContain('advance, contradict, or introduce new elements');
      
      // Verify evolution metadata is returned
      expect(result.evolutionType).toBe('progression');
      expect(result.noveltyScore).toBe(0.7);
      expect(result.accept).toBe(true);
    });

    it('requests evolution metadata in JSON output', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;

      let capturedPrompt = '';
      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation((runtime, type, prompt, options, extractFn) => {
          capturedPrompt = prompt;
          return Promise.resolve(JSON.stringify({
            accept: true,
            evolutionType: 'emergence',
            summary: 'New protocol proposal emerges',
            rationale: 'Introduces new element to ecosystem',
            noveltyScore: 0.9,
            tags: ['protocol', 'proposal'],
            priority: 'high',
            signals: ['new-initiative']
          }));
        });

      const heuristics = {
        score: 2.0,
        wordCount: 40,
        charCount: 200,
        authorScore: 0.8,
        trendingMatches: [],
        signals: []
      };

      const content = 'Introducing BIP-XXX: A new proposal for improved transaction privacy';
      
      const result = await service._screenTimelineLoreWithLLM(content, heuristics);

      // Verify prompt asks for evolution metadata
      expect(capturedPrompt).toContain('evolutionType');
      expect(capturedPrompt).toContain('noveltyScore');
      expect(capturedPrompt).toContain('progression');
      expect(capturedPrompt).toContain('contradiction');
      expect(capturedPrompt).toContain('emergence');
      expect(capturedPrompt).toContain('milestone');
      
      // Verify metadata is properly returned
      expect(result.evolutionType).toBe('emergence');
      expect(result.noveltyScore).toBe(0.9);
    });

    it('ensures evolution metadata defaults when LLM omits them', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;

      // Mock LLM response WITHOUT evolution metadata (testing backward compatibility)
      const mockLLMResponse = JSON.stringify({
        accept: true,
        summary: 'General bitcoin discussion',
        rationale: 'Active engagement',
        tags: ['bitcoin'],
        priority: 'low',
        signals: ['discussion']
      });

      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation(() => Promise.resolve(mockLLMResponse));

      const heuristics = {
        score: 1.2,
        wordCount: 20,
        charCount: 100,
        authorScore: 0.5,
        trendingMatches: [],
        signals: []
      };

      const content = 'Bitcoin is interesting technology';
      
      const result = await service._screenTimelineLoreWithLLM(content, heuristics);

      // Verify defaults are applied
      expect(result.evolutionType).toBe(null);
      expect(result.noveltyScore).toBe(0.5);
    });
  });

  describe('_generateTimelineLoreSummary evolution awareness', () => {
    it('includes recent narrative context in generation prompt', async () => {
      // Set up recent context
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Nostr relay improvements discussed',
        tags: ['nostr', 'relay', 'infrastructure'],
        priority: 'medium',
        narrative: 'Community discussing relay optimization',
        insights: ['Infrastructure focus'],
        watchlist: ['relay performance'],
        tone: 'technical'
      });

      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.timelineLoreMaxPostsInPrompt = 10;

      // Mock LLM response with evolutionSignal
      const mockLLMResponse = JSON.stringify({
        headline: 'New relay implementation shows performance gains',
        narrative: 'Community testing reveals significant improvements in relay response times',
        insights: ['Performance benchmarks favorable', 'Adoption by major relays expected'],
        watchlist: ['rollout timeline', 'bug reports'],
        tags: ['nostr', 'relay', 'performance', 'implementation'],
        priority: 'high',
        tone: 'optimistic',
        evolutionSignal: 'Progresses relay optimization storyline with concrete results'
      });

      let capturedPrompt = '';
      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation((runtime, type, prompt, options, extractFn) => {
          capturedPrompt = prompt;
          return Promise.resolve(mockLLMResponse);
        });

      const batch = [
        {
          id: 'post-1',
          pubkey: 'user1',
          content: 'Testing the new relay implementation',
          tags: ['nostr', 'relay'],
          score: 1.8,
          importance: 'medium',
          rationale: 'technical update',
          metadata: { signals: ['relay development'] }
        },
        {
          id: 'post-2',
          pubkey: 'user2',
          content: 'Performance improvements are impressive',
          tags: ['nostr', 'performance'],
          score: 1.6,
          importance: 'medium',
          rationale: 'community feedback',
          metadata: { signals: ['positive feedback'] }
        }
      ];

      const result = await service._generateTimelineLoreSummary(batch);

      // Verify recent context was included
      expect(capturedPrompt).toContain('RECENT NARRATIVE CONTEXT');
      expect(capturedPrompt).toContain('Nostr relay improvements discussed');
      
      // Verify evolution-focused instructions
      expect(capturedPrompt).toContain('ANALYSIS MISSION');
      expect(capturedPrompt).toContain('tracking evolving narratives');
      expect(capturedPrompt).toContain('DEVELOPMENT and PROGRESSION');
      
      // Verify prioritization guidance
      expect(capturedPrompt).toContain('PRIORITIZE');
      expect(capturedPrompt).toContain('New developments in ongoing storylines');
      expect(capturedPrompt).toContain('Unexpected turns or contradictions');
      expect(capturedPrompt).toContain('Concrete events, decisions, or announcements');
      
      // Verify deprioritization guidance
      expect(capturedPrompt).toContain('DEPRIORITIZE');
      expect(capturedPrompt).toContain('Rehashing well-covered topics');
      expect(capturedPrompt).toContain('Generic statements');
      expect(capturedPrompt).toContain('Repetitive price speculation');
      
      // Verify output requirements emphasize evolution
      expect(capturedPrompt).toContain('What PROGRESSED or EMERGED');
      expect(capturedPrompt).toContain('CHANGE, EVOLUTION, or NEW DEVELOPMENTS');
      expect(capturedPrompt).toContain('MOVEMENT in community thinking');
      expect(capturedPrompt).toContain('evolutionSignal');
      
      // Verify result includes evolutionSignal
      expect(result.evolutionSignal).toContain('Progresses relay optimization');
    });

    it('generates evolution-focused digest with evolutionSignal field', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.timelineLoreMaxPostsInPrompt = 10;

      const mockLLMResponse = JSON.stringify({
        headline: 'Lightning channel capacity hits all-time high',
        narrative: 'Network capacity expansion reflects sustained adoption and infrastructure investment',
        insights: ['Capacity growth outpacing user growth', 'Large nodes expanding'],
        watchlist: ['capacity trends', 'node distribution'],
        tags: ['lightning', 'capacity', 'growth', 'milestone'],
        priority: 'high',
        tone: 'bullish',
        evolutionSignal: 'Milestone in Lightning network maturity progression'
      });

      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation(() => Promise.resolve(mockLLMResponse));

      const batch = [
        {
          id: 'post-1',
          pubkey: 'user1',
          content: 'Lightning network capacity just hit 5000 BTC!',
          tags: ['lightning', 'capacity'],
          score: 2.0,
          importance: 'high',
          rationale: 'milestone',
          metadata: { signals: ['milestone'] }
        }
      ];

      const result = await service._generateTimelineLoreSummary(batch);

      // Verify result structure includes evolutionSignal
      expect(result).toBeDefined();
      expect(result.headline).toContain('Lightning channel capacity');
      expect(result.evolutionSignal).toBe('Milestone in Lightning network maturity progression');
      expect(result.priority).toBe('high');
      expect(result.tags).toContain('milestone');
    });

    it('handles missing evolutionSignal gracefully', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.timelineLoreMaxPostsInPrompt = 10;

      // Mock response without evolutionSignal (backward compatibility)
      const mockLLMResponse = JSON.stringify({
        headline: 'Community discussion about bitcoin',
        narrative: 'General engagement in community',
        insights: ['Active participation'],
        watchlist: ['community mood'],
        tags: ['bitcoin', 'community'],
        priority: 'low',
        tone: 'neutral'
      });

      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation(() => Promise.resolve(mockLLMResponse));

      const batch = [
        {
          id: 'post-1',
          pubkey: 'user1',
          content: 'Bitcoin is interesting',
          tags: ['bitcoin'],
          score: 1.0,
          importance: 'low',
          rationale: 'general',
          metadata: { signals: [] }
        }
      ];

      const result = await service._generateTimelineLoreSummary(batch);

      // Verify result handles missing evolutionSignal
      expect(result).toBeDefined();
      expect(result.evolutionSignal).toBe(null);
    });
  });

  describe('Evolution-aware prompt impact on output quality', () => {
    it('distinguishes between static topic and narrative progression', async () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;

      // Test 1: Static topic (should have low noveltyScore)
      const staticLLMResponse = JSON.stringify({
        accept: true,
        evolutionType: null,
        summary: 'General bitcoin discussion continues',
        rationale: 'Minimal new information',
        noveltyScore: 0.2,
        tags: ['bitcoin', 'discussion'],
        priority: 'low',
        signals: ['repetitive']
      });

      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation(() => Promise.resolve(staticLLMResponse));

      const staticHeuristics = {
        score: 1.0,
        wordCount: 15,
        charCount: 80,
        authorScore: 0.5,
        trendingMatches: [],
        signals: []
      };

      const staticContent = 'Bitcoin is great technology';
      const staticResult = await service._screenTimelineLoreWithLLM(staticContent, staticHeuristics);

      expect(staticResult.noveltyScore).toBe(0.2);
      expect(staticResult.evolutionType).toBe(null);

      // Test 2: Narrative progression (should have high noveltyScore)
      const progressionLLMResponse = JSON.stringify({
        accept: true,
        evolutionType: 'progression',
        summary: 'Bitcoin core development advances with merged PR',
        rationale: 'Concrete development milestone',
        noveltyScore: 0.85,
        tags: ['bitcoin', 'development', 'core', 'pr'],
        priority: 'high',
        signals: ['code-merged', 'development']
      });

      vi.spyOn(require('../lib/generation'), 'generateWithModelOrFallback')
        .mockImplementation(() => Promise.resolve(progressionLLMResponse));

      const progressionHeuristics = {
        score: 2.0,
        wordCount: 35,
        charCount: 180,
        authorScore: 0.7,
        trendingMatches: ['bitcoin'],
        signals: ['code activity']
      };

      const progressionContent = 'Just merged PR #12345 to Bitcoin Core implementing improved fee estimation';
      const progressionResult = await service._screenTimelineLoreWithLLM(progressionContent, progressionHeuristics);

      expect(progressionResult.noveltyScore).toBe(0.85);
      expect(progressionResult.evolutionType).toBe('progression');

      // Verify progression has higher novelty than static
      expect(progressionResult.noveltyScore).toBeGreaterThan(staticResult.noveltyScore);
    });
  });
});
