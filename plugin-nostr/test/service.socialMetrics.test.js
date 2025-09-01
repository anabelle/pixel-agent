const { describe, it, expect } = globalThis;
const { NostrService, ensureDeps } = require('../lib/service.js');

function makePoolList(events) {
  return {
    list: (_relays, filters) => {
      // Mock different responses based on filters
      if (filters[0]?.kinds?.includes(3) && filters[0]?.authors) {
        // Following count query - return user's contact list
        return Promise.resolve([{
          pubkey: filters[0].authors[0],
          tags: [['p', 'follow1'], ['p', 'follow2'], ['p', 'follow3']]
        }]);
      } else if (filters[0]?.kinds?.includes(3) && filters[0]?.['#p']) {
        // Followers count query - return users who follow the target
        const targetPubkey = filters[0]['#p'][0];
        if (targetPubkey === 'userWithFollowers') {
          return Promise.resolve([
            { pubkey: 'follower1', tags: [['p', targetPubkey]] },
            { pubkey: 'follower2', tags: [['p', targetPubkey]] },
            { pubkey: 'follower3', tags: [['p', targetPubkey]] },
            { pubkey: targetPubkey, tags: [['p', 'self']] } // Self-follow should be excluded
          ]);
        } else if (targetPubkey === 'userNoFollowers') {
          return Promise.resolve([]);
        }
      }
      return Promise.resolve([]);
    }
  };
}

describe('social metrics', () => {
  it('calculates real follower count correctly', async () => {
    await ensureDeps(); // Ensure dependencies are loaded
    
    const pool = makePoolList([]);
    const mockRuntime = {
      getSetting: () => null,
      character: { name: 'TestAgent' }
    };
    
    const service = new NostrService(mockRuntime);
    service.pool = pool;
    service.relays = ['wss://test'];
    service.pkHex = 'testPubkey';
    service.socialMetricsCacheTTL = 1000;

    // Test user with real followers
    const metrics1 = await service._getUserSocialMetrics('userWithFollowers');
    expect(metrics1).not.toBeNull();
    expect(metrics1.following).toBe(3); // Following 3 users
    expect(metrics1.followers).toBe(3); // Has 3 followers (excluding self)
    expect(metrics1.ratio).toBe(1.0); // 3 followers / 3 following = 1.0

    // Test user with no followers
    const metrics2 = await service._getUserSocialMetrics('userNoFollowers');
    expect(metrics2).not.toBeNull();
    expect(metrics2.following).toBe(3); // Following 3 users
    expect(metrics2.followers).toBe(0); // Has no followers
    expect(metrics2.ratio).toBe(0); // 0 followers / 3 following = 0
  });

  it('caches social metrics results', async () => {
    await ensureDeps(); // Ensure dependencies are loaded
    
    const pool = makePoolList([]);
    const mockRuntime = {
      getSetting: () => null,
      character: { name: 'TestAgent' }
    };
    
    const service = new NostrService(mockRuntime);
    service.pool = pool;
    service.relays = ['wss://test'];
    service.pkHex = 'testPubkey';
    service.socialMetricsCacheTTL = 60000; // 1 minute cache

    // First call should fetch from network
    const metrics1 = await service._getUserSocialMetrics('userWithFollowers');
    expect(metrics1).not.toBeNull();

    // Second call should use cache
    const metrics2 = await service._getUserSocialMetrics('userWithFollowers');
    expect(metrics2).toEqual(metrics1);
    expect(metrics2.lastUpdated).toBe(metrics1.lastUpdated);
  });

  it('handles users with zero following', async () => {
    await ensureDeps(); // Ensure dependencies are loaded
    
    const pool = {
      list: (_relays, filters) => {
        if (filters[0]?.kinds?.includes(3) && filters[0]?.authors) {
          // User has no contacts
          return Promise.resolve([]);
        } else if (filters[0]?.kinds?.includes(3) && filters[0]?.['#p']) {
          // User has some followers
          return Promise.resolve([
            { pubkey: 'follower1', tags: [['p', filters[0]['#p'][0]]] }
          ]);
        }
        return Promise.resolve([]);
      }
    };

    const mockRuntime = {
      getSetting: () => null,
      character: { name: 'TestAgent' }
    };
    
    const service = new NostrService(mockRuntime);
    service.pool = pool;
    service.relays = ['wss://test'];
    service.pkHex = 'testPubkey';
    service.socialMetricsCacheTTL = 1000;

    const metrics = await service._getUserSocialMetrics('userZeroFollowing');
    expect(metrics).not.toBeNull();
    expect(metrics.following).toBe(0); // Following 0 users
    expect(metrics.followers).toBe(1); // Has 1 follower
    expect(metrics.ratio).toBe(0); // Division by zero should result in 0
  });

  it('falls back gracefully on network errors', async () => {
    await ensureDeps(); // Ensure dependencies are loaded
    
    const pool = makePoolList([]);
    const mockRuntime = {
      getSetting: () => null,
      character: { name: 'TestAgent' }
    };
    
    const service = new NostrService(mockRuntime);
    service.pool = pool;
    service.relays = ['wss://test'];
    service.pkHex = 'testPubkey';
    service.socialMetricsCacheTTL = 1000;

    // Mock _list to simulate network error for follower query
    service._list = async (relays, filters) => {
      if (filters[0]?.kinds?.includes(3) && filters[0]?.authors) {
        // Following count query succeeds
        return [{
          pubkey: filters[0].authors[0],
          tags: [['p', 'follow1'], ['p', 'follow2']]
        }];
      } else if (filters[0]?.kinds?.includes(3) && filters[0]?.['#p']) {
        // Followers count query fails
        throw new Error('Network error');
      }
      return [];
    };

    const metrics = await service._getUserSocialMetrics('userError');
    expect(metrics).not.toBeNull();
    expect(metrics.following).toBe(2); // Following count should still work
    expect(metrics.followers).toBe(2); // Should fall back to following count
    expect(metrics.ratio).toBe(1.0); // 2 followers / 2 following = 1.0
  });
});
