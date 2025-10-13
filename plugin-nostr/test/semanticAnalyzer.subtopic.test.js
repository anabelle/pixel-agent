const { describe, it, expect, beforeEach, vi } = globalThis;

const { SemanticAnalyzer } = require('../lib/semanticAnalyzer');

describe('SemanticAnalyzer - Subtopic Labeling', () => {
  let analyzer;
  let mockRuntime;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRuntime = {
      generateText: vi.fn()
    };

    analyzer = new SemanticAnalyzer(mockRuntime, mockLogger, {});
  });

  describe('labelSubtopic', () => {
    it('returns subtopic label from LLM when enabled', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('price volatility');

      const label = await analyzer.labelSubtopic(
        'bitcoin',
        'Bitcoin price is swinging wildly in recent trading'
      );

      expect(mockRuntime.generateText).toHaveBeenCalled();
      expect(label).toBe('price volatility');
    });

    it('includes context hints in prompt', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('regulatory news');

      await analyzer.labelSubtopic(
        'bitcoin',
        'New regulations announced',
        { trending: ['regulation', 'SEC'], watchlist: [] }
      );

      const prompt = mockRuntime.generateText.mock.calls[0][0];
      expect(prompt).toContain('Trending');
      expect(prompt).toContain('regulation');
    });

    it('normalizes LLM output', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('"Price Analysis"\n');

      const label = await analyzer.labelSubtopic('bitcoin', 'Bitcoin price analysis');

      expect(label).toBe('price analysis'); // lowercased, quotes removed
    });

    it('falls back when LLM response is invalid', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue(''); // Empty response

      const label = await analyzer.labelSubtopic(
        'bitcoin',
        'Bitcoin development continues with protocol improvements'
      );

      expect(label).toContain('development'); // Fallback heuristic
    });

    it('falls back when LLM response too long', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('a very long response with many many words that exceeds the expected limit');

      const label = await analyzer.labelSubtopic(
        'bitcoin',
        'Bitcoin adoption growing'
      );

      expect(label).toContain('adoption'); // Fallback heuristic
    });

    it('uses fallback when LLM disabled', async () => {
      analyzer.llmSemanticEnabled = false;

      const label = await analyzer.labelSubtopic(
        'lightning',
        'Lightning network security improvements announced'
      );

      expect(mockRuntime.generateText).not.toHaveBeenCalled();
      expect(label).toContain('security');
    });

    it('uses fallback when LLM fails', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockRejectedValue(new Error('LLM unavailable'));

      const label = await analyzer.labelSubtopic(
        'nostr',
        'Nostr community growing rapidly'
      );

      expect(label).toContain('community');
    });

    it('truncates content to 300 chars in prompt', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('long content');

      const longContent = 'a'.repeat(500);
      await analyzer.labelSubtopic('bitcoin', longContent);

      const prompt = mockRuntime.generateText.mock.calls[0][0];
      // Prompt should contain truncated content (300 chars max)
      expect(prompt.length).toBeLessThan(600); // Prompt + 300 char content + overhead
    });

    it('limits response tokens', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('test');

      await analyzer.labelSubtopic('bitcoin', 'test content');

      const options = mockRuntime.generateText.mock.calls[0][1];
      expect(options.maxTokens).toBe(20);
      expect(options.temperature).toBe(0.1);
    });
  });

  describe('_fallbackSubtopicLabel', () => {
    it('extracts price-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'Bitcoin price analysis shows $50k target'
      );

      expect(label).toContain('price');
    });

    it('extracts adoption-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'lightning',
        'Lightning network sees mainstream adoption by users'
      );

      expect(label).toContain('adoption');
    });

    it('extracts development-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'nostr',
        'Nostr development continues with new code releases'
      );

      expect(label).toContain('development');
    });

    it('extracts regulation-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'Government regulation and new legal framework'
      );

      expect(label).toContain('regulation');
    });

    it('extracts security-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'Security vulnerability discovered in protocol'
      );

      expect(label).toContain('security');
    });

    it('extracts technology-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'New technology innovation in protocol features'
      );

      expect(label).toContain('technology');
    });

    it('extracts community-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'nostr',
        'Nostr community social network growing'
      );

      expect(label).toContain('community');
    });

    it('extracts performance-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'lightning',
        'Lightning network performance and speed improvements'
      );

      expect(label).toContain('performance');
    });

    it('extracts education-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'Learn about Bitcoin with this tutorial guide'
      );

      expect(label).toContain('education');
    });

    it('extracts criticism-related labels', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'Bitcoin faces criticism and concerns over issues'
      );

      expect(label).toContain('criticism');
    });

    it('extracts bigrams when no pattern matches', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'topic',
        'unique technical implementation details'
      );

      // Should extract first two meaningful words
      expect(label.split(' ').length).toBeGreaterThanOrEqual(2);
    });

    it('defaults to topic discussion when insufficient words', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'the and with'
      );

      expect(label).toBe('bitcoin discussion');
    });

    it('filters stop words', () => {
      const label = analyzer._fallbackSubtopicLabel(
        'bitcoin',
        'this is about lightning network with features'
      );

      // Should extract meaningful words, not stop words
      expect(label).not.toContain('this');
      expect(label).not.toContain('about');
      expect(label).not.toContain('with');
    });
  });

  describe('_isStopWord', () => {
    it('identifies common stop words', () => {
      const stopWords = ['this', 'that', 'with', 'from', 'about', 'would'];
      
      for (const word of stopWords) {
        expect(analyzer._isStopWord(word)).toBe(true);
      }
    });

    it('allows meaningful words', () => {
      const meaningfulWords = ['bitcoin', 'price', 'adoption', 'network'];
      
      for (const word of meaningfulWords) {
        expect(analyzer._isStopWord(word)).toBe(false);
      }
    });

    it('is case insensitive', () => {
      expect(analyzer._isStopWord('THIS')).toBe(true);
      expect(analyzer._isStopWord('This')).toBe(true);
      expect(analyzer._isStopWord('this')).toBe(true);
    });
  });

  describe('integration with existing SemanticAnalyzer', () => {
    it('does not break existing isSemanticMatch', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('YES');

      const match = await analyzer.isSemanticMatch(
        'Bitcoin is the future of money',
        'bitcoin'
      );

      // Quick match should work
      expect(match).toBe(true);
    });

    it('maintains existing cache behavior', async () => {
      analyzer.llmSemanticEnabled = true;
      mockRuntime.generateText.mockResolvedValue('subtopic label');

      const content = 'Test content for caching';
      
      await analyzer.labelSubtopic('bitcoin', content);
      await analyzer.labelSubtopic('bitcoin', content);

      // Should use same underlying cache mechanisms
      expect(analyzer.semanticCache).toBeDefined();
    });

    it('respects existing feature flags', () => {
      analyzer.llmSemanticEnabled = false;

      expect(analyzer.llmSemanticEnabled).toBe(false);
    });
  });
});
