// Semantic Analyzer - LLM-powered semantic understanding beyond keywords

class SemanticAnalyzer {
  constructor(runtime, logger, options = {}) {
    this.runtime = runtime;
    this.logger = logger;
    
    // Feature flags
    this.llmSemanticEnabled = process.env.CONTEXT_LLM_SEMANTIC_ENABLED === 'true' || false;
    
    // Cache configuration
    this.cacheTTL = parseInt(process.env.SEMANTIC_CACHE_TTL) || 3600000; // 1 hour default
    this.semanticCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    
    // Static fallback for when LLM is disabled or fails
    this.staticMappings = {
      'pixel art': ['8-bit', 'sprite', 'retro', 'low-res', 'pixelated', 'bitmap', 'pixel', 'pixelated'],
      'lightning network': ['LN', 'sats', 'zap', 'invoice', 'channel', 'payment', 'lightning', 'bolt', 'L2'],
      'creative coding': ['generative', 'algorithm', 'procedural', 'interactive', 'visualization', 'p5js', 'processing'],
      'collaborative canvas': ['drawing', 'paint', 'sketch', 'artwork', 'contribute', 'place', 'collaborative', 'canvas'],
      'value4value': ['v4v', 'creator', 'support', 'donation', 'tip', 'creator economy', 'patronage'],
      'nostr dev': ['relay', 'NIP', 'protocol', 'client', 'pubkey', 'event', 'nostr', 'decentralized'],
      'self-hosted': ['VPS', 'server', 'homelab', 'docker', 'self-custody', 'sovereignty', 'self-host'],
      'bitcoin art': ['ordinals', 'inscription', 'on-chain', 'sat', 'btc art', 'digital collectible', 'bitcoin'],
      'AI agents': ['agent', 'autonomous', 'AI', 'artificial intelligence', 'bot', 'automation', 'LLM'],
      'community': ['community', 'social', 'network', 'connection', 'together', 'collective', 'group']
    };
    
    // Periodic cache cleanup
    this.cleanupInterval = setInterval(() => this._cleanupCache(), 300000); // Every 5 minutes
    
    this.logger.info(`[SEMANTIC] Initialized - LLM: ${this.llmSemanticEnabled}, Cache TTL: ${this.cacheTTL}ms`);
  }

  /**
   * Check if content semantically matches a topic
   * Uses LLM for deep understanding, falls back to keywords
   */
  async isSemanticMatch(content, topic, options = {}) {
    if (!content || !topic) return false;
    
    // Quick keyword check first (fast path)
    const quickMatch = this._quickKeywordMatch(content, topic);
    if (quickMatch) {
      this.logger.debug(`[SEMANTIC] Quick match: "${topic}" found in content`);
      return true;
    }
    
    // If LLM disabled, use static mappings only
    if (!this.llmSemanticEnabled) {
      return this._staticSemanticMatch(content, topic);
    }
    
    // Try cache
    const cacheKey = this._getCacheKey(content, topic);
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      this.cacheHits++;
      this.logger.debug(`[SEMANTIC] Cache hit for "${topic}" (${this.cacheHits}/${this.cacheHits + this.cacheMisses})`);
      return cached;
    }
    
    this.cacheMisses++;
    
