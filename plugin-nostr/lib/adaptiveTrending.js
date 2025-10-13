// Adaptive Trending Algorithm
// Replaces frequency-based trending with velocity, novelty, and context-aware scoring

class AdaptiveTrending {
  constructor(logger, options = {}) {
    this.logger = logger || console;
    
    // Configuration
    this.baselineWindowHours = options.baselineWindowHours || 24; // Hours for baseline calculation
    this.velocityWindowMinutes = options.velocityWindowMinutes || 30; // Window for velocity calculation
    this.noveltyWindowHours = options.noveltyWindowHours || 6; // Window for novelty detection
    this.trendingThreshold = options.trendingThreshold || 1.2; // Minimum score to be "trending"
    this.maxHistoryPerTopic = options.maxHistoryPerTopic || 100; // Max history entries per topic
    
    // Topic history: topic -> [{timestamp, mentions, users, keywords, context}]
    this.topicHistory = new Map();
    
    // Baseline activity: topic -> {avgMentions, avgUsers}
    this.baselineActivity = new Map();
  }

  /**
   * Record activity for a topic
   * @param {string} topic - The topic name
   * @param {object} data - Activity data
   * @param {number} data.mentions - Number of mentions
   * @param {Set} data.users - Set of user IDs
   * @param {Array<string>} data.keywords - Keywords/context from content
   * @param {number} timestamp - Timestamp of the activity
   */
  recordActivity(topic, data, timestamp = Date.now()) {
    if (!topic || !data) return;

    if (!this.topicHistory.has(topic)) {
      this.topicHistory.set(topic, []);
    }

    const history = this.topicHistory.get(topic);
    history.push({
      timestamp,
      mentions: data.mentions || 0,
      users: data.users ? data.users.size : 0,
      keywords: data.keywords || [],
      context: data.context || ''
    });

    // Keep history bounded
    if (history.length > this.maxHistoryPerTopic) {
      history.shift();
    }

    // Update baseline periodically
    this._updateBaseline(topic, history);
  }

