#!/usr/bin/env node

/**
 * Test script to verify the Twitter rate limit patch works
 */

console.log('Testing Twitter rate limit patch...');

// Load the patch
require('./twitter-patch.js');

console.log('Patch loaded successfully');

// Try to load the Twitter plugin
try {
  const twitterPlugin = require('@elizaos/plugin-twitter');
  console.log('✅ Twitter plugin loaded successfully');

  // Check if the patch was applied
  if (typeof twitterPlugin.getRateLimitStatus === 'function') {
    console.log('✅ Rate limit status function added');
  } else {
    console.log('❌ Rate limit status function not found');
  }

  if (typeof twitterPlugin.shouldPauseOperations === 'function') {
    console.log('✅ Pause operations function added');
  } else {
    console.log('❌ Pause operations function not found');
  }

  // Test rate limit status
  const status = twitterPlugin.getRateLimitStatus();
  console.log('📊 Initial rate limit status:', status);

  console.log('🎉 Twitter patch test completed successfully!');

} catch (error) {
  console.error('❌ Failed to load Twitter plugin:', error.message);
  process.exit(1);
}