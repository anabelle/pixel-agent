#!/usr/bin/env node

/**
 * Debug Script for Storyline Tracker
 *
 * Batch analysis tool for testing storyline progression detection.
 * Processes sample posts and validates hybrid rule-based/LLM detection.
 */

const fs = require('fs');
const path = require('path');

// Import required modules
const { StorylineTracker } = require('./storylineTracker');

// Sample test data - posts representing different storyline phases
const SAMPLE_POSTS = [
  // Regulatory phase examples
  {
    id: 'regulatory-1',
    content: 'New SEC regulations on crypto trading platforms will require enhanced KYC procedures and compliance reporting.',
    topic: 'crypto-regulation',
    expectedPhase: 'regulatory',
    expectedType: 'emergence'
  },
  {
    id: 'regulatory-2',
    content: 'Bitcoin ETF approval marks a major milestone in regulatory acceptance of digital assets.',
    topic: 'bitcoin-regulation',
    expectedPhase: 'regulatory',
    expectedType: 'progression'
  },

  // Technical phase examples
  {
    id: 'technical-1',
    content: 'Lightning Network upgrade enables instant micropayments with reduced fees and improved scalability.',
    topic: 'lightning-network',
    expectedPhase: 'technical',
    expectedType: 'progression'
  },
  {
    id: 'technical-2',
    content: 'New consensus algorithm reduces block time to 10 seconds while maintaining security guarantees.',
    topic: 'blockchain-consensus',
    expectedPhase: 'technical',
    expectedType: 'emergence'
  },

  // Market phase examples
  {
    id: 'market-1',
    content: 'Bitcoin price surges 15% following positive institutional adoption news and ETF inflows.',
    topic: 'bitcoin-price',
    expectedPhase: 'market',
    expectedType: 'progression'
  },
  {
    id: 'market-2',
    content: 'DeFi protocol TVL reaches new all-time high as yield farming strategies attract retail investors.',
    topic: 'defi-adoption',
    expectedPhase: 'market',
    expectedType: 'emergence'
  },

  // Community phase examples
  {
    id: 'community-1',
    content: 'Community governance vote passes with 85% approval, implementing requested feature upgrades.',
    topic: 'dao-governance',
    expectedPhase: 'community',
    expectedType: 'progression'
  },
  {
    id: 'community-2',
    content: 'Open source project gains 500 new contributors this month, expanding developer ecosystem.',
    topic: 'open-source-growth',
    expectedPhase: 'community',
    expectedType: 'emergence'
  },

  // Unknown/unclear examples
  {
    id: 'unknown-1',
    content: 'Just bought some groceries and the weather is nice today.',
    topic: 'random',
    expectedPhase: null,
    expectedType: 'unknown'
  },
  {
    id: 'unknown-2',
    content: 'Pizza toppings discussion - pineapple belongs on pizza, fight me.',
    topic: 'food-debate',
    expectedPhase: null,
    expectedType: 'unknown'
  }
];

class StorylineTrackerDebugger {
  constructor(options = {}) {
    this.options = {
      enableLLM: options.enableLLM !== false,
      batchSize: options.batchSize || 5,
      delayMs: options.delayMs || 1000,
      outputFile: options.outputFile || 'storyline-debug-results.json',
      ...options
    };

    // Create a mock runtime object for debug mode
    const mockRuntime = {
      getSetting: (key) => {
        if (key === 'NARRATIVE_LLM_ENABLE') return this.options.enableLLM ? 'true' : 'false';
        if (key === 'NARRATIVE_LLM_MODEL') return 'gpt-3.5-turbo';
        return null;
      },
      generateText: async (prompt, options) => {
        // Mock LLM response for debugging
        return JSON.stringify({
          type: 'unknown',
          phase: null,
          confidence: 0.5,
          rationale: 'Mock response',
          pattern: 'unknown'
        });
      }
    };
    
    this.tracker = new StorylineTracker(mockRuntime, console);

    this.results = [];
  }

