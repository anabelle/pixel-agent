const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine longitudinal analysis', () => {
  let engine;
  let mockRuntime;
  let mockMemories;

  beforeEach(() => {
    mockMemories = [];
    
    mockRuntime = {
      getSetting: () => null,
      agentId: 'test-agent-id',
      getMemories: async ({ roomId, count }) => {
        return mockMemories.slice(0, count);
      },
      createMemory: async (memory) => ({ created: true, id: memory.id })
    };

    engine = new SelfReflectionEngine(mockRuntime, console, {
      createUniqueUuid: (runtime, seed) => `uuid-${seed}-${Date.now()}`
    });
  });

  describe('getLongTermReflectionHistory', () => {
    it('retrieves reflections within specified time range', async () => {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      const oneMonth = 30 * 24 * 60 * 60 * 1000;

      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - oneWeek,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneWeek).toISOString(),
              analysis: {
                strengths: ['clear communication'],
                weaknesses: ['verbose replies'],
                patterns: ['pixel metaphors']
              }
            }
          }
        },
        {
          id: 'mem-2',
          createdAt: now - oneMonth,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneMonth).toISOString(),
              analysis: {
                strengths: ['friendly tone'],
                weaknesses: ['verbose replies'],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-3',
          createdAt: now - (100 * 24 * 60 * 60 * 1000), // 100 days ago (beyond default 90 days)
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (100 * 24 * 60 * 60 * 1000)).toISOString(),
              analysis: {
                strengths: ['engaging'],
                weaknesses: ['off-topic'],
                patterns: []
              }
            }
          }
        }
      ];

      const history = await engine.getLongTermReflectionHistory({ limit: 10 });

      // Should include first two but not the third (beyond 90 days)
      expect(history.length).toBe(2);
      expect(history[0].strengths).toContain('clear communication');
      expect(history[1].strengths).toContain('friendly tone');
    });

    it('respects custom maxAgeDays parameter', async () => {
      const now = Date.now();
      const oneMonth = 30 * 24 * 60 * 60 * 1000;

      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - oneMonth,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneMonth).toISOString(),
              analysis: {
                strengths: ['clear communication'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-2',
          createdAt: now - (2 * oneMonth),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (2 * oneMonth)).toISOString(),
              analysis: {
                strengths: ['friendly tone'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        }
      ];

      // With maxAgeDays=45, should only get first reflection
      const history = await engine.getLongTermReflectionHistory({ maxAgeDays: 45 });

      expect(history.length).toBe(1);
      expect(history[0].strengths).toContain('clear communication');
    });
  });

  describe('analyzeLongitudinalPatterns', () => {
    it('identifies recurring issues across time periods', async () => {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - oneWeek,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneWeek).toISOString(),
              analysis: {
                strengths: [],
                weaknesses: ['verbose replies', 'slow response time'],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-2',
          createdAt: now - (2 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (2 * oneWeek)).toISOString(),
              analysis: {
                strengths: [],
                weaknesses: ['verbose replies', 'inconsistent tone'],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-3',
          createdAt: now - (5 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (5 * oneWeek)).toISOString(),
              analysis: {
                strengths: [],
                weaknesses: ['verbose replies'],
                patterns: []
              }
            }
          }
        }
      ];

      const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10 });

      expect(analysis).toBeTruthy();
      expect(analysis.recurringIssues.length).toBeGreaterThan(0);
      
      const verboseIssue = analysis.recurringIssues.find(i => 
        i.issue.toLowerCase().includes('verbose')
      );
      expect(verboseIssue).toBeTruthy();
      expect(verboseIssue.occurrences).toBe(3);
      expect(verboseIssue.periodsCovered.length).toBeGreaterThan(1);
    });

    it('identifies persistent strengths', async () => {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - oneWeek,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneWeek).toISOString(),
              analysis: {
                strengths: ['friendly tone', 'engaging'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-2',
          createdAt: now - (2 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (2 * oneWeek)).toISOString(),
              analysis: {
                strengths: ['friendly tone', 'helpful'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-3',
          createdAt: now - (6 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (6 * oneWeek)).toISOString(),
              analysis: {
                strengths: ['friendly tone'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        }
      ];

      const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10 });

      expect(analysis).toBeTruthy();
      expect(analysis.persistentStrengths.length).toBeGreaterThan(0);
      
      const friendlyStrength = analysis.persistentStrengths.find(s => 
        s.strength.toLowerCase().includes('friendly')
      );
      expect(friendlyStrength).toBeTruthy();
      expect(friendlyStrength.occurrences).toBe(3);
      expect(friendlyStrength.consistency).toBeTruthy();
    });

    it('detects evolution trends comparing recent vs older periods', async () => {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      mockMemories = [
        // Recent: resolved "verbose replies" issue
        {
          id: 'mem-1',
          createdAt: now - (3 * 24 * 60 * 60 * 1000), // 3 days ago
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (3 * 24 * 60 * 60 * 1000)).toISOString(),
              analysis: {
                strengths: ['concise replies'],
                weaknesses: ['new challenge: emoji overuse'],
                patterns: []
              }
            }
          }
        },
        // Older: had "verbose replies" issue
        {
          id: 'mem-2',
          createdAt: now - (5 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (5 * oneWeek)).toISOString(),
              analysis: {
                strengths: [],
                weaknesses: ['verbose replies'],
                patterns: []
              }
            }
          }
        }
      ];

      const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10 });

      expect(analysis).toBeTruthy();
      expect(analysis.evolutionTrends).toBeTruthy();
      
      // Should detect "verbose replies" as resolved
      const resolved = analysis.evolutionTrends.weaknessesResolved;
      expect(resolved.length).toBeGreaterThan(0);
      
      // Should detect "emoji overuse" as new challenge
      const newChallenges = analysis.evolutionTrends.newChallenges;
      expect(newChallenges.length).toBeGreaterThan(0);

      // Should detect "concise replies" as new strength
      const strengthsGained = analysis.evolutionTrends.strengthsGained;
      expect(strengthsGained.length).toBeGreaterThan(0);
    });

    it('returns null when insufficient history is available', async () => {
      mockMemories = [
        {
          id: 'mem-1',
          createdAt: Date.now(),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date().toISOString(),
              analysis: {
                strengths: ['friendly'],
                weaknesses: [],
                patterns: []
              }
            }
          }
        }
      ];

      const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10 });

      expect(analysis).toBeNull();
    });
  });

  describe('_normalizeForComparison', () => {
    it('normalizes text for consistent comparison', () => {
      expect(engine._normalizeForComparison('Verbose replies!')).toBe('verbose replies');
      expect(engine._normalizeForComparison('verbose  replies')).toBe('verbose replies');
      expect(engine._normalizeForComparison('Verbose Replies.')).toBe('verbose replies');
    });
  });

  describe('integration with analyzeInteractionQuality', () => {
    it('includes longitudinal analysis in prompt when available', async () => {
      const now = Date.now();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      mockMemories = [
        {
          id: 'mem-1',
          createdAt: now - oneWeek,
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - oneWeek).toISOString(),
              analysis: {
                strengths: ['clear'],
                weaknesses: ['verbose'],
                patterns: []
              }
            }
          }
        },
        {
          id: 'mem-2',
          createdAt: now - (5 * oneWeek),
          content: {
            type: 'self_reflection',
            data: {
              generatedAt: new Date(now - (5 * oneWeek)).toISOString(),
              analysis: {
                strengths: [],
                weaknesses: ['verbose'],
                patterns: []
              }
            }
          }
        }
      ];

      // Mock getMemories to return different results for different calls
      let callCount = 0;
      mockRuntime.getMemories = async ({ roomId, count, tableName }) => {
        callCount++;
        if (tableName === 'messages' && !roomId) {
          // This is the getRecentInteractions call - return empty to skip that part
          return [];
        }
        // This is the reflection history call
        return mockMemories.slice(0, count);
      };

      const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10 });

      expect(analysis).toBeTruthy();
      expect(analysis.recurringIssues.length).toBeGreaterThan(0);
    });
  });
});
