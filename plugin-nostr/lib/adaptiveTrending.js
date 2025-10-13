// Adaptive Trending Algorithm for Nostr topics
// Considers velocity, novelty, baseline, and development signals.

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function extractKeywords(text) {
  if (!text) return [];
  const stop = new Set([
    'the','a','an','and','or','but','if','then','else','for','of','on','in','to','with','by','at','from','as','it','is','are','was','were','be','been','am','this','that','these','those','i','you','he','she','we','they','them','me','my','your','our','their','its','rt','http','https'
  ]);
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9#@_\-\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && w.length >= 3 && !stop.has(w))
    .slice(0, 20);
}

class AdaptiveTrending {
  constructor(options = {}) {
    this.minScoreThreshold = Number.isFinite(options.minScoreThreshold) ? options.minScoreThreshold : 1.2;
    this.recentWindowMs = Number.isFinite(options.recentWindowMs) ? options.recentWindowMs : 30 * 60 * 1000; // 30m
    this.previousWindowMs = Number.isFinite(options.previousWindowMs) ? options.previousWindowMs : 30 * 60 * 1000; // 30m
    this.baselineWindowMs = Number.isFinite(options.baselineWindowMs) ? options.baselineWindowMs : 24 * 60 * 60 * 1000; // 24h
    this.maxHistoryMs = Number.isFinite(options.maxHistoryMs) ? options.maxHistoryMs : 36 * 60 * 60 * 1000; // 36h
    this.topicHistory = new Map(); // topic -> [{ts, author, keywords[]}]
  }

  recordTopicMention(topic, evt) {
    if (!topic) return;
    const nowTs = evt?.created_at ? (typeof evt.created_at === 'number' ? evt.created_at * 1000 : evt.created_at) : Date.now();
    const author = evt?.pubkey || 'unknown';
    const keywords = extractKeywords(evt?.content || '');
    if (!this.topicHistory.has(topic)) this.topicHistory.set(topic, []);
    const arr = this.topicHistory.get(topic);
    arr.push({ ts: nowTs, author, keywords });
    // Trim very old
    const cutoff = nowTs - this.maxHistoryMs;
    while (arr.length && arr[0].ts < cutoff) arr.shift();
  }

  _countInWindow(history, start, end) {
    let c = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const ts = history[i].ts;
      if (ts < start) break; // earlier entries are ordered
      if (ts <= end) c++;
    }
    return c;
  }

  _uniqueAuthorsInWindow(history, start, end) {
    const s = new Set();
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item.ts < start) break;
      if (item.ts <= end) s.add(item.author);
    }
    return s.size;
  }

  _keywordsInWindow(history, start, end) {
    const s = new Set();
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item.ts < start) break;
      if (item.ts <= end && Array.isArray(item.keywords)) item.keywords.forEach(k => s.add(k));
    }
    return s;
  }

  _calculateVelocity(history, now) {
    const recentStart = now - this.recentWindowMs;
    const prevStart = now - this.recentWindowMs - this.previousWindowMs;
    const prevEnd = now - this.recentWindowMs;
    const recent = this._countInWindow(history, recentStart, now);
    const prev = this._countInWindow(history, prevStart, prevEnd);
    // Ratio of change, smoothed
    const ratio = (recent + 1) / (prev + 1);
    // Scale to 0..2 range roughly
    return clamp(ratio, 0, 4);
  }

  _calculateNovelty(topic, history, now) {
    const recentStart = now - this.recentWindowMs;
    const baselineStart = now - this.baselineWindowMs;
    const recentKeywords = this._keywordsInWindow(history, recentStart, now);
    const baselineKeywords = this._keywordsInWindow(history, baselineStart, recentStart);
    let newCount = 0;
    for (const k of recentKeywords) if (!baselineKeywords.has(k)) newCount++;
    const novelty = (newCount) / (recentKeywords.size + 1);
    // Also consider new authors appearing in recent window
    const recentAuthors = this._uniqueAuthorsInWindow(history, recentStart, now);
    const baselineAuthors = this._uniqueAuthorsInWindow(history, baselineStart, recentStart);
    const authorFactor = recentAuthors > 0 ? clamp((recentAuthors - baselineAuthors / 4) / (recentAuthors + 1), 0, 1) : 0; // small boost
    return clamp(novelty * 0.8 + authorFactor * 0.2, 0, 1.5);
  }

  _calculateDevelopment(history, now) {
    // Heuristic: consistency + diversity of keywords = development
    const recentStart = now - this.recentWindowMs;
    const veryRecentStart = now - Math.floor(this.recentWindowMs / 2);
    const recent = this._countInWindow(history, recentStart, now);
    const veryRecent = this._countInWindow(history, veryRecentStart, now);
    const diversity = this._keywordsInWindow(history, recentStart, now).size;
    const consistency = recent > 0 ? veryRecent / recent : 0;
    const dev = clamp((diversity / 20) * 0.5 + consistency * 0.5, 0, 1.5);
    return dev;
  }

  _baselineFactor(history, now) {
    const baselineStart = now - this.baselineWindowMs;
    const baselineCount = this._countInWindow(history, baselineStart, now);
    const perHour = this.baselineWindowMs > 0 ? baselineCount / (this.baselineWindowMs / (60 * 60 * 1000)) : baselineCount;
    // Normalize baseline activity to 0..1 range using a soft function
    const factor = 1 / (1 + Math.exp(perHour - 3)); // above ~3/hr diminishes factor
    return clamp(factor, 0.3, 1); // never 0, but reduces always-hot topics
  }

  _calculateTrendScore(topic, history, now) {
    const velocity = this._calculateVelocity(history, now); // ~0..4
    const novelty = this._calculateNovelty(topic, history, now); // ~0..1.5
    const development = this._calculateDevelopment(history, now); // ~0..1.5
    const baseline = this._baselineFactor(history, now); // 0.3..1
    // Weighted combination; baseline reduces score for constant topics
    const raw = (velocity * 0.6 + novelty * 0.3 + development * 0.1);
    const score = raw * baseline;
    return { score, velocity, novelty, development };
  }

  getTrendingTopics(limit = 5, nowTs = Date.now()) {
    const now = nowTs;
    const trending = [];
    for (const [topic, history] of this.topicHistory.entries()) {
      if (!history || history.length === 0) continue;
      const { score, velocity, novelty, development } = this._calculateTrendScore(topic, history, now);
      if (score > this.minScoreThreshold) {
        // Intensity is a normalized mapping of score; cap for readability
        const intensity = clamp((score - this.minScoreThreshold) / (2.5 - this.minScoreThreshold), 0, 1);
        trending.push({ topic, score, velocity, novelty, development, intensity });
      }
    }
    trending.sort((a, b) => b.score - a.score);
    return trending.slice(0, Math.max(1, limit));
  }
}

module.exports = { AdaptiveTrending };
