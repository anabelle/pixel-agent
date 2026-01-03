import { describe, it, expect, vi } from 'vitest';
import { NostrService } from '../lib/service.js';
import { ThreadContextResolver } from '../lib/threadContext.js';

const makeEvent = (id, created, tags = [], content = '') => ({
  id,
  pubkey: `${id}-pk`,
  content,
  created_at: created,
  tags
});

describe('NostrService thread context harvesting', () => {
  it('collects ancestor, sibling, and descendant events for a mention thread', async () => {
    const root = makeEvent('root', 100, []);
    const reply1 = makeEvent('reply-1', 110, [[ 'e', 'root', '', 'root' ]]);
    const sibling = makeEvent('sibling', 115, [[ 'e', 'root', '', 'root' ]]);
    const reply2 = makeEvent('reply-2', 120, [[ 'e', 'root', '', 'root' ], [ 'e', 'reply-1', '', 'reply' ]]);
    const target = makeEvent('target', 130, [[ 'e', 'root', '', 'root' ], [ 'e', 'reply-2', '', 'reply' ], [ 'p', 'bot-pubkey' ]], 'hey @pixel');
    const child = makeEvent('child', 140, [[ 'e', 'target', '', 'reply' ]], 'follow-up');
    const grand = makeEvent('grand', 150, [[ 'e', 'child', '', 'reply' ]], 'deep reply');

    const events = [root, reply1, sibling, reply2, target, child, grand];
    const byId = new Map(events.map(evt => [evt.id, evt]));
    const byReference = new Map();

    const addReference = (ref, evt) => {
      if (!byReference.has(ref)) {
        byReference.set(ref, []);
      }
      byReference.get(ref).push(evt);
    };

    for (const evt of events) {
      for (const tag of evt.tags || []) {
        if (tag?.[0] === 'e' && tag[1]) {
          addReference(tag[1], evt);
        }
      }
    }

    const listMock = vi.fn(async (_relays, filters) => {
      const results = [];
      const pushUnique = (event) => {
        if (!event) return;
        if (!results.some(existing => existing.id === event.id)) {
          results.push(event);
        }
      };

      for (const filter of filters) {
        if (Array.isArray(filter?.ids)) {
          for (const id of filter.ids) {
            pushUnique(byId.get(id));
          }
        }
        if (Array.isArray(filter?.['#e'])) {
          for (const id of filter['#e']) {
            const referenced = byReference.get(id) || [];
            for (const evt of referenced) {
              pushUnique(evt);
            }
          }
        }
      }
      return results;
    });

    const service = {
      pool: {},
      relays: ['wss://test.relay'],
      maxThreadContextEvents: 12,
      threadContextFetchRounds: 4,
      threadContextFetchBatch: 3,
      _list: listMock,
      _assessThreadContextQuality: NostrService.prototype._assessThreadContextQuality,
      threadResolver: new ThreadContextResolver({
        pool: {},
        relays: ['wss://test.relay'],
        maxEvents: 12,
        maxRounds: 4,
        batchSize: 3,
        list: listMock,
        logger: console
      })
    };

    const context = await NostrService.prototype._getThreadContext.call(service, target);

    expect(listMock).toHaveBeenCalled();
    expect(context.isRoot).toBe(false);
    expect(context.rootId).toBe('root');
    expect(context.parentId).toBe('reply-2');
    expect(context.thread.map(evt => evt.id)).toEqual([
      'root',
      'reply-1',
      'sibling',
      'reply-2',
      'target',
      'child',
      'grand'
    ]);
    expect(context.contextQuality).toBeGreaterThan(0);
  });
});
