// Context Accumulator - Builds continuous understanding of Nostr activity
const { extractTopicsFromEvent } = require('./nostr');

class ContextAccumulator {
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger || console;
    
    // Hourly digests: hour timestamp -> digest data
    this.hourlyDigests = new Map();
    
    // Emerging stories: topic -> story data
    this.emergingStories = new Map();
    
    // Topic timelines: topic -> [events over time]
    this.topicTimelines = new Map();
    
    // Daily narrative accumulator
    this.dailyEvents = [];
    
    // Configuration
    this.maxHourlyDigests = 24; // Keep last 24 hours
    this.maxTopicTimelineEvents = 50; // Per topic
    this.maxDailyEvents = 1000; // For daily report
    this.emergingStoryThreshold = 3; // Min users to qualify as "emerging"
    this.emergingStoryMentionThreshold = 5; // Min mentions
    
    // Feature flags
    this.enabled = true;
    this.hourlyDigestEnabled = true;
    this.dailyReportEnabled = true;
    this.emergingStoriesEnabled = true;
    this.llmAnalysisEnabled = process.env.CONTEXT_LLM_ANALYSIS_ENABLED === 'true' || false;
    this.llmSentimentEnabled = process.env.CONTEXT_LLM_SENTIMENT_ENABLED === 'true' || this.llmAnalysisEnabled; // Can enable separately
    this.llmTopicExtractionEnabled = process.env.CONTEXT_LLM_TOPICS_ENABLED === 'true' || this.llmAnalysisEnabled; // Can enable separately
    
    // Performance tuning
    this.llmSentimentMinLength = 20; // Minimum content length for LLM sentiment
    this.llmSentimentMaxLength = 500; // Maximum content length for LLM sentiment
    this.llmTopicMinLength = 20; // Minimum content length for LLM topic extraction
    this.llmTopicMaxLength = 500; // Maximum content length for LLM topic extraction
  }

  async processEvent(evt) {
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
      const extracted = await this._extractStructuredData(evt);
      
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

  async _extractStructuredData(evt) {
    const content = evt.content || '';
    
    // Extract links
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = content.match(linkRegex) || [];
    
    // Detect if it's a question
    const isQuestion = content.includes('?');
    
    // Topic extraction: Try LLM first (if enabled), fallback to keyword-based
    let topics = [];
    
    if (this.llmTopicExtractionEnabled && this.runtime && typeof this.runtime.generateText === 'function' && 
        content.length >= this.llmTopicMinLength && content.length <= this.llmTopicMaxLength) {
      // Use LLM for intelligent topic extraction
      topics = await this._extractTopicsWithLLM(content);
    }
    
    // If LLM didn't work or returned nothing, use keyword-based extraction
    if (topics.length === 0) {
      topics = extractTopicsFromEvent(evt);
    }
    
    // If still no topics, use 'general' as fallback
    if (topics.length === 0) {
      topics = ['general'];
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
      const prompt = `Analyze this post and identify 1-3 specific topics or themes. Be precise and insightful - avoid generic terms like "general" or "discussion".

Post: "${content.slice(0, 400)}"

Examples of good topics:
- Instead of "tech": "AI agents", "nostr protocol", "bitcoin mining"
- Instead of "art": "pixel art", "collaborative canvas", "generative design"
- Instead of "social": "community building", "decentralization", "privacy advocacy"

Respond with ONLY the topics, comma-separated (e.g., "bitcoin lightning, micropayments, value4value"):`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 50
      });

      // Parse comma-separated topics
      const topicsRaw = response.trim()
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length < 50) // Reasonable length
        .filter(t => !t.includes('general') && !t.includes('various')); // Filter out vague terms
      
      // Limit to 3 topics
      const topics = topicsRaw.slice(0, 3);
      
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
      
      // Use runtime's createUniqueUuid - same pattern as other parts of the codebase
      // It will try @elizaos/core first, then fall back to deterministic UUID generation
      const createUniqueUuid = this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store emerging story - createUniqueUuid not available');
        return;
      }
      
      const memory = {
        id: createUniqueUuid(this.runtime, `nostr:context:emerging-story:${topicSlug}:${timestamp}`),
        entityId: createUniqueUuid(this.runtime, 'nostr:context-accumulator'),
        roomId: createUniqueUuid(this.runtime, 'nostr:emerging-stories'),
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
      
      await this.runtime.createMemory(memory, 'messages');
      this.logger.debug(`[CONTEXT] Stored emerging story: ${topic}`);
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
    
    this.logger.info(`[CONTEXT] 📊 HOURLY DIGEST (${summary.hourLabel}): ${digest.eventCount} events, ${digest.users.size} users, top topics: ${topTopics.slice(0, 3).map(t => t.topic).join(', ')}`);
    
    // Store to memory
    await this._storeDigestToMemory(summary);
    
    return summary;
  }

  async _generateLLMNarrativeSummary(digest) {
    if (!this.runtime || typeof this.runtime.generateText !== 'function') {
      return null;
    }

    try {
      // Sample recent events for LLM analysis (limit to prevent token overflow)
      const recentEvents = this.dailyEvents
        .slice(-50) // Last 50 events from this hour
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
          topics: Array.from(data.topics).slice(0, 3),
          sentiment: this._dominantSentiment(data.sentiments)
        }));

      // Sample diverse content for LLM
      const sampleContent = recentEvents
        .sort(() => 0.5 - Math.random()) // Shuffle
        .slice(0, 15) // Take 15 random posts
        .map(e => `[${e.author}] ${e.content}`)
        .join('\n\n');

      const prompt = `Analyze this hour's activity on Nostr and create a compelling narrative summary.

ACTIVITY DATA:
- ${digest.eventCount} posts from ${digest.users.size} users
- Top topics: ${Array.from(digest.topics.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${t}(${c})`).join(', ')}
- Sentiment: ${digest.sentiment.positive} positive, ${digest.sentiment.neutral} neutral, ${digest.sentiment.negative} negative
- ${digest.conversations.size} active threads

