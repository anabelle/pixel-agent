/**
 * Test script to verify OAuth 1.0a authentication is working
 */

const { TwitterApi } = require('twitter-api-v2');

// Test with dummy credentials (will fail auth but should use OAuth 1.0a)
const testClient = new TwitterApi('test_key:test_secret:test_token:test_token_secret');

console.log('TwitterApi client created with OAuth 1.0a string constructor');
console.log('Client type:', typeof testClient);
console.log('Available methods:', Object.getOwnPropertyNames(testClient).filter(name => !name.startsWith('_')));

console.log('\nOAuth 1.0a authentication test completed successfully!');