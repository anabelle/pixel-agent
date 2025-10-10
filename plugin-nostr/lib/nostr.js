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

async function extractTopicsFromEvent(event, runtime) {
  if (!event || !event.content) return [];

  const runtimeLogger = runtime?.logger;
  const debugLog = typeof runtimeLogger?.debug === 'function'
    ? runtimeLogger.debug.bind(runtimeLogger)
    : null;
  const warnLog = typeof runtimeLogger?.warn === 'function'
    ? runtimeLogger.warn.bind(runtimeLogger)
    : null;

  debugLog?.(`[NOSTR] Extracting topics for ${event.id?.slice(0, 8) || 'unknown'}`);
  const content = event.content.toLowerCase();
  const topics = [];
  let llmCleanedTopics = [];

  // Helper: sanitize a single topic string from LLM or hashtags
  const sanitizeTopic = (t) => {
    if (!t || typeof t !== 'string') return '';
    let s = t
      .trim()
      // strip leading list bullets/quotes/arrows
      .replace(/^[-–—•*>"]+\s*/g, '')
      // remove URLs and nostr: handles
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/nostr:[a-z0-9]+\b/gi, ' ')
      // collapse punctuation noise to spaces
      .replace(/[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}\p{S}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    // keep multi-word entities; final lightweight guardrails
    if (!s || s.length < 2 || s.length > 100) return '';
    // ignore pure numbers
    if (/^\d+$/.test(s)) return '';
    return s;
  };

  // Extract hashtags first (apply same ignore rules)
  const hashtags = content.match(/#\w+/g) || [];
  const hashtagTopics = hashtags
    .map((h) => sanitizeTopic(h.slice(1)))
    .filter((t) => t && !FORBIDDEN_TOPIC_WORDS.has(t) && !TIMELINE_LORE_IGNORED_TERMS.has(t));
  if (hashtagTopics.length && debugLog) {
    debugLog(`[NOSTR] Hashtag topics for ${event.id?.slice(0, 8)}: [${hashtagTopics.join(', ')}]`);
  }
  topics.push(...hashtagTopics);

   // Use LLM to extract additional topics
   if (runtime?.useModel) {
     try {
          const truncatedContent = event.content.slice(0, 800);
     const prompt = `Extract main topics from this post. Give up to ${EXTRACTED_TOPICS_LIMIT} specific topics.

Rules:
- Use ONLY topics actually mentioned or clearly implied
- Prefer: proper names, specific projects, events, tools, concepts, places
- Avoid: bitcoin, btc, nostr, crypto, blockchain, lightning, technology, community, discussion, general, various, update, news
- For people/events/places: use their actual names
- Never respond with: pixel, art, lnpixels, vps, freedom, creativity, survival, collaborative, douglas, adams, pratchett, terry
- If post has hashtags/entities: use those as topics
- Short posts: pick most meaningful topic (not generic)
- No real words/hashtags? Respond 'none'
- Output: topics separated by commas, max ${EXTRACTED_TOPICS_LIMIT}

<POST_TO_ANALYZE>${truncatedContent}</POST_TO_ANALYZE>`;

       const llmMaxTokens = Math.min(200, Math.max(60, EXTRACTED_TOPICS_LIMIT * 8));
       const response = await runtime.useModel('TEXT_SMALL', {
         prompt,
         maxTokens: llmMaxTokens,
         temperature: 0.3
       });

        const responseText = typeof response === 'string'
          ? response
          : (response?.text ?? '');

        if (responseText) {
          // Trim outer whitespace/newlines first, then lowercase
          const responseTrimmed = String(responseText).trim();

          // Handle "none" style responses for posts with no clear topics
          if (responseTrimmed.toLowerCase() !== 'none') {
            // Split on commas OR newlines to handle different model output formats
            const rawTopics = responseTrimmed
              .split(/[\,\n]+/)
              .map((t) => t.trim())
              .filter((t) => t && t.length < 500);

            const cleanedTopics = rawTopics
              .map((t) => sanitizeTopic(t))
              .filter(Boolean)
              // remove obvious noise after sanitize
              .filter((t) => t !== 'general' && t !== 'various' && t !== 'discussion' && t !== 'none')
              .filter((t) => !/^(https?:\/\/|www\.)/i.test(t))
              .filter((t) => !FORBIDDEN_TOPIC_WORDS.has(t))
              .filter((t) => !TIMELINE_LORE_IGNORED_TERMS.has(t))
              // drop nostr bech32 identifiers that slipped through
              .filter((t) => !/\b(nprofile1|npub1|nevent1|naddr1|note1)[a-z0-9]+/i.test(t));

            if (debugLog) {
              debugLog(`[NOSTR] LLM raw topics for ${event.id?.slice(0, 8)}: [${rawTopics.join(' | ')}]`);
              debugLog(`[NOSTR] LLM cleaned topics for ${event.id?.slice(0, 8)}: [${cleanedTopics.join(', ')}]`);
            }

            // Prefer LLM topics explicitly
            llmCleanedTopics = cleanedTopics.slice(0, EXTRACTED_TOPICS_LIMIT);
          }
        }
    } catch (error) {
      // Fallback to empty if LLM fails
      const message = error?.message || String(error);
      if (warnLog) {
        warnLog(`[NOSTR] LLM topic extraction failed: ${message}`);
      } else if (debugLog) {
        debugLog(`[NOSTR] LLM topic extraction failed: ${message}`);
      }
    }
  }

  // Merge hashtags + LLM topics, then dedupe and cap
  const merged = [...topics, ...llmCleanedTopics];
  let uniqueTopics = Array.from(new Set(merged)).filter(Boolean);
  if (uniqueTopics.length > EXTRACTED_TOPICS_LIMIT) uniqueTopics.length = EXTRACTED_TOPICS_LIMIT;

  if (!uniqueTopics.length) {
    // Log if we had LLM topics but they were filtered out by merging/dedupe stage
    if (llmCleanedTopics.length > 0 && debugLog) {
      debugLog(`[NOSTR] Warning: LLM provided topics but none survived merge/filter for ${event.id?.slice(0, 8)}: [${llmCleanedTopics.join(', ')}]`);
    }
    const fallbackTopics = _extractFallbackTopics(event.content, EXTRACTED_TOPICS_LIMIT);
    if (fallbackTopics.length) {
      debugLog?.(`[NOSTR] Topic fallback used for ${event.id?.slice(0, 8) || 'unknown'} -> ${fallbackTopics.join(', ')}`);
      uniqueTopics.push(...fallbackTopics.slice(0, EXTRACTED_TOPICS_LIMIT));
    }
  }

  if (debugLog) {
    debugLog(`[NOSTR] Final topics for ${event.id?.slice(0, 8)}: [${uniqueTopics.join(', ')}]`);
  }
  return uniqueTopics;
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
  isSelfAuthor,
  decryptDirectMessage,
  decryptNIP04Manual,
  encryptNIP04Manual,
  TIMELINE_LORE_IGNORED_TERMS,
  FORBIDDEN_TOPIC_WORDS,
};
