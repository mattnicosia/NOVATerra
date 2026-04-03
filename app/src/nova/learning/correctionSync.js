/**
 * Correction Vector Store Sync
 *
 * Syncs local corrections to the pgvector embeddings table and
 * searches for similar corrections during scan parsing.
 *
 * - syncCorrectionsToVector() batch-syncs unsynced corrections
 * - searchSimilarCorrections() finds relevant past corrections for prompts
 */

import { useCorrectionStore } from "./correctionStore";

/**
 * Batch-sync unsynced corrections to pgvector embeddings table.
 * Uses existing embedAndStore() from vectorSearch.js.
 * Marks synced corrections with _synced: true.
 */
export async function syncCorrectionsToVector() {
  const { corrections, setCorrections } = useCorrectionStore.getState();
  const unsynced = corrections.filter(c => !c._synced);
  if (unsynced.length === 0) return;

  // Build embedding texts — each correction becomes a searchable vector
  const texts = unsynced.map(c => {
    const parts = [
      `[${c.type}]`,
      c.scheduleType ? `Schedule: ${c.scheduleType}` : "",
      c.field ? `Field: ${c.field}` : "",
      c.context || "",
      `Original: ${typeof c.original === "string" ? c.original : JSON.stringify(c.original)}`,
      `Corrected: ${typeof c.corrected === "string" ? c.corrected : JSON.stringify(c.corrected)}`,
    ].filter(Boolean).join(" | ");
    return parts;
  });

  const metadata = unsynced.map(c => ({
    type: c.type,
    scheduleType: c.scheduleType || null,
    field: c.field || null,
    sheetLabel: c.sheetLabel || null,
    timestamp: c.timestamp,
  }));

  try {
    const { embedAndStore } = await import("@/utils/vectorSearch");
    await embedAndStore(texts, metadata, "correction");

    // Mark as synced
    const syncedIds = new Set(unsynced.map(c => c.id));
    setCorrections(corrections.map(c => syncedIds.has(c.id) ? { ...c, _synced: true } : c));
    console.log(`[correctionSync] Synced ${unsynced.length} corrections to vector store`);
  } catch (err) {
    console.warn("[correctionSync] Sync failed (non-critical):", err.message);
  }
}

/**
 * Search pgvector for similar past corrections relevant to current parsing.
 * Returns a formatted string to inject into parse prompts.
 *
 * @param {string} scheduleType - e.g. "wall-types", "door", "window"
 * @param {string} contextText - OCR text or other context from the current parse
 * @returns {string} Formatted correction context or empty string
 */
export async function searchSimilarCorrections(scheduleType, contextText) {
  try {
    const { searchSimilar } = await import("@/utils/vectorSearch");
    const query = `${scheduleType} schedule parsing: ${contextText.slice(0, 200)}`;
    const { results } = await searchSimilar(query, {
      kinds: ["correction"],
      limit: 5,
      threshold: 0.4,
    });

    if (!results || results.length === 0) return "";

    // Filter for relevant schedule type
    const relevant = results.filter(r =>
      !r.metadata?.scheduleType || r.metadata.scheduleType === scheduleType
    );
    if (relevant.length === 0) return "";

    // Format as prompt context
    const lines = relevant.slice(0, 3).map(r => `- ${r.content}`);
    return [
      "PAST CORRECTIONS (apply these learned patterns):",
      ...lines,
      "",
    ].join("\n");
  } catch (err) {
    console.warn("[correctionSync] Search failed (non-critical):", err.message);
    return "";
  }
}
