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
const { buildPostPrompt, buildReplyPrompt, buildZapThanksPrompt, extractTextFromModelResult, sanitizeWhitelist } = require('./text');
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
  try {
    const poolMod = await import('@nostr/tools/pool');
    if (typeof poolMod.useWebSocketImplementation === 'function') {
      poolMod.useWebSocketImplementation(WebSocket);
    } else if (wsInjector) {
      wsInjector(WebSocket);
    }
  } catch {
    if (wsInjector) {
      try { wsInjector(WebSocket); } catch {}
    }
  }
  if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;
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

    logger.info(`[NOSTR] Config: postInterval=${minSec}-${maxSec}s, listen=${listenEnabled}, post=${postEnabled}, replyThrottle=${svc.replyThrottleSec}s, thinkDelay=${svc.replyInitialDelayMinMs}-${svc.replyInitialDelayMaxMs}ms, discovery=${svc.discoveryEnabled} interval=${svc.discoveryMinSec}-${svc.discoveryMaxSec}s maxReplies=${svc.discoveryMaxReplies} maxFollows=${svc.discoveryMaxFollows}`);

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

  async _listEventsByTopic(topic) {
    if (!this.pool) return [];
    const { listEventsByTopic } = require('./discoveryList');
    try {
      const relevant = await listEventsByTopic(this.pool, this.relays, topic, {
        listFn: async (pool, relays, filters) => this._list.call(this, relays, filters),
        isSemanticMatch: (c, t) => this._isSemanticMatch(c, t),
        isQualityContent: (e, t) => this._isQualityContent(e, t),
        now: Math.floor(Date.now() / 1000),
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

  _isQualityContent(event, topic) { return _isQualityContent(event, topic); }

  async _filterByAuthorQuality(events) {
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
    const topics = this._pickDiscoveryTopics();
    if (!topics.length) return false;
    logger.info(`[NOSTR] Discovery run: topics=${topics.join(', ')}`);
    const buckets = await Promise.all(topics.map((t) => this._listEventsByTopic(t)));
    const all = buckets.flat();
    const qualityEvents = await this._filterByAuthorQuality(all);
    const scored = qualityEvents.map((e) => ({ evt: e, score: this._scoreEventForEngagement(e) })).filter(({ score }) => score > 0.2).sort((a, b) => b.score - a.score);
    logger.info(`[NOSTR] Discovery: ${all.length} total -> ${qualityEvents.length} quality -> ${scored.length} scored events`);
    let replies = 0; const usedAuthors = new Set(); const usedTopics = new Set();
    for (const { evt, score } of scored) {
      if (replies >= this.discoveryMaxReplies) break;
      if (!evt || !evt.id || !evt.pubkey) continue;
      if (this.handledEventIds.has(evt.id)) continue;
      if (usedAuthors.has(evt.pubkey)) continue;
      if (evt.pubkey === this.pkHex) continue;
      if (!canReply) continue;
      const last = this.lastReplyByUser.get(evt.pubkey) || 0; const now = Date.now(); const cooldownMs = this.replyThrottleSec * 1000;
      if (now - last < cooldownMs) { logger.debug(`[NOSTR] Discovery skipping ${evt.pubkey.slice(0, 8)} due to cooldown (${Math.round((cooldownMs - (now - last)) / 1000)}s left)`); continue; }
      const eventTopics = this._extractTopicsFromEvent(evt);
      const hasUsedTopic = eventTopics.some(topic => usedTopics.has(topic));
      if (hasUsedTopic && usedTopics.size > 0 && Math.random() < 0.7) { continue; }
      const qualityThreshold = Math.max(0.3, 0.8 - (replies * 0.1));
      if (score < qualityThreshold) continue;
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
          logger.info(`[NOSTR] Discovery reply ${replies}/${this.discoveryMaxReplies} to ${evt.pubkey.slice(0, 8)} (score: ${score.toFixed(2)})`);
        }
      } catch (err) { logger.debug('[NOSTR] Discovery reply error:', err?.message || err); }
    }
    try {
      const current = await this._loadCurrentContacts();
      const followCandidates = this._selectFollowCandidates(scored, current);
      if (followCandidates.length > 0) {
        const toAdd = followCandidates.slice(0, this.discoveryMaxFollows);
        const newSet = new Set([...current, ...toAdd]);
        await this._publishContacts(newSet);
        logger.info(`[NOSTR] Discovery: following ${toAdd.length} new accounts`);
      }
    } catch (err) { logger.debug('[NOSTR] Discovery follow error:', err?.message || err); }
    logger.info(`[NOSTR] Discovery run complete: replies=${replies}, topics=${topics.join(',')}`);
    return true;
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
    try {
      if (!this.runtime?.useModel) throw new Error('useModel missing');
      const res = await this.runtime.useModel(type, { prompt, maxTokens: 256, temperature: 0.9 });
      const text = this._sanitizeWhitelist(this._extractTextFromModelResult(res));
      return text || null;
    } catch (err) {
      logger?.warn?.('[NOSTR] LLM post generation failed, falling back to examples:', err?.message || err);
      return this.pickPostText();
    }
  }

  _buildZapThanksPrompt(amountMsats, senderInfo) { return buildZapThanksPrompt(this.runtime.character, amountMsats, senderInfo); }

  async generateZapThanksTextLLM(amountMsats, senderInfo) {
    const prompt = this._buildZapThanksPrompt(amountMsats, senderInfo);
    const type = this._getLargeModelType();
    try {
      if (!this.runtime?.useModel) throw new Error('useModel missing');
      const res = await this.runtime.useModel(type, { prompt, maxTokens: 128, temperature: 0.8 });
      const text = this._sanitizeWhitelist(this._extractTextFromModelResult(res));
      return text || generateThanksText(amountMsats);
    } catch (err) {
      logger?.warn?.('[NOSTR] LLM zap thanks generation failed, falling back to static:', err?.message || err);
      return generateThanksText(amountMsats);
    }
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
    try {
      if (!this.runtime?.useModel) throw new Error('useModel missing');
      const res = await this.runtime.useModel(type, { prompt, maxTokens: 192, temperature: 0.8 });
      const text = this._sanitizeWhitelist(this._extractTextFromModelResult(res));
      return text || 'noted.';
    } catch (err) {
      logger?.warn?.('[NOSTR] LLM reply generation failed, falling back to heuristic:', err?.message || err);
      return this.pickReplyTextFor(evt);
    }
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    let text = content?.trim?.();
    if (!text) { text = await this.generatePostTextLLM(); if (!text) text = this.pickPostText(); }
    text = text || 'hello, nostr';
    const evtTemplate = buildTextNote(text);
    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
      try {
        const runtime = this.runtime;
        const id = createUniqueUuid(runtime, `nostr:post:${Date.now()}:${Math.random()}`);
        const roomId = createUniqueUuid(runtime, 'nostr:posts');
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
    const runtime = this.runtime;
    const worldId = createUniqueUuid(runtime, userPubkey);
    const roomId = createUniqueUuid(runtime, conversationId);
    const entityId = createUniqueUuid(runtime, userPubkey);
    logger.info(`[NOSTR] Ensuring context world/room/connection for pubkey=${userPubkey.slice(0, 8)} conv=${conversationId.slice(0, 8)}`);
    await runtime.ensureWorldExists({ id: worldId, name: `${usernameLike || userPubkey.slice(0, 8)}'s Nostr`, agentId: runtime.agentId, serverId: userPubkey, metadata: { ownership: { ownerId: userPubkey }, nostr: { pubkey: userPubkey }, }, }).catch(() => {});
    await runtime.ensureRoomExists({ id: roomId, name: `Nostr thread ${conversationId.slice(0, 8)}`, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, channelId: conversationId, serverId: userPubkey, worldId, }).catch(() => {});
    await runtime.ensureConnection({ entityId, roomId, userName: usernameLike || userPubkey, name: usernameLike || userPubkey, source: 'nostr', type: ChannelType ? ChannelType.FEED : undefined, worldId, }).catch(() => {});
    logger.info(`[NOSTR] Context ensured world=${worldId} room=${roomId} entity=${entityId}`);
    return { worldId, roomId, entityId };
  }

  async _createMemorySafe(memory, tableName = 'messages', maxRetries = 3) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try { logger.info(`[NOSTR] Creating memory id=${memory.id} room=${memory.roomId} attempt=${attempt + 1}/${maxRetries}`); await this.runtime.createMemory(memory, tableName); logger.info(`[NOSTR] Memory created id=${memory.id}`); return true; }
      catch (err) { lastErr = err; const msg = String(err?.message || err || ''); if (msg.includes('duplicate') || msg.includes('constraint')) { logger.info('[NOSTR] Memory already exists, skipping'); return true; } await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 250)); }
    }
    logger.warn('[NOSTR] Failed to persist memory:', lastErr?.message || lastErr);
    return false;
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
    const runtime = this.runtime; if (!runtime) return;
    const body = { platform: 'nostr', kind, eventId: evt?.id, author: evt?.pubkey, content: evt?.content, timestamp: Date.now(), ...extra };
    if (typeof runtime.createMemory === 'function') {
      try {
        const roomId = createUniqueUuid(runtime, this._getConversationIdFromEvent(evt));
        const id = createUniqueUuid(runtime, `${evt?.id || 'nostr'}:${kind}`);
        const entityId = createUniqueUuid(runtime, evt?.pubkey || 'nostr');
        return await runtime.createMemory({ id, entityId, roomId, agentId: runtime.agentId, content: { type: 'social_interaction', source: 'nostr', data: body, }, createdAt: Date.now(), }, 'messages');
      } catch (e) { logger.debug('[NOSTR] saveInteractionMemory fallback:', e?.message || e); }
    }
    if (runtime.databaseAdapter && typeof runtime.databaseAdapter.createMemory === 'function') {
      return await runtime.databaseAdapter.createMemory({ type: 'event', content: body, roomId: 'nostr', });
    }
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
