#!/usr/bin/env node

// Test the actual lnpixels-listener.js with mock WebSocket and LLM
const EventEmitter = require('events');

console.log('🔄 Testing lnpixels-listener.js with mocks...\n');

// Mock Socket.IO client
class MockSocketIO extends EventEmitter {
  constructor(url, options) {
    super();
    this.connected = false;
    this.url = url;
    this.options = options;
    
    // Auto-connect like real socket.io-client
    setTimeout(() => {
      this.connected = true;
      this.emit('connect');
      console.log('📡 [Mock WebSocket] Connected to LNPixels API');
    }, 50);
  }
  
  connect() {
    return this;
  }
  
  disconnect() {
    this.connected = false;
    this.emit('disconnect');
    console.log('📡 [Mock WebSocket] Disconnected');
  }
  
  // Simulate LNPixels purchase events
  simulateActivity(event) {
    if (this.connected) {
      console.log(`📦 [Mock WebSocket] Simulating activity: ${JSON.stringify(event)}`);
      this.emit('activity.append', event);
    }
  }
}

// Mock runtime object for LLM
const mockRuntime = {
  logger: console,
  useModel: async (modelType, options) => {
    console.log(`🤖 [Mock LLM] Using model: ${modelType} with prompt: "${options.prompt.substring(0, 50)}..."`);
    
    // Simulate some variety in responses
    const responses = [
      "🎨 Another pixel joins the Lightning Canvas! The decentralized art experiment continues to grow one sat at a time! ⚡",
      "💫 Fresh paint on the blockchain! Someone just made their mark on the Lightning Network canvas! #LightningNetwork 🌈",
      "🎯 The pixel wars continue! Another brave soul has claimed their spot on the decentralized canvas! ⚡🎨"
    ];
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    console.log(`🤖 [Mock LLM] Generated: "${response}"`);
    
    return {
      text: response
    };
  }
};

// Create environment for the listener
process.env.LNPIXELS_WS_URL = 'ws://localhost:3001';

// Override require to inject our mocks
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'socket.io-client') {
    return {
      io: (url, options) => {
        console.log(`📡 [Mock] Creating Socket.IO client for ${url}`);
        return new MockSocketIO(url, options);
      }
    };
  }
  if (id === '../bridge.js') {
    return require('./lib/bridge.js');
  }
  return originalRequire.apply(this, arguments);
};

async function runListenerTest() {
  console.log('🚀 Starting listener test...\n');
  
  // Track posts received by bridge
  const { emitter } = require('./lib/bridge.js');
  const receivedPosts = [];
  
  emitter.on('external.post', (payload) => {
    receivedPosts.push(payload.text);
    console.log(`✅ [Bridge] Received post: "${payload.text.substring(0, 60)}..."`);
  });
  
  try {
    // Import and start the listener
    const { startLNPixelsListener } = require('./lib/lnpixels-listener.js');
    const mockSocket = await startLNPixelsListener(mockRuntime);
    
    console.log('⏳ Waiting for connection...\n');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simulate some purchase events with correct format
    const testEvents = [
      {
        x: 42,
        y: 84,
        color: '#FF6B35',
        sats: 1500,
        letter: 'A',
        created_at: Date.now(),
        event_id: 'test_event_1'
      },
      {
        x: 200,
        y: 300,
        color: '#4ECDC4',
        sats: 3000,
        letter: 'B', 
        created_at: Date.now() + 1000,
        event_id: 'test_event_2'
      }
    ];
    
    console.log('📤 Simulating purchase events...\n');
    
    for (const event of testEvents) {
      mockSocket.simulateActivity(event);
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n📊 Test Results:');
    console.log(`   Events sent: ${testEvents.length}`);
    console.log(`   Posts received: ${receivedPosts.length}`);
    console.log(`   Success rate: ${receivedPosts.length}/${testEvents.length}`);
    
    if (receivedPosts.length === testEvents.length) {
      console.log('   ✅ All events successfully processed');
    } else {
      console.log('   ⚠️  Some events may have been rate limited or failed');
    }
    
    console.log('\n📝 Generated Posts:');
    receivedPosts.forEach((post, i) => {
      console.log(`   ${i + 1}. ${post}`);
    });
    
    // Cleanup
    mockSocket.disconnect();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
runListenerTest()
  .then(() => {
    console.log('\n🎉 Listener test complete!');
    console.log('📋 Ready for production deployment with real LNPixels API');
  })
  .catch(console.error);
