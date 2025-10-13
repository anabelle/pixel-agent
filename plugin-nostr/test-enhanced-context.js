const { NarrativeMemory } = require('./lib/narrativeMemory');

// Mock runtime and logger
const mockRuntime = {
  getMemories: async () => [],
  createMemory: async () => true,
  createUniqueUuid: () => `test-${Date.now()}`,
  agentId: 'test-agent'
};

const mockLogger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`)
};

async function testEnhancedContext() {
  console.log('=== Testing Enhanced Timeline Lore Context ===\n');
  
  const nm = new NarrativeMemory(mockRuntime, mockLogger);
  
  // Add sample digest entries
  const sampleDigests = [
    {
      headline: "Nostr Community Debates AI Integration and On-Chain KYC",
      tags: ["AI", "KYC", "DeFi", "regulation"],
      priority: "high",
      narrative: "Government proposals for on-chain KYC are advancing faster than expected, with Senate Democrats suggesting broad Treasury powers to regulate non-custodial services and mandate KYC procedures.",
      insights: ["Community sees this as threat to privacy", "DeFi sector concerned about regulatory overreach"],
      evolutionSignal: "Building on previous privacy vs security debates",
      watchlist: ["Senate DeFi regulation proposals", "KYC implementation timelines"]
    },
    {
      headline: "Bitcoin Trading Volume Spikes Across Exchanges",
      tags: ["bitcoin", "trading", "volume", "exchanges"],
      priority: "high",
      narrative: "Bitcoin trading volume has seen significant increases across major exchanges, indicating growing institutional interest and market activity.",
      insights: ["Institutional adoption accelerating", "Market volatility increasing"],
      evolutionSignal: "Continuing trend of growing Bitcoin mainstream acceptance",
      watchlist: ["Institutional inflow patterns", "Exchange capacity metrics"]
    }
  ];
  
  // Add digests to memory
  sampleDigests.forEach(digest => {
    nm.timelineLore.push({
      ...digest,
      timestamp: Date.now() - (sampleDigests.indexOf(digest) * 24 * 60 * 60 * 1000), // Different timestamps
      type: 'timeline'
    });
  });
  
  console.log('1. Sample digests added to memory\n');
  
  // Test enhanced getRecentDigestSummaries
  console.log('2. Testing enhanced getRecentDigestSummaries...\n');
  const recentContext = nm.getRecentDigestSummaries(3);
  
  console.log(`Retrieved ${recentContext.length} context entries:\n`);
  
  recentContext.forEach((context, index) => {
    console.log(`Entry ${index + 1}:`);
    console.log(`  Headline: ${context.headline}`);
    console.log(`  Tags: [${context.tags.join(', ')}]`);
    console.log(`  Priority: ${context.priority}`);
    console.log(`  Narrative: ${context.narrative}`);
    console.log(`  Insights: [${context.insights.join(', ')}]`);
    console.log(`  Evolution: ${context.evolutionSignal}`);
    console.log(`  Watchlist: [${context.watchlist.join(', ')}]`);
    console.log('');
  });
  
  // Test prompt formatting
  console.log('3. Testing prompt formatting...\n');
  const contextSection = recentContext.length ? 
    `RECENT NARRATIVE CONTEXT:\n${recentContext.map(c => 
      `- ${c.headline} [${c.tags.join(', ')}] (${c.priority})${c.narrative ? `\n  Narrative: ${c.narrative}` : ''}${c.insights && c.insights.length ? `\n  Insights: [${c.insights.join(', ')}]` : ''}${c.evolutionSignal ? `\n  Evolution: ${c.evolutionSignal}` : ''}${c.watchlist && c.watchlist.length ? `\n  Watchlist: [${c.watchlist.join(', ')}]` : ''}`
    ).join('\n')}\n\n` : '';
  
  console.log('Formatted context section:');
  console.log(contextSection);
  
  console.log('\n✅ Enhanced context format test completed successfully!');
}

testEnhancedContext().catch(console.error);