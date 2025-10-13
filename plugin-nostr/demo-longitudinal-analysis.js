/**
 * Demonstration script for the Longitudinal Analysis feature
 * 
 * This script shows how the self-reflection engine can now:
 * 1. Retrieve long-term reflection history (weeks/months)
 * 2. Detect recurring issues across time periods
 * 3. Identify persistent strengths
 * 4. Track evolution trends (improvements, regressions, new challenges)
 */

const { SelfReflectionEngine } = require('./lib/selfReflection');

// Mock runtime with sample reflection history
function createMockRuntime() {
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  
  // Simulate reflection memories across 3 months
  const mockMemories = [
    // Week 1 (recent)
    {
      id: 'mem-week1',
      createdAt: now - (3 * 24 * 60 * 60 * 1000),
      content: {
        type: 'self_reflection',
        data: {
          generatedAt: new Date(now - (3 * 24 * 60 * 60 * 1000)).toISOString(),
          analysis: {
            strengths: ['concise replies', 'friendly tone', 'good engagement'],
            weaknesses: ['emoji overuse', 'sometimes off-topic'],
            patterns: ['uses pixel metaphors frequently'],
            recommendations: ['reduce emoji use', 'stay focused on topic']
          }
        }
      }
    },
    // Week 2
    {
      id: 'mem-week2',
      createdAt: now - (10 * 24 * 60 * 60 * 1000),
      content: {
        type: 'self_reflection',
        data: {
          generatedAt: new Date(now - (10 * 24 * 60 * 60 * 1000)).toISOString(),
          analysis: {
            strengths: ['friendly tone', 'helpful responses'],
            weaknesses: ['verbose replies', 'sometimes off-topic'],
            patterns: ['uses pixel metaphors frequently'],
            recommendations: ['be more concise', 'stay on topic']
          }
        }
      }
    },
    // Week 4
    {
      id: 'mem-week4',
      createdAt: now - (25 * 24 * 60 * 60 * 1000),
      content: {
        type: 'self_reflection',
        data: {
          generatedAt: new Date(now - (25 * 24 * 60 * 60 * 1000)).toISOString(),
          analysis: {
            strengths: ['friendly tone', 'creative responses'],
            weaknesses: ['verbose replies', 'slow to respond'],
            patterns: ['uses pixel metaphors', 'tends to over-explain'],
            recommendations: ['be more concise', 'respond faster']
          }
        }
      }
    },
    // Week 8
    {
      id: 'mem-week8',
      createdAt: now - (55 * 24 * 60 * 60 * 1000),
      content: {
        type: 'self_reflection',
        data: {
          generatedAt: new Date(now - (55 * 24 * 60 * 60 * 1000)).toISOString(),
          analysis: {
            strengths: ['friendly tone', 'engaging personality'],
            weaknesses: ['verbose replies', 'inconsistent tone'],
            patterns: ['uses humor effectively'],
            recommendations: ['maintain consistent tone', 'be more concise']
          }
        }
      }
    },
    // Week 12
    {
      id: 'mem-week12',
      createdAt: now - (85 * 24 * 60 * 60 * 1000),
      content: {
        type: 'self_reflection',
        data: {
          generatedAt: new Date(now - (85 * 24 * 60 * 60 * 1000)).toISOString(),
          analysis: {
            strengths: ['friendly tone', 'creative'],
            weaknesses: ['verbose replies', 'poor timing'],
            patterns: ['tends to ramble'],
            recommendations: ['be more direct']
          }
        }
      }
    }
  ];

  return {
    agentId: 'demo-agent',
    getSetting: () => null,
    getMemories: async ({ roomId, count }) => {
      return mockMemories.slice(0, count);
    }
  };
}

