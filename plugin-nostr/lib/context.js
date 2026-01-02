"use strict";

async function ensureNostrContext(runtime, userPubkey, usernameLike, conversationId, deps) {
  const { createUniqueUuid, ChannelType, logger } = deps;

  // SCHEMA HACK: PGLite in this environment crashes on boolean parameter binding.
  // We replace the "unique" boolean column with an INTEGER column to avoid binding booleans.
  const adapter = runtime?.databaseAdapter;
  const queryFunc = adapter && (
    (typeof adapter.query === 'function' ? adapter.query.bind(adapter) : null) ||
    (adapter.db && typeof adapter.db.query === 'function' ? adapter.db.query.bind(adapter.db) : null)
  );

  if (queryFunc) {
    try {
      await queryFunc('ALTER TABLE memories DROP COLUMN IF EXISTS "unique"');
      await queryFunc('ALTER TABLE memories ADD COLUMN IF NOT EXISTS "unique" INTEGER DEFAULT 0');
    } catch (e) {
      logger?.debug?.('[NOSTR] Schema hack failed:', e.message);
    }
  }

  const worldId = createUniqueUuid(runtime, userPubkey);
  const roomId = createUniqueUuid(runtime, conversationId);
  const entityId = createUniqueUuid(runtime, userPubkey);
  logger?.info?.(`[NOSTR] Ensuring context world/room/connection for pubkey=${String(userPubkey).slice(0, 8)} conv=${String(conversationId).slice(0, 8)}`);
  await runtime.ensureWorldExists({ id: worldId, name: `${usernameLike || String(userPubkey).slice(0, 8)}'s Nostr`, agentId: runtime.agentId, serverId: userPubkey, metadata: { ownership: { ownerId: userPubkey }, nostr: { pubkey: userPubkey }, }, }).catch(() => { });
  await runtime.ensureRoomExists({ id: roomId, name: `Nostr thread ${String(conversationId).slice(0, 8)}`, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, channelId: conversationId, serverId: userPubkey, worldId, }).catch(() => { });
  await runtime.ensureConnection({ entityId, roomId, userName: usernameLike || userPubkey, name: usernameLike || userPubkey, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, worldId, }).catch(() => { });
  logger?.info?.(`[NOSTR] Context ensured world=${worldId} room=${roomId} entity=${entityId}`);
  return { worldId, roomId, entityId };
}

// Ensure LNPixels system context (world, room, connection) exists
async function ensureLNPixelsContext(runtime, deps) {
  const { createUniqueUuid, ChannelType, logger } = deps;
  const worldId = createUniqueUuid(runtime, 'lnpixels');
  const canvasRoomId = createUniqueUuid(runtime, 'lnpixels:canvas');
  const entityId = createUniqueUuid(runtime, 'lnpixels:system');
  try {
    logger?.info?.('[NOSTR] Ensuring LNPixels context (world/rooms/connection)');
    await runtime.ensureWorldExists({ id: worldId, name: 'LNPixels', agentId: runtime.agentId, serverId: 'lnpixels', metadata: { system: true, source: 'lnpixels' } }).catch(() => { });
    await runtime.ensureRoomExists({ id: canvasRoomId, name: 'LNPixels Canvas', source: 'lnpixels', type: ChannelType ? ChannelType.FEED : undefined, channelId: 'lnpixels:canvas', serverId: 'lnpixels', worldId, }).catch(() => { });
    await runtime.ensureConnection({ entityId, roomId: canvasRoomId, userName: 'lnpixels', name: 'LNPixels System', source: 'lnpixels', type: ChannelType ? ChannelType.FEED : undefined, worldId, }).catch(() => { });
    logger?.info?.(`[NOSTR] LNPixels context ensured world=${worldId} canvasRoom=${canvasRoomId} entity=${entityId}`);
  } catch { }
  // Use canvas room as the locks room as well (avoids schema issues for extra room types)
  const locksRoomId = canvasRoomId;
  return { worldId, canvasRoomId, locksRoomId, entityId };
}

