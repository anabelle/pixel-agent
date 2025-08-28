// Key parsing helpers extracted from index.js for testability
const { hexToBytesLocal, bytesToHexLocal } = require('./utils');

function parseSk(input, nip19) {
  if (!input) return null;
  try {
    if (typeof input === 'string' && input.startsWith('nsec1')) {
      const decoded = nip19?.decode ? nip19.decode(input) : null;
      if (decoded && decoded.type === 'nsec') return decoded.data;
    }
  } catch {}
  const bytes = hexToBytesLocal(input);
  return bytes || null;
}

// Allow listening with only a public key (hex or npub1)
function parsePk(input, nip19) {
  if (!input) return null;
  try {
    if (typeof input === 'string' && input.startsWith('npub1')) {
      const decoded = nip19?.decode ? nip19.decode(input) : null;
      if (decoded && decoded.type === 'npub') return decoded.data; // hex string
    }
  } catch {}
  const bytes = hexToBytesLocal(input);
  if (bytes) return bytesToHexLocal(bytes);
  if (typeof input === 'string' && /^[0-9a-fA-F]{64}$/.test(input)) return input.toLowerCase();
  return null;
}

module.exports = { parseSk, parsePk };
