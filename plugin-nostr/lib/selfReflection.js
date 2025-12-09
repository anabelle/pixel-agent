const { ensureNostrContextSystem, createMemorySafe } = require('./context');
const { generateWithModelOrFallback } = require('./generation');
const { extractTextFromModelResult } = require('./text');

let ModelType;
try {
  const core = require('@elizaos/core');
  ModelType = core.ModelType || core.ModelClass || { TEXT_SMALL: 'TEXT_SMALL', TEXT_LARGE: 'TEXT_LARGE' };
} catch {
  ModelType = { TEXT_SMALL: 'TEXT_SMALL', TEXT_LARGE: 'TEXT_LARGE' };
}

const DEFAULT_MAX_INTERACTIONS = 40;
const DEFAULT_TEMPERATURE = 0.75;
const DEFAULT_MAX_TOKENS = 800;

class SelfReflectionEngine {
  constructor(runtime, logger, options = {}) {
    this.runtime = runtime;
    this.logger = logger || console;
    this.createUniqueUuid = options.createUniqueUuid;
    this.ChannelType = options.ChannelType || null;
    this.userProfileManager = options.userProfileManager || null;
    this.agentPubkey = runtime?.getSetting?.('NOSTR_PUBLIC_KEY') || null;

    const enabledSetting = runtime?.getSetting?.('NOSTR_SELF_REFLECTION_ENABLE');
    this.enabled = String(enabledSetting ?? 'true').toLowerCase() === 'true';

    const limitSetting = Number(runtime?.getSetting?.('NOSTR_SELF_REFLECTION_INTERACTION_LIMIT'));
    const optionLimit = Number(options.maxInteractions);
    const maxInteractions = [limitSetting, optionLimit, DEFAULT_MAX_INTERACTIONS]
      .find((value) => Number.isFinite(value) && value > 0);
    this.maxInteractions = maxInteractions || DEFAULT_MAX_INTERACTIONS;

    const temperatureSetting = Number(runtime?.getSetting?.('NOSTR_SELF_REFLECTION_TEMPERATURE'));
    const optionTemperature = Number(options.temperature);
    const temperature = [temperatureSetting, optionTemperature, DEFAULT_TEMPERATURE]
      .find((value) => typeof value === 'number' && !Number.isNaN(value));
    this.temperature = temperature ?? DEFAULT_TEMPERATURE;

    const maxTokensSetting = Number(runtime?.getSetting?.('NOSTR_SELF_REFLECTION_MAX_TOKENS'));
    const optionMaxTokens = Number(options.maxTokens);
    const maxTokens = [maxTokensSetting, optionMaxTokens, DEFAULT_MAX_TOKENS]
      .find((value) => Number.isFinite(value) && value > 0);
    this.maxTokens = maxTokens || DEFAULT_MAX_TOKENS;

    const zapCorrelationSetting = runtime?.getSetting?.('NOSTR_SELF_REFLECTION_ZAP_CORRELATION_ENABLE');
    this.zapCorrelationEnabled = String(zapCorrelationSetting ?? 'true').toLowerCase() === 'true';

    this._systemContext = null;
    this._systemContextPromise = null;
    this.lastAnalysis = null;
    this._latestInsightsCache = null;

    if (this.enabled) {
      this.logger.info(`[SELF-REFLECTION] Enabled (limit=${this.maxInteractions}, temperature=${this.temperature}, maxTokens=${this.maxTokens})`);
    } else {
      this.logger.info('[SELF-REFLECTION] Disabled via configuration');
    }
  }

  async analyzeInteractionQuality(options = {}) {
    if (!this.enabled) {
      return null;
    }

    const { interactions, contextSignals } = await this.getRecentInteractions(options.limit);
    if (!interactions.length) {
      this.logger.debug('[SELF-REFLECTION] No recent interactions available for analysis');
      return null;
    }

    const previousReflections = await this.getReflectionHistory({
      limit: Number(options.reflectionHistoryLimit) || 3,
      maxAgeHours: Number.isFinite(options.reflectionHistoryMaxAgeHours)
        ? options.reflectionHistoryMaxAgeHours
        : 24 * 14 // default: past two weeks
    });

    // Fetch longitudinal analysis if enabled
    let longitudinalAnalysis = null;
    const enableLongitudinal = options.enableLongitudinal !== false; // enabled by default
    if (enableLongitudinal) {
      try {
        longitudinalAnalysis = await this.analyzeLongitudinalPatterns({
          limit: 20,
          maxAgeDays: 90
        });
        if (longitudinalAnalysis) {
          this.logger.debug(`[SELF-REFLECTION] Longitudinal analysis: ${longitudinalAnalysis.recurringIssues.length} recurring issues, ${longitudinalAnalysis.persistentStrengths.length} persistent strengths`);
        }
      } catch (err) {
        this.logger.debug('[SELF-REFLECTION] Failed to generate longitudinal analysis:', err?.message || err);
      }
    }

    const prompt = this._buildPrompt(interactions, {
      contextSignals,
      previousReflections,
      longitudinalAnalysis
    });
    const modelType = this._getLargeModelType();
    let response = '';
    try {
      response = await generateWithModelOrFallback(
        this.runtime,
        modelType,
        prompt,
        { temperature: this.temperature, maxTokens: this.maxTokens },
        (res) => extractTextFromModelResult(res),
        (s) => s
      );
      if (!response || !String(response).trim()) {
        this.logger.warn('[SELF-REFLECTION] Empty LLM response for reflection');
        return null;
      }
    } catch (err) {
      this.logger.warn('[SELF-REFLECTION] Failed to generate reflection:', err?.message || err);
      return null;
    }

    const parsed = this._extractJson(response);
    if (!parsed) {
      this.logger.debug('[SELF-REFLECTION] Reflection response did not include valid JSON payload');
    }

    await this.storeReflection({
      analysis: parsed,
      raw: response,
      prompt,
      interactions,
      contextSignals,
      previousReflections,
      longitudinalAnalysis
    });

    this.lastAnalysis = {
      timestamp: Date.now(),
      interactionsAnalyzed: interactions.length,
      strengths: parsed?.strengths || [],
      weaknesses: parsed?.weaknesses || []
    };

    if (parsed) {
      const highlight = parsed.strengths?.[0] || parsed.recommendations?.[0] || 'analysis complete';
      this.logger.info(`[SELF-REFLECTION] Completed analysis on ${interactions.length} interactions → ${highlight}`);
    }

    return parsed;
  }

  _getLargeModelType() {
    return (ModelType && (ModelType.TEXT_LARGE || ModelType.LARGE || ModelType.MEDIUM || ModelType.TEXT_SMALL)) || 'TEXT_LARGE';
  }

