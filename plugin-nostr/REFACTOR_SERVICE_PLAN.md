# NostrService Refactoring Plan

**Created**: 2025-12-31  
**Last Updated**: 2025-12-31T14:46:00-05:00  
**Current State**: `lib/service.js` is 7,612 lines / 350KB with 187 outline items  
**Goal**: Break into focused, testable modules while maintaining backwards compatibility

---

## 🎯 Project Status Dashboard

| Metric | Value |
|--------|-------|
| **Overall Progress** | 0 / 13 modules |
| **Current Phase** | Not Started |
| **Active Task** | None |
| **Blocking Issues** | None |
| **Lines Remaining in service.js** | 7,612 |
| **Target Lines** | ~800 |

### Phase Progress

| Phase | Status | Modules Complete | Tests Passing |
|-------|--------|------------------|---------------|
| Phase 1: Helpers | ⬜ Not Started | 0/3 | — |
| Phase 2: Handlers | ⬜ Not Started | 0/3 | — |
| Phase 3: Generators | ⬜ Not Started | 0/3 | — |
| Phase 4: Core Loops | ⬜ Not Started | 0/3 | — |
| Phase 5: Cleanup | ⬜ Not Started | 0/1 | — |

**Status Legend**: ⬜ Not Started | 🟡 In Progress | ✅ Complete | 🔴 Blocked

---

## 📋 Task Tracker

### Phase 1: Helper Modules (Low Risk)

#### Task 1.1: Extract `threadContext.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/thread-context`

**Subtasks:**
- [ ] Create `lib/threadContext.js` with `ThreadContextResolver` class
- [ ] Extract `_getThreadContext()` (lines 4217-4427)
- [ ] Extract `_assessThreadContextQuality()` (lines 4429-4455)
- [ ] Extract `_shouldEngageWithThread()` (lines 4457-4523)
- [ ] Add constructor with dependency injection
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/threadContext.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Run `node test-comprehensive.js` - integration works
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 1.2: Extract `connectionManager.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/connection-manager`

**Subtasks:**
- [ ] Create `lib/connectionManager.js` with `NostrConnectionManager` class
- [ ] Extract `_setupConnection()` (lines 5678-5756)
- [ ] Extract `_startConnectionMonitoring()` (lines 5602-5614)
- [ ] Extract `_checkConnectionHealth()` (lines 5616-5630)
- [ ] Extract `_attemptReconnection()` (lines 5632-5676)
- [ ] Add event handler callbacks for `onMention`, `onZap`, `onDM`, `onSealedDM`
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/connectionManager.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 1.3: Extract `contactManager.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/contact-manager`

**Subtasks:**
- [ ] Create `lib/contactManager.js` with `ContactManager` class
- [ ] Extract `_loadCurrentContacts()` (lines 1728-1736)
- [ ] Extract `_loadMuteList()` (lines 1738-1770)
- [ ] Extract `_isUserMuted()` (lines 1772-1776)
- [ ] Extract `_publishContacts()` (lines 1827-1838)
- [ ] Extract `_publishMuteList()` (lines 1840-1852)
- [ ] Extract `muteUser()` (lines 1854-1896)
- [ ] Extract `unmuteUser()` (lines 1898-1923)
- [ ] Extract `_selectFollowCandidates()` (lines 1716-1726)
- [ ] Extract `_checkForUnfollowCandidates()` (lines 7319-7374)
- [ ] Extract `_unfollowUser()` (lines 7376-7405)
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/contactManager.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

### Phase 2: Handler Modules (Medium Risk)

#### Task 2.1: Extract `dmHandler.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/dm-handler`
- **Depends On**: Phase 1 complete

**Subtasks:**
- [ ] Create `lib/dmHandler.js` with `DMHandler` class
- [ ] Extract `handleDM()` (lines 5047-5319)
- [ ] Extract `handleSealedDM()` (lines 5321-5541)
- [ ] Extract `postDM()` (lines 4928-4974)
- [ ] Add NIP-04 and NIP-44 encryption handling
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/dmHandler.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 2.2: Expand `zapHandler.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/zap-handler`
- **Depends On**: Phase 1 complete

