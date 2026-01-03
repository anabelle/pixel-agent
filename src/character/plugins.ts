/**
 * Plugin Configuration for Pixel Agent
 * 
 * NOTE: This file is NOT used when running via the ElizaOS CLI.
 * The CLI resolves plugins by name from character.json.
 * 
 * This file exists for backwards compatibility if running directly.
 */

import type { Plugin } from "@elizaos/core";

// Plugin names that the ElizaOS CLI will resolve at runtime
// We export these as strings - the CLI does the actual resolution
export const PLUGIN_NAMES = [
  '@elizaos/plugin-bootstrap',
  '@elizaos/adapter-postgres',
  '@elizaos/plugin-sql',
  // '@elizaos/plugin-openai',
  '@elizaos/plugin-openrouter',
  '@elizaos/plugin-telegram',
  '@elizaos/plugin-discord',
  '@elizaos/plugin-twitter',
  '@elizaos/plugin-knowledge',
  'pixel-plugin-nostr',
] as const;

// Empty array - plugins are resolved by CLI at runtime using character.json
export const plugins: Plugin[] = [];

