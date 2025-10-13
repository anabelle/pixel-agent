// Narrative Memory Manager - Long-term narrative storage and temporal analysis
// Enables Pixel to learn from past narratives and track evolution over time

class NarrativeMemory {
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger || console;
    
    // In-memory cache of recent narratives
    this.hourlyNarratives = []; // Last 7 days of hourly narratives
    this.dailyNarratives = []; // Last 90 days of daily narratives
  this.weeklyNarratives = []; // Last 52 weeks
  this.monthlyNarratives = []; // Last 24 months
  this.timelineLore = []; // Recent timeline lore digests
    
    // Trend tracking
    this.topicTrends = new Map(); // topic -> {counts: [], timestamps: []}
    this.sentimentTrends = new Map(); // date -> {positive, negative, neutral}
    this.engagementTrends = []; // {date, events, users, quality}
  // Topic evolution clusters (subtopics + phase)
  /**
   * Maps a topic to its cluster data.
   * Structure:
   *   topic => {
   *     subtopics: Set<string>, // Set of subtopic names
   *     timeline: Array<{ subtopic: string, timestamp: number, snippet?: string }>, // History of subtopic changes
   *     currentPhase: string|null // Current phase of the topic, or null
   *   }
   */
  this.topicClusters = new Map();
    
    // Watchlist tracking (Phase 4)
    this.activeWatchlist = new Map(); // item -> {addedAt, source, digestId}
    this.watchlistExpiryMs = 24 * 60 * 60 * 1000; // 24 hours
    
    // Configuration
    this.maxHourlyCache = 7 * 24; // 7 days
    this.maxDailyCache = 90; // 90 days
    this.maxWeeklyCache = 52; // 52 weeks
  this.maxMonthlyCache = 24; // 24 months
  this.maxTimelineLoreCache = 120; // Recent timeline lore entries
  // Max entries per topic cluster timeline (bounded memory)
  const clusterMaxRaw = this.runtime?.getSetting?.('TOPIC_CLUSTER_MAX_ENTRIES') ?? process?.env?.TOPIC_CLUSTER_MAX_ENTRIES;
  this.maxTopicClusterEntries = Number.isFinite(Number(clusterMaxRaw)) && Number(clusterMaxRaw) > 0 ? Number(clusterMaxRaw) : 500;
    
    this.initialized = false;

    this._systemContext = null;
    this._systemContextPromise = null;