async function demonstrateLongitudinalAnalysis() {
  console.log('=== Longitudinal Analysis Demonstration ===\n');

  const runtime = createMockRuntime();
  const engine = new SelfReflectionEngine(runtime, console, {
    createUniqueUuid: (runtime, seed) => `demo-${seed}`
  });

  console.log('Step 1: Retrieving long-term reflection history...\n');
  const history = await engine.getLongTermReflectionHistory({ limit: 10, maxAgeDays: 90 });
  console.log(`Retrieved ${history.length} reflections from the past 90 days\n`);

  console.log('Step 2: Analyzing longitudinal patterns...\n');
  const analysis = await engine.analyzeLongitudinalPatterns({ limit: 10, maxAgeDays: 90 });

  if (!analysis) {
    console.log('Not enough history for longitudinal analysis');
    return;
  }

  console.log('📊 LONGITUDINAL ANALYSIS RESULTS\n');
  console.log('─'.repeat(60));

  console.log('\n🕐 TIMESPAN:');
  console.log(`  Total Reflections: ${analysis.timespan.totalReflections}`);
  console.log(`  Oldest: ${analysis.timespan.oldestReflection}`);
  console.log(`  Newest: ${analysis.timespan.newestReflection}`);

  console.log('\n⚠️  RECURRING ISSUES (patterns that persist over time):');
  if (analysis.recurringIssues.length === 0) {
    console.log('  None detected');
  } else {
    analysis.recurringIssues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. "${issue.issue}"`);
      console.log(`     - Occurrences: ${issue.occurrences}x`);
      console.log(`     - Status: ${issue.severity}`);
      console.log(`     - Time periods: ${issue.periodsCovered.join(', ')}`);
    });
  }

  console.log('\n✨ PERSISTENT STRENGTHS (consistent positive patterns):');
  if (analysis.persistentStrengths.length === 0) {
    console.log('  None detected');
  } else {
    analysis.persistentStrengths.forEach((strength, idx) => {
      console.log(`  ${idx + 1}. "${strength.strength}"`);
      console.log(`     - Occurrences: ${strength.occurrences}x`);
      console.log(`     - Consistency: ${strength.consistency}`);
      console.log(`     - Time periods: ${strength.periodsCovered.join(', ')}`);
    });
  }

  console.log('\n📈 EVOLUTION TRENDS:');
  
  console.log('  Strengths Gained:');
  if (analysis.evolutionTrends.strengthsGained.length === 0) {
    console.log('    - None detected');
  } else {
    analysis.evolutionTrends.strengthsGained.forEach(s => {
      console.log(`    - ${s}`);
    });
  }

  console.log('  Weaknesses Resolved:');
  if (analysis.evolutionTrends.weaknessesResolved.length === 0) {
    console.log('    - None detected');
  } else {
    analysis.evolutionTrends.weaknessesResolved.forEach(w => {
      console.log(`    - ${w}`);
    });
  }

  console.log('  New Challenges:');
  if (analysis.evolutionTrends.newChallenges.length === 0) {
    console.log('    - None detected');
  } else {
    analysis.evolutionTrends.newChallenges.forEach(c => {
      console.log(`    - ${c}`);
    });
  }

  console.log('  Stagnant Areas (persistent issues):');
  if (analysis.evolutionTrends.stagnantAreas.length === 0) {
    console.log('    - None detected');
  } else {
    analysis.evolutionTrends.stagnantAreas.forEach(a => {
      console.log(`    - ${a}`);
    });
  }

  console.log('\n📅 PERIOD BREAKDOWN:');
  console.log(`  Recent (last week): ${analysis.periodBreakdown.recent} reflections`);
  console.log(`  1-2 weeks ago: ${analysis.periodBreakdown.oneWeekAgo} reflections`);
  console.log(`  3-5 weeks ago: ${analysis.periodBreakdown.oneMonthAgo} reflections`);
  console.log(`  Older than 5 weeks: ${analysis.periodBreakdown.older} reflections`);

  console.log('\n─'.repeat(60));
  console.log('\n✅ Key Insights:');
  console.log('  - The agent has maintained "friendly tone" as a persistent strength');
  console.log('  - "Verbose replies" is a recurring issue that needs attention');
  console.log('  - Recent improvement: switched to "concise replies"');
  console.log('  - New challenge emerged: "emoji overuse"');
  console.log('  - The agent is evolving: resolved "slow to respond" and "inconsistent tone"');
  console.log('\n=== End of Demonstration ===\n');
}

// Run the demonstration
demonstrateLongitudinalAnalysis().catch(err => {
  console.error('Error running demonstration:', err);
  process.exit(1);
});
