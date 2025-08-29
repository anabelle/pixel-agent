"use strict";

async function ensureNostrContext(runtime, userPubkey, usernameLike, conversationId, deps) {
  const { createUniqueUuid, ChannelType, logger } = deps;
  const worldId = createUniqueUuid(runtime, userPubkey);
  const roomId = createUniqueUuid(runtime, conversationId);
  const entityId = createUniqueUuid(runtime, userPubkey);
  logger?.info?.(`[NOSTR] Ensuring context world/room/connection for pubkey=${String(userPubkey).slice(0, 8)} conv=${String(conversationId).slice(0, 8)}`);
  await runtime.ensureWorldExists({ id: worldId, name: `${usernameLike || String(userPubkey).slice(0, 8)}'s Nostr`, agentId: runtime.agentId, serverId: userPubkey, metadata: { ownership: { ownerId: userPubkey }, nostr: { pubkey: userPubkey }, }, }).catch(() => {});
  await runtime.ensureRoomExists({ id: roomId, name: `Nostr thread ${String(conversationId).slice(0, 8)}`, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, channelId: conversationId, serverId: userPubkey, worldId, }).catch(() => {});
  await runtime.ensureConnection({ entityId, roomId, userName: usernameLike || userPubkey, name: usernameLike || userPubkey, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, worldId, }).catch(() => {});
  logger?.info?.(`[NOSTR] Context ensured world=${worldId} room=${roomId} entity=${entityId}`);
  return { worldId, roomId, entityId };
}

// Ensure LNPixels system context (world, rooms, connection) exists
async function ensureLNPixelsContext(runtime, deps) {
  const { createUniqueUuid, ChannelType, logger } = deps;
  const worldId = createUniqueUuid(runtime, 'lnpixels');
  const canvasRoomId = createUniqueUuid(runtime, 'lnpixels:canvas');
  const locksRoomId = createUniqueUuid(runtime, 'lnpixels:locks');
  const entityId = createUniqueUuid(runtime, 'lnpixels:system');
  try {
    logger?.info?.('[NOSTR] Ensuring LNPixels context (world/rooms/connection)');
    await runtime.ensureWorldExists({ id: worldId, name: 'LNPixels', agentId: runtime.agentId, serverId: 'lnpixels', metadata: { system: true, source: 'lnpixels' } }).catch(() => {});
    await runtime.ensureRoomExists({ id: canvasRoomId, name: 'LNPixels Canvas', source: 'lnpixels', type: ChannelType ? ChannelType.FEED : undefined, channelId: 'lnpixels:canvas', serverId: 'lnpixels', worldId, }).catch(() => {});
    await runtime.ensureRoomExists({ id: locksRoomId, name: 'LNPixels Locks', source: 'lnpixels', type: ChannelType ? ChannelType.DIRECT : undefined, channelId: 'lnpixels:locks', serverId: 'lnpixels', worldId, }).catch(() => {});
    await runtime.ensureConnection({ entityId, roomId: canvasRoomId, userName: 'lnpixels', name: 'LNPixels System', source: 'lnpixels', type: ChannelType ? ChannelType.FEED : undefined, worldId, }).catch(() => {});
    logger?.info?.(`[NOSTR] LNPixels context ensured world=${worldId} canvasRoom=${canvasRoomId} locksRoom=${locksRoomId} entity=${entityId}`);
  } catch {}
  return { worldId, canvasRoomId, locksRoomId, entityId };
}

async function createMemorySafe(runtime, memory, tableName = 'message', maxRetries = 3, logger) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
  logger?.debug?.(`[NOSTR] Creating memory id=${memory.id} room=${memory.roomId} attempt=${attempt + 1}/${maxRetries}`);
      await runtime.createMemory(memory, tableName);
  logger?.debug?.(`[NOSTR] Memory created id=${memory.id}`);
  return { created: true };
    } catch (err) {
      lastErr = err; const msg = String(err?.message || err || '');
  if (msg.includes('duplicate') || msg.includes('constraint')) { logger?.debug?.('[NOSTR] Memory already exists, skipping'); return true; }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 250));
    }
  }
  logger?.warn?.('[NOSTR] Failed to persist memory:', lastErr?.message || lastErr);
  return false;
}

async function saveInteractionMemory(runtime, createUniqueUuid, getConversationIdFromEvent, evt, kind, extra, logger) {
  const body = { platform: 'nostr', kind, eventId: evt?.id, author: evt?.pubkey, content: evt?.content, timestamp: Date.now(), ...extra };
  if (typeof runtime.createMemory === 'function') {
    try {
      const roomId = createUniqueUuid(runtime, getConversationIdFromEvent(evt));
      const id = createUniqueUuid(runtime, `${evt?.id || 'nostr'}:${kind}`);
      const entityId = createUniqueUuid(runtime, evt?.pubkey || 'nostr');
  return await runtime.createMemory({ id, entityId, roomId, agentId: runtime.agentId, content: { type: 'social_interaction', source: 'nostr', data: body, }, createdAt: Date.now(), }, 'message');
    } catch (e) { logger?.debug?.('[NOSTR] saveInteractionMemory fallback:', e?.message || e); }
  }
  if (runtime.databaseAdapter && typeof runtime.databaseAdapter.createMemory === 'function') {
    return await runtime.databaseAdapter.createMemory({ type: 'event', content: body, roomId: 'nostr', });
  }
}

module.exports = { ensureNostrContext, ensureLNPixelsContext, createMemorySafe, saveInteractionMemory };
