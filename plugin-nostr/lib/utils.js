// Extracted small pure helpers from index.js for testability

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
    const { nip19 } = require('@nostr/tools');

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
    const { nip19 } = require('@nostr/tools');

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
    const { nip19 } = require('@nostr/tools');

    if (uri.startsWith('nostr:')) {
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
};
