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
  const { createUniqueUuid } = require('@elizaos/core');
  const { ensureLNPixelsContext, createMemorySafe } = require('./context');
  // Ensure rooms/world exist
  const ctx = await ensureLNPixelsContext(runtime, { createUniqueUuid, ChannelType: (await import('@elizaos/core')).ChannelType, logger: log });
  const roomId = ctx.canvasRoomId || createUniqueUuid(runtime, 'lnpixels:canvas');
  const entityId = ctx.entityId || createUniqueUuid(runtime, 'lnpixels:system');
  const memoryId = createUniqueUuid(runtime, `lnpixels:post:${activity.event_id || activity.created_at || Date.now()}:${traceId}`);

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
  res = await createMemorySafe(runtime, memory, 'message', retries, log);
      } else if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'message');
        res = { created: true };
      }
    } catch (e) {
      if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'message');
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

  const { createUniqueUuid } = require('@elizaos/core');
  const { ensureLNPixelsContext, createMemorySafe } = require('./context');
  const ctx = await ensureLNPixelsContext(runtime, { createUniqueUuid, ChannelType: (await import('@elizaos/core')).ChannelType, logger: log });
  const roomId = ctx.canvasRoomId || createUniqueUuid(runtime, 'lnpixels:canvas');
  const entityId = ctx.entityId || createUniqueUuid(runtime, 'lnpixels:system');
    const key = activity?.payment_hash || activity?.event_id || activity?.id || (activity?.x !== undefined && activity?.y !== undefined && activity?.created_at ? `${activity.x},${activity.y},${activity.created_at}` : Date.now());
  const memoryId = createUniqueUuid(runtime, `lnpixels:event:${key}:${traceId}`);

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
        await createMemorySafe(runtime, memory, 'message', retries, log);
      } else if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'message');
      }
    } catch (e) {
      if (typeof runtime?.createMemory === 'function') {
        await runtime.createMemory(memory, 'message');
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
  return a?.event_id || a?.payment_hash || (a?.x !== undefined && a?.y !== undefined && a?.created_at ? `${a.x},${a.y},${a.created_at}` : undefined);
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
    if (a.x !== undefined && (typeof a.x !== 'number' || a.x < -1000 || a.x > 1000)) return false;
    if (a.y !== undefined && (typeof a.y !== 'number' || a.y < -1000 || a.y > 1000)) return false;
    if (a.sats !== undefined && (typeof a.sats !== 'number' || a.sats < 0 || a.sats > 1000000)) return false;
    if (a.letter !== undefined && a.letter !== null && (typeof a.letter !== 'string' || a.letter.length > 10)) return false;
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
      } catch {}

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