KEY PLAYERS:
${keyPlayers.map(p => `- ${p.author}: ${p.posts} posts about ${p.topics.join(', ')} (${p.sentiment} tone)`).join('\n')}

SAMPLE POSTS:
${sampleContent.slice(0, 2000)}

ANALYZE:
1. What narrative is emerging? What's the story being told?
2. How are users interacting? Any interesting connections or debates?
3. What's the emotional vibe? Energy level?
4. Any surprising insights or patterns?
5. If you could describe this hour in one compelling sentence, what would it be?

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
        maxTokens: 500
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
      
      this.logger.info(`[CONTEXT] 🎯 Generated LLM narrative for hour`);
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
      
      // Use runtime's createUniqueUuid - same pattern as other parts of the codebase
      const createUniqueUuid = this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store digest - createUniqueUuid not available');
        return;
      }
      
      const memory = {
        id: createUniqueUuid(this.runtime, `nostr:context:hourly-digest:${timestamp}`),
        entityId: createUniqueUuid(this.runtime, 'nostr:context-accumulator'),
        roomId: createUniqueUuid(this.runtime, 'nostr:digests'),
        agentId: this.runtime.agentId,
        content: {
          type: 'hourly_digest',
          source: 'nostr',
          data: summary
        },
        createdAt: timestamp
      };
      
      await this.runtime.createMemory(memory, 'messages');
      this.logger.debug('[CONTEXT] Stored hourly digest to memory');
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
    
    // Clear daily events for next day
    this.dailyEvents = [];
    
    return report;
  }

  async _generateDailyNarrativeSummary(report, topTopics) {
    if (!this.runtime || typeof this.runtime.generateText !== 'function') {
      return null;
    }

    try {
      // Sample diverse events from throughout the day
      const sampleSize = Math.min(30, this.dailyEvents.length);
      const sampledEvents = [];
      const step = Math.floor(this.dailyEvents.length / sampleSize);
      
      for (let i = 0; i < this.dailyEvents.length; i += step) {
        if (sampledEvents.length >= sampleSize) break;
        const evt = this.dailyEvents[i];
        sampledEvents.push({
          author: evt.author.slice(0, 8),
          content: evt.content.slice(0, 200),
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
${topTopics.slice(0, 10).map(t => `- ${t.topic}: ${t.count} mentions`).join('\n')}

EMERGING STORIES:
${report.summary.emergingStories.length > 0 ? report.summary.emergingStories.map(s => `- ${s.topic}: ${s.mentions} mentions from ${s.users} users (${s.sentiment})`).join('\n') : 'None detected'}

SAMPLE POSTS FROM THROUGHOUT THE DAY:
${sampledEvents.map(e => `[${e.author}] ${e.content}`).join('\n\n').slice(0, 3000)}

ANALYZE THE DAY:
1. What was the arc of the day? How did conversations evolve?
2. What communities formed? What groups emerged?
3. What moments defined today? Any breakthroughs or conflicts?
4. How did the energy shift throughout the day?
5. What patterns in human behavior showed up?
6. If you had to capture today's essence in one compelling paragraph, what would you say?

OUTPUT JSON:
{
  "headline": "Captivating summary of the day (15-20 words)",
  "summary": "Rich narrative paragraph (4-6 sentences) that tells the story of today's activity with depth and insight",
  "arc": "How the day evolved (beginning → middle → end)",
  "keyMoments": ["Most significant moment 1", "Important turning point 2", "Notable event 3"],
  "communities": ["Community/group pattern observed 1", "Social dynamic 2"],
  "insights": ["Deep insight about human behavior 1", "Pattern observed 2", "Surprising finding 3"],
  "vibe": "Overall energy of the day (2-3 words)",
  "tomorrow": "What to watch for tomorrow based on today's patterns (1 sentence)"
}

Make it profound! Find the deeper story in the data.`;

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.8,
        maxTokens: 700
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
      
      this.logger.info(`[CONTEXT] 🎯 Generated LLM daily narrative`);
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
      
      // Use runtime's createUniqueUuid - same pattern as other parts of the codebase
      const createUniqueUuid = this.runtime.createUniqueUuid;
      
      if (!createUniqueUuid) {
        this.logger.warn('[CONTEXT] Cannot store daily report - createUniqueUuid not available');
        return;
      }
      
      const memory = {
        id: createUniqueUuid(this.runtime, `nostr:context:daily-report:${dateSlug}:${timestamp}`),
        entityId: createUniqueUuid(this.runtime, 'nostr:context-accumulator'),
        roomId: createUniqueUuid(this.runtime, 'nostr:reports'),
        agentId: this.runtime.agentId,
        content: {
          type: 'daily_report',
          source: 'nostr',
          data: report
        },
        createdAt: timestamp
      };
      
      await this.runtime.createMemory(memory, 'messages');
      this.logger.info('[CONTEXT] ✅ Stored daily report to memory');
    } catch (err) {
      this.logger.debug('[CONTEXT] Failed to store daily report:', err.message);
    }
  }

  // Query methods for retrieving accumulated context
  
  getEmergingStories(minUsers = 3) {
    return Array.from(this.emergingStories.entries())
      .filter(([_, story]) => story.users.size >= minUsers)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .map(([topic, story]) => ({
        topic,
        mentions: story.mentions,
        users: story.users.size,
        sentiment: story.sentiment,
        recentEvents: story.events.slice(-3)
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

  getStats() {
    return {
      enabled: this.enabled,
      llmAnalysisEnabled: this.llmAnalysisEnabled,
      llmSentimentEnabled: this.llmSentimentEnabled,
      llmTopicExtractionEnabled: this.llmTopicExtractionEnabled,
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
        llmTopicMaxLength: this.llmTopicMaxLength
      }
    };
  }
}

module.exports = { ContextAccumulator };
