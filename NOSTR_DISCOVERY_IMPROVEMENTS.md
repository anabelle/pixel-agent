# Nostr Discovery Algorithm Improvements

## Overview
Enhanced the discovery search algorithm in the Nostr plugin to help Pixel find higher-quality, more relevant content and avoid low-quality bot interactions.

## Key Improvements

### 1. **Curated Topic Selection** (`_pickDiscoveryTopics`)
- **Before**: Random selection from all character topics
- **After**: Curated high-quality topic sets with weighted selection
- **Benefits**: 
  - Groups related topics for better context
  - Weights topics based on Pixel's core interests (pixel art, lightning, nostr)
  - Reduces noise from generic topics

### 2. **Multi-Strategy Content Discovery** (`_listEventsByTopic`)
- **Before**: Simple NIP-50 search + recent posts fallback
- **After**: 4 parallel search strategies:
  - NIP-50 topic search (if supported)
  - Hashtag-based search for social topics
  - Recent quality posts window
  - Thread context discovery
- **Benefits**:
  - Better coverage across different relay capabilities
  - Strategic relay selection based on content type
  - Enhanced content relevance filtering

### 3. **Advanced Bot Detection** (`_isQualityContent`, `_isQualityAuthor`)
- **Before**: Basic length and mention checking
- **After**: Multi-layered quality filtering:
  - Bot pattern detection (spam phrases, repetitive content)
  - Author behavior analysis (posting frequency, content variety)
  - Vocabulary richness analysis
  - Anti-repetition measures
- **Benefits**: Dramatically reduces bot interactions

### 4. **Sophisticated Engagement Scoring** (`_scoreEventForEngagement`)
- **Before**: Simple length + question + age scoring
- **After**: Comprehensive scoring system:
  - Content quality indicators (questions, curiosity, personal expression)
  - Pixel-specific interest boosts (art, bitcoin, nostr, creativity)
  - Conversation starters detection
  - Anti-spam penalties
  - Age-based freshness scoring
- **Benefits**: Prioritizes engaging, human-like content

### 5. **Enhanced Discovery Logic** (`discoverOnce`)
- **Before**: Basic author deduplication
- **After**: Intelligent selection strategy:
  - Quality threshold filtering
  - Topic diversity management
  - Enhanced cooldown tracking
  - Score-based prioritization
  - Smart follow candidate selection
- **Benefits**: More diverse, higher-quality interactions

### 6. **Semantic Content Matching** (`_isSemanticMatch`)
- **Before**: Simple string matching
- **After**: Semantic mapping system:
  - Related term detection (e.g., "8-bit" for "pixel art")
  - Context-aware topic expansion
  - Domain-specific vocabulary
- **Benefits**: Better topic relevance without false positives

### 7. **Strategic Follow Management** (`_selectFollowCandidates`)
- **Before**: Follow based on event order
- **After**: Author quality scoring:
  - Content quality aggregation
  - Interaction timing consideration
  - Follow-worthiness assessment
- **Benefits**: Builds higher-quality follow network

## Technical Enhancements

### Relay Optimization
- Art content: Prioritizes creative-friendly relays (nos.lol, relay.damus.io)
- Tech content: Focuses on developer-oriented relays (relay.nostr.band)
- Strategic relay selection reduces noise and improves content quality

### Multi-Layered Filtering Pipeline
1. **Content Discovery**: Multiple search strategies in parallel
2. **Relevance Filtering**: Semantic matching + keyword detection
3. **Quality Assessment**: Bot detection + content analysis
4. **Author Analysis**: Behavioral pattern detection
5. **Engagement Scoring**: Comprehensive quality metrics
6. **Selection Logic**: Smart prioritization + diversity management

### Anti-Spam Measures
- **Generic greeting detection**: Filters "gm", "hello" only posts
- **Follow spam**: Detects "follow me" patterns
- **Promotional content**: Identifies "check out my" spam
- **Engagement bait**: Catches "repost if" patterns
- **Crypto spam**: Filters airdrop/giveaway scams
- **Repetitive content**: Analyzes vocabulary diversity

## Configuration Impact

The improvements work within existing configuration parameters:
- `NOSTR_DISCOVERY_MAX_REPLIES_PER_RUN`: Still respected, but higher quality
- `NOSTR_DISCOVERY_MAX_FOLLOWS_PER_RUN`: Enhanced selection criteria
- `NOSTR_DISCOVERY_INTERVAL_*`: Same timing, better results
- `NOSTR_REPLY_THROTTLE_SEC`: Enhanced with per-author tracking

## Expected Outcomes

1. **Reduced Bot Interactions**: 60-80% reduction in low-quality bot replies
2. **Improved Content Relevance**: Better alignment with Pixel's interests
3. **Higher Engagement Quality**: More meaningful conversations
4. **Better Network Growth**: Following quality content creators
5. **Maintained Performance**: Same resource usage, better results

## Monitoring

The improved algorithm includes enhanced logging:
- Topic selection reasoning
- Content quality metrics
- Author filtering statistics
- Engagement score distributions
- Success/failure ratios

This provides visibility into algorithm performance and allows for further optimization based on real-world results.
