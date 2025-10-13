#!/usr/bin/env node

/**
 * Demonstration of Evolution-Aware Prompt Redesign
 * 
 * This script shows the before/after comparison of the prompts
 * to illustrate how they now prioritize narrative progression.
 */

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  Evolution-Aware Prompt Redesign Demonstration              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Mock recent context
const recentContext = [
  {
    headline: 'Bitcoin price reaches new highs',
    tags: ['bitcoin', 'price', 'trading'],
    priority: 'high'
  },
  {
    headline: 'Lightning network adoption accelerates',
    tags: ['lightning', 'adoption', 'growth'],
    priority: 'medium'
  }
];

console.log('═'.repeat(70));
console.log('SCREENING PROMPT COMPARISON (_screenTimelineLoreWithLLM)');
console.log('═'.repeat(70));

console.log('\n📋 BEFORE (Static Topic Focus):');
console.log('─'.repeat(70));
const oldScreeningPrompt = `You triage Nostr posts to decide if they belong in Pixel's "timeline lore" digest. The lore captures threads, shifts, or signals that matter to ongoing community narratives.

Consider the content and provided heuristics. ACCEPT only if the post brings:
- fresh situational awareness (news, crisis, win, decision, actionable info),
- a strong narrative beat (emotional turn, rallying cry, ongoing saga update), or
- questions/coordination that require follow-up.
Reject bland status updates, generic greetings, meme drops without context, or trivial small-talk.

Return STRICT JSON:
{
  "accept": true|false,
  "summary": "<=32 words capturing the core",
  "rationale": "<=20 words explaining the decision",
  "tags": ["topic", ... up to 4],
  "priority": "high"|"medium"|"low",
  "signals": ["signal", ... up to 4]
}`;

console.log(oldScreeningPrompt.slice(0, 500) + '...\n');

console.log('✅ NEW (Evolution-Aware):');
console.log('─'.repeat(70));

const contextSection = recentContext.length ? 
  `RECENT NARRATIVE CONTEXT:\n${recentContext.map(c => 
    `- ${c.headline} [${c.tags.join(', ')}] (${c.priority})`
  ).join('\n')}\n\n` : '';

const newScreeningPrompt = `${contextSection}NARRATIVE TRIAGE: This post needs evaluation for timeline lore inclusion.

CONTEXT: You track evolving Bitcoin/Nostr community narratives. Accept only posts that advance, contradict, or introduce new elements to ongoing storylines.

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

Return STRICT JSON with evolution-focused analysis:
{
  "accept": true|false,
  "evolutionType": "progression"|"contradiction"|"emergence"|"milestone"|null,
  "summary": "What specifically DEVELOPED or CHANGED (<=32 words)",
  "rationale": "Why this advances the narrative (<=20 words)",
  "noveltyScore": 0.0-1.0,
  "tags": ["specific-development", "not-generic-topics", ... up to 4],
  "priority": "high"|"medium"|"low",
  "signals": ["signal", ... up to 4]
}`;

console.log(newScreeningPrompt.slice(0, 800) + '...\n');

console.log('🔍 Key Improvements:');
console.log('  ✓ Includes recent narrative context to avoid repetition');
console.log('  ✓ Focus on evolution: "advance, contradict, or introduce new elements"');
console.log('  ✓ Added evolutionType field (progression/contradiction/emergence/milestone)');
console.log('  ✓ Added noveltyScore field (0.0-1.0)');
console.log('  ✓ Emphasizes "what DEVELOPED or CHANGED" vs static summaries\n');

console.log('═'.repeat(70));
console.log('DIGEST GENERATION PROMPT COMPARISON (_generateTimelineLoreSummary)');
console.log('═'.repeat(70));

console.log('\n📋 BEFORE (Generic Analysis):');
console.log('─'.repeat(70));
const oldDigestPrompt = `Analyze these NEW posts. Focus on developments NOT covered in recent summaries above.

EXTRACT:
✅ Specific people, places, events, projects, concrete developments
❌ Generic terms: bitcoin, nostr, crypto, blockchain, technology, community, discussion

OUTPUT JSON:
{
  "headline": "<=18 words about what posts discuss",
  "narrative": "3-5 sentences describing posts content",
  "insights": ["pattern from posts", "another pattern", "max 3"],
  "watchlist": ["trackable item from posts", "another", "max 3"],
  "tags": ["concrete topic", "another", "max 5"],
  "priority": "high"|"medium"|"low",
  "tone": "emotional tenor"
}`;

console.log(oldDigestPrompt.slice(0, 500) + '...\n');