    // LLM semantic analysis
    try {
      const result = await this._llmSemanticMatch(content, topic, options);
      this._addToCache(cacheKey, result);
      return result;
    } catch (err) {
      this.logger.debug(`[SEMANTIC] LLM failed for "${topic}", using static fallback:`, err.message);
      return this._staticSemanticMatch(content, topic);
    }
  }

  /**
   * Batch semantic matching for efficiency
   * Analyzes multiple topic matches in a single LLM call
   */
  async batchSemanticMatch(content, topics, options = {}) {
    if (!content || !topics || topics.length === 0) return {};
    
    const results = {};
    const uncachedTopics = [];
    
    // Check cache first
    for (const topic of topics) {
      const cacheKey = this._getCacheKey(content, topic);
      const cached = this._getFromCache(cacheKey);
      if (cached !== null) {
        results[topic] = cached;
        this.cacheHits++;
      } else {
        uncachedTopics.push(topic);
        this.cacheMisses++;
      }
    }
    
    // If all cached, return
    if (uncachedTopics.length === 0) {
      this.logger.debug(`[SEMANTIC] Batch all cached (${topics.length} topics)`);
      return results;
    }
    
    // If LLM disabled, use static for uncached
    if (!this.llmSemanticEnabled) {
      for (const topic of uncachedTopics) {
        results[topic] = this._staticSemanticMatch(content, topic);
      }
      return results;
    }
    
    // Batch LLM analysis
    try {
      const batchResults = await this._llmBatchSemanticMatch(content, uncachedTopics, options);
      
      // Cache and merge results
      for (const topic of uncachedTopics) {
        const match = batchResults[topic] || false;
        results[topic] = match;
        const cacheKey = this._getCacheKey(content, topic);
        this._addToCache(cacheKey, match);
      }
      
      this.logger.debug(`[SEMANTIC] Batch analyzed ${uncachedTopics.length} topics`);
      return results;
      
    } catch (err) {
      this.logger.debug(`[SEMANTIC] Batch LLM failed, using static fallback:`, err.message);
      
      // Fallback to static for uncached
      for (const topic of uncachedTopics) {
        results[topic] = this._staticSemanticMatch(content, topic);
      }
      return results;
    }
  }

  /**
   * Get semantic similarity score (0-1) between content and topic
   */
  async getSemanticSimilarity(content, topic, options = {}) {
    if (!this.llmSemanticEnabled) {
      // Simple binary: match = 0.8, no match = 0.2
      const match = this._staticSemanticMatch(content, topic);
      return match ? 0.8 : 0.2;
    }
    
    try {
      const prompt = `Rate the semantic similarity between this content and topic on a scale of 0.0 to 1.0.

Content: "${content.slice(0, 500)}"
Topic: ${topic}

Consider:
- Conceptual overlap (shared ideas/domains)
- Implicit connections (related but not explicitly stated)
- Intent alignment (does content serve topic's purpose?)
- Context relevance (would someone interested in topic care about this?)

Respond with ONLY a number between 0.0 and 1.0:`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 10
      });
      
      const score = parseFloat(response.trim());
      return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
      
    } catch (err) {
      this.logger.debug(`[SEMANTIC] Similarity scoring failed:`, err.message);
      const match = this._staticSemanticMatch(content, topic);
      return match ? 0.7 : 0.3;
    }
  }

  /**
   * LLM-powered semantic matching
   */
  async _llmSemanticMatch(content, topic, options = {}) {
    const prompt = `Does this content semantically relate to the topic "${topic}"?

Think beyond exact keywords - consider:
- Conceptual connections (e.g., "micropayment protocol" relates to "lightning network")
- Domain overlap (e.g., "generative art systems" relates to "pixel art")
- Implicit mentions (e.g., "collaborative drawing" relates to "collaborative canvas")
- Intent alignment (would someone interested in "${topic}" care about this?)

Content: "${content.slice(0, 500)}"

Topic: ${topic}

Respond with ONLY: "YES" or "NO"`;

    const response = await this.runtime.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 5
    });
    
    const result = response.trim().toUpperCase();
    return result === 'YES' || result.startsWith('YES');
  }

  /**
   * Batch LLM semantic matching (more efficient)
   */
  async _llmBatchSemanticMatch(content, topics, options = {}) {
    const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');
    
    const prompt = `Analyze if this content relates to each topic. Think semantically, beyond keywords.

Content: "${content.slice(0, 500)}"

Topics:
${topicList}

For each topic, respond YES or NO based on:
- Conceptual connections
- Domain overlap  
- Implicit mentions
- Intent alignment

Respond with ONLY numbers and YES/NO, one per line:
1. YES/NO
2. YES/NO
...`;

    const response = await this.runtime.generateText(prompt, {
      temperature: 0.1,
      maxTokens: 100
    });
    
    // Parse response
    const results = {};
    const lines = response.trim().split('\n');
    
    topics.forEach((topic, i) => {
      const line = lines[i]?.trim().toUpperCase() || '';
      results[topic] = line.includes('YES');
    });
    
    return results;
  }

  /**
   * Quick keyword check (fast path before LLM)
   */
  _quickKeywordMatch(content, topic) {
    const contentLower = content.toLowerCase();
    const topicLower = topic.toLowerCase();
    
    // Direct topic mention
    if (contentLower.includes(topicLower)) {
      return true;
    }
    
    // Check topic words individually (if multi-word topic)
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
    if (topicWords.length > 1) {
      const matchCount = topicWords.filter(word => contentLower.includes(word)).length;
      if (matchCount >= topicWords.length * 0.7) { // 70% of words match
        return true;
      }
    }
    
    return false;
  }

  /**
   * Static keyword-based semantic matching (fallback)
   */
  _staticSemanticMatch(content, topic) {
    const relatedTerms = this.staticMappings[topic.toLowerCase()] || [];
    const contentLower = content.toLowerCase();
    return relatedTerms.some(term => contentLower.includes(term.toLowerCase()));
  }

  /**
   * Cache management
   */
  _getCacheKey(content, topic) {
    // Use first 200 chars of content + topic for cache key
    const contentSnippet = content.slice(0, 200).toLowerCase().trim();
    return `${topic.toLowerCase()}:${this._simpleHash(contentSnippet)}`;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  _getFromCache(key) {
    const cached = this.semanticCache.get(key);
    if (!cached) return null;
    
    // Check expiry
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.semanticCache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  _addToCache(key, value) {
    // Limit cache size
    if (this.semanticCache.size > 1000) {
      // Remove oldest 20%
      const entries = Array.from(this.semanticCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, 200);
      toRemove.forEach(([k]) => this.semanticCache.delete(k));
    }
    
    this.semanticCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  _cleanupCache() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, cached] of this.semanticCache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        this.semanticCache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.logger.debug(`[SEMANTIC] Cleaned ${removed} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? (this.cacheHits / total * 100).toFixed(1) : 0;
    
    return {
      size: this.semanticCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: `${hitRate}%`,
      enabled: this.llmSemanticEnabled
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.semanticCache.clear();
    this.logger.info('[SEMANTIC] Destroyed - Cache stats:', this.getCacheStats());
  }

  /**
   * Label a subtopic using LLM or fallback
   * Used by TopicEvolutionTracker for semantic subtopic clustering
   */
  async labelSubtopic(topic, content, contextHints = {}) {
    // Use simplified prompt for subtopic labeling
    const trendingContext = contextHints.trending?.length 
      ? `\nTrending: ${contextHints.trending.slice(0, 3).join(', ')}`
      : '';

    const prompt = `Label the specific angle for "${topic}":
"${content.slice(0, 300)}"${trendingContext}

Reply with 2-5 words describing the specific angle:`;

    if (!this.llmSemanticEnabled || !this.runtime?.generateText) {
      // Fallback: extract key terms
      return this._fallbackSubtopicLabel(topic, content);
    }

    try {
      const response = await this.runtime.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 20
      });

      let label = response.trim()
        .toLowerCase()
        .replace(/^["']|["']$/g, '')
        .slice(0, 50);

      // Validate
      if (!label || label.length < 3 || label.split(' ').length > 6) {
        return this._fallbackSubtopicLabel(topic, content);
      }

      return label;
    } catch (err) {
      this.logger.debug('[SEMANTIC] Subtopic labeling failed:', err.message);
      return this._fallbackSubtopicLabel(topic, content);
    }
  }

  /**
   * Fallback subtopic labeling without LLM
   */
  _fallbackSubtopicLabel(topic, content) {
    const contentLower = content.toLowerCase();
    
    // Extract meaningful bigrams
    const words = contentLower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !this._isStopWord(w))
      .slice(0, 8);
    
    if (words.length >= 2) {
      return `${words[0]} ${words[1]}`;
    }
    
    return `${topic} discussion`;
  }

  /**
   * Check if word is a stop word
   */
  _isStopWord(word) {
    const stopWords = new Set([
      'this', 'that', 'with', 'from', 'have', 'been', 'their', 'which',
      'about', 'would', 'there', 'could', 'should', 'when', 'where'
    ]);
    return stopWords.has(word.toLowerCase());
  }
}

module.exports = { SemanticAnalyzer };
