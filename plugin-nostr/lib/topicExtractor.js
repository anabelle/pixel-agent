// Optimized Topic Extractor with Batching & Caching
const { FORBIDDEN_TOPIC_WORDS, TIMELINE_LORE_IGNORED_TERMS, EXTRACTED_TOPICS_LIMIT } = require('./nostr');

class TopicExtractor {
  constructor(runtime, logger, options = {}) {
    this.runtime = runtime;
    this.logger = logger || console;
    
    // Batching config
    this.batchSize = parseInt(process.env.TOPIC_BATCH_SIZE, 10) || 5;
    this.batchWaitMs = parseInt(process.env.TOPIC_BATCH_WAIT_MS, 10) || 100;
    this.pendingBatch = [];
    this.batchTimer = null;
    this._isProcessing = false; // Guard against concurrent batch processing
    
    // Cache config (5 minute TTL)
    this.cache = new Map();
    this.cacheTTL = parseInt(process.env.TOPIC_CACHE_TTL_MS, 10) || 5 * 60 * 1000;
    this.maxCacheSize = parseInt(process.env.TOPIC_CACHE_MAX_SIZE, 10) || 1000;
    
    // Stats
    this.stats = {
      llmCalls: 0,
      cacheHits: 0,
      skipped: 0,
      processed: 0,
      batchedSavings: 0
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanupCache(), 60000);
  }

  async extractTopics(event) {
    this.stats.processed++;
    
    if (!event || !event.content) return [];
    
    const content = event.content.trim();
    
    // Skip very short or empty messages
    if (content.length < 10 || !this._hasFullSentence(content)) {
      this.stats.skipped++;
      this.logger?.debug?.(`[TOPIC] Skipping short message: ${event.id?.slice(0, 8)}`);
      return this._extractFastTopics(event);
    }
    
    // Check cache first
    const cacheKey = this._getCacheKey(content);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.stats.cacheHits++;
      this.logger?.debug?.(`[TOPIC] Cache hit for ${event.id?.slice(0, 8)}`);
      return cached.topics;
    }
    
