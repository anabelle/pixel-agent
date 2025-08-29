#!/usr/bin/env node

// Test memory creation functionality in lnpixels-listener.js
const EventEmitter = require('events');

console.log('🧠 Testing LNPixels memory creation...\n');

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

// Mock runtime object with memory tracking
const createdMemories = [];
const mockRuntime = {
  agentId: 'pixel-agent-test',
  logger: console,
  useModel: async (modelType, options) => {
    console.log(`🤖 [Mock LLM] Using model: ${modelType} with prompt: "${options.prompt.substring(0, 50)}..."`);
    
    const response = "🎨 Another pixel joins the Lightning Canvas! The decentralized art experiment continues to grow one sat at a time! ⚡";
    console.log(`🤖 [Mock LLM] Generated: "${response}"`);
    
    return {
      text: response
    };
  },
  createMemory: async (memory, tableName = 'messages') => {
    console.log(`🧠 [Mock Runtime] Creating memory in table '${tableName}':`);
    console.log(`   ID: ${memory.id}`);
    console.log(`   Room: ${memory.roomId}`);
    console.log(`   Entity: ${memory.entityId}`);
    console.log(`   Content Type: ${memory.content.type}`);
    console.log(`   Content Text: "${memory.content.text}"`);
    console.log(`   Data Keys: ${Object.keys(memory.content.data || {}).join(', ')}`);
    
    createdMemories.push({
      ...memory,
      tableName,
      timestamp: Date.now()
    });
    
    return memory;
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

async function runMemoryTest() {
  console.log('🚀 Starting memory test...\n');
  
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
    
    // Simulate purchase events with correct format
    const testEvents = [
      {
        x: 42,
        y: 84,
        color: '#FF6B35',
        sats: 1500,
        letter: 'A',
        created_at: Date.now(),
        event_id: 'memory_test_event_1'
      },
      {
        x: 200,
        y: 300,
        color: '#4ECDC4',
        sats: 3000,
        letter: 'B', 
        created_at: Date.now() + 1000,
        event_id: 'memory_test_event_2'
      }
    ];
    
    console.log('📤 Simulating purchase events...\n');
    
    for (const event of testEvents) {
      mockSocket.simulateActivity(event);
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n📊 Memory Test Results:');
    console.log(`   Events sent: ${testEvents.length}`);
    console.log(`   Posts received: ${receivedPosts.length}`);
    console.log(`   Memories created: ${createdMemories.length}`);
    
    if (createdMemories.length === testEvents.length) {
      console.log('   ✅ All events successfully created memories');
    } else {
      console.log('   ⚠️  Some events failed to create memories');
    }
    
    console.log('\n🧠 Created Memories:');
    createdMemories.forEach((memory, i) => {
      console.log(`   ${i + 1}. ID: ${memory.id}`);
      console.log(`      Room: ${memory.roomId}`);
      console.log(`      Text: "${memory.content.text}"`);
      console.log(`      Trigger: x=${memory.content.data.triggerEvent.x}, y=${memory.content.data.triggerEvent.y}, sats=${memory.content.data.triggerEvent.sats}`);
      console.log(`      Trace: ${memory.content.data.traceId}`);
      console.log('');
    });
    
    // Verify memory structure
    console.log('🔍 Memory Structure Validation:');
    const validMemories = createdMemories.filter(memory => {
      const hasRequiredFields = memory.id && memory.entityId && memory.agentId && memory.roomId && memory.content && memory.createdAt;
      const hasCorrectContentType = memory.content.type === 'lnpixels_post';
      const hasData = memory.content.data && memory.content.data.triggerEvent && memory.content.data.traceId;
      return hasRequiredFields && hasCorrectContentType && hasData;
    });
    
    console.log(`   Valid memories: ${validMemories.length}/${createdMemories.length}`);
    if (validMemories.length === createdMemories.length) {
      console.log('   ✅ All memories have correct structure');
    } else {
      console.log('   ❌ Some memories have invalid structure');
    }
    
    // Cleanup
    mockSocket.disconnect();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
runMemoryTest()
  .then(() => {
    console.log('\n🎉 Memory test complete!');
    console.log('📋 LNPixels events will now be persisted to ElizaOS memory system');
  })
  .catch(console.error);
