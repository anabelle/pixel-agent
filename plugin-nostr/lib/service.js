// Full NostrService extracted from index.js for testability
let logger, createUniqueUuid, ChannelType, ModelType;
let SimplePool, nip19, finalizeEvent, getPublicKey;
let wsInjector;
let nip10Parse;

const {
  parseRelays,
  normalizeSeconds,
  pickRangeWithJitter,
} = require('./utils');
const { parseSk: parseSkHelper, parsePk: parsePkHelper } = require('./keys');
const { _scoreEventForEngagement, _isQualityContent } = require('./scoring');
const { pickDiscoveryTopics, isSemanticMatch, isQualityAuthor, selectFollowCandidates } = require('./discovery');
const { buildPostPrompt, buildReplyPrompt, buildZapThanksPrompt, buildPixelBoughtPrompt, extractTextFromModelResult, sanitizeWhitelist } = require('./text');
const { getConversationIdFromEvent, extractTopicsFromEvent, isSelfAuthor } = require('./nostr');
const { getZapAmountMsats, getZapTargetEventId, generateThanksText, getZapSenderPubkey } = require('./zaps');
const { buildTextNote, buildReplyNote, buildReaction, buildContacts } = require('./eventFactory');

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import('@nostr/tools');
    SimplePool = tools.SimplePool;
    nip19 = tools.nip19;
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
    this.handledEventIds = new Set();
    this.lastReplyByUser = new Map();
    this.pendingReplyTimers = new Map();
    this.zapCooldownByUser = new Map();
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

  // Dedupe cache for pixel.bought events (cross-listener safety)
  this._pixelSeen = new Map(); // key -> timestamp
  this._pixelSeenTTL = 5 * 60 * 1000; // 5 minutes
  this._pixelLastPostAt = 0; // timestamp of last successful pixel post
  this._pixelPostMinIntervalMs = Number(process.env.LNPIXELS_POST_MIN_INTERVAL_MS || 3600000); // default 1 hour
  this._pixelInFlight = new Set(); // keys currently being processed to prevent concurrent dupes
  // Track last received pixel event to suppress nearby scheduled posts
  this._pixelLastEventAt = 0;

    // Bridge: allow external modules to request a post
    try {
      const { emitter } = require('./bridge');
      if (emitter && typeof emitter.on === 'function') {
        emitter.on('external.post', async (payload) => {
          try {
            const txt = (payload && payload.text ? String(payload.text) : '').trim();
            if (!txt || txt.length > 1000) return; // Add length validation here too
            await this.postOnce(txt);
          } catch {}
        });
        // New: pixel purchase event delegates text generation + posting here
  emitter.on('pixel.bought', async (payload) => {
          try {
            const activity = payload?.activity || payload;
            // Record last event time ASAP to suppress scheduled posts racing ahead
            this._pixelLastEventAt = Date.now();
            // Build a stable key for dedupe: match listener priority exactly
            const key = activity?.event_id || activity?.payment_hash || activity?.id || ((typeof activity?.x==='number' && typeof activity?.y==='number' && activity?.created_at) ? `${activity.x},${activity.y},${activity.created_at}` : null);
            logger.info(`[NOSTR] pixel.bought handler - key: ${key}, activity.id: ${activity?.id}, payment_hash: ${activity?.payment_hash}, event_id: ${activity?.event_id}`);
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
              }
      } catch { cleanupInFlight(); return; }
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
          } catch {}
        });
      }
    } catch {}
  }

  static async start(runtime) {
    await ensureDeps();
    const svc = new NostrService(runtime);
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

    svc.relays = relays;
    svc.sk = sk;
    svc.replyEnabled = String(replyVal ?? 'true').toLowerCase() === 'true';
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
    svc.discoveryMaxFollows = discoveryMaxFollows;
    svc.discoveryMinQualityInteractions = discoveryMinQualityInteractions;
    svc.discoveryMaxSearchRounds = discoveryMaxSearchRounds;
    svc.discoveryStartingThreshold = discoveryStartingThreshold;
    svc.discoveryThresholdDecrement = discoveryThresholdDecrement;
    svc.discoveryQualityStrictness = discoveryQualityStrictness;

    logger.info(`[NOSTR] Config: postInterval=${minSec}-${maxSec}s, listen=${listenEnabled}, post=${postEnabled}, replyThrottle=${svc.replyThrottleSec}s, thinkDelay=${svc.replyInitialDelayMinMs}-${svc.replyInitialDelayMaxMs}ms, discovery=${svc.discoveryEnabled} interval=${svc.discoveryMinSec}-${svc.discoveryMaxSec}s maxReplies=${svc.discoveryMaxReplies} maxFollows=${svc.discoveryMaxFollows} minQuality=${svc.discoveryMinQualityInteractions} maxRounds=${svc.discoveryMaxSearchRounds} startThreshold=${svc.discoveryStartingThreshold} strictness=${svc.discoveryQualityStrictness}`);

    if (!relays.length) {
      logger.warn('[NOSTR] No relays configured; service will be idle');
      return svc;
    }

    svc.pool = new SimplePool({ enablePing });

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

    if (listenEnabled && svc.pool && svc.pkHex) {
      try {
        svc.listenUnsub = svc.pool.subscribeMany(
          relays,
          [
            { kinds: [1], '#p': [svc.pkHex] },
            { kinds: [9735], authors: undefined, limit: 0, '#p': [svc.pkHex] },
          ],
          {
            onevent(evt) {
              logger.info(`[NOSTR] Mention from ${evt.pubkey}: ${evt.content.slice(0, 140)}`);
              if (svc.pkHex && isSelfAuthor(evt, svc.pkHex)) { logger.debug('[NOSTR] Skipping self-authored event'); return; }
              if (evt.kind === 9735) { svc.handleZap(evt).catch((err) => logger.debug('[NOSTR] handleZap error:', err?.message || err)); return; }
              svc.handleMention(evt).catch((err) => logger.warn('[NOSTR] handleMention error:', err?.message || err));
            },
            oneose() { logger.debug('[NOSTR] Mention subscription OSE'); },
          }
        );
      } catch (err) {
        logger.warn(`[NOSTR] Subscribe failed: ${err?.message || err}`);
      }
    }

    if (postEnabled && sk) svc.scheduleNextPost(minSec, maxSec);
    if (svc.discoveryEnabled && sk) svc.scheduleNextDiscovery();

    // Start LNPixels listener for external-triggered posts
    try {
      const { startLNPixelsListener } = require('./lnpixels-listener');
      if (typeof startLNPixelsListener === 'function') startLNPixelsListener(svc.runtime);
    } catch {}

    logger.info(`[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled} discovery=${svc.discoveryEnabled}`);
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

  _selectFollowCandidates(scoredEvents, currentContacts) {
    return selectFollowCandidates(
      scoredEvents,
      currentContacts,
      this.pkHex,
      this.lastReplyByUser,
      this.replyThrottleSec,
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

      // Search for events with expanded parameters
      const buckets = await Promise.all(topics.map((t) => this._listEventsByTopic(t, searchParams)));
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
      const followCandidates = this._selectFollowCandidates(allScoredEvents, current);
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
        const convId = this._getConversationIdFromEvent(evt);
        const { roomId } = await this._ensureNostrContext(evt.pubkey, undefined, convId);
        const text = await this.generateReplyTextLLM(evt, roomId);
        const ok = await this.postReply(evt, text);
        if (ok) {
          this.handledEventIds.add(evt.id);
          usedAuthors.add(evt.pubkey);
          this.lastReplyByUser.set(evt.pubkey, Date.now());
          eventTopics.forEach(topic => usedTopics.add(topic));
          replies++;
          qualityInteractions++; // Count all successful replies as quality interactions for now
          logger.info(`[NOSTR] Discovery reply ${currentTotalReplies + replies}/${this.discoveryMaxReplies} to ${evt.pubkey.slice(0, 8)} (score: ${score.toFixed(2)}, round: ${round + 1})`);
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
  _buildReplyPrompt(evt, recent) { return buildReplyPrompt(this.runtime.character, evt, recent); }
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
        // Simple fallback if LLM fails
        const x = typeof activity?.x === 'number' ? activity.x : '?';
        const y = typeof activity?.y === 'number' ? activity.y : '?';
        const sats = typeof activity?.sats === 'number' ? activity.sats : 'some';
        const color = typeof activity?.color === 'string' ? ` #${activity.color.replace('#','')}` : '';
        return `fresh pixel on the canvas at (${x},${y})${color} — ${sats} sats. place yours: https://lnpixels.qzz.io`;
      }
    );
    // Enrich text if missing coords/color (keep within whitelist)
    try {
      const hasCoords = /\(\s*[-]?\d+\s*,\s*[-]?\d+\s*\)/.test(text || '');
      const hasColor = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.test(text || '');
      const parts = [text || ''];
      const xOk = typeof activity?.x === 'number' && Math.abs(activity.x) <= 10000;
      const yOk = typeof activity?.y === 'number' && Math.abs(activity.y) <= 10000;
      const colorOk = typeof activity?.color === 'string' && /^#?[0-9a-fA-F]{6}$/i.test(activity.color.replace('#',''));
      if (!hasCoords && xOk && yOk) parts.push(`(${activity.x},${activity.y})`);
      if (!hasColor && colorOk) parts.push(`#${activity.color.replace('#','')}`);
      // For bulk purchases, add summary badge if provided
      if (activity?.type === 'bulk_purchase' && activity?.summary && !/\b\d+\s+pixels?\b/i.test(text)) {
        parts.push(`• ${activity.summary}`);
      }
      text = parts.join(' ').replace(/\s+/g, ' ').trim();
      // sanitize again in case of additions
      text = this._sanitizeWhitelist(text);
    } catch {}
    return text || '';
  }

  async generateReplyTextLLM(evt, roomId) {
    let recent = [];
    try {
      if (this.runtime?.getMemories && roomId) {
  const rows = await this.runtime.getMemories({ tableName: 'messages', roomId, count: 12 });
        const ordered = Array.isArray(rows) ? rows.slice().reverse() : [];
        recent = ordered.map((m) => ({ role: m.agentId && this.runtime && m.agentId === this.runtime.agentId ? 'agent' : 'user', text: String(m.content?.text || '').slice(0, 220) })).filter((x) => x.text);
      }
    } catch {}
    const prompt = this._buildReplyPrompt(evt, recent);
    const type = this._getLargeModelType();
    const { generateWithModelOrFallback } = require('./generation');
    const text = await generateWithModelOrFallback(
      this.runtime,
      type,
      prompt,
      { maxTokens: 192, temperature: 0.8 },
      (res) => this._extractTextFromModelResult(res),
      (s) => this._sanitizeWhitelist(s),
      () => this.pickReplyTextFor(evt)
    );
    return text || 'noted.';
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    // Avoid posting a generic scheduled note immediately after a pixel post
    if (!content) {
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
    logger.info(`[NOSTR] About to post: "${text}" (scheduled: ${!content})`);
    // Extra safety: if this is a scheduled post (no content provided), strip accidental pixel-like patterns
    if (!content) {
      try {
        // Remove coordinates like (23,17) and hex colors like #ff5500 to avoid "fake pixel" notes
        const originalText = text;
        text = text.replace(/\(\s*-?\d+\s*,\s*-?\d+\s*\)/g, '').replace(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g, '').replace(/\s+/g, ' ').trim();
        if (originalText !== text) {
          logger.info(`[NOSTR] Sanitized scheduled post: "${originalText}" -> "${text}"`);
        }
      } catch {}
    }
    const evtTemplate = buildTextNote(text);
    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
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
    } catch (err) { logger.error('[NOSTR] Post failed:', err?.message || err); return false; }
  }

  _getConversationIdFromEvent(evt) {
    try { if (nip10Parse) { const refs = nip10Parse(evt); if (refs?.root?.id) return refs.root.id; if (refs?.reply?.id) return refs.reply.id; } } catch {}
    return getConversationIdFromEvent(evt);
  }

  async _ensureNostrContext(userPubkey, usernameLike, conversationId) {
  const { ensureNostrContext } = require('./context');
  return ensureNostrContext(this.runtime, userPubkey, usernameLike, conversationId, { createUniqueUuid, ChannelType, logger });
  }

  async _createMemorySafe(memory, tableName = 'messages', maxRetries = 3) {
  const { createMemorySafe } = require('./context');
  return createMemorySafe(this.runtime, memory, tableName, maxRetries, logger);
  }

  async handleMention(evt) {
    try {
      if (!evt || !evt.id) return;
      if (this.pkHex && isSelfAuthor(evt, this.pkHex)) { logger.info('[NOSTR] Ignoring self-mention'); return; }
      if (this.handledEventIds.has(evt.id)) { logger.info(`[NOSTR] Skipping mention ${evt.id.slice(0, 8)} (in-memory dedup)`); return; }
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
      if (!this.replyEnabled) { logger.info('[NOSTR] Auto-reply disabled by config (NOSTR_REPLY_ENABLE=false)'); return; }
      if (!this.sk) { logger.info('[NOSTR] No private key available; listen-only mode, not replying'); return; }
      if (!this.pool) { logger.info('[NOSTR] No Nostr pool available; cannot send reply'); return; }
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
                const recent = await this.runtime.getMemories({ tableName: 'messages', roomId: capturedRoomId, count: 10 });
                const hasReply = recent.some((m) => m.content?.inReplyTo === capturedEventMemoryId || m.content?.inReplyTo === parentEvt.id);
                if (hasReply) { logger.info(`[NOSTR] Skipping scheduled reply for ${parentEvt.id.slice(0, 8)} (found existing reply)`); return; }
              } catch {}
              const lastNow = this.lastReplyByUser.get(pubkey) || 0; const now2 = Date.now();
              if (now2 - lastNow < this.replyThrottleSec * 1000) { logger.info(`[NOSTR] Still throttled for ${pubkey.slice(0, 8)}, skipping scheduled send`); return; }
              this.lastReplyByUser.set(pubkey, now2);
              const replyText = await this.generateReplyTextLLM(parentEvt, capturedRoomId);
              logger.info(`[NOSTR] Sending scheduled reply to ${parentEvt.id.slice(0, 8)} len=${replyText.length}`);
              const ok = await this.postReply(parentEvt, replyText);
              if (ok) {
                const linkId = createUniqueUuid(this.runtime, `${parentEvt.id}:reply:${now2}:scheduled`);
                await this._createMemorySafe({ id: linkId, entityId, agentId: this.runtime.agentId, roomId: capturedRoomId, content: { text: replyText, source: 'nostr', inReplyTo: capturedEventMemoryId, }, createdAt: now2, }, 'messages').catch(() => {});
              }
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
      const replyText = await this.generateReplyTextLLM(evt, roomId);
      logger.info(`[NOSTR] Sending reply to ${evt.id.slice(0, 8)} len=${replyText.length}`);
      const replyOk = await this.postReply(evt, replyText);
      if (replyOk) {
        logger.info(`[NOSTR] Reply sent to ${evt.id.slice(0, 8)}; storing reply link memory`);
        const replyMemory = { id: createUniqueUuid(runtime, `${evt.id}:reply:${now}`), entityId, agentId: runtime.agentId, roomId, content: { text: replyText, source: 'nostr', inReplyTo: eventMemoryId, }, createdAt: now, };
  await this._createMemorySafe(replyMemory, 'messages');
      }
    } catch (err) { logger.warn('[NOSTR] handleMention failed:', err?.message || err); }
  }

  pickReplyTextFor(evt) {
    const { pickReplyTextFor } = require('./replyText');
    return pickReplyTextFor(evt);
  }

  async postReply(parentEvtOrId, text, opts = {}) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      let rootId = null; let parentId = null; let parentAuthorPk = null;
      try {
        if (typeof parentEvtOrId === 'object' && parentEvtOrId && parentEvtOrId.id) {
          parentId = parentEvtOrId.id; parentAuthorPk = parentEvtOrId.pubkey || null;
          if (nip10Parse) { const refs = nip10Parse(parentEvtOrId); if (refs?.root?.id) rootId = refs.root.id; if (!rootId && refs?.reply?.id && refs.reply.id !== parentEvtOrId.id) rootId = refs.reply.id; }
        } else if (typeof parentEvtOrId === 'string') { parentId = parentEvtOrId; }
      } catch {}
      if (!parentId) return false;
      const parentForFactory = { id: parentId, pubkey: parentAuthorPk, refs: { rootId } };
      const extraPTags = (Array.isArray(opts.extraPTags) ? opts.extraPTags : []).filter(pk => pk && pk !== this.pkHex);
      const evtTemplate = buildReplyNote(parentForFactory, text, { extraPTags });
      if (!evtTemplate) return false;
      try {
        const eCount = evtTemplate.tags.filter(t => t?.[0] === 'e').length;
        const pCount = evtTemplate.tags.filter(t => t?.[0] === 'p').length;
        const expectPk = opts.expectMentionPk;
        const hasExpected = expectPk ? evtTemplate.tags.some(t => t?.[0] === 'p' && t?.[1] === expectPk) : undefined;
        logger.info(`[NOSTR] postReply tags: e=${eCount} p=${pCount} parent=${String(parentId).slice(0,8)} root=${rootId?String(rootId).slice(0,8):'-'}${expectPk?` mentionExpected=${hasExpected?'yes':'no'}`:''}`);
      } catch {}
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      const logId = typeof parentEvtOrId === 'object' && parentEvtOrId && parentEvtOrId.id ? parentEvtOrId.id : parentId || '';
      logger.info(`[NOSTR] Replied to ${String(logId).slice(0, 8)}… (${evtTemplate.content.length} chars)`);
      await this.saveInteractionMemory('reply', typeof parentEvtOrId === 'object' ? parentEvtOrId : { id: parentId }, { replied: true, }).catch(() => {});
      if (!opts.skipReaction && typeof parentEvtOrId === 'object') { this.postReaction(parentEvtOrId, '+').catch(() => {}); }
      return true;
    } catch (err) { logger.warn('[NOSTR] Reply failed:', err?.message || err); return false; }
  }

  async postReaction(parentEvt, symbol = '+') {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      if (this.pkHex && isSelfAuthor(parentEvt, this.pkHex)) { logger.debug('[NOSTR] Skipping reaction to self-authored event'); return false; }
      const evtTemplate = buildReaction(parentEvt, symbol);
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Reacted to ${parentEvt.id.slice(0, 8)} with "${evtTemplate.content}"`);
      return true;
    } catch (err) { logger.debug('[NOSTR] Reaction failed:', err?.message || err); return false; }
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

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.discoveryTimer) { clearTimeout(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close([]); } catch {} this.pool = null; }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) { for (const [, t] of this.pendingReplyTimers) { try { clearTimeout(t); } catch {} } this.pendingReplyTimers.clear(); }
    logger.info('[NOSTR] Service stopped');
  }
}

module.exports = { NostrService, ensureDeps };
