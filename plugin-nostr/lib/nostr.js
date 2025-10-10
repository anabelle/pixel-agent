// Nostr-specific parsing helpers

// Configurable topic extraction limit (defaults to 15 to surface more than just top 3)
const EXTRACTED_TOPICS_LIMIT = (() => {
  const envVal = parseInt(process.env.EXTRACTED_TOPICS_LIMIT, 10);
  if (Number.isFinite(envVal) && envVal > 0) return envVal;
  return 15;
})();

function getConversationIdFromEvent(evt) {
  try {
    const eTags = Array.isArray(evt?.tags) ? evt.tags.filter((t) => t[0] === 'e') : [];
    const root = eTags.find((t) => t[3] === 'root');
    if (root && root[1]) return root[1];
    if (eTags.length && eTags[0][1]) return eTags[0][1];
  } catch {}
  return evt?.id || 'nostr';
}

const FORBIDDEN_TOPIC_WORDS = new Set([
  'pixel',
  'art',
  'lnpixels',
  'vps',
  'freedom',
  'creativity',
  'survival',
  'collaborative',
  'douglas',
  'adams',
  'pratchett',
  'terry'
]);

// Terms too generic/common for timeline lore and watchlist - focus on specific topics instead
const TIMELINE_LORE_IGNORED_TERMS = new Set([
  'bitcoin',
  'btc',
  'nostr',
  'crypto',
  'cryptocurrency',
  'blockchain',
  'decentralized',
  'lightning',
  'ln',
  'sats',
  'satoshis',
  'web3',
  'protocol',
  'network',
  'technology',
  'tech',
  'development',
  'community',
  'discussion',
  'conversation',
  'post',
  'posts',
  'posting',
  'update',
  'updates',
  'news',
  'today',
  'yesterday',
  'tomorrow'
]);

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'here', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'let',
  'like', 'make', 'me', 'my', 'of', 'on', 'or', 'our', 'out', 'put', 'say', 'see', 'she', 'so', 'some',
  'than', 'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'those', 'to', 'up', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
  'yours', 'thanks', 'thank', 'hey', 'hi', 'hmm', 'ok', 'okay', 'got', 'mean', 'means', 'know', 'right',
  'especially', 'because', 'ever', 'just', 'really', 'very', 'much', 'more'
]);

// Extra noise tokens to ignore in fallback topic extraction
const NOISE_TOKENS = new Set(['src', 'ref', 'utm', 'twsrc', 'tfw']);

function _cleanAndTokenizeText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const stripped = rawText
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/nostr:[a-z0-9]+\b/gi, ' ')
    // Remove common tracking/query artifacts that can pollute topics
    .replace(/[?&](utm_[a-z]+|ref_src|twsrc|ref|src)=[^\s]*/gi, ' ')
    .replace(/\b(utm_[a-z]+|ref_src|twsrc|ref|src)\b/gi, ' ');
  const tokens = stripped
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}\-']*/gu);
  if (!tokens) return [];
  return tokens.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

const _candidateScores = new Map();

function _isMeaningfulToken(token) {
  if (!token) return false;
  if (STOPWORDS.has(token)) return false;
  if (NOISE_TOKENS.has(token)) return false;
  if (FORBIDDEN_TOPIC_WORDS.has(token)) return false;
  if (TIMELINE_LORE_IGNORED_TERMS.has(token)) return false;
  return /[a-z0-9]/i.test(token);
}

function _scoreCandidate(candidate, weight) {
  if (!candidate) return;
  const current = _candidateScores.get(candidate) || 0;
  _candidateScores.set(candidate, current + weight);
}

function _resetCandidateScores() {
  _candidateScores.clear();
}