  async getRecentInteractions(limit = this.maxInteractions) {
    if (!this.runtime || typeof this.runtime.getMemories !== 'function') {
      return { interactions: [], contextSignals: [] };
    }

    const fetchCount = Math.max(limit * 8, limit + 40);
    let memories = [];

    try {
      memories = await this.runtime.getMemories({
        tableName: 'messages',
        agentId: this.runtime.agentId,
        count: fetchCount,
        unique: false
      });
    } catch (err) {
      this.logger.debug('[SELF-REFLECTION] Failed to load memories:', err?.message || err);
      return { interactions: [], contextSignals: [] };
    }

    if (!Array.isArray(memories) || memories.length === 0) {
      return { interactions: [], contextSignals: [] };
    }

    const sortedMemories = memories
      .filter((memory) => memory && memory.content)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    const memoryById = new Map();
    const memoriesByRoom = new Map();
    for (const memory of sortedMemories) {
      if (memory.id) {
        memoryById.set(memory.id, memory);
      }
      if (memory.roomId) {
        if (!memoriesByRoom.has(memory.roomId)) {
          memoriesByRoom.set(memory.roomId, []);
        }
        memoriesByRoom.get(memory.roomId).push(memory);
      }
    }

    const interactions = [];
    const seenReplyIds = new Set();

    for (let idx = sortedMemories.length - 1; idx >= 0; idx -= 1) {
      if (interactions.length >= limit) {
        break;
      }

      const memory = sortedMemories[idx];
      if (!this._isAgentReplyMemory(memory)) {
        continue;
      }

      if (seenReplyIds.has(memory.id)) {
        continue;
      }
      seenReplyIds.add(memory.id);

      const parentId = memory.content?.inReplyTo;
      let parentMemory = parentId ? memoryById.get(parentId) : null;
      if (!parentMemory && parentId) {
        try {
          parentMemory = await this.runtime.getMemoryById(parentId);
          if (parentMemory?.id) {
            memoryById.set(parentMemory.id, parentMemory);
            if (parentMemory.roomId) {
              if (!memoriesByRoom.has(parentMemory.roomId)) {
                memoriesByRoom.set(parentMemory.roomId, []);
              }
              memoriesByRoom.get(parentMemory.roomId).push(parentMemory);
              memoriesByRoom.get(parentMemory.roomId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            }
          }
        } catch (err) {
          this.logger.debug(`[SELF-REFLECTION] Failed to fetch parent memory ${String(parentId).slice(0, 8)}:`, err?.message || err);
        }
      }

      if (!parentMemory || !parentMemory.content) {
        continue;
      }

      const userText = String(parentMemory.content?.text || parentMemory.content?.event?.content || '').trim();
      const replyText = String(memory.content?.text || '').trim();
      if (!userText || !replyText) {
        continue;
      }

      const roomMemories = memoriesByRoom.get(memory.roomId) || [];
      const conversation = this._buildConversationWindow(roomMemories, memory, parentMemory);
      const feedback = this._collectFeedback(conversation, memory.id);
      const timeWindow = this._deriveTimeWindow(conversation, memory.createdAt, parentMemory.createdAt);
      const signals = await this._collectSignalsForInteraction(sortedMemories, memory, timeWindow);

      const pubkey = parentMemory.content?.event?.pubkey;
      let engagementSummary = 'unknown';
      if (pubkey && this.userProfileManager && typeof this.userProfileManager.getEngagementStats === 'function') {
        try {
          const stats = await this.userProfileManager.getEngagementStats(pubkey);
          engagementSummary = this._formatEngagement(stats);
        } catch (err) {
          this.logger.debug(`[SELF-REFLECTION] Engagement lookup failed for ${this._maskPubkey(pubkey)}:`, err?.message || err);
        }
      }

      interactions.push({
        userMessage: this._truncate(userText),
        yourReply: this._truncate(replyText),
        engagement: engagementSummary,
        conversation,
        feedback,
        signals,
        metadata: {
          pubkey: pubkey ? this._maskPubkey(pubkey) : 'unknown',
          replyId: memory.id,
          replyRoomId: memory.roomId || null,
          createdAt: memory.createdAt || Date.now(),
          createdAtIso: this._toIsoString(memory.createdAt),
          participants: Array.from(new Set(conversation.map((entry) => entry.author).filter(Boolean)))
        }
      });
    }

    const contextSignals = this._collectGlobalSignals(sortedMemories);
    return { interactions, contextSignals };
  }

  async storeReflection(payload) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return false;
    }

    try {
      const context = await this._ensureSystemContext();
      const roomId = context?.rooms?.selfReflection || this._createUuid('nostr-self-reflection');
      const entityId = context?.entityId || this._createUuid('nostr-self-reflection-entity');
      const memoryId = this._createUuid(`nostr-self-reflection-${Date.now()}`);

      const memory = {
        id: memoryId,
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: 'self_reflection',
          source: 'nostr',
          data: {
            generatedAt: new Date().toISOString(),
            interactionsAnalyzed: payload.interactions?.length || 0,
            analysis: payload.analysis || null,
            rawOutput: this._trim(payload.raw, 4000),
            promptPreview: this._trim(payload.prompt, 2000),
            context: {
              interactions: Array.isArray(payload.interactions)
                ? payload.interactions.map((interaction) => this._serializeInteractionSnapshot(interaction))
                : [],
              signals: Array.isArray(payload.contextSignals)
                ? payload.contextSignals.map((signal) => this._truncate(String(signal || ''), 320))
                : [],
              previousReflections: Array.isArray(payload.previousReflections)
                ? payload.previousReflections.map((summary) => ({
                    generatedAt: summary?.generatedAt || null,
                    generatedAtIso: summary?.generatedAtIso || null,
                    strengths: this._toLimitedList(summary?.strengths || [], 4),
                    weaknesses: this._toLimitedList(summary?.weaknesses || [], 4),
                    recommendations: this._toLimitedList(summary?.recommendations || [], 4),
                    patterns: this._toLimitedList(summary?.patterns || [], 4),
                    improvements: this._toLimitedList(summary?.improvements || [], 4),
                    regressions: this._toLimitedList(summary?.regressions || [], 4)
                  }))
                : []
            },
            longitudinalAnalysis: payload.longitudinalAnalysis ? {
              timespan: payload.longitudinalAnalysis.timespan,
              recurringIssuesCount: payload.longitudinalAnalysis.recurringIssues?.length || 0,
              persistentStrengthsCount: payload.longitudinalAnalysis.persistentStrengths?.length || 0,
              recurringIssues: this._toLimitedList(
                payload.longitudinalAnalysis.recurringIssues?.map(i => i.issue) || [],
                5
              ),
              persistentStrengths: this._toLimitedList(
                payload.longitudinalAnalysis.persistentStrengths?.map(s => s.strength) || [],
                5
              ),
              evolutionTrends: payload.longitudinalAnalysis.evolutionTrends
            } : null
          }
        },
        createdAt: Date.now()
      };

