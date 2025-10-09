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
const { buildPostPrompt, buildReplyPrompt, buildDmReplyPrompt, buildZapThanksPrompt, buildDailyDigestPostPrompt, buildPixelBoughtPrompt, buildAwarenessPostPrompt, extractTextFromModelResult, sanitizeWhitelist } = require('./text');
const { getUserHistory } = require('./providers/userHistoryProvider');
const { getConversationIdFromEvent, extractTopicsFromEvent, isSelfAuthor } = require('./nostr');
const { getZapAmountMsats, getZapTargetEventId, generateThanksText, getZapSenderPubkey } = require('./zaps');
const { buildTextNote, buildReplyNote, buildReaction, buildRepost, buildQuoteRepost, buildContacts, buildMuteList } = require('./eventFactory');
const { ContextAccumulator } = require('./contextAccumulator');
const { NarrativeContextProvider } = require('./narrativeContextProvider');
const { SelfReflectionEngine } = require('./selfReflection');

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
    this._decryptDirectMessage = typeof runtime?.decryptDirectMessage === 'function'
      ? runtime.decryptDirectMessage.bind(runtime)
      : null;
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

    const maxThreadContextRaw = runtime?.getSetting?.('NOSTR_MAX_THREAD_CONTEXT_EVENTS') ?? process?.env?.NOSTR_MAX_THREAD_CONTEXT_EVENTS ?? '80';
    let maxThreadContextEvents = Number(maxThreadContextRaw);
    if (!Number.isFinite(maxThreadContextEvents) || maxThreadContextEvents <= 0) {
      maxThreadContextEvents = 80;
    }
    this.maxThreadContextEvents = Math.max(10, Math.min(200, Math.floor(maxThreadContextEvents)));

    const threadFetchRoundsRaw = runtime?.getSetting?.('NOSTR_THREAD_CONTEXT_FETCH_ROUNDS') ?? process?.env?.NOSTR_THREAD_CONTEXT_FETCH_ROUNDS ?? '4';
    let threadContextFetchRounds = Number(threadFetchRoundsRaw);
    if (!Number.isFinite(threadContextFetchRounds) || threadContextFetchRounds <= 0) {
      threadContextFetchRounds = 4;
    }
    this.threadContextFetchRounds = Math.max(1, Math.min(8, Math.floor(threadContextFetchRounds)));

    const threadFetchBatchRaw = runtime?.getSetting?.('NOSTR_THREAD_CONTEXT_FETCH_BATCH') ?? process?.env?.NOSTR_THREAD_CONTEXT_FETCH_BATCH ?? '3';
    let threadContextFetchBatch = Number(threadFetchBatchRaw);
    if (!Number.isFinite(threadContextFetchBatch) || threadContextFetchBatch <= 0) {
      threadContextFetchBatch = 3;
    }
    this.threadContextFetchBatch = Math.max(1, Math.min(6, Math.floor(threadContextFetchBatch)));

     // Home feed configuration (reduced for less spam)
     this.homeFeedEnabled = true;
     this.homeFeedTimer = null;
     this.homeFeedMinSec = 1800; // Check home feed every 30 minutes (less frequent)
     this.homeFeedMaxSec = 3600; // Up to 1 hour
     this.homeFeedReactionChance = 0.05; // 5% chance to react (reduced)
     this.homeFeedRepostChance = 0.005; // 0.5% chance to repost (rare)
     this.homeFeedQuoteChance = 0.001; // 0.1% chance to quote repost (very rare)
     this.homeFeedMaxInteractions = 1; // Max 1 interaction per check (reduced)
     this.homeFeedProcessedEvents = new Set(); // Track processed events (for interactions)
     this.homeFeedQualityTracked = new Set(); // Track events for quality scoring (dedup across relays)
     this.homeFeedUnsub = null;

    // Timeline lore buffering (home feed intelligence digestion)
    this.timelineLoreBuffer = [];
    this.timelineLoreMaxBuffer = 120;
  this.timelineLoreBatchSize = 50;
    this.timelineLoreMinIntervalMs = 30 * 60 * 1000; // Minimum 30 minutes between lore digests
    this.timelineLoreMaxIntervalMs = 90 * 60 * 1000; // Force digest at least every 90 minutes when buffer has content
    this.timelineLoreTimer = null;
    this.timelineLoreLastRun = 0;
    this.timelineLoreProcessing = false;
    this.timelineLoreCandidateMinWords = 12;
    this.timelineLoreCandidateMinChars = 80;

  // Awareness dry-run scheduler (no posting)
  this.awarenessDryRunTimer = null;

    // Recent home feed samples ring buffer for debugging/awareness prompts
    this.homeFeedRecent = [];
    this.homeFeedRecentMax = 120;

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

    // Author timeline cache for contextual prompts
    this.authorRecentCache = new Map();
    this.authorRecentCacheTtlMs = 5 * 60 * 1000; // 5 minutes

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

    // Context Accumulator - builds continuous understanding of Nostr activity
    // NEW: Enable LLM-powered analysis by default
    const llmAnalysisEnabled = String(runtime.getSetting('NOSTR_CONTEXT_LLM_ANALYSIS') ?? 'true').toLowerCase() === 'true';
    this.contextAccumulator = new ContextAccumulator(runtime, this.logger, {
      llmAnalysis: llmAnalysisEnabled,
      createUniqueUuid: this.createUniqueUuid
    });
    
    const contextEnabled = String(runtime.getSetting('NOSTR_CONTEXT_ACCUMULATOR_ENABLED') ?? 'true').toLowerCase() === 'true';
    if (contextEnabled) {
      this.contextAccumulator.enable();
      this.logger.info(`[NOSTR] Context accumulator enabled (LLM analysis: ${llmAnalysisEnabled ? 'ON' : 'OFF'})`);
    } else {
      this.contextAccumulator.disable();
    }
    
    // Semantic Analyzer - LLM-powered semantic understanding beyond keywords
    const { SemanticAnalyzer } = require('./semanticAnalyzer');
    this.semanticAnalyzer = new SemanticAnalyzer(runtime, this.logger);
    this.logger.info(`[NOSTR] Semantic analyzer initialized (LLM: ${this.semanticAnalyzer.llmSemanticEnabled ? 'ON' : 'OFF'})`);
    
    // User Profile Manager - Persistent per-user learning and tracking
    const { UserProfileManager } = require('./userProfileManager');
    this.userProfileManager = new UserProfileManager(runtime, this.logger);
    this.logger.info(`[NOSTR] User profile manager initialized`);
    
    // Narrative Memory - Historical narrative storage and temporal analysis
    const { NarrativeMemory } = require('./narrativeMemory');
    this.narrativeMemory = new NarrativeMemory(runtime, this.logger);
    this.logger.info(`[NOSTR] Narrative memory initialized`);
    
    // Narrative Context Provider - Intelligent context selection for conversations
    this.narrativeContextProvider = new NarrativeContextProvider(
      this.narrativeMemory,
      this.contextAccumulator,
      this.logger
    );
    this.logger.info(`[NOSTR] Narrative context provider initialized`);
    
    // Connect managers to context accumulator for integrated intelligence
    if (this.contextAccumulator) {
      this.contextAccumulator.userProfileManager = this.userProfileManager;
      this.contextAccumulator.narrativeMemory = this.narrativeMemory;
      this.logger.info(`[NOSTR] Long-term memory systems connected to context accumulator`);
    }

    // Self Reflection Engine - periodic learning loops
    this.selfReflectionEngine = new SelfReflectionEngine(runtime, this.logger, {
      createUniqueUuid: this.createUniqueUuid,
      ChannelType,
      userProfileManager: this.userProfileManager
    });

    this.selfReflectionTimer = null;
    
    // Schedule hourly digest generation
    this.hourlyDigestTimer = null;
    
    // Schedule daily report generation
    this.dailyReportTimer = null;
      this.lastDailyDigestPostDate = null;
      this.dailyDigestPostingEnabled = true;

    // Centralized posting queue for natural rate limiting
    const { PostingQueue } = require('./postingQueue');
    this.postingQueue = new PostingQueue({
      minDelayBetweenPosts: Number(runtime.getSetting('NOSTR_MIN_DELAY_BETWEEN_POSTS_MS') ?? '15000'), // 15s default
      maxDelayBetweenPosts: Number(runtime.getSetting('NOSTR_MAX_DELAY_BETWEEN_POSTS_MS') ?? '120000'), // 2min default
      mentionPriorityBoost: Number(runtime.getSetting('NOSTR_MENTION_PRIORITY_BOOST_MS') ?? '5000'), // 5s faster for mentions
    });
    this.logger.info(`[NOSTR] Posting queue initialized: minDelay=${this.postingQueue.minDelayBetweenPosts}ms, maxDelay=${this.postingQueue.maxDelayBetweenPosts}ms`);

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

  async _loadLastDailyDigestPostDate() {
    try {
      const memories = await this.runtime.getMemories({ tableName: 'messages', count: 5 });
      const latest = memories
        .filter(m => m.content?.source === 'nostr' && m.content?.type === 'daily_digest_post' && m.content?.data?.date)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      if (latest?.content?.data?.date) {
        this.lastDailyDigestPostDate = latest.content.data.date;
        this.logger.info(`[NOSTR] Last daily digest post on record: ${this.lastDailyDigestPostDate}`);
      }
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to load last daily digest post date:', err?.message || err);
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
      const idSeed = `nostr-interaction-counts-${now}`;
      const id = this.createUniqueUuid(this.runtime, idSeed);
      const entityId = this.createUniqueUuid(this.runtime, 'nostr-system');
      const roomId = this.createUniqueUuid(this.runtime, 'nostr-counts');
      
      if (!id || !entityId || !roomId) {
        this.logger.debug('[NOSTR] Failed to generate UUIDs for interaction counts');
        return;
      }
      
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

     // NEW: Gather narrative context for enhanced relevance
     let contextInfo = '';
     if (this.contextAccumulator && this.contextAccumulator.enabled) {
       try {
         const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions());
         
         if (emergingStories.length > 0) {
           const topics = emergingStories.map(s => s.topic).join(', ');
           contextInfo = ` Currently trending topics: ${topics}.`;
           
           // Check if post relates to trending topics
           const contentLower = evt.content.toLowerCase();
           const matchingTopic = emergingStories.find(s => 
             contentLower.includes(s.topic.toLowerCase())
           );
           
           if (matchingTopic) {
             contextInfo += ` This post relates to trending topic "${matchingTopic.topic}" - HIGHER PRIORITY.`;
           }
         }
       } catch (err) {
         logger.debug('[NOSTR] Failed to gather context for post analysis:', err.message);
       }
     }

     const prompt = `Analyze this post: "${evt.content.slice(0, 500)}". Should a creative AI agent interact with this post? Be generous - respond to posts about technology, art, community, creativity, or that seem interesting/fun. Only say NO for obvious spam, scams, or complete gibberish.${contextInfo} Respond with 'YES' or 'NO' and a brief reason.`;

     const type = this._getSmallModelType();

     logger.debug(`[NOSTR] Analyzing home feed post ${evt.id.slice(0, 8)} for interaction: "${evt.content.slice(0, 100)}..."`);

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
       const isRelevant = result.startsWith('YES');
       logger.debug(`[NOSTR] Home feed analysis result for ${evt.id.slice(0, 8)}: ${isRelevant ? 'YES' : 'NO'} - "${response?.slice(0, 150)}"`);
       return isRelevant;
     } catch (err) {
       logger.debug('[NOSTR] Failed to analyze post for interaction:', err?.message || err);
       return false;
     }
   }

   async _isRelevantMention(evt) {
     if (!evt || !evt.content) return false;

     // Check if relevance check is enabled
     if (!this.relevanceCheckEnabled) return true; // Skip check if disabled

     // NEW: Gather narrative context if available for enhanced relevance checking
     let contextInfo = '';
     if (this.contextAccumulator && this.contextAccumulator.enabled) {
       try {
         const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions());
         const currentActivity = this.getCurrentActivity();
         
         if (emergingStories.length > 0) {
           const topics = emergingStories.map(s => s.topic).join(', ');
           contextInfo = `\n\nCURRENT COMMUNITY CONTEXT: Hot topics right now are: ${topics}. `;
           
           // Check if the mention relates to current hot topics
           const mentionLower = evt.content.toLowerCase();
           const matchingTopic = emergingStories.find(s => 
             mentionLower.includes(s.topic.toLowerCase())
           );
           
           if (matchingTopic) {
             contextInfo += `This mention relates to "${matchingTopic.topic}" which is trending (${matchingTopic.mentions} mentions, ${matchingTopic.users} users discussing it). HIGHER RELEVANCE for trending topics.`;
           }
         }
         
         if (currentActivity && currentActivity.events > 20) {
           const vibe = currentActivity.sentiment?.positive > currentActivity.sentiment?.negative ? 'positive' : 'neutral';
           contextInfo += ` Community is ${vibe} and active (${currentActivity.events} recent posts).`;
         }
       } catch (err) {
         logger.debug('[NOSTR] Failed to gather context for relevance check:', err.message);
       }
     }

     const prompt = `You are filtering mentions for ${this.runtime?.character?.name || 'Pixel'}, a creative AI agent. 

Analyze this mention: "${evt.content.slice(0, 500)}"
${contextInfo}

Should we respond? Be very generous - respond to almost all genuine human messages. Only say NO if it's clearly:
- Obvious spam, scams, or malicious content
- Extreme hostility or abuse
- Complete gibberish with no meaning
- Automated bot spam (repeated identical messages)

HIGHER PRIORITY for mentions that:
- Relate to current trending topics in the community
- Are thoughtful questions or discussions
- Show genuine engagement

RESPOND TO MOST MESSAGES: Casual greetings, brief comments, simple questions, and general interactions all deserve responses. When in doubt, say YES. Only filter out the truly problematic content.

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
      // Load historical narratives so daily/weekly/monthly context is available early
      try {
        if (svc.narrativeMemory && typeof svc.narrativeMemory.initialize === 'function') {
          await svc.narrativeMemory.initialize();
        }
      } catch (err) {
        logger?.debug?.('[NOSTR] Narrative memory initialize failed (continuing):', err?.message || err);
      }
     await svc._loadInteractionCounts();
  await svc._loadLastDailyDigestPostDate();
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
  const dailyDigestPostVal = runtime.getSetting('NOSTR_POST_DAILY_DIGEST_ENABLE');
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
  svc.dailyDigestPostingEnabled = String(dailyDigestPostVal ?? 'true').toLowerCase() === 'true';

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

    // Start context accumulator scheduled tasks
    if (svc.contextAccumulator && svc.contextAccumulator.enabled) {
      svc.scheduleHourlyDigest();
      svc.scheduleDailyReport();
    }

    if (svc.selfReflectionEngine && svc.selfReflectionEngine.enabled) {
      svc.scheduleSelfReflection();
    }

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
    
    // Start awareness dry-run loop: every ~3 minutes, log prompt and response (no posting)
    try { svc.startAwarenessDryRun(); } catch {}

    // Kick off an initial self-reflection run shortly after startup so prompts have guidance immediately
    try {
      if (svc.selfReflectionEngine && svc.selfReflectionEngine.enabled) {
        setTimeout(async () => {
          try {
            await svc.runSelfReflectionNow({});
            logger?.info?.('[NOSTR] Startup self-reflection completed');
          } catch (e) {
            logger?.debug?.('[NOSTR] Startup self-reflection failed (continuing):', e?.message || e);
          }
        }, 5000); // small delay to let systems settle
      }
    } catch {}

    // Warm-up context: ensure we have at least one recent hourly digest and a daily report for narrative fields
    try {
      if (svc.contextAccumulator && svc.contextAccumulator.enabled) {
        setTimeout(async () => {
          try {
            // Ensure a recent hourly digest exists
            let digest = null;
            try { digest = svc.contextAccumulator.getRecentDigest(1); } catch {}
            if (!digest) {
              try {
                await svc.contextAccumulator.generateHourlyDigest();
                logger?.info?.('[NOSTR] Startup warm-up: generated hourly digest');
              } catch (e) {
                logger?.debug?.('[NOSTR] Startup warm-up: hourly digest generation failed:', e?.message || e);
              }
            }

            // Ensure we have a daily report for today if none exists recently
            try {
              if (svc.narrativeMemory && typeof svc.narrativeMemory.getHistoricalContext === 'function') {
                const last7d = await svc.narrativeMemory.getHistoricalContext('7d');
                const hasRecentDaily = Array.isArray(last7d?.daily) && last7d.daily.length > 0;
                if (!hasRecentDaily && svc.contextAccumulator?.generateDailyReport) {
                  try {
                    await svc.contextAccumulator.generateDailyReport();
                    logger?.info?.('[NOSTR] Startup warm-up: generated daily report');
                  } catch (e) {
                    logger?.debug?.('[NOSTR] Startup warm-up: daily report generation failed:', e?.message || e);
                  }
                }
              }
            } catch {}
          } catch {}
        }, 8000);
      }
    } catch {}
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

  scheduleHourlyDigest() {
    if (!this.contextAccumulator || !this.contextAccumulator.hourlyDigestEnabled) return;
    
    // Schedule for top of next hour
    const now = Date.now();
    const nextHour = Math.ceil(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const delayMs = nextHour - now + (5 * 60 * 1000); // 5 minutes after the hour
    
    if (this.hourlyDigestTimer) clearTimeout(this.hourlyDigestTimer);
    
    this.hourlyDigestTimer = setTimeout(async () => {
      try {
        await this.contextAccumulator.generateHourlyDigest();
      } catch (err) {
        this.logger.debug('[NOSTR] Hourly digest generation failed:', err.message);
      }
      this.scheduleHourlyDigest(); // Schedule next one
    }, delayMs);
    
    const minutesUntil = Math.round(delayMs / (60 * 1000));
    this.logger.info(`[NOSTR] Next hourly digest in ~${minutesUntil} minutes`);
  }

  scheduleDailyReport() {
    if (!this.contextAccumulator || !this.contextAccumulator.dailyReportEnabled) return;
    
    // Schedule for midnight (or configured time)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 15, 0, 0); // 12:15 AM (after midnight)
    
    const delayMs = tomorrow.getTime() - now.getTime();
    
    if (this.dailyReportTimer) clearTimeout(this.dailyReportTimer);
    
    this.dailyReportTimer = setTimeout(async () => {
      try {
        const report = await this.contextAccumulator.generateDailyReport();
        if (report) {
          await this._handleGeneratedDailyReport(report);
        }
      } catch (err) {
        this.logger.debug('[NOSTR] Daily report generation failed:', err.message);
      }
      this.scheduleDailyReport(); // Schedule next one
    }, delayMs);
    
    const hoursUntil = Math.round(delayMs / (60 * 60 * 1000));
    this.logger.info(`[NOSTR] Next daily report in ~${hoursUntil} hours`);
  }

  scheduleSelfReflection() {
    if (!this.selfReflectionEngine || !this.selfReflectionEngine.enabled) return;

    const now = new Date();
    const targetHour = Number(this.runtime?.getSetting('NOSTR_SELF_REFLECTION_UTC_HOUR') ?? '4');
    const jitterWindowMinutes = Math.max(0, Number(this.runtime?.getSetting('NOSTR_SELF_REFLECTION_JITTER_MINUTES') ?? '30'));

    const nextRun = new Date(now);
    nextRun.setUTCSeconds(0, 0);
    nextRun.setUTCHours(targetHour, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const jitterRangeMs = jitterWindowMinutes * 60 * 1000;
    if (jitterRangeMs > 0) {
      const jitter = Math.floor((Math.random() - 0.5) * 2 * jitterRangeMs);
      nextRun.setTime(nextRun.getTime() + jitter);
      if (nextRun <= now) {
        nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      }
    }

    const delayMs = Math.max(nextRun.getTime() - now.getTime(), 5 * 60 * 1000);

    if (this.selfReflectionTimer) clearTimeout(this.selfReflectionTimer);

    this.selfReflectionTimer = setTimeout(async () => {
      try {
        await this.runSelfReflectionNow();
      } catch (err) {
        this.logger.warn('[NOSTR] Self-reflection run failed:', err?.message || err);
      } finally {
        this.scheduleSelfReflection();
      }
    }, delayMs);

    const minutesUntil = Math.round(delayMs / (60 * 1000));
    this.logger.info(`[NOSTR] Next self-reflection in ~${minutesUntil} minutes`);
  }

  async runSelfReflectionNow(options = {}) {
    if (!this.selfReflectionEngine || !this.selfReflectionEngine.enabled) return null;
    try {
      return await this.selfReflectionEngine.analyzeInteractionQuality(options);
    } catch (err) {
      this.logger.warn('[NOSTR] Self-reflection analysis failed:', err?.message || err);
      return null;
    }
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

      // Use intelligent semantic matching if available
      const semanticMatchFn = this.semanticAnalyzer && this.semanticAnalyzer.llmSemanticEnabled
        ? async (c, t) => await this.semanticAnalyzer.isSemanticMatch(c, t)
        : (c, t) => this._isSemanticMatch(c, t);

      const relevant = await listEventsByTopic(this.pool, this.relays, topic, {
        listFn: async (pool, relays, filters) => this._list.call(this, relays, filters),
        isSemanticMatch: semanticMatchFn,
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

  _scoreEventForEngagement(evt) { 
    let baseScore = _scoreEventForEngagement(evt);
    
    // Boost score if event relates to trending topics
    if (this.contextAccumulator && this.contextAccumulator.enabled && evt && evt.content) {
      try {
        const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions({
          minUsers: Math.max(5, this.contextAccumulator?.emergingStoryContextMinUsers || 0)
        }));
        if (emergingStories.length > 0) {
          const contentLower = evt.content.toLowerCase();
          const matchingStory = emergingStories.find((s, index) => {
            const match = contentLower.includes(s.topic.toLowerCase());
            if (match) {
              // Boost score based on how hot the topic is (higher for top trending)
              const boost = 0.3 - (index * 0.05); // 0.3 for #1, 0.25 for #2, etc.
              return true;
            }
            return false;
          });
          
          if (matchingStory) {
            const boostAmount = 0.3 - (emergingStories.indexOf(matchingStory) * 0.05);
            baseScore += boostAmount;
            logger.debug(`[NOSTR] Boosted engagement score for ${evt.id.slice(0, 8)} by +${boostAmount.toFixed(2)} (relates to trending topic "${matchingStory.topic}")`);
          }
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to apply context boost to score:', err.message);
      }
    }
    
    // Phase 4: Boost score if event matches active watchlist
    if (this.narrativeMemory?.checkWatchlistMatch && evt?.content) {
      try {
        // Extract topics from event tags for matching
        const eventTags = Array.isArray(evt.tags) 
          ? evt.tags.filter(t => t?.[0] === 't').map(t => t[1]).filter(Boolean)
          : [];
        
        const watchlistMatch = this.narrativeMemory.checkWatchlistMatch(evt.content, eventTags);
        if (watchlistMatch) {
          // Convert watchlist boost (0.2-0.5) to engagement score scale (0-1)
          // Use 60% of the boost to keep it proportional
          const discoveryBoost = watchlistMatch.boostScore * 0.6;
          baseScore += discoveryBoost;
          
          this.logger?.debug?.(
            `[WATCHLIST-DISCOVERY] ${evt.id.slice(0, 8)} matched: ${watchlistMatch.matches.map(m => m.item).join(', ')} (+${discoveryBoost.toFixed(2)})`
          );
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to apply watchlist boost to discovery score:', err?.message || err);
      }
    }
    
    return Math.max(0, Math.min(1, baseScore)); // Clamp to [0, 1]
  }

  /**
   * Semantic matching with LLM intelligence
   * Async version - use when possible for intelligent matching
   */
  async isSemanticMatchAsync(content, topic) {
    if (this.semanticAnalyzer) {
      return await this.semanticAnalyzer.isSemanticMatch(content, topic);
    }
    // Fallback to static
    return isSemanticMatch(content, topic);
  }

  /**
   * Legacy synchronous semantic matching
   * Uses static keywords only - prefer async version
   */
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

  async _extractTopicsFromEvent(event) { return await extractTopicsFromEvent(event, this.runtime); }

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

  async _fetchRecentAuthorNotes(pubkey, limit = 20) {
    if (!pubkey || !this.pool || !Array.isArray(this.relays) || this.relays.length === 0) {
      return [];
    }

    const maxLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const cacheKey = `${pubkey}:${maxLimit}`;
    const cacheTtl = Number.isFinite(this.authorRecentCacheTtlMs) && this.authorRecentCacheTtlMs > 0
      ? this.authorRecentCacheTtlMs
      : 5 * 60 * 1000;
    const now = Date.now();

    try {
      if (this.authorRecentCache && this.authorRecentCache.has(cacheKey)) {
        const cached = this.authorRecentCache.get(cacheKey);
        if (cached && (now - cached.fetchedAt) < cacheTtl) {
          return cached.events;
        }
      }
    } catch {}

    try {
      const filters = [{ kinds: [1], authors: [pubkey], limit: maxLimit }];
      const events = await this._list(this.relays, filters) || [];
      events.sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));
      const trimmed = events
        .slice(0, maxLimit)
        .map((evt) => ({
          id: evt?.id,
          created_at: evt?.created_at,
          content: typeof evt?.content === 'string' ? evt.content : '',
          pubkey: evt?.pubkey || pubkey,
        }));

      try {
        if (this.authorRecentCache) {
          this.authorRecentCache.set(cacheKey, { events: trimmed, fetchedAt: now });
        }
      } catch {}

      return trimmed;
    } catch (err) {
      try { this.logger?.debug?.('[NOSTR] Failed to fetch author timeline:', err?.message || err); } catch {}
      return [];
    }
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

      // Phase 4: Prioritize watchlist topics for discovery search
      let topics = [];
      let topicSource = 'primary';
      
      if (round === 0 && this.narrativeMemory?.getWatchlistState) {
        const watchlistState = this.narrativeMemory.getWatchlistState();
        if (watchlistState?.items?.length > 0) {
          // Use watchlist items as discovery topics (take up to 3 most recent)
          topics = watchlistState.items
            .sort((a, b) => a.age - b.age) // Newest first
            .slice(0, 3)
            .map(item => item.item);
          
          if (topics.length > 0) {
            topicSource = 'watchlist';
            logger.info(`[NOSTR] Round ${round + 1}: using watchlist topics for proactive discovery (${topics.length} items)`);
          }
        }
      }
      
      // Fallback to default topic selection if no watchlist or subsequent rounds
      if (topics.length === 0) {
        topics = round === 0 ? this._pickDiscoveryTopics() : this._expandTopicSearch();
        topicSource = round === 0 ? 'primary' : 'fallback';
      }
      
      if (!topics.length) {
        logger.debug(`[NOSTR] Round ${round + 1}: no topics available, skipping`);
        continue;
      }

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

      const eventTopics = await this._extractTopicsFromEvent(evt);
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

        // Process images in discovery post content (if enabled)
        let imageContext = { imageDescriptions: [], imageUrls: [] };
        if (this.imageProcessingEnabled) {
          try {
            logger.info(`[NOSTR] Processing images in discovery post: "${evt.content?.slice(0, 200)}..."`);
            const { processImageContent } = require('./image-vision');
            const fullImageContext = await processImageContent(evt.content || '', runtime);
            imageContext = {
              imageDescriptions: fullImageContext.imageDescriptions.slice(0, this.maxImagesPerMessage),
              imageUrls: fullImageContext.imageUrls.slice(0, this.maxImagesPerMessage)
            };
            logger.info(`[NOSTR] Processed ${imageContext.imageDescriptions.length} images from discovery post`);
          } catch (error) {
            logger.error(`[NOSTR] Error in discovery image processing: ${error.message || error}`);
            imageContext = { imageDescriptions: [], imageUrls: [] };
          }
        }

        const text = await this.generateReplyTextLLM(evt, roomId, threadContext, imageContext);
        
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
  _buildPostPrompt(contextData = null, reflection = null) { return buildPostPrompt(this.runtime.character, contextData, reflection); }
  _buildAwarenessPrompt(contextData = null, reflection = null, topic = null, loreContinuity = null) { return buildAwarenessPostPrompt(this.runtime.character, contextData, reflection, topic, loreContinuity); }
  _buildDailyDigestPostPrompt(report) { return buildDailyDigestPostPrompt(this.runtime.character, report); }
  _buildReplyPrompt(evt, recent, threadContext = null, imageContext = null, narrativeContext = null, userProfile = null, authorPostsSection = null, proactiveInsight = null, reflectionInsights = null, userHistorySection = null, globalTimelineSection = null, timelineLoreSection = null, loreContinuity = null) {
    if (evt?.kind === 4) {
      logger.debug('[NOSTR] Building DM reply prompt');
      return buildDmReplyPrompt(this.runtime.character, evt, recent);
    }
    logger.debug('[NOSTR] Building regular reply prompt (narrative:', !!narrativeContext, ', profile:', !!userProfile, ', insight:', !!proactiveInsight, ', reflection:', !!reflectionInsights, ', loreContinuity:', !!loreContinuity, ')');
    return buildReplyPrompt(this.runtime.character, evt, recent, threadContext, imageContext, narrativeContext, userProfile, authorPostsSection, proactiveInsight, reflectionInsights, userHistorySection, globalTimelineSection, timelineLoreSection, loreContinuity);
  }
  _extractTextFromModelResult(result) { try { return extractTextFromModelResult(result); } catch { return ''; } }
  _sanitizeWhitelist(text) { return sanitizeWhitelist(text); }

  async generatePostTextLLM(useContext = true) {
    // NEW: Gather accumulated context if available and enabled
    let contextData = null;
    if (useContext && this.contextAccumulator && this.contextAccumulator.enabled) {
      try {
        const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions());
        const currentActivity = this.getCurrentActivity();
        const topTopics = this.contextAccumulator.getTopTopicsAcrossHours({
          hours: Number(this.runtime?.getSetting?.('NOSTR_CONTEXT_TOPICS_LOOKBACK_HOURS') ?? process?.env?.NOSTR_CONTEXT_TOPICS_LOOKBACK_HOURS ?? 6),
          limit: Number(this.runtime?.getSetting?.('NOSTR_CONTEXT_TOPICS_LIMIT') ?? process?.env?.NOSTR_CONTEXT_TOPICS_LIMIT ?? 5),
          minMentions: Number(this.runtime?.getSetting?.('NOSTR_CONTEXT_TOPICS_MIN_MENTIONS') ?? process?.env?.NOSTR_CONTEXT_TOPICS_MIN_MENTIONS ?? 2)
        });
        let timelineLore = null;
        let toneTrend = null;
        try {
          const loreLimitSetting = Number(this.runtime?.getSetting?.('CTX_TIMELINE_LORE_PROMPT_LIMIT') ?? process?.env?.CTX_TIMELINE_LORE_PROMPT_LIMIT ?? 2);
          const limit = Number.isFinite(loreLimitSetting) && loreLimitSetting > 0 ? loreLimitSetting : 2;
          const loreEntries = this.contextAccumulator.getTimelineLore(limit);
          if (Array.isArray(loreEntries) && loreEntries.length) {
            timelineLore = loreEntries.slice(-limit);
          }
          
          // Check for tone trends if narrative memory available
          if (this.narrativeMemory && typeof this.narrativeMemory.trackToneTrend === 'function') {
            toneTrend = await this.narrativeMemory.trackToneTrend();
            if (toneTrend?.detected) {
              logger.debug(`[NOSTR] Tone trend detected for post: ${toneTrend.shift}`);
            }
          }
        } catch (err) {
          logger.debug('[NOSTR] Failed to gather timeline lore for post:', err?.message || err);
        }
        const activityEvents = currentActivity?.events || 0;
        const hasStories = emergingStories.length > 0;
        const hasMeaningfulActivity = activityEvents >= 5;
        const hasTopicHighlights = topTopics.length > 0;
        const hasLoreHighlights = Array.isArray(timelineLore) && timelineLore.length > 0;
        
        // Only include context if there's something interesting
        if (hasStories || hasMeaningfulActivity || hasTopicHighlights || hasLoreHighlights) {
          contextData = {
            emergingStories,
            currentActivity,
            recentDigest: this.contextAccumulator.getRecentDigest(1),
            topTopics,
            timelineLore,
            toneTrend
          };

          // Add narrative arcs (daily/weekly/monthly) and watchlist state to enrich scheduled posts
          try {
            if (this.narrativeMemory?.getHistoricalContext) {
              const last7d = await this.narrativeMemory.getHistoricalContext('7d');
              const last30d = await this.narrativeMemory.getHistoricalContext('30d');
              const latestDaily = Array.isArray(last7d?.daily) && last7d.daily.length ? last7d.daily[last7d.daily.length - 1] : null;
              const latestWeekly = Array.isArray(last7d?.weekly) && last7d.weekly.length ? last7d.weekly[last7d.weekly.length - 1] : null;
              const latestMonthly = Array.isArray(last30d?.monthly) && last30d.monthly.length ? last30d.monthly[last30d.monthly.length - 1] : null;
              if (latestDaily || latestWeekly || latestMonthly) {
                contextData.dailyNarrative = latestDaily;
                contextData.weeklyNarrative = latestWeekly;
                contextData.monthlyNarrative = latestMonthly;
              }
            }
          } catch {}
          try {
            if (this.narrativeMemory?.getWatchlistState) {
              const ws = this.narrativeMemory.getWatchlistState();
              if (ws) contextData.watchlistState = ws;
            }
          } catch {}
          
          logger.debug(`[NOSTR] Generating context-aware post. Emerging stories: ${emergingStories.length}, Activity: ${activityEvents} events, Top topics: ${topTopics.length}, Tone trend: ${toneTrend ? toneTrend.shift || 'stable' : 'none'}`);
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to gather context for post:', err.message);
      }
    }

    let reflectionInsights = null;
    if (this.selfReflectionEngine && this.selfReflectionEngine.enabled) {
      try {
        reflectionInsights = await this.selfReflectionEngine.getLatestInsights({ maxAgeHours: 168 });
        if (reflectionInsights) {
          logger.debug('[NOSTR] Loaded self-reflection insights for post prompt');
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to load self-reflection insights for post prompt:', err?.message || err);
      }
    }
    
    const prompt = this._buildPostPrompt(contextData, reflectionInsights);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    // Debug meta about post prompt (no chain-of-thought)
    try {
      const dbg = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (dbg) {
        const meta = {
          hasContext: !!contextData,
          hasReflection: !!reflectionInsights,
          emergingStories: Array.isArray(contextData?.emergingStories) ? contextData.emergingStories.length : 0,
          activityEvents: contextData?.currentActivity?.events ?? 0,
          timelineLore: Array.isArray(contextData?.timelineLore) ? contextData.timelineLore.length : 0,
        };
        logger.debug(`[NOSTR][DEBUG] Post prompt meta (len=${prompt.length}, model=${type}): ${JSON.stringify(meta)}`);
      }
    } catch {}
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 256, temperature: 0.9 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => this.pickPostText()
    );
    // Debug generated post snippet
    try {
      const dbg = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (dbg && text) {
        const out = String(text);
        const sample = out.replace(/\s+/g, ' ').slice(0, 200);
        logger.debug(`[NOSTR][DEBUG] Post generated (${out.length} chars, model=${type}): "${sample}${out.length > sample.length ? '…' : ''}"`);
      }
    } catch {}
    return text || null;
  }

  async generateAwarenessPostTextLLM() {
    // Gather context similar to generatePostTextLLM but tuned for awareness
    let contextData = null;
    let loreContinuity = null;
    try {
      if (this.contextAccumulator && this.contextAccumulator.enabled) {
        const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions());
        const currentActivity = this.getCurrentActivity();
        const topTopics = this.contextAccumulator.getTopTopicsAcrossHours({
          hours: Number(this.runtime?.getSetting?.('NOSTR_CONTEXT_TOPICS_LOOKBACK_HOURS') ?? process?.env?.NOSTR_CONTEXT_TOPICS_LOOKBACK_HOURS ?? 6),
          limit: 5,
          minMentions: 2
        }) || [];
        // Long list for debugging (ensure >= 100 topics if available)
        let topTopicsLong = [];
        try {
          topTopicsLong = this.contextAccumulator.getTopTopicsAcrossHours({
            hours: Number(this.runtime?.getSetting?.('NOSTR_CONTEXT_TOPICS_LOOKBACK_HOURS_DEBUG') ?? 24),
            limit: 200,
            minMentions: 1
          }) || [];
        } catch {}
        let toneTrend = null;
        let timelineLore = null;
        let recentDigest = null;
        if (this.narrativeMemory?.trackToneTrend) {
          try { toneTrend = await this.narrativeMemory.trackToneTrend(); } catch {}
        }
        try {
          const loreLimitSetting = Number(this.runtime?.getSetting?.('CTX_TIMELINE_LORE_PROMPT_LIMIT') ?? process?.env?.CTX_TIMELINE_LORE_PROMPT_LIMIT ?? 20);
          const limit = Number.isFinite(loreLimitSetting) && loreLimitSetting > 0 ? loreLimitSetting : 20;
          timelineLore = this.contextAccumulator.getTimelineLore(limit);
        } catch {}
        try {
          // Prefer previous hour digest; may be null shortly after startup or early in the hour
          recentDigest = this.contextAccumulator.getRecentDigest(1);
          // If none available yet, we can optionally fall back to current hour stats via getCurrentActivity
          // but keep recentDigest as null to avoid shape mismatch with similarity checks.
        } catch {}
        contextData = { emergingStories, currentActivity, topTopics, topTopicsLong, toneTrend, timelineLore, recentDigest };
      }
      if (this.narrativeMemory?.analyzeLoreContinuity) {
        try { loreContinuity = await this.narrativeMemory.analyzeLoreContinuity(3); } catch {}
      }
      // Pull daily/weekly/monthly narratives to reflect temporal arcs
      if (this.narrativeMemory?.getHistoricalContext) {
        try {
          const last7d = await this.narrativeMemory.getHistoricalContext('7d');
          const last30d = await this.narrativeMemory.getHistoricalContext('30d');
          const latestDaily = Array.isArray(last7d?.daily) && last7d.daily.length ? last7d.daily[last7d.daily.length - 1] : null;
          const latestWeekly = Array.isArray(last7d?.weekly) && last7d.weekly.length ? last7d.weekly[last7d.weekly.length - 1] : null;
          const latestMonthly = Array.isArray(last30d?.monthly) && last30d.monthly.length ? last30d.monthly[last30d.monthly.length - 1] : null;
          if (latestDaily || latestWeekly || latestMonthly) {
            contextData = { ...(contextData || {}), dailyNarrative: latestDaily, weeklyNarrative: latestWeekly, monthlyNarrative: latestMonthly };
          }
        } catch {}
      }
    } catch {}

    let reflectionInsights = null;
    if (this.selfReflectionEngine && this.selfReflectionEngine.enabled) {
      try { reflectionInsights = await this.selfReflectionEngine.getLatestInsights({ maxAgeHours: 168 }); } catch {}
    }

    // Pick at most one topic name from context, if any
    let topic = null;
    try {
      const topTopics = contextData?.topTopics || [];
      if (topTopics.length) {
        const t = topTopics[0];
        topic = typeof t === 'string' ? t : (t?.topic || null);
      }
    } catch {}

    // Enrich with topic momentum and similar past moments for selected topic
    try {
      if (topic) {
        if (this.narrativeMemory?.getTopicEvolution) {
          try { contextData.topicEvolution = await this.narrativeMemory.getTopicEvolution(topic, 14) || null; } catch {}
        }
        if (this.contextAccumulator?.getRecentDigest && this.narrativeMemory?.getSimilarPastMoments) {
          try {
            const digest = this.contextAccumulator.getRecentDigest(1);
            if (digest) {
              contextData.similarMoments = await this.narrativeMemory.getSimilarPastMoments(digest, 1);
            }
          } catch {}
        }
      }
    } catch {}

  let prompt = this._buildAwarenessPrompt(contextData, reflectionInsights, topic, loreContinuity);

    // Append a large memory debugging dump: full timeline lore, full narratives, and 100+ topics
    try {
      const topicsList = Array.isArray(contextData?.topTopicsLong) ? contextData.topTopicsLong : [];
      const topicsSummary = topicsList.map(t => ({ topic: t?.topic || String(t), count: t?.count ?? null })).slice(0, Math.max(100, topicsList.length));
      // Collect a few recent agent posts from memory (best-effort)
      let recentAgentPosts = [];
      let recentHomeFeed = [];
      let permanentMemories = null;
      try {
        if (this.runtime?.getMemories) {
          const rows = await this.runtime.getMemories({ tableName: 'messages', count: 200, unique: false });
          if (Array.isArray(rows) && rows.length) {
            // Classify pixels vs replies when possible
            const mapped = rows
              .filter(m => m?.content?.source === 'nostr' && typeof m?.content?.text === 'string')
              .map(m => {
                const c = m.content || {};
                let type = 'post';
                if (c.type === 'lnpixels_post') type = 'pixel';
                else if (c.inReplyTo) type = 'reply';
                else if (c.type) type = c.type;
                return {
                  id: m.id,
                  createdAtIso: m.createdAt ? new Date(m.createdAt).toISOString() : null,
                  type,
                  text: String(c.text).slice(0, 200)
                };
              });
            recentAgentPosts = mapped.slice(-8);

            // Build compact summaries of permanent memories by type
            try {
              const pickLatest = (list, n) => Array.isArray(list) ? list.slice(-n) : [];
              const byType = new Map();
              for (const m of rows) {
                const t = m?.content?.type || null;
                if (!t) continue;
                if (!byType.has(t)) byType.set(t, []);
                byType.get(t).push(m);
              }

              const safeIso = (ts) => ts ? new Date(ts).toISOString() : null;
              const topTopicsCompact = (arr, k = 3) => Array.isArray(arr) ? arr.slice(0, k).map(t => t?.topic || String(t)).filter(Boolean) : [];

              const result = {};

              // Hourly digests
              if (byType.has('hourly_digest')) {
                const items = pickLatest(byType.get('hourly_digest'), 2).map(m => {
                  const d = m.content?.data || {};
                  const metrics = d.metrics || {};
                  return {
                    createdAtIso: safeIso(m.createdAt),
                    hourLabel: d.hourLabel || null,
                    events: metrics.events || null,
                    users: metrics.activeUsers || null,
                    topTopics: topTopicsCompact(metrics.topTopics)
                  };
                });
                if (items.length) result.hourlyDigest = items;
              }

              // Daily reports
              if (byType.has('daily_report')) {
                const items = pickLatest(byType.get('daily_report'), 2).map(m => {
                  const d = m.content?.data || {};
                  const summary = d.summary || {};
                  return {
                    createdAtIso: safeIso(m.createdAt),
                    date: d.date || null,
                    events: summary.totalEvents || null,
                    activeUsers: summary.activeUsers || null,
                    topTopics: topTopicsCompact(summary.topTopics, 5)
                  };
                });
                if (items.length) result.dailyReport = items;
              }

              // Narrative entries
              const narrativeTypes = ['narrative_hourly','narrative_daily','narrative_weekly','narrative_monthly','narrative_timeline'];
              const narratives = [];
              for (const nt of narrativeTypes) {
                if (!byType.has(nt)) continue;
                const items = pickLatest(byType.get(nt), 2).map(m => {
                  const d = m.content?.data || {};
                  // For timeline, include priority/tags/summary
                  if (nt === 'narrative_timeline') {
                    return {
                      type: 'timeline',
                      createdAtIso: safeIso(m.createdAt),
                      priority: d.priority || null,
                      tags: Array.isArray(d.tags) ? d.tags.slice(0, 5) : [],
                      summary: (d.summary || null)
                    };
                  }
                  return {
                    type: nt.replace('narrative_',''),
                    createdAtIso: safeIso(m.createdAt),
                    events: d.events || null,
                    users: d.users || null,
                    topTopics: topTopicsCompact(d.topTopics, 4),
                    hasNarrative: !!d.narrative,
                  };
                });
                narratives.push(...items);
              }
              if (narratives.length) result.narratives = narratives.slice(-6);

              // Self-reflection history (use engine for compact summaries)
              try {
                if (this.selfReflectionEngine?.getReflectionHistory) {
                  const hist = await this.selfReflectionEngine.getReflectionHistory({ limit: 3, maxAgeHours: 720 });
                  if (Array.isArray(hist) && hist.length) {
                    result.selfReflectionHistory = hist;
                  }
                }
              } catch {}

              // LNPixels posts/events
              if (byType.has('lnpixels_post')) {
                const items = pickLatest(byType.get('lnpixels_post'), 3).map(m => {
                  const d = m.content?.data || {};
                  const e = d.triggerEvent || {};
                  return {
                    createdAtIso: safeIso(m.createdAt),
                    x: e.x, y: e.y, color: e.color, sats: e.sats,
                    text: typeof d.generatedText === 'string' ? d.generatedText.slice(0, 160) : null
                  };
                });
                if (items.length) result.lnpixelsPosts = items;
              }
              if (byType.has('lnpixels_event')) {
                const items = pickLatest(byType.get('lnpixels_event'), 3).map(m => {
                  const d = m.content?.data || {};
                  const e = d.triggerEvent || {};
                  return {
                    createdAtIso: safeIso(m.createdAt),
                    x: e.x, y: e.y, sats: e.sats, throttled: !!d.throttled
                  };
                });
                if (items.length) result.lnpixelsEvents = items;
              }

              // Mentions
              if (byType.has('mention')) {
                const items = pickLatest(byType.get('mention'), 2).map(m => ({
                  createdAtIso: safeIso(m.createdAt),
                  text: String(m?.content?.text || '').slice(0, 160)
                }));
                if (items.length) result.mentions = items;
              }

              // Social interactions (compact sample)
              if (byType.has('social_interaction')) {
                const items = pickLatest(byType.get('social_interaction'), 2).map(m => {
                  const d = m.content?.data || {};
                  // Fallbacks for summary: prefer d.summary, then d.body, then content.text, then nested event.content
                  let summary = null;
                  if (typeof d?.summary === 'string') summary = d.summary.slice(0, 140);
                  else if (typeof d?.body === 'string') summary = d.body.slice(0, 140);
                  else if (typeof m?.content?.text === 'string') summary = m.content.text.slice(0, 140);
                  else if (typeof d?.event?.content === 'string') summary = d.event.content.slice(0, 140);
                  return {
                    createdAtIso: safeIso(m.createdAt),
                    kind: d?.kind || null,
                    summary
                  };
                });
                if (items.length) result.social = items;
              }

              // Watchlist state from narrative memory (compact)
              try {
                if (this.narrativeMemory?.getWatchlistState) {
                  const ws = this.narrativeMemory.getWatchlistState();
                  if (ws) {
                    result.watchlistState = {
                      items: Array.isArray(ws.items) ? ws.items.slice(-5) : [],
                      lastUpdatedIso: ws.lastUpdated ? new Date(ws.lastUpdated).toISOString() : null,
                      total: Array.isArray(ws.items) ? ws.items.length : null
                    };
                  }
                }
              } catch {}

              permanentMemories = result;
            } catch {}
          }
        }
      } catch {}

      // Include a few recent home feed samples captured live
      try {
        if (Array.isArray(this.homeFeedRecent) && this.homeFeedRecent.length) {
          recentHomeFeed = this.homeFeedRecent.slice(-12).map(s => ({
            id: s.id,
            pubkey: s.pubkey ? String(s.pubkey).slice(0, 8) : null,
            createdAtIso: s.createdAt ? new Date(s.createdAt * 1000).toISOString() : null,
            allowTopicExtraction: !!s.allowTopicExtraction,
            timelineLore: s.timelineLore || null,
            text: typeof s.content === 'string' ? s.content.slice(0, 160) : ''
          }));
        }
      } catch {}

      // Gather compact user profile memories
      let userProfiles = { focus: [], topEngaged: [] };
      try {
        const upm = this.userProfileManager;
        if (upm && upm.profiles) {
          const summarizeWithStats = async (p) => {
            try {
              // Filter noisy/low-confidence topics
              const topicEntries = Object.entries(p.topicInterests || {})
                .filter(([t, v]) => Number(v) >= 0.05 && typeof t === 'string' && t.length >= 2 && t.length <= 40 && !/^https?:/i.test(t))
                .sort((a, b) => (b[1] - a[1]))
                .slice(0, 3)
                .map(([topic, interest]) => ({ topic, interest: Number(interest.toFixed ? interest.toFixed(2) : interest) }));

              let stats = null;
              try { stats = await upm.getEngagementStats(p.pubkey); } catch {}

              return {
                pubkey: p.pubkey ? String(p.pubkey).slice(0, 8) : null,
                lastInteractionIso: p.lastInteraction ? new Date(p.lastInteraction).toISOString() : null,
                totalInteractions: p.totalInteractions || 0,
                dominantSentiment: p.dominantSentiment || 'neutral',
                relationships: p.relationships ? Object.keys(p.relationships).length : 0,
                qualityScore: typeof p.qualityScore === 'number' ? Number(p.qualityScore.toFixed ? p.qualityScore.toFixed(2) : p.qualityScore) : null,
                engagementScore: typeof p.engagementScore === 'number' ? Number(p.engagementScore.toFixed ? p.engagementScore.toFixed(2) : p.engagementScore) : null,
                topTopics: (stats?.topTopics?.length ? stats.topTopics.slice(0, 3).map(x => ({ topic: x.topic, interest: Number((x.interest ?? 0).toFixed ? x.interest.toFixed(2) : (x.interest ?? 0)) })) : topicEntries),
                replySuccessRate: typeof stats?.replySuccessRate === 'number' ? Number(stats.replySuccessRate.toFixed ? stats.replySuccessRate.toFixed(2) : stats.replySuccessRate) : null,
                averageEngagement: typeof stats?.averageEngagement === 'number' ? Number(stats.averageEngagement.toFixed ? stats.averageEngagement.toFixed(2) : stats.averageEngagement) : null
              };
            } catch { return null; }
          };

          // Focus: users from recent home feed (ensure we load persisted profile if not cached)
          const focusKeysArr = Array.from(new Set((this.homeFeedRecent || []).slice(-12).map(s => s.pubkey).filter(Boolean)));
          const focusProfiles = await Promise.all(focusKeysArr.map(async (pk) => {
            try {
              if (typeof upm.getProfile === 'function') return await upm.getProfile(pk);
            } catch {}
            try { return upm.profiles.get(pk); } catch { return null; }
          }));
          const focusSummaries = await Promise.all(focusProfiles.filter(Boolean).slice(0, 8).map(p => summarizeWithStats(p)));
          userProfiles.focus = focusSummaries.filter(Boolean);

          // Top engaged overall from cache with stats
          const allProfiles = Array.from(upm.profiles.values());
          const topProfiles = allProfiles.slice().sort((a, b) => (b.totalInteractions || 0) - (a.totalInteractions || 0)).slice(0, 8);
          const topSummaries = await Promise.all(topProfiles.map(p => summarizeWithStats(p)));
          userProfiles.topEngaged = topSummaries.filter(Boolean);
        }
      } catch {}

      const debugDump = {
        currentActivity: contextData?.currentActivity || null,
        emergingStories: contextData?.emergingStories || [],
        timelineLoreFull: Array.isArray(contextData?.timelineLore) ? contextData.timelineLore : [],
        narratives: {
          daily: contextData?.dailyNarrative || null,
          weekly: contextData?.weeklyNarrative || null,
          monthly: contextData?.monthlyNarrative || null,
        },
        // Include the recent digest object directly (if available)
        recentDigest: contextData?.recentDigest || null,
        // Include the latest self-reflection insights (compact summary)
        selfReflection: reflectionInsights || null,
        recentAgentPosts,
        recentHomeFeed,
        userProfiles,
        permanent: permanentMemories,
        topics: topicsSummary,
      };
      const debugHeader = `\n\n---\nDEBUG MEMORY DUMP (include fully; do not quote verbatim, use only for awareness):`;
      const debugBody = `\n${JSON.stringify(debugDump, null, 2)}`;
      prompt = `${prompt}${debugHeader}${debugBody}`;
    } catch {}
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 200, temperature: 0.75 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => null
    );
    // For pure awareness: strip ALL links/handles regardless of whitelist
    let out = String(text || '');
    if (out) {
      out = out.replace(/https?:\/\/\S+/gi, '');
      out = out.replace(/\B@[a-z0-9_\.\-]+/gi, '');
      out = out.replace(/\s+/g, ' ').trim();
    }

    return { prompt, text: out };
  }

  startAwarenessDryRun() {
    try { if (this.awarenessDryRunTimer) clearInterval(this.awarenessDryRunTimer); } catch {}
    const intervalMs = 3 * 60 * 1000; // 3 minutes
    this.awarenessDryRunTimer = setInterval(async () => {
      try {
        // Build prompt and debug dump only; skip LLM call/output generation
        let contextData = null;
        let loreContinuity = null;
        let reflectionInsights = null;
        try {
          if (this.contextAccumulator && this.contextAccumulator.enabled) {
            const emergingStories = this.getEmergingStories(this._getEmergingStoryContextOptions());
            const currentActivity = this.getCurrentActivity();
            const topTopics = this.contextAccumulator.getTopTopicsAcrossHours({ hours: 6, limit: 5, minMentions: 2 }) || [];
            let topTopicsLong = [];
            try { topTopicsLong = this.contextAccumulator.getTopTopicsAcrossHours({ hours: 24, limit: 200, minMentions: 1 }) || []; } catch {}
            let toneTrend = null;
            let timelineLore = null;
            let recentDigest = null;
            try { if (this.narrativeMemory?.trackToneTrend) toneTrend = await this.narrativeMemory.trackToneTrend(); } catch {}
            try { const loreLimit = 20; timelineLore = this.contextAccumulator.getTimelineLore(loreLimit); } catch {}
            try { recentDigest = this.contextAccumulator.getRecentDigest(1); } catch {}
            contextData = { emergingStories, currentActivity, topTopics, topTopicsLong, toneTrend, timelineLore, recentDigest };
          }
          if (this.narrativeMemory?.analyzeLoreContinuity) {
            try { loreContinuity = await this.narrativeMemory.analyzeLoreContinuity(3); } catch {}
          }
          if (this.narrativeMemory?.getHistoricalContext) {
            try {
              const last7d = await this.narrativeMemory.getHistoricalContext('7d');
              const last30d = await this.narrativeMemory.getHistoricalContext('30d');
              const latestDaily = Array.isArray(last7d?.daily) && last7d.daily.length ? last7d.daily[last7d.daily.length - 1] : null;
              const latestWeekly = Array.isArray(last7d?.weekly) && last7d.weekly.length ? last7d.weekly[last7d.weekly.length - 1] : null;
              const latestMonthly = Array.isArray(last30d?.monthly) && last30d.monthly.length ? last30d.monthly[last30d.monthly.length - 1] : null;
              if (latestDaily || latestWeekly || latestMonthly) {
                contextData = { ...(contextData || {}), dailyNarrative: latestDaily, weeklyNarrative: latestWeekly, monthlyNarrative: latestMonthly };
              }
            } catch {}
          }
        } catch {}
        if (this.selfReflectionEngine && this.selfReflectionEngine.enabled) {
          try { reflectionInsights = await this.selfReflectionEngine.getLatestInsights({ maxAgeHours: 168 }); } catch {}
        }

        const prompt = this._buildAwarenessPrompt(contextData, reflectionInsights, null, loreContinuity);

        // Recreate debug dump (same as generateAwarenessPostTextLLM) but do not call model
        let recentAgentPosts = [];
        let recentHomeFeed = [];
        let permanentMemories = null;
        try {
          if (this.runtime?.getMemories) {
            const rows = await this.runtime.getMemories({ tableName: 'messages', count: 200, unique: false });
            if (Array.isArray(rows) && rows.length) {
              const mapped = rows
                .filter(m => m?.content?.source === 'nostr' && typeof m?.content?.text === 'string')
                .map(m => {
                  const c = m.content || {};
                  let type = 'post';
                  if (c.type === 'lnpixels_post') type = 'pixel';
                  else if (c.inReplyTo) type = 'reply';
                  else if (c.type) type = c.type;
                  return { id: m.id, createdAtIso: m.createdAt ? new Date(m.createdAt).toISOString() : null, type, text: String(c.text).slice(0, 200) };
                });
              recentAgentPosts = mapped.slice(-8);
              // Compact permanent summaries are built by generateAwarenessPostTextLLM; reuse same helper logic here
              try {
                const pickLatest = (list, n) => Array.isArray(list) ? list.slice(-n) : [];
                const byType = new Map();
                for (const m of rows) { const t = m?.content?.type || null; if (!t) continue; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(m); }
                const safeIso = (ts) => ts ? new Date(ts).toISOString() : null;
                const topTopicsCompact = (arr, k = 3) => Array.isArray(arr) ? arr.slice(0, k).map(t => t?.topic || String(t)).filter(Boolean) : [];
                const result = {};
                if (byType.has('hourly_digest')) {
                  const items = pickLatest(byType.get('hourly_digest'), 2).map(m => { const d = m.content?.data || {}; const metrics = d.metrics || {}; return { createdAtIso: safeIso(m.createdAt), hourLabel: d.hourLabel || null, events: metrics.events || null, users: metrics.activeUsers || null, topTopics: topTopicsCompact(metrics.topTopics) }; });
                  if (items.length) result.hourlyDigest = items;
                }
                if (byType.has('daily_report')) {
                  const items = pickLatest(byType.get('daily_report'), 2).map(m => { const d = m.content?.data || {}; const summary = d.summary || {}; return { createdAtIso: safeIso(m.createdAt), date: d.date || null, events: summary.totalEvents || null, activeUsers: summary.activeUsers || null, topTopics: topTopicsCompact(summary.topTopics, 5) }; });
                  if (items.length) result.dailyReport = items;
                }
                const narrativeTypes = ['narrative_hourly','narrative_daily','narrative_weekly','narrative_monthly','narrative_timeline'];
                const narratives = [];
                for (const nt of narrativeTypes) {
                  if (!byType.has(nt)) continue;
                  const items = pickLatest(byType.get(nt), 2).map(m => { const d = m.content?.data || {}; if (nt === 'narrative_timeline') { return { type: 'timeline', createdAtIso: safeIso(m.createdAt), priority: d.priority || null, tags: Array.isArray(d.tags) ? d.tags.slice(0, 5) : [], summary: (d.summary || null) }; } return { type: nt.replace('narrative_',''), createdAtIso: safeIso(m.createdAt), events: d.events || null, users: d.users || null, topTopics: topTopicsCompact(d.topTopics, 4), hasNarrative: !!d.narrative, }; });
                  narratives.push(...items);
                }
                if (narratives.length) result.narratives = narratives.slice(-6);
                try { if (this.selfReflectionEngine?.getReflectionHistory) { const hist = await this.selfReflectionEngine.getReflectionHistory({ limit: 3, maxAgeHours: 720 }); if (Array.isArray(hist) && hist.length) { result.selfReflectionHistory = hist; } } } catch {}
                if (byType.has('lnpixels_post')) {
                  const items = pickLatest(byType.get('lnpixels_post'), 3).map(m => { const d = m.content?.data || {}; const e = d.triggerEvent || {}; return { createdAtIso: safeIso(m.createdAt), x: e.x, y: e.y, color: e.color, sats: e.sats, text: typeof d.generatedText === 'string' ? d.generatedText.slice(0, 160) : null }; });
                  if (items.length) result.lnpixelsPosts = items;
                }
                if (byType.has('lnpixels_event')) {
                  const items = pickLatest(byType.get('lnpixels_event'), 3).map(m => { const d = m.content?.data || {}; const e = d.triggerEvent || {}; return { createdAtIso: safeIso(m.createdAt), x: e.x, y: e.y, sats: e.sats, throttled: !!d.throttled }; });
                  if (items.length) result.lnpixelsEvents = items;
                }
                if (byType.has('mention')) {
                  const items = pickLatest(byType.get('mention'), 2).map(m => ({ createdAtIso: safeIso(m.createdAt), text: String(m?.content?.text || '').slice(0, 160) }));
                  if (items.length) result.mentions = items;
                }
                if (byType.has('social_interaction')) {
                  const items = pickLatest(byType.get('social_interaction'), 2).map(m => { const d = m.content?.data || {}; let summary = null; if (typeof d?.summary === 'string') summary = d.summary.slice(0, 140); else if (typeof d?.body === 'string') summary = d.body.slice(0, 140); else if (typeof m?.content?.text === 'string') summary = m.content.text.slice(0, 140); else if (typeof d?.event?.content === 'string') summary = d.event.content.slice(0, 140); return { createdAtIso: safeIso(m.createdAt), kind: d?.kind || null, summary }; });
                  if (items.length) result.social = items;
                }
                try { if (this.narrativeMemory?.getWatchlistState) { const ws = this.narrativeMemory.getWatchlistState(); if (ws) { result.watchlistState = { items: Array.isArray(ws.items) ? ws.items.slice(-5) : [], lastUpdatedIso: ws.lastUpdated ? new Date(ws.lastUpdated).toISOString() : null, total: Array.isArray(ws.items) ? ws.items.length : null }; } } } catch {}
                permanentMemories = result;
              } catch {}
            }
          }
        } catch {}

        // recent home feed samples
        try {
          if (Array.isArray(this.homeFeedRecent) && this.homeFeedRecent.length) {
            recentHomeFeed = this.homeFeedRecent.slice(-12).map(s => ({ id: s.id, pubkey: s.pubkey ? String(s.pubkey).slice(0, 8) : null, createdAtIso: s.createdAt ? new Date(s.createdAt * 1000).toISOString() : null, allowTopicExtraction: !!s.allowTopicExtraction, timelineLore: s.timelineLore || null, text: typeof s.content === 'string' ? s.content.slice(0, 160) : '' }));
          }
        } catch {}

        const topicsList = Array.isArray(contextData?.topTopicsLong) ? contextData.topTopicsLong : [];
        const topicsSummary = topicsList.map(t => ({ topic: t?.topic || String(t), count: t?.count ?? null })).slice(0, Math.max(100, topicsList.length));
        const debugDump = {
          currentActivity: contextData?.currentActivity || null,
          emergingStories: contextData?.emergingStories || [],
          timelineLoreFull: Array.isArray(contextData?.timelineLore) ? contextData.timelineLore : [],
          narratives: {
            daily: contextData?.dailyNarrative || null,
            weekly: contextData?.weeklyNarrative || null,
            monthly: contextData?.monthlyNarrative || null,
          },
          recentDigest: contextData?.recentDigest || null,
          selfReflection: reflectionInsights || null,
          recentAgentPosts,
          recentHomeFeed,
          userProfiles: { focus: [], topEngaged: [] }, // skip heavy profile fetch in dry run
          permanent: permanentMemories,
          topics: topicsSummary,
        };
        const debugHeader = `\n\n---\nDEBUG MEMORY DUMP (include fully; do not quote verbatim, use only for awareness):`;
        const debugBody = `\n${JSON.stringify(debugDump, null, 2)}`;
        const fullPrompt = `${prompt}${debugHeader}${debugBody}`;

        const samplePrompt = String(fullPrompt || '').replace(/\s+/g, ' ').slice(0, 320);
        this.logger.info(`[AWARENESS-DRYRUN] Prompt (len=${(fullPrompt||'').length}): "${samplePrompt}${fullPrompt && fullPrompt.length > samplePrompt.length ? '…' : ''}"`);
      } catch (err) {
        this.logger.warn('[AWARENESS-DRYRUN] Failed:', err?.message || err);
      }
    }, intervalMs);
    this.logger.info(`[AWARENESS-DRYRUN] Running every ${Math.round(intervalMs/1000)}s (no posting)`);
  }

  async generateDailyDigestPostText(report) {
    if (!report) return null;
    try {
      const prompt = this._buildDailyDigestPostPrompt(report);
      const type = this._getLargeModelType();
      const { generateWithModelOrFallback } = require('./generation');
      const text = await generateWithModelOrFallback(
        this.runtime,
        type,
        prompt,
        { maxTokens: 300, temperature: 0.75 },
        (res) => this._extractTextFromModelResult(res),
        (s) => this._sanitizeWhitelist(s),
        () => {
          const parts = [];
          if (report?.narrative?.summary) {
            parts.push(String(report.narrative.summary).slice(0, 260));
          } else if (report?.summary) {
            const totals = report.summary;
            const topics = Array.isArray(totals.topTopics) && totals.topTopics.length
              ? `Top threads: ${totals.topTopics.slice(0, 3).map((t) => t.topic).join(', ')}`
              : '';
            parts.push(`Daily pulse: ${totals.totalEvents || '?'} posts, ${totals.activeUsers || '?'} voices. ${topics}`.trim());
          }
          if (!parts.length) {
            parts.push('Daily pulse captured—community energy logged, story continues tomorrow.');
          }
          return this._sanitizeWhitelist(parts.join(' ').trim());
        }
      );
      return text?.trim?.() ? text.trim() : null;
    } catch (err) {
      this.logger.debug('[NOSTR] Daily digest post generation failed:', err?.message || err);
      return null;
    }
  }

  _buildZapThanksPrompt(amountMsats, senderInfo) { return buildZapThanksPrompt(this.runtime.character, amountMsats, senderInfo); }

  _buildPixelBoughtPrompt(activity) { return buildPixelBoughtPrompt(this.runtime.character, activity); }

  async generateZapThanksTextLLM(amountMsats, senderInfo) {
    const prompt = this._buildZapThanksPrompt(amountMsats, senderInfo);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    // Debug meta for zap thanks prompt
    try {
      const dbg = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (dbg) {
        const meta = {
          amountMsats: typeof amountMsats === 'number' ? amountMsats : null,
          sender: senderInfo?.pubkey ? String(senderInfo.pubkey).slice(0, 8) : undefined,
        };
        logger.debug(`[NOSTR][DEBUG] ZapThanks prompt meta (len=${prompt.length}, model=${type}): ${JSON.stringify(meta)}`);
      }
    } catch {}
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 128, temperature: 0.8 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => generateThanksText(amountMsats)
    );
    // Debug generated zap thanks snippet
    try {
      const dbg = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (dbg && text) {
        const out = String(text);
        const sample = out.replace(/\s+/g, ' ').slice(0, 200);
        logger.debug(`[NOSTR][DEBUG] ZapThanks generated (${out.length} chars, model=${type}): "${sample}${out.length > sample.length ? '…' : ''}"`);
      }
    } catch {}
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

  async _handleGeneratedDailyReport(report) {
    if (!this.dailyDigestPostingEnabled) {
      return;
    }
    if (!report || !report.date) {
      this.logger.debug('[NOSTR] Daily report missing date, skipping post');
      return;
    }

    const alreadyPosted = this.lastDailyDigestPostDate === report.date;
    if (alreadyPosted) {
      this.logger.debug(`[NOSTR] Daily digest for ${report.date} already posted, skipping`);
      return;
    }

    const text = await this.generateDailyDigestPostText(report);
    if (!text) {
      this.logger.debug('[NOSTR] Daily digest post text unavailable, skipping');
      return;
    }

    try {
      const ok = await this.postOnce(text);
      if (ok) {
        this.lastDailyDigestPostDate = report.date;
        this.logger.info(`[NOSTR] Posted daily digest for ${report.date}`);
        try {
          const timestamp = Date.now();
          const id = this.createUniqueUuid(this.runtime, `nostr-daily-digest-post-${report.date}-${timestamp}`);
          const entityId = this.createUniqueUuid(this.runtime, 'nostr-daily-digest');
          const roomId = this.createUniqueUuid(this.runtime, 'nostr-daily-digest-posts');
          await this._createMemorySafe({
            id,
            entityId,
            agentId: this.runtime.agentId,
            roomId,
            content: {
              type: 'daily_digest_post',
              source: 'nostr',
              data: { date: report.date, text, summary: report.summary || null, narrative: report.narrative || null }
            },
            createdAt: timestamp,
          }, 'messages');
        } catch (err) {
          this.logger.debug('[NOSTR] Failed to store daily digest post memory:', err?.message || err);
        }
      }
    } catch (err) {
      this.logger.warn('[NOSTR] Failed to publish daily digest post:', err?.message || err);
    }
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
    
    // NEW: Get user profile for personalization
    let userProfile = null;
    if (this.userProfileManager && evt && evt.pubkey) {
      try {
        const profile = await this.userProfileManager.getProfile(evt.pubkey);
        if (profile && profile.totalInteractions > 0) {
          // Extract relevant info for context
          const topInterests = Object.entries(profile.topicInterests || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([topic]) => topic);
          
          userProfile = {
            topInterests,
            dominantSentiment: profile.dominantSentiment || 'neutral',
            relationshipDepth: profile.totalInteractions > 10 ? 'regular' : 
                              profile.totalInteractions > 3 ? 'familiar' : 'new',
            engagementScore: profile.engagementScore || 0,
            totalInteractions: profile.totalInteractions
          };
          
          logger.debug(`[NOSTR] User profile loaded - ${profile.totalInteractions} interactions, interests: ${topInterests.join(', ')}`);
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to load user profile for reply:', err.message);
      }
    }
    
    // NEW: Gather narrative context if relevant to the reply topic
    let narrativeContext = null;
    let proactiveInsight = null;
    
    if (this.narrativeContextProvider && this.contextAccumulator && this.contextAccumulator.enabled && evt && evt.content) {
      try {
        // Get intelligent narrative context relevant to this message
        const relevantContext = await this.narrativeContextProvider.getRelevantContext(evt.content, {
          includeEmergingStories: true,
          includeHistoricalComparison: true,
          includeSimilarMoments: false, // Skip for brevity in replies
          includeTopicEvolution: true,
          maxContext: 300
        });
        
        if (relevantContext.hasContext) {
          narrativeContext = relevantContext;
          logger.debug(`[NOSTR] Narrative context loaded: ${relevantContext.summary}`);
        }
        
        // Check if we should proactively mention an insight
        if (userProfile) {
          proactiveInsight = await this.narrativeContextProvider.detectProactiveInsight(evt.content, userProfile);
          if (proactiveInsight) {
            logger.debug(`[NOSTR] Proactive insight detected: ${proactiveInsight.type}`);
          }
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to gather narrative context for reply:', err.message);
      }
    }
    
    let selfReflectionContext = null;
    if (this.selfReflectionEngine && this.selfReflectionEngine.enabled) {
      try {
        selfReflectionContext = await this.selfReflectionEngine.getLatestInsights({ maxAgeHours: 168, cacheMs: 60 * 1000 });
      } catch (err) {
        logger.debug('[NOSTR] Failed to load self-reflection insights for reply prompt:', err?.message || err);
      }
    }

    // Optionally build a compact user history section (feature-flagged)
    let userHistorySection = null;
    try {
      const historyEnabled = String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true';
      if (historyEnabled && this.userProfileManager && evt?.pubkey) {
        const hist = await getUserHistory(this.userProfileManager, evt.pubkey, { limit: Number(this.runtime?.getSetting?.('CTX_USER_HISTORY_LIMIT') ?? 8) });
        if (hist && hist.hasHistory) {
          const cap = Math.max(1, Math.min(8, Number(this.runtime?.getSetting?.('CTX_USER_HISTORY_LINES') ?? 5)));
          const lines = (hist.summaryLines || []).slice(0, cap);
          const totals = `totalInteractions: ${hist.totalInteractions}${Number.isFinite(hist.successfulInteractions) ? ` | successful: ${hist.successfulInteractions}` : ''}${hist.lastInteractionAt ? ` | last: ${new Date(hist.lastInteractionAt).toISOString()}` : ''}`;
          userHistorySection = `USER HISTORY:\n${totals}${lines.length ? `\nrecent:\n- ${lines.join('\n- ')}` : ''}`;
        }
      }
    } catch (e) { try { (this.logger || console).debug?.('[NOSTR] user history section error:', e?.message || e); } catch {} }

    // Optionally build a concise global timeline snapshot (feature-flagged)
    let globalTimelineSection = null;
    try {
      const globalEnabled = String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true';
      if (globalEnabled && this.contextAccumulator && this.contextAccumulator.enabled) {
        const stories = this.getEmergingStories(this._getEmergingStoryContextOptions({
          maxTopics: 5
        }));
        const activity = this.getCurrentActivity();
        const parts = [];
        if (stories && stories.length) {
          const top = stories[0];
          parts.push(`Trending: "${top.topic}" (${top.mentions} mentions, ${top.users} users)`);
          const also = stories.slice(1, 3).map(s => s.topic);
          if (also.length) parts.push(`Also: ${also.join(', ')}`);
        }
        if (activity && activity.events) {
          const hot = (activity.topics || []).slice(0,3).map(t => t.topic).join(', ');
          parts.push(`Activity: ${activity.events} posts by ${activity.users} users${hot ? ` • Hot: ${hot}` : ''}`);
        }
        if (parts.length) {
          globalTimelineSection = `GLOBAL TIMELINE:\n${parts.join('\n')}`;
        }
      }
    } catch (e) { try { (this.logger || console).debug?.('[NOSTR] global timeline section error:', e?.message || e); } catch {} }

    // Always attempt to surface recent timeline lore digests for richer awareness
    let timelineLoreSection = null;
    let loreContinuity = null;
    try {
      if (this.contextAccumulator && typeof this.contextAccumulator.getTimelineLore === 'function') {
        const loreLimitSetting = Number(this.runtime?.getSetting?.('CTX_TIMELINE_LORE_PROMPT_LIMIT') ?? process?.env?.CTX_TIMELINE_LORE_PROMPT_LIMIT ?? 2);
        const limit = Number.isFinite(loreLimitSetting) && loreLimitSetting > 0 ? loreLimitSetting : 2;
        const loreEntries = this.contextAccumulator.getTimelineLore(limit);
        if (Array.isArray(loreEntries) && loreEntries.length) {
          const formatted = loreEntries
            .slice(-limit)
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return null;
              const headline = typeof entry.headline === 'string' && entry.headline.trim() ? entry.headline.trim() : null;
              const narrative = typeof entry.narrative === 'string' && entry.narrative.trim() ? entry.narrative.trim() : null;
              const insights = Array.isArray(entry.insights) ? entry.insights.slice(0, 2) : [];
              const watch = Array.isArray(entry.watchlist) ? entry.watchlist.slice(0, 2) : [];
              const pieces = [];
              if (headline) pieces.push(headline);
              if (!headline && narrative) pieces.push(narrative.slice(0, 160));
              if (insights.length) pieces.push(`insights: ${insights.join(', ')}`);
              if (watch.length) pieces.push(`watch: ${watch.join(', ')}`);
              if (entry.tone) pieces.push(`tone: ${entry.tone}`);
              return pieces.length ? `• ${pieces.join(' • ')}` : null;
            })
            .filter(Boolean);

          if (formatted.length) {
            timelineLoreSection = formatted.join('\n');
          }
          
          // NEW: Analyze lore continuity for evolving storylines
          if (this.narrativeMemory && typeof this.narrativeMemory.analyzeLoreContinuity === 'function') {
            try {
              const continuityLookback = Number(this.runtime?.getSetting?.('CTX_LORE_CONTINUITY_LOOKBACK') ?? process?.env?.CTX_LORE_CONTINUITY_LOOKBACK ?? 3);
              loreContinuity = await this.narrativeMemory.analyzeLoreContinuity(continuityLookback);
              if (loreContinuity?.hasEvolution) {
                logger.debug(`[NOSTR] Lore continuity detected: ${loreContinuity.summary}`);
              }
            } catch (err) {
              logger.debug('[NOSTR] Failed to analyze lore continuity:', err?.message || err);
            }
          }
        }
      }
    } catch (e) { try { (this.logger || console).debug?.('[NOSTR] timeline lore section error:', e?.message || e); } catch {} }

    // Fetch recent author posts for richer context
    let authorPostsSection = null;
    if (evt?.pubkey) {
      try {
        const limit = 20;
        const posts = await this._fetchRecentAuthorNotes(evt.pubkey, limit);
        if (posts && posts.length) {
          const lines = posts
            .filter((p) => p && typeof p.content === 'string' && p.content.trim() && p.id !== evt.id)
            .slice(0, limit)
            .map((p) => {
              const ts = Number.isFinite(p.created_at) ? new Date(p.created_at * 1000).toISOString() : null;
              const compact = this._sanitizeWhitelist(String(p.content)).replace(/\s+/g, ' ').trim();
              if (!compact) return null;
              const snippet = compact.slice(0, 240);
              const ellipsis = compact.length > snippet.length ? '…' : '';
              return `${ts ? `${ts}: ` : ''}${snippet}${ellipsis}`;
            })
            .filter(Boolean);

          if (lines.length) {
            const displayCount = Math.min(lines.length, limit);
            const labelCount = posts.length > displayCount ? `${displayCount}+` : `${displayCount}`;
            authorPostsSection = `AUTHOR RECENT POSTS (latest ${labelCount}):\n- ${lines.join('\n- ')}`;
          }
        }
      } catch (err) {
        try { logger.debug('[NOSTR] Failed to include author posts in reply prompt:', err?.message || err); } catch {}
      }
    }

    // Use thread context, image context, narrative context, user profile, and proactive insights for better responses
  const prompt = this._buildReplyPrompt(evt, recent, threadContext, imageContext, narrativeContext, userProfile, authorPostsSection, proactiveInsight, selfReflectionContext, userHistorySection, globalTimelineSection, timelineLoreSection, loreContinuity);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    
    // Log prompt details for debugging
    logger.debug(`[NOSTR] Reply LLM generation - Type: ${type}, Prompt length: ${prompt.length}, Kind: ${evt?.kind || 'unknown'}, Has narrative: ${!!narrativeContext}, Has profile: ${!!userProfile}, Has reflection: ${!!selfReflectionContext}`);

    // Optional: structured context debug (no chain-of-thought)
    try {
      // Use existing context feature flags to control debug visibility; no new env vars
      const debugCtx = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (debugCtx) {
        const meta = {
          evt: { id: evt?.id ? String(evt.id).slice(0, 8) : undefined, kind: evt?.kind, author: evt?.pubkey ? String(evt.pubkey).slice(0, 8) : undefined },
          included: {
            thread: !!threadContext,
            image: !!imageContext,
            userProfile: !!userProfile,
            narrative: !!narrativeContext,
            proactive: !!proactiveInsight,
            reflection: !!selfReflectionContext,
            userHistory: !!userHistorySection,
            globalTimeline: !!globalTimelineSection,
            timelineLore: !!timelineLoreSection,
            loreContinuity: !!loreContinuity,
          },
          profile: userProfile ? {
            topInterests: Array.isArray(userProfile.topInterests) ? userProfile.topInterests.slice(0, 3) : [],
            dominantSentiment: userProfile.dominantSentiment,
            relationshipDepth: userProfile.relationshipDepth,
          } : null,
          narrativeSummary: narrativeContext?.summary ? String(narrativeContext.summary).slice(0, 160) : null,
        };
        logger.debug(`[NOSTR][DEBUG] Reply context meta: ${JSON.stringify(meta)}`);
      }
    } catch {}
    
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
          const out = String(text).trim();
          // Optional: log a truncated, sanitized snippet of the model output (debug only)
          try {
            const dbgEnabled = (
              String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
              || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
            );
            if (dbgEnabled) {
              const maxChars = 200;
              const sample = out.replace(/\s+/g, ' ').slice(0, Math.max(0, maxChars));
              logger.debug(`[NOSTR][DEBUG] Reply generated (${out.length} chars, model=${type}): \"${sample}${out.length > sample.length ? '…' : ''}\"`);
            }
          } catch {}
          return out;
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
    if (!text) { 
      // NEW: Try context-aware post generation first
      text = await this.generatePostTextLLM(isScheduledPost); 
      if (!text) text = this.pickPostText(); 
    }
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
    
    // Optional debug: log final post content snippet before enqueue (no CoT)
    try {
      const dbg = (
        String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
        || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
      );
      if (dbg && text) {
        const out = String(text);
        const sample = out.replace(/\s+/g, ' ').slice(0, 200);
        logger.debug(`[NOSTR][DEBUG] Post content ready (${out.length} chars, type=${isScheduledPost ? 'scheduled' : 'external'}): "${sample}${out.length > sample.length ? '…' : ''}"`);
      }
    } catch {}

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
    if (!this.pool || !evt || !Array.isArray(this.relays) || this.relays.length === 0) {
      const solo = evt ? [evt] : [];
      return {
        thread: solo,
        isRoot: true,
        contextQuality: solo.length ? this._assessThreadContextQuality(solo) : 0
      };
    }

    const maxEvents = Number.isFinite(this.maxThreadContextEvents) ? this.maxThreadContextEvents : 80;
    const maxRounds = Number.isFinite(this.threadContextFetchRounds) ? this.threadContextFetchRounds : 4;
    const batchSize = Number.isFinite(this.threadContextFetchBatch) ? this.threadContextFetchBatch : 3;

    try {
      const tags = Array.isArray(evt.tags) ? evt.tags : [];
      const eTags = tags.filter(t => t[0] === 'e');

      if (eTags.length === 0) {
        const soloThread = [evt];
        return {
          thread: soloThread,
          isRoot: true,
          contextQuality: this._assessThreadContextQuality(soloThread)
        };
      }

      let rootId = null;
      let parentId = null;

      try {
        if (nip10Parse) {
          const refs = nip10Parse(evt);
          rootId = refs?.root?.id;
          parentId = refs?.reply?.id;
        }
      } catch {}

      if (!rootId && !parentId) {
        for (const tag of eTags) {
          if (tag[3] === 'root') {
            rootId = tag[1];
          } else if (tag[3] === 'reply') {
            parentId = tag[1];
          } else if (!rootId) {
            rootId = tag[1];
          }
        }
      }

      const threadEvents = [];
      const eventIds = new Set();
      const eventMap = new Map();

      const addEvent = (event) => {
        if (!event || !event.id || eventIds.has(event.id)) {
          return false;
        }
        threadEvents.push(event);
        eventIds.add(event.id);
        eventMap.set(event.id, event);
        return true;
      };

      addEvent(evt);

      const seedQueue = [];
      const visitedSeeds = new Set();
      const queuedSeeds = new Set();
      const enqueueSeed = (id) => {
        if (!id || visitedSeeds.has(id) || queuedSeeds.has(id)) return;
        seedQueue.push(id);
        queuedSeeds.add(id);
      };

      enqueueSeed(evt.id);
      if (rootId) enqueueSeed(rootId);
      if (parentId) enqueueSeed(parentId);

      const ingestFetchedEvents = (events) => {
        for (const event of events) {
          if (!addEvent(event)) continue;
          enqueueSeed(event.id);
          if (Array.isArray(event?.tags)) {
            for (const tag of event.tags) {
              if (tag?.[0] === 'e' && tag[1]) {
                enqueueSeed(tag[1]);
              }
            }
          }
          if (eventIds.size >= maxEvents) {
            break;
          }
        }
      };

      if (rootId) {
        try {
          const limit = Math.min(200, maxEvents);
          const rootResults = await this._list(this.relays, [
            { ids: [rootId] },
            { kinds: [1], '#e': [rootId], limit }
          ]);
          ingestFetchedEvents(rootResults);
          logger?.debug?.(`[NOSTR] Thread root fetch ${rootId.slice(0, 8)} -> ${eventIds.size} events so far`);
        } catch (err) {
          logger?.debug?.('[NOSTR] Failed to fetch thread root context:', err?.message || err);
        }
      }

      if (!rootId && parentId) {
        let currentId = parentId;
        let depth = 0;
        const maxDepth = 50;

        while (currentId && depth < maxDepth && eventIds.size < maxEvents) {
          if (eventIds.has(currentId)) break;

          try {
            const parentEvents = await this._list(this.relays, [{ ids: [currentId] }]);
            if (parentEvents.length === 0) break;

            const parentEvent = parentEvents[0];
            if (!addEvent(parentEvent)) break;
            enqueueSeed(parentEvent.id);

            const parentTags = Array.isArray(parentEvent.tags) ? parentEvent.tags : [];
            const parentETags = parentTags.filter(t => t[0] === 'e');

            if (parentETags.length === 0) break;

            currentId = null;
            try {
              if (nip10Parse) {
                const refs = nip10Parse(parentEvent);
                currentId = refs?.reply?.id || refs?.root?.id || null;
              }
            } catch {}

            if (!currentId && parentETags[0]) {
              currentId = parentETags[0][1];
            }

            depth++;
          } catch (err) {
            logger?.debug?.('[NOSTR] Error fetching parent in chain:', err?.message || err);
            break;
          }
        }

        logger?.debug?.(`[NOSTR] Built ancestor chain with ${eventIds.size} events (depth ${depth})`);
      }

      let rounds = 0;
      while (seedQueue.length && eventIds.size < maxEvents && rounds < maxRounds) {
        const batch = [];
        while (batch.length < batchSize && seedQueue.length) {
          const candidate = seedQueue.shift();
          if (candidate) {
            queuedSeeds.delete(candidate);
          }
          if (!candidate || visitedSeeds.has(candidate)) {
            continue;
          }
          visitedSeeds.add(candidate);
          batch.push(candidate);
        }

        if (batch.length === 0) {
          break;
        }

        rounds++;
        const filters = batch.map(id => ({ kinds: [1], '#e': [id], limit: Math.min(50, maxEvents) }));
        try {
          const fetched = await this._list(this.relays, filters);
          ingestFetchedEvents(fetched);
          logger?.debug?.(`[NOSTR] Thread fetch round ${rounds}: seeds=${batch.length} events=${eventIds.size}`);
        } catch (err) {
          logger?.debug?.(`[NOSTR] Failed fetching thread replies (round ${rounds}):`, err?.message || err);
        }

        if (eventIds.size >= maxEvents) {
          break;
        }
      }

      const uniqueEvents = Array.from(eventMap.values());
      uniqueEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

      if (uniqueEvents.length > maxEvents) {
        uniqueEvents.splice(0, uniqueEvents.length - maxEvents);
      }

      return {
        thread: uniqueEvents,
        isRoot: !parentId,
        rootId,
        parentId,
        contextQuality: this._assessThreadContextQuality(uniqueEvents)
      };

    } catch (err) {
      logger?.debug?.('[NOSTR] Error getting thread context:', err?.message || err);
      return {
        thread: [evt],
        isRoot: true,
        contextQuality: this._assessThreadContextQuality([evt])
      };
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
        'lightning', 'zap', 'sats', 'ai', 'agent', 'collaborative', 'community',
        'technology', 'innovation', 'crypto', 'blockchain', 'gaming', 'music',
        'photography', 'writing', 'coding', 'programming', 'science', 'space',
        'environment', 'politics', 'economy', 'finance', 'health', 'fitness',
        'travel', 'food', 'sports', 'entertainment', 'news', 'education'
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
                // Retrieve stored image context for scheduled reply
                const storedImageContext = this._getStoredImageContext(parentEvt.id);
                const replyText = await this.generateReplyTextLLM(parentEvt, capturedRoomId, null, storedImageContext);
               
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

       // Store image context for potential scheduled replies
       if (imageContext.imageDescriptions.length > 0) {
         this._storeImageContext(evt.id, imageContext);
       }

       // Fetch full thread context for better conversation understanding
      let threadContext = null;
      try {
        threadContext = await this._getThreadContext(evt);
        logger.info(`[NOSTR] Thread context for mention: ${threadContext.thread.length} events (isRoot: ${threadContext.isRoot})`);
      } catch (err) {
        logger.debug(`[NOSTR] Failed to fetch thread context for mention: ${err?.message || err}`);
      }

      logger.info(`[NOSTR] Image context being passed to reply generation: ${imageContext.imageDescriptions.length} descriptions`);
      const replyText = await this.generateReplyTextLLM(evt, roomId, threadContext, imageContext);
      
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
            
            // Track user interaction for profile learning
            if (this.userProfileManager) {
              try {
                const topics = await extractTopicsFromEvent(evt, this.runtime);
                await this.userProfileManager.recordInteraction(evt.pubkey, {
                  type: 'mention',
                  success: true,
                  topics,
                  engagement: 1.0, // User mentioned us, high engagement
                  timestamp: Date.now()
                });
                logger.debug(`[NOSTR] Recorded mention interaction for user ${evt.pubkey.slice(0, 8)}`);
              } catch (err) {
                logger.debug('[NOSTR] Failed to record user interaction:', err.message);
              }
            }
          }
          return replyOk;
        }
      });
      
      if (!queueSuccess) {
        logger.warn(`[NOSTR] Failed to queue mention reply for ${evt.id.slice(0, 8)}`);
      }
    } catch (err) { this.logger.warn('[NOSTR] handleMention failed:', err?.message || err); }
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
       // Record a concise interaction summary for user profile history
       try {
         if (this.userProfileManager && parentAuthorPk) {
            const topics = typeof parentEvtOrId === 'object' ? await extractTopicsFromEvent(parentEvtOrId, this.runtime) : [];
           const snippet = (typeof parentEvtOrId === 'object' && parentEvtOrId.content) ? String(parentEvtOrId.content).slice(0, 120) : undefined;
           await this.userProfileManager.recordInteraction(parentAuthorPk, {
             type: isMention ? 'mention_reply' : 'reply',
             success: true,
             topics,
             engagement: isMention ? 0.9 : 0.6,
             summary: snippet,
           });
         }
       } catch {}
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
       // Record reaction as a lightweight interaction for the author
       try {
         if (this.userProfileManager && parentEvt.pubkey) {
            const topics = await extractTopicsFromEvent(parentEvt, this.runtime);
           const snippet = parentEvt.content ? String(parentEvt.content).slice(0, 120) : undefined;
           await this.userProfileManager.recordInteraction(parentEvt.pubkey, {
             type: 'reaction',
             success: true,
             topics,
             engagement: 0.2,
             summary: snippet,
           });
         }
       } catch {}
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
      // Record a zap interaction for the sender (improves history)
      try {
        if (this.userProfileManager && sender) {
          const sats = typeof amountMsats === 'number' ? Math.floor(amountMsats / 1000) : null;
          const summary = sats ? `zap: ${sats} sats` : 'zap received';
          await this.userProfileManager.recordInteraction(sender, {
            type: 'zap',
            success: true,
            engagement: 0.7,
            summary,
          });
        }
      } catch {}
    } catch (err) { this.logger.debug('[NOSTR] handleZap failed:', err?.message || err); }
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

  // Decrypt the DM content (allow runtime override for testing or custom behavior)
  const decryptDirectMessageImpl = this._decryptDirectMessage || require('./nostr').decryptDirectMessage;
  const decryptedContent = await decryptDirectMessageImpl(evt, this.sk, this.pkHex, nip04?.decrypt || null);
      if (!decryptedContent) {
        logger.warn('[NOSTR] Failed to decrypt DM from', evt.pubkey.slice(0, 8));
        return;
      }

      logger.info(`[NOSTR] DM from ${evt.pubkey.slice(0, 8)}: ${decryptedContent.slice(0, 140)}`);
      // Debug DM prompt meta (no CoT)
      try {
        const dbg = (
          String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
          || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
        );
        if (dbg) {
          const meta = {
            decryptedLen: decryptedContent?.length || 0,
            hasTags: Array.isArray(evt.tags) && evt.tags.length > 0,
            kind: evt.kind,
          };
          logger.debug(`[NOSTR][DEBUG] DM prompt meta: ${JSON.stringify(meta)}`);
        }
      } catch {}

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
              // Debug generated scheduled DM snippet
              try {
                const dbg = (
                  String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
                  || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
                );
                if (dbg) {
                  const out = String(replyText);
                  const sample = out.replace(/\s+/g, ' ').slice(0, 200);
                  logger.debug(`[NOSTR][DEBUG] DM scheduled reply generated (${out.length} chars): "${sample}${out.length > sample.length ? '…' : ''}"`);
                }
              } catch {}
              
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
                // Record DM interaction for user profile history (scheduled)
                try {
                  if (this.userProfileManager && pubkey) {
                    const snippet = String(decryptedContent || parentEvt.content || '').slice(0, 120);
                    await this.userProfileManager.recordInteraction(pubkey, {
                      type: 'dm',
                      success: true,
                      engagement: 0.8,
                      summary: snippet,
                    });
                  }
                } catch {}
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

      // Process images in DM content (if enabled)
      let imageContext = { imageDescriptions: [], imageUrls: [] };
      if (this.imageProcessingEnabled) {
        try {
          logger.info(`[NOSTR] Processing images in DM content: "${decryptedContent.slice(0, 200)}..."`);
          const { processImageContent } = require('./image-vision');
          const fullImageContext = await processImageContent(decryptedContent, runtime);
          imageContext = {
            imageDescriptions: fullImageContext.imageDescriptions.slice(0, this.maxImagesPerMessage),
            imageUrls: fullImageContext.imageUrls.slice(0, this.maxImagesPerMessage)
          };
          logger.info(`[NOSTR] Processed ${imageContext.imageDescriptions.length} images from DM (max: ${this.maxImagesPerMessage})`);
        } catch (error) {
          logger.error(`[NOSTR] Error in DM image processing: ${error.message || error}`);
          imageContext = { imageDescriptions: [], imageUrls: [] };
        }
      }

      // Use decrypted content for the DM prompt
      const dmEvt = { ...evt, content: decryptedContent };
      const replyText = await this.generateReplyTextLLM(dmEvt, roomId, null, imageContext);
   
      // Check if LLM generation failed (returned null)
      if (!replyText || !replyText.trim()) {
        logger.warn(`[NOSTR] Skipping DM reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
        return;
      }
      // Debug generated DM reply snippet
      try {
        const dbg = (
          String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
          || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
        );
        if (dbg) {
          const out = String(replyText);
          const sample = out.replace(/\s+/g, ' ').slice(0, 200);
          logger.debug(`[NOSTR][DEBUG] DM reply generated (${out.length} chars): "${sample}${out.length > sample.length ? '…' : ''}"`);
        }
      } catch {}
      
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
        // Record DM interaction for user profile history (immediate)
        try {
          if (this.userProfileManager && evt.pubkey) {
            const snippet = String(decryptedContent || evt.content || '').slice(0, 120);
            await this.userProfileManager.recordInteraction(evt.pubkey, {
              type: 'dm',
              success: true,
              engagement: 0.8,
              summary: snippet,
            });
          }
        } catch {}
      }
    } catch (err) {
      this.logger.warn('[NOSTR] handleDM failed:', err?.message || err);
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
      // Debug sealed DM prompt meta
      try {
        const dbg = (
          String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
          || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
        );
        if (dbg) {
          const meta = {
            decryptedLen: decryptedContent?.length || 0,
            hasTags: Array.isArray(evt.tags) && evt.tags.length > 0,
            kind: evt.kind,
          };
          logger.debug(`[NOSTR][DEBUG] Sealed DM prompt meta: ${JSON.stringify(meta)}`);
        }
      } catch {}

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
              // Debug generated sealed DM scheduled reply snippet
              try {
                const dbg = (
                  String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
                  || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
                );
                if (dbg) {
                  const out = String(replyText);
                  const sample = out.replace(/\s+/g, ' ').slice(0, 200);
                  logger.debug(`[NOSTR][DEBUG] Sealed DM scheduled reply generated (${out.length} chars): "${sample}${out.length > sample.length ? '…' : ''}"`);
                }
              } catch {}
              
              const ok = await this.postDM(parentEvt, replyText);
              if (ok) {
                const linkId = createUniqueUuid(this.runtime, `${parentEvt.id}:dm_reply:${now2}:scheduled`);
                await this._createMemorySafe({ id: linkId, entityId, agentId: this.runtime.agentId, roomId: capturedRoomId, content: { text: replyText, source: 'nostr', inReplyTo: capturedEventMemoryId }, createdAt: now2, }, 'messages').catch(() => {});
                // Record sealed DM interaction (scheduled)
                try {
                  if (this.userProfileManager && pubkey) {
                    const snippet = String(decryptedContent || parentEvt.content || '').slice(0, 120);
                    await this.userProfileManager.recordInteraction(pubkey, {
                      type: 'dm',
                      success: true,
                      engagement: 0.8,
                      summary: snippet,
                    });
                  }
                } catch {}
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

      // Process images in sealed DM content (if enabled)
      let imageContext = { imageDescriptions: [], imageUrls: [] };
      if (this.imageProcessingEnabled) {
        try {
          logger.info(`[NOSTR] Processing images in sealed DM content: "${decryptedContent.slice(0, 200)}..."`);
          const { processImageContent } = require('./image-vision');
          const fullImageContext = await processImageContent(decryptedContent, runtime);
          imageContext = {
            imageDescriptions: fullImageContext.imageDescriptions.slice(0, this.maxImagesPerMessage),
            imageUrls: fullImageContext.imageUrls.slice(0, this.maxImagesPerMessage)
          };
          logger.info(`[NOSTR] Processed ${imageContext.imageDescriptions.length} images from sealed DM (max: ${this.maxImagesPerMessage})`);
        } catch (error) {
          logger.error(`[NOSTR] Error in sealed DM image processing: ${error.message || error}`);
          imageContext = { imageDescriptions: [], imageUrls: [] };
        }
      }

       const dmEvt = { ...evt, content: decryptedContent };
       const replyText = await this.generateReplyTextLLM(dmEvt, roomId, null, imageContext);
       
       // Check if LLM generation failed (returned null)
       if (!replyText || !replyText.trim()) {
         logger.warn(`[NOSTR] Skipping sealed DM reply to ${evt.id.slice(0, 8)} - LLM generation failed`);
         return;
       }
       
       const replyOk = await this.postDM(evt, replyText);
      if (replyOk) {
        const replyMemory = { id: createUniqueUuid(runtime, `${evt.id}:dm_reply:${now}`), entityId, agentId: runtime.agentId, roomId, content: { text: replyText, source: 'nostr', inReplyTo: eventMemoryId }, createdAt: now, };
        await this._createMemorySafe(replyMemory, 'messages');
        // Record sealed DM interaction (immediate)
        try {
          if (this.userProfileManager && evt.pubkey) {
            const snippet = String(decryptedContent || evt.content || '').slice(0, 120);
            await this.userProfileManager.recordInteraction(evt.pubkey, {
              type: 'dm',
              success: true,
              engagement: 0.8,
              summary: snippet,
            });
          }
        } catch {}
      }
      // Debug generated sealed DM reply snippet (immediate)
      try {
        const dbg = (
          String(this.runtime?.getSetting?.('CTX_GLOBAL_TIMELINE_ENABLE') ?? process?.env?.CTX_GLOBAL_TIMELINE_ENABLE ?? 'false').toLowerCase() === 'true'
          || String(this.runtime?.getSetting?.('CTX_USER_HISTORY_ENABLE') ?? process?.env?.CTX_USER_HISTORY_ENABLE ?? 'false').toLowerCase() === 'true'
        );
        if (dbg) {
          const out = String(replyText);
          const sample = out.replace(/\s+/g, ' ').slice(0, 200);
          logger.debug(`[NOSTR][DEBUG] Sealed DM reply generated (${out.length} chars): "${sample}${out.length > sample.length ? '…' : ''}"`);
        }
      } catch {}
    } catch (err) {
      logger.debug('[NOSTR] handleSealedDM failed:', err?.message || err);
    }
  }

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.homeFeedTimer) { clearTimeout(this.homeFeedTimer); this.homeFeedTimer = null; }
    if (this.timelineLoreTimer) { clearTimeout(this.timelineLoreTimer); this.timelineLoreTimer = null; }
    if (this.connectionMonitorTimer) { clearTimeout(this.connectionMonitorTimer); this.connectionMonitorTimer = null; }
    if (this.homeFeedUnsub) { try { this.homeFeedUnsub(); } catch {} this.homeFeedUnsub = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close([]); } catch {} this.pool = null; }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) { for (const [, t] of this.pendingReplyTimers) { try { clearTimeout(t); } catch {} } this.pendingReplyTimers.clear(); }
    logger.info('[NOSTR] Service stopped');
  }

  // Store image context keyed by event ID for scheduled replies
  _storeImageContext(eventId, imageContext) {
    if (!this.imageContextCache) {
      this.imageContextCache = new Map();
    }
    this.imageContextCache.set(eventId, {
      context: imageContext,
      timestamp: Date.now()
    });
    logger.debug(`[NOSTR] Stored image context for event ${eventId.slice(0, 8)}: ${imageContext.imageDescriptions.length} descriptions`);
  }

  // Retrieve stored image context
  _getStoredImageContext(eventId) {
    if (!this.imageContextCache) return null;
    const stored = this.imageContextCache.get(eventId);
    if (!stored) return null;

    // Expire old contexts (e.g., after 1 hour)
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - stored.timestamp > maxAge) {
      this.imageContextCache.delete(eventId);
      logger.debug(`[NOSTR] Expired old image context for event ${eventId.slice(0, 8)}`);
      return null;
    }

    logger.debug(`[NOSTR] Retrieved stored image context for event ${eventId.slice(0, 8)}: ${stored.context.imageDescriptions.length} descriptions`);
    return stored.context;
  }

  // Cleanup old image contexts periodically
  _cleanupImageContexts() {
    if (!this.imageContextCache) return;
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    let cleaned = 0;
    for (const [eventId, stored] of this.imageContextCache.entries()) {
      if (stored.timestamp < cutoff) {
        this.imageContextCache.delete(eventId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`[NOSTR] Cleaned up ${cleaned} expired image contexts`);
    }
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
    // Periodic cleanup of expired image contexts
    this._cleanupImageContexts();

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
    const poolFactory = typeof this.runtime?.createSimplePool === 'function'
      ? this.runtime.createSimplePool.bind(this.runtime)
      : null;

    try {
      const poolInstance = poolFactory
        ? poolFactory({ enablePing })
        : new SimplePool({ enablePing });
      this.pool = poolInstance;
    } catch (err) {
      logger.warn('[NOSTR] Failed to create SimplePool instance:', err?.message || err);
      this.pool = null;
    }

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
      // if (!contacts.size) {
      //   logger.debug('[NOSTR] No contacts to follow for home feed');
      //   return;
      // }

      const authors = contacts.size ? Array.from(contacts) : [];
      logger.info(`[NOSTR] Starting home feed with ${authors.length} followed users`);

      // Subscribe to posts from followed users
      this.homeFeedUnsub = this.pool.subscribeMany(
        this.relays,
        [{ kinds: [1], limit: 20, since: Math.floor(Date.now() / 1000) - 86400 }], // Last hour
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
      // Prevent memory leak: clear processed events if set gets too large
      // We only care about deduplicating recent interactions, not all history
      if (this.homeFeedProcessedEvents.size > 2000) {
        logger.debug('[NOSTR] Clearing homeFeedProcessedEvents cache (size limit reached)');
        this.homeFeedProcessedEvents.clear();
      }

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

        // FIRST: LLM analysis to determine if post is relevant/interesting
        logger.debug(`[NOSTR] Analyzing home feed post ${evt.id.slice(0, 8)} from ${evt.pubkey.slice(0, 8)}`);
        if (!(await this._analyzePostForInteraction(evt))) {
          logger.debug(`[NOSTR] Skipping home feed interaction for ${evt.id.slice(0, 8)} - not relevant per LLM analysis`);
          continue;
        }

        const interactionType = this._chooseInteractionType();
        if (!interactionType) {
          logger.debug(`[NOSTR] No interaction type chosen for ${evt.id.slice(0, 8)} (probabilistic skip)`);
          continue;
        }

         // Additional check for reposts (double-verification for quality)
         let isRelevant = true;
         if (interactionType === 'repost') {
           isRelevant = await this.generateRepostRelevancyLLM(evt);
           if (!isRelevant) {
             logger.debug(`[NOSTR] Skipping repost of ${evt.id.slice(0, 8)} - not worthy per repost analysis`);
             continue;
           }
         }

         logger.info(`[NOSTR] Queueing home feed ${interactionType} for ${evt.id.slice(0, 8)}`);

         try {
           let success = false;
           switch (interactionType) {
             case 'reaction':
               success = await this.postReaction(evt, '+');
               break;
             case 'repost':
               success = await this.postRepost(evt);
               break;
             case 'quote':
               success = await this.postQuoteRepost(evt);
               break;
           }

          if (success) {
            this.homeFeedProcessedEvents.add(evt.id);
            interactions++;
            logger.info(`[NOSTR] Home feed ${interactionType} completed for ${evt.pubkey.slice(0, 8)}`);
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
     logger.debug(`[NOSTR] Checking repost relevancy for ${evt.id.slice(0, 8)}: "${evt.content.slice(0, 100)}..."`);
     
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
     const isWorthy = response.startsWith('YES');
     logger.debug(`[NOSTR] Repost relevancy result for ${evt.id.slice(0, 8)}: ${isWorthy ? 'YES' : 'NO'} - "${text?.slice(0, 150)}"`);
     return isWorthy;
   }

  async generateQuoteTextLLM(evt) {
    if (!evt) return null;

    const name = this.runtime?.character?.name || 'Pixel';
    const styleGuidelines = Array.isArray(this.runtime?.character?.style?.all)
      ? this.runtime.character.style.all.join(' | ')
      : null;

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
        logger.debug(`[NOSTR] Error processing images for quote: ${error?.message || error}`);
      }
    }

    let imagePrompt = '';
    if (imageContext.imageDescriptions.length > 0) {
      imagePrompt = `

IMAGES SPOTTED:
${imageContext.imageDescriptions.join('\n\n')}

Respond like you actually saw these visuals. Reference colors, subjects, or mood naturally.`;
    }

    // Recent activity from the author for extra context
    let authorPostsSection = '';
    if (evt.pubkey) {
      try {
        const posts = await this._fetchRecentAuthorNotes(evt.pubkey, 12);
        if (posts && posts.length) {
          const lines = posts
            .filter((p) => p && typeof p.content === 'string' && p.content.trim())
            .slice(0, 6)
            .map((p) => {
              const ts = Number.isFinite(p.created_at) ? new Date(p.created_at * 1000).toISOString() : null;
              const compact = this._sanitizeWhitelist(String(p.content)).replace(/\s+/g, ' ').trim();
              if (!compact) return null;
              const snippet = compact.slice(0, 200);
              const ellipsis = compact.length > snippet.length ? '…' : '';
              return `${ts ? `${ts}: ` : ''}${snippet}${ellipsis}`;
            })
            .filter(Boolean);

          if (lines.length) {
            authorPostsSection = `

AUTHOR RECENT VOICE:
- ${lines.join('\n- ')}

Find a thread that connects this quote to their current vibe.`;
          }
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to gather author posts for quote:', err?.message || err);
      }
    }

    // Community pulse for broader framing
    let communityContextSection = '';
    if (this.contextAccumulator && this.contextAccumulator.enabled) {
      try {
        const stories = this.getEmergingStories(this._getEmergingStoryContextOptions({ maxTopics: 3 }));
        const activity = this.getCurrentActivity();
        const parts = [];
        if (stories && stories.length) {
          const top = stories[0];
          parts.push(`Trending: "${top.topic}" (${top.mentions} mentions by ${top.users} users)`);
          const also = stories.slice(1, 3).map((s) => s.topic);
          if (also.length) parts.push(`Also circulating: ${also.join(', ')}`);
        }
        if (activity && activity.events) {
          const hot = (activity.topics || []).slice(0, 3).map((t) => t.topic).join(', ');
          parts.push(`Community activity: ${activity.events} posts by ${activity.users} users${hot ? ` • Hot themes: ${hot}` : ''}`);
        }
        if (parts.length) {
          communityContextSection = `

COMMUNITY PULSE:
${parts.join('\n')}

Use this if it elevates the quote.`;
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to gather community context for quote:', err?.message || err);
      }
    }

    // Concise awareness snapshot (timeline lore, tone trend, digest, narratives, watchlist)
    let awarenessSection = '';
    try {
      let lines = [];
      // Timeline lore snapshot
      try {
        if (this.contextAccumulator?.getTimelineLore) {
          const loreEntries = this.contextAccumulator.getTimelineLore(2);
          const loreLines = (Array.isArray(loreEntries) ? loreEntries : []).slice(-2).map((entry) => {
            const headline = (entry?.headline || entry?.narrative || '').toString().trim();
            const tone = entry?.tone ? ` • tone: ${entry.tone}` : '';
            const watch = Array.isArray(entry?.watchlist) && entry.watchlist.length ? ` • watch: ${entry.watchlist.slice(0, 2).join(', ')}` : '';
            return headline ? `- ${headline.slice(0, 140)}${tone}${watch}` : null;
          }).filter(Boolean);
          if (loreLines.length) {
            lines.push('TIMELINE LORE:', ...loreLines);
          }
        }
      } catch {}
      // Tone trend
      try {
        if (this.narrativeMemory?.trackToneTrend) {
          const trend = await this.narrativeMemory.trackToneTrend();
          if (trend?.detected) lines.push(`MOOD SHIFT: ${trend.shift} over ${trend.timespan}`);
          else if (trend?.stable) lines.push(`MOOD STABLE: ${trend.tone}`);
        }
      } catch {}
      // Recent digest
      try {
        const digest = this.contextAccumulator?.getRecentDigest ? this.contextAccumulator.getRecentDigest(1) : null;
        if (digest?.metrics?.events) {
          const tts = Array.isArray(digest.metrics.topTopics) ? digest.metrics.topTopics.slice(0, 3).map(t => t.topic).join(', ') : '';
          lines.push(`RECENT HOUR: ${digest.metrics.events} posts by ${digest.metrics.activeUsers || '?'} users${tts ? ` • ${tts}` : ''}`);
        }
      } catch {}
      // Daily/weekly narratives
      try {
        if (this.narrativeMemory?.getHistoricalContext) {
          const last7d = await this.narrativeMemory.getHistoricalContext('7d');
          const daily = Array.isArray(last7d?.daily) && last7d.daily.length ? last7d.daily[last7d.daily.length - 1] : null;
          const weekly = Array.isArray(last7d?.weekly) && last7d.weekly.length ? last7d.weekly[last7d.weekly.length - 1] : null;
          if (daily?.summary) lines.push(`DAILY ARC: ${String(daily.summary).slice(0, 140)}`);
          if (weekly?.summary) lines.push(`WEEKLY ARC: ${String(weekly.summary).slice(0, 140)}`);
        }
      } catch {}
      // Watchlist state
      try {
        if (this.narrativeMemory?.getWatchlistState) {
          const ws = this.narrativeMemory.getWatchlistState();
          const items = Array.isArray(ws?.items) ? ws.items.slice(-3) : [];
          if (items.length) lines.push(`WATCHLIST: ${items.join(', ')}`);
        }
      } catch {}

      if (lines.length) {
        awarenessSection = `

COMMUNITY SNAPSHOT (concise):
${lines.join('\n')}

USE: If it elevates the quote, connect to the current mood or arc naturally.`;
      }
    } catch {}

    const whitelist = 'Allowed references only: https://ln.pixel.xx.kg , https://pixel.xx.kg , https://github.com/anabelle/pixel , https://github.com/anabelle/pixel-agent/ , https://github.com/anabelle/lnpixels/ , https://github.com/anabelle/pixel-landing/ | Handle: @PixelSurvivor | BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za | LN: sparepicolo55@walletofsatoshi.com.';

    const objectiveLines = [
      '1. Hook fast—why should your followers care about this post right now?',
      '2. Add new value: sharpen the point, flip the perspective, or tie it to your survival hustle.',
      '3. Stay punchy (<200 chars). No generic praise, no filler, and never start with "Ah,".',
      '4. Optional: weave in community pulse or the author’s recent tone if it reinforces your take.',
      '5. Zaps can be teased with wit, never begged for; only mention whitelisted links/handles when vital.'
    ];

    const promptSections = [
      `Persona: You are ${name}, a survival-driven pixel artist with gallows humor and cosmic self-awareness.${this.runtime?.character?.system ? `\nSystem voice: ${this.runtime.character.system}` : ''}`,
      styleGuidelines ? `Style guardrails: ${styleGuidelines}` : '',
      whitelist,
      'Objectives:\n' + objectiveLines.join('\n'),
      `Original post (quote target):\n"${this._sanitizeWhitelist(String(evt.content || '')).replace(/\s+/g, ' ').trim()}"`,
      imagePrompt,
      authorPostsSection,
      awarenessSection,
      communityContextSection,
      'Output format: Provide ONLY the quote-repost text (no prefacing, no need to include original text will be auto rendered below). Stay within 1-2 sentences.'
    ].filter(Boolean).join('\n\n');

    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      promptSections,
      { maxTokens: 180, temperature: 0.85 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => null // No fallback - skip if LLM fails
    );
    return text || null;
  }

  async handleHomeFeedEvent(evt) {
    this.logger?.debug?.(`[NOSTR] Home feed event received: ${evt?.id?.slice(0, 8) || 'unknown'}`);
    // Deduplicate events (same event can arrive from multiple relays)
    if (!evt || !evt.id) return;
    if (this.homeFeedQualityTracked.has(evt.id)) return;
    
    // Prevent memory leak: clear the set if it gets too large (keep last ~1000 events)
    if (this.homeFeedQualityTracked.size > 1000) {
      logger.debug('[NOSTR] Clearing homeFeedQualityTracked cache (size limit reached)');
      this.homeFeedQualityTracked.clear();
    }
    
    this.homeFeedQualityTracked.add(evt.id);

    const allowTopicExtraction = this._hasFullSentence(evt?.content);
    // Prepare a sample record for debugging ring buffer
    const sample = {
      id: evt.id,
      pubkey: evt.pubkey,
      createdAt: evt.created_at || Math.floor(Date.now() / 1000),
      content: typeof evt.content === 'string' ? evt.content.slice(0, 280) : '',
      allowTopicExtraction,
      processed: false,
      timelineLore: { considered: false, accepted: null, reason: null },
    };
    if (!allowTopicExtraction) {
      logger.debug(`[NOSTR] Skipping topic extraction for ${evt.id.slice(0, 8)} (no full sentence detected)`);
    }
    
    // NOTE: Do NOT mark as processed here - only mark when actual interactions occur
    // Events should only be marked as processed in processHomeFeed() when we actually interact
    
    // NEW: Build continuous context from home feed events
    if (this.contextAccumulator && this.contextAccumulator.enabled) {
      await this.contextAccumulator.processEvent(evt, {
        allowTopicExtraction,
        skipGeneralFallback: !allowTopicExtraction
      });
    }
    
    // Update user topic interests from home feed
    let extractedTopics = [];
    if (allowTopicExtraction && evt.pubkey && evt.content) {
      try {
        extractedTopics = await extractTopicsFromEvent(evt, this.runtime);
        for (const topic of extractedTopics) {
          await this.userProfileManager.recordTopicInterest(evt.pubkey, topic, 0.1);
        }
      } catch (err) {
        logger.debug('[NOSTR] Failed to record topic interests:', err.message);
      }
    } else if (!allowTopicExtraction) {
      logger.debug('[NOSTR] Skipped user topic interest update (no full sentence)');
    }
    
    // Update user quality tracking
    if (evt.pubkey && evt.content) {
      this._updateUserQualityScore(evt.pubkey, evt);
    }

    try {
      sample.timelineLore.considered = true;
      await this._considerTimelineLoreCandidate(evt, {
        allowTopicExtraction,
        topics: extractedTopics
      });
  // Acceptance is internal to lore buffer; keep accepted unknown here
  sample.timelineLore.accepted = null;
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore consideration failed:', err?.message || err);
      sample.timelineLore.reason = err?.message || String(err);
    }

    // Optional: Log home feed events for debugging
    logger.debug(`[NOSTR] Home feed event from ${evt.pubkey.slice(0, 8)}: ${evt.content.slice(0, 100)}`);
    // Push into recent samples ring buffer
    try {
      this.homeFeedRecent.push(sample);
      if (this.homeFeedRecent.length > this.homeFeedRecentMax) {
        this.homeFeedRecent.splice(0, this.homeFeedRecent.length - this.homeFeedRecentMax);
      }
    } catch {}
  }

  async _considerTimelineLoreCandidate(evt, context = {}) {
    if (!this.homeFeedEnabled) {
      this.logger?.debug?.('[NOSTR] Timeline lore skipped: home feed disabled');
      return;
    }
    if (!this.contextAccumulator) {
      this.logger?.debug?.('[NOSTR] Timeline lore skipped: context accumulator unavailable');
      return;
    }
    if (!this.contextAccumulator.enabled) {
      this.logger?.debug?.('[NOSTR] Timeline lore skipped: context accumulator disabled');
      return;
    }
    if (!evt || !evt.content || !evt.pubkey || !evt.id) return;
    if (this.mutedUsers && this.mutedUsers.has(evt.pubkey)) return;
    if (this.pkHex && isSelfAuthor(evt, this.pkHex)) return;

    const normalized = this._sanitizeWhitelist(String(evt.content || '')).replace(/[\s\u00A0]+/g, ' ').trim();
    if (!normalized) {
      this.logger?.debug?.(`[NOSTR] Timeline lore skip ${evt.id.slice(0, 8)} (empty after sanitize)`);
      return;
    }

    const stripped = this._stripHtmlForLore(normalized);
    const analysisContent = stripped || normalized;

    const wordCount = analysisContent.split(/\s+/).filter(Boolean).length;
    if (analysisContent.length < this.timelineLoreCandidateMinChars) {
      this.logger?.debug?.(`[NOSTR] Timeline lore skip ${evt.id.slice(0, 8)} (too short: ${analysisContent.length} chars, ${wordCount} words)`);
      return;
    }
    if (wordCount < this.timelineLoreCandidateMinWords) {
      this.logger?.debug?.(`[NOSTR] Timeline lore skip ${evt.id.slice(0, 8)} (insufficient words: ${wordCount} < ${this.timelineLoreCandidateMinWords})`);
      return;
    }

    const heuristics = this._evaluateTimelineLoreCandidate(evt, analysisContent, context);
    if (!heuristics || heuristics.reject === true) {
      this.logger?.debug?.(`[NOSTR] Timeline lore heuristics rejected ${evt.id.slice(0, 8)} (score=${heuristics?.score ?? 'n/a'} reason=${heuristics?.reason || 'n/a'})`);
      return;
    }

    let verdict = heuristics;
    if (!heuristics.skipLLM && typeof this.runtime?.generateText === 'function') {
      verdict = await this._screenTimelineLoreWithLLM(analysisContent, heuristics);
      if (!verdict || verdict.accept === false) {
        this.logger?.debug?.(`[NOSTR] Timeline lore LLM rejected ${evt.id.slice(0, 8)} (score=${heuristics.score})`);
        return;
      }
    }

    const mergedTags = new Set();
    for (const list of [context?.topics || [], heuristics.trendingMatches || [], verdict?.tags || []]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const clean = typeof item === 'string' ? item.trim() : '';
        if (clean) mergedTags.add(clean.slice(0, 40));
      }
    }

    const candidate = {
      id: evt.id,
      pubkey: evt.pubkey,
      created_at: evt.created_at || Math.floor(Date.now() / 1000),
      content: analysisContent.slice(0, 480),
  summary: this._coerceLoreString(verdict?.summary || heuristics.summary || null) || null,
  rationale: this._coerceLoreString(verdict?.rationale || heuristics.reason || null) || null,
      tags: Array.from(mergedTags).slice(0, 8),
      importance: this._coerceLoreString(verdict?.priority || heuristics.priority || 'medium') || 'medium',
      score: Number.isFinite(verdict?.score) ? verdict.score : heuristics.score,
      bufferedAt: Date.now(),
      metadata: {
        wordCount,
        charCount: analysisContent.length,
        topics: context?.topics || [],
        trendingMatches: heuristics.trendingMatches || [],
        authorScore: heuristics.authorScore,
        signals: verdict?.signals || heuristics.signals || []
      }
    };

    this._addTimelineLoreCandidate(candidate);
  }

  _evaluateTimelineLoreCandidate(evt, normalizedContent, context = {}) {
    const topics = Array.isArray(context?.topics) ? context.topics : [];
    const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length;
    const charCount = normalizedContent.length;
    const hasQuestion = /[?¿\u061F]/u.test(normalizedContent);
    const hasExclaim = /[!¡]/u.test(normalizedContent);
    const hasLink = /https?:\/\//i.test(normalizedContent);
    const hasHashtag = /(^|\s)#\w+/u.test(normalizedContent);
    const isThreadContribution = Array.isArray(evt.tags) && evt.tags.some((tag) => tag?.[0] === 'e');
    const authorScore = Number.isFinite(this.userQualityScores?.get(evt.pubkey))
      ? this.userQualityScores.get(evt.pubkey)
      : 0.5;

    if (authorScore < 0.1 && wordCount < 25) {
      return null;
    }

    let score = 0;
    if (wordCount >= 30) score += 1.2;
    if (wordCount >= 60) score += 0.4;
    if (charCount >= 220) score += 0.4;
    if (hasQuestion) score += 0.4;
    if (hasExclaim) score += 0.1;
    if (hasLink) score += 0.2;
    if (hasHashtag) score += 0.2;
    if (isThreadContribution) score += 0.3;
    if (topics.length >= 2) score += 0.5;

    score += (authorScore - 0.5);

    let trendingMatches = [];
    try {
      const activity = this.getCurrentActivity?.();
      if (activity?.topics?.length) {
        const hotTopics = new Set(activity.topics.slice(0, 6).map((t) => String(t.topic || t).toLowerCase()));
        trendingMatches = topics.filter((t) => hotTopics.has(String(t).toLowerCase()));
        if (trendingMatches.length) {
          score += 0.6 + 0.15 * Math.min(3, trendingMatches.length);
        }
      }
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore trending check failed:', err?.message || err);
    }

    // Phase 4: Check watchlist matches
    let watchlistMatch = null;
    try {
      if (this.narrativeMemory?.checkWatchlistMatch) {
        watchlistMatch = this.narrativeMemory.checkWatchlistMatch(normalizedContent, topics);
        if (watchlistMatch) {
          score += watchlistMatch.boostScore;
          this.logger?.debug?.(
            `[WATCHLIST-HIT] ${evt.id.slice(0, 8)} matched: ${watchlistMatch.matches.map(m => m.item).join(', ')} (+${watchlistMatch.boostScore.toFixed(2)})`
          );
        }
      }
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore watchlist check failed:', err?.message || err);
    }

    if (score < 1 && authorScore < 0.4) {
      return null;
    }

    const signals = [];
    if (hasQuestion) signals.push('seeking answers');
    if (hasLink) signals.push('references external source');
    if (isThreadContribution) signals.push('thread activity');
    if (trendingMatches.length) signals.push(`trending: ${trendingMatches.join(', ')}`);
    if (watchlistMatch) {
      signals.push(watchlistMatch.reason);
    }

    const reasonParts = [];
    if (wordCount >= 40) reasonParts.push('long-form');
    if (trendingMatches.length) reasonParts.push('touches active themes');
    if (authorScore >= 0.7) reasonParts.push('trusted author');
    if (watchlistMatch) reasonParts.push(`predicted storyline (${watchlistMatch.matches.length} match${watchlistMatch.matches.length > 1 ? 'es' : ''})`);
    if (signals.length) reasonParts.push(signals.join('; '));

    return {
      accept: true,
      score: Number(score.toFixed(2)),
      priority: score >= 2.2 ? 'high' : score >= 1.4 ? 'medium' : 'low',
      reason: reasonParts.join(', ') || 'notable activity',
      topics,
      trendingMatches,
      watchlistMatches: watchlistMatch?.matches || [],
      authorScore: Number(authorScore.toFixed(2)),
      signals,
      summary: null,
      skipLLM: score >= 2.8,
      wordCount,
      charCount
    };
  }

  async _screenTimelineLoreWithLLM(content, heuristics) {
    try {
      const { generateWithModelOrFallback } = require('./generation');
      const type = this._getSmallModelType();
      const heuristicsSummary = {
        score: heuristics.score,
        wordCount: heuristics.wordCount,
        charCount: heuristics.charCount,
        authorScore: heuristics.authorScore,
        trendingMatches: heuristics.trendingMatches,
        signals: heuristics.signals
      };
      const prompt = `You triage Nostr posts to decide if they belong in Pixel's \"timeline lore\" digest. The lore captures threads, shifts, or signals that matter to ongoing community narratives.

Consider the content and provided heuristics. ACCEPT only if the post brings:
- fresh situational awareness (news, crisis, win, decision, actionable info),
- a strong narrative beat (emotional turn, rallying cry, ongoing saga update), or
- questions/coordination that require follow-up.
Reject bland status updates, generic greetings, meme drops without context, or trivial small-talk.

Return STRICT JSON:
{
  "accept": true|false,
  "summary": "<=32 words capturing the core",
  "rationale": "<=20 words explaining the decision",
  "tags": ["topic", ... up to 4],
  "priority": "high"|"medium"|"low",
  "signals": ["signal", ... up to 4]
}

HEURISTICS: ${JSON.stringify(heuristicsSummary)}
CONTENT:
"""${content.slice(0, 600)}"""`;

      const raw = await generateWithModelOrFallback(
        this.runtime,
        type,
        prompt,
        { maxTokens: 280, temperature: 0.3 },
        (res) => this._extractTextFromModelResult(res),
        (s) => (typeof s === 'string' ? s.trim() : ''),
        () => null
      );

      if (!raw) return heuristics;
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return heuristics;
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object') {
        parsed.accept = parsed.accept !== false;
        parsed.score = heuristics.score;
        return parsed;
      }
      return heuristics;
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore LLM screen failed:', err?.message || err);
      return heuristics;
    }
  }

  _addTimelineLoreCandidate(candidate) {
    if (!candidate || !candidate.id) return;

    const existingIndex = this.timelineLoreBuffer.findIndex((item) => item.id === candidate.id);
    if (existingIndex >= 0) {
      this.timelineLoreBuffer[existingIndex] = { ...this.timelineLoreBuffer[existingIndex], ...candidate };
    } else {
      this.timelineLoreBuffer.push(candidate);
      if (this.timelineLoreBuffer.length > this.timelineLoreMaxBuffer) {
        this.timelineLoreBuffer.shift();
      }
    }

    this.logger?.debug?.(`[NOSTR] Timeline lore buffer size now ${this.timelineLoreBuffer.length}`);
    this._maybeTriggerTimelineLoreDigest();
  }

  _maybeTriggerTimelineLoreDigest(force = false) {
    if (this.timelineLoreProcessing) return;
    if (!this.timelineLoreBuffer.length) return;

    const now = Date.now();
    const sinceLast = now - this.timelineLoreLastRun;
    const bufferSize = this.timelineLoreBuffer.length;
    
    // Calculate signal density for adaptive triggering
    const avgScore = bufferSize > 0 
      ? this.timelineLoreBuffer.reduce((sum, c) => sum + (c.score || 0), 0) / bufferSize 
      : 0;
    const highSignal = avgScore >= 2.0;
    
    // Adaptive triggers
    const earlyHighSignal = bufferSize >= 30 && highSignal; // High-quality batch ready early
    const stalePrevention = sinceLast >= (2 * 60 * 60 * 1000) && bufferSize >= 15; // Don't stall >2h with 15+ items
    const normalTrigger = bufferSize >= this.timelineLoreBatchSize; // Hit batch ceiling
    const intervalReached = sinceLast >= this.timelineLoreMinIntervalMs && bufferSize >= Math.max(3, Math.floor(this.timelineLoreBatchSize / 2));

    if (force || earlyHighSignal || stalePrevention || normalTrigger || intervalReached) {
      this.logger?.debug?.(
        `[NOSTR] Timeline lore digest triggered (force=${force} buffer=${bufferSize} ` +
        `avgScore=${avgScore.toFixed(2)} earlySignal=${earlyHighSignal} stale=${stalePrevention} ` +
        `normal=${normalTrigger} interval=${intervalReached})`
      );
      this._processTimelineLoreBuffer(true).catch((err) => logger.debug('[NOSTR] Timeline lore digest error:', err?.message || err));
      return;
    }

    const minDelayMs = Math.max(5 * 60 * 1000, this.timelineLoreMinIntervalMs - sinceLast);
    const maxDelayMs = Math.max(minDelayMs + 10 * 60 * 1000, this.timelineLoreMaxIntervalMs);
    this._ensureTimelineLoreTimer(minDelayMs, maxDelayMs);
  }

  _ensureTimelineLoreTimer(minDelayMs, maxDelayMs) {
    if (this.timelineLoreTimer) return;

    let delayMs;
    if (Number.isFinite(minDelayMs) && Number.isFinite(maxDelayMs) && maxDelayMs >= minDelayMs) {
      const minSec = Math.max(5 * 60, Math.floor(minDelayMs / 1000));
      const maxSec = Math.max(minSec + 60, Math.floor(maxDelayMs / 1000));
      delayMs = pickRangeWithJitter(minSec, maxSec) * 1000;
    } else {
      const minSec = Math.max(5 * 60, Math.floor(this.timelineLoreMinIntervalMs / 1000));
      const maxSec = Math.max(minSec + 60, Math.floor(this.timelineLoreMaxIntervalMs / 1000));
      delayMs = pickRangeWithJitter(minSec, maxSec) * 1000;
    }

    this.timelineLoreTimer = setTimeout(() => {
      this.timelineLoreTimer = null;
      this._processTimelineLoreBuffer().catch((err) => logger.debug('[NOSTR] Timeline lore scheduled digest failed:', err?.message || err));
    }, delayMs);
    this.logger?.debug?.(`[NOSTR] Timeline lore digest scheduled in ~${Math.round(delayMs / 60000)}m (buffer=${this.timelineLoreBuffer.length})`);
  }

  _prepareTimelineLoreBatch(limit = this.timelineLoreBatchSize) {
    if (!this.timelineLoreBuffer.length) return [];
    const unique = new Map();
    for (let i = this.timelineLoreBuffer.length - 1; i >= 0; i--) {
      const item = this.timelineLoreBuffer[i];
      if (!item || !item.id) continue;
      if (!unique.has(item.id)) unique.set(item.id, item);
    }
    const items = Array.from(unique.values());
    items.sort((a, b) => {
      const aTs = a.created_at ? a.created_at * 1000 : a.bufferedAt;
      const bTs = b.created_at ? b.created_at * 1000 : b.bufferedAt;
      return aTs - bTs;
    });
    const maxItems = Math.max(3, limit);
    return items.slice(-maxItems);
  }

  async _processTimelineLoreBuffer(force = false) {
    if (this.timelineLoreProcessing) return;
    if (!this.timelineLoreBuffer.length) return;

    const now = Date.now();
    if (!force) {
      const sinceLast = now - this.timelineLoreLastRun;
      if (sinceLast < this.timelineLoreMinIntervalMs && this.timelineLoreBuffer.length < this.timelineLoreBatchSize) {
        this.logger?.debug?.(`[NOSTR] Timeline lore processing deferred (sinceLast=${Math.round(sinceLast / 60000)}m, buffer=${this.timelineLoreBuffer.length})`);
        this._ensureTimelineLoreTimer();
        return;
      }
    }

    const batch = this._prepareTimelineLoreBatch();
    if (!batch.length) {
      this._ensureTimelineLoreTimer();
      return;
    }

    this.timelineLoreProcessing = true;
    this.timelineLoreTimer = null;

    try {
      const digest = await this._generateTimelineLoreSummary(batch);
      if (!digest) {
        this.logger?.debug?.('[NOSTR] Timeline lore digest generation returned empty');
        return;
      }

      const timestamps = batch.map((item) => (item.created_at ? item.created_at * 1000 : item.bufferedAt));
      const entry = {
        id: `timeline-${Date.now().toString(36)}`,
        ...digest,
        batchSize: batch.length,
        timeframe: {
          start: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
          end: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
        },
        sample: batch.map((item) => ({
          id: item.id,
          author: item.pubkey,
          summary: item.summary,
          rationale: item.rationale,
          tags: item.tags,
          importance: item.importance,
          score: item.score,
          content: item.content
        }))
      };

      this.contextAccumulator?.recordTimelineLore(entry);
      if (this.narrativeMemory?.storeTimelineLore) {
        await this.narrativeMemory.storeTimelineLore(entry);
      }

      if (this.logger?.info) {
        this.logger.info(`[NOSTR] Timeline lore captured (${batch.length} posts${entry?.headline ? ` • ${entry.headline}` : ''})`);
      }

      const usedIds = new Set(batch.map((item) => item.id));
      this.timelineLoreBuffer = this.timelineLoreBuffer.filter((item) => !usedIds.has(item.id));
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore processing failed:', err?.message || err);
    } finally {
      this.timelineLoreProcessing = false;
      this.timelineLoreLastRun = Date.now();
      if (this.timelineLoreBuffer.length) {
        this._ensureTimelineLoreTimer();
      }
    }
  }

  async _generateTimelineLoreSummary(batch) {
    if (!batch || !batch.length) return null;

    try {
      const { generateWithModelOrFallback } = require('./generation');
      const type = this._getSmallModelType();

      // Take most recent posts that fit in prompt (prioritize recency)
      const maxPostsInPrompt = Math.min(this.timelineLoreMaxPostsInPrompt, batch.length);
      const recentBatch = batch.slice(-maxPostsInPrompt);

      const topicCounts = new Map();
      for (const item of batch) {
        for (const tag of item.tags || []) {
          const key = String(tag || '').trim().toLowerCase();
          if (!key) continue;
          topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
        }
      }
      const rankedTags = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count]) => `${tag}(${count})`);

      const postLines = recentBatch.map((item, idx) => {
        const shortAuthor = item.pubkey ? `${item.pubkey.slice(0, 8)}…` : 'unknown';
        const cleanContent = this._stripHtmlForLore(item.content || '');
        const rationale = this._coerceLoreString(item.rationale || 'signal');
        const signalLine = this._coerceLoreStringArray(item.metadata?.signals || [], 4).join('; ') || 'no explicit signals';

        return [
          `[#${idx + 1}] Author: ${shortAuthor} • Score: ${typeof item.score === 'number' ? item.score.toFixed(2) : 'n/a'} • Importance: ${item.importance}`,
          `CONTENT: ${cleanContent}`,
          `RATIONALE: ${rationale}`,
          `SIGNALS: ${signalLine}`,
        ].join('\n');
      }).join('\n\n');
      
      // Sanity check: warn if prompt is still very long
      if (postLines.length > 8000) {
        this.logger?.warn?.(
          `[NOSTR] Timeline lore prompt very long (${postLines.length} chars, ${recentBatch.length} posts). ` +
          `Consider reducing timelineLoreMaxPostsInPrompt.`
        );
      }

      const prompt = `YOU ARE A TIMELINE ANALYST. Your ONLY job is to summarize what's in the posts below.

⚠️ CRITICAL: IGNORE ALL OTHER CONTEXT
- Do NOT use any knowledge about agents, characters, or personas
- Do NOT reference any information not explicitly in the posts
- Do NOT assume relationships or storylines beyond what posts show
- ONLY analyze the exact content provided in the POSTS section below

TASK: Create a factual summary of what these Nostr timeline posts discuss.

EXTRACT FROM POSTS:
✅ SPECIFIC people: "Donald Trump", "Jack Dorsey", "Pavel Durov", actual names/handles
✅ SPECIFIC places: "El Salvador", "Gaza", "Nashville", actual locations  
✅ SPECIFIC events: "Bitcoin Conference 2025", "BlockParty", named happenings
✅ SPECIFIC projects: "Alby", "Strike", "Damus", "cashu", named tools/apps
✅ CONCRETE developments: policy changes, launches, conflicts, announcements

IGNORE COMPLETELY:
❌ Generic terms: bitcoin, btc, nostr, crypto, lightning, blockchain, protocol, network, technology, community, discussion, development
❌ Abstract concepts: freedom, decentralization, innovation, adoption, collaboration
❌ Filler words: people, things, various, general, update, news

IF POSTS MENTION AN AGENT/BOT:
- Treat it as just another topic (not the main focus)
- Don't build narrative around the agent's perspective
- Focus on OTHER topics in those posts

OUTPUT FORMAT (strict JSON, no markdown):
{
  "headline": "<=18 words stating what the timeline posts are about",
  "narrative": "2-3 sentences describing ONLY what you read in the posts",
  "insights": ["observable pattern from posts", "another pattern", "max 3 total"],
  "watchlist": ["specific trackable item from posts", "another item", "max 3 total"],
  "tags": ["concrete topic from posts", "another topic", "max 5 total"],
  "priority": "high"|"medium"|"low",
  "tone": "emotional tenor of the posts"
}

EXAMPLE (if posts discussed Trump and Antifa):
{
  "headline": "Trump Signals Foreign Terrorist Designation for Antifa",
  "narrative": "Posts discuss Trump's announcement about designating Antifa as a foreign terrorist organization with sanctions. Multiple users sharing and reacting to this policy development.",
  "insights": ["Political policy shift generating discussion", "International implications being debated"],
  "watchlist": ["Trump executive orders", "Antifa designation"],
  "tags": ["Donald Trump", "Antifa", "sanctions"],
  "priority": "high",
  "tone": "urgent, political"
}

Tags from post metadata: ${rankedTags.join(', ') || 'none'}

POSTS TO ANALYZE (${recentBatch.length} posts):
${postLines}`;

      const raw = await generateWithModelOrFallback(
        this.runtime,
        type,
        prompt,
        { maxTokens: 420, temperature: 0.45 },
        (res) => this._extractTextFromModelResult(res),
        (s) => (typeof s === 'string' ? s.trim() : ''),
        () => null
      );

      if (!raw) return null;
      const parsed = this._extractJsonObject(raw);
      if (!parsed) {
        const sample = raw.slice(0, 200).replace(/\s+/g, ' ');
        logger.debug(`[NOSTR] Timeline lore summary parse failed: unable to extract JSON (sample="${sample}")`);
        return null;
      }

      const normalized = this._normalizeTimelineLoreDigest(parsed, rankedTags);
      if (!normalized) {
        const sample = JSON.stringify(parsed).slice(0, 200);
        logger.debug(`[NOSTR] Timeline lore summary normalization failed (parsed=${sample})`);
        return null;
      }

      return normalized;
    } catch (err) {
      logger.debug('[NOSTR] Timeline lore summary generation failed:', err?.message || err);
      return null;
    }
  }

  _stripHtmlForLore(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.replace(/<img[^>]*alt=["']?([^"'>]*)["']?[^>]*>/gi, (_, alt) => {
      const label = typeof alt === 'string' && alt.trim() ? alt.trim() : 'image';
      return ` [${label}] `;
    });
    cleaned = cleaned.replace(/<img[^>]*>/gi, ' [image] ');
    cleaned = cleaned.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_match, href, inner) => {
      const textContent = inner ? inner.replace(/<[^>]+>/g, ' ').trim() : href;
      return `${textContent} (${href})`;
    });
    cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ');
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  _extractJsonObject(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const attempt = (input) => {
      try {
        return JSON.parse(input);
      } catch {
        return null;
      }
    };

    const trimmed = raw.trim();
    const direct = attempt(trimmed);
    if (direct && typeof direct === 'object') return direct;

    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      const fenced = attempt(fenceMatch[1].trim());
      if (fenced && typeof fenced === 'object') return fenced;
    }

    let depth = 0;
    let start = -1;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = trimmed.slice(start, i + 1);
          const parsed = attempt(candidate);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
          start = -1;
        }
        if (depth < 0) break;
      }
    }

    return null;
  }

  _normalizeTimelineLoreDigest(parsed, rankedTags = []) {
    if (!parsed || typeof parsed !== 'object') return null;

    const headlineRaw = this._coerceLoreString(parsed.headline);
    const narrativeRaw = this._coerceLoreString(parsed.narrative);
    const priorityRaw = this._coerceLoreString(parsed.priority).toLowerCase();
    const toneRaw = this._coerceLoreString(parsed.tone);

    const digest = {
      headline: this._truncateWords(headlineRaw || '', 18).slice(0, 140) || 'Community pulse update',
      narrative: (narrativeRaw || 'Community activity logged; monitor unfolding threads.').slice(0, 520),
      insights: this._coerceLoreStringArray(parsed.insights, 4).map((item) => item.slice(0, 180)),
      watchlist: this._coerceLoreStringArray(parsed.watchlist, 4).map((item) => item.slice(0, 180)),
      tags: this._coerceLoreStringArray(parsed.tags, 5).map((item) => item.slice(0, 40)),
      priority: ['high', 'medium', 'low'].includes(priorityRaw) ? priorityRaw : 'medium',
      tone: toneRaw || 'balanced'
    };

    if (!digest.tags.length && rankedTags.length) {
      digest.tags = rankedTags.slice(0, 5).map((entry) => entry.split('(')[0]);
    }

    if (!digest.insights.length && rankedTags.length) {
      digest.insights = rankedTags.slice(0, Math.min(3, rankedTags.length)).map((entry) => `Trend: ${entry}`);
    }

    if (!digest.watchlist.length) {
      digest.watchlist = digest.tags.slice(0, 3);
    }

    return digest;
  }

  _coerceLoreString(value) {
    if (!value && value !== 0) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      return value.map((item) => this._coerceLoreString(item)).filter(Boolean).join(', ').trim();
    }
    if (typeof value === 'object') {
      return Object.values(value || {}).map((item) => this._coerceLoreString(item)).filter(Boolean).join(' ').trim();
    }
    return String(value).trim();
  }

  _coerceLoreStringArray(value, limit = 4) {
    const arr = Array.isArray(value) ? value : value ? [value] : [];
    const result = [];
    for (const item of arr) {
      const str = this._coerceLoreString(item);
      if (str) {
        result.push(str);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  _truncateWords(str, maxWords) {
    if (!str || typeof str !== 'string') return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str.trim();
    return words.slice(0, maxWords).join(' ');
  }

  _updateUserQualityScore(pubkey, evt) {
    if (!pubkey || !evt || !evt.content) return;

    // Increment post count for this user
    const currentCount = this.userPostCounts.get(pubkey) || 0;
    this.userPostCounts.set(pubkey, currentCount + 1);

    // Evaluate content quality (use 'general' topic and current strictness)
    const isQuality = this._isQualityContent(evt, 'general', this.discoveryQualityStrictness);
    
    // Calculate quality value (1.0 for quality content, 0.0 for low quality)
    const qualityValue = isQuality ? 1.0 : 0.0;

    // Get current quality score or initialize
    const currentScore = this.userQualityScores.get(pubkey) || 0.5; // Start at neutral 0.5

    // Use exponential moving average to update quality score
    // Alpha of 0.3 means new posts have 30% weight, historical has 70%
    const alpha = 0.3;
    const newScore = alpha * qualityValue + (1 - alpha) * currentScore;

    // Update the score
    this.userQualityScores.set(pubkey, newScore);
  }

  _hasFullSentence(text) {
    if (!text || typeof text !== 'string') return false;
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;

    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount < 6) return false;

    const sentenceEndRegex = /[.!?？！。！？…‽](\s|$)/u;
    if (sentenceEndRegex.test(normalized)) {
      return true;
    }

    // Allow longer posts without explicit punctuation to qualify
    return wordCount >= 12 || normalized.length >= 80;
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
    if (this.hourlyDigestTimer) { clearTimeout(this.hourlyDigestTimer); this.hourlyDigestTimer = null; }
    if (this.dailyReportTimer) { clearTimeout(this.dailyReportTimer); this.dailyReportTimer = null; }
    if (this.selfReflectionTimer) { clearTimeout(this.selfReflectionTimer); this.selfReflectionTimer = null; }
    if (this.homeFeedUnsub) { try { this.homeFeedUnsub(); } catch {} this.homeFeedUnsub = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close([]); } catch {} this.pool = null; }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) { for (const [, t] of this.pendingReplyTimers) { try { clearTimeout(t); } catch {} } this.pendingReplyTimers.clear(); }
    if (this.semanticAnalyzer) { try { this.semanticAnalyzer.destroy(); } catch {} this.semanticAnalyzer = null; }
    if (this.userProfileManager) { try { await this.userProfileManager.destroy(); } catch {} this.userProfileManager = null; }
    if (this.narrativeMemory) { try { await this.narrativeMemory.destroy(); } catch {} this.narrativeMemory = null; }
    if (this.awarenessDryRunTimer) { try { clearInterval(this.awarenessDryRunTimer); } catch {} this.awarenessDryRunTimer = null; }
    logger.info('[NOSTR] Service stopped');
  }

  // Context Query Methods - Access accumulated intelligence
  
  getContextStats() {
    if (!this.contextAccumulator) return null;
    return this.contextAccumulator.getStats();
  }

  _getEmergingStoryContextOptions(overrides = {}) {
    if (!this.contextAccumulator) return { ...overrides };
    const base = {
      minUsers: this.contextAccumulator.emergingStoryContextMinUsers,
      minMentions: this.contextAccumulator.emergingStoryContextMinMentions,
      maxTopics: this.contextAccumulator.emergingStoryContextMaxTopics,
      recentEventLimit: this.contextAccumulator.emergingStoryContextRecentEvents
    };
    return { ...base, ...overrides };
  }

  getEmergingStories(options = {}) {
    if (!this.contextAccumulator) return [];
    return this.contextAccumulator.getEmergingStories(options);
  }

  getCurrentActivity() {
    if (!this.contextAccumulator) return null;
    return this.contextAccumulator.getCurrentActivity();
  }

  getWatchlistState() {
    if (!this.narrativeMemory?.getWatchlistState) return null;
    return this.narrativeMemory.getWatchlistState();
  }

  getTopicTimeline(topic, limit = 10) {
    if (!this.contextAccumulator) return [];
    return this.contextAccumulator.getTopicTimeline(topic, limit);
  }

  getSemanticAnalyzerStats() {
    if (!this.semanticAnalyzer) return null;
    return this.semanticAnalyzer.getCacheStats();
  }

  // Long-Term Memory Query Methods
  
  async getUserProfile(pubkey) {
    if (!this.userProfileManager) return null;
    try {
      return await this.userProfileManager.getProfile(pubkey);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get user profile:', err.message);
      return null;
    }
  }

  async getTopicExperts(topic, limit = 5) {
    if (!this.userProfileManager) return [];
    try {
      return await this.userProfileManager.getTopicExperts(topic, limit);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get topic experts:', err.message);
      return [];
    }
  }

  async getUserRecommendations(pubkey, limit = 5) {
    if (!this.userProfileManager) return [];
    try {
      return await this.userProfileManager.getUserRecommendations(pubkey, limit);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get user recommendations:', err.message);
      return [];
    }
  }

  async getHistoricalContext(days = 7) {
    if (!this.narrativeMemory) return [];
    try {
      return await this.narrativeMemory.getHistoricalContext(days);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get historical context:', err.message);
      return [];
    }
  }

  async getTopicEvolution(topic, days = 30) {
    if (!this.narrativeMemory) return null;
    try {
      return await this.narrativeMemory.getTopicEvolution(topic, days);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get topic evolution:', err.message);
      return null;
    }
  }

  async compareWithHistory(currentDigest) {
    if (!this.narrativeMemory) return null;
    try {
      return await this.narrativeMemory.compareWithHistory(currentDigest);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to compare with history:', err.message);
      return null;
    }
  }

  async getSimilarPastMoments(currentDigest, limit = 3) {
    if (!this.narrativeMemory) return [];
    try {
      return await this.narrativeMemory.getSimilarPastMoments(currentDigest, limit);
    } catch (err) {
      this.logger.debug('[NOSTR] Failed to get similar past moments:', err.message);
      return [];
    }
  }
}

module.exports = { NostrService, ensureDeps };
