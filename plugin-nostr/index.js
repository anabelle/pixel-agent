// Minimal Nostr plugin (CJS) for elizaOS with dynamic ESM imports
let logger, createUniqueUuid, ChannelType, ModelType;

let SimplePool, nip19, finalizeEvent, getPublicKey;
let wsInjector; // optional injector from @nostr/tools
let nip10Parse; // thread parsing

// Extracted helpers
const {
  hexToBytesLocal,
  bytesToHexLocal,
  parseRelays,
  normalizeSeconds,
  pickRangeWithJitter,
} = require('./lib/utils');
const { _scoreEventForEngagement, _isQualityContent } = require('./lib/scoring');
const { buildPostPrompt, buildReplyPrompt, extractTextFromModelResult, sanitizeWhitelist } = require('./lib/text');
const { getConversationIdFromEvent, extractTopicsFromEvent, isSelfAuthor } = require('./lib/nostr');
const { getZapAmountMsats, getZapTargetEventId, generateThanksText } = require('./lib/zaps');

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import("@nostr/tools");
    SimplePool = tools.SimplePool;
    nip19 = tools.nip19;
    finalizeEvent = tools.finalizeEvent;
    getPublicKey = tools.getPublicKey;
  wsInjector = tools.setWebSocketConstructor || tools.useWebSocketImplementation;
  }
  if (!logger) {
    const core = await import("@elizaos/core");
    logger = core.logger;
    createUniqueUuid = core.createUniqueUuid;
    ChannelType = core.ChannelType;
    ModelType = core.ModelType ||
      core.ModelClass || { TEXT_SMALL: "TEXT_SMALL" };
  }
  // Provide WebSocket to nostr-tools (either via injector or global)
  const WebSocket = (await import("ws")).default || require("ws");
  // Prefer documented API from nostr-tools/pool
  try {
    const poolMod = await import("@nostr/tools/pool");
    if (typeof poolMod.useWebSocketImplementation === "function") {
      poolMod.useWebSocketImplementation(WebSocket);
    } else if (wsInjector) {
      wsInjector(WebSocket);
    }
  } catch {
    // Fallback to any injector on root
    if (wsInjector) {
      try { wsInjector(WebSocket); } catch {}
    }
  }
  if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
  }
  // Load nip10.parse for threading if available
  if (!nip10Parse) {
    try {
      const nip10 = await import("@nostr/tools/nip10");
      nip10Parse = typeof nip10.parse === "function" ? nip10.parse : undefined;
    } catch {}
  }
  // Increase default max listeners to avoid ping/pong warnings on many relays
  try {
    const eventsMod = require("events");
    const max = Number(process?.env?.NOSTR_MAX_WS_LISTENERS ?? 64);
    if (Number.isFinite(max) && max > 0) {
      if (typeof eventsMod.setMaxListeners === "function") {
        eventsMod.setMaxListeners(max);
      }
      if (
        eventsMod.EventEmitter &&
        typeof eventsMod.EventEmitter.defaultMaxListeners === "number"
      ) {
        eventsMod.EventEmitter.defaultMaxListeners = max;
      }
    }
  } catch {}
}

function parseSk(input) {
  if (!input) return null;
  try {
    if (input.startsWith("nsec1")) {
      const decoded = nip19.decode(input);
      if (decoded.type === "nsec") return decoded.data;
    }
  } catch { }
  const bytes = hexToBytesLocal(input);
  return bytes || null;
}

// Allow listening with only a public key (hex or npub1)
function parsePk(input) {
  if (!input) return null;
  try {
    if (typeof input === "string" && input.startsWith("npub1")) {
      const decoded = nip19.decode(input);
      if (decoded.type === "npub") return decoded.data; // hex string
    }
  } catch { }
  const bytes = hexToBytesLocal(input);
  if (bytes) return bytesToHexLocal(bytes);
  if (typeof input === "string" && /^[0-9a-fA-F]{64}$/.test(input)) return input.toLowerCase();
  return null;
}

// parseRelays now imported from utils

