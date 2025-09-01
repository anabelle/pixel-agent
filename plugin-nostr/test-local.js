#!/usr/bin/env node

/**
 * Test script for @pixel/plugin-nostr without posting to Nostr
 * This script demonstrates how to test the plugin functionality safely
 */

const { NostrService } = require('./lib/service.js');

// Mock runtime for testing
const createTestRuntime = () => ({
  character: {
    name: 'Pixel',
    style: { post: ['playful'] },
    postExamples: ['pixels unite.']
  },
  useModel: async (type, { prompt }) => ({
    text: 'Test response from LLM'
  }),
  getSetting: (key) => {
    const testSettings = {
      'NOSTR_PRIVATE_KEY': '', // Empty = no posting
      'NOSTR_RELAYS': 'wss://relay.damus.io',
      'NOSTR_LISTEN_ENABLE': 'false',
      'NOSTR_POST_ENABLE': 'false',
      'NOSTR_REPLY_ENABLE': 'false',
      'NOSTR_DISCOVERY_ENABLE': 'false',
      'NOSTR_HOME_FEED_ENABLE': 'false',
      'NOSTR_UNFOLLOW_ENABLE': 'false'
    };
    return testSettings[key] || '';
  }
});

async function testBasicFunctionality() {
  console.log('🧪 Testing NostrService basic functionality...\n');

  try {
    const runtime = createTestRuntime();
    const service = await NostrService.start(runtime);

    console.log('✅ Service started successfully');
    console.log('📊 Service configuration:');
    console.log(`   - Posting enabled: ${service.postEnabled}`);
    console.log(`   - Listening enabled: ${service.listenEnabled}`);
    console.log(`   - Discovery enabled: ${service.discoveryEnabled}`);
    console.log(`   - Home feed enabled: ${service.homeFeedEnabled}`);
    console.log(`   - Unfollow enabled: ${service.unfollowEnabled}`);
    console.log(`   - Has private key: ${!!service.sk}`);
    console.log(`   - Has relays: ${service.relays.length > 0}`);

    // Test quality scoring
    console.log('\n🔍 Testing quality scoring...');
    const testEvents = [
      { content: 'Hello world!', created_at: Date.now() / 1000 },
      { content: 'This is a great post about technology and innovation.', created_at: Date.now() / 1000 },
      { content: 'gm', created_at: Date.now() / 1000 }, // Low quality
      { content: 'Buy my NFT for 1 BTC!!!', created_at: Date.now() / 1000 } // Spam
    ];

    testEvents.forEach((event, i) => {
      const isQuality = service._isQualityContent(event, 'general', 'normal');
      console.log(`   Event ${i + 1}: "${event.content.slice(0, 30)}..." -> Quality: ${isQuality}`);
    });

    // Test user quality tracking
    console.log('\n👤 Testing user quality tracking...');
    const testPubkey = 'test-pubkey-123';
    service._updateUserQualityScore(testPubkey, testEvents[1]); // Good post
    service._updateUserQualityScore(testPubkey, testEvents[0]); // Neutral post
    service._updateUserQualityScore(testPubkey, testEvents[2]); // Bad post

    const qualityScore = service.userQualityScores.get(testPubkey);
    const postCount = service.userPostCounts.get(testPubkey);
    console.log(`   User quality score: ${qualityScore?.toFixed(3)}`);
    console.log(`   User post count: ${postCount}`);

    // Test unfollow logic
    console.log('\n🚫 Testing unfollow logic...');
    const shouldUnfollow = postCount >= service.unfollowMinPostsThreshold &&
                           qualityScore < service.unfollowMinQualityScore;
    console.log(`   Should unfollow: ${shouldUnfollow}`);
    console.log(`   Min posts threshold: ${service.unfollowMinPostsThreshold}`);
    console.log(`   Min quality threshold: ${service.unfollowMinQualityScore}`);

    await service.stop();
    console.log('\n✅ Service stopped successfully');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function testHomeFeedSimulation() {
  console.log('\n🏠 Testing home feed simulation...\n');

  try {
    const runtime = createTestRuntime();
    const service = await NostrService.start(runtime);

    // Mock some home feed events
    const mockEvents = [
      {
        id: 'event1',
        pubkey: 'user1',
        content: 'Great post about Bitcoin!',
        created_at: Date.now() / 1000
      },
      {
        id: 'event2',
        pubkey: 'user2',
        content: 'gm everyone!',
        created_at: Date.now() / 1000
      },
      {
        id: 'event3',
        pubkey: 'user1',
        content: 'Another thoughtful post about technology.',
        created_at: Date.now() / 1000
      }
    ];

    console.log('📝 Processing mock home feed events...');
    for (const event of mockEvents) {
      service.handleHomeFeedEvent(event);
      const quality = service._isQualityContent(event, 'general', 'normal');
      console.log(`   Processed: "${event.content.slice(0, 30)}..." (Quality: ${quality})`);
    }

    // Show quality tracking results
    console.log('\n📊 Quality tracking results:');
    for (const [pubkey, score] of service.userQualityScores.entries()) {
      const count = service.userPostCounts.get(pubkey);
      console.log(`   ${pubkey}: Score ${score.toFixed(3)}, Posts: ${count}`);
    }

    await service.stop();

  } catch (error) {
    console.error('❌ Home feed test failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Nostr Plugin Test Suite\n');
  console.log('=' .repeat(50));

  await testBasicFunctionality();
  await testHomeFeedSimulation();

  console.log('\n' + '=' .repeat(50));
  console.log('✅ All tests completed successfully!');
  console.log('\n💡 Tips for testing:');
  console.log('   - Run with: node test-local.js');
  console.log('   - Run unit tests: npm test');
  console.log('   - For real posting, set NOSTR_PRIVATE_KEY in character.json');
  console.log('   - Monitor logs with: DEBUG=* node test-local.js');
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testBasicFunctionality, testHomeFeedSimulation };
