# Mute List Support Implementation

This update adds comprehensive mute list support to the Nostr plugin to prevent Pixel from interacting with previously muted users.

## Changes Made:

### 1. Event Factory Updates (`eventFactory.js`)
- Added `buildMuteList(pubkeys)` function to create kind 10000 mute list events
- Updated module exports to include the new function

### 2. Contacts Library Updates (`contacts.js`)
- Added `loadMuteList(pool, relays, pkHex)` to fetch current mute list from relays
- Added `publishMuteList(pool, relays, sk, newSet, buildMuteListFn, finalizeFn)` to publish updated mute lists
- Both functions follow the same pattern as existing contact list functions

### 3. NostrService Core Updates (`service.js`)
- Added mute list caching with TTL (1 hour)
- Added `_loadMuteList()` method with intelligent caching
- Added `_isUserMuted(pubkey)` helper method for quick mute checks
- Added `muteUser(pubkey)` and `unmuteUser(pubkey)` public methods
- Added `_publishMuteList(newSet)` helper for publishing updates

### 4. Interaction Filtering
Updated all user interaction points to check mute status:
- **Discovery replies**: Skip muted users during discovery rounds
- **Mention replies**: Skip replies to muted users (both immediate and scheduled)
- **DM replies**: Skip DM replies to muted users (both NIP-04 and NIP-44)
- **Zap thanks**: Skip thanking muted users for zaps
- **Home feed interactions**: Skip reactions/reposts for muted users
- **Following decisions**: Skip following muted users during discovery

### 5. Discovery Library Updates (`discovery.js`)
- Updated `selectFollowCandidates()` to be async and check mute status
- Added mute list filtering before recommending users to follow

### 6. New Mute Management Library (`mute.js`)
Added standalone utility functions for external use:
- `muteUser(pool, relays, sk, pkHex, userToMute, finalizeEvent)`
- `unmuteUser(pool, relays, sk, pkHex, userToUnmute, finalizeEvent)`
- `checkIfMuted(pool, relays, pkHex, userToCheck)`

## Key Features:

1. **Performance Optimized**: Mute list is cached for 1 hour to avoid repeated relay queries
2. **Non-Breaking**: All mute checks are wrapped in try-catch to prevent failures from breaking normal operation
3. **Comprehensive Coverage**: Covers all interaction types (replies, DMs, reactions, follows, zaps)
4. **Memory Efficient**: Uses Set data structure for O(1) mute status lookups
5. **Nostr Standard Compliant**: Uses kind 10000 events as per Nostr mute list specifications

## Usage:

The mute list functionality is automatically integrated into all existing interactions. To manually manage mutes:

```javascript
// Mute a user
await nostrService.muteUser('pubkey_hex');

// Unmute a user
await nostrService.unmuteUser('pubkey_hex');

// Check if user is muted
const isMuted = await nostrService._isUserMuted('pubkey_hex');
```

This implementation ensures Pixel will no longer follow, reply to, react to, or otherwise interact with users on its mute list, solving the issue of repetitive interactions with annoying bots.
