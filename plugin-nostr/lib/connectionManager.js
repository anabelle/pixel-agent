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
  constructor({ poolFactory, relays, pkHex, runtime, handlers, config, logger, onHealthCheck, onReconnect }) {
    this.poolFactory = poolFactory;
    this.relays = relays;
    this.pkHex = pkHex;
    this.runtime = runtime;
    this.handlerProvider = handlers;
    this.config = config;
    this.logger = logger || console;
    this.onHealthCheck = onHealthCheck;
    this.onReconnect = onReconnect;

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

            let extraInfo = '';
            if (evt.kind === 7) {
              const eTag = evt.tags.find(t => t[0] === 'e');
              if (eTag) extraInfo = ` to ${eTag[1].slice(0, 8)}...`;
            }

            this.logger.info(`[NOSTR] ${kindName} from ${authorDisplay}${extraInfo}: ${logContent.slice(0, 140)}`);
          } catch (outerErr) {
            this.logger.error(`[NOSTR] Critical error in onevent handler: ${outerErr.message}`);
          }

          const handlers = this.handlers;
          if (handlers?.onevent) {
            try {
              handlers.onevent(evt);
            } catch (handlerErr) {
              this.logger.error(`[NOSTR] Handler error: ${handlerErr?.message || handlerErr}`);
            }
          }
        },
        oneose: () => {
          this.logger.debug('[NOSTR] Mention subscription OSE');
          this.lastEventReceived = Date.now();
          const handlers = this.handlers;
          if (handlers?.oneose) {
            handlers.oneose();
          }
        },
        onclose: (reason) => {
          this.logger.warn(`[NOSTR] Subscription closed: ${reason}`);
          const handlers = this.handlers;
          if (handlers?.onclose) {
            handlers.onclose(reason);
          }
        }
      }
    );

    this.listenUnsub = () => { try { sub.close(); } catch { } };

    this.logger.info(`[NOSTR] Subscriptions established on ${this.relays.length} relays`);

    return this.pool;
  }

  startMonitoring() {
    if (!this.monitorTimer) {
      this.monitorTimer = setTimeout(() => {
        this.checkHealth();
      }, this.config.checkIntervalMs);
    }
  }

  checkHealth() {
    if (this.onHealthCheck) {
      this.onHealthCheck();
    }

    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventReceived;

    if (timeSinceLastEvent > this.config.maxTimeSinceLastEventMs) {
      this.logger.warn(`[NOSTR] No events received in ${Math.round(timeSinceLastEvent / 1000)}s, checking connection health`);
      this.attemptReconnection();
    } else {
      this.logger.debug(`[NOSTR] Connection healthy, last event received ${Math.round(timeSinceLastEvent / 1000)}s ago`);
      this.startMonitoring();
    }
  }

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logger.error(`[NOSTR] Max reconnection attempts (${this.config.maxReconnectAttempts}) reached, giving up`);
      return;
    }

    this.reconnectAttempts++;
    this.logger.info(`[NOSTR] Attempting reconnection ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);

    try {
      if (this.listenUnsub) {
        try { this.listenUnsub(); } catch { }
        this.listenUnsub = null;
      }
      if (this.homeFeedUnsub) {
        try { this.homeFeedUnsub(); } catch { }
        this.homeFeedUnsub = null;
      }
      if (this.pool) {
        try { this.pool.close([]); } catch { }
      }

      await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelayMs));

      if (this.onReconnect) {
        await this.onReconnect();
      }

      this.logger.info(`[NOSTR] Reconnection ${this.reconnectAttempts} successful`);
      this.reconnectAttempts = 0;
      this.lastEventReceived = Date.now();
      this.startMonitoring();

    } catch (error) {
      this.logger.error(`[NOSTR] Reconnection ${this.reconnectAttempts} failed:`, error?.message || error);

      setTimeout(() => {
        this.attemptReconnection();
      }, this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1));
    }
  }

  stop() {
    if (this.monitorTimer) clearTimeout(this.monitorTimer);
    if (this.listenUnsub) try { this.listenUnsub(); } catch { }
    if (this.homeFeedUnsub) try { this.homeFeedUnsub(); } catch { }
    if (this.pool) try { this.pool.close([]); } catch { }
  }
}

module.exports = { ConnectionManager };
