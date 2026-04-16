import { describe, it, expect } from 'vitest';
import { nn } from '@/utils/format';

/**
 * Tests for the core money math used across the estimating system.
 * These test the calculation formulas directly (not through Zustand stores)
 * to verify the arithmetic that determines every dollar in the system.
 */

// ── Line item total calculation (mirrors itemsStore.getItemTotal) ──────

function lineItemTotal(item, laborMult = 1.0, locationFactors = { mat: 1, lab: 1, equip: 1 }) {
  const q = nn(item.quantity);
  const loc = item.locationLocked ? { mat: 1, lab: 1, equip: 1 } : locationFactors;
  return q * (nn(item.material) * loc.mat + nn(item.labor) * laborMult * loc.lab + nn(item.equipment) * loc.equip + nn(item.subcontractor));
}

// ── Grand total calculation (mirrors itemsStore.getTotals) ─────────────

function calculateTotals(items, markup = {}, markupOrder = [], customMarkups = [], laborMult = 1.0, locationFactors = { mat: 1, lab: 1, equip: 1 }) {
  let material = 0, labor = 0, equipment = 0, sub = 0;
  items.forEach(it => {
    const q = nn(it.quantity);
    const loc = it.locationLocked ? { mat: 1, lab: 1, equip: 1 } : locationFactors;
    material += q * nn(it.material) * loc.mat;
    labor += q * nn(it.labor) * loc.lab;
    equipment += q * nn(it.equipment) * loc.equip;
    sub += q * nn(it.subcontractor);
  });
  labor = labor * laborMult;
  const direct = material + labor + equipment + sub;

  let running = direct;
  markupOrder.forEach(mo => {
    if (mo.active === false) return;
    const pct = nn(markup[mo.key]);
    if (pct === 0) return;
    const base = mo.compound ? running : direct;
    running += base * pct / 100;
  });

  let grand = running;
  grand *= (1 + nn(markup.tax) / 100);
  grand *= (1 + nn(markup.bond) / 100);

  customMarkups.forEach(cm => {
    if (cm.type === "pct") grand *= (1 + nn(cm.value) / 100);
    else grand += nn(cm.value);
  });

  return { material, labor, equipment, sub, direct, grand };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Line Item Total', () => {
  it('calculates qty × (m + l + e + sub)', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0 };
    expect(lineItemTotal(item)).toBe(10 * (5 + 3 + 2));
    expect(lineItemTotal(item)).toBe(100);
  });

  it('handles zero quantity', () => {
    const item = { quantity: 0, material: 100, labor: 50, equipment: 25, subcontractor: 10 };
    expect(lineItemTotal(item)).toBe(0);
  });

  it('handles missing fields gracefully (nn converts to 0)', () => {
    const item = { quantity: 5, material: 10 }; // no labor, equipment, sub
    expect(lineItemTotal(item)).toBe(50);
  });

  it('handles string values (nn parses them)', () => {
    const item = { quantity: '3', material: '10.50', labor: '5.25', equipment: '0', subcontractor: '' };
    expect(lineItemTotal(item)).toBeCloseTo(3 * (10.50 + 5.25), 2);
  });

  it('applies labor multiplier to labor only', () => {
    const item = { quantity: 1, material: 100, labor: 100, equipment: 100, subcontractor: 100 };
    // With 1.5x labor mult: 100 + 150 + 100 + 100 = 450
    expect(lineItemTotal(item, 1.5)).toBe(450);
  });

  it('applies location factors correctly', () => {
    const item = { quantity: 1, material: 100, labor: 100, equipment: 100, subcontractor: 100 };
    const loc = { mat: 1.1, lab: 0.9, equip: 1.2 };
    // mat: 100*1.1 + lab: 100*1*0.9 + equip: 100*1.2 + sub: 100 = 110 + 90 + 120 + 100 = 420
    expect(lineItemTotal(item, 1.0, loc)).toBeCloseTo(420, 2);
  });

  it('ignores location factors when locationLocked is true', () => {
    const item = { quantity: 1, material: 100, labor: 100, equipment: 100, subcontractor: 100, locationLocked: true };
    const loc = { mat: 2.0, lab: 2.0, equip: 2.0 }; // should be ignored
    expect(lineItemTotal(item, 1.0, loc)).toBe(400);
  });

  it('handles subcontractor-only items', () => {
    const item = { quantity: 1, material: 0, labor: 0, equipment: 0, subcontractor: 50000 };
    expect(lineItemTotal(item)).toBe(50000);
  });

  it('handles fractional quantities', () => {
    const item = { quantity: 2.5, material: 100, labor: 0, equipment: 0, subcontractor: 0 };
    expect(lineItemTotal(item)).toBe(250);
  });
});

