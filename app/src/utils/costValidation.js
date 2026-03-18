// costValidation — Pure validation functions for estimate items
// Takes items array, returns warnings array. No store dependency.

const nn = v => (typeof v === "number" && !isNaN(v) ? v : Number(v) || 0);

/**
 * Run all validation checks on an items array.
 * @param {Array} items - estimate line items
 * @returns {Array<{type: string, severity: 'warn'|'info', itemId?: string, message: string}>}
 */
export function runValidation(items) {
  if (!items || items.length === 0) return [];

  const warnings = [];

  // 1. Zero-cost items — quantity > 0 but all costs are zero
  items.forEach(item => {
    const q = nn(item.quantity);
    if (q <= 0) return;
    const total = nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor);
    if (total === 0) {
      warnings.push({
        type: "zeroTotal",
        severity: "warn",
        itemId: item.id,
        message: `"${item.description || "Unnamed item"}" has quantity ${q} but $0 cost`,
      });
    }
  });

  // 2. High unit rates — material or labor > 2x division average
  const divAvgs = {};
  items.forEach(item => {
    const div = (item.division || "Unassigned").split(" ")[0]; // Use first word/code
    if (!divAvgs[div]) divAvgs[div] = { matSum: 0, labSum: 0, count: 0 };
    divAvgs[div].matSum += nn(item.material);
    divAvgs[div].labSum += nn(item.labor);
    divAvgs[div].count++;
  });
  Object.keys(divAvgs).forEach(div => {
    const d = divAvgs[div];
    d.matAvg = d.count > 0 ? d.matSum / d.count : 0;
    d.labAvg = d.count > 0 ? d.labSum / d.count : 0;
  });
  items.forEach(item => {
    const div = (item.division || "Unassigned").split(" ")[0];
    const avg = divAvgs[div];
    if (!avg || avg.count < 3) return; // Need at least 3 items for meaningful comparison

    const mat = nn(item.material);
    const lab = nn(item.labor);
    if (avg.matAvg > 0 && mat > avg.matAvg * 3 && mat > 100) {
      warnings.push({
        type: "highRate",
        severity: "warn",
        itemId: item.id,
        message: `"${item.description || "Unnamed"}" material ($${mat.toFixed(0)}) is 3x+ the division average ($${avg.matAvg.toFixed(0)})`,
      });
    }
    if (avg.labAvg > 0 && lab > avg.labAvg * 3 && lab > 100) {
      warnings.push({
        type: "highRate",
        severity: "warn",
        itemId: item.id,
        message: `"${item.description || "Unnamed"}" labor ($${lab.toFixed(0)}) is 3x+ the division average ($${avg.labAvg.toFixed(0)})`,
      });
    }
  });

  // 3. Missing CSI code
  const missingCode = items.filter(it => !it.code && nn(it.quantity) > 0 && it.description);
  if (missingCode.length > 0) {
    if (missingCode.length <= 3) {
      missingCode.forEach(item => {
        warnings.push({
          type: "missingCode",
          severity: "info",
          itemId: item.id,
          message: `"${item.description || "Unnamed"}" has no CSI code assigned`,
        });
      });
    } else {
      warnings.push({
        type: "missingCode",
        severity: "info",
        message: `${missingCode.length} items have no CSI code assigned`,
      });
    }
  }

  // 4. Duplicate items — same description + code
  const seen = {};
  items.forEach(item => {
    if (!item.description) return;
    const key = `${(item.code || "").trim()}::${item.description.trim().toLowerCase()}`;
    if (!seen[key]) {
      seen[key] = [];
    }
    seen[key].push(item);
  });
  Object.entries(seen).forEach(([_key, dupes]) => {
    if (dupes.length > 1) {
      warnings.push({
        type: "duplicate",
        severity: "warn",
        itemId: dupes[1].id, // link to the second occurrence
        message: `"${dupes[0].description}" appears ${dupes.length} times (possible duplicate)`,
      });
    }
  });

  return warnings;
}
