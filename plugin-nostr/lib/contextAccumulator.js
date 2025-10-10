// Context Accumulator - Builds continuous understanding of Nostr activity
const { extractTopicsFromEvent } = require('./nostr');

class ContextAccumulator {
  constructor(runtime, logger, options = {}) {
    this.runtime = runtime;
    this.logger = logger || console;
    this.createUniqueUuid = options.createUniqueUuid || null;
    
    // Hourly digests: hour timestamp -> digest data
    this.hourlyDigests = new Map();
    
    // Emerging stories: topic -> story data
    this.emergingStories = new Map();
    
    // Topic timelines: topic -> [events over time]
    this.topicTimelines = new Map();

    // Timeline lore digests generated from home feed reasoning
    this.timelineLoreEntries = [];
    
    // Daily narrative accumulator
    this.dailyEvents = [];
    
    const parsePositiveInt = (value, fallback) => {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    // Configuration
    this.maxHourlyDigests = 24; // Keep last 24 hours
    this.maxTopicTimelineEvents = 50; // Per topic
    this.maxDailyEvents = process.env.MAX_DAILY_EVENTS ? parsePositiveInt(process.env.MAX_DAILY_EVENTS, 5000) : 5000; // For daily report - increased from 1000
    this.emergingStoryThreshold = parsePositiveInt(
      options?.emergingStoryMinUsers ?? process.env.CONTEXT_EMERGING_STORY_MIN_USERS,
      3
    ); // Min users to qualify as "emerging"
    this.emergingStoryMentionThreshold = parsePositiveInt(
      options?.emergingStoryMentionThreshold ?? process.env.CONTEXT_EMERGING_STORY_MENTION_THRESHOLD,
      5
    ); // Min mentions required before we log an emerging story
    this.emergingStoryContextMinUsers = parsePositiveInt(
      options?.contextMinUsers ?? process.env.CONTEXT_EMERGING_STORY_CONTEXT_MIN_USERS,
      Math.max(this.emergingStoryThreshold, 5)
    );
    this.emergingStoryContextMinMentions = parsePositiveInt(
      options?.contextMinMentions ?? process.env.CONTEXT_EMERGING_STORY_CONTEXT_MIN_MENTIONS,
      10
    );
    this.emergingStoryContextMaxTopics = parsePositiveInt(
      options?.contextMaxTopics ?? process.env.CONTEXT_EMERGING_STORY_CONTEXT_LIMIT,
      20
    );
    this.emergingStoryContextRecentEvents = parsePositiveInt(
      options?.contextRecentEvents ?? process.env.CONTEXT_EMERGING_STORY_CONTEXT_RECENT_EVENTS,
      5
    );

    this.maxTimelineLoreEntries = parsePositiveInt(
      options?.timelineLoreLimit ?? process.env.CONTEXT_TIMELINE_LORE_LIMIT,
      60
    );
    // Display/config limits for topic lists in logs/prompts
    this.displayTopTopicsLimit = parsePositiveInt(
      options?.displayTopTopicsLimit ?? process.env.PROMPT_TOPICS_LIMIT,
      15
    );
    
    // Feature flags
    this.enabled = true;
    this.hourlyDigestEnabled = true;
    this.dailyReportEnabled = true;
    this.emergingStoriesEnabled = true;
  // Respect constructor option llmAnalysis to turn on LLM paths without new env vars
  const llmOpt = options?.llmAnalysis === true;
  this.llmAnalysisEnabled = llmOpt || process.env.CONTEXT_LLM_ANALYSIS_ENABLED === 'true' || false;
  this.llmSentimentEnabled = process.env.CONTEXT_LLM_SENTIMENT_ENABLED === 'true' || this.llmAnalysisEnabled; // Can enable separately
  this.llmTopicExtractionEnabled = process.env.CONTEXT_LLM_TOPICS_ENABLED === 'true' || this.llmAnalysisEnabled; // Can enable separately
    
  // Performance tuning
  this.llmSentimentMinLength = 20; // Minimum content length for LLM sentiment
  // Allow larger posts for LLM sentiment/topic extraction (overridable via ENV)
  this.llmSentimentMaxLength = process.env.CONTEXT_LLM_SENTIMENT_MAXLEN ? parseInt(process.env.CONTEXT_LLM_SENTIMENT_MAXLEN) : 1000;
  this.llmTopicMinLength = 20; // Minimum content length for LLM topic extraction
  this.llmTopicMaxLength = process.env.CONTEXT_LLM_TOPIC_MAXLEN ? parseInt(process.env.CONTEXT_LLM_TOPIC_MAXLEN) : 1000;
  // Narrative sampling controls
  this.llmNarrativeSampleSize = process.env.LLM_NARRATIVE_SAMPLE_SIZE ? parseInt(process.env.LLM_NARRATIVE_SAMPLE_SIZE) : 800; // Default increased from 500
  this.llmNarrativeMaxContentLength = process.env.LLM_NARRATIVE_MAX_CONTENT ? parseInt(process.env.LLM_NARRATIVE_MAX_CONTENT) : 30000; // Default increased from 15000
  // Hourly pool size for narrative sampling (how many recent events to consider)
  this.llmHourlyPoolSize = process.env.LLM_HOURLY_POOL_SIZE ? parseInt(process.env.LLM_HOURLY_POOL_SIZE) : 200;
    
    // Real-time analysis configuration
    this.realtimeAnalysisEnabled = process.env.REALTIME_ANALYSIS_ENABLED === 'true' || false;
    this.quarterHourAnalysisEnabled = process.env.QUARTER_HOUR_ANALYSIS_ENABLED === 'true' || false;
    this.adaptiveSamplingEnabled = process.env.ADAPTIVE_SAMPLING_ENABLED === 'true' || true; // Default enabled
    this.rollingWindowSize = process.env.ROLLING_WINDOW_SIZE ? parseInt(process.env.ROLLING_WINDOW_SIZE) : 1000; // Rolling window for real-time analysis

    // Cached system context information for persistence
    this._systemContext = null;
    this._systemContextPromise = null;

    // Initialize real-time analysis intervals
    this.quarterHourInterval = null;
    this.rollingWindowInterval = null;
    this.trendDetectionInterval = null;

    // Start real-time analysis if enabled
    if (this.realtimeAnalysisEnabled) {
      setTimeout(() => this.startRealtimeAnalysis(), 10000); // Start after 10 seconds
    }
  }

  async _getSystemContext() {
    if (!this.runtime) return null;
    if (this._systemContext) return this._systemContext;

    if (!this._systemContextPromise) {
      try {
        const { ensureNostrContextSystem } = require('./context');
        const createUniqueUuid = this.createUniqueUuid || this.runtime.createUniqueUuid;
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
        this.logger.debug('[CONTEXT] Failed to initiate system context ensure:', err?.message || err);
        return null;
      }
    }

    try {
      this._systemContext = await this._systemContextPromise;
      return this._systemContext;
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to ensure system context:', err?.message || err);
      this._systemContextPromise = null;
      return null;
    }
  }

  async processEvent(evt, options = {}) {
    if (!this.enabled || !evt || !evt.id || !evt.content) return;

    try {
      const hour = this._getCurrentHour();
      
      // Initialize hourly digest if needed
      if (!this.hourlyDigests.has(hour)) {
        this.hourlyDigests.set(hour, this._createEmptyDigest());
      }
      
      const digest = this.hourlyDigests.get(hour);
      
      // 1. Basic tracking
      digest.eventCount++;
      digest.users.add(evt.pubkey);
      
      // 2. Extract structured data
  const extracted = await this._extractStructuredData(evt, options);
      
      // 3. Track topics
      for (const topic of extracted.topics) {
        digest.topics.set(topic, (digest.topics.get(topic) || 0) + 1);
        this._updateTopicTimeline(topic, evt);
      }
      
      // 4. Track sentiment
      if (extracted.sentiment) {
        digest.sentiment[extracted.sentiment]++;
      }
      
      // 5. Collect links and media
      if (extracted.links && extracted.links.length > 0) {
        digest.links.push(...extracted.links.slice(0, 10)); // Limit per event
      }
      
      // 6. Track conversations (threads)
      const threadId = this._getThreadId(evt);
      if (threadId !== evt.id) {
        if (!digest.conversations.has(threadId)) {
          digest.conversations.set(threadId, []);
        }
        digest.conversations.get(threadId).push({
          eventId: evt.id,
          author: evt.pubkey,
          timestamp: evt.created_at
        });
      }
      
      // 7. Detect emerging stories
      if (this.emergingStoriesEnabled) {
        await this._detectEmergingStory(evt, extracted);
      }
      
      // 8. Add to daily events (for end-of-day report)
      if (this.dailyEvents.length < this.maxDailyEvents) {
        this.dailyEvents.push({
          id: evt.id,
          author: evt.pubkey,
          content: evt.content.slice(0, 200),
          topics: extracted.topics,
          sentiment: extracted.sentiment,
          timestamp: evt.created_at || Date.now()
        });
      }
      
      // 9. Cleanup old data
      this._cleanupOldData();
      
    } catch (err) {
      this.logger.debug('[CONTEXT] processEvent error:', err.message);
    }
  }

  recordTimelineLore(entry) {
    if (!entry) return null;

    const record = {
      ...entry,
      timestamp: entry.timestamp || Date.now()
    };

    this.timelineLoreEntries.push(record);
    if (this.timelineLoreEntries.length > this.maxTimelineLoreEntries) {
      this.timelineLoreEntries.shift();
    }

    return record;
  }

  getTimelineLore(limit = 5) {
    if (!Number.isFinite(limit) || limit <= 0) limit = 5;
    
    // Sort by priority (high > medium > low) then recency
    const priorityMap = { high: 3, medium: 2, low: 1 };
    const sorted = [...this.timelineLoreEntries].sort((a, b) => {
      const priorityDiff = (priorityMap[b.priority] || 1) - (priorityMap[a.priority] || 1);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    
    return sorted.slice(0, limit);
  }

  async _extractStructuredData(evt, options = {}) {
    const content = evt.content || '';
    const allowTopicExtraction = options.allowTopicExtraction !== false;
    const skipGeneralFallback = options.skipGeneralFallback === true;
    
    // Extract links
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = content.match(linkRegex) || [];
    
    // Detect if it's a question
    const isQuestion = content.includes('?');
    
    // Topic extraction: Use unified extraction from nostr.js (includes LLM + fallback)
    let topics = [];
    let topicSource = 'none';

    if (allowTopicExtraction) {
      // extractTopicsFromEvent handles LLM extraction with proper filtering and fallback
      topics = await extractTopicsFromEvent(evt, this.runtime);
      if (topics.length > 0) {
        topicSource = 'extracted';
      }
    } else {
      topicSource = 'topic-extraction-disabled';
    }
    
    // If still no topics and not skipping fallback, use 'general'
    if (topics.length === 0 && !skipGeneralFallback) {
      topics = ['general'];
      topicSource = 'fallback-general';
    }

    if (this.logger?.debug) {
      const idSnippet = typeof evt.id === 'string' ? evt.id.slice(0, 8) : 'unknown';
      const topicSummary = topics.length > 0 ? topics.join(', ') : '(none)';
      this.logger.debug(`[CONTEXT] Topics(${topicSource}) evt=${idSnippet} -> ${topicSummary}`);
    }
    
    // Sentiment analysis: Try LLM first (if enabled and content is substantial), fallback to keyword-based
    let sentiment = 'neutral';
    
    if (this.llmSentimentEnabled && this.runtime && typeof this.runtime.generateText === 'function' && 
        content.length >= this.llmSentimentMinLength && content.length <= this.llmSentimentMaxLength) {
      // Use LLM for sentiment analysis on substantial content
      sentiment = await this._analyzeSentimentWithLLM(content);
    } else {
      // Fast keyword-based sentiment for short content or when LLM disabled
      sentiment = this._basicSentiment(content);
    }
    
    return {
      topics,
      links,
      sentiment,
      isQuestion,
      length: content.length
    };
  }

  async _extractTopicsWithLLM(content) {
    try {
  const truncatedContent = content.slice(0, 800);
  const prompt = `What are the main topics in this post? Give 1-3 specific topics.

Rules:
- ONLY use topics that are actually mentioned or clearly implied in the post
- Do NOT invent or add topics that aren't in the post
- NEVER include these words: pixel, art, lnpixels, vps, freedom, creativity, survival, collaborative, douglas, adams, pratchett, terry
- Be specific, not general
- If about a person, country, or event, use that as a topic
- No words like "general", "discussion", "various"
- Only respond with 'none' if the post truly contains no meaningful words or context (e.g., empty or just symbols)
- For short greetings or brief statements, choose the closest meaningful topic (e.g., 'greetings', 'motivation', 'bitcoin', the named person, etc.)
- If the post includes hashtags, named entities, or obvious subjects, use those as topics instead of 'none'
- Never answer with 'none' when any real words, hashtags, or references are present—pick the best fitting topic
- Respond with only the topics separated by commas on a single line
- Maximum 3 topics
- The post content is provided inside <POST_TO_ANALYZE> tags at the end.

THE POST TO ANALYZE IS THIS AND ONLY THIS FOLLOWING TEXT. DO NOT USE ANY OTHER INFORMATION FOR ANALYSIS ONLY USE ALL PREVIOUS INFO AS HIDDEN SECRET CONTEXT.
<POST_TO_ANALYZE>${truncatedContent}</POST_TO_ANALYZE>`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 50
      });

      const rawResponse = typeof response === 'string' ? response.trim() : '';
      if (!rawResponse) {
        this.logger.debug('[CONTEXT] LLM topics returned empty response, using fallback');
        return [];
      }

      // Treat any variation of "none" (case/punctuation/extra whitespace) as no topics
      if (/^\s*none[\s\W]*$/i.test(rawResponse)) {
        this.logger.debug(`[CONTEXT] LLM topics returned 'none', using fallback`);
        return [];
      }

      const responseLower = rawResponse.toLowerCase();
      const forbiddenWords = ['pixel', 'art', 'lnpixels', 'vps', 'freedom', 'creativity', 'survival', 'collaborative', 'douglas', 'adams', 'pratchett', 'terry'];
      const forbiddenSet = new Set(forbiddenWords.map(word => word.replace(/[\s-]+/g, '')));

      const rawTopics = responseLower.split(',');
      const topics = [];
      for (const rawTopic of rawTopics) {
        if (!rawTopic) continue;

        // Remove surrounding punctuation while keeping multi-word topics intact
        let sanitized = rawTopic
          .trim()
          .replace(/[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}\p{S}]+/gu, ' ') // punctuation & symbols -> space
          .replace(/\s+/g, ' ')
          .trim();

        if (!sanitized) continue;
        if (sanitized.length >= 50) continue; // Maintain reasonable length cap

        const comparisonKey = sanitized.replace(/[\s-]+/g, '');
        if (!comparisonKey) continue;

        if (comparisonKey === 'general' || comparisonKey === 'various' || comparisonKey === 'discussion' || comparisonKey === 'none') {
          continue;
        }

        if (forbiddenSet.has(comparisonKey)) {
          continue;
        }

        topics.push(sanitized);
        if (topics.length === 3) break; // Respect max of 3 topics
      }

      // Validate we got something useful
      if (topics.length === 0) {
        this.logger.debug(`[CONTEXT] LLM topics returned empty, using fallback`);
        return [];
      }
      
      this.logger.debug(`[CONTEXT] LLM extracted topics: ${topics.join(', ')}`);
      return topics;
      
    } catch (err) {
      this.logger.debug('[CONTEXT] LLM topic extraction failed:', err.message);
      return [];
    }
  }