    // Adaptive Storyline Tracking (Phase 2)
    this.adaptiveStorylinesEnabled = String(runtime?.getSetting?.('ADAPTIVE_STORYLINES') ?? 'false').toLowerCase() === 'true';
    if (this.adaptiveStorylinesEnabled) {
      const { StorylineTracker } = require('./storylineTracker');
      this.storylineTracker = new StorylineTracker({
        runtime,
        logger
      });
    }
  }

  async _getSystemContext() {
    if (!this.runtime) return null;
    if (this._systemContext) return this._systemContext;

    if (!this._systemContextPromise) {
      try {
        const { ensureNostrContextSystem } = require('./context');
        const createUniqueUuid = this.runtime?.createUniqueUuid;
        let channelType = null;
        try {
          if (this.runtime?.ChannelType) {
            channelType = this.runtime.ChannelType;
          } else {
            const core = require('@elizaos/core');
            if (core?.ChannelType) channelType = core.ChannelType;
          }
        } catch {}

        this._systemContextPromise = ensureNostrContextSystem(this.runtime, {
          createUniqueUuid,
          ChannelType: channelType,
          logger: this.logger
        });
      } catch (err) {
        this.logger.debug('[NARRATIVE-MEMORY] Failed to initiate system context ensure:', err?.message || err);
        return null;
      }
    }

    try {
      this._systemContext = await this._systemContextPromise;
      return this._systemContext;
    } catch (err) {
      this.logger.debug('[NARRATIVE-MEMORY] Failed to ensure system context:', err?.message || err);
      this._systemContextPromise = null;
      return null;
    }
  }

  async initialize() {
    if (this.initialized) return;
    
    this.logger.info('[NARRATIVE-MEMORY] Initializing historical narrative memory...');
    
    // Load recent narratives from memory
    await this._loadRecentNarratives();
    
    // Build trend data
    await this._rebuildTrends();
    
    this.initialized = true;
    this.logger.info('[NARRATIVE-MEMORY] Initialized with historical context');
  }

  async storeHourlyNarrative(narrative) {
    // Add to cache
    this.hourlyNarratives.push({
      ...narrative,
      timestamp: Date.now(),
      type: 'hourly'
    });

    // Trim cache
    if (this.hourlyNarratives.length > this.maxHourlyCache) {
      this.hourlyNarratives.shift();
    }

    // Update trends
    this._updateTrendsFromNarrative(narrative);

    // Persist to database
    await this._persistNarrative(narrative, 'hourly');
  }

  async storeDailyNarrative(narrative) {
    this.dailyNarratives.push({
      ...narrative,
      timestamp: Date.now(),
      type: 'daily'
    });

    if (this.dailyNarratives.length > this.maxDailyCache) {
      this.dailyNarratives.shift();
    }

    this._updateTrendsFromNarrative(narrative);
    await this._persistNarrative(narrative, 'daily');
    
    // Check if we should generate weekly summary
    await this._maybeGenerateWeeklySummary();
  }

  async storeTimelineLore(entry) {
    if (!entry || (typeof entry !== 'object')) return;

    const record = {
      ...entry,
      timestamp: entry.timestamp || Date.now(),
      type: 'timeline'
    };

    // PHASE 2: Add storyline context if available
    if (this.adaptiveStorylinesEnabled && entry.tags && Array.isArray(entry.tags)) {
      const storylineContexts = [];
      for (const tag of entry.tags) {
        const context = this.getStorylineContext(tag);
        if (context) {
          storylineContexts.push({
            topic: tag,
            ...context
          });
        }
      }
      if (storylineContexts.length > 0) {
        record.storylineContext = storylineContexts;
      }
    }

    this.timelineLore.push(record);
    if (this.timelineLore.length > this.maxTimelineLoreCache) {
      this.timelineLore.shift();
    }

    // Phase 4: Extract and track watchlist items
    if (Array.isArray(entry.watchlist) && entry.watchlist.length) {
      this.addWatchlistItems(entry.watchlist, 'digest', entry.id);
    }

    try {
      await this._persistNarrative(record, 'timeline');
    } catch (err) {
      this.logger.debug('[NARRATIVE-MEMORY] Failed to persist timeline lore:', err?.message || err);
    }
  }

  getTimelineLore(limit = 5) {
    if (!Number.isFinite(limit) || limit <= 0) {
      limit = 5;
    }
    
    // Sort by priority (high > medium > low) then recency
    const priorityMap = { high: 3, medium: 2, low: 1 };
    const sorted = [...this.timelineLore].sort((a, b) => {
      const priorityDiff = (priorityMap[b.priority] || 1) - (priorityMap[a.priority] || 1);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    
    return sorted.slice(0, limit);
  }

  /**
   * Get recent digest summaries for context in new lore generation
   * Returns compact summaries of recent digests to avoid repetition
   * @param {number} lookback - Number of recent digests to return (default: 3). Undefined => 3, null or <=0 => [], non-finite => 3.
   * @returns {Array} Array of compact digest summaries
   */
  getRecentDigestSummaries(lookback = 3) {
    // Undefined -> default to 3; null or <=0 -> return empty; non-finite (except undefined) -> default to 3
    if (lookback === undefined) {
      lookback = 3;
    } else if (lookback === null || (Number.isFinite(lookback) && lookback <= 0)) {
      return [];
    } else if (!Number.isFinite(lookback)) {
      lookback = 3;
    }

    // Get the most recent timeline lore entries (guard against -0 => 0 returning full array)
    const count = Math.max(0, Math.floor(lookback));
    const recent = count === 0 ? [] : this.timelineLore.slice(-count);
    
    // Filter for actual digest entries (have digest-specific fields)
    const digestEntries = recent.filter(entry => 
      entry && 
      typeof entry === 'object' && 
      (entry.headline || entry.narrative) && 
      Array.isArray(entry.tags) &&
      ['high', 'medium', 'low'].includes(entry.priority)
    );
    
    // Return enhanced summaries with comprehensive context fields
    return digestEntries.map(entry => ({
      timestamp: entry.timestamp,
      headline: entry.headline,
      tags: entry.tags || [],
      priority: entry.priority || 'medium',
      narrative: entry.narrative || '',
      insights: entry.insights || [],
      evolutionSignal: entry.evolutionSignal || '',
      watchlist: entry.watchlist || []
    }));
  }

  async getHistoricalContext(timeframe = '24h') {
    // Provide historical context for narrative generation
    const now = Date.now();
    const narratives = {
      hourly: [],
      daily: [],
      weekly: [],
      monthly: []
    };

    switch (timeframe) {
      case '1h':
        narratives.hourly = this.hourlyNarratives.slice(-1);
        break;
      case '24h':
        narratives.hourly = this.hourlyNarratives.slice(-24);
        narratives.daily = this.dailyNarratives.slice(-1);
        break;
      case '7d':
        narratives.daily = this.dailyNarratives.slice(-7);
        narratives.weekly = this.weeklyNarratives.slice(-1);
        break;
      case '30d':
        narratives.daily = this.dailyNarratives.slice(-30);
        narratives.weekly = this.weeklyNarratives.slice(-4);
        narratives.monthly = this.monthlyNarratives.slice(-1);
        break;
      default:
        narratives.daily = this.dailyNarratives.slice(-7);
    }

    return narratives;
  }

  async compareWithHistory(currentDigest, comparisonPeriod = '7d') {
    // Compare current activity with historical patterns
    const historical = await this.getHistoricalContext(comparisonPeriod);
    
    const comparison = {
      eventTrend: this._calculateEventTrend(currentDigest, historical),
      userTrend: this._calculateUserTrend(currentDigest, historical),
      topicChanges: this._detectTopicShifts(currentDigest, historical),
      sentimentShift: this._detectSentimentShift(currentDigest, historical),
      emergingPatterns: this._detectEmergingPatterns(currentDigest, historical)
    };

    return comparison;
  }

  async getTopicEvolution(topic, days = 30) {
    // Track how a topic has evolved over time
    const relevantNarratives = this.dailyNarratives
      .filter(n => {
        const age = (Date.now() - n.timestamp) / (24 * 60 * 60 * 1000);
        return age <= days;
      })
      .filter(n => {
        const hasTopicInNarrative = n.summary?.topTopics?.some(t => 
          t.topic?.toLowerCase().includes(topic.toLowerCase())
        );
        return hasTopicInNarrative;
      });

    const evolution = relevantNarratives.map(n => ({
      date: new Date(n.timestamp).toISOString().split('T')[0],
      mentions: n.summary?.topTopics?.find(t => 
        t.topic?.toLowerCase().includes(topic.toLowerCase())
      )?.count || 0,
      sentiment: n.summary?.overallSentiment || {},
      narrative: n.narrative?.summary || n.summary?.summary || ''
    }));

    // Include subtopic distribution and current phase from clusters
    const key = String(topic || '').toLowerCase();
    const cluster = this.topicClusters.get(key);
    const subtopicCounts = new Map();
    if (cluster && Array.isArray(cluster.timeline)) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      for (const item of cluster.timeline) {
        if (!item || typeof item.timestamp !== 'number') continue;
        if (item.timestamp >= cutoff) {
          const s = String(item.subtopic || '').toLowerCase();
          subtopicCounts.set(s, (subtopicCounts.get(s) || 0) + 1);
        }
      }
    }

    const subtopics = Array.from(subtopicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([s, c]) => ({ subtopic: s, count: c }));

    return {
      topic,
      dataPoints: evolution,
      trend: this._calculateTrendDirection(evolution.map(e => e.mentions)),
      summary: this._summarizeEvolution(evolution),
      currentPhase: cluster?.currentPhase || 'general',
      topSubtopics: subtopics
    };
  }

  async getSimilarPastMoments(currentDigest, limit = 5) {
    // Find past moments similar to current situation
    const similarities = [];

    for (const past of this.dailyNarratives) {
      const similarity = this._calculateNarrativeSimilarity(currentDigest, past);
      
      if (similarity > 0.3) {
        similarities.push({
          narrative: past,
          similarity,
          date: new Date(past.timestamp).toISOString().split('T')[0],
          summary: past.narrative?.summary || past.summary?.summary || ''
        });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async generateWeeklySummary() {
    // Generate weekly summary from daily narratives
    const lastWeek = this.dailyNarratives.slice(-7);
    
    if (lastWeek.length < 5) {
      this.logger.debug('[NARRATIVE-MEMORY] Not enough data for weekly summary');
      return null;
    }

    const summary = {
      startDate: new Date(lastWeek[0].timestamp).toISOString().split('T')[0],
      endDate: new Date(lastWeek[lastWeek.length - 1].timestamp).toISOString().split('T')[0],
      totalEvents: lastWeek.reduce((sum, d) => sum + (d.summary?.totalEvents || 0), 0),
      uniqueUsers: new Set(lastWeek.flatMap(d => d.summary?.activeUsers || [])).size,
      topTopics: this._aggregateTopTopics(lastWeek),
      dominantSentiment: this._aggregateSentiment(lastWeek),
      keyMoments: lastWeek.flatMap(d => d.narrative?.keyMoments || []).slice(0, 7),
      emergingStories: this._identifyWeeklyStories(lastWeek)
    };

    // Generate LLM narrative if available
    if (this.runtime && typeof this.runtime.generateText === 'function') {
      summary.narrative = await this._generateWeeklyNarrative(summary, lastWeek);
    }

    // Store weekly summary
    this.weeklyNarratives.push({
      ...summary,
      timestamp: Date.now(),
      type: 'weekly'
    });

    if (this.weeklyNarratives.length > this.maxWeeklyCache) {
      this.weeklyNarratives.shift();
    }

    await this._persistNarrative(summary, 'weekly');
    
    this.logger.info(`[NARRATIVE-MEMORY] 📅 Generated weekly summary: ${summary.totalEvents} events, ${summary.uniqueUsers} users`);
    
    return summary;
  }

  async _generateWeeklyNarrative(summary, dailyNarratives) {
    try {
      const dailySummaries = dailyNarratives
        .map(d => d.narrative?.summary || d.summary?.summary || '')
        .filter(Boolean)
        .join('\n\n');

      const prompt = `Analyze this week's activity and create a compelling weekly narrative.

WEEKLY DATA:
- ${summary.totalEvents} total events from ${summary.uniqueUsers} unique users
- Top topics: ${summary.topTopics.map(t => `${t.topic}(${t.count})`).join(', ')}
- Overall sentiment: ${summary.dominantSentiment}

DAILY SUMMARIES:
${dailySummaries.slice(0, 2000)}

ANALYZE THE WEEK:
1. What was the arc of the week? How did the community evolve?
2. What major themes or stories emerged?
3. How did sentiment and energy shift day by day?
4. What connections or relationships formed?
5. What should we watch for next week?

OUTPUT JSON:
{
  "headline": "Compelling week summary (15-20 words)",
  "summary": "Rich narrative (5-7 sentences) capturing the week's journey",
  "arc": "How the week progressed (beginning → middle → end)",
  "majorThemes": ["Theme 1", "Theme 2", "Theme 3"],
  "shifts": ["Notable change 1", "Development 2"],
  "outlook": "What to anticipate next week (2 sentences)"
}`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.75,
        maxTokens: 800
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      
    } catch (err) {
      this.logger.debug('[NARRATIVE-MEMORY] Weekly narrative generation failed:', err.message);
      return null;
    }
  }

  _calculateEventTrend(current, historical) {
    const historicalAvg = this._calculateHistoricalAverage(historical, 'events');
    const currentEvents = current.eventCount || 0;
    
    if (historicalAvg === 0) return { direction: 'stable', change: 0 };
    
    const change = ((currentEvents - historicalAvg) / historicalAvg) * 100;
    
    return {
      direction: change > 10 ? 'up' : change < -10 ? 'down' : 'stable',
      change: Math.round(change),
      current: currentEvents,
      historical: Math.round(historicalAvg)
    };
  }

  _calculateUserTrend(current, historical) {
    const historicalAvg = this._calculateHistoricalAverage(historical, 'users');
    const currentUsers = current.users?.size || 0;
    
    if (historicalAvg === 0) return { direction: 'stable', change: 0 };
    
    const change = ((currentUsers - historicalAvg) / historicalAvg) * 100;
    
    return {
      direction: change > 10 ? 'up' : change < -10 ? 'down' : 'stable',
      change: Math.round(change),
      current: currentUsers,
      historical: Math.round(historicalAvg)
    };
  }

  _detectTopicShifts(current, historical) {
    // Compare current top topics with historical patterns
    const currentTopics = Array.from(current.topics?.entries() || [])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);

    const historicalTopics = this._getHistoricalTopTopics(historical, 10);
    
    const emerging = currentTopics.filter(t => !historicalTopics.includes(t));
    const declining = historicalTopics.filter(t => !currentTopics.includes(t));
    
    return { emerging, declining, stable: currentTopics.filter(t => historicalTopics.includes(t)) };
  }

  _detectSentimentShift(current, historical) {
    const currentSentiment = current.sentiment || { positive: 0, negative: 0, neutral: 0 };
    const historicalSentiment = this._calculateHistoricalSentiment(historical);
    
    const shifts = {};
    for (const key of ['positive', 'negative', 'neutral']) {
      const curr = currentSentiment[key] || 0;
      const hist = historicalSentiment[key] || 0;
      const total = curr + hist;
      
      if (total > 0) {
        const change = ((curr - hist) / total) * 100;
        if (Math.abs(change) > 15) {
          shifts[key] = { direction: change > 0 ? 'up' : 'down', magnitude: Math.abs(Math.round(change)) };
        }
      }
    }
    
    return shifts;
  }

  _detectEmergingPatterns(current, historical) {
    // Detect new patterns or behaviors
    const patterns = [];
    
    // Check for unusual activity spikes
    const eventTrend = this._calculateEventTrend(current, historical);
    if (eventTrend.change > 50) {
      patterns.push({ type: 'activity_spike', magnitude: eventTrend.change });
    }
    
    // Check for topic clustering
    const topicShifts = this._detectTopicShifts(current, historical);
    if (topicShifts.emerging.length > 3) {
      patterns.push({ type: 'topic_explosion', topics: topicShifts.emerging });
    }
    
    return patterns;
  }

  _calculateHistoricalAverage(historical, metric) {
    const allNarratives = [
      ...historical.hourly || [],
      ...historical.daily || []
    ];
    
    if (allNarratives.length === 0) return 0;
    
    const values = allNarratives.map(n => {
      if (metric === 'events') return n.summary?.eventCount || n.summary?.totalEvents || 0;
      if (metric === 'users') return n.summary?.users?.size || n.summary?.activeUsers || 0;
      return 0;
    }).filter(v => v > 0);
    
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  _getHistoricalTopTopics(historical, limit = 10) {
    const topicCounts = new Map();
    
    const allNarratives = [
      ...historical.daily || [],
      ...historical.weekly || []
    ];
    
    for (const narrative of allNarratives) {
      const topics = narrative.summary?.topTopics || [];
      for (const { topic, count } of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + count);
      }
    }
    
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic]) => topic);
  }

  _calculateHistoricalSentiment(historical) {
    const allNarratives = [...historical.daily || [], ...historical.weekly || []];
    
    const totals = { positive: 0, negative: 0, neutral: 0 };
    let count = 0;
    
    for (const narrative of allNarratives) {
      const sentiment = narrative.summary?.overallSentiment || narrative.summary?.sentiment;
      if (sentiment) {
        totals.positive += sentiment.positive || 0;
        totals.negative += sentiment.negative || 0;
        totals.neutral += sentiment.neutral || 0;
        count++;
      }
    }
    
    if (count === 0) return totals;
    
    return {
      positive: Math.round(totals.positive / count),
      negative: Math.round(totals.negative / count),
      neutral: Math.round(totals.neutral / count)
    };
  }

  _calculateNarrativeSimilarity(current, past) {
    // Compare topics
    const currentTopics = new Set(Array.from(current.topics?.keys() || []));
    const pastTopics = new Set(past.summary?.topTopics?.map(t => t.topic) || []);
    
    const intersection = new Set([...currentTopics].filter(t => pastTopics.has(t)));
    const union = new Set([...currentTopics, ...pastTopics]);
    
    const topicSimilarity = union.size > 0 ? intersection.size / union.size : 0;
    
    // Compare sentiment
    const currentSent = current.sentiment || {};
    const pastSent = past.summary?.overallSentiment || past.summary?.sentiment || {};
    
    const sentimentDiff = Math.abs(
      (currentSent.positive || 0) - (pastSent.positive || 0)
    ) + Math.abs(
      (currentSent.negative || 0) - (pastSent.negative || 0)
    );
    
    const sentimentSimilarity = 1 - (sentimentDiff / 100);
    
    return (topicSimilarity * 0.7 + sentimentSimilarity * 0.3);
  }

  _updateTrendsFromNarrative(narrative) {
    const timestamp = Date.now();
    
    // Update topic trends
    if (narrative.summary?.topTopics) {
      for (const { topic, count } of narrative.summary.topTopics) {
        if (!this.topicTrends.has(topic)) {
          this.topicTrends.set(topic, { counts: [], timestamps: [] });
        }
        
        const trend = this.topicTrends.get(topic);
        trend.counts.push(count);
        trend.timestamps.push(timestamp);
        
        // Keep last 90 data points
        if (trend.counts.length > 90) {
          trend.counts.shift();
          trend.timestamps.shift();
        }
      }
    }
    
    // Update engagement trends
    this.engagementTrends.push({
      timestamp,
      events: narrative.summary?.eventCount || narrative.summary?.totalEvents || 0,
      users: narrative.summary?.users?.size || narrative.summary?.activeUsers || 0
    });
    
    // Keep last 90 days
    if (this.engagementTrends.length > 90) {
      this.engagementTrends.shift();
    }
  }

  _aggregateTopTopics(narratives) {
    const topicCounts = new Map();
    
    for (const n of narratives) {
      const topics = n.summary?.topTopics || [];
      for (const { topic, count } of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + count);
      }
    }
    
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));
  }

  _aggregateSentiment(narratives) {
    const totals = { positive: 0, negative: 0, neutral: 0 };
    
    for (const n of narratives) {
      const sent = n.summary?.overallSentiment || n.summary?.sentiment || {};
      totals.positive += sent.positive || 0;
      totals.negative += sent.negative || 0;
      totals.neutral += sent.neutral || 0;
    }
    
    const total = totals.positive + totals.negative + totals.neutral;
    if (total === 0) return 'neutral';
    
    const max = Math.max(totals.positive, totals.negative, totals.neutral);
    if (max === totals.positive) return 'positive';
    if (max === totals.negative) return 'negative';
    return 'neutral';
  }

  _identifyWeeklyStories(narratives) {
    // Find topics that appeared multiple days
    const topicDays = new Map();
    
    for (const n of narratives) {
      const topics = n.summary?.topTopics?.map(t => t.topic) || [];
      for (const topic of topics) {
        topicDays.set(topic, (topicDays.get(topic) || 0) + 1);
      }
    }
    
    return Array.from(topicDays.entries())
      .filter(([_, days]) => days >= 3) // Appeared at least 3 days
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, days]) => ({ topic, days }));
  }

  _calculateTrendDirection(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-7);
    const older = values.slice(-14, -7);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.2) return 'rising';
    if (recentAvg < olderAvg * 0.8) return 'declining';
    return 'stable';
  }

  _summarizeEvolution(evolution) {
    if (evolution.length === 0) return 'No data available';
    
    const trend = this._calculateTrendDirection(evolution.map(e => e.mentions));
    const avgMentions = evolution.reduce((sum, e) => e.mentions + sum, 0) / evolution.length;
    
    return `${trend} trend with average ${Math.round(avgMentions)} mentions per period`;
  }

  async _loadRecentNarratives() {
    // Load from database using runtime memory system
    this.logger.debug('[NARRATIVE-MEMORY] Loading recent narratives from memory...');
    
    if (!this.runtime || typeof this.runtime.getMemories !== 'function') {
      this.logger.debug('[NARRATIVE-MEMORY] Runtime getMemories not available, skipping load');
      return;
    }

    try {
      // Load hourly narratives (last 7 days)
      let hourlyMems = [];
      try {
        const res = this.runtime.getMemories({
          tableName: 'messages',
          count: this.maxHourlyCache,
          // Filter by content type if your adapter supports it
        });
        hourlyMems = await Promise.resolve(res);
      } catch { hourlyMems = []; }
      
      for (const mem of hourlyMems) {
        if (mem.content?.type === 'narrative_hourly' && mem.content?.data) {
          this.hourlyNarratives.push({
            ...mem.content.data,
            timestamp: mem.createdAt || Date.now(),
            type: 'hourly'
          });
        }
      }
      
      this.logger.info(`[NARRATIVE-MEMORY] Loaded ${this.hourlyNarratives.length} hourly narratives`);

      // Load daily narratives (last 90 days)
      let dailyMems = [];
      try {
        const resDaily = this.runtime.getMemories({
          tableName: 'messages',
          count: this.maxDailyCache,
        });
        dailyMems = await Promise.resolve(resDaily);
      } catch { dailyMems = []; }
      
      for (const mem of dailyMems) {
        if (mem.content?.type === 'narrative_daily' && mem.content?.data) {
          this.dailyNarratives.push({
            ...mem.content.data,
            timestamp: mem.createdAt || Date.now(),
            type: 'daily'
          });
        }
      }
      
      this.logger.info(`[NARRATIVE-MEMORY] Loaded ${this.dailyNarratives.length} daily narratives`);

      // Load weekly narratives
      let weeklyMems = [];
      try {
        const resWeekly = this.runtime.getMemories({
          tableName: 'messages',
          count: this.maxWeeklyCache,
        });
        weeklyMems = await Promise.resolve(resWeekly);
      } catch { weeklyMems = []; }
      
      for (const mem of weeklyMems) {
        if (mem.content?.type === 'narrative_weekly' && mem.content?.data) {
          this.weeklyNarratives.push({
            ...mem.content.data,
            timestamp: mem.createdAt || Date.now(),
            type: 'weekly'
          });
        }
      }
      
      this.logger.info(`[NARRATIVE-MEMORY] Loaded ${this.weeklyNarratives.length} weekly narratives`);

      // Load timeline lore entries
      let timelineMems = [];
      try {
        const resTimeline = this.runtime.getMemories({
          tableName: 'messages',
          count: this.maxTimelineLoreCache,
        });
        timelineMems = await Promise.resolve(resTimeline);
      } catch { timelineMems = []; }

      for (const mem of timelineMems) {
        if (mem.content?.type === 'narrative_timeline' && mem.content?.data) {
          this.timelineLore.push({
            ...mem.content.data,
            timestamp: mem.createdAt || Date.now(),
            type: 'timeline'
          });
        }
      }

      this.logger.info(`[NARRATIVE-MEMORY] Loaded ${this.timelineLore.length} timeline lore entries`);

      // Sort all by timestamp
      this.hourlyNarratives.sort((a, b) => a.timestamp - b.timestamp);
      this.dailyNarratives.sort((a, b) => a.timestamp - b.timestamp);
      this.weeklyNarratives.sort((a, b) => a.timestamp - b.timestamp);
      this.timelineLore.sort((a, b) => a.timestamp - b.timestamp);

    } catch (err) {
      this.logger.error('[NARRATIVE-MEMORY] Failed to load narratives:', err.message);
    }
  }

  async _rebuildTrends() {
    // Rebuild trend data from loaded narratives
    for (const narrative of [...this.hourlyNarratives, ...this.dailyNarratives]) {
      this._updateTrendsFromNarrative(narrative);
    }
  }

  async _persistNarrative(narrative, type) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    try {
      const createUniqueUuid = this.runtime.createUniqueUuid;
      if (!createUniqueUuid) return;

      const timestamp = Date.now();
      const systemContext = await this._getSystemContext();
      const rooms = systemContext?.rooms || {};
      const narrativeRooms = {
        hourly: rooms.narrativesHourly,
        daily: rooms.narrativesDaily,
        weekly: rooms.narrativesWeekly,
        monthly: rooms.narrativesMonthly,
        timeline: rooms.narrativesTimeline
      };

      const roomId = narrativeRooms[type] || createUniqueUuid(this.runtime, `nostr-narratives-${type}`);
      const entityId = systemContext?.entityId || createUniqueUuid(this.runtime, 'nostr-narrative-memory');
      const memoryId = createUniqueUuid(this.runtime, `nostr-narrative-${type}-${timestamp}`);
      const worldId = systemContext?.worldId;

      if (!roomId || !entityId || !memoryId) {
        this.logger.debug(`[NARRATIVE-MEMORY] Failed to generate UUIDs for ${type} narrative`);
        return;
      }

      const memory = {
        id: memoryId,
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: `narrative_${type}`,
          source: 'nostr',
          data: narrative
        },
        createdAt: timestamp
      };

      if (worldId) {
        memory.worldId = worldId;
      }

      // Use createMemorySafe from context.js for retry logic
      const { createMemorySafe } = require('./context');
      const result = await createMemorySafe(this.runtime, memory, 'messages', 3, this.logger);
      if (result && (result === true || result.created)) {
        this.logger.debug(`[NARRATIVE-MEMORY] Persisted ${type} narrative`);
      } else {
        this.logger.warn(`[NARRATIVE-MEMORY] Failed to persist ${type} narrative (storage)`);
      }
    } catch (err) {
      this.logger.debug(`[NARRATIVE-MEMORY] Failed to persist narrative:`, err.message);
    }
  }

  async _maybeGenerateWeeklySummary() {
    // Check if it's time for weekly summary (every 7 days)
    const lastWeekly = this.weeklyNarratives[this.weeklyNarratives.length - 1];
    
    if (!lastWeekly) {
      // First weekly summary
      if (this.dailyNarratives.length >= 7) {
        await this.generateWeeklySummary();
      }
      return;
    }
    
    const daysSinceLastWeekly = (Date.now() - lastWeekly.timestamp) / (24 * 60 * 60 * 1000);
    
    if (daysSinceLastWeekly >= 7) {
      await this.generateWeeklySummary();
    }
  }

  getStats() {
    const baseStats = {
      hourlyNarratives: this.hourlyNarratives.length,
      dailyNarratives: this.dailyNarratives.length,
      weeklyNarratives: this.weeklyNarratives.length,
      monthlyNarratives: this.monthlyNarratives.length,
      timelineLore: this.timelineLore.length,
      trackedTopics: this.topicTrends.size,
  engagementDataPoints: this.engagementTrends.length,
  topicClusters: this.topicClusters.size,
      oldestNarrative: this.dailyNarratives[0] 
        ? new Date(this.dailyNarratives[0].timestamp).toISOString().split('T')[0]
        : null,
      newestNarrative: this.dailyNarratives[this.dailyNarratives.length - 1]
        ? new Date(this.dailyNarratives[this.dailyNarratives.length - 1].timestamp).toISOString().split('T')[0]
        : null
    };

    // Add storyline stats if enabled
    if (this.adaptiveStorylinesEnabled && this.storylineTracker) {
      const storylineStats = this.storylineTracker.getStats();
      baseStats.adaptiveStorylines = {
        enabled: true,
        activeStorylines: storylineStats.activeStorylines,
        topicModels: storylineStats.topicModels,
        llmCacheSize: storylineStats.llmCacheSize,
        llmCallsThisHour: storylineStats.llmCallsThisHour,
        totalLearnedPatterns: storylineStats.totalLearnedPatterns
      };
    } else {
      baseStats.adaptiveStorylines = { enabled: false };
    }

    return baseStats;
  }

  /**
   * Analyze continuity across recent timeline lore digests to detect evolving storylines
   * Returns insights about recurring themes, priority shifts, watchlist follow-through, and tone progression
   */
  async analyzeLoreContinuity(lookbackCount = 3) {
    const recent = this.timelineLore.slice(-lookbackCount);
    if (recent.length < 2) return null;

    // 1. Detect recurring themes across digests
    const tagFrequency = new Map();
    recent.forEach(lore => {
      (lore.tags || []).forEach(tag => {
        const key = String(tag || '').toLowerCase();
        if (!key) return;
        tagFrequency.set(key, (tagFrequency.get(key) || 0) + 1);
      });
    });
    const recurringThemes = Array.from(tagFrequency.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    // 2. Track priority escalation/de-escalation
    const priorityMap = { low: 1, medium: 2, high: 3 };
    const priorityTrend = recent.map(l => priorityMap[l.priority] || 1);
    const priorityChange = priorityTrend.slice(-1)[0] - priorityTrend[0];
    const priorityDirection = priorityChange > 0 ? 'escalating' : 
                             priorityChange < 0 ? 'de-escalating' : 'stable';

    // 3. Check watchlist follow-through (did predicted items appear in latest digest?)
    const watchlistItems = recent.slice(0, -1).flatMap(l => l.watchlist || []);
    const latestTags = new Set(recent.slice(-1)[0]?.tags || []);
    const latestInsights = recent.slice(-1)[0]?.insights || [];
    const followedUp = watchlistItems.filter(item => {
      const itemLower = item.toLowerCase();
      return Array.from(latestTags).some(tag => 
        tag.toLowerCase().includes(itemLower) || itemLower.includes(tag.toLowerCase())
      ) || latestInsights.some(insight => 
        insight.toLowerCase().includes(itemLower)
      );
    });

    // 4. Analyze tone progression
    const tones = recent.map(l => l.tone).filter(Boolean);
    const toneShift = tones.length >= 2 && tones[0] !== tones.slice(-1)[0];

    // 5. Identify emerging vs cooling storylines
    const earlierTags = new Set(
      recent
        .slice(0, -1)
        .flatMap(l => (l.tags || []).map(t => String(t || '').toLowerCase()))
    );
    const latestTagsArray = (recent.slice(-1)[0]?.tags || []).map(t => String(t || '').toLowerCase());
    const emergingNew = latestTagsArray.filter(t => !earlierTags.has(t));
    const latestLowerSet = new Set(latestTagsArray);
    const cooling = Array.from(earlierTags).filter(t => !latestLowerSet.has(t));
    // 6. Build human-readable summary
    const summary = this._buildContinuitySummary({
      recurringThemes,
      priorityDirection,
      priorityChange,
      followedUp,
      toneShift,
      tones,
      emergingNew,
      cooling
    });

    return {
      hasEvolution: recurringThemes.length > 0 || Math.abs(priorityChange) > 0 || 
                    followedUp.length > 0 || emergingNew.length > 0,
      recurringThemes: recurringThemes.slice(0, 5),
      priorityTrend: priorityDirection,
      priorityChange,
      watchlistFollowUp: followedUp,
      toneProgression: toneShift && tones.length >= 2 ? { 
        from: tones[0], 
        to: tones.slice(-1)[0] 
      } : null,
      emergingThreads: emergingNew.slice(0, 5),
      coolingThreads: cooling.slice(0, 5),
      summary,
      digestCount: recent.length,
      timespan: recent.length >= 2 ? {
        start: new Date(recent[0].timestamp).toISOString(),
        end: new Date(recent.slice(-1)[0].timestamp).toISOString()
      } : null
    };
  }

  /**
   * Check if content advances existing storylines for candidate prioritization
   * Called during candidate evaluation to boost posts that advance recurring themes
   * 
   * @param {string} content - The post content to analyze
   * @param {Array<string>} topics - Extracted topics from the post
   * @returns {Object|null} - Storyline advancement metrics or null if no continuity data
   */
  checkStorylineAdvancement(content, topics) {
    // Inline synchronous continuity check (analyzeLoreContinuity is async)
    const lookbackCount = 5;
    const recent = this.timelineLore.slice(-lookbackCount);
    if (recent.length < 2) return null;
    
    // Calculate continuity inline
    const tagFrequency = new Map();
    recent.forEach(lore => {
      (lore.tags || []).forEach(tag => {
        const key = String(tag || '').toLowerCase();
        if (!key) return;
        tagFrequency.set(key, (tagFrequency.get(key) || 0) + 1);
      });
    });
    const recurringThemes = Array.from(tagFrequency.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
    
    const watchlistItems = recent.slice(0, -1).flatMap(l => l.watchlist || []);
    
    const earlierTags = new Set(
      recent
        .slice(0, -1)
        .flatMap(l => (l.tags || []).map(t => String(t || '').toLowerCase()))
    );
    const latestTagsArray = (recent.slice(-1)[0]?.tags || []).map(t => String(t || '').toLowerCase());
    const emergingThreads = latestTagsArray.filter(t => !earlierTags.has(t));
    
  const contentLower = String(content || '').toLowerCase();
  const topicsLower = (topics || []).map(t => String(t || '').toLowerCase());
    
    // Check if content advances recurring themes
    const advancesThemes = recurringThemes.some(theme =>
      contentLower.includes(theme.toLowerCase()) ||
      topicsLower.some(topic => topic.includes(theme.toLowerCase()))
    );
    
    // Check if content relates to watchlist items
    const watchlistHits = watchlistItems.filter(item =>
      contentLower.includes(item.toLowerCase())
    );
    
    // Check if content relates to emerging threads
    const isEmergingThread = emergingThreads.some(thread =>
      topicsLower.some(topic => topic.includes(thread.toLowerCase()))
    );
    
    return {
      advancesRecurringTheme: advancesThemes,
      watchlistMatches: watchlistHits,
      isEmergingThread: isEmergingThread
    };
  }

  _buildContinuitySummary(data) {
    const parts = [];
    
    if (data.recurringThemes.length) {
      parts.push(`Recurring: ${data.recurringThemes.slice(0, 3).join(', ')}`);
    }
    
    if (data.priorityDirection === 'escalating') {
      parts.push(`Priority escalating (+${data.priorityChange})`);
    } else if (data.priorityDirection === 'de-escalating') {
      parts.push(`Priority cooling (${data.priorityChange})`);
    }
    
    if (data.followedUp.length) {
      parts.push(`Watchlist hits: ${data.followedUp.slice(0, 2).join(', ')}`);
    }
    
    if (data.toneShift && data.tones.length >= 2) {
      parts.push(`Mood: ${data.tones[0]} → ${data.tones.slice(-1)[0]}`);
    }
    
    if (data.emergingNew.length) {
      parts.push(`New: ${data.emergingNew.slice(0, 3).join(', ')}`);
    }
    
    if (data.cooling.length && !data.emergingNew.length) {
      parts.push(`Fading: ${data.cooling.slice(0, 2).join(', ')}`);
    }
    
    return parts.length ? parts.join(' | ') : 'No clear evolution detected';
  }

  /**
   * Track tone/mood trends across recent lore to detect community sentiment shifts
   */
  async trackToneTrend() {
    const recentLore = this.timelineLore.slice(-10);
    const toneWindow = recentLore
      .filter(l => l.tone && typeof l.tone === 'string')
      .map(l => ({ timestamp: l.timestamp, tone: l.tone }));
    
    if (toneWindow.length < 3) return null;
    
    // Detect significant shifts between earlier and recent periods
    const midpoint = Math.floor(toneWindow.length / 2);
    const earlier = toneWindow.slice(0, midpoint);
    const recent = toneWindow.slice(midpoint);
    
    const recentTones = new Set(recent.map(t => t.tone));
    const earlierTones = new Set(earlier.map(t => t.tone));
    
    // Check if recent tones are completely different from earlier
    const shifted = ![...recentTones].some(t => earlierTones.has(t));
    
    if (shifted && recent.length >= 2) {
      const timeSpanHours = Math.round(
        (recent.slice(-1)[0].timestamp - earlier[0].timestamp) / (60 * 60 * 1000)
      );
      
      return {
        detected: true,
        shift: `${earlier.slice(-1)[0]?.tone || 'unknown'} → ${recent.slice(-1)[0]?.tone}`,
        significance: 'notable',
        timespan: `${timeSpanHours}h`,
        earlierTones: Array.from(earlierTones),
        recentTones: Array.from(recentTones)
      };
    }
    
    // Check for consistent tone (no shift but worth noting)
    if (toneWindow.length >= 5) {
      const dominantTone = toneWindow.slice(-3).map(t => t.tone)[0];
      const allSame = toneWindow.slice(-3).every(t => t.tone === dominantTone);
      
      if (allSame) {
        return {
          detected: false,
          stable: true,
          tone: dominantTone,
          duration: toneWindow.length
        };
      }
    }
    
    return null;
  }

  /**
   * Get topic recency to detect if a topic has been frequently covered recently
   * Returns the number of mentions and last seen timestamp for novelty scoring
   * @param {string} topic - The topic to check
   * @param {number} lookbackHours - How many hours to look back (default: 24)
   * @returns {{mentions: number, lastSeen: number|null}} Recency information
   */
  getTopicRecency(topic, lookbackHours = 24) {
    if (!topic || typeof topic !== 'string') {
      return { mentions: 0, lastSeen: null };
    }

    const cutoff = Date.now() - (lookbackHours * 60 * 60 * 1000);
    const topicLower = topic.toLowerCase();
    
    const recentMentions = this.timelineLore
      .filter(entry => entry.timestamp > cutoff)
      .reduce((count, entry) => {
        return count + (entry.tags || []).filter(tag => 
          tag.toLowerCase() === topicLower
        ).length;
      }, 0);
    
    return { 
      mentions: recentMentions, 
      lastSeen: this._getLastTopicMention(topic) 
    };
  }

  /**
   * Helper method to find when a topic was last mentioned in timeline lore
   * @param {string} topic - The topic to find
   * @returns {number|null} Timestamp of last mention or null
   */
  _getLastTopicMention(topic) {
    if (!topic || typeof topic !== 'string') {
      return null;
    }

    const topicLower = topic.toLowerCase();
    
    // Search from most recent to oldest
    for (let i = this.timelineLore.length - 1; i >= 0; i--) {
      const entry = this.timelineLore[i];
      const hasTopic = (entry.tags || []).some(tag => 
        tag.toLowerCase() === topicLower
      );
      
      if (hasTopic) {
        return entry.timestamp || null;
      }
    }
    
    return null;
  }

  /**
   * PHASE 4: WATCHLIST MONITORING
   * Add watchlist items from a lore digest with 24h expiry
   */
  addWatchlistItems(watchlistItems, source = 'digest', digestId = null) {
    if (!Array.isArray(watchlistItems) || !watchlistItems.length) return;
    
    // Import ignored terms filter
    let TIMELINE_LORE_IGNORED_TERMS;
    try {
      const nostrHelpers = require('./nostr');
      TIMELINE_LORE_IGNORED_TERMS = nostrHelpers.TIMELINE_LORE_IGNORED_TERMS || new Set();
    } catch {
      TIMELINE_LORE_IGNORED_TERMS = new Set();
    }
    
    const now = Date.now();
    const added = [];
    
    for (const item of watchlistItems) {
      const normalized = String(item || '').trim().toLowerCase();
      if (!normalized || normalized.length < 3) continue;
      
      // Skip overly generic terms
      if (TIMELINE_LORE_IGNORED_TERMS.has(normalized)) {
        this.logger?.debug?.(`[WATCHLIST] Skipping generic term: ${normalized}`);
        continue;
      }
      
      // Deduplicate - don't re-add if already tracking
      if (this.activeWatchlist.has(normalized)) {
        this.logger?.debug?.(`[WATCHLIST] Already tracking: ${normalized}`);
        continue;
      }
      
      this.activeWatchlist.set(normalized, {
        addedAt: now,
        source,
        digestId,
        original: item
      });
      
      added.push(normalized);
    }
    
    if (added.length) {
      this.logger?.info?.(`[WATCHLIST] Added ${added.length} items: ${added.join(', ')}`);
    }
    
    // Cleanup expired items
    this._pruneExpiredWatchlist();
    
    return added;
  }

  /**
   * Check if content matches any active watchlist items
   * Returns matched items with boost recommendation
   */
  checkWatchlistMatch(content, tags = []) {
    if (!content || !this.activeWatchlist.size) return null;
    
    this._pruneExpiredWatchlist(); // Lazy cleanup
    
    const contentLower = String(content).toLowerCase();
    const tagsLower = tags.map(t => String(t || '').toLowerCase());
    const matches = [];
    
    for (const [item, metadata] of this.activeWatchlist.entries()) {
      // Check content match
      const inContent = contentLower.includes(item);
      
      // Check tag match (fuzzy - either way contains other)
      const inTags = tagsLower.some(tag => 
        tag.includes(item) || item.includes(tag)
      );
      
      if (inContent || inTags) {
        matches.push({
          item: metadata.original || item,
          matchType: inContent ? 'content' : 'tag',
          source: metadata.source,
          age: Math.round((Date.now() - metadata.addedAt) / (60 * 60 * 1000)) // hours
        });
      }
    }
    
    if (!matches.length) return null;
    
    // Conservative boost: cap at +0.5 regardless of match count
    const boostScore = Math.min(0.5, 0.2 * matches.length);
    
    return {
      matches,
      boostScore,
      reason: `watchlist_match: ${matches.map(m => m.item).join(', ')}`
    };
  }

  /**
   * Get current watchlist state for debugging
   */
  getWatchlistState() {
    this._pruneExpiredWatchlist();
    
    return {
      active: this.activeWatchlist.size,
      items: Array.from(this.activeWatchlist.entries()).map(([item, meta]) => ({
        item: meta.original || item,
        source: meta.source,
        age: Math.round((Date.now() - meta.addedAt) / (60 * 60 * 1000)),
        expiresIn: Math.round((this.watchlistExpiryMs - (Date.now() - meta.addedAt)) / (60 * 60 * 1000))
      }))
    };
  }

  /**
   * PHASE 2: Analyze post for storyline progression (adaptive storylines)
   * @param {string} content - Post content
   * @param {Array<string>} topics - Extracted topics
   * @param {number} timestamp - Post timestamp
   * @param {Object} meta - Additional metadata
   * @returns {Array} Storyline events
   */
  async analyzePostForStoryline(content, topics, timestamp = Date.now(), meta = {}) {
    if (!this.adaptiveStorylinesEnabled || !this.storylineTracker) {
      return [];
    }

    try {
      return await this.storylineTracker.analyzePost(content, topics, timestamp, meta);
    } catch (err) {
      this.logger.debug('[NARRATIVE-MEMORY] Storyline analysis failed:', err?.message || err);
      return [];
    }
  }

  /**
   * PHASE 2: Get storyline context for a topic
   * @param {string} topic - Topic to get context for
   * @returns {Object|null} Storyline context or null
   */
  getStorylineContext(topic) {
    if (!this.adaptiveStorylinesEnabled || !this.storylineTracker) {
      return null;
    }

    // Find active storylines for this topic
    const topicKey = String(topic || '').toLowerCase().trim();
    const storylines = Array.from(this.storylineTracker.activeStorylines.values())
      .filter(s => s.topic === topicKey)
      .sort((a, b) => b.lastUpdated - a.lastUpdated);

    if (storylines.length === 0) return null;

    const primary = storylines[0];
    return {
      storylineId: primary.id,
      currentPhase: primary.currentPhase,
      confidence: primary.confidence,
      historyLength: primary.history.length,
      lastUpdated: primary.lastUpdated,
      progression: primary.history.slice(-3).map(h => ({
        phase: h.phase,
        timestamp: h.timestamp,
        confidence: h.confidence
      }))
    };
  }

  /**
   * PHASE 2: Get all active storylines
   * @returns {Array} Active storylines summary
   */
  getActiveStorylines() {
    if (!this.adaptiveStorylinesEnabled || !this.storylineTracker) {
      return [];
    }

    return Array.from(this.storylineTracker.activeStorylines.values()).map(s => ({
      id: s.id,
      topic: s.topic,
      currentPhase: s.currentPhase,
      confidence: s.confidence,
      historyLength: s.history.length,
      lastUpdated: s.lastUpdated
    }));
  }

  /**
   * PHASE 2: Refresh storyline models (periodic maintenance)
   */
  refreshStorylineModels() {
    if (this.adaptiveStorylinesEnabled && this.storylineTracker) {
      this.storylineTracker.refreshModels();
    }
  }

  /**
   * Prune expired watchlist items
   * @private
   */
  _pruneExpiredWatchlist() {
    const now = Date.now();
    const toRemove = [];

    for (const [item, metadata] of this.activeWatchlist.entries()) {
      if (now - metadata.addedAt > this.watchlistExpiryMs) {
        toRemove.push(item);
      }
    }

    for (const item of toRemove) {
      this.activeWatchlist.delete(item);
    }

    if (toRemove.length > 0) {
      this.logger?.debug?.(`[WATCHLIST] Pruned ${toRemove.length} expired items`);
    }
  }
}

module.exports = { NarrativeMemory };
