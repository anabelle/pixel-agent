// Storyline Tracker - Adaptive storyline progression and emerging-pattern detection
// Implements hybrid detection logic combining rule-based heuristics with LLM-assisted classification

class StorylineTracker {
  constructor(runtime, logger) {
    this.runtime = runtime;
    this.logger = logger || console;

    // Core progression patterns (canonical + extensible)
    this.progressionPatterns = {
      regulatory: [
        'proposal', 'discussion', 'opposition', 'revision', 'vote', 'implementation'
      ],
      technical: [
        'idea', 'design', 'development', 'testing', 'release', 'adoption'
      ],
      market: [
        'rumor', 'speculation', 'confirmation', 'reaction', 'analysis', 'conclusion'
      ],
      community: [
        'emergence', 'discussion', 'debate', 'consensus', 'action', 'result'
      ]
    };

    // Per-topic pattern models (learned from data)
    this.topicModels = new Map(); // topic -> { patterns: [], confidence: number, lastUpdated: timestamp }

    // Active storylines registry
    this.activeStorylines = new Map(); // storylineId -> { id, topic, currentPhase, history: [], context: {}, confidence: number, lastUpdated: timestamp }

    // LLM fallback configuration
    this.llmEnabled = String(runtime?.getSetting?.('NARRATIVE_LLM_ENABLE') ?? 'false').toLowerCase() === 'true';
    this.llmModel = runtime?.getSetting?.('NARRATIVE_LLM_MODEL') ?? 'gpt-3.5-turbo';
    this.llmCache = new Map(); // digest -> { result, timestamp }
    this.llmCacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    this.llmRateLimit = 10; // calls per hour
    this.llmCallHistory = []; // timestamps of recent calls

    // Configuration
    this.ruleConfidenceThreshold = 0.5; // Below this, try LLM
    this.minNoveltyConfidence = 0.7; // Minimum confidence for novel phase detection
    this.maxStorylinesPerTopic = 5; // Limit concurrent storylines per topic
    this.storylineTTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    this.logger.info(`[STORYLINE-TRACKER] Initialized (LLM: ${this.llmEnabled ? 'ON' : 'OFF'})`);
  }

  /**
   * Analyze a post for storyline progression or emergence
   * @param {string} content - Post content
   * @param {Array<string>} topics - Extracted topics
   * @param {number} timestamp - Post timestamp
   * @param {Object} meta - Additional metadata (optional)
   * @returns {Array} Array of events: { type: 'progression'|'emergence'|'unknown', storylineId?, prevPhase?, newPhase?, confidence, evidence: { rules?, llm? } }
   */
  async analyzePost(content, topics, timestamp = Date.now(), meta = {}) {
    if (!content || !Array.isArray(topics) || topics.length === 0) {
      return [{ type: 'unknown', confidence: 0, evidence: {} }];
    }

    const events = [];
    const contentLower = content.toLowerCase();

    // Process each topic independently
    for (const topic of topics) {
      const topicKey = String(topic).toLowerCase().trim();
      if (!topicKey) continue;

      // Get or create topic model
      const topicModel = this._getTopicModel(topicKey);

      // Try rule-based detection first
      const ruleResult = this._detectProgressionRules(contentLower, topicKey, topicModel);

      if (ruleResult.confidence >= this.ruleConfidenceThreshold) {
        // High confidence rule match
        const event = await this._processRuleMatch(ruleResult, topicKey, content, timestamp, meta);
        if (event) events.push(event);
      } else if (this.llmEnabled) {
        // Low confidence, try LLM fallback
        const llmResult = await this._detectProgressionLLM(content, topicKey, topicModel, ruleResult);
        if (llmResult) {
          const event = await this._processLLMMatch(llmResult, topicKey, content, timestamp, meta);
          if (event) events.push(event);
        }
      } else {
        // No LLM, check for emergence with low confidence
        const emergenceResult = this._detectEmergence(contentLower, topicKey);
        if (emergenceResult.confidence >= this.minNoveltyConfidence) {
          const event = await this._processEmergence(emergenceResult, topicKey, content, timestamp, meta);
          if (event) events.push(event);
        }
      }
    }

    // Clean up old storylines
    this._cleanupExpiredStorylines();

    return events.length > 0 ? events : [{ type: 'unknown', confidence: 0, evidence: {} }];
  }

