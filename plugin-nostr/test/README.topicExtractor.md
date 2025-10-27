# TopicExtractor Test Coverage

This document describes the comprehensive test coverage for `topicExtractor.js`.

## Test File

- **File**: `test/topicExtractor.test.js`
- **Test Cases**: 73+
- **Coverage Target**: 100%

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run only topicExtractor tests
npm test -- test/topicExtractor.test.js
```

## Test Categories

### 1. Constructor & Initialization (3 tests)
Tests the initialization of the TopicExtractor with various configurations.

### 2. Basic Extraction (7 tests)
- Empty and null content handling
- Short post detection and fast extraction fallback
- Long post processing
- Unicode and emoji support
- Topic count limits

### 3. Keyword Processing (10 tests)
- Keyword identification
- Stopword filtering
- Special character handling
- Case normalization
- Whitespace trimming
- URL and nostr URI removal
- Numeric filtering
- Generic word filtering
- Length constraints

### 4. Topic Normalization (4 tests)
- Duplicate removal
- Topic variation handling
- Punctuation cleanup
- Bullet point removal

### 5. Hashtag Handling (6 tests)
- Hashtag extraction
- Format normalization
- Multi-word hashtag support
- Unicode hashtag support
- Forbidden word filtering
- Ignored terms filtering

### 6. Fast Topic Extraction (7 tests)
- Hashtag extraction fallback
- @mention extraction
- Nostr entity detection
- URL domain extraction
- Bigram generation
- Forbidden word filtering
- Deduplication

### 7. Caching (7 tests)
- Cache hit/miss behavior
- TTL expiration
- LRU eviction
- Expired entry cleanup
- Cache key generation
- Key consistency
- Key uniqueness

### 8. Batching (7 tests)
- Batch accumulation
- Full batch processing
- Error handling in batch mode
- Single event processing
- Hashtag merging with batch results
- Fallback when no topics returned
- Error recovery

### 9. LLM Integration (7 tests)
- String response handling
- Object response handling
- "none" response handling
- Content truncation
- Runtime availability checks
- useModel availability checks
- Error handling

### 10. Utility Methods (3 tests)
- Full sentence detection
- Comma-separated clause detection
- Short content rejection

### 11. Stats and Lifecycle (4 tests)
- Statistics tracking
- Cache hit rate calculation
- Resource cleanup (destroy)
- Pending batch flushing

### 12. Edge Cases (8 tests)
- Malformed hashtag handling
- Null value sanitization
- Concurrent batch processing
- Empty batch response lines
- Batch response with numbering
- Invalid URL handling
- Error recovery and continuation
- Type validation

### 13. Integration Scenarios (3 tests)
- Real-world post processing
- Mixed language content
- Thread processing

## Method Coverage

All methods are tested:

### Public Methods
- `constructor(runtime, logger, options)` - 3 tests
- `extractTopics(event)` - 20+ tests covering all paths
- `getStats()` - 2 tests
- `destroy()` - 1 test
- `flush()` - 1 test

### Private Methods
- `_processBatch()` - 10+ tests
- `_extractBatch(events)` - 8+ tests
- `_extractSingle(event)` - 8+ tests
- `_extractFastTopics(event)` - 7 tests
- `_extractHashtags(event)` - 6 tests
- `_sanitizeTopic(t)` - 10 tests
- `_hasFullSentence(content)` - 3 tests
- `_getCacheKey(content)` - 2 tests
- `_setCache(key, topics)` - 3 tests
- `_cleanupCache()` - 1 test

## Code Path Coverage

All conditional branches and loops are covered:

### Conditionals
- ✅ Empty/null content
- ✅ Short message detection
- ✅ Cache hit/miss
- ✅ Batch size threshold
- ✅ Batch timer logic
- ✅ Runtime availability
- ✅ Single vs batch extraction
- ✅ String vs object response
- ✅ Topic filtering
- ✅ Fallback paths
- ✅ Error handling

### Loops
- ✅ Batch processing
- ✅ Topic sanitization
- ✅ Cache cleanup
- ✅ Hashtag extraction
- ✅ Bigram generation
- ✅ Domain extraction

## Testing Patterns

1. **Unit Tests**: Individual method testing with mocks
2. **Integration Tests**: End-to-end scenarios
3. **Edge Cases**: Boundary conditions
4. **Error Handling**: Graceful degradation
5. **Concurrency**: Parallel execution

## Mock Objects

Tests use minimal, focused mocks:

```javascript
mockRuntime = {
  useModel: vi.fn(),
  getSetting: vi.fn()
};

mockLogger = {
  debug: vi.fn(),
  warn: vi.fn()
};
```

## Coverage Goals

- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

## Maintenance

When modifying `topicExtractor.js`:

1. Run tests to ensure no regressions
2. Add tests for new functionality
3. Update edge case tests if logic changes
4. Verify coverage remains at 100%

## Related Tests

- `test/manual-topic-extract.js` - Manual integration tests
- `test/test-topic-evolution.js` - Topic evolution tests
- `test/contextAccumulator.topTopics.test.js` - Integration with context accumulator

## Performance Considerations

Tests verify:
- Batch processing reduces LLM calls
- Caching prevents redundant processing
- Fast extraction provides quick fallback
- Statistics track optimization opportunities
