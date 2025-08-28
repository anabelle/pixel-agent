const plugin = require('..');

describe('plugin-nostr entrypoint', () => {
  it('exports a plugin object with services array', () => {
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('@pixel/plugin-nostr');
    expect(Array.isArray(plugin.services)).toBe(true);
    expect(plugin.services.length).toBeGreaterThan(0);
  });

  it('includes NostrService from lib/service', () => {
    const { NostrService } = require('../lib/service');
    const svc = plugin.services.find(Boolean);
    expect(svc).toBe(NostrService);
    // static properties sanity
    expect(typeof NostrService.serviceType).toBe('string');
    expect(NostrService.serviceType).toBe('nostr');
  });
});