describe('Grand Total Calculation', () => {
  const sampleItems = [
    { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0 },
    { quantity: 5, material: 20, labor: 10, equipment: 5, subcontractor: 5 },
  ];
  // Item 1: 10 * (5+3+2) = 100
  // Item 2: 5 * (20+10+5+5) = 200
  // Direct = 300

  it('sums to direct cost with no markups', () => {
    const result = calculateTotals(sampleItems);
    expect(result.direct).toBe(300);
    expect(result.grand).toBe(300);
  });

  it('breaks down by cost type', () => {
    const result = calculateTotals(sampleItems);
    expect(result.material).toBe(10 * 5 + 5 * 20); // 50 + 100 = 150
    expect(result.labor).toBe(10 * 3 + 5 * 10);     // 30 + 50 = 80
    expect(result.equipment).toBe(10 * 2 + 5 * 5);   // 20 + 25 = 45
    expect(result.sub).toBe(10 * 0 + 5 * 5);          // 0 + 25 = 25
  });

  it('applies non-compound markup (percentage of direct)', () => {
    const markup = { overhead: 10 }; // 10% overhead
    const order = [{ key: 'overhead', label: 'Overhead', compound: false }];
    const result = calculateTotals(sampleItems, markup, order);
    // Direct = 300, overhead = 10% of 300 = 30, grand = 330
    expect(result.grand).toBeCloseTo(330, 2);
  });

  it('applies compound markup (percentage of running total)', () => {
    const markup = { overhead: 10, profit: 10 };
    const order = [
      { key: 'overhead', label: 'Overhead', compound: false },
      { key: 'profit', label: 'Profit', compound: true },
    ];
    const result = calculateTotals(sampleItems, markup, order);
    // Direct = 300
    // Overhead = 10% of 300 = 30 → running = 330
    // Profit = 10% of 330 (compound) = 33 → running = 363
    expect(result.grand).toBeCloseTo(363, 2);
  });

  it('applies non-compound markup independently (both on direct)', () => {
    const markup = { overhead: 10, profit: 10 };
    const order = [
      { key: 'overhead', label: 'Overhead', compound: false },
      { key: 'profit', label: 'Profit', compound: false },
    ];
    const result = calculateTotals(sampleItems, markup, order);
    // Direct = 300
    // Overhead = 10% of 300 = 30 → running = 330
    // Profit = 10% of 300 (non-compound, based on direct) = 30 → running = 360
    expect(result.grand).toBeCloseTo(360, 2);
  });

  it('skips inactive markups', () => {
    const markup = { overhead: 10, profit: 50 };
    const order = [
      { key: 'overhead', label: 'Overhead', compound: false },
      { key: 'profit', label: 'Profit', compound: false, active: false },
    ];
    const result = calculateTotals(sampleItems, markup, order);
    // Only overhead applied, profit is inactive
    expect(result.grand).toBeCloseTo(330, 2);
  });

  it('applies tax on post-markup total', () => {
    const markup = { overhead: 10, tax: 8 };
    const order = [{ key: 'overhead', label: 'Overhead', compound: false }];
    const result = calculateTotals(sampleItems, markup, order);
    // Direct = 300, overhead = 30 → running = 330
    // Tax = 8% of 330 = 26.4 → grand = 356.4
    expect(result.grand).toBeCloseTo(356.4, 2);
  });

  it('applies bond on post-markup+tax total', () => {
    const markup = { tax: 10, bond: 5 };
    const result = calculateTotals(sampleItems, markup, []);
    // Direct = 300
    // Tax = 10% → 330
    // Bond = 5% of 330 → 346.5
    expect(result.grand).toBeCloseTo(346.5, 2);
  });

  it('applies percentage custom markup', () => {
    const customMarkups = [{ type: 'pct', value: 10 }];
    const result = calculateTotals(sampleItems, {}, [], customMarkups);
    // Direct = 300, custom 10% → 330
    expect(result.grand).toBeCloseTo(330, 2);
  });

  it('applies flat dollar custom markup', () => {
    const customMarkups = [{ type: 'flat', value: 1000 }];
    const result = calculateTotals(sampleItems, {}, [], customMarkups);
    // Direct = 300 + 1000 = 1300
    expect(result.grand).toBeCloseTo(1300, 2);
  });

  it('handles empty items array', () => {
    const result = calculateTotals([]);
    expect(result.direct).toBe(0);
    expect(result.grand).toBe(0);
  });

  it('applies labor multiplier across all items', () => {
    const result = calculateTotals(sampleItems, {}, [], [], 1.5);
    // Labor: (30 + 50) * 1.5 = 120 (instead of 80)
    // Direct: 150 + 120 + 45 + 25 = 340
    expect(result.labor).toBeCloseTo(120, 2);
    expect(result.direct).toBeCloseTo(340, 2);
  });

  it('full realistic scenario: direct + markups + tax', () => {
    const items = [
      { quantity: 100, material: 25, labor: 15, equipment: 5, subcontractor: 0 },
      { quantity: 1, material: 0, labor: 0, equipment: 0, subcontractor: 50000 },
    ];
    const markup = { overhead: 10, profit: 10, contingency: 5, tax: 8.25 };
    const order = [
      { key: 'overhead', label: 'Overhead', compound: false },
      { key: 'profit', label: 'Profit', compound: false },
      { key: 'contingency', label: 'Contingency', compound: false },
    ];
    const result = calculateTotals(items, markup, order);
    const direct = 54500;
    expect(result.direct).toBe(direct);
    const postMarkup = direct + direct * 0.10 + direct * 0.10 + direct * 0.05;
    expect(postMarkup).toBeCloseTo(68125, 0);
    const grand = postMarkup * (1 + 0.0825);
    expect(result.grand).toBeCloseTo(grand, 0);
  });
});

