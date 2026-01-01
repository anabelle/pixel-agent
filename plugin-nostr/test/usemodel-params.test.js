/**
 * Regression Test: useModel String Params Fix
 * 
 * Tests that the useModel patch correctly handles string parameters
 * for IMAGE_DESCRIPTION model (and other models).
 * 
 * Bug: Telegram plugin passes raw imageUrl string to useModel:
 *   runtime.useModel(ModelType.IMAGE_DESCRIPTION, imageUrl)
 * 
 * Expected behavior after patch:
 *   String params should be wrapped: { imageUrl: imageUrl } or { prompt: string }
 * 
 * Run: cd plugin-nostr && npm test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

// Create require for CommonJS modules
const require = createRequire(import.meta.url);

// Import the patch module (.cjs extension for explicit CommonJS)
const { patchRuntime, createUniqueUuid } = require('../../telegram-worldid-patch.cjs');

describe('useModel String Params Patch', () => {
  let mockRuntime;
  let useModelCalls;

  beforeEach(() => {
    useModelCalls = [];
    
    // Create a mock runtime that records useModel calls
    mockRuntime = {
      agentId: 'test-agent-123',
      createMemory: vi.fn().mockResolvedValue('memory-id'),
      useModel: vi.fn().mockImplementation(async (modelType, params, provider) => {
        useModelCalls.push({ modelType, params, provider });
        return { title: 'Test Image', description: 'A test image description' };
      }),
      _worldIdPatchApplied: false,
      _useModelPatchApplied: false,
    };
  });

  it('should wrap string imageUrl for IMAGE_DESCRIPTION model', async () => {
    // Apply patch
    patchRuntime(mockRuntime);
    
    // Simulate Telegram plugin's processImage call: useModel(ModelType.IMAGE_DESCRIPTION, imageUrl)
    const imageUrl = 'https://example.com/image.jpg';
    await mockRuntime.useModel('IMAGE_DESCRIPTION', imageUrl);
    
    // Verify the params were wrapped in an object
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toEqual({ imageUrl: imageUrl });
  });

  it('should wrap string for imageDescription model type', async () => {
    patchRuntime(mockRuntime);
    
    const imageUrl = 'https://example.com/photo.png';
    await mockRuntime.useModel('imageDescription', imageUrl);
    
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toEqual({ imageUrl: imageUrl });
  });

  it('should wrap string as prompt for non-image models', async () => {
    patchRuntime(mockRuntime);
    
    const promptText = 'Describe this in detail';
    await mockRuntime.useModel('TEXT_LARGE', promptText);
    
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toEqual({ prompt: promptText });
  });

  it('should pass object params unchanged', async () => {
    patchRuntime(mockRuntime);
    
    const params = { imageUrl: 'https://example.com/img.jpg', prompt: 'Describe this' };
    await mockRuntime.useModel('IMAGE_DESCRIPTION', params);
    
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toEqual(params);
  });

  it('should handle null/undefined params', async () => {
    patchRuntime(mockRuntime);
    
    await mockRuntime.useModel('TEXT_EMBEDDING', null);
    
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toBeNull();
  });

  it('should not double-patch runtime', async () => {
    patchRuntime(mockRuntime);
    patchRuntime(mockRuntime); // Second call should be no-op
    
    await mockRuntime.useModel('IMAGE_DESCRIPTION', 'https://test.com/img.jpg');
    
    // Should only wrap once, not double-wrap
    expect(useModelCalls.length).toBe(1);
    expect(useModelCalls[0].params).toEqual({ imageUrl: 'https://test.com/img.jpg' });
  });
});

describe('createMemory WorldId Patch', () => {
  let mockRuntime;
  let createMemoryCalls;

  beforeEach(() => {
    createMemoryCalls = [];
    
    mockRuntime = {
      agentId: 'test-agent-456',
      createMemory: vi.fn().mockImplementation(async (memory, tableName, unique) => {
        createMemoryCalls.push({ memory: { ...memory }, tableName, unique });
        return memory.id || 'generated-id';
      }),
      useModel: vi.fn().mockResolvedValue({}),
      _worldIdPatchApplied: false,
      _useModelPatchApplied: false,
    };
  });

  it('should inject worldId from roomId when missing', async () => {
    patchRuntime(mockRuntime);
    
    const memory = {
      id: 'mem-1',
      roomId: 'room-123',
      entityId: 'entity-1',
      content: { text: 'Hello' },
    };
    
    await mockRuntime.createMemory(memory, 'messages');
    
    expect(createMemoryCalls.length).toBe(1);
    expect(createMemoryCalls[0].memory.worldId).toBeDefined();
    expect(createMemoryCalls[0].memory.worldId).not.toBe('default');
  });

  it('should not override existing worldId', async () => {
    patchRuntime(mockRuntime);
    
    const existingWorldId = 'existing-world-id-uuid';
    const memory = {
      id: 'mem-2',
      roomId: 'room-456',
      worldId: existingWorldId,
      content: { text: 'Test' },
    };
    
    await mockRuntime.createMemory(memory, 'messages');
    
    expect(createMemoryCalls.length).toBe(1);
    expect(createMemoryCalls[0].memory.worldId).toBe(existingWorldId);
  });

  it('should convert unique from integer to boolean', async () => {
    patchRuntime(mockRuntime);
    
    const memory = {
      id: 'mem-3',
      roomId: 'room-789',
      worldId: 'world-1',
      content: { text: 'Test' },
      unique: 1, // Integer, should be converted to boolean
    };
    
    await mockRuntime.createMemory(memory, 'messages');
    
    expect(createMemoryCalls.length).toBe(1);
    expect(createMemoryCalls[0].memory.unique).toBe(true);
    expect(typeof createMemoryCalls[0].memory.unique).toBe('boolean');
  });

  it('should convert unique=0 to false', async () => {
    patchRuntime(mockRuntime);
    
    const memory = {
      id: 'mem-4',
      roomId: 'room-101',
      worldId: 'world-2',
      content: { text: 'Test' },
      unique: 0,
    };
    
    await mockRuntime.createMemory(memory, 'messages');
    
    expect(createMemoryCalls[0].memory.unique).toBe(false);
  });
});

describe('createUniqueUuid', () => {
  it('should generate deterministic UUIDs', () => {
    const uuid1 = createUniqueUuid('agent-1', 'room-1');
    const uuid2 = createUniqueUuid('agent-1', 'room-1');
    
    expect(uuid1).toBe(uuid2);
  });

  it('should generate different UUIDs for different inputs', () => {
    const uuid1 = createUniqueUuid('agent-1', 'room-1');
    const uuid2 = createUniqueUuid('agent-1', 'room-2');
    const uuid3 = createUniqueUuid('agent-2', 'room-1');
    
    expect(uuid1).not.toBe(uuid2);
    expect(uuid1).not.toBe(uuid3);
    expect(uuid2).not.toBe(uuid3);
  });

  it('should return undefined for falsy identifier', () => {
    expect(createUniqueUuid('agent-1', '')).toBeUndefined();
    expect(createUniqueUuid('agent-1', null)).toBeUndefined();
    expect(createUniqueUuid('agent-1', undefined)).toBeUndefined();
  });

  it('should generate valid UUID format', () => {
    const uuid = createUniqueUuid('agent-1', 'room-1');
    
    // UUID format: xxxxxxxx-xxxx-4xxx-axxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuid).toMatch(uuidRegex);
  });
});
