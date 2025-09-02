const { describe, it, expect, vi, beforeEach } = globalThis;

describe('NostrService pixel.bought flow', () => {
  let service;

  beforeEach(async () => {
    vi.resetModules();
  // Import service
    const { NostrService } = require('../lib/service.js');
    const runtime = {
      character: { name: 'Pixel', style: { post: ['playful'] }, postExamples: ['pixels unite.'] },
      useModel: async (_t, { prompt }) => ({ text: 'fresh pixel — place yours: https://ln.pixel.xx.kg.io' }),
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
    expect(textArg).toContain('https://ln.pixel.xx.kg.io'); // whitelist respected
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

  it('generates excited response for bulk purchases', async () => {
    const { emitter } = require('../lib/bridge.js');
    emitter.emit('pixel.bought', { 
      activity: { 
        x: 5, 
        y: 10, 
        color: '#ff0000',
        sats: 50,
        type: 'bulk_purchase',
        summary: '5 pixels purchased'
      } 
    });
    await new Promise((r) => setTimeout(r, 60));

    expect(service.postOnce).toHaveBeenCalledTimes(1);
    const [textArg] = service.postOnce.mock.calls[0];
    expect(typeof textArg).toBe('string');
    expect(textArg).toContain('https://ln.pixel.xx.kg.io');
    // Should either contain "5 pixels" in model result or "explosion" in fallback
    expect(textArg).toMatch(/(5 pixels|explosion)/i);
  });

  it('handles bulk purchases with metadata.pixelUpdates format', async () => {
    // Simulate the actual format from LNPixels API
    const { emitter } = require('../lib/bridge.js');
    let rawActivity = {
      type: 'payment',
      amount: 110,
      sats: 110, 
      x: -5,  // These get populated from first pixel
      y: 7,
      color: '#8b5cf6',
      metadata: {
        pixelUpdates: [
          { x: -5, y: 7, color: '#8b5cf6', price: 10 },
          { x: -4, y: 7, color: '#8b5cf6', price: 10 },
          { x: -3, y: 7, color: '#8b5cf6', price: 10 }
          // ... more pixels
        ]
      }
    };
    
    // Apply the listener validation logic to transform the activity
    if (rawActivity.metadata?.pixelUpdates && Array.isArray(rawActivity.metadata.pixelUpdates) && rawActivity.metadata.pixelUpdates.length > 0) {
      rawActivity.type = 'bulk_purchase';
      rawActivity.summary = `${rawActivity.metadata.pixelUpdates.length} pixels`;
      delete rawActivity.x;
      delete rawActivity.y;
      delete rawActivity.color;
    }
    
    emitter.emit('pixel.bought', { activity: rawActivity });
    await new Promise((r) => setTimeout(r, 60));

    expect(service.postOnce).toHaveBeenCalledTimes(1);
    const [textArg] = service.postOnce.mock.calls[0];
    expect(typeof textArg).toBe('string');
    expect(textArg).toContain('https://ln.pixel.xx.kg.io');
    // Should NOT contain individual coordinates for bulk purchases
    expect(textArg).not.toMatch(/\(-5,7\)/);
    expect(textArg).not.toMatch(/#8b5cf6/);
    // Should contain excitement about the bulk
    expect(textArg).toMatch(/(pixels|explosion|revolution)/i);
  });
});
