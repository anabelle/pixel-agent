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

function _bytesToHex(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return '';
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function _normalizePrivKeyHex(privateKey) {
  if (!privateKey) return null;
  if (typeof privateKey === 'string') return privateKey.toLowerCase();
  if (privateKey instanceof Uint8Array || Array.isArray(privateKey)) return _bytesToHex(privateKey);
  // Try Buffer
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(privateKey)) return privateKey.toString('hex');
  return null;
}

function _getSharedXHex(privateKey, peerPubkeyHex) {
  const secp = require('@noble/secp256k1');
  const shared = secp.getSharedSecret(privateKey, '02' + peerPubkeyHex); // compressed
  if (typeof shared === 'string') {
    // Drop prefix byte (2 chars) and keep next 64 chars (32 bytes X)
    return shared.length >= 66 ? shared.slice(2, 66) : shared;
  }
  // Uint8Array: first byte is prefix, next 32 bytes are X
  if (shared && shared.length >= 33) {
    const xBytes = shared.length === 32 ? shared : shared.slice(1, 33);
    return _bytesToHex(xBytes);
  }
  return _bytesToHex(shared);
}

async function decryptDirectMessage(evt, privateKey, publicKey, decryptFn) {
  if (!evt || evt.kind !== 4 || !privateKey || !publicKey) return null;
  try {
    // Find the recipient pubkey from tags
    const recipientTag = evt.tags.find(tag => tag[0] === 'p');
    if (!recipientTag || !recipientTag[1]) return null;

  const recipientPubkey = String(recipientTag[1]).toLowerCase();
  const senderPubkey = String(evt.pubkey).toLowerCase();
  const selfPubkey = String(publicKey).toLowerCase();

    // Determine which key to use for decryption
    // If we're the recipient, use sender's pubkey; if we're the sender, use recipient's pubkey
  const peerPubkey = (recipientPubkey === selfPubkey) ? senderPubkey : recipientPubkey;

    // Try manual NIP-04 decryption first
    try {
      const decrypted = await decryptNIP04Manual(privateKey, peerPubkey, evt.content);
      if (decrypted) return decrypted;
    } catch (manualError) {
      console.warn('[NOSTR] Manual NIP-04 decryption failed:', manualError.message);
    }

    // Fallback to nostr-tools if available
    if (decryptFn) {
      const privHex = _normalizePrivKeyHex(privateKey) || privateKey;
      const decrypted = await decryptFn(privHex, peerPubkey, evt.content);
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
  const priv = _normalizePrivKeyHex(privateKey) || privateKey;
  const sharedX = _getSharedXHex(priv, String(peerPubkey).toLowerCase());

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

// Manual NIP-04 decryption implementation
async function decryptNIP04Manual(privateKey, peerPubkey, encryptedContent) {
  try {
    const crypto = require('crypto');

    if (!encryptedContent || typeof encryptedContent !== 'string') {
      throw new Error('Missing encrypted content');
    }

    const [ciphertextB64, ivPart] = encryptedContent.split('?iv=');
    if (!ciphertextB64 || !ivPart) {
      throw new Error('Invalid NIP-04 payload format');
    }

    const iv = Buffer.from(ivPart, 'base64');
    if (iv.length !== 16) {
      throw new Error('Invalid IV length');
    }

  // Calculate shared secret
  const priv = _normalizePrivKeyHex(privateKey) || privateKey;
  const sharedX = _getSharedXHex(priv, String(peerPubkey).toLowerCase());

    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(sharedX, 'hex'),
      iv
    );

    let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error(`Manual NIP-04 decryption failed: ${error.message}`);
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
