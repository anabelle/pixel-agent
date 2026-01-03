#!/usr/bin/env bun
/**
 * Character Build Script
 * 
 * Generates character.json from the manifest WITHOUT importing plugin instances.
 * This avoids the circular dependency / chicken-and-egg problem where plugins
 * need to be resolved before the character file exists.
 * 
 * The ElizaOS CLI resolves plugin strings at runtime, so we only need to
 * provide the plugin package names, not the actual plugin objects.
 */

import 'dotenv/config';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Import only the pure data parts of the character (no plugin instances)
import { characterManifest } from '../src/character/manifest';
import { settings } from '../src/character/settings';

// Check if Twitter should be enabled (honors rate limits when disabled)
const enableTwitter = settings.ENABLE_TWITTER_PLUGIN === 'true';

// Plugin names that the ElizaOS CLI will resolve at runtime
// Order matters: bootstrap first, then adapters, then features
// NOTE: OpenRouter BEFORE OpenAI so it handles TEXT_SMALL/TEXT_LARGE first (free models)
const PLUGIN_NAMES = [
  // Core bootstrapping
  '@elizaos/plugin-bootstrap',
  // Database adapter (PostgreSQL for production)
  '@elizaos/adapter-postgres',
  // '@elizaos/plugin-sql',
  // AI providers - OpenRouter first for free models!
  '@elizaos/plugin-openrouter',
  // '@elizaos/plugin-openai', // Fallback for embeddings if needed
  // Platform integrations
  '@elizaos/plugin-telegram',
  // '@elizaos/plugin-discord', // Disabled - re-enable when API credentials are configured
  // Twitter: conditionally included based on ENABLE_TWITTER_PLUGIN setting
  ...(enableTwitter ? ['@elizaos/plugin-twitter'] : []),
  // Additional features
  '@elizaos/plugin-knowledge',
  // Custom plugins (local)
  'pixel-plugin-nostr',
];

// Build the complete character object
const character = {
  ...characterManifest,
  plugins: PLUGIN_NAMES,
};

// Output path
const outputPath = resolve(import.meta.dir, '../character.json');

// Write the character file
writeFileSync(outputPath, JSON.stringify(character, null, 2));

console.log(`✅ Character file generated: ${outputPath}`);
console.log(`   - Name: ${character.name}`);
console.log(`   - Plugins: ${PLUGIN_NAMES.length}`);
console.log(`   - Twitter: ${enableTwitter ? 'ENABLED' : 'DISABLED (rate limit protection)'}`);

// Verify the file was created
if (existsSync(outputPath)) {
  console.log('✅ Verification passed: character.json exists');
} else {
  console.error('❌ Error: character.json was not created');
  process.exit(1);
}
