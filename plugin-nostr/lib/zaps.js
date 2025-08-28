// Helpers for NIP-57 zap receipts (kind 9735)

function parseBolt11Msats(bolt11) {
  try {
    if (!bolt11 || typeof bolt11 !== 'string') return null;
    const m = bolt11.match(/([0-9]+)(m|u|n|p)?/i); // amount with unit
    if (!m) return null;
    const amountInt = Number(m[1]);
    if (!Number.isFinite(amountInt)) return null;
    const suffix = (m[2] || '').toLowerCase();
    let msats;
    switch (suffix) {
      case 'm': // milliBTC -> msats: amount * 100_000_000
        msats = amountInt * 100_000_000;
        break;
      case 'u': // microBTC -> msats: amount * 100_000
        msats = amountInt * 100_000;
        break;
      case 'n': // nanoBTC -> msats: amount * 100
        msats = amountInt * 100;
        break;
      case 'p': // picoBTC -> msats: amount * 0.1 -> round to nearest int
        msats = Math.round(amountInt / 10);
        break;
      default: // BTC -> msats: amount * 100_000_000_000
        msats = amountInt * 100_000_000_000;
        break;
    }
    return Number.isFinite(msats) && msats > 0 ? msats : null;
  } catch {
    return null;
  }
}

function getZapAmountMsats(evt) {
  if (!evt || !Array.isArray(evt.tags)) return null;
  // Try explicit 'amount' tag first (millisats)
  const amountTag = evt.tags.find((t) => t && t[0] === 'amount' && t[1]);
  if (amountTag) {
    const n = Number(amountTag[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Fallback: try to find a bolt11 tag (ln invoice) and parse a rough amount
  const bolt11Tag = evt.tags.find((t) => t && (t[0] === 'bolt11' || t[0] === 'invoice') && t[1]);
  if (bolt11Tag) {
    const ms = parseBolt11Msats(String(bolt11Tag[1]));
    if (ms) return ms;
  }
  return null;
}

function getZapTargetEventId(evt) {
  if (!evt || !Array.isArray(evt.tags)) return null;
  const e = evt.tags.find((t) => t && t[0] === 'e' && t[1]);
  return e ? e[1] : null;
}

function generateThanksText(amountMsats) {
  const base = [
    'you absolute legend',
    'infinite gratitude',
    'pure joy unlocked',
    'entropy temporarily defeated',
  ];
  const pick = () => base[Math.floor(Math.random() * base.length)];
  if (!amountMsats) {
    return `zap received — ${pick()} ⚡️💛`; 
  }
  const sats = Math.floor(amountMsats / 1000);
  if (sats >= 10000) return `⚡️ ${sats} sats, i’m screaming, thank you!! ${pick()} 🙏💛`;
  if (sats >= 1000) return `⚡️ ${sats} sats, massive thanks! ${pick()} 🙌`;
  if (sats >= 100) return `⚡️ ${sats} sats, thank you, truly! ${pick()} ✨`;
  return `⚡️ ${sats} sats, appreciated! ${pick()} ✨`;
}

// Extract the actual zapper (user) pubkey from the NIP-57 description tag
function getZapSenderPubkey(evt) {
  try {
    if (!evt || !Array.isArray(evt.tags)) return null;
    const descTag = evt.tags.find((t) => t && t[0] === 'description' && typeof t[1] === 'string');
    if (!descTag) return null;
    const raw = descTag[1];
    // Description should be a JSON-serialized Nostr event (zap request)
    try {
      const obj = JSON.parse(raw);
      const pk = obj && typeof obj.pubkey === 'string' ? obj.pubkey : null;
      if (pk && /^[0-9a-fA-F]{64}$/.test(pk)) return pk.toLowerCase();
    } catch {
      // Fallback: regex search for a pubkey field
      const m = raw.match(/"pubkey"\s*:\s*"([0-9a-fA-F]{64})"/);
      if (m && m[1]) return m[1].toLowerCase();
    }
  } catch {}
  return null;
}

module.exports = {
  getZapAmountMsats,
  getZapTargetEventId,
  generateThanksText,
  getZapSenderPubkey,
  parseBolt11Msats,
};