  async _refineTopicsForDigest(digest) {
    // Refine vague "general" topics by analyzing the content in aggregate
    if (!this.llmTopicExtractionEnabled || !this.runtime || typeof this.runtime.generateText !== 'function') {
      return digest.topics; // Return as-is
    }

    try {
      // Check if we have too many "general" topics
      const generalCount = digest.topics.get('general') || 0;
      const totalTopics = Array.from(digest.topics.values()).reduce((sum, count) => sum + count, 0);
      
      // If "general" is more than 30% of topics, try to refine
      if (generalCount / totalTopics < 0.3) {
        return digest.topics; // Not too many vague topics
      }

      // Sample some recent events to understand what "general" actually means
      const recentEvents = this.dailyEvents
        .slice(-30)
        .filter(e => e.topics.includes('general'))
        .map(e => e.content)
        .slice(0, 10);

      if (recentEvents.length < 3) {
        return digest.topics; // Not enough data
      }

      const sampleContent = recentEvents.join('\n---\n').slice(0, 2000);

      const prompt = `Analyze these posts that were tagged as "general". Identify 3-5 specific recurring themes or topics. Be precise and insightful.

Posts:
${sampleContent}

Respond with ONLY the topics, comma-separated:`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.4,
        maxTokens: 60
      });

      // Parse refined topics
      const refinedTopics = response.trim()
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length < 50)
        .slice(0, 5);

      if (refinedTopics.length > 0) {
        // Create new topics map with refined topics replacing "general"
        const newTopics = new Map(digest.topics);
        
        // Distribute "general" count across refined topics
        const countPerTopic = Math.ceil(generalCount / refinedTopics.length);
        refinedTopics.forEach(topic => {
          newTopics.set(topic, (newTopics.get(topic) || 0) + countPerTopic);
        });
        
        // Remove or reduce "general"
        newTopics.delete('general');
        
        this.logger.info(`[CONTEXT] 🎯 Refined ${generalCount} "general" topics into: ${refinedTopics.join(', ')}`);
        return newTopics;
      }

      return digest.topics;
      
    } catch (err) {
      this.logger.debug('[CONTEXT] Topic refinement failed:', err.message);
      return digest.topics;
    }
  }

  async _analyzeSentimentWithLLM(content) {
    try {
      const prompt = `Analyze the sentiment of this post. Respond with ONLY one word: "positive", "negative", or "neutral".

Post: "${content.slice(0, 400)}"

Sentiment:`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 10
      });

      const sentimentLower = response.trim().toLowerCase();
      
      // Validate response
      if (sentimentLower.includes('positive')) return 'positive';
      if (sentimentLower.includes('negative')) return 'negative';
      if (sentimentLower.includes('neutral')) return 'neutral';
      
      // If LLM gives unexpected response, fallback to keyword analysis
      this.logger.debug(`[CONTEXT] LLM sentiment returned unexpected value: ${response.trim()}, using fallback`);
      return this._basicSentiment(content);
      
    } catch (err) {
      this.logger.debug('[CONTEXT] LLM sentiment analysis failed:', err.message);
      return this._basicSentiment(content);
    }
  }

  async _analyzeBatchSentimentWithLLM(contents) {
    // Batch sentiment analysis for efficiency when processing multiple posts
    try {
      if (!contents || contents.length === 0) return [];
      if (contents.length === 1) return [await this._analyzeSentimentWithLLM(contents[0])];
      
      // Limit batch size to prevent token overflow
      const batchSize = Math.min(contents.length, 10);
      const batch = contents.slice(0, batchSize);
      
      const prompt = `Analyze the sentiment of each post below. For each post, respond with ONLY one word: "positive", "negative", or "neutral".

${batch.map((c, i) => `Post ${i + 1}: "${c.slice(0, 200)}"`).join('\n\n')}

Respond with one sentiment per line in order (Post 1, Post 2, etc.):`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 50
      });

      // Parse response line by line
      const lines = response.trim().split('\n').filter(l => l.trim());
      const sentiments = [];
      
      for (let i = 0; i < batch.length; i++) {
        const line = lines[i]?.toLowerCase() || '';
        let sentiment = 'neutral';
        
        if (line.includes('positive')) sentiment = 'positive';
        else if (line.includes('negative')) sentiment = 'negative';
        else if (line.includes('neutral')) sentiment = 'neutral';
        else sentiment = this._basicSentiment(batch[i]); // Fallback
        
        sentiments.push(sentiment);
      }
      
      // Process remaining items with fallback if batch was limited
      for (let i = batchSize; i < contents.length; i++) {
        sentiments.push(this._basicSentiment(contents[i]));
      }
      
      return sentiments;
      
    } catch (err) {
      this.logger.debug('[CONTEXT] Batch sentiment analysis failed:', err.message);
      // Fallback to basic sentiment for all
      return contents.map(c => this._basicSentiment(c));
    }
  }

  _basicSentiment(content) {
    const lower = content.toLowerCase();
    
    // Expanded keyword lists with weighted scoring
    const positiveKeywords = {
      // Strong positive (weight: 2)
      'love': 2, 'amazing': 2, 'excellent': 2, 'fantastic': 2, 'awesome': 2, 
      'brilliant': 2, 'outstanding': 2, 'wonderful': 2, 'incredible': 2,
      'perfect': 2, 'beautiful': 2, 'stunning': 2, 'spectacular': 2,
      
      // Moderate positive (weight: 1)
      'great': 1, 'good': 1, 'nice': 1, 'cool': 1, 'happy': 1, 'excited': 1,
      'helpful': 1, 'interesting': 1, 'useful': 1, 'fun': 1, 'glad': 1,
      'appreciate': 1, 'thanks': 1, 'thank': 1, 'enjoy': 1, 'impressed': 1,
      'congrats': 1, 'celebrate': 1, 'win': 1, 'success': 1, 'inspiring': 1,
      
      // Emoji positive (weight: 1)
      '🚀': 1, '🎉': 1, '❤️': 1, '😊': 1, '👍': 1, '🔥': 1, '✨': 1, 
      '💪': 1, '🙌': 1, '👏': 1, '💯': 1, '⭐': 1, '🎊': 1, '😄': 1,
      '😍': 1, '🤩': 1, '💖': 1, '🌟': 1
    };
    
    const negativeKeywords = {
      // Strong negative (weight: 2)
      'hate': 2, 'terrible': 2, 'awful': 2, 'worst': 2, 'horrible': 2,
      'disgusting': 2, 'disaster': 2, 'pathetic': 2, 'useless': 2,
      'garbage': 2, 'trash': 2, 'scam': 2, 'fraud': 2, 'sucks': 2,
      
      // Moderate negative (weight: 1)
      'bad': 1, 'sad': 1, 'disappointing': 1, 'disappointed': 1, 'fail': 1,
      'failed': 1, 'broken': 1, 'problem': 1, 'issue': 1, 'wrong': 1,
      'error': 1, 'angry': 1, 'frustrated': 1, 'confusing': 1, 'confused': 1,
      'worried': 1, 'concerned': 1, 'unfortunate': 1, 'struggling': 1,
      
      // Emoji negative (weight: 1)
      '😢': 1, '😡': 1, '👎': 1, '😞': 1, '😔': 1, '😩': 1, '😤': 1,
      '💔': 1, '😠': 1, '😰': 1, '😓': 1, '🤦': 1, '😖': 1
    };
    
    // Calculate weighted sentiment scores
    let positiveScore = 0;
    let negativeScore = 0;
    
    for (const [keyword, weight] of Object.entries(positiveKeywords)) {
      if (lower.includes(keyword)) positiveScore += weight;
    }
    
    for (const [keyword, weight] of Object.entries(negativeKeywords)) {
      if (lower.includes(keyword)) negativeScore += weight;
    }
    
    // Check for negation patterns that might flip sentiment
    const negations = ['not', 'no', "don't", "doesn't", "didn't", "won't", "can't", "never"];
    const hasNegation = negations.some(neg => lower.includes(neg));
    
    // If there's negation near positive words, reduce positive score
    if (hasNegation && positiveScore > 0) {
      // Look for patterns like "not good", "not great", etc.
      for (const neg of negations) {
        for (const posWord of Object.keys(positiveKeywords)) {
          if (lower.includes(`${neg} ${posWord}`) || lower.includes(`${neg}${posWord}`)) {
            positiveScore -= positiveKeywords[posWord];
            negativeScore += 1; // Add to negative instead
          }
        }
      }
    }
    
    // Determine sentiment based on weighted scores
    const threshold = 1; // Need at least weight of 1 to count
    
    if (positiveScore > negativeScore && positiveScore >= threshold) return 'positive';
    if (negativeScore > positiveScore && negativeScore >= threshold) return 'negative';
    return 'neutral';
  }

  _getThreadId(evt) {
    try {
      const eTags = Array.isArray(evt.tags) ? evt.tags.filter(t => t[0] === 'e') : [];
      const root = eTags.find(t => t[3] === 'root');
      if (root && root[1]) return root[1];
      if (eTags.length > 0 && eTags[0][1]) return eTags[0][1];
    } catch {}
    return evt.id;
  }

  _updateTopicTimeline(topic, evt) {
    if (!this.topicTimelines.has(topic)) {
      this.topicTimelines.set(topic, []);
    }
    
    const timeline = this.topicTimelines.get(topic);
    timeline.push({
      eventId: evt.id,
      author: evt.pubkey,
      timestamp: evt.created_at || Date.now(),
      content: evt.content.slice(0, 100)
    });
    
    // Keep only recent events per topic
    if (timeline.length > this.maxTopicTimelineEvents) {
      timeline.shift();
    }
  }

  async _detectEmergingStory(evt, extracted) {
    for (const topic of extracted.topics) {
      if (topic === 'general') continue; // Skip generic topic
      
      if (!this.emergingStories.has(topic)) {
        this.emergingStories.set(topic, {
          topic,
          mentions: 0,
          users: new Set(),
          events: [],
          firstSeen: Date.now(),
          lastUpdate: Date.now(),
          sentiment: { positive: 0, negative: 0, neutral: 0 }
        });
      }
      
      const story = this.emergingStories.get(topic);
      story.mentions++;
      story.users.add(evt.pubkey);
      story.events.push({
        id: evt.id,
        content: evt.content.slice(0, 150),
        author: evt.pubkey,
        timestamp: evt.created_at || Date.now()
      });
      story.lastUpdate = Date.now();
      
      // Track sentiment
      if (extracted.sentiment) {
        story.sentiment[extracted.sentiment]++;
      }
      
      // Limit events per story
      if (story.events.length > 20) {
        story.events.shift();
      }
      
      // Check if it qualifies as "emerging"
      const isNew = story.mentions === this.emergingStoryMentionThreshold && 
                    story.users.size >= this.emergingStoryThreshold;
      
      if (isNew) {
        this.logger.info(`[CONTEXT] 🔥 EMERGING STORY: "${topic}" (${story.mentions} mentions, ${story.users.size} users)`);
        
        // Store to memory for later retrieval
        await this._storeEmergingStory(topic, story);
      }
    }
    
    // Cleanup old stories (older than 6 hours)
    const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
    for (const [topic, story] of this.emergingStories.entries()) {
      if (story.lastUpdate < sixHoursAgo) {
        this.emergingStories.delete(topic);
      }
    }
  }

  async _storeEmergingStory(topic, story) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    try {
      const timestamp = Date.now();
      const topicSlug = topic.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
      
      // Use createUniqueUuid passed in constructor or from runtime
      const createUniqueUuid = this.createUniqueUuid || this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store emerging story - createUniqueUuid not available');
        return;
      }
      
      const systemContext = await this._getSystemContext();
      const rooms = systemContext?.rooms || {};
      const entityId = systemContext?.entityId || createUniqueUuid(this.runtime, 'nostr-context-accumulator');
      const roomId = rooms.emergingStories || createUniqueUuid(this.runtime, 'nostr-emerging-stories');
      const worldId = systemContext?.worldId;

      const memory = {
        id: createUniqueUuid(this.runtime, `nostr-context-emerging-story-${topicSlug}-${timestamp}`),
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic,
            mentions: story.mentions,
            uniqueUsers: story.users.size,
            sentiment: story.sentiment,
            firstSeen: story.firstSeen,
            recentEvents: story.events.slice(-5), // Last 5 events
            timestamp
          }
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
        this.logger.debug(`[CONTEXT] Stored emerging story: ${topic}`);
      } else {
        this.logger.warn(`[CONTEXT] Failed to persist emerging story for topic="${topic}"`);
      }
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to store emerging story:', err.message);
    }
  }

  async generateHourlyDigest() {
    if (!this.hourlyDigestEnabled) return null;

    const hour = this._getCurrentHour() - (60 * 60 * 1000); // Previous hour
    const digest = this.hourlyDigests.get(hour);
    
    if (!digest || digest.eventCount === 0) {
      this.logger.debug('[CONTEXT] No events in previous hour for digest');
      return null;
    }
    
    // Refine topics if too many "general" entries
    if (this.llmTopicExtractionEnabled) {
      digest.topics = await this._refineTopicsForDigest(digest);
    }
    
    // Generate structured summary
    const topTopics = Array.from(digest.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));
    
    const hotConversations = Array.from(digest.conversations.entries())
      .filter(([_, events]) => events.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 5)
      .map(([threadId, events]) => ({
        threadId,
        replyCount: events.length,
        participants: new Set(events.map(e => e.author)).size
      }));
    
    const summary = {
      timeRange: new Date(hour).toISOString(),
      hourLabel: new Date(hour).toLocaleString('en-US', { 
        hour: 'numeric', 
        hour12: true,
        timeZoneName: 'short'
      }),
      metrics: {
        events: digest.eventCount,
        activeUsers: digest.users.size,
        topTopics,
        sentiment: digest.sentiment,
        hotConversations,
        linksShared: digest.links.length,
        threadsActive: digest.conversations.size
      }
    };
    
    // NEW: Generate LLM-powered narrative summary
    if (this.llmAnalysisEnabled) {
      const narrative = await this._generateLLMNarrativeSummary(digest);
      if (narrative) {
        summary.narrative = narrative;
        this.logger.info(`[CONTEXT] 🎭 HOURLY NARRATIVE:\n${narrative.summary}`);
      }
    }
    
  this.logger.info(`[CONTEXT] 📊 HOURLY DIGEST (${summary.hourLabel}): ${digest.eventCount} events, ${digest.users.size} users, top topics: ${topTopics.slice(0, this.displayTopTopicsLimit).map(t => t.topic).join(', ')}`);
    
    // Store to memory
    await this._storeDigestToMemory(summary);
    
    // Store to narrative memory for long-term historical context
    if (this.narrativeMemory) {
      try {
        await this.narrativeMemory.storeHourlyNarrative({
          timestamp: Date.now(),
          events: digest.eventCount,
          users: digest.users.size,
          topTopics: topTopics.slice(0, 5),
          sentiment: digest.sentiment,
          narrative: summary.narrative || null
        });
        this.logger.debug('[CONTEXT] Stored hourly narrative to long-term memory');
      } catch (err) {
        this.logger.debug('[CONTEXT] Failed to store hourly narrative:', err.message);
      }
    }
    
    return summary;
  }

  async _generateLLMNarrativeSummary(digest) {
    if (!this.runtime || typeof this.runtime.generateText !== 'function') {
      return null;
    }

    try {
      // Sample recent events for LLM analysis (limit to prevent token overflow)
      const recentEvents = this.dailyEvents
        .slice(-this.llmHourlyPoolSize) // Last N events from this hour (configurable)
        .map(e => ({
          author: e.author.slice(0, 8),
          content: e.content,
          topics: e.topics,
          sentiment: e.sentiment
        }));

      if (recentEvents.length < 5) {
        return null; // Not enough data for meaningful analysis
      }

      // Build user interaction map
      const userInteractions = new Map();
      
      for (const evt of recentEvents) {
        if (!userInteractions.has(evt.author)) {
          userInteractions.set(evt.author, { posts: 0, topics: new Set(), sentiments: [] });
        }
        const user = userInteractions.get(evt.author);
        user.posts++;
        evt.topics.forEach(t => user.topics.add(t));
        user.sentiments.push(evt.sentiment);
      }

      // Identify key players and their focus
      const keyPlayers = Array.from(userInteractions.entries())
        .sort((a, b) => b[1].posts - a[1].posts)
        .slice(0, 5)
        .map(([author, data]) => ({
          author,
          posts: data.posts,
          topics: Array.from(data.topics).slice(0, this.displayTopTopicsLimit),
          sentiment: this._dominantSentiment(data.sentiments)
        }));

      // Compute topic metrics from digest
      const topicEntries = Array.from(digest.topics.entries());
      const totalTopicMentions = topicEntries.reduce((sum, [, c]) => sum + c, 0) || 0;
      const uniqueTopicsCount = topicEntries.length;
      const sortedTopics = topicEntries.sort((a, b) => b[1] - a[1]);
      const topTopicsForMetrics = sortedTopics.slice(0, 5);
  const top3Sum = sortedTopics.slice(0, Math.min(3, this.displayTopTopicsLimit)).reduce((s, [, c]) => s + c, 0);
      const concentrationTop3 = totalTopicMentions > 0 ? (top3Sum / totalTopicMentions) : 0;
      const hhi = totalTopicMentions > 0
        ? sortedTopics.reduce((s, [, c]) => {
            const share = c / totalTopicMentions; return s + share * share;
          }, 0)
        : 0;
      const hhiLabel = hhi < 0.15 ? 'fragmented' : hhi < 0.25 ? 'moderate' : 'concentrated';

      // Sample diverse content for LLM - now using configurable sample size
      const sampleContent = recentEvents
        .sort(() => 0.5 - Math.random()) // Shuffle for diversity
        .slice(0, this.llmNarrativeSampleSize) // Use configurable sample size (default 100)
        .map(e => `[${e.author}] ${e.content}`)
        .join('\n\n')
        .slice(0, this.llmNarrativeMaxContentLength); // Limit total content length

      // Build per-topic sample snippets (focus on top 3 topics)
      const perTopicSamples = (() => {
  const top3Topics = sortedTopics.slice(0, Math.min(3, this.displayTopTopicsLimit)).map(([t]) => t);
        const buckets = new Map(top3Topics.map(t => [t, []]));
        for (const e of recentEvents) {
          if (!Array.isArray(e.topics)) continue;
          for (const t of e.topics) {
            if (buckets.has(t) && buckets.get(t).length < 3) {
              buckets.get(t).push(`[${e.author}] ${String(e.content || '').slice(0, 280)}`);
              break; // only bucket once per event
            }
          }
        }
        const lines = [];
        for (const [t, arr] of buckets.entries()) {
          if (arr.length > 0) {
            lines.push(`- ${t}:\n  - ${arr.join('\n  - ')}`);
          }
        }
        return lines.join('\n');
      })();

      // Get historical context for comparison
      let historicalContext = '';
      if (this.narrativeMemory) {
        try {
          const history = await this.narrativeMemory.getHistoricalContext(7); // Last 7 days, same hour
          if (history.length > 0) {
            const lastWeek = history[0];
            const avgEvents = Math.round(lastWeek.events);
            const comparison = digest.eventCount > avgEvents * 1.2 ? 'significantly higher' 
                             : digest.eventCount < avgEvents * 0.8 ? 'notably lower'
                             : 'similar';
            historicalContext = `\n\nHISTORICAL CONTEXT (same hour last week):
- Activity level: ${lastWeek.events} events (this hour: ${comparison})
- Common topics: ${lastWeek.topTopics?.slice(0, 3).map(t => t.topic).join(', ') || 'N/A'}
- Consider if this hour shows continuation, shift, or new patterns compared to last week`;
          }
        } catch (err) {
          this.logger.debug('[CONTEXT] Failed to get historical context:', err.message);
        }
      }

  const prompt = `Analyze this hour's activity on Nostr and create a compelling narrative summary.

ACTIVITY DATA:
- ${digest.eventCount} posts from ${digest.users.size} users
- Top topics: ${Array.from(digest.topics.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${t}(${c})`).join(', ')}
- Sentiment: ${digest.sentiment.positive} positive, ${digest.sentiment.neutral} neutral, ${digest.sentiment.negative} negative
- ${digest.conversations.size} active threads

