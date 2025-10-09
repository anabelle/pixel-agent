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

  // Extract hashtags first
  const hashtags = content.match(/#\w+/g) || [];
  topics.push(...hashtags.map((h) => h.slice(1)));

   // Use LLM to extract additional topics
   if (runtime?.useModel) {
     try {
          const truncatedContent = event.content.slice(0, 800);
          const prompt = `What are the main topics in this post? Give 1-3 specific topics.

Rules:
- ONLY use topics that are actually mentioned or clearly implied in the post
- Do NOT invent or add topics that aren't in the post
- NEVER include these words: pixel, art, lnpixels, vps, freedom, creativity, survival, collaborative, douglas, adams, pratchett, terry
- Be specific, not general
- If about a person, country, or event, use that as a topic
- No words like "general", "discussion", "various"
- Only respond with 'none' if the post truly contains no meaningful words or context (e.g., empty or just symbols)
- For short greetings or brief statements, choose the closest meaningful topic (e.g., 'greetings', 'motivation', 'bitcoin', the named person, etc.)
- If the post includes hashtags, named entities, or obvious subjects, use those as topics instead of 'none'
- Never answer with 'none' when any real words, hashtags, or references are present—pick the best fitting topic
- Respond with only the topics separated by commas on a single line
- Maximum 3 topics
- The post content is provided inside <POST_TO_ANALYZE> tags at the end.

THE POST TO ANALYZE IS THIS AND ONLY THIS TEXT. DO NOT USE ANY OTHER INFORMATION.
<POST_TO_ANALYZE>${truncatedContent}</POST_TO_ANALYZE>`;

       const response = await runtime.useModel('TEXT_SMALL', {
         prompt,
         maxTokens: 60,
         temperature: 0.3
       });

        if (response?.text) {
          const responseTrimmed = response.text.trim().toLowerCase();

          // Handle "none" response for posts with no clear topics
          if (responseTrimmed !== 'none') {
            const forbiddenWords = ['pixel', 'art', 'lnpixels', 'vps', 'freedom', 'creativity', 'survival', 'collaborative', 'douglas', 'adams', 'pratchett', 'terry'];
            const llmTopics = responseTrimmed
              .split(',')
              .map(t => t.trim())
              .filter(t => t.length > 0 && t.length < 500) // Reasonable length
              .filter(t => t !== 'general' && t !== 'various' && t !== 'discussion' && t !== 'none') // Filter out vague terms
              .filter(t => !forbiddenWords.includes(t.toLowerCase())); // Filter out forbidden words
            topics.push(...llmTopics);
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
};
