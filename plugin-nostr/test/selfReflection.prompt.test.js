const { SelfReflectionEngine } = require('../lib/selfReflection');

describe('SelfReflectionEngine prompt construction', () => {
  const runtime = {
    getSetting: () => null
  };

  it('weaves conversation context, feedback, signals, and prior reflections into the prompt', () => {
    const engine = new SelfReflectionEngine(runtime, console, {});

    const interactions = [
      {
        userMessage: 'hey pixel, your last drop was wild',
        yourReply: 'grateful! what stood out for you?',
        engagement: 'avg=0.72, success=80%',
        conversation: [
          {
            id: 'parent-1',
            role: 'user',
            author: 'npub1234…abcd',
            text: 'hey pixel, your last drop was wild',
            type: 'nostr_mention',
            createdAtIso: '2025-10-05T10:00:00.000Z'
          },
          {
            id: 'reply-1',
            role: 'you',
            author: 'you',
            text: 'grateful! what stood out for you?',
            createdAtIso: '2025-10-05T10:01:00.000Z',
            isReply: true
          },
          {
            id: 'follow-1',
            role: 'user',
            author: 'npub1234…abcd',
            text: 'the glitch intro, keep that energy!',
            createdAtIso: '2025-10-05T10:03:00.000Z'
          }
        ],
        feedback: [
          {
            author: 'npub1234…abcd',
            summary: 'the glitch intro, keep that energy!',
            createdAtIso: '2025-10-05T10:03:00.000Z'
          }
        ],
        signals: ['zap_thanks: ⚡ 2100 sats gratitude burst'],
        metadata: {
          pubkey: 'npub1234…abcd',
          replyId: 'reply-1',
          createdAtIso: '2025-10-05T10:01:00.000Z',
          participants: ['npub1234…abcd', 'you']
        }
      }
    ];

    const previousReflections = [
      {
        generatedAtIso: '2025-10-04T12:00:00.000Z',
        strengths: ['warm acknowledgements'],
        weaknesses: ['answers drift long'],
        recommendations: ['ask clarifying questions sooner'],
        patterns: ['defaulting to pixel metaphors'],
        improvements: ['more direct closing questions'],
        regressions: ['still stacking three emojis']
      }
    ];

    const prompt = engine._buildPrompt(interactions, {
      contextSignals: ['pixel_drop_digest @ 2025-10-05T08:00:00.000Z: community hyped about glitch art'],
      previousReflections
    });

    expect(prompt).toContain('RECENT SELF-REFLECTION INSIGHTS');
    expect(prompt).toContain('CROSS-MEMORY SIGNALS');
    expect(prompt).toContain('Conversation excerpt');
    expect(prompt).toContain('Follow-up / feedback');
    expect(prompt).toContain('zap_thanks');
    expect(prompt).toContain('regressions');
    expect(prompt).toContain('improvements');
  });

  it('includes longitudinal analysis section when provided', () => {
    const engine = new SelfReflectionEngine(runtime, console, {});

    const interactions = [
      {
        userMessage: 'test message',
        yourReply: 'test reply',
        engagement: 'avg=0.5',
        conversation: [],
        feedback: [],
        signals: [],
        metadata: { createdAtIso: '2025-10-05T10:00:00.000Z' }
      }
    ];

    const longitudinalAnalysis = {
      timespan: {
        oldestReflection: '2025-07-01T00:00:00.000Z',
        newestReflection: '2025-10-01T00:00:00.000Z',
        totalReflections: 15
      },
      recurringIssues: [
        {
          issue: 'verbose replies',
          occurrences: 5,
          severity: 'ongoing',
          periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo']
        }
      ],
      persistentStrengths: [
        {
          strength: 'friendly tone',
          occurrences: 8,
          consistency: 'stable',
          periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo', 'older']
        }
      ],
      evolvingPatterns: [],
      evolutionTrends: {
        strengthsGained: ['concise opening'],
        weaknessesResolved: ['slow response'],
        newChallenges: ['emoji overuse'],
        stagnantAreas: ['verbose replies']
      },
      periodBreakdown: {
        recent: 3,
        oneWeekAgo: 4,
        oneMonthAgo: 5,
        older: 3
      }
    };

    const prompt = engine._buildPrompt(interactions, {
      contextSignals: [],
      previousReflections: [],
      longitudinalAnalysis
    });

    expect(prompt).toContain('LONGITUDINAL ANALYSIS');
    expect(prompt).toContain('15 reflections');
    expect(prompt).toContain('RECURRING ISSUES');
    expect(prompt).toContain('verbose replies');
    expect(prompt).toContain('5x');
    expect(prompt).toContain('PERSISTENT STRENGTHS');
    expect(prompt).toContain('friendly tone');
    expect(prompt).toContain('EVOLUTION TRENDS');
    expect(prompt).toContain('Strengths gained');
    expect(prompt).toContain('concise opening');
    expect(prompt).toContain('Weaknesses resolved');
    expect(prompt).toContain('slow response');
    expect(prompt).toContain('New challenges');
    expect(prompt).toContain('emoji overuse');
    expect(prompt).toContain('Stagnant areas');
    expect(prompt).toContain('long-term view');
  });
});