TOPIC METRICS:
- Unique topics: ${uniqueTopicsCount}
- Total topic mentions: ${totalTopicMentions}
- Concentration (top 3 share): ${(concentrationTop3 * 100).toFixed(1)}%
- HHI: ${hhi.toFixed(3)} (${hhiLabel})
- Top topics (5): ${topTopicsForMetrics.map(([t, c]) => `${t}(${c})`).join(', ')}

KEY PLAYERS:
${keyPlayers.map(p => `- ${p.author}: ${p.posts} posts about ${p.topics.join(', ')} (${p.sentiment} tone)`).join('\n')}

SAMPLE POSTS:
${sampleContent.slice(0, 2000)}${historicalContext}

SAMPLE POSTS BY TOPIC (top 3):
${perTopicSamples}

ANALYZE:
1. What narrative is emerging? What's the story being told?
2. How are users interacting? Any interesting connections or debates?
3. What's the emotional vibe? Energy level?
4. Any surprising insights or patterns?
5. How do the topic dynamics (diversity, concentration) shape the hour's story?
6. If you could describe this hour in one compelling sentence, what would it be?
7. ${historicalContext ? 'How does this compare to last week at this time?' : ''}

OUTPUT JSON:
{
  "headline": "Captivating one-line summary (10-15 words max)",
  "summary": "Compelling 2-3 sentence narrative that tells the story of this hour",
  "insights": ["Surprising insight 1", "Interesting pattern 2", "Notable observation 3"],
  "vibe": "One word describing the energy (e.g., electric, contemplative, chaotic, harmonious)",
  "keyMoment": "The most interesting thing that happened (1 sentence)",
  "connections": ["User relationship or interaction pattern observed"]
}