  /**
   * Rule-based progression detection
   */
  _detectProgressionRules(contentLower, topicKey, topicModel) {
    let bestMatch = { confidence: 0, phase: null, pattern: null, evidence: [] };

    // Check canonical patterns
    for (const [patternName, phases] of Object.entries(this.progressionPatterns)) {
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        const confidence = this._calculatePhaseMatch(contentLower, phase, topicModel);

        if (confidence > bestMatch.confidence) {
          bestMatch = {
            confidence,
            phase,
            pattern: patternName,
            evidence: [`canonical_${patternName}_${phase}`]
          };
        }
      }
    }

    // Check learned patterns for this topic
    if (topicModel.patterns) {
      for (const learnedPattern of topicModel.patterns) {
        const confidence = this._calculateLearnedMatch(contentLower, learnedPattern);

        if (confidence > bestMatch.confidence) {
          bestMatch = {
            confidence,
            phase: learnedPattern.phase,
            pattern: 'learned',
            evidence: [`learned_${learnedPattern.phase}`]
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculate confidence for phase match using keywords and context
   */
  _calculatePhaseMatch(content, phase, topicModel) {
    const phaseKeywords = this._getPhaseKeywords(phase);
    let matches = 0;
    let total = phaseKeywords.length;

    for (const keyword of phaseKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    // Boost confidence based on topic model history
    const baseConfidence = total > 0 ? matches / total : 0;
    const historyBoost = topicModel.confidence || 0;

    return Math.min(1.0, baseConfidence + (historyBoost * 0.2));
  }

  /**
   * Get keywords associated with a phase
   */
  _getPhaseKeywords(phase) {
    const keywordMap = {
      // Regulatory
      proposal: ['propose', 'suggest', 'idea', 'plan', 'draft', 'introduce'],
      discussion: ['discuss', 'talk', 'debate', 'conversation', 'chat', 'consider'],
      opposition: ['against', 'oppose', 'criticize', 'disagree', 'concern', 'problem'],
      revision: ['revise', 'change', 'update', 'modify', 'amend', 'improve'],
      vote: ['vote', 'poll', 'decision', 'choose', 'elect', 'select'],
      implementation: ['implement', 'deploy', 'launch', 'execute', 'build', 'create'],

      // Technical
      idea: ['idea', 'concept', 'thought', 'brainstorm', 'inspire', 'imagine'],
      design: ['design', 'architecture', 'plan', 'structure', 'blueprint', 'model'],
      development: ['develop', 'build', 'code', 'program', 'create', 'implement'],
      testing: ['test', 'verify', 'check', 'validate', 'debug', 'trial'],
      release: ['release', 'launch', 'deploy', 'publish', 'ship', 'available'],
      adoption: ['adopt', 'use', 'implement', 'integrate', 'apply', 'follow'],

      // Market
      rumor: ['rumor', 'hear', 'speculate', 'whisper', 'buzz', 'talk'],
      speculation: ['speculate', 'guess', 'predict', 'expect', 'anticipate', 'wonder'],
      confirmation: ['confirm', 'verify', 'prove', 'true', 'official', 'announce'],
      reaction: ['react', 'respond', 'comment', 'opinion', 'feel', 'think'],
      analysis: ['analyze', 'study', 'review', 'examine', 'evaluate', 'assess'],
      conclusion: ['conclude', 'final', 'end', 'result', 'outcome', 'summary'],

      // Community
      emergence: ['emerge', 'start', 'begin', 'new', 'appear', 'arise'],
      discussion: ['discuss', 'talk', 'debate', 'conversation', 'chat', 'forum'],
      debate: ['debate', 'argue', 'dispute', 'controversy', 'conflict', 'divide'],
      consensus: ['agree', 'consensus', 'unite', 'settle', 'decide', 'resolve'],
      action: ['act', 'do', 'execute', 'perform', 'implement', 'take'],
      result: ['result', 'outcome', 'consequence', 'effect', 'impact', 'change']
    };

    return keywordMap[phase] || [];
  }

  /**
   * Calculate match against learned patterns
   */
  _calculateLearnedMatch(content, learnedPattern) {
    const keywords = learnedPattern.keywords || [];
    let matches = 0;

    for (const keyword of keywords) {
      if (content.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    return keywords.length > 0 ? matches / keywords.length : 0;
  }

  /**
   * LLM-based progression detection (fallback)
   */
  async _detectProgressionLLM(content, topicKey, topicModel, ruleResult) {
    // Rate limiting
    if (!this._checkLLMRateLimit()) {
      this.logger.debug('[STORYLINE-TRACKER] LLM rate limit exceeded, skipping');
      return null;
    }

    // Caching
    const digest = this._createContentDigest(content, topicKey);
    const cached = this.llmCache.get(digest);
    if (cached && (Date.now() - cached.timestamp) < this.llmCacheTTL) {
      return cached.result;
    }

    try {
      const prompt = this._buildLLMPrompt(content, topicKey, topicModel, ruleResult);

      const response = await this.runtime.generateText(prompt, {
        temperature: 0.1,
        maxTokens: 200
      });

      const result = this._parseLLMResponse(response);
      if (result) {
        // Cache result
        this.llmCache.set(digest, { result, timestamp: Date.now() });
        this.llmCallHistory.push(Date.now());

        // Update topic model with new patterns
        this._updateTopicModel(topicKey, result);
      }

      return result;
    } catch (err) {
      this.logger.debug('[STORYLINE-TRACKER] LLM detection failed:', err?.message || err);
      return null;
    }
  }

  /**
   * Build LLM prompt for progression detection
   */
  _buildLLMPrompt(content, topicKey, topicModel, ruleResult) {
    const knownPatterns = Object.keys(this.progressionPatterns).join(', ');
    const learnedPhases = topicModel.patterns?.map(p => p.phase).join(', ') || 'none';

    return `Analyze this post about "${topicKey}" and determine if it advances a storyline or starts a new one.

POST: "${content.slice(0, 500)}"

CONTEXT:
- Known progression patterns: ${knownPatterns}
- Previously learned phases for this topic: ${learnedPhases}
- Rule-based detection confidence: ${ruleResult.confidence.toFixed(2)}

TASK: Classify the post's role in a storyline progression. Consider:
1. Does this continue an existing storyline phase?
2. Does this start a new storyline?
3. What phase does this represent?

RESPONSE FORMAT (JSON):
{
  "type": "progression|emergence|unknown",
  "phase": "phase_name_or_null",
  "confidence": 0.0-1.0,
  "rationale": "brief explanation",
  "pattern": "canonical_pattern_name|learned|novel"
}`;
  }

  /**
   * Parse LLM response
   */
  _parseLLMResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.type || !['progression', 'emergence', 'unknown'].includes(parsed.type)) {
        return null;
      }

      return {
        type: parsed.type,
        phase: parsed.phase || null,
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        rationale: parsed.rationale || '',
        pattern: parsed.pattern || 'unknown',
        evidence: { llm: { label: parsed.phase, prob: parsed.confidence, rationale: parsed.rationale } }
      };
    } catch (err) {
      this.logger.debug('[STORYLINE-TRACKER] Failed to parse LLM response:', err?.message || err);
      return null;
    }
  }

  /**
   * Detect storyline emergence
   */
  _detectEmergence(content, topicKey) {
    // Look for emergence indicators
    const emergenceKeywords = [
      'new', 'start', 'begin', 'introduce', 'launch', 'announce',
      'first', 'initial', 'emerging', 'breaking', 'developing'
    ];

    let matches = 0;
    for (const keyword of emergenceKeywords) {
      if (content.includes(keyword)) {
        matches++;
      }
    }

    const confidence = Math.min(1.0, matches / 3); // Need at least 3 matches for high confidence

    return {
      confidence,
      evidence: [`emergence_keywords_${matches}`]
    };
  }

  /**
   * Process rule-based match
   */
  async _processRuleMatch(ruleResult, topicKey, content, timestamp, meta) {
    const storylineId = this._findOrCreateStoryline(topicKey, ruleResult.phase, timestamp);

    if (!storylineId) {
      return {
        type: 'unknown',
        confidence: ruleResult.confidence,
        evidence: { rules: ruleResult.evidence }
      };
    }

    const storyline = this.activeStorylines.get(storylineId);
    const prevPhase = storyline.currentPhase;

    // Update storyline
    storyline.currentPhase = ruleResult.phase;
    storyline.lastUpdated = timestamp;
    storyline.confidence = Math.max(storyline.confidence, ruleResult.confidence);
    storyline.history.push({
      timestamp,
      phase: ruleResult.phase,
      content: content.slice(0, 200),
      confidence: ruleResult.confidence,
      source: 'rules'
    });

    return {
      type: 'progression',
      storylineId,
      prevPhase,
      newPhase: ruleResult.phase,
      confidence: ruleResult.confidence,
      evidence: { rules: ruleResult.evidence }
    };
  }

  /**
   * Process LLM match
   */
  async _processLLMMatch(llmResult, topicKey, content, timestamp, meta) {
    const storylineId = this._findOrCreateStoryline(topicKey, llmResult.phase, timestamp);

    if (!storylineId) {
      return {
        type: llmResult.type,
        confidence: llmResult.confidence,
        evidence: llmResult.evidence
      };
    }

    const storyline = this.activeStorylines.get(storylineId);
    const prevPhase = storyline.currentPhase;

    // Update storyline
    storyline.currentPhase = llmResult.phase;
    storyline.lastUpdated = timestamp;
    storyline.confidence = Math.max(storyline.confidence, llmResult.confidence);
    storyline.history.push({
      timestamp,
      phase: llmResult.phase,
      content: content.slice(0, 200),
      confidence: llmResult.confidence,
      source: 'llm'
    });

    return {
      type: llmResult.type,
      storylineId,
      prevPhase,
      newPhase: llmResult.phase,
      confidence: llmResult.confidence,
      evidence: llmResult.evidence
    };
  }

  /**
   * Process emergence
   */
  async _processEmergence(emergenceResult, topicKey, content, timestamp, meta) {
    const storylineId = this._createNewStoryline(topicKey, 'emergence', timestamp);

    return {
      type: 'emergence',
      storylineId,
      newPhase: 'emergence',
      confidence: emergenceResult.confidence,
      evidence: { rules: emergenceResult.evidence }
    };
  }

  /**
   * Find existing storyline or create new one
   */
  _findOrCreateStoryline(topicKey, phase, timestamp) {
    // Look for existing storyline for this topic
    for (const [id, storyline] of this.activeStorylines.entries()) {
      if (storyline.topic === topicKey &&
          (Date.now() - storyline.lastUpdated) < this.storylineTTL) {
        return id;
      }
    }

    // Create new storyline
    return this._createNewStoryline(topicKey, phase, timestamp);
  }

  /**
   * Create new storyline
   */
  _createNewStoryline(topicKey, initialPhase, timestamp) {
    // Check limit per topic
    const topicStorylines = Array.from(this.activeStorylines.values())
      .filter(s => s.topic === topicKey).length;

    if (topicStorylines >= this.maxStorylinesPerTopic) {
      // Remove oldest storyline for this topic
      const oldest = Array.from(this.activeStorylines.entries())
        .filter(([_, s]) => s.topic === topicKey)
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated)[0];

      if (oldest) {
        this.activeStorylines.delete(oldest[0]);
      }
    }

    const storylineId = `${topicKey}_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

    this.activeStorylines.set(storylineId, {
      id: storylineId,
      topic: topicKey,
      currentPhase: initialPhase,
      history: [{
        timestamp,
        phase: initialPhase,
        content: '',
        confidence: 0.5,
        source: 'creation'
      }],
      context: {},
      confidence: 0.5,
      lastUpdated: timestamp
    });

    return storylineId;
  }

  /**
   * Get or create topic model
   */
  _getTopicModel(topicKey) {
    if (!this.topicModels.has(topicKey)) {
      this.topicModels.set(topicKey, {
        patterns: [],
        confidence: 0.5,
        lastUpdated: Date.now()
      });
    }
    return this.topicModels.get(topicKey);
  }

  /**
   * Update topic model with LLM results
   */
  _updateTopicModel(topicKey, llmResult) {
    const model = this._getTopicModel(topicKey);

    // Add new pattern if novel
    if (llmResult.pattern === 'novel' && llmResult.phase) {
      const existingPattern = model.patterns.find(p => p.phase === llmResult.phase);
      if (!existingPattern) {
        model.patterns.push({
          phase: llmResult.phase,
          keywords: this._extractKeywordsFromContent(llmResult.rationale || ''),
          confidence: llmResult.confidence,
          lastSeen: Date.now()
        });
      }
    }

    model.confidence = Math.max(model.confidence, llmResult.confidence * 0.8);
    model.lastUpdated = Date.now();
  }

  /**
   * Extract keywords from rationale text
   */
  _extractKeywordsFromContent(text) {
    // Simple keyword extraction - could be enhanced
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const commonWords = new Set(['this', 'that', 'with', 'from', 'they', 'have', 'been', 'were', 'will', 'would']);
    return words.filter(w => !commonWords.has(w)).slice(0, 5);
  }

  /**
   * Check LLM rate limit
   */
  _checkLLMRateLimit() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Remove old calls
    this.llmCallHistory = this.llmCallHistory.filter(t => t > oneHourAgo);

    return this.llmCallHistory.length < this.llmRateLimit;
  }

  /**
   * Create content digest for caching
   */
  _createContentDigest(content, topicKey) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');
    hash.update(content.slice(0, 500) + topicKey);
    return hash.digest('hex');
  }

  /**
   * Clean up expired storylines
   */
  _cleanupExpiredStorylines() {
    const now = Date.now();
    for (const [id, storyline] of this.activeStorylines.entries()) {
      if ((now - storyline.lastUpdated) > this.storylineTTL) {
        this.activeStorylines.delete(id);
      }
    }
  }

  /**
   * Refresh models (periodic compaction/decay)
   */
  refreshModels() {
    const now = Date.now();
    const decayThreshold = now - (30 * 24 * 60 * 60 * 1000); // 30 days

    // Decay old topic models
    for (const [topicKey, model] of this.topicModels.entries()) {
      if (model.lastUpdated < decayThreshold) {
        model.confidence *= 0.9; // Decay confidence
        if (model.confidence < 0.1) {
          this.topicModels.delete(topicKey);
        }
      }
    }

    // Clean old LLM cache
    for (const [digest, cached] of this.llmCache.entries()) {
      if ((now - cached.timestamp) > this.llmCacheTTL) {
        this.llmCache.delete(digest);
      }
    }

    this.logger.info(`[STORYLINE-TRACKER] Models refreshed: ${this.topicModels.size} topic models, ${this.activeStorylines.size} active storylines`);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeStorylines: this.activeStorylines.size,
      topicModels: this.topicModels.size,
      llmCacheSize: this.llmCache.size,
      llmCallsThisHour: this.llmCallHistory.filter(t => (Date.now() - t) < (60 * 60 * 1000)).length,
      totalLearnedPatterns: Array.from(this.topicModels.values()).reduce((sum, m) => sum + (m.patterns?.length || 0), 0)
    };
  }
}

module.exports = { StorylineTracker };