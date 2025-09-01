#!/usr/bin/env node

/**
 * Quick test runner for @pixel/plugin-nostr
 * Run this to verify everything works without posting
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Nostr Plugin Test Runner\n');

// Run unit tests
console.log('📋 Running unit tests...');
try {
  execSync('npm test', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Unit tests passed!\n');
} catch (error) {
  console.log('❌ Unit tests failed\n');
  process.exit(1);
}

// Run local integration test
console.log('🔧 Running integration test...');
try {
  execSync('node test-local.js', { stdio: 'inherit', cwd: __dirname });
  console.log('✅ Integration test passed!\n');
} catch (error) {
  console.log('❌ Integration test failed\n');
  process.exit(1);
}

console.log('🎉 All tests completed successfully!');
console.log('\n💡 Your plugin is ready for development!');
console.log('   - Edit lib/service.js for core functionality');
console.log('   - Add tests in test/ directory');
console.log('   - Update README.md for documentation');
console.log('   - Set NOSTR_PRIVATE_KEY in character.json for real posting');
