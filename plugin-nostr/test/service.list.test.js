const { describe, it, expect, vi, beforeEach, afterEach } = globalThis;
const { NostrService } = require('../lib/service.js');

function makeSvc() {
  // minimal runtime stub
  return new NostrService({ agentId: 'agent' });
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

  it('falls back to subscribeMany and collects unique events', async () => {
    const svc = makeSvc();
    let handlers;
    const unsub = vi.fn();
    const subscribeMany = vi.fn((_relays, _filters, cb) => {
      handlers = cb; // capture callbacks
      return unsub;
    });
    svc.pool = { subscribeMany };

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
