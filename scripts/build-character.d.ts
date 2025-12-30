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
//# sourceMappingURL=build-character.d.ts.map