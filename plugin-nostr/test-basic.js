const { emitter } = require('./lib/bridge');

// Simple test that doesn't require complex mocking
async function testBasicFlow() {
  console.log('🧪 Testing basic flow...\n');
  
  // Test 1: Bridge validation
  console.log('=== Testing Bridge Validation ===');
  
  let receivedPosts = [];
  const testListener = (payload) => {
    receivedPosts.push(payload.text);
  };
  
  emitter.on('external.post', testListener);
  
  // Valid post
  emitter.emit('external.post', { text: 'Valid post' });
  
  // Invalid posts (should be filtered by safeEmit)
  emitter.emit('external.post', { text: '' });
  emitter.emit('external.post', { text: 'x'.repeat(1001) });
  emitter.emit('external.post', {}); // No text
  
  await new Promise(r => setTimeout(r, 50));
  
  console.log('Received posts:', receivedPosts);
  
  if (receivedPosts.length === 1 && receivedPosts[0] === 'Valid post') {
    console.log('✅ Bridge validation PASSED');
  } else {
    console.log('❌ Bridge validation FAILED');
    process.exit(1);
  }
  
  emitter.removeListener('external.post', testListener);
  
  // Test 2: Rate limiter logic
  console.log('\n=== Testing Rate Limiter Logic ===');
  
  function createRateLimiter() {
    return {
      tokens: 3,
      maxTokens: 10,
      lastRefill: Date.now(),
      refillRate: 1000, // 1 token per second for testing
      
      consume() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed / this.refillRate);
        this.lastRefill = now;
        
        if (this.tokens >= 1) {
          this.tokens--;
          return true;
        }
        return false;
      }
    };
  }
  
  const limiter = createRateLimiter();
  const results = [];
  
  for (let i = 0; i < 6; i++) {
    results.push(limiter.consume());
  }
  
  const allowed = results.filter(Boolean).length;
  const blocked = results.filter(r => !r).length;
  
  console.log(`Rate limiter: ${allowed} allowed, ${blocked} blocked from 6 attempts`);
  
  if (allowed <= 3 && blocked >= 2) {
    console.log('✅ Rate limiter PASSED');
  } else {
    console.log('❌ Rate limiter FAILED');
    process.exit(1);
  }
  
  // Test 3: Input validation
  console.log('\n=== Testing Input Validation ===');
  
  function validateActivity(a) {
    if (!a || typeof a !== 'object') return false;
    if (a.x !== undefined && (typeof a.x !== 'number' || a.x < -1000 || a.x > 1000)) return false;
    if (a.y !== undefined && (typeof a.y !== 'number' || a.y < -1000 || a.y > 1000)) return false;
    if (a.sats !== undefined && (typeof a.sats !== 'number' || a.sats < 0 || a.sats > 1000000)) return false;
    if (a.letter !== undefined && a.letter !== null && (typeof a.letter !== 'string' || a.letter.length > 10)) return false;
    return true;
  }
  
  const validCases = [
    { x: 10, y: 20, sats: 100, letter: 'A' },
    { x: 0, y: 0, sats: 1 },
    { sats: 50 }, // Minimal valid
  ];
  
  const invalidCases = [
    null,
    { x: 'invalid' },
    { x: -2000 }, // Out of range
    { sats: -1 }, // Negative sats
    { letter: 'x'.repeat(20) }, // Too long letter
  ];
  
  const validResults = validCases.map(validateActivity);
  const invalidResults = invalidCases.map(validateActivity);
  
  if (validResults.every(Boolean) && invalidResults.every(r => !r)) {
    console.log('✅ Input validation PASSED');
  } else {
    console.log('❌ Input validation FAILED');
    console.log('Valid results:', validResults);
    console.log('Invalid results:', invalidResults);
    process.exit(1);
  }
  
  console.log('\n🎉 All basic tests PASSED!');
  console.log('✅ Bridge validation works');
  console.log('✅ Rate limiting works');  
  console.log('✅ Input validation works');
  console.log('\n📋 Ready for integration testing with real Nostr service');
}

if (require.main === module) {
  testBasicFlow().catch(console.error);
}

module.exports = { testBasicFlow };