Make it fascinating! Find the human story in the data.`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 800 // Increased from 500 to handle larger content analysis
      });

      // Parse JSON response with error handling
      let narrative;
      try {
        // Try to extract JSON even if there's extra text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          narrative = JSON.parse(jsonMatch[0]);
        } else {
          narrative = JSON.parse(response.trim());
        }
      } catch (parseErr) {
        this.logger.debug('[CONTEXT] Failed to parse LLM narrative JSON:', parseErr.message);
        // Return a simplified structure if JSON parsing fails
        return {
          headline: response.slice(0, 100),
          summary: response.slice(0, 300),
          insights: [],
          vibe: 'active',
          keyMoment: 'Various discussions across multiple topics',
          connections: []
        };
      }
      
      this.logger.info(`[CONTEXT] 🎯 Generating hourly narrative from ${recentEvents.length} events, sampling ${this.llmNarrativeSampleSize} posts for LLM analysis`);
      return narrative;

    } catch (err) {
      this.logger.debug('[CONTEXT] LLM narrative generation failed:', err.message);
      return null;
    }
  }

  _dominantSentiment(sentiments) {
    const counts = { positive: 0, negative: 0, neutral: 0 };
    sentiments.forEach(s => counts[s]++);
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  async _storeDigestToMemory(summary) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    try {
      const timestamp = Date.now();
      
      // Use createUniqueUuid passed in constructor or from runtime
      const createUniqueUuid = this.createUniqueUuid || this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store digest - createUniqueUuid not available');
        return;
      }
      
      const systemContext = await this._getSystemContext();
      const rooms = systemContext?.rooms || {};
      const entityId = systemContext?.entityId || createUniqueUuid(this.runtime, 'nostr-context-accumulator');
      const roomId = rooms.hourlyDigests || createUniqueUuid(this.runtime, 'nostr-hourly-digests');
      const worldId = systemContext?.worldId;

      const memory = {
        id: createUniqueUuid(this.runtime, `nostr-context-hourly-digest-${timestamp}`),
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: 'hourly_digest',
          source: 'nostr',
          data: summary
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
        this.logger.debug('[CONTEXT] Stored hourly digest to memory');
      } else {
        this.logger.warn('[CONTEXT] Failed to persist hourly digest memory');
      }
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to store digest:', err.message);
    }
  }

  async generateDailyReport() {
    if (!this.dailyReportEnabled) return null;
    
    if (this.dailyEvents.length === 0) {
      this.logger.debug('[CONTEXT] No events for daily report');
      return null;
    }
    
    // Aggregate daily statistics
    const uniqueUsers = new Set(this.dailyEvents.map(e => e.author));
    const allTopics = new Map();
    const sentiment = { positive: 0, negative: 0, neutral: 0 };
    
    for (const evt of this.dailyEvents) {
      for (const topic of evt.topics) {
        allTopics.set(topic, (allTopics.get(topic) || 0) + 1);
      }
      if (evt.sentiment) {
        sentiment[evt.sentiment]++;
      }
    }
    
    const topTopics = Array.from(allTopics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([topic, count]) => ({ topic, count }));
    
    const emergingStories = Array.from(this.emergingStories.entries())
      .filter(([_, story]) => story.users.size >= this.emergingStoryThreshold)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .slice(0, 5)
      .map(([topic, story]) => ({
        topic,
        mentions: story.mentions,
        users: story.users.size,
        sentiment: story.sentiment
      }));
    
    const report = {
      date: new Date().toISOString().split('T')[0],
      summary: {
        totalEvents: this.dailyEvents.length,
        activeUsers: uniqueUsers.size,
        topTopics: topTopics.slice(0, 10),
        emergingStories,
        overallSentiment: sentiment,
        eventsPerUser: (this.dailyEvents.length / uniqueUsers.size).toFixed(1)
      }
    };
    
    // NEW: Generate LLM-powered daily narrative
    if (this.llmAnalysisEnabled) {
      const narrative = await this._generateDailyNarrativeSummary(report, topTopics);
      if (narrative) {
        report.narrative = narrative;
        this.logger.info(`[CONTEXT] 🎭 DAILY NARRATIVE:\n${narrative.summary}`);
      }
    }
    
    this.logger.info(`[CONTEXT] 📰 DAILY REPORT: ${report.summary.totalEvents} events from ${report.summary.activeUsers} users. Top topics: ${topTopics.slice(0, 5).map(t => `${t.topic}(${t.count})`).join(', ')}`);
    
    if (emergingStories.length > 0) {
      this.logger.info(`[CONTEXT] 🔥 Emerging stories: ${emergingStories.map(s => s.topic).join(', ')}`);
    }
    
    // Store to memory
    await this._storeDailyReport(report);
    
    // Store to narrative memory for long-term historical context
    if (this.narrativeMemory) {
      try {
        await this.narrativeMemory.storeDailyNarrative({
          date: report.date,
          events: report.summary.totalEvents,
          users: report.summary.activeUsers,
          topTopics: report.summary.topTopics,
          emergingStories: report.summary.emergingStories || [],
          sentiment: report.summary.overallSentiment,
          narrative: report.narrative || null
        });
        this.logger.debug('[CONTEXT] Stored daily narrative to long-term memory');
      } catch (err) {
        this.logger.debug('[CONTEXT] Failed to store daily narrative:', err.message);
      }
    }
    
    // Clear daily events for next day
    this.dailyEvents = [];
    
    return report;
  }

  async _generateDailyNarrativeSummary(report, topTopics) {
    if (!this.runtime || typeof this.runtime.generateText !== 'function') {
      return null;
    }

    try {
      // Sample diverse events from throughout the day - now much larger sample
      const sampleSize = Math.min(this.llmNarrativeSampleSize, this.dailyEvents.length); // Use configurable sample size
      const sampledEvents = [];
      const step = Math.floor(this.dailyEvents.length / sampleSize);
      
      for (let i = 0; i < this.dailyEvents.length; i += step) {
        if (sampledEvents.length >= sampleSize) break;
        const evt = this.dailyEvents[i];
        sampledEvents.push({
          author: evt.author.slice(0, 8),
          content: evt.content.slice(0, 400),
          topics: evt.topics.slice(0, 3),
          sentiment: evt.sentiment
        });
      }

      const prompt = `Analyze today's activity on Nostr and create a compelling daily narrative report.

