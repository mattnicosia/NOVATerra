import { nn, fmt2 } from '@/utils/format';

const COST_COLUMNS = ["material", "labor", "equipment", "subcontractor"];
const COL_LABELS = { material: "Material", labor: "Labor", equipment: "Equipment", subcontractor: "Subcontractor" };

// ── Status helpers ──────────────────────────────────────────────────────

// Resolve effective status for a single cost column
export const resolveColumnStatus = (item, col) => {
  const cs = item.columnStatus;
  if (cs && cs[col]) return cs[col];
  return item.status || "firm";
};

// Check if item has any allowance state (row-level or column-level)
export const hasAllowance = (item) => {
  if (item.status === "allowance") return true;
  const cs = item.columnStatus;
  if (cs) {
    for (const col of COST_COLUMNS) {
      if (cs[col] === "allowance") return true;
    }
  }
  // Legacy: check old allowanceOf field for backward compat
  const ao = item.allowanceOf;
  if (!ao) return false;
  if (typeof ao === "string") return !!ao;
  return ao.material || ao.labor || ao.equipment || ao.subcontractor;
};

// Check if item has any excluded state
export const hasExclusion = (item) => {
  if (item.status === "excluded") return true;
  const cs = item.columnStatus;
  if (cs) {
    for (const col of COST_COLUMNS) {
      if (cs[col] === "excluded") return true;
    }
  }
  return false;
};

// Check if entirely excluded (all columns or row-level with no overrides)
export const isFullyExcluded = (item) => {
  if (item.status === "excluded" && (!item.columnStatus || Object.keys(item.columnStatus).length === 0)) return true;
  // Check if every column is individually excluded
  return COST_COLUMNS.every(col => resolveColumnStatus(item, col) === "excluded");
};

// Get columns with a specific status
export const getColumnsWithStatus = (item, status) =>
  COST_COLUMNS.filter(col => resolveColumnStatus(item, col) === status);

// Get flagged field names (backward-compat wrapper + new column-level)
export const getAllowanceFields = (item) => {
  // New model: columns with allowance status
  const fromStatus = getColumnsWithStatus(item, "allowance");
  if (fromStatus.length > 0) return fromStatus;
  // Legacy fallback
  const ao = item.allowanceOf;
  if (!ao) return [];
  if (typeof ao === "string") return ao ? [ao] : [];
  return COST_COLUMNS.filter(f => ao[f]);
};

export const getExcludedFields = (item) => getColumnsWithStatus(item, "excluded");
export const getFirmFields = (item) => getColumnsWithStatus(item, "firm");

// ── Totals ──────────────────────────────────────────────────────────────

// Sum of allowance columns * qty * (1 + subMarkup%)
export const getItemAllowanceTotal = (item) => {
  const fields = getAllowanceFields(item);
  if (fields.length === 0) return 0;
  const q = nn(item.quantity);
  const base = fields.reduce((s, f) => s + nn(item[f]), 0) * q;
  const mkup = nn(item.allowanceSubMarkup);
  return base * (1 + mkup / 100);
};

// Sum of excluded columns * qty (for proposal "estimated value of exclusion")
export const getItemExcludedTotal = (item) => {
  const fields = getExcludedFields(item);
  if (fields.length === 0) return 0;
  const q = nn(item.quantity);
  return fields.reduce((s, f) => s + nn(item[f]), 0) * q;
};

// ── Proposal language generation ────────────────────────────────────────

// Professional allowance note with waste factor
export const generateAllowanceNote = (item) => {
  const fields = getAllowanceFields(item);
  if (fields.length === 0) return "";
  const q = nn(item.quantity);
  const waste = nn(item.wasteFactor);
  const effectiveQty = waste > 0 ? q * (1 + waste / 100) : q;

  const parts = fields.map(f => {
    const rate = nn(item[f]);
    const amt = rate * effectiveQty;
    return `$${fmt2(amt).replace("$", "")} for ${COL_LABELS[f] || f} ($${fmt2(rate).replace("$", "")}/${item.unit})`;
  });

  const firmCols = getFirmFields(item);
  const mkup = nn(item.allowanceSubMarkup);

  let note = `An allowance of ${parts.join(" and ")} has been included for ${item.description}`;
  if (waste > 0) note += ` (includes ${waste}% waste factor)`;
  note += ".";

  if (firmCols.length > 0) {
    note += ` ${firmCols.map(f => COL_LABELS[f]).join(" and ")} ${firmCols.length === 1 ? "is" : "are"} firm.`;
  }

  if (mkup > 0) note += ` A ${mkup}% markup applies.`;
  note += " Final selection by Owner.";
  return note;
};

// Professional exclusion note
export const generateExclusionNote = (item) => {
  const excluded = getExcludedFields(item);
  if (excluded.length === 0 && !isFullyExcluded(item)) return "";

  const q = nn(item.quantity);
  const excludedValue = getItemExcludedTotal(item);
  const firm = getFirmFields(item);

  if (isFullyExcluded(item)) {
    return `${item.description} (${nn(q)} ${item.unit}) is excluded from this bid. Estimated value: $${fmt2(excludedValue).replace("$", "")}.`;
  }

  const exLabels = excluded.map(f => COL_LABELS[f]).join(" and ");
  let note = `${exLabels} for ${item.description} ${excluded.length === 1 ? "is" : "are"} excluded from this bid.`;
  if (excludedValue > 0) note += ` Estimated value: $${fmt2(excludedValue).replace("$", "")}.`;
  if (firm.length > 0) {
    note += ` ${firm.map(f => COL_LABELS[f]).join(" and ")} ${firm.length === 1 ? "remains" : "remain"} in the bid.`;
  }
  return note;
};

// Combined proposal summary for all items
export const generateProposalSummary = (items) => {
  const allowanceNotes = [];
  const exclusionNotes = [];

  items.forEach(it => {
    const aN = generateAllowanceNote(it);
    if (aN) allowanceNotes.push(aN);
    const eN = generateExclusionNote(it);
    if (eN) exclusionNotes.push(eN);
  });

  const sections = [];
  if (allowanceNotes.length > 0) {
    sections.push("ALLOWANCES:\n" + allowanceNotes.map((n, i) => `${i + 1}. ${n}`).join("\n"));
  }
  if (exclusionNotes.length > 0) {
    sections.push("EXCLUSIONS:\n" + exclusionNotes.map((n, i) => `${i + 1}. ${n}`).join("\n"));
  }
  return sections.join("\n\n");
};
