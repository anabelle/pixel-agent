// Discovery helpers extracted from service for testability
const { _isQualityContent } = require('./scoring');

function pickDiscoveryTopics() {
  const highQualityTopics = [
    ['pixel art', '8-bit art', 'generative art', 'creative coding', 'collaborative canvas'],
    ['ASCII art', 'glitch art', 'demoscene', 'retrocomputing', 'digital art'],
    ['p5.js', 'processing', 'touchdesigner', 'shader toy', 'glsl shaders'],
    ['art collaboration', 'creative projects', 'interactive art', 'code art'],
    ['lightning network', 'value4value', 'zaps', 'sats', 'bitcoin art'],
    ['self custody', 'bitcoin ordinals', 'on-chain art', 'micropayments'],
    ['open source wallets', 'LNURL', 'BOLT12', 'mempool fees'],
    ['nostr dev', 'relays', 'NIP-05', 'NIP-57', 'decentralized social'],
    ['censorship resistant', 'nostr protocol', '#artstr', '#plebchain'],
    ['nostr clients', 'primal', 'damus', 'iris', 'nostrudel'],
    ['self-hosted', 'homelab', 'Docker', 'Node.js', 'TypeScript'],
    ['open source', 'FOSS', 'indie web', 'small web', 'webring'],
    ['privacy', 'encryption', 'cypherpunk', 'digital sovereignty'],
    ['AI art', 'machine learning', 'creative AI', 'autonomous agents'],
    ['maker culture', 'creative commons', 'collaborative tools'],
    ['digital minimalism', 'constraint programming', 'creative constraints']
  ];
  const topicWeights = {
    'pixel art': 3.0, 'collaborative canvas': 2.8, 'creative coding': 2.5,
    'lightning network': 2.3, 'value4value': 2.2, 'zaps': 2.0,
    'nostr dev': 1.8, '#artstr': 1.7, 'self-hosted': 1.5,
    'AI art': 1.4, 'open source': 1.3, 'creative AI': 1.2
  };
  const selectedSets = [];
  const numSets = Math.random() < 0.3 ? 2 : 1;
  while (selectedSets.length < numSets && selectedSets.length < highQualityTopics.length) {
    const setIndex = Math.floor(Math.random() * highQualityTopics.length);
    if (!selectedSets.some(s => s === highQualityTopics[setIndex])) selectedSets.push(highQualityTopics[setIndex]);
  }
  const weightedTopics = [];
  selectedSets.flat().forEach(topic => { const weight = topicWeights[topic] || 1.0; for (let i = 0; i < Math.ceil(weight); i++) weightedTopics.push(topic); });
  const finalTopics = new Set();
  const targetCount = Math.floor(Math.random() * 3) + 2;
  while (finalTopics.size < targetCount && finalTopics.size < weightedTopics.length) {
    const topic = weightedTopics[Math.floor(Math.random() * weightedTopics.length)];
    finalTopics.add(topic);
  }
  return Array.from(finalTopics);
}

function isSemanticMatch(content, topic) {
  const semanticMappings = {
    'pixel art': ['8-bit', 'sprite', 'retro', 'low-res', 'pixelated', 'bitmap'],
    'lightning network': ['LN', 'sats', 'zap', 'invoice', 'channel', 'payment'],
    'creative coding': ['generative', 'algorithm', 'procedural', 'interactive', 'visualization'],
    'collaborative canvas': ['drawing', 'paint', 'sketch', 'artwork', 'contribute', 'place'],
    'value4value': ['v4v', 'creator', 'support', 'donation', 'tip', 'creator economy'],
    'nostr dev': ['relay', 'NIP', 'protocol', 'client', 'pubkey', 'event'],
    'self-hosted': ['VPS', 'server', 'homelab', 'docker', 'self-custody', 'sovereignty'],
    'bitcoin art': ['ordinals', 'inscription', 'on-chain', 'sat', 'btc art', 'digital collectible']
  };
  const relatedTerms = semanticMappings[topic.toLowerCase()] || [];
  return relatedTerms.some(term => content.toLowerCase().includes(term.toLowerCase()));
}

function isQualityAuthor(authorEvents) {
  if (!authorEvents.length) return false;
  if (authorEvents.length === 1) { const event = authorEvents[0]; return _isQualityContent(event, 'general'); }
  const contents = authorEvents.map(e => e.content || '').filter(Boolean);
  if (contents.length < 2) return true;
  const uniqueContents = new Set(contents);
  const similarityRatio = uniqueContents.size / contents.length;
  if (similarityRatio < 0.7) return false;
  const timestamps = authorEvents.map(e => e.created_at || 0).sort();
  const intervals = []; for (let i = 1; i < timestamps.length; i++) { intervals.push(timestamps[i] - timestamps[i-1]); }
  if (intervals.length > 2) {
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avgInterval;
    if (coefficient < 0.3 && avgInterval < 3600) return false;
  }
  const allWords = contents.join(' ').toLowerCase().split(/\s+/);
  const uniqueWords = new Set(allWords);
  const vocabularyRichness = uniqueWords.size / allWords.length;
  if (vocabularyRichness < 0.4) return false;
  return true;
}

function selectFollowCandidates(scoredEvents, currentContacts, selfPk, lastReplyByUser, replyThrottleSec) {
  const authorScores = new Map();
  const now = Date.now();
  scoredEvents.forEach(({ evt, score }) => {
    if (!evt?.pubkey || currentContacts.has(evt.pubkey)) return;
    if (evt.pubkey === selfPk) return;
    const currentScore = authorScores.get(evt.pubkey) || 0;
    authorScores.set(evt.pubkey, Math.max(currentScore, score));
  });
  const candidates = Array.from(authorScores.entries()).map(([pubkey, score]) => ({ pubkey, score })).sort((a, b) => b.score - a.score);
  const qualityCandidates = candidates.filter(({ pubkey, score }) => {
    if (score < 0.4) return false;
    const lastReply = lastReplyByUser.get(pubkey) || 0;
    const timeSinceReply = now - lastReply;
    if (timeSinceReply < (2 * 60 * 60 * 1000)) return false; // 2 hours
    return true;
  });
  return qualityCandidates.map(c => c.pubkey);
}

module.exports = {
  pickDiscoveryTopics,
  isSemanticMatch,
  isQualityAuthor,
  selectFollowCandidates,
};
