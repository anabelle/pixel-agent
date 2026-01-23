/**
 * Pixel Agent Entry Point
 * 
 * This file is used when running the agent directly via `bun src/index.ts`.
 * For production with ElizaOS CLI, use `elizaos start --character ./character.json`
 * which resolves plugins by name from character.json.
 */
 
// Apply PostgreSQL Unicode safety patch early (before any adapter initialization)
const sanitizeUnicode = (str: string): string => {
  if (!str || typeof str !== 'string') return str;
  
  let result = '';
  let i = 0;
  
  while (i < str.length) {
    const code = str.charCodeAt(i);
    
    // Check for high surrogate (0xD800-0xDBFF)
    if (code >= 0xD800 && code <= 0xDBFF) {
      // Check if next character is a valid low surrogate
      if (i + 1 < str.length) {
        const nextCode = str.charCodeAt(i + 1);
        if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
          // Valid surrogate pair - keep both
          result += str.charAt(i);
          result += str.charAt(i + 1);
          i += 2;
          continue;
        }
      }
      // Invalid high surrogate without matching low surrogate - skip it
      i++;
      continue;
    }
    
    // Check for low surrogate (0xDC00-0xDFFF) without high surrogate
    if (code >= 0xDC00 && code <= 0xDFFF) {
      // Invalid low surrogate - skip it
      i++;
      continue;
    }
    
    // Valid character - keep it
    result += str.charAt(i);
    i++;
  }
  
  return result;
};

const sanitizeJSON = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeUnicode(obj);
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
          if (JSON.stringify(sanitized) !== JSON.stringify(memory.content)) {
            console.log('[PostgresUnicodePatch] createMemory content sanitized');
          }
          memory.content = sanitized;
        } catch (error) {
          console.error('[PostgresUnicodePatch] Error sanitizing content:', error);
        }
      }

      return originalCreateMemory.call(this, memory, tableName);
    };

    console.log('[PostgresUnicodePatch] Successfully patched PostgresDatabaseAdapter.createMemory');

    // Patch createLog - CRITICAL for fixing \ud83c errors in logs table
    if (PostgresDatabaseAdapter.prototype.createLog) {
      const originalCreateLog = PostgresDatabaseAdapter.prototype.createLog;
      PostgresDatabaseAdapter.prototype.createLog = async function(this: any, log: any) {
        if (log && log.body) {
          try {
            const sanitized = sanitizeJSON(log.body);
            if (JSON.stringify(sanitized) !== JSON.stringify(log.body)) {
              console.log('[PostgresUnicodePatch] createLog body sanitized');
            }
            log.body = sanitized;
          } catch (error) {
            console.error('[PostgresUnicodePatch] Error sanitizing log body:', error);
          }
        }

        return originalCreateLog.call(this, log);
      };
      console.log('[PostgresUnicodePatch] Successfully patched PostgresDatabaseAdapter.createLog');
    } else {
      console.warn('[PostgresUnicodePatch] createLog method not found');
    }
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

