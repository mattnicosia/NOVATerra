/**
 * Duplicate Takeoff Detector
 *
 * Detects potential duplicate takeoffs within an estimate by comparing
 * code + drawing sheet combinations, and fuzzy-matching descriptions.
 * Especially important for cross-estimator duplicates where two people
 * start the same scope independently.
 */

// Simple string similarity (Dice coefficient on bigrams)
function similarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Set();
  for (let i = 0; i < s1.length - 1; i++) bigrams1.add(s1.slice(i, i + 2));
  const bigrams2 = new Set();
  for (let i = 0; i < s2.length - 1; i++) bigrams2.add(s2.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigrams1) if (bigrams2.has(bg)) intersection++;
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Detect potential duplicate takeoffs.
 *
 * @param {Array} takeoffs — full takeoffs array from the store
 * @returns {Array<{ existing: object, duplicate: object, reason: string, severity: 'high'|'medium' }>}
 */
export function detectDuplicates(takeoffs) {
  if (!takeoffs || takeoffs.length < 2) return [];
  const dupes = [];
  const seen = {};

  for (const t of takeoffs) {
    if (!t.id) continue;
    const code = (t.code || "").trim();
    const group = (t.group || "").trim();
    const sheets = (t.measurements || []).map(m => m.sheetId).filter(Boolean).sort().join(",");

    // Key 1: Exact code + sheet match (high confidence duplicate)
    if (code) {
      const codeKey = `code:${code}::${sheets}`;
      if (seen[codeKey]) {
        const crossEstimator = t.createdBy && seen[codeKey].createdBy && t.createdBy !== seen[codeKey].createdBy;
        dupes.push({
          existing: seen[codeKey],
          duplicate: t,
          reason: crossEstimator
            ? `Same code (${code}) on same sheet by different estimators`
            : `Same code (${code}) on same sheet`,
          severity: "high",
        });
        continue; // Don't double-flag
      }
      seen[codeKey] = t;
    }

    // Key 2: Same group + similar description (medium confidence)
    if (group) {
      const groupKey = `group:${group}::${sheets}`;
      if (seen[groupKey]) {
        const sim = similarity(t.description, seen[groupKey].description);
        if (sim > 0.7) {
          const crossEstimator = t.createdBy && seen[groupKey].createdBy && t.createdBy !== seen[groupKey].createdBy;
          dupes.push({
            existing: seen[groupKey],
            duplicate: t,
            reason: crossEstimator
              ? `Similar "${t.description}" in ${group} by different estimators`
              : `Similar "${t.description}" in ${group}`,
            severity: sim > 0.85 ? "high" : "medium",
          });
          continue;
        }
      }
      // Only set if no existing — keeps first occurrence as the "original"
      if (!seen[groupKey]) seen[groupKey] = t;
    }
  }

  return dupes;
}

/**
 * Get a dismissal key for a duplicate pair (order-independent).
 */
export function getDuplicateKey(dupe) {
  const ids = [dupe.existing.id, dupe.duplicate.id].sort();
  return `dupe:${ids[0]}:${ids[1]}`;
}

/**
 * Check if a duplicate has been dismissed.
 */
export function isDismissed(dupe) {
  try {
    const dismissed = JSON.parse(localStorage.getItem("bldg-dismissed-dupes") || "[]");
    return dismissed.includes(getDuplicateKey(dupe));
  } catch {
    return false;
  }
}

/**
 * Dismiss a duplicate warning.
 */
export function dismissDuplicate(dupe) {
  try {
    const key = getDuplicateKey(dupe);
    const dismissed = JSON.parse(localStorage.getItem("bldg-dismissed-dupes") || "[]");
    if (!dismissed.includes(key)) {
      dismissed.push(key);
      // Keep max 200 dismissals to prevent localStorage bloat
      if (dismissed.length > 200) dismissed.splice(0, dismissed.length - 200);
      localStorage.setItem("bldg-dismissed-dupes", JSON.stringify(dismissed));
    }
  } catch {
    /* non-critical */
  }
}
