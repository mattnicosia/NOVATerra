import {
  DEFAULT_ENGINE_CONFIG,
  computeEffectiveWeights,
  blendSubdivisionCost,
  computeSubdivisionBreakdown,
  computeSubdivisionCalibration,
  CONFIDENCE_TIERS,
  getConfidenceTier,
} from "@/utils/confidenceEngine";

// ── computeEffectiveWeights ───────────────────────────────────────────

describe("computeEffectiveWeights", () => {
  const cfg = DEFAULT_ENGINE_CONFIG;

  it("returns default weights when 0 samples (below min)", () => {
    const w = computeEffectiveWeights(cfg, 0);
    expect(w.baseline).toBe(0.6);
    expect(w.userHistorical).toBe(0.3);
    expect(w.llm).toBe(0.1);
  });

  it("returns default weights when 2 samples (below min=3)", () => {
    const w = computeEffectiveWeights(cfg, 2);
    expect(w.baseline).toBe(0.6);
    expect(w.userHistorical).toBe(0.3);
    expect(w.llm).toBe(0.1);
  });

  it("at exactly 3 samples (threshold), sigmoid input is 0 so weights stay default", () => {
    // exp(-0.15 * (3-3)) = exp(0) = 1, userRatio = 1-1 = 0
    const w = computeEffectiveWeights(cfg, 3);
    expect(w.userHistorical).toBe(0.3);
    expect(w.baseline).toBe(0.6);
  });

  it("starts shifting at 4 samples (above threshold)", () => {
    const w = computeEffectiveWeights(cfg, 4);
    expect(w.userHistorical).toBeGreaterThan(0.3);
    expect(w.baseline).toBeLessThan(0.6);
  });

  it("shifts significantly at 10 samples", () => {
    const w = computeEffectiveWeights(cfg, 10);
    expect(w.userHistorical).toBeGreaterThan(0.5);
    expect(w.baseline).toBeLessThan(0.4);
  });

  it("approaches maxUserWeight (0.8) at 20 samples", () => {
    const w = computeEffectiveWeights(cfg, 20);
    expect(w.userHistorical).toBeGreaterThan(0.7);
    expect(w.userHistorical).toBeLessThanOrEqual(0.8);
  });

  it("weights always sum to 1.0 for every sample count", () => {
    for (const n of [0, 1, 2, 3, 5, 10, 20, 50, 100]) {
      const w = computeEffectiveWeights(cfg, n);
      const sum = w.baseline + w.userHistorical + w.llm;
      expect(sum).toBeCloseTo(1.0, 3);
    }
  });

  it("returns default weights when autoShiftEnabled=false regardless of samples", () => {
    const disabledCfg = { ...cfg, autoShiftEnabled: false };
    const w = computeEffectiveWeights(disabledCfg, 50);
    expect(w.baseline).toBe(0.6);
    expect(w.userHistorical).toBe(0.3);
    expect(w.llm).toBe(0.1);
  });

  it("uses DEFAULT_ENGINE_CONFIG when config is null", () => {
    const w = computeEffectiveWeights(null, 0);
    expect(w.baseline).toBe(0.6);
    expect(w.userHistorical).toBe(0.3);
    expect(w.llm).toBe(0.1);
  });
});

// ── blendSubdivisionCost ──────────────────────────────────────────────

describe("blendSubdivisionCost", () => {
  const cfg = DEFAULT_ENGINE_CONFIG;

  it("blends all three sources with default weights (0 samples)", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.40 },
      userHistorical: { pctOfDiv: 0.50 },
      llmEstimate: { pctOfDiv: 0.45 },
      config: cfg,
      userSampleCount: 0,
    });
    // 0.6*0.40 + 0.3*0.40(fallback to baseVal since <min) + 0.1*0.45
    // Wait — userSampleCount=0 means below min, so default weights.
    // But userHistorical?.pctOfDiv is 0.50, not baseVal.
    // Actual: w={0.6,0.3,0.1}, vals={0.40,0.50,0.45}
    // blended = 0.6*0.40 + 0.3*0.50 + 0.1*0.45 = 0.24 + 0.15 + 0.045 = 0.435
    expect(result.pctOfDiv).toBeCloseTo(0.435, 3);
  });

  it("uses baseline when no user/llm provided", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.25 },
      userHistorical: null,
      llmEstimate: null,
      config: cfg,
      userSampleCount: 0,
    });
    // userVal and llmVal fall back to baseVal (0.25)
    // blended = 0.6*0.25 + 0.3*0.25 + 0.1*0.25 = 0.25
    expect(result.pctOfDiv).toBeCloseTo(0.25, 3);
  });

  it("returns confidence=high when 10+ samples", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.30 },
      userHistorical: { pctOfDiv: 0.35 },
      llmEstimate: null,
      config: cfg,
      userSampleCount: 10,
    });
    expect(result.confidence).toBe("high");
  });

  it("returns confidence=medium when 3-9 samples", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.30 },
      userHistorical: { pctOfDiv: 0.35 },
      llmEstimate: null,
      config: cfg,
      userSampleCount: 5,
    });
    expect(result.confidence).toBe("medium");
  });

  it("returns confidence=low when <3 samples and no validated LLM", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.30 },
      userHistorical: null,
      llmEstimate: null,
      config: cfg,
      userSampleCount: 1,
    });
    expect(result.confidence).toBe("low");
  });

  it("returns confidence=medium when <3 samples but LLM validated", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.30 },
      userHistorical: null,
      llmEstimate: { pctOfDiv: 0.28, validated: true },
      config: cfg,
      userSampleCount: 0,
    });
    expect(result.confidence).toBe("medium");
  });

  it("reports source info correctly", () => {
    const result = blendSubdivisionCost({
      baseline: { pctOfDiv: 0.30 },
      userHistorical: { pctOfDiv: 0.35 },
      llmEstimate: { pctOfDiv: 0.32 },
      config: cfg,
      userSampleCount: 5,
    });
    expect(result.sources.hasBaseline).toBe(true);
    expect(result.sources.hasUser).toBe(true);
    expect(result.sources.hasLlm).toBe(true);
    expect(result.sources.userSampleCount).toBe(5);
  });
});

