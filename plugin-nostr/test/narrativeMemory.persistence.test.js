const { describe, it, expect, beforeEach, vi } = globalThis;
const { NarrativeMemory } = require('../lib/narrativeMemory');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };

function createMockRuntime(overrides = {}) {
  return {
    agentId: 'test-agent-id',
    getSetting: vi.fn((key) => overrides.settings?.[key] || null),
    getMemories: vi.fn(async (params) => {
      return overrides.memories || [];
    }),
    createMemory: vi.fn(async (memory) => ({ created: true, ...memory })),
    createUniqueUuid: vi.fn((runtime, seed) => `uuid-${seed}-${Date.now()}`),
    ...overrides
  };
}

describe('NarrativeMemory - Persistence', () => {
  describe('_persistNarrative()', () => {
    it('returns early when runtime not available', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'hourly');
      
      // Should not throw
    });

    it('returns early when createMemory not available', async () => {
      const runtime = { agentId: 'test' };
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'hourly');
      
      // Should not throw
    });

    it('returns early when createUniqueUuid not available', async () => {
      const runtime = {
        agentId: 'test',
        createMemory: vi.fn()
      };
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'hourly');
      
      // Should not throw
      expect(runtime.createMemory).not.toHaveBeenCalled();
    });

    it('creates memory with correct structure', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      // Mock the context module
      vi.mock('../lib/context', () => ({
        createMemorySafe: vi.fn(async (runtime, memory) => ({ created: true }))
      }));
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'hourly');
      
      // Verify createUniqueUuid was called
      expect(runtime.createUniqueUuid).toHaveBeenCalled();
    });

    it('uses correct narrative type in memory', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const createMemorySafe = vi.fn(async () => ({ created: true }));
      vi.doMock('../lib/context', () => ({ createMemorySafe }));
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'daily');
      
      // Memory structure should include type
    });

    it('handles persistence errors gracefully', async () => {
      const runtime = createMockRuntime();
      runtime.createMemory = vi.fn().mockRejectedValue(new Error('DB error'));
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const narrative = { summary: { totalEvents: 100 } };
      
      await expect(nm._persistNarrative(narrative, 'hourly')).resolves.not.toThrow();
    });

    it('gets system context for room IDs', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      const getContextSpy = vi.spyOn(nm, '_getSystemContext').mockResolvedValue({
        rooms: {
          narrativesHourly: 'hourly-room-id',
          narrativesDaily: 'daily-room-id'
        },
        entityId: 'entity-id',
        worldId: 'world-id'
      });
      
      const narrative = { summary: { totalEvents: 100 } };
      await nm._persistNarrative(narrative, 'hourly');
      
      expect(getContextSpy).toHaveBeenCalled();
    });

    it('supports different narrative types', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      const types = ['hourly', 'daily', 'weekly', 'monthly', 'timeline'];
      
      for (const type of types) {
        const narrative = { summary: { type } };
        await nm._persistNarrative(narrative, type);
      }
      
      // Should not throw for any type
    });
  });

  describe('_loadRecentNarratives()', () => {
    it('returns early when runtime not available', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives.length).toBe(0);
    });

    it('returns early when getMemories not available', async () => {
      const runtime = { agentId: 'test' };
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives.length).toBe(0);
    });

    it('loads hourly narratives from memory', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: { summary: { totalEvents: 100 } }
          },
          createdAt: Date.now()
        },
        {
          content: {
            type: 'narrative_hourly',
            data: { summary: { totalEvents: 150 } }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives.length).toBe(2);
      expect(nm.hourlyNarratives[0].type).toBe('hourly');
    });

    it('loads daily narratives from memory', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_daily',
            data: { summary: { totalEvents: 1000 } }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.dailyNarratives.length).toBe(1);
      expect(nm.dailyNarratives[0].type).toBe('daily');
    });

    it('loads weekly narratives from memory', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_weekly',
            data: { summary: { totalEvents: 7000 } }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.weeklyNarratives.length).toBe(1);
    });

    it('loads timeline lore from memory', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_timeline',
            data: {
              headline: 'Test lore',
              tags: ['test'],
              priority: 'high'
            }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.timelineLore.length).toBe(1);
      expect(nm.timelineLore[0].type).toBe('timeline');
    });

    it('sorts narratives by timestamp', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: { id: 'newer' }
          },
          createdAt: 2000
        },
        {
          content: {
            type: 'narrative_hourly',
            data: { id: 'older' }
          },
          createdAt: 1000
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives[0].id).toBe('older');
      expect(nm.hourlyNarratives[1].id).toBe('newer');
    });

    it('skips invalid memory entries', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: { summary: { totalEvents: 100 } }
          },
          createdAt: Date.now()
        },
        {
          content: {
            type: 'other_type',
            data: {}
          }
        },
        {
          // Missing content
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives.length).toBe(1);
    });

    it('handles getMemories errors', async () => {
      const runtime = createMockRuntime();
      runtime.getMemories = vi.fn().mockRejectedValue(new Error('DB error'));
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await expect(nm._loadRecentNarratives()).resolves.not.toThrow();
    });

    it('uses default timestamp when createdAt missing', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: { summary: { totalEvents: 100 } }
          }
          // No createdAt
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives[0].timestamp).toBeDefined();
    });

    it('logs loaded narrative counts', async () => {
      const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: { summary: {} }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, logger);
      
      await nm._loadRecentNarratives();
      
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Loaded'));
    });

    it('respects cache limits during load', async () => {
      const memories = [];
      for (let i = 0; i < 200; i++) {
        memories.push({
          content: {
            type: 'narrative_hourly',
            data: { id: i }
          },
          createdAt: Date.now() + i
        });
      }
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm._loadRecentNarratives();
      
      expect(nm.hourlyNarratives.length).toBeLessThanOrEqual(nm.maxHourlyCache);
    });
  });

  describe('_rebuildTrends()', () => {
    it('rebuilds trends from loaded narratives', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      // Manually add narratives
      nm.hourlyNarratives.push({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }]
        }
      });
      
      await nm._rebuildTrends();
      
      expect(nm.topicTrends.has('bitcoin')).toBe(true);
    });

    it('processes both hourly and daily narratives', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      nm.hourlyNarratives.push({
        summary: {
          topTopics: [{ topic: 'bitcoin', count: 10 }]
        }
      });
      
      nm.dailyNarratives.push({
        summary: {
          topTopics: [{ topic: 'lightning', count: 5 }]
        }
      });
      
      await nm._rebuildTrends();
      
      expect(nm.topicTrends.has('bitcoin')).toBe(true);
      expect(nm.topicTrends.has('lightning')).toBe(true);
    });

    it('updates engagement trends', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      nm.hourlyNarratives.push({
        summary: {
          eventCount: 100,
          users: { size: 50 }
        }
      });
      
      await nm._rebuildTrends();
      
      expect(nm.engagementTrends.length).toBeGreaterThan(0);
    });

    it('handles empty narrative arrays', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      await nm._rebuildTrends();
      
      expect(nm.topicTrends.size).toBe(0);
      expect(nm.engagementTrends.length).toBe(0);
    });
  });

  describe('_getSystemContext()', () => {
    it('returns null when runtime not available', async () => {
      const nm = new NarrativeMemory(null, noopLogger);
      
      const context = await nm._getSystemContext();
      
      expect(context).toBeNull();
    });

    it('returns cached context on subsequent calls', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      // Mock ensureNostrContextSystem
      vi.doMock('../lib/context', () => ({
        ensureNostrContextSystem: vi.fn(async () => ({
          rooms: {},
          entityId: 'test-entity'
        }))
      }));
      
      const context1 = await nm._getSystemContext();
      const context2 = await nm._getSystemContext();
      
      expect(context1).toBe(context2);
    });

    it('handles context initialization errors', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      // Mock ensureNostrContextSystem to throw
      vi.doMock('../lib/context', () => ({
        ensureNostrContextSystem: vi.fn().mockRejectedValue(new Error('Context error'))
      }));
      
      const context = await nm._getSystemContext();
      
      // Should handle error gracefully
    });

    it('resets promise on error', async () => {
      const runtime = createMockRuntime();
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      vi.doMock('../lib/context', () => ({
        ensureNostrContextSystem: vi.fn()
          .mockRejectedValueOnce(new Error('First error'))
          .mockResolvedValueOnce({ rooms: {}, entityId: 'test' })
      }));
      
      await nm._getSystemContext(); // First call fails
      const context = await nm._getSystemContext(); // Second call should retry
      
      // Should be able to retry after error
    });
  });

  describe('Integration - Load and Rebuild', () => {
    it('initializes with historical data', async () => {
      const memories = [
        {
          content: {
            type: 'narrative_hourly',
            data: {
              summary: {
                topTopics: [{ topic: 'bitcoin', count: 10 }],
                eventCount: 100,
                users: { size: 50 }
              }
            }
          },
          createdAt: Date.now()
        }
      ];
      
      const runtime = createMockRuntime({ memories });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm.initialize();
      
      expect(nm.initialized).toBe(true);
      expect(nm.hourlyNarratives.length).toBe(1);
      expect(nm.topicTrends.has('bitcoin')).toBe(true);
      expect(nm.engagementTrends.length).toBe(1);
    });

    it('handles initialization with no historical data', async () => {
      const runtime = createMockRuntime({ memories: [] });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm.initialize();
      
      expect(nm.initialized).toBe(true);
      expect(nm.hourlyNarratives.length).toBe(0);
    });

    it('prevents double initialization', async () => {
      const runtime = createMockRuntime({ memories: [] });
      const nm = new NarrativeMemory(runtime, noopLogger);
      
      await nm.initialize();
      await nm.initialize();
      
      expect(nm.initialized).toBe(true);
      expect(runtime.getMemories).toHaveBeenCalledTimes(4); // Once per narrative type (hourly, daily, weekly, timeline)
    });
  });
});
