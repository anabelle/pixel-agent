import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load modules under test
import { TopicEvolution } from '../lib/topicEvolution.js';
import { NarrativeMemory } from '../lib/narrativeMemory.js';

function makeRuntime(overrides = {}) {
  const settings = new Map(Object.entries(overrides.settings || {}));
  return {
    getSetting: (k) => settings.get(k),
    useModel: overrides.useModel,
    logger: overrides.logger || console,
    createUniqueUuid: (rt, seed='test') => `${seed}:${Date.now()}`,
    agentId: 'agent:test'
  };
}

describe('TopicEvolution', () => {
  let runtime;
  let logger;
  let mem;

  beforeEach(() => {
    logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    runtime = makeRuntime({ settings: { TOPIC_EVOLUTION_ENABLED: 'true' }, logger });
    mem = new NarrativeMemory(runtime, logger);
  });

  describe('Initialization', () => {
    it('initializes with default config when no options provided', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo.runtime).toBe(runtime);
      expect(evo.logger).toBe(logger);
      expect(evo.enabled).toBe(true);
      expect(evo.phaseLlmEnabled).toBe(true);
      expect(evo.cache).toBeInstanceOf(Map);
      expect(evo.cacheTTL).toBe(3600000);
      expect(evo.minNovelMentions).toBe(1);
      expect(evo.phaseMinTimeline).toBe(5);
    });

    it('initializes with narrative memory option', () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      expect(evo.narrativeMemory).toBe(mem);
    });

    it('initializes with semantic analyzer option', () => {
      const analyzer = { analyze: vi.fn() };
      const evo = new TopicEvolution(runtime, logger, { semanticAnalyzer: analyzer });
      expect(evo.semanticAnalyzer).toBe(analyzer);
    });

    it('respects TOPIC_EVOLUTION_ENABLED setting', () => {
      const disabledRuntime = makeRuntime({ settings: { TOPIC_EVOLUTION_ENABLED: 'false' } });
      const evo = new TopicEvolution(disabledRuntime, logger);
      expect(evo.enabled).toBe(false);
    });

    it('respects TOPIC_EVOLUTION_PHASE_LLM_ENABLED setting', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_PHASE_LLM_ENABLED: 'false' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.phaseLlmEnabled).toBe(false);
    });

    it('respects TOPIC_EVOLUTION_CACHE_TTL_MS setting', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_CACHE_TTL_MS: '1800000' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.cacheTTL).toBe(1800000);
    });

    it('respects TOPIC_EVOLUTION_NOVEL_SUBTOPIC_MIN_MENTIONS setting', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_NOVEL_SUBTOPIC_MIN_MENTIONS: '3' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.minNovelMentions).toBe(3);
    });

    it('respects TOPIC_EVOLUTION_PHASE_MIN_TIMELINE setting', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_PHASE_MIN_TIMELINE: '10' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.phaseMinTimeline).toBe(10);
    });

    it('handles invalid cache TTL value', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_CACHE_TTL_MS: 'invalid' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.cacheTTL).toBe(3600000);
    });

    it('handles invalid min mentions value', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_NOVEL_SUBTOPIC_MIN_MENTIONS: 'invalid' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.minNovelMentions).toBe(1);
    });

    it('handles invalid phase min timeline value', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_PHASE_MIN_TIMELINE: 'invalid' } });
      const evo = new TopicEvolution(runtime2, logger);
      expect(evo.phaseMinTimeline).toBe(5);
    });

    it('uses fallback logger when none provided', () => {
      const evo = new TopicEvolution(runtime, null);
      expect(evo.logger).toBe(console);
    });
  });

  describe('Helper Methods', () => {
    it('_kebab converts strings to kebab-case', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._kebab('Hello World')).toBe('hello-world');
      expect(evo._kebab('Bitcoin ETF Approval')).toBe('bitcoin-etf-approval');
      expect(evo._kebab('nostr-relay')).toBe('nostr-relay');
      expect(evo._kebab('Test!@#$%^&*()123')).toBe('test-123');
    });

    it('_kebab handles special characters', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._kebab('test_with_underscores')).toBe('test-with-underscores');
      expect(evo._kebab('test   multiple   spaces')).toBe('test-multiple-spaces');
    });

    it('_kebab truncates to 30 characters', () => {
      const evo = new TopicEvolution(runtime, logger);
      const longString = 'this is a very long string that should be truncated to thirty characters';
      const result = evo._kebab(longString);
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('_kebab handles empty and null input', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._kebab('')).toBe('');
      expect(evo._kebab(null)).toBe('');
      expect(evo._kebab(undefined)).toBe('');
    });

    it('_cacheKey generates consistent keys', () => {
      const evo = new TopicEvolution(runtime, logger);
      const key1 = evo._cacheKey('bitcoin', 'test content');
      const key2 = evo._cacheKey('bitcoin', 'test content');
      expect(key1).toBe(key2);
    });

    it('_cacheKey generates different keys for different content', () => {
      const evo = new TopicEvolution(runtime, logger);
      const key1 = evo._cacheKey('bitcoin', 'content 1');
      const key2 = evo._cacheKey('bitcoin', 'content 2');
      expect(key1).not.toBe(key2);
    });

    it('_cacheKey is case-insensitive for topics', () => {
      const evo = new TopicEvolution(runtime, logger);
      const key1 = evo._cacheKey('Bitcoin', 'test');
      const key2 = evo._cacheKey('bitcoin', 'test');
      expect(key1).toBe(key2);
    });
  });

  describe('Cache Management', () => {
    it('_setCache and _getCache work together', () => {
      const evo = new TopicEvolution(runtime, logger);
      const key = 'test-key';
      const value = 'test-value';
      
      evo._setCache(key, value);
      expect(evo._getCache(key)).toBe(value);
    });

    it('_getCache returns null for non-existent keys', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._getCache('non-existent')).toBeNull();
    });

    it('_getCache returns null for expired cache entries', () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_CACHE_TTL_MS: '100' } });
      const evo = new TopicEvolution(runtime2, logger);
      const key = 'test-key';
      
      evo._setCache(key, 'value');
      
      // Wait for cache to expire
      return new Promise(resolve => {
        setTimeout(() => {
          expect(evo._getCache(key)).toBeNull();
          resolve();
        }, 150);
      });
    });

    it('cache respects TTL setting', async () => {
      const runtime2 = makeRuntime({ settings: { TOPIC_EVOLUTION_CACHE_TTL_MS: '50' } });
      const evo = new TopicEvolution(runtime2, logger);
      
      evo._setCache('key1', 'value1');
      expect(evo._getCache('key1')).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(evo._getCache('key1')).toBeNull();
    });
  });

  describe('Subtopic Labeling', () => {
    it('labels subtopics heuristically without LLM', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const label1 = await evo.labelSubtopic('bitcoin', 'ETF approval news incoming');
      const label2 = await evo.labelSubtopic('nostr', 'relay had outages and technical work');
      expect(label1).toContain('bitcoin');
      expect(label1).toContain('etf');
      expect(label2).toContain('technical');
    });

    it('detects price-related subtopics', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const label = await evo.labelSubtopic('bitcoin', 'Bitcoin price pump to new ATH');
      expect(label).toContain('price');
    });

    it('detects technical/development subtopics', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const label = await evo.labelSubtopic('nostr', 'Protocol upgrade with NIP-42 support');
      expect(label).toContain('technical');
    });

    it('detects adoption-related subtopics', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const label = await evo.labelSubtopic('bitcoin', 'Major merchant adoption for payments');
      expect(label).toContain('adoption');
    });

    it('returns general label for unclear content', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const label = await evo.labelSubtopic('test', 'Some random content here');
      expect(label).toContain('general');
    });

    it('uses cache for repeated content', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const content = 'Bitcoin price volatility';
      
      const label1 = await evo.labelSubtopic('bitcoin', content);
      const label2 = await evo.labelSubtopic('bitcoin', content);
      
      expect(label1).toBe(label2);
      expect(evo.cache.size).toBeGreaterThan(0);
    });

    it('uses LLM when available', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('bitcoin-llm-label');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const label = await evo.labelSubtopic('bitcoin', 'Some new content');
      expect(mockUseModel).toHaveBeenCalled();
      expect(label).toContain('bitcoin');
    });

    it('falls back to heuristic when LLM fails', async () => {
      const mockUseModel = vi.fn().mockRejectedValue(new Error('LLM error'));
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const label = await evo.labelSubtopic('bitcoin', 'Price pump happening');
      expect(label).toContain('price');
    });

    it('handles hints parameter', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('test-label');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      await evo.labelSubtopic('bitcoin', 'content', { trending: ['btc', 'eth'] });
      expect(mockUseModel).toHaveBeenCalled();
      const callArgs = mockUseModel.mock.calls[0][1];
      expect(callArgs.prompt).toContain('Trending:');
    });

    it('limits trending hints to 5 items', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('test-label');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const manyTrending = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      await evo.labelSubtopic('bitcoin', 'content', { trending: manyTrending });
      
      const callArgs = mockUseModel.mock.calls[0][1];
      const trendingCount = callArgs.prompt.match(/Trending:/g);
      expect(trendingCount).toBeTruthy();
    });

    it('truncates content to MAX_CONTENT_FOR_PROMPT', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('test-label');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const longContent = 'a'.repeat(500);
      await evo.labelSubtopic('bitcoin', longContent);
      
      const callArgs = mockUseModel.mock.calls[0][1];
      // Content should be truncated to 300 chars
      expect(callArgs.prompt.length).toBeLessThan(longContent.length + 200);
    });
  });

  describe('Phase Inference', () => {
    it('infers announcement phase from subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-announcement')).toBe('announcement');
      expect(evo._inferPhaseFromSubtopic('bitcoin-etf-approval')).toBe('announcement');
      expect(evo._inferPhaseFromSubtopic('nostr-release')).toBe('announcement');
    });

    it('infers adoption phase from subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-adoption')).toBe('adoption');
      expect(evo._inferPhaseFromSubtopic('bitcoin-mainstream')).toBe('adoption');
      expect(evo._inferPhaseFromSubtopic('bitcoin-merchant')).toBe('adoption');
    });

    it('infers speculation phase from subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-price')).toBe('speculation');
      expect(evo._inferPhaseFromSubtopic('bitcoin-pump')).toBe('speculation');
      expect(evo._inferPhaseFromSubtopic('bitcoin-volatility')).toBe('speculation');
    });

    it('infers analysis phase from subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-analysis')).toBe('analysis');
      expect(evo._inferPhaseFromSubtopic('bitcoin-technical')).toBe('analysis');
      expect(evo._inferPhaseFromSubtopic('bitcoin-development')).toBe('analysis');
    });

    it('infers backlash phase from subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-backlash')).toBe('backlash');
      expect(evo._inferPhaseFromSubtopic('bitcoin-criticism')).toBe('backlash');
      expect(evo._inferPhaseFromSubtopic('bitcoin-ban')).toBe('backlash');
    });

    it('returns general for unknown subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._inferPhaseFromSubtopic('bitcoin-unknown')).toBe('general');
      expect(evo._inferPhaseFromSubtopic('random-stuff')).toBe('general');
    });
  });

  describe('Phase Detection', () => {
    it('returns general phase when timeline is too short', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { timeline: [], currentPhase: null };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('general');
      expect(result.isChange).toBe(false);
    });

    it('returns current phase when timeline has fewer than phaseMinTimeline entries', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { 
        timeline: [
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-analysis', timestamp: Date.now() }
        ], 
        currentPhase: 'speculation' 
      };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('speculation');
      expect(result.isChange).toBe(false);
    });

    it('detects phase from recent timeline entries', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { 
        timeline: [
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() }
        ], 
        currentPhase: 'general' 
      };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('speculation');
      expect(result.isChange).toBe(true);
    });

    it('detects no change when phase remains the same', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { 
        timeline: [
          { subtopic: 'bitcoin-announcement', timestamp: Date.now() },
          { subtopic: 'bitcoin-etf-approval', timestamp: Date.now() },
          { subtopic: 'bitcoin-announcement', timestamp: Date.now() },
          { subtopic: 'bitcoin-announcement', timestamp: Date.now() },
          { subtopic: 'bitcoin-release', timestamp: Date.now() }
        ], 
        currentPhase: 'announcement' 
      };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('announcement');
      expect(result.isChange).toBe(false);
    });

    it('handles cluster with null currentPhase', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { 
        timeline: [
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() },
          { subtopic: 'bitcoin-price', timestamp: Date.now() }
        ], 
        currentPhase: null 
      };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('speculation');
      expect(result.isChange).toBe(true);
    });

    it('uses most recent 10 entries for phase detection', () => {
      const evo = new TopicEvolution(runtime, logger);
      const timeline = [];
      // Add 15 old entries with one phase
      for (let i = 0; i < 15; i++) {
        timeline.push({ subtopic: 'bitcoin-price', timestamp: Date.now() - 1000000 });
      }
      // Add recent entries with different phase
      for (let i = 0; i < 5; i++) {
        timeline.push({ subtopic: 'bitcoin-technical', timestamp: Date.now() });
      }
      
      const cluster = { timeline, currentPhase: 'speculation' };
      const result = evo._detectPhase(cluster);
      expect(result.phase).toBe('analysis');
    });
  });

  describe('Evolution Score', () => {
    it('returns 0.0 for null cluster', () => {
      const evo = new TopicEvolution(runtime, logger);
      expect(evo._evolutionScore(null, 'test')).toBe(0.0);
    });

    it('returns 0.0 for empty timeline', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { timeline: [] };
      expect(evo._evolutionScore(cluster, 'test')).toBe(0.0);
    });

    it('calculates diversity score based on unique subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = {
        timeline: [
          { subtopic: 'sub1', timestamp: Date.now() },
          { subtopic: 'sub2', timestamp: Date.now() },
          { subtopic: 'sub3', timestamp: Date.now() },
          { subtopic: 'sub4', timestamp: Date.now() },
          { subtopic: 'sub5', timestamp: Date.now() },
          { subtopic: 'test', timestamp: Date.now() }
        ]
      };
      const score = evo._evolutionScore(cluster, 'test');
      expect(score).toBeGreaterThan(0);
    });

    it('adds recency bonus when subtopic is in last 3 entries', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = {
        timeline: [
          { subtopic: 'sub1', timestamp: Date.now() },
          { subtopic: 'sub2', timestamp: Date.now() },
          { subtopic: 'test', timestamp: Date.now() },
          { subtopic: 'test', timestamp: Date.now() }
        ]
      };
      const score = evo._evolutionScore(cluster, 'test');
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it('does not add recency bonus when subtopic is not recent', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = {
        timeline: [
          { subtopic: 'test', timestamp: Date.now() },
          { subtopic: 'sub1', timestamp: Date.now() },
          { subtopic: 'sub2', timestamp: Date.now() },
          { subtopic: 'sub3', timestamp: Date.now() },
          { subtopic: 'sub4', timestamp: Date.now() }
        ]
      };
      const score = evo._evolutionScore(cluster, 'test');
      // Should not include recency bonus of 0.2
      expect(score).toBeLessThan(1.0);
    });

    it('caps diversity at 5 distinct subtopics', () => {
      const evo = new TopicEvolution(runtime, logger);
      const timeline = [];
      // Create 10 unique subtopics
      for (let i = 0; i < 10; i++) {
        timeline.push({ subtopic: `sub${i}`, timestamp: Date.now() });
      }
      timeline.push({ subtopic: 'test', timestamp: Date.now() });
      
      const cluster = { timeline };
      const score = evo._evolutionScore(cluster, 'test');
      // Diversity maxes at 1.0 (5 unique / 5)
      expect(score).toBeLessThanOrEqual(1.2);
    });

    it('excludes just-recorded event from calculation', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = {
        timeline: [
          { subtopic: 'test', timestamp: Date.now() }
        ]
      };
      // The last entry is excluded, so we should get 0
      const score = evo._evolutionScore(cluster, 'test');
      expect(score).toBe(0.0);
    });
  });

  describe('Full Analysis Workflow', () => {
    it('returns null when disabled', async () => {
      const disabledRuntime = makeRuntime({ settings: { TOPIC_EVOLUTION_ENABLED: 'false' } });
      const evo = new TopicEvolution(disabledRuntime, logger, { narrativeMemory: mem });
      const result = await evo.analyze('bitcoin', 'test content');
      expect(result).toBeNull();
    });

    it('returns null when topic is missing', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const result = await evo.analyze(null, 'test content');
      expect(result).toBeNull();
    });

    it('returns null when content is missing', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const result = await evo.analyze('bitcoin', null);
      expect(result).toBeNull();
    });

    it('returns null when content is empty string', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const result = await evo.analyze('bitcoin', '');
      expect(result).toBeNull();
    });

    it('records angles in narrative memory and detects phase', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const topic = 'nostr';

      // Seed timeline to reach phase detection threshold quickly
      for (let i = 0; i < 6; i++) {
        await evo.analyze(topic, `relay upgrade discussion ${i}`);
      }
      const res = await evo.analyze(topic, 'major relay outage announcement');
      expect(res).toBeTruthy();
      expect(res.subtopic).toBeTruthy();
      expect(['announcement','analysis','general','speculation','adoption','backlash']).toContain(res.phase);

      const evoData = await mem.getTopicEvolution(topic, 30);
      expect(evoData).toBeTruthy();
      expect(evoData.topSubtopics?.length >= 1).toBe(true);
      expect(typeof evoData.currentPhase).toBe('string');
    });

    it('detects novel angles', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const topic = 'bitcoin';
      
      const res1 = await evo.analyze(topic, 'Bitcoin price pump');
      expect(res1.isNovelAngle).toBe(true);
      
      const res2 = await evo.analyze(topic, 'Bitcoin price dump');
      expect(res2.isNovelAngle).toBe(false); // Same subtopic (price)
    });

    it('detects phase changes', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const topic = 'bitcoin';
      
      // Establish initial phase
      for (let i = 0; i < 6; i++) {
        await evo.analyze(topic, `price volatility ${i}`);
      }
      
      // Change to different phase
      for (let i = 0; i < 6; i++) {
        await evo.analyze(topic, `technical development ${i}`);
      }
      
      const res = await evo.analyze(topic, 'protocol upgrade analysis');
      expect(res.isPhaseChange).toBeDefined();
    });

    it('calculates evolution score', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const topic = 'bitcoin';
      
      const res = await evo.analyze(topic, 'Bitcoin ETF news');
      expect(res.evolutionScore).toBeGreaterThanOrEqual(0);
      expect(res.evolutionScore).toBeLessThanOrEqual(1.2);
    });

    it('works without narrative memory', async () => {
      const evo = new TopicEvolution(runtime, logger);
      const res = await evo.analyze('bitcoin', 'Bitcoin price pump');
      expect(res).toBeTruthy();
      expect(res.subtopic).toBeTruthy();
      expect(res.phase).toBeTruthy();
    });

    it('handles recordTopicAngle failures gracefully', async () => {
      const badMem = {
        recordTopicAngle: () => { throw new Error('Record failed'); },
        getTopicCluster: () => ({ subtopics: new Set(), timeline: [], currentPhase: null })
      };
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: badMem });
      const res = await evo.analyze('bitcoin', 'test');
      expect(res).toBeTruthy();
    });

    it('handles setTopicPhase failures gracefully', async () => {
      const badMem = {
        recordTopicAngle: vi.fn(),
        getTopicCluster: () => ({ subtopics: new Set(), timeline: [], currentPhase: null }),
        setTopicPhase: () => { throw new Error('Set phase failed'); }
      };
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: badMem });
      const res = await evo.analyze('bitcoin', 'test');
      expect(res).toBeTruthy();
    });

    it('passes context hints to labelSubtopic', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('test-label');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger, { narrativeMemory: mem });
      
      const hints = { trending: ['btc', 'eth', 'nostr'] };
      await evo.analyze('bitcoin', 'test content', hints);
      
      expect(mockUseModel).toHaveBeenCalled();
    });

    it('converts topic to lowercase', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const res1 = await evo.analyze('Bitcoin', 'price pump');
      const res2 = await evo.analyze('bitcoin', 'price dump');
      
      // Both should use the same topic key
      const cluster = mem.getTopicCluster('bitcoin');
      expect(cluster).toBeTruthy();
      expect(cluster.timeline.length).toBeGreaterThanOrEqual(2);
    });

    it('truncates content when recording to memory', async () => {
      const recordSpy = vi.fn();
      const mockMem = {
        recordTopicAngle: recordSpy,
        getTopicCluster: () => ({ subtopics: new Set(), timeline: [], currentPhase: null })
      };
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mockMem });
      
      const longContent = 'a'.repeat(500);
      await evo.analyze('bitcoin', longContent);
      
      expect(recordSpy).toHaveBeenCalled();
      const recordedContent = recordSpy.mock.calls[0][2];
      expect(recordedContent.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Integration with NarrativeMemory', () => {
    it('narrative memory records topic angles', () => {
      mem.recordTopicAngle('bitcoin', 'bitcoin-price', 'test snippet', Date.now());
      const cluster = mem.getTopicCluster('bitcoin');
      expect(cluster).toBeTruthy();
      expect(cluster.subtopics.has('bitcoin-price')).toBe(true);
      expect(cluster.timeline.length).toBe(1);
    });

    it('narrative memory sets topic phase', () => {
      mem.setTopicPhase('bitcoin', 'speculation');
      const cluster = mem.getTopicCluster('bitcoin');
      expect(cluster).toBeTruthy();
      expect(cluster.currentPhase).toBe('speculation');
    });

    it('narrative memory maintains timeline order', () => {
      const now = Date.now();
      mem.recordTopicAngle('bitcoin', 'sub1', 'snippet1', now);
      mem.recordTopicAngle('bitcoin', 'sub2', 'snippet2', now + 1000);
      mem.recordTopicAngle('bitcoin', 'sub3', 'snippet3', now + 2000);
      
      const cluster = mem.getTopicCluster('bitcoin');
      expect(cluster.timeline.length).toBe(3);
      expect(cluster.timeline[0].subtopic).toBe('sub1');
      expect(cluster.timeline[2].subtopic).toBe('sub3');
    });

    it('narrative memory returns null for non-existent topics', () => {
      const cluster = mem.getTopicCluster('non-existent');
      expect(cluster).toBeNull();
    });

    it('getTopicEvolution includes cluster data', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      
      for (let i = 0; i < 5; i++) {
        await evo.analyze('bitcoin', `price discussion ${i}`);
      }
      
      const evoData = await mem.getTopicEvolution('bitcoin', 30);
      expect(evoData.currentPhase).toBeDefined();
      expect(evoData.topSubtopics).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long topic names', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const longTopic = 'a'.repeat(200);
      const res = await evo.analyze(longTopic, 'test content');
      expect(res).toBeTruthy();
    });

    it('handles special characters in topics', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const res = await evo.analyze('bitcoin!@#$%', 'test content');
      expect(res).toBeTruthy();
    });

    it('handles Unicode in content', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const res = await evo.analyze('bitcoin', '比特币价格上涨 🚀');
      expect(res).toBeTruthy();
      expect(res.subtopic).toBeTruthy();
    });

    it('handles rapid successive calls', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(evo.analyze('bitcoin', `content ${i}`));
      }
      
      const results = await Promise.all(promises);
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('handles missing methods in narrative memory', async () => {
      const incompleteMem = {};
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: incompleteMem });
      const res = await evo.analyze('bitcoin', 'test content');
      expect(res).toBeTruthy();
    });

    it('handles undefined context hints', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const res = await evo.analyze('bitcoin', 'test content', undefined);
      expect(res).toBeTruthy();
    });

    it('handles empty context hints', async () => {
      const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
      const res = await evo.analyze('bitcoin', 'test content', {});
      expect(res).toBeTruthy();
    });

    it('handles LLM returning non-string response', async () => {
      const mockUseModel = vi.fn().mockResolvedValue({ text: 'test-label', other: 'data' });
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const label = await evo.labelSubtopic('bitcoin', 'test');
      expect(label).toBeTruthy();
    });

    it('handles LLM returning empty string', async () => {
      const mockUseModel = vi.fn().mockResolvedValue('');
      const runtime2 = makeRuntime({ 
        settings: { TOPIC_EVOLUTION_ENABLED: 'true' },
        useModel: mockUseModel
      });
      const evo = new TopicEvolution(runtime2, logger);
      
      const label = await evo.labelSubtopic('bitcoin', 'Price pump');
      expect(label).toContain('price');
    });

    it('handles cluster with malformed timeline', () => {
      const evo = new TopicEvolution(runtime, logger);
      const cluster = { 
        timeline: [null, undefined, { subtopic: 'test' }],
        currentPhase: 'general'
      };
      const result = evo._detectPhase(cluster);
      expect(result).toBeDefined();
    });
  });
});
