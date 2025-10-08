import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostingQueue } from '../lib/postingQueue';

describe('PostingQueue', () => {
  let originalRandom;

  beforeEach(() => {
    vi.useFakeTimers();
    originalRandom = Math.random;
    Math.random = vi.fn(() => 0);
  });

  afterEach(() => {
    Math.random = originalRandom;
    vi.useRealTimers();
  });

  const flushQueue = async () => {
    await vi.runAllTimersAsync();
  };

  it('processes tasks according to priority', async () => {
    const queue = new PostingQueue({
      minDelayBetweenPosts: 1000,
      maxDelayBetweenPosts: 2000,
      mentionPriorityBoost: 500,
    });

    const order = [];
    const mkTask = (label, priority) => ({
      type: label,
      id: label,
      priority,
      action: async () => {
        order.push(label);
        return true;
      },
    });

    await queue.enqueue(mkTask('low', queue.priorities.LOW));
    await queue.enqueue(mkTask('critical', queue.priorities.CRITICAL));
    await queue.enqueue(mkTask('medium', queue.priorities.MEDIUM));
    await queue.enqueue(mkTask('high', queue.priorities.HIGH));

    await flushQueue();

    expect(order).toEqual(['critical', 'high', 'medium', 'low']);
    const status = queue.getStatus();
    expect(status.stats.processed).toBe(4);
    expect(status.queueLength).toBe(0);
  });

  it('deduplicates tasks with same id', async () => {
    const queue = new PostingQueue();
    const action = vi.fn(async () => true);

    const first = await queue.enqueue({
      type: 'test',
      id: 'duplicate',
      priority: queue.priorities.HIGH,
      action,
    });

    const second = await queue.enqueue({
      type: 'test',
      id: 'duplicate',
      priority: queue.priorities.HIGH,
      action,
    });

    await flushQueue();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    expect(queue.getStatus().stats.dropped).toBe(1);
  });

  it('respects minimum delay between posts', async () => {
    const queue = new PostingQueue({
      minDelayBetweenPosts: 2000,
      maxDelayBetweenPosts: 2000,
    });

    const timestamps = [];
    const mkTask = (id) => ({
      type: 'rate',
      id,
      priority: queue.priorities.MEDIUM,
      action: async () => {
        timestamps.push(Date.now());
        return true;
      },
    });

    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    await queue.enqueue(mkTask('a'));
    await queue.enqueue(mkTask('b'));
    await queue.enqueue(mkTask('c'));

    await flushQueue();

    expect(timestamps.length).toBe(3);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(2000);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(2000);
  });
});
