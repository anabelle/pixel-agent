const { describe, it, expect } = globalThis;
const { pickReplyTextFor } = require('../lib/replyText.js');

describe('replyText heuristic', () => {
  it('returns short ack for empty', () => {
    const t = pickReplyTextFor({ content: '' });
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(0);
  });
  it('prefers yo for very short content', () => {
    const t = pickReplyTextFor({ content: 'hi' });
    expect(t).toBe('yo.');
  });
  it('uses hmm for questions', () => {
    const t = pickReplyTextFor({ content: 'are you there?' });
    expect(t).toBe('hmm.');
  });
})
