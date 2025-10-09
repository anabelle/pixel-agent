# Topic Analysis & Narrative Summaries

This document describes how the Nostr plugin extracts topics from posts and generates hourly and daily narrative summaries that adapt over time.

## Overview

- Per-event topic extraction using a lightweight text model
- Hourly narrative built over a sliding window of recent events
- Daily narrative with higher context and larger sample size
- Topic diversity metrics computed and passed to the LLM prompt
- Per-topic sampled posts to ground the analysis in real content

## Per-Event Topic Extraction

- For each eligible post, the plugin slices up to ~800 characters from the post body and asks the small text model to return 1–3 concise topics.
- The output is forced to CSV-style topics with a low token budget for speed and cost-effectiveness.
- Environment bounds:
  - CONTEXT_LLM_TOPIC_MAXLEN (default 1000) – hard cap for topic prompt input length
  - CONTEXT_LLM_SENTIMENT_MAXLEN (default 1000) – sentiment helper bound (if used)

## Hourly Narrative (Sliding Window)

- The hourly summary considers only the most recent events, not all history.
- The window size is controlled by LLM_HOURLY_POOL_SIZE (default 200). New posts replace older ones as time goes on, so summaries naturally change.
- Computed topic metrics included in the LLM prompt:
  - Unique topics and total topic mentions
  - Top-3 concentration: the share of mentions captured by the three most frequent topics
  - Diversity via Herfindahl–Hirschman Index (HHI), plus a qualitative label (fragmented, moderate, concentrated)
- Per-topic samples: up to a few representative snippets for each top topic to ground the model’s reasoning.

## Daily Narrative

- Daily summaries use larger per-event slices (e.g., ~400 chars per event) and a larger total content budget to provide broader context.
- They complement the hourlies by capturing slower-moving trends and longer-form reflections.

## Configuration

Add or override these environment variables (via your character settings or process env):

```bash
# Per-post LLM bounds (used by topic/sentiment helpers)
CONTEXT_LLM_SENTIMENT_MAXLEN=1000    # Max chars passed for sentiment analysis
CONTEXT_LLM_TOPIC_MAXLEN=1000        # Max chars passed for topic analysis input cap

# Narrative summarization bounds
LLM_NARRATIVE_SAMPLE_SIZE=800        # Max events to sample/iterate for narratives
LLM_NARRATIVE_MAX_CONTENT=30000      # Max total characters packed into narrative prompts

# Hourly sliding-window size
LLM_HOURLY_POOL_SIZE=200             # Number of most-recent events considered hourly
```

## Behavior and Tuning

- Adapts with time: Because it uses a sliding window, the hourly narrative updates as new posts arrive. If a single topic truly dominates, the prompt calls out high concentration rather than hiding it.
- To make summaries more dynamic: lower LLM_HOURLY_POOL_SIZE (more responsive) or raise it (more stable).
- To reduce cost: lower LLM_NARRATIVE_MAX_CONTENT and/or LLM_NARRATIVE_SAMPLE_SIZE.
- To improve topic quality: ensure character style/examples bias toward specific, non-generic topics.
- To curb noisy trend injection: raise CONTEXT_EMERGING_STORY_CONTEXT_MIN_MENTIONS (default 10) or CONTEXT_EMERGING_STORY_CONTEXT_MIN_USERS (default 5). Lower them if you want the agent to react to fresher, low-volume topics.

## Future Options (Optional Enhancements)

- Count-based trigger: Only generate the hourly narrative after at least N new posts (e.g., LLM_HOURLY_MIN_EVENTS=100).
- Recency decay: Down-weight older events so new topics rise faster.
- Diversity cap/novelty boost: Soft limits on single-topic dominance and extra weight for emerging topics.
- Topic aliasing: Normalize variants (e.g., bitcoin/BTC) to reduce fragmentation.
