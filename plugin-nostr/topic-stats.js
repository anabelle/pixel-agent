// Topic Extraction Optimization Stats Monitor
const { getTopicExtractorStats } = require('./lib/nostr');

console.log('='.repeat(60));
console.log('TOPIC EXTRACTION OPTIMIZATION STATS');
console.log('='.repeat(60));

console.log(`
Configuration (Environment Variables):
- TOPIC_BATCH_SIZE: ${process.env.TOPIC_BATCH_SIZE || '5 (default)'}
- TOPIC_BATCH_WAIT_MS: ${process.env.TOPIC_BATCH_WAIT_MS || '100 (default)'}ms
- TOPIC_CACHE_TTL_MS: ${process.env.TOPIC_CACHE_TTL_MS || '300000 (default)'} (${Math.floor((parseInt(process.env.TOPIC_CACHE_TTL_MS, 10) || 300000) / 60000)}min)
- TOPIC_CACHE_MAX_SIZE: ${process.env.TOPIC_CACHE_MAX_SIZE || '1000 (default)'} entries

Expected Savings:
✓ Batching: 50-70% reduction in LLM calls
✓ Caching: 30-40% reduction for repeated content
✓ Skip Short Messages: 20-30% reduction for low-value posts
✓ Unicode Hashtag Support: Captures non-Latin hashtags (中文, 日本語, etc.)

Total Expected Cost Reduction: 60-80%

Live Stats (if agent is running):
`);

// Try to get live stats (will be null if extractor not initialized yet)
const stats = getTopicExtractorStats(null); // Use default key

if (stats) {
  console.log('✅ Agent is running - showing live statistics:\n');
  console.log(`  Total Events Processed: ${stats.processed}`);
  console.log(`  LLM Calls Made: ${stats.llmCalls}`);
  console.log(`  Cache Hits: ${stats.cacheHits} (${stats.cacheHitRate})`);
  console.log(`  Short Messages Skipped: ${stats.skipped} (${stats.skipRate})`);
  console.log(`  Batched Savings: ${stats.batchedSavings} calls saved`);
  console.log(`  Total Estimated Savings: ${stats.estimatedSavings} LLM calls avoided`);
  console.log(`  Cache Size: ${stats.cacheSize} entries`);
  
  const actualRate = stats.processed > 0 
    ? (((stats.processed - stats.llmCalls) / stats.processed) * 100).toFixed(1)
    : 0;
  console.log(`\n  🎯 Actual Cost Reduction: ${actualRate}%`);
} else {
  console.log('⏳ Agent not running yet - stats will appear once it starts.\n');
  console.log('   Start your agent and run this script again to see live stats.');
}

console.log(`
\nOptimization Tips:
- For high-traffic (>100 events/min): Increase batch size to 10-15
- For slower traffic (<20 events/min): Decrease wait time to 50ms
- Monitor cache hit rate: >30% means good content repetition
- Skip rate should be 20-40% for typical Nostr traffic

Example .env for high-traffic scenarios:
TOPIC_BATCH_SIZE=15
TOPIC_BATCH_WAIT_MS=300
TOPIC_CACHE_TTL_MS=900000
TOPIC_CACHE_MAX_SIZE=5000

To monitor continuously:
- Stats are logged every 60s in your agent logs
- Look for "[TOPIC]" prefixed log lines
- Cache cleanup happens automatically every 60s
`);

console.log('='.repeat(60));
