const { describe, it, expect } = globalThis;
const { parseSk, parsePk } = require('../lib/keys.js');

// minimal nip19 stub
const nip19 = {
  decode: (s) => {
    if (s.startsWith('nsec1')) return { type: 'nsec', data: new Uint8Array([1,2,3]) };
    if (s.startsWith('npub1')) return { type: 'npub', data: 'abcdef'.padEnd(64, '0') };
    throw new Error('bad');
  }
};

describe('keys helpers', () => {
  it('parseSk decodes nsec', () => {
    const sk = parseSk('nsec1xyz', nip19);
    expect(sk).toBeInstanceOf(Uint8Array);
  });
  it('parseSk parses hex bytes', () => {
    const sk = parseSk('0a0b0c');
    expect(sk).toBeInstanceOf(Uint8Array);
  });
  it('parsePk decodes npub to hex', () => {
    const pk = parsePk('npub1xyz', nip19);
    expect(typeof pk).toBe('string');
    expect(pk).toHaveLength(64);
  });
  it('parsePk accepts 64-hex', () => {
    const hex = 'a'.repeat(64);
    const pk = parsePk(hex);
    expect(pk).toBe(hex);
  });
});
