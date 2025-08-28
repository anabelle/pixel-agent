"use strict";

async function generateWithModelOrFallback(runtime, modelType, prompt, opts, extractFn, sanitizeFn, fallbackFn) {
  try {
    if (!runtime?.useModel) throw new Error('useModel missing');
    const res = await runtime.useModel(modelType, { prompt, ...opts });
    const raw = typeof extractFn === 'function' ? extractFn(res) : '';
    const text = typeof sanitizeFn === 'function' ? sanitizeFn(raw) : String(raw || '');
    if (text && String(text).trim()) return String(text).trim();
    return fallbackFn ? fallbackFn() : '';
  } catch {
    return fallbackFn ? fallbackFn() : '';
  }
}

module.exports = { generateWithModelOrFallback };
