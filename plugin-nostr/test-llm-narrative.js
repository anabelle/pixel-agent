/**
 * Test LLM-Powered Narrative Analysis
 * 
 * This test demonstrates the new LLM narrative feature that analyzes
 * Nostr activity and generates compelling summaries with insights about
 * author relationships, emerging stories, and community dynamics.
 */

const { ContextAccumulator } = require('./lib/contextAccumulator');

// Mock runtime with LLM generation capability
const mockRuntime = {
  agentId: 'test-agent',
  
  // Mock LLM text generation
  generateText: async (prompt, options) => {
    console.log('\n🤖 LLM PROMPT SENT:\n', prompt.slice(0, 500) + '...\n');
    
    // Simulate LLM response with realistic narrative
    if (prompt.includes('HOURLY')) {
      return JSON.stringify({
        headline: "Bitcoin education surge as newcomers seek self-custody guidance",
        summary: "Bitcoin price excitement is driving newcomer questions about self-custody, with @alice7a3b emerging as the go-to expert for beginners. Meanwhile, @bob4f2e and @charlie9d1c are debating Lightning routing efficiency in a thread that's attracting technical contributors. The community vibe is energetic and educational, with experienced users actively helping newcomers understand the intersection of art and bitcoin payments.",
        insights: [
          "Self-custody questions spiked 3x compared to previous hours",
          "@alice7a3b replied to 8 different newcomers with patient explanations",
          "Technical debates remain constructive despite strong opinions"
        ],
        vibe: "electric",
        keyMoment: "A complete beginner successfully set up their first Lightning wallet and made their first zap",
        connections: [
          "@alice7a3b and @dave5e8a tag-teaming newcomer education",
          "@bob4f2e's technical threads attracting developers from outside usual circle"
        ]
      });
    } else {
      return JSON.stringify({
        headline: "From morning skepticism to evening breakthrough: Bitcoin education community finds its rhythm",
        summary: "The day began with scattered conversations but crystallized into a powerful narrative about Bitcoin education accessibility. Morning skepticism about self-custody complexity gave way to breakthrough moments as experienced users created impromptu tutorials. By evening, newcomers were helping each other, signaling the emergence of a self-sustaining learning community. The shift from expert-led instruction to peer teaching marked a qualitative change in community dynamics.",
        arc: "Morning: scattered → Afternoon: experts mobilize → Evening: peer teaching emerges",
        keyMoments: [
          "Mid-morning: @alice7a3b's comprehensive self-custody thread goes viral",
          "Afternoon: First newcomer creates tutorial for others",
          "Evening: Spontaneous AMA session with Lightning developers"
        ],
        communities: [
          "Newcomers forming study groups across timezones",
          "Technical experts creating informal mentorship network"
        ],
        insights: [
          "Peer teaching accelerated learning 2x compared to expert lectures",
          "Visual learners dominated (70% of tutorial requests were for diagrams)",
          "Community shifted from Q&A pattern to collaborative problem-solving"
        ],
        vibe: "breakthrough energy",
        tomorrow: "Watch for newcomers teaching advanced concepts they just learned - the teaching cycle is accelerating"
      });
    }
  },
  
  createMemory: async (memory) => {
    console.log(`\n💾 Memory stored: ${memory.content.type}`);
  },
  
  createUniqueUuid: (rt, seed) => `${seed}:${Date.now()}:test`,
  
  getSetting: (key) => {
    if (key === 'NOSTR_CONTEXT_LLM_ANALYSIS') return 'true';
    return null;
  }
};

const mockLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

// Sample events simulating an hour of Bitcoin/self-custody discussion
const now = Date.now();
const currentHourStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
const previousHourStart = currentHourStart - (60 * 60 * 1000);