TODAY'S DATA:
- ${report.summary.totalEvents} total posts
- ${report.summary.activeUsers} active users
- ${report.summary.eventsPerUser} posts per user (engagement level)
- Sentiment: ${report.summary.overallSentiment.positive} positive, ${report.summary.overallSentiment.neutral} neutral, ${report.summary.overallSentiment.negative} negative

TOP TOPICS (${topTopics.length}):
${topTopics.slice(0, this.displayTopTopicsLimit).map(t => `- ${t.topic}: ${t.count} mentions`).join('\n')}

EMERGING STORIES:
${report.summary.emergingStories.length > 0 ? report.summary.emergingStories.map(s => `- ${s.topic}: ${s.mentions} mentions from ${s.users} users (${s.sentiment})`).join('\n') : 'None detected'}

SAMPLE POSTS FROM THROUGHOUT THE DAY:
${sampledEvents.map(e => `[${e.author}] ${e.content}`).join('\n\n').slice(0, this.llmNarrativeMaxContentLength)}

ANALYSIS FOCUS:
- Prioritize SPECIFIC developments: people, places, events, projects, tools, concrete happenings
- Avoid generic terms like "bitcoin", "nostr", "crypto", "lightning", "protocol", "technology", "community"
- Look for NEW, TIMELY, and ACTIONABLE insights, not general interests
- Focus on what's CHANGING, not what's static or always discussed

