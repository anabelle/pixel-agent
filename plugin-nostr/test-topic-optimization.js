// Test topic extraction optimization - batching, caching, and skipping
const { TopicExtractor } = require('./lib/topicExtractor');

// Mock runtime
const mockRuntime = {
  agentId: 'test-agent',
  logger: {
    debug: (...args) => console.log('[DEBUG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    info: (...args) => console.log('[INFO]', ...args)
  },
  useModel: async (model, options) => {
    // Simulate LLM response
    console.log(`[MOCK LLM] Called with ${options.prompt.split('\n')[0].slice(0, 50)}...`);
    
    // Check if it's a batch request
    const isBatch = options.prompt.includes('posts. For each post');
    
    if (isBatch) {
      // Count how many posts by looking for numbered lines
      const postCount = (options.prompt.match(/^\d+\./gm) || []).length;
      console.log(`[MOCK LLM] Batch request for ${postCount} posts`);
      
      // Return one line per post
      const responses = [];
      for (let i = 0; i < postCount; i++) {
        responses.push('technology, development');
      }
      return responses.join('\n');
    } else {
      // Single post
      return 'technology, development';
    }
  }
};

async function runTests() {
  console.log('='.repeat(60));
  console.log('TOPIC EXTRACTION OPTIMIZATION TEST');
  console.log('='.repeat(60));
  console.log();

  const extractor = new TopicExtractor(mockRuntime, mockRuntime.logger);
  
  // Test 1: Short messages should be skipped
  console.log('Test 1: Short messages (should skip LLM)');
  console.log('-'.repeat(60));
  const shortEvents = [
    { id: '0001', content: 'GM' },
    { id: '0002', content: '🚀' },
    { id: '0003', content: 'lol' }
  ];
  
  for (const evt of shortEvents) {
    const topics = await extractor.extractTopics(evt);
    console.log(`  ${evt.id}: "${evt.content}" -> [${topics.join(', ')}]`);
  }
  console.log();
  
  // Test 2: Batching (send 5 similar events quickly)
  console.log('Test 2: Batching (5 events should batch into 1 LLM call)');
  console.log('-'.repeat(60));
  const batchEvents = [
    { id: '0004', content: 'Just deployed a new feature using React and TypeScript!' },
    { id: '0005', content: 'Working on a decentralized application with Nostr protocol.' },
    { id: '0006', content: 'Learning about Bitcoin\'s Lightning Network today.' },
    { id: '0007', content: 'Published my first npm package for web3 development.' },
    { id: '0008', content: 'Exploring AI and machine learning with Python.' }
  ];
  
  const batchPromises = batchEvents.map(evt => extractor.extractTopics(evt));
  const batchResults = await Promise.all(batchPromises);
  
  batchResults.forEach((topics, i) => {
    console.log(`  ${batchEvents[i].id}: [${topics.join(', ')}]`);
  });
  console.log();
  
  // Test 3: Caching (send same content twice)
  console.log('Test 3: Caching (2nd request should be cached, no LLM call)');
  console.log('-'.repeat(60));
  const cachedEvent = { 
    id: '0009', 
    content: 'Exploring decentralized social networks and their potential impact on society.' 
  };
  
  console.log('  First request (will call LLM):');
  const firstResult = await extractor.extractTopics(cachedEvent);
  console.log(`    -> [${firstResult.join(', ')}]`);
  
  console.log('  Second request (should be cached):');
  const secondResult = await extractor.extractTopics({ ...cachedEvent, id: '0010' });
  console.log(`    -> [${secondResult.join(', ')}]`);
  console.log();
  
  // Test 4: Hashtags (Unicode support)
  console.log('Test 4: Unicode hashtag support');
  console.log('-'.repeat(60));
  const hashtagEvents = [
    { id: '0011', content: 'Learning #JavaScript and #Python today! #coding' },
    { id: '0012', content: '今天学习 #中文 和 #日本語 #language' },
    { id: '0013', content: 'Building with #Bitcoin ⚡ #LightningNetwork' }
  ];
  
  for (const evt of hashtagEvents) {
    const topics = await extractor.extractTopics(evt);
    console.log(`  ${evt.id}: [${topics.join(', ')}]`);
  }
  console.log();
  
  // Show final stats
  console.log('='.repeat(60));
  console.log('FINAL STATISTICS');
  console.log('='.repeat(60));
  const stats = extractor.getStats();
  console.log(`  Total Events Processed: ${stats.processed}`);
  console.log(`  LLM Calls Made: ${stats.llmCalls}`);
  console.log(`  Cache Hits: ${stats.cacheHits} (${stats.cacheHitRate})`);
  console.log(`  Short Messages Skipped: ${stats.skipped} (${stats.skipRate})`);
  console.log(`  Batched Savings: ${stats.batchedSavings} calls`);
  console.log(`  Total Estimated Savings: ${stats.estimatedSavings} LLM calls avoided`);
  console.log(`  Cache Size: ${stats.cacheSize} entries`);
  console.log();
  
  const actualCalls = stats.llmCalls;
  const potentialCalls = stats.processed - stats.skipped; // What it would be without optimizations
  const savingsPercent = potentialCalls > 0 
    ? (((potentialCalls - actualCalls) / potentialCalls) * 100).toFixed(1)
    : 0;
  
  console.log(`  🎯 Cost Reduction: ${savingsPercent}% (${actualCalls} actual vs ${potentialCalls} potential calls)`);
  console.log('='.repeat(60));
  
  // Cleanup
  extractor.destroy();
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
