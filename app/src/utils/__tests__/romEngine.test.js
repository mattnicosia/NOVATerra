import { describe, it, expect } from 'vitest';
import { getBuildingParamMultipliers, generateBaselineROM } from '@/utils/romEngine';

// ─── getBuildingParamMultipliers ────────────────────────────────────────

describe('getBuildingParamMultipliers', () => {
  it('returns empty object for no params', () => {
    expect(getBuildingParamMultipliers({})).toEqual({});
  });

  it('returns empty for zero floors and no rooms', () => {
    expect(getBuildingParamMultipliers({ floorCount: 0, roomCounts: {} })).toEqual({});
  });

  // ── Floor count impacts ──

  it('adds concrete + metals multiplier for 5-story building', () => {
    const m = getBuildingParamMultipliers({ floorCount: 5 });
    // Concrete: 1 + (5-3)*0.04 = 1.08
    expect(m['03']).toBeCloseTo(1.08, 2);
    // Metals: 1 + (5-3)*0.05 = 1.10
    expect(m['05']).toBeCloseTo(1.10, 2);
  });

  it('adds elevator multiplier for 2+ stories', () => {
    const m = getBuildingParamMultipliers({ floorCount: 3 });
    // Elevators: 1 + (3-1)*0.15 = 1.30
    expect(m['14']).toBeCloseTo(1.30, 2);
  });

  it('no elevator multiplier for 1-story', () => {
    const m = getBuildingParamMultipliers({ floorCount: 1 });
    expect(m['14']).toBeUndefined();
  });

  it('adds fire suppression for 3+ stories', () => {
    const m = getBuildingParamMultipliers({ floorCount: 4 });
    // Fire: 1 + (4-2)*0.08 = 1.16
    expect(m['21']).toBeCloseTo(1.16, 2);
  });

  it('adds vertical MEP runs for 3+ stories', () => {
    const m = getBuildingParamMultipliers({ floorCount: 5 });
    // Plumbing: 1 + (5-2)*0.03 = 1.09 (but also gets 0.03 from the base calc)
    expect(m['22']).toBeGreaterThan(1);
    expect(m['23']).toBeGreaterThan(1);
    expect(m['26']).toBeGreaterThan(1);
  });

  // ── Basement impacts ──

  it('adds basement multipliers for 1 basement', () => {
    const m = getBuildingParamMultipliers({ basementCount: 1 });
    // Demo: 1 + 1*0.15 = 1.15
    expect(m['02']).toBeCloseTo(1.15, 2);
    // Concrete: 1 + 1*0.10 = 1.10
    expect(m['03']).toBeCloseTo(1.10, 2);
    // Waterproofing: 1 + 1*0.08 = 1.08
    expect(m['07']).toBeCloseTo(1.08, 2);
    // Earthwork: 1 + 1*0.20 = 1.20
    expect(m['31']).toBeCloseTo(1.20, 2);
  });

  // ── Room count impacts ──

  it('adds plumbing multiplier for high bathroom count', () => {
    const m = getBuildingParamMultipliers({ roomCounts: { bathrooms: 8 } });
    // Plumbing: 1 + (8-4)*0.02 = 1.08
    expect(m['22']).toBeCloseTo(1.08, 2);
  });

  it('no bathroom multiplier for 4 or fewer', () => {
    const m = getBuildingParamMultipliers({ roomCounts: { bathrooms: 4 } });
    expect(m['22']).toBeUndefined();
  });

  it('adds kitchen impact on equipment + plumbing', () => {
    const m = getBuildingParamMultipliers({ roomCounts: { kitchens: 2 } });
    // Equipment: 1 + 2*0.10 = 1.20
    expect(m['11']).toBeCloseTo(1.20, 2);
    // Plumbing: 1 + 2*0.05 = 1.10
    expect(m['22']).toBeCloseTo(1.10, 2);
  });

  it('adds elevator room impact on conveying', () => {
    const m = getBuildingParamMultipliers({ roomCounts: { elevators: 3 } });
    // Conveying: 1 + (3-1)*0.25 = 1.50
    expect(m['14']).toBeCloseTo(1.50, 2);
  });

  it('adds server room impact on HVAC/electrical/comms', () => {
    const m = getBuildingParamMultipliers({ roomCounts: { serverRooms: 2 } });
    expect(m['23']).toBeCloseTo(1.12, 2); // HVAC: 1 + 2*0.06
    expect(m['26']).toBeCloseTo(1.08, 2); // Electrical: 1 + 2*0.04
    expect(m['27']).toBeCloseTo(1.16, 2); // Comms: 1 + 2*0.08
  });

  // ── Capping ──

  it('caps multipliers at 2.5x max', () => {
    // 50 floors: concrete = 1 + 47*0.04 = 2.88 → capped at 2.5
    const m = getBuildingParamMultipliers({ floorCount: 50 });
    expect(m['03']).toBe(2.5);
  });

  it('caps multipliers at 0.5x min', () => {
    // Shouldn't happen with normal values but verify the floor
    const m = getBuildingParamMultipliers({ floorCount: 1 });
    Object.values(m).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0.5);
    });
  });
});

