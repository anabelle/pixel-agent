# Evolution-Aware LLM Prompts

## Overview

The timeline lore system now uses evolution-aware prompts that focus on narrative progression and storyline advancement rather than static topic summaries. This enhancement builds upon the historical context feature to ensure generated insights identify genuine developments versus repetitive content.

## Problem Solved

**Before**: Prompts asked "Summarize what these posts discuss" without guidance about narrative evolution, storyline progression, or what makes content noteworthy vs repetitive.

**After**: Prompts are evolution-aware, context-rich, and focused on identifying genuine developments, contradictions, emergent themes, and concrete milestones.

## Key Improvements

### 1. Recent Narrative Context

Both screening and digest generation now include recent narrative context:

```javascript
RECENT NARRATIVE CONTEXT:
- Bitcoin price reaches new highs [bitcoin, price, trading] (high)
- Lightning network adoption accelerates [lightning, adoption, growth] (medium)
```

This helps the LLM understand what has already been covered and avoid repetition.

### 2. Evolution-Focused Instructions

Prompts now explicitly prioritize narrative progression:

**PRIORITIZE:**
- ✅ New developments in ongoing storylines
- ✅ Unexpected turns or contradictions to previous themes
- ✅ Concrete events, decisions, or announcements
- ✅ Community shifts in sentiment or focus
- ✅ Technical breakthroughs or setbacks
- ✅ Emerging debates or new participants

**DEPRIORITIZE:**
- ❌ Rehashing well-covered topics without new angles
- ❌ Generic statements about bitcoin/nostr/freedom
- ❌ Repetitive price speculation or technical explanations
- ❌ Routine community interactions without significance

### 3. Evolution Metadata

The system now captures rich metadata about narrative evolution:

#### Screening Metadata (`_screenTimelineLoreWithLLM`)

```javascript
{
  "accept": true|false,
  "evolutionType": "progression"|"contradiction"|"emergence"|"milestone"|null,
  "summary": "What specifically DEVELOPED or CHANGED",
  "rationale": "Why this advances the narrative",
  "noveltyScore": 0.0-1.0,
  "tags": ["specific-development", "not-generic-topics"],
  "priority": "high"|"medium"|"low",
  "signals": ["signal"]
}
```

**Evolution Types:**
- `progression`: Content advances an ongoing storyline
- `contradiction`: Content challenges previous consensus
- `emergence`: New initiative or theme emerges
- `milestone`: Concrete achievement or marker reached
- `null`: Content doesn't advance narratives

**Novelty Score:**
- `0.0-0.3`: Low novelty (mostly repetitive)
- `0.4-0.6`: Moderate novelty (some new angles)
- `0.7-1.0`: High novelty (genuinely new information)

#### Digest Metadata (`_generateTimelineLoreSummary`)

```javascript
{
  "headline": "What PROGRESSED or EMERGED (not 'X was discussed')",
  "narrative": "Focus on CHANGE, EVOLUTION, or NEW DEVELOPMENTS",
  "insights": ["Patterns showing MOVEMENT in community thinking"],
  "watchlist": ["Concrete developments to track (not generic topics)"],
  "tags": ["specific-development"],
  "priority": "high"|"medium"|"low",
  "tone": "emotional tenor",
  "evolutionSignal": "How this relates to ongoing storylines"
}
```

## Implementation

### Files Modified

1. **`plugin-nostr/lib/service.js`**
   - Updated `_screenTimelineLoreWithLLM()` with evolution-aware screening prompt
   - Updated `_generateTimelineLoreSummary()` with narrative progression focus
   - Modified `_normalizeTimelineLoreDigest()` to handle `evolutionSignal` field
   - Increased token limits to accommodate richer prompts (280→320, 420→480)

### Prompt Structure

#### Screening Prompt (`_screenTimelineLoreWithLLM`)

```javascript
async _screenTimelineLoreWithLLM(content, heuristics) {
  // Get recent narrative context
  const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(3) || [];
  
  const contextSection = recentContext.length ? 
    `RECENT NARRATIVE CONTEXT:\n${recentContext.map(c => 
      `- ${c.headline} [${c.tags.join(', ')}] (${c.priority})`
    ).join('\n')}\n\n` : '';
  
  const prompt = `${contextSection}NARRATIVE TRIAGE: This post needs evaluation...
  
CONTEXT: You track evolving Bitcoin/Nostr community narratives. Accept only posts 
that advance, contradict, or introduce new elements to ongoing storylines.

ACCEPT IF POST:
- Introduces new information/perspective on covered topics
- Shows progression in ongoing debates or developments
- Contradicts or challenges previous community consensus
- Announces concrete events, decisions, or milestones
- Reveals emerging patterns or shifts in community focus

REJECT IF POST:
- Restates well-known facts or opinions
- Generic commentary without new insights
- Routine social interactions or pleasantries

Return STRICT JSON with evolution-focused analysis...`;
}
```

