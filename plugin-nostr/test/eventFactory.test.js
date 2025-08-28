const { describe, it, expect } = globalThis;
const { buildTextNote, buildReplyNote, buildReaction, buildContacts } = require('../lib/eventFactory.js');

describe('eventFactory', () => {
  it('buildTextNote constructs kind 1', () => {
    const evt = buildTextNote('hello');
    expect(evt.kind).toBe(1);
    expect(evt.content).toBe('hello');
    expect(Array.isArray(evt.tags)).toBe(true);
  });

  it('buildReplyNote includes e and p tags', () => {
    const parent = { id: 'abcd', pubkey: 'pk' };
    const evt = buildReplyNote(parent, 'ok', {});
    expect(evt.kind).toBe(1);
    const eTags = evt.tags.filter(t => t[0] === 'e');
    const pTags = evt.tags.filter(t => t[0] === 'p');
    expect(eTags.some(t => t[1] === 'abcd')).toBe(true);
    expect(pTags.some(t => t[1] === 'pk')).toBe(true);
  });

  it('buildReplyNote adds root when different', () => {
    const parent = { id: 'reply', pubkey: 'pk', refs: { rootId: 'root' } };
    const evt = buildReplyNote(parent, 'ok', {});
    const eTags = evt.tags.filter(t => t[0] === 'e');
    expect(eTags.find(t => t[3] === 'reply')).toBeTruthy();
    expect(eTags.find(t => t[3] === 'root')).toBeTruthy();
  });

  it('buildReaction kind 7 structure', () => {
    const parent = { id: 'x', pubkey: 'y' };
    const evt = buildReaction(parent, '+');
    expect(evt.kind).toBe(7);
    const eTag = evt.tags.find(t => t[0] === 'e');
    const pTag = evt.tags.find(t => t[0] === 'p');
    expect(eTag[1]).toBe('x');
    expect(pTag[1]).toBe('y');
  });

  it('buildContacts builds p tags', () => {
    const evt = buildContacts(['a','b']);
    expect(evt.kind).toBe(3);
    const pTags = evt.tags.filter(t => t[0] === 'p');
    expect(pTags.map(t => t[1])).toEqual(['a','b']);
  });
});
