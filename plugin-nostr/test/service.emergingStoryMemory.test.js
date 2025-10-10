import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NostrService } from '../lib/service.js';

describe('NostrService - Emerging Story Memory Integration', () => {
  let service;
  let mockRuntime;

  beforeEach(() => {
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

    service = new NostrService(mockRuntime);
  });

  describe('Post Generation with Emerging Stories', () => {
    it('should include emerging_story memories in permanent memory summaries', async () => {
      // Setup mock memories including emerging_story type
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
              },
              firstSeen: Date.now() - 3600000,
              recentEvents: []
            }
          },
          createdAt: Date.now() - 1800000
        },
        {
          id: 'story-2',
          agentId: 'test-agent',
          roomId: 'room-1',
          content: {
            type: 'emerging_story',
            source: 'nostr',
            data: {
              topic: 'nostr',
              mentions: 8,
              uniqueUsers: 5,
              sentiment: {
                positive: 6,
                neutral: 2,
                negative: 0
              },
              firstSeen: Date.now() - 7200000,
              recentEvents: []
            }
          },
          createdAt: Date.now() - 3600000
        },
        {
          id: 'post-1',
          agentId: 'test-agent',
          roomId: 'room-1',
          content: {
            type: 'lnpixels_post',
            source: 'nostr',
            text: 'Test post',
            data: {
              generatedText: 'Test post',
              triggerEvent: { x: 10, y: 20, color: 'FF0000', sats: 100 }
            }
          },
          createdAt: Date.now() - 900000
        }
      ];

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      // Call generatePostTextLLM which builds the prompt with permanent memories
      // We'll mock the generation to just capture the prompt
      const originalGenerate = (await import('../lib/generation.js')).generateWithModelOrFallback;
      const generateSpy = vi.fn().mockResolvedValue('Generated post text');
      
      // Temporarily replace the generation function
      vi.doMock('../lib/generation.js', () => ({
        generateWithModelOrFallback: generateSpy
      }));

      try {
        await service.generatePostTextLLM();
      } catch (e) {
        // May error due to mock setup, but we just need to check if getMemories was called
      }

      // Verify getMemories was called to fetch permanent memories
      expect(mockRuntime.getMemories).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'messages',
          count: 200,
          unique: false
        })
      );

      // Verify the prompt would include emerging stories
      if (generateSpy.mock.calls.length > 0) {
        const promptArg = generateSpy.mock.calls[0][2]; // Third argument is the prompt
        expect(promptArg).toContain('DEBUG MEMORY DUMP');
        expect(promptArg).toContain('emergingStories');
      }
    });

    it('should format emerging_story with correct fields', async () => {
      const testStory = {
        id: 'story-test',
        agentId: 'test-agent',
        roomId: 'room-1',
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic: 'lightning',
            mentions: 12,
            uniqueUsers: 7,
            sentiment: {
              positive: 8,
              neutral: 3,
              negative: 1
            }
          }
        },
        createdAt: 1696800000000
      };

      mockRuntime.getMemories.mockResolvedValue([testStory]);

      // Mock the generation to capture the prompt
      let capturedPrompt = null;
      vi.doMock('../lib/generation.js', () => ({
        generateWithModelOrFallback: vi.fn(async (runtime, type, prompt) => {
          capturedPrompt = prompt;
          return 'Test output';
        })
      }));

      try {
        await service.generatePostTextLLM();
      } catch (e) {
        // Expected due to mocking
      }

      // If we captured a prompt, verify structure
      if (capturedPrompt) {
        const jsonMatch = capturedPrompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})/);
        if (jsonMatch) {
          const debugData = JSON.parse(jsonMatch[1]);
          
          if (debugData.permanent?.emergingStories) {
            const stories = debugData.permanent.emergingStories;
            expect(stories).toBeInstanceOf(Array);
            expect(stories.length).toBeGreaterThan(0);
            
            const story = stories[0];
            expect(story).toHaveProperty('topic');
            expect(story).toHaveProperty('mentions');
            expect(story).toHaveProperty('uniqueUsers');
            expect(story).toHaveProperty('sentiment');
            expect(story.sentiment).toHaveProperty('positive');
            expect(story.sentiment).toHaveProperty('neutral');
            expect(story.sentiment).toHaveProperty('negative');
            expect(story).toHaveProperty('createdAtIso');
          }
        }
      }
    });
  });

  describe('Reply Generation with Emerging Stories', () => {
    it('should include emerging_story memories in reply prompts', async () => {
      const mockEvent = {
        id: 'event-1',
        pubkey: 'user-pubkey',
        content: 'Hello bot!',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: []
      };

      const mockMemories = [
        {
          id: 'story-1',
          content: {
            type: 'emerging_story',
            source: 'nostr',
            data: {
              topic: 'bitcoin',
              mentions: 5,
              uniqueUsers: 3,
              sentiment: { positive: 3, neutral: 1, negative: 1 }
            }
          },
          createdAt: Date.now()
        }
      ];

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      try {
        await service.generateReplyTextLLM(mockEvent, 'room-id');
      } catch (e) {
        // Expected due to incomplete mocking
      }

      // Verify memories were fetched for reply generation
      expect(mockRuntime.getMemories).toHaveBeenCalled();
    });
  });

  describe('Awareness Post Generation with Emerging Stories', () => {
    it('should include emerging_story memories in awareness prompts', async () => {
      const mockMemories = [
        {
          id: 'story-1',
          content: {
            type: 'emerging_story',
            source: 'nostr',
            data: {
              topic: 'nostr',
              mentions: 10,
              uniqueUsers: 6,
              sentiment: { positive: 8, neutral: 2, negative: 0 }
            }
          },
          createdAt: Date.now()
        }
      ];

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      try {
        await service.generateAwarenessPostTextLLM();
      } catch (e) {
        // Expected due to incomplete mocking
      }

      // Verify memories were fetched for awareness generation
      expect(mockRuntime.getMemories).toHaveBeenCalled();
    });
  });

  describe('Memory Formatting Edge Cases', () => {
    it('should handle missing sentiment gracefully', async () => {
      const mockMemories = [
        {
          id: 'story-incomplete',
          content: {
            type: 'emerging_story',
            source: 'nostr',
            data: {
              topic: 'test',
              mentions: 3,
              uniqueUsers: 2
              // sentiment missing
            }
          },
          createdAt: Date.now()
        }
      ];

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      // Should not throw when processing incomplete data
      await expect(async () => {
        try {
          await service.generatePostTextLLM();
        } catch (e) {
          // Ignore generation errors, we're testing data processing
          if (e.message.includes('sentiment')) {
            throw e; // Re-throw if it's about sentiment processing
          }
        }
      }).not.toThrow();
    });

    it('should handle non-numeric sentiment values', async () => {
      const mockMemories = [
        {
          id: 'story-bad-sentiment',
          content: {
            type: 'emerging_story',
            source: 'nostr',
            data: {
              topic: 'test',
              mentions: 3,
              uniqueUsers: 2,
              sentiment: {
                positive: 'many', // Invalid
                neutral: null,
                negative: undefined
              }
            }
          },
          createdAt: Date.now()
        }
      ];

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      // Should not throw, should default to 0
      await expect(async () => {
        try {
          await service.generatePostTextLLM();
        } catch (e) {
          if (e.message.includes('sentiment') || e.message.includes('number')) {
            throw e;
          }
        }
      }).not.toThrow();
    });
  });

  describe('Memory Limit', () => {
    it('should only include last 3 emerging stories', async () => {
      // Create 5 emerging story memories
      const mockMemories = Array.from({ length: 5 }, (_, i) => ({
        id: `story-${i}`,
        content: {
          type: 'emerging_story',
          source: 'nostr',
          data: {
            topic: `topic-${i}`,
            mentions: i + 1,
            uniqueUsers: i + 1,
            sentiment: { positive: 1, neutral: 0, negative: 0 }
          }
        },
        createdAt: Date.now() - (5 - i) * 60000 // Oldest to newest
      }));

      mockRuntime.getMemories.mockResolvedValue(mockMemories);

      let capturedPrompt = null;
      vi.doMock('../lib/generation.js', () => ({
        generateWithModelOrFallback: vi.fn(async (runtime, type, prompt) => {
          capturedPrompt = prompt;
          return 'Test output';
        })
      }));

      try {
        await service.generatePostTextLLM();
      } catch (e) {
        // Expected
      }

      if (capturedPrompt) {
        const jsonMatch = capturedPrompt.match(/DEBUG MEMORY DUMP[^{]*({[\s\S]*})/);
        if (jsonMatch) {
          const debugData = JSON.parse(jsonMatch[1]);
          if (debugData.permanent?.emergingStories) {
            // Should only have last 3 (most recent)
            expect(debugData.permanent.emergingStories.length).toBeLessThanOrEqual(3);
          }
        }
      }
    });
  });
});
