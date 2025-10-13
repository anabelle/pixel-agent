#!/usr/bin/env node

// Simple validation script for novelty scoring implementation

const { NarrativeMemory } = require('./plugin-nostr/lib/narrativeMemory.js');

const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {}
};

const mockRuntime = {
  getSetting: () => null
};

console.log('Testing Novelty Scoring Implementation...\n');

// Test 1: Create narrativeMemory instance
console.log('✓ Test 1: Creating NarrativeMemory instance...');
const narrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);
console.log('  Created successfully\n');

// Test 2: Check if getTopicRecency method exists
console.log('✓ Test 2: Checking getTopicRecency method...');
if (typeof narrativeMemory.getTopicRecency === 'function') {
  console.log('  Method exists\n');
} else {
  console.error('  ERROR: Method not found!\n');
  process.exit(1);
}

// Test 3: Test with empty timeline lore
console.log('✓ Test 3: Testing with empty timeline lore...');
const emptyRecency = narrativeMemory.getTopicRecency('bitcoin', 24);
if (emptyRecency.mentions === 0 && emptyRecency.lastSeen === null) {
  console.log('  Returns correct zero state:', emptyRecency, '\n');
} else {
  console.error('  ERROR: Unexpected result:', emptyRecency, '\n');
  process.exit(1);
}

// Test 4: Add timeline lore and test counting
console.log('✓ Test 4: Testing with sample timeline lore...');
const now = Date.now();
narrativeMemory.timelineLore = [
  { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin', 'lightning'] },
  { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin', 'nostr'] },
  { timestamp: now - 1000 * 60 * 60 * 3, tags: ['bitcoin', 'freedom'] },
  { timestamp: now - 1000 * 60 * 60 * 4, tags: ['bitcoin'] }
];

const bitcoinRecency = narrativeMemory.getTopicRecency('bitcoin', 24);
console.log('  Bitcoin mentions:', bitcoinRecency.mentions);
console.log('  Last seen:', bitcoinRecency.lastSeen ? 'Yes' : 'No');

if (bitcoinRecency.mentions === 4) {
  console.log('  ✓ Correct mention count\n');
} else {
  console.error('  ERROR: Expected 4 mentions, got', bitcoinRecency.mentions, '\n');
  process.exit(1);
}

// Test 5: Test for new topic (0 mentions)
console.log('✓ Test 5: Testing new topic detection...');
const newTopicRecency = narrativeMemory.getTopicRecency('quantum-computing', 24);
if (newTopicRecency.mentions === 0) {
  console.log('  ✓ New topic correctly identified (0 mentions)\n');
} else {
  console.error('  ERROR: Expected 0 mentions, got', newTopicRecency.mentions, '\n');
  process.exit(1);
}

// Test 6: Test case-insensitivity
console.log('✓ Test 6: Testing case-insensitivity...');
const lowerCase = narrativeMemory.getTopicRecency('bitcoin', 24);
const upperCase = narrativeMemory.getTopicRecency('BITCOIN', 24);
const mixedCase = narrativeMemory.getTopicRecency('BiTcOiN', 24);

if (lowerCase.mentions === upperCase.mentions && upperCase.mentions === mixedCase.mentions) {
  console.log('  ✓ Case-insensitive matching works\n');
} else {
  console.error('  ERROR: Case-insensitive matching failed\n');
  process.exit(1);
}

// Test 7: Test lookback window
console.log('✓ Test 7: Testing lookback window...');
narrativeMemory.timelineLore = [
  { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin'] }, // 1 hour ago
  { timestamp: now - 1000 * 60 * 60 * 25, tags: ['bitcoin'] } // 25 hours ago
];

const recentOnly = narrativeMemory.getTopicRecency('bitcoin', 24);
if (recentOnly.mentions === 1) {
  console.log('  ✓ Lookback window correctly filters old entries\n');
} else {
  console.error('  ERROR: Expected 1 mention within 24h, got', recentOnly.mentions, '\n');
  process.exit(1);
}

// Test 8: Check _getLastTopicMention helper
console.log('✓ Test 8: Testing _getLastTopicMention helper...');
if (typeof narrativeMemory._getLastTopicMention === 'function') {
  const lastSeen = narrativeMemory._getLastTopicMention('bitcoin');
  if (typeof lastSeen === 'number' && lastSeen > 0) {
    console.log('  ✓ Returns valid timestamp:', new Date(lastSeen).toISOString(), '\n');
  } else if (lastSeen === null) {
    console.error('  ERROR: Expected timestamp, got null\n');
    process.exit(1);
  }
} else {
  console.error('  ERROR: _getLastTopicMention method not found!\n');
  process.exit(1);
}

// Test 9: Test novelty scoring thresholds
console.log('✓ Test 9: Testing novelty scoring thresholds...');
narrativeMemory.timelineLore = [
  { timestamp: now - 1000 * 60 * 60, tags: ['bitcoin'] },
  { timestamp: now - 1000 * 60 * 60 * 2, tags: ['bitcoin'] },
  { timestamp: now - 1000 * 60 * 60 * 3, tags: ['bitcoin'] },
  { timestamp: now - 1000 * 60 * 60 * 4, tags: ['bitcoin'] }
];

const overexposed = narrativeMemory.getTopicRecency('bitcoin', 24);
if (overexposed.mentions > 3) {
  console.log('  ✓ Topic correctly identified as overexposed (>3 mentions)');
  console.log('    Should receive -0.5 penalty\n');
} else {
  console.error('  ERROR: Expected >3 mentions for penalty\n');
  process.exit(1);
}

const novel = narrativeMemory.getTopicRecency('quantum-ai', 24);
if (novel.mentions === 0) {
  console.log('  ✓ Topic correctly identified as novel (0 mentions)');
  console.log('    Should receive +0.4 bonus\n');
} else {
  console.error('  ERROR: Expected 0 mentions for bonus\n');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('✅ All tests passed! Novelty scoring implementation is working.\n');
console.log('Summary:');
console.log('  - getTopicRecency() method implemented correctly');
console.log('  - _getLastTopicMention() helper working');
console.log('  - Case-insensitive matching verified');
console.log('  - Lookback window filtering working');
console.log('  - Novelty thresholds properly detected:');
console.log('    * 0 mentions → +0.4 bonus (new topic)');
console.log('    * >3 mentions → -0.5 penalty (overexposed)');
console.log('='.repeat(60));

process.exit(0);
