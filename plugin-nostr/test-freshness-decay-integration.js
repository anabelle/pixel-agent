#!/usr/bin/env node

/**
 * Integration test for Content Freshness Decay Algorithm
 * 
 * This test simulates the real-world scenario where:
 * 1. Timeline lore digests are generated with specific topics/tags
 * 2. New candidate events are evaluated for engagement
 * 3. Freshness penalty is applied based on recent coverage
 * 4. Novel angles and storyline advancements are protected from excessive penalty
 */

const { NarrativeMemory } = require('./lib/narrativeMemory');
const { TopicEvolution } = require('./lib/topicEvolution');

const noopLogger = { 
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.log('[WARN]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  error: (...args) => console.log('[ERROR]', ...args)
};

// Mock runtime for settings
function createMockRuntime(settings = {}) {
  return {
    getSetting: (key) => settings[key] || process.env[key],
    character: { name: 'TestAgent' }
  };
}

// Simulate _computeFreshnessPenalty logic
function computeFreshnessPenalty(topics, narrativeMemory, options = {}) {
  const {
    lookbackHours = 24,
    lookbackDigests = 3,
    mentionsFullIntensity = 5,
    maxPenalty = 0.4,
    similarityBump = 0.05,
    noveltyReduction = 0.5,
    evolutionAnalysis = null,
    content = '',
  } = options;

  if (topics.length === 0) return 0;

  const recentLoreTags = narrativeMemory.getRecentLoreTags(lookbackDigests);
  const topicPenalties = [];
  const now = Date.now();

  for (const topic of topics) {
    const { mentions, lastSeen } = narrativeMemory.getTopicRecency(topic, lookbackHours);

    if (!lastSeen || mentions === 0) {
      topicPenalties.push(0);
      continue;
    }

    const hoursSince = (now - lastSeen) / (1000 * 60 * 60);
    const stalenessBase = Math.max(0, Math.min(1, (lookbackHours - hoursSince) / lookbackHours));
    const intensity = Math.max(0, Math.min(1, mentions / mentionsFullIntensity));
    const topicPenalty = stalenessBase * (0.25 + 0.35 * intensity);

    topicPenalties.push(topicPenalty);
  }

  let finalPenalty = topicPenalties.length > 0 ? Math.max(...topicPenalties) : 0;

  // Similarity bump
  let hasSimilarityBump = false;
  for (const topic of topics) {
    if (recentLoreTags.has(topic.toLowerCase())) {
      hasSimilarityBump = true;
      break;
    }
  }
  if (hasSimilarityBump) {
    finalPenalty = Math.min(maxPenalty, finalPenalty + similarityBump);
  }

  // Novelty reduction
  if (evolutionAnalysis && (evolutionAnalysis.isNovelAngle || evolutionAnalysis.isPhaseChange)) {
    finalPenalty = finalPenalty * (1 - noveltyReduction);
  }

  // Storyline advancement reduction
  const advancement = narrativeMemory.checkStorylineAdvancement(content, topics);
  if (advancement && (advancement.advancesRecurringTheme || advancement.watchlistMatches?.length > 0)) {
    finalPenalty = Math.max(0, finalPenalty - 0.1);
  }

  return Math.max(0, Math.min(maxPenalty, finalPenalty));
}

async function runIntegrationTest() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║  Integration Test: Content Freshness Decay Algorithm             ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  const mockRuntime = createMockRuntime({
    NOSTR_FRESHNESS_DECAY_ENABLE: 'true',
    NOSTR_FRESHNESS_LOOKBACK_HOURS: '24',
    NOSTR_FRESHNESS_LOOKBACK_DIGESTS: '3',
    NOSTR_FRESHNESS_MENTIONS_FULL_INTENSITY: '5',
    NOSTR_FRESHNESS_MAX_PENALTY: '0.4',
    NOSTR_FRESHNESS_SIMILARITY_BUMP: '0.05',
    NOSTR_FRESHNESS_NOVELTY_REDUCTION: '0.5'
  });
  
  const nm = new NarrativeMemory(mockRuntime, noopLogger);
  
  console.log('📋 Test Scenario: Evaluating events with different levels of topic coverage\n');
  console.log('═'.repeat(70));
  console.log('SETUP: Creating timeline lore with recent bitcoin coverage');
  console.log('═'.repeat(70) + '\n');
  
  const now = Date.now();
  
  // Simulate recent bitcoin coverage in timeline lore (heavy)
  console.log('Adding digest entries with bitcoin tags:\n');
  for (let i = 0; i < 5; i++) {
    const timestamp = now - (i * 3600000); // Every hour for 5 hours
    nm.timelineLore.push({
      timestamp,
      tags: ['bitcoin', 'price', 'crypto'],
      priority: 'high',
      headline: `Bitcoin price update ${i + 1}`,
      narrative: 'Bitcoin price movements discussed'
    });
    console.log(`  [${i + 1}] ${new Date(timestamp).toLocaleTimeString()}: bitcoin, price, crypto`);
  }
  
  // Add one ethereum mention (light coverage)
  nm.timelineLore.push({
    timestamp: now - (12 * 3600000), // 12 hours ago
    tags: ['ethereum', 'defi'],
    priority: 'medium',
    headline: 'Ethereum DeFi activity',
    narrative: 'Ethereum DeFi ecosystem discussed'
  });
  console.log(`  [6] ${new Date(now - (12 * 3600000)).toLocaleTimeString()}: ethereum, defi\n`);
  
  console.log('═'.repeat(70));
  console.log('TEST CASE A: Recent, heavily covered topic (bitcoin)');
  console.log('═'.repeat(70) + '\n');
  
  const bitcoinTopics = ['bitcoin', 'price'];
  const bitcoinPenalty = computeFreshnessPenalty(bitcoinTopics, nm);
  const baseScore = 0.7;
  const bitcoinFinalScore = baseScore * (1 - bitcoinPenalty);
  
  console.log(`Topics: ${bitcoinTopics.join(', ')}`);
  console.log(`Recency: ${nm.getTopicRecency('bitcoin', 24).mentions} mentions in last 24h`);
  console.log(`Last seen: ${new Date(nm.getTopicRecency('bitcoin', 24).lastSeen).toLocaleTimeString()}`);
  console.log(`\nComputed penalty: ${(bitcoinPenalty * 100).toFixed(1)}%`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${bitcoinFinalScore.toFixed(2)} (-${((baseScore - bitcoinFinalScore) * 100).toFixed(1)}%)\n`);
  
  console.log('Expected: High penalty (~30-40%) due to heavy recent coverage\n');
  
  console.log('═'.repeat(70));
  console.log('TEST CASE B: Same topic but with NOVEL ANGLE');
  console.log('═'.repeat(70) + '\n');
  
  const noveltyAnalysis = {
    isNovelAngle: true,
    isPhaseChange: false,
    subtopic: 'bitcoin-regulation',
    phase: 'announcement'
  };
  
  const bitcoinNoveltyPenalty = computeFreshnessPenalty(bitcoinTopics, nm, {
    evolutionAnalysis: noveltyAnalysis
  });
  const bitcoinNoveltyFinalScore = baseScore * (1 - bitcoinNoveltyPenalty);
  
  console.log(`Topics: ${bitcoinTopics.join(', ')}`);
  console.log(`Novel angle detected: ${noveltyAnalysis.subtopic}`);
  console.log(`\nComputed penalty: ${(bitcoinNoveltyPenalty * 100).toFixed(1)}% (reduced by novelty)`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${bitcoinNoveltyFinalScore.toFixed(2)} (-${((baseScore - bitcoinNoveltyFinalScore) * 100).toFixed(1)}%)\n`);
  console.log(`Penalty reduction: ${((bitcoinPenalty - bitcoinNoveltyPenalty) * 100).toFixed(1)}%\n`);
  
  console.log('Expected: Penalty reduced by ~50% due to novel angle\n');
  
  console.log('═'.repeat(70));
  console.log('TEST CASE C: Same topic with PHASE CHANGE');
  console.log('═'.repeat(70) + '\n');
  
  const phaseChangeAnalysis = {
    isNovelAngle: false,
    isPhaseChange: true,
    subtopic: 'bitcoin-price',
    phase: 'adoption'
  };
  
  const bitcoinPhasePenalty = computeFreshnessPenalty(bitcoinTopics, nm, {
    evolutionAnalysis: phaseChangeAnalysis
  });
  const bitcoinPhaseFinalScore = baseScore * (1 - bitcoinPhasePenalty);
  
  console.log(`Topics: ${bitcoinTopics.join(', ')}`);
  console.log(`Phase change detected: ${phaseChangeAnalysis.phase}`);
  console.log(`\nComputed penalty: ${(bitcoinPhasePenalty * 100).toFixed(1)}% (reduced by phase change)`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${bitcoinPhaseFinalScore.toFixed(2)} (-${((baseScore - bitcoinPhaseFinalScore) * 100).toFixed(1)}%)\n`);
  
  console.log('Expected: Penalty reduced by ~50% due to phase change\n');
  
  console.log('═'.repeat(70));
  console.log('TEST CASE D: Lightly covered topic (ethereum)');
  console.log('═'.repeat(70) + '\n');
  
  const ethereumTopics = ['ethereum', 'defi'];
  const ethereumPenalty = computeFreshnessPenalty(ethereumTopics, nm);
  const ethereumFinalScore = baseScore * (1 - ethereumPenalty);
  
  console.log(`Topics: ${ethereumTopics.join(', ')}`);
  console.log(`Recency: ${nm.getTopicRecency('ethereum', 24).mentions} mention in last 24h`);
  console.log(`Last seen: ${new Date(nm.getTopicRecency('ethereum', 24).lastSeen).toLocaleTimeString()}`);
  console.log(`\nComputed penalty: ${(ethereumPenalty * 100).toFixed(1)}%`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${ethereumFinalScore.toFixed(2)} (-${((baseScore - ethereumFinalScore) * 100).toFixed(1)}%)\n`);
  
  console.log('Expected: Low penalty (~5-15%) due to light coverage and older mention\n');
  
  console.log('═'.repeat(70));
  console.log('TEST CASE E: Completely new topic (nostr)');
  console.log('═'.repeat(70) + '\n');
  
  const nostrTopics = ['nostr', 'protocol'];
  const nostrPenalty = computeFreshnessPenalty(nostrTopics, nm);
  const nostrFinalScore = baseScore * (1 - nostrPenalty);
  
  console.log(`Topics: ${nostrTopics.join(', ')}`);
  console.log(`Recency: ${nm.getTopicRecency('nostr', 24).mentions} mentions in last 24h`);
  console.log(`\nComputed penalty: ${(nostrPenalty * 100).toFixed(1)}%`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${nostrFinalScore.toFixed(2)}\n`);
  
  console.log('Expected: Zero penalty for completely new topic\n');
  
  console.log('═'.repeat(70));
  console.log('TEST CASE F: Storyline advancement (bitcoin with continuation)');
  console.log('═'.repeat(70) + '\n');
  
  const storylineContent = 'This represents a major advancement in the bitcoin adoption storyline';
  const storylinePenalty = computeFreshnessPenalty(bitcoinTopics, nm, {
    content: storylineContent
  });
  const storylineFinalScore = baseScore * (1 - storylinePenalty);
  
  console.log(`Topics: ${bitcoinTopics.join(', ')}`);
  console.log(`Content indicates storyline advancement: "${storylineContent.slice(0, 60)}..."`);
  console.log(`\nComputed penalty: ${(storylinePenalty * 100).toFixed(1)}% (reduced by advancement)`);
  console.log(`Score impact: ${baseScore.toFixed(2)} → ${storylineFinalScore.toFixed(2)} (-${((baseScore - storylineFinalScore) * 100).toFixed(1)}%)\n`);
  console.log(`Penalty reduction: ${((bitcoinPenalty - storylinePenalty) * 100).toFixed(1)}%\n`);
  
  console.log('Expected: Penalty reduced by ~10% absolute due to storyline advancement\n');
  
  console.log('═'.repeat(70));
  console.log('SUMMARY: Score Comparison');
  console.log('═'.repeat(70) + '\n');
  
  const results = [
    { label: 'A. Heavy coverage (bitcoin)', score: bitcoinFinalScore },
    { label: 'B. Novel angle (bitcoin)', score: bitcoinNoveltyFinalScore },
    { label: 'C. Phase change (bitcoin)', score: bitcoinPhaseFinalScore },
    { label: 'D. Light coverage (ethereum)', score: ethereumFinalScore },
    { label: 'E. New topic (nostr)', score: nostrFinalScore },
    { label: 'F. Storyline advancement (bitcoin)', score: storylineFinalScore }
  ];
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  console.log('Ranked by final engagement score:\n');
  results.forEach((r, i) => {
    const bar = '█'.repeat(Math.round(r.score * 50));
    const percent = ((r.score / baseScore - 1) * 100).toFixed(1);
    const sign = percent >= 0 ? '+' : '';
    console.log(`${i + 1}. ${r.label.padEnd(40)} ${r.score.toFixed(2)} ${bar} (${sign}${percent}%)`);
  });
  
  console.log('\n═'.repeat(70));
  console.log('VALIDATION');
  console.log('═'.repeat(70) + '\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Heavy coverage should have significant penalty
  if (bitcoinPenalty >= 0.25 && bitcoinPenalty <= 0.4) {
    console.log('✅ Heavy coverage penalty is within expected range (25-40%)');
    passed++;
  } else {
    console.log(`❌ Heavy coverage penalty out of range: ${(bitcoinPenalty * 100).toFixed(1)}%`);
    failed++;
  }
  
  // Test 2: Novel angle should reduce penalty
  if (bitcoinNoveltyPenalty < bitcoinPenalty * 0.6) {
    console.log('✅ Novel angle reduces penalty by at least 40%');
    passed++;
  } else {
    console.log(`❌ Novel angle reduction insufficient`);
    failed++;
  }
  
  // Test 3: Light coverage should have low penalty
  if (ethereumPenalty < 0.2) {
    console.log('✅ Light coverage has low penalty (<20%)');
    passed++;
  } else {
    console.log(`❌ Light coverage penalty too high: ${(ethereumPenalty * 100).toFixed(1)}%`);
    failed++;
  }
  
  // Test 4: New topic should have zero penalty
  if (nostrPenalty === 0) {
    console.log('✅ New topic has zero penalty');
    passed++;
  } else {
    console.log(`❌ New topic has unexpected penalty: ${(nostrPenalty * 100).toFixed(1)}%`);
    failed++;
  }
  
  // Test 5: Scores should be properly ranked
  if (nostrFinalScore >= ethereumFinalScore && ethereumFinalScore > bitcoinFinalScore) {
    console.log('✅ Scores properly ranked: new > light > heavy coverage');
    passed++;
  } else {
    console.log(`❌ Score ranking incorrect`);
    failed++;
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  if (failed === 0) {
    console.log('✅ All validation checks passed! Freshness decay algorithm working correctly.\n');
    return 0;
  } else {
    console.log('❌ Some validation checks failed. Review implementation.\n');
    return 1;
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest()
    .then(code => process.exit(code))
    .catch(err => {
      console.error('Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runIntegrationTest };
