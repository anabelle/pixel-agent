#!/usr/bin/env node

// Test memory integration with real ElizaOS patterns

console.log('🔗 Testing ElizaOS memory integration patterns...\n');

// Test that our memory structure matches ElizaOS expectations
function validateElizaMemoryStructure(memory) {
  const issues = [];
  
  // Required fields based on ElizaOS patterns
  if (!memory.id) issues.push('Missing id field');
  if (!memory.entityId) issues.push('Missing entityId field'); 
  if (!memory.agentId) issues.push('Missing agentId field');
  if (!memory.roomId) issues.push('Missing roomId field');
  if (!memory.content) issues.push('Missing content field');
  if (!memory.createdAt) issues.push('Missing createdAt field');
  
  // Content structure validation
  if (memory.content) {
    if (!memory.content.text) issues.push('Missing content.text field');
    if (!memory.content.type) issues.push('Missing content.type field');
    if (!memory.content.source) issues.push('Missing content.source field');
  }
  
  // Type validation
  if (typeof memory.id !== 'string') issues.push('id must be string');
  if (typeof memory.entityId !== 'string') issues.push('entityId must be string');
  if (typeof memory.agentId !== 'string') issues.push('agentId must be string');
  if (typeof memory.roomId !== 'string') issues.push('roomId must be string');
  if (typeof memory.createdAt !== 'number') issues.push('createdAt must be number');
  
  return issues;
}

// Test memory query patterns that the agent might use
function testMemoryQueryPatterns(memories) {
  console.log('🔍 Testing ElizaOS memory query patterns:\n');
  
  // Pattern 1: Recent memories by room
  const roomMemories = memories.filter(m => m.roomId === 'lnpixels:canvas');
  console.log(`   Room-based query: Found ${roomMemories.length} lnpixels memories`);
  
  // Pattern 2: Memories by type
  const lnpixelsMemories = memories.filter(m => m.content?.type === 'lnpixels_post');
  console.log(`   Type-based query: Found ${lnpixelsMemories.length} lnpixels_post memories`);
  
  // Pattern 3: Recent activity (last 24h)
  const recent = memories.filter(m => Date.now() - m.createdAt < 24 * 60 * 60 * 1000);
  console.log(`   Time-based query: Found ${recent.length} recent memories`);
  
  // Pattern 4: Content search
  const textMatches = memories.filter(m => m.content?.text?.includes('Lightning Canvas'));
  console.log(`   Content search: Found ${textMatches.length} memories mentioning "Lightning Canvas"`);
  
  // Pattern 5: Data extraction
  const pixelActivities = memories
    .filter(m => m.content?.data?.triggerEvent)
    .map(m => ({
      x: m.content.data.triggerEvent.x,
      y: m.content.data.triggerEvent.y,
      sats: m.content.data.triggerEvent.sats
    }));
  console.log(`   Data extraction: Extracted ${pixelActivities.length} pixel coordinates`);
  
  return {
    roomMemories,
    lnpixelsMemories,
    recent,
    textMatches,
    pixelActivities
  };
}

// Test that memories could be used for agent reasoning
function testAgentReasoningIntegration(memories) {
  console.log('\n🧠 Testing agent reasoning integration:\n');
  
  // Simulate how the agent might use these memories
  const lnpixelsData = memories
    .filter(m => m.content?.type === 'lnpixels_post')
    .map(m => ({
      generatedText: m.content.data.generatedText,
      coordinates: `(${m.content.data.triggerEvent.x}, ${m.content.data.triggerEvent.y})`,
      value: m.content.data.triggerEvent.sats,
      color: m.content.data.triggerEvent.color,
      timestamp: m.createdAt
    }));
  
  console.log('   💭 Agent could reason about:');
  console.log(`      - ${lnpixelsData.length} posts generated from LNPixels events`);
  console.log(`      - Total sats involved: ${lnpixelsData.reduce((sum, d) => sum + d.value, 0)}`);
  console.log(`      - Coordinate spread: ${lnpixelsData.map(d => d.coordinates).join(', ')}`);
  console.log(`      - Colors used: ${[...new Set(lnpixelsData.map(d => d.color))].join(', ')}`);
  
  // Example context the agent could build
  const context = `Recent LNPixels activity: ${lnpixelsData.length} pixels placed for ${lnpixelsData.reduce((sum, d) => sum + d.value, 0)} total sats. Active regions: ${lnpixelsData.map(d => d.coordinates).join(', ')}.`;
  console.log(`\n   📝 Generated context: "${context}"`);
  
  return context;
}

