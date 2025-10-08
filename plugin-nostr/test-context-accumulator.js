// Test script for Context Accumulator
const { ContextAccumulator } = require('./lib/contextAccumulator');

// Mock runtime
const mockRuntime = {
  agentId: 'test-agent',
  createUniqueUuid: (rt, seed) => `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  createMemory: async (memory, table) => {
    console.log(`[TEST] Memory stored: ${memory.content.type}`, memory.content.data);
    return memory;
  }
};

// Mock logger
const mockLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  warn: (...args) => console.log('[WARN]', ...args)
};

// Create instance
const accumulator = new ContextAccumulator(mockRuntime, mockLogger);

// Test events
const testEvents = [
  {
    id: 'event1',
    pubkey: 'alice123',
    content: 'Just finished a great pixel art piece! 🎨 Love working with limited colors. #pixelart #art',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  },
  {
    id: 'event2',
    pubkey: 'bob456',
    content: 'Bitcoin hit $121k! This is amazing! 🚀 #bitcoin #btc',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  },
  {
    id: 'event3',
    pubkey: 'charlie789',
    content: 'Working on a new Lightning Network app. Anyone have experience with BOLT12?',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  },
  {
    id: 'event4',
    pubkey: 'alice123',
    content: 'Check out this pixel art tutorial: https://example.com/tutorial',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  },
  {
    id: 'event5',
    pubkey: 'dave999',
    content: 'Pixel art is such a cool medium. The constraints actually make it more creative! 🎨',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  },
  {
    id: 'event6',
    pubkey: 'eve888',
    content: 'Bitcoin and Lightning Network integration is the future of payments ⚡',
    created_at: Math.floor(Date.now() / 1000),
    tags: []
  }
];

async function runTests() {
  console.log('\n=== Context Accumulator Test ===\n');

  // Test 1: Process events
  console.log('Test 1: Processing events...');
  for (const evt of testEvents) {
    await accumulator.processEvent(evt);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }

  // Test 2: Check stats
  console.log('\nTest 2: Context stats');
  const stats = accumulator.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // Test 3: Get emerging stories
  console.log('\nTest 3: Emerging stories');
  const stories = accumulator.getEmergingStories(2); // Min 2 users
  console.log(JSON.stringify(stories, null, 2));

  // Test 4: Current activity
  console.log('\nTest 4: Current activity');
  const activity = accumulator.getCurrentActivity();
  console.log(JSON.stringify(activity, null, 2));

  // Test 5: Topic timeline
  console.log('\nTest 5: Topic timeline for "pixel art"');
  const timeline = accumulator.getTopicTimeline('pixel art', 5);
  console.log(JSON.stringify(timeline, null, 2));

  // Test 6: Generate hourly digest
  console.log('\nTest 6: Generate hourly digest');
  const digest = await accumulator.generateHourlyDigest();
  if (digest) {
    console.log(JSON.stringify(digest, null, 2));
  } else {
    console.log('No digest generated (may need to wait for hour to complete)');
  }

  // Test 7: Simulate more events to trigger emerging story
  console.log('\nTest 7: Adding more events to trigger emerging story detection');
  const moreEvents = [
    {
      id: 'event7',
      pubkey: 'frank777',
      content: 'Really enjoying pixel art lately. Started learning 8-bit design!',
      created_at: Math.floor(Date.now() / 1000),
      tags: []
    },
    {
      id: 'event8',
      pubkey: 'grace666',
      content: 'Pixel art community on Nostr is awesome! #pixelart',
      created_at: Math.floor(Date.now() / 1000),
      tags: []
    }
  ];

  for (const evt of moreEvents) {
    await accumulator.processEvent(evt);
  }

  // Check emerging stories again
  console.log('\nEmerging stories after more events:');
  const updatedStories = accumulator.getEmergingStories(2);
  console.log(JSON.stringify(updatedStories, null, 2));

  console.log('\n=== Tests Complete ===\n');
}

// Run tests
runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
