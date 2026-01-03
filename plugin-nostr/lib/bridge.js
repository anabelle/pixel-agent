// Lightweight bridge so external modules can request a Nostr post
// Also provides feed export for Syntropy to read agent's activity
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Location of the bridge files inside the agent container.
// These are mounted to ./data/eliza/ on the host.
const BRIDGE_FILE = '/app/.eliza/nostr_bridge.jsonl';
const FEED_EXPORT_FILE = '/app/.eliza/nostr_feed_export.json';
const MENTIONS_EXPORT_FILE = '/app/.eliza/nostr_mentions_export.json';

// In-memory store for recent posts and mentions (maintained by service)
let recentPosts = [];
let recentMentions = [];
let postIds = new Set(); // Fast lookup for dedup
let mentionIds = new Set(); // Fast lookup for dedup
let lastExportTime = 0;
let lastMentionsExportTime = 0;

/**
 * Hydrate in-memory stores from persisted files on startup
 * This prevents duplicates across container restarts
 */
function hydrate() {
  // Hydrate posts
  try {
    if (fs.existsSync(FEED_EXPORT_FILE)) {
      const data = JSON.parse(fs.readFileSync(FEED_EXPORT_FILE, 'utf-8'));
      if (Array.isArray(data.posts)) {
        recentPosts = data.posts.slice(-50); // Keep last 50
        postIds = new Set(recentPosts.map(p => p.id));
        console.log(`[Bridge] Hydrated ${recentPosts.length} posts from file`);
      }
    }
  } catch (err) {
    console.warn('[Bridge] Failed to hydrate posts:', err.message);
  }

  // Hydrate mentions
  try {
    if (fs.existsSync(MENTIONS_EXPORT_FILE)) {
      const data = JSON.parse(fs.readFileSync(MENTIONS_EXPORT_FILE, 'utf-8'));
      if (Array.isArray(data.mentions)) {
        recentMentions = data.mentions.slice(-100); // Keep last 100
        mentionIds = new Set(recentMentions.map(m => m.id));
        console.log(`[Bridge] Hydrated ${recentMentions.length} mentions from file`);
      }
    }
  } catch (err) {
    console.warn('[Bridge] Failed to hydrate mentions:', err.message);
  }
}

// Hydrate on module load
hydrate();

class BridgeEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20);
    this.on('error', (err) => {
      console.warn('[Bridge] Event error:', err.message);
    });
    console.log('[Bridge] Initialization: File-based watcher starting at', BRIDGE_FILE);
    this.startWatcher();
  }

  startWatcher() {
    // Check for bridge file periodically (every 5 seconds)
    // This allows cross-process communication without shared memory
    setInterval(() => {
      try {
        if (fs.existsSync(BRIDGE_FILE)) {
          const content = fs.readFileSync(BRIDGE_FILE, 'utf-8');
          // Immediately unlink to "consume" the message and prevent loops
          try { fs.unlinkSync(BRIDGE_FILE); } catch { }

          const lines = content.split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const payload = JSON.parse(line);
              if (payload.text) {
                console.log('[Bridge] Consumed external post request from file');
                this.emit('external.post', payload);
              }
            } catch (e) {
              console.warn('[Bridge] Failed to parse bridge line:', e.message);
            }
          }
        }
      } catch (err) {
        // Silent fail for watcher
      }
    }, 5000);
  }

  // Override emit to add validation
  emit(event, payload) {
    if (event === 'external.post') {
      if (!payload?.text?.trim()) return false;
      if (payload.text.length > 2000) return false; // Sanity check
    }
    return super.emit(event, payload);
  }
}

const emitter = new BridgeEmitter();

/**
 * Record a post to the feed export (called by service after publishing)
 * @param {Object} post - The post data {id, content, created_at, kind}
 */
function recordPost(post) {
  if (!post || !post.id) return;

  // Don't add duplicates
  if (postIds.has(post.id)) return;

  const record = {
    id: post.id,
    content: post.content || '',
    created_at: post.created_at || Math.floor(Date.now() / 1000),
    kind: post.kind || 1
  };

  recentPosts.push(record);
  postIds.add(post.id);

  // Keep only last 50 posts in memory
  if (recentPosts.length > 50) {
    const removed = recentPosts.shift();
    if (removed) postIds.delete(removed.id);
  }

  // Export to file (debounced - at most every 10 seconds)
  const now = Date.now();
  if (now - lastExportTime > 10000) {
    exportFeed();
    lastExportTime = now;
  }
}

/**
 * Record a mention to the mentions export (called by service when handling mentions)
 * @param {Object} mention - The mention data {id, pubkey, content, created_at}
 */
function recordMention(mention) {
  if (!mention || !mention.id) return;

  // Don't add duplicates (O(1) Set lookup)
  if (mentionIds.has(mention.id)) return;

  const record = {
    id: mention.id,
    pubkey: mention.pubkey || '',
    content: mention.content || '',
    created_at: mention.created_at || Math.floor(Date.now() / 1000)
  };

  recentMentions.push(record);
  mentionIds.add(mention.id);

  // Keep only last 100 mentions in memory
  if (recentMentions.length > 100) {
    const removed = recentMentions.shift();
    if (removed) mentionIds.delete(removed.id);
  }

  // Export to file (debounced - at most every 10 seconds)
  const now = Date.now();
  if (now - lastMentionsExportTime > 10000) {
    exportMentions();
    lastMentionsExportTime = now;
  }
}

/**
 * Export current feed to JSON file for Syntropy to read
 */
function exportFeed() {
  try {
    const exportData = {
      exported_at: new Date().toISOString(),
      posts: recentPosts.slice().sort((a, b) => b.created_at - a.created_at)
    };

    // Atomic write: write to temp file first, then rename
    const tempFile = FEED_EXPORT_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(exportData, null, 2));
    fs.renameSync(tempFile, FEED_EXPORT_FILE);
  } catch (err) {
    console.warn('[Bridge] Failed to export feed:', err.message);
  }
}

/**
 * Export current mentions to JSON file for Syntropy to read
 */
function exportMentions() {
  try {
    const exportData = {
      exported_at: new Date().toISOString(),
      mentions: recentMentions.slice().sort((a, b) => b.created_at - a.created_at)
    };

    // Atomic write: write to temp file first, then rename
    const tempFile = MENTIONS_EXPORT_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(exportData, null, 2));
    fs.renameSync(tempFile, MENTIONS_EXPORT_FILE);
  } catch (err) {
    console.warn('[Bridge] Failed to export mentions:', err.message);
  }
}

/**
 * Get current feed (for internal use)
 */
function getFeed() {
  return recentPosts.slice().sort((a, b) => b.created_at - a.created_at);
}

/**
 * Get current mentions (for internal use)
 */
function getMentions() {
  return recentMentions.slice().sort((a, b) => b.created_at - a.created_at);
}

module.exports = {
  emitter,
  safeEmit: (ev, p) => emitter.emit(ev, p),
  recordPost,
  recordMention,
  exportFeed,
  exportMentions,
  getFeed,
  getMentions,
  FEED_EXPORT_FILE,
  MENTIONS_EXPORT_FILE
};
