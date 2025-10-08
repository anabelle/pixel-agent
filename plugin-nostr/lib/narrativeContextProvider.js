// Narrative Context Provider - Surfaces relevant narrative intelligence to the agent
// Integrates with ElizaOS runtime to make Pixel historically aware

class NarrativeContextProvider {
  constructor(narrativeMemory, contextAccumulator, logger) {
    this.narrativeMemory = narrativeMemory;
    this.contextAccumulator = contextAccumulator;
    this.logger = logger || console;
  }

  /**
   * Get relevant narrative context for a specific message/post
   * Intelligently selects which narratives matter for the current conversation
   */
  async getRelevantContext(message, options = {}) {
    const {
      includeEmergingStories = true,
      includeHistoricalComparison = true,
      includeSimilarMoments = true,
      includeTopicEvolution = true,
      maxContext = 500 // Max characters for context
    } = options;

    const context = {
      hasContext: false,
      emergingStories: [],
      historicalInsights: null,
      similarMoments: [],
      topicEvolution: null,
      currentActivity: null,
      summary: ''
    };

    try {
      // 1. Extract topics from the message
      const messageTopics = this._extractTopicsFromMessage(message);
      
      // 2. Get emerging stories that match message topics
      if (includeEmergingStories && messageTopics.length > 0) {
        const allStories = this.contextAccumulator?.getEmergingStories(5) || [];
        context.emergingStories = allStories.filter(story => 
          messageTopics.some(topic => 
            story.topic.toLowerCase().includes(topic.toLowerCase()) ||
            topic.toLowerCase().includes(story.topic.toLowerCase())
          )
        );
      }

      // 3. Get current activity level
      if (this.contextAccumulator) {
        context.currentActivity = this.contextAccumulator.getCurrentActivity();
      }

      // 4. Historical comparison for detected topics
      if (includeHistoricalComparison && this.narrativeMemory && this.contextAccumulator) {
        try {
          const currentDigest = this.contextAccumulator.getRecentDigest(1);
          if (currentDigest) {
            const comparison = await this.narrativeMemory.compareWithHistory(currentDigest, '7d');
            if (comparison && (Math.abs(comparison.eventTrend?.change || 0) > 20 || 
                comparison.topicChanges?.emerging?.length > 0)) {
              context.historicalInsights = comparison;
            }
          }
        } catch (err) {
          this.logger.debug('[NARRATIVE-CONTEXT] Historical comparison failed:', err.message);
        }
      }

      // 5. Topic evolution for matching topics
      if (includeTopicEvolution && messageTopics.length > 0 && this.narrativeMemory) {
        try {
          // Pick the most relevant topic
          const primaryTopic = messageTopics[0];
          const evolution = await this.narrativeMemory.getTopicEvolution(primaryTopic, 14);
          if (evolution && evolution.dataPoints.length > 3) {
            context.topicEvolution = evolution;
          }
        } catch (err) {
          this.logger.debug('[NARRATIVE-CONTEXT] Topic evolution failed:', err.message);
        }
      }

      // 6. Find similar past moments
      if (includeSimilarMoments && this.narrativeMemory && this.contextAccumulator) {
        try {
          const currentDigest = this.contextAccumulator.getRecentDigest(1);
          if (currentDigest) {
            const similar = await this.narrativeMemory.getSimilarPastMoments(currentDigest, 2);
            if (similar && similar.length > 0) {
              context.similarMoments = similar;
            }
          }
        } catch (err) {
          this.logger.debug('[NARRATIVE-CONTEXT] Similar moments search failed:', err.message);
        }
      }

      // 7. Build summary text
      context.summary = this._buildContextSummary(context, maxContext);
      context.hasContext = context.summary.length > 0;

      if (context.hasContext) {
        this.logger.debug(`[NARRATIVE-CONTEXT] Generated context (${context.summary.length} chars)`);
      }

      return context;

    } catch (err) {
      this.logger.error('[NARRATIVE-CONTEXT] Failed to get relevant context:', err.message);
      return context;
    }
  }

