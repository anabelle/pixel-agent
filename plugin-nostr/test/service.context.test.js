const { describe, it, expect } = globalThis;
const { ensureNostrContext, createMemorySafe, saveInteractionMemory } = require('../lib/context.js');

function makeRuntime() {
  const calls = {
    ensureWorldExists: [], ensureRoomExists: [], ensureConnection: [],
    createMemory: [], dbCreateMemory: []
  };
  const runtime = {
    agentId: 'agent-1',
    ensureWorldExists: (o) => { calls.ensureWorldExists.push(o); return Promise.resolve(); },
    ensureRoomExists: (o) => { calls.ensureRoomExists.push(o); return Promise.resolve(); },
    ensureConnection: (o) => { calls.ensureConnection.push(o); return Promise.resolve(); },
    createMemory: (m, t) => { calls.createMemory.push({ m, t }); return Promise.resolve(); },
    databaseAdapter: { createMemory: (m) => { calls.dbCreateMemory.push(m); return Promise.resolve({ ok: true }); } },
  };
  return { runtime, calls };
}

const makeCUU = (_runtime, seed) => `id:${seed}`;
const getConv = (evt) => evt?.id || 'thread';
const logger = { info: ()=>{}, warn: ()=>{}, debug: ()=>{} };

describe('context helpers', () => {
  it('ensureNostrContext sets up world, room, connection and returns ids', async () => {
    const { runtime, calls } = makeRuntime();
    const res = await ensureNostrContext(runtime, 'pubkeyX', 'nameX', 'convY', { createUniqueUuid: makeCUU, ChannelType: { FEED: 'FEED' }, logger });
    expect(res).toEqual({ worldId: 'id:pubkeyX', roomId: 'id:convY', entityId: 'id:pubkeyX' });
    expect(calls.ensureWorldExists.length).toBe(1);
    expect(calls.ensureRoomExists.length).toBe(1);
    expect(calls.ensureConnection.length).toBe(1);
  });

  it('createMemorySafe returns true on duplicate error', async () => {
    const { runtime } = makeRuntime();
    let first = true;
    runtime.createMemory = async () => {
      if (first) { first = false; throw new Error('duplicate key value'); }
      return true;
    };
    const ok = await createMemorySafe(runtime, { id: 'm1', roomId: 'r1' }, 'messages', 2, logger);
    expect(ok).toBe(true);
  });

  it('saveInteractionMemory uses runtime.createMemory', async () => {
    const { runtime, calls } = makeRuntime();
    await saveInteractionMemory(runtime, makeCUU, getConv, { id: 'evt1', pubkey: 'pk1', content: 'hello' }, 'reply', { replied: true }, logger);
    expect(calls.createMemory.length).toBe(1);
    const created = calls.createMemory[0].m;
    expect(created.content.type).toBe('social_interaction');
  });

  it('saveInteractionMemory falls back to databaseAdapter', async () => {
    const { runtime, calls } = makeRuntime();
    runtime.createMemory = null;
    await saveInteractionMemory(runtime, makeCUU, getConv, { id: 'evt1', pubkey: 'pk1', content: 'hello' }, 'reply', { replied: true }, logger);
    expect(calls.dbCreateMemory.length).toBe(1);
  });
});