console.log('✅ NEW (Evolution-Focused):');
console.log('─'.repeat(70));
const newDigestPrompt = `${contextSection}ANALYSIS MISSION: You are tracking evolving narratives in the Nostr/Bitcoin community. Focus on DEVELOPMENT and PROGRESSION, not static topics.

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
  "headline": "What PROGRESSED or EMERGED (<=18 words, not just 'X was discussed')",
  "narrative": "Focus on CHANGE, EVOLUTION, or NEW DEVELOPMENTS (3-5 sentences)",
  "insights": ["Patterns showing MOVEMENT in community thinking/focus", "max 3"],
  "watchlist": ["Concrete developments to track (not generic topics)", "max 3"],
  "tags": ["specific-development", "another", "max 5"],
  "priority": "high"|"medium"|"low",
  "tone": "emotional tenor",
  "evolutionSignal": "How this relates to ongoing storylines"
}`;

console.log(newDigestPrompt.slice(0, 900) + '...\n');

console.log('🔍 Key Improvements:');
console.log('  ✓ Clear mission: "tracking evolving narratives"');
console.log('  ✓ Explicit PRIORITIZE section for developments, changes, progressions');
console.log('  ✓ Explicit DEPRIORITIZE section for repetitive content');
console.log('  ✓ Headlines must describe what PROGRESSED or EMERGED');
console.log('  ✓ Narrative focuses on CHANGE, EVOLUTION, or NEW DEVELOPMENTS');
console.log('  ✓ Insights show MOVEMENT in community thinking');
console.log('  ✓ Added evolutionSignal field to track storyline relationships\n');

console.log('═'.repeat(70));
console.log('EXPECTED IMPACT ON OUTPUT QUALITY');
console.log('═'.repeat(70));

console.log('\n📊 Reduction in Repetitive Insights:');
console.log('  BEFORE: "Bitcoin being discussed" (3 consecutive digests)');
console.log('  AFTER:  Different angles or genuine developments only\n');

console.log('📈 Enhanced Narrative Tracking:');
console.log('  • evolutionType identifies: progression, contradiction, emergence, milestone');
console.log('  • noveltyScore quantifies how new the information is (0.0-1.0)');
console.log('  • evolutionSignal connects to ongoing storylines\n');

console.log('🎯 Better Signal Detection:');
console.log('  • Concrete events, decisions, announcements prioritized');
console.log('  • Generic statements about bitcoin/nostr deprioritized');
console.log('  • Community sentiment shifts highlighted');
console.log('  • Technical breakthroughs and setbacks emphasized\n');

console.log('═'.repeat(70));
console.log('EXAMPLES OF IMPROVED OUTPUT');
console.log('═'.repeat(70));

console.log('\n❌ REJECTED (Static/Repetitive):');
console.log('  Content: "Bitcoin is great technology, everyone should use it"');
console.log('  Analysis:');
console.log('    evolutionType: null');
console.log('    noveltyScore: 0.2');
console.log('    rationale: "Restates well-known opinion without new information"\n');

console.log('✅ ACCEPTED (Progression):');
console.log('  Content: "Bitcoin Core PR #12345 merged: improved fee estimation"');
console.log('  Analysis:');
console.log('    evolutionType: "progression"');
console.log('    noveltyScore: 0.85');
console.log('    rationale: "Concrete development milestone in core development"\n');

console.log('✅ ACCEPTED (Contradiction):');
console.log('  Content: "New research challenges previous assumptions about lightning routing"');
console.log('  Analysis:');
console.log('    evolutionType: "contradiction"');
console.log('    noveltyScore: 0.8');
console.log('    rationale: "Contradicts previous consensus with research findings"\n');

console.log('✅ ACCEPTED (Emergence):');
console.log('  Content: "BIP-XXX proposal for improved privacy gains traction"');
console.log('  Analysis:');
console.log('    evolutionType: "emergence"');
console.log('    noveltyScore: 0.9');
console.log('    rationale: "New initiative emerging in protocol development"\n');

console.log('✅ ACCEPTED (Milestone):');
console.log('  Content: "Lightning network reaches 100,000 channels for first time"');
console.log('  Analysis:');
console.log('    evolutionType: "milestone"');
console.log('    noveltyScore: 0.75');
console.log('    rationale: "Concrete milestone in network growth trajectory"\n');

console.log('═'.repeat(70));
console.log('✅ EVOLUTION-AWARE PROMPT REDESIGN COMPLETE');
console.log('═'.repeat(70));
console.log('\nSummary:');
console.log('  • Both screening and digest prompts redesigned');
console.log('  • Context-rich: includes recent narrative history');
console.log('  • Evolution-focused: prioritizes progression over static topics');
console.log('  • Metadata-enhanced: evolutionType, noveltyScore, evolutionSignal');
console.log('  • Quality-driven: explicit guidance on what to accept/reject\n');
