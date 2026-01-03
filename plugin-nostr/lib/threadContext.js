"use strict";

const { poolList } = require('./poolList');

/**
 * Thread Context Resolver
 * Extracted from service.js (lines 4223-4530) for better separation of concerns.
 * Handles fetching thread history and determining engagement quality.
 */

class ThreadContextResolver {
  constructor({ pool, relays, selfPubkey, maxEvents, maxRounds, batchSize, list, logger }) {
    this.pool = pool;
    this.relays = relays;
    this.selfPubkey = selfPubkey;
    this.maxEvents = maxEvents || 80;
    this.maxRounds = maxRounds || 4;
    this.batchSize = batchSize || 3;
    this._list = list || ((relays, filters) => poolList(pool, relays, filters));
    this.logger = logger || console;
  }

  async getThreadContext(evt) {
    const { nip10Parse } = require('nostr-tools');
    const logger = this.logger || console;

    if (!this.pool || !evt || !Array.isArray(this.relays) || this.relays.length === 0) {
      const solo = evt ? [evt] : [];
      return {
        thread: solo,
        isRoot: true,
        contextQuality: solo.length ? this.assessThreadContextQuality(solo) : 0
      };
    }

    const maxEvents = Number.isFinite(this.maxEvents) ? this.maxEvents : 80;
    const maxRounds = Number.isFinite(this.maxRounds) ? this.maxRounds : 4;
    const batchSize = Number.isFinite(this.batchSize) ? this.batchSize : 3;

    try {
      const tags = Array.isArray(evt.tags) ? evt.tags : [];
      const eTags = tags.filter(t => t[0] === 'e');

      if (eTags.length === 0) {
        const soloThread = [evt];
        return {
          thread: soloThread,
          isRoot: true,
          contextQuality: this.assessThreadContextQuality(soloThread)
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
      } catch { }

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
            } catch { }

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
        contextQuality: this.assessThreadContextQuality(uniqueEvents)
      };

    } catch (err) {
      logger?.debug?.('[NOSTR] Error getting thread context:', err?.message || err);
      return {
        thread: [evt],
        isRoot: true,
        contextQuality: this.assessThreadContextQuality([evt])
      };
    }
  }

  assessThreadContextQuality(threadEvents) {
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

  shouldEngageWithThread(evt, threadContext) {
    const logger = this.logger || console;

    if (!threadContext || !evt) return false;

    const { thread, isRoot, contextQuality } = threadContext;

    if (isRoot && contextQuality > 0.6) {
      return true;
    }

    if (!isRoot) {
      if (contextQuality < 0.3) {
        logger?.debug?.(`[NOSTR] Low context quality (${contextQuality.toFixed(2)}) for thread reply ${evt.id.slice(0, 8)}`);
        return false;
      }

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

      if (thread.length > 5) {
        logger?.debug?.(`[NOSTR] Thread too long (${thread.length} events) for natural entry ${evt.id.slice(0, 8)}`);
        return false;
      }
    }

    const content = evt.content || '';

    if (content.length < 10 || content.length > 800) {
      return false;
    }

    const botPatterns = [
      /^(gm|good morning|good night|gn)\s*$/i,
      /^(repost|rt)\s*$/i,
      /^\d+$/,
      /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/
    ];

    if (botPatterns.some(pattern => pattern.test(content.trim()))) {
      return false;
    }

    return true;
  }
}

module.exports = { ThreadContextResolver };
