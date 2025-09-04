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

  return {
    kind: 1,
    created_at,
    tags,
    content: String(text ?? 'ack.'),
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

function buildQuoteRepost(parentEvt, quoteText) {
  if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return null;
  const created_at = Math.floor(Date.now() / 1000);
  // Prefer a clean Primal link rather than embedding raw JSON
  let ref = '';
  try {
    // Lazy require to avoid hard dependency during simple tests
    const { nip19 } = require('@nostr/tools');
    try {
      // Try nevent (includes author); fallback to note if needed
      const bech = nip19?.neventEncode
        ? nip19.neventEncode({ id: parentEvt.id, author: parentEvt.pubkey })
        : (nip19?.noteEncode ? nip19.noteEncode(parentEvt.id) : null);
      if (bech) ref = `https://primal.net/e/${bech}`;
    } catch {}
  } catch {}
  if (!ref) {
    // Fallback: widely supported event link service
    ref = `https://njump.me/${parentEvt.id}`;
  }
  const arrow = '↪️';
  const content = quoteText ? `${String(quoteText)}\n\n${arrow} ${ref}` : `${arrow} ${ref}`;
  return {
    kind: 1,
    created_at,
    // Mark the event tag as a mention to indicate a quote reference (NIP-18 compatible)
    tags: [ ['e', parentEvt.id, '', 'mention'], ['p', parentEvt.pubkey] ],
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

module.exports = { buildTextNote, buildReplyNote, buildReaction, buildRepost, buildQuoteRepost, buildContacts, buildDirectMessage, buildMuteList };