#### Digest Generation Prompt (`_generateTimelineLoreSummary`)

```javascript
async _generateTimelineLoreSummary(batch) {
  // Get recent digest context
  const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(3) || [];
  
  const contextSection = recentContext.length ? 
    `RECENT NARRATIVE CONTEXT:\n${recentContext.map(c => 
      `- ${c.headline} [${c.tags.join(', ')}] (${c.priority})`
    ).join('\n')}\n\n` : '';

  const prompt = `${contextSection}ANALYSIS MISSION: You are tracking evolving 
narratives in the Nostr/Bitcoin community. Focus on DEVELOPMENT and PROGRESSION, 
not static topics.

PRIORITIZE:
✅ New developments in ongoing storylines
✅ Unexpected turns or contradictions to previous themes
✅ Concrete events, decisions, or announcements
✅ Community shifts in sentiment or focus
✅ Technical breakthroughs or setbacks
✅ Emerging debates or new participants

DEPRIORITIZE:
❌ Rehashing well-covered topics without new angles
❌ Generic statements about bitcoin/nostr/freedom
❌ Repetitive price speculation or technical explanations
❌ Routine community interactions without significance

OUTPUT REQUIREMENTS (JSON):
{
  "headline": "What PROGRESSED or EMERGED (not just 'X was discussed')",
  "narrative": "Focus on CHANGE, EVOLUTION, or NEW DEVELOPMENTS",
  "insights": ["Patterns showing MOVEMENT in community thinking"],
  "watchlist": ["Concrete developments to track"],
  "evolutionSignal": "How this relates to ongoing storylines"
}`;
}
```

## Examples

### Screening Examples

#### ❌ Rejected (Static/Repetitive)
```javascript
Content: "Bitcoin is great technology, everyone should use it"

Response:
{
  "accept": false,
  "evolutionType": null,
  "summary": "Generic endorsement of bitcoin",
  "rationale": "Restates well-known opinion without new information",
  "noveltyScore": 0.2,
  "tags": ["bitcoin", "opinion"],
  "priority": "low"
}
```

#### ✅ Accepted (Progression)
```javascript
Content: "Bitcoin Core PR #12345 merged: improved fee estimation algorithm"

Response:
{
  "accept": true,
  "evolutionType": "progression",
  "summary": "Core development advances with merged fee estimation improvement",
  "rationale": "Concrete development milestone in core development",
  "noveltyScore": 0.85,
  "tags": ["bitcoin", "core", "development", "pr-merged"],
  "priority": "high"
}
```

#### ✅ Accepted (Contradiction)
```javascript
Content: "New research challenges previous assumptions about lightning routing efficiency"

Response:
{
  "accept": true,
  "evolutionType": "contradiction",
  "summary": "Research findings contradict lightning routing assumptions",
  "rationale": "Contradicts previous consensus with research evidence",
  "noveltyScore": 0.8,
  "tags": ["lightning", "research", "routing", "efficiency"],
  "priority": "high"
}
```

#### ✅ Accepted (Emergence)
```javascript
Content: "BIP-XXX proposal for improved privacy features gains community traction"

Response:
{
  "accept": true,
  "evolutionType": "emergence",
  "summary": "New privacy BIP proposal emerges with community support",
  "rationale": "New initiative emerging in protocol development",
  "noveltyScore": 0.9,
  "tags": ["bitcoin", "bip", "privacy", "proposal"],
  "priority": "high"
}
```

#### ✅ Accepted (Milestone)
```javascript
Content: "Lightning network reaches 100,000 channels for the first time"

Response:
{
  "accept": true,
  "evolutionType": "milestone",
  "summary": "Lightning network hits 100k channel milestone",
  "rationale": "Concrete milestone in network growth trajectory",
  "noveltyScore": 0.75,
  "tags": ["lightning", "channels", "milestone", "growth"],
  "priority": "high"
}
```

### Digest Generation Examples

#### Before: Static Topic Summary
```javascript
Headline: "Bitcoin being discussed"
Narrative: "Community actively discussing bitcoin"
Insights: ["High engagement", "Active participation"]
Tags: ["bitcoin", "discussion", "community"]
```

#### After: Evolution-Focused Digest
```javascript
Headline: "Bitcoin Core development accelerates with three major PRs merged"
Narrative: "Development velocity increases with merged improvements to fee estimation, 
wallet security, and network efficiency. Community testing reveals significant 
performance gains. Core contributors signal upcoming release timeline."
Insights: [
  "Development momentum shifting from research to implementation",
  "Security enhancements prioritized over feature additions",
  "Community testing phase beginning for next major release"
]
Watchlist: ["release timeline", "testing feedback", "security audits"]
Tags: ["bitcoin", "core-development", "pr-merges", "release-prep", "testing"]
evolutionSignal: "Progresses core development storyline from planning to implementation phase"
```

## Testing

### Unit Tests

Run the comprehensive test suite:
```bash
cd plugin-nostr
npm test test/service.evolutionAwarePrompts.test.js
```

