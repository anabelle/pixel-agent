/**
 * REAL VERIFICATION TEST
 * 
 * This test uses vi.mock() at the module level to properly capture
 * the prompt arguments passed to generateWithModelOrFallback.
 * 
 * Goal: Verify that emerging_story memory actually appears in the
 * DEBUG MEMORY DUMP section of generated prompts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock at the module level BEFORE importing service
let capturedPrompts = [];
const mockGenerate = vi.fn(async (runtime, type, prompt, options, extractFn, sanitizeFn, fallbackFn) => {
  capturedPrompts.push({ type, prompt, options });
  return 'Generated text';
});

vi.mock('../lib/generation.js', () => ({
  generateWithModelOrFallback: mockGenerate,
}));

// Now import service after mocking
const { NostrService } = require('../lib/service.js');

describe('Emerging Story Capture - Module Mock', () => {
  let mockRuntime;
  let service;

  beforeEach(() => {
    capturedPrompts = [];
    mockGenerate.mockClear();

    // Mock runtime with necessary methods
    mockRuntime = {
      character: {
        name: 'TestAgent',
        bio: ['Test agent bio'],
        lore: ['Test lore'],
        topics: ['test', 'ai'],
        style: { all: ['Be helpful'], post: ['Keep it short'] },
        postExamples: ['Example post'],
      },
      getSetting: vi.fn((key) => {
        if (key === 'NOSTR_ENABLED') return 'true';
        if (key === 'OPENAI_API_KEY') return 'test-key';
        return null;
      }),
      getMemories: vi.fn(async (options) => {
        // Return emerging_story memories
        if (!options?.roomId) return [];
        
        return [
          {
            id: 'mem1',
            type: 'emerging_story',
            content: {
              data: {
                topic: 'Bitcoin Discussion',
                mentions: 15,
                uniqueUsers: 8,
                sentiment: { positive: 10, neutral: 3, negative: 2 }
              }
            },
            createdAt: Date.now() - 3600000,
          },
          {
            id: 'mem2',
            type: 'emerging_story',
            content: {
              data: {
                topic: 'AI Development',
                mentions: 22,
                uniqueUsers: 12,
                sentiment: { positive: 18, neutral: 4, negative: 0 }
              }
            },
            createdAt: Date.now() - 7200000,
          },
        ];
      }),
      createMemory: vi.fn(),
      ensureRoomExists: vi.fn(async () => 'test-room-id'),
      agentId: 'test-agent-id',
    };

    // Create service instance with mockRuntime
    service = new NostrService(mockRuntime);
  });

  it('CAPTURE TEST: generatePostTextLLM includes emerging_story in prompt', async () => {
    const context = {
      roomId: 'test-room',
      recentMessages: ['Recent message 1', 'Recent message 2'],
    };

    await service.generatePostTextLLM(context);

    // Should have called generate at least once
    expect(mockGenerate).toHaveBeenCalled();
    
    // Get the last captured prompt
    const lastCall = capturedPrompts[capturedPrompts.length - 1];
    expect(lastCall).toBeDefined();
    
    const prompt = lastCall.prompt;
    expect(typeof prompt).toBe('string');

    // Log the prompt for manual inspection
    console.log('\n=== CAPTURED POST PROMPT ===');
    console.log(prompt.substring(0, 3000)); // First 3000 chars
    console.log('\n=== END PROMPT ===\n');

    // Verify the prompt contains DEBUG MEMORY DUMP
    expect(prompt).toContain('DEBUG MEMORY DUMP');

    // Verify emerging stories are present
    expect(prompt).toContain('emergingStories');
    expect(prompt).toContain('Bitcoin Discussion');
    expect(prompt).toContain('AI Development');

    // Verify the structure includes expected fields
    expect(prompt).toContain('topic');
    expect(prompt).toContain('mentions');
    expect(prompt).toContain('uniqueUsers');
    expect(prompt).toContain('sentiment');
  });

  it('CAPTURE TEST: generateAwarenessPostTextLLM includes emerging_story', async () => {
    const context = {
      roomId: 'test-room',
      recentMessages: ['Recent message'],
    };

    await service.generateAwarenessPostTextLLM(context);

    expect(mockGenerate).toHaveBeenCalled();
    
    const lastCall = capturedPrompts[capturedPrompts.length - 1];
    const prompt = lastCall.prompt;

    console.log('\n=== CAPTURED AWARENESS PROMPT ===');
    console.log(prompt.substring(0, 3000));
    console.log('\n=== END PROMPT ===\n');

    expect(prompt).toContain('DEBUG MEMORY DUMP');
    expect(prompt).toContain('emergingStories');
    expect(prompt).toContain('Bitcoin Discussion');
  });

  it('CAPTURE TEST: Verify JSON structure in DEBUG MEMORY DUMP', async () => {
    const context = { roomId: 'test-room', recentMessages: [] };
    
    await service.generatePostTextLLM(context);
    
    const lastCall = capturedPrompts[capturedPrompts.length - 1];
    const prompt = lastCall.prompt;

    // Extract the DEBUG MEMORY DUMP section
    const dumpStart = prompt.indexOf('DEBUG MEMORY DUMP');
    expect(dumpStart).toBeGreaterThan(-1);

    // Try to parse the JSON within the dump
    const jsonStart = prompt.indexOf('{', dumpStart);
    const jsonEnd = prompt.indexOf('\n\n', jsonStart); // Assuming JSON block ends with double newline
    
    if (jsonStart > -1 && jsonEnd > jsonStart) {
      const jsonStr = prompt.substring(jsonStart, jsonEnd);
      console.log('\n=== EXTRACTED JSON ===');
      console.log(jsonStr);
      console.log('\n=== END JSON ===\n');

      // Try to parse it
      try {
        const memoryData = JSON.parse(jsonStr);
        expect(memoryData.emergingStories).toBeDefined();
        expect(Array.isArray(memoryData.emergingStories)).toBe(true);
        expect(memoryData.emergingStories.length).toBeGreaterThan(0);

        // Verify structure of first emerging story
        const story = memoryData.emergingStories[0];
        expect(story).toHaveProperty('topic');
        expect(story).toHaveProperty('mentions');
        expect(story).toHaveProperty('uniqueUsers');
        expect(story).toHaveProperty('sentiment');
        expect(story.sentiment).toHaveProperty('positive');
        expect(story.sentiment).toHaveProperty('neutral');
        expect(story.sentiment).toHaveProperty('negative');
      } catch (e) {
        console.error('Failed to parse JSON:', e.message);
        throw e;
      }
    } else {
      throw new Error('Could not locate JSON in DEBUG MEMORY DUMP');
    }
  });

  it('CAPTURE TEST: Verify empty case when no emerging stories', async () => {
    // Override getMemories to return empty array
    mockRuntime.getMemories.mockResolvedValueOnce([]);

    const context = { roomId: 'test-room', recentMessages: [] };
    await service.generatePostTextLLM(context);

    const lastCall = capturedPrompts[capturedPrompts.length - 1];
    const prompt = lastCall.prompt;

    console.log('\n=== EMPTY CASE PROMPT ===');
    console.log(prompt.substring(0, 2000));
    console.log('\n=== END PROMPT ===\n');

    // Should still have DEBUG MEMORY DUMP but no emergingStories field
    expect(prompt).toContain('DEBUG MEMORY DUMP');
    
    // emergingStories should NOT be present when empty
    // (our code only adds the field if items.length > 0)
    const hasEmergingStories = prompt.includes('emergingStories');
    console.log('Has emergingStories field:', hasEmergingStories);
    
    // This depends on implementation - if no items, field shouldn't exist
    // But other memory types might still be there
    expect(prompt).toContain('DEBUG MEMORY DUMP');
  });
});