const sampleEvents = [
  {
    id: 'event1',
    pubkey: 'alice7a3b12f4e9d6c8a5',
    content: "Self-custody isn't as scary as people think. Here's my beginner's guide to getting started with Bitcoin...",
    created_at: Math.floor((previousHourStart + 300000) / 1000), // timestamps in seconds
    tags: []
  },
  {
    id: 'event2',
    pubkey: 'bob4f2e9d1c7a8b3e5f',
    content: "Lightning routing efficiency debate: Channel balancing strategies are more important than raw liquidity. Thoughts?",
    created_at: Math.floor((previousHourStart + 600000) / 1000),
    tags: []
  },
  {
    id: 'event3',
    pubkey: 'charlie9d1c5e8a3f7b2d',
    content: "I disagree @bob. Liquidity is king. You can't route what you don't have. Balance comes second.",
    created_at: Math.floor((previousHourStart + 900000) / 1000),
    tags: []
  },
  {
    id: 'event4',
    pubkey: 'newbie1a2b3c4d5e6f',
    content: "Just set up my first Lightning wallet thanks to @alice's guide! Made my first zap! 🎉⚡",
    created_at: Math.floor((previousHourStart + 1200000) / 1000),
    tags: []
  },
  {
    id: 'event5',
    pubkey: 'alice7a3b12f4e9d6c8a5',
    content: "That's awesome @newbie! Welcome to the Lightning network. Feel free to ask questions anytime.",
    created_at: Math.floor((previousHourStart + 1500000) / 1000),
    tags: []
  },
  {
    id: 'event6',
    pubkey: 'dave5e8a7b9c2d4f6e',
    content: "@alice does a great job teaching self-custody. I always point newcomers to her threads.",
    created_at: Math.floor((previousHourStart + 1800000) / 1000),
    tags: []
  },
  {
    id: 'event7',
    pubkey: 'newbie2f5e8a3c7d9b',
    content: "Can someone explain the difference between hot and cold wallets? Trying to understand security...",
    created_at: Math.floor((previousHourStart + 2100000) / 1000),
    tags: []
  },
  {
    id: 'event8',
    pubkey: 'alice7a3b12f4e9d6c8a5',
    content: "Great question! Hot wallets are connected to the internet (convenient but less secure). Cold wallets are offline (more secure but less convenient). Think of it like cash in your pocket vs cash in a safe...",
    created_at: Math.floor((previousHourStart + 2400000) / 1000),
    tags: []
  },
  {
    id: 'event9',
    pubkey: 'artist3b7d9f2e5c8a',
    content: "Just sold my first piece of art for Bitcoin! The intersection of creativity and self-custody is beautiful.",
    created_at: Math.floor((previousHourStart + 2700000) / 1000),
    tags: []
  },
  {
    id: 'event10',
    pubkey: 'dev7c9e5a3f8b2d4',
    content: "@bob Your channel balancing thread is gold. We're implementing some of these strategies in our routing node.",
    created_at: Math.floor((previousHourStart + 3000000) / 1000),
    tags: []
  }
];

