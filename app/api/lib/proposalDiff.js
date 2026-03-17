// Computes diff between two living proposal version snapshots
// Returns { added, removed, changed, totalDelta }

/**
 * Compare two snapshot_data.items arrays by ID.
 * @param {Object} prevSnapshot - Previous version's snapshot_data
 * @param {Object} currSnapshot - Current version's snapshot_data
 * @returns {{ added: Array, removed: Array, changed: Array, totalDelta: number }}
 */
export function computeProposalDiff(prevSnapshot, currSnapshot) {
  const prevItems = prevSnapshot?.items || [];
  const currItems = currSnapshot?.items || [];

  const prevMap = new Map(prevItems.map(i => [i.id, i]));
  const currMap = new Map(currItems.map(i => [i.id, i]));

  const added = [];
  const removed = [];
  const changed = [];

  // Find added + changed
  for (const curr of currItems) {
    const prev = prevMap.get(curr.id);
    if (!prev) {
      added.push({ id: curr.id, description: curr.description, division: curr.division });
      continue;
    }
    const changes = [];
    const fields = ['quantity', 'material', 'labor', 'equipment', 'subcontractor', 'unit', 'description', 'division'];
    for (const f of fields) {
      if (String(curr[f] ?? '') !== String(prev[f] ?? '')) {
        changes.push({ field: f, from: prev[f], to: curr[f] });
      }
    }
    if (changes.length > 0) {
      changed.push({ id: curr.id, description: curr.description, division: curr.division, changes });
    }
  }

  // Find removed
  for (const prev of prevItems) {
    if (!currMap.has(prev.id)) {
      removed.push({ id: prev.id, description: prev.description, division: prev.division });
    }
  }

  // Compute total delta
  const prevTotal = parseFloat(prevSnapshot?.grandTotal) || 0;
  const currTotal = parseFloat(currSnapshot?.grandTotal) || 0;
  const totalDelta = currTotal - prevTotal;

  // Markup changes
  const markupChanged = JSON.stringify(prevSnapshot?.markup) !== JSON.stringify(currSnapshot?.markup);

  // Alternates changes
  const prevAlts = prevSnapshot?.alternates || [];
  const currAlts = currSnapshot?.alternates || [];
  const alternatesChanged = JSON.stringify(prevAlts) !== JSON.stringify(currAlts);

  return {
    added,
    removed,
    changed,
    totalDelta,
    markupChanged,
    alternatesChanged,
    summary: buildSummary(added, removed, changed, totalDelta),
  };
}

function buildSummary(added, removed, changed, totalDelta) {
  const parts = [];
  if (added.length > 0) parts.push(`${added.length} item${added.length > 1 ? 's' : ''} added`);
  if (removed.length > 0) parts.push(`${removed.length} item${removed.length > 1 ? 's' : ''} removed`);
  if (changed.length > 0) parts.push(`${changed.length} item${changed.length > 1 ? 's' : ''} modified`);
  if (totalDelta !== 0) {
    const sign = totalDelta > 0 ? '+' : '';
    parts.push(`net ${sign}$${Math.round(totalDelta).toLocaleString()}`);
  }
  return parts.join(', ') || 'No changes';
}
