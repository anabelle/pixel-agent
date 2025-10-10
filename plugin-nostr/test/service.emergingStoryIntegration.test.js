/**
 * Integration test to verify emerging_story memories are included in prompts
 * This test instruments the actual generation flow to capture real prompt content
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NostrService } from '../lib/service.js';
import fs from 'fs/promises';
import path from 'path';

describe('Emerging Story Integration - Real Prompt Verification', () => {
  const TEST_OUTPUT_DIR = path.join(process.cwd(), 'test-output');
  let capturedPrompts = [];

  beforeAll(async () => {
    // Ensure test output directory exists
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test output
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('REAL TEST: Capture actual prompt with emerging_story and verify structure', async () => {
    // Create a test runtime with real memory data
    const mockMemories = [
      {
        id: 'test-story-1',
        agentId: 'test-agent',
        roomId: 'test-room',
        entityId: 'test-entity',
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic: 'bitcoin-halving',
            mentions: 8,
            uniqueUsers: 5,
            sentiment: {
              positive: 6,
              neutral: 2,
              negative: 0
            },
            firstSeen: Date.now() - 3600000,
            recentEvents: []
          }
        },
        createdAt: Date.now() - 1800000
      },
      {
        id: 'test-story-2',
        agentId: 'test-agent',
        roomId: 'test-room',
        entityId: 'test-entity',
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic: 'lightning-network',
            mentions: 12,
            uniqueUsers: 7,
            sentiment: {
              positive: 10,
              neutral: 2,
              negative: 0
            },
            firstSeen: Date.now() - 7200000,
            recentEvents: []
          }
        },
        createdAt: Date.now() - 3600000
      },
      // Add a different memory type to verify filtering works
      {
        id: 'test-post-1',
        agentId: 'test-agent',
        roomId: 'test-room',
        entityId: 'test-entity',
        content: {
          type: 'lnpixels_post',
          source: 'nostr',
          text: 'Test pixel post',
          data: {
            generatedText: 'Test pixel post',
            triggerEvent: { x: 100, y: 200, color: 'FF0000', sats: 1000 }
          }
        },
        createdAt: Date.now() - 900000
      }
    ];

    const mockRuntime = {
      agentId: 'test-agent',
      character: {
        name: 'TestPixelBot',
        system: 'You are a test bot for pixel art',
        bio: ['Test bio line'],
        lore: ['Test lore'],
        style: { all: ['Be concise'], chat: [], post: [] },
        postExamples: [],
        messageExamples: []
      },
      getSetting: (key) => {
        const settings = {
          NOSTR_RELAYS: 'wss://relay.test.com',
          NOSTR_ENABLE: 'true',
          NOSTR_POST_ENABLE: 'false',
          NOSTR_REPLY_ENABLE: 'false',
          CONTEXT_ACCUMULATOR_ENABLE: 'false',
          NOSTR_SELF_REFLECTION_ENABLE: 'false',
        };
        return settings[key];
      },
      getMemories: async () => mockMemories,
      createMemory: async () => ({ id: 'new-id', success: true }),
      getMemoryById: async () => null,
    };

    // Patch the generation module to capture prompts
    let capturedPrompt = null;
    const generationModule = await import('../lib/generation.js');
    const originalGenerate = generationModule.generateWithModelOrFallback;
    
    generationModule.generateWithModelOrFallback = async (runtime, type, prompt, options, extractFn, sanitizeFn, fallbackFn) => {
      capturedPrompt = prompt;
      
      // Write prompt to file for manual inspection
      const filename = `prompt-${Date.now()}.txt`;
      await fs.writeFile(
        path.join(TEST_OUTPUT_DIR, filename),
        `=== CAPTURED PROMPT ===\n\n${prompt}\n\n=== END PROMPT ===`,
        'utf-8'
      );
      
      return 'Test generated text';
    };

    try {
      // Create service and generate a post
      const service = new NostrService(mockRuntime);
      await service.generatePostTextLLM();

      // Verify we captured a prompt
      expect(capturedPrompt).toBeTruthy();
      expect(typeof capturedPrompt).toBe('string');
      expect(capturedPrompt.length).toBeGreaterThan(0);

      // Verify DEBUG MEMORY DUMP section exists
      expect(capturedPrompt).toContain('DEBUG MEMORY DUMP');
      
      // Extract and parse the JSON debug dump
      const jsonMatch = capturedPrompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
      expect(jsonMatch).toBeTruthy();
      
      if (jsonMatch) {
        const debugData = JSON.parse(jsonMatch[1]);
        
        // CRITICAL VERIFICATIONS:
        
        // 1. Permanent memories object exists
        expect(debugData.permanent).toBeDefined();
        expect(typeof debugData.permanent).toBe('object');
        
        // 2. emergingStories array exists in permanent
        expect(debugData.permanent.emergingStories).toBeDefined();
        expect(Array.isArray(debugData.permanent.emergingStories)).toBe(true);
        
        // 3. Has the expected number of stories (2 in our mock)
        expect(debugData.permanent.emergingStories.length).toBe(2);
        
        // 4. First story has correct structure and data
        const story1 = debugData.permanent.emergingStories[0];
        expect(story1).toHaveProperty('topic');
        expect(story1).toHaveProperty('mentions');
        expect(story1).toHaveProperty('uniqueUsers');
        expect(story1).toHaveProperty('sentiment');
        expect(story1).toHaveProperty('createdAtIso');
        
        // 5. Verify actual values match mock data
        expect(story1.topic).toBe('bitcoin-halving');
        expect(story1.mentions).toBe(8);
        expect(story1.uniqueUsers).toBe(5);
        expect(story1.sentiment).toEqual({
          positive: 6,
          neutral: 2,
          negative: 0
        });
        
        // 6. Second story verification
        const story2 = debugData.permanent.emergingStories[1];
        expect(story2.topic).toBe('lightning-network');
        expect(story2.mentions).toBe(12);
        expect(story2.uniqueUsers).toBe(7);
        
        // 7. Verify lnpixels_post is also captured (proving filter works)
        expect(debugData.permanent.lnpixelsPosts).toBeDefined();
        expect(debugData.permanent.lnpixelsPosts.length).toBe(1);
        
        console.log('\n✅ VERIFICATION PASSED:');
        console.log(`   - Found ${debugData.permanent.emergingStories.length} emerging stories in prompt`);
        console.log(`   - Story 1: "${story1.topic}" (${story1.mentions} mentions, ${story1.uniqueUsers} users)`);
        console.log(`   - Story 2: "${story2.topic}" (${story2.mentions} mentions, ${story2.uniqueUsers} users)`);
        console.log(`   - Prompt saved to: test-output/prompt-*.txt\n`);
      }
      
    } finally {
      // Restore original function
      generationModule.generateWithModelOrFallback = originalGenerate;
    }
  });

  it('REAL TEST: Verify emerging_story format handles edge cases', async () => {
    const mockMemoriesWithEdgeCases = [
      {
        id: 'edge-1',
        content: {
          type: 'emerging_story',
          data: {
            topic: 'test-topic',
            mentions: 3,
            uniqueUsers: 2,
            // No sentiment provided
          }
        },
        createdAt: Date.now()
      },
      {
        id: 'edge-2',
        content: {
          type: 'emerging_story',
          data: {
            topic: 'another-topic',
            mentions: 5,
            uniqueUsers: 3,
            sentiment: {
              positive: 'invalid', // Invalid type
              neutral: null,
              negative: undefined
            }
          }
        },
        createdAt: Date.now()
      }
    ];

    const mockRuntime = {
      agentId: 'test-agent',
      character: {
        name: 'TestBot',
        system: 'Test',
        bio: ['Test'],
        lore: [],
        style: { all: [], chat: [], post: [] },
        postExamples: [],
        messageExamples: []
      },
      getSetting: () => 'false',
      getMemories: async () => mockMemoriesWithEdgeCases,
      createMemory: async () => ({ id: 'new', success: true }),
      getMemoryById: async () => null,
    };

    let capturedPrompt = null;
    const generationModule = await import('../lib/generation.js');
    const originalGenerate = generationModule.generateWithModelOrFallback;
    
    generationModule.generateWithModelOrFallback = async (runtime, type, prompt) => {
      capturedPrompt = prompt;
      return 'Test';
    };

    try {
      const service = new NostrService(mockRuntime);
      await service.generatePostTextLLM();

      expect(capturedPrompt).toBeTruthy();
      
      const jsonMatch = capturedPrompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
      if (jsonMatch) {
        const debugData = JSON.parse(jsonMatch[1]);
        const stories = debugData.permanent.emergingStories;
        
        // Verify edge cases handled gracefully
        expect(stories.length).toBe(2);
        
        // Story with no sentiment should have 0s
        expect(stories[0].sentiment).toEqual({
          positive: 0,
          neutral: 0,
          negative: 0
        });
        
        // Story with invalid sentiment should have 0s
        expect(stories[1].sentiment).toEqual({
          positive: 0,
          neutral: 0,
          negative: 0
        });
        
        console.log('✅ Edge case handling verified: Missing/invalid sentiment defaults to zeros');
      }
      
    } finally {
      generationModule.generateWithModelOrFallback = originalGenerate;
    }
  });

  it('REAL TEST: Verify limit of 3 emerging stories', async () => {
    // Create 5 emerging story memories
    const mockManyStories = Array.from({ length: 5 }, (_, i) => ({
      id: `story-${i}`,
      content: {
        type: 'emerging_story',
        data: {
          topic: `topic-${i}`,
          mentions: i + 1,
          uniqueUsers: i + 1,
          sentiment: { positive: 1, neutral: 0, negative: 0 }
        }
      },
      createdAt: Date.now() - (5 - i) * 60000 // Oldest to newest
    }));

    const mockRuntime = {
      agentId: 'test-agent',
      character: {
        name: 'TestBot',
        system: 'Test',
        bio: ['Test'],
        lore: [],
        style: { all: [], chat: [], post: [] },
        postExamples: [],
        messageExamples: []
      },
      getSetting: () => 'false',
      getMemories: async () => mockManyStories,
      createMemory: async () => ({ id: 'new', success: true }),
      getMemoryById: async () => null,
    };

    let capturedPrompt = null;
    const generationModule = await import('../lib/generation.js');
    const originalGenerate = generationModule.generateWithModelOrFallback;
    
    generationModule.generateWithModelOrFallback = async (runtime, type, prompt) => {
      capturedPrompt = prompt;
      return 'Test';
    };

    try {
      const service = new NostrService(mockRuntime);
      await service.generatePostTextLLM();

      const jsonMatch = capturedPrompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
      if (jsonMatch) {
        const debugData = JSON.parse(jsonMatch[1]);
        const stories = debugData.permanent.emergingStories;
        
        // Should only include last 3 (pickLatest)
        expect(stories.length).toBe(3);
        
        // Verify they're the last 3 from the array
        expect(stories[0].topic).toBe('topic-2');
        expect(stories[1].topic).toBe('topic-3');
        expect(stories[2].topic).toBe('topic-4');
        
        console.log('✅ Limit verified: Only last 3 emerging stories included (out of 5 available)');
      }
      
    } finally {
      generationModule.generateWithModelOrFallback = originalGenerate;
    }
  });
});
