/**
 * Primal Trending Feed Integration
 * 
 * Connects to Primal's caching service to fetch global trending content.
 * This provides Pixel with awareness of what's hot on Nostr beyond just
 * their follows, enabling more relevant cultural commentary and engagement.
 * 
 * API Documentation (reverse-engineered from primal-web-app):
 * - WebSocket: wss://cache2.primal.net/v1
 * - Commands:
 *   - explore_global_trending_24h: 24-hour trending notes
 *   - explore_global_mostzapped_4h: Most zapped in 4 hours
 *   - explore: General explore with timeframe/scope params
 */

const WebSocket = require('ws');
const { logger } = require('@elizaos/core');

const PRIMAL_CACHE_URL = 'wss://cache2.primal.net/v1';
const SUBSCRIPTION_TIMEOUT_MS = 30000;
const MAX_TRENDING_ITEMS = 50;

class PrimalTrendingFeed {
    constructor(options = {}) {
        this.cacheUrl = options.cacheUrl || PRIMAL_CACHE_URL;
        this.userPubkey = options.userPubkey || null;

        // Trending cache
        this.trending24h = [];
        this.mostZapped4h = [];
        this.lastFetch24h = 0;
        this.lastFetch4h = 0;

        // Rate limiting
        this.minFetchIntervalMs = options.minFetchIntervalMs || 15 * 60 * 1000; // 15 minutes min

        // Callbacks
        this.onTrendingUpdate = options.onTrendingUpdate || null;
    }