// ── computeSubdivisionBreakdown ───────────────────────────────────────

describe("computeSubdivisionBreakdown", () => {
  it("returns empty array when no baseline subdivisions", () => {
    const result = computeSubdivisionBreakdown({
      divisionCode: "03",
      divisionData: { perSF: { low: 5, mid: 10, high: 15 }, total: { low: 50000, mid: 100000, high: 150000 } },
      baselineSubdivisions: [],
    });
    expect(result).toEqual([]);
  });

  it("computes breakdown with baseline subdivisions and applies division costs", () => {
    const result = computeSubdivisionBreakdown({
      divisionCode: "03",
      divisionData: { perSF: { low: 10, mid: 20, high: 30 }, total: { low: 100000, mid: 200000, high: 300000 } },
      baselineSubdivisions: [
        { code: "03.100", name: "Formwork", pctOfDiv: 0.30 },
        { code: "03.200", name: "Rebar", pctOfDiv: 0.25 },
        { code: "03.300", name: "Concrete", pctOfDiv: 0.45 },
      ],
      engineConfig: DEFAULT_ENGINE_CONFIG,
    });

    expect(result).toHaveLength(3);
    // pctOfDiv values should sum to 1.0
    const pctSum = result.reduce((s, r) => s + r.pctOfDiv, 0);
    expect(pctSum).toBeCloseTo(1.0, 3);
    // Each sub should have perSF and total objects
    expect(result[0].perSF).toBeDefined();
    expect(result[0].total).toBeDefined();
  });

  it("user override bypasses blending", () => {
    const result = computeSubdivisionBreakdown({
      divisionCode: "03",
      divisionData: { perSF: { low: 10, mid: 20, high: 30 }, total: { low: 100000, mid: 200000, high: 300000 } },
      baselineSubdivisions: [
        { code: "03.100", name: "Formwork", pctOfDiv: 0.50 },
        { code: "03.200", name: "Rebar", pctOfDiv: 0.50 },
      ],
      userOverrides: {
        "03.100": { pctOfDiv: 0.70, note: "User override" },
      },
      engineConfig: DEFAULT_ENGINE_CONFIG,
    });

    const formwork = result.find(r => r.code === "03.100");
    expect(formwork.confidence).toBe("user");
    expect(formwork.source).toBe("user_override");
  });
});

// ── computeSubdivisionCalibration ─────────────────────────────────────

describe("computeSubdivisionCalibration", () => {
  it("computes calibration factors from predicted vs actual", () => {
    const predicted = {
      "03": [
        { code: "03.100", pctOfDiv: 0.5, total: { mid: 50000 } },
        { code: "03.200", pctOfDiv: 0.5, total: { mid: 50000 } },
      ],
    };
    const actual = [
      { code: "03.100.10", quantity: 1, material: 60000, labor: 0, equipment: 0, subcontractor: 0 },
      { code: "03.200.20", quantity: 1, material: 40000, labor: 0, equipment: 0, subcontractor: 0 },
    ];

    const cal = computeSubdivisionCalibration(predicted, actual);
    // 03.100: actual=60000, predicted=50000 → factor=1.2, pctOfDiv=0.5*1.2=0.6
    expect(cal["03.100"]).toBeDefined();
    expect(cal["03.100"].factor).toBe(1.2);
    // 03.200: actual=40000, predicted=50000 → factor=0.8
    expect(cal["03.200"].factor).toBe(0.8);
  });

  it("handles empty inputs gracefully", () => {
    const cal = computeSubdivisionCalibration({}, []);
    expect(Object.keys(cal)).toHaveLength(0);
  });
});

// ── getConfidenceTier ─────────────────────────────────────────────────

describe("getConfidenceTier", () => {
  it("user tier is green", () => {
    expect(getConfidenceTier("user").dot).toBe("green");
  });

  it("high tier is green", () => {
    expect(getConfidenceTier("high").dot).toBe("green");
  });

  it("medium tier is yellow", () => {
    expect(getConfidenceTier("medium").dot).toBe("yellow");
  });

  it("low tier is red", () => {
    expect(getConfidenceTier("low").dot).toBe("red");
  });

  it("unknown tier falls back to baseline (gray)", () => {
    expect(getConfidenceTier("bogus").dot).toBe("gray");
    expect(getConfidenceTier(undefined).dot).toBe("gray");
  });
});

// ── CONFIDENCE_TIERS constant ─────────────────────────────────────────

describe("CONFIDENCE_TIERS", () => {
  it("contains all expected tiers", () => {
    expect(CONFIDENCE_TIERS).toHaveProperty("user");
    expect(CONFIDENCE_TIERS).toHaveProperty("high");
    expect(CONFIDENCE_TIERS).toHaveProperty("medium");
    expect(CONFIDENCE_TIERS).toHaveProperty("low");
    expect(CONFIDENCE_TIERS).toHaveProperty("baseline");
  });
});