**Subtasks:**
- [ ] Add `ZapHandler` class to existing `lib/zapHandler.js`
- [ ] Extract `handleZap()` (lines 5003-5045)
- [ ] Extract `generateZapThanksTextLLM()` (lines 3346-3386)
- [ ] Extract `_buildZapThanksPrompt()` (line 3342)
- [ ] Create wrapper methods in `service.js`
- [ ] Add tests to `test/zapHandler.test.js` or create new file
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 2.3: Extract `mentionHandler.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/mention-handler`
- **Depends On**: Task 1.1 (threadContext)

**Subtasks:**
- [ ] Create `lib/mentionHandler.js` with `MentionHandler` class
- [ ] Extract `handleMention()` (lines 4557-4780)
- [ ] Extract `_isActualMention()` (lines 4131-4215)
- [ ] Extract `_isRelevantMention()` (lines 677-751)
- [ ] Extract `_analyzePostForInteraction()` (lines 618-675)
- [ ] Inject `ThreadContextResolver` dependency
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/mentionHandler.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: Requires Task 1.1 complete

---

### Phase 3: Generation Modules (Higher Risk)

#### Task 3.1: Extract `postGeneration.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/post-generation`
- **Depends On**: Phase 2 complete

**Subtasks:**
- [ ] Create `lib/postGeneration.js` with `PostGenerator` class
- [ ] Extract `pickPostText()` (lines 2187-2194)
- [ ] Extract `generatePostTextLLM()` (lines 2212-2669) - **LARGE: 457 lines**
- [ ] Extract `generateAwarenessPostTextLLM()` (lines 2671-3146) - **LARGE: 475 lines**
- [ ] Extract `startAwarenessDryRun()` (lines 3148-3303)
- [ ] Extract `generateDailyDigestPostText()` (lines 3305-3340)
- [ ] Extract `_buildPostPrompt()` (line 2198)
- [ ] Extract `_buildAwarenessPrompt()` (line 2199)
- [ ] Extract `_buildDailyDigestPostPrompt()` (line 2200)
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/postGeneration.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 3.2: Extract `replyGeneration.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/reply-generation`
- **Depends On**: Phase 2 complete

**Subtasks:**
- [ ] Create `lib/replyGeneration.js` with `ReplyGenerator` class
- [ ] Extract `generateReplyTextLLM()` (lines 3491-4041) - **LARGE: 550 lines**
- [ ] Extract `_buildReplyPrompt()` (lines 2201-2208)
- [ ] Extract `pickReplyTextFor()` (lines 4830-4833)
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/replyGeneration.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 3.3: Extract `quoteGeneration.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/quote-generation`
- **Depends On**: Phase 2 complete

**Subtasks:**
- [ ] Create `lib/quoteGeneration.js` with `QuoteGenerator` class
- [ ] Extract `generateQuoteTextLLM()` (lines 6091-6290)
- [ ] Extract `generateRepostRelevancyLLM()` (lines 6065-6089)
- [ ] Extract `postRepost()` (lines 6007-6031)
- [ ] Extract `postQuoteRepost()` (lines 6033-6063)
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/quoteGeneration.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

### Phase 4: Core Loop Modules (Highest Risk)

#### Task 4.1: Extract `timelineLore.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/timeline-lore`
- **Depends On**: Phase 3 complete

**Subtasks:**
- [ ] Create `lib/timelineLore.js` with `TimelineLoreProcessor` class
- [ ] Extract `_considerTimelineLoreCandidate()` (lines 6379-6461)
- [ ] Extract `_evaluateTimelineLoreCandidate()` (lines 6463-6637)
- [ ] Extract `_screenTimelineLoreWithLLM()` (lines 6639-6720)
- [ ] Extract `_addTimelineLoreCandidate()` (lines 6722-6737)
- [ ] Extract `_maybeTriggerTimelineLoreDigest()` (lines 6739-6772)
- [ ] Extract `_ensureTimelineLoreTimer()` (lines 6774-6793)
- [ ] Extract `_prepareTimelineLoreBatch()` (lines 6795-6825)
- [ ] Extract `_getStorylineBoost()` (lines 6827-6853)
- [ ] Extract `_processTimelineLoreBuffer()` (lines 6855-6928)
- [ ] Extract `_generateTimelineLoreSummary()` (lines 6930-7057)
- [ ] Extract JSON utilities: `_stripHtmlForLore`, `_extractJsonObject`, `_repairJsonString`
- [ ] Extract normalization: `_normalizeTimelineLoreDigest`, `_coerceLoreString`, `_coerceLoreStringArray`, `_truncateWords`
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/timelineLore.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

