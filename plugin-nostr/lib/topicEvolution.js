// Topic Evolution utility
// - Labels subtopics (angles) for a topic using a small LLM with a deterministic prompt
// - Tracks per-topic clusters via NarrativeMemory (subtopics, timeline, current phase)
// - Detects simple phase changes and computes an evolution score

const crypto = require('crypto');

// Max content length included in the subtopic labeling prompt
const MAX_CONTENT_FOR_PROMPT = 300;

class TopicEvolution {
  constructor(runtime, logger, options = {}) {
    this.runtime = runtime;
    this.logger = logger || console;
    this.narrativeMemory = options.narrativeMemory || null;
    this.semanticAnalyzer = options.semanticAnalyzer || null;

    // Feature flags
    this.enabled = String(runtime?.getSetting?.('TOPIC_EVOLUTION_ENABLED') ?? process?.env?.TOPIC_EVOLUTION_ENABLED ?? 'true').toLowerCase() === 'true';
    this.phaseLlmEnabled = String(runtime?.getSetting?.('TOPIC_EVOLUTION_PHASE_LLM_ENABLED') ?? process?.env?.TOPIC_EVOLUTION_PHASE_LLM_ENABLED ?? 'true').toLowerCase() === 'true';

    // Cache
    this.cache = new Map();
    const ttlRaw = runtime?.getSetting?.('TOPIC_EVOLUTION_CACHE_TTL_MS') ?? process?.env?.TOPIC_EVOLUTION_CACHE_TTL_MS ?? '3600000';
    const ttlNum = Number(ttlRaw);
    this.cacheTTL = Number.isFinite(ttlNum) && ttlNum >= 0 ? ttlNum : 3600000;

    // Limits
    const minMentionsRaw = runtime?.getSetting?.('TOPIC_EVOLUTION_NOVEL_SUBTOPIC_MIN_MENTIONS') ?? process?.env?.TOPIC_EVOLUTION_NOVEL_SUBTOPIC_MIN_MENTIONS ?? '1';
    this.minNovelMentions = Math.max(0, parseInt(minMentionsRaw, 10) || 1);
    const phaseMinTimelineRaw = runtime?.getSetting?.('TOPIC_EVOLUTION_PHASE_MIN_TIMELINE') ?? process?.env?.TOPIC_EVOLUTION_PHASE_MIN_TIMELINE ?? '5';
    this.phaseMinTimeline = Math.max(1, parseInt(phaseMinTimelineRaw, 10) || 5);
  }

