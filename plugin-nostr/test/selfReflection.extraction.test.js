const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine JSON and Markdown Extraction', () => {
  let engine;
  const runtime = {
    getSetting: () => null
  };

  beforeEach(() => {
    engine = new SelfReflectionEngine(runtime, console, {});
  });

  describe('_extractJson with valid JSON', () => {
    it('extracts valid JSON with all required fields', () => {
      const response = `{
        "strengths": ["Good engagement", "Witty replies"],
        "weaknesses": ["Too verbose", "Overusing emojis"],
        "patterns": ["Starting with questions"],
        "recommendations": ["Be more concise"],
        "exampleGoodReply": "That's a great point!",
        "exampleBadReply": "Well, you see, I think that maybe perhaps...",
        "regressions": ["Less concise than before"],
        "improvements": ["Better topic awareness"]
      }`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toEqual(["Good engagement", "Witty replies"]);
      expect(result.weaknesses).toEqual(["Too verbose", "Overusing emojis"]);
      expect(result.recommendations).toEqual(["Be more concise"]);
    });

    it('extracts JSON embedded in text', () => {
      const response = `Here is my analysis:
      
      {
        "strengths": ["Concise replies"],
        "weaknesses": ["Missing context"],
        "recommendations": ["Add more detail"],
        "patterns": []
      }
      
      That's my reflection.`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toEqual(["Concise replies"]);
    });

    it('returns null for JSON missing required fields', () => {
      // This should fail validation and try markdown fallback
      const response = `{
        "thoughts": "Just some random thoughts",
        "summary": "A summary"
      }`;

      const result = engine._extractJson(response);
      expect(result).toBeNull();
    });
  });

  describe('_extractJson with markdown fallback', () => {
    it('extracts from markdown with headers and bullet points', () => {
      const response = `## Self-Reflection Analysis

### Strengths:
- Good engagement with users
- Witty and memorable replies
- Consistent personality

### Weaknesses:
- Sometimes too verbose
- Overusing certain phrases

### Recommendations:
- Be more concise in responses
- Vary sentence structures`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toContain('Good engagement with users');
      expect(result.strengths).toContain('Witty and memorable replies');
      expect(result.weaknesses).toContain('Sometimes too verbose');
      expect(result.recommendations).toContain('Be more concise in responses');
    });

    it('extracts from markdown with different label formats', () => {
      const response = `**What you're doing well:**
- Engaging authentically
- Quick response time

**What needs improvement:**
- Could be more concise
- Missing follow-up questions

**Actionable changes:**
- Trim responses by 30%
- Ask clarifying questions`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('extracts quoted examples from markdown', () => {
      const response = `## Analysis

Strengths:
- Good tone

Weaknesses:
- Too long

Best reply: "Short and sweet"
Worst reply: "Well, actually, if you think about it from multiple perspectives..."

Recommendations:
- Keep it brief`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.exampleGoodReply).toBe('Short and sweet');
      expect(result.exampleBadReply).toContain('Well, actually');
    });

    it('extracts improvements and regressions', () => {
      const response = `## Reflection

Strengths:
- Better focus

Weaknesses:
- Still verbose

Areas where you improved:
- Topic awareness
- Response timing

Where you slipped:
- Conciseness
- Emoji overuse

Recommendations:
- Continue improving`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.improvements.length).toBeGreaterThan(0);
      expect(result.regressions.length).toBeGreaterThan(0);
    });

    it('returns null when markdown has insufficient data', () => {
      const response = `This is just a general comment about the conversation.
      Nothing specific to extract here.
      Maybe some thoughts.`;

      const result = engine._extractJson(response);
      expect(result).toBeNull();
    });
  });

  describe('_isValidReflection', () => {
    it('returns true for valid reflection structure', () => {
      const analysis = {
        strengths: ['Good'],
        weaknesses: ['Bad'],
        recommendations: ['Do better']
      };
      expect(engine._isValidReflection(analysis)).toBe(true);
    });

    it('returns false when missing required arrays', () => {
      expect(engine._isValidReflection({ strengths: ['Good'] })).toBe(false);
      expect(engine._isValidReflection({ strengths: 'not array', weaknesses: [], recommendations: [] })).toBe(false);
      expect(engine._isValidReflection(null)).toBe(false);
      expect(engine._isValidReflection({})).toBe(false);
    });
  });

  describe('_hasMinimalReflectionData', () => {
    it('returns true when at least 2 fields have data', () => {
      expect(engine._hasMinimalReflectionData({
        strengths: ['Good'],
        weaknesses: ['Bad'],
        recommendations: [],
        patterns: []
      })).toBe(true);
    });

    it('returns false when less than 2 fields have data', () => {
      expect(engine._hasMinimalReflectionData({
        strengths: ['Good'],
        weaknesses: [],
        recommendations: [],
        patterns: []
      })).toBe(false);
    });

    it('returns false for null or non-object', () => {
      expect(engine._hasMinimalReflectionData(null)).toBe(false);
      expect(engine._hasMinimalReflectionData('string')).toBe(false);
    });
  });

  describe('_extractFieldsFromMarkdown edge cases', () => {
    it('handles asterisk bullets', () => {
      const text = `Strengths:
* First strength
* Second strength`;

      const result = engine._extractFieldsFromMarkdown(text);
      expect(result.strengths).toContain('First strength');
      expect(result.strengths).toContain('Second strength');
    });

    it('handles unicode bullets', () => {
      const text = `Weaknesses:
• First issue
• Second issue`;

      const result = engine._extractFieldsFromMarkdown(text);
      expect(result.weaknesses).toContain('First issue');
      expect(result.weaknesses).toContain('Second issue');
    });

    it('handles semicolon-separated items', () => {
      const text = `Patterns: using "well"; starting with questions; emoji overuse`;

      const result = engine._extractFieldsFromMarkdown(text);
      // Should extract items after header
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('returns empty arrays for missing sections', () => {
      const text = `Just some random text without any sections`;
      
      const result = engine._extractFieldsFromMarkdown(text);
      expect(result.strengths).toEqual([]);
      expect(result.weaknesses).toEqual([]);
      expect(result.recommendations).toEqual([]);
    });

    it('handles null/undefined/empty input', () => {
      expect(engine._extractFieldsFromMarkdown(null)).toBeNull();
      expect(engine._extractFieldsFromMarkdown(undefined)).toBeNull();
      // Empty string is technically a valid string, but guard treats it as falsy
      expect(engine._extractFieldsFromMarkdown('')).toBeNull();
    });

    it('filters out very short items (length <= 3)', () => {
      const text = `Strengths:
- OK
- A valid strength item
- Yes
- No`;

      const result = engine._extractFieldsFromMarkdown(text);
      expect(result.strengths).toEqual(['A valid strength item']);
      expect(result.strengths).not.toContain('OK');
      expect(result.strengths).not.toContain('Yes');
      expect(result.strengths).not.toContain('No');
    });

    it('does not match "your" as "you\'re"', () => {
      const text = `What your doing well:
- This should NOT match as strengths

Strengths:
- This should match`;

      const result = engine._extractFieldsFromMarkdown(text);
      // "your" should not match the you're pattern
      expect(result.strengths).not.toContain('This should NOT match as strengths');
      expect(result.strengths).toContain('This should match');
    });
  });

  describe('integration: mixed JSON and markdown scenarios', () => {
    it('prefers valid JSON over markdown', () => {
      const response = `## Analysis

Strengths:
- From markdown

{
  "strengths": ["From JSON"],
  "weaknesses": ["From JSON"],
  "recommendations": ["From JSON"]
}`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toEqual(["From JSON"]);
    });

    it('falls back to markdown when JSON is malformed', () => {
      const response = `## Analysis

{
  "strengths": ["Valid array",
  // oops, bad JSON
}

Strengths:
- Fallback strength
- Another strength

Weaknesses:
- Fallback weakness

Recommendations:
- Fallback recommendation`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toContain('Fallback strength');
    });

    it('falls back to markdown when JSON missing required fields', () => {
      const response = `{
  "notes": "This is not a valid reflection format"
}

But here's the real analysis:

Strengths:
- Actual strength

Weaknesses:
- Actual weakness

Recommendations:
- Actual recommendation`;

      const result = engine._extractJson(response);
      expect(result).not.toBeNull();
      expect(result.strengths).toContain('Actual strength');
    });
  });
});
