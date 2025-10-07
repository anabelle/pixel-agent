// Centralized posting queue for natural, rate-limited post scheduling
// Prevents unnatural batching and ensures organic timing between all posts

const logger = require('./utils').logger || console;

class PostingQueue {
  constructor(config = {}) {
    this.queue = [];
    this.isProcessing = false;
    this.lastPostTime = 0;
    
    // Configurable delays (in milliseconds)
    this.minDelayBetweenPosts = config.minDelayBetweenPosts || 15000; // 15 seconds minimum
    this.maxDelayBetweenPosts = config.maxDelayBetweenPosts || 120000; // 2 minutes maximum
    this.mentionPriorityBoost = config.mentionPriorityBoost || 5000; // Mentions wait less
    
    // Priority levels
    this.priorities = {
      CRITICAL: 0,   // Pixel purchases, direct mentions
      HIGH: 1,       // Replies to mentions
      MEDIUM: 2,     // Discovery replies, home feed interactions
      LOW: 3,        // Scheduled posts
    };
    
    this.stats = {
      processed: 0,
      queued: 0,
      dropped: 0,
    };
  }

  /**
   * Add a post to the queue
   * @param {Object} postTask
   * @param {string} postTask.type - 'mention', 'discovery', 'homefeed', 'scheduled', 'pixel'
   * @param {Function} postTask.action - Async function that executes the post
   * @param {string} postTask.id - Unique identifier for deduplication
   * @param {number} postTask.priority - Priority level (CRITICAL, HIGH, MEDIUM, LOW)
   * @param {Object} postTask.metadata - Optional metadata for logging
   */
  async enqueue(postTask) {
    const { type, action, id, priority = this.priorities.MEDIUM, metadata = {} } = postTask;

    if (!action || typeof action !== 'function') {
      logger.warn('[QUEUE] Invalid post action, skipping');
      return false;
    }

    // Deduplication check
    if (this.queue.some(task => task.id === id)) {
      logger.debug(`[QUEUE] Duplicate post ${id} rejected`);
      this.stats.dropped++;
      return false;
    }

    // Queue size limit to prevent memory issues
    if (this.queue.length >= 50) {
      logger.warn('[QUEUE] Queue at capacity (50), dropping lowest priority task');
      const lowestPriorityIndex = this.queue.reduce((minIdx, task, idx, arr) => 
        task.priority > arr[minIdx].priority ? idx : minIdx, 0);
      this.queue.splice(lowestPriorityIndex, 1);
      this.stats.dropped++;
    }

    const task = {
      type,
      action,
      id,
      priority,
      metadata,
      queuedAt: Date.now(),
    };

    this.queue.push(task);
    this.stats.queued++;

    // Sort queue by priority (lower number = higher priority)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // If same priority, older tasks first
      return a.queuedAt - b.queuedAt;
    });

    logger.info(`[QUEUE] Enqueued ${type} post (id: ${id.slice(0, 8)}, priority: ${priority}, queue: ${this.queue.length})`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this._processQueue();
    }

    return true;
  }

  /**
   * Process the queue sequentially with natural delays
   */
  async _processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      
      try {
        // Calculate delay since last post
        const now = Date.now();
        const timeSinceLastPost = now - this.lastPostTime;
        
        // Determine required delay based on priority
        let requiredDelay = this.minDelayBetweenPosts;
        
        if (task.priority === this.priorities.CRITICAL || task.priority === this.priorities.HIGH) {
          // High priority posts get shorter delays
          requiredDelay = Math.max(this.minDelayBetweenPosts - this.mentionPriorityBoost, 3000); // Min 3s
        } else {
          // Lower priority posts get longer delays for natural spacing
          requiredDelay = this.minDelayBetweenPosts + (Math.random() * (this.maxDelayBetweenPosts - this.minDelayBetweenPosts));
        }

        // Wait if needed
        if (timeSinceLastPost < requiredDelay) {
          const waitTime = requiredDelay - timeSinceLastPost;
          logger.info(`[QUEUE] Waiting ${Math.round(waitTime / 1000)}s before posting (natural spacing)`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Execute the post action
        logger.info(`[QUEUE] Processing ${task.type} post (id: ${task.id.slice(0, 8)}, waited: ${Math.round((Date.now() - task.queuedAt) / 1000)}s)`);
        
        const result = await task.action();
        
        if (result) {
          this.lastPostTime = Date.now();
          this.stats.processed++;
          logger.info(`[QUEUE] Successfully posted ${task.type} (total processed: ${this.stats.processed})`);
        } else {
          logger.warn(`[QUEUE] Post action failed for ${task.type} (id: ${task.id.slice(0, 8)})`);
        }

      } catch (error) {
        logger.error(`[QUEUE] Error processing ${task.type} post: ${error.message}`);
      }

      // Add a small random delay between queue items for natural feel
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }

    this.isProcessing = false;
    logger.debug(`[QUEUE] Queue empty, processing stopped. Stats: ${JSON.stringify(this.stats)}`);
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      stats: { ...this.stats },
      nextPost: this.queue.length > 0 ? {
        type: this.queue[0].type,
        priority: this.queue[0].priority,
        waitTime: Math.round((Date.now() - this.queue[0].queuedAt) / 1000),
      } : null,
    };
  }

  /**
   * Clear all queued posts (emergency use)
   */
  clear() {
    const dropped = this.queue.length;
    this.queue = [];
    this.stats.dropped += dropped;
    logger.warn(`[QUEUE] Cleared ${dropped} queued posts`);
  }
}

module.exports = { PostingQueue };
