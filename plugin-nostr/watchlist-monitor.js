#!/usr/bin/env node

/**
 * Watchlist Monitoring Dashboard
 * Run this periodically to detect potential feedback loops or issues
 * 
 * Usage: node watchlist-monitor.js [service-instance]
 */

function analyzeWatchlistHealth(service) {
  if (!service?.narrativeMemory) {
    console.log('⚠️  NarrativeMemory not available');
    return null;
  }
  
  const state = service.getWatchlistState();
  if (!state) {
    console.log('ℹ️  No watchlist data available');
    return null;
  }
  
  console.log('\n=== WATCHLIST HEALTH DASHBOARD ===\n');
  
  // 1. Active Items
  console.log(`📊 ACTIVE WATCHLIST: ${state.active} items`);
  if (state.active === 0) {
    console.log('   Status: ✅ Empty (normal for new instance or expired items)');
  } else if (state.active > 20) {
    console.log('   Status: ⚠️  HIGH - May indicate accumulation or no expiry');
  } else {
    console.log('   Status: ✅ Normal range');
  }
  console.log();
  
  // 2. Age Distribution
  if (state.items.length) {
    const ages = state.items.map(i => i.age);
    const avgAge = ages.reduce((sum, a) => sum + a, 0) / ages.length;
    const maxAge = Math.max(...ages);
    
    console.log(`⏰ AGE DISTRIBUTION:`);
    console.log(`   Average: ${avgAge.toFixed(1)}h`);
    console.log(`   Maximum: ${maxAge}h`);
    
    if (maxAge > 20) {
      console.log('   Status: ⚠️  Some items near expiry (>20h old)');
    } else {
      console.log('   Status: ✅ Fresh watchlist');
    }
    console.log();
    
    // 3. Item Details
    console.log(`📋 TRACKED ITEMS:`);
    state.items
      .sort((a, b) => b.age - a.age) // Oldest first
      .forEach((item, idx) => {
        const ageBar = '█'.repeat(Math.floor(item.age / 2));
        const status = item.age > 20 ? '⏳' : '✓';
        console.log(`   ${status} [${ageBar.padEnd(12)}] ${item.item}`);
        console.log(`      Age: ${item.age}h | Expires: ${item.expiresIn}h | Source: ${item.source}`);
      });
    console.log();
  }
  
  // 4. Source Distribution
  const sources = {};
  state.items.forEach(item => {
    sources[item.source] = (sources[item.source] || 0) + 1;
  });
  
  if (Object.keys(sources).length) {
    console.log(`🔍 SOURCE BREAKDOWN:`);
    Object.entries(sources).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} items`);
    });
    console.log();
  }
  
  return {
    active: state.active,
    avgAge: state.items.length ? state.items.reduce((sum, i) => sum + i.age, 0) / state.items.length : 0,
    maxAge: state.items.length ? Math.max(...state.items.map(i => i.age)) : 0,
    sources
  };
}

function analyzeHeuristicScores(service, sampleSize = 100) {
  // This would require tracking recent heuristic scores
  // For now, provide a placeholder
  console.log('📈 HEURISTIC SCORE ANALYSIS:');
  console.log('   (Requires score history tracking - implement in service.js)');
  console.log('   Recommended metrics:');
  console.log('   - Average score: baseline vs current');
  console.log('   - Score distribution: detect rightward shift');
  console.log('   - Watchlist match rate: % of evaluated events matching');
  console.log();
}

function analyzeMatchRates(service) {
  // This would require tracking match statistics
  console.log('🎯 MATCH RATE ANALYSIS:');
  console.log('   (Requires match counter tracking - implement in service.js)');
  console.log('   Recommended metrics:');
  console.log('   - Total evaluated events');
  console.log('   - Total watchlist hits');
  console.log('   - Match rate: hits / evaluated');
  console.log('   - Alert if >20% sustained');
  console.log();
}

function generateRecommendations(healthData) {
  console.log('💡 RECOMMENDATIONS:\n');
  
  if (!healthData) {
    console.log('   • Enable watchlist monitoring');
    return;
  }
  
  const recommendations = [];
  
  if (healthData.active > 20) {
    recommendations.push('⚠️  High watchlist count - verify expiry is working');
  }
  
  if (healthData.maxAge > 23) {
    recommendations.push('ℹ️  Items approaching expiry - normal churn expected');
  }
  
  if (healthData.active === 0) {
    recommendations.push('ℹ️  Empty watchlist - may indicate no recent digests or all expired');
  }
  
  if (healthData.active > 0 && healthData.active < 20 && healthData.maxAge < 20) {
    recommendations.push('✅ Watchlist health looks good');
  }
  
  recommendations.push('📊 Implement match rate tracking for deeper analysis');
  recommendations.push('📊 Implement score history tracking to detect inflation');
  recommendations.push('🔍 Weekly manual review: sample 20 watchlist hits for quality');
  
  recommendations.forEach(rec => console.log(`   ${rec}`));
  console.log();
}

function printAlertThresholds() {
  console.log('🚨 ALERT THRESHOLDS:\n');
  console.log('   Match Rate:');
  console.log('   - >20% sustained over 24h → Feedback loop suspected');
  console.log('   - <5% sustained → Low impact, consider tuning\n');
  
  console.log('   Score Inflation:');
  console.log('   - Baseline avg: 1.8 ± 0.4');
  console.log('   - Alert: >+0.3 increase sustained over 7 days\n');
  
  console.log('   Watchlist Accumulation:');
  console.log('   - >20 active items → Possible expiry failure');
  console.log('   - Items >24h old → Expiry logic broken\n');
  
  console.log('   Validation Rate:');
  console.log('   - <40% of predictions materialize → Low-signal predictions\n');
  
  console.log();
}

// Export for use in monitoring scripts
module.exports = {
  analyzeWatchlistHealth,
  analyzeHeuristicScores,
  analyzeMatchRates,
  generateRecommendations,
  printAlertThresholds
};

// CLI usage
if (require.main === module) {
  console.log('WATCHLIST MONITORING DASHBOARD');
  console.log('==============================\n');
  console.log('⚠️  Note: This is a standalone monitoring tool.');
  console.log('To use with a live service instance, integrate into your startup script.\n');
  
  console.log('Example integration:');
  console.log('```javascript');
  console.log('const { analyzeWatchlistHealth } = require("./watchlist-monitor");');
  console.log('setInterval(() => {');
  console.log('  analyzeWatchlistHealth(nostrService);');
  console.log('}, 60 * 60 * 1000); // Every hour');
  console.log('```\n');
  
  printAlertThresholds();
  
  console.log('For testing, run: node test-watchlist.js');
}
