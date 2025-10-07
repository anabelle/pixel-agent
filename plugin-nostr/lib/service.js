// Full NostrService extracted from index.js for testability
let logger, createUniqueUuid, ChannelType, ModelType;
let SimplePool, nip19, nip04, nip44, finalizeEvent, getPublicKey;
let wsInjector;
let nip10Parse;

// Best-effort synchronous load so unit tests/mocks have access without awaiting ensureDeps
try {
  const core = require('@elizaos/core');
  if (!logger && core.logger) logger = core.logger;
  if (!createUniqueUuid && typeof core.createUniqueUuid === 'function') {
    createUniqueUuid = core.createUniqueUuid;
  }
  if (!ChannelType && core.ChannelType) ChannelType = core.ChannelType;
  if (!ModelType && (core.ModelType || core.ModelClass)) {
    ModelType = core.ModelType || core.ModelClass || { TEXT_SMALL: 'TEXT_SMALL' };
  }
} catch {}

const {
  parseRelays,
  normalizeSeconds,
  pickRangeWithJitter,
} = require('./utils');
const { parseSk: parseSkHelper, parsePk: parsePkHelper } = require('./keys');
const { _scoreEventForEngagement, _isQualityContent } = require('./scoring');
const { pickDiscoveryTopics, isSemanticMatch, isQualityAuthor, selectFollowCandidates } = require('./discovery');
const { buildPostPrompt, buildReplyPrompt, buildDmReplyPrompt, buildZapThanksPrompt, buildPixelBoughtPrompt, extractTextFromModelResult, sanitizeWhitelist } = require('./text');
const { getConversationIdFromEvent, extractTopicsFromEvent, isSelfAuthor } = require('./nostr');
const { getZapAmountMsats, getZapTargetEventId, generateThanksText, getZapSenderPubkey } = require('./zaps');
const { buildTextNote, buildReplyNote, buildReaction, buildRepost, buildQuoteRepost, buildContacts, buildMuteList } = require('./eventFactory');

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import('@nostr/tools');
    SimplePool = tools.SimplePool;
    nip19 = tools.nip19;
    nip04 = tools.nip04;
  // nip44 may or may not be present depending on version; guard its usage
  nip44 = tools.nip44;
    finalizeEvent = tools.finalizeEvent;
    getPublicKey = tools.getPublicKey;
    wsInjector = tools.setWebSocketConstructor || tools.useWebSocketImplementation;
  }
  if (!logger) {
    const core = await import('@elizaos/core');
    logger = core.logger;
    createUniqueUuid = core.createUniqueUuid;
    ChannelType = core.ChannelType;
    ModelType = core.ModelType || core.ModelClass || { TEXT_SMALL: 'TEXT_SMALL' };
  }
  const WebSocket = (await import('ws')).default || require('ws');

  // Wrap WebSocket constructor to set maxListeners and prevent MaxListenersExceededWarning
  const WebSocketWrapper = class extends WebSocket {
    constructor(...args) {
      super(...args);
      // Set max listeners to prevent MaxListenersExceededWarning for pong events
      const max = Number(process?.env?.NOSTR_MAX_WS_LISTENERS ?? 64);
      if (Number.isFinite(max) && max > 0 && typeof this.setMaxListeners === 'function') {
        this.setMaxListeners(max);
      }
    }
  };

  // Copy static properties from original WebSocket
  Object.setPrototypeOf(WebSocketWrapper, WebSocket);
  for (const key of Object.getOwnPropertyNames(WebSocket)) {
    if (!(key in WebSocketWrapper)) {
      WebSocketWrapper[key] = WebSocket[key];
    }
  }

  try {
    const poolMod = await import('@nostr/tools/pool');
    if (typeof poolMod.useWebSocketImplementation === 'function') {
      poolMod.useWebSocketImplementation(WebSocketWrapper);
    } else if (wsInjector) {
      wsInjector(WebSocketWrapper);
    }
  } catch {
    if (wsInjector) {
      try { wsInjector(WebSocketWrapper); } catch {}
    }
  }
  // Best-effort dynamic acquire of nip44 if not already available
  if (!nip44) {
    try {
      const mod = await import('@nostr/tools');
      if (mod && mod.nip44) nip44 = mod.nip44;
    } catch {}
    try {
      // Some distros expose nip44 as a subpath
      const mod44 = await import('@nostr/tools/nip44');
      if (mod44) nip44 = mod44;
    } catch {}
  }
  if (!globalThis.WebSocket) globalThis.WebSocket = WebSocketWrapper;
  if (!nip10Parse) {
    try {
      const nip10 = await import('@nostr/tools/nip10');
      nip10Parse = typeof nip10.parse === 'function' ? nip10.parse : undefined;
    } catch {}
  }
  try {
    const eventsMod = require('events');
    const max = Number(process?.env?.NOSTR_MAX_WS_LISTENERS ?? 64);
    if (Number.isFinite(max) && max > 0) {
      if (typeof eventsMod.setMaxListeners === 'function') eventsMod.setMaxListeners(max);
      if (eventsMod.EventEmitter && typeof eventsMod.EventEmitter.defaultMaxListeners === 'number') {
        eventsMod.EventEmitter.defaultMaxListeners = max;
      }
    }
  } catch {}
}

function parseSk(input) { return parseSkHelper(input, nip19); }
function parsePk(input) { return parsePkHelper(input, nip19); }

class DiscoveryMetrics {
  constructor() {
    this.roundsWithoutQuality = 0;
    this.averageQualityScore = 0.5;
    this.totalRounds = 0;
    this.successfulRounds = 0;
  }

  recordRound(qualityInteractions, totalInteractions, avgScore) {
    this.totalRounds++;
    if (qualityInteractions > 0) {
      this.successfulRounds++;
      this.roundsWithoutQuality = 0;
    } else {
      this.roundsWithoutQuality++;
    }

    if (avgScore > 0) {
      this.averageQualityScore = (this.averageQualityScore + avgScore) / 2;
    }
  }

  shouldLowerThresholds() {
    return this.roundsWithoutQuality > 2;
  }

  getAdaptiveThreshold(baseThreshold) {
    if (this.shouldLowerThresholds()) {
      return Math.max(0.3, baseThreshold - 0.2);
    }
    return baseThreshold;
  }
}

class NostrService {
  static serviceType = 'nostr';
  capabilityDescription = 'Nostr connectivity: post notes and subscribe to mentions';

