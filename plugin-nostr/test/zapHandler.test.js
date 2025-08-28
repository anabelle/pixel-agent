const { describe, it, expect } = globalThis;
const { buildZapThanksPost } = require('../lib/zapHandler.js');

function makeEvt(id, pubkey, tags = []) { return { kind: 9735, id, pubkey, tags, content: '' }; }

describe('zapHandler buildZapThanksPost', () => {
  const nip19 = { npubEncode: (hex) => `npub1_${hex.slice(0,6)}` };

  it('targets original event when e tag present and mentions giver with npub', () => {
    const sender = 'a'.repeat(64);
    const target = 'abc123';
    const evt = makeEvt('receipt1', 'giver', [['amount','25000'], ['e', target]]);
    const thanksText = 'thanks a lot!';
    const out = buildZapThanksPost(evt, { amountMsats: 25000, senderPubkey: sender, targetEventId: target, nip19, thanksText });
    expect(out.parent).toBe(target);
    expect(out.options.skipReaction).toBe(true);
    expect(out.options.expectMentionPk).toBe(sender);
    expect(out.options.extraPTags).toEqual([sender]);
    expect(out.text).toContain('nostr:npub1_aaaaaa');
  });

  it('targets receipt when no e tag and still mentions giver if hex', () => {
    const sender = 'b'.repeat(64);
    const evt = makeEvt('receipt2', 'giver', [['amount','1000']]);
    const out = buildZapThanksPost(evt, { amountMsats: 1000, senderPubkey: sender, targetEventId: null, nip19, thanksText: 'ty' });
    expect(out.parent).toBe(evt);
    expect(out.options.extraPTags).toEqual([sender]);
    expect(out.text).toContain('nostr:npub1_bbbbbb');
  });

  it('does not add npub mention when sender missing or invalid', () => {
    const evt = makeEvt('receipt3', 'giver', [['amount','1000']]);
    const out = buildZapThanksPost(evt, { amountMsats: 1000, senderPubkey: null, targetEventId: null, nip19, thanksText: 'ty' });
    expect(out.text).toBe('ty');
    expect(out.options.extraPTags).toEqual([]);
    expect(out.options.expectMentionPk).toBeUndefined();
  });
});
