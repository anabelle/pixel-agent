/**
 * This script shows what the enhanced prompt looks like with longitudinal analysis
 */

const { SelfReflectionEngine } = require('./lib/selfReflection');

function createEngine() {
  const runtime = {
    agentId: 'demo-agent',
    getSetting: () => null
  };
  
  return new SelfReflectionEngine(runtime, { 
    info: () => {}, 
    debug: () => {},
    warn: () => {}
  }, {
    createUniqueUuid: (runtime, seed) => `demo-${seed}`
  });
}

function showPromptExample() {
  console.log('=== Enhanced Prompt with Longitudinal Analysis ===\n');
  
  const engine = createEngine();
  
  const interactions = [{
    userMessage: 'Hey Pixel, love your latest pixel art drop!',
    yourReply: 'Thank you! 🎨✨ I put a lot of heart into this one. What caught your eye?',
    engagement: 'avg=0.82, success=90%, total=15',
    conversation: [
      {
        id: 'msg-1',
        role: 'user',
        author: 'alice123…abcd',
        text: 'Hey Pixel, love your latest pixel art drop!',
        type: 'nostr_mention',
        createdAtIso: '2025-10-13T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        role: 'you',
        author: 'you',
        text: 'Thank you! 🎨✨ I put a lot of heart into this one. What caught your eye?',
        createdAtIso: '2025-10-13T10:01:00.000Z',
        isReply: true
      },
      {
        id: 'msg-3',
        role: 'user',
        author: 'alice123…abcd',
        text: 'The glitch effect! Keep experimenting with that style!',
        createdAtIso: '2025-10-13T10:03:00.000Z'
      }
    ],
    feedback: [{
      author: 'alice123…abcd',
      summary: 'The glitch effect! Keep experimenting with that style!',
      createdAtIso: '2025-10-13T10:03:00.000Z'
    }],
    signals: ['zap_received: ⚡ 2100 sats from alice123'],
    metadata: {
      pubkey: 'alice123…abcd',
      replyId: 'msg-2',
      createdAtIso: '2025-10-13T10:01:00.000Z',
      participants: ['alice123…abcd', 'you']
    }
  }];

  const previousReflections = [{
    generatedAtIso: '2025-10-12T12:00:00.000Z',
    generatedAt: Date.now() - (24 * 60 * 60 * 1000),
    strengths: ['warm acknowledgements', 'asks follow-up questions'],
    weaknesses: ['emoji overuse'],
    recommendations: ['use fewer emojis', 'be more selective'],
    patterns: ['defaults to pixel/art metaphors'],
    improvements: ['more direct questions'],
    regressions: ['stacking emojis again']
  }];

  const longitudinalAnalysis = {
    timespan: {
      oldestReflection: '2025-07-15T00:00:00.000Z',
      newestReflection: '2025-10-12T00:00:00.000Z',
      totalReflections: 18
    },
    recurringIssues: [
      {
        issue: 'emoji overuse',
        occurrences: 6,
        severity: 'ongoing',
        periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo']
      },
      {
        issue: 'verbose replies',
        occurrences: 8,
        severity: 'resolved',
        periodsCovered: ['oneMonthAgo', 'older']
      }
    ],
    persistentStrengths: [
      {
        strength: 'friendly tone',
        occurrences: 16,
        consistency: 'stable',
        periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo', 'older']
      },
      {
        strength: 'asks engaging questions',
        occurrences: 12,
        consistency: 'stable',
        periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo', 'older']
      }
    ],
    evolvingPatterns: [
      {
        pattern: 'pixel metaphors',
        occurrences: 7,
        periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo']
      }
    ],
    evolutionTrends: {
      strengthsGained: ['concise replies', 'better timing'],
      weaknessesResolved: ['verbose replies', 'slow response time'],
      newChallenges: ['emoji overuse'],
      stagnantAreas: []
    },
    periodBreakdown: {
      recent: 4,
      oneWeekAgo: 5,
      oneMonthAgo: 6,
      older: 3
    }
  };

  const prompt = engine._buildPrompt(interactions, {
    contextSignals: ['pixel_drop_digest @ 2025-10-13T08:00:00.000Z: community excited about new glitch effects'],
    previousReflections,
    longitudinalAnalysis
  });

  console.log('📄 PROMPT PREVIEW:\n');
  console.log('─'.repeat(80));
  
  // Show first 2000 characters to give a sense of the structure
  const lines = prompt.split('\n');
  let charCount = 0;
  let lineCount = 0;
  
  for (const line of lines) {
    if (charCount + line.length > 2500) {
      console.log('\n... (prompt continues with interaction details and analysis instructions) ...\n');
      break;
    }
    console.log(line);
    charCount += line.length;
    lineCount++;
  }
  
  console.log('─'.repeat(80));
  console.log('\n✨ Key Features in the Prompt:');
  console.log('   1. Recent self-reflection insights (last 2 weeks)');
  console.log('   2. Longitudinal analysis spanning 3 months');
  console.log('   3. Recurring issues with occurrence counts and status');
  console.log('   4. Persistent strengths showing consistency');
  console.log('   5. Evolution trends (gains, resolutions, new challenges)');
  console.log('   6. Context signals from other memory types');
  console.log('   7. Full conversation context with feedback');
  console.log('   8. Specific guidance to compare against long-term patterns');
  
  console.log('\n📊 Statistics:');
  console.log(`   - Total prompt length: ${prompt.length} characters`);
  console.log(`   - Contains "LONGITUDINAL ANALYSIS": ${prompt.includes('LONGITUDINAL ANALYSIS')}`);
  console.log(`   - Contains recurring issues: ${prompt.includes('emoji overuse')}`);
  console.log(`   - Contains persistent strengths: ${prompt.includes('friendly tone')}`);
  console.log(`   - Contains evolution trends: ${prompt.includes('EVOLUTION TRENDS')}`);
  console.log(`   - Mentions resolved weaknesses: ${prompt.includes('verbose replies')}`);
  
  console.log('\n💡 Impact:');
  console.log('   The LLM now has comprehensive context about:');
  console.log('   • Long-term behavioral patterns (3 months of history)');
  console.log('   • Which issues have persisted vs. been resolved');
  console.log('   • Consistent strengths to maintain');
  console.log('   • Recent improvements and regressions');
  console.log('   • Whether current behavior aligns with evolution trajectory');
  
  console.log('\n=== End of Prompt Preview ===\n');
}

// Run the example
showPromptExample();