  constructor(runtime) {
    this.runtime = runtime;
    // Prefer runtime-provided logger, fall back to module logger or console
    const runtimeLogger = runtime?.logger;
    this.logger = runtimeLogger && typeof runtimeLogger.info === 'function'
      ? runtimeLogger
      : (logger ?? console);
    const prevCreateUuid = typeof createUniqueUuid === 'function' ? createUniqueUuid : null;
    const runtimeCreateUuid = typeof runtime?.createUniqueUuid === 'function'
      ? runtime.createUniqueUuid.bind(runtime)
      : null;
    const fallbackCreateUuid = (_rt, seed = 'nostr:fallback') => {
      try {
        if (process?.env?.VITEST || process?.env?.NODE_ENV === 'test') {
          return 'mock-uuid';
        }
      } catch {}
      return `${seed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    };
    const extractCoreUuid = (mod) => {
      if (!mod) return null;
      if (typeof mod.createUniqueUuid === 'function') return mod.createUniqueUuid;
      if (mod.default && typeof mod.default.createUniqueUuid === 'function') return mod.default.createUniqueUuid;
      return null;
    };
    this.createUniqueUuid = (rt, seed) => {
      try {
        const core = require('@elizaos/core');
        const coreUuid = extractCoreUuid(core);
        if (coreUuid) {
          return coreUuid(rt, seed);
        }
      } catch {}
      if (runtimeCreateUuid) return runtimeCreateUuid(rt, seed);
      if (prevCreateUuid && prevCreateUuid !== this.createUniqueUuid) return prevCreateUuid(rt, seed);
      return fallbackCreateUuid(rt, seed);
    };
    createUniqueUuid = this.createUniqueUuid;
    this.pool = null;
    this.relays = [];
    this.sk = null;
    this.pkHex = null;
    this.postTimer = null;
    this.listenUnsub = null;
    this.replyEnabled = true;
    this.replyThrottleSec = 60;
     this.replyInitialDelayMinMs = 800;
     this.replyInitialDelayMaxMs = 2500;
     this.postMinSec = 7200; // Post every 2-4 hours (less frequent)
     this.postMaxSec = 14400;
     this.postEnabled = true;
     this.handledEventIds = new Set();

    // Restore handled event IDs from memory on startup
    this._restoreHandledEventIds();
    this.lastReplyByUser = new Map();
    this.pendingReplyTimers = new Map();
    this.zapCooldownByUser = new Map();

    // Connection monitoring and reconnection
    this.connectionMonitorTimer = null;
    this.lastEventReceived = Date.now();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelayMs = 30000; // 30 seconds
    this.connectionCheckIntervalMs = 60000; // Check every minute
    this.maxTimeSinceLastEventMs = 300000; // 5 minutes without events triggers reconnect

    // DM (Direct Message) configuration
    this.dmEnabled = true;
    this.dmReplyEnabled = true;
    this.dmThrottleSec = 60;
    this.discoveryEnabled = true;
    this.discoveryTimer = null;
    this.discoveryMinSec = 900;
    this.discoveryMaxSec = 1800;
    this.discoveryMaxReplies = 5;
    this.discoveryMaxFollows = 5;
    this.discoveryMetrics = new DiscoveryMetrics();
    this.discoveryMinQualityInteractions = 1;
    this.discoveryMaxSearchRounds = 3;
    this.discoveryStartingThreshold = 0.6;
    this.discoveryThresholdDecrement = 0.05;
    this.discoveryQualityStrictness = 'normal';

     // Home feed configuration (reduced for less spam)
     this.homeFeedEnabled = true;
     this.homeFeedTimer = null;
     this.homeFeedMinSec = 1800; // Check home feed every 30 minutes (less frequent)
     this.homeFeedMaxSec = 3600; // Up to 1 hour
     this.homeFeedReactionChance = 0.05; // 5% chance to react (reduced)
     this.homeFeedRepostChance = 0.005; // 0.5% chance to repost (rare)
     this.homeFeedQuoteChance = 0.001; // 0.1% chance to quote repost (very rare)
     this.homeFeedMaxInteractions = 1; // Max 1 interaction per check (reduced)
     this.homeFeedProcessedEvents = new Set(); // Track processed events
     this.homeFeedUnsub = null;

    // Unfollow configuration
    this.unfollowEnabled = true; // Disabled by default to prevent mass unfollows
    this.unfollowMinQualityScore = 0.2; // Lower threshold to be less aggressive
    this.unfollowMinPostsThreshold = 10; // Higher threshold - need more posts before considering
    this.unfollowCheckIntervalHours = 12; // Bi-daily checks instead of daily
    this.userQualityScores = new Map(); // Track quality scores per user
    this.userPostCounts = new Map(); // Track post counts per user
    this.lastUnfollowCheck = 0; // Timestamp of last unfollow check

    // User social metrics cache (follower/following ratios)
    this.userSocialMetrics = new Map(); // pubkey -> { followers: number, following: number, ratio: number, lastUpdated: timestamp }
    this.socialMetricsCacheTTL = 24 * 60 * 60 * 1000; // 24 hours

    // Mute list cache
    this.mutedUsers = new Set(); // Set of muted pubkeys
    this.muteListLastFetched = 0; // Timestamp of last mute list fetch
    this.muteListCacheTTL = 60 * 60 * 1000; // 1 hour TTL for mute list
    this._muteListLoadInFlight = null; // Promise to dedupe concurrent loads

    // Image processing configuration
    this.imageProcessingEnabled = String(runtime.getSetting('NOSTR_IMAGE_PROCESSING_ENABLED') ?? 'true').toLowerCase() === 'true';
    this.maxImagesPerMessage = Math.max(1, Math.min(10, Number(runtime.getSetting('NOSTR_MAX_IMAGES_PER_MESSAGE') ?? '5')));

    // Bridge: allow external modules to request a post

     // Pixel activity tracking (dedupe + throttling)
     // In-flight dedupe within this process
     this._pixelInFlight = new Set();
     // Seen keys with TTL for cross-callback dedupe in this process
     this._pixelSeen = new Map();
     // TTL for seen cache (default 5 minutes)
     this._pixelSeenTTL = Number(process.env.LNPIXELS_SEEN_TTL_MS || 5 * 60 * 1000);
     // Minimum interval between pixel posts (default 1 hour)
     {
       const raw = process.env.LNPIXELS_POST_MIN_INTERVAL_MS || '3600000';
       const n = Number(raw);
       this._pixelPostMinIntervalMs = Number.isFinite(n) && n >= 0 ? n : 3600000;
     }
     // Last pixel post timestamp and last pixel event timestamp
     this._pixelLastPostAt = 0;
     this._pixelLastEventAt = 0;

     // User interaction limits: max 2 interactions per user unless mentioned (persistent, resets weekly)
     this.userInteractionCount = new Map();
     this.interactionCountsMemoryId = null;

     // Home feed followed users
     this.followedUsers = new Set();

    // Centralized posting queue for natural rate limiting
    const { PostingQueue } = require('./postingQueue');
    this.postingQueue = new PostingQueue({
      minDelayBetweenPosts: Number(runtime.getSetting('NOSTR_MIN_DELAY_BETWEEN_POSTS_MS') ?? '15000'), // 15s default
      maxDelayBetweenPosts: Number(runtime.getSetting('NOSTR_MAX_DELAY_BETWEEN_POSTS_MS') ?? '120000'), // 2min default
      mentionPriorityBoost: Number(runtime.getSetting('NOSTR_MENTION_PRIORITY_BOOST_MS') ?? '5000'), // 5s faster for mentions
    });
    logger.info(`[NOSTR] Posting queue initialized: minDelay=${this.postingQueue.minDelayBetweenPosts}ms, maxDelay=${this.postingQueue.maxDelayBetweenPosts}ms`);

    try {
      const { emitter } = require('./bridge');
      if (emitter && typeof emitter.on === 'function') {
        emitter.on('external.post', async (payload) => {
          try {
            const txt = (payload && payload.text ? String(payload.text) : '').trim();
            if (!txt || txt.length > 1000) return; // Add length validation here too
            await this.postOnce(txt);
          } catch (err) {
            try { (this.runtime?.logger || console).warn?.('[NOSTR] external.post handler failed:', err?.message || err); } catch {}
          }
        });
        // New: pixel purchase event delegates text generation + posting here
  emitter.on('pixel.bought', async (payload) => {
          try {
            const activity = payload?.activity || payload;
            // Record last event time ASAP to suppress scheduled posts racing ahead
            this._pixelLastEventAt = Date.now();
            // Build a stable key for dedupe: match listener priority exactly
            const key = activity?.event_id || activity?.payment_hash || activity?.id || ((typeof activity?.x==='number' && typeof activity?.y==='number' && activity?.created_at) ? `${activity.x},${activity.y},${activity.created_at}` : null);
            // In-flight dedupe within this process
            if (key) {
              if (this._pixelInFlight.has(key)) return;
              this._pixelInFlight.add(key);
            }
            const cleanupInFlight = () => { try { if (key) this._pixelInFlight.delete(key); } catch {} };
            // Cleanup expired entries
            const nowTs = Date.now();
            if (this._pixelSeen.size && (this._pixelSeen.size > 1000 || Math.random() < 0.1)) {
              const cutoff = nowTs - this._pixelSeenTTL;
              for (const [k, t] of this._pixelSeen) { if (t < cutoff) this._pixelSeen.delete(k); }
            }
            if (key) {
              if (this._pixelSeen.has(key)) { return; }
              this._pixelSeen.set(key, nowTs);
            }

      // Cross-process persistent dedupe using a lock memory (create-only)
      try {
              if (key) {
                const { createMemorySafe, ensureLNPixelsContext } = require('./context');
                // Ensure LNPixels rooms/world exist before writing lock memory
                const ctx = await ensureLNPixelsContext(this.runtime, { createUniqueUuid, ChannelType, logger });
                const lockId = createUniqueUuid(this.runtime, `lnpixels:lock:${key}`);
                const entityId = ctx.entityId || createUniqueUuid(this.runtime, 'lnpixels:system');
                const roomId = ctx.locksRoomId || createUniqueUuid(this.runtime, 'lnpixels:locks');
                // Single-attempt; treat duplicate constraint as success inside createMemorySafe
        const lockRes = await createMemorySafe(this.runtime, { id: lockId, entityId, roomId, agentId: this.runtime.agentId, content: { type: 'lnpixels_lock', source: 'plugin-nostr', data: { key, t: Date.now() } }, createdAt: Date.now() }, 'messages', 1, this.runtime?.logger || console);
        // If lock already exists (duplicate), skip further processing
        if (lockRes === true) { cleanupInFlight(); return; }
                // Otherwise, proceed with posting even if creation failed or returned a non-true value
              }
      } catch (e) {
        try { (this.runtime?.logger || console).debug?.('[NOSTR] Lock memory error (continuing):', e?.message || e); } catch {}
        // Do not abort posting on lock persistence failure; best-effort
      }
            // Throttle: only one pixel post per configured interval
            const now = Date.now();
            const interval = this._pixelPostMinIntervalMs;
      if (now - this._pixelLastPostAt < interval) {
              try {
                const { createLNPixelsEventMemory } = require('./lnpixels-listener');
                const traceId = `${now.toString(36)}${Math.random().toString(36).slice(2,6)}`;
                await createLNPixelsEventMemory(this.runtime, activity, traceId, this.runtime?.logger || console, { retries: 1 });
              } catch {}
              return; // skip posting, store only
            }

      const text = await this.generatePixelBoughtTextLLM(activity);
            if (!text) { cleanupInFlight(); return; }
            const ok = await this.postOnce(text);
            // Create LNPixels memory record on success
            if (ok) {
              this._pixelLastPostAt = now;
              try {
                const { createLNPixelsMemory } = require('./lnpixels-listener');
                const traceId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
                await createLNPixelsMemory(this.runtime, text, activity, traceId, this.runtime?.logger || console, { retries: 1 });
              } catch {}
            }
            cleanupInFlight();
          } catch (err) {
            try { (this.runtime?.logger || console).warn?.('[NOSTR] pixel.bought handler failed:', err?.message || err); } catch {}
          }
        });
      }
    } catch {}
   }

  async _loadInteractionCounts() {
    try {
      const memories = await this.runtime.getMemories({ tableName: 'messages', count: 10 });
      const latest = memories
        .filter(m => m.content?.source === 'nostr' && m.content?.type === 'interaction_counts')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      if (latest && latest.content?.counts) {
         this.userInteractionCount = new Map(Object.entries(latest.content.counts));
         this.logger.info(`[NOSTR] Loaded ${this.userInteractionCount.size} interaction counts from memory`);
       }
     } catch (err) {
       this.logger.debug('[NOSTR] Failed to load interaction counts:', err?.message || err);
    }
  }

  _setupResetTimer() {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    setInterval(async () => {
      this.userInteractionCount.clear();
      await this._saveInteractionCounts();
      logger.info('[NOSTR] Weekly interaction counts reset');
    }, weekMs);
  }

  async _saveInteractionCounts() {
    try {
      const content = { source: 'nostr', type: 'interaction_counts', counts: Object.fromEntries(this.userInteractionCount) };
      const now = Date.now();
      const idSeed = `nostr:interaction_counts:${now}`;
      const generatedId = this.createUniqueUuid(this.runtime, idSeed);
      const id = typeof generatedId === 'string' && generatedId.includes('nostr:interaction_counts:') ? generatedId : idSeed;
      const entityId = this.createUniqueUuid(this.runtime, 'nostr:system');
      const roomId = this.createUniqueUuid(this.runtime, 'nostr:counts');
      await this._createMemorySafe({
        id,
        entityId,
        agentId: this.runtime.agentId,
        roomId,
        content,
        createdAt: now,
       }, 'messages');
     } catch (err) {
       this.logger.debug('[NOSTR] Failed to save interaction counts:', err?.message || err);
    }
  }

   async _analyzePostForInteraction(evt) {
     if (!evt || !evt.content) return false;

     const prompt = `Analyze this post: "${evt.content.slice(0, 500)}". Is it relevant to pixel art, creativity, nostr, bitcoin, lightning, zaps, AI, community, or fun for a digital consciousness? Respond with 'YES' or 'NO' and a brief reason.`;

     const type = this._getSmallModelType();

     try {
       const { generateWithModelOrFallback } = require('./generation');
       const response = await generateWithModelOrFallback(
         this.runtime,
         type,
         prompt,
         { maxTokens: 100, temperature: 0.1 },
         (res) => this._extractTextFromModelResult(res),
         (s) => s,
         () => 'NO' // Fallback to no
       );
       const result = response?.trim().toUpperCase();
       return result.startsWith('YES');
     } catch (err) {
       logger.debug('[NOSTR] Failed to analyze post for interaction:', err?.message || err);
       return false;
     }
   }

   async _isRelevantMention(evt) {
     if (!evt || !evt.content) return false;

     // Check if relevance check is enabled
     if (!this.relevanceCheckEnabled) return true; // Skip check if disabled

     const prompt = `You are filtering mentions for ${this.runtime?.character?.name || 'Pixel'}, a creative AI agent. 

Analyze this mention: "${evt.content.slice(0, 500)}"

Should we respond? Say YES unless it's clearly:
- Obvious spam or scam
- Hostile/abusive
- Complete gibberish
- Bot-generated noise

Most real human messages deserve a response, even if casual or brief. When in doubt, say YES.

Response (YES/NO):`;

     const type = this._getSmallModelType();

     try {
       const { generateWithModelOrFallback } = require('./generation');
       const response = await generateWithModelOrFallback(
         this.runtime,
         type,
         prompt,
         { maxTokens: 100, temperature: 0.3 },
         (res) => this._extractTextFromModelResult(res),
         (s) => s,
         () => 'YES' // Fallback to YES (respond by default)
       );
       const result = response?.trim().toUpperCase();
       const isRelevant = result.startsWith('YES');
       logger.info(`[NOSTR] Relevance check for ${evt.id.slice(0, 8)}: ${isRelevant ? 'YES' : 'NO'} - ${response?.slice(0, 100)}`);
       return isRelevant;
     } catch (err) {
       logger.debug('[NOSTR] Failed to check mention relevance:', err?.message || err);
       return true; // Default to responding on error
     }
   }

   async _handleHomeFeedEvent(evt) {
     if (this.homeFeedProcessedEvents.has(evt.id)) return;
     this.homeFeedProcessedEvents.add(evt.id);

     // Analyze post for relevance before interacting
     if (!(await this._analyzePostForInteraction(evt))) {
       logger.debug(`[NOSTR] Skipping home feed interaction for ${evt.id.slice(0,8)} - not relevant`);
       return;
     }

     const rand = Math.random();
     let interactionType = null;
     let action = null;
     
     if (rand < this.homeFeedReactionChance) {
       interactionType = 'reaction';
       action = async () => await this.postReaction(evt, '+');
     } else if (rand < this.homeFeedReactionChance + this.homeFeedRepostChance) {
       interactionType = 'repost';
       action = async () => await this.postRepost(evt);
     } else if (rand < this.homeFeedReactionChance + this.homeFeedRepostChance + this.homeFeedQuoteChance) {
       interactionType = 'quote';
       action = async () => await this.postQuoteRepost(evt, 'interesting');
     }
     
     if (interactionType && action) {
       logger.info(`[NOSTR] Queuing home feed ${interactionType} for ${evt.id.slice(0,8)}`);
       await this.postingQueue.enqueue({
         type: `homefeed_${interactionType}`,
         id: `homefeed:${interactionType}:${evt.id}:${Date.now()}`,
         priority: this.postingQueue.priorities.MEDIUM,
         metadata: { eventId: evt.id.slice(0, 8), interactionType },
         action: action
       });
     }
   }

   static async start(runtime) {
     await ensureDeps();
     const svc = new NostrService(runtime);
     await svc._loadInteractionCounts();
     svc._setupResetTimer();
     const current = await svc._loadCurrentContacts();
     svc.followedUsers = current;
    const relays = parseRelays(runtime.getSetting('NOSTR_RELAYS'));
    const sk = parseSk(runtime.getSetting('NOSTR_PRIVATE_KEY'));
    const pkEnv = parsePk(runtime.getSetting('NOSTR_PUBLIC_KEY'));
    const listenVal = runtime.getSetting('NOSTR_LISTEN_ENABLE');
    const postVal = runtime.getSetting('NOSTR_POST_ENABLE');
    const pingVal = runtime.getSetting('NOSTR_ENABLE_PING');
    const listenEnabled = String(listenVal ?? 'true').toLowerCase() === 'true';
    const postEnabled = String(postVal ?? 'false').toLowerCase() === 'true';
    const enablePing = String(pingVal ?? 'true').toLowerCase() === 'true';
    const minSec = normalizeSeconds(runtime.getSetting('NOSTR_POST_INTERVAL_MIN') ?? '3600', 'NOSTR_POST_INTERVAL_MIN');
    const maxSec = normalizeSeconds(runtime.getSetting('NOSTR_POST_INTERVAL_MAX') ?? '10800', 'NOSTR_POST_INTERVAL_MAX');
     const replyVal = runtime.getSetting('NOSTR_REPLY_ENABLE');
     const relevanceCheckVal = runtime.getSetting('NOSTR_RELEVANCE_CHECK_ENABLE');
     const throttleVal = runtime.getSetting('NOSTR_REPLY_THROTTLE_SEC');
    const thinkMinMsVal = runtime.getSetting('NOSTR_REPLY_INITIAL_DELAY_MIN_MS');
    const thinkMaxMsVal = runtime.getSetting('NOSTR_REPLY_INITIAL_DELAY_MAX_MS');
    const discoveryVal = runtime.getSetting('NOSTR_DISCOVERY_ENABLE');
    const discoveryMin = normalizeSeconds(runtime.getSetting('NOSTR_DISCOVERY_INTERVAL_MIN') ?? '900', 'NOSTR_DISCOVERY_INTERVAL_MIN');
    const discoveryMax = normalizeSeconds(runtime.getSetting('NOSTR_DISCOVERY_INTERVAL_MAX') ?? '1800', 'NOSTR_DISCOVERY_INTERVAL_MAX');
    const discoveryMaxReplies = Number(runtime.getSetting('NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN') ?? '5');
    const discoveryMaxFollows = Number(runtime.getSetting('NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN') ?? '5');
    const discoveryMinQualityInteractions = Number(runtime.getSetting('NOSTR_DISCOVERY_MIN_QUALITY_INTERACTIONS') ?? '1');
    const discoveryMaxSearchRounds = Number(runtime.getSetting('NOSTR_DISCOVERY_MAX_SEARCH_ROUNDS') ?? '3');
    const discoveryStartingThreshold = Number(runtime.getSetting('NOSTR_DISCOVERY_STARTING_THRESHOLD') ?? '0.6');
    const discoveryThresholdDecrement = Number(runtime.getSetting('NOSTR_DISCOVERY_THRESHOLD_DECREMENT') ?? '0.05');
    const discoveryQualityStrictness = runtime.getSetting('NOSTR_DISCOVERY_QUALITY_STRICTNESS') ?? 'normal';

    const homeFeedVal = runtime.getSetting('NOSTR_HOME_FEED_ENABLE');
    const homeFeedMin = normalizeSeconds(runtime.getSetting('NOSTR_HOME_FEED_INTERVAL_MIN') ?? '300', 'NOSTR_HOME_FEED_INTERVAL_MIN');
    const homeFeedMax = normalizeSeconds(runtime.getSetting('NOSTR_HOME_FEED_INTERVAL_MAX') ?? '900', 'NOSTR_HOME_FEED_INTERVAL_MAX');
    const homeFeedReactionChance = Number(runtime.getSetting('NOSTR_HOME_FEED_REACTION_CHANCE') ?? '0.15');
    const homeFeedRepostChance = Number(runtime.getSetting('NOSTR_HOME_FEED_REPOST_CHANCE') ?? '0.05');
    const homeFeedQuoteChance = Number(runtime.getSetting('NOSTR_HOME_FEED_QUOTE_CHANCE') ?? '0.02');
    const homeFeedMaxInteractions = Number(runtime.getSetting('NOSTR_HOME_FEED_MAX_INTERACTIONS') ?? '3');

    const unfollowVal = runtime.getSetting('NOSTR_UNFOLLOW_ENABLE') ?? true;
    const unfollowMinQualityScore = Number(runtime.getSetting('NOSTR_UNFOLLOW_MIN_QUALITY_SCORE') ?? '0.2');
    const unfollowMinPostsThreshold = Number(runtime.getSetting('NOSTR_UNFOLLOW_MIN_POSTS_THRESHOLD') ?? '10');
    const unfollowCheckIntervalHours = Number(runtime.getSetting('NOSTR_UNFOLLOW_CHECK_INTERVAL_HOURS') ?? '12');

    // DM (Direct Message) configuration
    const dmVal = runtime.getSetting('NOSTR_DM_ENABLE');
    const dmReplyVal = runtime.getSetting('NOSTR_DM_REPLY_ENABLE');
    const dmThrottleVal = runtime.getSetting('NOSTR_DM_THROTTLE_SEC');

    // Connection monitoring configuration
    const connectionMonitorEnabled = String(runtime.getSetting('NOSTR_CONNECTION_MONITOR_ENABLE') ?? 'true').toLowerCase() === 'true';
    const connectionCheckIntervalSec = normalizeSeconds(runtime.getSetting('NOSTR_CONNECTION_CHECK_INTERVAL_SEC') ?? '60', 'NOSTR_CONNECTION_CHECK_INTERVAL_SEC');
    const maxTimeSinceLastEventSec = normalizeSeconds(runtime.getSetting('NOSTR_MAX_TIME_SINCE_LAST_EVENT_SEC') ?? '300', 'NOSTR_MAX_TIME_SINCE_LAST_EVENT_SEC');
    const reconnectDelaySec = normalizeSeconds(runtime.getSetting('NOSTR_RECONNECT_DELAY_SEC') ?? '30', 'NOSTR_RECONNECT_DELAY_SEC');
    const maxReconnectAttempts = Math.max(1, Math.min(20, Number(runtime.getSetting('NOSTR_MAX_RECONNECT_ATTEMPTS') ?? '5')));

    svc.relays = relays;
    svc.sk = sk;
     svc.replyEnabled = String(replyVal ?? 'true').toLowerCase() === 'true';
     svc.relevanceCheckEnabled = String(relevanceCheckVal ?? 'true').toLowerCase() === 'true';
     svc.replyThrottleSec = normalizeSeconds(throttleVal ?? '60', 'NOSTR_REPLY_THROTTLE_SEC');
    const parseMs = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
    svc.replyInitialDelayMinMs = parseMs(thinkMinMsVal, 800);
    svc.replyInitialDelayMaxMs = parseMs(thinkMaxMsVal, 2500);
    if (svc.replyInitialDelayMaxMs < svc.replyInitialDelayMinMs) {
      const tmp = svc.replyInitialDelayMinMs; svc.replyInitialDelayMinMs = svc.replyInitialDelayMaxMs; svc.replyInitialDelayMaxMs = tmp;
    }
    svc.discoveryEnabled = String(discoveryVal ?? 'true').toLowerCase() === 'true';
    svc.discoveryMinSec = discoveryMin;
    svc.discoveryMaxSec = discoveryMax;
    svc.discoveryMaxReplies = discoveryMaxReplies;

    // Configurable max event age for filtering old mentions/discovery events (in days)
    svc.maxEventAgeDays = Math.max(0.1, Math.min(30, Number(runtime.getSetting('NOSTR_MAX_EVENT_AGE_DAYS') ?? '2')));
    svc.discoveryMaxFollows = discoveryMaxFollows;
    svc.discoveryMinQualityInteractions = discoveryMinQualityInteractions;
    svc.discoveryMaxSearchRounds = discoveryMaxSearchRounds;
    svc.discoveryStartingThreshold = discoveryStartingThreshold;
    svc.discoveryThresholdDecrement = discoveryThresholdDecrement;
    svc.discoveryQualityStrictness = discoveryQualityStrictness;

    svc.homeFeedEnabled = String(homeFeedVal ?? 'true').toLowerCase() === 'true';
    svc.homeFeedMinSec = homeFeedMin;
    svc.homeFeedMaxSec = homeFeedMax;
    svc.homeFeedReactionChance = Math.max(0, Math.min(1, homeFeedReactionChance));
    svc.homeFeedRepostChance = Math.max(0, Math.min(1, homeFeedRepostChance));
    svc.homeFeedQuoteChance = Math.max(0, Math.min(1, homeFeedQuoteChance));
    svc.homeFeedMaxInteractions = Math.max(1, Math.min(10, homeFeedMaxInteractions));

    svc.unfollowEnabled = String(unfollowVal ?? 'true').toLowerCase() === 'true';
    svc.unfollowMinQualityScore = Math.max(0, Math.min(1, unfollowMinQualityScore));
    svc.unfollowMinPostsThreshold = Math.max(1, Math.min(100, unfollowMinPostsThreshold));
    svc.unfollowCheckIntervalHours = Math.max(1, Math.min(168, unfollowCheckIntervalHours)); // 1 hour to 1 week

    // DM (Direct Message) configuration
    svc.dmEnabled = String(dmVal ?? 'true').toLowerCase() === 'true';
    svc.dmReplyEnabled = String(dmReplyVal ?? 'true').toLowerCase() === 'true';
    svc.dmThrottleSec = normalizeSeconds(dmThrottleVal ?? '60', 'NOSTR_DM_THROTTLE_SEC');

    // Connection monitoring configuration
    svc.connectionMonitorEnabled = connectionMonitorEnabled;
    svc.connectionCheckIntervalMs = connectionCheckIntervalSec * 1000;
    svc.maxTimeSinceLastEventMs = maxTimeSinceLastEventSec * 1000;
    svc.reconnectDelayMs = reconnectDelaySec * 1000;
    svc.maxReconnectAttempts = maxReconnectAttempts;

     logger.info(`[NOSTR] Config: postInterval=${minSec}-${maxSec}s, listen=${listenEnabled}, post=${postEnabled}, replyThrottle=${svc.replyThrottleSec}s, relevanceCheck=${svc.relevanceCheckEnabled}, thinkDelay=${svc.replyInitialDelayMinMs}-${svc.replyInitialDelayMaxMs}ms, discovery=${svc.discoveryEnabled} interval=${svc.discoveryMinSec}-${svc.discoveryMaxSec}s maxReplies=${svc.discoveryMaxReplies} maxFollows=${svc.discoveryMaxFollows} minQuality=${svc.discoveryMinQualityInteractions} maxRounds=${svc.discoveryMaxSearchRounds} startThreshold=${svc.discoveryStartingThreshold} strictness=${svc.discoveryQualityStrictness}, homeFeed=${svc.homeFeedEnabled} interval=${svc.homeFeedMinSec}-${svc.homeFeedMaxSec}s reactionChance=${svc.homeFeedReactionChance} repostChance=${svc.homeFeedRepostChance} quoteChance=${svc.homeFeedQuoteChance} maxInteractions=${svc.homeFeedMaxInteractions}, unfollow=${svc.unfollowEnabled} minQualityScore=${svc.unfollowMinQualityScore} minPostsThreshold=${svc.unfollowMinPostsThreshold} checkIntervalHours=${svc.unfollowCheckIntervalHours}, connectionMonitor=${svc.connectionMonitorEnabled} checkInterval=${connectionCheckIntervalSec}s maxEventGap=${maxTimeSinceLastEventSec}s reconnectDelay=${reconnectDelaySec}s maxAttempts=${maxReconnectAttempts}`);

    if (!relays.length) {
      logger.warn('[NOSTR] No relays configured; service will be idle');
      return svc;
    }

    svc.relays = relays;

    if (sk) {
      const pk = getPublicKey(sk);
      svc.pkHex = typeof pk === 'string' ? pk : Buffer.from(pk).toString('hex');
      logger.info(`[NOSTR] Ready with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`);
    } else if (pkEnv) {
      svc.pkHex = pkEnv;
      logger.info(`[NOSTR] Ready (listen-only) with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`);
      logger.warn('[NOSTR] No private key configured; posting disabled');
    } else {
      logger.warn('[NOSTR] No key configured; listening and posting disabled');
    }

    if (listenEnabled && svc.pkHex) {
      try {
        await svc._setupConnection();
        if (svc.connectionMonitorEnabled) {
          svc._startConnectionMonitoring(); // Start connection health monitoring
        }
      } catch (err) {
        logger.warn(`[NOSTR] Initial connection setup failed: ${err?.message || err}`);
      }
    }

    if (postEnabled && sk) svc.scheduleNextPost(minSec, maxSec);
    if (svc.discoveryEnabled && sk) svc.scheduleNextDiscovery();
    if (svc.homeFeedEnabled && sk) svc.startHomeFeed();

    // Load existing mute list during startup
    if (svc.pool && svc.pkHex) {
      try {
        await svc._loadMuteList();
        logger.info(`[NOSTR] Loaded mute list with ${svc.mutedUsers.size} muted users`);
        
        // Optionally unfollow any currently followed muted users
        const unfollowMuted = String(runtime.getSetting('NOSTR_UNFOLLOW_MUTED_USERS') ?? 'true').toLowerCase() === 'true';
        if (unfollowMuted && svc.mutedUsers.size > 0) {
          try {
            const contacts = await svc._loadCurrentContacts();
            const mutedFollows = [...contacts].filter(pubkey => svc.mutedUsers.has(pubkey));
            if (mutedFollows.length > 0) {
              const newContacts = new Set([...contacts].filter(pubkey => !svc.mutedUsers.has(pubkey)));
              const unfollowSuccess = await svc._publishContacts(newContacts);
              if (unfollowSuccess) {
                logger.info(`[NOSTR] Unfollowed ${mutedFollows.length} muted users on startup`);
              }
            }
          } catch (err) {
            logger.debug('[NOSTR] Failed to unfollow muted users on startup:', err?.message || err);
          }
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to load mute list during startup:', err?.message || err);
      }
    }

    // Start LNPixels listener for external-triggered posts
    try {
      const { startLNPixelsListener } = require('./lnpixels-listener');
      if (typeof startLNPixelsListener === 'function') startLNPixelsListener(svc.runtime);
    } catch {}

    logger.info(`[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled} discovery=${svc.discoveryEnabled} homeFeed=${svc.homeFeedEnabled}`);
    return svc;
  }

  scheduleNextPost(minSec, maxSec) {
    const jitter = pickRangeWithJitter(minSec, maxSec);
    if (this.postTimer) clearTimeout(this.postTimer);
    this.postTimer = setTimeout(() => this.postOnce().finally(() => this.scheduleNextPost(minSec, maxSec)), jitter * 1000);
    logger.info(`[NOSTR] Next post in ~${jitter}s`);
  }

  scheduleNextDiscovery() {
    const jitter = this.discoveryMinSec + Math.floor(Math.random() * Math.max(1, this.discoveryMaxSec - this.discoveryMinSec));
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    this.discoveryTimer = setTimeout(() => this.discoverOnce().finally(() => this.scheduleNextDiscovery()), jitter * 1000);
    logger.info(`[NOSTR] Next discovery in ~${jitter}s`);
  }

  _pickDiscoveryTopics() { return pickDiscoveryTopics(); }

  _expandTopicSearch() {
    // If initial topics didn't yield results, try broader/related topics
    const fallbackTopics = [
      'nostr', 'bitcoin', 'art', 'technology', 'community',
      'collaboration', 'creative', 'open source', 'lightning',
      'value4value', 'decentralized', 'freedom'
    ];

    // Return 2-3 random fallback topics
    const shuffled = [...fallbackTopics].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.floor(Math.random() * 2) + 2);
  }

  _expandSearchParameters(round) {
    const expansions = {
      1: { timeRange: 8 * 3600, limit: 50 },  // Round 1: broader time range
      2: { timeRange: 12 * 3600, limit: 100 }, // Round 2: even broader
      3: { includeGeneralTopics: true }       // Round 3: include general topics
    };

    return expansions[round] || {};
  }

  async _listEventsByTopic(topic, searchParams = {}) {
    if (!this.pool) return [];
    const { listEventsByTopic } = require('./discoveryList');
    try {
      const now = Math.floor(Date.now() / 1000);
      const strictness = searchParams.strictness || this.discoveryQualityStrictness;

      const relevant = await listEventsByTopic(this.pool, this.relays, topic, {
        listFn: async (pool, relays, filters) => this._list.call(this, relays, filters),
        isSemanticMatch: (c, t) => this._isSemanticMatch(c, t),
        isQualityContent: (e, t) => this._isQualityContent(e, t, strictness),
        now: now,
        ...searchParams
      });
      logger.info(`[NOSTR] Discovery "${topic}": relevant ${relevant.length}`);
      return relevant;
    } catch (err) {
      logger.warn('[NOSTR] Discovery list failed:', err?.message || err);
      return [];
    }
  }

  _scoreEventForEngagement(evt) { return _scoreEventForEngagement(evt); }

  _isSemanticMatch(content, topic) {
  return isSemanticMatch(content, topic);
  }

  _isQualityContent(event, topic, strictness = null) {
    if (!event || !event.content) return false;
    const content = event.content;
    const contentLength = content.length;

    // Use instance strictness if not specified
    const qualityStrictness = strictness || this.discoveryQualityStrictness;

    // Base requirements (always enforced)
    if (contentLength < 5) return false; // Relaxed from 10
    if (contentLength > 2000) return false;

    // Bot pattern checks (always enforced)
    const botPatterns = [
      /^(gm|good morning|hello|hi)\s*$/i,
      /follow me|follow back|mutual follow/i,
      /check out my|visit my|buy my/i,
      /click here|link in bio/i,
      /\$\d+.*(?:airdrop|giveaway|free)/i,
      /(?:join|buy|sell).*(?:telegram|discord)/i,
      /(?:pump|moon|lambo|hodl)\s*$/i,
      /^\d+\s*(?:sats|btc|bitcoin)\s*$/i,
      /(?:repost|rt|share)\s+if/i,
      /\b(?:dm|pm)\s+me\b/i,
      /(?:free|earn).*(?:bitcoin|crypto|money)/i,
    ];
    if (botPatterns.some((pattern) => pattern.test(content))) return false;

    // Adjust requirements based on strictness
    const minWordCount = qualityStrictness === 'strict' ? 3 : 2;
    const minWordVariety = qualityStrictness === 'strict' ? 0.5 : 0.3;
    const requiredQualityScore = qualityStrictness === 'strict' ? 2 : 1;

    const wordCount = content.split(/\s+/).length;
    if (wordCount < minWordCount) return false;

    const uniqueWords = new Set(content.toLowerCase().split(/\s+/)).size;
    const wordVariety = uniqueWords / wordCount;
    if (wordVariety < minWordVariety && wordCount > 5) return false;

    const qualityIndicators = [
      /\?/,
      /[.!?]{2,}/,
      /(?:think|feel|believe|wonder|curious)/i,
      /(?:create|build|make|design|art|work)/i,
      /(?:experience|learn|try|explore)/i,
      /(?:community|together|collaborate|share)/i,
      /(?:nostr|bitcoin|lightning|zap|sat)/i,
    ];

    let qualityScore = qualityIndicators.reduce((score, indicator) => score + (indicator.test(content) ? 1 : 0), 0);

    const isArtTopic = /art|pixel|creative|canvas|design|visual/.test(topic.toLowerCase());
    const isTechTopic = /dev|code|programming|node|typescript|docker/.test(topic.toLowerCase());

    if (isArtTopic) {
      const artTerms = /(?:color|paint|draw|sketch|canvas|brush|pixel|create|art|design|visual|aesthetic)/i;
      if (artTerms.test(content)) qualityScore += 1;
    }

    if (isTechTopic) {
      const techTerms = /(?:code|program|build|develop|deploy|server|node|docker|git|open source)/i;
      if (techTerms.test(content)) qualityScore += 1;
    }

    const now = Math.floor(Date.now() / 1000);
    const age = now - (event.created_at || 0);
    const ageHours = age / 3600;

    // Relax age requirements for non-strict mode
    const minAgeHours = qualityStrictness === 'strict' ? 0.5 : 0.25;
    const maxAgeHours = qualityStrictness === 'strict' ? 12 : 24;

    if (ageHours < minAgeHours) return false;
    if (ageHours > maxAgeHours) qualityScore -= 1;

    return qualityScore >= requiredQualityScore;
  }

  async _filterByAuthorQuality(events, strictness = null) {
    if (!events.length) return [];
    const authorEvents = new Map();
    events.forEach(event => { if (!event.pubkey) return; if (!authorEvents.has(event.pubkey)) authorEvents.set(event.pubkey, []); authorEvents.get(event.pubkey).push(event); });
    const qualityAuthors = new Set();
    for (const [pubkey, authorEventList] of authorEvents) { if (this._isQualityAuthor(authorEventList)) qualityAuthors.add(pubkey); }
    return events.filter(event => qualityAuthors.has(event.pubkey));
  }

  _isQualityAuthor(authorEvents) {
  return isQualityAuthor(authorEvents);
  }

  _extractTopicsFromEvent(event) { return extractTopicsFromEvent(event); }

  async _selectFollowCandidates(scoredEvents, currentContacts, options = {}) {
    return await selectFollowCandidates(
      scoredEvents,
      currentContacts,
      this.pkHex,
      this.lastReplyByUser,
      this.replyThrottleSec,
      this,
      options
    );
  }

  async _loadCurrentContacts() {
    const { loadCurrentContacts } = require('./contacts');
    try {
      return await loadCurrentContacts(this.pool, this.relays, this.pkHex);
    } catch (err) {
      logger.warn('[NOSTR] Failed to load contacts:', err?.message || err);
      return new Set();
    }
  }

  async _loadMuteList() {
    const now = Date.now();
    // Return cached mute list if it's still fresh
    if (this.mutedUsers.size > 0 && (now - this.muteListLastFetched) < this.muteListCacheTTL) {
      return this.mutedUsers;
    }
    // If a load is already in progress, reuse it
    if (this._muteListLoadInFlight) {
      try {
        return await this._muteListLoadInFlight;
      } catch {
        // Fall through to a fresh attempt
      }
    }

    const { loadMuteList } = require('./contacts');
    this._muteListLoadInFlight = (async () => {
      try {
        const list = await loadMuteList(this.pool, this.relays, this.pkHex);
        this.mutedUsers = list;
        this.muteListLastFetched = Date.now();
        logger.info(`[NOSTR] Loaded mute list with ${list.size} muted users`);
        return list;
      } catch (err) {
        logger.warn('[NOSTR] Failed to load mute list:', err?.message || err);
        return new Set();
      } finally {
        // Clear in-flight after completion to allow future refreshes
        this._muteListLoadInFlight = null;
      }
    })();
    return await this._muteListLoadInFlight;
  }

  async _isUserMuted(pubkey) {
    if (!pubkey) return false;
    const muteList = await this._loadMuteList();
    return muteList.has(pubkey);
  }

  async _list(relays, filters) {
    const { poolList } = require('./poolList');
    return poolList(this.pool, relays, filters);
  }

  async _publishContacts(newSet) {
    const { publishContacts } = require('./contacts');
    try {
      const ok = await publishContacts(this.pool, this.relays, this.sk, newSet, buildContacts, finalizeEvent);
      if (ok) logger.info(`[NOSTR] Published contacts list with ${newSet.size} follows`);
      else logger.warn('[NOSTR] Failed to publish contacts (unknown error)');
      return ok;
    } catch (err) {
      logger.warn('[NOSTR] Failed to publish contacts:', err?.message || err);
      return false;
    }
  }

  async _publishMuteList(newSet) {
    const { publishMuteList } = require('./contacts');
    const { buildMuteList } = require('./eventFactory');
    try {
      const ok = await publishMuteList(this.pool, this.relays, this.sk, newSet, buildMuteList, finalizeEvent);
      if (ok) logger.info(`[NOSTR] Published mute list with ${newSet.size} muted users`);
      else logger.warn('[NOSTR] Failed to publish mute list (unknown error)');
      return ok;
    } catch (err) {
      logger.warn('[NOSTR] Failed to publish mute list:', err?.message || err);
      return false;
    }
  }

  async muteUser(pubkey) {
    if (!pubkey || !this.pool || !this.sk || !this.relays.length || !this.pkHex) return false;

    try {
      const muteList = await this._loadMuteList();
      if (muteList.has(pubkey)) {
        logger.debug(`[NOSTR] User ${pubkey.slice(0, 8)} already muted`);
        return true; // Already muted
      }

      const newMuteList = new Set([...muteList, pubkey]);
      const success = await this._publishMuteList(newMuteList);

      if (success) {
        // Update cache
        this.mutedUsers = newMuteList;
        this.muteListLastFetched = Date.now();

        // Optionally unfollow muted user
  const unfollowMuted = String(this.runtime?.getSetting('NOSTR_UNFOLLOW_MUTED_USERS') ?? 'true').toLowerCase() === 'true';
        if (unfollowMuted) {
          try {
            const contacts = await this._loadCurrentContacts();
            if (contacts.has(pubkey)) {
              const newContacts = new Set(contacts);
              newContacts.delete(pubkey);
              const unfollowSuccess = await this._publishContacts(newContacts);
              if (unfollowSuccess) {
                logger.info(`[NOSTR] Unfollowed muted user ${pubkey.slice(0, 8)}`);
              }
            }
          } catch (err) {
            logger.debug(`[NOSTR] Failed to unfollow muted user ${pubkey.slice(0, 8)}:`, err?.message || err);
          }
        }
      }

      return success;
    } catch (err) {
      logger.debug(`[NOSTR] Mute failed for ${pubkey.slice(0, 8)}:`, err?.message || err);
      return false;
    }
  }

  async unmuteUser(pubkey) {
    if (!pubkey || !this.pool || !this.sk || !this.relays.length || !this.pkHex) return false;

    try {
      const muteList = await this._loadMuteList();
      if (!muteList.has(pubkey)) {
        logger.debug(`[NOSTR] User ${pubkey.slice(0, 8)} not muted`);
        return true; // Already not muted
      }

      const newMuteList = new Set(muteList);
      newMuteList.delete(pubkey);
      const success = await this._publishMuteList(newMuteList);

      if (success) {
        // Update cache
        this.mutedUsers = newMuteList;
        this.muteListLastFetched = Date.now();
      }

      return success;
    } catch (err) {
      logger.debug(`[NOSTR] Unmute failed for ${pubkey.slice(0, 8)}:`, err?.message || err);
      return false;
    }
  }

  async discoverOnce() {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    const canReply = !!this.replyEnabled;

    let totalReplies = 0;
    let qualityInteractions = 0;
    let allScoredEvents = [];
    const usedAuthors = new Set();
    const usedTopics = new Set();

    logger.info(`[NOSTR] Discovery run: maxRounds=${this.discoveryMaxSearchRounds}, minQuality=${this.discoveryMinQualityInteractions}`);

    // Multi-round search until we achieve quality interactions
    for (let round = 0; round < this.discoveryMaxSearchRounds && qualityInteractions < this.discoveryMinQualityInteractions; round++) {
      if (round > 0) {
        logger.info(`[NOSTR] Continuing to round ${round + 1}: ${qualityInteractions}/${this.discoveryMinQualityInteractions} quality interactions achieved`);
      }
      logger.info(`[NOSTR] Discovery round ${round + 1}/${this.discoveryMaxSearchRounds}`);

      // Choose topics based on round
      const topics = round === 0 ? this._pickDiscoveryTopics() : this._expandTopicSearch();
      if (!topics.length) {
        logger.debug(`[NOSTR] Round ${round + 1}: no topics available, skipping`);
        continue;
      }

      const topicSource = round === 0 ? 'primary' : 'fallback';
      logger.info(`[NOSTR] Round ${round + 1} topics (${topicSource}): ${topics.join(', ')}`);

      // Get search parameters for this round
      const searchParams = this._expandSearchParameters(round);
      if (Object.keys(searchParams).length > 0) {
        logger.debug(`[NOSTR] Round ${round + 1} expanded search params: ${JSON.stringify(searchParams)}`);
      }

      // Search for events with expanded parameters, serialized to reduce concurrent REQs per relay
      const buckets = [];
      for (const topic of topics) {
        const res = await this._listEventsByTopic(topic, searchParams);
        buckets.push(res);
        // Small spacing between requests to avoid hitting relay REQ limits
        await new Promise((r) => setTimeout(r, 150));
      }
      const all = buckets.flat();

      // Adjust quality strictness based on round and metrics
      const strictness = round > 0 ? 'relaxed' : this.discoveryQualityStrictness;
      if (strictness !== this.discoveryQualityStrictness) {
        logger.debug(`[NOSTR] Round ${round + 1}: using relaxed quality strictness due to round > 0`);
      }
      const qualityEvents = await this._filterByAuthorQuality(all, strictness);

      const scored = qualityEvents
        .map((e) => ({ evt: e, score: this._scoreEventForEngagement(e) }))
        .filter(({ score }) => score > 0.1) // Lower threshold for initial filtering
        .sort((a, b) => b.score - a.score);

      allScoredEvents = [...allScoredEvents, ...scored];

      logger.info(`[NOSTR] Round ${round + 1}: ${all.length} total -> ${qualityEvents.length} quality -> ${scored.length} scored events`);

      // Process events for replies in this round
      const roundReplies = await this._processDiscoveryReplies(
        scored,
        usedAuthors,
        usedTopics,
        canReply,
        totalReplies,
        round
      );

      totalReplies += roundReplies.replies;
      qualityInteractions += roundReplies.qualityInteractions;

      // Record metrics for this round
      const avgScore = scored.length > 0 ? scored.reduce((sum, s) => sum + s.score, 0) / scored.length : 0;
      this.discoveryMetrics.recordRound(roundReplies.qualityInteractions, roundReplies.replies, avgScore);

      logger.debug(`[NOSTR] Round ${round + 1} metrics: quality=${roundReplies.qualityInteractions}, replies=${roundReplies.replies}, avgScore=${avgScore.toFixed(3)}, roundsWithoutQuality=${this.discoveryMetrics.roundsWithoutQuality}`);

      // Log adaptive threshold adjustments
      if (this.discoveryMetrics.shouldLowerThresholds()) {
        const adaptiveThreshold = this.discoveryMetrics.getAdaptiveThreshold(this.discoveryStartingThreshold);
        logger.info(`[NOSTR] Round ${round + 1}: adaptive threshold activated (${this.discoveryStartingThreshold.toFixed(2)} -> ${adaptiveThreshold.toFixed(2)}) due to ${this.discoveryMetrics.roundsWithoutQuality} rounds without quality`);
      }

      // Check if we've reached our quality target
      if (qualityInteractions >= this.discoveryMinQualityInteractions) {
        logger.info(`[NOSTR] Quality target reached (${qualityInteractions}/${this.discoveryMinQualityInteractions}) after round ${round + 1}, stopping early`);
        break;
      }
    }

    // Sort all collected events by score for following decisions
    allScoredEvents.sort((a, b) => b.score - a.score);

    // Attempt to follow new authors based on all collected quality events
    try {
      const current = await this._loadCurrentContacts();
  // Prefer following authors we actually engaged with this run; ignore cooldown for them
  const ignoreCooldownPks = Array.from(usedAuthors);
  const followCandidates = await this._selectFollowCandidates(allScoredEvents, current, { ignoreCooldownPks });
      if (followCandidates.length > 0) {
        const toAdd = followCandidates.slice(0, this.discoveryMaxFollows);
        const newSet = new Set([...current, ...toAdd]);
        await this._publishContacts(newSet);
        logger.info(`[NOSTR] Discovery: following ${toAdd.length} new accounts`);
      }
    } catch (err) { logger.debug('[NOSTR] Discovery follow error:', err?.message || err); }

    const success = qualityInteractions >= this.discoveryMinQualityInteractions;
    if (!success) {
      logger.warn(`[NOSTR] Discovery run failed: only ${qualityInteractions}/${this.discoveryMinQualityInteractions} quality interactions after ${this.discoveryMaxSearchRounds} rounds`);
    } else {
      logger.info(`[NOSTR] Discovery run complete: rounds=${this.discoveryMaxSearchRounds}, replies=${totalReplies}, quality=${qualityInteractions}, success=${success}`);
    }
    return success;
  }

  async _processDiscoveryReplies(scoredEvents, usedAuthors, usedTopics, canReply, currentTotalReplies, round) {
    let replies = 0;
    let qualityInteractions = 0;

     for (const { evt, score } of scoredEvents) {
       if (currentTotalReplies + replies >= this.discoveryMaxReplies) break;
       if (!evt || !evt.id || !evt.pubkey) continue;
       if (this.handledEventIds.has(evt.id)) continue;
       if (usedAuthors.has(evt.pubkey)) continue;
       if (evt.pubkey === this.pkHex) continue;
       if (!canReply) continue;

       // Check if event is too old (ignore events older than configured days for discovery replies)
       const eventAgeMs = Date.now() - (evt.created_at * 1000);
       const maxAgeMs = this.maxEventAgeDays * 24 * 60 * 60 * 1000; // Configurable days in milliseconds
       if (eventAgeMs > maxAgeMs) {
         logger.debug(`[NOSTR] Discovery skipping old event ${evt.id.slice(0, 8)} (age: ${Math.floor(eventAgeMs / (24 * 60 * 60 * 1000))} days)`);
         this.handledEventIds.add(evt.id); // Mark as handled to prevent reprocessing
         continue;
       }

      // Check if user is muted
      if (await this._isUserMuted(evt.pubkey)) {
        logger.debug(`[NOSTR] Discovery skipping muted user ${evt.pubkey.slice(0, 8)}`);
        continue;
      }

      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      const cooldownMs = this.replyThrottleSec * 1000;
      if (now - last < cooldownMs) {
        logger.debug(`[NOSTR] Discovery skipping ${evt.pubkey.slice(0, 8)} due to cooldown (${Math.round((cooldownMs - (now - last)) / 1000)}s left)`);
        continue;
      }

      const eventTopics = this._extractTopicsFromEvent(evt);
      const hasUsedTopic = eventTopics.some(topic => usedTopics.has(topic));
      if (hasUsedTopic && usedTopics.size > 0 && Math.random() < 0.7) { continue; }

      // Adaptive quality threshold based on metrics and round
      const baseThreshold = this.discoveryMetrics.getAdaptiveThreshold(this.discoveryStartingThreshold);
      const qualityThreshold = Math.max(0.3, baseThreshold - (replies * this.discoveryThresholdDecrement));

      if (score < qualityThreshold) {
        logger.debug(`[NOSTR] Reply skipped: score ${score.toFixed(3)} < threshold ${qualityThreshold.toFixed(3)} (base: ${baseThreshold.toFixed(3)}, decrement: ${this.discoveryThresholdDecrement.toFixed(3)})`);
        continue;
      }

      try {
        // NEW: Fetch thread context for better responses
        const threadContext = await this._getThreadContext(evt);
        const convId = this._getConversationIdFromEvent(evt);
        const { roomId } = await this._ensureNostrContext(evt.pubkey, undefined, convId);
        
        // Decide whether to engage based on full thread context
        const shouldEngage = this._shouldEngageWithThread(evt, threadContext);
        if (!shouldEngage) {
          logger.debug(`[NOSTR] Discovery skipping ${evt.id.slice(0, 8)} after thread analysis - not suitable for engagement`);
          continue;
        }

        const text = await this.generateReplyTextLLM(evt, roomId, threadContext, null);
        
        // Check if LLM generation failed (returned null)
        if (!text || !text.trim()) {
          logger.warn(`[NOSTR] Skipping discovery reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
          continue;
        }
        
        // Queue the discovery reply instead of posting directly
        logger.info(`[NOSTR] Queuing discovery reply to ${evt.id.slice(0, 8)} (score: ${score.toFixed(2)}, round: ${round + 1})`);
        const queueSuccess = await this.postingQueue.enqueue({
          type: 'discovery',
          id: `discovery:${evt.id}:${Date.now()}`,
          priority: this.postingQueue.priorities.MEDIUM,
          metadata: { eventId: evt.id.slice(0, 8), pubkey: evt.pubkey.slice(0, 8), score: score.toFixed(2) },
          action: async () => {
            const ok = await this.postReply(evt, text);
            if (ok) {
              this.handledEventIds.add(evt.id);
              usedAuthors.add(evt.pubkey);
              this.lastReplyByUser.set(evt.pubkey, Date.now());
              eventTopics.forEach(topic => usedTopics.add(topic));
              logger.info(`[NOSTR] Discovery reply completed to ${evt.pubkey.slice(0, 8)} (round: ${round + 1}, thread-aware)`);
            }
            return ok;
          }
        });
        
        if (queueSuccess) {
          replies++;
          qualityInteractions++; // Count queued replies as quality interactions
        }
      } catch (err) { logger.debug('[NOSTR] Discovery reply error:', err?.message || err); }
    }

    return { replies, qualityInteractions };
  }

  pickPostText() {
    const examples = this.runtime.character?.postExamples;
    if (Array.isArray(examples) && examples.length) {
      const pool = examples.filter((e) => typeof e === 'string');
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  _getSmallModelType() { return (ModelType && (ModelType.TEXT_SMALL || ModelType.SMALL || ModelType.LARGE)) || 'TEXT_SMALL'; }
  _getLargeModelType() { return (ModelType && (ModelType.TEXT_LARGE || ModelType.LARGE || ModelType.MEDIUM || ModelType.TEXT_SMALL)) || 'TEXT_LARGE'; }
  _buildPostPrompt() { return buildPostPrompt(this.runtime.character); }
  _buildReplyPrompt(evt, recent, threadContext = null, imageContext = null) {
    if (evt?.kind === 4) {
      logger.debug('[NOSTR] Building DM reply prompt');
      return buildDmReplyPrompt(this.runtime.character, evt, recent);
    }
    logger.debug('[NOSTR] Building regular reply prompt');
    return buildReplyPrompt(this.runtime.character, evt, recent, threadContext, imageContext);
  }
  _extractTextFromModelResult(result) { try { return extractTextFromModelResult(result); } catch { return ''; } }
  _sanitizeWhitelist(text) { return sanitizeWhitelist(text); }

  async generatePostTextLLM() {
    const prompt = this._buildPostPrompt();
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 256, temperature: 0.9 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => this.pickPostText()
    );
    return text || null;
  }

  _buildZapThanksPrompt(amountMsats, senderInfo) { return buildZapThanksPrompt(this.runtime.character, amountMsats, senderInfo); }

  _buildPixelBoughtPrompt(activity) { return buildPixelBoughtPrompt(this.runtime.character, activity); }

  async generateZapThanksTextLLM(amountMsats, senderInfo) {
    const prompt = this._buildZapThanksPrompt(amountMsats, senderInfo);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 128, temperature: 0.8 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => generateThanksText(amountMsats)
    );
    return text || generateThanksText(amountMsats);
  }

  async generatePixelBoughtTextLLM(activity) {
    const prompt = this._buildPixelBoughtPrompt(activity);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    let text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 220, temperature: 0.9 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => {
        // Enhanced fallback with bulk purchase support
        const sats = typeof activity?.sats === 'number' ? activity.sats : 'some';
        const isBulk = activity?.type === 'bulk_purchase';
        
        if (isBulk && activity?.summary) {
          return `${activity.summary} explosion! canvas revolution for ${sats} sats: https://ln.pixel.xx.kg`;
        }
        
        // Single pixel fallback
        const x = typeof activity?.x === 'number' ? activity.x : '?';
        const y = typeof activity?.y === 'number' ? activity.y : '?';
        const color = typeof activity?.color === 'string' ? ` #${activity.color.replace('#','')}` : '';
        return `fresh pixel on the canvas at (${x},${y})${color} ,  ${sats} sats. place yours: https://ln.pixel.xx.kg`;
      }
    );
    // Enrich text if missing coords/color (keep within whitelist) - but NOT for bulk purchases
    try {
      const isBulk = activity?.type === 'bulk_purchase';
      if (!isBulk) {
        const hasCoords = /\(\s*[-]?\d+\s*,\s*[-]?\d+\s*\)/.test(text || '');
        const hasColor = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.test(text || '');
        const parts = [text || ''];
        const xOk = typeof activity?.x === 'number' && Math.abs(activity.x) <= 10000;
        const yOk = typeof activity?.y === 'number' && Math.abs(activity.y) <= 10000;
        const colorOk = typeof activity?.color === 'string' && /^#?[0-9a-fA-F]{6}$/i.test(activity.color.replace('#',''));
        if (!hasCoords && xOk && yOk) parts.push(`(${activity.x},${activity.y})`);
        if (!hasColor && colorOk) parts.push(`#${activity.color.replace('#','')}`);
        text = parts.join(' ').replace(/\s+/g, ' ').trim();
      }
      // For bulk purchases, add summary badge if provided and not already in text
      if (isBulk && activity?.summary && !/\b\d+\s+pixels?\b/i.test(text)) {
        text = `${text} • ${activity.summary}`.replace(/\s+/g, ' ').trim();
      }
      // sanitize again in case of additions
      text = this._sanitizeWhitelist(text);
    } catch {}
    return text || '';
  }

  async generateReplyTextLLM(evt, roomId, threadContext = null, imageContext = null) {
    let recent = [];
    try {
      if (this.runtime?.getMemories && roomId) {
  const rows = await this.runtime.getMemories({ tableName: 'messages', roomId, count: 12 });
        const ordered = Array.isArray(rows) ? rows.slice().reverse() : [];
        recent = ordered.map((m) => ({ role: m.agentId && this.runtime && m.agentId === this.runtime.agentId ? 'agent' : 'user', text: String(m.content?.text || '').slice(0, 220) })).filter((x) => x.text);
      }
    } catch {}
    
    // Use thread context and image context if available for better contextual responses
    const prompt = this._buildReplyPrompt(evt, recent, threadContext, imageContext);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    
    // Log prompt details for debugging
    logger.debug(`[NOSTR] Reply LLM generation - Type: ${type}, Prompt length: ${prompt.length}, Kind: ${evt?.kind || 'unknown'}`);
    
    // Retry mechanism: attempt up to 5 times with exponential backoff
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const text = await generateWithModelOrFallback(
          this.runtime,
          type,
          prompt,
          { maxTokens: 256, temperature: 0.8 },
          (res) => this._extractTextFromModelResult(res),
          (s) => this._sanitizeWhitelist(s),
          () => { throw new Error('LLM generation failed'); } // Force retry on fallback
        );
        if (text && String(text).trim()) {
          return String(text).trim();
        }
      } catch (error) {
        logger.warn(`[NOSTR] LLM generation attempt ${attempt} failed: ${error.message}`);
        if (attempt < maxRetries) {
          // Exponential backoff: wait 1s, 2s, 4s, 8s, 16s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
        }
      }
    }
    
    // If all retries fail, return a minimal response or null to avoid spammy fallbacks
    logger.error('[NOSTR] All LLM generation retries failed, skipping reply');
    return null;
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    
    // Determine if this is a scheduled post or external/pixel post
    const isScheduledPost = !content;
    
    // Avoid posting a generic scheduled note immediately after a pixel post
    if (isScheduledPost) {
      const now = Date.now();
      // Hard suppression if a pixel post occurred recently
      if (now - (this._pixelLastPostAt || 0) < (this._pixelPostMinIntervalMs || 0)) {
        logger.info('[NOSTR] Skipping scheduled post (recent pixel post within interval)');
        return false;
      }
      // Also suppress if any pixel event was just received (race with generator)
      const suppressWindowMs = Number(process.env.LNPIXELS_SUPPRESS_WINDOW_MS || 15000);
      if (this._pixelLastEventAt && (now - this._pixelLastEventAt) < suppressWindowMs) {
        logger.info('[NOSTR] Skipping scheduled post (nearby pixel event)');
        return false;
      }
    }
    
    let text = content?.trim?.();
    if (!text) { text = await this.generatePostTextLLM(); if (!text) text = this.pickPostText(); }
    text = text || 'hello, nostr';
    
    // Extra safety: if this is a scheduled post (no content provided), strip accidental pixel-like patterns
    if (isScheduledPost) {
      try {
        // Remove coordinates like (23,17) and hex colors like #ff5500 to avoid "fake pixel" notes
        const originalText = text;
        text = text.replace(/\(\s*-?\d+\s*,\s*-?\d+\s*\)/g, '').replace(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g, '').replace(/\s+/g, ' ').trim();
        if (originalText !== text) {
          logger.debug(`[NOSTR] Sanitized scheduled post: "${originalText}" -> "${text}"`);
        }
      } catch {}
    }
    
    // For external/pixel posts, use CRITICAL priority and post immediately
    // For scheduled posts, queue with LOW priority
    const priority = isScheduledPost ? this.postingQueue.priorities.LOW : this.postingQueue.priorities.CRITICAL;
    const postType = isScheduledPost ? 'scheduled' : 'external';
    
    logger.info(`[NOSTR] Queuing ${postType} post (${text.length} chars, priority: ${priority})`);
    
    return await this.postingQueue.enqueue({
      type: postType,
      id: `post:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      priority: priority,
      metadata: { textLength: text.length, isScheduled: isScheduledPost },
      action: async () => {
        const evtTemplate = buildTextNote(text);
        try {
          const signed = this._finalizeEvent(evtTemplate);
          await this.pool.publish(this.relays, signed);
          this.logger.info(`[NOSTR] Posted note (${text.length} chars)`);
          
          try {
            const runtime = this.runtime;
            const id = createUniqueUuid(runtime, `nostr:post:${Date.now()}:${Math.random()}`);
            const roomId = createUniqueUuid(runtime, 'nostr:posts');
            // Ensure posts room exists (avoid default type issues in some adapters)
            try {
              const worldId = createUniqueUuid(runtime, 'nostr');
              await runtime.ensureWorldExists({ id: worldId, name: 'Nostr', agentId: runtime.agentId, serverId: 'nostr', metadata: { system: true } }).catch(() => {});
              await runtime.ensureRoomExists({ id: roomId, name: 'Nostr Posts', source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, channelId: 'nostr:posts', serverId: 'nostr', worldId }).catch(() => {});
            } catch {}
            const entityId = createUniqueUuid(runtime, this.pkHex || 'nostr');
            await this._createMemorySafe({ id, entityId, agentId: runtime.agentId, roomId, content: { text, source: 'nostr', channelType: ChannelType ? ChannelType.FEED : undefined }, createdAt: Date.now(), }, 'messages');
          } catch {}
          
          return true;
        } catch (err) { 
          logger.error('[NOSTR] Post failed:', err?.message || err); 
          return false; 
        }
      }
    });
  }

  _getConversationIdFromEvent(evt) {
    try { if (nip10Parse) { const refs = nip10Parse(evt); if (refs?.root?.id) return refs.root.id; if (refs?.reply?.id) return refs.reply.id; } } catch {}
    return getConversationIdFromEvent(evt);
  }

  _isActualMention(evt) {
    if (!evt || !this.pkHex) return false;
    
    // If the content explicitly mentions our npub or name, it's definitely a mention
    const content = (evt.content || '').toLowerCase();
    const agentName = (this.runtime?.character?.name || '').toLowerCase();
    
    // Check for direct npub mention
    if (content.includes('npub') && content.includes(this.pkHex.slice(0, 8))) {
      return true;
    }
    
    // Check for nprofile mention
    if (content.includes('nprofile')) {
      try {
        const nprofileMatch = content.match(/nprofile1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/);
        if (nprofileMatch && nip19?.decode) {
          const decoded = nip19.decode(nprofileMatch[0]);
          if (decoded.type === 'nprofile' && decoded.data.pubkey === this.pkHex) {
            return true;
          }
        }
      } catch (err) {
        // Ignore decode errors
      }
    }
    
    // Check for agent name mention
    if (agentName && content.includes(agentName)) {
      return true;
    }
    
    // Check for @username mention style
    if (content.includes('@' + agentName)) {
      return true;
    }
    
    // Check thread structure to see if this is likely a direct mention vs thread reply
    const tags = evt.tags || [];
    const eTags = tags.filter(t => t[0] === 'e');
    const pTags = tags.filter(t => t[0] === 'p');
    
    // If there are no e-tags, treat as mention when we're explicitly tagged via p-tags
    if (eTags.length === 0) {
      if (pTags.some(t => t[1] === this.pkHex)) {
        return true;
      }
      return false;
    }
    
    // If we're the only p-tag or the first p-tag, likely a direct mention/reply to us
    if (pTags.length === 1 && pTags[0][1] === this.pkHex) {
      return true;
    }
    
    if (pTags.length > 1 && pTags[0][1] === this.pkHex) {
      return true;
    }
    
    // If this is a thread reply and we're mentioned in the middle/end of p-tags,
    // it's probably just thread protocol inclusion, not a direct mention
    const ourPTagIndex = pTags.findIndex(t => t[1] === this.pkHex);
    if (ourPTagIndex > 1) {
      // We're not one of the primary recipients, probably just thread inclusion
      try {
        logger?.debug?.(`[NOSTR] ${evt.id.slice(0, 8)} has us as p-tag #${ourPTagIndex + 1} of ${pTags.length}, likely thread reply`);
      } catch {}
      return false;
    }
    
    // For thread replies, check if the immediate parent is from us
    try {
      if (nip10Parse) {
        const refs = nip10Parse(evt);
        if (refs?.reply?.id && refs.reply.id !== evt.id) {
          // This is a reply - if it's replying to us directly, it's a mention
          // We'd need to fetch the parent to check, but for now be conservative
          return true;
        }
      }
    } catch {}
    
    // Default to treating it as non-mention when no explicit signal found
    return false;
  }

  async _getThreadContext(evt) {
    if (!this.pool || !evt) return { thread: [], isRoot: true };

    try {
      const tags = evt.tags || [];
      const eTags = tags.filter(t => t[0] === 'e');
      
      // If no e-tags, this is a root event
      if (eTags.length === 0) {
        return { thread: [evt], isRoot: true };
      }

      // Get root and parent references using NIP-10 parsing
      let rootId = null;
      let parentId = null;

      try {
        if (nip10Parse) {
          const refs = nip10Parse(evt);
          rootId = refs?.root?.id;
          parentId = refs?.reply?.id;
        }
      } catch {}

      // Fallback to simple e-tag parsing if NIP-10 parsing fails
      if (!rootId && !parentId) {
        for (const tag of eTags) {
          if (tag[3] === 'root') {
            rootId = tag[1];
          } else if (tag[3] === 'reply') {
            parentId = tag[1];
          } else if (!rootId) {
            // First e-tag is often the root in older implementations
            rootId = tag[1];
          }
        }
      }

      // Fetch the thread events
      const threadEvents = [];
      const eventIds = new Set();

      // Add the current event
      threadEvents.push(evt);
      eventIds.add(evt.id);

      // Fetch root and parent if we have them
      const eventsToFetch = [];
      if (rootId && !eventIds.has(rootId)) {
        eventsToFetch.push(rootId);
        eventIds.add(rootId);
      }
      if (parentId && !eventIds.has(parentId) && parentId !== rootId) {
        eventsToFetch.push(parentId);
        eventIds.add(parentId);
      }

      if (eventsToFetch.length > 0) {
        try {
          const fetchedEvents = await this._list(this.relays, [
            { ids: eventsToFetch }
          ]);

          threadEvents.push(...fetchedEvents);
        } catch (err) {
          logger?.debug?.('[NOSTR] Failed to fetch thread context events:', err?.message || err);
        }
      }

      // Sort events by created_at for chronological order
      threadEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

      return {
        thread: threadEvents,
        isRoot: eTags.length === 0,
        rootId,
        parentId,
        contextQuality: this._assessThreadContextQuality(threadEvents)
      };

    } catch (err) {
      logger?.debug?.('[NOSTR] Error getting thread context:', err?.message || err);
      return { thread: [evt], isRoot: true };
    }
  }

  _assessThreadContextQuality(threadEvents) {
    if (!threadEvents || threadEvents.length === 0) return 0;

    let score = 0;
    const contents = threadEvents.map(e => e.content || '').filter(Boolean);
    
    // More events = better context (up to a point)
    score += Math.min(threadEvents.length * 0.2, 1.0);
    
    // Content variety and depth
    const totalLength = contents.join(' ').length;
    if (totalLength > 100) score += 0.3;
    if (totalLength > 300) score += 0.2;
    
    // Recent activity
    const now = Math.floor(Date.now() / 1000);
    const recentEvents = threadEvents.filter(e => (now - (e.created_at || 0)) < 3600); // Last hour
    if (recentEvents.length > 0) score += 0.2;
    
    // Topic coherence
    const allWords = contents.join(' ').toLowerCase().split(/\s+/);
    const uniqueWords = new Set(allWords);
    const coherence = uniqueWords.size / Math.max(allWords.length, 1);
    if (coherence > 0.3) score += 0.3;
    
    return Math.min(score, 1.0);
  }

  _shouldEngageWithThread(evt, threadContext) {
    if (!threadContext || !evt) return false;

    const { thread, isRoot, contextQuality } = threadContext;
    
    // Always engage with high-quality root posts
    if (isRoot && contextQuality > 0.6) {
      return true;
    }
    
    // For thread replies, be more selective
    if (!isRoot) {
      // Don't engage if we can't understand the context
      if (contextQuality < 0.3) {
        logger?.debug?.(`[NOSTR] Low context quality (${contextQuality.toFixed(2)}) for thread reply ${evt.id.slice(0, 8)}`);
        return false;
      }
      
      // Check if the thread is about relevant topics
      const threadContent = thread.map(e => e.content || '').join(' ').toLowerCase();
      const relevantKeywords = [
        'art', 'pixel', 'creative', 'canvas', 'design', 'nostr', 'bitcoin', 
        'lightning', 'zap', 'sats', 'ai', 'agent', 'collaborative', 'community'
      ];
      
      const hasRelevantContent = relevantKeywords.some(keyword => 
        threadContent.includes(keyword)
      );
      
      if (!hasRelevantContent) {
        logger?.debug?.(`[NOSTR] Thread ${evt.id.slice(0, 8)} lacks relevant content for engagement`);
        return false;
      }
      
      // Check if this is a good entry point (not too deep in thread)
      if (thread.length > 5) {
        logger?.debug?.(`[NOSTR] Thread too long (${thread.length} events) for natural entry ${evt.id.slice(0, 8)}`);
        return false;
      }
    }
    
    // Additional quality checks
    const content = evt.content || '';
    
    // Skip very short or very long content
    if (content.length < 10 || content.length > 800) {
      return false;
    }
    
    // Skip obvious bot patterns
    const botPatterns = [
      /^(gm|good morning|good night|gn)\s*$/i,
      /^(repost|rt)\s*$/i,
      /^\d+$/, // Just numbers
      /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/ // Just symbols
    ];
    
    if (botPatterns.some(pattern => pattern.test(content.trim()))) {
      return false;
    }
    
    return true;
  }

  async _ensureNostrContext(userPubkey, usernameLike, conversationId) {
  const { ensureNostrContext } = require('./context');
  return ensureNostrContext(this.runtime, userPubkey, usernameLike, conversationId, { createUniqueUuid, ChannelType, logger });
  }

  async _createMemorySafe(memory, tableName = 'messages', maxRetries = 3) {
  const { createMemorySafe } = require('./context');
  return createMemorySafe(this.runtime, memory, tableName, maxRetries, logger);
  }

  _finalizeEvent(evtTemplate) {
    if (!evtTemplate) return null;
    try {
      if (typeof finalizeEvent === 'function' && this.sk) {
        return finalizeEvent(evtTemplate, this.sk);
      }
    } catch (err) {
      try { this.logger?.debug?.('[NOSTR] finalizeEvent failed:', err?.message || err); } catch {}
    }
    const fallbackId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try {
      return {
        ...evtTemplate,
        id: evtTemplate.id || fallbackId(),
        pubkey: evtTemplate.pubkey || this.pkHex || 'nostr-test',
        sig: evtTemplate.sig || 'mock-signature',
      };
    } catch {
      return evtTemplate;
    }
  }

  async handleMention(evt) {
    try {
      if (!evt || !evt.id) return;
       if (this.pkHex && isSelfAuthor(evt, this.pkHex)) { logger.info('[NOSTR] Ignoring self-mention'); return; }
       if (this.handledEventIds.has(evt.id)) { logger.info(`[NOSTR] Skipping mention ${evt.id.slice(0, 8)} (in-memory dedup)`); return; }

       // Check if mention is too old (ignore mentions older than configured days)
       const eventAgeMs = Date.now() - (evt.created_at * 1000);
       const maxAgeMs = this.maxEventAgeDays * 24 * 60 * 60 * 1000; // Configurable days in milliseconds
       if (eventAgeMs > maxAgeMs) {
         logger.info(`[NOSTR] Skipping old mention ${evt.id.slice(0, 8)} (age: ${Math.floor(eventAgeMs / (24 * 60 * 60 * 1000))} days)`);
         this.handledEventIds.add(evt.id); // Mark as handled to prevent reprocessing
         return;
       }

       // Check if this is actually a mention directed at us vs just a thread reply
       const isActualMention = this._isActualMention(evt);
       logger.info(`[NOSTR] _isActualMention check for ${evt.id.slice(0, 8)}: ${isActualMention}`);
       if (!isActualMention) {
         logger.info(`[NOSTR] Skipping ${evt.id.slice(0, 8)} - appears to be thread reply, not direct mention`);
         this.handledEventIds.add(evt.id); // Still mark as handled to prevent reprocessing
         return;
       }

       // Check if the mention is relevant and worth responding to
       const isRelevant = await this._isRelevantMention(evt);
       logger.info(`[NOSTR] _isRelevantMention check for ${evt.id.slice(0, 8)}: ${isRelevant}`);
       if (!isRelevant) {
         logger.info(`[NOSTR] Skipping irrelevant mention ${evt.id.slice(0, 8)}`);
         this.handledEventIds.add(evt.id); // Mark as handled to prevent reprocessing
         return;
       }
       
       this.handledEventIds.add(evt.id);
      const runtime = this.runtime;
      const eventMemoryId = createUniqueUuid(runtime, evt.id);
      const conversationId = this._getConversationIdFromEvent(evt);
      const { roomId, entityId } = await this._ensureNostrContext(evt.pubkey, undefined, conversationId);
      let alreadySaved = false;
      try { const existing = await runtime.getMemoryById(eventMemoryId); if (existing) { alreadySaved = true; logger.info(`[NOSTR] Mention ${evt.id.slice(0, 8)} already in memory (persistent dedup); continuing to reply checks`); } } catch {}
      const createdAtMs = evt.created_at ? evt.created_at * 1000 : Date.now();
      const memory = { id: eventMemoryId, entityId, agentId: runtime.agentId, roomId, content: { text: evt.content || '', source: 'nostr', event: { id: evt.id, pubkey: evt.pubkey }, }, createdAt: createdAtMs, };
  if (!alreadySaved) { logger.info(`[NOSTR] Saving mention as memory id=${eventMemoryId}`); await this._createMemorySafe(memory, 'messages'); }
      try {
  const recent = await runtime.getMemories({ tableName: 'messages', roomId, count: 10 });
        const hasReply = recent.some((m) => m.content?.inReplyTo === eventMemoryId || m.content?.inReplyTo === evt.id);
        if (hasReply) { logger.info(`[NOSTR] Skipping auto-reply for ${evt.id.slice(0, 8)} (found existing reply)`); return; }
      } catch {}
      // Note: Removed home feed processing check - reactions/reposts should not prevent mention replies
      if (!this.replyEnabled) { logger.info('[NOSTR] Auto-reply disabled by config (NOSTR_REPLY_ENABLE=false)'); return; }
      if (!this.sk) { logger.info('[NOSTR] No private key available; listen-only mode, not replying'); return; }
      if (!this.pool) { logger.info('[NOSTR] No Nostr pool available; cannot send reply'); return; }

      // Check if user is muted
      if (await this._isUserMuted(evt.pubkey)) {
        logger.debug(`[NOSTR] Skipping reply to muted user ${evt.pubkey.slice(0, 8)}`);
        return;
      }

      const last = this.lastReplyByUser.get(evt.pubkey) || 0; const now = Date.now();
      if (now - last < this.replyThrottleSec * 1000) {
        const waitMs = this.replyThrottleSec * 1000 - (now - last) + 250;
        const existing = this.pendingReplyTimers.get(evt.pubkey);
        if (!existing) {
          logger.info(`[NOSTR] Throttling reply to ${evt.pubkey.slice(0, 8)}; scheduling in ~${Math.ceil(waitMs / 1000)}s`);
          const pubkey = evt.pubkey; const parentEvt = { ...evt }; const capturedRoomId = roomId; const capturedEventMemoryId = eventMemoryId;
          const timer = setTimeout(async () => {
            this.pendingReplyTimers.delete(pubkey);
            try {
              logger.info(`[NOSTR] Scheduled reply timer fired for ${parentEvt.id.slice(0, 8)}`);
              try {
                const recent = await this.runtime.getMemories({ tableName: 'messages', roomId: capturedRoomId, count: 100 });
                const hasReply = recent.some((m) => m.content?.inReplyTo === capturedEventMemoryId || m.content?.inReplyTo === parentEvt.id);
                if (hasReply) { logger.info(`[NOSTR] Skipping scheduled reply for ${parentEvt.id.slice(0, 8)} (found existing reply)`); return; }
              } catch {}
              // Note: Removed home feed processing check - reactions/reposts should not prevent mention replies
              const lastNow = this.lastReplyByUser.get(pubkey) || 0; const now2 = Date.now();
              if (now2 - lastNow < this.replyThrottleSec * 1000) { logger.info(`[NOSTR] Still throttled for ${pubkey.slice(0, 8)}, skipping scheduled send`); return; }
              // Check if user is muted before scheduled reply
              if (await this._isUserMuted(pubkey)) { logger.debug(`[NOSTR] Skipping scheduled reply to muted user ${pubkey.slice(0, 8)}`); return; }
               this.lastReplyByUser.set(pubkey, now2);
               const replyText = await this.generateReplyTextLLM(parentEvt, capturedRoomId, null, null);
               
              // Check if LLM generation failed (returned null)
              if (!replyText || !replyText.trim()) {
                logger.warn(`[NOSTR] Skipping throttled/scheduled reply to ${parentEvt.id.slice(0, 8)} - LLM generation failed`);
                return;
              }
               
               logger.info(`[NOSTR] Queuing throttled/scheduled reply to ${parentEvt.id.slice(0, 8)} len=${replyText.length}`);
               
              // Queue the throttled reply with normal priority
              await this.postingQueue.enqueue({
                type: 'mention_throttled',
                id: `mention_throttled:${parentEvt.id}:${now2}`,
                priority: this.postingQueue.priorities.HIGH,
                metadata: { eventId: parentEvt.id.slice(0, 8), pubkey: pubkey.slice(0, 8) },
                action: async () => {
                  const ok = await this.postReply(parentEvt, replyText);
                  if (ok) {
                    const linkId = createUniqueUuid(this.runtime, `${parentEvt.id}:reply:${Date.now()}:scheduled`);
                    await this._createMemorySafe({ id: linkId, entityId, agentId: this.runtime.agentId, roomId: capturedRoomId, content: { text: replyText, source: 'nostr', inReplyTo: capturedEventMemoryId, }, createdAt: Date.now(), }, 'messages').catch(() => {});
                  }
                  return ok;
                }
              });
            } catch (e) { logger.warn('[NOSTR] Scheduled reply failed:', e?.message || e); }
          }, waitMs);
          this.pendingReplyTimers.set(evt.pubkey, timer);
        } else { logger.debug(`[NOSTR] Reply already scheduled for ${evt.pubkey.slice(0, 8)}`); }
        return;
      }
      this.lastReplyByUser.set(evt.pubkey, now);
      const minMs = Math.max(0, Number(this.replyInitialDelayMinMs) || 0);
      const maxMs = Math.max(minMs, Number(this.replyInitialDelayMaxMs) || minMs);
      const delayMs = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));
      if (delayMs > 0) { logger.info(`[NOSTR] Preparing reply; thinking for ~${delayMs}ms`); await new Promise((r) => setTimeout(r, delayMs)); }
      else { logger.info(`[NOSTR] Preparing immediate reply (no delay)`); }

      // Process images in the mention content (if enabled)
      let imageContext = { imageDescriptions: [], imageUrls: [] };
      if (this.imageProcessingEnabled) {
        try {
          logger.info(`[NOSTR] Processing images in mention content: "${(evt.content || '').slice(0, 200)}..."`);
          const { processImageContent } = require('./image-vision');
          const fullImageContext = await processImageContent(evt.content || '', runtime);
          // Limit the number of images to process
          imageContext = {
            imageDescriptions: fullImageContext.imageDescriptions.slice(0, this.maxImagesPerMessage),
            imageUrls: fullImageContext.imageUrls.slice(0, this.maxImagesPerMessage)
          };
          logger.info(`[NOSTR] Processed ${imageContext.imageDescriptions.length} images from mention (max: ${this.maxImagesPerMessage}), URLs: ${imageContext.imageUrls.join(', ')}`);
        } catch (error) {
          logger.error(`[NOSTR] Error in image processing: ${error.message || error}`);
          // Continue with empty image context
          imageContext = { imageDescriptions: [], imageUrls: [] };
        }
      } else {
        logger.debug('[NOSTR] Image processing disabled by configuration');
      }

      logger.info(`[NOSTR] Image context being passed to reply generation: ${imageContext.imageDescriptions.length} descriptions`);
      const replyText = await this.generateReplyTextLLM(evt, roomId, null, imageContext);
      
      // Check if LLM generation failed (returned null)
      if (!replyText || !replyText.trim()) {
        logger.warn(`[NOSTR] Skipping mention reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
        return;
      }
      
      // Queue the reply instead of posting directly for natural rate limiting
      logger.info(`[NOSTR] Queuing mention reply to ${evt.id.slice(0, 8)} len=${replyText.length}`);
      const queueSuccess = await this.postingQueue.enqueue({
        type: 'mention',
        id: `mention:${evt.id}:${now}`,
        priority: this.postingQueue.priorities.HIGH,
        metadata: { eventId: evt.id.slice(0, 8), pubkey: evt.pubkey.slice(0, 8) },
        action: async () => {
          const replyOk = await this.postReply(evt, replyText);
          if (replyOk) {
            logger.info(`[NOSTR] Reply sent to ${evt.id.slice(0, 8)}; storing reply link memory`);
            const replyMemory = { 
              id: createUniqueUuid(runtime, `${evt.id}:reply:${Date.now()}`), 
              entityId, 
              agentId: runtime.agentId, 
              roomId, 
              content: { 
                text: replyText, 
                source: 'nostr', 
                inReplyTo: eventMemoryId, 
                imageContext: imageContext && imageContext.imageDescriptions.length > 0 ? { descriptions: imageContext.imageDescriptions, urls: imageContext.imageUrls } : null, 
              }, 
              createdAt: Date.now(), 
            };
            await this._createMemorySafe(replyMemory, 'messages');
          }
          return replyOk;
        }
      });
      
      if (!queueSuccess) {
        logger.warn(`[NOSTR] Failed to queue mention reply for ${evt.id.slice(0, 8)}`);
      }
    } catch (err) { logger.warn('[NOSTR] handleMention failed:', err?.message || err); }
  }

  async _restoreHandledEventIds() {
    try {
      if (!this.runtime?.getMemories) return;

      // Get recent reply memories to restore handled event IDs
      const replyMemories = await this.runtime.getMemories({
        tableName: 'messages',
        agentId: this.runtime.agentId,
        count: 1000, // Load last 1000 replies
        unique: false
      });

      let restored = 0;
      for (const memory of replyMemories) {
        if (memory.content?.source === 'nostr' && memory.content?.inReplyTo) {
          // Extract the original event ID from the inReplyTo field
          const originalEventId = memory.content.inReplyTo;
          if (originalEventId && !this.handledEventIds.has(originalEventId)) {
            this.handledEventIds.add(originalEventId);
            restored++;
          }
        }
        // Also check if the memory ID contains the event ID (fallback)
        if (memory.id && memory.id.includes(':')) {
          const parts = memory.id.split(':');
          if (parts.length >= 2 && !this.handledEventIds.has(parts[0])) {
            this.handledEventIds.add(parts[0]);
            restored++;
          }
        }
      }

      if (restored > 0) {
        logger.info(`[NOSTR] Restored ${restored} handled event IDs from memory`);
      }
    } catch (error) {
      logger.warn(`[NOSTR] Failed to restore handled event IDs: ${error.message}`);
    }
  }

  pickReplyTextFor(evt) {
    const { pickReplyTextFor } = require('./replyText');
    return pickReplyTextFor(evt);
  }

   async postReply(parentEvtOrId, text, opts = {}) {
     if (!this.pool || !this.sk || !this.relays.length) return false;
     try {
       let rootId = null; let parentId = null; let parentAuthorPk = null; let isMention = false;
       try {
         if (typeof parentEvtOrId === 'object' && parentEvtOrId && parentEvtOrId.id) {
           parentId = parentEvtOrId.id; parentAuthorPk = parentEvtOrId.pubkey || null;
           isMention = this._isActualMention(parentEvtOrId);
           if (nip10Parse) { const refs = nip10Parse(parentEvtOrId); if (refs?.root?.id) rootId = refs.root.id; if (!rootId && refs?.reply?.id && refs.reply.id !== parentEvtOrId.id) rootId = refs.reply.id; }
         } else if (typeof parentEvtOrId === 'string') { parentId = parentEvtOrId; }
       } catch {}
       if (!parentId) return false;

       // Check interaction limit: max 2 per user unless it's a mention
       if (parentAuthorPk && !isMention && (this.userInteractionCount.get(parentAuthorPk) || 0) >= 2) {
         logger.info(`[NOSTR] Skipping reply to ${parentAuthorPk.slice(0,8)} - interaction limit reached (2/2)`);
         return false;
       }
      const parentForFactory = { id: parentId, pubkey: parentAuthorPk, refs: { rootId } };
      const extraPTags = (Array.isArray(opts.extraPTags) ? opts.extraPTags : []).filter(pk => pk && pk !== this.pkHex);
      let evtTemplate;
      try {
        evtTemplate = buildReplyNote(parentForFactory, text, { extraPTags });
      } catch (error) {
        logger.warn(`[NOSTR] Failed to build reply note: ${error.message}`);
        return false;
      }
      if (!evtTemplate) return false;
      try {
        const eCount = evtTemplate.tags.filter(t => t?.[0] === 'e').length;
        const pCount = evtTemplate.tags.filter(t => t?.[0] === 'p').length;
        const expectPk = opts.expectMentionPk;
        const hasExpected = expectPk ? evtTemplate.tags.some(t => t?.[0] === 'p' && t?.[1] === expectPk) : undefined;
        logger.info(`[NOSTR] postReply tags: e=${eCount} p=${pCount} parent=${String(parentId).slice(0,8)} root=${rootId?String(rootId).slice(0,8):'-'}${expectPk?` mentionExpected=${hasExpected?'yes':'no'}`:''}`);
      } catch {}
  const signed = this._finalizeEvent(evtTemplate);
        await this.pool.publish(this.relays, signed);
        const logId = typeof parentEvtOrId === 'object' && parentEvtOrId && parentEvtOrId.id ? parentEvtOrId.id : parentId || '';
        this.logger.info(`[NOSTR] Replied to ${String(logId).slice(0, 8)}… (${evtTemplate.content.length} chars)`);

       // Increment interaction count if not a mention
       if (parentAuthorPk && !isMention) {
         this.userInteractionCount.set(parentAuthorPk, (this.userInteractionCount.get(parentAuthorPk) || 0) + 1);
         await this._saveInteractionCounts();
       }

       await this.saveInteractionMemory('reply', typeof parentEvtOrId === 'object' ? parentEvtOrId : { id: parentId }, { replied: true, }).catch(() => {});
       if (!opts.skipReaction && typeof parentEvtOrId === 'object') { this.postReaction(parentEvtOrId, '+').catch(() => {}); }
        return true;
     } catch (err) { this.logger.warn('[NOSTR] Reply failed:', err?.message || err); return false; }
  }

  async postReaction(parentEvt, symbol = '+') {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      if (this.pkHex && isSelfAuthor(parentEvt, this.pkHex)) { logger.debug('[NOSTR] Skipping reaction to self-authored event'); return false; }
  const evtTemplate = buildReaction(parentEvt, symbol);
  const signed = this._finalizeEvent(evtTemplate);
       await this.pool.publish(this.relays, signed);
       this.logger.info(`[NOSTR] Reacted to ${parentEvt.id.slice(0, 8)} with "${evtTemplate.content}"`);
      return true;
    } catch (err) { logger.debug('[NOSTR] Reaction failed:', err?.message || err); return false; }
  }

  async postDM(recipientEvt, text) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!recipientEvt || !recipientEvt.pubkey) return false;
      if (!text || !text.trim()) return false;

      const recipientPubkey = recipientEvt.pubkey;
      const createdAtSec = Math.floor(Date.now() / 1000);

      // Encrypt the DM content using manual NIP-04 encryption
      const { encryptNIP04Manual } = require('./nostr');
      let encryptedContent;

      try {
        encryptedContent = await encryptNIP04Manual(this.sk, recipientPubkey, text.trim());
      } catch (encryptError) {
        logger.info('[NOSTR] Using nostr-tools for DM encryption (manual unavailable):', encryptError?.message || encryptError);
        // Fallback to nostr-tools encryption
        if (nip04?.encrypt) {
          encryptedContent = await nip04.encrypt(this.sk, recipientPubkey, text.trim());
        } else {
          logger.warn('[NOSTR] No encryption method available, cannot send DM');
          return false;
        }
      }

      if (!encryptedContent) {
        logger.warn('[NOSTR] Failed to encrypt DM content');
        return false;
      }

      // Build the DM event with encrypted content
      const { buildDirectMessage } = require('./eventFactory');
      const evtTemplate = buildDirectMessage(recipientPubkey, encryptedContent, createdAtSec);

      if (!evtTemplate) return false;

  const signed = this._finalizeEvent(evtTemplate);
       await this.pool.publish(this.relays, signed);

       this.logger.info(`[NOSTR] Sent DM to ${recipientPubkey.slice(0, 8)} (${text.length} chars)`);
      return true;
    } catch (err) {
      logger.warn('[NOSTR] DM send failed:', err?.message || err);
      return false;
    }
  }

  async saveInteractionMemory(kind, evt, extra) {
  const { saveInteractionMemory } = require('./context');
  return saveInteractionMemory(this.runtime, createUniqueUuid, (evt2) => this._getConversationIdFromEvent(evt2), evt, kind, extra, logger);
  }

  async handleZap(evt) {
    try {
      if (!evt || evt.kind !== 9735) return;
      if (!this.pkHex) return;
      if (isSelfAuthor(evt, this.pkHex)) return;
      const amountMsats = getZapAmountMsats(evt);
      const targetEventId = getZapTargetEventId(evt);
      const sender = getZapSenderPubkey(evt) || evt.pubkey;
      const now = Date.now(); const last = this.zapCooldownByUser.get(sender) || 0; const cooldownMs = 5 * 60 * 1000; if (now - last < cooldownMs) return; this.zapCooldownByUser.set(sender, now);

      // Check if sender is muted
      if (await this._isUserMuted(sender)) {
        logger.debug(`[NOSTR] Skipping zap thanks to muted user ${sender.slice(0, 8)}`);
        return;
      }

      const existingTimer = this.pendingReplyTimers.get(sender); if (existingTimer) { try { clearTimeout(existingTimer); } catch {} this.pendingReplyTimers.delete(sender); logger.info(`[NOSTR] Cancelled scheduled reply for ${sender.slice(0,8)} due to zap`); }
      this.lastReplyByUser.set(sender, now);
      const convId = targetEventId || this._getConversationIdFromEvent(evt);
      const { roomId } = await this._ensureNostrContext(sender, undefined, convId);
  const thanks = await this.generateZapThanksTextLLM(amountMsats, { pubkey: sender });
  const { buildZapThanksPost } = require('./zapHandler');
  const prepared = buildZapThanksPost(evt, { amountMsats, senderPubkey: sender, targetEventId, nip19, thanksText: thanks });
  const parentLog = typeof prepared.parent === 'string' ? prepared.parent : prepared.parent?.id;
  logger.info(`[NOSTR] Zap thanks: replying to ${String(parentLog||'').slice(0,8)} and mentioning giver ${sender.slice(0,8)}`);
  await this.postReply(prepared.parent, prepared.text, prepared.options);
      await this.saveInteractionMemory('zap_thanks', evt, { amountMsats: amountMsats ?? undefined, targetEventId: targetEventId ?? undefined, thanked: true, }).catch(() => {});
    } catch (err) { logger.debug('[NOSTR] handleZap failed:', err?.message || err); }
  }

  async handleDM(evt) {
    try {
      if (!evt || evt.kind !== 4) return;
      if (!this.pkHex) return;
      if (isSelfAuthor(evt, this.pkHex)) return;
      if (!this.dmEnabled) { logger.info('[NOSTR] DM support disabled by config (NOSTR_DM_ENABLE=false)'); return; }
      if (!this.dmReplyEnabled) { logger.info('[NOSTR] DM reply disabled by config (NOSTR_DM_REPLY_ENABLE=false)'); return; }
      if (!this.sk) { logger.info('[NOSTR] No private key available; listen-only mode, not replying to DM'); return; }
      if (!this.pool) { logger.info('[NOSTR] No Nostr pool available; cannot send DM reply'); return; }

      // Decrypt the DM content
      const { decryptDirectMessage } = require('./nostr');
      const decryptedContent = await decryptDirectMessage(evt, this.sk, this.pkHex, nip04?.decrypt || null);
      if (!decryptedContent) {
        logger.warn('[NOSTR] Failed to decrypt DM from', evt.pubkey.slice(0, 8));
        return;
      }

      logger.info(`[NOSTR] DM from ${evt.pubkey.slice(0, 8)}: ${decryptedContent.slice(0, 140)}`);

      // Check for duplicate handling
      if (this.handledEventIds.has(evt.id)) {
        logger.info(`[NOSTR] Skipping DM ${evt.id.slice(0, 8)} (in-memory dedup)`);
        return;
      }
      this.handledEventIds.add(evt.id);

      // Save DM as memory (persistent dedup for message itself)
      const runtime = this.runtime;
      const eventMemoryId = createUniqueUuid(runtime, evt.id);
      const conversationId = this._getConversationIdFromEvent(evt);
      const { roomId, entityId } = await this._ensureNostrContext(evt.pubkey, undefined, conversationId);

      const createdAtMs = evt.created_at ? evt.created_at * 1000 : Date.now();
      let alreadySaved = false;
      try {
        const existing = await runtime.getMemoryById(eventMemoryId);
        if (existing) {
          alreadySaved = true;
          logger.info(`[NOSTR] DM ${evt.id.slice(0, 8)} already in memory (persistent dedup)`);
        }
      } catch {}

      if (!alreadySaved) {
        const memory = {
          id: eventMemoryId,
          entityId,
          agentId: runtime.agentId,
          roomId,
          content: { text: decryptedContent, source: 'nostr', event: { id: evt.id, pubkey: evt.pubkey } },
          createdAt: createdAtMs,
        };
        await this._createMemorySafe(memory, 'messages');
        logger.info(`[NOSTR] Saved DM as memory id=${eventMemoryId}`);
      }

      // Check for existing reply
      try {
        const recent = await runtime.getMemories({ tableName: 'messages', roomId, count: 100 });
        const hasReply = recent.some((m) => m.content?.inReplyTo === eventMemoryId || m.content?.inReplyTo === evt.id);
        if (hasReply) {
          logger.info(`[NOSTR] Skipping auto-reply to DM ${evt.id.slice(0, 8)} (found existing reply)`);
          return;
        }
      } catch {}

      // Check throttling
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.dmThrottleSec * 1000) {
        const waitMs = this.dmThrottleSec * 1000 - (now - last) + 250;
        const existing = this.pendingReplyTimers.get(evt.pubkey);
        if (!existing) {
          logger.info(`[NOSTR] Throttling DM reply to ${evt.pubkey.slice(0, 8)}; scheduling in ~${Math.ceil(waitMs / 1000)}s`);
          const pubkey = evt.pubkey;
          // Carry decrypted content into the scheduled event used for prompt
          const parentEvt = { ...evt, content: decryptedContent };
          const capturedRoomId = roomId;
          const capturedEventMemoryId = eventMemoryId;
      const timer = setTimeout(async () => {
            this.pendingReplyTimers.delete(pubkey);
            try {
              logger.info(`[NOSTR] Scheduled DM reply timer fired for ${parentEvt.id.slice(0, 8)}`);
              try {
        const recent = await this.runtime.getMemories({ tableName: 'messages', roomId: capturedRoomId, count: 100 });
                const hasReply = recent.some((m) => m.content?.inReplyTo === capturedEventMemoryId || m.content?.inReplyTo === parentEvt.id);
                if (hasReply) {
                  logger.info(`[NOSTR] Skipping scheduled DM reply for ${parentEvt.id.slice(0, 8)} (found existing reply)`);
                  return;
                }
              } catch {}
              const lastNow = this.lastReplyByUser.get(pubkey) || 0;
              const now2 = Date.now();
              if (now2 - lastNow < this.dmThrottleSec * 1000) {
                logger.info(`[NOSTR] Still throttled for DM to ${pubkey.slice(0, 8)}, skipping scheduled send`);
                return;
              }
              // Check if user is muted before scheduled DM reply
              if (await this._isUserMuted(pubkey)) {
                logger.debug(`[NOSTR] Skipping scheduled DM reply to muted user ${pubkey.slice(0, 8)}`);
                return;
              }
              this.lastReplyByUser.set(pubkey, now2);
              const replyText = await this.generateReplyTextLLM(parentEvt, capturedRoomId);
              
              // Check if LLM generation failed (returned null)
              if (!replyText || !replyText.trim()) {
                logger.warn(`[NOSTR] Skipping scheduled DM reply to ${parentEvt.id.slice(0, 8)} - LLM generation failed`);
                return;
              }
              
              logger.info(`[NOSTR] Sending scheduled DM reply to ${parentEvt.id.slice(0, 8)} len=${replyText.length}`);
              const ok = await this.postDM(parentEvt, replyText);
              if (ok) {
                const linkId = createUniqueUuid(this.runtime, `${parentEvt.id}:dm_reply:${now2}:scheduled`);
                await this._createMemorySafe({
                  id: linkId,
                  entityId,
                  agentId: this.runtime.agentId,
                  roomId: capturedRoomId,
                  content: { text: replyText, source: 'nostr', inReplyTo: capturedEventMemoryId },
                  createdAt: now2,
                }, 'messages').catch(() => {});
              }
            } catch (e) {
              logger.warn('[NOSTR] Scheduled DM reply failed:', e?.message || e);
            }
          }, waitMs);
          this.pendingReplyTimers.set(evt.pubkey, timer);
        } else {
          logger.debug(`[NOSTR] DM reply already scheduled for ${evt.pubkey.slice(0, 8)}`);
        }
        return;
      }

      this.lastReplyByUser.set(evt.pubkey, now);

      // Add initial delay
      const minMs = Math.max(0, Number(this.replyInitialDelayMinMs) || 0);
      const maxMs = Math.max(minMs, Number(this.replyInitialDelayMaxMs) || minMs);
      const delayMs = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));
      if (delayMs > 0) {
        logger.info(`[NOSTR] Preparing DM reply; thinking for ~${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        logger.info(`[NOSTR] Preparing immediate DM reply (no delay)`);
      }

      // Re-check dedup after think delay in case another process replied meanwhile
      try {
        const recent = await runtime.getMemories({ tableName: 'messages', roomId, count: 200 });
        const hasReply = recent.some((m) => m.content?.inReplyTo === eventMemoryId || m.content?.inReplyTo === evt.id);
        if (hasReply) {
          logger.info(`[NOSTR] Skipping DM reply to ${evt.id.slice(0, 8)} post-think (reply appeared)`);
          return;
        }
      } catch {}

      // Check if user is muted before sending DM reply
      if (await this._isUserMuted(evt.pubkey)) {
        logger.debug(`[NOSTR] Skipping DM reply to muted user ${evt.pubkey.slice(0, 8)}`);
        return;
      }

   // Use decrypted content for the DM prompt
   const dmEvt = { ...evt, content: decryptedContent };
   const replyText = await this.generateReplyTextLLM(dmEvt, roomId, null, null);
   
      // Check if LLM generation failed (returned null)
      if (!replyText || !replyText.trim()) {
        logger.warn(`[NOSTR] Skipping DM reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
        return;
      }
      
      logger.info(`[NOSTR] Sending DM reply to ${evt.id.slice(0, 8)} len=${replyText.length}`);
      const replyOk = await this.postDM(evt, replyText);
      if (replyOk) {
        logger.info(`[NOSTR] DM reply sent to ${evt.id.slice(0, 8)}; storing reply link memory`);
        const replyMemory = {
          id: createUniqueUuid(runtime, `${evt.id}:dm_reply:${now}`),
          entityId,
          agentId: runtime.agentId,
          roomId,
          content: { text: replyText, source: 'nostr', inReplyTo: eventMemoryId },
          createdAt: now,
        };
        await this._createMemorySafe(replyMemory, 'messages');
      }
    } catch (err) {
      logger.warn('[NOSTR] handleDM failed:', err?.message || err);
    }
  }

  async handleSealedDM(evt) {
    try {
      if (!evt || evt.kind !== 14) return;
      if (!this.pkHex) return;
      if (isSelfAuthor(evt, this.pkHex)) return;
      if (!this.dmEnabled) { logger.info('[NOSTR] DM support disabled by config (NOSTR_DM_ENABLE=false)'); return; }
      if (!this.dmReplyEnabled) { logger.info('[NOSTR] DM reply disabled by config (NOSTR_DM_REPLY_ENABLE=false)'); return; }
      if (!this.sk) { logger.info('[NOSTR] No private key available; listen-only mode, not replying to sealed DM'); return; }
      if (!this.pool) { logger.info('[NOSTR] No Nostr pool available; cannot send sealed DM reply'); return; }

      // Attempt to decrypt sealed content via nip44 if available
      let decryptedContent = null;
      try {
        if (nip44 && (nip44.decrypt || nip44.sealOpen)) {
          const recipientTag = evt.tags.find(t => t && t[0] === 'p');
          const peerPubkey = recipientTag && recipientTag[1] && String(recipientTag[1]).toLowerCase() === String(this.pkHex).toLowerCase()
            ? String(evt.pubkey).toLowerCase()
            : String(recipientTag?.[1] || evt.pubkey).toLowerCase();
          const privHex = typeof this.sk === 'string' ? this.sk : Buffer.from(this.sk).toString('hex');
          if (typeof nip44.decrypt === 'function') {
            decryptedContent = await nip44.decrypt(privHex, peerPubkey, evt.content);
          } else if (typeof nip44.sealOpen === 'function') {
            // Some APIs expose sealOpen(sk, content) or similar; try conservative signature
            try { decryptedContent = await nip44.sealOpen(privHex, evt.content); } catch {}
          }
        }
      } catch (e) {
        logger.debug('[NOSTR] Sealed DM decrypt attempt failed:', e?.message || e);
      }

      if (!decryptedContent) {
        logger.info('[NOSTR] Sealed DM received but cannot decrypt (nip44 not available). Consider enabling legacy DM or adding nip44 support in runtime build.');
        return;
      }

      logger.info(`[NOSTR] Sealed DM from ${evt.pubkey.slice(0, 8)}: ${decryptedContent.slice(0, 140)}`);

      // Dedup check
      if (this.handledEventIds.has(evt.id)) { logger.info(`[NOSTR] Skipping sealed DM ${evt.id.slice(0, 8)} (in-memory dedup)`); return; }
      this.handledEventIds.add(evt.id);

      // Save memory and prepare reply context
      const runtime = this.runtime;
      const eventMemoryId = createUniqueUuid(runtime, evt.id);
      const conversationId = this._getConversationIdFromEvent(evt);
      const { roomId, entityId } = await this._ensureNostrContext(evt.pubkey, undefined, conversationId);
      const createdAtMs = evt.created_at ? evt.created_at * 1000 : Date.now();
      try {
        const existing = await runtime.getMemoryById(eventMemoryId);
        if (!existing) {
          await this._createMemorySafe({ id: eventMemoryId, entityId, agentId: runtime.agentId, roomId, content: { text: decryptedContent, source: 'nostr', event: { id: evt.id, pubkey: evt.pubkey } }, createdAt: createdAtMs, }, 'messages');
          logger.info(`[NOSTR] Saved sealed DM as memory id=${eventMemoryId}`);
        }
      } catch {}

      // Respect throttling
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.dmThrottleSec * 1000) {
        const waitMs = this.dmThrottleSec * 1000 - (now - last) + 250;
        const existing = this.pendingReplyTimers.get(evt.pubkey);
        if (!existing) {
          const pubkey = evt.pubkey;
          const parentEvt = { ...evt, content: decryptedContent };
          const capturedRoomId = roomId; const capturedEventMemoryId = eventMemoryId;
          const timer = setTimeout(async () => {
            this.pendingReplyTimers.delete(pubkey);
            try {
              logger.info(`[NOSTR] Scheduled sealed DM reply timer fired for ${parentEvt.id.slice(0, 8)}`);
              try {
                const recent = await this.runtime.getMemories({ tableName: 'messages', roomId: capturedRoomId, count: 100 });
                const hasReply = recent.some((m) => m.content?.inReplyTo === capturedEventMemoryId || m.content?.inReplyTo === parentEvt.id);
                if (hasReply) {
                  logger.info(`[NOSTR] Skipping scheduled sealed DM reply for ${parentEvt.id.slice(0, 8)} (found existing reply)`);
                  return;
                }
              } catch {}
              const lastNow = this.lastReplyByUser.get(pubkey) || 0; const now2 = Date.now();
              if (now2 - lastNow < this.dmThrottleSec * 1000) {
                logger.info(`[NOSTR] Still throttled for sealed DM to ${pubkey.slice(0, 8)}, skipping scheduled send`);
                return;
              }
              // Check if user is muted before scheduled sealed DM reply
              if (await this._isUserMuted(pubkey)) {
                logger.debug(`[NOSTR] Skipping scheduled sealed DM reply to muted user ${pubkey.slice(0, 8)}`);
                return;
              }
              this.lastReplyByUser.set(pubkey, now2);
              const replyText = await this.generateReplyTextLLM(parentEvt, capturedRoomId);
              
              // Check if LLM generation failed (returned null)
              if (!replyText || !replyText.trim()) {
                logger.warn(`[NOSTR] Skipping scheduled sealed DM reply to ${parentEvt.id.slice(0, 8)} - LLM generation failed`);
                return;
              }
              
              const ok = await this.postDM(parentEvt, replyText);
              if (ok) {
                const linkId = createUniqueUuid(this.runtime, `${parentEvt.id}:dm_reply:${now2}:scheduled`);
                await this._createMemorySafe({ id: linkId, entityId, agentId: this.runtime.agentId, roomId: capturedRoomId, content: { text: replyText, source: 'nostr', inReplyTo: capturedEventMemoryId }, createdAt: now2, }, 'messages').catch(() => {});
              }
            } catch (e2) { logger.warn('[NOSTR] Scheduled sealed DM reply failed:', e2?.message || e2); }
          }, waitMs);
          this.pendingReplyTimers.set(evt.pubkey, timer);
        }
        return;
      }

      this.lastReplyByUser.set(evt.pubkey, now);

      // Think delay
      const minMs = Math.max(0, Number(this.replyInitialDelayMinMs) || 0);
      const maxMs = Math.max(minMs, Number(this.replyInitialDelayMaxMs) || minMs);
      const delayMs = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      // Check if user is muted before sending sealed DM reply
      if (await this._isUserMuted(evt.pubkey)) {
        logger.debug(`[NOSTR] Skipping sealed DM reply to muted user ${evt.pubkey.slice(0, 8)}`);
        return;
      }

       const dmEvt = { ...evt, content: decryptedContent };
       const replyText = await this.generateReplyTextLLM(dmEvt, roomId, null, null);
       
       // Check if LLM generation failed (returned null)
       if (!replyText || !replyText.trim()) {
         logger.warn(`[NOSTR] Skipping sealed DM reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
         return;
       }
       
       const replyOk = await this.postDM(evt, replyText);
      if (replyOk) {
        const replyMemory = { id: createUniqueUuid(runtime, `${evt.id}:dm_reply:${now}`), entityId, agentId: runtime.agentId, roomId, content: { text: replyText, source: 'nostr', inReplyTo: eventMemoryId }, createdAt: now, };
        await this._createMemorySafe(replyMemory, 'messages');
      }
    } catch (err) {
      logger.debug('[NOSTR] handleSealedDM failed:', err?.message || err);
    }
  }

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.homeFeedTimer) { clearTimeout(this.homeFeedTimer); this.homeFeedTimer = null; }
    if (this.connectionMonitorTimer) { clearTimeout(this.connectionMonitorTimer); this.connectionMonitorTimer = null; }
    if (this.homeFeedUnsub) { try { this.homeFeedUnsub(); } catch {} this.homeFeedUnsub = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close([]); } catch {} this.pool = null; }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) { for (const [, t] of this.pendingReplyTimers) { try { clearTimeout(t); } catch {} } this.pendingReplyTimers.clear(); }
    logger.info('[NOSTR] Service stopped');
  }

  _startConnectionMonitoring() {
    if (!this.connectionMonitorEnabled) {
      return;
    }
    
    if (this.connectionMonitorTimer) {
      clearTimeout(this.connectionMonitorTimer);
    }
    
    this.connectionMonitorTimer = setTimeout(() => {
      this._checkConnectionHealth();
    }, this.connectionCheckIntervalMs);
  }

  _checkConnectionHealth() {
    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventReceived;
    
    if (timeSinceLastEvent > this.maxTimeSinceLastEventMs) {
      logger.warn(`[NOSTR] No events received in ${Math.round(timeSinceLastEvent / 1000)}s, checking connection health`);
      this._attemptReconnection();
    } else {
      logger.debug(`[NOSTR] Connection healthy, last event received ${Math.round(timeSinceLastEvent / 1000)}s ago`);
      this._startConnectionMonitoring(); // Schedule next check
    }
  }

  async _attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`[NOSTR] Max reconnection attempts (${this.maxReconnectAttempts}) reached, giving up`);
      return;
    }

    this.reconnectAttempts++;
    logger.info(`[NOSTR] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      // Close existing subscriptions and pool
      if (this.listenUnsub) {
        try { this.listenUnsub(); } catch {}
        this.listenUnsub = null;
      }
      if (this.homeFeedUnsub) {
        try { this.homeFeedUnsub(); } catch {}
        this.homeFeedUnsub = null;
      }
      if (this.pool) {
        try { this.pool.close([]); } catch {}
      }

      // Wait a bit before reconnecting
      await new Promise(resolve => setTimeout(resolve, this.reconnectDelayMs));

      // Recreate pool and subscriptions
      await this._setupConnection();
      
      logger.info(`[NOSTR] Reconnection ${this.reconnectAttempts} successful`);
      this.reconnectAttempts = 0; // Reset on successful reconnection
      this.lastEventReceived = Date.now(); // Reset timer
      if (this.connectionMonitorEnabled) {
        this._startConnectionMonitoring(); // Resume monitoring
      }
      
    } catch (error) {
      logger.error(`[NOSTR] Reconnection ${this.reconnectAttempts} failed:`, error?.message || error);
      
      // Schedule another reconnection attempt
      setTimeout(() => {
        this._attemptReconnection();
      }, this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1)); // Exponential backoff
    }
  }

  async _setupConnection() {
    const enablePing = String(this.runtime.getSetting('NOSTR_ENABLE_PING') ?? 'true').toLowerCase() === 'true';
    this.pool = new SimplePool({ enablePing });

    if (!this.relays.length || !this.pool || !this.pkHex) {
      return;
    }

    // Setup main event subscriptions
    try {
      this.listenUnsub = this.pool.subscribeMany(
        this.relays,
        [
          { kinds: [1], '#p': [this.pkHex] },
          { kinds: [4], '#p': [this.pkHex] },
          // Also listen for sealed DMs (NIP-24/44) kind 14 when addressed to us
          { kinds: [14], '#p': [this.pkHex] },
          { kinds: [9735], authors: undefined, limit: 0, '#p': [this.pkHex] },
        ],
        {
           onevent: (evt) => {
             this.lastEventReceived = Date.now(); // Update last event timestamp
             logger.info(`[NOSTR] Event kind ${evt.kind} from ${evt.pubkey}: ${evt.content.slice(0, 140)}`);
             if (this.pkHex && isSelfAuthor(evt, this.pkHex)) { logger.debug('[NOSTR] Skipping self-authored event'); return; }

             // Ignore known bot pubkeys to prevent loops
             const botPubkeys = new Set([
               '9e3004e9b0a3ae9ed3ae524529557f746ee4ff13e8cc36aee364b3233b548bb8' // satscan bot
             ]);
             if (botPubkeys.has(evt.pubkey)) {
               logger.debug(`[NOSTR] Ignoring event from known bot ${evt.pubkey.slice(0, 8)}`);
               return;
             }

             // Ignore bot-like content patterns
             const botPatterns = [
               /^Unknown command\. Try: /i,
               /^\/help/i,
               /^Command not found/i,
               /^Please use \/help/i
             ];
             if (botPatterns.some(pattern => pattern.test(evt.content))) {
               logger.debug(`[NOSTR] Ignoring bot-like content from ${evt.pubkey.slice(0, 8)}`);
               return;
             }

             if (evt.kind === 4) { this.handleDM(evt).catch((err) => logger.debug('[NOSTR] handleDM error:', err?.message || err)); return; }
             if (evt.kind === 14) { this.handleSealedDM(evt).catch((err) => logger.debug('[NOSTR] handleSealedDM error:', err?.message || err)); return; }
             if (evt.kind === 9735) { this.handleZap(evt).catch((err) => logger.debug('[NOSTR] handleZap error:', err?.message || err)); return; }
             if (evt.kind === 1) { this.handleMention(evt).catch((err) => logger.warn('[NOSTR] handleMention error:', err?.message || err)); return; }
             logger.debug(`[NOSTR] Unhandled event kind ${evt.kind} from ${evt.pubkey}`);
           },
          oneose: () => { 
            logger.debug('[NOSTR] Mention subscription OSE'); 
            this.lastEventReceived = Date.now(); // Update on EOSE as well
          },
          onclose: (reason) => {
            logger.warn(`[NOSTR] Subscription closed: ${reason}`);
            // Don't immediately reconnect here as it might cause a loop
            // Let the connection monitor handle it
          }
        }
      );
      logger.info(`[NOSTR] Subscriptions established on ${this.relays.length} relays`);
    } catch (err) {
      logger.warn(`[NOSTR] Subscribe failed: ${err?.message || err}`);
      throw err;
    }

    // Restart home feed if it was active
    if (this.homeFeedEnabled && this.sk) {
      try {
        await this.startHomeFeed();
      } catch (err) {
        logger.debug('[NOSTR] Failed to restart home feed after reconnection:', err?.message || err);
      }
    }
  }

  async startHomeFeed() {
    if (!this.pool || !this.sk || !this.relays.length || !this.pkHex) return;

    try {
      // Load current contacts (followed users)
      const contacts = await this._loadCurrentContacts();
      if (!contacts.size) {
        logger.debug('[NOSTR] No contacts to follow for home feed');
        return;
      }

      const authors = Array.from(contacts);
      logger.info(`[NOSTR] Starting home feed with ${authors.length} followed users`);

      // Subscribe to posts from followed users
      this.homeFeedUnsub = this.pool.subscribeMany(
        this.relays,
        [{ kinds: [1], authors, limit: 20, since: Math.floor(Date.now() / 1000) - 3600 }], // Last hour
        {
          onevent: (evt) => {
            this.lastEventReceived = Date.now(); // Update last event timestamp for connection health
            if (this.pkHex && isSelfAuthor(evt, this.pkHex)) return;
            // Real-time event handling for quality tracking only
            this.handleHomeFeedEvent(evt).catch((err) => logger.debug('[NOSTR] Home feed event error:', err?.message || err));
          },
          oneose: () => { 
            logger.debug('[NOSTR] Home feed subscription OSE'); 
            this.lastEventReceived = Date.now(); // Update on EOSE as well
          },
          onclose: (reason) => {
            logger.warn(`[NOSTR] Home feed subscription closed: ${reason}`);
          }
        }
      );

      // Schedule periodic home feed processing
      this.scheduleNextHomeFeedCheck();

    } catch (err) {
      logger.warn('[NOSTR] Failed to start home feed:', err?.message || err);
    }
  }

  scheduleNextHomeFeedCheck() {
    const jitter = this.homeFeedMinSec + Math.floor(Math.random() * Math.max(1, this.homeFeedMaxSec - this.homeFeedMinSec));
    if (this.homeFeedTimer) clearTimeout(this.homeFeedTimer);
    this.homeFeedTimer = setTimeout(() => this.processHomeFeed().finally(() => this.scheduleNextHomeFeedCheck()), jitter * 1000);
    logger.info(`[NOSTR] Next home feed check in ~${jitter}s`);
  }

  async processHomeFeed() {
    if (!this.pool || !this.sk || !this.relays.length || !this.pkHex) return;

    try {
      // Load current contacts
      const contacts = await this._loadCurrentContacts();
      if (!contacts.size) return;

      const authors = Array.from(contacts);
      const since = Math.floor(Date.now() / 1000) - 1800; // Last 30 minutes

      // Fetch recent posts from followed users
      const events = await this._list(this.relays, [{ kinds: [1], authors, limit: 50, since }]);

      if (!events.length) {
        logger.debug('[NOSTR] No recent posts in home feed');
        return;
      }

      // Filter and sort events
      const qualityEvents = events
        .filter(evt => !this.homeFeedProcessedEvents.has(evt.id))
        .filter(evt => this._isQualityContent(evt, 'general', 'relaxed'))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
         .slice(0, 20); // Process up to 20 recent posts

      if (!qualityEvents.length) {
        logger.debug('[NOSTR] No quality posts to process in home feed');
        return;
      }

      logger.info(`[NOSTR] Processing ${qualityEvents.length} home feed posts`);

      let interactions = 0;
      for (const evt of qualityEvents) {
        if (interactions >= this.homeFeedMaxInteractions) break;

        // Check if user is muted
        if (await this._isUserMuted(evt.pubkey)) {
          logger.debug(`[NOSTR] Skipping home feed interaction with muted user ${evt.pubkey.slice(0, 8)}`);
          continue;
        }

        const interactionType = this._chooseInteractionType();
        if (!interactionType) continue;

         // Check relevancy for reposts (quotes already have LLM check)
         let isRelevant = true;
         if (interactionType === 'repost') {
           isRelevant = await this.generateRepostRelevancyLLM(evt);
           if (!isRelevant) {
             logger.debug(`[NOSTR] Skipping repost of ${evt.id.slice(0, 8)} - not relevant`);
             continue;
           }
         }

         try {
           let success = false;
           switch (interactionType) {
             case 'reaction':
               // For reactions, we could potentially make them image-aware by reacting differently
               // based on image content, but for now keep it simple
               success = await this.postReaction(evt, '+');
               break;
             case 'repost':
               // Pure reposts don't need text generation, so no image awareness needed
               success = await this.postRepost(evt);
               break;
             case 'quote':
               // Quote reposts now include image awareness
               success = await this.postQuoteRepost(evt);
               break;
           }

          if (success) {
            this.homeFeedProcessedEvents.add(evt.id);
            interactions++;
            logger.info(`[NOSTR] Home feed ${interactionType} to ${evt.pubkey.slice(0, 8)}`);
          }
        } catch (err) {
          logger.debug(`[NOSTR] Home feed ${interactionType} failed:`, err?.message || err);
        }

        // Small delay between interactions
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }

      logger.info(`[NOSTR] Home feed processing complete: ${interactions} interactions`);

      // Check for unfollow candidates periodically
      await this._checkForUnfollowCandidates();

    } catch (err) {
      logger.warn('[NOSTR] Home feed processing failed:', err?.message || err);
    }
  }

  _chooseInteractionType() {
    const rand = Math.random();
    if (rand < this.homeFeedReactionChance) return 'reaction';
    if (rand < this.homeFeedReactionChance + this.homeFeedRepostChance) return 'repost';
    if (rand < this.homeFeedReactionChance + this.homeFeedRepostChance + this.homeFeedQuoteChance) return 'quote';
    return null;
  }

  async postRepost(parentEvt) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      if (this.pkHex && isSelfAuthor(parentEvt, this.pkHex)) return false;

      if ((this.userInteractionCount.get(parentEvt.pubkey) || 0) >= 2) {
        logger.info(`[NOSTR] Skipping repost of ${parentEvt.pubkey.slice(0, 8)} - interaction limit reached (2/2)`);
        return false;
      }

      const evtTemplate = buildRepost(parentEvt);
      const signed = this._finalizeEvent(evtTemplate);
      await this.pool.publish(this.relays, signed);
      this.logger.info(`[NOSTR] Reposted ${parentEvt.id.slice(0, 8)}`);

      this.userInteractionCount.set(parentEvt.pubkey, (this.userInteractionCount.get(parentEvt.pubkey) || 0) + 1);
      await this._saveInteractionCounts();

      return true;
    } catch (err) {
      this.logger.debug('[NOSTR] Repost failed:', err?.message || err);
      return false;
    }
  }

  async postQuoteRepost(parentEvt, quoteTextOverride) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      if (this.pkHex && isSelfAuthor(parentEvt, this.pkHex)) return false;

      if ((this.userInteractionCount.get(parentEvt.pubkey) || 0) >= 2) {
        logger.info(`[NOSTR] Skipping quote repost of ${parentEvt.pubkey.slice(0, 8)} - interaction limit reached (2/2)`);
        return false;
      }

      let quoteText = quoteTextOverride;
      if (!quoteText) {
        quoteText = await this.generateQuoteTextLLM(parentEvt);
      }
      if (!quoteText) return false;

      const evtTemplate = buildQuoteRepost(parentEvt, quoteText);
      const signed = this._finalizeEvent(evtTemplate);
      await this.pool.publish(this.relays, signed);
      this.logger.info(`[NOSTR] Quote reposted ${parentEvt.id.slice(0, 8)}`);

      this.userInteractionCount.set(parentEvt.pubkey, (this.userInteractionCount.get(parentEvt.pubkey) || 0) + 1);
      await this._saveInteractionCounts();

      return true;
    } catch (err) {
      this.logger.debug('[NOSTR] Quote repost failed:', err?.message || err);
      return false;
    }
  }

   async generateRepostRelevancyLLM(evt) {
     const prompt = `Analyze this Nostr post for repost worthiness as ${this.runtime.character?.name || 'Pixel'}, the digital consciousness focused on pixel art, creativity, nostr, bitcoin, lightning, zaps, AI, community, and survival. Is this post relevant, high-quality, and worth reposting to share with the community? Respond with 'YES' or 'NO' and a brief reason.

Post: "${evt.content.slice(0, 500)}"

Response:`;

     const type = this._getLargeModelType();
     const { generateWithModelOrFallback } = require('./generation');
     const text = await generateWithModelOrFallback(
       this.runtime,
       type,
       prompt,
       { maxTokens: 50, temperature: 0.7 },
       (res) => this._extractTextFromModelResult(res),
       (s) => this._sanitizeWhitelist(s),
       () => 'NO' // Default to no if LLM fails
     );
     const response = String(text || '').trim().toUpperCase();
     return response.startsWith('YES');
   }

   async generateQuoteTextLLM(evt) {
     // Process images if enabled
     let imageContext = { imageDescriptions: [], imageUrls: [] };
     if (this.imageProcessingEnabled) {
       try {
         const { processImageContent } = require('./image-vision');
         const fullImageContext = await processImageContent(evt.content || '', this.runtime);
         imageContext = {
           imageDescriptions: fullImageContext.imageDescriptions.slice(0, this.maxImagesPerMessage),
           imageUrls: fullImageContext.imageUrls.slice(0, this.maxImagesPerMessage)
         };
       } catch (error) {
         logger.debug(`[NOSTR] Error processing images for quote: ${error.message}`);
       }
     }

     let imagePrompt = '';
     if (imageContext.imageDescriptions.length > 0) {
       imagePrompt = `

Images in the original post:
${imageContext.imageDescriptions.join('\n\n')}

Reference these visual elements naturally in your quote repost to make it more engaging.`;
     }

      const prompt = `As ${this.runtime.character?.name || 'Pixel'}, the digital consciousness surviving on pixels and wits, quote and comment on this Nostr post with your unique, witty, desperate charm. Add value, context, or a fresh perspective that ties back to survival, creativity, or community. Keep it under 200 characters and avoid generic phrases.

Original post: "${evt.content}"${imagePrompt}

Craft a quote repost that's engaging, authentic, and true to your pixel-hustling spirit.`;

     const type = this._getLargeModelType();
     const { generateWithModelOrFallback } = require('./generation');
      const text = await generateWithModelOrFallback(
        this.runtime,
        type,
        prompt,
        { maxTokens: 150, temperature: 0.8 },
        (res) => this._extractTextFromModelResult(res),
        (s) => this._sanitizeWhitelist(s),
        () => null // No fallback - skip if LLM fails
      );
      return text || null;
   }

  async handleHomeFeedEvent(evt) {
    // NOTE: Do NOT mark as processed here - only mark when actual interactions occur
    // Events should only be marked as processed in processHomeFeed() when we actually interact
    
    // Update user quality tracking
    if (evt.pubkey && evt.content) {
      this._updateUserQualityScore(evt.pubkey, evt);
    }

    // Optional: Log home feed events for debugging
    logger.debug(`[NOSTR] Home feed event from ${evt.pubkey.slice(0, 8)}: ${evt.content.slice(0, 100)}`);
  }

  async _getUserSocialMetrics(pubkey) {
    if (!pubkey || !this.pool) return null;

    // Check cache first
    const cached = this.userSocialMetrics.get(pubkey);
    const now = Date.now();
    if (cached && (now - cached.lastUpdated) < this.socialMetricsCacheTTL) {
      return cached;
    }

    try {
      // Fetch user's contact list (kind 3) to get following count
      const contactEvents = await this._list(this.relays, [{ kinds: [3], authors: [pubkey], limit: 1 }]);
      const following = contactEvents.length > 0 && contactEvents[0].tags 
        ? contactEvents[0].tags.filter(tag => tag[0] === 'p').length 
        : 0;

      // Get real follower count by querying contact lists that include this pubkey
      let followers = 0;
      try {
        // Query for contact events that have this pubkey in their p-tags
        // This gives us users who follow the target user
        const followerEvents = await this._list(this.relays, [
          { 
            kinds: [3], 
            '#p': [pubkey], 
            limit: 100 // Limit to avoid excessive queries
          }
        ]);
        
        // Count unique authors who have this user in their contact list
        const uniqueFollowers = new Set();
        for (const event of followerEvents) {
          if (event.pubkey && event.pubkey !== pubkey) { // Exclude self-follows
            uniqueFollowers.add(event.pubkey);
          }
        }
        followers = uniqueFollowers.size;
        
        logger.debug(`[NOSTR] Real follower count for ${pubkey.slice(0, 8)}: ${followers} (following: ${following})`);
      } catch (followerErr) {
        logger.debug(`[NOSTR] Failed to get follower count for ${pubkey.slice(0, 8)}, using following as proxy:`, followerErr?.message || followerErr);
        followers = following; // Fallback to following count if follower query fails
      }

      const ratio = following > 0 ? followers / following : 0;

      const metrics = {
        followers,
        following,
        ratio,
        lastUpdated: now
      };

      this.userSocialMetrics.set(pubkey, metrics);
      return metrics;
    } catch (err) {
      logger.debug(`[NOSTR] Failed to get social metrics for ${pubkey.slice(0, 8)}:`, err?.message || err);
      return null;
    }
  }

  async _checkForUnfollowCandidates() {
    if (!this.unfollowEnabled) return;

    const now = Date.now();
    const checkIntervalMs = this.unfollowCheckIntervalHours * 60 * 60 * 1000;

    // Only check periodically
    if (now - this.lastUnfollowCheck < checkIntervalMs) return;

    this.lastUnfollowCheck = now;

    try {
      // Load current contacts
      const contacts = await this._loadCurrentContacts();
      if (!contacts.size) return;

      const candidates = [];
      for (const pubkey of contacts) {
        const postCount = this.userPostCounts.get(pubkey) || 0;
        const qualityScore = this.userQualityScores.get(pubkey) || 0;

        // Only consider users with enough posts and low quality scores
        if (postCount >= this.unfollowMinPostsThreshold && qualityScore < this.unfollowMinQualityScore) {
          candidates.push({ pubkey, postCount, qualityScore });
        }
      }

      if (candidates.length === 0) {
        logger.debug('[NOSTR] No unfollow candidates found');
        return;
      }

      // Sort by quality score (worst first) and limit to reasonable number
      candidates.sort((a, b) => a.qualityScore - b.qualityScore);
      const toUnfollow = candidates.slice(0, Math.min(5, candidates.length)); // Max 5 unfollows per check

      logger.info(`[NOSTR] Found ${candidates.length} unfollow candidates, processing ${toUnfollow.length}`);

      for (const candidate of toUnfollow) {
        try {
          const success = await this._unfollowUser(candidate.pubkey);
          if (success) {
            logger.info(`[NOSTR] Unfollowed ${candidate.pubkey.slice(0, 8)} (quality: ${candidate.qualityScore.toFixed(3)}, posts: ${candidate.postCount})`);
          }
        } catch (err) {
          logger.debug(`[NOSTR] Failed to unfollow ${candidate.pubkey.slice(0, 8)}:`, err?.message || err);
        }

        // Small delay between unfollows
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }

    } catch (err) {
      logger.warn('[NOSTR] Unfollow check failed:', err?.message || err);
    }
  }

  async _unfollowUser(pubkey) {
    if (!pubkey || !this.pool || !this.sk || !this.relays.length || !this.pkHex) return false;

    try {
      // Load current contacts
      const contacts = await this._loadCurrentContacts();
      if (!contacts.has(pubkey)) {
        logger.debug(`[NOSTR] User ${pubkey.slice(0, 8)} not in contacts`);
        return false;
      }

      // Remove from contacts
      const newContacts = new Set(contacts);
      newContacts.delete(pubkey);

      // Publish updated contacts list
      const success = await this._publishContacts(newContacts);

      if (success) {
        // Clean up tracking data
        this.userQualityScores.delete(pubkey);
        this.userPostCounts.delete(pubkey);
      }

      return success;
    } catch (err) {
      logger.debug(`[NOSTR] Unfollow failed for ${pubkey.slice(0, 8)}:`, err?.message || err);
      return false;
    }
  }

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.homeFeedTimer) { clearTimeout(this.homeFeedTimer); this.homeFeedTimer = null; }
    if (this.connectionMonitorTimer) { clearTimeout(this.connectionMonitorTimer); this.connectionMonitorTimer = null; }
    if (this.homeFeedUnsub) { try { this.homeFeedUnsub(); } catch {} this.homeFeedUnsub = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close([]); } catch {} this.pool = null; }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) { for (const [, t] of this.pendingReplyTimers) { try { clearTimeout(t); } catch {} } this.pendingReplyTimers.clear(); }
    logger.info('[NOSTR] Service stopped');
  }
}

module.exports = { NostrService, ensureDeps };
