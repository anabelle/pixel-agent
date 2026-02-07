"use strict";

/**
 * Generates text using the runtime's model with simple retry logic.
 * The actual model selection (free vs paid) is controlled by environment variables
 * like OPENROUTER_LARGE_MODEL which the ElizaOS OpenRouter plugin reads.
 */
async function generateWithModelOrFallback(runtime, modelType, prompt, opts, extractFn, sanitizeFn, fallbackFn) {
  const logger = runtime?.logger || console;

  try {
    if (!runtime?.useModel) throw new Error('useModel missing from runtime');

    const res = await runtime.useModel(modelType, { prompt, ...opts });
    const raw = typeof extractFn === 'function' ? extractFn(res) : '';
    const text = typeof sanitizeFn === 'function' ? sanitizeFn(raw) : String(raw || '');

    if (text && String(text).trim()) {
      return String(text).trim();
    }

    // Empty response from model
    logger.debug(`[GENERATION] Model ${modelType} returned empty response`);
  } catch (err) {
    logger.debug(`[GENERATION] Model ${modelType} failed: ${err?.message || err}`);
  }

  // Run the caller-provided failure function
  return typeof fallbackFn === 'function' ? fallbackFn() : '';
}

module.exports = { generateWithModelOrFallback };
