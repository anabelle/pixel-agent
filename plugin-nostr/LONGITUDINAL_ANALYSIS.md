# Longitudinal Analysis Feature

## Overview

The Self-Reflection Engine has been extended with longitudinal analysis capabilities that enable the agent to:

- Compare current reflections to older ones spanning weeks or months
- Detect deeper patterns and long-term evolution
- Surface recurring issues that persist across time periods
- Identify persistent strengths that demonstrate consistency
- Track evolution trends showing improvements, regressions, and new challenges

## Key Features

### 1. Long-Term Reflection History
The `getLongTermReflectionHistory()` method retrieves reflections spanning up to 90 days (configurable) to provide a comprehensive view of the agent's evolution over time.

```javascript
const history = await engine.getLongTermReflectionHistory({
  limit: 20,      // number of reflections to retrieve
  maxAgeDays: 90  // how far back to look
});
```

### 2. Longitudinal Pattern Analysis
The `analyzeLongitudinalPatterns()` method processes historical reflections to identify:

- **Recurring Issues**: Weaknesses that appear across multiple time periods
- **Persistent Strengths**: Positive patterns that remain consistent over time
- **Evolving Patterns**: Behavioral trends that span different periods
- **Evolution Trends**: Changes including:
  - Strengths gained (new positive behaviors)
  - Weaknesses resolved (issues that were addressed)
  - New challenges (recently emerged issues)
  - Stagnant areas (persistent unresolved issues)

```javascript
const analysis = await engine.analyzeLongitudinalPatterns({
  limit: 20,
  maxAgeDays: 90
});
```

### 3. Enhanced Prompts
When performing self-reflection analysis, the engine now automatically includes longitudinal insights in the prompt, giving the LLM context about:

- How many times specific issues have recurred
- Which strengths have been consistent
- Whether current behavior aligns with the evolution trajectory
- If the agent is reverting to old patterns

### 4. Metadata Storage
Longitudinal analysis results are stored alongside regular reflection data, including:

- Recurring issues count and specific issues
- Persistent strengths count and specific strengths
- Evolution trends summary
- Timespan covered by the analysis

## Time Period Classification

Reflections are grouped into four periods for analysis:

- **Recent**: Last 7 days
- **One Week Ago**: 7-14 days ago
- **One Month Ago**: 14-35 days ago (3-5 weeks)
- **Older**: More than 35 days ago

## Usage in Self-Reflection Analysis

The longitudinal analysis is automatically integrated into the `analyzeInteractionQuality()` method and can be controlled via options:

```javascript
const result = await engine.analyzeInteractionQuality({
  limit: 40,
  enableLongitudinal: true,  // enabled by default
  reflectionHistoryLimit: 3,
  reflectionHistoryMaxAgeHours: 24 * 14
});
```

To disable longitudinal analysis for a specific call:

```javascript
const result = await engine.analyzeInteractionQuality({
  enableLongitudinal: false
});
```

## Example Output

```javascript
{
  timespan: {
    oldestReflection: '2025-07-20T00:00:00.000Z',
    newestReflection: '2025-10-13T00:00:00.000Z',
    totalReflections: 15
  },
  recurringIssues: [
    {
      issue: 'verbose replies',
      occurrences: 5,
      periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo'],
      severity: 'ongoing'
    }
  ],
  persistentStrengths: [
    {
      strength: 'friendly tone',
      occurrences: 12,
      periodsCovered: ['recent', 'oneWeekAgo', 'oneMonthAgo', 'older'],
      consistency: 'stable'
    }
  ],
  evolutionTrends: {
    strengthsGained: ['concise replies', 'better timing'],
    weaknessesResolved: ['slow response'],
    newChallenges: ['emoji overuse'],
    stagnantAreas: ['sometimes off-topic']
  },
  periodBreakdown: {
    recent: 3,
    oneWeekAgo: 4,
    oneMonthAgo: 5,
    older: 3
  }
}
```

## Benefits

1. **Better Self-Awareness**: The agent can see patterns that span weeks or months, not just recent interactions
2. **Targeted Improvements**: Recurring issues are highlighted for focused attention
3. **Recognition of Progress**: The agent can see which issues have been successfully resolved
4. **Consistency Tracking**: Persistent strengths are recognized and reinforced
5. **Evolution Insights**: Clear view of how the agent's behavior is changing over time

## Testing

Run the demonstration script to see the feature in action:

```bash
cd plugin-nostr
node demo-longitudinal-analysis.js
```

Run the test suite:

```bash
npm test -- selfReflection.longitudinal.test.js
```

## Implementation Details

- Pattern matching uses text normalization to identify similar issues/strengths even if wording varies slightly
- Time periods are calculated dynamically based on reflection timestamps
- The feature gracefully handles sparse data (returns null if insufficient history)
- Longitudinal analysis is cached and only regenerated when needed
- All metadata is persisted for future reference and debugging
