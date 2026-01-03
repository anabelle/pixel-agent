// Extracted small pure helpers from index.js for testability

/**
 * Sanitize text to remove invalid Unicode surrogate pairs that break PostgreSQL JSON parsing.
 * Removes lone high surrogates (U+D800-U+DBFF) not followed by low surrogates (U+DC00-U+DFFF),
 * and lone low surrogates not preceded by high surrogates.
 * @param {string} text - Input text that may contain malformed Unicode
 * @returns {string} - Sanitized text safe for JSON storage
 */
function sanitizeUnicode(text) {
  if (typeof text !== 'string') return text;
  // Remove lone surrogates that would break JSON parsing
  // Handle both high surrogates without low surrogates and vice versa
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      // High surrogate - check if followed by low surrogate
      const nextCode = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        // Valid surrogate pair - keep both
        result += text[i] + text[i + 1];
        i++; // Skip the low surrogate
      } else {
        // Lone high surrogate - replace with replacement character
        result += '\uFFFD';
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Lone low surrogate (not preceded by high) - replace
      result += '\uFFFD';
    } else {
      // Normal character
      result += text[i];
    }
  }
  return result;
}

function hexToBytesLocal(hex) {
  if (typeof hex !== "string") return null;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHexLocal(bytes) {
  if (!bytes || typeof bytes.length !== "number") return "";
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseRelays(input) {
  if (!input) return [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.snort.social",
  ];
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeSeconds(val, keyName) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  if (n % 1000 === 0) {
    const sec = n / 1000;
    if (sec >= 1 && sec <= 7 * 24 * 3600) {
      return sec;
    }
  }
  return n;
}

function pickRangeWithJitter(minSec, maxSec) {
  return minSec + Math.floor(Math.random() * Math.max(1, maxSec - minSec));
}

// NIP-21 URI utilities for nostr:nevent and nostr:nprofile
function generateNostrUri(eventId, authorPubkey, relays = []) {
  try {
    // Lazy require to avoid hard dependency during simple tests
    let nip19 = null;
    try {
      const tools = require('nostr-tools');
      nip19 = tools?.nip19 || tools?.default?.nip19;
    } catch (e) {
      // ES module issue, fallback
    }

    if (authorPubkey && nip19?.neventEncode) {
      // Generate nevent (includes author and optional relays)
      const neventData = { id: eventId, author: authorPubkey };
      if (relays && relays.length > 0) {
        neventData.relays = relays;
      }
      const bech = nip19.neventEncode(neventData);
      return `nostr:${bech}`;
    } else if (nip19?.noteEncode) {
      // Fallback to note (just event ID)
      const bech = nip19.noteEncode(eventId);
      return `nostr:${bech}`;
    }
  } catch (error) {
    console.warn('[NOSTR] Failed to generate Nostr URI:', error.message);
  }

  // Final fallback: use njump.me as a widely supported event link service
  return `https://njump.me/${eventId}`;
}

function generateNostrProfileUri(pubkey, relays = []) {
  try {
    // Lazy require to avoid hard dependency during simple tests
    let nip19 = null;
    try {
      const tools = require('nostr-tools');
      nip19 = tools?.nip19 || tools?.default?.nip19;
    } catch (e) {
      // ES module issue, fallback
    }

    if (nip19?.nprofileEncode) {
      const nprofileData = { pubkey };
      if (relays && relays.length > 0) {
        nprofileData.relays = relays;
      }
      const bech = nip19.nprofileEncode(nprofileData);
      return `nostr:${bech}`;
    } else if (nip19?.npubEncode) {
      // Fallback to npub
      const bech = nip19.npubEncode(pubkey);
      return `nostr:${bech}`;
    }
  } catch (error) {
    console.warn('[NOSTR] Failed to generate Nostr profile URI:', error.message);
  }

  // Final fallback: use njump.me as a widely supported profile link service
  return `https://njump.me/${pubkey}`;
}

function parseNostrUri(uri) {
  if (!uri || typeof uri !== 'string') return null;

  try {
    // Lazy require to avoid hard dependency during simple tests
    let nip19 = null;
    try {
      const tools = require('nostr-tools');
      nip19 = tools?.nip19 || tools?.default?.nip19;
    } catch (e) {
      // ES module issue, fallback
    }

    if (nip19 && uri.startsWith('nostr:')) {
      const bech32 = uri.slice(6); // Remove 'nostr:' prefix
      const decoded = nip19.decode(bech32);

      return {
        type: decoded.type,
        data: decoded.data,
        relays: decoded.data.relays || []
      };
    }
  } catch (error) {
    console.warn('[NOSTR] Failed to parse Nostr URI:', error.message);
  }

  return null;
}

module.exports = {
  hexToBytesLocal,
  bytesToHexLocal,
  parseRelays,
  normalizeSeconds,
  pickRangeWithJitter,
  generateNostrUri,
  generateNostrProfileUri,
  parseNostrUri,
  sanitizeUnicode,
};
