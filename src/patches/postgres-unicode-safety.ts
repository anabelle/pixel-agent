/**
 * PostgreSQL Unicode Safety Patch
 * 
 * This patch sanitizes invalid Unicode surrogate pairs in JSON content before
 * PostgreSQL insertion, preventing "Unicode low surrogate must follow a high surrogate" errors.
 * 
 * Applied via runtime monkey-patching of the PostgresDatabaseAdapter.createMemory method.
 */

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

export const applyPostgresUnicodePatch = () => {
  try {
    const { PostgresDatabaseAdapter } = require('@elizaos/adapter-postgres');

    if (!PostgresDatabaseAdapter || !PostgresDatabaseAdapter.prototype) {
      console.warn('[PostgresUnicodePatch] PostgresDatabaseAdapter not found, skipping patch');
      return;
    }

    const originalCreateMemory = PostgresDatabaseAdapter.prototype.createMemory;

    if (!originalCreateMemory) {
      console.warn('[PostgresUnicodePatch] createMemory method not found, skipping patch');
      return;
    }

    PostgresDatabaseAdapter.prototype.createMemory = async function(this: any, memory: any, tableName: string) {
      if (memory && memory.content) {
        try {
          memory.content = sanitizeJSON(memory.content);
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