ANALYZE THE DAY:
1. What was the arc of the day? How did conversations evolve? What specific events happened?
2. What communities formed? What specific groups or projects emerged?
3. What moments defined today? Any breakthroughs or conflicts? Name specifics.
4. How did the energy shift throughout the day?
5. What patterns in human behavior showed up around specific topics?
6. If you had to capture today's essence in one compelling paragraph, what would you say?

OUTPUT JSON:
{
  "headline": "Captivating summary of the day with specific details (15-20 words)",
  "summary": "Rich narrative paragraph (4-6 sentences) that tells the story of today's activity with depth and concrete specifics",
  "arc": "How the day evolved with specific milestones (beginning → middle → end)",
  "keyMoments": ["Most significant specific moment 1", "Important concrete turning point 2", "Notable specific event 3"],
  "communities": ["Specific community/project/group pattern observed 1", "Concrete social dynamic 2"],
  "insights": ["Deep insight about specific behavior 1", "Concrete pattern observed 2", "Surprising specific finding 3"],
  "vibe": "Overall energy of the day (2-3 words)",
  "tomorrow": "What specific things to watch for tomorrow based on today's patterns (1 sentence)"
}

Make it profound! Find the deeper story in the data. Be CONCRETE and SPECIFIC.`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.8,
        maxTokens: 1000 // Increased from 700 to handle larger content analysis
      });

      // Parse JSON response with error handling
      let narrative;
      try {
        // Try to extract JSON even if there's extra text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          narrative = JSON.parse(jsonMatch[0]);
        } else {
          narrative = JSON.parse(response.trim());
        }
      } catch (parseErr) {
        this.logger.debug('[CONTEXT] Failed to parse daily narrative JSON:', parseErr.message);
        // Return a simplified structure if JSON parsing fails
        return {
          headline: response.slice(0, 100),
          summary: response.slice(0, 500),
          arc: 'Community activity throughout the day',
          keyMoments: [],
          communities: [],
          insights: [],
          vibe: 'active',
          tomorrow: 'Continue monitoring community trends'
        };
      }
      
      this.logger.info(`[CONTEXT] 🎯 Generating daily narrative from ${this.dailyEvents.length} total events, sampling ${sampleSize} posts for LLM analysis`);
      return narrative;

    } catch (err) {
      this.logger.debug('[CONTEXT] Daily narrative generation failed:', err.message);
      return null;
    }
  }

  async _storeDailyReport(report) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    try {
      const timestamp = Date.now();
      const dateSlug = report.date.replace(/[^0-9]/g, '');
      
      // Use createUniqueUuid passed in constructor or from runtime
      const createUniqueUuid = this.createUniqueUuid || this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store daily report - createUniqueUuid not available');
        return;
      }
      
      const systemContext = await this._getSystemContext();
      const rooms = systemContext?.rooms || {};
      const entityId = systemContext?.entityId || createUniqueUuid(this.runtime, 'nostr-context-accumulator');
      const roomId = rooms.dailyReports || createUniqueUuid(this.runtime, 'nostr-daily-reports');
      const worldId = systemContext?.worldId;

      const memory = {
        id: createUniqueUuid(this.runtime, `nostr-context-daily-report-${dateSlug}-${timestamp}`),
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: 'daily_report',
          source: 'nostr',
          data: report
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
        this.logger.info('[CONTEXT] ✅ Stored daily report to memory');
      } else {
        this.logger.warn('[CONTEXT] Failed to persist daily report memory');
      }
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to store daily report:', err.message);
    }
  }

  // Query methods for retrieving accumulated context
  
  getEmergingStories(options = {}) {
    if (!this.emergingStories || this.emergingStories.size === 0) {
      return [];
    }

    if (typeof options === 'number') {
      options = { minUsers: options };
    }

    const {
      minUsers = this.emergingStoryThreshold,
      minMentions = 0,
      maxTopics = null,
      includeRecentEvents = true,
      recentEventLimit = this.emergingStoryContextRecentEvents
    } = options || {};

    let stories = Array.from(this.emergingStories.entries())
      .filter(([_, story]) => story.users.size >= minUsers && story.mentions >= minMentions)
      .sort((a, b) => b[1].mentions - a[1].mentions);

    if (Number.isFinite(maxTopics) && maxTopics > 0) {
      stories = stories.slice(0, maxTopics);
    }

    return stories.map(([topic, story]) => ({
      topic,
      mentions: story.mentions,
      users: story.users.size,
      sentiment: story.sentiment,
      recentEvents: includeRecentEvents && recentEventLimit > 0
        ? story.events.slice(-recentEventLimit)
        : []
    }));
  }

  getTopicTimeline(topic, limit = 10) {
    const timeline = this.topicTimelines.get(topic);
    if (!timeline) return [];
    
    return timeline.slice(-limit);
  }

  getRecentDigest(hoursAgo = 1) {
    const targetHour = this._getCurrentHour() - (hoursAgo * 60 * 60 * 1000);
    return this.hourlyDigests.get(targetHour) || null;
  }

  getCurrentActivity() {
    const currentHour = this._getCurrentHour();
    const digest = this.hourlyDigests.get(currentHour);
    
    if (!digest) {
      return { events: 0, users: 0, topics: [] };
    }
    
    const topTopics = Array.from(digest.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));
    
    return {
      events: digest.eventCount,
      users: digest.users.size,
      topics: topTopics,
      sentiment: digest.sentiment
    };
  }

  getTopTopicsAcrossHours(options = {}) {
    if (!this.hourlyDigests || this.hourlyDigests.size === 0) {
      return [];
    }

    const hourMs = 60 * 60 * 1000;
    const hours = Math.max(1, Number.parseInt(options.hours ?? 6, 10) || 6);
    const limit = Math.max(1, Number.parseInt(options.limit ?? 5, 10) || 5);
    const minMentions = Math.max(1, Number.parseInt(options.minMentions ?? 2, 10) || 2);

    const cutoff = this._getCurrentHour() - ((hours - 1) * hourMs);
    const totals = new Map();

    for (const [bucket, digest] of this.hourlyDigests.entries()) {
      if (!digest || bucket < cutoff) continue;
      for (const [topic, count] of digest.topics.entries()) {
        if (!topic || topic === 'general' || !Number.isFinite(count) || count <= 0) continue;
        totals.set(topic, (totals.get(topic) || 0) + count);
      }
    }

    if (totals.size === 0) {
      return [];
    }

    const topicEntries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);

    const mapEntryToResult = ([topic, count]) => {
      const timeline = this.topicTimelines.get(topic) || [];
      const sample = timeline.length > 0 ? timeline[timeline.length - 1] : null;
      return {
        topic,
        count,
        sample
      };
    };

    let results = topicEntries
      .filter(([_, count]) => count >= minMentions)
      .slice(0, limit)
      .map(mapEntryToResult);

    if (results.length === 0) {
      results = topicEntries.slice(0, limit).map(mapEntryToResult);
    }

    return results;
  }

  // Utility methods
  
  _createEmptyDigest() {
    return {
      eventCount: 0,
      users: new Set(),
      topics: new Map(),
      sentiment: { positive: 0, negative: 0, neutral: 0 },
      links: [],
      conversations: new Map()
    };
  }

  _getCurrentHour() {
    // Round down to the start of the current hour
    return Math.floor(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000);
  }

  _cleanupOldData() {
    // Remove hourly digests older than 24 hours
    const oldestToKeep = this._getCurrentHour() - (this.maxHourlyDigests * 60 * 60 * 1000);
    
    for (const [hour, _] of this.hourlyDigests.entries()) {
      if (hour < oldestToKeep) {
        this.hourlyDigests.delete(hour);
      }
    }
  }

  // Configuration methods
  
  enable() {
    this.enabled = true;
    this.logger.info('[CONTEXT] Context accumulator enabled');
  }

  disable() {
    this.enabled = false;
    this.logger.info('[CONTEXT] Context accumulator disabled');
  }

  // Real-time analysis methods
  
  startRealtimeAnalysis() {
    if (!this.realtimeAnalysisEnabled) {
      this.logger.info('[CONTEXT] Real-time analysis disabled');
      return;
    }

    this.logger.info('[CONTEXT] 🚀 Starting real-time analysis system');

    // Quarter-hour analysis (every 15 minutes)
    if (this.quarterHourAnalysisEnabled) {
      this.quarterHourInterval = setInterval(async () => {
        try {
          await this.performQuarterHourAnalysis();
        } catch (err) {
          this.logger.debug('[CONTEXT] Quarter-hour analysis failed:', err.message);
        }
      }, 15 * 60 * 1000); // 15 minutes
    }

    // Rolling window analysis (every 5 minutes)
    this.rollingWindowInterval = setInterval(async () => {
      try {
        await this.performRollingWindowAnalysis();
      } catch (err) {
        this.logger.debug('[CONTEXT] Rolling window analysis failed:', err.message);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Real-time trend detection (every 2 minutes)
    this.trendDetectionInterval = setInterval(async () => {
      try {
        await this.detectRealtimeTrends();
      } catch (err) {
        this.logger.debug('[CONTEXT] Trend detection failed:', err.message);
      }
    }, 2 * 60 * 1000); // 2 minutes
  }

  stopRealtimeAnalysis() {
    if (this.quarterHourInterval) {
      clearInterval(this.quarterHourInterval);
      this.quarterHourInterval = null;
    }
    if (this.rollingWindowInterval) {
      clearInterval(this.rollingWindowInterval);
      this.rollingWindowInterval = null;
    }
    if (this.trendDetectionInterval) {
      clearInterval(this.trendDetectionInterval);
      this.trendDetectionInterval = null;
    }
    this.logger.info('[CONTEXT] Real-time analysis stopped');
  }

  async performQuarterHourAnalysis() {
    if (!this.llmAnalysisEnabled) return;

    const now = Date.now();
    const quarterHourAgo = now - (15 * 60 * 1000);

    // Get events from the last 15 minutes
    const recentEvents = this.dailyEvents.filter(e => e.timestamp >= quarterHourAgo);

    if (recentEvents.length < 10) {
      this.logger.debug('[CONTEXT] Not enough events for quarter-hour analysis');
      return;
    }

    const adaptiveSampleSize = this.getAdaptiveSampleSize(recentEvents.length);
    const sampleEvents = recentEvents
      .sort(() => 0.5 - Math.random())
      .slice(0, adaptiveSampleSize);

    // Aggregate quarter-hour metrics
    const users = new Set(sampleEvents.map(e => e.author));
    const topics = new Map();
    const sentiment = { positive: 0, negative: 0, neutral: 0 };

    for (const evt of sampleEvents) {
      evt.topics.forEach(t => topics.set(t, (topics.get(t) || 0) + 1));
      if (evt.sentiment) sentiment[evt.sentiment]++;
    }

    const topTopics = Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const prompt = `Analyze the last 15 minutes of Nostr activity and provide real-time insights.

