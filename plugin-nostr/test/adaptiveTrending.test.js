import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveTrending } from '../lib/adaptiveTrending.js';

function makeEvt(content, pubkey, tsSec) {
  return { content, pubkey, created_at: tsSec };
}

describe('AdaptiveTrending', () => {
  let now;
  beforeEach(() => {
    vi.useFakeTimers();
    now = Date.now();
  });

  it('does not mark always-discussed topics without development as trending', () => {
    const at = new AdaptiveTrending({ minScoreThreshold: 1.2 });
    const topic = 'bitcoin';
    // Simulate steady baseline: 1 mention every 20 minutes for BASELINE_HOURS
    const BASELINE_HOURS = 72; // 3 days
    for (let h = BASELINE_HOURS; h >= 1; h--) {
      const t = now - h * 20 * 60 * 1000;
      at.recordTopicMention(topic, makeEvt('bitcoin', 'u1', Math.floor(t / 1000)));
    }
    const trending = at.getTrendingTopics(5, now);
    const found = trending.find(t => t.topic === topic);
    expect(found).toBeFalsy();
  });

  it('trends when velocity and novelty spike', () => {
    const at = new AdaptiveTrending({ minScoreThreshold: 1.2 });
    const topic = 'bitcoin';
    // Baseline history
    for (let i = 6; i >= 1; i--) {
      const t = now - (90 + i * 10) * 60 * 1000; // older than recent window
      at.recordTopicMention(topic, makeEvt('bitcoin dev conference', `u${i}`, Math.floor(t / 1000)));
    }
    // Recent spike with novel keywords
    const recentKeywords = [
      'etf approval rumor', 'price breakout', 'on-chain surge', 'derivatives spike', 'blackrock mention'
    ];
    for (let i = 0; i < recentKeywords.length; i++) {
      const t = now - (i * 3) * 60 * 1000; // dense recent
      at.recordTopicMention(topic, makeEvt(`bitcoin ${recentKeywords[i]}`, `r${i}`, Math.floor(t / 1000)));
    }
    const trending = at.getTrendingTopics(5, now);
    const found = trending.find(t => t.topic === topic);
    expect(found).toBeTruthy();
    expect(found.velocity).toBeGreaterThan(1.0);
    expect(found.novelty).toBeGreaterThan(0.1);
  });

  it('emerging new topic trends with high novelty', () => {
    const at = new AdaptiveTrending({ minScoreThreshold: 1.2 });
    const topic = 'nostr wallets';
    // No baseline, only recent burst with varied keywords
    const kws = ['alby', 'mutiny', 'zaplocker', 'nwc', 'lnurl'];
    kws.forEach((k, i) => {
      const t = now - (i * 4) * 60 * 1000;
      at.recordTopicMention(topic, makeEvt(`${k} integration and UX`, `a${i}`, Math.floor(t / 1000)));
    });
    const [first] = at.getTrendingTopics(5, now);
    expect(first).toBeTruthy();
    expect(first.topic).toBe(topic);
    expect(first.novelty).toBeGreaterThan(0.3);
  });

  it('detects acceleration in velocity', () => {
    const at = new AdaptiveTrending({ minScoreThreshold: 0.8, recentWindowMs: 20 * 60 * 1000, previousWindowMs: 20 * 60 * 1000 });
    const topic = 'protocol v2';
    // Previous window: 2 mentions
    for (let i = 2; i > 0; i--) {
      const t = now - (40 - i * 5) * 60 * 1000;
      at.recordTopicMention(topic, makeEvt('protocol v2 plans', `p${i}`, Math.floor(t / 1000)));
    }
    // Recent window: 6 mentions
    for (let i = 0; i < 6; i++) {
      const t = now - (i * 2) * 60 * 1000;
      at.recordTopicMention(topic, makeEvt('protocol v2 benchmarks', `q${i}`, Math.floor(t / 1000)));
    }
    const [first] = at.getTrendingTopics(5, now);
    expect(first).toBeTruthy();
    expect(first.velocity).toBeGreaterThan(1.5);
  });
});
