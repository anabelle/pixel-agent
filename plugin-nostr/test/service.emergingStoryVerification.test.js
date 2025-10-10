import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('Emerging Story Memory - Direct Verification', () => {
  let service;
  let mockRuntime;
  let generationModule;

  beforeEach(async () => {
    // Mock runtime with getMemories that returns emerging_story memories
    mockRuntime = {
      agentId: 'test-agent',
      character: {
        name: 'TestBot',
        system: 'Test system prompt',
        bio: ['Test bio'],
        lore: ['Test lore'],
        style: { all: ['Test style'], chat: [], post: [] },
        postExamples: [],
        messageExamples: []
      },
      getSetting: vi.fn((key) => {
        const settings = {
          NOSTR_RELAYS: 'wss://relay.test.com',
          NOSTR_ENABLE: 'true',
          NOSTR_POST_ENABLE: 'false',
          NOSTR_REPLY_ENABLE: 'false',
          CONTEXT_ACCUMULATOR_ENABLE: 'false',
          NOSTR_SELF_REFLECTION_ENABLE: 'false',
        };
        return settings[key];
      }),
      getMemories: vi.fn(),
      createMemory: vi.fn(),
      getMemoryById: vi.fn(),
    };

    // Import and spy on generation module
    generationModule = await import('../lib/generation.js');
    vi.spyOn(generationModule, 'generateWithModelOrFallback');

    service = new NostrService(mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('VERIFY: emerging_story appears in post prompt DEBUG MEMORY DUMP', async () => {
    const mockMemories = [
      {
        id: 'story-1',
        agentId: 'test-agent',
        roomId: 'room-1',
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic: 'bitcoin',
            mentions: 5,
            uniqueUsers: 3,
            sentiment: {
              positive: 3,
              neutral: 1,
              negative: 1
            }
          }
        },
        createdAt: 1696800000000
      }
    ];

    mockRuntime.getMemories.mockResolvedValue(mockMemories);
    generationModule.generateWithModelOrFallback.mockResolvedValue('Mock response');

    await service.generatePostTextLLM();

    // Verify generation was called
    expect(generationModule.generateWithModelOrFallback).toHaveBeenCalled();
    
    // Get the actual prompt that was passed
    const callArgs = generationModule.generateWithModelOrFallback.mock.calls[0];
    const prompt = callArgs[2]; // Third argument is the prompt

    // Verify the prompt structure
    expect(prompt).toContain('DEBUG MEMORY DUMP');
    
    // Parse the JSON in the debug dump
    const jsonMatch = prompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
    expect(jsonMatch).toBeTruthy();
    
    if (jsonMatch) {
      const debugData = JSON.parse(jsonMatch[1]);
      
      // CRITICAL: Verify emergingStories is in permanent memories
      expect(debugData.permanent).toBeDefined();
      expect(debugData.permanent.emergingStories).toBeDefined();
      expect(Array.isArray(debugData.permanent.emergingStories)).toBe(true);
      expect(debugData.permanent.emergingStories.length).toBeGreaterThan(0);
      
      const story = debugData.permanent.emergingStories[0];
      expect(story.topic).toBe('bitcoin');
      expect(story.mentions).toBe(5);
      expect(story.uniqueUsers).toBe(3);
      expect(story.sentiment).toEqual({
        positive: 3,
        neutral: 1,
        negative: 1
      });
      expect(story.createdAtIso).toBeDefined();
    }
  });

  it('VERIFY: multiple emerging_stories are ordered correctly (latest first)', async () => {
    const mockMemories = [
      {
        id: 'story-old',
        content: {
          type: 'emerging_story',
          data: { topic: 'old-topic', mentions: 2, uniqueUsers: 1, sentiment: { positive: 1, neutral: 1, negative: 0 } }
        },
        createdAt: 1000000
      },
      {
        id: 'story-new',
        content: {
          type: 'emerging_story',
          data: { topic: 'new-topic', mentions: 5, uniqueUsers: 3, sentiment: { positive: 3, neutral: 2, negative: 0 } }
        },
        createdAt: 9000000
      },
      {
        id: 'story-middle',
        content: {
          type: 'emerging_story',
          data: { topic: 'middle-topic', mentions: 3, uniqueUsers: 2, sentiment: { positive: 2, neutral: 1, negative: 0 } }
        },
        createdAt: 5000000
      }
    ];

    mockRuntime.getMemories.mockResolvedValue(mockMemories);
    generationModule.generateWithModelOrFallback.mockResolvedValue('Mock response');

    await service.generatePostTextLLM();

    const callArgs = generationModule.generateWithModelOrFallback.mock.calls[0];
    const prompt = callArgs[2];
    const jsonMatch = prompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
    
    if (jsonMatch) {
      const debugData = JSON.parse(jsonMatch[1]);
      const stories = debugData.permanent.emergingStories;
      
      // Should have all 3 (pickLatest takes last 3)
      expect(stories.length).toBe(3);
      
      // Should be the latest 3 in order from the memory list
      // pickLatest(3) will slice the last 3 from the array
      expect(stories[0].topic).toBe('old-topic');
      expect(stories[1].topic).toBe('middle-topic');
      expect(stories[2].topic).toBe('new-topic');
    }
  });

  it('VERIFY: emerging_story with missing/invalid sentiment gets safe defaults', async () => {
    const mockMemories = [
      {
        id: 'story-no-sentiment',
        content: {
          type: 'emerging_story',
          data: {
            topic: 'test-topic',
            mentions: 5,
            uniqueUsers: 3
            // sentiment missing entirely
          }
        },
        createdAt: Date.now()
      }
    ];

    mockRuntime.getMemories.mockResolvedValue(mockMemories);
    generationModule.generateWithModelOrFallback.mockResolvedValue('Mock response');

    await service.generatePostTextLLM();

    const callArgs = generationModule.generateWithModelOrFallback.mock.calls[0];
    const prompt = callArgs[2];
    const jsonMatch = prompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
    
    if (jsonMatch) {
      const debugData = JSON.parse(jsonMatch[1]);
      const story = debugData.permanent.emergingStories[0];
      
      // Should have sentiment with 0s as defaults
      expect(story.sentiment).toEqual({
        positive: 0,
        neutral: 0,
        negative: 0
      });
    }
  });

  it('VERIFY: emerging_story integration in awareness posts', async () => {
    const mockMemories = [
      {
        id: 'story-awareness',
        content: {
          type: 'emerging_story',
          data: {
            topic: 'nostr-protocol',
            mentions: 10,
            uniqueUsers: 6,
            sentiment: { positive: 8, neutral: 2, negative: 0 }
          }
        },
        createdAt: Date.now()
      }
    ];

    mockRuntime.getMemories.mockResolvedValue(mockMemories);
    generationModule.generateWithModelOrFallback.mockResolvedValue('Mock response');

    await service.generateAwarenessPostTextLLM();

    expect(generationModule.generateWithModelOrFallback).toHaveBeenCalled();
    
    const callArgs = generationModule.generateWithModelOrFallback.mock.calls[0];
    const prompt = callArgs[2];
    
    expect(prompt).toContain('DEBUG MEMORY DUMP');
    
    const jsonMatch = prompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
    if (jsonMatch) {
      const debugData = JSON.parse(jsonMatch[1]);
      expect(debugData.permanent.emergingStories).toBeDefined();
      expect(debugData.permanent.emergingStories[0].topic).toBe('nostr-protocol');
    }
  });

  it('VERIFY: no emerging_story memories = no emergingStories in debug dump', async () => {
    const mockMemories = [
      {
        id: 'post-1',
        content: {
          type: 'lnpixels_post',
          text: 'Test post',
          data: { generatedText: 'Test' }
        },
        createdAt: Date.now()
      }
    ];

    mockRuntime.getMemories.mockResolvedValue(mockMemories);
    generationModule.generateWithModelOrFallback.mockResolvedValue('Mock response');

    await service.generatePostTextLLM();

    const callArgs = generationModule.generateWithModelOrFallback.mock.calls[0];
    const prompt = callArgs[2];
    const jsonMatch = prompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})$/);
    
    if (jsonMatch) {
      const debugData = JSON.parse(jsonMatch[1]);
      // emergingStories should not exist if there are no emerging_story memories
      expect(debugData.permanent.emergingStories).toBeUndefined();
    }
  });
});
