import { describe, it, expect } from 'vitest';
import {
  resolveColumnStatus,
  hasAllowance,
  hasExclusion,
  isFullyExcluded,
  getColumnsWithStatus,
  getAllowanceFields,
  getExcludedFields,
  getFirmFields,
  getItemAllowanceTotal,
  getItemExcludedTotal,
  generateAllowanceNote,
  generateExclusionNote,
  generateProposalSummary,
} from '@/utils/allowances';

// ── resolveColumnStatus ─────────────────────────────────────────────────

describe('resolveColumnStatus', () => {
  it('returns row status when no columnStatus', () => {
    expect(resolveColumnStatus({ status: "excluded" }, "material")).toBe("excluded");
  });

  it('defaults to "firm" when no status at all', () => {
    expect(resolveColumnStatus({}, "labor")).toBe("firm");
  });

  it('returns column override when present', () => {
    expect(resolveColumnStatus(
      { status: "firm", columnStatus: { material: "excluded" } },
      "material",
    )).toBe("excluded");
  });

  it('inherits row status for columns without override', () => {
    expect(resolveColumnStatus(
      { status: "allowance", columnStatus: { material: "firm" } },
      "labor",
    )).toBe("allowance");
  });
});

// ── hasAllowance / hasExclusion ─────────────────────────────────────────

describe('hasAllowance', () => {
  it('true for row-level allowance', () => {
    expect(hasAllowance({ status: "allowance" })).toBe(true);
  });

  it('true for column-level allowance', () => {
    expect(hasAllowance({ status: "firm", columnStatus: { material: "allowance" } })).toBe(true);
  });

  it('false for firm item', () => {
    expect(hasAllowance({ status: "firm" })).toBe(false);
  });

  it('true for legacy allowanceOf string', () => {
    expect(hasAllowance({ allowanceOf: "all" })).toBe(true);
  });

  it('true for legacy allowanceOf object', () => {
    expect(hasAllowance({ allowanceOf: { material: true } })).toBe(true);
  });
});

describe('hasExclusion', () => {
  it('true for row-level excluded', () => {
    expect(hasExclusion({ status: "excluded" })).toBe(true);
  });

  it('true for column-level excluded', () => {
    expect(hasExclusion({ status: "firm", columnStatus: { labor: "excluded" } })).toBe(true);
  });

  it('false for firm item', () => {
    expect(hasExclusion({ status: "firm" })).toBe(false);
  });
});

// ── isFullyExcluded ─────────────────────────────────────────────────────

describe('isFullyExcluded', () => {
  it('true for row-level excluded with no overrides', () => {
    expect(isFullyExcluded({ status: "excluded" })).toBe(true);
    expect(isFullyExcluded({ status: "excluded", columnStatus: {} })).toBe(true);
  });

  it('false when one column overrides back to firm', () => {
    expect(isFullyExcluded({ status: "excluded", columnStatus: { labor: "firm" } })).toBe(false);
  });

  it('true when all 4 columns individually excluded', () => {
    expect(isFullyExcluded({
      status: "firm",
      columnStatus: { material: "excluded", labor: "excluded", equipment: "excluded", subcontractor: "excluded" },
    })).toBe(true);
  });

  it('false for firm item', () => {
    expect(isFullyExcluded({ status: "firm" })).toBe(false);
  });
});

// ── Column queries ──────────────────────────────────────────────────────

describe('getColumnsWithStatus', () => {
  it('returns all 4 columns for row-level status', () => {
    expect(getColumnsWithStatus({ status: "excluded" }, "excluded")).toEqual(
      ["material", "labor", "equipment", "subcontractor"],
    );
  });

  it('returns only overridden columns', () => {
    expect(getColumnsWithStatus(
      { status: "firm", columnStatus: { material: "excluded", labor: "excluded" } },
      "excluded",
    )).toEqual(["material", "labor"]);
  });

  it('returns firm columns that inherit from row', () => {
    expect(getFirmFields({ status: "excluded", columnStatus: { labor: "firm" } })).toEqual(["labor"]);
  });
});

// ── Totals ──────────────────────────────────────────────────────────────