Tests cover:
- Recent context inclusion in prompts
- Evolution metadata in responses
- Default values for backward compatibility
- Distinction between static and progressive content
- All evolution types (progression, contradiction, emergence, milestone)

### Demonstration

View the before/after comparison:
```bash
cd plugin-nostr
node demo-evolution-aware-prompts.js
```

This shows:
- Original vs redesigned prompts
- Key improvements highlighted
- Example outputs with evolution metadata
- Expected impact on output quality

## Benefits

1. **Reduced Repetition**: Prompts explicitly guide LLM away from repetitive insights
2. **Better Signal Detection**: Clear prioritization of genuine developments
3. **Rich Metadata**: Evolution type and novelty score enable downstream analysis
4. **Storyline Tracking**: Evolution signals connect content to ongoing narratives
5. **Quality Metrics**: Novelty score provides quantitative measure of insight value
6. **Context-Aware**: Recent narrative context prevents redundant analysis

## Monitoring

### Quality Indicators

**Good signs:**
- Headlines describe what "progressed" or "emerged"
- Narratives focus on change and evolution
- Consecutive digests show topic progression, not repetition
- Evolution types distributed across progression/contradiction/emergence/milestone
- Novelty scores vary appropriately (0.7+ for genuinely new, <0.3 for repetitive)

**Warning signs:**
- Headlines still using "X being discussed" pattern
- Narratives describe states rather than changes
- Evolution type mostly null
- Novelty scores consistently mid-range (0.4-0.6)
- Same topics generating identical insights

### Log Patterns

Expected progression:
```
[NOSTR] Timeline lore captured (25 posts • Lightning channel count reaches 80k milestone)
[NOSTR] Timeline lore captured (30 posts • Community testing reveals routing efficiency gains)
[NOSTR] Timeline lore captured (28 posts • Major relay operators plan upgrade deployment)
```

Versus problematic repetition:
```
[NOSTR] Timeline lore captured (25 posts • Lightning network being discussed)
[NOSTR] Timeline lore captured (30 posts • Lightning network being discussed)
[NOSTR] Timeline lore captured (28 posts • Lightning network being discussed)
```

## Configuration

### Adjust Context Lookback

Modify the lookback count in both methods:

```javascript
// In _screenTimelineLoreWithLLM
const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(5) || [];

// In _generateTimelineLoreSummary  
const recentContext = this.narrativeMemory?.getRecentDigestSummaries?.(5) || [];
```

**Guidelines:**
- `lookback = 2-3`: Fast-moving topics with frequent updates
- `lookback = 3-5`: Standard configuration (recommended)
- `lookback = 5-7`: Slow-moving topics or when over-filtering occurs

### Token Limits

Current settings optimized for evolution-aware prompts:
- Screening: 320 tokens (up from 280)
- Digest generation: 480 tokens (up from 420)

Increase if LLM responses are truncated:
```javascript
// In _screenTimelineLoreWithLLM
{ maxTokens: 360, temperature: 0.3 }

// In _generateTimelineLoreSummary
{ maxTokens: 520, temperature: 0.45 }
```

## Troubleshooting

### Issue: Evolution metadata missing or always null

**Cause:** LLM not following JSON schema

**Solution:**
1. Check LLM model supports structured output
2. Verify temperature not too high (0.3 for screening, 0.45 for digest)
3. Review prompt reaches LLM (check logs)
4. Default values (null, 0.5) applied as fallback

### Issue: Novelty scores always moderate (0.4-0.6)

**Cause:** LLM uncertain or prompt lacks context

**Solution:**
1. Increase context lookback count
2. Verify recent context reaching prompt
3. Check posts have sufficient content for analysis
4. Review heuristics score input (may need adjustment)

### Issue: All content marked as "progression"

**Cause:** Evolution types not well-differentiated

**Solution:**
1. Verify prompt includes all evolution types
2. Add examples of each type to prompt
3. Review that content genuinely represents progression
4. Check for bias in candidate selection

## Related Documentation

- **Timeline Lore Context**: `TIMELINE_LORE_CONTEXT.md` - Historical context feature
- **Storyline Advancement**: `STORYLINE_ADVANCEMENT.md` - Continuity tracking
- **Narrative Memory**: `lib/narrativeMemory.js` - Storage and retrieval
- **Service Implementation**: `lib/service.js` - Core screening and generation logic

## Future Enhancements

Potential improvements:

1. **Adaptive Evolution Scoring**: Automatically adjust novelty thresholds based on topic velocity
2. **Evolution Chains**: Track how storylines evolve across multiple digests
3. **Contradiction Detection**: Use embeddings to identify genuine contradictions
4. **Emergence Prediction**: ML model to predict emerging themes before they peak
5. **Evolution Visualization**: Dashboard showing storyline progression over time
6. **Custom Evolution Types**: Allow domain-specific evolution categories
7. **Multi-Resolution Context**: Different lookback windows for different topics
