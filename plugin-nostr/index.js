// Minimal Nostr plugin (CJS) for elizaOS with dynamic ESM imports
let logger;

let SimplePool, nip19, finalizeEvent, getPublicKey;

function hexToBytesLocal(hex) {
  if (typeof hex !== 'string') return null;
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHexLocal(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return '';
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
  }
    // Provide WebSocket to nostr-tools (either via injector or global)
  const WebSocket = (await import('ws')).default || require('ws');
  if (!globalThis.WebSocket) {
    globalThis.WebSocket = WebSocket;
  }
}

function parseSk(input) {
  if (!input) return null;
  try {
    if (input.startsWith('nsec1')) {
      const decoded = nip19.decode(input);
      if (decoded.type === 'nsec') return decoded.data;
    }
  } catch {}
  const bytes = hexToBytesLocal(input);
  return bytes || null;
}

function parseRelays(input) {
  if (!input) return ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social'];
  return input.split(',').map(s => s.trim()).filter(Boolean);
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
  this.handledEventIds = new Set();
  this.lastReplyByUser = new Map(); // pubkey -> timestamp ms
  }

  static async start(runtime) {
    await ensureDeps();
    const svc = new NostrService(runtime);
    const relays = parseRelays(runtime.getSetting('NOSTR_RELAYS'));
    const sk = parseSk(runtime.getSetting('NOSTR_PRIVATE_KEY'));
    const listenVal = runtime.getSetting('NOSTR_LISTEN_ENABLE');
    const postVal = runtime.getSetting('NOSTR_POST_ENABLE');
    const listenEnabled = String(listenVal ?? 'true').toLowerCase() === 'true';
    const postEnabled = String(postVal ?? 'false').toLowerCase() === 'true';
    const minSec = Number(runtime.getSetting('NOSTR_POST_INTERVAL_MIN') ?? '3600');
    const maxSec = Number(runtime.getSetting('NOSTR_POST_INTERVAL_MAX') ?? '10800');
  const replyVal = runtime.getSetting('NOSTR_REPLY_ENABLE');
  const throttleVal = runtime.getSetting('NOSTR_REPLY_THROTTLE_SEC');

    svc.relays = relays;
    svc.sk = sk;
  svc.replyEnabled = String(replyVal ?? 'true').toLowerCase() === 'true';
  svc.replyThrottleSec = Number(throttleVal ?? '60');

    if (!relays.length) {
      logger.warn('[NOSTR] No relays configured; service will be idle');
      return svc;
    }

    svc.pool = new SimplePool({ enablePing: true });

    if (sk) {
      const pk = getPublicKey(sk);
      svc.pkHex = typeof pk === 'string' ? pk : Buffer.from(pk).toString('hex');
      logger.info(`[NOSTR] Ready with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`);
    } else {
      logger.warn('[NOSTR] No private key configured; posting disabled');
    }

  if (listenEnabled && svc.pool && svc.pkHex) {
      try {
    svc.listenUnsub = svc.pool.subscribeMany(
          relays,
          [{ kinds: [1], '#p': [svc.pkHex] }],
          {
            onevent(evt) {
        logger.info(`[NOSTR] Mention from ${evt.pubkey}: ${evt.content.slice(0, 140)}`);
        svc.handleMention(evt).catch((err) => logger.warn('[NOSTR] handleMention error:', err?.message || err));
            },
            oneose() {
              logger.debug('[NOSTR] Mention subscription OSE');
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

    logger.info(`[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled}`);
    return svc;
  }

  scheduleNextPost(minSec, maxSec) {
    const jitter = minSec + Math.floor(Math.random() * Math.max(1, maxSec - minSec));
    if (this.postTimer) clearTimeout(this.postTimer);
    this.postTimer = setTimeout(() => this.postOnce().finally(() => this.scheduleNextPost(minSec, maxSec)), jitter * 1000);
    logger.info(`[NOSTR] Next post in ~${jitter}s`);
  }

  pickPostText() {
    const examples = this.runtime.character?.postExamples;
    if (Array.isArray(examples) && examples.length) {
      const pool = examples.filter((e) => typeof e === 'string');
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  async postOnce(content) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    const text = (content?.trim?.() || this.pickPostText() || 'hello, nostr');
    const evtTemplate = { kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: text };
    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
      return true;
    } catch (err) {
      logger.error('[NOSTR] Post failed:', err?.message || err);
      return false;
    }
  }

  async handleMention(evt) {
    try {
      // Deduplicate events
      if (!evt || !evt.id || this.handledEventIds.has(evt.id)) return;
      this.handledEventIds.add(evt.id);

      // Persist interaction memory (best-effort)
      await this.saveInteractionMemory('mention', evt).catch(() => {});

      // Auto-reply if enabled and we have keys
      if (!this.replyEnabled || !this.sk || !this.pool) return;

      // Simple per-user throttle
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.replyThrottleSec * 1000) {
        logger.debug(`[NOSTR] Throttling reply to ${evt.pubkey}`);
        return;
      }
      this.lastReplyByUser.set(evt.pubkey, now);

      const replyText = this.pickReplyTextFor(evt);
      await this.postReply(evt, replyText);
    } catch (err) {
      logger.warn('[NOSTR] handleMention failed:', err?.message || err);
    }
  }

  pickReplyTextFor(evt) {
    const baseChoices = [
      'noted.',
      'seen.',
      'alive.',
      'breathing pixels.',
      'gm.',
      'ping received.'
    ];
    const content = (evt?.content || '').trim();
    if (!content) return baseChoices[Math.floor(Math.random() * baseChoices.length)];
    if (content.length < 10) return 'yo.';
    if (content.includes('?')) return 'hmm.';
    return baseChoices[Math.floor(Math.random() * baseChoices.length)];
  }

  async postReply(parentEvt, text) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      // Include reply linkage
      tags.push(['e', parentEvt.id, '', 'reply']);
      // Try to carry root if present
      const rootTag = Array.isArray(parentEvt.tags)
        ? parentEvt.tags.find(t => t[0] === 'e' && (t[3] === 'root' || t[3] === 'reply'))
        : null;
      if (rootTag && rootTag[1] && rootTag[1] !== parentEvt.id) {
        tags.push(['e', rootTag[1], '', 'root']);
      }
      // Mention the author
      if (parentEvt.pubkey) tags.push(['p', parentEvt.pubkey]);

      const evtTemplate = { kind: 1, created_at, tags, content: String(text || 'ack.') };
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.any(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Replied to ${parentEvt.id.slice(0, 8)}… (${evtTemplate.content.length} chars)`);
      // Persist relationship bump
      await this.saveInteractionMemory('reply', parentEvt, { replied: true }).catch(() => {});
      return true;
    } catch (err) {
      logger.warn('[NOSTR] Reply failed:', err?.message || err);
      return false;
    }
  }

  async saveInteractionMemory(kind, evt, extra) {
    const runtime = this.runtime;
    if (!runtime) return;
    const body = {
      platform: 'nostr',
      kind,
      eventId: evt?.id,
      author: evt?.pubkey,
      content: evt?.content,
      timestamp: Date.now(),
      ...extra,
    };
    // Prefer high-level API if available
    if (typeof runtime.createMemory === 'function') {
      return await runtime.createMemory(
        {
          id: `nostr:${evt?.id || Math.random().toString(36).slice(2)}`,
          entityId: evt?.pubkey || 'nostr:unknown',
          roomId: 'nostr',
          content: { type: 'social_interaction', data: body },
        },
        'events'
      );
    }
    // Fallback to database adapter if exposed
    if (runtime.databaseAdapter && typeof runtime.databaseAdapter.createMemory === 'function') {
      return await runtime.databaseAdapter.createMemory({
        type: 'event',
        content: body,
        roomId: 'nostr',
      });
    }
  }

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close(this.relays); } catch {} this.pool = null; }
    logger.info('[NOSTR] Service stopped');
  }

  async handleMention(evt) {
    try {
      // Deduplicate events
      if (!evt || !evt.id || this.handledEventIds.has(evt.id)) return;
      this.handledEventIds.add(evt.id);

      // Create proper memory for the mention using UUID conversion
      const eventId = evt.id.startsWith('nostr:') ? evt.id.substring(6) : evt.id;
      const hash = bytesToHexLocal(new TextEncoder().encode(eventId));
      const memoryId = hash.substring(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

      // Convert pubkey to UUID format for database compatibility
      const pubkeyHash = bytesToHexLocal(new TextEncoder().encode(evt.pubkey));
      const entityId = pubkeyHash.substring(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

      const memory = {
        id: memoryId,
        type: 'messages',
        entityId: entityId,
        agentId: this.runtime.agentId,
        roomId: 'nostr',
        content: {
          text: evt.content || '',
          source: 'nostr',
          metadata: {
            eventId: evt.id,
            eventType: 'mention',
            created_at: evt.created_at
          }
        },
        createdAt: new Date().toISOString(),
        unique: true,
        metadata: { type: 'message' }
      };

      // Store the memory with proper UUID - specify type as second parameter
      // Temporarily disabled to test if NOSTR service works
      logger.info(`[NOSTR] Would store memory for: ${evt.content?.slice(0, 50)}... from ${evt.pubkey.slice(0, 8)}`);
      // await this.runtime.createMemory(memory, 'messages');

      // Auto-reply if enabled and we have keys
      if (!this.replyEnabled || !this.sk || !this.pool) return;

      // Simple per-user throttle
      const last = this.lastReplyByUser.get(evt.pubkey) || 0;
      const now = Date.now();
      if (now - last < this.replyThrottleSec * 1000) {
        logger.debug(`[NOSTR] Throttling reply to ${evt.pubkey}`);
        return;
      }
      this.lastReplyByUser.set(evt.pubkey, now);

      const replyText = this.pickReplyTextFor(evt);
      await this.postReply(evt, replyText);
    } catch (err) {
      logger.warn('[NOSTR] handleMention failed:', err?.message || err);
    }
  }

  pickReplyTextFor(evt) {
    const baseChoices = [
      'noted.',
      'seen.',
      'alive.',
      'breathing pixels.',
      'gm.',
      'ping received.'
    ];
    const content = (evt?.content || '').trim();
    if (!content) return baseChoices[Math.floor(Math.random() * baseChoices.length)];
    if (content.length < 10) return 'yo.';
    if (content.includes('?')) return 'hmm.';
    return baseChoices[Math.floor(Math.random() * baseChoices.length)];
  }

  async postReply(parentEvt, text) {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const tags = [];
      // Include reply linkage
      tags.push(['e', parentEvt.id, '', 'reply']);
      // Try to carry root if present
      const rootTag = Array.isArray(parentEvt.tags)
        ? parentEvt.tags.find(t => t[0] === 'e' && (t[3] === 'root' || t[3] === 'reply'))
        : null;
      if (rootTag) {
        tags.push(['e', rootTag[1], '', 'root']);
      }
      tags.push(['p', parentEvt.pubkey]);

      const replyEvt = {
        kind: 1,
        created_at,
        tags,
        content: text
      };

      const signed = finalizeEvent(replyEvt, this.sk);
      await Promise.race(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Replied to ${parentEvt.pubkey.slice(0, 8)}… (${text.length} chars)`);
      return true;
    } catch (err) {
      logger.warn('[NOSTR] postReply failed:', err?.message || err);
      return false;
    }
  }
}

const nostrPlugin = {
  name: '@pixel/plugin-nostr',
  description: 'Minimal Nostr integration: autonomous posting and mention subscription',
  services: [NostrService],
};

module.exports = nostrPlugin;
module.exports.nostrPlugin = nostrPlugin;
module.exports.default = nostrPlugin;
module.exports.default = nostrPlugin;
