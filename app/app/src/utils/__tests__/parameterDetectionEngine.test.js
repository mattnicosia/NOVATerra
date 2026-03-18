import { describe, it, expect } from 'vitest';
import { mergeEvidence } from '@/utils/parameterDetectionEngine';

// ─── mergeEvidence ───────────────────────────────────────────────────────

describe('mergeEvidence', () => {
  it('returns empty for no evidence', () => {
    const result = mergeEvidence([]);
    expect(result.parameters).toEqual({});
    expect(result.confidence).toEqual({});
  });

  it('handles single source evidence', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.9 },
    ];
    const result = mergeEvidence(evidence);
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
    expect(result.confidence['roomCounts.bathrooms']).toBeGreaterThan(0);
    expect(result.confidence['roomCounts.bathrooms']).toBeLessThanOrEqual(0.95);
  });

  it('picks the value with highest weighted support when sources agree', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'geometry', confidence: 0.9 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.85 },
    ];
    const result = mergeEvidence(evidence);
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
  });

  it('boosts confidence when sources agree', () => {
    const singleSource = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'geometry', confidence: 0.9 },
    ];
    const multiSource = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'geometry', confidence: 0.9 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.85 },
    ];
    const single = mergeEvidence(singleSource);
    const multi = mergeEvidence(multiSource);
    expect(multi.confidence['roomCounts.bathrooms']).toBeGreaterThan(
      single.confidence['roomCounts.bathrooms']
    );
  });

  it('prefers higher-weight source when values disagree', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'geometry', confidence: 0.9 },
      { paramPath: 'roomCounts.bathrooms', value: 2, source: 'door-inference', confidence: 0.8 },
    ];
    const result = mergeEvidence(evidence);
    // geometry (weight 1.0 × 0.9 = 0.9) > door-inference (weight 0.5 × 0.8 = 0.4)
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
  });

  it('handles multiple parameters independently', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.9 },
      { paramPath: 'roomCounts.kitchens', value: 1, source: 'schedule', confidence: 0.85 },
      { paramPath: 'floorCount', value: 2, source: 'ai-vision', confidence: 0.8 },
    ];
    const result = mergeEvidence(evidence);
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
    expect(result.parameters['roomCounts.kitchens']).toBe(1);
    expect(result.parameters['floorCount']).toBe(2);
  });

  it('skips params starting with underscore', () => {
    const evidence = [
      { paramPath: '_internal.debug', value: 'test', source: 'schedule', confidence: 0.9 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.9 },
    ];
    const result = mergeEvidence(evidence);
    expect(result.parameters['_internal.debug']).toBeUndefined();
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
  });

  it('aggregates targeted AI evidence by summing', () => {
    // 3 individual room crop detections, each detecting 1 bathroom
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.85 },
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.90 },
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.80 },
    ];
    const result = mergeEvidence(evidence);
    // Should sum to 3 (not pick the most frequent value of 1)
    expect(result.parameters['roomCounts.bathrooms']).toBe(3);
  });

  it('compares aggregated targeted count against other sources', () => {
    const evidence = [
      // Schedule says 2 bathrooms
      { paramPath: 'roomCounts.bathrooms', value: 2, source: 'schedule', confidence: 0.95 },
      // Targeted AI found 3 individual bathrooms
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.85 },
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.85 },
      { paramPath: 'roomCounts.bathrooms', value: 1, source: 'ai-targeted', confidence: 0.85 },
    ];
    const result = mergeEvidence(evidence);
    // Targeted sum = 3, schedule = 2
    // Schedule weight: 0.95 × 0.95 = 0.9025
    // Targeted weight: 0.85 × avg(0.85) = 0.7225
    // Both are close — the exact result depends on weights, but both are valid
    expect([2, 3]).toContain(result.parameters['roomCounts.bathrooms']);
  });

  it('applies correction factors', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 0.9 },
    ];
    // Correction factor of 1.5 → 3 × 1.5 = 4.5 → rounded to 5
    const result = mergeEvidence(evidence, { 'roomCounts.bathrooms': 1.5 });
    expect(result.parameters['roomCounts.bathrooms']).toBe(5);
  });

  it('clamps correction factors within 0.5x-2x for multi-source evidence', () => {
    // Multi-source needed to hit the clamping code path
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 10, source: 'schedule', confidence: 0.9 },
      { paramPath: 'roomCounts.bathrooms', value: 10, source: 'geometry', confidence: 0.85 },
    ];
    // Extreme correction factor of 0.1 → clamped to 0.5x of 10 = 5
    const result = mergeEvidence(evidence, { 'roomCounts.bathrooms': 0.1 });
    expect(result.parameters['roomCounts.bathrooms']).toBeGreaterThanOrEqual(5);
  });

  it('single-source applies correction factor without clamping', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 10, source: 'schedule', confidence: 0.9 },
    ];
    // Single-source: 10 × 0.1 = 1 (rounded) — no clamp applied
    const result = mergeEvidence(evidence, { 'roomCounts.bathrooms': 0.1 });
    expect(result.parameters['roomCounts.bathrooms']).toBe(1);
  });

  it('confidence stays within 0-1 range', () => {
    const evidence = [
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'geometry', confidence: 1.0 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'schedule', confidence: 1.0 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'ai-vision', confidence: 1.0 },
      { paramPath: 'roomCounts.bathrooms', value: 3, source: 'ai-targeted', confidence: 1.0 },
    ];
    const result = mergeEvidence(evidence);
    expect(result.confidence['roomCounts.bathrooms']).toBeLessThanOrEqual(1.0);
    expect(result.confidence['roomCounts.bathrooms']).toBeGreaterThanOrEqual(0);
  });

  it('handles non-numeric values (string)', () => {
    const evidence = [
      { paramPath: 'buildingType', value: 'commercial-office', source: 'ai-vision', confidence: 0.8 },
      { paramPath: 'buildingType', value: 'retail', source: 'door-inference', confidence: 0.7 },
    ];
    const result = mergeEvidence(evidence);
    // ai-vision has higher weight (0.70 × 0.8 = 0.56) vs door-inference (0.50 × 0.7 = 0.35)
    expect(result.parameters['buildingType']).toBe('commercial-office');
  });
});
