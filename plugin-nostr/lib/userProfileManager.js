// User Profile Manager - Persistent per-user learning and tracking
// Enables Pixel to evolve understanding of individual users over time

class UserProfileManager {
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger || console;
    
    // In-memory cache of user profiles (hot data)
    this.profiles = new Map(); // pubkey -> UserProfile
    
    // Configuration
    this.maxCachedProfiles = 500; // Keep most active users in memory
    this.profileSyncInterval = 5 * 60 * 1000; // Sync to DB every 5 minutes
    this.interactionHistoryLimit = 100; // Keep last 100 interactions per user
    
    // Start periodic sync
    this.syncTimer = setInterval(() => this._syncProfilesToMemory(), this.profileSyncInterval);

    this._systemContext = null;
    this._systemContextPromise = null;
  }

  async _getSystemContext() {
    if (!this.runtime) return null;
    if (this._systemContext) return this._systemContext;

    if (!this._systemContextPromise) {
      try {
        const { ensureNostrContextSystem } = require('./context');
        const createUniqueUuid = this.runtime?.createUniqueUuid;
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
        this.logger.debug('[USER-PROFILE] Failed to initiate system context ensure:', err?.message || err);
        return null;
      }
    }

    try {
      this._systemContext = await this._systemContextPromise;
      return this._systemContext;
    } catch (err) {
      this.logger.debug('[USER-PROFILE] Failed to ensure system context:', err?.message || err);
      this._systemContextPromise = null;
      return null;
    }
  }

  async getProfile(pubkey) {
    // Check cache first
    if (this.profiles.has(pubkey)) {
      return this.profiles.get(pubkey);
    }

    // Load from database
    const profile = await this._loadProfileFromMemory(pubkey);
    
    if (profile) {
      this.profiles.set(pubkey, profile);
      return profile;
    }

    // Create new profile
    const newProfile = this._createEmptyProfile(pubkey);
    this.profiles.set(pubkey, newProfile);
    return newProfile;
  }

  async updateProfile(pubkey, updates) {
    const profile = await this.getProfile(pubkey);
    
    // Merge updates
    Object.assign(profile, updates);
    profile.lastUpdated = Date.now();
    
    // Update cache
    this.profiles.set(pubkey, profile);
    
    // Mark for sync
    profile.needsSync = true;
  }

  async recordInteraction(pubkey, interaction) {
    const profile = await this.getProfile(pubkey);
    
    // Add to interaction history
    profile.interactions.push({
      ...interaction,
      timestamp: Date.now()
    });

    // Keep only recent interactions
    if (profile.interactions.length > this.interactionHistoryLimit) {
      profile.interactions.shift();
    }

    // Update statistics
    profile.totalInteractions++;
    profile.lastInteraction = Date.now();
    
    // Track interaction by type
    const type = interaction.type || 'unknown';
    profile.interactionsByType[type] = (profile.interactionsByType[type] || 0) + 1;
    
    // Update success metrics
    if (interaction.success) {
      profile.successfulInteractions++;
    }

    // Mark for sync
    profile.needsSync = true;
  }

  async recordTopicInterest(pubkey, topic, engagement = 1.0) {
    const profile = await this.getProfile(pubkey);
    
    // Update topic interests with exponential moving average
    const currentInterest = profile.topicInterests[topic] || 0;
    const alpha = 0.3; // Learning rate
    profile.topicInterests[topic] = alpha * engagement + (1 - alpha) * currentInterest;
    
    // Track topic frequency
    profile.topicFrequency[topic] = (profile.topicFrequency[topic] || 0) + 1;
    
    profile.needsSync = true;
  }

  async recordSentimentPattern(pubkey, sentiment) {
    const profile = await this.getProfile(pubkey);
    
    // Track sentiment distribution
    profile.sentimentHistory.push({
      sentiment,
      timestamp: Date.now()
    });

    // Keep last 50 sentiment samples
    if (profile.sentimentHistory.length > 50) {
      profile.sentimentHistory.shift();
    }

    // Calculate dominant sentiment
    const counts = { positive: 0, negative: 0, neutral: 0 };
    profile.sentimentHistory.forEach(s => counts[s.sentiment]++);
    profile.dominantSentiment = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    
    profile.needsSync = true;
  }

  async recordRelationship(pubkey, relatedPubkey, interactionType) {
    const profile = await this.getProfile(pubkey);
    
    if (!profile.relationships[relatedPubkey]) {
      profile.relationships[relatedPubkey] = {
        pubkey: relatedPubkey,
        interactions: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        types: {}
      };
    }

    const rel = profile.relationships[relatedPubkey];
    rel.interactions++;
    rel.lastSeen = Date.now();
    rel.types[interactionType] = (rel.types[interactionType] || 0) + 1;
    
    profile.needsSync = true;
  }

  async getTopicExperts(topic, minInteractions = 5) {
    // Find users with high topic interest
    const experts = [];
    
    for (const [pubkey, profile] of this.profiles.entries()) {
      const interest = profile.topicInterests[topic] || 0;
      const frequency = profile.topicFrequency[topic] || 0;
      
      if (frequency >= minInteractions && interest > 0.5) {
        experts.push({
          pubkey,
          interest,
          frequency,
          score: interest * Math.log(frequency + 1)
        });
      }
    }

    return experts.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async getUserRecommendations(pubkey, limit = 5) {
    const profile = await this.getProfile(pubkey);
    
    // Find users with similar topic interests
    const candidates = [];
    
    for (const [otherPubkey, otherProfile] of this.profiles.entries()) {
      if (otherPubkey === pubkey) continue;
      if (profile.relationships[otherPubkey]) continue; // Already connected
      
      // Calculate topic similarity (cosine similarity)
      const similarity = this._calculateTopicSimilarity(
        profile.topicInterests,
        otherProfile.topicInterests
      );
      
      if (similarity > 0.3) {
        candidates.push({
          pubkey: otherPubkey,
          similarity,
          commonTopics: this._getCommonTopics(profile.topicInterests, otherProfile.topicInterests)
        });
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  async getEngagementStats(pubkey) {
    const profile = await this.getProfile(pubkey);
    
    return {
      totalInteractions: profile.totalInteractions,
      successRate: profile.totalInteractions > 0 
        ? profile.successfulInteractions / profile.totalInteractions 
        : 0,
      averageEngagement: this._calculateAverageEngagement(profile),
      topTopics: Object.entries(profile.topicInterests)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, interest]) => ({ topic, interest })),
      relationships: Object.keys(profile.relationships).length,
      dominantSentiment: profile.dominantSentiment,
      replySuccessRate: this._calculateReplySuccessRate(profile)
    };
  }

  _createEmptyProfile(pubkey) {
    return {
      pubkey,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      lastInteraction: null,
      totalInteractions: 0,
      successfulInteractions: 0,
      interactionsByType: {},
      interactions: [],
      topicInterests: {}, // topic -> interest score (0-1)
      topicFrequency: {}, // topic -> post count
      sentimentHistory: [],
      dominantSentiment: 'neutral',
      relationships: {}, // pubkey -> relationship data
      qualityScore: 0.5,
      engagementScore: 0.0,
      preferredResponseStyle: null,
      timezone: null,
      activeHours: [], // Hours of day when most active
      needsSync: true
    };
  }

  async _loadProfileFromMemory(pubkey) {
    if (!this.runtime || typeof this.runtime.getMemories !== 'function') {
      return null;
    }

    try {
      const createUniqueUuid = this.runtime.createUniqueUuid;
      if (!createUniqueUuid) return null;

      const roomId = createUniqueUuid(this.runtime, 'nostr-user-profiles');
      const entityId = createUniqueUuid(this.runtime, pubkey);

      if (!roomId || !entityId) {
        this.logger.debug('[USER-PROFILE] Failed to generate UUIDs for profile lookup');
        return null;
      }

      const memories = await this.runtime.getMemories({
        roomId,
        entityId,
        tableName: 'messages',
        count: 1
      });

      if (memories && memories.length > 0) {
        const memory = memories[0];
        if (memory.content && memory.content.data) {
          return {
            ...memory.content.data,
            needsSync: false
          };
        }
      }

      return null;
    } catch (err) {
      this.logger.debug('[USER-PROFILE] Failed to load profile:', err.message);
      return null;
    }
  }

  async _syncProfilesToMemory() {
    if (!this.runtime || typeof this.runtime.createMemory !== 'function') {
      return;
    }

    const createUniqueUuid = this.runtime.createUniqueUuid;
    if (!createUniqueUuid) return;

    let synced = 0;
    const profiles = Array.from(this.profiles.values()).filter(p => p.needsSync);

    const systemContext = await this._getSystemContext();
    const rooms = systemContext?.rooms || {};
    const worldId = systemContext?.worldId;
    const baseRoomId = rooms.userProfiles || createUniqueUuid(this.runtime, 'nostr-user-profiles');

    for (const profile of profiles) {
      try {
        const roomId = baseRoomId || createUniqueUuid(this.runtime, 'nostr-user-profiles');
        const entityId = createUniqueUuid(this.runtime, profile.pubkey);
        const memoryId = createUniqueUuid(this.runtime, `nostr-user-profile-${profile.pubkey}-${Date.now()}`);

        if (!roomId || !entityId || !memoryId) {
          this.logger.debug(`[USER-PROFILE] Failed to generate UUIDs for profile ${profile.pubkey.slice(0, 8)}`);
          continue;
        }

        const memory = {
          id: memoryId,
          entityId,
          roomId,
          agentId: this.runtime.agentId,
          content: {
            type: 'user_profile',
            source: 'nostr',
            data: {
              ...profile,
              needsSync: undefined // Don't store sync flag
            }
          },
          createdAt: Date.now()
        };

        if (worldId) {
          memory.worldId = worldId;
        }

        // Use createMemorySafe from context.js for retry logic
        const { createMemorySafe } = require('./context');
        const result = await createMemorySafe(this.runtime, memory, 'messages', 3, this.logger);
        if (result && (result === true || result.created)) {
          profile.needsSync = false;
          synced++;
        } else {
          this.logger.warn(`[USER-PROFILE] Failed to persist profile ${profile.pubkey.slice(0, 8)}`);
        }
      } catch (err) {
        this.logger.debug(`[USER-PROFILE] Failed to sync profile ${profile.pubkey.slice(0, 8)}:`, err.message);
      }
    }

    if (synced > 0) {
      this.logger.info(`[USER-PROFILE] Synced ${synced} profiles to memory`);
    }
  }

  _calculateTopicSimilarity(interests1, interests2) {
    const topics = new Set([...Object.keys(interests1), ...Object.keys(interests2)]);
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (const topic of topics) {
      const i1 = interests1[topic] || 0;
      const i2 = interests2[topic] || 0;
      dotProduct += i1 * i2;
      magnitude1 += i1 * i1;
      magnitude2 += i2 * i2;
    }

    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
  }

  _getCommonTopics(interests1, interests2) {
    const topics = [];
    
    for (const topic in interests1) {
      if (interests2[topic] && interests1[topic] > 0.3 && interests2[topic] > 0.3) {
        topics.push(topic);
      }
    }

    return topics;
  }

  _calculateAverageEngagement(profile) {
    if (profile.interactions.length === 0) return 0;
    
    const engagements = profile.interactions
      .filter(i => i.engagement !== undefined)
      .map(i => i.engagement);
    
    if (engagements.length === 0) return 0;
    return engagements.reduce((sum, e) => sum + e, 0) / engagements.length;
  }

  _calculateReplySuccessRate(profile) {
    const replyInteractions = profile.interactions.filter(i => i.type === 'reply');
    if (replyInteractions.length === 0) return 0;
    
    const successful = replyInteractions.filter(i => i.success).length;
    return successful / replyInteractions.length;
  }

  async cleanup() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    // Final sync before cleanup
    await this._syncProfilesToMemory();
  }

  getStats() {
    return {
      cachedProfiles: this.profiles.size,
      profilesNeedingSync: Array.from(this.profiles.values()).filter(p => p.needsSync).length,
      totalInteractions: Array.from(this.profiles.values()).reduce((sum, p) => sum + p.totalInteractions, 0),
      totalRelationships: Array.from(this.profiles.values()).reduce((sum, p) => sum + Object.keys(p.relationships).length, 0)
    };
  }
}

module.exports = { UserProfileManager };
