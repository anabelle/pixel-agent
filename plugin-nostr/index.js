// Minimal Nostr plugin (CJS) for elizaOS with dynamic ESM imports
const { logger } = require('@elizaos/core');

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

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import('@nostr/tools');
    SimplePool = tools.SimplePool;
    nip19 = tools.nip19;
    finalizeEvent = tools.finalizeEvent;
    getPublicKey = tools.getPublicKey;
      wsInjector = tools.setWebSocketConstructor || tools.useWebSocketImplementation;
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

    svc.relays = relays;
    svc.sk = sk;

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

  async stop() {
    if (this.postTimer) { clearTimeout(this.postTimer); this.postTimer = null; }
    if (this.listenUnsub) { try { this.listenUnsub(); } catch {} this.listenUnsub = null; }
    if (this.pool) { try { this.pool.close(this.relays); } catch {} this.pool = null; }
    logger.info('[NOSTR] Service stopped');
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
