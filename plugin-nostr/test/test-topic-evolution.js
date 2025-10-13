import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load modules under test
import path from 'path';
import fs from 'fs';

const topicEvolutionPath = path.resolve(__dirname, '../lib/topicEvolution.js');
const narrativeMemoryPath = path.resolve(__dirname, '../lib/narrativeMemory.js');

// Dynamic require to avoid TypeScript types
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TopicEvolution } = require(topicEvolutionPath);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NarrativeMemory } = require(narrativeMemoryPath);

function makeRuntime(overrides = {}) {
  const settings = new Map(Object.entries(overrides.settings || {}));
  return {
    getSetting: (k) => settings.get(k),
    useModel: overrides.useModel,
    logger: overrides.logger || console,
    createUniqueUuid: (rt, seed='test') => `${seed}:${Date.now()}`,
    agentId: 'agent:test'
  };
}

describe('TopicEvolution + NarrativeMemory', () => {
  let runtime;
  let logger;
  let mem;

  beforeEach(() => {
    logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    runtime = makeRuntime({ settings: { TOPIC_EVOLUTION_ENABLED: 'true' }, logger });
    mem = new NarrativeMemory(runtime, logger);
  });

  it('labels subtopics heuristically without LLM', async () => {
    const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
    const label1 = await evo.labelSubtopic('bitcoin', 'ETF approval news incoming');
    const label2 = await evo.labelSubtopic('nostr', 'relay had outages and technical work');
    expect(label1).toContain('bitcoin');
    expect(label1).toContain('etf');
    expect(label2).toContain('technical');
  });

  it('records angles in narrative memory and detects phase', async () => {
    const evo = new TopicEvolution(runtime, logger, { narrativeMemory: mem });
    const topic = 'nostr';

    // Seed timeline to reach phase detection threshold quickly
    for (let i = 0; i < 6; i++) {
      await evo.analyze(topic, `relay upgrade discussion ${i}`);
    }
    const res = await evo.analyze(topic, 'major relay outage announcement');
    expect(res).toBeTruthy();
    expect(res.subtopic).toBeTruthy();
    expect(['announcement','analysis','general','speculation','adoption','backlash']).toContain(res.phase);

    const evoData = await mem.getTopicEvolution(topic, 30);
    expect(evoData).toBeTruthy();
    expect(evoData.topSubtopics?.length >= 1).toBe(true);
    expect(typeof evoData.currentPhase).toBe('string');
  });
});
