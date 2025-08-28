const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { pickDiscoveryTopics, isSemanticMatch, isQualityAuthor, selectFollowCandidates } = require('../lib/discovery');

describe('discovery helpers', () => {
  const realRandom = Math.random;

  beforeEach(() => {
    // Make randomness deterministic for tests
    let calls = 0;
    Math.random = vi.fn(() => {
      const seq = [0.12, 0.34, 0.56, 0.78, 0.91];
      const v = seq[calls % seq.length];
      calls += 1;
      return v;
    });
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    Math.random = realRandom;
    vi.useRealTimers();
  });

  it('pickDiscoveryTopics returns a small non-empty set of strings', () => {
    const topics = pickDiscoveryTopics();
    expect(Array.isArray(topics)).toBe(true);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.length).toBeLessThanOrEqual(5);
    topics.forEach(t => expect(typeof t).toBe('string'));
  });

  it('isSemanticMatch detects related terms', () => {
    expect(isSemanticMatch('Love retro 8-bit sprite work and bitmap vibes', 'pixel art')).toBe(true);
    expect(isSemanticMatch('Pay the LN invoice, sats zap incoming', 'lightning network')).toBe(true);
    expect(isSemanticMatch('I like cooking and hiking', 'nostr dev')).toBe(false);
  });

  it('isQualityAuthor flags repetitive, too-regular posting as low quality', () => {
    const now = Math.floor(Date.now() / 1000);
    const spammy = [
      { content: 'buy now low prices', created_at: now - 3600 },
      { content: 'buy now low prices', created_at: now - 2400 },
      { content: 'buy now low prices', created_at: now - 1200 },
      { content: 'buy now low prices', created_at: now - 600 },
    ];
    expect(isQualityAuthor(spammy)).toBe(false);

    const varied = [
      { content: 'Working on a new generative art sketch', created_at: now - 7200 },
      { content: 'Trying shaders with GLSL this evening', created_at: now - 3600 },
      { content: 'Sharing a progress GIF soon', created_at: now - 600 },
    ];
    expect(isQualityAuthor(varied)).toBe(true);
  });

  it('selectFollowCandidates includes high-score authors and respects cooldown and existing contacts', () => {
    const selfPk = 'selfpkhex';
    const currentContacts = new Set(['alreadyFollowing']);
    const lastReplyByUser = new Map([
      ['cooldownUser', Date.now()], // recent reply => should filter out
    ]);
    const replyThrottleSec = 60; // not used directly in the function, but kept for future API

    const scoredEvents = [
      { evt: { pubkey: 'alreadyFollowing' }, score: 0.99 }, // filtered (already following)
      { evt: { pubkey: 'lowScoreUser' }, score: 0.1 }, // filtered (low score)
      { evt: { pubkey: selfPk }, score: 0.95 }, // filtered (self)
      { evt: { pubkey: 'cooldownUser' }, score: 0.9 }, // filtered (cooldown)
      { evt: { pubkey: 'goodUserA' }, score: 0.9 }, // kept
      { evt: { pubkey: 'goodUserB' }, score: 0.5 }, // kept
    ];

    const result = selectFollowCandidates(scoredEvents, currentContacts, selfPk, lastReplyByUser, replyThrottleSec);
    expect(result).toEqual(['goodUserA', 'goodUserB']);
  });
});
