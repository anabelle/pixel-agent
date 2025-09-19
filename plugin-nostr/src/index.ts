import { Plugin, Service, IAgentRuntime, logger } from '@elizaos/core';
// @ts-ignore
import { bytesToHex, hexToBytes } from '@noble/hashes';
import { finalizeEvent, getPublicKey, SimplePool, nip19 } from '@nostr/tools';

type Hex = string;

function parseSk(input?: string | null): Uint8Array | null {
  if (!input) return null;
  try {
    if (input.startsWith('nsec1')) {
      const decoded = nip19.decode(input);
      if (decoded.type === 'nsec') return decoded.data as Uint8Array;
    }
  } catch {}
  const hex = input.startsWith('0x') ? input.slice(2) : input;
  try {
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

function parseRelays(input?: string | null): string[] {
  if (!input) {
    return [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.snort.social',
    ];
  }
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

class NostrService extends Service {
  static serviceType = 'nostr';
  capabilityDescription = 'Nostr connectivity: post notes and subscribe to mentions';

  private pool: SimplePool | null = null;
  private relays: string[] = [];
  private sk: Uint8Array | null = null;
  private pkHex: Hex | null = null;
  private postTimer: NodeJS.Timeout | null = null;
  private listenUnsub: (() => void) | null = null;

  constructor(protected runtime: IAgentRuntime) {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<NostrService> {
    const svc = new NostrService(runtime);

    // Config
    const relays = parseRelays(runtime.getSetting('NOSTR_RELAYS'));
    const sk = parseSk(runtime.getSetting('NOSTR_PRIVATE_KEY') || '');
    const listenEnabled = (runtime.getSetting('NOSTR_LISTEN_ENABLE') ?? 'true').toLowerCase() === 'true';
    const postEnabled = (runtime.getSetting('NOSTR_POST_ENABLE') ?? 'false').toLowerCase() === 'true';
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
      svc.pkHex = typeof pk === 'string' ? (pk as Hex) : bytesToHex(pk as Uint8Array);
      if (svc.pkHex) {
        logger.info(`[NOSTR] Ready with pubkey npub: ${nip19.npubEncode(svc.pkHex)}`);
      }
    } else {
      logger.warn('[NOSTR] No private key configured; posting disabled');
    }

    if (!relays.length) {
      logger.warn('[NOSTR] No relays configured; service will be idle');
      return svc;
    }

    if (listenEnabled && svc.pool && svc.pkHex) {
      try {
        svc.listenUnsub = svc.pool.subscribeMany(
          relays,
          [{ kinds: [1], '#p': [svc.pkHex] }],
          {
            onevent: (evt: any) => {
              svc.processNostrMention(evt).catch(err => logger.error('[NOSTR] Error processing mention:', err));
            },
            oneose() {
              logger.debug('[NOSTR] Mention subscription OSE');
            },
          }
        ) as any;
      } catch (err: any) {
        logger.warn(`[NOSTR] Subscribe failed: ${err?.message || err}`);
      }
    }

    if (postEnabled && sk) {
      svc.scheduleNextPost(minSec, maxSec);
    }

    logger.info(`[NOSTR] Service started. relays=${relays.length} listen=${listenEnabled} post=${postEnabled}`);
    return svc;
  }

  private scheduleNextPost(minSec: number, maxSec: number) {
    const jitter = minSec + Math.floor(Math.random() * Math.max(1, maxSec - minSec));
    if (this.postTimer) clearTimeout(this.postTimer);
    this.postTimer = setTimeout(() => void this.postOnce().finally(() => this.scheduleNextPost(minSec, maxSec)), jitter * 1000);
    logger.info(`[NOSTR] Next post in ~${jitter}s`);
  }

  private pickPostText(): string | null {
    const examples = this.runtime.character?.postExamples;
    if (Array.isArray(examples) && examples.length) {
      const pool = examples.filter((e) => typeof e === 'string') as string[];
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return null;
  }

  async postOnce(content?: string): Promise<boolean> {
    if (!this.pool || !this.sk || !this.relays.length) return false;
    const text = content?.trim() || this.pickPostText() || 'hello, nostr';

    const evtTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: text,
    } as const;

    try {
      const signed = finalizeEvent(evtTemplate, this.sk);
      await Promise.race(this.pool.publish(this.relays, signed));
      logger.info(`[NOSTR] Posted note (${text.length} chars)`);
      return true;
    } catch (err: any) {
      logger.error('[NOSTR] Post failed:', err?.message || err);
      return false;
    }
  }

  async stop(): Promise<void> {
    if (this.postTimer) {
      clearTimeout(this.postTimer);
      this.postTimer = null;
    }
    if (this.listenUnsub) {
      try { this.listenUnsub(); } catch {}
      this.listenUnsub = null;
    }
    if (this.pool) {
      try { this.pool.close(this.relays); } catch {}
      this.pool = null;
    }
    logger.info('[NOSTR] Service stopped');
  }

  private isContentAppropriate(content: string): boolean {
    // Basic content moderation - block inappropriate content
    const blockedKeywords = [
      'pedo', 'pedophile', 'child', 'minor', 'underage', 'cp', 'csam',
      'rape', 'abuse', 'exploitation', 'grooming', 'loli', 'shota'
    ];

    const lowerContent = content.toLowerCase();
    return !blockedKeywords.some(keyword => lowerContent.includes(keyword));
  }

  private async processNostrMention(evt: any): Promise<void> {
    // Check content appropriateness before processing
    if (!this.isContentAppropriate(evt.content)) {
      logger.warn(`[NOSTR] Blocked inappropriate mention from ${evt.pubkey}: ${evt.content.slice(0, 50)}...`);
      return;
    }

    // This method can be used to process mentions without triggering memory queries
    // For now, just log the event to avoid database errors
    logger.debug(`[NOSTR] Processing mention from ${evt.pubkey}: ${evt.content.slice(0, 100)}`);

    // TODO: Add logic to respond to mentions if needed
    // This prevents the system from trying to query memories with non-existent IDs
  }
}

export const nostrPlugin: Plugin = {
  name: '@pixel/plugin-nostr',
  description: 'Minimal Nostr integration: autonomous posting and mention subscription',
  services: [NostrService],
};

export default nostrPlugin;