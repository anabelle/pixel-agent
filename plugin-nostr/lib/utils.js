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

module.exports = {
  hexToBytesLocal,
  bytesToHexLocal,
  parseRelays,
  normalizeSeconds,
  pickRangeWithJitter,
};
