const { describe, it, expect, beforeEach, afterEach } = globalThis;
const { vi } = globalThis;
const { ContextAccumulator } = require('../lib/contextAccumulator');

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {} };

function createAccumulator() {
  return new ContextAccumulator(null, noopLogger);
}

describe('ContextAccumulator top topic aggregation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates topic counts across recent hours with samples', () => {
    const acc = createAccumulator();
    const hourMs = 60 * 60 * 1000;
    const nowBucket = acc._getCurrentHour();

    const currentDigest = acc._createEmptyDigest();
    currentDigest.topics.set('nostr dev', 3);
    currentDigest.topics.set('pixel art', 1);
    acc.hourlyDigests.set(nowBucket, currentDigest);

    const previousDigest = acc._createEmptyDigest();
    previousDigest.topics.set('nostr dev', 2);
    previousDigest.topics.set('bitcoin art', 4);
    acc.hourlyDigests.set(nowBucket - hourMs, previousDigest);

    acc.topicTimelines.set('nostr dev', [{
      eventId: 'evt-nostr',
      author: 'npub1nostr',
      timestamp: Date.now(),
      content: 'nostr devs cooking new relay tooling'
    }]);
    acc.topicTimelines.set('bitcoin art', [{
      eventId: 'evt-btc',
      author: 'npub1btc',
      timestamp: Date.now(),
      content: 'bitcoin art drop experimenting with ordinals'
    }]);

    const results = acc.getTopTopicsAcrossHours({ hours: 2, limit: 3, minMentions: 2 });

    expect(results.map(r => r.topic)).toEqual(['nostr dev', 'bitcoin art']);
    expect(results[0].count).toBe(5);
    expect(results[1].count).toBe(4);
    expect(results[0].sample).toBeTruthy();
    expect(results[0].sample.content).toContain('relay tooling');
  });

  it('falls back to highest topics when below minimum mentions', () => {
    const acc = createAccumulator();
    const nowBucket = acc._getCurrentHour();

    const digest = acc._createEmptyDigest();
    digest.topics.set('lonely topic', 1);
    acc.hourlyDigests.set(nowBucket, digest);

    const results = acc.getTopTopicsAcrossHours({ hours: 1, limit: 2, minMentions: 3 });

    expect(results.length).toBe(1);
    expect(results[0].topic).toBe('lonely topic');
    expect(results[0].count).toBe(1);
  });
});