#### Task 4.2: Extract `homeFeedProcessor.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/home-feed`
- **Depends On**: Task 4.1 (timelineLore)

**Subtasks:**
- [ ] Create `lib/homeFeedProcessor.js` with `HomeFeedProcessor` class
- [ ] Extract `startHomeFeed()` (lines 5758-5822)
- [ ] Extract `scheduleNextHomeFeedCheck()` (lines 5824-5829)
- [ ] Extract `processHomeFeed()` (lines 5831-5996)
- [ ] Extract `handleHomeFeedEvent()` (lines 6292-6377)
- [ ] Extract `_chooseInteractionType()` (lines 5998-6005)
- [ ] Extract `_updateUserQualityScore()` (lines 7215-7238)
- [ ] Extract `_hasFullSentence()` (lines 7240-7255)
- [ ] Extract `_getUserSocialMetrics()` (lines 7257-7317)
- [ ] Inject `TimelineLoreProcessor` dependency
- [ ] Create wrapper methods in `service.js`
- [ ] Create `test/homeFeedProcessor.test.js`
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: Requires Task 4.1 complete

---

#### Task 4.3: Expand `discoveryEngine.js`
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/discovery-engine`
- **Depends On**: Phase 3 complete

**Subtasks:**
- [ ] Add `DiscoveryEngine` class to existing `lib/discovery.js` or create new file
- [ ] Move `DiscoveryMetrics` class (lines 124-156)
- [ ] Extract `discoverOnce()` (lines 1925-2068)
- [ ] Extract `_processDiscoveryReplies()` (lines 2070-2185)
- [ ] Extract `_pickDiscoveryTopics()` (line 1130, 1235)
- [ ] Extract `_expandTopicSearch()` (lines 1237-1248)
- [ ] Extract `_expandSearchParameters()` (lines 1250-1258)
- [ ] Extract `_listEventsByTopic()` (lines 1260-1285)
- [ ] Extract `_scoreEventForEngagement()` (lines 1287-1437) - **LARGE: 150 lines**
- [ ] Extract `_computeFreshnessPenalty()` (lines 1439-1600) - **LARGE: 161 lines**
- [ ] Extract `isSemanticMatchAsync()` (lines 1602-1612)
- [ ] Extract `_isSemanticMatch()` (lines 1614-1620)
- [ ] Extract `_isQualityContent()` (lines 1622-1699)
- [ ] Extract `_filterByAuthorQuality()` (lines 1701-1708)
- [ ] Extract `_isQualityAuthor()` (lines 1710-1712)
- [ ] Extract `_fetchRecentAuthorNotes()` (lines 1778-1823)
- [ ] Create wrapper methods in `service.js`
- [ ] Expand `test/discovery.test.js` or create new file
- [ ] Run `npm test` - all tests pass
- [ ] Update this tracker with completion status

**Blockers**: None

---

### Phase 5: Final Cleanup

#### Task 5.1: Service.js Cleanup & Final Integration
- **Status**: ⬜ Not Started
- **Assigned Agent**: —
- **Started**: —
- **Completed**: —
- **Branch**: `refactor/service-cleanup`
- **Depends On**: All previous phases complete

**Subtasks:**
- [ ] Remove all extracted method implementations (keep only wrappers)
- [ ] Verify all sub-modules are instantiated in constructor
- [ ] Clean up unused imports
- [ ] Organize remaining code: constructor, lifecycle, scheduling, wrappers
- [ ] Verify `service.js` is under 1000 lines
- [ ] Run full test suite: `npm test`
- [ ] Run integration tests: `node test-comprehensive.js`
- [ ] Run `node test-eliza-integration.js`
- [ ] Manual smoke test with live agent
- [ ] Update documentation
- [ ] Remove this task tracker or move to archive
- [ ] Merge all branches to main

**Blockers**: All previous tasks must be complete

---

## 🤖 Agent Handoff Protocol

### Before Starting a Task

1. **Check this tracker** - Verify the task is not already in progress
2. **Check dependencies** - Ensure prerequisite tasks are complete
3. **Update status** - Mark task as 🟡 In Progress
4. **Record agent ID** - Add your identifier to "Assigned Agent"
5. **Record timestamp** - Add start time to "Started"
6. **Create branch** - Use the branch name specified in the task

### During Task Execution

1. **Work incrementally** - Complete subtasks in order
2. **Check boxes** - Mark subtasks complete as you go: `- [x]`
3. **Document blockers** - Add any issues to the Blockers section
4. **Run tests frequently** - After each major subtask

### After Completing a Task

1. **Run all tests** - `npm test && node test-comprehensive.js`
2. **Update subtasks** - Ensure all checkboxes are marked
3. **Update status** - Mark task as ✅ Complete
4. **Record timestamp** - Add completion time to "Completed"
5. **Update dashboard** - Increment "Modules Complete" count
6. **Clear blockers** - Remove or resolve blocker notes
7. **Commit changes** - Push to the task branch

### Handoff Message Template

When handing off to another agent, include:
```
## Handoff: [Task ID]
- **Status**: [In Progress / Complete / Blocked]
- **Last Action**: [What was just done]
- **Next Action**: [What needs to happen next]
- **Files Modified**: [List of changed files]
- **Tests Status**: [Passing / Failing - which ones]
- **Notes**: [Any important context]
```

---

## 📝 Session Log

Record significant events, decisions, and handoffs here:

| Timestamp | Agent | Action | Notes |
|-----------|-------|--------|-------|
| 2025-12-31T14:46:00-05:00 | — | Plan created | Initial refactoring plan with 13 modules across 5 phases |

---

## ⚠️ Active Blockers

*None currently*

<!-- 
Template for adding blockers:
| Blocker ID | Task | Description | Severity | Resolution |
|------------|------|-------------|----------|------------|
| B001 | 2.3 | Missing type definitions | Medium | Need to add JSDoc types first |
-->

---

## Overview

The `NostrService` class has grown into a god-object handling:
- Connection management
- Discovery/engagement
- Post/reply/quote generation
- Home feed processing
- Timeline lore analysis
- DM handling
- Zap handling
- Contact/mute management
- Thread context resolution
- Scheduling
- Memory/stats tracking

## Refactoring Strategy

### Principles
1. **Incremental extraction** - One module at a time, test after each
2. **Dependency injection** - New modules receive `service` instance or specific dependencies
3. **Backwards compatibility** - Keep methods on `NostrService` as thin wrappers initially
4. **Test preservation** - Existing tests should continue to pass

### Execution Order
Start with "leaf" modules (few internal dependencies), work up to core:

```
Phase 1: Helpers (no service state needed)
    ↓
