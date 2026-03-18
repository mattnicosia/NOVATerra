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
    // Item 1: 100 * (25+15+5) = 4,500
    // Item 2: 1 * 50,000 = 50,000
    // Direct: 54,500

    const markup = { overhead: 10, profit: 10, contingency: 5, tax: 8.25 };
    const order = [
      { key: 'overhead', label: 'Overhead', compound: false },
      { key: 'profit', label: 'Profit', compound: false },
      { key: 'contingency', label: 'Contingency', compound: false },
    ];

    const result = calculateTotals(items, markup, order);

    // Direct = 54,500
    const direct = 54500;
    expect(result.direct).toBe(direct);

    // Markups (all non-compound, all on direct):
    // OH: 10% of 54500 = 5450 → running = 59950
    // Profit: 10% of 54500 = 5450 → running = 65400
    // Contingency: 5% of 54500 = 2725 → running = 68125
    const postMarkup = direct + direct * 0.10 + direct * 0.10 + direct * 0.05;
    expect(postMarkup).toBeCloseTo(68125, 0);

    // Tax: 8.25% of 68125 = 5620.31
    const grand = postMarkup * (1 + 0.0825);
    expect(result.grand).toBeCloseTo(grand, 0);
  });
});
