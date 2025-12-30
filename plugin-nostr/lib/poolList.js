"use strict";

/**
 * List events from relays using a pool. If pool.list exists, use it.
 * Otherwise, fall back to subscribeMany and collect until EOSE or timeout.
 *
 * @param {object|null} pool - Nostr SimplePool-like instance
 * @param {string[]} relays - relay URLs
 * @param {object[]} filters - nostr filters array
 * @returns {Promise<object[]>}
 */
async function poolList(pool, relays, filters) {
  if (!pool) return [];
  const direct = pool.list;
  if (typeof direct === 'function') {
    try {
      // bind to pool in case implementation relies on this
      return await direct.call(pool, relays, filters);
    } catch {
      return [];
    }
  }
  // Handle input variations (object or array)
  const filtersArr = Array.isArray(filters) ? filters : [filters || {}];
  // Workaround: Unbox single filter to avoid "not an object" array error in subscribeMany
  const subArg = filtersArr.length === 1 ? filtersArr[0] : filtersArr;

  return await new Promise((resolve) => {
    const events = [];
    const seen = new Set();
    let done = false;
    let settleTimer = null;
    let safetyTimer = null;
    let unsub = null;

    const finish = () => {
      if (done) return;
      done = true;
      try { if (unsub) unsub(); } catch { }
      if (settleTimer) clearTimeout(settleTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      resolve(events);
    };

    try {
      // Send all filters in one subscription to avoid opening multiple REQs per relay
      unsub = pool.subscribeMany(relays, subArg, {
        onevent: (evt) => {
          if (evt && evt.id && !seen.has(evt.id)) {
            seen.add(evt.id);
            events.push(evt);
          }
        },
        oneose: () => {
          if (settleTimer) clearTimeout(settleTimer);
          // small settle to allow late events to flush
          settleTimer = setTimeout(finish, 200);
        },
      });
      // safety in case relays misbehave
      safetyTimer = setTimeout(finish, 2500);
    } catch {
      resolve([]);
    }
  });
}

module.exports = { poolList };