Phase 2: Handlers (receive events, use service)
    ↓
Phase 3: Generators (LLM text generation)
    ↓
Phase 4: Core loops (discovery, home feed)
```

---

## Phase 1: Helper Modules (Low Risk)

### 1.1 `lib/threadContext.js` (~300 lines)

**Extract methods:**
- `_getThreadContext(evt)` (lines 4217-4427)
- `_assessThreadContextQuality(threadEvents)` (lines 4429-4455)
- `_shouldEngageWithThread(evt, threadContext)` (lines 4457-4523)

**Dependencies needed:**
- `pool`, `relays` (for fetching)
- `pk` (self pubkey)
- `maxThreadContextEvents` config
- `logger`

**New API:**
```javascript
class ThreadContextResolver {
  constructor({ pool, relays, selfPubkey, maxEvents, logger }) {}
  async getThreadContext(evt) {}
  assessThreadContextQuality(threadEvents) {}
  shouldEngageWithThread(evt, threadContext) {}
}
```

**Integration in service.js:**
```javascript
this.threadResolver = new ThreadContextResolver({ ... });
// Wrapper for backwards compat:
_getThreadContext(evt) { return this.threadResolver.getThreadContext(evt); }
```

---

### 1.2 `lib/connectionManager.js` (~200 lines)

**Extract methods:**
- `_setupConnection()` (lines 5678-5756)
- `_startConnectionMonitoring()` (lines 5602-5614)
- `_checkConnectionHealth()` (lines 5616-5630)
- `_attemptReconnection()` (lines 5632-5676)

**Dependencies needed:**
- `pool`, `relays`
- `pk`, `sk` (for subscription filters)
- Event handlers: `onMention`, `onZap`, `onDM`, `onSealedDM`
- `logger`

**New API:**
```javascript
class NostrConnectionManager {
  constructor({ pool, relays, selfPubkey, handlers, logger }) {}
  setup() {}
  startMonitoring(intervalMs) {}
  checkHealth() {}
  reconnect() {}
  stop() {}
}
```

---

### 1.3 `lib/contactManager.js` (~350 lines)

**Extract methods:**
- `_loadCurrentContacts()` (lines 1728-1736)
- `_loadMuteList()` (lines 1738-1770)
- `_isUserMuted(pubkey)` (lines 1772-1776)
- `_publishContacts(newSet)` (lines 1827-1838)
- `_publishMuteList(newSet)` (lines 1840-1852)
- `muteUser(pubkey)` (lines 1854-1896)
- `unmuteUser(pubkey)` (lines 1898-1923)
- `_selectFollowCandidates(...)` (lines 1716-1726)
- `_checkForUnfollowCandidates()` (lines 7319-7374)
- `_unfollowUser(pubkey)` (lines 7376-7405)

**Dependencies needed:**
- `pool`, `relays`
- `pk`, `sk`, `_finalizeEvent`
- `logger`

**New API:**
```javascript
class ContactManager {
  constructor({ pool, relays, selfPubkey, secretKey, finalizeEvent, logger }) {}
  async loadContacts() {}
  async loadMuteList() {}
  isUserMuted(pubkey) {}
  async muteUser(pubkey) {}
  async unmuteUser(pubkey) {}
  async followUser(pubkey) {}
  async unfollowUser(pubkey) {}
  selectFollowCandidates(scoredEvents, currentContacts, options) {}
  checkForUnfollowCandidates() {}
}
```

---

## Phase 2: Handler Modules (Medium Risk)

### 2.1 `lib/dmHandler.js` (~500 lines)

**Extract methods:**
- `handleDM(evt)` (lines 5047-5319)
- `handleSealedDM(evt)` (lines 5321-5541)
- `postDM(recipientEvt, text)` (lines 4928-4974)

**Dependencies needed:**
- `runtime` (for LLM calls, memory)
- `pool`, `relays`, `pk`, `sk`
- `nip04`, `nip44` (encryption)
- `_finalizeEvent`, `_createMemorySafe`
- `handledEventIds`
- `logger`

**New API:**
```javascript
class DMHandler {
  constructor({ runtime, pool, relays, keys, eventUtils, logger }) {}
  async handleDM(evt) {}
  async handleSealedDM(evt) {}
  async sendDM(recipientPubkey, text) {}
}
```

---

### 2.2 `lib/zapHandler.js` (expand existing, ~150 lines total)

**Current file**: Just utility functions  
**Add methods from service.js:**
- `handleZap(evt)` (lines 5003-5045)
- `generateZapThanksTextLLM(amountMsats, senderInfo)` (lines 3346-3386)
- `_buildZapThanksPrompt(amountMsats, senderInfo)` (line 3342)

**Dependencies needed:**
- `runtime` (for LLM)
- `postReply` function
- Existing zap utilities
- `logger`

---

### 2.3 `lib/mentionHandler.js` (~400 lines)

**Extract methods:**
- `handleMention(evt)` (lines 4557-4780)
- `_isActualMention(evt)` (lines 4131-4215)
- `_isRelevantMention(evt)` (lines 677-751)
- `_analyzePostForInteraction(evt)` (lines 618-675)

**Dependencies needed:**
- `runtime`, `pool`, `pk`
- `threadResolver` (from Phase 1)
- `generateReplyTextLLM` (or interface to it)
- `postReply`, `postReaction`
- `handledEventIds`, `inFlightReplies`
- `logger`

---

## Phase 3: Generation Modules (Higher Risk - LLM Logic)

### 3.1 `lib/postGeneration.js` (~1,100 lines)

**Extract methods:**
- `pickPostText()` (lines 2187-2194)
- `generatePostTextLLM(options)` (lines 2212-2669)
- `generateAwarenessPostTextLLM()` (lines 2671-3146)
- `startAwarenessDryRun()` (lines 3148-3303)
- `generateDailyDigestPostText(report)` (lines 3305-3340)
- `_buildPostPrompt(...)` (line 2198)
- `_buildAwarenessPrompt(...)` (line 2199)
- `_buildDailyDigestPostPrompt(report)` (line 2200)

**Dependencies needed:**
- `runtime` (for LLM, character data)
- `contextAccumulator`, `narrativeContextProvider`, `selfReflection`
- `storylineTracker`, `semanticAnalyzer`
- `postOnce` callback
- Config: topics, timing settings
- `logger`

**New API:**
```javascript
class PostGenerator {
  constructor({ runtime, context, config, logger }) {}
  async pickPostText() {}
  async generatePostTextLLM(options) {}
  async generateAwarenessPostTextLLM() {}
  async generateDailyDigestPostText(report) {}
  dryRunAwareness() {}
}
```

---

### 3.2 `lib/replyGeneration.js` (~600 lines)

**Extract methods:**
- `generateReplyTextLLM(evt, roomId, threadContext, imageContext)` (lines 3491-4041)
- `_buildReplyPrompt(...)` (lines 2201-2208)
- `pickReplyTextFor(evt)` (lines 4830-4833)

**Dependencies needed:**
- `runtime` (for LLM, memory)
- `contextAccumulator`, `narrativeContextProvider`
- `userProfileManager`, `userHistoryProvider`
- `imageVision` (for image context)
- Config settings
- `logger`

---

### 3.3 `lib/quoteGeneration.js` (~300 lines)

**Extract methods:**
- `generateQuoteTextLLM(evt)` (lines 6091-6290)
- `generateRepostRelevancyLLM(evt)` (lines 6065-6089)
- `postRepost(parentEvt)` (lines 6007-6031)
- `postQuoteRepost(parentEvt, quoteTextOverride)` (lines 6033-6063)

**Dependencies needed:**
- `runtime` (for LLM)
- `pool`, `relays`, `_finalizeEvent`
- `logger`

---

## Phase 4: Core Loop Modules (Highest Risk)

### 4.1 `lib/timelineLore.js` (~800 lines)

**Extract methods (16 total):**
- `_considerTimelineLoreCandidate(evt, context)` (lines 6379-6461)
- `_evaluateTimelineLoreCandidate(...)` (lines 6463-6637)
- `_screenTimelineLoreWithLLM(content, heuristics)` (lines 6639-6720)
- `_addTimelineLoreCandidate(candidate)` (lines 6722-6737)
- `_maybeTriggerTimelineLoreDigest(force)` (lines 6739-6772)
- `_ensureTimelineLoreTimer(min, max)` (lines 6774-6793)
- `_prepareTimelineLoreBatch(limit)` (lines 6795-6825)
- `_getStorylineBoost(item)` (lines 6827-6853)
- `_processTimelineLoreBuffer(force)` (lines 6855-6928)
- `_generateTimelineLoreSummary(batch)` (lines 6930-7057)
- `_stripHtmlForLore(text)` (lines 7059-7073)
- `_extractJsonObject(raw)` (lines 7075-7124)
- `_repairJsonString(str)` (lines 7126-7146)
- `_normalizeTimelineLoreDigest(parsed, rankedTags)` (lines 7148-7181)
- `_coerceLoreString(value)` (lines 7183-7193)
- `_coerceLoreStringArray(value, limit)` (lines 7195-7206)
- `_truncateWords(str, maxWords)` (lines 7208-7213)

**New API:**
```javascript
class TimelineLoreProcessor {
  constructor({ runtime, storylineTracker, config, logger }) {}
  considerCandidate(evt, context) {}
  processBuffer(force) {}
  getDigest() {}
  // ... internal methods
}
```

---

### 4.2 `lib/homeFeedProcessor.js` (~550 lines)

**Extract methods:**
- `startHomeFeed()` (lines 5758-5822)
- `scheduleNextHomeFeedCheck()` (lines 5824-5829)
- `processHomeFeed()` (lines 5831-5996)
- `handleHomeFeedEvent(evt)` (lines 6292-6377)
- `_chooseInteractionType()` (lines 5998-6005)
- `_updateUserQualityScore(pubkey, evt)` (lines 7215-7238)
- `_hasFullSentence(text)` (lines 7240-7255)
- `_getUserSocialMetrics(pubkey)` (lines 7257-7317)

**Dependencies needed:**
- `pool`, `relays`, `pk`
- `contacts` set
- `contextAccumulator`
- `timelineLore` processor
- Post/react/quote methods
- `logger`

---

### 4.3 `lib/discoveryEngine.js` (expand existing, ~1,200 lines)

**Current `discovery.js`**: Basic discovery list utilities  
**Add methods from service.js:**
- `discoverOnce()` (lines 1925-2068)
- `_processDiscoveryReplies(...)` (lines 2070-2185)
- `_pickDiscoveryTopics()` (line 1130, 1235)
- `_expandTopicSearch()` (lines 1237-1248)
- `_expandSearchParameters(round)` (lines 1250-1258)
- `_listEventsByTopic(topic, searchParams)` (lines 1260-1285)
- `_scoreEventForEngagement(evt)` (lines 1287-1437)
- `_computeFreshnessPenalty(...)` (lines 1439-1600)
- `isSemanticMatchAsync(content, topic)` (lines 1602-1612)
- `_isSemanticMatch(content, topic)` (lines 1614-1620)
- `_isQualityContent(event, topic, strictness)` (lines 1622-1699)
- `_filterByAuthorQuality(events, strictness)` (lines 1701-1708)
- `_isQualityAuthor(authorEvents)` (lines 1710-1712)
- `_fetchRecentAuthorNotes(pubkey, limit)` (lines 1778-1823)
- `DiscoveryMetrics` class (lines 124-156)

---

## Phase 5: Final Service.js Cleanup

After all extractions, `service.js` should contain:
1. **Constructor** - Initialize all sub-modules
2. **Lifecycle** - `start()`, `stop()`
3. **Scheduling** - Timer setup for posts, discovery, digests
4. **Thin wrappers** - Delegate to sub-modules
5. **State** - Shared state like `handledEventIds`, counters

**Target size**: ~800-1000 lines (down from 7,612)

---

## Testing Strategy

### Per-Module Tests
Each new module should have its own test file:
```
test/
  threadContext.test.js
  connectionManager.test.js
  contactManager.test.js
  dmHandler.test.js
  postGeneration.test.js
  replyGeneration.test.js
  timelineLore.test.js
  homeFeedProcessor.test.js
  discoveryEngine.test.js
