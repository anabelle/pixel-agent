const { describe, it, expect } = globalThis;
const { listEventsByTopic } = require('../lib/discoveryList.js');

function evt(id, content, tags = []) {
  return { id, content, tags };
}

describe('listEventsByTopic', () => {
  it('dedupes and filters by semantic match and quality (batched filters)', async () => {
    const topic = 'pixel art';
    const relays = ['wss://r1'];
    // listFn now receives all filters batched in one call; return merged overlapping sets when multiple filters are present
    const eventsA = [evt('1', 'love pixel art canvases', [['t','art']]), evt('2', 'unrelated cooking post')];
    const eventsB = [evt('2', 'unrelated cooking post'), evt('3', 'retro 8-bit sprites!')];
    let calls = 0;
    const listFn = async (_pool, _relays, _filters) => {
      calls++;
      // When multiple filters are batched, simulate returning combined results
      return Array.isArray(_filters) && _filters.length > 1 ? [...eventsA, ...eventsB] : eventsA;
    };
    const isSemanticMatch = (content, t) => content.toLowerCase().includes('pixel') || content.toLowerCase().includes('8-bit');
    const isQualityContent = (event, _t) => !!event.content && event.content.length > 5;

    const out = await listEventsByTopic(null, relays, topic, { listFn, isSemanticMatch, isQualityContent, now: Math.floor(Date.now()/1000) });
  const ids = out.map(e => e.id);
    expect(ids).toContain('1');
    expect(ids).toContain('3');
    expect(ids).not.toContain('2');
  expect(calls).toBe(1);
  });
});