    // Add to batch and wait
    return new Promise((resolve) => {
      this.pendingBatch.push({ event, resolve });
      
      // Process batch when full OR start timer if not already running
      if (this.pendingBatch.length >= this.batchSize) {
        // Batch is full - process immediately
        if (this.batchTimer) {
          clearTimeout(this.batchTimer);
          this.batchTimer = null;
        }
        this._processBatch();
      } else if (!this.batchTimer && !this._isProcessing) {
        // Start timer only if one isn't already running
        this.batchTimer = setTimeout(() => this._processBatch(), this.batchWaitMs);
      }
      // If timer is already running, just let it continue - new event added to pending batch
    });
  }

  async _processBatch() {
    // Guard against concurrent batch processing
    if (this._isProcessing || this.pendingBatch.length === 0) return;
    
    this._isProcessing = true;
    this.batchTimer = null;
    
    try {
      const batch = this.pendingBatch.splice(0, this.batchSize);
      
      this.logger?.debug?.(`[TOPIC] Processing batch of ${batch.length} events`);
      
      try {
        if (batch.length === 1) {
          // Single event - use original extraction
          const result = await this._extractSingle(batch[0].event);
          batch[0].resolve(result);
        } else {
          // Batch extraction
          const results = await this._extractBatch(batch.map(b => b.event));
          batch.forEach((item, i) => {
            item.resolve(results[i] || []);
          });
          
          this.stats.batchedSavings += (batch.length - 1); // Saved LLM calls
        }
      } catch (error) {
        this.logger?.warn?.(`[TOPIC] Batch extraction failed: ${error.message}`);
        // Fallback to fast extraction
        batch.forEach(item => {
          item.resolve(this._extractFastTopics(item.event));
        });
      }
    } finally {
      this._isProcessing = false;
      
      // If more events arrived while processing, schedule another batch
      if (this.pendingBatch.length > 0) {
        setTimeout(() => this._processBatch(), 0);
      }
    }
  }

  async _extractBatch(events) {
    if (!this.runtime?.useModel) {
      return events.map(e => this._extractFastTopics(e));
    }
    
    // Build batch prompt with Unicode-aware hashtag extraction
    const eventSummaries = events.map((evt, idx) => {
      const content = evt.content.slice(0, 300);
      const hashtags = (evt.content.match(/#[\p{L}\p{N}_]+/gu) || []).join(' ');
      return `${idx + 1}. ${content}${hashtags ? ` [Tags: ${hashtags}]` : ''}`;
    }).join('\n\n');
    
    const prompt = `Extract main topics from these ${events.length} posts. For each post, list up to ${EXTRACTED_TOPICS_LIMIT} specific topics.

Rules:
- Use ONLY topics actually mentioned or clearly implied
- Prefer: proper names, specific projects, events, tools, concepts, places
- Avoid generic terms: bitcoin, btc, nostr, crypto, blockchain, lightning, technology, community, discussion, general, various, update, news
- Never use: pixel, art, lnpixels, vps, freedom, creativity, survival, collaborative, douglas, adams, pratchett, terry
- If post has hashtags: use those as topics
- Short posts: pick most meaningful topic (not generic)
- If no clear topics: respond 'none' for that post

POSTS:
${eventSummaries}

OUTPUT FORMAT (respond with one line per post, in order):
topic1, topic2, topic3
topic1, topic2
none
(continue for all ${events.length} posts)`;

    try {
      const response = await this.runtime.useModel('TEXT_SMALL', {
        prompt,
        maxTokens: Math.min(500, events.length * 50),
        temperature: 0.3
      });

      // Count this LLM call
      this.stats.llmCalls++;

      const responseText = typeof response === 'string' ? response : (response?.text ?? '');
      
      // Parse batch response - one line per post
      const lines = responseText.trim().split('\n').filter(l => l.trim());
      const results = [];
      
      for (let i = 0; i < events.length; i++) {
        const line = lines[i];
        let topics = [];
        
        if (line) {
          // Clean any stray numbering the model might add
          const cleaned = line.replace(/^\d+[\.\:\)\-]\s*/, '').trim();
          
          if (cleaned && cleaned.toLowerCase() !== 'none') {
            topics = cleaned
              .split(',')
              .map(t => this._sanitizeTopic(t))
              .filter(Boolean)
              .filter(t => !FORBIDDEN_TOPIC_WORDS.has(t) && !TIMELINE_LORE_IGNORED_TERMS.has(t))
              .slice(0, EXTRACTED_TOPICS_LIMIT);
          }
        }
        
        // Add hashtags from original event
        const hashtagTopics = this._extractHashtags(events[i]);
        const merged = [...hashtagTopics, ...topics];
        const unique = Array.from(new Set(merged)).slice(0, EXTRACTED_TOPICS_LIMIT);
        
        // Fallback if empty
        const finalTopics = unique.length > 0 ? unique : this._extractFastTopics(events[i]);
        
        // Cache result
        const cacheKey = this._getCacheKey(events[i].content);
        this._setCache(cacheKey, finalTopics);
        
        results.push(finalTopics);
      }
      
      this.logger?.debug?.(`[TOPIC] Batch extracted topics for ${events.length} events with 1 LLM call (saved ${events.length - 1} calls)`);
      
      return results;
    } catch (error) {
      this.logger?.warn?.(`[TOPIC] Batch LLM failed: ${error.message}`);
      return events.map(e => this._extractFastTopics(e));
    }
  }

  async _extractSingle(event) {
    if (!this.runtime?.useModel) {
      return this._extractFastTopics(event);
    }
    
    try {
      const hashtags = this._extractHashtags(event);
      const truncatedContent = event.content.slice(0, 800);
      
      const prompt = `Extract main topics from this post. Give up to ${EXTRACTED_TOPICS_LIMIT} specific topics.

Rules:
- Use ONLY topics actually mentioned or clearly implied
- Prefer: proper names, specific projects, events, tools, concepts, places
- Avoid: bitcoin, btc, nostr, crypto, blockchain, lightning, technology, community, discussion, general, various, update, news
- Never use: pixel, art, lnpixels, vps, freedom, creativity, survival, collaborative, douglas, adams, pratchett, terry
- If post has hashtags: use those as topics
- Output: topics separated by commas, max ${EXTRACTED_TOPICS_LIMIT}

<POST_TO_ANALYZE>${truncatedContent}</POST_TO_ANALYZE>`;

      const response = await this.runtime.useModel('TEXT_SMALL', {
        prompt,
        maxTokens: 120,
        temperature: 0.3
      });

      // Count this LLM call
      this.stats.llmCalls++;

      const responseText = typeof response === 'string' ? response : (response?.text ?? '');
      const rawTopics = responseText.trim()
        .split(',')
        .map(t => this._sanitizeTopic(t))
        .filter(Boolean)
        .filter(t => !FORBIDDEN_TOPIC_WORDS.has(t) && !TIMELINE_LORE_IGNORED_TERMS.has(t))
        .slice(0, EXTRACTED_TOPICS_LIMIT);

      // Merge with hashtags
      const merged = [...hashtags, ...rawTopics];
      const unique = Array.from(new Set(merged)).slice(0, EXTRACTED_TOPICS_LIMIT);
      const finalTopics = unique.length > 0 ? unique : this._extractFastTopics(event);
      
      // Cache result
      const cacheKey = this._getCacheKey(event.content);
      this._setCache(cacheKey, finalTopics);
      
      return finalTopics;
    } catch (error) {
      this.logger?.warn?.(`[TOPIC] Single extraction failed: ${error.message}`);
      return this._extractFastTopics(event);
    }
  }

  _extractFastTopics(event) {
    // Fast non-LLM extraction for fallback
    const content = event.content.toLowerCase();
    const topics = [];
    
    // Extract hashtags
    topics.push(...this._extractHashtags(event));
    
    // Extract @mentions (specific people)
    const mentions = content.match(/@\w+/g) || [];
    topics.push(...mentions.map(m => m.slice(1)).slice(0, 3));
    
    // Extract common nostr entities
    const entities = content.match(/\b(relay|zap|lightning|wallet|sats|satoshi|node)\b/gi) || [];
    topics.push(...entities.map(e => e.toLowerCase()));
    
    // Extract URLs (just domain)
    const urls = content.match(/https?:\/\/([^\/\s]+)/gi) || [];
    topics.push(...urls.map(u => {
      try {
        const domain = new URL(u).hostname.replace('www.', '');
        return domain.split('.')[0]; // First part of domain
      } catch {
        return null;
      }
    }).filter(Boolean));
    
    // Fallback: extract bigrams (two-word phrases)
    if (topics.length === 0) {
      const words = content
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !FORBIDDEN_TOPIC_WORDS.has(w));
      
      for (let i = 0; i < words.length - 1 && topics.length < 5; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        if (bigram.length < 30) topics.push(bigram);
      }
      
      // Single words as last resort
      topics.push(...words.slice(0, 5));
    }
    
    // Dedupe and limit
    const unique = Array.from(new Set(topics))
      .filter(t => !FORBIDDEN_TOPIC_WORDS.has(t) && !TIMELINE_LORE_IGNORED_TERMS.has(t))
      .slice(0, EXTRACTED_TOPICS_LIMIT);
    
    return unique;
  }

  _extractHashtags(event) {
    const content = event.content.toLowerCase();
    const hashtags = content.match(/#[\p{L}\p{N}_]+/gu) || [];
    return hashtags
      .map(h => this._sanitizeTopic(h.slice(1)))
      .filter(t => t && !FORBIDDEN_TOPIC_WORDS.has(t) && !TIMELINE_LORE_IGNORED_TERMS.has(t));
  }

  _sanitizeTopic(t) {
    if (!t || typeof t !== 'string') return '';
    let s = t
      .trim()
      .replace(/^[-–—•*>"]+\s*/g, '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/nostr:[a-z0-9]+\b/gi, ' ')
      .replace(/[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}\p{S}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    
    if (!s || s.length < 2 || s.length > 100) return '';
    if (/^\d+$/.test(s)) return '';
    if (s === 'general' || s === 'various' || s === 'discussion' || s === 'none') return '';
    
    return s;
  }

  _hasFullSentence(content) {
    // Check if content has at least one complete thought
    const text = content.trim();
    
    // Too short
    if (text.length < 15) return false;
    
    // Has multiple words and ends with punctuation
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 5) return true;
    
    // Has sentence-ending punctuation
    if (/[.!?]/.test(text)) return true;
    
    // Has multiple clauses (commas, semicolons)
    if (wordCount >= 3 && /[,;:]/.test(text)) return true;
    
    return false;
  }

  _getCacheKey(content) {
    // Simple hash function for cache key
    const normalized = content.toLowerCase().trim().slice(0, 500);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  _setCache(key, topics) {
    // LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      topics,
      timestamp: Date.now()
    });
  }

  _cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger?.debug?.(`[TOPIC] Cleaned ${cleaned} expired cache entries`);
    }
  }

  getStats() {
    const totalProcessed = this.stats.processed;
    const cacheHitRate = totalProcessed > 0 
      ? ((this.stats.cacheHits / totalProcessed) * 100).toFixed(1) 
      : 0;
    const skipRate = totalProcessed > 0
      ? ((this.stats.skipped / totalProcessed) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      cacheHitRate: `${cacheHitRate}%`,
      skipRate: `${skipRate}%`,
      estimatedSavings: this.stats.cacheHits + this.stats.skipped + this.stats.batchedSavings,
      cacheSize: this.cache.size
    };
  }

  destroy() {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

module.exports = { TopicExtractor };