// Ensure shared Nostr analysis context (world + rooms) exists for system memories
async function ensureNostrContextSystem(runtime, deps = {}) {
  if (!runtime) {
    return {};
  }

  const { createUniqueUuid, ChannelType, logger } = deps;
  const makeId = (seed) => {
    if (typeof createUniqueUuid === 'function') {
      try {
        return createUniqueUuid(runtime, seed);
      } catch (err) {
        logger?.debug?.('[NOSTR] Failed to create UUID for seed', seed, err?.message || err);
      }
    }
    // Fallback: generate a valid UUID v4 from the seed
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`${seed}:${Date.now()}:${Math.random()}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  };

  const worldId = makeId('nostr:context');
  const entityId = makeId('nostr:context:system');

  const rooms = {
    emergingStories: makeId('nostr-emerging-stories'),
    hourlyDigests: makeId('nostr-hourly-digests'),
    dailyReports: makeId('nostr-daily-reports'),
    userProfiles: makeId('nostr-user-profiles'),
    narrativesHourly: makeId('nostr-narratives-hourly'),
    narrativesDaily: makeId('nostr-narratives-daily'),
    narrativesWeekly: makeId('nostr-narratives-weekly'),
    narrativesMonthly: makeId('nostr-narratives-monthly'),
    selfReflection: makeId('nostr-self-reflection')
  };

  try {
    await runtime.ensureWorldExists({
      id: worldId,
      name: 'Nostr Context Engine',
      agentId: runtime.agentId,
      serverId: 'nostr:context',
      metadata: { system: true, source: 'nostr' }
    }).catch(() => { });

    // Create the entity ONCE before creating rooms to avoid duplicate entity creation errors
    // Each room will just link to this existing entity
    await runtime.ensureConnection({
      entityId,
      roomId: rooms.dailyReports, // Use any room as the initial connection point
      userName: 'nostr-context',
      name: 'Nostr Context Engine',
      source: 'nostr',
      type: ChannelType ? ChannelType.FEED : undefined,
      worldId,
      metadata: {
        name: 'Nostr Context Engine',
        userName: 'nostr-context',
        system: true,
        source: 'nostr',
        category: 'context-engine',
        nostr: {
          name: 'Nostr Context Engine',
          userName: 'nostr-context'
        }
      }
    }).catch(() => { });

    // Now create rooms sequentially to avoid race conditions on entity creation
    const ensureRoom = async (roomId, name, channelId) => {
      if (!roomId) return;
      await runtime.ensureRoomExists({
        id: roomId,
        name,
        source: 'nostr',
        type: ChannelType ? ChannelType.FEED : undefined,
        channelId,
        serverId: 'nostr:context',
        worldId
      }).catch(() => { });
      // Skip ensureConnection here - entity already created above
    };

    // Create rooms (entity already exists, so no duplicate entity errors)
    await Promise.all([
      ensureRoom(rooms.emergingStories, 'Nostr Emerging Stories', 'nostr:context:emerging'),
      ensureRoom(rooms.hourlyDigests, 'Nostr Hourly Digests', 'nostr:context:hourly'),
      ensureRoom(rooms.dailyReports, 'Nostr Daily Reports', 'nostr:context:daily'),
      ensureRoom(rooms.userProfiles, 'Nostr User Profiles', 'nostr:context:user-profiles'),
      ensureRoom(rooms.narrativesHourly, 'Nostr Narratives (Hourly)', 'nostr:context:narratives:hourly'),
      ensureRoom(rooms.narrativesDaily, 'Nostr Narratives (Daily)', 'nostr:context:narratives:daily'),
      ensureRoom(rooms.narrativesWeekly, 'Nostr Narratives (Weekly)', 'nostr:context:narratives:weekly'),
      ensureRoom(rooms.narrativesMonthly, 'Nostr Narratives (Monthly)', 'nostr:context:narratives:monthly'),
      ensureRoom(rooms.selfReflection, 'Nostr Self Reflection', 'nostr:context:self-reflection')
    ]);

    logger?.info?.('[NOSTR] Context system ensured world=%s', worldId);
  } catch (err) {
    logger?.debug?.('[NOSTR] Failed ensuring context system:', err?.message || err);
  }

  return { worldId, entityId, rooms };
}

async function createMemorySafe(runtime, memory, tableName = 'messages', maxRetries = 3, logger) {
  let lastErr = null;

  // ElizaOS 1.6.2 plugin-sql uses BOOLEAN for the unique column
  // Pass true (boolean) not 1 (integer)
  if (memory && typeof memory === 'object') {
    memory.unique = true;
  }

  // Ensure worldId is always present - ElizaOS SQL adapter requires it
  if (!memory.worldId && !memory.world_id) {
    // Fallback 1: Use roomId as worldId (common pattern for Nostr contexts)
    // Fallback 2: Use entityId
    // Fallback 3: Generate a stable system worldId
    if (memory.roomId) {
      memory.worldId = memory.roomId;
      memory.world_id = memory.roomId;
    } else if (memory.entityId) {
      memory.worldId = memory.entityId;
      memory.world_id = memory.entityId;
    } else {
      // Generate a stable fallback worldId for system memories
      const crypto = require('crypto');
      const seed = `nostr:system:${runtime?.agentId || 'default'}`;
      const hash = crypto.createHash('sha256').update(seed).digest('hex');
      const fallbackWorldId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      memory.worldId = fallbackWorldId;
      memory.world_id = fallbackWorldId;
    }
    logger?.debug?.(`[NOSTR] Memory worldId not provided, using fallback: ${memory.worldId}`);
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger?.debug?.(`[NOSTR] Creating memory id=${memory.id} room=${memory.roomId} world=${memory.worldId} attempt=${attempt + 1}/${maxRetries}`);
      await runtime.createMemory(memory, tableName);
      logger?.debug?.(`[NOSTR] Memory created id=${memory.id}`);
      return { created: true };
    } catch (err) {
      lastErr = err;
      // DrizzleQueryError wraps the actual DB error in .cause
      const cause = err?.cause;
      const causeMsg = cause?.message || '';
      const causeCode = cause?.code || err?.code;
      const msg = String(err?.message || causeMsg || err || '').toLowerCase();
      
      // Catch duplicate key errors (23505) and other constraint violations
      if (causeCode === '23505' || msg.includes('duplicate') || msg.includes('constraint') || msg.includes('exists') || msg.includes('violates unique')) {
        logger?.debug?.('[NOSTR] Memory already exists, skipping');
        return true;
      }
      // Log detailed error for foreign key violations
      if (causeCode === '23503' || msg.includes('foreign key')) {
        logger?.warn?.(`[NOSTR] FK violation: entity=${memory.entityId} room=${memory.roomId} world=${memory.worldId} agent=${memory.agentId}`);
        logger?.warn?.(`[NOSTR] FK cause: ${causeMsg}`);
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 250));
    }
  }
  // Include error code and cause in log for better debugging
  const cause = lastErr?.cause;
  const causeMsg = cause?.message || cause || '';
  const causeCode = cause?.code || lastErr?.code;
  logger?.warn?.('[NOSTR] Failed to persist memory:', lastErr?.message || lastErr, causeCode ? `(code: ${causeCode})` : '', causeMsg ? `cause: ${causeMsg}` : '');
  return false;
}

async function saveInteractionMemory(runtime, createUniqueUuid, getConversationIdFromEvent, evt, kind, extra, logger) {
  const body = { platform: 'nostr', kind, eventId: evt?.id, author: evt?.pubkey, content: evt?.content, timestamp: Date.now(), ...extra };

  // Compute context IDs
  let roomId, id, entityId, worldId;
  try {
    roomId = createUniqueUuid(runtime, getConversationIdFromEvent(evt));
  } catch { }
  try {
    id = createUniqueUuid(runtime, `${evt?.id || 'nostr'}:${kind}`);
  } catch { }
  try {
    entityId = createUniqueUuid(runtime, evt?.pubkey || 'nostr');
    worldId = entityId; // Use the same pubkey-based ID for simplicity, matching ensureNostrContext
  } catch { }

  // Ensure the context (room, world, connection) exists to satisfy FK constraints before saving memory
  if (evt?.pubkey && roomId && worldId && entityId) {
    try {
      const convId = typeof getConversationIdFromEvent === 'function' ? getConversationIdFromEvent(evt) : (evt?.id || 'nostr');
      const ctx = await ensureNostrContext(runtime, evt.pubkey, null, convId, { createUniqueUuid, logger }).catch(err => {
        logger?.debug?.('[NOSTR] ensureNostrContext failed:', err);
        return null;
      });
      // Update IDs to match exactly what was ensured in the DB (fixes FK violations if createUniqueUuid differs)
      if (ctx) {
        if (ctx.entityId) entityId = ctx.entityId;
        if (ctx.worldId) worldId = ctx.worldId;
        if (ctx.roomId) roomId = ctx.roomId;
      }
    } catch (e) {
      logger?.debug?.('[NOSTR] saveInteractionMemory context ensure failed:', e.message);
    }
  }

  // Also try to get worldId from extra if provided
  if (extra && extra.worldId) {
    worldId = extra.worldId;
  }

  // Persist a top-level inReplyTo for replies so _restoreHandledEventIds can recover handled IDs across restarts
  const isReplyKind = typeof kind === 'string' && kind.toLowerCase().includes('reply');
  const content = {
    type: 'social_interaction',
    source: 'nostr',
    // Important: this must be top-level (not inside data) because restore logic reads content.inReplyTo
    ...(isReplyKind && evt?.id ? { inReplyTo: evt.id } : {}),
    data: body,
  };

  // Use createMemorySafe with retries and duplicate tolerance
  try {
    if (id && entityId && roomId && typeof runtime?.createMemory === 'function') {
      const memory = {
        id,
        userId: entityId,
        entityId,
        roomId,
        agentId: runtime.agentId,
        worldId: worldId || entityId, // worldId is crucial for plugin-sql
        world_id: worldId || entityId, // some adapters use snake_case
        content,
        // unique: true, // REMOVED: causes PGLite crash (Aborted) in Bun
        metadata: extra?.metadata || {},
        createdAt: Date.now(),
      };
      const created = await createMemorySafe(runtime, memory, 'messages', 3, logger);
      return created;
    }
  } catch (e) {
    logger?.debug?.('[NOSTR] saveInteractionMemory createMemorySafe failed:', e?.message || e);
  }

  // Fallbacks
  if (typeof runtime?.createMemory === 'function') {
    try {
      // Ensure worldId/world_id on fallback call too
      return await runtime.createMemory({
        id,
        userId: entityId,
        entityId,
        roomId,
        agentId: runtime.agentId,
        worldId: worldId || entityId,
        world_id: worldId || entityId,
        content,
        createdAt: Date.now()
      }, 'messages');
    } catch (e) {
      logger?.debug?.('[NOSTR] saveInteractionMemory direct create failed:', e?.message || e);
    }
  }
  if (runtime?.databaseAdapter && typeof runtime.databaseAdapter.createMemory === 'function') {
    try {
      return await runtime.databaseAdapter.createMemory({ type: 'event', content: body, roomId: 'nostr' });
    } catch (e) {
      logger?.debug?.('[NOSTR] saveInteractionMemory adapter create failed:', e?.message || e);
    }
  }
  return false;
}

module.exports = { ensureNostrContext, ensureLNPixelsContext, ensureNostrContextSystem, createMemorySafe, saveInteractionMemory };
