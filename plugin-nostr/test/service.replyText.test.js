const { describe, it, expect } = globalThis;
const { pickReplyTextFor } = require('../lib/replyText.js');

describe('replyText heuristic', () => {
  it('throws error for empty content to trigger retry', () => {
    expect(() => pickReplyTextFor({ content: '' })).toThrow('LLM generation failed, retry needed');
  });
  it('throws error for very short content to trigger retry', () => {
    expect(() => pickReplyTextFor({ content: 'hi' })).toThrow('LLM generation failed, retry needed');
  });
  it('throws error for questions to trigger retry', () => {
    expect(() => pickReplyTextFor({ content: 'are you there?' })).toThrow('LLM generation failed, retry needed');
  });
})