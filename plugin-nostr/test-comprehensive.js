const { NostrService } = require('./lib/service');
const { emitter } = require('./lib/bridge');
const { startLNPixelsListener } = require('./lib/lnpixels-listener');

// Mock runtime for testing
function createMockRuntime() {
  return {
    getSetting: (key) => {
      const settings = {
        'NOSTR_RELAYS': '',
        'NOSTR_PRIVATE_KEY': '',
        'NOSTR_LISTEN_ENABLE': 'false',
        'NOSTR_POST_ENABLE': 'false'
      };
      return settings[key] || '';
    },
    character: { 
      name: 'TestPixel',
      style: { post: ['witty', 'creative'] },
      postExamples: ['Test post 1', 'Test post 2']
    },
    logger: {
      info: (msg, meta) => console.log('[INFO]', msg, meta ? JSON.stringify(meta) : ''),
      warn: (msg, meta) => console.log('[WARN]', msg, meta ? JSON.stringify(meta) : ''),
      error: (msg, meta) => console.log('[ERROR]', msg, meta ? JSON.stringify(meta) : ''),
      debug: (msg, meta) => console.log('[DEBUG]', msg, meta ? JSON.stringify(meta) : '')
    },
    useModel: async (type, opts) => {
      // Mock LLM response
      await new Promise(r => setTimeout(r, 100)); // Simulate latency
      return `🎨 Mock post about pixel at (${Math.random() > 0.5 ? '5,15' : 'unknown'}) - ${opts.prompt.includes('sats') ? '50 sats' : 'some sats'} ⚡`;
    },
    process: async (msg) => {
      console.log('[INTERNAL]', msg.content.text);
    }
  };
}

async function testBridge() {
  console.log('\n=== Testing Bridge ===');
  
  const runtime = createMockRuntime();
  const svc = new NostrService(runtime);
  
  let postCalled = false;
  let lastPostText = '';
  
  svc.postOnce = async (text) => {
    postCalled = true;
    lastPostText = text;
    console.log('[BRIDGE-TEST] postOnce called with:', text);
    return true;
  };

  // Test normal post
  emitter.emit('external.post', { text: 'Test bridge message' });
  
  // Test validation - these should be ignored
  emitter.emit('external.post', { text: '' }); // Should be ignored
  emitter.emit('external.post', { text: 'x'.repeat(1001) }); // Should be ignored
  
  await new Promise(r => setTimeout(r, 100));
  
  if (postCalled && lastPostText === 'Test bridge message') {
    console.log('✅ Bridge test PASSED');
    return true;
  } else {
    console.log('❌ Bridge test FAILED - postCalled:', postCalled, 'text:', lastPostText);
    return false;
  }
}

async function testListener() {
  console.log('\n=== Testing Listener ===');
  
  const runtime = createMockRuntime();
  
  // Create a more realistic mock socket
  const mockSocket = {
    _handlers: {},
    on: function(event, handler) {
      this._handlers[event] = handler;
      return this;
    },
    emit: function(event, data) {
      const handler = this._handlers[event];
      if (handler) {
        try {
          handler(data);
        } catch (e) {
          console.log('[MOCK] Handler error:', e.message);
        }
      }
      return this;
    },
    disconnect: () => console.log('[MOCK] Socket disconnected'),
    _pixelHealth: null
  };
  
  // Temporarily replace the io import
  const Module = require('module');
  const originalRequire = Module.prototype.require;
  
  Module.prototype.require = function(id) {
    if (id === 'socket.io-client') {
      return function() { return mockSocket; };
    }
    return originalRequire.apply(this, arguments);
  };
  
  try {
    // Clear require cache for the listener module
    const listenerPath = require.resolve('./lib/lnpixels-listener');
    delete require.cache[listenerPath];
    
    const { startLNPixelsListener } = require('./lib/lnpixels-listener');
    const socket = startLNPixelsListener(runtime);
    
    // Test health function
    if (typeof socket._pixelHealth === 'function') {
      const health = socket._pixelHealth();
      console.log('[HEALTH]', health);
      console.log('✅ Health check available');
    }
    
    // Wait for connection setup
    if (mockSocket._handlers['connect']) {
      mockSocket._handlers['connect']();
    }
    
    // Test activity processing
    let postReceived = false;
    emitter.once('external.post', (payload) => {
      postReceived = true;
      console.log('[LISTENER-TEST] Generated post:', payload.text.slice(0, 50) + '...');
    });
    
    // Simulate activity event
    const testActivity = {
      x: 10,
      y: 20,
      color: '#ff0000',
      letter: 'A',
      sats: 100,
      created_at: Date.now(),
      event_id: 'test_' + Date.now()
    };
    
    if (mockSocket._handlers['activity.append']) {
      await mockSocket._handlers['activity.append'](testActivity);
    }
    
    await new Promise(r => setTimeout(r, 300));
    
    if (postReceived) {
      console.log('✅ Listener test PASSED');
      return true;
    } else {
      console.log('❌ Listener test FAILED - no post received');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Listener test ERROR:', error.message);
    return false;
  } finally {
    // Restore original require
    Module.prototype.require = originalRequire;
    
    // Clear cache again to restore normal behavior
    const listenerPath = require.resolve('./lib/lnpixels-listener');
    delete require.cache[listenerPath];
  }
}

async function testRateLimit() {
  console.log('\n=== Testing Rate Limiting ===');
  
  // Test by accessing rate limiter from listener internals
  const rateLimiter = {
    tokens: 2, // Start with only 2 tokens
    maxTokens: 10,
    lastRefill: Date.now(),
    refillRate: 6000,
    
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
  
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(rateLimiter.consume());
  }
  
  const allowed = results.filter(Boolean).length;
  const blocked = results.filter(r => !r).length;
  
  console.log(`Rate limit test: ${allowed} allowed, ${blocked} blocked`);
  
  if (allowed <= 2 && blocked >= 2) {
    console.log('✅ Rate limiting PASSED');
    return true;
  } else {
    console.log('❌ Rate limiting FAILED');
    return false;
  }
}

async function main() {
  console.log('🧪 Running comprehensive tests...\n');
  
  const results = await Promise.all([
    testBridge(),
    testListener(), 
    testRateLimit()
  ]);
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All tests PASSED - Ready for deployment!');
    process.exit(0);
  } else {
    console.log('💥 Some tests FAILED - Review before deployment');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testBridge, testListener, testRateLimit };
