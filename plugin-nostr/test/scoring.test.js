const { describe, it, expect } = globalThis;
const { _scoreEventForEngagement, _isQualityContent } = require('../lib/scoring.js');

describe('scoring', () => {
  it('scores higher for longer content', () => {
    const a = _scoreEventForEngagement({ content: 'short' });
    const b = _scoreEventForEngagement({ content: 'this is a bit longer content text' });
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it('marks empty as low quality', () => {
    expect(_isQualityContent({ content: '' }, 'topic')).toBe(false);
  });
});
import { isSelfAuthor } from '../lib/nostr.js';

describe('scoring', () => {
  const now = Math.floor(Date.now() / 1000);

  it('scores engaging question higher', () => {
    const evt = { content: 'What do you think about pixel art on nostr?', created_at: now - 3600, tags: [] };
    const score = _scoreEventForEngagement(evt, now);
    expect(score).toBeGreaterThan(0.4);
  });

  it('penalizes spammy short gm', () => {
    const evt = { content: 'gm', created_at: now - 3600, tags: [] };
    const score = _scoreEventForEngagement(evt, now);
    expect(score).toBeLessThan(0.2);
  });

  it('quality content passes basic filters', () => {
    const evt = { content: 'Exploring creative coding with pixel art today!', created_at: now - 4000 };
    expect(_isQualityContent(evt, 'art')).toBe(true);
  });

  it('rejects too-short content', () => {
    const evt = { content: 'hi', created_at: now - 4000 };
    expect(_isQualityContent(evt, 'art')).toBe(false);
  });

  it('detects self-author by pubkey match', () => {
    const self = 'abc123';
    const evt = { pubkey: 'AbC123' };
    expect(isSelfAuthor(evt, self)).toBe(true);
    expect(isSelfAuthor({ pubkey: 'zzz' }, self)).toBe(false);
  });
});
