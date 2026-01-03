"use strict";

/**
 * List events from relays using a pool. If pool.list exists, use it.
 * Otherwise, fall back to subscribeMany and collect until EOSE or timeout.
 *
 * @param {object|null} pool - Nostr SimplePool-like instance
 * @param {string[]} relays - relay URLs
 * @param {object[]|object} filters - nostr filters array or single filter object
 * @returns {Promise<object[]>}
 */
async function poolList(pool, relays, filters) {
  if (!pool) return [];

  // Normalize input to an array of filter objects and sanitize FIRST
  // This ensures proper formatting regardless of whether pool.list exists
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

  // If there are no valid filters after sanitization, return empty
  if (!sanitized || sanitized.length === 0) {
    return [];
  }

  // Ensure we always pass an array of filters as expected by nostr-tools v2
  const subArg = sanitized;

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
      // If there are no valid filters after sanitization, or it's empty, return empty
      if (!subArg || !Array.isArray(subArg) || subArg.length === 0) {
        return resolve([]);
      }

      // Use subscribeMap with properly formatted requests (nostr-tools v2 API)
      // subscribeMap expects: [{ url, filter }, ...] where filter is a single object
      const requests = [];
      for (const relay of relays) {
        for (const filter of subArg) {
          requests.push({ url: relay, filter });
        }
      }

      const sub = pool.subscribeMap(requests, {
        onevent: (evt) => {
          if (evt && evt.id && !seen.has(evt.id)) {
            seen.add(evt.id);
            events.push(evt);
          }
        },
        oneose: () => {
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(finish, 200);
        }
      });
      unsub = () => { try { sub.close(); } catch { } };

      // safety in case relays misbehave
      safetyTimer = setTimeout(finish, 4000);
    } catch (err) {
      // If subscribe fails due to invalid filter shapes, log and return empty
      try { console.warn('[NOSTR][poolList] subscribeMany failed:', err?.message || err); } catch { }
      resolve([]);
    }
  });
}

module.exports = { poolList };