describe('getItemAllowanceTotal', () => {
  it('sums allowance columns × qty', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      unit: "SF", status: "firm", columnStatus: { material: "allowance" },
    };
    expect(getItemAllowanceTotal(item)).toBe(50); // 5 * 10
  });

  it('applies sub-markup to allowance total', () => {
    const item = {
      quantity: 10, material: 10, labor: 0, equipment: 0, subcontractor: 0,
      unit: "SF", status: "allowance", allowanceSubMarkup: 15,
    };
    // All columns are allowance: (10+0+0+0) * 10 * 1.15 = 115
    expect(getItemAllowanceTotal(item)).toBeCloseTo(115, 2);
  });

  it('returns 0 for firm item', () => {
    const item = { quantity: 10, material: 5, labor: 3, status: "firm" };
    expect(getItemAllowanceTotal(item)).toBe(0);
  });
});

describe('getItemExcludedTotal', () => {
  it('sums excluded columns × qty', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      status: "firm", columnStatus: { material: "excluded", equipment: "excluded" },
    };
    expect(getItemExcludedTotal(item)).toBe(70); // (5+2) * 10
  });

  it('returns 0 for fully firm item', () => {
    const item = { quantity: 10, material: 5, status: "firm" };
    expect(getItemExcludedTotal(item)).toBe(0);
  });
});

// ── Proposal language ───────────────────────────────────────────────────

describe('generateAllowanceNote', () => {
  it('generates note for allowance row', () => {
    const item = {
      quantity: 100, material: 25, labor: 15, equipment: 0, subcontractor: 0,
      unit: "SF", description: "Drywall", status: "allowance", wasteFactor: 0,
    };
    const note = generateAllowanceNote(item);
    expect(note).toContain("allowance");
    expect(note).toContain("Drywall");
    expect(note).toContain("Material");
    expect(note).toContain("Final selection by Owner");
  });

  it('includes waste factor when set', () => {
    const item = {
      quantity: 100, material: 25, labor: 0, equipment: 0, subcontractor: 0,
      unit: "SF", description: "Tile", status: "allowance", wasteFactor: 10,
    };
    const note = generateAllowanceNote(item);
    expect(note).toContain("10% waste factor");
    // Waste: 100 * 1.10 = 110 effective qty, 25 * 110 = 2750
    expect(note).toContain("2,750");
  });

  it('mentions firm columns when mixed', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      unit: "SF", description: "Paint",
      status: "firm", columnStatus: { material: "allowance" },
    };
    const note = generateAllowanceNote(item);
    expect(note).toContain("Material");
    expect(note).toContain("Labor");
    expect(note).toContain("firm");
  });

  it('returns empty for firm item', () => {
    expect(generateAllowanceNote({ status: "firm", quantity: 10, material: 5, unit: "SF", description: "X" })).toBe("");
  });
});

describe('generateExclusionNote', () => {
  it('generates note for fully excluded item', () => {
    const item = {
      quantity: 100, material: 25, labor: 15, equipment: 5, subcontractor: 0,
      unit: "SF", description: "Millwork", status: "excluded",
    };
    const note = generateExclusionNote(item);
    expect(note).toContain("excluded from this bid");
    expect(note).toContain("Millwork");
    expect(note).toContain("Estimated value");
  });

  it('generates note for partially excluded item', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      unit: "SF", description: "Flooring",
      status: "firm", columnStatus: { material: "excluded" },
    };
    const note = generateExclusionNote(item);
    expect(note).toContain("Material");
    expect(note).toContain("excluded");
    expect(note).toContain("remain");
  });

  it('returns empty for firm item', () => {
    expect(generateExclusionNote({ status: "firm", quantity: 10, material: 5, unit: "SF", description: "X" })).toBe("");
  });
});

describe('generateProposalSummary', () => {
  it('generates combined sections for mixed items', () => {
    const items = [
      { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, unit: "SF", description: "Drywall", status: "allowance", wasteFactor: 5 },
      { quantity: 1, material: 0, labor: 0, equipment: 0, subcontractor: 50000, unit: "LS", description: "HVAC", status: "excluded" },
      { quantity: 20, material: 10, labor: 5, equipment: 0, subcontractor: 0, unit: "LF", description: "Baseboard", status: "firm" },
    ];
    const summary = generateProposalSummary(items);
    expect(summary).toContain("ALLOWANCES:");
    expect(summary).toContain("EXCLUSIONS:");
    expect(summary).toContain("Drywall");
    expect(summary).toContain("HVAC");
    expect(summary).not.toContain("Baseboard"); // firm item has no notes
  });

  it('returns empty for all-firm items', () => {
    const items = [
      { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, unit: "SF", description: "X", status: "firm" },
    ];
    expect(generateProposalSummary(items)).toBe("");
  });
});
