"use strict";

const { poolList } = require('./poolList');

async function loadCurrentContacts(pool, relays, pkHex) {
  if (!pool || !pkHex) return new Set();
  try {
    const events = await poolList(pool, relays, [{ kinds: [3], authors: [pkHex], limit: 2 }]);
    if (!events || !events.length) return new Set();
    const latest = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    const pTags = Array.isArray(latest.tags) ? latest.tags.filter((t) => t[0] === 'p') : [];
    const set = new Set(pTags.map((t) => t[1]).filter(Boolean));
    return set;
  } catch {
    return new Set();
  }
}

async function publishContacts(pool, relays, sk, newSet, buildContactsFn, finalizeFn) {
  if (!pool || !sk) return false;
  try {
    const evtTemplate = buildContactsFn([...newSet]);
    const signed = finalizeFn(evtTemplate, sk);
    await Promise.any(pool.publish(relays, signed));
    return true;
  } catch {
    return false;
  }
}

async function loadMuteList(pool, relays, pkHex) {
  if (!pool || !pkHex) return new Set();
  try {
    const events = await poolList(pool, relays, [{ kinds: [10000], authors: [pkHex], limit: 2 }]);
    if (!events || !events.length) return new Set();
    const latest = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    const pTags = Array.isArray(latest.tags) ? latest.tags.filter((t) => t[0] === 'p') : [];
    const set = new Set(pTags.map((t) => t[1]).filter(Boolean));
    return set;
  } catch {
    return new Set();
  }
}

async function publishMuteList(pool, relays, sk, newSet, buildMuteListFn, finalizeFn) {
  if (!pool || !sk) return false;
  try {
    const evtTemplate = buildMuteListFn([...newSet]);
    const signed = finalizeFn(evtTemplate, sk);
    await Promise.any(pool.publish(relays, signed));
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadCurrentContacts, publishContacts, loadMuteList, publishMuteList };