```

### Integration Tests
Keep existing `test-*.js` files working by maintaining wrapper methods on `NostrService`.

### Validation After Each Phase
```bash
# After each module extraction:
npm test                    # All tests pass
node test-comprehensive.js  # Integration still works
```

---

## Risk Mitigation

1. **Git branches**: One branch per phase, merge after validation
2. **Feature flags**: If needed, env var to use old vs new code paths
3. **Logging**: Add trace logs during transition to catch behavioral differences
4. **Rollback plan**: Old code preserved in git, can revert any phase

---

## Estimated Effort

| Phase | Modules | Lines Moved | Effort |
|-------|---------|-------------|--------|
| 1 | threadContext, connectionManager, contactManager | ~850 | 2-3 hrs |
| 2 | dmHandler, zapHandler, mentionHandler | ~1,050 | 3-4 hrs |
| 3 | postGeneration, replyGeneration, quoteGeneration | ~2,000 | 4-5 hrs |
| 4 | timelineLore, homeFeedProcessor, discoveryEngine | ~2,550 | 5-6 hrs |
| 5 | Cleanup & final testing | - | 2-3 hrs |

**Total**: ~16-21 hours of focused work

---

## File Structure After Refactor

```
lib/
├── service.js              # ~800 lines - orchestration only
├── threadContext.js        # Thread fetching & analysis
├── connectionManager.js    # WebSocket/pool management
├── contactManager.js       # Follow/mute list management
├── dmHandler.js            # DM send/receive
├── zapHandler.js           # Zap handling (expanded)
├── mentionHandler.js       # Mention detection & response
├── postGeneration.js       # Autonomous post creation
├── replyGeneration.js      # Reply text generation
├── quoteGeneration.js      # Quote/repost generation
├── timelineLore.js         # Timeline observation & digests
├── homeFeedProcessor.js    # Home feed monitoring
├── discoveryEngine.js      # Topic discovery (expanded)
├── contextAccumulator.js   # (existing)
├── narrativeMemory.js      # (existing)
├── selfReflection.js       # (existing)
├── ... other existing files
```

---

## Next Steps

When ready to execute:
1. Start with Phase 1.1 (`threadContext.js`) - lowest risk, clear boundaries
2. Extract, test, commit
3. Proceed to next module
4. After each phase, run full test suite

**Command to watch for regressions:**
```bash
cd /home/ana/Code/pixel/pixel-agent/plugin-nostr
npm test && node test-comprehensive.js
```
