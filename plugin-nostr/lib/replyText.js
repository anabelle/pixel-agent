"use strict";

// Removed generic fallbacks to force LLM retries instead of spammy replies
function pickReplyTextFor(evt) {
  // Instead of falling back to generic replies, throw an error to trigger retry
  throw new Error('LLM generation failed, retry needed');
}

module.exports = { pickReplyTextFor };
