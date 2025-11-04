const { describe, it, expect, beforeEach } = globalThis;

// Mock dependencies
let mockLogger;
let mockRuntime;
let NostrService;

// Mock the logger
mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

// Mock the module dependencies
const mockModule = {
  '@elizaos/core': {
    logger: mockLogger,
    createUniqueUuid: () => 'test-uuid',
    ChannelType: { MENTION: 'MENTION' },
    ModelType: { TEXT_SMALL: 'TEXT_SMALL' },
  },
};

describe('NostrService unfollow with mute functionality', () => {
  let service;
  let publishContactsCalls;
  let publishMuteListCalls;
  let loadContactsEvents;
  let loadMuteListEvents;

  beforeEach(() => {
    // Reset call tracking
    publishContactsCalls = [];
    publishMuteListCalls = [];
    loadContactsEvents = [];
    loadMuteListEvents = [];

    // Create a minimal NostrService instance for testing
    service = {
      pool: {
        list: async (_relays, filters) => {
          // Check if this is a contacts (kind:3) or mute list (kind:10000) query
          const kind = filters?.[0]?.kinds?.[0];
          if (kind === 3) {
            return loadContactsEvents;
          } else if (kind === 10000) {
            return loadMuteListEvents;
          }
          return [];
        },
        publish: (relays, event) => {
          if (event.kind === 3) {
            publishContactsCalls.push({ relays, event });
          } else if (event.kind === 10000) {
            publishMuteListCalls.push({ relays, event });
          }
          return [Promise.resolve()];
        },
      },
      relays: ['wss://test.relay'],
      sk: new Uint8Array([1, 2, 3]),
      pkHex: 'testpubkey',
      mutedUsers: new Set(),
      muteListLastFetched: 0,
      muteListCacheTTL: 300000, // 5 minutes
      userQualityScores: new Map(),
      userPostCounts: new Map(),
      unfollowAddToMute: true, // Default to true
      runtime: {
        getSetting: (key) => {
          if (key === 'NOSTR_UNFOLLOW_ADD_TO_MUTE') return 'true';
          return null;
        }
      },
    };

    // Import helper methods from actual implementation
    const { loadCurrentContacts, publishContacts, loadMuteList, publishMuteList } = require('../lib/contacts.js');
    const { buildContacts, buildMuteList } = require('../lib/eventFactory.js');
    
    // Simplified finalizeEvent for testing
    const finalizeEvent = (evt) => ({ ...evt, id: 'signed-' + Date.now(), sig: 'test-sig' });

    // Bind helper methods to service
    service._loadCurrentContacts = async function() {
      return await loadCurrentContacts(this.pool, this.relays, this.pkHex);
    };

    service._publishContacts = async function(newSet) {
      try {
        return await publishContacts(this.pool, this.relays, this.sk, newSet, buildContacts, finalizeEvent);
      } catch (err) {
        return false;
      }
    };

    service._loadMuteList = async function() {
      const now = Date.now();
      if (this.mutedUsers.size > 0 && (now - this.muteListLastFetched) < this.muteListCacheTTL) {
        return this.mutedUsers;
      }
      try {
        const list = await loadMuteList(this.pool, this.relays, this.pkHex);
        this.mutedUsers = list;
        this.muteListLastFetched = Date.now();
        return list;
      } catch {
        return new Set();
      }
    };

    service._publishMuteList = async function(newSet) {
      try {
        const ok = await publishMuteList(this.pool, this.relays, this.sk, newSet, buildMuteList, finalizeEvent);
        return ok;
      } catch {
        return false;
      }
    };

    service.muteUser = async function(pubkey) {
      if (!pubkey || !this.pool || !this.sk || !this.relays.length || !this.pkHex) return false;

      try {
        const muteList = await this._loadMuteList();
        if (muteList.has(pubkey)) {
          return true; // Already muted
        }

        const newMuteList = new Set([...muteList, pubkey]);
        const success = await this._publishMuteList(newMuteList);

        if (success) {
          this.mutedUsers = newMuteList;
          this.muteListLastFetched = Date.now();
        }

        return success;
      } catch {
        return false;
      }
    };

    // The actual _unfollowUser implementation with mute support
    service._unfollowUser = async function(pubkey) {
      if (!pubkey || !this.pool || !this.sk || !this.relays.length || !this.pkHex) return false;

      try {
        const contacts = await this._loadCurrentContacts();
        if (!contacts.has(pubkey)) {
          return false;
        }

        const newContacts = new Set(contacts);
        newContacts.delete(pubkey);

        const success = await this._publishContacts(newContacts);

        if (success) {
          this.userQualityScores.delete(pubkey);
          this.userPostCounts.delete(pubkey);

          // Optionally add to mute list to prevent rediscovery
          if (this.unfollowAddToMute) {
            try {
              await this.muteUser(pubkey);
            } catch {
              // Don't fail the unfollow if muting fails
            }
          }
        }

        return success;
      } catch {
        return false;
      }
    };
  });

  it('should unfollow user and add to mute list when unfollowAddToMute is true', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    // Setup: user is in contacts
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', targetPubkey], ['p', 'otherUser']] 
      },
    ];
    
    // Setup: no existing mute list
    loadMuteListEvents = [];
    
    service.unfollowAddToMute = true;

    const result = await service._unfollowUser(targetPubkey);

    expect(result).toBe(true);
    expect(publishContactsCalls.length).toBe(1);
    expect(publishContactsCalls[0].event.tags.length).toBe(1);
    expect(publishContactsCalls[0].event.tags[0]).toEqual(['p', 'otherUser']);
    
    // Check that mute list was published
    expect(publishMuteListCalls.length).toBe(1);
    expect(publishMuteListCalls[0].event.tags.some(tag => tag[0] === 'p' && tag[1] === targetPubkey)).toBe(true);
  });

  it('should unfollow user without adding to mute list when unfollowAddToMute is false', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', targetPubkey], ['p', 'otherUser']] 
      },
    ];
    
    loadMuteListEvents = [];
    
    service.unfollowAddToMute = false;

    const result = await service._unfollowUser(targetPubkey);

    expect(result).toBe(true);
    expect(publishContactsCalls.length).toBe(1);
    expect(publishMuteListCalls.length).toBe(0); // Should not publish mute list
  });

  it('should not add to mute list if already muted', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', targetPubkey]] 
      },
    ];
    
    // Setup: user already in mute list
    loadMuteListEvents = [
      {
        created_at: now - 100,
        tags: [['p', targetPubkey]]
      }
    ];
    
    service.unfollowAddToMute = true;

    const result = await service._unfollowUser(targetPubkey);

    expect(result).toBe(true);
    expect(publishContactsCalls.length).toBe(1);
    // Mute list should not be published again since user is already muted
    expect(publishMuteListCalls.length).toBe(0);
  });

  it('should succeed even if mute operation fails', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', targetPubkey]] 
      },
    ];
    
    loadMuteListEvents = [];
    
    // Override muteUser to simulate failure
    service.muteUser = async () => {
      throw new Error('Mute failed');
    };
    
    service.unfollowAddToMute = true;

    const result = await service._unfollowUser(targetPubkey);

    // Unfollow should still succeed
    expect(result).toBe(true);
    expect(publishContactsCalls.length).toBe(1);
  });

  it('should not unfollow if user not in contacts', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', 'differentUser']] 
      },
    ];
    
    service.unfollowAddToMute = true;

    const result = await service._unfollowUser(targetPubkey);

    expect(result).toBe(false);
    expect(publishContactsCalls.length).toBe(0);
    expect(publishMuteListCalls.length).toBe(0);
  });

  it('should clean up tracking data after successful unfollow', async () => {
    const now = Math.floor(Date.now() / 1000);
    const targetPubkey = 'user123';
    
    loadContactsEvents = [
      { 
        created_at: now - 10, 
        tags: [['p', targetPubkey]] 
      },
    ];
    
    loadMuteListEvents = [];
    
    // Setup tracking data
    service.userQualityScores.set(targetPubkey, 0.5);
    service.userPostCounts.set(targetPubkey, 10);
    
    service.unfollowAddToMute = true;

    const result = await service._unfollowUser(targetPubkey);

    expect(result).toBe(true);
    expect(service.userQualityScores.has(targetPubkey)).toBe(false);
    expect(service.userPostCounts.has(targetPubkey)).toBe(false);
  });
});