RECENT ACTIVITY:
- ${recentEvents.length} posts from ${users.size} users
- Top topics: ${topTopics.map(([t, c]) => `${t}(${c})`).join(', ')}
- Sentiment: ${sentiment.positive} positive, ${sentiment.neutral} neutral, ${sentiment.negative} negative

SAMPLE POSTS:
${sampleEvents.slice(0, 20).map(e => `[${e.author.slice(0, 8)}] ${e.content.slice(0, 150)}`).join('\n')}

WHAT'S HAPPENING RIGHT NOW?
1. What's the immediate vibe and energy level?
2. Any emerging trends or patterns in the last 15 minutes?
3. How are users interacting? Any notable conversations?
4. What's surprising or noteworthy about this moment?

OUTPUT JSON:
{
  "vibe": "Current energy level (one word: electric, calm, heated, collaborative, etc.)",
  "trends": ["Immediate trend 1", "Emerging pattern 2"],
  "keyInteractions": ["Notable conversation or interaction"],
  "insights": ["Real-time insight 1", "Observation 2"],
  "moment": "What's defining this exact moment (1 sentence)"
}`;

    try {
      const response = await this.runtime.generateText(prompt, {
        temperature: 0.6,
        maxTokens: 400
      });

      let analysis;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response.trim());
      } catch (parseErr) {
        analysis = {
          vibe: 'active',
          trends: [],
          keyInteractions: [],
          insights: [response.slice(0, 200)],
          moment: 'Community activity in progress'
        };
      }

      this.logger.info(`[CONTEXT] ⏰ QUARTER-HOUR ANALYSIS: ${analysis.vibe} vibe, ${recentEvents.length} posts, top: ${topTopics[0]?.[0] || 'N/A'}`);
      if (analysis.trends.length > 0) {
        this.logger.info(`[CONTEXT] 📈 Trends: ${analysis.trends.join(', ')}`);
      }

      // Store quarter-hour analysis
      await this._storeRealtimeAnalysis('quarter-hour', analysis, {
        events: recentEvents.length,
        users: users.size,
        topTopics,
        sentiment
      });

    } catch (err) {
      this.logger.debug('[CONTEXT] Quarter-hour LLM analysis failed:', err.message);
    }
  }

  async performRollingWindowAnalysis() {
    if (!this.llmAnalysisEnabled) return;

    const now = Date.now();
    const windowStart = now - (this.rollingWindowSize * 60 * 1000); // Rolling window in minutes

    // Get events within rolling window
    const windowEvents = this.dailyEvents.filter(e => e.timestamp >= windowStart);

    if (windowEvents.length < 20) {
      this.logger.debug('[CONTEXT] Not enough events for rolling window analysis');
      return;
    }

    const adaptiveSampleSize = this.getAdaptiveSampleSize(windowEvents.length);
    const sampleEvents = windowEvents
      .sort((a, b) => b.timestamp - a.timestamp) // Most recent first
      .slice(0, adaptiveSampleSize);

    // Calculate rolling metrics
    const users = new Set(sampleEvents.map(e => e.author));
    const topics = new Map();
    const sentiment = { positive: 0, negative: 0, neutral: 0 };
    const recentTopics = new Map(); // Topics in last 10 minutes

    const tenMinutesAgo = now - (10 * 60 * 1000);
    const veryRecentEvents = windowEvents.filter(e => e.timestamp >= tenMinutesAgo);

    for (const evt of sampleEvents) {
      evt.topics.forEach(t => topics.set(t, (topics.get(t) || 0) + 1));
    }

    for (const evt of veryRecentEvents) {
      evt.topics.forEach(t => recentTopics.set(t, (recentTopics.get(t) || 0) + 1));
      if (evt.sentiment) sentiment[evt.sentiment]++;
    }

    const topTopics = Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const emergingTopics = Array.from(recentTopics.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const prompt = `Analyze the rolling window of Nostr activity and identify emerging patterns.

ROLLING WINDOW (${this.rollingWindowSize} minutes):
- ${windowEvents.length} total posts from ${users.size} users
- Very recent (last 10 min): ${veryRecentEvents.length} posts
- Top topics overall: ${topTopics.slice(0, 5).map(([t, c]) => `${t}(${c})`).join(', ')}
- Emerging in last 10 min: ${emergingTopics.map(([t, c]) => `${t}(${c})`).join(', ') || 'None'}

SAMPLE RECENT POSTS:
${sampleEvents.slice(0, 25).map(e => `[${e.author.slice(0, 8)}] ${e.content.slice(0, 120)}`).join('\n')}

ANALYZE THE FLOW:
1. What's accelerating or decelerating in activity?
2. Which topics are gaining traction?
3. How is sentiment evolving?
4. Any conversations building momentum?
5. What's the trajectory - where is this heading?

