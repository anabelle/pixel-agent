// Test for PostingQueue functionality
const { PostingQueue } = require('../lib/postingQueue');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBasicQueue() {
  console.log('Testing basic queue functionality...');
  
  const queue = new PostingQueue({
    minDelayBetweenPosts: 1000, // 1 second for testing
    maxDelayBetweenPosts: 2000,
    mentionPriorityBoost: 500
  });
  
  const results = [];
  
  // Add posts with different priorities
  await queue.enqueue({
    type: 'test_low',
    id: 'low-1',
    priority: queue.priorities.LOW,
    action: async () => {
      results.push('LOW');
      return true;
    }
  });
  
  await queue.enqueue({
    type: 'test_critical',
    id: 'critical-1',
    priority: queue.priorities.CRITICAL,
    action: async () => {
      results.push('CRITICAL');
      return true;
    }
  });
  
  await queue.enqueue({
    type: 'test_high',
    id: 'high-1',
    priority: queue.priorities.HIGH,
    action: async () => {
      results.push('HIGH');
      return true;
    }
  });
  
  await queue.enqueue({
    type: 'test_medium',
    id: 'medium-1',
    priority: queue.priorities.MEDIUM,
    action: async () => {
      results.push('MEDIUM');
      return true;
    }
  });
  
  // Wait for queue to process
  await sleep(10000); // 10 seconds should be enough for 4 posts with 1-2s delays
  
  console.log('Processing order:', results);
  
  // Check priority order
  if (results[0] === 'CRITICAL' && results[1] === 'HIGH' && results[2] === 'MEDIUM' && results[3] === 'LOW') {
    console.log('✅ Priority order correct!');
  } else {
    console.log('❌ Priority order incorrect. Expected: CRITICAL, HIGH, MEDIUM, LOW');
  }
  
  const status = queue.getStatus();
  console.log('Final status:', status);
  
  if (status.stats.processed === 4) {
    console.log('✅ All posts processed!');
  } else {
    console.log(`❌ Expected 4 processed, got ${status.stats.processed}`);
  }
}

async function testDeduplication() {
  console.log('\nTesting deduplication...');
  
  const queue = new PostingQueue({
    minDelayBetweenPosts: 500,
    maxDelayBetweenPosts: 1000
  });
  
  const results = [];
  
  // Add same post twice
  const success1 = await queue.enqueue({
    type: 'test_dup',
    id: 'duplicate-test',
    priority: queue.priorities.HIGH,
    action: async () => {
      results.push('POST-1');
      return true;
    }
  });
  
  const success2 = await queue.enqueue({
    type: 'test_dup',
    id: 'duplicate-test', // Same ID
    priority: queue.priorities.HIGH,
    action: async () => {
      results.push('POST-2');
      return true;
    }
  });
  
  console.log('First enqueue:', success1 ? 'success' : 'failed');
  console.log('Second enqueue (duplicate):', success2 ? 'success' : 'failed');
  
  await sleep(2000);
  
  const status = queue.getStatus();
  
  if (!success2 && status.stats.dropped === 1) {
    console.log('✅ Deduplication working correctly!');
  } else {
    console.log('❌ Deduplication failed');
  }
  
  if (results.length === 1) {
    console.log('✅ Only one post executed!');
  } else {
    console.log(`❌ Expected 1 execution, got ${results.length}`);
  }
}

async function testRateLimiting() {
  console.log('\nTesting rate limiting...');
  
  const queue = new PostingQueue({
    minDelayBetweenPosts: 2000, // 2 seconds minimum
    maxDelayBetweenPosts: 2000  // Fixed delay for testing
  });
  
  const timestamps = [];
  
  for (let i = 0; i < 3; i++) {
    await queue.enqueue({
      type: 'test_rate',
      id: `rate-${i}`,
      priority: queue.priorities.MEDIUM,
      action: async () => {
        timestamps.push(Date.now());
        return true;
      }
    });
  }
  
  await sleep(8000); // Should take ~6 seconds for 3 posts with 2s gaps
  
  console.log('Timestamps:', timestamps);
  
  // Check delays between posts
  let allDelaysOk = true;
  for (let i = 1; i < timestamps.length; i++) {
    const delay = timestamps[i] - timestamps[i - 1];
    console.log(`Delay ${i}: ${delay}ms`);
    
    // Should be at least 2000ms (minus small variance for processing)
    if (delay < 1800) { // Allow 200ms variance
      console.log(`❌ Delay too short: ${delay}ms`);
      allDelaysOk = false;
    }
  }
  
  if (allDelaysOk) {
    console.log('✅ Rate limiting working correctly!');
  }
}

async function runTests() {
  console.log('=== PostingQueue Tests ===\n');
  
  try {
    await testBasicQueue();
    await testDeduplication();
    await testRateLimiting();
    
    console.log('\n=== All tests completed ===');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
