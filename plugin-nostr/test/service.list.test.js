const { describe, it, expect, vi, beforeEach, afterEach } = globalThis;
const { NostrService } = require('../lib/service.js');

function makeSvc() {
  const settings = {
    'NOSTR_RELAYS': '',
    'NOSTR_PRIVATE_KEY': '',
    'NOSTR_PUBLIC_KEY': '',
    'NOSTR_LISTEN_ENABLE': 'false',
    'NOSTR_POST_ENABLE': 'false',
    'NOSTR_REPLY_ENABLE': 'false',
    'NOSTR_DISCOVERY_ENABLE': 'false',
    'NOSTR_HOME_FEED_ENABLE': 'false',
    'NOSTR_CONTEXT_ACCUMULATOR_ENABLED': 'false',
    'NOSTR_CONTEXT_LLM_ANALYSIS': 'false',
    'NOSTR_ENABLE_PING': 'false',
    'NOSTR_POST_DAILY_DIGEST_ENABLE': 'false',
    'NOSTR_CONNECTION_MONITOR_ENABLE': 'false',
    'NOSTR_UNFOLLOW_ENABLE': 'false',
    'NOSTR_DM_ENABLE': 'false',
    'NOSTR_DM_REPLY_ENABLE': 'false',
    'NOSTR_DM_THROTTLE_SEC': '60',
    'NOSTR_REPLY_THROTTLE_SEC': '60',
    'NOSTR_REPLY_INITIAL_DELAY_MIN_MS': '0',
    'NOSTR_REPLY_INITIAL_DELAY_MAX_MS': '0',
    'NOSTR_DISCOVERY_INTERVAL_MIN': '900',
    'NOSTR_DISCOVERY_INTERVAL_MAX': '1800',
    'NOSTR_HOME_FEED_INTERVAL_MIN': '300',
    'NOSTR_HOME_FEED_INTERVAL_MAX': '900',
    'NOSTR_HOME_FEED_REACTION_CHANCE': '0',
    'NOSTR_HOME_FEED_REPOST_CHANCE': '0',
    'NOSTR_HOME_FEED_QUOTE_CHANCE': '0',
    'NOSTR_HOME_FEED_MAX_INTERACTIONS': '1',
    'NOSTR_MIN_DELAY_BETWEEN_POSTS_MS': '15000',
    'NOSTR_MAX_DELAY_BETWEEN_POSTS_MS': '120000',
    'NOSTR_MENTION_PRIORITY_BOOST_MS': '5000',
    'NOSTR_MAX_EVENT_AGE_DAYS': '2',
    'NOSTR_DM_THROTTLE_SEC': '60',
    'NOSTR_ZAP_THANKS_ENABLE': 'false',
  };

  return new NostrService({
    agentId: 'agent',
    getSetting: vi.fn((key) => settings[key] ?? ''),
    getMemories: vi.fn(async () => []),
  });
}

describe('NostrService._list', () => {
  let useFake = false;
  beforeEach(() => { vi.useFakeTimers(); useFake = true; });
  afterEach(() => { if (useFake) { vi.useRealTimers(); useFake = false; } });

  it('uses pool.list when available', async () => {
    const svc = makeSvc();
    const events = [{ id: 'a' }, { id: 'b' }];
    const listSpy = vi.fn().mockResolvedValue(events);
    svc.pool = { list: listSpy };

    const res = await svc._list(['wss://x'], [{ kinds: [1] }]);
    expect(res).toEqual(events);
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to subscribeMap and collects unique events', async () => {
    const svc = makeSvc();
    let handlers;
    const unsub = vi.fn();
    // Service now uses subscribeMap instead of subscribeMany
    const subscribeMap = vi.fn((_requests, cb) => {
      handlers = cb; // capture callbacks
      return unsub;
    });
    svc.pool = { subscribeMap };

    const p = svc._list(['wss://x'], [{ kinds: [1], limit: 5 }]);

    // push duplicate id and ensure it's deduped
    handlers.onevent({ id: 'e1', content: 'first' });
    handlers.onevent({ id: 'e1', content: 'dup' });
    handlers.onevent({ id: 'e2', content: 'second' });
    // signal end of stored events
    handlers.oneose();

    // allow settle timer to run
    await vi.advanceTimersByTimeAsync(250);

    const res = await p;
    expect(res.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
