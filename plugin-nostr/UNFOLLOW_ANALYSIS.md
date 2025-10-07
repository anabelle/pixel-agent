# Unfollow Feature Analysis

## Question: Will Anyone Actually Get Unfollowed?

**Short Answer:** YES, but it will take time and the system is conservative by design.

## How It Works (Complete Flow)

### 1. Quality Tracking (Real-time)

**Trigger:** Home feed subscription receives events
```javascript
// Line 2720: Real-time event processing
this.pool.subscribeMany(relays, [{ kinds: [1], authors, limit: 20 }], {
  onevent: (evt) => {
    this.handleHomeFeedEvent(evt).catch(...);
  }
});
```

**Processing:** Each event updates user quality scores
```javascript
// Line 2978-2989: handleHomeFeedEvent
async handleHomeFeedEvent(evt) {
  if (evt.pubkey && evt.content) {
    this._updateUserQualityScore(evt.pubkey, evt);  // ✅ NOW IMPLEMENTED
  }
}

// Line 2991-3013: _updateUserQualityScore
_updateUserQualityScore(pubkey, evt) {
  // 1. Increment post count
  this.userPostCounts.set(pubkey, currentCount + 1);
  
  // 2. Evaluate quality (checks 11+ spam patterns, word count, variety, etc.)
  const isQuality = this._isQualityContent(evt, 'general', strictness);
  
  // 3. Update rolling average (30% new, 70% historical)
  const qualityValue = isQuality ? 1.0 : 0.0;
  const newScore = 0.3 * qualityValue + 0.7 * currentScore;
  this.userQualityScores.set(pubkey, newScore);
}
```

### 2. Periodic Unfollow Checks

**Trigger:** After each home feed processing cycle
```javascript
// Line 2837: Called after processing home feed
await this._checkForUnfollowCandidates();
```

**Schedule:** Home feed processes every `homeFeedMinSec` to `homeFeedMaxSec` seconds
- Default: Every ~2-5 minutes (home feed check)
- Unfollow check: Only runs every 12 hours (configurable)

**Logic:** 
```javascript
// Line 3078-3137: Unfollow check logic
async _checkForUnfollowCandidates() {
  // Only check every 12 hours
  if (now - this.lastUnfollowCheck < 12 * 60 * 60 * 1000) return;
  
  // Find candidates: postCount >= 10 AND qualityScore < 0.2
  for (const pubkey of contacts) {
    const postCount = this.userPostCounts.get(pubkey) || 0;
    const qualityScore = this.userQualityScores.get(pubkey) || 0;
    
    if (postCount >= 10 && qualityScore < 0.2) {
      candidates.push({ pubkey, postCount, qualityScore });
    }
  }
  
  // Unfollow worst 5 accounts (sorted by quality score)
  const toUnfollow = candidates.slice(0, 5);
}
```

## Configuration

### Default Settings (Line 255-262)
```javascript
this.unfollowEnabled = true;
this.unfollowMinQualityScore = 0.2;        // Must be below 20% quality
this.unfollowMinPostsThreshold = 10;       // Need at least 10 posts to evaluate
this.unfollowCheckIntervalHours = 12;      // Check every 12 hours
```

### Environment Variables
```env
NOSTR_UNFOLLOW_ENABLE=true                 # Enable/disable feature
NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.2       # Minimum quality threshold
NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD=10      # Minimum posts before evaluation
NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS=12     # Hours between checks
```

## Will It Actually Unfollow? Analysis

### ✅ YES - The System is Working

**Evidence:**
1. ✅ Quality tracking is implemented and called real-time from home feed
2. ✅ Unfollow check is scheduled and runs periodically
3. ✅ Data structures are initialized and persisted
4. ✅ Conservative thresholds prevent false positives

### Timeline to First Unfollow

**Scenario:** Following a spam account

1. **Hours 0-12:** 
   - Bot posts 20 low-quality messages ("gm", "follow back", etc.)
   - Quality score drops: 0.5 → 0.35 → 0.245 → 0.172 (below 0.2 threshold)
   - Post count: 20 (exceeds 10 threshold)

2. **Hour 12:**
   - First unfollow check runs
   - Bot identified as candidate (score: 0.172, posts: 20)
   - **Bot gets unfollowed**

**Realistic Timeline:** 12-24 hours for obvious spam accounts

### Quality Score Dynamics

**Exponential Moving Average (α = 0.3):**
```
New Score = 0.3 × (quality) + 0.7 × (old score)
```