  /**
   * Build a concise text summary of narrative context for prompt injection
   */
  _buildContextSummary(context, maxChars) {
    const parts = [];

    // Current activity level
    if (context.currentActivity && context.currentActivity.events > 10) {
      const { events, users, topics } = context.currentActivity;
      const topTopicsStr = topics?.slice(0, 3).map(t => t.topic).join(', ') || '';
      parts.push(`CURRENT: ${events} posts from ${users} users. Top: ${topTopicsStr}`);
    }

    // Emerging stories
    if (context.emergingStories.length > 0) {
      const stories = context.emergingStories.slice(0, 2)
        .map(s => `${s.topic}(${s.mentions} mentions, ${s.users} users)`)
        .join('; ');
      parts.push(`TRENDING: ${stories}`);
    }

    // Historical comparison
    if (context.historicalInsights) {
      const { eventTrend, topicChanges } = context.historicalInsights;
      if (eventTrend && Math.abs(eventTrend.change) > 20) {
        parts.push(`ACTIVITY: ${eventTrend.direction} ${Math.abs(eventTrend.change)}% vs usual`);
      }
      if (topicChanges?.emerging && topicChanges.emerging.length > 0) {
        parts.push(`NEW TOPICS: ${topicChanges.emerging.slice(0, 3).join(', ')}`);
      }
    }

    // Topic evolution
    if (context.topicEvolution && context.topicEvolution.trend !== 'stable') {
      const { topic, trend, dataPoints } = context.topicEvolution;
      const recentMentions = dataPoints.slice(-3).map(d => d.mentions).join('→');
      parts.push(`${topic.toUpperCase()}: ${trend} (${recentMentions})`);
    }

    // Similar past moments
    if (context.similarMoments.length > 0) {
      const moment = context.similarMoments[0];
      const daysAgo = Math.floor((Date.now() - new Date(moment.date).getTime()) / (24 * 60 * 60 * 1000));
      parts.push(`SIMILAR: ${daysAgo}d ago (${(moment.similarity * 100).toFixed(0)}% match)`);
    }

    const summary = parts.join(' | ');
    
    // Truncate if needed
    if (summary.length > maxChars) {
      return summary.slice(0, maxChars - 3) + '...';
    }
    
    return summary;
  }

  /**
   * Extract topics from a message for context matching
   */
  _extractTopicsFromMessage(message) {
    if (!message || typeof message !== 'string') return [];
    
    const content = message.toLowerCase();
    const topics = [];

    // Common crypto/nostr topics
    const topicPatterns = {
      'bitcoin': /\b(bitcoin|btc|sats?|satoshi)\b/,
      'lightning': /\b(lightning|ln|lnurl|bolt)\b/,
      'nostr': /\b(nostr|relay|nip-?\d+|zap)\b/,
      'pixel art': /\b(pixel|canvas|art|paint|draw)\b/,
      'ai': /\b(ai|llm|agent|gpt|model)\b/,
      'privacy': /\b(privacy|encryption|anon|kyc)\b/,
      'decentralization': /\b(decentrali[sz]|sovereign|permissionless|censorship)\b/,
      'community': /\b(community|pleb|plebchain|artstr)\b/,
      'technology': /\b(tech|code|dev|build|hack)\b/,
      'economy': /\b(economy|inflation|money|currency|market)\b/
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(content)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * Detect if this is a moment worth proactively mentioning context
   * Returns insight suggestion or null
   */
  async detectProactiveInsight(message, userProfile = null) {
    try {
      const context = await this.getRelevantContext(message, {
        includeEmergingStories: true,
        includeHistoricalComparison: true,
        maxContext: 200
      });

      if (!context.hasContext) return null;

      // Detect significant patterns worth mentioning
      
      // 1. Massive activity spike
      if (context.historicalInsights?.eventTrend?.change > 100) {
        return {
          type: 'activity_spike',
          message: `btw, activity is ${context.historicalInsights.eventTrend.change}% higher than usual`,
          priority: 'high'
        };
      }

      // 2. User asks about a trending topic
      if (context.emergingStories.length > 0) {
        const topStory = context.emergingStories[0];
        if (topStory.mentions > 20) {
          return {
            type: 'trending_topic',
            message: `${topStory.topic} is trending (${topStory.mentions} mentions from ${topStory.users} people)`,
            priority: 'medium'
          };
        }
      }

      // 3. Topic evolution showing dramatic change
      if (context.topicEvolution && context.topicEvolution.trend === 'rising') {
        const dataPoints = context.topicEvolution.dataPoints;
        if (dataPoints.length >= 3) {
          const recent = dataPoints.slice(-3).map(d => d.mentions);
          const growth = recent[2] > recent[0] * 2;
          if (growth) {
            return {
              type: 'topic_surge',
              message: `${context.topicEvolution.topic} mentions doubled recently`,
              priority: 'medium'
            };
          }
        }
      }

      // 4. New user asking about established topic
      if (userProfile?.relationshipDepth === 'new' && context.topicEvolution) {
        return {
          type: 'topic_context',
          message: `this topic has been discussed ${context.topicEvolution.dataPoints.length} times recently`,
          priority: 'low'
        };
      }

      return null;

    } catch (err) {
      this.logger.debug('[NARRATIVE-CONTEXT] Proactive insight detection failed:', err.message);
      return null;
    }
  }

  /**
   * Get stats for debugging/monitoring
   */
  getStats() {
    return {
      narrativeMemoryAvailable: !!this.narrativeMemory,
      contextAccumulatorAvailable: !!this.contextAccumulator,
      contextAccumulatorEnabled: this.contextAccumulator?.enabled || false,
      narrativeMemoryStats: this.narrativeMemory?.getStats?.() || null,
      contextAccumulatorStats: this.contextAccumulator?.getStats?.() || null
    };
  }
}

module.exports = { NarrativeContextProvider };
