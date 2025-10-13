#!/usr/bin/env node

// Example script demonstrating Topic Evolution tracking
// This shows how the feature works without requiring full ElizaOS setup

const { TopicEvolutionTracker, PHASE_TAXONOMY } = require('./lib/topicEvolution');
const { NarrativeMemory } = require('./lib/narrativeMemory');

// Mock runtime with generateText
const mockRuntime = {
  generateText: async (prompt, options) => {
    // Simple mock: extract keywords from content
    const contentMatch = prompt.match(/Content: "([^"]+)"/);
    if (!contentMatch) return 'general discussion';
    
    const content = contentMatch[1].toLowerCase();
    
    // Mock subtopic labeling
    if (content.includes('price') || content.includes('volatility')) return 'price volatility';
    if (content.includes('etf') || content.includes('approval')) return 'ETF approval';
    if (content.includes('adoption') || content.includes('mainstream')) return 'mainstream adoption';
    if (content.includes('mining') || content.includes('hashrate')) return 'mining activity';
    if (content.includes('regulation') || content.includes('sec')) return 'regulatory news';
    
    return 'general discussion';
  }
};

const mockLogger = {
  info: console.log,
  debug: () => {}, // Silent debug
  warn: console.warn,
  error: console.error
};

// Mock semantic analyzer
const mockSemanticAnalyzer = {
  llmSemanticEnabled: true,
  labelSubtopic: async (topic, content) => {
    return mockRuntime.generateText(`Label the specific angle for "${topic}":\n"${content}"`);
  }
};

async function demonstrateTopicEvolution() {
  console.log('=== Topic Evolution Tracking Demo ===\n');

  // Initialize components
  const narrativeMemory = new NarrativeMemory(mockRuntime, mockLogger);
  const tracker = new TopicEvolutionTracker(
    mockRuntime,
    narrativeMemory,
    mockSemanticAnalyzer,
    mockLogger
  );

  console.log('✓ Initialized TopicEvolutionTracker\n');

  // Demonstrate phase taxonomy
  console.log('Phase Taxonomy:');
  for (const [phase, data] of Object.entries(PHASE_TAXONOMY)) {
    console.log(`  ${phase}: ${data.description}`);
  }
  console.log();

  // Simulate a sequence of events about Bitcoin
  const events = [
    {
      topic: 'bitcoin',
      content: 'Rumor has it that Bitcoin ETF might be approved soon',
      expectedPhase: 'speculation'
    },
    {
      topic: 'bitcoin',
      content: 'Official announcement: Bitcoin ETF approved by SEC',
      expectedPhase: 'announcement'
    },
    {
      topic: 'bitcoin',
      content: 'Deep technical analysis of Bitcoin network hashrate and mining difficulty',
      expectedPhase: 'analysis'
    },
    {
      topic: 'bitcoin',
      content: 'Major retailers now accepting Bitcoin as mainstream payment method',
      expectedPhase: 'adoption'
    },
    {
      topic: 'bitcoin',
      content: 'Bitcoin price volatility causes concern among investors',
      expectedPhase: 'speculation'
    }
  ];

  console.log('Analyzing event sequence:\n');

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    console.log(`Event ${i + 1}: "${event.content.slice(0, 60)}..."`);
    
    const result = await tracker.analyzeEvolution(
      event.topic,
      event.content,
      { trending: ['bitcoin'], watchlist: [] }
    );

    console.log(`  Subtopic: ${result.subtopic}`);
    console.log(`  Phase: ${result.phase} (expected: ${event.expectedPhase})`);
    console.log(`  Novel Angle: ${result.isNovelAngle ? 'YES' : 'NO'}`);
    console.log(`  Phase Change: ${result.isPhaseChange ? 'YES' : 'NO'}`);
    console.log(`  Evolution Score: ${result.evolutionScore.toFixed(2)}`);
    console.log(`  Signals: ${result.signals.join(', ')}`);
    console.log();
  }

  // Show cluster state
  const cluster = narrativeMemory.getTopicCluster('bitcoin');
  console.log('Final cluster state for "bitcoin":');
  console.log(`  Unique subtopics: ${cluster.subtopics.size}`);
  console.log(`  Total entries: ${cluster.entries.length}`);
  console.log(`  Current phase: ${cluster.lastPhase}`);
  console.log(`  Subtopics: ${Array.from(cluster.subtopics).join(', ')}`);
  console.log();

  // Demonstrate evolution query
  console.log('Topic evolution summary:');
  const evolution = await narrativeMemory.getTopicEvolution('bitcoin', 30);
  console.log(`  Topic: ${evolution.topic}`);
  console.log(`  Subtopic count: ${evolution.subtopicCount}`);
  console.log(`  Current phase: ${evolution.currentPhase}`);
  if (evolution.subtopics.length > 0) {
    console.log('  Top subtopics:');
    evolution.subtopics.forEach(s => {
      console.log(`    - ${s.subtopic} (${s.count} mentions)`);
    });
  }
  console.log();

  // Show tracker stats
  const stats = tracker.getStats();
  console.log('Tracker statistics:');
  console.log(`  Cache size: ${stats.cacheSize}`);
  console.log(`  LLM enabled: ${stats.llmEnabled}`);
  console.log(`  Weights: novelty=${stats.weights.novelty}, phase=${stats.weights.phaseChange}, recency=${stats.weights.recency}`);
  console.log();

  console.log('=== Demo Complete ===');
}

// Run the demo
demonstrateTopicEvolution().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
