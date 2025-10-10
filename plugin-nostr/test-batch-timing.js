// Test batch timer behavior - ensures events accumulate before processing

const { TopicExtractor } = require('./lib/topicExtractor');

// Mock runtime
const mockRuntime = {
  agentId: 'test-batch-timing',
  getSetting: () => null,
  useModel: async (model, opts) => {
    // Simulate LLM delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return { text: 'test, topics, mock' };
  }
};

const logger = {
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

// Test with SHORT wait time to see batching in action
const extractor = new TopicExtractor(mockRuntime, {
  batchSize: 3,
  batchWaitMs: 200, // 200ms window
  logger
});

// Create test events
const createEvent = (id, content) => ({
  id: `event${id}`,
  content,
  created_at: Math.floor(Date.now() / 1000)
});

async function testBatchAccumulation() {
  console.log('='.repeat(60));
  console.log('Testing Batch Timer Accumulation');
  console.log('Batch size: 3, Wait time: 200ms');
  console.log('='.repeat(60));
  
  const events = [
    createEvent(1, 'This is a test post about coding and technology.'),
    createEvent(2, 'Another post discussing artificial intelligence and machine learning.'),
    createEvent(3, 'Third post about web development and JavaScript frameworks.'),
    createEvent(4, 'Fourth post about database optimization and SQL queries.'),
    createEvent(5, 'Fifth post about cloud computing and serverless architecture.'),
  ];
  
  console.log('\nSending 5 events rapidly (within 100ms)...\n');
  
  const startTime = Date.now();
  const promises = [];
  
  // Send events with 20ms delays (all within 100ms total)
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    console.log(`[${Date.now() - startTime}ms] Sending event${i + 1}`);
    promises.push(extractor.extractTopics(events[i]));
  }
  
  console.log(`\n[${Date.now() - startTime}ms] All events sent. Waiting for extraction...\n`);
  
  // Wait for all extractions
  await Promise.all(promises);
  
  const endTime = Date.now();
  console.log(`\n[${endTime - startTime}ms] All extractions complete!\n`);
  
  // Get stats
  const stats = extractor.getStats();
  
  console.log('='.repeat(60));
  console.log('Results:');
  console.log('='.repeat(60));
  console.log(`Total events: ${stats.processed}`);
  console.log(`LLM calls: ${stats.llmCalls}`);
  console.log(`Batched savings: ${stats.batchedSavings} calls`);
  console.log(`Efficiency: ${Math.round((1 - stats.llmCalls / stats.processed) * 100)}% reduction`);
  console.log('='.repeat(60));
  
  // Verify batching worked
  const expectedBatches = Math.ceil(events.length / 3); // Should be 2 batches (3 + 2)
  const actualLLMCalls = stats.llmCalls;
  
  console.log('\nVerification:');
  console.log(`Expected max batches: ${expectedBatches}`);
  console.log(`Actual LLM calls: ${actualLLMCalls}`);
  
  if (actualLLMCalls <= expectedBatches) {
    console.log('✅ PASS: Batching worked! Events accumulated before processing.');
  } else {
    console.log(`❌ FAIL: Too many LLM calls (${actualLLMCalls} vs max ${expectedBatches})`);
    console.log('Events were likely processed individually instead of batched.');
    process.exit(1);
  }
  
  // Cleanup
  extractor.destroy();
  
  console.log('\n✅ Test completed successfully!');
}

testBatchAccumulation().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
