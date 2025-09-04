# Thread Context Fix for Nostr Discovery

## Problem Description

The agent was experiencing a "funny artifact" where during discovery cycles, it would find replies in long threads and think those messages were directed at it, causing random and contextually inappropriate responses. The agent was only seeing the last message in a thread without understanding the full conversation context.

## Root Cause Analysis

The issue was in two parts:

1. **Subscription Filter**: The agent subscribes to events with `{ kinds: [1], '#p': [agentPubkey] }`, which correctly receives any text note that mentions the agent in p-tags. However, in Nostr threading (NIP-10), when someone replies to a thread that previously mentioned the agent, their reply will also include the agent's pubkey in the p-tags even if the reply isn't directed at the agent.

2. **Lack of Thread Context**: The discovery system was processing individual events without fetching or analyzing the full thread context, leading to responses that seemed random or out of place.

## Solution Implemented

### 1. Enhanced Mention Detection (`_isActualMention`)

Added intelligent logic to distinguish between:
- **Direct mentions**: Where the agent is explicitly mentioned by name or npub
- **Thread protocol inclusion**: Where the agent's pubkey appears in p-tags only due to threading protocol

Key heuristics:
- Check for explicit name/npub mentions in content
- Analyze p-tag position (if agent is 3rd+ recipient, likely thread inclusion)
- Consider e-tag presence (no e-tags = root post mentioning agent)

### 2. Thread Context Fetching (`_getThreadContext`)

New method that:
- Uses NIP-10 parsing to identify root and parent events
- Fetches related events to build full thread context
- Assesses context quality based on:
  - Thread length and content variety
  - Recent activity
  - Topic coherence
  - Content depth

### 3. Smart Engagement Decision (`_shouldEngageWithThread`)

Enhanced logic that decides whether to engage based on:
- **Thread relevance**: Checks for keywords related to agent's interests (art, pixel, Bitcoin, Lightning, etc.)
- **Context quality**: Won't engage if thread context is too poor to understand
- **Thread depth**: Avoids jumping into very long threads (5+ messages)
- **Content quality**: Filters out bot patterns and very short/long content
- **Entry point assessment**: Identifies good conversation entry points

### 4. Thread-Aware Response Generation

Updated the reply generation to:
- Include full thread context in the prompt
- Generate responses that are aware of the conversation flow
- Provide better contextual relevance

## Benefits

✅ **Contextual Awareness**: Agent now understands full thread context before responding
✅ **Reduced Random Replies**: Filters out thread replies that aren't actually directed at the agent  
✅ **Better Engagement**: Only engages with threads about relevant topics
✅ **Natural Conversation Flow**: Responses are more contextually appropriate
✅ **Quality Control**: Avoids engaging with low-quality or bot-generated content

## Technical Implementation

### Key Files Modified:
- `lib/service.js`: Core logic for thread detection and context fetching
- `lib/text.js`: Enhanced prompt building with thread context

### New Methods Added:
- `_isActualMention(evt)`: Determines if event is a real mention vs thread inclusion
- `_getThreadContext(evt)`: Fetches and analyzes full thread context
- `_assessThreadContextQuality(threadEvents)`: Scores thread context quality
- `_shouldEngageWithThread(evt, threadContext)`: Decides whether to engage

### Enhanced Methods:
- `_processDiscoveryReplies()`: Now uses thread context for better decisions
- `generateReplyTextLLM()`: Accepts optional thread context parameter
- `buildReplyPrompt()`: Includes thread context in prompt generation

## Testing

Comprehensive test suite added (`test-thread-aware-discovery.js`) that verifies:
- High-quality root posts are engaged with
- Thread replies with good context are handled appropriately
- Deep threads with irrelevant content are avoided
- Low-quality content is filtered out
- Bitcoin/Lightning/art topics are prioritized

## Result

The agent now provides much more engaging and contextually appropriate responses in discovery mode, understanding the full conversation before deciding to participate rather than jumping in randomly at the end of long threads.