async function runTest() {
  console.log('='.repeat(80));
  console.log('🧪 Testing LLM-Powered Narrative Analysis');
  console.log('='.repeat(80));
  
  // Create context accumulator with LLM analysis enabled
  const accumulator = new ContextAccumulator(mockRuntime, mockLogger, {
    llmAnalysis: true,  // Enable LLM narrative generation
    hourlyDigest: true,
    dailyReport: true
  });
  
  accumulator.enable();
  
  console.log('\n📥 Processing sample events into PREVIOUS hour...\n');
  
  // Process all events (they're already in previous hour)
  for (const event of sampleEvents) {
    await accumulator.processEvent(event);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 HOURLY DIGEST WITH LLM NARRATIVE');
  console.log('='.repeat(80));
  
  // Generate hourly digest with LLM narrative
  const hourlyDigest = await accumulator.generateHourlyDigest();
  
  if (hourlyDigest) {
    console.log('\n📈 STRUCTURED METRICS:');
    console.log('- Events:', hourlyDigest.metrics.events);
    console.log('- Active users:', hourlyDigest.metrics.activeUsers);
    console.log('- Top topics:', hourlyDigest.metrics.topTopics.map(t => `${t.topic}(${t.count})`).join(', '));
    console.log('- Sentiment:', 
      `${hourlyDigest.metrics.sentiment.positive} positive, ` +
      `${hourlyDigest.metrics.sentiment.neutral} neutral, ` +
      `${hourlyDigest.metrics.sentiment.negative} negative`
    );
    
    if (hourlyDigest.narrative) {
      console.log('\n' + '─'.repeat(80));
      console.log('🎭 LLM-GENERATED NARRATIVE:');
      console.log('─'.repeat(80));
      console.log('\n📌 HEADLINE:');
      console.log(hourlyDigest.narrative.headline);
      console.log('\n📖 SUMMARY:');
      console.log(hourlyDigest.narrative.summary);
      console.log('\n💡 INSIGHTS:');
      hourlyDigest.narrative.insights.forEach((insight, i) => {
        console.log(`${i + 1}. ${insight}`);
      });
      console.log('\n✨ VIBE:', hourlyDigest.narrative.vibe);
      console.log('\n🎯 KEY MOMENT:');
      console.log(hourlyDigest.narrative.keyMoment);
      console.log('\n🤝 CONNECTIONS:');
      hourlyDigest.narrative.connections.forEach((conn, i) => {
        console.log(`${i + 1}. ${conn}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📰 DAILY REPORT WITH LLM NARRATIVE');
  console.log('='.repeat(80));
  
  // Generate daily report with LLM narrative
  const dailyReport = await accumulator.generateDailyReport();
  
  if (dailyReport) {
    console.log('\n📈 STRUCTURED SUMMARY:');
    console.log('- Total events:', dailyReport.summary.totalEvents);
    console.log('- Active users:', dailyReport.summary.activeUsers);
    console.log('- Events per user:', dailyReport.summary.eventsPerUser);
    console.log('- Top topics:', dailyReport.summary.topTopics.slice(0, 5).map(t => `${t.topic}(${t.count})`).join(', '));
    
    if (dailyReport.narrative) {
      console.log('\n' + '─'.repeat(80));
      console.log('🎭 LLM-GENERATED DAILY NARRATIVE:');
      console.log('─'.repeat(80));
      console.log('\n📌 HEADLINE:');
      console.log(dailyReport.narrative.headline);
      console.log('\n📖 SUMMARY:');
      console.log(dailyReport.narrative.summary);
      console.log('\n📊 ARC OF THE DAY:');
      console.log(dailyReport.narrative.arc);
      console.log('\n🌟 KEY MOMENTS:');
      dailyReport.narrative.keyMoments.forEach((moment, i) => {
        console.log(`${i + 1}. ${moment}`);
      });
      console.log('\n👥 COMMUNITIES:');
      dailyReport.narrative.communities.forEach((comm, i) => {
        console.log(`${i + 1}. ${comm}`);
      });
      console.log('\n💡 INSIGHTS:');
      dailyReport.narrative.insights.forEach((insight, i) => {
        console.log(`${i + 1}. ${insight}`);
      });
      console.log('\n✨ VIBE:', dailyReport.narrative.vibe);
      console.log('\n🔮 TOMORROW:');
      console.log(dailyReport.narrative.tomorrow);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Test Complete!');
  console.log('='.repeat(80));
  console.log('\nThe system now generates:');
  console.log('1. ✅ Structured metrics (counts, topics, sentiment)');
  console.log('2. ✅ LLM-powered narratives (stories, insights, relationships)');
  console.log('3. ✅ Natural language summaries (compelling prose)');
  console.log('4. ✅ Community intelligence (who, what, why)');
  console.log('\n🎉 Your agent can now truly understand and articulate what\'s happening!');
  console.log('='.repeat(80));
}

// Run the test
runTest().catch(console.error);