      if (context?.worldId) {
        memory.worldId = context.worldId;
      }

      const result = await createMemorySafe(this.runtime, memory, 'messages', 3, this.logger);
      if (result && (result === true || result.created)) {
        this.logger.debug('[SELF-REFLECTION] Stored reflection insights');
      } else {
        this.logger.warn('[SELF-REFLECTION] Failed to persist reflection insights');
      }

      const cacheSummary = this._buildInsightsSummary(payload.analysis, {
        generatedAt: Date.now(),
        generatedAtIso: new Date().toISOString(),
        interactionsAnalyzed: payload.interactions?.length || payload.analysis?.interactionsAnalyzed || null
      });
      this._latestInsightsCache = { timestamp: Date.now(), data: cacheSummary };
      return true;
    } catch (err) {
      this.logger.debug('[SELF-REFLECTION] Failed to store reflection:', err?.message || err);
      return false;
    }
  }

  async getLatestInsights(options = {}) {
    if (!this.enabled) {
      return null;
    }

    const cacheMs = Number.isFinite(options.cacheMs) ? options.cacheMs : 5 * 60 * 1000;
    if (cacheMs > 0 && this._latestInsightsCache) {
      const age = Date.now() - this._latestInsightsCache.timestamp;
      if (age >= 0 && age < cacheMs) {
        return this._latestInsightsCache.data || null;
      }
    }

    const maxAgeMs = Number.isFinite(options.maxAgeHours) ? options.maxAgeHours * 60 * 60 * 1000 : null;
    const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 5;

    let memories = [];
    if (this.runtime && typeof this.runtime.getMemories === 'function') {
      try {
        const context = await this._ensureSystemContext();
        const roomId = context?.rooms?.selfReflection || this._createUuid('nostr-self-reflection');
        if (roomId) {
          memories = await this.runtime.getMemories({
            tableName: 'messages',
            roomId,
            count: limit
          });
        }
      } catch (err) {
        this.logger.debug('[SELF-REFLECTION] Failed to load reflection memories:', err?.message || err);
      }
    }

    let summary = null;
    if (Array.isArray(memories) && memories.length) {
      const now = Date.now();
      for (const memory of memories) {
        const data = memory?.content?.data;
        const analysis = data?.analysis;
        if (!analysis || typeof analysis !== 'object') {
          continue;
        }

        const generatedIso = typeof data.generatedAt === 'string' ? data.generatedAt : null;
        const parsedTs = generatedIso ? Date.parse(generatedIso) : null;
        const createdAt = Number.isFinite(parsedTs) ? parsedTs : Number(memory?.createdAt) || null;
        if (maxAgeMs && createdAt && (now - createdAt) > maxAgeMs) {
          continue;
        }

        summary = this._buildInsightsSummary(analysis, {
          generatedAt: createdAt,
          generatedAtIso: generatedIso,
          interactionsAnalyzed: data?.interactionsAnalyzed
        });
        if (summary) {
          break;
        }
      }
    }

    if (!summary && this.lastAnalysis) {
      summary = this._buildInsightsSummary({
        strengths: this.lastAnalysis.strengths,
        weaknesses: this.lastAnalysis.weaknesses,
        recommendations: [],
        patterns: [],
        exampleGoodReply: null,
        exampleBadReply: null
      }, {
        generatedAt: this.lastAnalysis.timestamp,
        interactionsAnalyzed: this.lastAnalysis.interactionsAnalyzed
      });
    }

    this._latestInsightsCache = { timestamp: Date.now(), data: summary || null };
    return summary || null;
  }

  async getReflectionHistory(options = {}) {
    if (!this.enabled || !this.runtime || typeof this.runtime.getMemories !== 'function') {
      return [];
    }

    const limit = Math.max(1, Math.min(10, Number(options.limit) || 3));
    const maxAgeMs = Number.isFinite(options.maxAgeHours)
      ? options.maxAgeHours * 60 * 60 * 1000
      : null;

    let memories = [];
    try {
      const context = await this._ensureSystemContext();
      const roomId = context?.rooms?.selfReflection || this._createUuid('nostr-self-reflection');
      if (!roomId) {
        return [];
      }

      memories = await this.runtime.getMemories({
        tableName: 'messages',
        roomId,
        count: Math.max(limit * 2, limit + 2)
      });
    } catch (err) {
      this.logger.debug('[SELF-REFLECTION] Failed to load reflection history:', err?.message || err);
      return [];
    }

    if (!Array.isArray(memories) || !memories.length) {
      return [];
    }

    const now = Date.now();
    const summaries = [];
    for (const memory of memories) {
      const data = memory?.content?.data;
      const analysis = data?.analysis;
      // Skip invalid reflections - require proper structure
      if (!analysis || !this._hasMinimalReflectionData(analysis)) {
        continue;
      }

      const generatedIso = typeof data?.generatedAt === 'string' ? data.generatedAt : null;
      const generatedAt = generatedIso ? Date.parse(generatedIso) : Number(memory?.createdAt) || null;
      if (maxAgeMs && generatedAt && (now - generatedAt) > maxAgeMs) {
        continue;
      }

      const summary = this._buildInsightsSummary(analysis, {
        generatedAt,
        generatedAtIso: generatedIso,
        interactionsAnalyzed: data?.interactionsAnalyzed
      });

      if (summary) {
        summary.memoryId = memory.id || null;
        summaries.push(summary);
      }

      if (summaries.length >= limit) {
        break;
      }
    }

    return summaries;
  }

  async getLongTermReflectionHistory(options = {}) {
    if (!this.enabled || !this.runtime || typeof this.runtime.getMemories !== 'function') {
      return [];
    }

    const limit = Math.max(1, Math.min(50, Number(options.limit) || 20));
    const maxAgeMs = Number.isFinite(options.maxAgeDays)
      ? options.maxAgeDays * 24 * 60 * 60 * 1000
      : 90 * 24 * 60 * 60 * 1000; // default: 90 days

    let memories = [];
    try {
      const context = await this._ensureSystemContext();
      const roomId = context?.rooms?.selfReflection || this._createUuid('nostr-self-reflection');
      if (!roomId) {
        return [];
      }

      memories = await this.runtime.getMemories({
        tableName: 'messages',
        roomId,
        count: Math.max(limit * 2, 100)
      });
    } catch (err) {
      this.logger.debug('[SELF-REFLECTION] Failed to load long-term reflection history:', err?.message || err);
      return [];
    }

    if (!Array.isArray(memories) || !memories.length) {
      return [];
    }

    const now = Date.now();
    const summaries = [];
    for (const memory of memories) {
      const data = memory?.content?.data;
      const analysis = data?.analysis;
      if (!analysis) {
        continue;
      }

      const generatedIso = typeof data?.generatedAt === 'string' ? data.generatedAt : null;
      const generatedAt = generatedIso ? Date.parse(generatedIso) : Number(memory?.createdAt) || null;
      
      if (!generatedAt || (now - generatedAt) > maxAgeMs) {
        continue;
      }

      const summary = this._buildInsightsSummary(analysis, {
        generatedAt,
        generatedAtIso: generatedIso,
        interactionsAnalyzed: data?.interactionsAnalyzed
      });

      if (summary) {
        summary.memoryId = memory.id || null;
        summaries.push(summary);
      }

      if (summaries.length >= limit) {
        break;
      }
    }

    return summaries;
  }

  async analyzeLongitudinalPatterns(options = {}) {
    if (!this.enabled) {
      return null;
    }

    const longTermHistory = await this.getLongTermReflectionHistory({
      limit: Number(options.limit) || 20,
      maxAgeDays: Number(options.maxAgeDays) || 90
    });

    if (!longTermHistory || longTermHistory.length < 2) {
      this.logger.debug('[SELF-REFLECTION] Insufficient history for longitudinal analysis');
      return null;
    }

    // Group reflections by time period
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    const periods = {
      recent: [],      // Last week
      oneWeekAgo: [],  // 1-2 weeks ago
      oneMonthAgo: [], // 3-5 weeks ago
      older: []        // Older than 5 weeks
    };

    for (const reflection of longTermHistory) {
      if (!reflection.generatedAt) continue;
      
      const age = now - reflection.generatedAt;
      if (age <= oneWeek) {
        periods.recent.push(reflection);
      } else if (age <= 2 * oneWeek) {
        periods.oneWeekAgo.push(reflection);
      } else if (age <= 5 * oneWeek) {
        periods.oneMonthAgo.push(reflection);
      } else {
        periods.older.push(reflection);
      }
    }

    // Extract all strengths, weaknesses, patterns across time
    const allStrengths = new Map();
    const allWeaknesses = new Map();
    const allPatterns = new Map();

    for (const period of Object.keys(periods)) {
      for (const reflection of periods[period]) {
        // Track strengths
        for (const strength of reflection.strengths || []) {
          const key = this._normalizeForComparison(strength);
          if (!allStrengths.has(key)) {
            allStrengths.set(key, { text: strength, periods: new Set(), count: 0 });
          }
          allStrengths.get(key).periods.add(period);
          allStrengths.get(key).count++;
        }

        // Track weaknesses
        for (const weakness of reflection.weaknesses || []) {
          const key = this._normalizeForComparison(weakness);
          if (!allWeaknesses.has(key)) {
            allWeaknesses.set(key, { text: weakness, periods: new Set(), count: 0 });
          }
          allWeaknesses.get(key).periods.add(period);
          allWeaknesses.get(key).count++;
        }

        // Track patterns
        for (const pattern of reflection.patterns || []) {
          const key = this._normalizeForComparison(pattern);
          if (!allPatterns.has(key)) {
            allPatterns.set(key, { text: pattern, periods: new Set(), count: 0 });
          }
          allPatterns.get(key).periods.add(period);
          allPatterns.get(key).count++;
        }
      }
    }

    // Identify recurring issues (weaknesses that appear across multiple time periods)
    const recurringIssues = [];
    for (const [key, data] of allWeaknesses.entries()) {
      if (data.periods.size >= 2 || data.count >= 3) {
        recurringIssues.push({
          issue: data.text,
          occurrences: data.count,
          periodsCovered: Array.from(data.periods),
          severity: data.periods.has('recent') ? 'ongoing' : 'resolved'
        });
      }
    }

    // Identify persistent strengths (strengths that appear consistently over time)
    const persistentStrengths = [];
    for (const [key, data] of allStrengths.entries()) {
      if (data.periods.size >= 2 || data.count >= 3) {
        persistentStrengths.push({
          strength: data.text,
          occurrences: data.count,
          periodsCovered: Array.from(data.periods),
          consistency: data.periods.has('recent') && data.periods.has('older') ? 'stable' : 'emerging'
        });
      }
    }

    // Identify evolving patterns
    const evolvingPatterns = [];
    for (const [key, data] of allPatterns.entries()) {
      if (data.periods.size >= 2) {
        evolvingPatterns.push({
          pattern: data.text,
          occurrences: data.count,
          periodsCovered: Array.from(data.periods)
        });
      }
    }

    // Detect evolution trends (comparing recent vs older periods)
    const evolutionTrends = this._detectEvolutionTrends(periods);

    return {
      timespan: {
        oldestReflection: longTermHistory[longTermHistory.length - 1]?.generatedAtIso,
        newestReflection: longTermHistory[0]?.generatedAtIso,
        totalReflections: longTermHistory.length
      },
      recurringIssues: recurringIssues.sort((a, b) => b.occurrences - a.occurrences).slice(0, 5),
      persistentStrengths: persistentStrengths.sort((a, b) => b.occurrences - a.occurrences).slice(0, 5),
      evolvingPatterns: evolvingPatterns.slice(0, 5),
      evolutionTrends,
      periodBreakdown: {
        recent: periods.recent.length,
        oneWeekAgo: periods.oneWeekAgo.length,
        oneMonthAgo: periods.oneMonthAgo.length,
        older: periods.older.length
      }
    };
  }

  _normalizeForComparison(text) {
    if (!text || typeof text !== 'string') return '';
    // Normalize to lowercase, remove extra spaces, and basic punctuation for comparison
    return text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
  }

  _detectEvolutionTrends(periods) {
    const trends = {
      strengthsGained: [],
      weaknessesResolved: [],
      newChallenges: [],
      stagnantAreas: []
    };

    // Compare recent period with older periods
    const recentStrengths = new Set();
    const recentWeaknesses = new Set();
    const olderStrengths = new Set();
    const olderWeaknesses = new Set();

    for (const reflection of periods.recent) {
      for (const strength of reflection.strengths || []) {
        recentStrengths.add(this._normalizeForComparison(strength));
      }
      for (const weakness of reflection.weaknesses || []) {
        recentWeaknesses.add(this._normalizeForComparison(weakness));
      }
    }

    for (const reflection of [...periods.oneMonthAgo, ...periods.older]) {
      for (const strength of reflection.strengths || []) {
        olderStrengths.add(this._normalizeForComparison(strength));
      }
      for (const weakness of reflection.weaknesses || []) {
        olderWeaknesses.add(this._normalizeForComparison(weakness));
      }
    }

    // New strengths (appearing in recent but not in older)
    for (const strength of recentStrengths) {
      if (!olderStrengths.has(strength)) {
        trends.strengthsGained.push(strength);
      }
    }

    // Resolved weaknesses (appearing in older but not in recent)
    for (const weakness of olderWeaknesses) {
      if (!recentWeaknesses.has(weakness)) {
        trends.weaknessesResolved.push(weakness);
      }
    }

    // New challenges (appearing in recent but not in older)
    for (const weakness of recentWeaknesses) {
      if (!olderWeaknesses.has(weakness)) {
        trends.newChallenges.push(weakness);
      }
    }

    // Stagnant areas (weaknesses appearing in both recent and older)
    for (const weakness of recentWeaknesses) {
      if (olderWeaknesses.has(weakness)) {
        trends.stagnantAreas.push(weakness);
      }
    }

    return {
      strengthsGained: trends.strengthsGained.slice(0, 3),
      weaknessesResolved: trends.weaknessesResolved.slice(0, 3),
      newChallenges: trends.newChallenges.slice(0, 3),
      stagnantAreas: trends.stagnantAreas.slice(0, 3)
    };
  }

  _toLimitedList(value, limit = 4) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => this._truncate(String(item || ''), 220))
      .filter(Boolean)
      .slice(0, limit);
  }

  _buildInsightsSummary(analysis, meta = {}) {
    if (!analysis || typeof analysis !== 'object') {
      return null;
    }

    const limit = Number.isFinite(meta.limit) && meta.limit > 0 ? meta.limit : 4;
    const timestamp = Number.isFinite(meta.generatedAt) ? meta.generatedAt : null;
    let iso = typeof meta.generatedAtIso === 'string' ? meta.generatedAtIso : null;
    if (!iso && Number.isFinite(timestamp)) {
      try {
        iso = new Date(timestamp).toISOString();
      } catch {}
    }

    const summary = {
      generatedAt: timestamp,
      generatedAtIso: iso,
      strengths: this._toLimitedList(analysis.strengths, limit),
      weaknesses: this._toLimitedList(analysis.weaknesses, limit),
      recommendations: this._toLimitedList(analysis.recommendations, limit),
      patterns: this._toLimitedList(analysis.patterns, limit),
      improvements: this._toLimitedList(analysis.improvements, limit),
      regressions: this._toLimitedList(analysis.regressions, limit),
      exampleGoodReply: analysis.exampleGoodReply ? this._truncate(String(analysis.exampleGoodReply), 320) : null,
      exampleBadReply: analysis.exampleBadReply ? this._truncate(String(analysis.exampleBadReply), 320) : null,
      interactionsAnalyzed: Number.isFinite(meta.interactionsAnalyzed) ? meta.interactionsAnalyzed : null
    };

    const hasContent = summary.strengths.length || summary.weaknesses.length || summary.recommendations.length || summary.patterns.length || summary.improvements.length || summary.regressions.length || summary.exampleGoodReply || summary.exampleBadReply;
    return hasContent ? summary : null;
  }

  _isAgentReplyMemory(memory) {
    if (!memory || !memory.content) {
      return false;
    }
    if (!memory.content.inReplyTo) {
      return false;
    }
    const text = memory.content.text;
    if (!text || typeof text !== 'string') {
      return false;
    }
    if (memory.content.source !== 'nostr') {
      return false;
    }
    return true;
  }

  _buildConversationWindow(roomMemories, replyMemory, parentMemory) {
    const windowBefore = Number(this.runtime?.getSetting?.('NOSTR_SELF_REFLECTION_CONVO_BEFORE')) || 4;
    const windowAfter = Number(this.runtime?.getSetting?.('NOSTR_SELF_REFLECTION_CONVO_AFTER')) || 3;
    const entries = [];

    if (!Array.isArray(roomMemories) || !roomMemories.length) {
      return entries;
    }

    const ordered = roomMemories.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    let replyIndex = ordered.findIndex((m) => m.id === replyMemory.id);
    if (replyIndex === -1) {
      ordered.push(replyMemory);
      ordered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      replyIndex = ordered.findIndex((m) => m.id === replyMemory.id);
    }

    const start = Math.max(0, replyIndex - windowBefore);
    const end = Math.min(ordered.length, replyIndex + windowAfter + 1);
    const slice = ordered.slice(start, end);

    if (parentMemory && !slice.some((m) => m.id === parentMemory.id)) {
      slice.unshift(parentMemory);
    }

    return slice.map((memory) => this._formatConversationEntry(memory, replyMemory));
  }

  _formatConversationEntry(memory, replyMemory) {
    const createdAt = memory?.createdAt || null;
    const createdAtIso = this._toIsoString(createdAt);
    const text = this._truncate(
      String(
        memory?.content?.text ||
        memory?.content?.event?.content ||
        memory?.content?.data?.summary ||
        memory?.content?.data?.text ||
        ''
      ),
      320
    );

    const eventPubkey = memory?.content?.event?.pubkey || null;
    const typeLabel = memory?.content?.type || memory?.content?.data?.type || null;
    const role = this._inferRoleFromMemory(memory, replyMemory);
    const author = role === 'you'
      ? 'you'
      : eventPubkey
        ? this._maskPubkey(eventPubkey)
        : memory.entityId
          ? this._maskPubkey(memory.entityId)
          : 'unknown';

    return {
      id: memory?.id || null,
      role,
      author,
      text,
      type: typeLabel,
      createdAt,
      createdAtIso,
      isReply: memory?.id === replyMemory?.id
    };
  }

  _inferRoleFromMemory(memory, replyMemory) {
    if (!memory || !memory.content) {
      return 'unknown';
    }

    if (replyMemory && memory.id === replyMemory.id) {
      return 'you';
    }

    if (this.agentPubkey && memory.content?.event?.pubkey === this.agentPubkey) {
      return 'you';
    }

    if (memory.content?.event?.pubkey) {
      return 'user';
    }

    if (!memory.content?.event && memory.content?.source === 'nostr' && memory.content?.text) {
      return 'you';
    }

    if (memory.content?.source === 'nostr' && memory.content?.data?.triggerEvent) {
      return 'system';
    }

    return 'unknown';
  }

  _collectFeedback(conversationEntries, replyId) {
    if (!Array.isArray(conversationEntries) || !conversationEntries.length) {
      return [];
    }

    const replyIndex = conversationEntries.findIndex((entry) => entry.id === replyId || entry.isReply);
    if (replyIndex === -1) {
      return [];
    }

    return conversationEntries
      .slice(replyIndex + 1)
      .filter((entry) => entry.role !== 'you' && entry.text)
      .slice(0, 3)
      .map((entry) => ({
        author: entry.author,
        summary: entry.text,
        createdAtIso: entry.createdAtIso
      }));
  }

  _deriveTimeWindow(conversationEntries, replyCreatedAt, parentCreatedAt) {
    const timestamps = conversationEntries
      .map((entry) => entry.createdAt)
      .filter((value) => Number.isFinite(value));

    if (Number.isFinite(replyCreatedAt)) {
      timestamps.push(replyCreatedAt);
    }
    if (Number.isFinite(parentCreatedAt)) {
      timestamps.push(parentCreatedAt);
    }

    if (!timestamps.length) {
      return null;
    }

    timestamps.sort((a, b) => a - b);
    const padding = 15 * 60 * 1000; // 15 minutes before/after
    return {
      start: timestamps[0] - padding,
      end: timestamps[timestamps.length - 1] + padding
    };
  }

  async _collectSignalsForInteraction(allMemories, replyMemory, timeWindow) {
    if (!Array.isArray(allMemories) || !allMemories.length) {
      return [];
    }

    const signals = [];
    const windowStart = timeWindow?.start ?? (replyMemory.createdAt || 0) - 30 * 60 * 1000;
    const windowEnd = timeWindow?.end ?? (replyMemory.createdAt || 0) + 30 * 60 * 1000;

    for (const memory of allMemories) {
      if (memory.id === replyMemory.id) {
        continue;
      }

      const createdAt = memory.createdAt || 0;
      if (createdAt < windowStart || createdAt > windowEnd) {
        continue;
      }

      const typeLabel = memory.content?.type || memory.content?.data?.type;
      const hasInterestingType = typeLabel && !['self_reflection', 'nostr_thread_context'].includes(typeLabel);
      if (!hasInterestingType) {
        continue;
      }

      let signalText = '';

      // Special handling for zap_thanks with correlation
      if (typeLabel === 'zap_thanks' && this.zapCorrelationEnabled) {
        const targetEventId = memory.content?.data?.targetEventId;
        if (targetEventId && this.runtime?.getMemoryById) {
          try {
            const targetMemory = await this.runtime.getMemoryById(targetEventId);
            if (targetMemory?.content) {
              const targetText = String(
                targetMemory.content?.text ||
                targetMemory.content?.event?.content ||
                targetMemory.content?.data?.text ||
                ''
              ).trim();

              if (targetText) {
                const truncatedTarget = this._truncate(targetText, 150);
                const zapText = this._truncate(
                  String(memory.content?.text || ''),
                  100
                );
                signalText = `zap_thanks to "${truncatedTarget}": ${zapText}`;
              }
            }
          } catch (err) {
            this.logger.debug(`[SELF-REFLECTION] Failed to fetch target post ${targetEventId}:`, err?.message || err);
          }
        }
      }

      // Fallback to original format if correlation didn't work
      if (!signalText) {
        const text = this._truncate(
          String(
            memory.content?.text ||
            memory.content?.data?.summary ||
            memory.content?.data?.text ||
            ''
          ),
          200
        );
        signalText = `${typeLabel}: ${text}`.trim();
      }

      signals.push(signalText);
      if (signals.length >= 5) {
        break;
      }
    }

    return signals;
  }

  _collectGlobalSignals(sortedMemories) {
    if (!Array.isArray(sortedMemories) || !sortedMemories.length) {
      return [];
    }

    const signals = [];
    const seenTypes = new Set();

    for (let idx = sortedMemories.length - 1; idx >= 0; idx -= 1) {
      const memory = sortedMemories[idx];
      const typeLabel = memory?.content?.type || memory?.content?.data?.type;
      if (!typeLabel || ['self_reflection'].includes(typeLabel)) {
        continue;
      }

      if (seenTypes.has(`${typeLabel}:${memory.roomId || ''}`)) {
        continue;
      }
      seenTypes.add(`${typeLabel}:${memory.roomId || ''}`);

      const createdAtIso = this._toIsoString(memory.createdAt);
      const text = this._truncate(
        String(
          memory.content?.text ||
          memory.content?.data?.summary ||
          memory.content?.data?.text ||
          ''
        ),
        160
      );

      signals.push(`${typeLabel}${createdAtIso ? ` @ ${createdAtIso}` : ''}: ${text}`.trim());
      if (signals.length >= 8) {
        break;
      }
    }

    return signals;
  }

  _toIsoString(timestamp) {
    if (!Number.isFinite(timestamp)) {
      return null;
    }
    try {
      return new Date(timestamp).toISOString();
    } catch {
      return null;
    }
  }

  _serializeInteractionSnapshot(interaction) {
    if (!interaction || typeof interaction !== 'object') {
      return null;
    }

    return {
      userMessage: this._truncate(String(interaction.userMessage || ''), 280),
      yourReply: this._truncate(String(interaction.yourReply || ''), 280),
      engagement: interaction.engagement || null,
      metadata: interaction.metadata || null,
      conversation: Array.isArray(interaction.conversation)
        ? interaction.conversation.map((entry) => ({
            role: entry.role,
            author: entry.author,
            text: this._truncate(String(entry.text || ''), 220),
            createdAtIso: entry.createdAtIso,
            type: entry.type
          }))
        : [],
      feedback: Array.isArray(interaction.feedback)
        ? interaction.feedback.map((item) => ({
            author: item.author,
            summary: this._truncate(String(item.summary || ''), 220),
            createdAtIso: item.createdAtIso || null
          }))
        : [],
      signals: Array.isArray(interaction.signals)
        ? interaction.signals.map((signal) => this._truncate(String(signal || ''), 220))
        : []
    };
  }

  async _ensureSystemContext() {
    if (this._systemContext) {
      return this._systemContext;
    }

    if (!this.runtime) {
      return null;
    }

    if (!this._systemContextPromise) {
      this._systemContextPromise = ensureNostrContextSystem(this.runtime, {
        createUniqueUuid: this.createUniqueUuid,
        ChannelType: this.ChannelType,
        logger: this.logger
      }).catch((err) => {
        this.logger.debug('[SELF-REFLECTION] Failed to ensure system context:', err?.message || err);
        this._systemContextPromise = null;
        return null;
      });
    }

    this._systemContext = await this._systemContextPromise;
    return this._systemContext;
  }

  _buildPrompt(interactions, extras = {}) {
    const contextSignals = Array.isArray(extras.contextSignals) ? extras.contextSignals : [];
    const previousReflections = Array.isArray(extras.previousReflections) ? extras.previousReflections : [];
    const longitudinalAnalysis = extras.longitudinalAnalysis || null;

    const previousReflectionSection = previousReflections.length
      ? `RECENT SELF-REFLECTION INSIGHTS (most recent first):
${previousReflections
          .map((summary, idx) => {
            const stamp = summary.generatedAtIso || this._toIsoString(summary.generatedAt) || `summary-${idx + 1}`;
            const strengths = summary.strengths?.length ? `Strengths: ${summary.strengths.join('; ')}` : null;
            const weaknesses = summary.weaknesses?.length ? `Weaknesses: ${summary.weaknesses.join('; ')}` : null;
            const recommendations = summary.recommendations?.length ? `Recommendations: ${summary.recommendations.join('; ')}` : null;
            const patterns = summary.patterns?.length ? `Patterns: ${summary.patterns.join('; ')}` : null;
            return [`- ${stamp}`, strengths, weaknesses, recommendations, patterns]
              .filter(Boolean)
              .join('\n  ');
          })
          .join('\n')}

Compare current performance to these past learnings. Highlight improvements or regressions explicitly.`
      : '';

    const longitudinalSection = longitudinalAnalysis
      ? `LONGITUDINAL ANALYSIS (${longitudinalAnalysis.timespan.totalReflections} reflections from ${longitudinalAnalysis.timespan.oldestReflection} to ${longitudinalAnalysis.timespan.newestReflection}):

RECURRING ISSUES (patterns that persist across time periods):
${longitudinalAnalysis.recurringIssues.length ? longitudinalAnalysis.recurringIssues.map((issue) => 
  `- ${issue.issue} (${issue.occurrences}x, status: ${issue.severity}, periods: ${issue.periodsCovered.join(', ')})`
).join('\n') : '- No recurring issues detected'}

PERSISTENT STRENGTHS (consistent positive patterns):
${longitudinalAnalysis.persistentStrengths.length ? longitudinalAnalysis.persistentStrengths.map((strength) => 
  `- ${strength.strength} (${strength.occurrences}x, ${strength.consistency}, periods: ${strength.periodsCovered.join(', ')})`
).join('\n') : '- No persistent strengths detected'}

EVOLUTION TRENDS:
- Strengths gained: ${longitudinalAnalysis.evolutionTrends.strengthsGained.length ? longitudinalAnalysis.evolutionTrends.strengthsGained.join('; ') : 'none detected'}
- Weaknesses resolved: ${longitudinalAnalysis.evolutionTrends.weaknessesResolved.length ? longitudinalAnalysis.evolutionTrends.weaknessesResolved.join('; ') : 'none detected'}
- New challenges: ${longitudinalAnalysis.evolutionTrends.newChallenges.length ? longitudinalAnalysis.evolutionTrends.newChallenges.join('; ') : 'none detected'}
- Stagnant areas: ${longitudinalAnalysis.evolutionTrends.stagnantAreas.length ? longitudinalAnalysis.evolutionTrends.stagnantAreas.join('; ') : 'none detected'}

Use this long-term view to assess whether current behavior aligns with your evolution trajectory or if you're reverting to old patterns.`
      : '';

    const globalSignalsSection = contextSignals.length
      ? `CROSS-MEMORY SIGNALS (other memory types near these threads):
${contextSignals.map((signal) => `- ${signal}`).join('\n')}`
      : '';

    const interactionsSection = interactions.length
      ? interactions
          .map((interaction, index) => {
            const convoLines = Array.isArray(interaction.conversation) && interaction.conversation.length
              ? interaction.conversation
                  .map((entry) => {
                    const roleLabel = entry.role === 'you' ? 'YOU' : entry.author || 'unknown';
                    const typeLabel = entry.type ? ` • ${entry.type}` : '';
                    const timeLabel = entry.createdAtIso ? ` (${entry.createdAtIso})` : '';
                    return `  - [${roleLabel}${typeLabel}] ${entry.text}${timeLabel}`;
                  })
                  .join('\n')
              : '  - [no additional messages captured]';

            const feedbackLines = Array.isArray(interaction.feedback) && interaction.feedback.length
              ? interaction.feedback
                  .map((item) => `  - ${item.author || 'user'}: ${item.summary}${item.createdAtIso ? ` (${item.createdAtIso})` : ''}`)
                  .join('\n')
              : '  - No direct follow-up captured yet';

            const signalLines = Array.isArray(interaction.signals) && interaction.signals.length
              ? interaction.signals.map((signal) => `  - ${signal}`).join('\n')
              : '  - No auxiliary signals found in this window';

            return `INTERACTION ${index + 1} (${interaction.metadata?.createdAtIso || 'unknown time'}):
Primary user message: "${interaction.userMessage}"
Your reply: "${interaction.yourReply}"
User engagement metrics: ${interaction.engagement}
Conversation excerpt:
${convoLines}
Follow-up / feedback after your reply:
${feedbackLines}
Supplementary signals for this moment:
${signalLines}`;
          })
          .join('\n\n')
      : 'No recent interactions available.';

    return [
      'You are Pixel reviewing your recent Nostr conversations. Use the full conversation slices, feedback, cross-memory signals, and prior self-reflection insights to evaluate your performance comprehensively.',
      previousReflectionSection,
      longitudinalSection,
      globalSignalsSection,
      interactionsSection,
      `ANALYZE:
1. Which replies or conversation choices drove positive engagement, and why?
2. Where did the conversation falter or trigger negative/neutral feedback?
3. Are you balancing brevity with substance? Note instances of over-verbosity or curt replies.
4. Call out any repeated phrases, tonal habits, or narrative crutches (good or bad).
5. Compare against prior self-reflection recommendations: where did you improve or regress?
 6. Consider the longitudinal analysis: Are recurring issues being addressed? Are persistent strengths being maintained?
 7. Evaluate zaps received on specific posts and what content patterns drove them. Identify what types of content consistently attract zaps vs. what gets ignored.
 8. Surface actionable adjustments for tone, structure, or strategy across future interactions.

CRITICAL: For each interaction, provide SPECIFIC behavioral changes:
- Quote exact phrases from your replies that need improvement
- Identify specific words or patterns to eliminate
- Recommend exact wording alternatives for better engagement
- Provide concrete examples of how to restructure responses

IMPORTANT: OUTPUT VALID JSON ONLY - NO MARKDOWN, NO EXPLANATIONS, NO CODE BLOCKS.
Your entire response must be a single valid JSON object with this exact structure:
{
  "strengths": ["Specific successful approaches to continue using"],
  "weaknesses": ["Exact problematic phrases or patterns to eliminate", "More specific issues"],
  "patterns": ["Repeated behaviors that need conscious breaking"],
  "recommendations": ["Specific actionable changes with concrete examples", "Exact wording suggestions for improvement"],
  "exampleGoodReply": "Quote your best reply verbatim",
  "exampleBadReply": "Quote your weakest moment verbatim",
  "regressions": ["Where you slipped compared to prior reflections"],
  "improvements": ["Where you improved compared to prior reflections"]
}`
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  _extractJson(response) {
    if (!response || typeof response !== 'string') {
      return null;
    }

    // Try extracting JSON first
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (this._isValidReflection(parsed)) {
          return parsed;
        }
        this.logger.debug('[SELF-REFLECTION] JSON parsed but missing required fields, trying markdown fallback');
      }
    } catch (err) {
      this.logger.debug('[SELF-REFLECTION] JSON parse failed, trying markdown fallback:', err?.message || err);
    }

    // Fallback: extract fields from markdown response
    const markdownExtracted = this._extractFieldsFromMarkdown(response);
    if (markdownExtracted && this._hasMinimalReflectionData(markdownExtracted)) {
      this.logger.debug('[SELF-REFLECTION] Extracted reflection from markdown response');
      return markdownExtracted;
    }

    this.logger.debug('[SELF-REFLECTION] Failed to extract valid reflection from response');
    return null;
  }

  _extractFieldsFromMarkdown(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const result = {
      strengths: [],
      weaknesses: [],
      patterns: [],
      recommendations: [],
      exampleGoodReply: null,
      exampleBadReply: null,
      regressions: [],
      improvements: []
    };

    // Extract list items following headers or labels
    const extractListItems = (pattern) => {
      const matches = [];
      const regex = new RegExp(pattern + '[:\\s]*([^\\n]+(?:\\n[-*•]\\s*[^\\n]+)*)', 'gi');
      const match = text.match(regex);
      if (match) {
        for (const m of match) {
          // Extract bullet points
          const bullets = m.match(/[-*•]\s*([^\n]+)/g);
          if (bullets) {
            for (const bullet of bullets) {
              const cleaned = bullet.replace(/^[-*•]\s*/, '').trim();
              if (cleaned && cleaned.length > 3) {
                matches.push(cleaned);
              }
            }
          }
          // Also extract non-bullet content after the header
          const headerMatch = m.match(new RegExp(pattern + '[:\\s]*([^\\n]+)', 'i'));
          if (headerMatch && headerMatch[1] && !headerMatch[1].match(/^[-*•]/)) {
            const items = headerMatch[1].split(/[;,]/).map(s => s.trim()).filter(s => s.length > 3);
            matches.push(...items);
          }
        }
      }
      return matches;
    };

    // Extract each field type
    result.strengths = extractListItems('(?:strengths?|what(?:\'s| is| you\'?re?) (?:working|doing) well|positives?)');
    result.weaknesses = extractListItems('(?:weaknesses?|what needs? (?:improvement|work)|areas? (?:to|for) improv|negatives?|issues?)');
    result.patterns = extractListItems('(?:patterns?|repeated behaviors?|habits?)');
    result.recommendations = extractListItems('(?:recommendations?|suggestions?|actionable (?:changes?|improvements?)|next steps?|advice)');
    result.regressions = extractListItems('(?:regressions?|(?:where|areas?) (?:you )?slipped|went backwards?)');
    result.improvements = extractListItems('(?:improvements?|(?:where|areas?) (?:you )?improved|progress)');

    // Extract quoted examples
    const goodReplyMatch = text.match(/(?:best|good|strong|example good)\s*(?:reply|response|moment)[:\s]*["\u201c]([^"\u201d]+)["\u201d]/i);
    if (goodReplyMatch) {
      result.exampleGoodReply = goodReplyMatch[1].trim();
    }

    const badReplyMatch = text.match(/(?:worst|bad|weak|example bad)\s*(?:reply|response|moment)[:\s]*["\u201c]([^"\u201d]+)["\u201d]/i);
    if (badReplyMatch) {
      result.exampleBadReply = badReplyMatch[1].trim();
    }

    return result;
  }

  _isValidReflection(analysis) {
    if (!analysis || typeof analysis !== 'object') {
      return false;
    }
    // Require at least strengths, weaknesses, and recommendations to be arrays
    return (
      Array.isArray(analysis.strengths) &&
      Array.isArray(analysis.weaknesses) &&
      Array.isArray(analysis.recommendations)
    );
  }

  _hasMinimalReflectionData(analysis) {
    if (!analysis || typeof analysis !== 'object') {
      return false;
    }
    // For markdown extraction, be more lenient - require at least 2 fields with data
    const fieldsWithData = ['strengths', 'weaknesses', 'patterns', 'recommendations', 'regressions', 'improvements']
      .filter(field => Array.isArray(analysis[field]) && analysis[field].length > 0);
    return fieldsWithData.length >= 2;
  }

  _createUuid(seed) {
    if (typeof this.createUniqueUuid === 'function') {
      try {
        return this.createUniqueUuid(this.runtime, seed);
      } catch (err) {
        this.logger.debug('[SELF-REFLECTION] createUniqueUuid (injected) failed:', err?.message || err);
      }
    }

    if (typeof this.runtime?.createUniqueUuid === 'function') {
      try {
        return this.runtime.createUniqueUuid(seed);
      } catch (err) {
        this.logger.debug('[SELF-REFLECTION] runtime.createUniqueUuid failed:', err?.message || err);
      }
    }

    return `${seed}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  }

  _truncate(text, limit = 320) {
    if (!text) {
      return '';
    }
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= limit) {
      return trimmed;
    }
    return `${trimmed.slice(0, limit - 1)}…`;
  }

  _trim(text, limit) {
    if (typeof text !== 'string') {
      return text || null;
    }
    if (!limit || text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}…`;
  }

  _maskPubkey(pubkey) {
    if (!pubkey || typeof pubkey !== 'string') {
      return 'unknown';
    }
    return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
  }

  _formatEngagement(stats) {
    if (!stats) {
      return 'unknown';
    }

    const parts = [];
    if (typeof stats.averageEngagement === 'number' && !Number.isNaN(stats.averageEngagement)) {
      parts.push(`avg=${stats.averageEngagement.toFixed(2)}`);
    }
    if (typeof stats.successRate === 'number' && !Number.isNaN(stats.successRate)) {
      parts.push(`success=${Math.round(stats.successRate * 100)}%`);
    }
    if (typeof stats.totalInteractions === 'number') {
      parts.push(`total=${stats.totalInteractions}`);
    }
    if (stats.dominantSentiment) {
      parts.push(`sentiment=${stats.dominantSentiment}`);
    }

    return parts.length ? parts.join(', ') : 'unknown';
  }

  // Note: Heuristic analysis removed per requirement to rely on LLM like other integration points
}

module.exports = { SelfReflectionEngine };