// ── Exclude / Allowance accounting ──────────────────────────────────────

// Helper: resolve column status (mirrors itemsStore._colStatus)
function colStatus(item, col) {
  const cs = item.columnStatus;
  if (cs && cs[col]) return cs[col];
  return item.status || "firm";
}

// Line item total respecting exclude (mirrors updated itemsStore.getItemTotal)
function lineItemTotalWithStatus(item, laborMult = 1.0, locationFactors = { mat: 1, lab: 1, equip: 1 }) {
  if (item.status === "excluded" && (!item.columnStatus || Object.keys(item.columnStatus).length === 0)) return 0;
  const q = nn(item.quantity);
  const loc = item.locationLocked ? { mat: 1, lab: 1, equip: 1 } : locationFactors;
  const mat = colStatus(item, "material") === "excluded" ? 0 : nn(item.material) * loc.mat;
  const lab = colStatus(item, "labor") === "excluded" ? 0 : nn(item.labor) * laborMult * loc.lab;
  const eqp = colStatus(item, "equipment") === "excluded" ? 0 : nn(item.equipment) * loc.equip;
  const sub = colStatus(item, "subcontractor") === "excluded" ? 0 : nn(item.subcontractor);
  return q * (mat + lab + eqp + sub);
}

describe('Exclude/Allowance Status Model', () => {
  it('firm item total unchanged from legacy calculation', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, status: "firm" };
    expect(lineItemTotalWithStatus(item)).toBe(lineItemTotal(item));
    expect(lineItemTotalWithStatus(item)).toBe(100);
  });

  it('excluded row-level returns 0', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, status: "excluded" };
    expect(lineItemTotalWithStatus(item)).toBe(0);
  });

  it('allowance row-level still counts in total (same as firm)', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, status: "allowance" };
    expect(lineItemTotalWithStatus(item)).toBe(100);
  });

  it('column-level exclude zeroes only that column', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      status: "firm", columnStatus: { material: "excluded" },
    };
    // Only labor + equipment: 10 * (3 + 2) = 50
    expect(lineItemTotalWithStatus(item)).toBe(50);
  });

  it('column-level exclude on multiple columns', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 10,
      status: "firm", columnStatus: { material: "excluded", equipment: "excluded" },
    };
    // Only labor + sub: 10 * (3 + 10) = 130
    expect(lineItemTotalWithStatus(item)).toBe(130);
  });

  it('excluded row with column override re-includes that column', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      status: "excluded", columnStatus: { labor: "firm" },
    };
    // Row excluded, but labor overridden to firm → only labor: 10 * 3 = 30
    // Material inherits "excluded", equipment inherits "excluded", sub inherits "excluded"
    expect(lineItemTotalWithStatus(item)).toBe(30);
  });

  it('column-level allowance does NOT exclude from total', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0,
      status: "firm", columnStatus: { material: "allowance" },
    };
    // Allowance still counted, same as firm: 10 * (5+3+2) = 100
    expect(lineItemTotalWithStatus(item)).toBe(100);
  });

  it('mixed: material excluded, labor allowance, rest firm', () => {
    const item = {
      quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 1,
      status: "firm", columnStatus: { material: "excluded", labor: "allowance" },
    };
    // Material excluded (0), labor allowance (still counted: 3), equip firm (2), sub firm (1)
    // 10 * (0 + 3 + 2 + 1) = 60
    expect(lineItemTotalWithStatus(item)).toBe(60);
  });

  it('no status field defaults to firm (backward compat)', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0 };
    expect(lineItemTotalWithStatus(item)).toBe(100);
  });

  it('empty columnStatus inherits row status', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, status: "excluded", columnStatus: {} };
    expect(lineItemTotalWithStatus(item)).toBe(0);
  });
});

