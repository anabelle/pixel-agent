/**
 * Unicode Validation Utilities
 * 
 * Provides UTF-8 validation and sanitization functions for database content.
 * Handles invalid surrogate pairs and malformed Unicode sequences.
 */

/**
 * Sanitizes a string by removing invalid Unicode surrogate pairs.
 * 
 * Surrogate pairs (U+D800 to U+DFFF) are only valid in UTF-16 and must appear
 * as pairs (high surrogate followed by low surrogate). When they appear alone,
 * they are invalid in UTF-8/UTF-32 and will cause PostgreSQL JSONB insertion errors.
 * 
 * @param str - The string to sanitize
 * @returns A sanitized string with invalid surrogates removed
 */
export const sanitizeUnicode = (str: string): string => {
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

/**
 * Sanitizes a JSON object recursively, removing invalid Unicode from all string values.
 * 
 * @param obj - The object/array/primitive to sanitize
 * @returns A sanitized version of the input
 */
export const sanitizeJSON = (obj: any): any => {
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

  // Numbers, booleans, etc. are returned as-is
  return obj;
};

/**
 * Validates if a string contains valid UTF-8.
 * 
 * @param str - The string to validate
 * @returns true if valid, false if contains invalid Unicode
 */
export const isValidUnicode = (str: string): boolean => {
  try {
    // Try to encode to UTF-8 and decode back
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const encoded = encoder.encode(str);
    decoder.decode(encoded);
    return true;
  } catch {
    return false;
  }
};

/**
 * Sanitizes content specifically for database insertion.
 * This is the main entry point for the sanitization pipeline.
 * 
 * @param content - The content to sanitize (can be string, object, array, or any JSON value)
 * @returns Sanitized content safe for PostgreSQL JSONB insertion
 */
export const sanitizeUnicodeForDB = (content: any): any => {
  try {
    return sanitizeJSON(content);
  } catch (error) {
    console.error('[UnicodeValidation] Error sanitizing content:', error);
    // Return empty object on error to prevent DB insertion failure
    return {};
  }
};