  _kebab(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 30) || '';
  }

  _cacheKey(topic, content) {
    const t = String(topic || '').toLowerCase();
    const c = String(content || '').toLowerCase().slice(0, 200);
    // Use a robust hash (sha256 truncated) to minimize cache key collisions
    const digest = crypto.createHash('sha256').update(c).digest('hex').slice(0, 16);
    return `${t}:${digest}`;
  }

  _getCache(key) {
    const v = this.cache.get(key);
    if (!v) return null;
    if (Date.now() - v.t > this.cacheTTL) { this.cache.delete(key); return null; }
    return v.value;
  }

  _setCache(key, value) { this.cache.set(key, { value, t: Date.now() }); }

  async labelSubtopic(topic, content, hints = {}) {
    const base = `${this._kebab(topic)}-general`;
    const cacheKey = this._cacheKey(topic, content);
    const cached = this._getCache(cacheKey);
    if (cached) return cached;

    // Heuristic fallback (works even if LLM disabled)
    const heuristic = () => {
      const lc = String(content || '').toLowerCase();
      if (/price|volatility|pump|dump|ath|value/.test(lc)) return `${this._kebab(topic)}-price`;
      if (/etf|regulation|legal|sec|approval|announce/.test(lc)) return `${this._kebab(topic)}-etf-approval`;
      if (/technical|upgrade|protocol|development|dev|nip/.test(lc)) return `${this._kebab(topic)}-technical`;
      if (/adoption|merchant|payment|mainstream|onboarding|growth/.test(lc)) return `${this._kebab(topic)}-adoption`;
      return base;
    };

    // Prefer a small LLM if available
    try {
      if (typeof this.runtime?.useModel === 'function') {
        const hintsStr = hints?.trending?.length ? `\nTrending: ${hints.trending.slice(0, 5).join(', ')}` : '';
  const prompt = `You label a post's specific angle as a short kebab-case subtopic for the topic "${topic}".
Return ONLY one token (<=30 chars). If unclear, return "${this._kebab(topic)}-general".
Examples: "bitcoin price swings" -> "bitcoin-price", "nostr relay outages" -> "nostr-infrastructure".

Content (<=${MAX_CONTENT_FOR_PROMPT} chars): ${String(content || '').slice(0, MAX_CONTENT_FOR_PROMPT)}${hintsStr}`;
        const res = await this.runtime.useModel('TEXT_SMALL', { prompt, maxTokens: 8, temperature: 0.1 });
        const text = typeof res === 'string' ? res : (res?.text ?? '');
        const token = this._kebab(text.split(/\s+/)[0] || text);
        const label = token || heuristic();
        this._setCache(cacheKey, label);
        return label;
      }
    } catch (err) {
      try { this.logger?.debug?.('[EVOLUTION] LLM subtopic label failed:', err?.message || err); } catch {}
    }

    const label = heuristic();
    this._setCache(cacheKey, label);
    return label;
  }

  _inferPhaseFromSubtopic(subtopic) {
    const s = String(subtopic || '').toLowerCase();
    if (/announce|approval|etf|release/.test(s)) return 'announcement';
    if (/adoption|onboarding|merchant|mainstream|growth/.test(s)) return 'adoption';
    if (/price|volatility|rumor|specul|pump|dump/.test(s)) return 'speculation';
    if (/analysis|technical|dev|upgrade|protocol|review/.test(s)) return 'analysis';
    if (/backlash|criticism|concern|ban|restriction/.test(s)) return 'backlash';
    return 'general';
  }

  _detectPhase(cluster) {
    if (!cluster || !Array.isArray(cluster.timeline) || cluster.timeline.length < this.phaseMinTimeline) {
      return { phase: cluster?.currentPhase || 'general', isChange: false };
    }
    // Look at the most recent N entries
    const recent = cluster.timeline.slice(-Math.min(cluster.timeline.length, 10));
    const last = recent[recent.length - 1];
    const inferred = this._inferPhaseFromSubtopic(last?.subtopic);
    const isChange = inferred !== (cluster.currentPhase || 'general');
    return { phase: inferred, isChange };
  }

  _evolutionScore(cluster, subtopic) {
    if (!cluster) return 0.0;
    const tl = cluster.timeline || [];
    const recent = tl.slice(-10);
    const unique = new Set(recent.map(e => e.subtopic)).size;
    const diversity = Math.min(1, unique / 5); // cap at 5 distinct in recent
    // recency: if subtopic is among the last 3, small bump
    const recentLabels = new Set(recent.slice(-3).map(e => e.subtopic));
    const recency = recentLabels.has(subtopic) ? 0.2 : 0.0;
    return Math.max(0, Math.min(1, diversity + recency));
  }

  async analyze(topic, content, contextHints = {}) {
    if (!this.enabled || !topic || !content) return null;
    const t = String(topic).toLowerCase();

    // Get cluster BEFORE recording to check novelty
    const clusterBefore = this.narrativeMemory?.getTopicCluster?.(t) || { subtopics: new Set(), timeline: [], currentPhase: null };
    const subtopic = await this.labelSubtopic(t, content, contextHints);
    const hadSubtopic = clusterBefore.subtopics instanceof Set ? clusterBefore.subtopics.has(subtopic) : false;

    // Record into memory
    try {
      this.narrativeMemory?.recordTopicAngle?.(t, subtopic, String(content).slice(0, 200), Date.now());
    } catch (e) {
      this.logger?.debug?.('[EVOLUTION] Failed to record topic angle:', e?.message || e);
    }

    const cluster = this.narrativeMemory?.getTopicCluster?.(t) || clusterBefore;
    // Detect phase
    const { phase, isChange } = this._detectPhase(cluster);
    try { this.narrativeMemory?.setTopicPhase?.(t, phase); } catch {}

    const score = this._evolutionScore(cluster, subtopic);

    return {
      subtopic,
      isNovelAngle: !hadSubtopic,
      isPhaseChange: !!isChange,
      phase,
      evolutionScore: score
    };
  }
}

module.exports = { TopicEvolution };
