/**
 * Pixel Agent Entry Point
 * 
 * This file is used when running the agent directly via `bun src/index.ts`.
 * For production with ElizaOS CLI, use `elizaos start --character ./character.json`
 * which resolves plugins by name from character.json.
 */
 
// Apply PostgreSQL Unicode safety patch early (before any adapter initialization)
const sanitizeJSON = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJSON);
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = sanitizeJSON(obj[key]);
      }
    }
    return result;
  }

  return obj;
};

const sanitizeString = (str: string): string => {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code >= 0xD800 && code <= 0xDFFF) {
      continue;
    }

    result += str.charAt(i);
  }
  return result;
};

const applyPostgresUnicodePatch = () => {
  try {
    console.log('[PostgresUnicodePatch] Starting to apply patch...');

    const adapterModule = require('/app/node_modules/@elizaos/adapter-postgres/dist/index.js');
    console.log('[PostgresUnicodePatch] adapter-postgres module loaded:', Object.keys(adapterModule).slice(0, 10));

    const PostgresDatabaseAdapter = adapterModule.PostgresDatabaseAdapter;
    console.log('[PostgresUnicodePatch] PostgresDatabaseAdapter found:', !!PostgresDatabaseAdapter);

    if (!PostgresDatabaseAdapter || !PostgresDatabaseAdapter.prototype) {
      console.warn('[PostgresUnicodePatch] PostgresDatabaseAdapter not found, skipping patch');
      return;
    }

    const originalCreateMemory = PostgresDatabaseAdapter.prototype.createMemory;
    console.log('[PostgresUnicodePatch] createMemory method found:', !!originalCreateMemory);

    if (!originalCreateMemory) {
      console.warn('[PostgresUnicodePatch] createMemory method not found, skipping patch');
      return;
    }

    PostgresDatabaseAdapter.prototype.createMemory = async function(this: any, memory: any, tableName: string) {
      if (memory && memory.content) {
        try {
          const sanitized = sanitizeJSON(memory.content);
          if (sanitized !== memory.content) {
            console.log('[PostgresUnicodePatch] Content sanitized, changes applied');
          }
          memory.content = sanitized;
        } catch (error) {
          console.error('[PostgresUnicodePatch] Error sanitizing content:', error);
        }
      }

      return originalCreateMemory.call(this, memory, tableName);
    };

    console.log('[PostgresUnicodePatch] Successfully patched PostgresDatabaseAdapter.createMemory');
  } catch (error) {
    console.error('[PostgresUnicodePatch] Failed to apply patch:', error);
  }
};

setImmediate(() => applyPostgresUnicodePatch());

// Suppress AI SDK warnings about unsupported model settings (presencePenalty, frequencyPenalty, stopSequences)
// @ts-ignore - global flag not typed
 globalThis.AI_SDK_LOG_WARNINGS = false;


// Stability: Global error handlers to prevent PM2 restart loops from unhandled rejections
// This is critical for network-heavy plugins like Nostr that can have unstable connections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[STABILITY] Unhandled Rejection at:', promise, 'reason:', reason);
    // Do not exit, just log it. PM2 will stay up.
});

process.on('uncaughtException', (err) => {
    console.error('[STABILITY] Uncaught Exception:', err);
    // For uncaught exceptions, we log and decide if we must exit
    // If it's a critical boot error, we exit. If it's a runtime glitch, we try to stay alive.
    if (err && err.message && (err.message.includes('EADDRINUSE') || err.message.includes('ELIZA_SERVER_AUTH_TOKEN'))) {
        process.exit(1);
    }
});

// Import character manifest (pure data, no plugin instances)
import { characterManifest } from './character/manifest';
import type { Character } from "@elizaos/core";

// Create a character with plugin names (strings) for CLI resolution
// The ElizaOS CLI will resolve these at runtime
const character: Character = {
    ...characterManifest,
    plugins: [
        '@elizaos/plugin-bootstrap',
        '@elizaos/adapter-postgres',
        '@elizaos/plugin-openai',
        '@elizaos/plugin-openrouter',
        '@elizaos/plugin-telegram',
        '@elizaos/plugin-discord',
        '@elizaos/plugin-twitter',
        '@elizaos/plugin-knowledge',
        'pixel-plugin-nostr',
    ] as any, // CLI accepts string[] for plugin resolution
};

// Create an array of characters for the project
const characters = [character];

// Export for the CLI to use
export { character };
export default characters;

