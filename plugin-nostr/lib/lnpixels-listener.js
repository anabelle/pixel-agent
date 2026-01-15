const { io } = require('socket.io-client');
const { emitter: nostrBridge } = require('./bridge');

// Create memory record for LNPixels generated posts
async function createLNPixelsMemory(runtime, text, activity, traceId, log, opts = {}) {
  try {
    if (!runtime?.createMemory) {
      log?.debug?.('Runtime.createMemory not available, skipping memory creation');
      return false;
    }

    // Generate consistent IDs using ElizaOS pattern
    let createUniqueUuid;
    let ChannelType;
    try {
      const core = await import('@elizaos/core');
      createUniqueUuid = core.createUniqueUuid;
      ChannelType = core.ChannelType;
    } catch {
      try {
        const core = require('@elizaos/core');
        createUniqueUuid = core.createUniqueUuid;
        ChannelType = core.ChannelType;
      } catch { }
    }

    // Fallback UUID function if core utility is unavailable
    const uuidFallback = (rt, seed) => {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
      return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    };
    const makeId = createUniqueUuid || runtime?.createUniqueUuid || uuidFallback;

    const { ensureLNPixelsContext, createMemorySafe } = require('./context');
    // Ensure rooms/world exist
    const ctx = await ensureLNPixelsContext(runtime, { createUniqueUuid: makeId, ChannelType, logger: log });
    const roomId = ctx.canvasRoomId || makeId(runtime, 'lnpixels:canvas');
    const entityId = ctx.entityId || makeId(runtime, 'lnpixels:system');
    const memoryId = makeId(runtime, `lnpixels:post:${activity.event_id || activity.created_at || Date.now()}:${traceId}`);

    const memory = {
      id: memoryId,
      entityId,
      agentId: runtime.agentId,
      roomId,
      content: {
        text: `Posted to Nostr: "${text}"`,
        type: 'lnpixels_post',
        source: 'lnpixels-listener',
        data: {
          generatedText: text,
          triggerEvent: {
            x: activity.x,
            y: activity.y,
            color: activity.color,
            sats: activity.sats,
            letter: activity.letter,
            event_id: activity.event_id,
            created_at: activity.created_at
          },
          traceId,
          platform: 'nostr',
          timestamp: Date.now()
        }
      },
      createdAt: Date.now()
    };

    // Prefer context-aware safe creation if available
    let res = null;
    try {
      if (typeof createMemorySafe === 'function') {
        const retries = Number(opts.retries ?? 3);
        res = await createMemorySafe(runtime, memory, 'messages', retries, log);
      } else if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'messages');
        res = { created: true };
      }
    } catch (e) {
      if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'messages');
        res = { created: true };
      } else {
        throw e;
      }
    }
    if (res && (res.created || res.exists)) {
      log?.info?.('Created LNPixels memory:', { traceId, memoryId, roomId });
    } else {
      log?.warn?.('Failed to create LNPixels memory');
    }
    return true;

  } catch (error) {
    log?.warn?.('Failed to create LNPixels memory:', { traceId, error: error.message });
    return false;
  }
}

// Create memory record for LNPixels events when not posting (throttled or skipped)
async function createLNPixelsEventMemory(runtime, activity, traceId, log, opts = {}) {
  try {
    if (!runtime?.createMemory && !runtime?.databaseAdapter) {
      log?.debug?.('Runtime memory APIs not available, skipping event memory');
      return false;
    }

    // Generate consistent IDs using ElizaOS pattern
    let createUniqueUuid;
    let ChannelType;
    try {
      const core = await import('@elizaos/core');
      createUniqueUuid = core.createUniqueUuid;
      ChannelType = core.ChannelType;
    } catch {
      try {
        const core = require('@elizaos/core');
        createUniqueUuid = core.createUniqueUuid;
        ChannelType = core.ChannelType;
      } catch { }
    }

    // Fallback UUID function if core utility is unavailable
    const uuidFallback = (rt, seed) => {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
      return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    };
    const makeId = createUniqueUuid || runtime?.createUniqueUuid || uuidFallback;

    const { ensureLNPixelsContext, createMemorySafe } = require('./context');
    const ctx = await ensureLNPixelsContext(runtime, { createUniqueUuid: makeId, ChannelType, logger: log });
    const roomId = ctx.canvasRoomId || makeId(runtime, 'lnpixels:canvas');
    const entityId = ctx.entityId || makeId(runtime, 'lnpixels:system');
    const key = activity?.payment_hash || activity?.event_id || activity?.id || (activity?.x !== undefined && activity?.y !== undefined && activity?.created_at ? `${activity.x},${activity.y},${activity.created_at}` : Date.now());
    const memoryId = makeId(runtime, `lnpixels:event:${key}:${traceId}`);

    const memory = {
      id: memoryId,
      entityId,
      agentId: runtime.agentId,
      roomId,
      content: {
        type: 'lnpixels_event',
        source: 'lnpixels-listener',
        data: {
          triggerEvent: {
            x: activity?.x,
            y: activity?.y,
            color: activity?.color,
            sats: activity?.sats,
            letter: activity?.letter,
            event_id: activity?.event_id,
            payment_hash: activity?.payment_hash,
            created_at: activity?.created_at,
            type: activity?.type,
            summary: activity?.summary
          },
          traceId,
          platform: 'nostr',
          timestamp: Date.now(),
          throttled: true
        }
      },
      createdAt: Date.now()
    };

    try {
      const retries = Number(opts.retries ?? 3);
      if (typeof createMemorySafe === 'function') {
        await createMemorySafe(runtime, memory, 'messages', retries, log);
      } else if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'messages');
      }
    } catch (e) {
      if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'messages');
      } else {
        throw e;
      }
    }

    log?.info?.('Created LNPixels event memory (throttled)', { traceId, memoryId, roomId });
    return true;
  } catch (error) {
    log?.warn?.('Failed to create LNPixels event memory:', { traceId, error: error.message });
    return false;
  }
}

