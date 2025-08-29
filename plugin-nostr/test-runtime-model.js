#!/usr/bin/env node

// Minimal test to check if useModel works at all in the ElizaOS runtime
console.log('🧪 Testing ElizaOS runtime.useModel directly...\n');

async function testRuntimeModel() {
  try {
    // Try to import and initialize the ElizaOS runtime
    const { Runtime } = require('@elizaos/core');
    
    console.log('✅ Successfully imported ElizaOS Runtime');
    
    // Try basic text generation
    const simplePrompt = "Generate a short creative message about pixels. Be witty and brief.";
    
    console.log('📝 Testing with simple prompt:', simplePrompt);
    
    // This would require proper ElizaOS setup, but let's see what happens
    console.log('ℹ️  Note: This test requires a properly initialized ElizaOS runtime with configured models.');
    console.log('ℹ️  In production, runtime.useModel should be available when the plugin is loaded.');
    
  } catch (error) {
    console.log('❌ Could not import ElizaOS Runtime:', error.message);
    console.log('ℹ️  This is expected if ElizaOS is not fully initialized');
  }
  
  console.log('\n🔍 Checking environment variables:');
  console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('GOOGLE_GENERATIVE_AI_API_KEY:', process.env.GOOGLE_GENERATIVE_AI_API_KEY ? '✅ Set' : '❌ Missing');
  
  console.log('\n🤔 Possible issues:');
  console.log('1. No API keys configured for LLM models');
  console.log('2. ElizaOS runtime not properly initialized when plugin loads');
  console.log('3. Model name "TEXT_SMALL" not recognized by the runtime');
  console.log('4. Network/API issues with the model provider');
  
  console.log('\n💡 Next steps:');
  console.log('1. Check agent startup logs for model initialization');
  console.log('2. Verify API keys are set in environment');
  console.log('3. Test with a simpler prompt to rule out prompt issues');
  console.log('4. Try different model names (TEXT, OPENROUTER_SMALL_MODEL, etc.)');
}

testRuntimeModel().catch(console.error);
