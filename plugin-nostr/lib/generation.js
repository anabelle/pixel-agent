"use strict";

/**
 * List of shared free models to use as fallbacks on OpenRouter.
 * Order matters: we try the most capable/stable ones first.
 */
const FREE_MODELS = [
  'tngtech/deepseek-r1t2-chimera:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen2.5-72b-instruct:free',
  'microsoft/phi-4:free'
];

/**
 * Generates text using a primary model with automatic fallback to high-quality free models.
 * This ensures resilience against rate limits or credit exhaustion.
 */
async function generateWithModelOrFallback(runtime, modelType, prompt, opts, extractFn, sanitizeFn, fallbackFn) {
  const logger = runtime?.logger || console;

  // 1. Primary Attempt: Use the requested model (e.g. TEXT_LARGE)
  try {
    if (!runtime?.useModel) throw new Error('useModel missing from runtime');

    const res = await runtime.useModel(modelType, { prompt, ...opts });
    const raw = typeof extractFn === 'function' ? extractFn(res) : '';
    const text = typeof sanitizeFn === 'function' ? sanitizeFn(raw) : String(raw || '');

    if (text && String(text).trim()) {
      return String(text).trim();
    }
  } catch (err) {
    logger.debug(`[GENERATION] Primary model (${modelType}) failed: ${err?.message || err}`);
  }

  // 2. Fallback Loop: Iterate through known-good free models
  logger.info('[GENERATION] Primary model failed or returned empty. Attempting free fallbacks...');

  for (const freeModel of FREE_MODELS) {
    try {
      logger.debug(`[GENERATION] Trying free fallback: ${freeModel}`);

      const res = await runtime.useModel(freeModel, { prompt, ...opts });
      const raw = typeof extractFn === 'function' ? extractFn(res) : '';
      const text = typeof sanitizeFn === 'function' ? sanitizeFn(raw) : String(raw || '');

      if (text && String(text).trim()) {
        logger.info(`[GENERATION] Recovery successful using ${freeModel}`);
        return String(text).trim();
      }
    } catch (err) {
      logger.debug(`[GENERATION] Fallback model ${freeModel} failed: ${err?.message || err}`);
    }
  }

  // 3. Final Fallback: Run the caller-provided failure function (usually throws or returns null/empty)
  logger.error('[GENERATION] All models (primary and free fallbacks) failed.');
  return typeof fallbackFn === 'function' ? fallbackFn() : '';
}

module.exports = { generateWithModelOrFallback };
