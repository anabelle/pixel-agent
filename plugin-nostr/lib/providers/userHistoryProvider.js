"use strict";

// User History Provider – summarizes recent interactions with a specific author
// Leverages the existing UserProfileManager memory; no new storage schema required

/**
 * Build a concise summary of recent interactions with an author.
 * @param {object} userProfileManager - instance of UserProfileManager
 * @param {string} pubkey - target author's pubkey
 * @param {object} [options]
 * @param {number} [options.limit=10] - max interactions to include
 * @returns {Promise<{
 *   hasHistory: boolean,
 *   totalInteractions: number,
 *   successfulInteractions: number,
 *   lastInteractionAt: number|null,
 *   lastInteractions: Array<{type: string, ts: number, success?: boolean, summary?: string}>,
 *   summaryLines: string[]
 * }>} 
 */
async function getUserHistory(userProfileManager, pubkey, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit ?? 10)));

  try {
    if (!userProfileManager || typeof userProfileManager.getProfile !== 'function' || !pubkey) {
      return emptyHistory();
    }

    const profile = await userProfileManager.getProfile(pubkey);
    if (!profile) return emptyHistory();

    const interactions = Array.isArray(profile.interactions) ? profile.interactions.slice() : [];
    interactions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const recent = interactions.slice(0, limit);

    const total = Number(profile.totalInteractions || interactions.length || 0) || 0;
    const successful = Number(profile.successfulInteractions || 0) || 0;
    const lastAt = recent.length ? (recent[0].timestamp || null) : (profile.lastInteraction || null);

    const lines = recent.map((i) => {
      const t = typeof i.timestamp === 'number' ? new Date(i.timestamp).toISOString() : '';
      const ty = i.type || 'interaction';
      const ok = i.success === true ? '✓' : i.success === false ? '×' : '';
      const sum = i.summary ? ` – ${String(i.summary).slice(0, 80)}` : '';
      return `${t ? t : ''} ${ty}${ok ? ` ${ok}` : ''}${sum}`.trim();
    });

    return {
      hasHistory: total > 0,
      totalInteractions: total,
      successfulInteractions: successful,
      lastInteractionAt: lastAt || null,
      lastInteractions: recent.map((i) => ({
        type: i.type || 'interaction',
        ts: i.timestamp || 0,
        success: typeof i.success === 'boolean' ? i.success : undefined,
        summary: i.summary ? String(i.summary).slice(0, 120) : undefined,
      })),
      summaryLines: lines,
    };
  } catch (err) {
    // Best-effort; failures should not impact reply pipeline
    try { (userProfileManager?.logger || console).debug?.('[USER-HISTORY] Failed to build history:', err?.message || err); } catch {}
    return emptyHistory();
  }
}

function emptyHistory() {
  return {
    hasHistory: false,
    totalInteractions: 0,
    successfulInteractions: 0,
    lastInteractionAt: null,
    lastInteractions: [],
    summaryLines: [],
  };
}

module.exports = { getUserHistory };