class NostrService {
  static serviceType = "nostr";
  capabilityDescription =
    "Nostr connectivity: post notes and subscribe to mentions";

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
    // Human-like initial delay before sending an auto-reply (jittered)
    this.replyInitialDelayMinMs = 800;
    this.replyInitialDelayMaxMs = 2500;
    this.handledEventIds = new Set();
    this.lastReplyByUser = new Map(); // pubkey -> timestamp ms
    this.pendingReplyTimers = new Map(); // pubkey -> Timeout
  this.zapCooldownByUser = new Map(); // pubkey -> last ts
    // Discovery
    this.discoveryEnabled = true;
    this.discoveryTimer = null;
    this.discoveryMinSec = 900; // 15m
    this.discoveryMaxSec = 1800; // 30m
    this.discoveryMaxReplies = 5;
    this.discoveryMaxFollows = 5;
  }

  static async start(runtime) {
    await ensureDeps();
    const svc = new NostrService(runtime);
    const relays = parseRelays(runtime.getSetting("NOSTR_RELAYS"));
    const sk = parseSk(runtime.getSetting("NOSTR_PRIVATE_KEY"));
  const pkEnv = parsePk(runtime.getSetting("NOSTR_PUBLIC_KEY"));
    const listenVal = runtime.getSetting("NOSTR_LISTEN_ENABLE");
    const postVal = runtime.getSetting("NOSTR_POST_ENABLE");
  const pingVal = runtime.getSetting("NOSTR_ENABLE_PING");
    const listenEnabled = String(listenVal ?? "true").toLowerCase() === "true";
    const postEnabled = String(postVal ?? "false").toLowerCase() === "true";
  const enablePing = String(pingVal ?? "true").toLowerCase() === "true";
  // normalizeSeconds imported from utils
    const minSec = normalizeSeconds(
      runtime.getSetting("NOSTR_POST_INTERVAL_MIN") ?? "3600",
      "NOSTR_POST_INTERVAL_MIN"
    );
    const maxSec = normalizeSeconds(
      runtime.getSetting("NOSTR_POST_INTERVAL_MAX") ?? "10800",
      "NOSTR_POST_INTERVAL_MAX"
    );
    const replyVal = runtime.getSetting("NOSTR_REPLY_ENABLE");
    const throttleVal = runtime.getSetting("NOSTR_REPLY_THROTTLE_SEC");
    // Thinking delay (ms) before first auto-reply send
    const thinkMinMsVal = runtime.getSetting(
      "NOSTR_REPLY_INITIAL_DELAY_MIN_MS"
    );
    const thinkMaxMsVal = runtime.getSetting(
      "NOSTR_REPLY_INITIAL_DELAY_MAX_MS"
    );
    // Discovery settings
    const discoveryVal = runtime.getSetting("NOSTR_DISCOVERY_ENABLE");
    const discoveryMin = normalizeSeconds(
      runtime.getSetting("NOSTR_DISCOVERY_INTERVAL_MIN") ?? "900",
      "NOSTR_DISCOVERY_INTERVAL_MIN"
    );
    const discoveryMax = normalizeSeconds(
      runtime.getSetting("NOSTR_DISCOVERY_INTERVAL_MAX") ?? "1800",
      "NOSTR_DISCOVERY_INTERVAL_MAX"
    );
    const discoveryMaxReplies = Number(
      runtime.getSetting("NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN") ?? "5"
    );
    const discoveryMaxFollows = Number(
      runtime.getSetting("NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN") ?? "5"
    );

    svc.relays = relays;
    svc.sk = sk;
    svc.replyEnabled = String(replyVal ?? "true").toLowerCase() === "true";
    // Normalize throttle seconds (coerce ms-like values)
    svc.replyThrottleSec = normalizeSeconds(
      throttleVal ?? "60",
      "NOSTR_REPLY_THROTTLE_SEC"
    );
    // Configure initial thinking delay
    const parseMs = (v, d) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : d;
    };
    svc.replyInitialDelayMinMs = parseMs(thinkMinMsVal, 800);
    svc.replyInitialDelayMaxMs = parseMs(thinkMaxMsVal, 2500);
    if (svc.replyInitialDelayMaxMs < svc.replyInitialDelayMinMs) {
      // swap if misconfigured
      const tmp = svc.replyInitialDelayMinMs;
      svc.replyInitialDelayMinMs = svc.replyInitialDelayMaxMs;
      svc.replyInitialDelayMaxMs = tmp;
    }
    svc.discoveryEnabled =
      String(discoveryVal ?? "true").toLowerCase() === "true";
    svc.discoveryMinSec = discoveryMin;
    svc.discoveryMaxSec = discoveryMax;
    svc.discoveryMaxReplies = discoveryMaxReplies;
    svc.discoveryMaxFollows = discoveryMaxFollows;

    // Log effective configuration to aid debugging
    logger.info(
      `[NOSTR] Config: postInterval=${minSec}-${maxSec}s, listen=${listenEnabled}, post=${postEnabled}, ` +
      `replyThrottle=${svc.replyThrottleSec}s, thinkDelay=${svc.replyInitialDelayMinMs}-${svc.replyInitialDelayMaxMs}ms, discovery=${svc.discoveryEnabled} ` +
      `interval=${svc.discoveryMinSec}-${svc.discoveryMaxSec}s maxReplies=${svc.discoveryMaxReplies} maxFollows=${svc.discoveryMaxFollows}`
    );

    if (!relays.length) {
      logger.warn("[NOSTR] No relays configured; service will be idle");
      return svc;
    }

  svc.pool = new SimplePool({ enablePing });

    if (sk) {
      const pk = getPublicKey(sk);
      svc.pkHex = typeof pk === "string" ? pk : Buffer.from(pk).toString("hex");
      logger.info(
        `[NOSTR] Ready with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`
      );
    } else if (pkEnv) {
      // Listen-only mode with public key
      svc.pkHex = pkEnv;
      logger.info(
        `[NOSTR] Ready (listen-only) with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`
      );
      logger.warn("[NOSTR] No private key configured; posting disabled");
    } else {
      logger.warn("[NOSTR] No key configured; listening and posting disabled");
    }

    if (listenEnabled && svc.pool && svc.pkHex) {
      try {
        svc.listenUnsub = svc.pool.subscribeMany(
          relays,
          [
            { kinds: [1], "#p": [svc.pkHex] },
            { kinds: [9735], authors: undefined, limit: 0, "#p": [svc.pkHex] },
          ],
          {
            onevent(evt) {
              logger.info(
                `[NOSTR] Mention from ${evt.pubkey}: ${evt.content.slice(
                  0,
                  140
                )}`
              );
              // Skip self-authored events to avoid feedback loops
              if (svc.pkHex && isSelfAuthor(evt, svc.pkHex)) {
                logger.debug('[NOSTR] Skipping self-authored event');
                return;
              }
              // Handle zaps (kind 9735)
              if (evt.kind === 9735) {
                svc
                  .handleZap(evt)
                  .catch((err) => logger.debug('[NOSTR] handleZap error:', err?.message || err));
                return;
              }
              svc
                .handleMention(evt)
                .catch((err) =>
                  logger.warn(
                    "[NOSTR] handleMention error:",
                    err?.message || err
                  )
                );
            },
            oneose() {
              logger.debug("[NOSTR] Mention subscription OSE");
            },
          }
        );
      } catch (err) {
        logger.warn(`[NOSTR] Subscribe failed: ${err?.message || err}`);
      }
    }

    if (postEnabled && sk) {
      svc.scheduleNextPost(minSec, maxSec);
    }

    if (svc.discoveryEnabled && sk) {
      svc.scheduleNextDiscovery();
    }

    logger.info(
      `[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled} discovery=${svc.discoveryEnabled}`
    );
    return svc;
  }

  scheduleNextPost(minSec, maxSec) {
    const jitter = pickRangeWithJitter(minSec, maxSec);
    if (this.postTimer) clearTimeout(this.postTimer);
    this.postTimer = setTimeout(
      () =>
        this.postOnce().finally(() => this.scheduleNextPost(minSec, maxSec)),
      jitter * 1000
    );
    logger.info(`[NOSTR] Next post in ~${jitter}s`);
  }

  scheduleNextDiscovery() {
    const jitter =
      this.discoveryMinSec +
      Math.floor(
        Math.random() * Math.max(1, this.discoveryMaxSec - this.discoveryMinSec)
      );
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    this.discoveryTimer = setTimeout(
      () => this.discoverOnce().finally(() => this.scheduleNextDiscovery()),
      jitter * 1000
    );
    logger.info(`[NOSTR] Next discovery in ~${jitter}s`);
  }

  _pickDiscoveryTopics() {
    // Curated high-quality topic sets for better discovery
    const highQualityTopics = [
      // Art & Creative (Pixel's core interest)
      ["pixel art", "8-bit art", "generative art", "creative coding", "collaborative canvas"],
      ["ASCII art", "glitch art", "demoscene", "retrocomputing", "digital art"],
      ["p5.js", "processing", "touchdesigner", "shader toy", "glsl shaders"],
      ["art collaboration", "creative projects", "interactive art", "code art"],
      
      // Bitcoin & Lightning (Value4Value culture)
      ["lightning network", "value4value", "zaps", "sats", "bitcoin art"],
      ["self custody", "bitcoin ordinals", "on-chain art", "micropayments"],
      ["open source wallets", "LNURL", "BOLT12", "mempool fees"],
      
      // Nostr Culture (Platform-specific quality)
      ["nostr dev", "relays", "NIP-05", "NIP-57", "decentralized social"],
      ["censorship resistant", "nostr protocol", "#artstr", "#plebchain"],
      ["nostr clients", "primal", "damus", "iris", "nostrudel"],
      
      // Tech & Development (Quality developers)
      ["self-hosted", "homelab", "Docker", "Node.js", "TypeScript"],
      ["open source", "FOSS", "indie web", "small web", "webring"],
      ["privacy", "encryption", "cypherpunk", "digital sovereignty"],
      
      // Creative Tech Intersection
      ["AI art", "machine learning", "creative AI", "autonomous agents"],
      ["maker culture", "creative commons", "collaborative tools"],
      ["digital minimalism", "constraint programming", "creative constraints"]
    ];
    
    // Weight topics by relevance to Pixel's interests
    const topicWeights = {
      "pixel art": 3.0, "collaborative canvas": 2.8, "creative coding": 2.5,
      "lightning network": 2.3, "value4value": 2.2, "zaps": 2.0,
      "nostr dev": 1.8, "#artstr": 1.7, "self-hosted": 1.5,
      "AI art": 1.4, "open source": 1.3, "creative AI": 1.2
    };
    
    // Pick 1-2 high-quality topic sets instead of random individual topics
    const selectedSets = [];
    const numSets = Math.random() < 0.3 ? 2 : 1; // Usually 1 set, sometimes 2
    
    while (selectedSets.length < numSets && selectedSets.length < highQualityTopics.length) {
      const setIndex = Math.floor(Math.random() * highQualityTopics.length);
      if (!selectedSets.some(s => s === highQualityTopics[setIndex])) {
        selectedSets.push(highQualityTopics[setIndex]);
      }
    }
    
    // Flatten and apply weights
    const weightedTopics = [];
    selectedSets.flat().forEach(topic => {
      const weight = topicWeights[topic] || 1.0;
      // Add topic multiple times based on weight
      for (let i = 0; i < Math.ceil(weight); i++) {
        weightedTopics.push(topic);
      }
    });
    
    // Select 2-4 topics from weighted pool
    const finalTopics = new Set();
    const targetCount = Math.floor(Math.random() * 3) + 2; // 2-4 topics
    
    while (finalTopics.size < targetCount && finalTopics.size < weightedTopics.length) {
      const topic = weightedTopics[Math.floor(Math.random() * weightedTopics.length)];
      finalTopics.add(topic);
    }
    
    return Array.from(finalTopics);
  }

  async _listEventsByTopic(topic) {
    if (!this.pool) return [];
    const now = Math.floor(Date.now() / 1000);
    
    // Use different search strategies based on topic type
    const isArtTopic = /art|pixel|creative|canvas|design|visual/.test(topic.toLowerCase());
    const isTechTopic = /dev|code|programming|node|typescript|docker/.test(topic.toLowerCase());
    const isBitcoinTopic = /bitcoin|lightning|sats|zap|value4value/.test(topic.toLowerCase());
    const isNostrTopic = /nostr|relay|nip|damus|primal/.test(topic.toLowerCase());
    
    // Strategic relay selection based on content type
    let targetRelays = this.relays;
    if (isArtTopic) {
      // Art-focused relays tend to have more creative content
      targetRelays = [
        "wss://relay.damus.io", // General high-quality
        "wss://nos.lol", // Creative community
        "wss://relay.snort.social", // Good moderation
        ...this.relays
      ].slice(0, 4); // Limit to avoid too many connections
    } else if (isTechTopic) {
      // Tech-focused relays
      targetRelays = [
        "wss://relay.damus.io",
        "wss://relay.nostr.band", // Good for developers
        "wss://relay.snort.social",
        ...this.relays
      ].slice(0, 4);
    }
    
    const filters = [];
    
    // Strategy 1: NIP-50 search with topic (if supported)
    filters.push({
      kinds: [1],
      search: topic,
      limit: 20,
      since: now - 4 * 3600 // Last 4 hours for fresh content
    });
    
    // Strategy 2: Hashtag-based search for social topics
    if (isArtTopic || isBitcoinTopic || isNostrTopic) {
      const hashtag = topic.startsWith('#') ? topic.slice(1) : topic.replace(/\s+/g, '');
      filters.push({
        kinds: [1],
        '#t': [hashtag.toLowerCase()],
        limit: 15,
        since: now - 6 * 3600
      });
    }
    
    // Strategy 3: Recent quality posts window (broader net)
    filters.push({
      kinds: [1],
      since: now - 3 * 3600, // Last 3 hours
      limit: 100
    });
    
    // Strategy 4: Look for thread roots and replies for context
    filters.push({
      kinds: [1],
      since: now - 8 * 3600, // Last 8 hours
      limit: 50
    });
    
    try {
      // Execute all search strategies in parallel with targeted relays
      const searchResults = await Promise.all(
        filters.map(filter => 
          this._list(targetRelays, [filter]).catch(() => [])
        )
      );
      
      // Merge and deduplicate results
      const allEvents = searchResults.flat().filter(Boolean);
      const uniqueEvents = new Map();
      
      allEvents.forEach(event => {
        if (event && event.id && !uniqueEvents.has(event.id)) {
          uniqueEvents.set(event.id, event);
        }
      });
      
      const events = Array.from(uniqueEvents.values());
      
      // Enhanced content relevance filtering
      const lc = topic.toLowerCase();
      const topicWords = lc.split(/\s+/).filter(w => w.length > 2);
      
      const relevant = events.filter(event => {
        const content = (event?.content || "").toLowerCase();
        const tags = Array.isArray(event.tags) ? event.tags.flat().join(' ').toLowerCase() : '';
        const fullText = content + ' ' + tags;
        
        // Must contain topic or related words
        const hasTopicMatch = topicWords.some(word => 
          fullText.includes(word) || 
          content.includes(lc) ||
          this._isSemanticMatch(content, topic)
        );
        
        if (!hasTopicMatch) return false;
        
        // Quality filters
        return this._isQualityContent(event, topic);
      });
      
      logger.info(`[NOSTR] Discovery "${topic}": found ${events.length} events, ${relevant.length} relevant`);
      return relevant;
      
    } catch (err) {
      logger.warn("[NOSTR] Discovery list failed:", err?.message || err);
      return [];
    }
  }

  _scoreEventForEngagement(evt) {
    return _scoreEventForEngagement(evt);
  }

  _isSemanticMatch(content, topic) {
    // Enhanced semantic matching for better topic relevance
    const semanticMappings = {
      'pixel art': ['8-bit', 'sprite', 'retro', 'low-res', 'pixelated', 'bitmap'],
      'lightning network': ['LN', 'sats', 'zap', 'invoice', 'channel', 'payment'],
      'creative coding': ['generative', 'algorithm', 'procedural', 'interactive', 'visualization'],
      'collaborative canvas': ['drawing', 'paint', 'sketch', 'artwork', 'contribute', 'place'],
      'value4value': ['v4v', 'creator', 'support', 'donation', 'tip', 'creator economy'],
      'nostr dev': ['relay', 'NIP', 'protocol', 'client', 'pubkey', 'event'],
      'self-hosted': ['VPS', 'server', 'homelab', 'docker', 'self-custody', 'sovereignty'],
      'bitcoin art': ['ordinals', 'inscription', 'on-chain', 'sat', 'btc art', 'digital collectible']
    };
    
    const relatedTerms = semanticMappings[topic.toLowerCase()] || [];
    return relatedTerms.some(term => content.toLowerCase().includes(term.toLowerCase()));
  }

  _isQualityContent(event, topic) {
    return _isQualityContent(event, topic);
  }

  async _filterByAuthorQuality(events) {
    if (!events.length) return [];
    
    // Group events by author to analyze patterns
    const authorEvents = new Map();
    events.forEach(event => {
      if (!event.pubkey) return;
      if (!authorEvents.has(event.pubkey)) {
        authorEvents.set(event.pubkey, []);
      }
      authorEvents.get(event.pubkey).push(event);
    });
    
    const qualityAuthors = new Set();
    
    // Analyze each author for bot-like behavior
    for (const [pubkey, authorEventList] of authorEvents) {
      if (this._isQualityAuthor(authorEventList)) {
        qualityAuthors.add(pubkey);
      }
    }
    
    // Return only events from quality authors
    return events.filter(event => qualityAuthors.has(event.pubkey));
  }

  _isQualityAuthor(authorEvents) {
    if (!authorEvents.length) return false;
    
    // Single post authors are usually okay (unless obvious spam)
    if (authorEvents.length === 1) {
      const event = authorEvents[0];
      return this._isQualityContent(event, 'general');
    }
    
    // Multi-post analysis for bot detection
    const contents = authorEvents.map(e => e.content || '').filter(Boolean);
    if (contents.length < 2) return true; // Not enough data
    
    // Check for repetitive content (bot indicator)
    const uniqueContents = new Set(contents);
    const similarityRatio = uniqueContents.size / contents.length;
    if (similarityRatio < 0.7) return false; // Too repetitive
    
    // Check posting frequency (bot indicator)
    const timestamps = authorEvents.map(e => e.created_at || 0).sort();
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i-1]);
    }
    
    // Very regular posting intervals suggest bots
    if (intervals.length > 2) {
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, interval) => 
        sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const coefficient = stdDev / avgInterval;
      
      // Low variance in posting times = likely bot
      if (coefficient < 0.3 && avgInterval < 3600) return false; // Too regular, too frequent
    }
    
    // Check content variety
    const allWords = contents.join(' ').toLowerCase().split(/\s+/);
    const uniqueWords = new Set(allWords);
    const vocabularyRichness = uniqueWords.size / allWords.length;
    
    if (vocabularyRichness < 0.4) return false; // Limited vocabulary
    
    return true; // Passed all bot detection tests
  }

  _extractTopicsFromEvent(event) {
  return extractTopicsFromEvent(event);
  }

  _selectFollowCandidates(scoredEvents, currentContacts) {
    // Score authors based on their best content and interaction patterns
    const authorScores = new Map();
    
    scoredEvents.forEach(({ evt, score }) => {
      if (!evt.pubkey || currentContacts.has(evt.pubkey)) return;
      if (evt.pubkey === this.pkHex) return; // Don't follow ourselves
      
      const currentScore = authorScores.get(evt.pubkey) || 0;
      authorScores.set(evt.pubkey, Math.max(currentScore, score));
    });
    
    // Convert to array and sort by score
    const candidates = Array.from(authorScores.entries())
      .map(([pubkey, score]) => ({ pubkey, score }))
      .sort((a, b) => b.score - a.score);
    
    // Apply additional filters for follow-worthiness
    const qualityCandidates = candidates.filter(({ pubkey, score }) => {
      // Minimum score threshold for following
      if (score < 0.4) return false;
      
      // Don't follow if we've recently interacted (gives them a chance to follow back first)
      const lastReply = this.lastReplyByUser.get(pubkey) || 0;
      const timeSinceReply = Date.now() - lastReply;
      if (timeSinceReply < 2 * 60 * 60 * 1000) return false; // 2 hours
      
      return true;
    });
    
    return qualityCandidates.map(c => c.pubkey);
  }

  async _loadCurrentContacts() {
    if (!this.pool || !this.pkHex) return new Set();
    try {
      const events = await this._list(this.relays, [
        { kinds: [3], authors: [this.pkHex], limit: 2 },
      ]);
      if (!events || !events.length) return new Set();
      const latest = events.sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0)
      )[0];
      const pTags = Array.isArray(latest.tags)
        ? latest.tags.filter((t) => t[0] === "p")
        : [];
      const set = new Set(pTags.map((t) => t[1]).filter(Boolean));
      return set;
    } catch (err) {
      logger.warn("[NOSTR] Failed to load contacts:", err?.message || err);
      return new Set();
    }
  }

  // Unified list wrapper with subscribe-based fallback
  async _list(relays, filters) {
    if (!this.pool) return [];
    const fn = this.pool.list;
    if (typeof fn === "function") {
      try {
        return await fn.call(this.pool, relays, filters);
      } catch {
        return [];
      }
    }
    // Fallback: emulate list via subscribeMany for a short window
    const filter = Array.isArray(filters) && filters.length ? filters[0] : {};
    return await new Promise((resolve) => {
      const events = [];
      const seen = new Set();
      let done = false;
      let settleTimer = null;
      let safetyTimer = null;
      let unsub = null;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          if (unsub) unsub();
        } catch { }
        if (settleTimer) clearTimeout(settleTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        resolve(events);
      };
      try {
        unsub = this.pool.subscribeMany(relays, [filter], {
          onevent: (evt) => {
            if (evt && evt.id && !seen.has(evt.id)) {
              seen.add(evt.id);
              events.push(evt);
            }
          },
          oneose: () => {
            // Allow a brief settle time for straggler events
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(finish, 200);
          },
        });
        // Safety timeout in case relays misbehave
        safetyTimer = setTimeout(finish, 2500);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async _publishContacts(newSet) {
    if (!this.pool || !this.sk) return false;
    try {
      const tags = [];
      for (const pk of newSet) {
        tags.push(["p", pk]);
      }
      const evtTemplate = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify({}),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(
        `[NOSTR] Published contacts list with ${newSet.size} follows`
      );
      return true;
    } catch (err) {
      logger.warn("[NOSTR] Failed to publish contacts:", err?.message || err);
      return false;
    }
  }

  async discoverOnce() {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    // Honor global reply toggle for discovery-generated replies
    const canReply = !!this.replyEnabled;
    const topics = this._pickDiscoveryTopics();
    if (!topics.length) return false;
    
    logger.info(`[NOSTR] Discovery run: topics=${topics.join(", ")}`);
    
    // Gather candidate events across topics with enhanced filtering
    const buckets = await Promise.all(
      topics.map((t) => this._listEventsByTopic(t))
    );
    const all = buckets.flat();
    
    // Pre-filter for author quality (avoid known bots/spam accounts)
    const qualityEvents = await this._filterByAuthorQuality(all);
    
    // Score and sort events
    const scored = qualityEvents
      .map((e) => ({ evt: e, score: this._scoreEventForEngagement(e) }))
      .filter(({ score }) => score > 0.2) // Minimum quality threshold
      .sort((a, b) => b.score - a.score);

    logger.info(`[NOSTR] Discovery: ${all.length} total -> ${qualityEvents.length} quality -> ${scored.length} scored events`);

    // Enhanced reply selection strategy
    let replies = 0;
    const usedAuthors = new Set();
    const usedTopics = new Set();
    
    for (const { evt, score } of scored) {
      if (replies >= this.discoveryMaxReplies) break;
      if (!evt || !evt.id || !evt.pubkey) continue;
      if (this.handledEventIds.has(evt.id)) continue;
      
      // Avoid same author spam this cycle
      if (usedAuthors.has(evt.pubkey)) continue;
      
      // Self-avoid: don't reply to our own notes
      if (evt.pubkey === this.pkHex) continue;
      
      // Respect global reply toggle
      if (!canReply) continue;
      
      // Enhanced cooldown check with per-author tracking
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      const cooldownMs = this.replyThrottleSec * 1000;
      
      if (now - last < cooldownMs) {
        logger.debug(
          `[NOSTR] Discovery skipping ${evt.pubkey.slice(0, 8)} due to cooldown (${Math.round(
            (cooldownMs - (now - last)) / 1000
          )}s left)`
        );
        continue;
      }
      
      // Topic diversity - avoid replying to too many posts about the same topic
      const eventTopics = this._extractTopicsFromEvent(evt);
      const hasUsedTopic = eventTopics.some(topic => usedTopics.has(topic));
      if (hasUsedTopic && usedTopics.size > 0 && Math.random() < 0.7) {
        continue; // 70% chance to skip if topic already used
      }
      
      // Quality gate - higher score events get priority
      const qualityThreshold = Math.max(0.3, 0.8 - (replies * 0.1)); // Lower bar as we find fewer
      if (score < qualityThreshold) continue;
      
      try {
        // Build conversation id from event
        const convId = this._getConversationIdFromEvent(evt);
        const { roomId } = await this._ensureNostrContext(
          evt.pubkey,
          undefined,
          convId
        );
        
        // Generate contextual reply
        const text = await this.generateReplyTextLLM(evt, roomId);
        const ok = await this.postReply(evt, text);
        
        if (ok) {
          this.handledEventIds.add(evt.id);
          usedAuthors.add(evt.pubkey);
          this.lastReplyByUser.set(evt.pubkey, Date.now());
          
          // Track used topics for diversity
          eventTopics.forEach(topic => usedTopics.add(topic));
          
          replies++;
          logger.info(`[NOSTR] Discovery reply ${replies}/${this.discoveryMaxReplies} to ${evt.pubkey.slice(0, 8)} (score: ${score.toFixed(2)})`);
        }
      } catch (err) {
        logger.debug("[NOSTR] Discovery reply error:", err?.message || err);
      }
    }

    // Enhanced follow strategy - prioritize quality content creators
    try {
      const current = await this._loadCurrentContacts();
      const followCandidates = this._selectFollowCandidates(scored, current);
      
      if (followCandidates.length > 0) {
        const toAdd = followCandidates.slice(0, this.discoveryMaxFollows);
        const newSet = new Set([...current, ...toAdd]);
        await this._publishContacts(newSet);
        logger.info(`[NOSTR] Discovery: following ${toAdd.length} new accounts`);
      }
    } catch (err) {
      logger.debug("[NOSTR] Discovery follow error:", err?.message || err);
    }

    logger.info(`[NOSTR] Discovery run complete: replies=${replies}, topics=${topics.join(',')}`);
    return true;
  }

  pickPostText() {
    const examples = this.runtime.character?.postExamples;
    if (Array.isArray(examples) && examples.length) {
      const pool = examples.filter((e) => typeof e === "string");
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  // --- LLM-driven generation helpers ---
  _getSmallModelType() {
    // Prefer TEXT_SMALL; legacy fallbacks included
    return (
      (ModelType &&
        (ModelType.TEXT_SMALL || ModelType.SMALL || ModelType.LARGE)) ||
      "TEXT_SMALL"
    );
  }

  _getLargeModelType() {
    // Prefer TEXT_LARGE; include sensible fallbacks
    return (
      (ModelType &&
        (ModelType.TEXT_LARGE ||
          ModelType.LARGE ||
          ModelType.MEDIUM ||
          ModelType.TEXT_SMALL)) ||
      "TEXT_LARGE"
    );
  }

  _buildPostPrompt() {
  return buildPostPrompt(this.runtime.character);
  }

  _buildReplyPrompt(evt, recentMessages) {
  return buildReplyPrompt(this.runtime.character, evt, recentMessages);
  }

  _extractTextFromModelResult(result) {
  try { return extractTextFromModelResult(result); }
  catch { return ""; }
  }

  _sanitizeWhitelist(text) {
  return sanitizeWhitelist(text);
  }

  async generatePostTextLLM() {
    const prompt = this._buildPostPrompt();
    const type = this._getLargeModelType();
    try {
      if (!this.runtime?.useModel) throw new Error("useModel missing");
      const res = await this.runtime.useModel(type, {
        prompt,
        maxTokens: 256,
        temperature: 0.9,
      });
      const text = this._sanitizeWhitelist(
        this._extractTextFromModelResult(res)
      );
      return text || null;
    } catch (err) {
      logger?.warn?.(
        "[NOSTR] LLM post generation failed, falling back to examples:",
        err?.message || err
      );
      return this.pickPostText();
    }
  }

  async generateReplyTextLLM(evt, roomId) {
    // Collect recent messages from this room for richer context
    let recent = [];
    try {
      if (this.runtime?.getMemories && roomId) {
        const rows = await this.runtime.getMemories({
          tableName: "messages",
          roomId,
          count: 12,
        });
        // Format as role/text pairs, newest last
        const ordered = Array.isArray(rows) ? rows.slice().reverse() : [];
        recent = ordered
          .map((m) => ({
            role:
              m.agentId && this.runtime && m.agentId === this.runtime.agentId
                ? "agent"
                : "user",
            text: String(m.content?.text || "").slice(0, 220),
          }))
          .filter((x) => x.text);
      }
    } catch { }

    const prompt = this._buildReplyPrompt(evt, recent);
    const type = this._getLargeModelType();
    try {
      if (!this.runtime?.useModel) throw new Error("useModel missing");
      const res = await this.runtime.useModel(type, {
        prompt,
        maxTokens: 192,
        temperature: 0.8,
      });
      const text = this._sanitizeWhitelist(
        this._extractTextFromModelResult(res)
      );
      // Ensure not empty
      return text || "noted.";
    } catch (err) {
      logger?.warn?.(
        "[NOSTR] LLM reply generation failed, falling back to heuristic:",
        err?.message || err
      );
      return this.pickReplyTextFor(evt);
    }
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    let text = content?.trim?.();
    if (!text) {
      text = await this.generatePostTextLLM();
      if (!text) text = this.pickPostText();
    }
    text = text || "hello, nostr";
    const evtTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: text,
    };
    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
      // Best-effort memory of the post for future context
      try {
        const runtime = this.runtime;
        const id = createUniqueUuid(
          runtime,
          `nostr:post:${Date.now()}:${Math.random()}`
        );
        const roomId = createUniqueUuid(runtime, "nostr:posts");
        const entityId = createUniqueUuid(runtime, this.pkHex || "nostr");
        await this._createMemorySafe(
          {
            id,
            entityId,
            agentId: runtime.agentId,
            roomId,
            content: {
              text,
              source: "nostr",
              channelType: ChannelType ? ChannelType.FEED : undefined,
            },
            createdAt: Date.now(),
          },
          "messages"
        );
      } catch { }
      return true;
    } catch (err) {
      logger.error("[NOSTR] Post failed:", err?.message || err);
      return false;
    }
  }
  // --- Helpers inspired by @elizaos/plugin-twitter ---
  _getConversationIdFromEvent(evt) {
    try {
      if (nip10Parse) {
        const refs = nip10Parse(evt);
        if (refs?.root?.id) return refs.root.id;
        if (refs?.reply?.id) return refs.reply.id;
      }
    } catch {}
    return getConversationIdFromEvent(evt);
  }

  async _ensureNostrContext(userPubkey, usernameLike, conversationId) {
    const runtime = this.runtime;
    const worldId = createUniqueUuid(runtime, userPubkey);
    const roomId = createUniqueUuid(runtime, conversationId);
    const entityId = createUniqueUuid(runtime, userPubkey);
    // Best effort creations
    logger.info(
      `[NOSTR] Ensuring context world/room/connection for pubkey=${userPubkey.slice(
        0,
        8
      )} conv=${conversationId.slice(0, 8)}`
    );
    await runtime
      .ensureWorldExists({
        id: worldId,
        name: `${usernameLike || userPubkey.slice(0, 8)}'s Nostr`,
        agentId: runtime.agentId,
        serverId: userPubkey,
        metadata: {
          ownership: { ownerId: userPubkey },
          nostr: { pubkey: userPubkey },
        },
      })
      .catch(() => { });
    await runtime
      .ensureRoomExists({
        id: roomId,
        name: `Nostr thread ${conversationId.slice(0, 8)}`,
        source: "nostr",
        type: ChannelType ? ChannelType.FEED : undefined,
        channelId: conversationId,
        serverId: userPubkey,
        worldId,
      })
      .catch(() => { });
    await runtime
      .ensureConnection({
        entityId,
        roomId,
        userName: usernameLike || userPubkey,
        name: usernameLike || userPubkey,
        source: "nostr",
        type: ChannelType ? ChannelType.FEED : undefined,
        worldId,
      })
      .catch(() => { });
    logger.info(
      `[NOSTR] Context ensured world=${worldId} room=${roomId} entity=${entityId}`
    );
    return { worldId, roomId, entityId };
  }

  async _createMemorySafe(memory, tableName = "messages", maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.info(
          `[NOSTR] Creating memory id=${memory.id} room=${memory.roomId
          } attempt=${attempt + 1}/${maxRetries}`
        );
        await this.runtime.createMemory(memory, tableName);
        logger.info(`[NOSTR] Memory created id=${memory.id}`);
        return true;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err || "");
        if (msg.includes("duplicate") || msg.includes("constraint")) {
          logger.info("[NOSTR] Memory already exists, skipping");
          return true;
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 250));
      }
    }
    logger.warn(
      "[NOSTR] Failed to persist memory:",
      lastErr?.message || lastErr
    );
    return false;
  }

  async handleMention(evt) {
    try {
      if (!evt || !evt.id) return;
      // Skip self-authored mentions
      if (this.pkHex && isSelfAuthor(evt, this.pkHex)) {
        logger.info('[NOSTR] Ignoring self-mention');
        return;
      }
      // In-memory dedup for this session
      if (this.handledEventIds.has(evt.id)) {
        logger.info(
          `[NOSTR] Skipping mention ${evt.id.slice(0, 8)} (in-memory dedup)`
        );
        return;
      }
      this.handledEventIds.add(evt.id);

      const runtime = this.runtime;
      const eventMemoryId = createUniqueUuid(runtime, evt.id);
      const conversationId = this._getConversationIdFromEvent(evt);
      const { roomId, entityId } = await this._ensureNostrContext(
        evt.pubkey,
        undefined,
        conversationId
      );

      // Persistent dedup: don't re-save memory, but still allow replying if we haven't replied before
      let alreadySaved = false;
      try {
        const existing = await runtime.getMemoryById(eventMemoryId);
        if (existing) {
          alreadySaved = true;
          logger.info(
            `[NOSTR] Mention ${evt.id.slice(0, 8)} already in memory (persistent dedup); continuing to reply checks`
          );
        }
      } catch { }

      const createdAtMs = evt.created_at ? evt.created_at * 1000 : Date.now();
      const memory = {
        id: eventMemoryId,
        entityId,
        agentId: runtime.agentId,
        roomId,
        content: {
          text: evt.content || "",
          source: "nostr",
          event: { id: evt.id, pubkey: evt.pubkey },
        },
        createdAt: createdAtMs,
      };
      if (!alreadySaved) {
        logger.info(`[NOSTR] Saving mention as memory id=${eventMemoryId}`);
        await this._createMemorySafe(memory, "messages");
      }

      // Check if we've already replied in this room (recent history)
      try {
        const recent = await runtime.getMemories({
          tableName: "messages",
          roomId,
          count: 10,
        });
        const hasReply = recent.some(
          (m) =>
            m.content?.inReplyTo === eventMemoryId ||
            m.content?.inReplyTo === evt.id
        );
        if (hasReply) {
          logger.info(
            `[NOSTR] Skipping auto-reply for ${evt.id.slice(
              0,
              8
            )} (found existing reply)`
          );
          return;
        }
      } catch { }

      // Auto-reply if enabled
      if (!this.replyEnabled) {
        logger.info("[NOSTR] Auto-reply disabled by config (NOSTR_REPLY_ENABLE=false)");
        return;
      }
      if (!this.sk) {
        logger.info("[NOSTR] No private key available; listen-only mode, not replying");
        return;
      }
      if (!this.pool) {
        logger.info("[NOSTR] No Nostr pool available; cannot send reply");
        return;
      }
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.replyThrottleSec * 1000) {
        const waitMs = this.replyThrottleSec * 1000 - (now - last) + 250;
        const existing = this.pendingReplyTimers.get(evt.pubkey);
        if (!existing) {
          logger.info(
            `[NOSTR] Throttling reply to ${evt.pubkey.slice(0, 8)}; scheduling in ~${Math.ceil(
              waitMs / 1000
            )}s`
          );
          // Capture needed values for delayed send
          const pubkey = evt.pubkey;
          const parentEvt = { ...evt };
          const capturedRoomId = roomId;
          const capturedEventMemoryId = eventMemoryId;
          const timer = setTimeout(async () => {
            this.pendingReplyTimers.delete(pubkey);
            try {
              logger.info(
                `[NOSTR] Scheduled reply timer fired for ${parentEvt.id.slice(0, 8)}`
              );
              // If we already replied in this room since, skip
              try {
                const recent = await this.runtime.getMemories({
                  tableName: "messages",
                  roomId: capturedRoomId,
                  count: 10,
                });
                const hasReply = recent.some(
                  (m) =>
                    m.content?.inReplyTo === capturedEventMemoryId ||
                    m.content?.inReplyTo === parentEvt.id
                );
                if (hasReply) {
                  logger.info(
                    `[NOSTR] Skipping scheduled reply for ${parentEvt.id.slice(
                      0,
                      8
                    )} (found existing reply)`
                  );
                  return;
                }
              } catch { }
              // Re-check throttle window
              const lastNow = this.lastReplyByUser.get(pubkey) || 0;
              const now2 = Date.now();
              if (now2 - lastNow < this.replyThrottleSec * 1000) {
                logger.info(
                  `[NOSTR] Still throttled for ${pubkey.slice(0, 8)}, skipping scheduled send`
                );
                return;
              }
              this.lastReplyByUser.set(pubkey, now2);
              const replyText = await this.generateReplyTextLLM(
                parentEvt,
                capturedRoomId
              );
              logger.info(
                `[NOSTR] Sending scheduled reply to ${parentEvt.id.slice(
                  0,
                  8
                )} len=${replyText.length}`
              );
              const ok = await this.postReply(parentEvt, replyText);
              if (ok) {
                // Persist link memory best-effort
                const linkId = createUniqueUuid(
                  this.runtime,
                  `${parentEvt.id}:reply:${now2}:scheduled`
                );
                await this._createMemorySafe(
                  {
                    id: linkId,
                    entityId,
                    agentId: this.runtime.agentId,
                    roomId: capturedRoomId,
                    content: {
                      text: replyText,
                      source: "nostr",
                      inReplyTo: capturedEventMemoryId,
                    },
                    createdAt: now2,
                  },
                  "messages"
                ).catch(() => { });
              }
            } catch (e) {
              logger.warn(
                "[NOSTR] Scheduled reply failed:",
                e?.message || e
              );
            }
          }, waitMs);
          this.pendingReplyTimers.set(evt.pubkey, timer);
        } else {
          logger.debug(
            `[NOSTR] Reply already scheduled for ${evt.pubkey.slice(0, 8)}`
          );
        }
        return;
      }
      this.lastReplyByUser.set(evt.pubkey, now);
      // Add small human-like thinking delay with jitter for realism
      const minMs = Math.max(0, Number(this.replyInitialDelayMinMs) || 0);
      const maxMs = Math.max(minMs, Number(this.replyInitialDelayMaxMs) || minMs);
      const delayMs = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs + 1));
      if (delayMs > 0) {
        logger.info(`[NOSTR] Preparing reply; thinking for ~${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      else {
        logger.info(`[NOSTR] Preparing immediate reply (no delay)`);
      }
      const replyText = await this.generateReplyTextLLM(evt, roomId);
      logger.info(
        `[NOSTR] Sending reply to ${evt.id.slice(0, 8)} len=${replyText.length}`
      );
      const replyOk = await this.postReply(evt, replyText);
      if (replyOk) {
        logger.info(
          `[NOSTR] Reply sent to ${evt.id.slice(
            0,
            8
          )}; storing reply link memory`
        );
        // Persist reply memory (best-effort)
        // We don't know the reply event id synchronously; skip storing reply id, but store a linking memory
        const replyMemory = {
          id: createUniqueUuid(runtime, `${evt.id}:reply:${now}`),
          entityId,
          agentId: runtime.agentId,
          roomId,
          content: {
            text: replyText,
            source: "nostr",
            inReplyTo: eventMemoryId,
          },
          createdAt: now,
        };
        await this._createMemorySafe(replyMemory, "messages");
      }
    } catch (err) {
      logger.warn("[NOSTR] handleMention failed:", err?.message || err);
    }
  }

  pickReplyTextFor(evt) {
    const baseChoices = [
      "noted.",
      "seen.",
      "alive.",
      "breathing pixels.",
      "gm.",
      "ping received.",
    ];
    const content = (evt?.content || "").trim();
    if (!content)
      return baseChoices[Math.floor(Math.random() * baseChoices.length)];
    if (content.length < 10) return "yo.";
    if (content.includes("?")) return "hmm.";
    return baseChoices[Math.floor(Math.random() * baseChoices.length)];
  }

  async postReply(parentEvtOrId, text, opts = {}) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      // Threading via NIP-10 if available
      let rootId = null;
      let parentId = null;
      let parentAuthorPk = null;
      try {
        if (typeof parentEvtOrId === "object" && parentEvtOrId && parentEvtOrId.id) {
          parentId = parentEvtOrId.id;
          parentAuthorPk = parentEvtOrId.pubkey || null;
          if (nip10Parse) {
            const refs = nip10Parse(parentEvtOrId);
            if (refs?.root?.id) rootId = refs.root.id;
            if (!rootId && refs?.reply?.id && refs.reply.id !== parentEvtOrId.id) rootId = refs.reply.id;
          }
        } else if (typeof parentEvtOrId === "string") {
          parentId = parentEvtOrId;
        }
      } catch {}
      // Add reply tag
      if (!parentId) return false;
      tags.push(["e", parentId, "", "reply"]);
      if (rootId && rootId !== parentId) {
        tags.push(["e", rootId, "", "root"]);
      }
      // Mention the author of the parent if known (but don't mention self)
      const seenP = new Set();
      if (parentAuthorPk && parentAuthorPk !== this.pkHex) {
        tags.push(["p", parentAuthorPk]);
        seenP.add(parentAuthorPk);
      }
      // Add any extra mentions (e.g., zap giver), skipping self and duplicates
      const extraPTags = Array.isArray(opts.extraPTags) ? opts.extraPTags : [];
      for (const pk of extraPTags) {
        if (!pk) continue;
        if (pk === this.pkHex) continue;
        if (seenP.has(pk)) continue;
        tags.push(["p", pk]);
        seenP.add(pk);
      }
      // Debug: summarize tag set and expected mention
      try {
        const eCount = tags.filter(t => t?.[0] === 'e').length;
        const pCount = tags.filter(t => t?.[0] === 'p').length;
        const expectPk = opts.expectMentionPk;
        const hasExpected = expectPk ? tags.some(t => t?.[0] === 'p' && t?.[1] === expectPk) : undefined;
        logger.info(`[NOSTR] postReply tags: e=${eCount} p=${pCount} parent=${String(parentId).slice(0,8)} root=${rootId?String(rootId).slice(0,8):'-'}${expectPk?` mentionExpected=${hasExpected?'yes':'no'}`:''}`);
      } catch {}

      const evtTemplate = {
        kind: 1,
        created_at,
        tags,
        content: String(text || "ack."),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      const logId = typeof parentEvtOrId === "object" && parentEvtOrId && parentEvtOrId.id
        ? parentEvtOrId.id
        : parentId || "";
      logger.info(
        `[NOSTR] Replied to ${String(logId).slice(0, 8)}… (${evtTemplate.content.length} chars)`
      );
      // Persist relationship bump
      await this.saveInteractionMemory("reply", typeof parentEvtOrId === "object" ? parentEvtOrId : { id: parentId }, {
        replied: true,
      }).catch(() => { });
      // Optionally drop a like on the post we replied to (best-effort)
      if (!opts.skipReaction && typeof parentEvtOrId === "object") {
        this.postReaction(parentEvtOrId, "+").catch(() => { });
      }
      return true;
    } catch (err) {
      logger.warn("[NOSTR] Reply failed:", err?.message || err);
      return false;
    }
  }

  async postReaction(parentEvt, symbol = "+") {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      if (!parentEvt || !parentEvt.id || !parentEvt.pubkey) return false;
      // Skip reacting to our own posts
      if (this.pkHex && isSelfAuthor(parentEvt, this.pkHex)) {
        logger.debug("[NOSTR] Skipping reaction to self-authored event");
        return false;
      }
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      tags.push(["e", parentEvt.id]);
      tags.push(["p", parentEvt.pubkey]);
      const evtTemplate = {
        kind: 7,
        created_at,
        tags,
        content: String(symbol || "+"),
      };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(
        `[NOSTR] Reacted to ${parentEvt.id.slice(0, 8)} with "${evtTemplate.content
        }"`
      );
      return true;
    } catch (err) {
      logger.debug("[NOSTR] Reaction failed:", err?.message || err);
      return false;
    }
  }

  async saveInteractionMemory(kind, evt, extra) {
    const runtime = this.runtime;
    if (!runtime) return;
    const body = {
      platform: "nostr",
      kind,
      eventId: evt?.id,
      author: evt?.pubkey,
      content: evt?.content,
      timestamp: Date.now(),
      ...extra,
    };
    // Prefer high-level API if available (use stable UUIDs and messages table)
    if (typeof runtime.createMemory === "function") {
      try {
        const roomId = createUniqueUuid(
          runtime,
          this._getConversationIdFromEvent(evt)
        );
        const id = createUniqueUuid(runtime, `${evt?.id || "nostr"}:${kind}`);
        const entityId = createUniqueUuid(runtime, evt?.pubkey || "nostr");
        return await runtime.createMemory(
          {
            id,
            entityId,
            roomId,
            agentId: runtime.agentId,
            content: {
              type: "social_interaction",
              source: "nostr",
              data: body,
            },
            createdAt: Date.now(),
          },
          "messages"
        );
      } catch (e) {
        logger.debug(
          "[NOSTR] saveInteractionMemory fallback:",
          e?.message || e
        );
      }
    }
    // Fallback to database adapter if exposed
    if (
      runtime.databaseAdapter &&
      typeof runtime.databaseAdapter.createMemory === "function"
    ) {
      return await runtime.databaseAdapter.createMemory({
        type: "event",
        content: body,
        roomId: "nostr",
      });
    }
  }

  async handleZap(evt) {
    try {
      // Ensure valid zap receipt
      if (!evt || evt.kind !== 9735) return;
      if (!this.pkHex) return; // need our key to identify target
      // Skip self-zaps
      if (isSelfAuthor(evt, this.pkHex)) return;

      // Extract info
      const amountMsats = getZapAmountMsats(evt);
      const targetEventId = getZapTargetEventId(evt);
      const sender = evt.pubkey;

      // Throttle per sender to avoid spam (e.g., 5 min)
      const now = Date.now();
      const last = this.zapCooldownByUser.get(sender) || 0;
      const cooldownMs = 5 * 60 * 1000;
      if (now - last < cooldownMs) return;
      this.zapCooldownByUser.set(sender, now);

      // Cancel any pending scheduled LLM reply for this sender; for zaps we only thank
      const existingTimer = this.pendingReplyTimers.get(sender);
      if (existingTimer) {
        try { clearTimeout(existingTimer); } catch {}
        this.pendingReplyTimers.delete(sender);
        logger.info(`[NOSTR] Cancelled scheduled reply for ${sender.slice(0,8)} due to zap`);
      }
      // Mark last reply for this user to throttle immediate follow-ups
      this.lastReplyByUser.set(sender, now);

      // Build conversation id: reply under the target event if available
      const convId = targetEventId || this._getConversationIdFromEvent(evt);
      const { roomId } = await this._ensureNostrContext(sender, undefined, convId);

      const thanks = generateThanksText(amountMsats);
      if (targetEventId) {
        // Reply under the zapped note (root) and mention the giver; no extra reaction
        logger.info(`[NOSTR] Zap thanks: replying under root ${String(targetEventId).slice(0,8)} and mentioning giver ${sender.slice(0,8)}`);
        await this.postReply(targetEventId, `${thanks}`, { extraPTags: [sender], skipReaction: true, expectMentionPk: sender });
      } else {
        // Fallback: reply to the zap receipt; no extra reaction
        logger.info(`[NOSTR] Zap thanks: replying to receipt ${evt.id.slice(0,8)} and mentioning giver ${sender.slice(0,8)}`);
        await this.postReply(evt, `${thanks}`, { skipReaction: true, expectMentionPk: sender });
      }

      // Persist interaction memory (best-effort)
      await this.saveInteractionMemory('zap_thanks', evt, {
        amountMsats: amountMsats ?? undefined,
        targetEventId: targetEventId ?? undefined,
        thanked: true,
      }).catch(() => {});
    } catch (err) {
      logger.debug('[NOSTR] handleZap failed:', err?.message || err);
    }
  }

  async stop() {
    if (this.postTimer) {
      clearTimeout(this.postTimer);
      this.postTimer = null;
    }
    if (this.discoveryTimer) {
      clearTimeout(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.listenUnsub) {
      try {
        this.listenUnsub();
      } catch { }
      this.listenUnsub = null;
    }
    if (this.pool) {
      try {
  // Per nostr-tools examples, close pool with an empty list
  this.pool.close([]);
      } catch { }
      this.pool = null;
    }
    if (this.pendingReplyTimers && this.pendingReplyTimers.size) {
      for (const [, t] of this.pendingReplyTimers) {
        try { clearTimeout(t); } catch { }
      }
      this.pendingReplyTimers.clear();
    }
    logger.info("[NOSTR] Service stopped");
  }
}

const nostrPlugin = {
  name: "@pixel/plugin-nostr",
  description:
    "Minimal Nostr integration: autonomous posting and mention subscription",
  services: [NostrService],
};

module.exports = nostrPlugin;
module.exports.nostrPlugin = nostrPlugin;
module.exports.default = nostrPlugin;
