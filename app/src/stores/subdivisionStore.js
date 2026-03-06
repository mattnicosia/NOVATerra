// Subdivision Store — Zustand state for the confidence-weighted subdivision engine
// Holds subdivision data, user overrides, LLM refinements, engine config, and calibration.

import { create } from "zustand";
import { DEFAULT_ENGINE_CONFIG } from "@/utils/confidenceEngine";

export const useSubdivisionStore = create((set, get) => ({
  // ── Generated subdivision data keyed by division code ──
  // { "03": [ { code, label, pctOfDiv, perSF, total, source, confidence } ] }
  subdivisionData: {},

  // ── Engine configuration (weights, admin settings) ──
  engineConfig: { ...DEFAULT_ENGINE_CONFIG },

  // ── Per-subdivision calibration from completed projects ──
  // { "03.300": { pctOfDiv, factor, sampleCount, lastUpdated } }
  calibrationFactors: {},

  // ── User overrides at subdivision level ──
  // { "03.300": { pctOfDiv, source: "user", note: "", updatedAt } }
  userOverrides: {},

  // ── LLM-generated refinements ──
  // { "03.300": { pctOfDiv, reasoning, generatedAt, validated } }
  llmRefinements: {},

  // ── Generation state ──
  generating: false,
  generatingDivision: null,
  generationProgress: 0, // 0-1
  generationError: null,

  // ── Actions: Subdivision Data ──
  setSubdivisionData: (data) => set({ subdivisionData: data }),
  clearSubdivisionData: () =>
    set({ subdivisionData: {}, llmRefinements: {} }),

  // ── Actions: User Overrides ──
  setUserOverride: (subCode, override) =>
    set((s) => ({
      userOverrides: {
        ...s.userOverrides,
        [subCode]: {
          ...override,
          source: "user",
          updatedAt: new Date().toISOString(),
        },
      },
    })),

  removeUserOverride: (subCode) =>
    set((s) => {
      const next = { ...s.userOverrides };
      delete next[subCode];
      return { userOverrides: next };
    }),

  // ── Actions: LLM Refinements ──
  setLlmRefinements: (refinements) => set({ llmRefinements: refinements }),

  setLlmRefinement: (subCode, data) =>
    set((s) => ({
      llmRefinements: {
        ...s.llmRefinements,
        [subCode]: {
          ...data,
          source: "llm",
          generatedAt: new Date().toISOString(),
          validated: false,
        },
      },
    })),

  validateLlmRefinement: (subCode) =>
    set((s) => ({
      llmRefinements: {
        ...s.llmRefinements,
        [subCode]: {
          ...s.llmRefinements[subCode],
          validated: true,
          validatedAt: new Date().toISOString(),
        },
      },
    })),

  // ── Actions: Engine Config (admin only) ──
  updateEngineConfig: (partial) =>
    set((s) => ({
      engineConfig: { ...s.engineConfig, ...partial },
    })),

  updateWeights: (weights) =>
    set((s) => ({
      engineConfig: {
        ...s.engineConfig,
        weights: { ...s.engineConfig.weights, ...weights },
      },
    })),

  resetEngineConfig: () =>
    set({ engineConfig: { ...DEFAULT_ENGINE_CONFIG } }),

  // ── Actions: Calibration ──
  setCalibrationFactors: (factors) => set({ calibrationFactors: factors }),

  updateCalibration: (subCode, factor) =>
    set((s) => ({
      calibrationFactors: {
        ...s.calibrationFactors,
        [subCode]: {
          ...factor,
          lastUpdated: new Date().toISOString(),
        },
      },
    })),

  // ── Actions: Generation State ──
  setGenerating: (v) => set({ generating: v }),
  setGeneratingDivision: (v) => set({ generatingDivision: v }),
  setGenerationProgress: (v) => set({ generationProgress: v }),
  setGenerationError: (v) => set({ generationError: v }),

  // ── Computed: Stats ──
  getStats: () => {
    const s = get();
    const allSubs = Object.values(s.subdivisionData).flat();
    const totalSubs = allSubs.length;
    const validatedLlm = Object.values(s.llmRefinements).filter(
      (r) => r.validated,
    ).length;
    const userOverrideCount = Object.keys(s.userOverrides).length;
    const calibratedCount = Object.keys(s.calibrationFactors).length;
    return {
      totalSubs,
      validatedLlm,
      userOverrideCount,
      calibratedCount,
    };
  },
}));
