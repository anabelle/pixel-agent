const { describe, it, expect } = globalThis;
const { generateWithModelOrFallback } = require('../lib/generation.js');

function makeRuntime(resolver) {
  return { useModel: resolver };
}

describe('generation helpers', () => {
  it('returns extracted and sanitized text on success', async () => {
    const runtime = makeRuntime(async (_type, _opts) => ({ text: ' Hello <b>World</b> ' }));
    const extract = (r) => r.text;
    const sanitize = (s) => s.replace(/<[^>]+>/g, '').trim();
    const text = await generateWithModelOrFallback(runtime, 'TEXT_LARGE', 'prompt', { maxTokens: 10, temperature: 0.1 }, extract, sanitize, () => 'fallback');
    expect(text).toBe('Hello World');
  });

  it('uses fallback when useModel missing', async () => {
    const runtime = {};
    const text = await generateWithModelOrFallback(runtime, 'TEXT_LARGE', 'p', {}, (r)=>r, (s)=>s, () => 'fallback');
    expect(text).toBe('fallback');
  });

  it('uses fallback when model throws or returns empty', async () => {
    const runtime = makeRuntime(async () => { throw new Error('nope'); });
    const text = await generateWithModelOrFallback(runtime, 'TEXT_LARGE', 'p', {}, (r)=>r?.t, (s)=>s, () => 'fallback2');
    expect(text).toBe('fallback2');
  });
});
