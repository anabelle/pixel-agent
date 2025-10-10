// Quick verification that scheduled flag propagates correctly
const { buildPostPrompt } = require('./lib/text');

console.log('=== Testing buildPostPrompt with scheduled flag ===\n');

// Test 1: Scheduled post with context
console.log('Test 1: Scheduled post WITH context');
const scheduledPrompt = buildPostPrompt(
  { name: 'TestBot', system: 'A helpful bot' },
  { emergingStories: [{ topic: 'AI', mentions: 42, users: 12, sentiment: { positive: 0.8 } }] },
  null,
  { isScheduled: true }
);
const hasScheduledMode = scheduledPrompt.includes('Scheduled mode:');
const hasAwarenessMandate = scheduledPrompt.includes('Awareness mandate:');
const has140to320 = scheduledPrompt.includes('140–320 chars');
console.log(`✓ Contains "Scheduled mode": ${hasScheduledMode}`);
console.log(`✓ Contains "Awareness mandate": ${hasAwarenessMandate}`);
console.log(`✓ Allows 140-320 chars: ${has140to320}`);
console.log(`${hasScheduledMode && hasAwarenessMandate && has140to320 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: Non-scheduled post
console.log('Test 2: Non-scheduled post (legacy behavior)');
const normalPrompt = buildPostPrompt(
  { name: 'TestBot', system: 'A helpful bot' },
  { emergingStories: [{ topic: 'AI', mentions: 42, users: 12, sentiment: { positive: 0.8 } }] },
  null,
  null  // No options
);
const noScheduledMode = !normalPrompt.includes('Scheduled mode:');
const noAwarenessMandate = !normalPrompt.includes('Awareness mandate:');
const has120to280 = normalPrompt.includes('120–280 chars');
console.log(`✓ Does NOT contain "Scheduled mode": ${noScheduledMode}`);
console.log(`✓ Does NOT contain "Awareness mandate": ${noAwarenessMandate}`);
console.log(`✓ Uses 120-280 chars: ${has120to280}`);
console.log(`${noScheduledMode && noAwarenessMandate && has120to280 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 3: Backward compatibility - no options parameter
console.log('Test 3: Backward compatibility (3 params, no options)');
const backCompatPrompt = buildPostPrompt(
  { name: 'TestBot' },
  null,
  null
);
const works = backCompatPrompt.includes('TestBot') && backCompatPrompt.includes('Constraints:');
console.log(`✓ Works without options param: ${works}`);
console.log(`${works ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 4: Scheduled hint in context section
console.log('Test 4: Scheduled hint in context section');
const contextWithHint = buildPostPrompt(
  { name: 'TestBot' },
  { emergingStories: [{ topic: 'test', mentions: 5, users: 3, sentiment: {} }] },
  null,
  { isScheduled: true }
);
const hasScheduledHint = contextWithHint.includes('When this is a scheduled post');
console.log(`✓ Context section has scheduled hint: ${hasScheduledHint}`);
console.log(`${hasScheduledHint ? '✅ PASS' : '❌ FAIL'}\n`);

console.log('=== All tests completed ===');