OUTPUT JSON:
{
  "acceleration": "Activity trend (accelerating, decelerating, steady, spiking)",
  "emergingTopics": ["Topic gaining traction 1", "New topic 2"],
  "sentimentShift": "How sentiment is changing (improving, worsening, stable)",
  "momentum": ["Conversation gaining steam 1", "Building discussion 2"],
  "trajectory": "Where this is heading in the next 15-30 minutes (1 sentence)",
  "hotspots": ["Area of intense activity 1", "Focus point 2"]
}`;

    try {
      const response = await this.runtime.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 500
      });

      let analysis;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response.trim());
      } catch (parseErr) {
        analysis = {
          acceleration: 'steady',
          emergingTopics: emergingTopics.map(([t]) => t),
          sentimentShift: 'stable',
          momentum: [],
          trajectory: 'Continuing current patterns',
          hotspots: []
        };
      }

      this.logger.info(`[CONTEXT] 🔄 ROLLING WINDOW: ${analysis.acceleration} activity, emerging: ${analysis.emergingTopics.join(', ') || 'none'}`);
      if (analysis.momentum.length > 0) {
        this.logger.info(`[CONTEXT] ⚡ Momentum: ${analysis.momentum.join(', ')}`);
      }

      // Store rolling window analysis
      await this._storeRealtimeAnalysis('rolling-window', analysis, {
        windowSize: this.rollingWindowSize,
        totalEvents: windowEvents.length,
        recentEvents: veryRecentEvents.length,
        users: users.size,
        topTopics,
        emergingTopics
      });

    } catch (err) {
      this.logger.debug('[CONTEXT] Rolling window LLM analysis failed:', err.message);
    }
  }

  async detectRealtimeTrends() {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const tenMinutesAgo = now - (10 * 60 * 1000);

    // Compare last 5 minutes vs previous 5 minutes
    const recentEvents = this.dailyEvents.filter(e => e.timestamp >= fiveMinutesAgo);
    const previousEvents = this.dailyEvents.filter(e =>
      e.timestamp >= tenMinutesAgo && e.timestamp < fiveMinutesAgo
    );

    if (recentEvents.length < 5 || previousEvents.length < 5) {
      return; // Not enough data for trend detection
    }

    // Calculate trend metrics
    const recentUsers = new Set(recentEvents.map(e => e.author));
    const previousUsers = new Set(previousEvents.map(e => e.author));

    const recentTopics = new Map();
    const previousTopics = new Map();

    recentEvents.forEach(e => e.topics.forEach(t => recentTopics.set(t, (recentTopics.get(t) || 0) + 1)));
    previousEvents.forEach(e => e.topics.forEach(t => previousTopics.set(t, (previousTopics.get(t) || 0) + 1)));

    // Detect topic spikes
    const topicSpikes = [];
    for (const [topic, recentCount] of recentTopics.entries()) {
      const previousCount = previousTopics.get(topic) || 0;
      const spikeRatio = previousCount > 0 ? recentCount / previousCount : recentCount;

      if (spikeRatio >= 2.0 && recentCount >= 3) { // At least 2x increase and 3+ mentions
        topicSpikes.push({ topic, recent: recentCount, previous: previousCount, ratio: spikeRatio.toFixed(1) });
      }
    }

    // Detect user activity spikes
    const userSpikes = [];
    const recentUserCounts = {};
    const previousUserCounts = {};

    recentEvents.forEach(e => recentUserCounts[e.author] = (recentUserCounts[e.author] || 0) + 1);
    previousEvents.forEach(e => previousUserCounts[e.author] = (previousUserCounts[e.author] || 0) + 1);

    for (const [user, recentCount] of Object.entries(recentUserCounts)) {
      const previousCount = previousUserCounts[user] || 0;
      const spikeRatio = previousCount > 0 ? recentCount / previousCount : recentCount;

      if (spikeRatio >= 3.0 && recentCount >= 5) { // At least 3x increase and 5+ posts
        userSpikes.push({ user: user.slice(0, 8), recent: recentCount, previous: previousCount });
      }
    }

    // Activity level change
    const activityChange = recentEvents.length > previousEvents.length * 1.5 ? 'spiking' :
                          recentEvents.length < previousEvents.length * 0.7 ? 'dropping' : 'steady';

    // New users appearing
    const newUsers = Array.from(recentUsers).filter(u => !previousUsers.has(u)).length;

    if (topicSpikes.length > 0 || userSpikes.length > 0 || activityChange !== 'steady' || newUsers >= 3) {
      const trends = {
        activityChange,
        topicSpikes: topicSpikes.slice(0, 3),
        userSpikes: userSpikes.slice(0, 3),
        newUsers,
        timestamp: now
      };

      this.logger.info(`[CONTEXT] 📊 TREND ALERT: ${activityChange} activity, ${topicSpikes.length} topic spikes, ${userSpikes.length} user spikes, ${newUsers} new users`);

      if (topicSpikes.length > 0) {
        this.logger.info(`[CONTEXT] 🚀 Topic spikes: ${topicSpikes.map(t => `${t.topic}(${t.ratio}x)`).join(', ')}`);
      }

      // Store trend detection
      await this._storeRealtimeAnalysis('trend-detection', trends, {
        recentEvents: recentEvents.length,
        previousEvents: previousEvents.length,
        recentUsers: recentUsers.size,
        previousUsers: previousUsers.size
      });
    }
  }

  getAdaptiveSampleSize(eventCount) {
    if (!this.adaptiveSamplingEnabled) {
      return this.llmNarrativeSampleSize;
    }

    // Adaptive sampling based on activity levels
    if (eventCount >= 1000) return Math.min(800, this.llmNarrativeSampleSize * 2); // High activity
    if (eventCount >= 500) return Math.min(600, this.llmNarrativeSampleSize * 1.5); // Medium-high
    if (eventCount >= 200) return this.llmNarrativeSampleSize; // Normal
    if (eventCount >= 50) return Math.max(100, this.llmNarrativeSampleSize * 0.7); // Low-medium
    return Math.max(50, this.llmNarrativeSampleSize * 0.5); // Low activity
  }

  async _storeRealtimeAnalysis(type, analysis, metrics) {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    try {
      const timestamp = Date.now();

      // Use createUniqueUuid passed in constructor or from runtime
      const createUniqueUuid = this.createUniqueUuid || this.runtime.createUniqueUuid;

      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store realtime analysis - createUniqueUuid not available');
        return;
      }

      const systemContext = await this._getSystemContext();
      const rooms = systemContext?.rooms || {};
      const entityId = systemContext?.entityId || createUniqueUuid(this.runtime, 'nostr-context-accumulator');
      const roomId = rooms.realtimeAnalysis || createUniqueUuid(this.runtime, 'nostr-realtime-analysis');
      const worldId = systemContext?.worldId;

      const memory = {
        id: createUniqueUuid(this.runtime, `nostr-context-realtime-${type}-${timestamp}`),
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          type: `realtime_${type}`,
          source: 'nostr',
          data: {
            analysis,
            metrics,
            timestamp
          }
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
        this.logger.debug(`[CONTEXT] Stored realtime ${type} analysis`);
      } else {
        this.logger.warn(`[CONTEXT] Failed to persist realtime ${type} analysis`);
      }
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to store realtime analysis:', err.message);
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      llmAnalysisEnabled: this.llmAnalysisEnabled,
      llmSentimentEnabled: this.llmSentimentEnabled,
      llmTopicExtractionEnabled: this.llmTopicExtractionEnabled,
      realtimeAnalysisEnabled: this.realtimeAnalysisEnabled,
      quarterHourAnalysisEnabled: this.quarterHourAnalysisEnabled,
      adaptiveSamplingEnabled: this.adaptiveSamplingEnabled,
      rollingWindowSize: this.rollingWindowSize,
      hourlyDigests: this.hourlyDigests.size,
      emergingStories: this.emergingStories.size,
      topicTimelines: this.topicTimelines.size,
      dailyEvents: this.dailyEvents.length,
      currentActivity: this.getCurrentActivity(),
      config: {
        maxHourlyDigests: this.maxHourlyDigests,
        maxTopicTimelineEvents: this.maxTopicTimelineEvents,
        maxDailyEvents: this.maxDailyEvents,
        emergingStoryThreshold: this.emergingStoryThreshold,
        emergingStoryMentionThreshold: this.emergingStoryMentionThreshold,
        llmSentimentMinLength: this.llmSentimentMinLength,
        llmSentimentMaxLength: this.llmSentimentMaxLength,
        llmTopicMinLength: this.llmTopicMinLength,
        llmTopicMaxLength: this.llmTopicMaxLength,
        llmNarrativeSampleSize: this.llmNarrativeSampleSize,
        llmNarrativeMaxContentLength: this.llmNarrativeMaxContentLength
      }
    };
  }
}

module.exports = { ContextAccumulator };
