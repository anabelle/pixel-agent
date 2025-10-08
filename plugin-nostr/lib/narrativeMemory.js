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
    
    // Trend tracking
    this.topicTrends = new Map(); // topic -> {counts: [], timestamps: []}
    this.sentimentTrends = new Map(); // date -> {positive, negative, neutral}
    this.engagementTrends = []; // {date, events, users, quality}
    
    // Configuration
    this.maxHourlyCache = 7 * 24; // 7 days
    this.maxDailyCache = 90; // 90 days
    this.maxWeeklyCache = 52; // 52 weeks
    this.maxMonthlyCache = 24; // 24 months
    
    this.initialized = false;
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

    return {
      topic,
      dataPoints: evolution,
      trend: this._calculateTrendDirection(evolution.map(e => e.mentions)),
      summary: this._summarizeEvolution(evolution)
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
      const hourlyMems = await this.runtime.getMemories({
        tableName: 'messages',
        count: this.maxHourlyCache,
        // Filter by content type if your adapter supports it
      }).catch(() => []);
      
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
      const dailyMems = await this.runtime.getMemories({
        tableName: 'messages',
        count: this.maxDailyCache,
      }).catch(() => []);
      
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
      const weeklyMems = await this.runtime.getMemories({
        tableName: 'messages',
        count: this.maxWeeklyCache,
      }).catch(() => []);
      
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

      // Sort all by timestamp
      this.hourlyNarratives.sort((a, b) => a.timestamp - b.timestamp);
      this.dailyNarratives.sort((a, b) => a.timestamp - b.timestamp);
      this.weeklyNarratives.sort((a, b) => a.timestamp - b.timestamp);

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
      const roomId = createUniqueUuid(this.runtime, `nostr-narratives-${type}`);
      const entityId = createUniqueUuid(this.runtime, 'nostr-narrative-memory');
      const memoryId = createUniqueUuid(this.runtime, `nostr-narrative-${type}-${timestamp}`);

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

      // Use createMemorySafe from context.js for retry logic
      const { createMemorySafe } = require('./context');
      await createMemorySafe(this.runtime, memory, 'messages', 3, this.logger);
      this.logger.debug(`[NARRATIVE-MEMORY] Persisted ${type} narrative`);
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
    return {
      hourlyNarratives: this.hourlyNarratives.length,
      dailyNarratives: this.dailyNarratives.length,
      weeklyNarratives: this.weeklyNarratives.length,
      monthlyNarratives: this.monthlyNarratives.length,
      trackedTopics: this.topicTrends.size,
      engagementDataPoints: this.engagementTrends.length,
      oldestNarrative: this.dailyNarratives[0] 
        ? new Date(this.dailyNarratives[0].timestamp).toISOString().split('T')[0]
        : null,
      newestNarrative: this.dailyNarratives[this.dailyNarratives.length - 1]
        ? new Date(this.dailyNarratives[this.dailyNarratives.length - 1].timestamp).toISOString().split('T')[0]
        : null
    };
  }
}

module.exports = { NarrativeMemory };
