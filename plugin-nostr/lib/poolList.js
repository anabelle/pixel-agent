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

  // Normalize input to an array of filter objects and sanitize
  const filtersArr = Array.isArray(filters) ? filters : [filters || {}];

  // Sanitize filters: keep only plain objects, remove empty entries and empty arrays
  const sanitized = filtersArr
    .filter(f => f && typeof f === 'object')
    .map(f => {
      const out = {};
      for (const key of Object.keys(f)) {
        const val = f[key];
        if (val === undefined || val === null) continue;
        if (Array.isArray(val) && val.length === 0) continue; // drop empty arrays
        out[key] = val;
      }
      return out;
    })
    .filter(o => o && typeof o === 'object' && Object.keys(o).length > 0);

  // Workaround: Unbox single filter to avoid "not an object" array error in subscribeMany
  const subArg = sanitized.length === 1 ? sanitized[0] : sanitized;

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
      // If there are no valid filters after sanitization, return empty
      if (!subArg || (Array.isArray(subArg) && subArg.length === 0)) return resolve([]);

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
    } catch (err) {
      // If subscribe fails due to invalid filter shapes, log and return empty
      try { console.warn('[NOSTR][poolList] subscribeMany failed:', err?.message || err); } catch { }
      resolve([]);
    }
  });
}

module.exports = { poolList };