    /**
     * Connect to Primal cache and fetch data via WebSocket
     */
    async _fetchFromPrimal(cacheCommand, params = {}) {
        return new Promise((resolve, reject) => {
            const subId = `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            let ws;
            let timeout;
            let events = [];
            let metadata = {};
            let resolved = false;

            const cleanup = () => {
                if (timeout) clearTimeout(timeout);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(JSON.stringify(['CLOSE', subId]));
                        ws.close();
                    } catch (e) { /* ignore */ }
                }
            };

            const resolveOnce = (result) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(result);
            };

            const rejectOnce = (error) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                reject(error);
            };

            try {
                ws = new WebSocket(this.cacheUrl);

                timeout = setTimeout(() => {
                    rejectOnce(new Error(`Primal fetch timeout after ${SUBSCRIPTION_TIMEOUT_MS}ms`));
                }, SUBSCRIPTION_TIMEOUT_MS);

                ws.on('open', () => {
                    const payload = this.userPubkey ? { ...params, user_pubkey: this.userPubkey } : params;
                    const req = ['REQ', subId, { cache: [cacheCommand, payload] }];
                    ws.send(JSON.stringify(req));
                });

                ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (!Array.isArray(msg)) return;

                        const [type, id, payload] = msg;

                        if (type === 'EVENT' && id === subId && payload) {
                            // Kind 1 = text notes, Kind 0 = metadata
                            if (payload.kind === 1) {
                                events.push({
                                    id: payload.id,
                                    pubkey: payload.pubkey,
                                    content: payload.content,
                                    created_at: payload.created_at,
                                    tags: payload.tags || [],
                                    kind: payload.kind
                                });
                            } else if (payload.kind === 0) {
                                // User metadata
                                try {
                                    const meta = JSON.parse(payload.content);
                                    metadata[payload.pubkey] = {
                                        name: meta.name || meta.display_name,
                                        displayName: meta.display_name || meta.name,
                                        picture: meta.picture,
                                        nip05: meta.nip05
                                    };
                                } catch (e) { /* ignore parse errors */ }
                            } else if (payload.kind === 10000100) {
                                // Event stats from Primal
                                try {
                                    const stats = JSON.parse(payload.content);
                                    if (stats.event_id) {
                                        const event = events.find(e => e.id === stats.event_id);
                                        if (event) {
                                            event.stats = {
                                                likes: stats.likes || 0,
                                                replies: stats.replies || 0,
                                                reposts: stats.reposts || 0,
                                                zaps: stats.zaps || 0,
                                                satszapped: stats.satszapped || 0,
                                                score: stats.score || 0,
                                                score24h: stats.score24h || 0
                                            };
                                        }
                                    }
                                } catch (e) { /* ignore */ }
                            }
                        } else if (type === 'EOSE' && id === subId) {
                            // End of stored events - we have all the data
                            resolveOnce({ events, metadata });
                        } else if (type === 'NOTICE') {
                            logger.warn(`[PRIMAL] Notice: ${payload}`);
                        }
                    } catch (e) {
                        logger.debug(`[PRIMAL] Message parse error: ${e.message}`);
                    }
                });

                ws.on('error', (err) => {
                    rejectOnce(new Error(`Primal WebSocket error: ${err.message}`));
                });

                ws.on('close', () => {
                    // Resolve with whatever we have if not already resolved
                    resolveOnce({ events, metadata });
                });

            } catch (err) {
                rejectOnce(err);
            }
        });
    }

    /**
     * Fetch 24-hour trending notes from Primal
     */
    async fetchTrending24h(force = false) {
        const now = Date.now();
        if (!force && (now - this.lastFetch24h) < this.minFetchIntervalMs) {
            logger.debug('[PRIMAL] Skipping 24h fetch - too soon since last fetch');
            return this.trending24h;
        }

        try {
            logger.info('[PRIMAL] Fetching 24h trending from Primal...');
            const { events, metadata } = await this._fetchFromPrimal('explore_global_trending_24h', {});

            // Enrich events with metadata
            const enriched = events.map(evt => ({
                ...evt,
                authorMeta: metadata[evt.pubkey] || null
            }));

            // Sort by score if available, otherwise by created_at
            enriched.sort((a, b) => {
                if (a.stats?.score24h && b.stats?.score24h) {
                    return b.stats.score24h - a.stats.score24h;
                }
                return b.created_at - a.created_at;
            });

            this.trending24h = enriched.slice(0, MAX_TRENDING_ITEMS);
            this.lastFetch24h = now;

            logger.info(`[PRIMAL] Fetched ${this.trending24h.length} trending notes (24h)`);

            if (this.onTrendingUpdate) {
                this.onTrendingUpdate('24h', this.trending24h);
            }

            return this.trending24h;
        } catch (err) {
            logger.warn(`[PRIMAL] Failed to fetch 24h trending: ${err.message}`);
            return this.trending24h; // Return cached data on error
        }
    }

    /**
     * Fetch most zapped notes in last 4 hours
     */
    async fetchMostZapped4h(force = false) {
        const now = Date.now();
        if (!force && (now - this.lastFetch4h) < this.minFetchIntervalMs) {
            logger.debug('[PRIMAL] Skipping 4h zapped fetch - too soon since last fetch');
            return this.mostZapped4h;
        }

        try {
            logger.info('[PRIMAL] Fetching most zapped (4h) from Primal...');
            const { events, metadata } = await this._fetchFromPrimal('explore_global_mostzapped_4h', {});

            const enriched = events.map(evt => ({
                ...evt,
                authorMeta: metadata[evt.pubkey] || null
            }));

            // Sort by sats zapped
            enriched.sort((a, b) => {
                return (b.stats?.satszapped || 0) - (a.stats?.satszapped || 0);
            });

            this.mostZapped4h = enriched.slice(0, MAX_TRENDING_ITEMS);
            this.lastFetch4h = now;

            logger.info(`[PRIMAL] Fetched ${this.mostZapped4h.length} most zapped notes (4h)`);

            if (this.onTrendingUpdate) {
                this.onTrendingUpdate('4h_zapped', this.mostZapped4h);
            }

            return this.mostZapped4h;
        } catch (err) {
            logger.warn(`[PRIMAL] Failed to fetch 4h zapped: ${err.message}`);
            return this.mostZapped4h;
        }
    }

    /**
     * Get a summary of current trending topics for context injection
     */
    getTrendingSummary() {
        const summaries = [];

        if (this.trending24h.length > 0) {
            const top5 = this.trending24h.slice(0, 5);
            const topics = this._extractTopics(top5);
            summaries.push({
                type: '24h_trending',
                count: this.trending24h.length,
                topTopics: topics,
                topNotes: top5.map(e => ({
                    id: e.id.slice(0, 8),
                    author: e.authorMeta?.name || e.pubkey.slice(0, 8),
                    preview: e.content.slice(0, 100),
                    stats: e.stats
                }))
            });
        }

        if (this.mostZapped4h.length > 0) {
            const top5 = this.mostZapped4h.slice(0, 5);
            summaries.push({
                type: '4h_most_zapped',
                count: this.mostZapped4h.length,
                topNotes: top5.map(e => ({
                    id: e.id.slice(0, 8),
                    author: e.authorMeta?.name || e.pubkey.slice(0, 8),
                    preview: e.content.slice(0, 100),
                    satsZapped: e.stats?.satszapped || 0
                }))
            });
        }

        return summaries;
    }

    /**
     * Extract common topics/themes from trending notes
     */
    _extractTopics(notes) {
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'on',
            'in', 'to', 'with', 'by', 'at', 'from', 'as', 'it', 'is', 'are', 'was', 'were',
            'be', 'been', 'am', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
            'we', 'they', 'them', 'me', 'my', 'your', 'our', 'their', 'its', 'what', 'which',
            'who', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'have',
            'has', 'had', 'do', 'does', 'did', 'just', 'like', 'about', 'so', 'not', 'no',
            'yes', 'all', 'any', 'some', 'rt', 'http', 'https', 'nostr', 'npub'
        ]);

        const wordCounts = new Map();
        const hashtagCounts = new Map();

        for (const note of notes) {
            const text = (note.content || '').toLowerCase();

            // Extract hashtags
            const hashtags = text.match(/#\w+/g) || [];
            for (const tag of hashtags) {
                hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
            }

            // Extract words
            const words = text
                .replace(/https?:\/\/\S+/g, '')
                .replace(/nostr:\S+/g, '')
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length >= 4 && !stopwords.has(w));

            for (const word of words) {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            }
        }

        // Combine and sort
        const allTopics = [
            ...Array.from(hashtagCounts.entries()).map(([k, v]) => ({ topic: k, count: v, type: 'hashtag' })),
            ...Array.from(wordCounts.entries()).filter(([k, v]) => v >= 2).map(([k, v]) => ({ topic: k, count: v, type: 'keyword' }))
        ];

        allTopics.sort((a, b) => b.count - a.count);
        return allTopics.slice(0, 10);
    }

    /**
     * Find a trending note that might be interesting for Pixel to engage with
     * Returns a candidate note with engagement suggestions
     */
    findEngagementCandidate(options = {}) {
        const {
            excludeIds = new Set(),
            muteList = new Set(),
            preferHighZaps = false,
            maxAgeHours = 12
        } = options;

        const cutoff = Date.now() / 1000 - (maxAgeHours * 3600);
        const source = preferHighZaps ? this.mostZapped4h : this.trending24h;

        for (const note of source) {
            // Skip already processed
            if (excludeIds.has(note.id)) continue;

            // Skip muted authors
            if (muteList.has(note.pubkey)) continue;

            // Skip too old
            if (note.created_at < cutoff) continue;

            // Skip very short or very long content
            if (note.content.length < 20 || note.content.length > 1000) continue;

            // Skip notes that are just links or media
            if (note.content.match(/^(https?:\/\/|nostr:)/)) continue;

            return {
                note,
                suggestedAction: this._suggestAction(note),
                reason: preferHighZaps ? 'high_zaps' : 'trending'
            };
        }

        return null;
    }

    /**
     * Suggest what action might be appropriate for a trending note
     */
    _suggestAction(note) {
        const stats = note.stats || {};
        const content = note.content.toLowerCase();

        // If heavily zapped, might be worth a reaction
        if (stats.satszapped > 10000) {
            return 'react';
        }

        // If it's a question or discussion topic, might reply
        if (content.includes('?') || content.includes('what do you think')) {
            return 'reply';
        }

        // If it has many reposts, the content is widely shared
        if (stats.reposts > 10) {
            return 'react';
        }

        // Default to just observing (for context awareness)
        return 'observe';
    }

    /**
     * Get cache age info for monitoring
     */
    getCacheStatus() {
        const now = Date.now();
        return {
            trending24h: {
                count: this.trending24h.length,
                ageMs: now - this.lastFetch24h,
                stale: (now - this.lastFetch24h) > this.minFetchIntervalMs * 4
            },
            mostZapped4h: {
                count: this.mostZapped4h.length,
                ageMs: now - this.lastFetch4h,
                stale: (now - this.lastFetch4h) > this.minFetchIntervalMs * 4
            }
        };
    }
}

module.exports = { PrimalTrendingFeed };