**Example: Spam Account Decline**
- Start: 0.5 (neutral)
- After spam post 1: 0.3×0 + 0.7×0.5 = 0.35
- After spam post 2: 0.3×0 + 0.7×0.35 = 0.245
- After spam post 3: 0.3×0 + 0.7×0.245 = 0.172 ✅ Below 0.2
- After spam post 10: ~0.028 (nearly zero)

**Example: Quality Account Recovery**
- Current: 0.15 (low)
- After quality post: 0.3×1 + 0.7×0.15 = 0.405 ✅ Above 0.2
- Account saved from unfollow

## What Gets Unfollowed?

### High-Risk Accounts (Will Be Unfollowed)

1. **Spam Bots**
   - "gm" only posts
   - "Follow me" messages
   - Crypto giveaways
   - Excessive emoji/symbols

2. **Low-Effort Posters**
   - Very short posts (<5 chars)
   - No word variety
   - Repetitive content

3. **Promotional Accounts**
   - "Buy my NFT" spam
   - "Click here" links
   - Telegram/Discord shills

### Protected Accounts (Won't Be Unfollowed)

1. **Quality Posters**
   - Thoughtful content
   - Relevant topics (art, bitcoin, nostr, tech)
   - Good engagement

2. **New Follows**
   - Need 10+ posts before evaluation
   - Start at neutral 0.5 score

3. **Occasional Low Quality**
   - Rolling average protects against isolated bad posts
   - Need consistent low quality to trigger

## Safety Features

### 1. Conservative Thresholds
- Need **10+ posts** before considering
- Quality score < **0.2** (consistently bad)
- Only unfollow **5 accounts per check** (max)

### 2. Gradual Implementation
- Checks every **12 hours** (not continuous)
- 1-2 second delays between unfollows
- Sorts by worst quality first

### 3. Data Persistence
- Quality scores survive restarts
- Post counts tracked per user
- No sudden mass unfollows

### 4. Logging
```javascript
logger.info(`[NOSTR] Unfollowed ${pubkey.slice(0,8)} 
  (quality: ${qualityScore.toFixed(3)}, posts: ${postCount})`);
```

## Monitoring Unfollow Activity

### Check Logs For:
```
[NOSTR] Found X unfollow candidates, processing Y
[NOSTR] Unfollowed abc12345 (quality: 0.123, posts: 15)
[NOSTR] No unfollow candidates found
```

### Debug Quality Tracking:
```javascript
// Check current quality scores
console.log(service.userQualityScores);
console.log(service.userPostCounts);
```

### Test Locally:
```bash
cd plugin-nostr
node test-local.js
```

## Potential Issues

### 1. ❌ Not Enough Data Collection
**Problem:** If home feed isn't active, no quality data is collected
**Solution:** Ensure `NOSTR_HOME_FEED_ENABLE=true`

### 2. ❌ Too Conservative
**Problem:** Thresholds might be too strict (0.2 is very low)
**Solution:** Adjust `NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.3` for more aggressive unfollowing

### 3. ❌ False Positives
**Problem:** Art/creative posts might be scored as low quality
**Solution:** Quality check includes art-specific keywords and patterns

## Recommendations

### For Active Unfollowing:
```env
NOSTR_UNFOLLOW_ENABLE=true
NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.25      # Slightly higher threshold
NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD=5       # Faster evaluation
NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS=6      # More frequent checks
```

### For Conservative Unfollowing (Current):
```env
NOSTR_UNFOLLOW_ENABLE=true
NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.2       # Very low threshold
NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD=10      # Need more data
NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS=12     # Twice daily
```

### For Testing:
```env
NOSTR_UNFOLLOW_ENABLE=true
NOSTR_UNFOLLOW_MIN_QUALITY_SCORE=0.4       # Higher threshold for testing
NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD=3       # Quick evaluation
NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS=1      # Hourly checks
```

## Conclusion

**YES, people WILL get unfollowed**, but:

1. **It takes time:** 12-24 hours minimum for data collection
2. **It's selective:** Only the worst offenders (quality < 0.2)
3. **It's gradual:** Max 5 unfollows every 12 hours
4. **It's fair:** Rolling average prevents false positives

The system is designed to be **conservative and safe**, prioritizing avoiding false positives over aggressive unfollowing. This is intentional to maintain good relationships in the Nostr community while still filtering out obvious spam and low-quality accounts.

## Date
2025-10-07
