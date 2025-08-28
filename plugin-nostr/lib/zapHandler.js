"use strict";

function isHex64(s) { return typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s); }

function buildZapThanksPost(evt, { amountMsats, senderPubkey, targetEventId, nip19, thanksText }) {
  let text = thanksText || '';
  const options = { extraPTags: [], skipReaction: true };

  // Add mention to giver if valid hex and nip19 is available
  if (isHex64(senderPubkey) && nip19 && typeof nip19.npubEncode === 'function') {
    try {
      const npub = nip19.npubEncode(senderPubkey);
      if (npub) {
        text = text ? `${text} nostr:${npub}` : `nostr:${npub}`;
      }
    } catch {}
    options.extraPTags.push(senderPubkey);
    options.expectMentionPk = senderPubkey;
  }

  // Parent target: original event if present, else the receipt itself
  const parent = targetEventId || evt;

  return { text, parent, options };
}

module.exports = { buildZapThanksPost };
