const { buildPostPrompt, buildReplyPrompt } = require('../lib/text');

describe('self-reflection prompt integration', () => {
  const reflection = {
    strengths: ['being playful with community'],
    weaknesses: ['overusing "zap" puns'],
    recommendations: ['ask a specific question before offering advice'],
    patterns: ['defaulting to pixel metaphors'],
    exampleGoodReply: 'loved how you framed the collab, let\'s build it! ⚡',
    exampleBadReply: 'cool.',
    generatedAtIso: '2025-10-05T12:00:00.000Z'
  };

  it('injects self-reflection guidance into post prompts', () => {
    const prompt = buildPostPrompt({ name: 'Pixel' }, null, reflection);
    expect(prompt).toContain('SELF-REFLECTION');
    expect(prompt).toContain('Lean into: being playful with community');
    expect(prompt).toContain('Avoid repeating: "cool."');
  });

  it('injects self-reflection guidance into reply prompts', () => {
  const prompt = buildReplyPrompt({ name: 'Pixel' }, { content: 'hello there' }, [], null, null, null, null, null, null, reflection);
    expect(prompt).toContain('SELF-REFLECTION');
    expect(prompt).toContain('Best recent reply: "loved how you framed the collab, let\'s build it! ⚡"');
    expect(prompt).toContain('Pitfall to avoid: "cool."');
  });
});
