const { io } = require('socket.io-client');
const { sanitizeWhitelist } = require('./text');
const { emitter: nostrBridge } = require('./bridge');

// Create memory record for LNPixels generated posts
async function createLNPixelsMemory(runtime, text, activity, traceId, log) {
  try {
    if (!runtime?.createMemory) {
      log?.debug?.('Runtime.createMemory not available, skipping memory creation');
      return false;
    }

    // Generate consistent IDs using ElizaOS pattern
    const roomId = `lnpixels:canvas`;
    const entityId = `lnpixels:system`;
    const memoryId = `lnpixels:post:${activity.event_id || activity.created_at || Date.now()}:${traceId}`;

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

    await runtime.createMemory(memory, 'messages');
    log?.info?.('Created LNPixels memory:', { traceId, memoryId, roomId });
    return true;

  } catch (error) {
    log?.warn?.('Failed to create LNPixels memory:', { traceId, error: error.message });
    return false;
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPrompt(runtime, a) {
  const ch = (runtime && runtime.character) || {};
  const name = ch.name || 'Pixel';
  const mode = pick(['hype', 'poetic', 'playful', 'solemn', 'stats', 'cta']);
  const coords = (a && a.x !== undefined && a.y !== undefined) ? `(${a.x},${a.y})` : '';
  const letter = a && a.letter ? ` letter "${a.letter}"` : '';
  const color = a && a.color ? ` color ${a.color}` : '';
  const sats = a && a.sats ? `${a.sats} sats` : 'some sats';

  const base = [
    `You are ${name}. Generate a single short, on-character post reacting to a confirmed pixel purchase on the Lightning-powered canvas. Never start your messages with "Ah,"`,
    `Event: user placed${letter || ' a pixel'}${color ? ` with${color}` : ''}${coords ? ` at ${coords}` : ''} for ${sats}.`,
    `Tone mode: ${mode}.`,
    `Goals: be witty, fun, and invite others to place a pixel; avoid repetitive phrasing.`,
    `Constraints: 1–2 sentences, max ~180 chars, respect whitelist (allowed links/handles only), avoid generic thank-you.`,
    `Optional CTA: invite to place "just one pixel" at https://lnpixels.qzz.io`,
  ].join('\n');

  const stylePost = Array.isArray(ch?.style?.post) ? ch.style.post.slice(0, 8).join(' | ') : '';
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.slice(0, 5).map((e) => `- ${e}`).join('\n')
    : '';

  return [
    base,
    stylePost ? `Style guidelines: ${stylePost}` : '',
    examples ? `Few-shots (style only, do not copy):\n${examples}` : '',
    `Whitelist: Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com`,
    `Output: only the post text.`,
  ].filter(Boolean).join('\n\n');
}

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

      const prompt = buildPrompt(runtime, a);
      let text = '';
      
      // Debug logging for text generation
      log.info?.('Debug: Starting text generation:', { 
        traceId, 
        prompt: prompt.slice(0, 200) + '...', 
        hasRuntime: !!runtime,
        hasUseModel: !!runtime?.useModel,
        runtimeType: typeof runtime,
        useModelType: typeof runtime?.useModel
      });
      
      try {
        // Fix: Remove optional chaining on method call - that was the real bug!
        if (!runtime?.useModel) {
          throw new Error('runtime.useModel is not available');
        }
        
        // Use TEXT_SMALL as originally configured (OpenRouter models)
        const res = await runtime.useModel('TEXT_SMALL', { prompt, maxTokens: 220, temperature: 0.9 });
        
        log.info?.('Debug: LLM response received:', { 
          traceId, 
          responseType: typeof res,
          responseKeys: res ? Object.keys(res) : 'null',
          isString: typeof res === 'string',
          rawResponse: JSON.stringify(res).slice(0, 300) + '...'
        });
        
        const raw = typeof res === 'string' ? res : (res?.text || res?.content || res?.choices?.[0]?.message?.content || res?.response || res?.output || '');
        text = String(raw || '').trim().slice(0, 240);
        
        log.info?.('Debug: Text extraction result:', { 
          traceId, 
          rawType: typeof raw,
          rawValue: raw,
          rawLength: raw ? raw.length : 0,
          finalText: text,
          finalTextLength: text.length
        });
        
      } catch (llmError) {
        log.error?.('LLM generation failed:', { traceId, error: llmError.message, stack: llmError.stack, activity: a });
        health.totalErrors++;
        return;
      }
      
      if (!text) {
        log.warn?.('Empty text generated:', { traceId, activity: a, promptLength: prompt.length });
        return;
      }

      // Content safety
      text = sanitizeWhitelist(text);
      if (!text) {
        log.warn?.('Text rejected by whitelist:', { traceId, originalLength: text?.length });
        return;
      }
      
      const badHandles = /(^|\s)@(?!(PixelSurvivor)(\b|$))[A-Za-z0-9_.:-]+/i;
      if (badHandles.test(text)) {
        log.warn?.('Text rejected by handle filter:', { traceId });
        return;
      }

      // Success path
      health.totalPosts++;
      health.consecutiveErrors = 0;
      
      log.info?.('Generated post:', { traceId, text: text.slice(0, 50) + '...', sats: a.sats });
      
      // Create memory record for ElizaOS
      await createLNPixelsMemory(runtime, text, a, traceId, log);
      
      // Emit to nostr
      try { 
        nostrBridge.emit('external.post', { text }); 
      } catch (bridgeError) {
        log.error?.('Bridge emit failed:', { traceId, error: bridgeError.message });
      }

      // Internal broadcast for other plugins
      try { 
        await runtime?.process?.({ 
          user: 'system', 
          content: { text: `[PIXEL_ACTIVITY] ${text}` }, 
          context: { activity: a, traceId } 
        }); 
      } catch (processError) {
        log.warn?.('Internal process failed:', { traceId, error: processError.message });
      }
      
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

module.exports = { startLNPixelsListener };
