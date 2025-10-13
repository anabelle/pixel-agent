// Topic Evolution Tracker - Semantic subtopic clustering and phase detection
// Provides signals for novel angles and genuine topic evolutions

const PHASE_TAXONOMY = {
  speculation: {
    keywords: ['rumor', 'speculation', 'might', 'could', 'possibly', 'hearing', 'unconfirmed'],
    description: 'Early speculation and rumors'
  },
  announcement: {
    keywords: ['announced', 'released', 'launch', 'introducing', 'official', 'confirmed'],
    description: 'Official announcements and releases'
  },
  analysis: {
    keywords: ['analysis', 'deep dive', 'breakdown', 'explained', 'technical', 'review'],
    description: 'Technical analysis and reviews'
  },
  adoption: {
    keywords: ['adoption', 'using', 'integrated', 'implemented', 'deployed', 'production'],
    description: 'Real-world adoption and usage'
  },
  backlash: {
    keywords: ['controversy', 'backlash', 'criticism', 'concern', 'problem', 'issue', 'failed'],
    description: 'Criticism and controversies'
  },
  general: {
    keywords: [],
    description: 'General discussion'
  }
};

class TopicEvolutionTracker {
  constructor(runtime, narrativeMemory, semanticAnalyzer, logger) {
    this.runtime = runtime;
    this.narrativeMemory = narrativeMemory;
    this.semanticAnalyzer = semanticAnalyzer;
    this.logger = logger || console;
    
    // Feature flags
    this.llmEnabled = process.env.TOPIC_EVOLUTION_LLM_ENABLED !== 'false'; // Default enabled
    
    // Scoring weights
    this.noveltyWeight = parseFloat(process.env.TOPIC_EVOLUTION_NOVELTY_WEIGHT) || 0.4;
    this.phaseChangeWeight = parseFloat(process.env.TOPIC_EVOLUTION_PHASE_WEIGHT) || 0.3;
    this.recencyWeight = parseFloat(process.env.TOPIC_EVOLUTION_RECENCY_WEIGHT) || 0.3;
    
    // Cache for subtopic labels
    this.subtopicCache = new Map();
    this.cacheTTL = 3600000; // 1 hour
    
    this.logger.info('[TOPIC-EVOLUTION] Initialized - LLM:', this.llmEnabled);
  }

  /**
   * Analyze topic evolution and generate signals
   * @param {string} topic - Main topic
   * @param {string} content - Content to analyze
   * @param {Object} contextHints - Optional context like trending topics, watchlist
   * @returns {Object} Evolution analysis with signals
   */
  async analyzeEvolution(topic, content, contextHints = {}) {
    if (!topic || !content) {
      return this._getDefaultResponse(topic);
    }

    try {
      // 1. Label the subtopic
      const subtopic = await this.labelSubtopic(topic, content, contextHints);
      
      // 2. Get or create cluster for this topic
      const cluster = this.narrativeMemory.getTopicCluster(topic);
      
      // 3. Check if this is a novel angle
      const isNovelAngle = this._isNovelAngle(cluster, subtopic);
      
      // 4. Detect phase
      const phase = await this.detectPhase(content, cluster);
      
      // 5. Check if phase changed
      const isPhaseChange = cluster.lastPhase && cluster.lastPhase !== phase;
      
      // 6. Update cluster with new entry
      this.narrativeMemory.updateTopicCluster(topic, {
        subtopic,
        phase,
        timestamp: Date.now(),
        content: content.slice(0, 200) // Store snippet for context
      });
      
      // 7. Calculate evolution score
      const evolutionScore = this.scoreEvolution(cluster, subtopic, isNovelAngle, isPhaseChange);
      
      return {
        subtopic,
        isNovelAngle,
        isPhaseChange,
        phase,
        evolutionScore,
        signals: this._generateSignals(subtopic, isNovelAngle, isPhaseChange, phase, evolutionScore)
      };
    } catch (err) {
      this.logger.debug('[TOPIC-EVOLUTION] Analysis failed:', err.message);
      return this._getDefaultResponse(topic);
    }
  }

  /**
   * Label a subtopic for the given content using LLM or fallback heuristics
   * @param {string} topic - Main topic
   * @param {string} content - Content to analyze
   * @param {Object} contextHints - Optional context
   * @returns {string} Subtopic label
   */
  async labelSubtopic(topic, content, contextHints = {}) {
    const cacheKey = this._getCacheKey(topic, content);
    const cached = this.subtopicCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.subtopic;
    }

    let subtopic;
    
