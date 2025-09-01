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

function isSelfAuthor(evt, selfPkHex) {
  if (!evt || !evt.pubkey || !selfPkHex) return false;
  try {
    return String(evt.pubkey).toLowerCase() === String(selfPkHex).toLowerCase();
  } catch {
    return false;
  }
}

async function decryptDirectMessage(evt, privateKey, publicKey, decryptFn) {
  if (!evt || evt.kind !== 4 || !privateKey || !publicKey) return null;
  try {
    // Find the recipient pubkey from tags
    const recipientTag = evt.tags.find(tag => tag[0] === 'p');
    if (!recipientTag || !recipientTag[1]) return null;

    const recipientPubkey = recipientTag[1];
    const senderPubkey = evt.pubkey;

    // Determine which key to use for decryption
    // If we're the recipient, use sender's pubkey; if we're the sender, use recipient's pubkey
    const peerPubkey = (recipientPubkey === publicKey) ? senderPubkey : recipientPubkey;

    // Try manual NIP-04 decryption first
    try {
      const decrypted = await decryptNIP04Manual(privateKey, peerPubkey, evt.content);
      if (decrypted) return decrypted;
    } catch (manualError) {
      console.warn('[NOSTR] Manual NIP-04 decryption failed:', manualError.message);
    }

    // Fallback to nostr-tools if available
    if (decryptFn) {
      const decrypted = await decryptFn(privateKey, peerPubkey, evt.content);
      console.info('[NOSTR] Fallback NIP-04 decryption succeeded');
      return decrypted;
    }

    return null;
  } catch (error) {
    console.warn('[NOSTR] Failed to decrypt DM:', error.message);
    return null;
  }
}

// Manual NIP-04 encryption implementation
async function encryptNIP04Manual(privateKey, peerPubkey, message) {
  try {
    const crypto = require('crypto');
    const secp = require('@noble/secp256k1');

    // Calculate shared secret
    const sharedPoint = secp.getSharedSecret(privateKey, "02" + peerPubkey);
    const sharedX = sharedPoint.substr(2, 64);

    // Generate random IV
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(sharedX, "hex"),
      iv
    );

    // Encrypt the message
    let encrypted = cipher.update(message, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Combine encrypted message and IV
    const encryptedContent = `${encrypted}?iv=${iv.toString("base64")}`;

    return encryptedContent;
  } catch (error) {
    throw new Error(`Manual NIP-04 encryption failed: ${error.message}`);
  }
}

module.exports = {
  getConversationIdFromEvent,
  extractTopicsFromEvent,
  isSelfAuthor,
  decryptDirectMessage,
  decryptNIP04Manual,
  encryptNIP04Manual,
};
