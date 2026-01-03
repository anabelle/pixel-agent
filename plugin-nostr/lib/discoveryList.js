"use strict";

const { poolList } = require('./poolList');

// NIP-50 search-enabled relays
const NIP50_SEARCH_RELAYS = [
  'wss://relay.nostr.band',
  'wss://search.nos.today',
  'wss://nostr.wine'
];

function isNip50Relay(url) {
  const normalizedUrl = String(url || '').toLowerCase().replace(/\/$/, '');
  return NIP50_SEARCH_RELAYS.some(r => normalizedUrl.includes(r.replace('wss://', '')));
}

function chooseRelaysForTopic(defaultRelays, topic) {
  const t = String(topic || '').toLowerCase();
  const isArtTopic = /art|pixel|creative|canvas|design|visual/.test(t);
  const isTechTopic = /dev|code|programming|node|typescript|docker/.test(t);
  if (isArtTopic) {
    // Prefer diverse relays; avoid nos.lol to mitigate REQ limits
    return ['wss://relay.damus.io', 'wss://relay.snort.social', ...defaultRelays].slice(0, 4);
  } else if (isTechTopic) {
    return ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://relay.snort.social', ...defaultRelays].slice(0, 4);
  }
  return defaultRelays;
}

async function listEventsByTopic(pool, relays, topic, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
  // Deduplicate relays to avoid duplicate REQs to the same URL
  const targetRelays = Array.from(new Set(chooseRelaysForTopic(relays, topic)));
  const listImpl = opts.listFn || ((p, r, f) => poolList(p || { list: () => [] }, r, f));
  const isSemanticMatch = opts.isSemanticMatch || ((content, t) => false);
  const isQualityContent = opts.isQualityContent || ((event, t) => true);

  // Use expanded search parameters if provided
  const timeRange = opts.timeRange || 4 * 3600; // Default 4 hours
  const limit = opts.limit || 20; // Default limit

  const t = String(topic || '').toLowerCase();
  const isBitcoinTopic = /bitcoin|lightning|sats|zap|value4value/.test(t);
  const isNostrTopic = /nostr|relay|nip|damus|primal/.test(t);

  // Separate relays by NIP-50 support to avoid sending search filters to incompatible relays
  const nip50Relays = targetRelays.filter(isNip50Relay);
  const standardRelays = targetRelays.filter(r => !isNip50Relay(r));

  // Build standard filters (work on all relays)
  const standardFilters = [];
  if (/art|pixel|creative|canvas|design|visual/.test(t) || isBitcoinTopic || isNostrTopic) {
    const hashtag = t.startsWith('#') ? t.slice(1) : t.replace(/\s+/g, '');
    standardFilters.push({ kinds: [1], '#t': [hashtag.toLowerCase()], limit: Math.floor(limit * 0.75), since: now - (timeRange * 1.5) });
  }
  standardFilters.push({ kinds: [1], since: now - (timeRange * 0.75), limit: limit * 5 });
  standardFilters.push({ kinds: [1], since: now - (timeRange * 2), limit: Math.floor(limit * 2.5) });

  // Build NIP-50 search filter (only for search-enabled relays)
  const searchFilter = { kinds: [1], search: topic, limit: limit, since: now - timeRange };

  // Collect results from both relay groups in parallel
  const results = await Promise.all([
    // Standard relays get standard filters only
    standardRelays.length > 0 && standardFilters.length > 0
      ? listImpl(pool, standardRelays, standardFilters).catch(() => [])
      : Promise.resolve([]),
    // NIP-50 relays get search filter + standard filters for better coverage
    nip50Relays.length > 0
      ? listImpl(pool, nip50Relays, [searchFilter, ...standardFilters]).catch(() => [])
      : Promise.resolve([])
  ]);

  const batchedResults = [...(results[0] || []), ...(results[1] || [])];
  const allEvents = (Array.isArray(batchedResults) ? batchedResults : []).filter(Boolean);
  const uniqueEvents = new Map();
  allEvents.forEach(event => { if (event && event.id && !uniqueEvents.has(event.id)) uniqueEvents.set(event.id, event); });
  const events = Array.from(uniqueEvents.values());
  const lc = t;
  const topicWords = lc.split(/\s+/).filter(w => w.length > 2);

  // Filter relevant events - handle both sync and async semantic matching
  const relevant = [];
  for (const event of events) {
    const content = (event?.content || '').toLowerCase();
    const tags = Array.isArray(event.tags) ? event.tags.flat().join(' ').toLowerCase() : '';
    const fullText = content + ' ' + tags;

    // Check topic match (handle async semantic matching)
    let hasTopicMatch = false;

    // First try quick keyword check
    if (topicWords.some(word => fullText.includes(word) || content.includes(lc))) {
      hasTopicMatch = true;
    } else {
      // Try semantic matching (may be async)
      const semanticResult = isSemanticMatch(content, topic);
      if (semanticResult instanceof Promise) {
        hasTopicMatch = await semanticResult;
      } else {
        hasTopicMatch = semanticResult;
      }
    }

    if (!hasTopicMatch) continue;

    // Check quality
    if (!isQualityContent(event, topic)) continue;

    relevant.push(event);
  }

  return relevant;
}

module.exports = { listEventsByTopic, chooseRelaysForTopic };