    if (this.llmEnabled && this.runtime?.generateText) {
      try {
        subtopic = await this._labelSubtopicLLM(topic, content, contextHints);
      } catch (err) {
        this.logger.debug('[TOPIC-EVOLUTION] LLM labeling failed, using fallback:', err.message);
        subtopic = this._labelSubtopicFallback(topic, content);
      }
    } else {
      subtopic = this._labelSubtopicFallback(topic, content);
    }

    // Cache the result
    this.subtopicCache.set(cacheKey, {
      subtopic,
      timestamp: Date.now()
    });

    // Cleanup old cache entries periodically
    if (this.subtopicCache.size > 500) {
      this._cleanupCache();
    }

    return subtopic;
  }

  /**
   * Use LLM to label subtopic with strict output format
   */
  async _labelSubtopicLLM(topic, content, contextHints) {
    const trendingContext = contextHints.trending?.length 
      ? `\nTrending topics: ${contextHints.trending.join(', ')}`
      : '';
    
    const watchlistContext = contextHints.watchlist?.length
      ? `\nWatchlist items: ${contextHints.watchlist.join(', ')}`
      : '';

    const prompt = `Label the specific angle/subtopic for this content about "${topic}".

Content: "${content.slice(0, 400)}"${trendingContext}${watchlistContext}

Provide a short, specific subtopic label (2-5 words) that captures the unique angle.
Examples for "bitcoin":
- "price volatility"
- "ETF approval"
- "mining difficulty"
- "technical analysis"

Respond with ONLY the subtopic label, nothing else:`;

    const response = await this.runtime.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 20
    });

    // Clean and normalize the response
    let subtopic = response.trim()
      .toLowerCase()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/\n.*/g, '') // Take only first line
      .slice(0, 50); // Max 50 chars

    // Fallback if response is invalid
    if (!subtopic || subtopic.length < 3 || subtopic.split(' ').length > 6) {
      return this._labelSubtopicFallback(topic, content);
    }

    return subtopic;
  }

  /**
   * Fallback heuristic for subtopic labeling
   */
  _labelSubtopicFallback(topic, content) {
    const contentLower = content.toLowerCase();
    
    // Common subtopic patterns
    const patterns = {
      'price': /price|cost|\$|usd|value|market|trading/i,
      'adoption': /adoption|using|users|mainstream|integrated/i,
      'development': /dev|development|build|code|release|update/i,
      'regulation': /regulation|government|law|legal|policy/i,
      'security': /security|hack|breach|vulnerability|attack/i,
      'technology': /technology|tech|innovation|feature|protocol/i,
      'community': /community|social|people|culture|movement/i,
      'performance': /performance|speed|scalability|throughput/i,
      'education': /learn|tutorial|guide|explain|understand/i,
      'criticism': /criticism|concern|problem|issue|controversy/i
    };

    // Find matching patterns
    for (const [label, pattern] of Object.entries(patterns)) {
      if (pattern.test(contentLower)) {
        return `${topic} ${label}`;
      }
    }

    // Extract key bigrams as fallback
    const words = contentLower
      .split(/\s+/)
      .filter(w => w.length > 3 && !this._isStopWord(w))
      .slice(0, 10);
    
    if (words.length >= 2) {
      return `${words[0]} ${words[1]}`;
    }

    return `${topic} discussion`;
  }

  /**
   * Detect the phase of the discussion
   */
  async detectPhase(content, cluster) {
    const contentLower = content.toLowerCase();
    
    // Score each phase based on keyword matches
    const phaseScores = {};
    for (const [phaseName, phaseData] of Object.entries(PHASE_TAXONOMY)) {
      const keywordMatches = phaseData.keywords.filter(kw => 
        contentLower.includes(kw.toLowerCase())
      ).length;
      phaseScores[phaseName] = keywordMatches;
    }

    // Get phase with highest score
    let detectedPhase = 'general';
    let maxScore = 0;
    
    for (const [phase, score] of Object.entries(phaseScores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedPhase = phase;
      }
    }

    // If we have enough history, use LLM for refinement
    if (this.llmEnabled && cluster.entries?.length >= 3 && maxScore === 0) {
      try {
        detectedPhase = await this._detectPhaseLLM(content, cluster);
      } catch (err) {
        this.logger.debug('[TOPIC-EVOLUTION] LLM phase detection failed:', err.message);
      }
    }

    return detectedPhase;
  }

  /**
   * Use LLM to detect phase for ambiguous cases
   */
  async _detectPhaseLLM(content, cluster) {
    const recentPhases = cluster.entries?.slice(-3).map(e => e.phase) || [];
    const phaseContext = recentPhases.length 
      ? `\nRecent phases: ${recentPhases.join(', ')}`
      : '';

    const phaseList = Object.keys(PHASE_TAXONOMY).join(', ');

    const prompt = `Classify the discussion phase for this content.

Content: "${content.slice(0, 300)}"${phaseContext}

Phases: ${phaseList}

Respond with ONLY the phase name:`;

    const response = await this.runtime.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 10
    });

    const phase = response.trim().toLowerCase();
    
    // Validate response
    if (PHASE_TAXONOMY[phase]) {
      return phase;
    }

    return 'general';
  }

  /**
   * Check if this subtopic represents a novel angle
   */
  _isNovelAngle(cluster, subtopic) {
    if (!cluster.subtopics || cluster.subtopics.size === 0) {
      return true; // First mention is novel
    }

    // Check if this exact subtopic exists
    if (cluster.subtopics.has(subtopic)) {
      const lastMention = cluster.lastMentions.get(subtopic);
      const hoursSinceLastMention = (Date.now() - lastMention) / (1000 * 60 * 60);
      
      // Novel if hasn't been mentioned in 24 hours
      return hoursSinceLastMention > 24;
    }

    // Check for similar subtopics (fuzzy match)
    for (const existing of cluster.subtopics) {
      if (this._areSimilarSubtopics(existing, subtopic)) {
        return false; // Similar angle already exists
      }
    }

    return true; // Genuinely novel angle
  }

  /**
   * Check if two subtopics are similar
   */
  _areSimilarSubtopics(subtopic1, subtopic2) {
    const words1 = new Set(subtopic1.toLowerCase().split(/\s+/));
    const words2 = new Set(subtopic2.toLowerCase().split(/\s+/));
    
    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    return similarity > 0.5; // 50% word overlap = similar
  }

  /**
   * Score the evolution based on novelty, phase change, and recency
   */
  scoreEvolution(cluster, subtopic, isNovelAngle, isPhaseChange) {
    let score = 0;

    // Novelty bonus
    if (isNovelAngle) {
      score += this.noveltyWeight;
    }

    // Phase change bonus
    if (isPhaseChange) {
      score += this.phaseChangeWeight;
    }

    // Recency and diversity bonus
    const diversityScore = this._calculateDiversityScore(cluster);
    score += diversityScore * this.recencyWeight;

    // Normalize to 0-1 range
    return Math.min(1.0, Math.max(0, score));
  }

  /**
   * Calculate diversity score based on cluster history
   */
  _calculateDiversityScore(cluster) {
    if (!cluster.subtopics || cluster.subtopics.size <= 1) {
      return 0.5; // Neutral for single subtopic
    }

    // More subtopics = more diverse = higher score
    const uniqueSubtopics = cluster.subtopics.size;
    const totalEntries = cluster.entries?.length || 0;
    
    if (totalEntries === 0) return 0.5;

    // Diversity ratio: unique subtopics / total entries
    // Normalize to 0-1 range
    const diversityRatio = Math.min(1.0, uniqueSubtopics / Math.max(1, totalEntries * 0.3));
    
    return diversityRatio;
  }

  /**
   * Generate human-readable signals for scoring/metadata
   */
  _generateSignals(subtopic, isNovelAngle, isPhaseChange, phase, evolutionScore) {
    const signals = [];

    if (isNovelAngle) {
      signals.push(`novel angle: ${subtopic}`);
    }

    if (isPhaseChange) {
      signals.push(`phase shift to ${phase}`);
    }

    if (evolutionScore > 0.6) {
      signals.push('high evolution score');
    }

    signals.push(`phase: ${phase}`);

    return signals;
  }

  /**
   * Default response when analysis fails or is skipped
   */
  _getDefaultResponse(topic) {
    return {
      subtopic: `${topic} discussion`,
      isNovelAngle: false,
      isPhaseChange: false,
      phase: 'general',
      evolutionScore: 0,
      signals: []
    };
  }

  /**
   * Cache key generation
   */
  _getCacheKey(topic, content) {
    const contentHash = this._simpleHash(content.slice(0, 200));
    return `${topic}:${contentHash}`;
  }

  /**
   * Simple string hash
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Check if word is a stop word
   */
  _isStopWord(word) {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with', 
      'to', 'for', 'of', 'as', 'by', 'an', 'be', 'this', 'that', 'from'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Cleanup old cache entries
   */
  _cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.subtopicCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.subtopicCache.delete(key);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cacheSize: this.subtopicCache.size,
      llmEnabled: this.llmEnabled,
      weights: {
        novelty: this.noveltyWeight,
        phaseChange: this.phaseChangeWeight,
        recency: this.recencyWeight
      }
    };
  }
}

module.exports = { TopicEvolutionTracker, PHASE_TAXONOMY };
