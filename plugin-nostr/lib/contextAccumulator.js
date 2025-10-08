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
    // Fast extraction without LLM for now
    // TODO: Add optional LLM-based extraction for deeper analysis
    
    const content = evt.content || '';
    const topics = extractTopicsFromEvent(evt);
    
    // Extract links
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = content.match(linkRegex) || [];
    
    // Basic sentiment analysis
    const sentiment = this._basicSentiment(content);
    
    // Detect if it's a question
    const isQuestion = content.includes('?');
    
    return {
      topics: topics.length > 0 ? topics : ['general'],
      links,
      sentiment,
      isQuestion,
      length: content.length
    };
  }

  _basicSentiment(content) {
    const lower = content.toLowerCase();
    
    // Simple keyword-based sentiment
    const positiveKeywords = ['great', 'awesome', 'love', 'amazing', 'excellent', 'good', 'nice', 'wonderful', 'fantastic', '🚀', '🎉', '❤️', '😊', '👍'];
    const negativeKeywords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'sucks', 'fail', 'disappointing', '😢', '😡', '👎'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    for (const keyword of positiveKeywords) {
      if (lower.includes(keyword)) positiveCount++;
    }
    
    for (const keyword of negativeKeywords) {
      if (lower.includes(keyword)) negativeCount++;
    }
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
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
      const createUniqueUuid = this.runtime.createUniqueUuid || 
        ((rt, seed) => `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
      
      const memory = {
        id: createUniqueUuid(this.runtime, `emerging-story:${topic}:${Date.now()}`),
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
            timestamp: Date.now()
          }
        },
        createdAt: Date.now()
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
      const userTopics = new Map();
      
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

      // Parse JSON response
      const narrative = JSON.parse(response.trim());
      
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
      const createUniqueUuid = this.runtime.createUniqueUuid || 
        ((rt, seed) => `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
      
      const memory = {
        id: createUniqueUuid(this.runtime, `hourly-digest:${Date.now()}`),
        entityId: createUniqueUuid(this.runtime, 'nostr:context-accumulator'),
        roomId: createUniqueUuid(this.runtime, 'nostr:digests'),
        agentId: this.runtime.agentId,
        content: {
          type: 'hourly_digest',
          source: 'nostr',
          data: summary
        },
        createdAt: Date.now()
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

      const narrative = JSON.parse(response.trim());
      
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
      const createUniqueUuid = this.runtime.createUniqueUuid || 
        ((rt, seed) => `${seed}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
      
      const memory = {
        id: createUniqueUuid(this.runtime, `daily-report:${report.date}`),
        entityId: createUniqueUuid(this.runtime, 'nostr:context-accumulator'),
        roomId: createUniqueUuid(this.runtime, 'nostr:reports'),
        agentId: this.runtime.agentId,
        content: {
          type: 'daily_report',
          source: 'nostr',
          data: report
        },
        createdAt: Date.now()
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
      hourlyDigests: this.hourlyDigests.size,
      emergingStories: this.emergingStories.size,
      topicTimelines: this.topicTimelines.size,
      dailyEvents: this.dailyEvents.length,
      currentActivity: this.getCurrentActivity()
    };
  }
}

module.exports = { ContextAccumulator };
