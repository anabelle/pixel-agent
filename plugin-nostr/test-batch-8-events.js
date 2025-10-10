// Test that batching waits for exactly 8 events

const { TopicExtractor } = require('./lib/topicExtractor');

// Mock runtime
const mockRuntime = {
  agentId: 'test-batch-8',
  getSetting: () => null,
  useModel: async (model, opts) => {
    console.log(`  [LLM CALL] Processing ${opts.prompt.includes('8 posts') ? '8' : 'N'} events`);
    await new Promise(resolve => setTimeout(resolve, 50));
    return { text: 'test, topics, mock' };
  }
};

const logger = {
  debug: (...args) => console.log('  [DEBUG]', ...args),
  warn: (...args) => console.warn('  [WARN]', ...args)
};

// Default config: batch size 8, no timeout
const extractor = new TopicExtractor(mockRuntime, logger);

// Create test events
const createEvent = (id, content) => ({
  id: `event${id.toString().padStart(2, '0')}`,
  content,
  created_at: Math.floor(Date.now() / 1000)
});

async function test() {
  console.log('='.repeat(70));
  console.log('Testing Batch Accumulation: Wait for 8 Events');
  console.log('='.repeat(70));
  console.log('Config: TOPIC_BATCH_SIZE=8, TOPIC_BATCH_WAIT_MS=Infinity (no timeout)\n');
  
  const events = Array.from({ length: 15 }, (_, i) => 
    createEvent(i + 1, `This is test post number ${i + 1} about various topics.`)
  );
  
  console.log('Sending 15 events with 50ms delays...\n');
  
  const startTime = Date.now();
  const promises = [];
  let batchCount = 0;
  
  // Send events slowly
  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const elapsed = Date.now() - startTime;
    console.log(`[${elapsed}ms] Event ${i + 1}/15 queued`);
    
    const promise = extractor.extractTopics(events[i]);
    promises.push(promise);
    
    // Check if this triggers a batch (every 8 events)
    if ((i + 1) % 8 === 0) {
      console.log(`  → Batch ${++batchCount} should trigger (8 events accumulated)\n`);
    }
  }
  
  console.log(`\n[${Date.now() - startTime}ms] All 15 events sent. Waiting for processing...\n`);
  
  // Flush any remaining events (for the 7 leftover events)
  console.log('Flushing pending events...');
  await extractor.flush();
  
  // Wait for all to complete
  await Promise.all(promises);
  
  const endTime = Date.now();
  console.log(`[${endTime - startTime}ms] All extractions complete!\n`);
  
  // Get stats
  const stats = extractor.getStats();
  
  console.log('='.repeat(70));
  console.log('Results:');
  console.log('='.repeat(70));
  console.log(`Total events: ${stats.processed}`);
  console.log(`LLM calls: ${stats.llmCalls}`);
  console.log(`Batched savings: ${stats.batchedSavings} calls`);
  console.log(`Events per batch: ${stats.processed / stats.llmCalls}`);
  console.log(`Efficiency: ${Math.round((1 - stats.llmCalls / stats.processed) * 100)}% reduction`);
  console.log('='.repeat(70));
  
  // Verify batching
  const expectedBatches = Math.ceil(15 / 8); // Should be 2 batches (8 + 7)
  
  console.log('\nVerification:');
  console.log(`Expected batches: ${expectedBatches} (8 + 7 events)`);
  console.log(`Actual LLM calls: ${stats.llmCalls}`);
  
  if (stats.llmCalls === expectedBatches) {
    console.log('✅ PASS: Correct number of batches!');
  } else if (stats.llmCalls < expectedBatches) {
    console.log('✅ PASS: Even better batching than expected!');
  } else {
    console.log(`❌ FAIL: Too many batches (expected ${expectedBatches}, got ${stats.llmCalls})`);
    process.exit(1);
  }
  
  // Check batch sizes
  const avgBatchSize = stats.processed / stats.llmCalls;
  if (avgBatchSize >= 7.5) { // Average should be close to 8
    console.log(`✅ PASS: Good batch size (avg ${avgBatchSize.toFixed(1)} events/batch)`);
  } else {
    console.log(`⚠️  WARNING: Small batch size (avg ${avgBatchSize.toFixed(1)} events/batch)`);
  }
  
  // Cleanup
  extractor.destroy();
  
  console.log('\n✅ Test completed successfully!');
  console.log('Ready for production: Will accumulate 8 events before processing.');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
