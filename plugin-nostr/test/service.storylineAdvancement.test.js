const { describe, it, expect, beforeEach, vi } = globalThis;

// Mock dependencies - must be set up before requiring service
let mockLogger;
let mockRuntime;
let mockNarrativeMemory;
let NostrService;

describe('Service Storyline Advancement Integration', () => {
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
      }
    };

    // Create mock narrative memory
    const { NarrativeMemory } = require('../lib/narrativeMemory');
    mockNarrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);
  });

  describe('_evaluateTimelineLoreCandidate with storyline advancement', () => {
    it('adds score bonus for recurring theme advancement', async () => {
      // Set up recurring theme
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Lightning network updates',
        tags: ['lightning', 'network', 'development'],
        priority: 'medium',
        narrative: 'Lightning network development continues',
        insights: ['Active development'],
        watchlist: ['feature releases'],
        tone: 'optimistic'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Lightning adoption grows',
        tags: ['lightning', 'adoption', 'growth'],
        priority: 'high',
        narrative: 'Lightning seeing increased adoption',
        insights: ['Network effects'],
        watchlist: ['user metrics'],
        tone: 'bullish'
      });

      // Lazy load NostrService after mocks are ready
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-1',
        pubkey: 'test-pubkey',
        content: 'Lightning network reaches new milestone with record adoption numbers',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['lightning', 'adoption', 'milestone'];

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      expect(result).not.toBe(null);
      expect(result.score).toBeGreaterThan(1.0);
      // Verify storyline advancement was detected
      expect(result.signals.some(s => 
        s.includes('advances recurring storyline')
      )).toBe(true);
    });

    it('adds score bonus for watchlist matches', async () => {
      // Set up storyline with watchlist items
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Protocol upgrade discussion',
        tags: ['protocol', 'upgrade', 'governance'],
        priority: 'high',
        narrative: 'Upgrade being discussed',
        insights: ['Community input needed'],
        watchlist: ['upgrade timeline', 'technical specs'],
        tone: 'anticipatory'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Upgrade details emerge',
        tags: ['protocol', 'upgrade', 'details'],
        priority: 'high',
        narrative: 'More details revealed',
        insights: ['Implementation plan'],
        watchlist: ['testing phase', 'deployment date'],
        tone: 'informative'
      });

      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-2',
        pubkey: 'test-pubkey',
        content: 'Major update on upgrade timeline - testing phase starts next week',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['upgrade', 'timeline', 'testing'];

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      expect(result).not.toBe(null);
      // Watchlist match should boost score significantly
      expect(result.score).toBeGreaterThan(1.0);
      expect(result.signals.some(s => s.includes('continuity:'))).toBe(true);
    });

    it('adds score bonus for emerging thread', async () => {
      // Set up storyline where new topic emerges
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Bitcoin discussion',
        tags: ['bitcoin', 'discussion'],
        priority: 'medium',
        narrative: 'General bitcoin talk',
        insights: ['Community active'],
        watchlist: [],
        tone: 'neutral'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'AI integration emerges',
        tags: ['bitcoin', 'ai', 'innovation'],
        priority: 'high',
        narrative: 'AI tools being explored',
        insights: ['New frontier'],
        watchlist: ['ai adoption'],
        tone: 'excited'
      });

      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-3',
        pubkey: 'test-pubkey',
        content: 'AI models are revolutionizing bitcoin development workflows',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['ai', 'bitcoin', 'development'];

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      expect(result).not.toBe(null);
      expect(result.score).toBeGreaterThan(1.0);
      expect(result.signals.some(s => s.includes('emerging thread'))).toBe(true);
    });

    it('combines multiple storyline advancement bonuses', async () => {
      // Set up rich storyline
      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Nostr protocol development',
        tags: ['nostr', 'protocol', 'development'],
        priority: 'high',
        narrative: 'Protocol improvements',
        insights: ['Active development'],
        watchlist: ['relay improvements', 'client features'],
        tone: 'optimistic'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Nostr adoption accelerates',
        tags: ['nostr', 'adoption', 'growth'],
        priority: 'high',
        narrative: 'More users joining',
        insights: ['Network effects'],
        watchlist: ['user metrics', 'relay performance'],
        tone: 'bullish'
      });

      await mockNarrativeMemory.storeTimelineLore({
        headline: 'Nostr zaps feature launches',
        tags: ['nostr', 'zaps', 'innovation'],
        priority: 'high',
        narrative: 'Zaps rolling out',
        insights: ['Monetization unlock'],
        watchlist: ['zap adoption'],
        tone: 'excited'
      });

      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = mockNarrativeMemory;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-4',
        pubkey: 'test-pubkey',
        content: 'Major relay improvements boost zap adoption metrics, enhancing overall nostr user experience',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['nostr', 'relay', 'zaps', 'metrics', 'user'];

      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      expect(result).not.toBe(null);
      // Should get bonuses from all three: recurring theme, watchlist, emerging thread
      // Base + recurring (0.3) + watchlist (0.5) + emerging (0.4) = +1.2 minimum
      expect(result.score).toBeGreaterThan(2.0);
      expect(result.signals).toContain('advances recurring storyline');
      expect(result.signals.some(s => s.includes('continuity:'))).toBe(true);
      expect(result.signals).toContain('emerging thread');
    });

    it('handles cases where narrativeMemory is not available', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);
      service.narrativeMemory = null;
      service.logger = mockLogger;
      service.userQualityScores = new Map();

      const mockEvent = {
        id: 'test-event-5',
        pubkey: 'test-pubkey',
        content: 'Some content about bitcoin and lightning network progress',
        created_at: Math.floor(Date.now() / 1000),
        tags: []
      };

      const normalizedContent = mockEvent.content;
      const topics = ['bitcoin', 'lightning'];

      // Should not throw error
      const result = service._evaluateTimelineLoreCandidate(
        mockEvent,
        normalizedContent,
        { topics }
      );

      // Should still return result based on other scoring factors
      expect(result).not.toBe(null);
    });
  });

  describe('_getStorylineBoost for batch prioritization', () => {
    it('calculates correct boost for storyline advancement signals', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);

      const itemWithStoryline = {
        id: 'item-1',
        content: 'Test content',
        metadata: {
          signals: [
            'advances recurring storyline',
            'continuity: upgrade timeline',
            'emerging thread'
          ]
        }
      };

      const boost = service._getStorylineBoost(itemWithStoryline);
      // Should be 0.3 + 0.5 + 0.4 = 1.2
      expect(boost).toBe(1.2);
    });

    it('returns 0 boost for items without storyline signals', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);

      const itemWithoutStoryline = {
        id: 'item-2',
        content: 'Test content',
        metadata: {
          signals: ['seeking answers', 'references external source']
        }
      };

      const boost = service._getStorylineBoost(itemWithoutStoryline);
      expect(boost).toBe(0);
    });

    it('handles items without metadata gracefully', () => {
      if (!NostrService) {
        const serviceModule = require('../lib/service');
        NostrService = serviceModule.NostrService;
      }

      const service = new NostrService(mockRuntime);

      const itemWithoutMetadata = {
        id: 'item-3',
        content: 'Test content'
      };

      const boost = service._getStorylineBoost(itemWithoutMetadata);
      expect(boost).toBe(0);
    });
  });
});