  /**
   * Get trending topics with adaptive scoring
   * @param {number} limit - Maximum number of trending topics to return
   * @returns {Array} Sorted array of trending topics with scores
   */
  getTrendingTopics(limit = 5) {
    const now = Date.now();
    const trendingScores = new Map();

    for (const [topic, history] of this.topicHistory.entries()) {
      if (history.length === 0) continue;

      const score = this._calculateTrendScore(topic, history, now);
      
      // Only include topics trending above baseline threshold
      if (score > this.trendingThreshold) {
        trendingScores.set(topic, {
          topic,
          score,
          velocity: this._calculateVelocity(history, now),
          novelty: this._calculateNovelty(topic, history, now),
          development: this._calculateDevelopment(history, now)
        });
      }
    }

    return Array.from(trendingScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Calculate overall trend score combining velocity, novelty, and development
   */
  _calculateTrendScore(topic, history, now) {
    if (history.length < 2) return 0;

    const velocity = this._calculateVelocity(history, now);
    const novelty = this._calculateNovelty(topic, history, now);
    const development = this._calculateDevelopment(history, now);
    const baselineRatio = this._calculateBaselineRatio(topic, history, now);

    // Weighted combination of factors
    // Velocity: 40%, Novelty: 30%, Development: 20%, Baseline: 10%
    const score = (velocity * 0.4) + (novelty * 0.3) + (development * 0.2) + (baselineRatio * 0.1);

    return score;
  }

  /**
   * Calculate velocity - rate of change in discussion
   * High velocity = rapid increase in activity
   */
  _calculateVelocity(history, now) {
    const velocityWindowMs = this.velocityWindowMinutes * 60 * 1000;
    const recentCutoff = now - velocityWindowMs;
    const previousCutoff = now - (velocityWindowMs * 2);

    // Get recent activity
    const recentActivity = history.filter(h => h.timestamp >= recentCutoff);
    const previousActivity = history.filter(h => 
      h.timestamp >= previousCutoff && h.timestamp < recentCutoff
    );

    if (recentActivity.length === 0) return 0;

    const recentMentions = recentActivity.reduce((sum, h) => sum + h.mentions, 0);
    const previousMentions = previousActivity.reduce((sum, h) => sum + h.mentions, 0);
    
    const recentUsers = new Set(recentActivity.flatMap(h => h.users)).size;
    const previousUsers = new Set(previousActivity.flatMap(h => h.users)).size;

    // Calculate acceleration
    // If previousMentions is 0, treat as new topic with moderate velocity
    const mentionRatio = previousMentions > 0 
      ? recentMentions / previousMentions 
      : (recentMentions > 0 ? 2.0 : 0);
    
    const userRatio = previousUsers > 0 
      ? recentUsers / previousUsers 
      : (recentUsers > 0 ? 2.0 : 0);

    // Combine mention and user velocity, cap at reasonable maximum
    const velocity = Math.min(5.0, (mentionRatio + userRatio) / 2);

    return velocity;
  }

  /**
   * Calculate novelty - new keywords and contexts appearing
   * High novelty = new angles or developments in the topic
   */
  _calculateNovelty(topic, history, now) {
    const noveltyWindowMs = this.noveltyWindowHours * 60 * 60 * 1000;
    const recentCutoff = now - noveltyWindowMs;
    const baselineCutoff = now - (noveltyWindowMs * 2);

    const recentEntries = history.filter(h => h.timestamp >= recentCutoff);
    const baselineEntries = history.filter(h => 
      h.timestamp >= baselineCutoff && h.timestamp < recentCutoff
    );

    if (recentEntries.length === 0) return 0;

    // Extract keywords from both periods
    const recentKeywords = new Set();
    const baselineKeywords = new Set();

    recentEntries.forEach(entry => {
      (entry.keywords || []).forEach(kw => recentKeywords.add(kw.toLowerCase()));
    });

    baselineEntries.forEach(entry => {
      (entry.keywords || []).forEach(kw => baselineKeywords.add(kw.toLowerCase()));
    });

    if (recentKeywords.size === 0) return 0;

    // Calculate novelty as percentage of new keywords
    const newKeywords = [...recentKeywords].filter(kw => !baselineKeywords.has(kw));
    const noveltyRatio = newKeywords.length / recentKeywords.size;

    // Also factor in total keyword diversity
    const diversity = Math.min(1.0, recentKeywords.size / 10); // Cap at 10 keywords

    return (noveltyRatio * 0.7) + (diversity * 0.3);
  }

  /**
   * Calculate development - sustained evolution of conversation
   * High development = ongoing discussion with depth
   */
  _calculateDevelopment(history, now) {
    const windowMs = this.velocityWindowMinutes * 60 * 1000;
    const recentCutoff = now - windowMs;

    const recentEntries = history.filter(h => h.timestamp >= recentCutoff);
    
    if (recentEntries.length === 0) return 0;

    // Development factors:
    // 1. Sustained activity (multiple entries)
    const sustainedScore = Math.min(1.0, recentEntries.length / 5);

    // 2. Unique users (more diverse = better development)
    const uniqueUsers = new Set();
    recentEntries.forEach(entry => uniqueUsers.add(entry.users));
    const diversityScore = Math.min(1.0, uniqueUsers.size / 5);

    // 3. Context evolution (changing contexts indicate development)
    const contexts = recentEntries.map(e => e.context).filter(Boolean);
    const uniqueContexts = new Set(contexts);
    const contextScore = contexts.length > 0 
      ? Math.min(1.0, uniqueContexts.size / Math.max(1, contexts.length))
      : 0;

    return (sustainedScore * 0.4) + (diversityScore * 0.4) + (contextScore * 0.2);
  }

  /**
   * Calculate baseline ratio - current activity vs historical baseline
   * Prevents "always trending" topics
   */
  _calculateBaselineRatio(topic, history, now) {
    const baseline = this.baselineActivity.get(topic);
    
    if (!baseline || baseline.avgMentions === 0) {
      // No baseline yet, give moderate score for new topics
      return 1.0;
    }

    const recentWindowMs = this.velocityWindowMinutes * 60 * 1000;
    const recentCutoff = now - recentWindowMs;
    const recentEntries = history.filter(h => h.timestamp >= recentCutoff);

    if (recentEntries.length === 0) return 0;

    const currentMentions = recentEntries.reduce((sum, h) => sum + h.mentions, 0);
    const mentionRatio = currentMentions / Math.max(1, baseline.avgMentions);

    // Return ratio above baseline (capped at reasonable max)
    return Math.min(3.0, mentionRatio);
  }

  /**
   * Update baseline activity for a topic
   * Called periodically to establish historical norms
   */
  _updateBaseline(topic, history) {
    if (history.length < 10) return; // Need sufficient history

    const baselineWindowMs = this.baselineWindowHours * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - baselineWindowMs;

    const baselineEntries = history.filter(h => h.timestamp >= cutoff);
    
    if (baselineEntries.length === 0) return;

    const totalMentions = baselineEntries.reduce((sum, h) => sum + h.mentions, 0);
    const allUsers = new Set();
    baselineEntries.forEach(entry => allUsers.add(entry.users));

    this.baselineActivity.set(topic, {
      avgMentions: totalMentions / baselineEntries.length,
      avgUsers: allUsers.size / baselineEntries.length,
      lastUpdated: now
    });
  }

  /**
   * Get baseline activity for a topic (for debugging/monitoring)
   */
  getBaseline(topic) {
    return this.baselineActivity.get(topic) || null;
  }

  /**
   * Clear old history to prevent memory leaks
   */
  cleanup(maxAgeHours = 48) {
    const now = Date.now();
    const cutoff = now - (maxAgeHours * 60 * 60 * 1000);

    for (const [topic, history] of this.topicHistory.entries()) {
      const filtered = history.filter(h => h.timestamp >= cutoff);
      
      if (filtered.length === 0) {
        this.topicHistory.delete(topic);
        this.baselineActivity.delete(topic);
      } else {
        this.topicHistory.set(topic, filtered);
      }
    }
  }

  /**
   * Get detailed information about a specific topic's trending status
   */
  getTopicDetails(topic) {
    const history = this.topicHistory.get(topic);
    const baseline = this.baselineActivity.get(topic);
    
    if (!history || history.length === 0) {
      return null;
    }

    const now = Date.now();
    
    return {
      topic,
      historyLength: history.length,
      baseline,
      currentScore: this._calculateTrendScore(topic, history, now),
      velocity: this._calculateVelocity(history, now),
      novelty: this._calculateNovelty(topic, history, now),
      development: this._calculateDevelopment(history, now),
      isTrending: this._calculateTrendScore(topic, history, now) > this.trendingThreshold
    };
  }
}

module.exports = { AdaptiveTrending };
