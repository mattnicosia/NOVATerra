/**
 * crossSheetLearning.js — Track prediction patterns across sheets.
 *
 * When doing a takeoff across multiple sheets (E1.1, E1.2, E1.3...),
 * the accept/reject patterns from earlier sheets inform predictions
 * on later sheets:
 *   - Density anchoring: "Previous sheets averaged 23 fixtures each"
 *   - Symbol reinforcement: "The user confirmed the rectangle-with-X symbol"
 *   - Confidence modulation: High accept rate → boost confidence
 *   - Negative learning: "User rejected predictions near title block area"
 *
 * Session-scoped (fresh per session, no cloud persistence).
 */

// ── Session cache: takeoffId → Map<sheetId, SheetResult> ──
const _crossSheetData = new Map();

/**
 * Record prediction results for a sheet.
 * Called after user finishes a sheet (navigates to next page).
 *
 * @param {string} takeoffId
 * @param {string} sheetId — Drawing ID of the completed sheet
 * @param {Object} results
 * @param {number} results.totalPredicted — How many predictions NOVA made
 * @param {number} results.accepted — How many the user accepted
 * @param {number} results.rejected — How many the user explicitly rejected
 * @param {number} results.userAdded — How many the user placed manually (no prediction match)
 * @param {number} results.avgConfidence — Average confidence of accepted predictions
 * @param {string} results.dominantSymbol — Most common symbol/tag found
 */
export function recordSheetResults(takeoffId, sheetId, results) {
  if (!takeoffId || !sheetId) return;

  let takeoffData = _crossSheetData.get(takeoffId);
  if (!takeoffData) {
    takeoffData = new Map();
    _crossSheetData.set(takeoffId, takeoffData);
  }

  takeoffData.set(sheetId, {
    ...results,
    timestamp: Date.now(),
  });

  // Cap at 50 sheets per takeoff
  if (takeoffData.size > 50) {
    const oldest = takeoffData.keys().next().value;
    takeoffData.delete(oldest);
  }
}

/**
 * Auto-record from prediction store state.
 * Call this when user navigates away from a sheet during an active takeoff.
 *
 * @param {string} takeoffId
 * @param {string} sheetId
 * @param {Object} predContext — tkPredContext from takeoffsStore
 * @param {Object} predictions — tkPredictions from takeoffsStore
 * @param {Array} accepted — tkPredAccepted array
 * @param {Array} rejected — tkPredRejected array
 * @param {number} manualCount — Number of manual measurements on this sheet
 */
export function autoRecordFromPredState(takeoffId, sheetId, predContext, predictions, accepted, rejected, manualCount) {
  if (!predContext || !predictions) return;

  recordSheetResults(takeoffId, sheetId, {
    totalPredicted: predictions.predictions?.length || 0,
    accepted: accepted?.length || 0,
    rejected: rejected?.length || 0,
    userAdded: manualCount || 0,
    avgConfidence: predContext.confidence || 0,
    dominantSymbol: predictions.tag || "",
  });
}

/**
 * Get aggregated cross-sheet hints for Vision prompt context.
 * Returns a formatted string to inject into the system prompt.
 *
 * @param {string} takeoffId
 * @returns {string} — Context string or ""
 */
export function getCrossSheetHints(takeoffId) {
  if (!takeoffId) return "";
  const takeoffData = _crossSheetData.get(takeoffId);
  if (!takeoffData || takeoffData.size === 0) return "";

  const sheets = [...takeoffData.values()];

  // Aggregate stats
  const totalAccepted = sheets.reduce((sum, s) => sum + (s.accepted || 0), 0);
  const totalRejected = sheets.reduce((sum, s) => sum + (s.rejected || 0), 0);
  const totalPredicted = sheets.reduce((sum, s) => sum + (s.totalPredicted || 0), 0);
  const totalUserAdded = sheets.reduce((sum, s) => sum + (s.userAdded || 0), 0);
  const totalFound = totalAccepted + totalUserAdded;

  if (totalFound === 0) return "";

  // Density: average elements per sheet
  const avgPerSheet = Math.round(totalFound / sheets.length);

  // Accept rate
  const acceptRate = totalPredicted > 0
    ? Math.round((totalAccepted / totalPredicted) * 100)
    : 0;

  // Dominant symbol
  const symbolCounts = {};
  sheets.forEach(s => {
    if (s.dominantSymbol) {
      symbolCounts[s.dominantSymbol] = (symbolCounts[s.dominantSymbol] || 0) + 1;
    }
  });
  const topSymbol = Object.entries(symbolCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || "";

  const hints = [`CROSS-SHEET LEARNING (from ${sheets.length} previous sheet${sheets.length > 1 ? "s" : ""}):`];

  // Density anchor
  hints.push(`- Average ${avgPerSheet} instances found per sheet — expect a similar count.`);

  // Confidence modulation
  if (acceptRate > 70) {
    hints.push(`- ${acceptRate}% of predictions were accepted — your detection is accurate, maintain approach.`);
  } else if (acceptRate < 30 && totalPredicted > 5) {
    hints.push(`- Only ${acceptRate}% of predictions accepted — be more selective, reduce false positives.`);
  }

  // Symbol reinforcement
  if (topSymbol) {
    hints.push(`- Most common symbol/tag: "${topSymbol}" — prioritize this symbol type.`);
  }

  // Manual additions hint
  if (totalUserAdded > totalAccepted && totalUserAdded > 3) {
    hints.push(`- User placed ${totalUserAdded} manual measurements beyond predictions — scan more thoroughly, you may be missing instances.`);
  }

  return hints.join("\n");
}

/**
 * Get raw cross-sheet data for a takeoff (for debugging/metrics).
 */
export function getCrossSheetData(takeoffId) {
  return _crossSheetData.get(takeoffId) || null;
}

/**
 * Clear cross-sheet data for a takeoff.
 */
export function clearCrossSheetData(takeoffId) {
  _crossSheetData.delete(takeoffId);
}

/**
 * Clear all cross-sheet data (e.g., on estimate change).
 */
export function clearAllCrossSheetData() {
  _crossSheetData.clear();
}
