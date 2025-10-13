const crypto = require('crypto');

/**
 * PatternLexicon - Online Learning for Phase Lexicons per Topic Cluster
 *
 * Implements adaptive learning of keyword patterns for different storyline phases
 * within topic clusters. Features compaction/decay mechanisms to maintain relevance
 * and prevent unbounded growth.
 */
class PatternLexicon {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.maxPatternsPerPhase = options.maxPatternsPerPhase || 50;
    this.maxClustersPerTopic = options.maxClustersPerTopic || 10;
    this.decayFactor = options.decayFactor || 0.95; // Daily decay
    this.compactionThreshold = options.compactionThreshold || 0.1; // Remove patterns below this score
    this.minPatternLength = options.minPatternLength || 3;
    this.maxPatternLength = options.maxPatternLength || 20;

    // Storage: topic -> clusterId -> phase -> { pattern: score, lastUpdated: timestamp }
    this.lexicons = new Map();

    // Track pattern usage for decay calculations
    this.usageStats = new Map();

    // Initialize with default patterns for common phases
    this._initializeDefaultPatterns();
  }

  /**
   * Initialize with sensible defaults for common storyline phases
   */
  _initializeDefaultPatterns() {
    const defaults = {
      regulatory: {
        'regulation': 1.0, 'compliance': 0.9, 'law': 0.8, 'legal': 0.8,
        'government': 0.7, 'policy': 0.7, 'authority': 0.6, 'rules': 0.6
      },
      technical: {
        'code': 1.0, 'development': 0.9, 'implementation': 0.8, 'protocol': 0.8,
        'upgrade': 0.7, 'fix': 0.7, 'bug': 0.6, 'feature': 0.6
      },
      market: {
        'price': 1.0, 'market': 0.9, 'trading': 0.8, 'adoption': 0.8,
        'growth': 0.7, 'value': 0.7, 'investment': 0.6, 'economy': 0.6
      },
      community: {
        'community': 1.0, 'users': 0.9, 'adoption': 0.8, 'social': 0.8,
        'engagement': 0.7, 'network': 0.7, 'collaboration': 0.6, 'support': 0.6
      }
    };

    // Apply defaults to a global cluster for each topic
    for (const [phase, patterns] of Object.entries(defaults)) {
      for (const [pattern, score] of Object.entries(patterns)) {
        this._setPatternScore('global', 'default', phase, pattern, score);
      }
    }
  }

  /**
   * Learn from a confirmed storyline progression event
   */
  learnFromProgression(topic, clusterId, phase, content, confidence = 1.0) {
    if (!this.enabled || !content || !topic || !phase) return;

    clusterId = clusterId || 'default';
    const patterns = this._extractPatterns(content);

    for (const pattern of patterns) {
      if (this._isValidPattern(pattern)) {
        this._reinforcePattern(topic, clusterId, phase, pattern, confidence);
      }
    }

    // Mark usage for decay tracking
    this._recordUsage(topic, clusterId, phase);
  }

  /**
   * Get patterns for a specific topic/cluster/phase combination
   */
  getPatterns(topic, clusterId = 'default', phase = null) {
    if (!this.enabled || !topic) return new Map();

    const topicLexicon = this.lexicons.get(topic);
    if (!topicLexicon) return new Map();

    const clusterLexicon = topicLexicon.get(clusterId);
    if (!clusterLexicon) return new Map();

    if (phase) {
      return new Map(clusterLexicon.get(phase) || []);
    }

    // Return all phases for this cluster
    const result = new Map();
    for (const [phaseName, patterns] of clusterLexicon) {
      for (const [pattern, data] of patterns) {
        result.set(pattern, { ...data, phase: phaseName });
      }
    }
    return result;
  }

  /**
   * Get the most relevant patterns for scoring
   */
  getRelevantPatterns(topic, clusterId = 'default', phases = []) {
    if (!this.enabled || !topic) return new Map();

    const result = new Map();

    // Get patterns from specific cluster
    const clusterPatterns = this.getPatterns(topic, clusterId);
    for (const [pattern, data] of clusterPatterns) {
      if (!phases.length || phases.includes(data.phase)) {
        result.set(pattern, data);
      }
    }

    // If no cluster-specific patterns, fall back to global defaults
    if (result.size === 0) {
      const globalPatterns = this.getPatterns('global', 'default');
      for (const [pattern, data] of globalPatterns) {
        if (!phases.length || phases.includes(data.phase)) {
          result.set(pattern, { ...data, score: data.score * 0.5 }); // Reduce global pattern weight
        }
      }
    }

    return result;
  }

  /**
   * Apply daily decay and compaction
   */
  performMaintenance() {
    if (!this.enabled) return;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    for (const [topic, topicLexicon] of this.lexicons) {
      for (const [clusterId, clusterLexicon] of topicLexicon) {
        for (const [phase, patterns] of clusterLexicon) {
          const toRemove = [];

          for (const [pattern, data] of patterns) {
            // Apply time-based decay
            const daysSinceUpdate = (now - data.lastUpdated) / oneDay;
            const decayMultiplier = Math.pow(this.decayFactor, daysSinceUpdate);
            data.score *= decayMultiplier;

            // Mark for removal if below threshold
            if (data.score < this.compactionThreshold) {
              toRemove.push(pattern);
            } else {
              data.lastUpdated = now; // Update timestamp after decay
            }
          }

          // Remove compacted patterns
          for (const pattern of toRemove) {
            patterns.delete(pattern);
          }

          // Limit patterns per phase
          if (patterns.size > this.maxPatternsPerPhase) {
            const sorted = Array.from(patterns.entries())
              .sort((a, b) => b[1].score - a[1].score)
              .slice(0, this.maxPatternsPerPhase);

            clusterLexicon.set(phase, new Map(sorted));
          }
        }

        // Remove empty phases
        for (const [phase, patterns] of clusterLexicon) {
          if (patterns.size === 0) {
            clusterLexicon.delete(phase);
          }
        }
      }

      // Remove empty clusters
      for (const [clusterId, clusterLexicon] of topicLexicon) {
        if (clusterLexicon.size === 0) {
          topicLexicon.delete(clusterId);
        }
      }
    }

    // Clean up usage stats
    this._cleanupUsageStats();
  }

  /**
   * Get statistics about the lexicon
   */
  getStats() {
    const stats = {
      enabled: this.enabled,
      topics: 0,
      clusters: 0,
      phases: 0,
      totalPatterns: 0,
      avgPatternsPerPhase: 0
    };

    if (!this.enabled) return stats;

    for (const [topic, topicLexicon] of this.lexicons) {
      stats.topics++;
      for (const [clusterId, clusterLexicon] of topicLexicon) {
        stats.clusters++;
        for (const [phase, patterns] of clusterLexicon) {
          stats.phases++;
          stats.totalPatterns += patterns.size;
        }
      }
    }

    if (stats.phases > 0) {
      stats.avgPatternsPerPhase = stats.totalPatterns / stats.phases;
    }

    return stats;
  }

  /**
   * Extract potential patterns from content
   */
  _extractPatterns(content) {
    if (!content || typeof content !== 'string') return [];

    const patterns = new Set();

    // Extract individual words
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= this.minPatternLength && word.length <= this.maxPatternLength);

    for (const word of words) {
      patterns.add(word);
    }

    // Extract bigrams (two-word phrases)
    const tokens = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2);

    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]} ${tokens[i + 1]}`;
      if (bigram.length >= this.minPatternLength && bigram.length <= this.maxPatternLength) {
        patterns.add(bigram);
      }
    }

    return Array.from(patterns);
  }

  /**
   * Validate pattern format
   */
  _isValidPattern(pattern) {
    if (!pattern || typeof pattern !== 'string') return false;
    if (pattern.length < this.minPatternLength || pattern.length > this.maxPatternLength) return false;

    // Must contain at least one letter
    if (!/[a-z]/i.test(pattern)) return false;

    // No excessive special characters
    const specialChars = pattern.replace(/[a-z0-9\s]/gi, '');
    if (specialChars.length > pattern.length * 0.3) return false;

    return true;
  }

  /**
   * Reinforce a pattern's score
   */
  _reinforcePattern(topic, clusterId, phase, pattern, confidence) {
    const currentScore = this._getPatternScore(topic, clusterId, phase, pattern);
    const newScore = Math.min(1.0, currentScore + (confidence * 0.1)); // Gradual reinforcement

    this._setPatternScore(topic, clusterId, phase, pattern, newScore);
  }

  /**
   * Get current pattern score
   */
  _getPatternScore(topic, clusterId, phase, pattern) {
    const data = this._getPatternData(topic, clusterId, phase, pattern);
    return data ? data.score : 0;
  }

  /**
   * Set pattern score with timestamp
   */
  _setPatternScore(topic, clusterId, phase, pattern, score) {
    if (!this.lexicons.has(topic)) {
      this.lexicons.set(topic, new Map());
    }

    const topicLexicon = this.lexicons.get(topic);
    if (!topicLexicon.has(clusterId)) {
      topicLexicon.set(clusterId, new Map());
    }

    const clusterLexicon = topicLexicon.get(clusterId);
    if (!clusterLexicon.has(phase)) {
      clusterLexicon.set(phase, new Map());
    }

    const phasePatterns = clusterLexicon.get(phase);
    phasePatterns.set(pattern, {
      score: Math.max(0, Math.min(1, score)),
      lastUpdated: Date.now()
    });
  }

  /**
   * Get pattern data
   */
  _getPatternData(topic, clusterId, phase, pattern) {
    const phasePatterns = this._getPhasePatterns(topic, clusterId, phase);
    return phasePatterns ? phasePatterns.get(pattern) : null;
  }

  /**
   * Get phase patterns map
   */
  _getPhasePatterns(topic, clusterId, phase) {
    const clusterLexicon = this._getClusterLexicon(topic, clusterId);
    return clusterLexicon ? clusterLexicon.get(phase) : null;
  }

  /**
   * Get cluster lexicon
   */
  _getClusterLexicon(topic, clusterId) {
    const topicLexicon = this.lexicons.get(topic);
    return topicLexicon ? topicLexicon.get(clusterId) : null;
  }

  /**
   * Record usage for decay tracking
   */
  _recordUsage(topic, clusterId, phase) {
    const key = `${topic}:${clusterId}:${phase}`;
    const now = Date.now();

    if (!this.usageStats.has(key)) {
      this.usageStats.set(key, { lastUsed: now, useCount: 0 });
    }

    const stats = this.usageStats.get(key);
    stats.lastUsed = now;
    stats.useCount++;
  }

  /**
   * Clean up old usage stats
   */
  _cleanupUsageStats() {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (const [key, stats] of this.usageStats) {
      if (now - stats.lastUsed > maxAge) {
        this.usageStats.delete(key);
      }
    }
  }
}

module.exports = { PatternLexicon };