// ── Legacy migration ────────────────────────────────────────────────────

// Mirror of _migrateItemStatus from itemsStore (tested standalone so we don't
// need to spin up the full Zustand store in a unit test)
function migrateItemStatus(item) {
  if (item.status) return item;
  const next = { ...item };

  if (item.excluded) {
    next.status = "excluded";
    next.columnStatus = {};
    delete next.excluded;
    return next;
  }

  const ao = item.allowanceOf;
  if (ao) {
    if (typeof ao === "string" && ao) {
      next.status = "allowance";
      next.columnStatus = {};
    } else if (typeof ao === "object") {
      const flaggedCols = ["material", "labor", "equipment", "subcontractor"].filter(c => ao[c]);
      if (flaggedCols.length === 4) {
        next.status = "allowance";
        next.columnStatus = {};
      } else if (flaggedCols.length > 0) {
        next.status = "firm";
        next.columnStatus = {};
        flaggedCols.forEach(c => { next.columnStatus[c] = "allowance"; });
      }
    }
    if (next.status) return next;
  }

  next.status = "firm";
  next.columnStatus = next.columnStatus || {};
  return next;
}

describe('Legacy Status Migration', () => {
  it('item with no status defaults to firm', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0 };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("firm");
    expect(migrated.columnStatus).toEqual({});
  });

  it('item with status already set is unchanged', () => {
    const item = { quantity: 10, material: 5, status: "excluded", columnStatus: { labor: "firm" } };
    const migrated = migrateItemStatus(item);
    expect(migrated).toBe(item); // same reference, not copied
  });

  it('excluded: true migrates to status: "excluded"', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, excluded: true };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("excluded");
    expect(migrated.columnStatus).toEqual({});
    expect(migrated.excluded).toBeUndefined();
    // Verify accounting: excluded item should be zero
    expect(lineItemTotalWithStatus(migrated)).toBe(0);
  });

  it('excluded: false does NOT migrate to excluded', () => {
    const item = { quantity: 10, material: 5, labor: 3, excluded: false };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("firm");
  });

  it('allowanceOf: "all" migrates to status: "allowance"', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, allowanceOf: "all" };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("allowance");
    expect(migrated.columnStatus).toEqual({});
    // Allowance stays in total (same as firm)
    expect(lineItemTotalWithStatus(migrated)).toBe(100);
  });

  it('allowanceOf: { material: true } migrates to column-level allowance', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, allowanceOf: { material: true } };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("firm");
    expect(migrated.columnStatus).toEqual({ material: "allowance" });
    // Material is allowance (still in total), so total unchanged
    expect(lineItemTotalWithStatus(migrated)).toBe(100);
  });

  it('allowanceOf: all 4 columns → row-level allowance', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 1, allowanceOf: { material: true, labor: true, equipment: true, subcontractor: true } };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("allowance");
    expect(migrated.columnStatus).toEqual({});
  });

  it('allowanceOf: partial object → firm + column overrides', () => {
    const item = { quantity: 10, material: 5, labor: 3, equipment: 2, subcontractor: 0, allowanceOf: { material: true, labor: true } };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("firm");
    expect(migrated.columnStatus).toEqual({ material: "allowance", labor: "allowance" });
  });

  it('allowanceOf: empty string does not trigger allowance', () => {
    const item = { quantity: 10, material: 5, allowanceOf: "" };
    const migrated = migrateItemStatus(item);
    expect(migrated.status).toBe("firm");
  });
});
