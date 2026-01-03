import { describe, it, expect, vi } from 'vitest';
import { ThreadContextResolver } from '../lib/threadContext.js';

const makeEvent = (id, created, tags = [], content = '') => ({
  id,
  pubkey: `${id}-pk`,
  content,
  created_at: created,
  tags
});

describe('ThreadContextResolver', () => {
  describe('constructor', () => {
    it('initializes with provided options', () => {
      const mockPool = {};
      const mockRelays = ['wss://relay1.com', 'wss://relay2.com'];
      const mockLogger = { debug: vi.fn() };

      const resolver = new ThreadContextResolver({
        pool: mockPool,
        relays: mockRelays,
        selfPubkey: 'test-pubkey',
        maxEvents: 100,
        maxRounds: 5,
        batchSize: 4,
        logger: mockLogger
      });

      expect(resolver.pool).toBe(mockPool);
      expect(resolver.relays).toEqual(mockRelays);
      expect(resolver.selfPubkey).toBe('test-pubkey');
      expect(resolver.maxEvents).toBe(100);
      expect(resolver.maxRounds).toBe(5);
      expect(resolver.batchSize).toBe(4);
      expect(resolver.logger).toBe(mockLogger);
    });

    it('uses default values when options not provided', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      expect(resolver.maxEvents).toBe(80);
      expect(resolver.maxRounds).toBe(4);
      expect(resolver.batchSize).toBe(3);
      expect(resolver.logger).toBe(console);
    });
  });

  describe('getThreadContext', () => {
    it('returns solo thread when pool is null', async () => {
      const evt = makeEvent('evt1', 1000, [], 'test content');

      const resolver = new ThreadContextResolver({
        pool: null,
        relays: ['wss://test.com'],
        list: vi.fn()
      });

      const result = await resolver.getThreadContext(evt);

      expect(result.thread).toEqual([evt]);
      expect(result.isRoot).toBe(true);
      expect(result.contextQuality).toBeGreaterThan(0);
    });

    it('returns solo thread when evt is null', async () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        list: vi.fn()
      });

      const result = await resolver.getThreadContext(null);

      expect(result.thread).toEqual([]);
      expect(result.isRoot).toBe(true);
      expect(result.contextQuality).toBe(0);
    });

    it('returns solo thread when relays is empty', async () => {
      const evt = makeEvent('evt1', 1000, [], 'test content');

      const resolver = new ThreadContextResolver({
        pool: {},
        relays: [],
        list: vi.fn()
      });

      const result = await resolver.getThreadContext(evt);

      expect(result.thread).toEqual([evt]);
      expect(result.isRoot).toBe(true);
    });

    it('fetches root thread for events with e tags', async () => {
      const root = makeEvent('root', 1000, [], 'root post content here is interesting');
      const reply = makeEvent('reply', 1100, [['e', 'root', '', 'root']], 'reply content');

      const listMock = vi.fn(async (relays, filters) => {
        if (filters.some(f => f.ids?.includes('root'))) {
          return [root];
        }
        return [];
      });

      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        list: listMock,
        logger: { debug: vi.fn() }
      });

      const result = await resolver.getThreadContext(reply);

      expect(result.thread).toHaveLength(2);
      expect(result.thread.map(e => e.id)).toContain('root');
      expect(result.thread.map(e => e.id)).toContain('reply');
      expect(result.isRoot).toBe(false);
      expect(result.rootId).toBe('root');
    });

    it('fetches parent chain when no root tag exists', async () => {
      const parent = makeEvent('parent', 1000, [], 'parent content about art');
      const child = makeEvent('child', 1100, [['e', 'parent']], 'child content');

      const listMock = vi.fn(async (relays, filters) => {
        if (filters.some(f => f.ids?.includes('parent'))) {
          return [parent];
        }
        return [];
      });

      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        list: listMock,
        logger: { debug: vi.fn() }
      });

      const result = await resolver.getThreadContext(child);

      expect(result.thread).toHaveLength(2);
      expect(result.thread.map(e => e.id)).toContain('parent');
      expect(result.thread.map(e => e.id)).toContain('child');
    });

    it('handles errors gracefully and returns solo thread', async () => {
      const evt = makeEvent('evt1', 1000, [['e', 'root']]);

      const listMock = vi.fn(() => {
        throw new Error('Network error');
      });

      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        list: listMock,
        logger: { debug: vi.fn() }
      });

      const result = await resolver.getThreadContext(evt);

      expect(result.thread).toEqual([evt]);
      expect(result.isRoot).toBe(true);
    });
  });

  describe('assessThreadContextQuality', () => {
    it('returns 0 for empty array', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const score = resolver.assessThreadContextQuality([]);
      expect(score).toBe(0);
    });

    it('returns 0 for null or undefined input', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      expect(resolver.assessThreadContextQuality(null)).toBe(0);
      expect(resolver.assessThreadContextQuality(undefined)).toBe(0);
    });

    it('returns low score for single short event', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const evt = makeEvent('evt1', 1000, [], 'hi');
      const score = resolver.assessThreadContextQuality([evt]);

      expect(score).toBeLessThan(0.5);
    });

    it('returns high score for multiple events with varied content', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const events = [
        makeEvent('evt1', 1000, [], 'This is a very interesting post about pixel art and creative expression'),
        makeEvent('evt2', 1100, [['e', 'evt1']], 'Great point! I love the collaborative aspect'),
        makeEvent('evt3', 1200, [['e', 'evt1']], 'The technology behind this is fascinating')
      ];

      const score = resolver.assessThreadContextQuality(events);

      expect(score).toBeGreaterThan(0.6);
    });

    it('increases score with more events', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const smallThread = [
        makeEvent('evt1', 1000, [], 'test')
      ];

      const largeThread = [
        makeEvent('evt1', 1000, [], 'test'),
        makeEvent('evt2', 1100, [['e', 'evt1']], 'reply'),
        makeEvent('evt3', 1200, [['e', 'evt1']], 'reply2'),
        makeEvent('evt4', 1300, [['e', 'evt1']], 'reply3')
      ];

      const smallScore = resolver.assessThreadContextQuality(smallThread);
      const largeScore = resolver.assessThreadContextQuality(largeThread);

      expect(largeScore).toBeGreaterThan(smallScore);
    });

    it('increases score with total content length', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const shortThread = [
        makeEvent('evt1', 1000, [], 'hi')
      ];

      const longThread = [
        makeEvent('evt1', 1000, [], 'This is a very long and detailed post about many interesting topics related to pixel art, creativity, and the future of digital collaboration')
      ];

      const shortScore = resolver.assessThreadContextQuality(shortThread);
      const longScore = resolver.assessThreadContextQuality(longThread);

      expect(longScore).toBeGreaterThan(shortScore);
    });

    it('increases score for recent events', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const now = Math.floor(Date.now() / 1000);

      const oldThread = [
        makeEvent('evt1', now - 100000, [], 'old post')
      ];

      const recentThread = [
        makeEvent('evt1', now - 1800, [], 'recent post')
      ];

      const oldScore = resolver.assessThreadContextQuality(oldThread);
      const recentScore = resolver.assessThreadContextQuality(recentThread);

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('caps score at 1.0', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const events = Array.from({ length: 50 }, (_, i) =>
        makeEvent(`evt${i}`, 1000 + i * 10, [], 'content '.repeat(20))
      );

      const score = resolver.assessThreadContextQuality(events);

      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('shouldEngageWithThread', () => {
    it('returns true for root post with high quality', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [], 'This is interesting content');
      const threadContext = {
        thread: [evt],
        isRoot: true,
        contextQuality: 0.8
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(true);
    });

    it('returns false for deep thread (>5 events)', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt6', 1000, [['e', 'evt1']], 'reply');
      const threadContext = {
        thread: Array.from({ length: 6 }, (_, i) => makeEvent(`evt${i}`, 1000 + i * 10)),
        isRoot: false,
        contextQuality: 0.8
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(false);
    });

    it('returns false for low context quality', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [['e', 'root']], 'reply');
      const threadContext = {
        thread: [evt],
        isRoot: false,
        contextQuality: 0.2
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(false);
    });

    it('returns true when relevant keywords present', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [['e', 'root']], 'reply');
      const threadContext = {
        thread: [
          makeEvent('root', 900, [], 'I love pixel art and creative expression'),
          evt
        ],
        isRoot: false,
        contextQuality: 0.5
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(true);
    });

    it('returns false when relevant keywords absent', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [['e', 'root']], 'reply');
      const threadContext = {
        thread: [
          makeEvent('root', 900, [], 'just some random words here'),
          evt
        ],
        isRoot: false,
        contextQuality: 0.5
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(false);
    });

    it('returns false for bot patterns', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const botPatterns = ['gm', 'repost', '12345', '!@#$%'];

      for (const content of botPatterns) {
        const evt = makeEvent('evt1', 1000, [], content);
        const threadContext = {
          thread: [evt],
          isRoot: true,
          contextQuality: 0.8
        };

        const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

        expect(shouldEngage).toBe(false);
      }
    });

    it('returns false for very short content', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [], 'hi');
      const threadContext = {
        thread: [evt],
        isRoot: true,
        contextQuality: 0.8
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(false);
    });

    it('returns false for very long content', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com'],
        logger: { debug: vi.fn() }
      });

      const evt = makeEvent('evt1', 1000, [], 'a'.repeat(801));
      const threadContext = {
        thread: [evt],
        isRoot: true,
        contextQuality: 0.8
      };

      const shouldEngage = resolver.shouldEngageWithThread(evt, threadContext);

      expect(shouldEngage).toBe(false);
    });

    it('returns false for null threadContext', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const evt = makeEvent('evt1', 1000, [], 'test content');

      const shouldEngage = resolver.shouldEngageWithThread(evt, null);

      expect(shouldEngage).toBe(false);
    });

    it('returns false for null evt', () => {
      const resolver = new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.com']
      });

      const threadContext = {
        thread: [],
        isRoot: true,
        contextQuality: 0.8
      };

      const shouldEngage = resolver.shouldEngageWithThread(null, threadContext);

      expect(shouldEngage).toBe(false);
    });
  });
});
