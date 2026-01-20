// PostgreSQL Unicode Safety Patch
// This file preloads to Unicode sanitization patch before ElizaOS CLI starts

function sanitizeJSON(obj) {
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
    const result = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = sanitizeJSON(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

function sanitizeString(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code >= 0xD800 && code <= 0xDFFF) {
      continue;
    }

    result += str.charAt(i);
  }
  return result;
}

function applyPostgresUnicodePatch() {
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

    PostgresDatabaseAdapter.prototype.createMemory = async function(memory, tableName) {
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
}

applyPostgresUnicodePatch();
