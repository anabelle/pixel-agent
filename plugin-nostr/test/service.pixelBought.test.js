const { describe, it, expect, vi, beforeEach } = globalThis;

describe('NostrService pixel.bought flow', () => {
  let service;

  beforeEach(async () => {
    vi.resetModules();
  // Import service
    const { NostrService } = require('../lib/service.js');
    const runtime = {
      character: { name: 'Pixel', style: { post: ['playful'] }, postExamples: ['pixels unite.'] },
      useModel: async (_t, { prompt }) => ({ text: 'fresh pixel — place yours: https://lnpixels.qzz.io' }),
      getSetting: () => '',
    };
    service = await NostrService.start(runtime);
    // Prevent real network posting in tests
    service.postOnce = vi.fn(async () => true);
  });

  it('generates and posts on pixel.bought', async () => {
  const activity = { x: 10, y: 20, sats: 42, letter: 'A', color: '#fff' };
  const { emitter } = require('../lib/bridge.js');
  emitter.emit('pixel.bought', { activity });

  // allow async handler to run
  await new Promise((r) => setTimeout(r, 60));

    expect(service.postOnce).toHaveBeenCalledTimes(1);
    const [textArg] = service.postOnce.mock.calls[0];
    expect(typeof textArg).toBe('string');
    expect(textArg).toContain('https://lnpixels.qzz.io'); // whitelist respected
  });

  it('falls back when model fails', async () => {
  // Recreate service with failing model
  vi.resetModules();
  const { NostrService } = require('../lib/service.js');
    const runtime = {
      character: { name: 'Pixel' },
      useModel: async () => { throw new Error('boom'); },
      getSetting: () => '',
    };
    service = await NostrService.start(runtime);
    service.postOnce = vi.fn(async () => true);

  const { emitter } = require('../lib/bridge.js');
  emitter.emit('pixel.bought', { activity: { x: 1, y: 2, sats: 7 } });
  await new Promise((r) => setTimeout(r, 60));

    expect(service.postOnce).toHaveBeenCalledTimes(1);
    const [textArg] = service.postOnce.mock.calls[0];
    expect(textArg).toMatch(/fresh pixel/i);
  });
});
