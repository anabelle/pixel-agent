"use strict";

let SimplePool;

async function ensureDeps() {
  if (!SimplePool) {
    const tools = await import('nostr-tools');
    SimplePool = tools.SimplePool;
  }
}

/**
 * Connection Manager
 * Extracted from service.js (lines 5648-5800) for better separation.
 * Handles pool lifecycle, health monitoring, and reconnection logic.
 */

class ConnectionManager {
  constructor({ poolFactory, relays, pkHex, runtime, handlers, config, logger }) {
    this.poolFactory = poolFactory;
    this.relays = relays;
    this.pkHex = pkHex;
    this.runtime = runtime;
    this.handlerProvider = handlers; // Function that returns handlers { onevent, oneose, onclose }
    this.config = config; // { checkIntervalMs, maxTimeSinceLastEventMs, maxReconnectAttempts, reconnectDelayMs }
    this.logger = logger || console;

    this.pool = null;
    this.listenUnsub = null;
    this.homeFeedUnsub = null;
    this.monitorTimer = null;
    this.reconnectAttempts = 0;
    this.lastEventReceived = Date.now();
  }

  get handlers() {
    return typeof this.handlerProvider === 'function' ? this.handlerProvider() : this.handlerProvider;
  }

  async setup({ threadResolver, messageCutoff, handledEventIds, homeFeedEnabled, sk, startHomeFeed }) {
    await ensureDeps();
    
    const enablePing = String(this.runtime?.getSetting('NOSTR_ENABLE_PING') ?? 'true').toLowerCase() === 'true';
    const poolFactory = typeof this.runtime?.createSimplePool === 'function'
      ? this.runtime.createSimplePool.bind(this.runtime)
      : this.poolFactory;

    try {
      const poolInstance = poolFactory
        ? poolFactory({ enablePing })
        : new SimplePool({ enablePing });
      this.pool = poolInstance;
      if (threadResolver) {
        threadResolver.pool = poolInstance;
      }
    } catch (err) {
      this.logger.warn('[NOSTR] Failed to create SimplePool instance:', err?.message || err);
      this.pool = null;
      if (threadResolver) {
        threadResolver.pool = null;
      }
    }

    if (!this.relays.length || !this.pool || !this.pkHex) {
      return this.pool;
    }
    
    const { nip19 } = await import('nostr-tools');
    
    const safePk = String(this.pkHex || '').trim();
    const filters = [
      { kinds: [1], '#p': [safePk] },
      { kinds: [4], '#p': [safePk] },
      { kinds: [7], '#p': [safePk] },
      { kinds: [14], '#p': [safePk] },
      { kinds: [9735], '#p': [safePk] },
    ];

    const requests = [];
    for (const relay of this.relays) {
      for (const filter of filters) {
        requests.push({ url: relay, filter });
      }
    }

    const sub = this.pool.subscribeMap(
      requests,
      {
        onevent: (evt) => {
          try {
            this.lastEventReceived = Date.now();
            if (evt.created_at && evt.created_at < messageCutoff) return;

            let logContent = String(evt.content || '');
            try {
              if (logContent.includes('nostr:nprofile1')) {
                const match = logContent.match(/nostr:(nprofile1\w+)/);
                if (match && nip19) {
                  const { data } = nip19.decode(match[1]);
                  logContent = logContent.replace(match[0], `[Profile: ${data.pubkey?.slice(0, 8)}...]`);
                }
              }
              if (logContent.includes('nostr:nevent1')) {
                const match = logContent.match(/nostr:(nevent1\w+)/);
                if (match && nip19) {
                  const { data } = nip19.decode(match[1]);
                  logContent = logContent.replace(match[0], `[Event: ${data.id?.slice(0, 8)}...]`);
                }
              }
            } catch { }

            const kindNames = {
              1: 'Text Note',
              3: 'Contacts',
              4: 'Direct Message',
              6: 'Repost',
              7: 'Reaction',
              14: 'Sealed DM',
              1311: 'Live Chat',
              10000: 'Mute List',
              10002: 'Relay List',
              30023: 'Long-form Content',
              31922: 'Calendar Event',
              9735: 'Zap'
            };
            const kindName = kindNames[evt.kind] || `Kind ${evt.kind}`;
            let authorDisplay = evt.pubkey.slice(0, 8);
            try {
              if (nip19) authorDisplay = nip19.npubEncode(evt.pubkey);
            } catch { }

            this.logger.info(`[NOSTR] ${kindName} from ${authorDisplay}: ${logContent.slice(0, 140)}`);
            
            if (this.handlers?.onevent) {
              this.handlers.onevent(evt);
            }
          } catch (outerErr) {
            this.logger.error(`[NOSTR] Critical error in onevent handler: ${outerErr.message}`);
          }
        },
        oneose: () => {
          this.logger.debug('[NOSTR] Mention subscription OSE');
          this.lastEventReceived = Date.now();
        },
        onclose: (reason) => {
          this.logger.warn(`[NOSTR] Subscription closed: ${reason}`);
        }
      }
    );

    this.listenUnsub = () => { try { sub.close(); } catch { } };

    this.logger.info(`[NOSTR] Subscriptions established on ${this.relays.length} relays`);

    return this.pool;
  }

  // Placeholder - T020
  startMonitoring() { throw new Error('Not implemented - see T020'); }
  checkHealth() { throw new Error('Not implemented - see T020'); }
  async attemptReconnection() { throw new Error('Not implemented - see T020'); }

  stop() {
    if (this.monitorTimer) clearTimeout(this.monitorTimer);
    if (this.listenUnsub) try { this.listenUnsub(); } catch {}
    if (this.homeFeedUnsub) try { this.homeFeedUnsub(); } catch {}
    if (this.pool) try { this.pool.close([]); } catch {}
  }
}

module.exports = { ConnectionManager };
