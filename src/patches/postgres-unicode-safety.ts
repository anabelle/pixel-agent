/**
 * PostgreSQL Unicode Safety Patch
 * 
 * This patch sanitizes invalid Unicode surrogate pairs in JSON content before
 * PostgreSQL insertion, preventing "Unicode low surrogate must follow a high surrogate" errors.
 * 
 * Applied via runtime monkey-patching of the PostgresDatabaseAdapter methods.
 */

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