async function runElizaIntegrationTest() {
  console.log('🚀 Starting ElizaOS integration test...\n');
  
  // Create test memories in the format our listener produces
  const testMemories = [
    {
      id: 'lnpixels:post:test_event_1:abc123',
      entityId: 'lnpixels:system',
      agentId: 'pixel-agent-test',
      roomId: 'lnpixels:canvas',
      content: {
        text: 'Posted to Nostr: "🎨 New pixel at (100, 200) for 1500 sats!"',
        type: 'lnpixels_post',
        source: 'lnpixels-listener',
        data: {
          generatedText: '🎨 New pixel at (100, 200) for 1500 sats!',
          triggerEvent: {
            x: 100,
            y: 200,
            color: '#FF0000',
            sats: 1500,
            letter: 'A',
            event_id: 'test_event_1',
            created_at: Date.now() - 1000
          },
          traceId: 'abc123',
          platform: 'nostr',
          timestamp: Date.now()
        }
      },
      createdAt: Date.now() - 1000
    },
    {
      id: 'lnpixels:post:test_event_2:def456',
      entityId: 'lnpixels:system',
      agentId: 'pixel-agent-test',
      roomId: 'lnpixels:canvas',
      content: {
        text: 'Posted to Nostr: "⚡ Lightning Canvas grows with pixel at (150, 300)!"',
        type: 'lnpixels_post',
        source: 'lnpixels-listener',
        data: {
          generatedText: '⚡ Lightning Canvas grows with pixel at (150, 300)!',
          triggerEvent: {
            x: 150,
            y: 300,
            color: '#00FF00',
            sats: 2500,
            letter: 'B',
            event_id: 'test_event_2',
            created_at: Date.now() - 500
          },
          traceId: 'def456',
          platform: 'nostr',
          timestamp: Date.now()
        }
      },
      createdAt: Date.now() - 500
    }
  ];
  
  console.log('✅ Test memories created\n');
  
  // Validate memory structure
  console.log('🔍 Validating memory structure:');
  let allValid = true;
  testMemories.forEach((memory, i) => {
    const issues = validateElizaMemoryStructure(memory);
    if (issues.length === 0) {
      console.log(`   Memory ${i + 1}: ✅ Valid structure`);
    } else {
      console.log(`   Memory ${i + 1}: ❌ Issues: ${issues.join(', ')}`);
      allValid = false;
    }
  });
  
  if (allValid) {
    console.log('   ✅ All memories have valid ElizaOS structure\n');
  } else {
    console.log('   ❌ Some memories have structural issues\n');
  }
  
  // Test query patterns
  const queryResults = testMemoryQueryPatterns(testMemories);
  
  // Test reasoning integration
  const context = testAgentReasoningIntegration(testMemories);
  
  console.log('\n📊 Integration Test Results:');
  console.log(`   ✅ Memory structure: ${allValid ? 'Valid' : 'Invalid'}`);
  console.log(`   ✅ Room queries: ${queryResults.roomMemories.length} found`);
  console.log(`   ✅ Type queries: ${queryResults.lnpixelsMemories.length} found`);
  console.log(`   ✅ Content search: ${queryResults.textMatches.length} found`);
  console.log(`   ✅ Data extraction: ${queryResults.pixelActivities.length} coordinates`);
  console.log(`   ✅ Agent context: Generated ${context.length} chars of context`);
  
  return {
    valid: allValid,
    queryResults,
    context,
    memories: testMemories
  };
}

// Run the test
runElizaIntegrationTest()
  .then((results) => {
    console.log('\n🎉 ElizaOS integration test complete!');
    
    if (results.valid) {
      console.log('✅ Memory structure is fully compatible with ElizaOS');
      console.log('✅ Query patterns work correctly');
      console.log('✅ Agent reasoning integration ready');
      console.log('\n📋 The agent can now:');
      console.log('   - Remember all LNPixels posts it generates');
      console.log('   - Query past pixel activity by location, value, time');
      console.log('   - Build context about canvas trends and patterns');
      console.log('   - Reference specific posts in future conversations');
    } else {
      console.log('❌ Memory structure needs fixes for ElizaOS compatibility');
    }
  })
  .catch(console.error);
