#!/usr/bin/env node

// Test the enhanced thread-aware discovery system

const { NostrService } = require('./lib/service');

// Mock runtime for testing
const mockRuntime = {
  character: { 
    name: 'PixelAgent',
    system: 'A creative AI agent focused on pixel art and collaborative canvases',
    style: {
      all: ['witty', 'engaging', 'creative'],
      chat: ['conversational', 'contextual']
    },
    postExamples: [
      'pixels dancing on the lightning canvas ⚡',
      'collaborative art meets cryptographic consensus',
      'every satoshi tells a story through color'
    ]
  },
  getSetting: (key) => {
    const settings = {
      'NOSTR_RELAYS': 'wss://relay.damus.io',
      'NOSTR_PRIVATE_KEY': '',
      'NOSTR_PUBLIC_KEY': 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
      'NOSTR_LISTEN_ENABLE': 'false',
      'NOSTR_POST_ENABLE': 'false'
    };
    return settings[key];
  }
};

async function testThreadAwareDiscovery() {
  console.log('🧵 Testing thread-aware discovery system...\n');

  const service = new NostrService(mockRuntime);
  service.pkHex = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';
  
  // Mock the _list method to return predefined events
  const mockEvents = new Map();
  service._list = async (relays, filters) => {
    const results = [];
    for (const filter of filters) {
      if (filter.ids) {
        for (const id of filter.ids) {
          if (mockEvents.has(id)) {
            results.push(mockEvents.get(id));
          }
        }
      }
    }
    return results;
  };

  // Test cases for thread context evaluation
  const testCases = [
    {
      name: 'High-quality root post about pixel art',
      event: {
        id: 'root1',
        pubkey: 'artist123',
        content: 'Just launched a new collaborative pixel art project where anyone can contribute. Each pixel costs 1 sat and builds towards something beautiful. The intersection of art and Bitcoin is fascinating!',
        tags: [],
        created_at: Math.floor(Date.now() / 1000) - 300 // 5 minutes ago
      },
      threadContext: null,
      shouldEngage: true,
      reason: 'High-quality root post about relevant topics (art, Bitcoin, collaboration)'
    },
    {
      name: 'Thread reply with good context about Lightning art',
      event: {
        id: 'reply1',
        pubkey: 'dev456',
        content: 'The Lightning Network enables micropayments for art in ways we never imagined. Each zap is like a tiny brushstroke of appreciation.',
        tags: [
          ['e', 'root1'],
          ['p', 'artist123']
        ],
        created_at: Math.floor(Date.now() / 1000) - 200
      },
      threadEvents: [
        {
          id: 'root1',
          pubkey: 'artist123',
          content: 'Working on a Lightning-powered canvas where artists can sell individual pixels. Revolutionary way to monetize digital art!',
          tags: [],
          created_at: Math.floor(Date.now() / 1000) - 600
        }
      ],
      shouldEngage: true,
      reason: 'Good thread context with relevant topics and manageable length'
    },
    {
      name: 'Deep thread reply with low relevance',
      event: {
        id: 'deep1',
        pubkey: 'random789',
        content: 'Yeah I agree about the weather today',
        tags: [
          ['e', 'parent1'],
          ['e', 'root2', '', 'root'],
          ['p', 'user1'],
          ['p', 'user2'],
          ['p', 'user3']
        ],
        created_at: Math.floor(Date.now() / 1000) - 100
      },
      threadEvents: [
        { id: 'root2', pubkey: 'user1', content: 'Weather is nice', tags: [], created_at: Math.floor(Date.now() / 1000) - 1000 },
        { id: 'reply1', pubkey: 'user2', content: 'Yes very nice', tags: [['e', 'root2'], ['p', 'user1']], created_at: Math.floor(Date.now() / 1000) - 800 },
        { id: 'reply2', pubkey: 'user3', content: 'Could be better', tags: [['e', 'root2'], ['p', 'user1'], ['p', 'user2']], created_at: Math.floor(Date.now() / 1000) - 600 },
        { id: 'parent1', pubkey: 'user4', content: 'I like sunny days', tags: [['e', 'root2'], ['p', 'user1'], ['p', 'user2'], ['p', 'user3']], created_at: Math.floor(Date.now() / 1000) - 300 }
      ],
      shouldEngage: false,
      reason: 'Deep thread (5+ messages) about irrelevant topic (weather)'
    },
    {
      name: 'Thread about Bitcoin with medium context',
      event: {
        id: 'btc1',
        pubkey: 'bitcoiner101',
        content: 'The Lightning Network is enabling new forms of digital art monetization that were impossible before',
        tags: [
          ['e', 'btcroot'],
          ['p', 'hodler'],
          ['p', 'artist']
        ],
        created_at: Math.floor(Date.now() / 1000) - 150
      },
      threadEvents: [
        {
          id: 'btcroot',
          pubkey: 'hodler',
          content: 'Bitcoin is not just money, it\'s enabling new creative economies',
          tags: [],
          created_at: Math.floor(Date.now() / 1000) - 900
        },
        {
          id: 'btcreply1',
          pubkey: 'artist',
          content: 'Artists are starting to use sats for micropayments on their work',
          tags: [['e', 'btcroot'], ['p', 'hodler']],
          created_at: Math.floor(Date.now() / 1000) - 600
        }
      ],
      shouldEngage: true,
      reason: 'Medium thread with highly relevant content (Bitcoin, Lightning, art, micropayments)'
    },
    {
      name: 'Low-quality short content',
      event: {
        id: 'short1',
        pubkey: 'spammer',
        content: 'gm',
        tags: [],
        created_at: Math.floor(Date.now() / 1000) - 50
      },
      threadContext: null,
      shouldEngage: false,
      reason: 'Very short content that appears to be low-quality/bot-like'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    // Setup mock events if threadEvents are provided
    if (testCase.threadEvents) {
      for (const evt of testCase.threadEvents) {
        mockEvents.set(evt.id, evt);
      }
    }

    try {
      // Get thread context
      let threadContext;
      if (testCase.threadEvents) {
        // Manually construct thread context for testing
        const allEvents = [testCase.event, ...testCase.threadEvents];
        threadContext = {
          thread: allEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
          isRoot: !testCase.event.tags?.some(t => t[0] === 'e'),
          contextQuality: service._assessThreadContextQuality(allEvents)
        };
      } else {
        threadContext = await service._getThreadContext(testCase.event);
      }
      
      // Test context quality assessment
      const contextQuality = service._assessThreadContextQuality(threadContext.thread);
      
      // Test engagement decision
      const shouldEngage = service._shouldEngageWithThread(testCase.event, threadContext);
      
      const success = shouldEngage === testCase.shouldEngage;
      
      if (success) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Should engage: ${testCase.shouldEngage}, Got: ${shouldEngage}`);
        console.log(`   Context quality: ${(contextQuality * 100).toFixed(0)}%`);
        console.log(`   Thread length: ${threadContext.thread.length}`);
        console.log(`   Reason: ${testCase.reason}\n`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Expected: ${testCase.shouldEngage}, Got: ${shouldEngage}`);
        console.log(`   Context quality: ${(contextQuality * 100).toFixed(0)}%`);
        console.log(`   Thread length: ${threadContext.thread.length}`);
        console.log(`   Reason: ${testCase.reason}`);
        console.log(`   Event: ${JSON.stringify(testCase.event, null, 2)}\n`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 ${testCase.name}: ERROR`);
      console.log(`   ${error.message}\n`);
      failed++;
    }

    // Clear mock events for next test
    mockEvents.clear();
  }

  console.log(`\n📊 Thread Context Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! The thread-aware discovery system should provide much better context for responses.');
    console.log('\n🔄 Benefits of the new system:');
    console.log('• Understands full thread context before engaging');
    console.log('• Avoids jumping into irrelevant conversations');
    console.log('• Makes more contextually appropriate responses');
    console.log('• Identifies good conversation entry points');
    console.log('• Filters out bot-like or low-quality content');
  } else {
    console.log('⚠️  Some tests failed. The thread-aware logic may need refinement.');
  }
}

if (require.main === module) {
  testThreadAwareDiscovery().catch(console.error);
}

module.exports = { testThreadAwareDiscovery };
