"use strict";

const { poolList } = require('./poolList');

function chooseRelaysForTopic(defaultRelays, topic) {
  const t = String(topic || '').toLowerCase();
  const isArtTopic = /art|pixel|creative|canvas|design|visual/.test(t);
  const isTechTopic = /dev|code|programming|node|typescript|docker/.test(t);
  if (isArtTopic) {
    return [ 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social', ...defaultRelays ].slice(0, 4);
  } else if (isTechTopic) {
    return [ 'wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://relay.snort.social', ...defaultRelays ].slice(0, 4);
  }
  return defaultRelays;
}

async function listEventsByTopic(pool, relays, topic, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
  const targetRelays = chooseRelaysForTopic(relays, topic);
  const listImpl = opts.listFn || ((p, r, f) => poolList(p || { list: () => [] }, r, f));
  const isSemanticMatch = opts.isSemanticMatch || ((content, t) => false);
  const isQualityContent = opts.isQualityContent || ((event, t) => true);

  const filters = [];
  filters.push({ kinds: [1], search: topic, limit: 20, since: now - 4 * 3600 });
  const t = String(topic || '').toLowerCase();
  const isBitcoinTopic = /bitcoin|lightning|sats|zap|value4value/.test(t);
  const isNostrTopic = /nostr|relay|nip|damus|primal/.test(t);
  if (/art|pixel|creative|canvas|design|visual/.test(t) || isBitcoinTopic || isNostrTopic) {
    const hashtag = t.startsWith('#') ? t.slice(1) : t.replace(/\s+/g, '');
    filters.push({ kinds: [1], '#t': [hashtag.toLowerCase()], limit: 15, since: now - 6 * 3600 });
  }
  filters.push({ kinds: [1], since: now - 3 * 3600, limit: 100 });
  filters.push({ kinds: [1], since: now - 8 * 3600, limit: 50 });

  const searchResults = await Promise.all(
    filters.map(filter => listImpl(pool, targetRelays, [filter]).catch(() => []))
  );
  const allEvents = searchResults.flat().filter(Boolean);
  const uniqueEvents = new Map();
  allEvents.forEach(event => { if (event && event.id && !uniqueEvents.has(event.id)) uniqueEvents.set(event.id, event); });
  const events = Array.from(uniqueEvents.values());
  const lc = t;
  const topicWords = lc.split(/\s+/).filter(w => w.length > 2);
  const relevant = events.filter(event => {
    const content = (event?.content || '').toLowerCase();
    const tags = Array.isArray(event.tags) ? event.tags.flat().join(' ').toLowerCase() : '';
    const fullText = content + ' ' + tags;
    const hasTopicMatch = topicWords.some(word => fullText.includes(word) || content.includes(lc) || isSemanticMatch(content, topic));
    if (!hasTopicMatch) return false;
    return isQualityContent(event, topic);
  });
  return relevant;
}

module.exports = { listEventsByTopic, chooseRelaysForTopic };