// ─── generateBaselineROM ────────────────────────────────────────────────

describe('generateBaselineROM', () => {
  it('generates ROM for commercial office', () => {
    const rom = generateBaselineROM(10000, 'commercial-office');
    expect(rom.projectSF).toBe(10000);
    expect(rom.sfMissing).toBe(false);
    expect(rom.jobType).toBe('commercial-office');
    expect(rom.totals.low).toBeGreaterThan(0);
    expect(rom.totals.mid).toBeGreaterThan(rom.totals.low);
    expect(rom.totals.high).toBeGreaterThan(rom.totals.mid);
  });

  it('returns zero totals for zero SF', () => {
    const rom = generateBaselineROM(0, 'commercial-office');
    expect(rom.sfMissing).toBe(true);
    expect(rom.totals.low).toBe(0);
    expect(rom.totals.mid).toBe(0);
    expect(rom.totals.high).toBe(0);
  });

  it('handles unknown building type by falling back to default', () => {
    const rom = generateBaselineROM(5000, 'unknown-type-xyz');
    expect(rom.totals.mid).toBeGreaterThan(0);
  });

  it('includes division-level breakdowns', () => {
    const rom = generateBaselineROM(10000, 'commercial-office');
    // Commercial office should have Concrete (03)
    expect(rom.divisions['03']).toBeDefined();
    expect(rom.divisions['03'].label).toBe('Concrete');
    expect(rom.divisions['03'].perSF.mid).toBeGreaterThan(0);
    expect(rom.divisions['03'].total.mid).toBe(
      Math.round(10000 * rom.divisions['03'].perSF.mid)
    );
  });

  it('applies work type multiplier', () => {
    const romNew = generateBaselineROM(10000, 'commercial-office', 'new-construction');
    const romReno = generateBaselineROM(10000, 'commercial-office', 'renovation');
    // Renovation typically has a different multiplier than new construction
    // Both should produce valid numbers
    expect(romNew.totals.mid).toBeGreaterThan(0);
    expect(romReno.totals.mid).toBeGreaterThan(0);
  });

  it('applies calibration factors (old 3-arg signature)', () => {
    const romBase = generateBaselineROM(10000, 'commercial-office');
    // Old signature: (sf, jobType, calibrationFactors)
    const romCalib = generateBaselineROM(10000, 'commercial-office', { '03': 1.5 });
    // Concrete should be 50% higher with calibration
    expect(romCalib.divisions['03'].total.mid).toBeGreaterThan(
      romBase.divisions['03'].total.mid
    );
    expect(romCalib.calibrated).toBe(true);
  });

  it('applies calibration factors (new 4-arg signature)', () => {
    const romBase = generateBaselineROM(10000, 'commercial-office', 'new-construction');
    const romCalib = generateBaselineROM(10000, 'commercial-office', 'new-construction', { '03': 1.5 });
    // Concrete should be 50% higher with calibration
    expect(romCalib.divisions['03'].total.mid).toBeGreaterThan(
      romBase.divisions['03'].total.mid
    );
    expect(romCalib.calibrated).toBe(true);
  });

  it('applies building param multipliers', () => {
    const romBase = generateBaselineROM(10000, 'commercial-office');
    const romWithFloors = generateBaselineROM(10000, 'commercial-office', null, null, { floorCount: 10 });
    // 10-story building should have higher structural costs
    expect(romWithFloors.buildingParamAdjusted).toBe(true);
    expect(romWithFloors.divisions['03']?.total.mid).toBeGreaterThan(
      romBase.divisions['03'].total.mid
    );
  });

  it('division totals sum approximately to grand total', () => {
    const rom = generateBaselineROM(10000, 'commercial-office');
    const divSum = Object.values(rom.divisions)
      .reduce((s, d) => s + d.total.mid, 0);
    // Allow for rounding differences (each division rounds independently)
    expect(Math.abs(divSum - rom.totals.mid)).toBeLessThan(Object.keys(rom.divisions).length);
  });

  it('per-SF rates are correct for known benchmarks', () => {
    const rom = generateBaselineROM(10000, 'commercial-office');
    // Commercial office concrete benchmark: low=8, mid=14, high=22
    expect(rom.divisions['03'].perSF.low).toBe(8);
    expect(rom.divisions['03'].perSF.mid).toBe(14);
    expect(rom.divisions['03'].perSF.high).toBe(22);
  });

  it('healthcare is more expensive than commercial office at same SF', () => {
    const office = generateBaselineROM(10000, 'commercial-office');
    const health = generateBaselineROM(10000, 'healthcare');
    expect(health.totals.mid).toBeGreaterThan(office.totals.mid);
  });
});
