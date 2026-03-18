// Confidence-Weighted Subdivision Engine
// Formula: Final = (W1 × baseline) + (W2 × userHistorical) + (W3 × llmEstimate)
// Weights auto-shift toward user data as sample count grows.
// User direct overrides bypass blending entirely (highest priority).

export const DEFAULT_ENGINE_CONFIG = {
  weights: { baseline: 0.6, userHistorical: 0.3, llm: 0.1 },
  minUserSamples: 3, // min data points before weight shifting
  maxUserWeight: 0.8, // ceiling for user data weight
  llmTemperature: 0.3, // low temp for consistent cost estimates
  autoShiftEnabled: true, // auto-shift weights as user data grows
};

// ─── Compute effective weights based on user data density ─────────
// Sigmoid-like ramp: as sampleCount increases, user weight grows.
// Reaches ~80% of maxUserWeight at 10 samples, ~95% at 20 samples.
export function computeEffectiveWeights(config, userSampleCount) {
  const { weights, minUserSamples = 3, maxUserWeight = 0.8, autoShiftEnabled = true } = config || DEFAULT_ENGINE_CONFIG;

  if (!autoShiftEnabled || userSampleCount < minUserSamples) {
    return { ...weights };
  }

  const userRatio = Math.min(1, 1 - Math.exp(-0.15 * (userSampleCount - minUserSamples)));
  const targetUserWeight = weights.userHistorical + (maxUserWeight - weights.userHistorical) * userRatio;

  // Distribute remaining weight between baseline and LLM proportionally
  const remaining = 1 - targetUserWeight;
  const baselineLlmRatio = weights.baseline / (weights.baseline + weights.llm || 1);

  return {
    baseline: remaining * baselineLlmRatio,
    userHistorical: targetUserWeight,
    llm: remaining * (1 - baselineLlmRatio),
  };
}

// ─── Blend three data sources for a single subdivision ────────────
export function blendSubdivisionCost({ baseline, userHistorical, llmEstimate, config, userSampleCount }) {
  const w = computeEffectiveWeights(config, userSampleCount || 0);

  const baseVal = baseline?.pctOfDiv ?? 0;
  const userVal = userHistorical?.pctOfDiv ?? baseVal;
  const llmVal = llmEstimate?.pctOfDiv ?? baseVal;

  const blended = w.baseline * baseVal + w.userHistorical * userVal + w.llm * llmVal;

  // Confidence tier based on data sources present
  let confidence = "low";
  if (userSampleCount >= 10) confidence = "high";
  else if (userSampleCount >= (config?.minUserSamples || 3)) confidence = "medium";
  else if (llmEstimate && llmEstimate.validated) confidence = "medium";

  return {
    pctOfDiv: blended,
    confidence,
    weights: w,
    sources: {
      hasBaseline: baseline != null,
      hasUser: userHistorical != null && userSampleCount > 0,
      hasLlm: llmEstimate != null,
      userSampleCount: userSampleCount || 0,
    },
  };
}

// ─── Full subdivision breakdown for a ROM division ────────────────
export function computeSubdivisionBreakdown({
  divisionCode: _divisionCode,
  divisionData, // { perSF: {low,mid,high}, total: {low,mid,high} }
  baselineSubdivisions, // from subdivisionBenchmarks
  userOverrides, // user manual overrides
  llmRefinements, // LLM-generated data
  calibrationFactors, // historical calibration
  engineConfig,
}) {
  const baseSubs = baselineSubdivisions || [];
  if (!baseSubs.length) return [];

  const cfg = engineConfig || DEFAULT_ENGINE_CONFIG;

  const result = baseSubs.map(baseSub => {
    const userOverride = userOverrides?.[baseSub.code];
    const llmData = llmRefinements?.[baseSub.code];
    const userSampleCount = calibrationFactors?.[baseSub.code]?.sampleCount || 0;

    // User override = highest priority, bypass blending
    if (userOverride) {
      return {
        ...baseSub,
        pctOfDiv: userOverride.pctOfDiv,
        confidence: "user",
        source: "user_override",
        note: userOverride.note,
      };
    }

    // Blend
    const blended = blendSubdivisionCost({
      baseline: baseSub,
      userHistorical: calibrationFactors?.[baseSub.code],
      llmEstimate: llmData,
      config: cfg,
      userSampleCount,
    });

    return {
      ...baseSub,
      pctOfDiv: blended.pctOfDiv,
      confidence: blended.confidence,
      source: blended.sources.hasUser ? "blended_with_user" : blended.sources.hasLlm ? "blended_with_llm" : "baseline",
      weights: blended.weights,
      sources: blended.sources,
    };
  });

  // Normalize: ensure pctOfDiv values sum to 1.0
  const total = result.reduce((s, r) => s + r.pctOfDiv, 0);
  if (total > 0 && Math.abs(total - 1.0) > 0.001) {
    result.forEach(r => {
      r.pctOfDiv = r.pctOfDiv / total;
    });
  }

  // Apply to division $/SF to get per-subdivision costs
  const div = divisionData;
  if (div) {
    result.forEach(sub => {
      sub.perSF = {
        low: Math.round(div.perSF.low * sub.pctOfDiv * 100) / 100,
        mid: Math.round(div.perSF.mid * sub.pctOfDiv * 100) / 100,
        high: Math.round(div.perSF.high * sub.pctOfDiv * 100) / 100,
      };
      sub.total = {
        low: Math.round(div.total.low * sub.pctOfDiv),
        mid: Math.round(div.total.mid * sub.pctOfDiv),
        high: Math.round(div.total.high * sub.pctOfDiv),
      };
    });
  }

  return result;
}

// ─── Compute subdivision calibration from completed estimates ─────
export function computeSubdivisionCalibration(predictedSubdivisions, actualItems) {
  // Group actual items by subdivision code prefix (e.g., "03.300")
  const actualBySubCode = {};
  (actualItems || []).forEach(item => {
    if (!item.code) return;
    const subCode = item.code.split(".").slice(0, 2).join(".");
    if (!actualBySubCode[subCode]) actualBySubCode[subCode] = 0;
    const q = item.quantity || 1;
    actualBySubCode[subCode] +=
      q * ((item.material || 0) + (item.labor || 0) + (item.equipment || 0) + (item.subcontractor || 0));
  });

  const calibration = {};
  Object.entries(predictedSubdivisions || {}).forEach(([_divCode, subs]) => {
    (subs || []).forEach(sub => {
      const predicted = sub.total?.mid || 0;
      const actual = actualBySubCode[sub.code] || 0;
      if (predicted > 0 && actual > 0) {
        calibration[sub.code] = {
          pctOfDiv: sub.pctOfDiv * (actual / predicted),
          factor: Math.round((actual / predicted) * 100) / 100,
          sampleCount: (calibration[sub.code]?.sampleCount || 0) + 1,
        };
      }
    });
  });

  return calibration;
}

// ─── Confidence tier display helpers ──────────────────────────────
export const CONFIDENCE_TIERS = {
  user: { label: "User", color: "#22C55E", dot: "green" },
  high: { label: "High", color: "#22C55E", dot: "green" },
  medium: { label: "Medium", color: "#FBBF24", dot: "yellow" },
  low: { label: "Low", color: "#FB7185", dot: "red" },
  baseline: { label: "Baseline", color: "#6B7280", dot: "gray" },
};

export function getConfidenceTier(confidence) {
  return CONFIDENCE_TIERS[confidence] || CONFIDENCE_TIERS.baseline;
}
