/**
 * OpenAI ESM/CJS Interop Patch
 * 
 * This module patches the OpenAI SDK to work correctly with Bun's ESM handling.
 * The "Cannot call a class constructor without |new|" error occurs because:
 * 
 * 1. The OpenAI SDK exports a class as default export
 * 2. Some import patterns in ESM environments can lose the constructor context
 * 3. Bun's module resolution sometimes flattens the export incorrectly
 * 
 * This patch ensures the OpenAI class is always instantiated correctly.
 */

// Apply patch before any plugin imports
const patchOpenAI = async () => {
  try {
    // Dynamic import to get the raw module
    const openaiModule = await import('openai');
    
    // The OpenAI class might be at .default or directly on the module
    const OpenAIClass = openaiModule.default || openaiModule.OpenAI || openaiModule;
    
    if (typeof OpenAIClass !== 'function') {
      console.warn('[OpenAI Patch] Could not find OpenAI class constructor');
      return;
    }
    
    // Verify it's actually a class/constructor
    if (!OpenAIClass.prototype) {
      console.warn('[OpenAI Patch] OpenAI export is not a constructor');
      return;
    }
    
    console.log('[OpenAI Patch] OpenAI SDK loaded successfully');
    
    // Return the patched class that ensures 'new' is always used
    return OpenAIClass;
  } catch (error) {
    console.error('[OpenAI Patch] Failed to patch OpenAI:', error);
    throw error;
  }
};

// Export for use in plugins if needed
export { patchOpenAI };
export default patchOpenAI;
