#!/usr/bin/env node

// Test the thread context fix for the "random replies to long threads" issue

const { NostrService } = require('./lib/service');

// Mock runtime for testing
const mockRuntime = {
  character: { name: 'PixelAgent' },
  getSetting: (key) => {
    const settings = {
      'NOSTR_RELAYS': '',
      'NOSTR_PRIVATE_KEY': '',
      'NOSTR_PUBLIC_KEY': 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
      'NOSTR_LISTEN_ENABLE': 'false',
      'NOSTR_POST_ENABLE': 'false'
    };
    return settings[key];
  }
};

async function testThreadDetection() {
  console.log('🧪 Testing thread context detection...\n');

  const service = new NostrService(mockRuntime);
  service.pkHex = 'abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234';

  // Test cases
  const testCases = [
    {
      name: 'Direct mention in root note',
      event: {
        id: 'event1',
        pubkey: 'otherpubkey',
        content: 'Hey @PixelAgent, what do you think about this?',
        tags: [['p', service.pkHex]],
        created_at: Date.now() / 1000
      },
      expected: true,
      reason: 'Direct mention in content + we are the only p-tag'
    },
    {
      name: 'Thread reply mentioning agent by name',
      event: {
        id: 'event2',
        pubkey: 'otherpubkey',
        content: 'I think PixelAgent would have good insights on this',
        tags: [
          ['e', 'parentevent'],
          ['p', 'originalposter'],
          ['p', service.pkHex]
        ],
        created_at: Date.now() / 1000
      },
      expected: true,
      reason: 'Contains agent name in content'
    },
    {
      name: 'Thread reply not directed at agent',
      event: {
        id: 'event3',
        pubkey: 'otherpubkey',
        content: 'Yeah I totally agree with your point about Bitcoin',
        tags: [
          ['e', 'parentevent'],
          ['e', 'rootevent', '', 'root'],
          ['p', 'originalposter'],
          ['p', 'anotherperson'],
          ['p', service.pkHex]  // We're included due to thread protocol, not direct mention
        ],
        created_at: Date.now() / 1000
      },
      expected: false,
      reason: 'Thread reply with us as 3rd p-tag, no mention in content'
    },
    {
      name: 'Direct reply to agent',
      event: {
        id: 'event4',
        pubkey: 'otherpubkey',
        content: 'Thanks for the explanation!',
        tags: [
          ['e', 'agentevent'],
          ['p', service.pkHex]
        ],
        created_at: Date.now() / 1000
      },
      expected: true,
      reason: 'Reply with agent as only p-tag recipient'
    },
    {
      name: 'Root note with npub mention',
      event: {
        id: 'event5',
        pubkey: 'otherpubkey',
        content: 'Check out this cool work by nostr:npub1abcd123... and what they are building',
        tags: [['p', service.pkHex]],
        created_at: Date.now() / 1000
      },
      expected: true,
      reason: 'Contains npub reference and matching pubkey hex'
    },
    {
      name: 'Deep thread reply with no mention',
      event: {
        id: 'event6',
        pubkey: 'otherpubkey',
        content: 'This is just a random comment in a long thread about art',
        tags: [
          ['e', 'parentevent'],
          ['e', 'rootevent', '', 'root'],
          ['p', 'user1'],
          ['p', 'user2'],
          ['p', 'user3'],
          ['p', service.pkHex],  // We're the 4th p-tag, very likely just thread inclusion
          ['p', 'user5']
        ],
        created_at: Date.now() / 1000
      },
      expected: false,
      reason: 'Deep in thread with no mention in content, we are 4th of 5 p-tags'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = service._isActualMention(testCase.event);
    const success = result === testCase.expected;
    
    if (success) {
      console.log(`✅ ${testCase.name}`);
      console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
      console.log(`   Reason: ${testCase.reason}\n`);
      passed++;
    } else {
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
      console.log(`   Reason: ${testCase.reason}`);
      console.log(`   Event: ${JSON.stringify(testCase.event, null, 2)}\n`);
      failed++;
    }
  }

  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! The fix should prevent random replies to long threads.');
  } else {
    console.log('⚠️  Some tests failed. The logic may need refinement.');
  }
}

if (require.main === module) {
  testThreadDetection().catch(console.error);
}

module.exports = { testThreadDetection };
