#!/usr/bin/env node

// Integration test that simulates the complete flow from LNPixels event to Nostr post
const { emitter } = require('./lib/bridge.js');

console.log('🔄 Testing complete LNPixels → LLM → Nostr flow...\n');

// Mock the Nostr service behavior
const mockNostrService = {
  posts: [],
  
  startMockService() {
    emitter.on('external.post', (payload) => {
      console.log(`📝 [Mock Nostr Service] Received post request: "${payload.text}"`);
      this.posts.push({
        text: payload.text,
        timestamp: Date.now(),
        source: 'lnpixels'
      });
      console.log(`✅ [Mock Nostr Service] Post queued (${this.posts.length} total)\n`);
    });
    console.log('🎯 [Mock Nostr Service] Started listening for external posts\n');
  },
  
  getStats() {
    return {
      totalPosts: this.posts.length,
      posts: this.posts.map(p => ({ text: p.text.substring(0, 50) + '...', source: p.source }))
    };
  }
};

// Mock LNPixels events that would trigger posts
const mockLNPixelsEvents = [
  {
    type: 'purchase',
    pixel: { x: 100, y: 200, color: '#FF0000' },
    payment: { amount: 1000, user: 'alice' }
  },
  {
    type: 'purchase', 
    pixel: { x: 150, y: 250, color: '#00FF00' },
    payment: { amount: 2500, user: 'bob' }
  },
  {
    type: 'purchase',
    pixel: { x: 75, y: 125, color: '#0000FF' },
    payment: { amount: 500, user: 'charlie' }
  }
];

// Mock LLM text generation (simulates what lnpixels-listener.js would do)
function generateMockNostrPost(event) {
  const templates = [
    `🎨 New pixel placed at (${event.pixel.x}, ${event.pixel.y}) in ${event.pixel.color} for ${event.payment.amount} sats! The Lightning Network canvas grows brighter! ⚡`,
    `💫 ${event.payment.user} just added some color at (${event.pixel.x}, ${event.pixel.y})! ${event.payment.amount} sats well spent on the decentralized art experiment! 🎯`,
    `🌈 Fresh paint on the Lightning Canvas! Pixel (${event.pixel.x}, ${event.pixel.y}) now shines in ${event.pixel.color} thanks to a ${event.payment.amount} sat contribution! #LightningNetwork`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

async function runIntegrationTest() {
  // Start mock Nostr service
  mockNostrService.startMockService();
  
  console.log('🎬 Simulating LNPixels purchase events...\n');
  
  // Process each mock event
  for (let i = 0; i < mockLNPixelsEvents.length; i++) {
    const event = mockLNPixelsEvents[i];
    const generatedText = generateMockNostrPost(event);
    
    console.log(`📦 [Event ${i + 1}] Processing LNPixels purchase:`);
    console.log(`   Pixel: (${event.pixel.x}, ${event.pixel.y}) ${event.pixel.color}`);
    console.log(`   Payment: ${event.payment.amount} sats from ${event.payment.user}`);
    console.log(`   Generated: "${generatedText}"`);
    
    // This simulates what lnpixels-listener.js does
    const success = emitter.emit('external.post', { text: generatedText });
    console.log(`   Result: ${success ? '✅ Emitted' : '❌ Filtered'}`);
    
    // Small delay to make output readable
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 Integration Test Results:');
  const stats = mockNostrService.getStats();
  console.log(`   Posts generated: ${stats.totalPosts}`);
  console.log(`   Expected: ${mockLNPixelsEvents.length}`);
  
  if (stats.totalPosts === mockLNPixelsEvents.length) {
    console.log('   ✅ All events successfully converted to posts');
  } else {
    console.log('   ❌ Some events were filtered or failed');
  }
  
  console.log('\n📝 Generated Posts:');
  stats.posts.forEach((post, i) => {
    console.log(`   ${i + 1}. ${post.text}`);
  });
  
  console.log('\n🎉 Integration test complete!');
  console.log('📋 Next: Test with real Nostr service and WebSocket connection');
}

// Run the test
runIntegrationTest().catch(console.error);