// Delegate text generation to plugin-nostr service

function makeKey(a) {
  // Prefer stable identifiers across different event types
  return (
    a?.event_id ||
    a?.payment_hash ||
    a?.paymentId ||
    a?.metadata?.quoteId ||
    a?.id ||
    (a?.x !== undefined && a?.y !== undefined && a?.created_at
      ? `${a.x},${a.y},${a.created_at}`
      : undefined)
  );
}

function startLNPixelsListener(runtime) {
  const log = runtime?.logger || console;
  const base = process.env.LNPIXELS_WS_URL || 'http://localhost:3000';
  // LNPixels exposes events on the "/api" namespace
  const socket = io(`${base}/api`, { transports: ['websocket'], path: '/socket.io', reconnection: true });

  // TTL-based deduplication (prevents memory leaks)
  const seen = new Map(); // [key, timestamp]
  const seenTTL = 300000; // 5 minutes

  // Rate limiter (token bucket: 10 posts, refill 1 per 6 seconds)
  const rateLimiter = {
    tokens: 10,
    maxTokens: 10,
    lastRefill: Date.now(),
    refillRate: 6000, // 1 token per 6 seconds

    consume() {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed / this.refillRate);
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens--;
        return true;
      }
      return false;
    }
  };

  // Connection health tracking
  const health = {
    connected: false,
    lastEvent: null,
    consecutiveErrors: 0,
    totalEvents: 0,
    totalPosts: 0,
    totalErrors: 0
  };

  function dedupe(key) {
    if (!key) return false;

    // Clean expired entries periodically
    const now = Date.now();
    if (seen.size > 1000 || (seen.size > 0 && Math.random() < 0.1)) {
      const cutoff = now - seenTTL;
      for (const [k, timestamp] of seen) {
        if (timestamp < cutoff) seen.delete(k);
      }
    }

    if (seen.has(key)) return true;
    seen.set(key, now);
    return false;
  }

  function validateActivity(a) {
    if (!a || typeof a !== 'object') return false;

    // Debug logging to see what events we're getting
    const log = console;
    log.info?.(`[LNPIXELS-LISTENER] Validating activity:`, {
      type: a.type,
      hasPixelUpdates: !!a.metadata?.pixelUpdates,
      pixelUpdatesLength: a.metadata?.pixelUpdates?.length || 0,
      hasXYColor: !!(a.x !== undefined && a.y !== undefined && a.color),
      hasSummary: !!a.summary,
      x: a.x,
      y: a.y,
      color: a.color,
      sats: a.sats
    });

    // Handle bulk purchases
    // 1) Preferred: metadata.pixelUpdates provided (legacy/server-embedded details)
    if (a.metadata?.pixelUpdates && Array.isArray(a.metadata.pixelUpdates) && a.metadata.pixelUpdates.length > 0) {
      a.type = 'bulk_purchase';
      a.summary = `${a.metadata.pixelUpdates.length} pixels`;
      a.pixelCount = a.metadata.pixelUpdates.length;
      a.totalSats = a.metadata.pixelUpdates.reduce((sum, u) => sum + (u?.price || 0), 0);
      // Don't use individual pixel coordinates for bulk purchases
      delete a.x;
      delete a.y;
      delete a.color;
      log.info?.(`[LNPIXELS-LISTENER] ALLOWED: Bulk purchase (with metadata) of ${a.metadata.pixelUpdates.length} pixels`);
      return true;
    }
    // 2) Summary-only bulk_purchase events (current server behavior)
    if (a.type === 'bulk_purchase') {
      const allowBulkSummary = String(process.env.LNPIXELS_ALLOW_BULK_SUMMARY ?? 'true').toLowerCase() === 'true';
      if (!allowBulkSummary) {
        log.info?.(`[LNPIXELS-LISTENER] REJECTED: bulk_purchase summary disabled via env`);
        return false;
      }
      // Accept summary events even without metadata; sanitize pixel fields to avoid implying a single pixel
      if (typeof a.summary === 'string' && a.summary.toLowerCase().includes('pixel')) {
        // Try to parse a numeric count, fallback to provided pixelCount
        if (!a.pixelCount) {
          const m = a.summary.match(/(\d+)/);
          if (m) a.pixelCount = Number(m[1]);
        }
        // totalSats may be included by server; do not invent it here if missing
        delete a.x;
        delete a.y;
        delete a.color;
        log.info?.(`[LNPIXELS-LISTENER] ALLOWED: Bulk purchase (summary only): ${a.summary} (count=${a.pixelCount ?? 'n/a'})`);
        return true;
      }
      log.info?.(`[LNPIXELS-LISTENER] REJECTED: bulk_purchase without summary/metadata`);
      return false;
    }

    // Skip ALL payment activities 
    if (a.type === 'payment') {
      log.info?.(`[LNPIXELS-LISTENER] REJECTED: Payment event`);
      return false;
    }

    // Regular single pixel validation
    if (!a.x && !a.y && !a.color) {
      log.info?.(`[LNPIXELS-LISTENER] REJECTED: Missing x, y, or color`);
      return false;
    }
    if (a.x !== undefined && (typeof a.x !== 'number' || a.x < -1000 || a.x > 1000)) return false;
    if (a.y !== undefined && (typeof a.y !== 'number' || a.y < -1000 || a.y > 1000)) return false;
    if (a.sats !== undefined && (typeof a.sats !== 'number' || a.sats < 0 || a.sats > 1000000)) return false;
    if (a.letter !== undefined && a.letter !== null && (typeof a.letter !== 'string' || a.letter.length > 10)) return false;

    log.info?.(`[LNPIXELS-LISTENER] ALLOWED: Single pixel at (${a.x},${a.y}) ${a.color} for ${a.sats} sats`);
    return true;
  }

  socket.on('connect', () => {
    health.connected = true;
    health.consecutiveErrors = 0;
    log.info?.('LNPixels WS connected');
  });

  socket.on('disconnect', (reason) => {
    health.connected = false;
    log.warn?.(`LNPixels WS disconnected: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    health.consecutiveErrors++;
    log.error?.('LNPixels WS connection error:', error.message);
  });

  socket.on('activity.append', async (a) => {
    const traceId = require('crypto').randomUUID().slice(0, 8);

    try {
      health.totalEvents++;
      health.lastEvent = Date.now();

      // Input validation
      if (!validateActivity(a)) {
        log.warn?.('Invalid activity received:', { traceId, activity: a });
        return;
      }

      // Rate limiting
      if (!rateLimiter.consume()) {
        log.warn?.('Rate limit exceeded, dropping event:', { traceId, tokens: rateLimiter.tokens });
        return;
      }

      // Deduplication
      const key = makeKey(a);
      if (dedupe(key)) {
        log.debug?.('Duplicate event ignored:', { traceId, key });
        return;
      }

      // Delegate: let plugin-nostr build + post
      try {
        nostrBridge.emit('pixel.bought', { activity: a });
      } catch (bridgeError) {
        log.error?.('Bridge emit failed:', { traceId, error: bridgeError.message });
        return;
      }

      // Success path (optionally store a memory referencing the trigger)
      health.totalPosts++;
      health.consecutiveErrors = 0;
      log.info?.('Delegated pixel.bought event to plugin-nostr', { traceId, sats: a.sats });
      try {
        const enableMem = String(process.env.LNPIXELS_CREATE_DELEGATION_MEMORY ?? 'false').toLowerCase() === 'true';
        if (enableMem) {
          await createLNPixelsMemory(runtime, '[delegated to plugin-nostr]', a, traceId, log);
        }
      } catch { }

      // Internal broadcast for other plugins (no generated text here)
      try {
        await runtime?.process?.({ user: 'system', content: { text: '[PIXEL_ACTIVITY] pixel bought' }, context: { activity: a, traceId } });
      } catch (processError) { log.warn?.('Internal process failed:', { traceId, error: processError.message }); }

    } catch (error) {
      health.totalErrors++;
      health.consecutiveErrors++;
      log.error?.('Activity handler failed:', {
        traceId,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        activity: a
      });
    }
  });

  socket.on('pixel.update', () => {
    // Ignore fine-grained updates for now
  });

  // Graceful shutdown handling
  const cleanup = () => {
    try {
      socket?.disconnect();
      log.info?.('LNPixels listener shutdown');
    } catch (e) {
      log.error?.('Cleanup error:', e.message);
    }
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // Export health check and metrics
  socket._pixelHealth = () => ({
    ...health,
    rateLimiter: {
      tokens: rateLimiter.tokens,
      maxTokens: rateLimiter.maxTokens
    },
    deduplication: {
      cacheSize: seen.size,
      maxAge: seenTTL
    }
  });

  return socket;
}

module.exports = { startLNPixelsListener, createLNPixelsMemory, createLNPixelsEventMemory };
