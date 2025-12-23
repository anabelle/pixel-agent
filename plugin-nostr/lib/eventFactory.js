// Helper functions to build nostr event templates in a pure, testable way

function buildTextNote(content, createdAtSec) {
  return {
    kind: 1,
    created_at: createdAtSec ?? Math.floor(Date.now() / 1000),
    tags: [],
    content: String(content ?? ''),
  };
}

// parent: { id, pubkey?, refs? } or string id
// options: { rootId?, parentAuthorPk?, extraPTags?: string[] }
function buildReplyNote(parent, text, options = {}) {
  const created_at = Math.floor(Date.now() / 1000);
  const tags = [];
  let parentId = null;
  let parentAuthorPk = options.parentAuthorPk || null;
  let rootId = options.rootId || null;

  if (parent && typeof parent === 'object') {
    parentId = parent.id || null;
    parentAuthorPk = parentAuthorPk || parent.pubkey || null;
    if (!rootId && parent.refs && parent.refs.rootId && parent.refs.rootId !== parentId) {
      rootId = parent.refs.rootId;
    }
  } else if (typeof parent === 'string') {
    parentId = parent;
  }

  if (!parentId) return null;
  tags.push(['e', parentId, '', 'reply']);
  if (rootId && rootId !== parentId) tags.push(['e', rootId, '', 'root']);

  const seenP = new Set();
  if (parentAuthorPk) {
    tags.push(['p', parentAuthorPk]);
    seenP.add(parentAuthorPk);
  }
  const extraPTags = Array.isArray(options.extraPTags) ? options.extraPTags : [];
  for (const pk of extraPTags) {
    if (!pk) continue;
    if (seenP.has(pk)) continue;
    tags.push(['p', pk]);
    seenP.add(pk);
  }

  if (!text || String(text).trim() === '') {
    throw new Error('No text provided for reply note');
  }
  return {
    kind: 1,
    created_at,
    tags,
    content: String(text),
  };
}

function buildReaction(parentEvt, symbol = '+') {
  if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return null;
  const created_at = Math.floor(Date.now() / 1000);
  return {
    kind: 7,
    created_at,
    tags: [ ['e', parentEvt.id], ['p', parentEvt.pubkey] ],
    content: String(symbol ?? '+'),
  };
}

function buildRepost(parentEvt) {
  if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return null;
  const created_at = Math.floor(Date.now() / 1000);
  return {
    kind: 6,
    created_at,
    tags: [ ['e', parentEvt.id], ['p', parentEvt.pubkey] ],
    content: JSON.stringify(parentEvt),
  };
}

async function buildQuoteRepost(parentEvt, quoteText, relays = []) {
  if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return null;
  const created_at = Math.floor(Date.now() / 1000);

  // Import utility functions
  const { generateNostrUri } = require('./utils');

  // Generate NIP-21 URI for the quoted event
  const ref = await generateNostrUri(parentEvt.id, parentEvt.pubkey, relays);

  const arrow = '↪️';
  const content = quoteText ? `${String(quoteText)}\n\n${arrow} ${ref}` : `${arrow} ${ref}`;

  return {
    kind: 1,
    created_at,
    // NIP-18: Use 'quote' marker for quote reposts
    tags: [
      ['e', parentEvt.id, '', 'quote'],
      ['p', parentEvt.pubkey],
      // Add relay hints if provided
      ...(relays && relays.length > 0 ? [['relays', ...relays]] : [])
    ],
    content,
  };
}

// NIP-18 Quote Repost: Creates a kind 6 event that quotes another event
function buildNIP18QuoteRepost(parentEvt, quoteText, relays = []) {
  if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return null;
  const created_at = Math.floor(Date.now() / 1000);

  // Import utility functions
  const { generateNostrUri } = require('./utils');

  // Generate NIP-21 URI for the quoted event
  const ref = generateNostrUri(parentEvt.id, parentEvt.pubkey, relays);

  // NIP-18 specifies kind 6 for quote reposts
  const content = quoteText ? `${String(quoteText)}\n\n${ref}` : ref;

  return {
    kind: 6, // NIP-18 Quote Repost
    created_at,
    tags: [
      ['e', parentEvt.id, '', 'mention'], // 'mention' for quoted events in kind 6
      ['p', parentEvt.pubkey],
      // Add relay hints if provided
      ...(relays && relays.length > 0 ? [['relays', ...relays]] : [])
    ],
    content,
  };
}

function buildContacts(pubkeys) {
  const tags = [];
  for (const pk of pubkeys || []) {
    if (pk) tags.push(['p', pk]);
  }
  return {
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify({}),
  };
}

function buildDirectMessage(recipientPubkey, text, createdAtSec) {
  if (!recipientPubkey) return null;
  return {
    kind: 4,
    created_at: createdAtSec ?? Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkey]],
    content: String(text ?? ''),
  };
}

function buildMuteList(pubkeys) {
  const tags = [];
  for (const pk of pubkeys || []) {
    if (pk) tags.push(['p', pk]);
  }
  return {
    kind: 10000,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

module.exports = {
  buildTextNote,
  buildReplyNote,
  buildReaction,
  buildRepost,
  buildQuoteRepost,
  buildNIP18QuoteRepost,
  buildContacts,
  buildDirectMessage,
  buildMuteList
};
