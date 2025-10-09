# Phase 4: Watchlist Monitoring - Quick Reference

## 🎯 What It Does

Tracks predicted topics from lore digests and boosts matching content for 24 hours in **two systems**:
1. **Timeline Lore Capture** - Boosts heuristic scores (+0.2 to +0.5)
2. **Discovery Search** - Boosts engagement scores (+0.12 to +0.3)

**Example Flow:**
1. Digest predicts: `["privacy tools", "wallet security"]`
2. System tracks these for 24h
3. **Timeline**: New post mentions "privacy tools" → heuristic score +0.2
4. **Discovery**: Search finds account posting about "wallet security" → engagement score +0.18
5. Post more likely to enter next digest, account more likely to get reply/follow
6. Items auto-expire after 24h

---

## 🔍 Monitoring Commands

### Check Active Watchlist
```javascript
const state = nostrService.getWatchlistState();
console.log(`Active items: ${state.active}`);
state.items.forEach(item => {
  console.log(`${item.item} (${item.age}h old, expires ${item.expiresIn}h)`);
});
```

### Test Watchlist Functionality
```bash
cd plugin-nostr
node test-watchlist.js
```

### Run Health Dashboard
```javascript
const { analyzeWatchlistHealth } = require('./watchlist-monitor');
analyzeWatchlistHealth(nostrService);
```

---

## 📊 Key Metrics to Track

### 1. Match Rate
**What:** % of evaluated events matching active watchlist  
**Target:** 5-15%  
**Alert:** >20% sustained (feedback loop suspected)

**How to track:** Add counter in `_evaluateTimelineLoreCandidate`:
```javascript
this.watchlistMatchCount = (this.watchlistMatchCount || 0) + 1;
this.totalEvaluatedCount = (this.totalEvaluatedCount || 0) + 1;
```

### 2. Score Inflation
**What:** Average heuristic score over time  
**Baseline:** 1.8 ± 0.4  
**Alert:** >+0.3 increase sustained over 7 days

**How to track:** Log scores to time-series database, calculate rolling average

### 3. Validation Rate
**What:** % of watchlist predictions that materialize  
**Target:** >40%  
**Method:** Manual review of matched items weekly

### 4. Watchlist Size
**What:** Number of active tracked items  
**Normal:** 3-15  
**Alert:** >20 (accumulation, possible expiry failure)

### 5. Discovery Match Rate (NEW)
**What:** % of discovery-scored events matching active watchlist  
**Target:** 5-15% (coherent with timeline lore matches)  
**Alert:** >25% (discovery bias toward watchlist)

### 6. Discovery Engagement Quality (NEW)
**What:** Reply success rate for watchlist-boosted discoveries  
**Target:** >50% (validates predictions identify interesting content)  
**Method:** Track replied events, compare watchlist-boosted vs non-boosted

---

## 🚨 Alert Conditions

### Critical (Immediate Action)
- ❌ Items >24h old (expiry broken)
- ❌ Match rate >30% sustained >6h (strong feedback loop)
- ❌ Average score increase >0.5 over 3 days (severe inflation)

### Warning (Monitor Closely)
- ⚠️ Match rate >20% sustained >24h
- ⚠️ Watchlist size >20 items
- ⚠️ Score increase >0.3 over 7 days
- ⚠️ Validation rate <30% (low-signal predictions)

### Info (Normal Operations)
- ℹ️ Match rate 5-15%
- ℹ️ Watchlist size 3-15 items
- ℹ️ Items approaching expiry (>20h old)

---

## 🔧 Troubleshooting

### Problem: No matches ever detected
**Causes:**
- No lore digests generated yet (watchlist empty)
- LLM not generating watchlist items in digests
- Content matching too strict

**Debug:**
```javascript
// Check if watchlist is populated
const state = nostrService.getWatchlistState();
console.log('Active watchlist:', state.active);

// Check digest structure
const lore = narrativeMemory.getTimelineLore(1);
console.log('Latest digest watchlist:', lore[0]?.watchlist);
```

**Fix:**
- Wait for first digest (requires 50 events)
- Verify digest prompt includes watchlist generation
- Review match logic in `checkWatchlistMatch()`

---

### Problem: Match rate >20% (feedback loop)
**Causes:**
- Boost too high (>0.5)
- No expiry (items accumulating)
- LLM predicting generic topics that always match

**Debug:**
```javascript
// Check boost values in logs
// Look for: [WATCHLIST-HIT] ... (+X.XX)
// Should never exceed +0.50

// Check item ages
const state = nostrService.getWatchlistState();
const oldItems = state.items.filter(i => i.age > 24);
console.log('Expired items still active:', oldItems.length);
```

**Fix:**
- Verify boost cap: `Math.min(0.5, 0.2 * matches.length)`
- Verify expiry: `watchlistExpiryMs = 24 * 60 * 60 * 1000`
- Manual prune: `narrativeMemory._pruneExpiredWatchlist()`
- Temporarily disable: comment out boost in `_evaluateTimelineLoreCandidate`

---

### Problem: Score inflation detected
**Causes:**
- Watchlist boost amplifying over time
- Matched items generating digests with same predictions
- Stale watchlist not expiring

**Debug:**
```javascript
// Calculate average scores
const scores = recentCandidates.map(c => c.score);
const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
console.log('Average score:', avg.toFixed(2), '(baseline: 1.8)');

// Check for repeated watchlist items
const state = nostrService.getWatchlistState();
const repeated = state.items.filter(i => i.age > 12);
console.log('Items >12h old:', repeated.length);
```

