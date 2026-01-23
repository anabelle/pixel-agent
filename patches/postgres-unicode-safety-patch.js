// PostgreSQL Unicode Safety Patch
// This file preloads to Unicode sanitization patch before ElizaOS CLI starts

function sanitizeUnicode(str) {
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
}

function sanitizeJSON(obj) {
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

    // Patch createLog - this is CRITICAL for fixing the \ud83c errors in logs table
    if (PostgresDatabaseAdapter.prototype.createLog) {
      const originalCreateLog = PostgresDatabaseAdapter.prototype.createLog;
      PostgresDatabaseAdapter.prototype.createLog = async function(log) {
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
      console.warn('[PostgresUnicodePatch] createLog method not found (logs table may not be patched)');
    }

    // Patch any other JSON-inserting methods
    const jsonMethods = ['create', 'insert', 'save'];
    jsonMethods.forEach(methodName => {
      if (PostgresDatabaseAdapter.prototype[methodName] && 
          !PostgresDatabaseAdapter.prototype[methodName].__unicodePatched) {
        const original = PostgresDatabaseAdapter.prototype[methodName];
        PostgresDatabaseAdapter.prototype[methodName] = async function(record) {
          if (record && typeof record === 'object') {
            try {
              record = sanitizeJSON(record);
            } catch (error) {
              console.error('[PostgresUnicodePatch] Error in ' + methodName + ':', error);
            }
          }
          return original.apply(this, arguments);
        };
        PostgresDatabaseAdapter.prototype[methodName].__unicodePatched = true;
        console.log('[PostgresUnicodePatch] Patched PostgresDatabaseAdapter.' + methodName);
      }
    });

    // Patch the query method to catch direct INSERT statements
    // This is CRITICAL for the logs table which uses raw SQL INSERT
    if (PostgresDatabaseAdapter.prototype.query && 
        !PostgresDatabaseAdapter.prototype.query.__unicodePatched) {
      const originalQuery = PostgresDatabaseAdapter.prototype.query;
      PostgresDatabaseAdapter.prototype.query = async function(queryTextOrConfig, values) {
        if (values && Array.isArray(values)) {
          try {
            // Check if this is an INSERT into logs or memories table
            const queryStr = typeof queryTextOrConfig === 'string' 
              ? queryTextOrConfig 
              : (queryTextOrConfig.text || '');
              
            if (queryStr.includes('INSERT INTO logs') || queryStr.includes('INSERT INTO memories')) {
              // Sanitize JSONB parameters (typically 2nd parameter for body/content)
              for (let i = 0; i < values.length; i++) {
                if (typeof values[i] === 'string') {
                  try {
                    // Try to parse as JSON, sanitize, and re-stringify
                    const parsed = JSON.parse(values[i]);
                    const sanitized = sanitizeJSON(parsed);
                    if (JSON.stringify(sanitized) !== values[i]) {
                      console.log('[PostgresUnicodePatch] query parameter ' + i + ' sanitized');
                      values[i] = JSON.stringify(sanitized);
                    }
                  } catch {
                    // Not valid JSON, skip
                  }
                }
              }
            }
          } catch (error) {
            console.error('[PostgresUnicodePatch] Error in query patch:', error);
          }
        }
        return originalQuery.call(this, queryTextOrConfig, values);
      };
      PostgresDatabaseAdapter.prototype.query.__unicodePatched = true;
      console.log('[PostgresUnicodePatch] Patched PostgresDatabaseAdapter.query (catches direct SQL INSERTs)');
    }
  } catch (error) {
    console.error('[PostgresUnicodePatch] Failed to apply patch:', error);
  }
}

applyPostgresUnicodePatch();
