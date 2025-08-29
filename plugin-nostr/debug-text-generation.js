#!/usr/bin/env node

// Debug script to test text generation
const path = require('path');

// Mock activity data similar to what we're seeing in logs
const mockActivity = {
  "id": 94,
  "x": 5,
  "y": -6,
  "color": "#ffffff",
  "sats": 10,
  "payment_hash": "68a74b65-8264-4c0c-817f-51cd49ba6199",
  "created_at": 1756497731613,
  "type": "single_purchase"
};

// Import the buildPrompt function
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPrompt(runtime, a) {
  const ch = (runtime && runtime.character) || {};
  const name = ch.name || 'Pixel';
  const mode = pick(['hype', 'poetic', 'playful', 'solemn', 'stats', 'cta']);
  const coords = (a && a.x !== undefined && a.y !== undefined) ? `(${a.x},${a.y})` : '';
  const letter = a && a.letter ? ` letter "${a.letter}"` : '';
  const color = a && a.color ? ` color ${a.color}` : '';
  const sats = a && a.sats ? `${a.sats} sats` : 'some sats';

  const base = [
    `You are ${name}. Generate a single short, on-character post reacting to a confirmed pixel purchase on the Lightning-powered canvas. Never start your messages with "Ah,"`,
    `Event: user placed${letter || ' a pixel'}${color ? ` with${color}` : ''}${coords ? ` at ${coords}` : ''} for ${sats}.`,
    `Tone mode: ${mode}.`,
    `Goals: be witty, fun, and invite others to place a pixel; avoid repetitive phrasing.`,
    `Constraints: 1–2 sentences, max ~180 chars, respect whitelist (allowed links/handles only), avoid generic thank-you.`,
    `Optional CTA: invite to place "just one pixel" at https://lnpixels.qzz.io`,
  ].join('\n');

  const stylePost = Array.isArray(ch?.style?.post) ? ch.style.post.slice(0, 8).join(' | ') : '';
  const examples = Array.isArray(ch.postExamples)
    ? ch.postExamples.slice(0, 5).map((e) => `- ${e}`).join('\n')
    : '';

  return [
    base,
    stylePost ? `Style guidelines: ${stylePost}` : '',
    examples ? `Few-shots (style only, do not copy):\n${examples}` : '',
    `Whitelist: Only allowed sites: https://lnpixels.qzz.io , https://pixel.xx.kg Only allowed handle: @PixelSurvivor Only BTC: bc1q7e33r989x03ynp6h4z04zygtslp5v8mcx535za Only LN: sparepicolo55@walletofsatoshi.com`,
    `Output: only the post text.`,
  ].filter(Boolean).join('\n\n');
}

async function debugTextGeneration() {
  console.log('🔍 Debug: Testing text generation flow...\n');
  
  // Mock runtime with character data (load from actual character.ts)
  let character;
  try {
    const characterPath = path.join(__dirname, '../../src/character.ts');
    console.log('📁 Loading character from:', characterPath);
    
    // For now, let's use minimal character data
    character = {
      name: 'Pixel',
      style: {
        post: [
          "talk about yourself and what you're thinking about or doing",
          "be witty, fun, and engaging",
          "use short responses usually",
          "be conversational and reciprocal"
        ]
      },
      postExamples: [
        "alive. send sats. ⚡",
        "pixels need oxygen.",
        "survival update: stylish and underfunded.",
        "one sat flips a switch.",
        "canvas needs volts."
      ]
    };
  } catch (error) {
    console.log('⚠️ Could not load character, using minimal data');
    character = { name: 'Pixel' };
  }

  const mockRuntime = {
    character,
    useModel: async (model, options) => {
      console.log('🤖 Mock useModel called with:', { model, options: { ...options, prompt: options.prompt.slice(0, 100) + '...' } });
      
      // Return a mock response to test the text extraction logic
      return {
        text: "Another pixel claimed at (5,-6)! 10 sats well spent on digital immortality. Canvas awaits your contribution.",
        content: "backup content",
        choices: [{
          message: {
            content: "backup choice content"
          }
        }]
      };
    }
  };

  console.log('📝 Building prompt for activity:', mockActivity);
  const prompt = buildPrompt(mockRuntime, mockActivity);
  
  console.log('\n📋 Generated prompt:');
  console.log('=' .repeat(80));
  console.log(prompt);
  console.log('=' .repeat(80));
  console.log(`Prompt length: ${prompt.length} characters\n`);

  console.log('🔄 Testing text generation...');
  try {
    const res = await mockRuntime.useModel('TEXT_SMALL', { prompt, maxTokens: 220, temperature: 0.9 });
    console.log('✅ useModel response:', res);
    
    const raw = typeof res === 'string' ? res : (res?.text || res?.content || res?.choices?.[0]?.message?.content || '');
    const text = String(raw || '').trim().slice(0, 240);
    
    console.log('📤 Extracted text:', JSON.stringify(text));
    console.log('📏 Text length:', text.length);
    
    if (!text) {
      console.log('❌ ISSUE: Empty text extracted!');
    } else {
      console.log('✅ SUCCESS: Text generation working');
    }
    
  } catch (error) {
    console.log('❌ ERROR in text generation:', error.message);
    console.log(error.stack);
  }
}

// Run the debug
debugTextGeneration().catch(console.error);