**Fix:**
- Reduce boost: lower `0.2 * matches.length` to `0.15 * matches.length`
- Force expiry: `narrativeMemory.watchlistExpiryMs = 12 * 60 * 60 * 1000` (12h)
- Clear watchlist: `narrativeMemory.activeWatchlist.clear()`

---

### Problem: Validation rate <40%
**Causes:**
- LLM generating low-quality predictions
- Matching logic too strict (missing true positives)
- Time window too narrow (predictions take >24h)

**Debug:**
```javascript
// Sample recent matches
// Manual review: did the matched content truly relate to predicted topic?

// Check match sensitivity
const testMatch = narrativeMemory.checkWatchlistMatch(
  'content with wallet security discussion',
  ['wallet', 'security']
);
// Should match "wallet security" watchlist item
```

**Fix:**
- Improve digest prompt: add examples of good predictions
- Relax matching: consider stemming (wallet→wallets)
- Extend expiry: `watchlistExpiryMs = 48 * 60 * 60 * 1000` (48h)

---

## 📝 Log Patterns to Monitor

### Normal Operations
```
[WATCHLIST] Added 4 items: privacy tools, wallet security, zap splits, self-custody
[WATCHLIST-HIT] a1b2c3d4 matched: privacy tools (+0.20)
[WATCHLIST] Pruned 2 expired items
```

### Warning Signs
```
[WATCHLIST-HIT] e5f6g7h8 matched: bitcoin, lightning, nostr (+0.50)
# ^^ Multiple generic matches = low-quality predictions

[WATCHLIST-DISCOVERY] ... matched: bitcoin, lightning (+0.30)
[WATCHLIST-DISCOVERY] ... matched: bitcoin, lightning (+0.30)
# ^^ High discovery match frequency = possible bias

[WATCHLIST] Added 12 items: ...
# ^^ Very large watchlist = prompt generating too many predictions

[WATCHLIST-HIT] ... (+0.50)
[WATCHLIST-HIT] ... (+0.50)
[WATCHLIST-HIT] ... (+0.50)
# ^^ High match frequency = possible feedback loop
```

### Critical Issues
```
[WATCHLIST] Active watchlist has 35 items
# ^^ Expiry not working

[WATCHLIST-HIT] ... (+0.85)
# ^^ Boost exceeds cap!
```

---

## 🧪 Manual Testing

### Test 1: Basic Flow
```javascript
// 1. Add items
narrativeMemory.addWatchlistItems(['test-topic'], 'manual', 'test-1');

// 2. Check state
const state = narrativeMemory.getWatchlistState();
console.assert(state.active === 1, 'Should have 1 active item');

// 3. Test match
const match = narrativeMemory.checkWatchlistMatch('content with test-topic', []);
console.assert(match !== null, 'Should match');
console.assert(match.boostScore <= 0.5, 'Should be capped');

// 4. Wait for expiry (or simulate)
narrativeMemory.watchlistExpiryMs = 100; // 100ms
setTimeout(() => {
  narrativeMemory._pruneExpiredWatchlist();
  const state2 = narrativeMemory.getWatchlistState();
  console.assert(state2.active === 0, 'Should be expired');
}, 200);
```

### Test 2: Boost Capping
```javascript
// Add many items
narrativeMemory.addWatchlistItems(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  'test',
  'test-cap'
);

// Match all
const match = narrativeMemory.checkWatchlistMatch(
  'a b c d e f g',
  []
);

console.log('Matches:', match.matches.length); // 7
console.log('Boost:', match.boostScore); // Should be 0.50 (capped)
console.assert(match.boostScore === 0.5, 'Should be capped at 0.5');
```

---

## 🔄 Rollback Plan

### Temporary Disable (No Code Changes)
```javascript
// In service startup or runtime console:
nostrService.narrativeMemory.activeWatchlist.clear();
nostrService.narrativeMemory.addWatchlistItems = () => [];
```

### Permanent Disable
```javascript
// In _evaluateTimelineLoreCandidate(), comment out:
/*
let watchlistMatch = null;
try {
  if (this.narrativeMemory?.checkWatchlistMatch) {
    watchlistMatch = this.narrativeMemory.checkWatchlistMatch(normalizedContent, topics);
    if (watchlistMatch) {
      score += watchlistMatch.boostScore;
      // ... logging
    }
  }
} catch (err) { ... }
*/
```

### Full Revert
```bash
git revert <commit-hash-for-phase-4>
# or
git checkout main -- plugin-nostr/lib/narrativeMemory.js plugin-nostr/lib/service.js
```

---

## 📈 Success Indicators

After 7 days, you should see:
- ✅ Match rate stabilized at 8-12%
- ✅ Validation rate >40% (manually reviewed)
- ✅ No score inflation (avg score within ±0.2 of baseline)
- ✅ Watchlist churn (items expire, new ones added)
- ✅ Lore continuity improvements (see Phase 2 metrics)

---

## 🤝 Integration with Existing Metrics

### Continuity Detection Rate (Phase 2)
- **Expected impact:** +5-10% increase
- **Why:** Watchlist matches strengthen recurring theme detection

### Digest Latency (Phase 3)
- **Expected impact:** Minimal (<2min variance)
- **Why:** Watchlist matching adds <1ms per evaluation

### Priority Weighting (Phase 1)
- **Synergy:** Watchlist matches can push medium→high priority
- **Monitor:** Are boosted items appropriately prioritized?

---

## 📞 Support

**Issues?** Check `LORE_CONTINUITY_IMPROVEMENTS.md` for full context

**Questions?** Review Phase 4 design in the main documentation

**Bugs?** File with:
- Watchlist state snapshot (`getWatchlistState()`)
- Recent match logs (`grep WATCHLIST-HIT`)
- Score distribution data
- Timeline of events leading to issue
