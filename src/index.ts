/**
 * Pixel Agent Entry Point
 * 
 * This file is used when running the agent directly via `bun src/index.ts`.
 * For production with ElizaOS CLI, use `elizaos start --character ./character.json`
 * which resolves plugins by name from character.json.
 */

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
        '@elizaos/plugin-sql',
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

