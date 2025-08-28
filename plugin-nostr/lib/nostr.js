// Nostr-specific parsing helpers

function getConversationIdFromEvent(evt) {
  try {
    const eTags = Array.isArray(evt?.tags) ? evt.tags.filter((t) => t[0] === 'e') : [];
    const root = eTags.find((t) => t[3] === 'root');
    if (root && root[1]) return root[1];
    if (eTags.length && eTags[0][1]) return eTags[0][1];
  } catch {}
  return evt?.id || 'nostr';
}

function extractTopicsFromEvent(event) {
  if (!event || !event.content) return [];
  const content = event.content.toLowerCase();
  const topics = [];
  const hashtags = content.match(/#\w+/g) || [];
  topics.push(...hashtags.map((h) => h.slice(1)));
  const topicKeywords = {
    art: ['art', 'paint', 'draw', 'creative', 'canvas', 'design', 'visual', 'aesthetic'],
    bitcoin: ['bitcoin', 'btc', 'sats', 'satoshi', 'hodl', 'stack'],
    lightning: ['lightning', 'ln', 'zap', 'bolt', 'channel', 'invoice'],
    nostr: ['nostr', 'relay', 'note', 'event', 'pubkey', 'nip'],
    tech: ['code', 'program', 'develop', 'build', 'tech', 'software'],
    community: ['community', 'together', 'collaborate', 'share', 'group'],
    creativity: ['create', 'make', 'build', 'generate', 'craft', 'invent'],
  };
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((k) => content.includes(k))) topics.push(topic);
  }
  return [...new Set(topics)];
}

module.exports = {
  getConversationIdFromEvent,
  extractTopicsFromEvent,
};
