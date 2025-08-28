import { describe, it, expect } from 'vitest';
import { hexToBytesLocal, bytesToHexLocal, parseRelays, normalizeSeconds, pickRangeWithJitter } from '../lib/utils.js';

describe('utils', () => {
  it('hexToBytesLocal parses valid hex', () => {
    const bytes = hexToBytesLocal('0x0a0b');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([10, 11]);
  });

  it('hexToBytesLocal rejects invalid', () => {
    expect(hexToBytesLocal('xyz')).toBeNull();
  });

  it('bytesToHexLocal roundtrips', () => {
    const hex = bytesToHexLocal(new Uint8Array([0, 255, 16]));
    expect(hex).toBe('00ff10');
  });

  it('parseRelays defaults and splits', () => {
    const def = parseRelays();
    expect(def.length).toBeGreaterThan(0);
    const list = parseRelays('wss://a, wss://b');
    expect(list).toEqual(['wss://a', 'wss://b']);
  });

  it('normalizeSeconds interprets ms-like values', () => {
    expect(normalizeSeconds(3000)).toBe(3);
    expect(normalizeSeconds('5000')).toBe(5);
    expect(normalizeSeconds('abc')).toBe(0);
  });

  it('pickRangeWithJitter is within range', () => {
    for (let i = 0; i < 20; i++) {
      const n = pickRangeWithJitter(5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
    }
  });
});
