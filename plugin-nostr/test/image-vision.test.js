const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const { 
  extractImageUrls, 
  processImageContent, 
  analyzeImageWithVision, 
  generateNaturalReply 
} = require('../lib/image-vision');

// Mock logger
global.logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

describe('Image Vision', () => {
  let fetchMock;
  let originalFetch;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Store original fetch
    originalFetch = global.fetch;
    
    // Create a mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('extractImageUrls', () => {
    it('should deduplicate blossom.primal.net URLs that match both regex patterns', () => {
      const content = 'Check out this image: https://blossom.primal.net/452da360b0d84f54da36b7a3dc4bad69bb88d12d6069b9f03b7c52d4864b7d63.jpg';

      const urls = extractImageUrls(content);

      // Should only return one URL, not two
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://blossom.primal.net/452da360b0d84f54da36b7a3dc4bad69bb88d12d6069b9f03b7c52d4864b7d63.jpg');
    });

    it('should handle multiple different URLs correctly', () => {
      const content = 'Images: https://example.com/image1.jpg https://blossom.primal.net/abc123.jpg https://example.com/image2.png';
      
      const urls = extractImageUrls(content);
      
      // Should return all three unique URLs
      expect(urls).toHaveLength(3);
      expect(urls).toContain('https://example.com/image1.jpg');
      expect(urls).toContain('https://blossom.primal.net/abc123.jpg');
      expect(urls).toContain('https://example.com/image2.png');
    });

    it('should handle duplicate URLs in content', () => {
      const content = 'Same image twice: https://blossom.primal.net/abc123.jpg https://blossom.primal.net/abc123.jpg';
      
      const urls = extractImageUrls(content);
      
      // Should deduplicate to one URL
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://blossom.primal.net/abc123.jpg');
    });

    it('should extract various image formats', () => {
      const content = 'Here are images: https://example.com/photo.jpeg https://test.com/pic.gif https://site.com/image.webp https://example.com/avatar.png';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(4);
      expect(urls).toContain('https://example.com/photo.jpeg');
      expect(urls).toContain('https://test.com/pic.gif');
      expect(urls).toContain('https://site.com/image.webp');
      expect(urls).toContain('https://example.com/avatar.png');
    });

    it('should extract URLs with query parameters', () => {
      const content = 'Image with params: https://example.com/image.jpg?size=large&quality=high';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://example.com/image.jpg?size=large&quality=high');
    });

    it('should handle blossom.primal.net URLs without extensions', () => {
      const content = 'Media: https://blossom.primal.net/abc123def456';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(1);
      expect(urls[0]).toBe('https://blossom.primal.net/abc123def456');
    });

    it('should return empty array when no image URLs found', () => {
      const content = 'Just some text with a non-image URL: https://example.com/page.html';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(0);
    });

    it('should handle content with line breaks', () => {
      const content = 'First image:\nhttps://example.com/image1.jpg\n\nSecond image:\nhttps://example.com/image2.png';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://example.com/image1.jpg');
      expect(urls).toContain('https://example.com/image2.png');
    });

    it('should reject invalid protocols', () => {
      const content = 'Bad protocol: ftp://example.com/image.jpg';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const urls = extractImageUrls('');
      
      expect(urls).toHaveLength(0);
    });

    it('should extract SVG and other supported formats', () => {
      const content = 'SVG: https://example.com/icon.svg BMP: https://example.com/photo.bmp AVIF: https://example.com/modern.avif';
      
      const urls = extractImageUrls(content);
      
      expect(urls).toHaveLength(3);
      expect(urls).toContain('https://example.com/icon.svg');
      expect(urls).toContain('https://example.com/photo.bmp');
      expect(urls).toContain('https://example.com/modern.avif');
    });
  });

  describe('processImageContent', () => {
    it('should return empty arrays when no images found', async () => {
      const runtime = {
        getSetting: vi.fn()
      };

      const result = await processImageContent('Just text, no images', runtime);

      expect(result.imageDescriptions).toEqual([]);
      expect(result.imageUrls).toEqual([]);
    });

    it('should process single image URL', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return null;
        })
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'A beautiful sunset over mountains'
            }
          }]
        })
      });

      const result = await processImageContent('Check this: https://example.com/image.jpg', runtime);

      expect(result.imageDescriptions).toHaveLength(1);
      expect(result.imageDescriptions[0]).toBe('A beautiful sunset over mountains');
      expect(result.imageUrls).toEqual(['https://example.com/image.jpg']);
    });

    it('should process multiple image URLs', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return null;
        })
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'First image description' }
            }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Second image description' }
            }]
          })
        });

      const result = await processImageContent(
        'Two images: https://example.com/img1.jpg https://example.com/img2.png',
        runtime
      );

      expect(result.imageDescriptions).toHaveLength(2);
      expect(result.imageDescriptions[0]).toBe('First image description');
      expect(result.imageDescriptions[1]).toBe('Second image description');
      expect(result.imageUrls).toHaveLength(2);
    });

    it('should skip images that fail analysis', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return null;
        })
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Good description' }
            }]
          })
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await processImageContent(
        'Two images: https://example.com/img1.jpg https://example.com/img2.png',
        runtime
      );

      expect(result.imageDescriptions).toHaveLength(1);
      expect(result.imageDescriptions[0]).toBe('Good description');
      expect(result.imageUrls).toHaveLength(1);
    });

    it('should handle image analysis returning null', async () => {
      const runtime = {
        getSetting: vi.fn()
      };

      const result = await processImageContent('Image: https://example.com/img.jpg', runtime);

      expect(result.imageDescriptions).toEqual([]);
      expect(result.imageUrls).toEqual([]);
    });
  });

  describe('analyzeImageWithVision', () => {
    describe('OpenAI integration', () => {
      it('should call OpenAI API with correct parameters', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-openai-key';
            if (key === 'OPENAI_IMAGE_DESCRIPTION_MODEL') return 'gpt-4o-mini';
            if (key === 'OPENAI_IMAGE_DESCRIPTION_MAX_TOKENS') return '300';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'A detailed description of the image'
              }
            }]
          })
        });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('A detailed description of the image');
        expect(fetchMock).toHaveBeenCalledWith(
          'https://api.openai.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-openai-key',
              'Content-Type': 'application/json'
            })
          })
        );

        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(callBody.model).toBe('gpt-4o-mini');
        expect(callBody.max_tokens).toBe(300);
        expect(callBody.messages[0].content[1].image_url.url).toBe('https://example.com/image.jpg');
      });

      it('should use default model when not configured', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Description' }
            }]
          })
        });

        await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(callBody.model).toBe('gpt-4o-mini');
        expect(callBody.max_tokens).toBe(300);
      });

      it('should handle OpenAI API error response', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock
          .mockResolvedValueOnce({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: async () => 'Rate limit exceeded'
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: { content: 'OpenRouter fallback description' }
              }]
            })
          });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('OpenRouter fallback description');
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should handle empty description in OpenAI response', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: { content: '' }
              }]
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: { content: 'Fallback description' }
              }]
            })
          });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('Fallback description');
      });

      it('should handle OpenAI network error', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: { content: 'OpenRouter works' }
              }]
            })
          });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('OpenRouter works');
      });

      it('should skip OpenAI when no API key configured', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'OpenRouter description' }
            }]
          })
        });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('OpenRouter description');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
          'https://openrouter.ai/api/v1/chat/completions',
          expect.any(Object)
        );
      });
    });

    describe('OpenRouter integration', () => {
      it('should call OpenRouter API with correct parameters', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            if (key === 'OPENROUTER_IMAGE_MODEL') return 'google/gemini-flash-exp:free';
            if (key === 'OPENROUTER_BASE_URL') return 'https://custom.url';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: 'OpenRouter image description'
              }
            }]
          })
        });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('OpenRouter image description');
        expect(fetchMock).toHaveBeenCalledWith(
          'https://openrouter.ai/api/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Authorization': 'Bearer test-router-key',
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://custom.url',
              'X-Title': 'Pixel Nostr Image Analyzer'
            })
          })
        );

        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(callBody.model).toBe('google/gemini-flash-exp:free');
      });

      it('should use default OpenRouter model when not configured', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-key';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Description' }
            }]
          })
        });

        await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(callBody.model).toBe('google/gemini-flash-exp:free');
      });

      it('should use default base URL when not configured', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-key';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{
              message: { content: 'Description' }
            }]
          })
        });

        await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        const callHeaders = fetchMock.mock.calls[0][1].headers;
        expect(callHeaders['HTTP-Referer']).toBe('https://ln.pixel.xx.kg');
      });

      it('should handle OpenRouter API error', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-key';
            return null;
          })
        };

        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBeNull();
      });

      it('should handle OpenRouter network error', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENROUTER_API_KEY') return 'test-key';
            return null;
          })
        };

        fetchMock.mockRejectedValueOnce(new Error('Connection timeout'));

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBeNull();
      });

      it('should skip OpenRouter when no API key configured', async () => {
        const runtime = {
          getSetting: vi.fn()
        };

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
      });
    });

    describe('fallback behavior', () => {
      it('should return null when all vision models fail', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock
          .mockRejectedValueOnce(new Error('OpenAI failed'))
          .mockRejectedValueOnce(new Error('OpenRouter failed'));

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      it('should try OpenRouter after OpenAI fails', async () => {
        const runtime = {
          getSetting: vi.fn((key) => {
            if (key === 'OPENAI_API_KEY') return 'test-key';
            if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
            return null;
          })
        };

        fetchMock
          .mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: async () => 'Access denied'
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{
                message: { content: 'Success from OpenRouter' }
              }]
            })
          });

        const result = await analyzeImageWithVision('https://example.com/image.jpg', runtime);

        expect(result).toBe('Success from OpenRouter');
      });
    });
  });

  describe('generateNaturalReply', () => {
    it('should generate reply using OpenRouter when available', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-router-key';
          if (key === 'OPENROUTER_MODEL') return 'custom-model';
          if (key === 'OPENROUTER_BASE_URL') return 'https://custom.url';
          return null;
        }),
        character: {
          system: 'I am Pixel, a witty AI artist'
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'What a beautiful sunset! Let me paint something inspired by this.'
            }
          }]
        })
      });

      const result = await generateNaturalReply(
        'Check out this sunset!',
        'A vibrant sunset with orange and purple hues',
        runtime
      );

      expect(result).toBe('What a beautiful sunset! Let me paint something inspired by this.');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-router-key',
            'HTTP-Referer': 'https://custom.url',
            'X-Title': 'Pixel Nostr Reply Generator'
          })
        })
      );
    });

    it('should generate reply using OpenAI when OpenRouter not available', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENAI_API_KEY') return 'test-openai-key';
          if (key === 'OPENAI_MODEL') return 'gpt-4o-mini';
          return null;
        }),
        character: {
          system: 'I am Pixel'
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: 'Interesting perspective!'
            }
          }]
        })
      });

      const result = await generateNaturalReply(
        'Original message',
        'Image description',
        runtime
      );

      expect(result).toBe('Interesting perspective!');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('should include original content and image description in prompt', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {
          system: 'Test system prompt'
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Reply' }
          }]
        })
      });

      await generateNaturalReply(
        'Check this out!',
        'A red apple on a table',
        runtime
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const prompt = callBody.messages[0].content;
      
      expect(prompt).toContain('Check this out!');
      expect(prompt).toContain('A red apple on a table');
      expect(prompt).toContain('Pixel');
    });

    it('should use default models when not configured', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {}
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Reply' }
          }]
        })
      });

      await generateNaturalReply('msg', 'desc', runtime);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.model).toBe('tngtech/deepseek-r1t2-chimera:free');
      expect(callBody.temperature).toBe(0.8);
      expect(callBody.max_tokens).toBe(200);
    });

    it('should use default OpenAI model when configured', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENAI_API_KEY') return 'test-key';
          return null;
        }),
        character: {}
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Reply' }
          }]
        })
      });

      await generateNaturalReply('msg', 'desc', runtime);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.model).toBe('gpt-4o-mini');
    });

    it('should handle API error gracefully', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {}
      };

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await generateNaturalReply('msg', 'desc', runtime);

      expect(result).toBeNull();
    });

    it('should handle network error', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {}
      };

      fetchMock.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await generateNaturalReply('msg', 'desc', runtime);

      expect(result).toBeNull();
    });

    it('should return null when no API key available', async () => {
      const runtime = {
        getSetting: vi.fn(),
        character: {}
      };

      const result = await generateNaturalReply('msg', 'desc', runtime);

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle empty reply content', async () => {
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {}
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '' }
          }]
        })
      });

      const result = await generateNaturalReply('msg', 'desc', runtime);

      expect(result).toBeNull();
    });

    it('should truncate long character system prompts', async () => {
      const longSystem = 'A'.repeat(1000);
      const runtime = {
        getSetting: vi.fn((key) => {
          if (key === 'OPENROUTER_API_KEY') return 'test-key';
          return null;
        }),
        character: {
          system: longSystem
        }
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: 'Reply' }
          }]
        })
      });

      await generateNaturalReply('msg', 'desc', runtime);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      const prompt = callBody.messages[0].content;
      
      // Should be truncated to 500 characters
      expect(prompt).toContain('A'.repeat(500));
      expect(prompt).not.toContain('A'.repeat(501));
    });
  });
});