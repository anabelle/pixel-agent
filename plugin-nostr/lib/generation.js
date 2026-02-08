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

    // Log the raw response structure for debugging
    if (!res) {
      logger.info(`[GENERATION] No response received from model ${modelType}`);
      return typeof fallbackFn === 'function' ? fallbackFn() : '';
    }

    const raw = typeof extractFn === 'function' ? extractFn(res) : '';
    const text = typeof sanitizeFn === 'function' ? sanitizeFn(raw) : String(raw || '');

    if (text && String(text).trim()) {
      logger.info(`[GENERATION] Success! Generated ${text.length} chars with ${modelType}`);
      return String(text).trim();
    }

    // Empty response from model
    logger.info(`[GENERATION] Model ${modelType} returned empty after extraction. Raw type: ${typeof res}, raw length: ${JSON.stringify(res)?.length || 0}`);
  } catch (err) {
    logger.info(`[GENERATION] Model ${modelType} error: ${err?.message || err}`);
  }

  // Run the caller-provided failure function
  return typeof fallbackFn === 'function' ? fallbackFn() : '';
}

module.exports = { generateWithModelOrFallback };
