/**
 * VERIFIED TEST - Uses global test instrumentation
 * 
 * This test uses global.__TEST_PROMPT_CAPTURE__ hooks added to service.js
 * to capture actual prompts being generated, then verifies emerging_story
 * data is present in the DEBUG MEMORY DUMP.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { NostrService } = require('../lib/service.js');

describe('Emerging Story Memory - VERIFIED', () => {
  beforeEach(() => {
    // Initialize global capture array
    if (typeof global !== 'undefined') {
      global.__TEST_PROMPT_CAPTURE__ = [];
    }
  });

  it('VERIFIED: generatePostTextLLM includes emerging_story in DEBUG MEMORY DUMP', async () => {
    const mockRuntime = {
      character: {
        name: 'TestAgent',
        bio: ['Test bio'],
        lore: ['Test lore'],
        topics: ['test'],
        style: { all: ['Be helpful'], post: ['Short posts'] },
        postExamples: ['Example post'],
      },
      getSetting: vi.fn((key) => {
        if (key === 'NOSTR_ENABLED') return 'true';
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'MODEL_TEXT_LARGE') return 'gpt-4';
        return null;
      }),
      getMemories: vi.fn(async (options) => {
        console.log('[TEST MOCK] getMemories called with:', JSON.stringify(options));
        // The service fetches from 'messages' table, not roomId filtering
        if (options?.tableName === 'messages') {
          // Return emerging_story memories
          const result = [
            {
              id: 'es1',
              type: 'emerging_story',
              content: {
                source: 'nostr',
                type: 'emerging_story',
                data: {
                  topic: 'Bitcoin Price Analysis',
                  mentions: 25,
                  uniqueUsers: 12,
                  sentiment: { positive: 18, neutral: 5, negative: 2 }
                }
              },
              createdAt: Date.now() - 3600000,
            },
            {
              id: 'es2',
              type: 'emerging_story',
              content: {
                source: 'nostr',
                type: 'emerging_story',
                data: {
                  topic: 'Lightning Network Updates',
                  mentions: 15,
                  uniqueUsers: 8,
                  sentiment: { positive: 12, neutral: 3, negative: 0 }
                }
              },
              createdAt: Date.now() - 7200000,
            },
          ];
          console.log('[TEST MOCK] Returning', result.length, 'emerging stories');
          return result;
        }
        console.log('[TEST MOCK] Returning empty array');
        return [];
      }),
      createMemory: vi.fn(),
      ensureRoomExists: vi.fn(async () => 'test-room'),
      agentId: 'test-agent',
      logger: console,
    };

    const service = new NostrService(mockRuntime);
    const context = {
      roomId: 'test-room',
      recentMessages: ['Message 1', 'Message 2'],
    };

    // Generate post (will fail at LLM call, but prompt will be captured)
    try {
      await service.generatePostTextLLM(context);
    } catch (e) {
      // Expected to fail - we don't have a real LLM
    }

    // Check if prompt was captured
    expect(global.__TEST_PROMPT_CAPTURE__).toBeDefined();
    expect(global.__TEST_PROMPT_CAPTURE__.length).toBeGreaterThan(0);

    const captured = global.__TEST_PROMPT_CAPTURE__.find(c => c.method === 'generatePostTextLLM');
    expect(captured).toBeDefined();
    
    const prompt = captured.prompt;
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);

    console.log('\n=== CAPTURED POST PROMPT (first 3000 chars) ===');
    console.log(prompt.substring(0, 3000));
    console.log('\n=== END PROMPT ===\n');

    // Verify DEBUG MEMORY DUMP is present
    expect(prompt).toContain('DEBUG MEMORY DUMP');

    // Verify emerging stories are included (they should be in permanent.emergingStories)
    expect(prompt).toContain('emergingStories');
    expect(prompt).toContain('Bitcoin Price Analysis');
    expect(prompt).toContain('Lightning Network Updates');

    // Verify structure
    expect(prompt).toContain('topic');
    expect(prompt).toContain('mentions');
    expect(prompt).toContain('uniqueUsers');
    expect(prompt).toContain('sentiment');
    expect(prompt).toContain('positive');
    expect(prompt).toContain('neutral');
    expect(prompt).toContain('negative');

    // Try to parse the JSON from DEBUG MEMORY DUMP
    const dumpStart = prompt.indexOf('DEBUG MEMORY DUMP');
    expect(dumpStart).toBeGreaterThan(-1);

    const jsonStart = prompt.indexOf('{', dumpStart);
    const jsonEnd = prompt.lastIndexOf('}') + 1;

    if (jsonStart > -1 && jsonEnd > jsonStart) {
      const jsonStr = prompt.substring(jsonStart, jsonEnd);
      console.log('\n=== EXTRACTED JSON ===');
      console.log(jsonStr.substring(0, 2000)); // First 2000 chars
      console.log('\n=== END JSON ===\n');

      try {
        const memoryDump = JSON.parse(jsonStr);
        
        // Verify emergingStories exists IN THE PERMANENT OBJECT
        expect(memoryDump).toHaveProperty('permanent');
        expect(memoryDump.permanent).toHaveProperty('emergingStories');
        expect(Array.isArray(memoryDump.permanent.emergingStories)).toBe(true);
        expect(memoryDump.permanent.emergingStories.length).toBe(2);

        const story1 = memoryDump.permanent.emergingStories[0];
        expect(story1).toHaveProperty('topic');
        expect(story1).toHaveProperty('mentions');
        expect(story1).toHaveProperty('uniqueUsers');
        expect(story1).toHaveProperty('sentiment');
        
        expect(story1.sentiment).toHaveProperty('positive');
        expect(story1.sentiment).toHaveProperty('neutral');
        expect(story1.sentiment).toHaveProperty('negative');

        // Verify actual values
        expect(story1.topic).toBe('Bitcoin Price Analysis');
        expect(story1.mentions).toBe(25);
        expect(story1.uniqueUsers).toBe(12);
        expect(story1.sentiment.positive).toBe(18);

        console.log('\n✅ JSON PARSED SUCCESSFULLY');
        console.log('✅ emergingStories structure is correct (in permanent object)');
        console.log('✅ Values match expected data\n');
      } catch (parseError) {
        console.error('❌ Failed to parse JSON:', parseError.message);
        throw parseError;
      }
    }
  });

  it('VERIFIED: generateAwarenessPostTextLLM includes emerging_story', async () => {
    global.__TEST_PROMPT_CAPTURE__ = [];

    const mockRuntime = {
      character: {
        name: 'TestAgent',
        bio: ['Test bio'],
        lore: ['Test lore'],
        topics: ['test'],
        style: { all: ['Be helpful'], post: ['Short awareness'] },
      },
      getSetting: vi.fn((key) => {
        if (key === 'NOSTR_ENABLED') return 'true';
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'MODEL_TEXT_LARGE') return 'gpt-4';
        return null;
      }),
      getMemories: vi.fn(async (options) => {
        if (options?.tableName === 'messages') {
          return [
            {
              id: 'es1',
              type: 'emerging_story',
              content: {
                source: 'nostr',
                type: 'emerging_story',
                data: {
                  topic: 'AI Development Trends',
                  mentions: 30,
                  uniqueUsers: 15,
                  sentiment: { positive: 25, neutral: 5, negative: 0 }
                }
              },
              createdAt: Date.now(),
            },
          ];
        }
        return [];
      }),
      createMemory: vi.fn(),
      ensureRoomExists: vi.fn(async () => 'test-room'),
      agentId: 'test-agent',
      logger: console,
    };

    const service = new NostrService(mockRuntime);
    const context = { roomId: 'test-room', recentMessages: [] };

    try {
      await service.generateAwarenessPostTextLLM(context);
    } catch (e) {
      // Expected
    }

    const captured = global.__TEST_PROMPT_CAPTURE__.find(c => c.method === 'generateAwarenessPostTextLLM');
    expect(captured).toBeDefined();

    const prompt = captured.prompt;
    console.log('\n=== AWARENESS PROMPT (first 2000 chars) ===');
    console.log(prompt.substring(0, 2000));
    console.log('\n=== END PROMPT ===\n');

    expect(prompt).toContain('DEBUG MEMORY DUMP');
    expect(prompt).toContain('emergingStories');
    expect(prompt).toContain('AI Development Trends');
  });

  it('VERIFIED: Empty state when no emerging stories', async () => {
    global.__TEST_PROMPT_CAPTURE__ = [];

    const mockRuntime = {
      character: {
        name: 'TestAgent',
        bio: ['Test bio'],
        lore: ['Test lore'],
        topics: ['test'],
        style: { all: ['Be helpful'], post: ['Short'] },
        postExamples: ['Example'],
      },
      getSetting: vi.fn((key) => {
        if (key === 'NOSTR_ENABLED') return 'true';
        if (key === 'OPENAI_API_KEY') return 'test-key';
        return null;
      }),
      getMemories: vi.fn(async (options) => {
        // Return empty for all queries
        return [];
      }),
      createMemory: vi.fn(),
      ensureRoomExists: vi.fn(async () => 'test-room'),
      agentId: 'test-agent',
      logger: console,
    };

    const service = new NostrService(mockRuntime);
    const context = { roomId: 'test-room', recentMessages: [] };

    try {
      await service.generatePostTextLLM(context);
    } catch (e) {
      // Expected
    }

    const captured = global.__TEST_PROMPT_CAPTURE__.find(c => c.method === 'generatePostTextLLM');
    expect(captured).toBeDefined();

    const prompt = captured.prompt;
    console.log('\n=== EMPTY STATE PROMPT (first 2000 chars) ===');
    console.log(prompt.substring(0, 2000));
    console.log('\n=== END PROMPT ===\n');

    // Should still have DEBUG MEMORY DUMP
    expect(prompt).toContain('DEBUG MEMORY DUMP');

    // emergingStories field should NOT be present in permanent when empty
    // (our code only adds the field if items.length > 0)
    const hasPermanentEmergingStories = prompt.includes('"permanent"') && prompt.match(/permanent[^}]*emergingStories/);
    console.log(`permanent.emergingStories present: ${!!hasPermanentEmergingStories}`);
    
    // If no stories, the field shouldn't exist in permanent object
    expect(hasPermanentEmergingStories).toBeFalsy();
  });
});
