const { describe, it, expect, vi, beforeEach, afterEach } = globalThis;
const { loadCurrentContacts, publishContacts } = require('../lib/contacts.js');

function makePoolWithEvents(events) {
  // poolList uses subscribeMap, not list
  return {
    subscribeMap: (requests, callbacks) => {
      // Simulate async delivery
      setTimeout(() => {
        events.forEach(evt => callbacks.onevent(evt));
        callbacks.oneose();
      }, 0);
      return { close: () => {} };
    }
  };
}

describe('contacts helpers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('loadCurrentContacts extracts latest p-tags', async () => {
    const now = Math.floor(Date.now() / 1000);
    const events = [
      { id: '1', created_at: now - 100, tags: [['p', 'pkA'], ['p', 'pkB'], ['e', 'zzz']] },
      { id: '2', created_at: now - 10, tags: [['p', 'pkC'], ['p', 'pkD']] }, // latest
    ];
    const pool = makePoolWithEvents(events);
    const promise = loadCurrentContacts(pool, ['wss://x'], 'myPubHex');
    
    // Allow async callbacks to fire
    await vi.advanceTimersByTimeAsync(300);
    
    const set = await promise;
    expect(set instanceof Set).toBe(true);
    expect(set.has('pkC')).toBe(true);
    expect(set.has('pkD')).toBe(true);
    expect(set.has('pkA')).toBe(false);
  });

  it('loadCurrentContacts returns empty set on no data', async () => {
    const pool = makePoolWithEvents([]);
    const promise = loadCurrentContacts(pool, ['wss://x'], 'myPubHex');
    await vi.advanceTimersByTimeAsync(300);
    const set = await promise;
    expect(set.size).toBe(0);
  });

  it('publishContacts signs and publishes', async () => {
    const calls = { built: 0, signed: 0, published: 0 };
    const pool = { publish: () => { calls.published++; return [Promise.resolve()]; } };
    const relays = ['wss://a'];
    const sk = new Uint8Array([1]);
    const newSet = new Set(['pk1', 'pk2']);
    const buildContacts = (arr) => { calls.built++; return { kind: 3, tags: arr.map(pk => ['p', pk]) }; };
    const finalize = (evt, _sk) => { calls.signed++; return { ...evt, id: 'signed' }; };

    const ok = await publishContacts(pool, relays, sk, newSet, buildContacts, finalize);
    expect(ok).toBe(true);
    expect(calls).toEqual({ built: 1, signed: 1, published: 1 });
  });

  it('publishContacts returns false on error', async () => {
    const pool = { publish: () => { throw new Error('fail'); } };
    const ok = await publishContacts(pool, ['wss://a'], new Uint8Array([1]), new Set(['pk']), () => ({}), (e) => e);
    expect(ok).toBe(false);
  });
});