  async runAnalysis() {
    console.log('🔍 Starting Storyline Tracker Debug Analysis');
    console.log(`📊 Processing ${SAMPLE_POSTS.length} sample posts`);
    console.log(`🤖 LLM ${this.options.enableLLM ? 'ENABLED' : 'DISABLED'}`);
    console.log('');

    const batches = this._createBatches(SAMPLE_POSTS, this.options.batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} posts)`);

      for (const post of batch) {
        await this._analyzePost(post);
        if (this.options.delayMs > 0) {
          await this._delay(this.options.delayMs);
        }
      }
    }

    await this._generateReport();
  }

  async _analyzePost(post) {
    console.log(`\n🔎 Analyzing post: ${post.id}`);
    console.log(`📝 Content: "${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}"`);
    console.log(`🏷️  Topic: ${post.topic}`);

    try {
      const startTime = Date.now();
      const events = await this.tracker.analyzePost(
        post.content,
        [post.topic],
        Date.now(),
        { id: post.id }
      );
      const result = events[0] || { type: 'unknown', confidence: 0 };
      const duration = Date.now() - startTime;

      const analysis = {
        postId: post.id,
        topic: post.topic,
        content: post.content,
        expectedPhase: post.expectedPhase,
        expectedType: post.expectedType,
        detectedType: result.type,
        detectedPhase: result.newPhase || result.phase,
        confidence: result.confidence,
        reasoning: result.evidence?.llm?.rationale || '',
        processingTime: duration,
        detectionMethod: result.evidence?.llm ? 'llm' : 'rules',
        timestamp: new Date().toISOString()
      };

      this.results.push(analysis);

      // Display results
      console.log(`✅ Result: ${result.type} (${result.confidence.toFixed(2)} confidence)`);
      if (result.newPhase) {
        console.log(`🏷️  Phase: ${result.newPhase}`);
      }
      console.log(`⏱️  Processing: ${duration}ms`);
      console.log(`🧠 Method: ${analysis.detectionMethod}`);

      if (analysis.reasoning) {
        console.log(`💭 Reasoning: ${analysis.reasoning}`);
      }

      // Accuracy check
      const typeMatch = result.type === post.expectedType;
      const phaseMatch = result.newPhase === post.expectedPhase || (!result.newPhase && !post.expectedPhase);

      console.log(`🎯 Accuracy: Type=${typeMatch ? '✅' : '❌'}, Phase=${phaseMatch ? '✅' : '❌'}`);

    } catch (error) {
      console.error(`❌ Error analyzing post ${post.id}:`, error.message);

      this.results.push({
        postId: post.id,
        topic: post.topic,
        content: post.content,
        expectedPhase: post.expectedPhase,
        expectedType: post.expectedType,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async _generateReport() {
    console.log('\n📊 Generating Analysis Report');

    const stats = this._calculateStats();
    const report = {
      timestamp: new Date().toISOString(),
      configuration: {
        enableLLM: this.options.enableLLM,
        totalPosts: SAMPLE_POSTS.length,
        processedPosts: this.results.length
      },
      statistics: stats,
      results: this.results,
      trackerStats: this.tracker.getStats()
    };

    // Save to file
    try {
      fs.writeFileSync(this.options.outputFile, JSON.stringify(report, null, 2));
      console.log(`💾 Results saved to: ${this.options.outputFile}`);
    } catch (error) {
      console.error('❌ Failed to save results:', error.message);
    }

    // Display summary
    console.log('\n📈 Summary:');
    console.log(`Total Posts: ${stats.totalPosts}`);
    console.log(`Processed: ${stats.processedPosts}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Type Accuracy: ${(stats.typeAccuracy * 100).toFixed(1)}%`);
    console.log(`Phase Accuracy: ${(stats.phaseAccuracy * 100).toFixed(1)}%`);
    console.log(`Average Confidence: ${stats.avgConfidence.toFixed(3)}`);
    console.log(`Average Processing Time: ${stats.avgProcessingTime.toFixed(0)}ms`);

    console.log('\n🔍 Detection Method Breakdown:');
    for (const [method, count] of Object.entries(stats.methodBreakdown)) {
      console.log(`  ${method}: ${count} posts`);
    }

    console.log('\n🏷️ Phase Distribution:');
    for (const [phase, count] of Object.entries(stats.phaseDistribution)) {
      console.log(`  ${phase}: ${count} posts`);
    }

    console.log('\n🤖 Tracker Stats:');
    console.log(`  LLM Calls (This Hour): ${report.trackerStats.llmCallsThisHour}`);
    console.log(`  LLM Cache Size: ${report.trackerStats.llmCacheSize}`);
    console.log(`  Active Storylines: ${report.trackerStats.activeStorylines}`);
    console.log(`  Topic Models: ${report.trackerStats.topicModels}`);
    console.log(`  Total Learned Patterns: ${report.trackerStats.totalLearnedPatterns}`);
  }

  _calculateStats() {
    const validResults = this.results.filter(r => !r.error);
    const stats = {
      totalPosts: SAMPLE_POSTS.length,
      processedPosts: this.results.length,
      errors: this.results.filter(r => r.error).length,
      typeAccuracy: 0,
      phaseAccuracy: 0,
      avgConfidence: 0,
      avgProcessingTime: 0,
      methodBreakdown: {},
      phaseDistribution: {}
    };

    if (validResults.length === 0) return stats;

    let typeCorrect = 0;
    let phaseCorrect = 0;
    let totalConfidence = 0;
    let totalTime = 0;

    for (const result of validResults) {
      // Type accuracy
      if (result.detectedType === result.expectedType) {
        typeCorrect++;
      }

      // Phase accuracy
      if (result.detectedPhase === result.expectedPhase ||
          (!result.detectedPhase && !result.expectedPhase)) {
        phaseCorrect++;
      }

      // Accumulate metrics
      totalConfidence += result.confidence || 0;
      totalTime += result.processingTime || 0;

      // Method breakdown
      const method = result.detectionMethod || 'unknown';
      stats.methodBreakdown[method] = (stats.methodBreakdown[method] || 0) + 1;

      // Phase distribution
      const phase = result.detectedPhase || 'unknown';
      stats.phaseDistribution[phase] = (stats.phaseDistribution[phase] || 0) + 1;
    }

    stats.typeAccuracy = typeCorrect / validResults.length;
    stats.phaseAccuracy = phaseCorrect / validResults.length;
    stats.avgConfidence = totalConfidence / validResults.length;
    stats.avgProcessingTime = totalTime / validResults.length;

    return stats;
  }

  _createBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-llm':
        options.enableLLM = false;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]) || 5;
        break;
      case '--delay':
        options.delayMs = parseInt(args[++i]) || 1000;
        break;
      case '--output':
        options.outputFile = args[++i] || 'storyline-debug-results.json';
        break;
      case '--help':
        console.log('Usage: node debug-storyline-tracker.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --no-llm          Disable LLM detection (rule-based only)');
        console.log('  --batch-size <n>  Process posts in batches of n (default: 5)');
        console.log('  --delay <ms>      Delay between posts in ms (default: 1000)');
        console.log('  --output <file>   Output file for results (default: storyline-debug-results.json)');
        console.log('  --help            Show this help message');
        process.exit(0);
    }
  }

  try {
    const storylineDebugger = new StorylineTrackerDebugger(options);
    await storylineDebugger.runAnalysis();
    console.log('\n✅ Debug analysis completed successfully!');
  } catch (error) {
    console.error('\n❌ Debug analysis failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { StorylineTrackerDebugger };