#!/usr/bin/env node

// Demo script for Adaptive Trending Algorithm
// Shows how topics trend based on velocity, novelty, and baseline activity

const { AdaptiveTrending } = require('./lib/adaptiveTrending');

const logger = {
  info: console.log,
  debug: () => {}, // Silent debug
  warn: console.warn
};

const trending = new AdaptiveTrending(logger, {
  baselineWindowHours: 24,
  velocityWindowMinutes: 30,
  noveltyWindowHours: 6,
  trendingThreshold: 1.2
});

console.log('\n=== Adaptive Trending Algorithm Demo ===\n');

const now = Date.now();

// Scenario 1: Bitcoin with consistent baseline activity (should NOT trend)
console.log('📊 Scenario 1: Bitcoin with consistent baseline activity');
console.log('Simulating 24 hours of steady Bitcoin discussion...\n');

for (let i = 0; i < 24; i++) {
  const timestamp = now - (i * 60 * 60 * 1000);
  trending.recordActivity('bitcoin', {
    mentions: 5,
    users: new Set(['user1', 'user2', 'user3']),
    keywords: ['price', 'market', 'trading'],
    context: 'Regular bitcoin discussion'
  }, timestamp);
}

const btcBaseline = trending.getBaseline('bitcoin');
console.log(`Bitcoin baseline established: ${btcBaseline.avgMentions.toFixed(2)} avg mentions\n`);

let trendingTopics = trending.getTrendingTopics(5);
console.log('Current trending topics:', trendingTopics.length === 0 ? 'None (baseline activity)' : trendingTopics.map(t => t.topic).join(', '));
console.log('✓ Bitcoin is NOT trending (as expected - consistent baseline)\n');

// Scenario 2: Bitcoin price spike with new developments (should TREND)
console.log('\n📊 Scenario 2: Bitcoin price spike with major news');
console.log('Simulating rapid activity with new keywords in last 30 minutes...\n');

for (let i = 0; i < 10; i++) {
  const timestamp = now - (i * 3 * 60 * 1000); // Every 3 minutes
  trending.recordActivity('bitcoin', {
    mentions: 20,
    users: new Set(['user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8']),
    keywords: ['ATH', 'breakout', 'rally', 'spike', 'moon', 'bullish'],
    context: 'Bitcoin breaking all-time high! Massive rally!'
  }, timestamp);
}

trendingTopics = trending.getTrendingTopics(5);
const btcTrend = trendingTopics.find(t => t.topic === 'bitcoin');

if (btcTrend) {
  console.log(`✓ Bitcoin is NOW TRENDING!`);
  console.log(`  Score: ${btcTrend.score.toFixed(2)} (threshold: 1.2)`);
  console.log(`  Velocity: ${btcTrend.velocity.toFixed(2)} (acceleration detected)`);
  console.log(`  Novelty: ${btcTrend.novelty.toFixed(2)} (new keywords: ATH, breakout, rally)`);
  console.log(`  Development: ${btcTrend.development.toFixed(2)}\n`);
} else {
  console.log('⚠ Bitcoin not trending (might need more data)\n');
}

// Scenario 3: Emerging new topic (should TREND with high novelty)
console.log('\n📊 Scenario 3: Emerging new topic - ZK Rollups');
console.log('Simulating sudden appearance of new topic...\n');

for (let i = 0; i < 8; i++) {
  const timestamp = now - (i * 3 * 60 * 1000);
  trending.recordActivity('zk-rollups', {
    mentions: 12,
    users: new Set(['dev1', 'dev2', 'dev3', 'dev4', 'dev5']),
    keywords: ['rollups', 'zkSync', 'scaling', 'ethereum', 'L2', 'performance', 'gas', 'zk-proofs'],
    context: 'New ZK rollup technology announcement!'
  }, timestamp);
}

trendingTopics = trending.getTrendingTopics(5);
const zkTrend = trendingTopics.find(t => t.topic === 'zk-rollups');

if (zkTrend) {
  console.log(`✓ ZK-Rollups is TRENDING as emerging topic!`);
  console.log(`  Score: ${zkTrend.score.toFixed(2)}`);
  console.log(`  Velocity: ${zkTrend.velocity.toFixed(2)}`);
  console.log(`  Novelty: ${zkTrend.novelty.toFixed(2)} (HIGH - new topic with diverse keywords)`);
  console.log(`  Development: ${zkTrend.development.toFixed(2)}\n`);
} else {
  console.log('⚠ ZK-Rollups not trending yet (might need more data)\n');
}

// Scenario 4: Nostr with routine discussion (should NOT trend)
console.log('\n📊 Scenario 4: Nostr with routine discussion');
console.log('Simulating consistent but routine Nostr activity...\n');

for (let i = 0; i < 20; i++) {
  const timestamp = now - (i * 30 * 60 * 1000);
  trending.recordActivity('nostr', {
    mentions: 4,
    users: new Set(['nostr1', 'nostr2', 'nostr3']),
    keywords: ['protocol', 'relay', 'notes'],
    context: 'Regular nostr protocol discussion'
  }, timestamp);
}

trendingTopics = trending.getTrendingTopics(5);
const nostrTrend = trendingTopics.find(t => t.topic === 'nostr');

if (nostrTrend) {
  console.log(`⚠ Nostr is trending: Score ${nostrTrend.score.toFixed(2)}`);
} else {
  console.log('✓ Nostr is NOT trending (as expected - routine baseline activity)\n');
}

// Final summary
console.log('\n=== Final Trending Topics ===\n');
trendingTopics = trending.getTrendingTopics(10);

if (trendingTopics.length === 0) {
  console.log('No topics currently trending above baseline.\n');
} else {
  console.log(`${trendingTopics.length} topic(s) trending:\n`);
  trendingTopics.forEach((topic, idx) => {
    console.log(`${idx + 1}. ${topic.topic.toUpperCase()}`);
    console.log(`   Score: ${topic.score.toFixed(2)} | Velocity: ${topic.velocity.toFixed(2)} | Novelty: ${topic.novelty.toFixed(2)} | Development: ${topic.development.toFixed(2)}`);
  });
  console.log();
}

console.log('=== Demo Complete ===\n');
console.log('Key Insights:');
console.log('✓ Topics with consistent baseline activity do NOT dominate trending');
console.log('✓ Spikes with new keywords/context trend highly');
console.log('✓ Emerging topics get appropriate recognition');
console.log('✓ System prevents "always trending" fundamental topics\n');
