/**
 * ElizaOS Plugin Patches (Preload Module)
 *
 * This script patches several ElizaOS issues at runtime:
 *
 * 1. WorldId Patch: Ensures worldId is always set on Memory objects
 *    - Fixes Telegram plugin creating memories without worldId
 *    - Prevents "default" literal in SQL queries
 *
 * 2. useModel Params Patch: Wraps string params in objects for IMAGE_DESCRIPTION
 *    - Fixes Telegram plugin passing raw imageUrl string to useModel
 *    - Error: "paramsObj is not an Object. (evaluating '"prompt" in paramsObj')"
 *
 * Usage: NODE_OPTIONS="--require ./telegram-worldid-patch.js" npx elizaos start ...
 */

const crypto = require('crypto');

// Helper to create a deterministic UUID from agentId + identifier
function createUniqueUuid(agentId, identifier) {
  if (!identifier) return undefined;
  const combined = `${identifier}:${agentId}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Track if we've already patched
let patchApplied = false;
let useModelPatchApplied = false;

/**
 * Patch the useModel function to handle string params for IMAGE_DESCRIPTION
 * This fixes Telegram plugin passing raw imageUrl string instead of object
 */
function patchUseModel() {
  if (useModelPatchApplied) return;

  try {
    // Try to find and patch the core module
    const possibleCorePaths = [
      '@elizaos/core',
      '@elizaos/server/node_modules/@elizaos/core',
      '/app/node_modules/@elizaos/core',
      '/app/node_modules/@elizaos/server/node_modules/@elizaos/core'
    ];

    for (const corePath of possibleCorePaths) {
      try {
        const core = require(corePath);

        // Patch AgentRuntime.prototype.useModel if available
        if (core.AgentRuntime && core.AgentRuntime.prototype && core.AgentRuntime.prototype.useModel) {
          const originalUseModel = core.AgentRuntime.prototype.useModel;

          core.AgentRuntime.prototype.useModel = async function (modelType, params, provider) {
            // If params is a string (like imageUrl), wrap it in an object
            // This fixes Telegram plugin's processImage that passes: useModel(ModelType.IMAGE_DESCRIPTION, imageUrl)
            if (typeof params === 'string') {
              const modelKey = typeof modelType === 'string' ? modelType : (core.ModelType ? core.ModelType[modelType] : modelType);

              // For IMAGE_DESCRIPTION, wrap the URL in the expected format
              if (modelKey === 'IMAGE_DESCRIPTION' || modelKey === 'imageDescription') {
                console.log(`[usemodel-patch] Wrapping string imageUrl for IMAGE_DESCRIPTION model`);
                params = { imageUrl: params };
              } else {
                // For other models, treat as prompt
                params = { prompt: params };
              }
            }

            return originalUseModel.call(this, modelType, params, provider);
          };

          useModelPatchApplied = true;
          console.log('[usemodel-patch] Successfully patched AgentRuntime.prototype.useModel');
          return;
        }
      } catch (e) {
        // Try next path
        continue;
      }
    }

    console.log('[usemodel-patch] AgentRuntime not found, will patch at runtime level');
  } catch (err) {
    console.log(`[usemodel-patch] Could not patch useModel: ${err.message}`);
  }
}

/**
 * Apply the patch to the DrizzleAdapter class
 */
function applyPatch() {
  if (patchApplied) return;

  try {
    // Try multiple paths to find the plugin-sql module
    const possiblePaths = [
      '@elizaos/plugin-sql',
      '@elizaos/plugin-sql/dist/node/index.node.js',
      '/app/node_modules/@elizaos/plugin-sql/dist/node/index.node.js'
    ];

    let pluginSql = null;
    let pluginSqlPath = null;

    for (const path of possiblePaths) {
      try {
        pluginSqlPath = path.startsWith('/') ? path : require.resolve(path);
        pluginSql = require(pluginSqlPath);
        if (pluginSql) break;
      } catch (e) {
        continue;
      }
    }

    if (!pluginSql) {
      console.log('[worldid-patch] plugin-sql module not found, will use runtime patching');
      return;
    }

    // The DrizzleAdapter class should be exported
    const DrizzleAdapter = pluginSql.DrizzleAdapter || pluginSql.default?.DrizzleAdapter;

    if (DrizzleAdapter && DrizzleAdapter.prototype && DrizzleAdapter.prototype.createMemory) {
      const originalCreateMemory = DrizzleAdapter.prototype.createMemory;

      DrizzleAdapter.prototype.createMemory = async function (memory, tableName) {
        // Ensure worldId is always present
        if (!memory.worldId) {
          if (memory.roomId) {
            memory.worldId = createUniqueUuid(this.agentId, memory.roomId);
          } else if (memory.agentId) {
            memory.worldId = createUniqueUuid(this.agentId, memory.agentId);
          }

          if (memory.worldId) {
            console.log(`[worldid-patch] Injected worldId ${memory.worldId} for memory in room ${memory.roomId || 'unknown'}`);
          }
        }

        // Also ensure unique is boolean, not integer
        if (memory.unique !== undefined && typeof memory.unique !== 'boolean') {
          memory.unique = Boolean(memory.unique);
        }

        return originalCreateMemory.call(this, memory, tableName);
      };

      patchApplied = true;
      console.log('[worldid-patch] Successfully patched DrizzleAdapter.createMemory');
    } else {
      console.log('[worldid-patch] DrizzleAdapter.createMemory not found, will try runtime patching');
    }
  } catch (err) {
    console.log(`[worldid-patch] Could not patch DrizzleAdapter at load time: ${err.message}`);
    console.log('[worldid-patch] Will rely on runtime-level patching instead');
  }
}

/**
 * Patch a runtime instance's createMemory method
 */
function patchRuntime(runtime) {
  if (!runtime || !runtime.createMemory) {
    console.log('[worldid-patch] No runtime.createMemory to patch');
    return;
  }

  if (runtime._worldIdPatchApplied) {
    return;
  }

  const originalCreateMemory = runtime.createMemory.bind(runtime);

  runtime.createMemory = async function (memory, tableName, unique) {
    // If worldId is missing but we have roomId, generate worldId from roomId
    if (!memory.worldId && memory.roomId) {
      memory.worldId = createUniqueUuid(runtime.agentId, memory.roomId);
    }

    // Ensure unique is boolean
    if (memory.unique !== undefined && typeof memory.unique !== 'boolean') {
      memory.unique = Boolean(memory.unique);
    }

    return originalCreateMemory(memory, tableName, unique);
  };

  runtime._worldIdPatchApplied = true;
  console.log('[worldid-patch] Successfully patched runtime.createMemory');

  // Also patch runtime.useModel for IMAGE_DESCRIPTION string params
  if (runtime.useModel && !runtime._useModelPatchApplied) {
    const originalUseModel = runtime.useModel.bind(runtime);

    runtime.useModel = async function (modelType, params, provider) {
      // If params is a string (like imageUrl), wrap it in an object
      if (typeof params === 'string') {
        const modelKey = typeof modelType === 'string' ? modelType : String(modelType);

        // For IMAGE_DESCRIPTION, wrap the URL in the expected format
        if (modelKey === 'IMAGE_DESCRIPTION' || modelKey === 'imageDescription' || modelKey.includes('IMAGE')) {
          console.log(`[usemodel-patch] Wrapping string imageUrl for ${modelKey} model`);
          params = { imageUrl: params };
        } else {
          // For other models, treat as prompt
          params = { prompt: params };
        }
      }

      return originalUseModel(modelType, params, provider);
    };

    runtime._useModelPatchApplied = true;
    console.log('[usemodel-patch] Successfully patched runtime.useModel');
  }
}

/**
 * Manually start TelegramService for a runtime
 * ElizaOS v1.7 CLI doesn't call Service.start() for plugin services
 */
async function startTelegramService(runtime) {
  if (!runtime || runtime._telegramServiceStarted) return;

  try {
    const { TelegramService } = require('@elizaos/plugin-telegram');

    if (!TelegramService) {
      console.log('[telegram-patch] TelegramService not found in plugin exports');
      return;
    }

    // Check if token is available
    const token = runtime.getSetting ? runtime.getSetting('TELEGRAM_BOT_TOKEN') : process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token.trim() === '') {
      console.log('[telegram-patch] No TELEGRAM_BOT_TOKEN, skipping Telegram service start');
      return;
    }

    console.log('[telegram-patch] Manually starting TelegramService...');

    // Call the static start method
    const service = await TelegramService.start(runtime);

    if (service && service.bot) {
      runtime._telegramServiceStarted = true;
      console.log('[telegram-patch] ✅ TelegramService started successfully');
    } else {
      console.log('[telegram-patch] TelegramService started but bot not initialized');
    }
  } catch (err) {
    console.log(`[telegram-patch] Error starting TelegramService: ${err.message}`);
    console.log(err.stack);
  }
}

// Apply patches at module load time
applyPatch();
patchUseModel();
// Note: TelegramService is started by the Nostr plugin via workaround in plugin-nostr/lib/service.js

module.exports = { patchRuntime, createUniqueUuid, applyPatch, patchUseModel, startTelegramService };
