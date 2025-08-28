const { describe, it, expect } = globalThis;
const { getZapAmountMsats, getZapTargetEventId, generateThanksText, parseBolt11Msats } = require('../lib/zaps.js');

describe('zaps helpers', () => {
  it('extracts amount from amount tag', () => {
    const evt = { tags: [['amount', '25000']] };
    expect(getZapAmountMsats(evt)).toBe(25000);
  });
  it('gets target event id from e tag', () => {
    const evt = { tags: [['e', 'abc123']] };
    expect(getZapTargetEventId(evt)).toBe('abc123');
  });
  it('generates gratitude text', () => {
    const t1 = generateThanksText(5_000_000);
    const t2 = generateThanksText(50_000);
    const t3 = generateThanksText(5_000);
    expect(t1.length).toBeGreaterThan(10);
    expect(t2.length).toBeGreaterThan(10);
    expect(t3.length).toBeGreaterThan(10);
  });

  it('parses bolt11 amounts roughly', () => {
    // 1000 sat invoice (0.00001 BTC) as msats
    expect(parseBolt11Msats('lnbc10u1...')).toBe(1_000_000); // 10 microBTC = 1000 sats = 1,000,000 msats
    expect(parseBolt11Msats('lnbc1m1...')).toBe(100_000_000); // 0.001 BTC = 100k sats = 100,000,000 msats
    expect(parseBolt11Msats('bad')).toBeNull();
  });
});