function _extractFallbackTopics(content, maxTopics = EXTRACTED_TOPICS_LIMIT) {
  const singles = _cleanAndTokenizeText(content);
  if (!singles.length) return [];

  _resetCandidateScores();

  for (const token of singles) {
    if (_isMeaningfulToken(token)) {
      _scoreCandidate(token, 1);
    }
  }

  for (let i = 0; i < singles.length - 1; i++) {
    const first = singles[i];
    const second = singles[i + 1];
    if (!first || !second || first === second) continue;
    if (!_isMeaningfulToken(first) && !_isMeaningfulToken(second)) continue;
    const candidate = `${first} ${second}`;
    if (candidate.length > 2 && !FORBIDDEN_TOPIC_WORDS.has(candidate)) {
      _scoreCandidate(candidate, 2);
    }
  }

  const sorted = Array.from(_candidateScores.entries())
    .filter(([candidate]) => {
      if (!candidate) return false;
      if (candidate.includes('http')) return false;
      const parts = candidate.split(' ');
      return parts.some((part) => _isMeaningfulToken(part));
    })
    .sort((a, b) => b[1] - a[1]);

  const results = [];
  for (const [candidate] of sorted) {
    if (results.length >= maxTopics) break;
    if (results.includes(candidate)) continue;
    results.push(candidate);
  }

  return results;
}

// Per-runtime topic extractor instances for batching/caching
const _topicExtractors = new Map();

function _getTopicExtractor(runtime) {
  const key = runtime?.agentId || 'default';
  
  if (!_topicExtractors.has(key)) {
    const { TopicExtractor } = require('./topicExtractor');
    _topicExtractors.set(key, new TopicExtractor(runtime, runtime?.logger));
  }
  
  return _topicExtractors.get(key);
}

function getTopicExtractorStats(runtime) {
  const extractor = _topicExtractors.get(runtime?.agentId || 'default');
  return extractor ? extractor.getStats() : null;
}

async function destroyTopicExtractor(runtime) {
  const key = runtime?.agentId || 'default';
  const extractor = _topicExtractors.get(key);
  
  if (extractor) {
    // Flush any pending events before destroying
    await extractor.flush();
    extractor.destroy();
    _topicExtractors.delete(key);
  }
}

async function extractTopicsFromEvent(event, runtime) {
  if (!event || !event.content) return [];

  const runtimeLogger = runtime?.logger;
  const debugLog = typeof runtimeLogger?.debug === 'function'
    ? runtimeLogger.debug.bind(runtimeLogger)
    : null;

  debugLog?.(`[NOSTR] Extracting topics for ${event.id?.slice(0, 8) || 'unknown'}`);

  try {
    const extractor = _getTopicExtractor(runtime);
    const topics = await extractor.extractTopics(event);
    
    if (debugLog) {
      debugLog(`[NOSTR] Final topics for ${event.id?.slice(0, 8)}: [${topics.join(', ')}]`);
    }
    
    return topics;
  } catch (error) {
    const message = error?.message || String(error);
    debugLog?.(`[NOSTR] Topic extraction failed: ${message}`);
    
    // Fallback to fast extraction
    return _extractFallbackTopics(event.content, EXTRACTED_TOPICS_LIMIT);
  }
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
  const secp = _getSecpOptional();
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

    // Prefer nostr-tools if available
    if (decryptFn) {
      const privHex = _normalizePrivKeyHex(privateKey) || privateKey;
      const decrypted = await decryptFn(privHex, peerPubkey, evt.content);
      if (decrypted) return decrypted;
    }

    // Fallback to manual NIP-04 decryption (optional)
    try {
      const decrypted = await decryptNIP04Manual(privateKey, peerPubkey, evt.content);
      if (decrypted) return decrypted;
    } catch (manualError) {
      // Keep this quiet in production; tools path usually works and we don't want noisy logs
      console.debug?.('[NOSTR] Manual NIP-04 decryption failed (optional):', manualError.message);
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

// Internal: optional noble require via shared-secret helper
function _getSecpOptional() {
  try {
    return require('@noble/secp256k1');
  } catch (e) {
    throw new Error('SECP256K1_NOT_AVAILABLE');
  }
}

module.exports = {
  getConversationIdFromEvent,
  extractTopicsFromEvent,
  getTopicExtractorStats,
  destroyTopicExtractor,
  isSelfAuthor,
  decryptDirectMessage,
  decryptNIP04Manual,
  encryptNIP04Manual,
  TIMELINE_LORE_IGNORED_TERMS,
  FORBIDDEN_TOPIC_WORDS,
  EXTRACTED_TOPICS_LIMIT,
};
