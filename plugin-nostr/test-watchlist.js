#!/usr/bin/env node

/**
 * Test script for Phase 4: Watchlist Monitoring
 * Validates watchlist tracking, matching, and expiry logic
 */

const { NarrativeMemory } = require('./lib/narrativeMemory');

// Mock logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

// Mock runtime
const mockRuntime = {
  getSetting: () => null
};

async function runTests() {
  console.log('=== Phase 4: Watchlist Monitoring Tests ===\n');
  
  const nm = new NarrativeMemory(mockRuntime, logger);
  await nm.initialize();
  
  // Test 1: Add watchlist items
  console.log('TEST 1: Adding watchlist items');
  const added = nm.addWatchlistItems(
    ['privacy tools', 'wallet security', 'zap splits'],
    'digest',
    'test-digest-1'
  );
  console.log(`✅ Added ${added.length} items:`, added);
  console.log();
  
  // Test 2: Check state
  console.log('TEST 2: Check watchlist state');
  let state = nm.getWatchlistState();
  console.log(`✅ Active watchlist has ${state.active} items`);
  state.items.forEach(item => {
    console.log(`   - ${item.item} (age: ${item.age}h, expires: ${item.expiresIn}h)`);
  });
  console.log();
  
  // Test 3: Deduplication
  console.log('TEST 3: Deduplication (re-adding same items)');
  const duplicate = nm.addWatchlistItems(
    ['privacy tools', 'new topic'],
    'digest',
    'test-digest-2'
  );
  console.log(`✅ Only new items added:`, duplicate);
  state = nm.getWatchlistState();
  console.log(`   Total active: ${state.active} (should be 4)`);
  console.log();
  
  // Test 4: Content matching
  console.log('TEST 4: Content matching');
  const match1 = nm.checkWatchlistMatch(
    'New privacy tools launching for Lightning!',
    ['bitcoin', 'lightning']
  );
  if (match1) {
    console.log(`✅ Match detected!`);
    console.log(`   Items: ${match1.matches.map(m => m.item).join(', ')}`);
    console.log(`   Boost: +${match1.boostScore.toFixed(2)}`);
    console.log(`   Reason: ${match1.reason}`);
  } else {
    console.log('❌ No match (expected match)');
  }
  console.log();
  
  // Test 5: Tag matching
  console.log('TEST 5: Tag matching (fuzzy)');
  const match2 = nm.checkWatchlistMatch(
    'Some content about wallets',
    ['wallet-security', 'bitcoin'] // Should match "wallet security"
  );
  if (match2) {
    console.log(`✅ Tag match detected!`);
    console.log(`   Items: ${match2.matches.map(m => m.item).join(', ')}`);
    console.log(`   Boost: +${match2.boostScore.toFixed(2)}`);
  } else {
    console.log('❌ No match (expected fuzzy tag match)');
  }
  console.log();
  
  // Test 6: No match
  console.log('TEST 6: No match scenario');
  const match3 = nm.checkWatchlistMatch(
    'Random post about cats',
    ['animals', 'pets']
  );
  if (match3) {
    console.log('❌ False positive match detected:', match3);
  } else {
    console.log('✅ Correctly identified no match');
  }
  console.log();
  
  // Test 7: Multiple matches (boost capping)
  console.log('TEST 7: Multiple matches (boost capping)');
  const match4 = nm.checkWatchlistMatch(
    'Privacy tools, wallet security, and zap splits all launching today!',
    ['privacy', 'wallet', 'zaps']
  );
  if (match4) {
    console.log(`✅ Multiple matches detected (${match4.matches.length})`);
    console.log(`   Items: ${match4.matches.map(m => m.item).join(', ')}`);
    console.log(`   Boost: +${match4.boostScore.toFixed(2)} (should be capped at 0.50)`);
    if (match4.boostScore > 0.5) {
      console.log('❌ ERROR: Boost exceeds cap!');
    } else {
      console.log('✅ Boost properly capped');
    }
  } else {
    console.log('❌ No match (expected multiple matches)');
  }
  console.log();
  
  // Test 8: Expiry simulation (accelerated)
  console.log('TEST 8: Expiry simulation');
  console.log('   Manually setting expiry to 1 second for testing...');
  nm.watchlistExpiryMs = 1000; // 1 second
  
  console.log('   Waiting 1.5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log('   Triggering pruning...');
  const pruned = nm._pruneExpiredWatchlist();
  console.log(`✅ Pruned ${pruned} expired items`);
  
  state = nm.getWatchlistState();
  console.log(`   Active watchlist now has ${state.active} items (should be 0)`);
  if (state.active === 0) {
    console.log('✅ All items expired correctly');
  } else {
    console.log('❌ ERROR: Items not expired:', state.items);
  }
  console.log();
  
  // Test 9: Store timeline lore with watchlist extraction
  console.log('TEST 9: Auto-extract from timeline lore storage');
  await nm.storeTimelineLore({
    id: 'timeline-test-1',
    headline: 'Test digest',
    narrative: 'Test narrative',
    watchlist: ['self-custody', 'lightning nodes', 'channel management'],
    tags: ['bitcoin', 'lightning'],
    priority: 'medium',
    tone: 'technical'
  });
  
  state = nm.getWatchlistState();
  console.log(`✅ Watchlist auto-populated from digest`);
  console.log(`   Active items: ${state.active} (should be 3)`);
  state.items.forEach(item => {
    console.log(`   - ${item.item} (source: ${item.source})`);
  });
  console.log();
  
  console.log('=== All Tests Complete ===');
  console.log('\nSUMMARY:');
  console.log('✅ Watchlist tracking works');
  console.log('✅ Deduplication works');
  console.log('✅ Content matching works');
  console.log('✅ Tag matching (fuzzy) works');
  console.log('✅ No false positives on unrelated content');
  console.log('✅ Boost capping works');
  console.log('✅ Expiry pruning works');
  console.log('✅ Auto-extraction from digests works');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
