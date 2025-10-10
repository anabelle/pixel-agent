// Test that verifies NO duplicate topic extraction per event

const { extractTopicsFromEvent } = require('./lib/nostr');

// Mock runtime
const mockRuntime = {
  agentId: 'test-agent',
  getSetting: (key) => null,
  character: { name: 'TestAgent' }
};

// Track extraction calls per event
const extractionCalls = new Map();

// Wrap extractTopicsFromEvent to track calls
const originalExtract = extractTopicsFromEvent;
let callCount = 0;

async function trackedExtract(evt, runtime) {
  callCount++;
  const eventId = evt.id.slice(0, 8);
  
  if (!extractionCalls.has(eventId)) {
    extractionCalls.set(eventId, 0);
  }
  extractionCalls.set(eventId, extractionCalls.get(eventId) + 1);
  
  console.log(`[TEST] Extraction call #${callCount} for event ${eventId}`);
  
  return await originalExtract(evt, runtime);
}

// Test events
const testEvents = [
  {
    id: 'a1b2c3d4e5f6g7h8i9j0',
    content: 'This is a test post about #bitcoin and #lightning network.',
    pubkey: 'testuser1',
    created_at: Math.floor(Date.now() / 1000)
  },
  {
    id: 'z9y8x7w6v5u4t3s2r1q0',
    content: 'Another post discussing the future of decentralized social media.',
    pubkey: 'testuser2',
    created_at: Math.floor(Date.now() / 1000)
  },
  {
    id: 'p0o9i8u7y6t5r4e3w2q1',
    content: 'Short post about #nostr and privacy.',
    pubkey: 'testuser3',
    created_at: Math.floor(Date.now() / 1000)
  }
];

async function runTest() {
  console.log('='.repeat(60));
  console.log('Testing for Duplicate Topic Extraction');
  console.log('='.repeat(60));
  
  // Simulate processing events (what contextAccumulator does)
  for (const evt of testEvents) {
    console.log(`\nProcessing event ${evt.id.slice(0, 8)}...`);
    await trackedExtract(evt, mockRuntime);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Results');
  console.log('='.repeat(60));
  
  let hasDuplicates = false;
  
  console.log(`\nTotal extraction calls: ${callCount}`);
  console.log(`Unique events processed: ${extractionCalls.size}`);
  console.log('\nPer-event breakdown:');
  
  for (const [eventId, count] of extractionCalls.entries()) {
    const status = count === 1 ? '✅ OK' : '❌ DUPLICATE';
    console.log(`  ${eventId}: ${count} call(s) ${status}`);
    if (count > 1) {
      hasDuplicates = true;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  if (hasDuplicates) {
    console.log('❌ TEST FAILED: Found duplicate topic extractions!');
    console.log('Each event should be extracted exactly once.');
    process.exit(1);
  } else {
    console.log('✅ TEST PASSED: No duplicates found!');
    console.log('Each event was extracted exactly once.');
    process.exit(0);
  }
}

// Run test
runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
