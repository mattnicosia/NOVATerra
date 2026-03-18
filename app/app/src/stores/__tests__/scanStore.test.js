import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the store
vi.mock("@/utils/storage", () => ({
  storage: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/utils/idbKey", () => ({
  idbKey: vi.fn(key => key),
}));

vi.mock("@/stores/uiStore", () => ({
  useUiStore: {
    getState: () => ({
      showToast: vi.fn(),
    }),
  },
}));

vi.mock("@/stores/orgStore", () => ({
  useOrgStore: { getState: () => ({ org: null }) },
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: null }) },
}));

vi.mock("@/stores/projectStore", () => ({
  useProjectStore: {
    getState: () => ({
      project: { jobType: "commercial-office", projectSF: "10000" },
    }),
  },
}));

import { useScanStore } from "@/stores/scanStore";
import { storage } from "@/utils/storage";

const INITIAL_STATE = useScanStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useScanStore.setState(INITIAL_STATE, true);
});

// ─── Initial State ───────────────────────────────────────────────────

describe("scanStore -- initial state", () => {
  it("scanResults is null", () => {
    expect(useScanStore.getState().scanResults).toBeNull();
  });

  it("scanProgress has empty defaults", () => {
    const p = useScanStore.getState().scanProgress;
    expect(p).toEqual({ phase: null, current: 0, total: 0, message: "" });
  });

  it("scanError is null", () => {
    expect(useScanStore.getState().scanError).toBeNull();
  });

  it("learningRecords is empty array", () => {
    expect(useScanStore.getState().learningRecords).toEqual([]);
  });

  it("parameterCorrections is empty array", () => {
    expect(useScanStore.getState().parameterCorrections).toEqual([]);
  });

  it("scanAbortController is null", () => {
    expect(useScanStore.getState().scanAbortController).toBeNull();
  });

  it("scanResultsPending is false", () => {
    expect(useScanStore.getState().scanResultsPending).toBe(false);
  });
});

// ─── setScanResults ──────────────────────────────────────────────────

describe("scanStore -- setScanResults", () => {
  it("sets scan results object", () => {
    const results = { schedules: [{ type: "door" }], rom: {}, timestamp: 123 };
    useScanStore.getState().setScanResults(results);
    expect(useScanStore.getState().scanResults).toEqual(results);
  });

  it("can set results to null", () => {
    useScanStore.getState().setScanResults({ schedules: [] });
    useScanStore.getState().setScanResults(null);
    expect(useScanStore.getState().scanResults).toBeNull();
  });
});

// ─── setScanResultsPending ───────────────────────────────────────────

describe("scanStore -- setScanResultsPending", () => {
  it("sets pending flag to true", () => {
    useScanStore.getState().setScanResultsPending(true);
    expect(useScanStore.getState().scanResultsPending).toBe(true);
  });

  it("sets pending flag to false", () => {
    useScanStore.getState().setScanResultsPending(true);
    useScanStore.getState().setScanResultsPending(false);
    expect(useScanStore.getState().scanResultsPending).toBe(false);
  });
});

// ─── setScanProgress ─────────────────────────────────────────────────

describe("scanStore -- setScanProgress", () => {
  it("updates scan progress", () => {
    const progress = { phase: "parsing", current: 3, total: 5, message: "Parsing door schedule" };
    useScanStore.getState().setScanProgress(progress);
    expect(useScanStore.getState().scanProgress).toEqual(progress);
  });
});

// ─── setScanError ────────────────────────────────────────────────────

describe("scanStore -- setScanError", () => {
  it("sets error string", () => {
    useScanStore.getState().setScanError("Network timeout");
    expect(useScanStore.getState().scanError).toBe("Network timeout");
  });

  it("clears error with null", () => {
    useScanStore.getState().setScanError("Error");
    useScanStore.getState().setScanError(null);
    expect(useScanStore.getState().scanError).toBeNull();
  });
});

// ─── clearScan ───────────────────────────────────────────────────────

describe("scanStore -- clearScan", () => {
  it("resets all scan-related fields", () => {
    useScanStore.setState({
      scanResults: { schedules: [] },
      scanProgress: { phase: "done", current: 5, total: 5, message: "Complete" },
      scanError: "something",
      scanAbortController: new AbortController(),
      scanResultsPending: true,
    });

    useScanStore.getState().clearScan();

    const s = useScanStore.getState();
    expect(s.scanResults).toBeNull();
    expect(s.scanProgress).toEqual({ phase: null, current: 0, total: 0, message: "" });
    expect(s.scanError).toBeNull();
    expect(s.scanAbortController).toBeNull();
    expect(s.scanResultsPending).toBe(false);
  });

  it("does not clear learningRecords", () => {
    useScanStore.setState({ learningRecords: [{ id: 1 }] });
    useScanStore.getState().clearScan();
    expect(useScanStore.getState().learningRecords).toEqual([{ id: 1 }]);
  });

  it("does not clear parameterCorrections", () => {
    useScanStore.setState({ parameterCorrections: [{ field: "floorCount" }] });
    useScanStore.getState().clearScan();
    expect(useScanStore.getState().parameterCorrections).toEqual([{ field: "floorCount" }]);
  });
});

// ─── createAbortController / stopScan ────────────────────────────────

describe("scanStore -- abort controller", () => {
  it("createAbortController stores controller and returns signal", () => {
    const signal = useScanStore.getState().createAbortController();
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    expect(useScanStore.getState().scanAbortController).toBeInstanceOf(AbortController);
  });

  it("stopScan aborts the active controller", () => {
    const signal = useScanStore.getState().createAbortController();
    useScanStore.getState().stopScan();
    expect(signal.aborted).toBe(true);
  });

  it("stopScan clears controller and resets progress", () => {
    useScanStore.getState().createAbortController();
    useScanStore.setState({ scanProgress: { phase: "parsing", current: 2, total: 5, message: "Working" } });
    useScanStore.getState().stopScan();
    expect(useScanStore.getState().scanAbortController).toBeNull();
    expect(useScanStore.getState().scanProgress).toEqual({ phase: null, current: 0, total: 0, message: "" });
  });

  it("stopScan is safe when no controller exists", () => {
    expect(() => useScanStore.getState().stopScan()).not.toThrow();
  });
});

// ─── addLearningRecord ───────────────────────────────────────────────

describe("scanStore -- addLearningRecord", () => {
  it("appends record with timestamp", async () => {
    storage.set.mockResolvedValue(true);
    const record = { estimateId: "e1", romPrediction: {}, actuals: {} };
    await useScanStore.getState().addLearningRecord(record);
    const records = useScanStore.getState().learningRecords;
    expect(records).toHaveLength(1);
    expect(records[0].estimateId).toBe("e1");
    expect(records[0].timestamp).toBeGreaterThan(0);
  });

  it("persists to storage", async () => {
    storage.set.mockResolvedValue(true);
    await useScanStore.getState().addLearningRecord({ estimateId: "e1" });
    expect(storage.set).toHaveBeenCalledWith("bldg-scan-learning", expect.any(String));
  });

  it("shows toast on persistence failure", async () => {
    storage.set.mockResolvedValue(false);
    const showToast = vi.fn();
    const { useUiStore } = await import("@/stores/uiStore");
    useUiStore.getState = () => ({ showToast });

    await useScanStore.getState().addLearningRecord({ estimateId: "e1" });
    expect(showToast).toHaveBeenCalledWith("Calibration data save failed", "error");
  });

  it("accumulates multiple records", async () => {
    storage.set.mockResolvedValue(true);
    await useScanStore.getState().addLearningRecord({ estimateId: "e1" });
    await useScanStore.getState().addLearningRecord({ estimateId: "e2" });
    expect(useScanStore.getState().learningRecords).toHaveLength(2);
  });
});

// ─── loadLearningRecords ─────────────────────────────────────────────

describe("scanStore -- loadLearningRecords", () => {
  it("loads records from storage", async () => {
    const records = [{ estimateId: "e1", timestamp: 123 }];
    storage.get.mockResolvedValue({ value: JSON.stringify(records) });
    await useScanStore.getState().loadLearningRecords();
    expect(useScanStore.getState().learningRecords).toEqual(records);
  });

  it("handles missing storage gracefully", async () => {
    storage.get.mockResolvedValue(undefined);
    await useScanStore.getState().loadLearningRecords();
    expect(useScanStore.getState().learningRecords).toEqual([]);
  });

  it("handles storage error gracefully", async () => {
    storage.get.mockRejectedValue(new Error("DB error"));
    await useScanStore.getState().loadLearningRecords();
    expect(useScanStore.getState().learningRecords).toEqual([]);
  });
});

// ─── getCalibrationFactors ───────────────────────────────────────────

describe("scanStore -- getCalibrationFactors", () => {
  it("returns empty object when no learning records", () => {
    const factors = useScanStore.getState().getCalibrationFactors();
    expect(factors).toEqual({});
  });

  it("computes ratio of actuals/predicted per division", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          romPrediction: { divisions: { "03": { mid: 100000 }, "05": { mid: 50000 } } },
          actuals: { divisions: { "03": 120000, "05": 45000 } },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors();
    // 120000/100000 = 1.2
    expect(factors["03"]).toBeCloseTo(1.2, 1);
    // 45000/50000 = 0.9
    expect(factors["05"]).toBeCloseTo(0.9, 1);
  });

  it("applies recency weighting (15% decay per year)", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          romPrediction: { divisions: { "03": { mid: 100000 } } },
          actuals: { divisions: { "03": 150000 } },
          normalizedToYear: currentYear - 5, // 5 years old
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors();
    // Even with recency weighting, single record ratio is still actual/predicted
    // because both sides are weighted equally
    expect(factors["03"]).toBeCloseTo(1.5, 1);
  });

  it("applies completeness weighting based on division count", () => {
    const currentYear = new Date().getFullYear();
    // Record with only 1 division has completenessWeight = 1/10 = 0.1
    // Record with 10 divisions has completenessWeight = 1.0
    useScanStore.setState({
      learningRecords: [
        {
          romPrediction: { divisions: { "03": { mid: 100000 } } },
          actuals: { divisions: { "03": 130000 } },
          normalizedToYear: currentYear,
        },
        {
          romPrediction: {
            divisions: {
              "03": { mid: 100000 },
              "05": { mid: 50000 },
              "09": { mid: 80000 },
              22: { mid: 40000 },
              23: { mid: 60000 },
              26: { mid: 50000 },
              "07": { mid: 30000 },
              "08": { mid: 40000 },
              "01": { mid: 20000 },
              "06": { mid: 25000 },
            },
          },
          actuals: {
            divisions: {
              "03": 110000,
              "05": 55000,
              "09": 85000,
              22: 42000,
              23: 63000,
              26: 52000,
              "07": 31000,
              "08": 44000,
              "01": 22000,
              "06": 27000,
            },
          },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors();
    // Division 03 appears in both records, factor is a weighted average
    expect(factors["03"]).toBeDefined();
    expect(factors["03"]).toBeGreaterThan(1.0);
  });

  it("filters by buildingType when provided", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          buildingType: "healthcare",
          romPrediction: { divisions: { "03": { mid: 100000 } } },
          actuals: { divisions: { "03": 150000 } },
          normalizedToYear: currentYear,
        },
        {
          buildingType: "retail",
          romPrediction: { divisions: { "03": { mid: 100000 } } },
          actuals: { divisions: { "03": 80000 } },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors("healthcare");
    // Should only use healthcare record: 150000/100000 = 1.5
    expect(factors["03"]).toBeCloseTo(1.5, 1);
  });

  it("falls back to all records when filter returns no matches", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          buildingType: "retail",
          romPrediction: { divisions: { "03": { mid: 100000 } } },
          actuals: { divisions: { "03": 80000 } },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors("nonexistent-type");
    // Falls back to all records
    expect(factors["03"]).toBeCloseTo(0.8, 1);
  });

  it("skips records with missing romPrediction or actuals", () => {
    useScanStore.setState({
      learningRecords: [
        { romPrediction: null, actuals: { divisions: { "03": 100000 } } },
        { romPrediction: { divisions: { "03": { mid: 100000 } } }, actuals: null },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors();
    expect(factors).toEqual({});
  });

  it("skips divisions where predicted or actual is zero", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          romPrediction: { divisions: { "03": { mid: 0 }, "05": { mid: 50000 } } },
          actuals: { divisions: { "03": 100000, "05": 0 } },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors();
    expect(factors["03"]).toBeUndefined();
    expect(factors["05"]).toBeUndefined();
  });

  it("filters by workType and laborType", () => {
    const currentYear = new Date().getFullYear();
    useScanStore.setState({
      learningRecords: [
        {
          workType: "renovation",
          laborType: "union",
          romPrediction: { divisions: { "09": { mid: 100000 } } },
          actuals: { divisions: { "09": 130000 } },
          normalizedToYear: currentYear,
        },
        {
          workType: "new-construction",
          laborType: "open_shop",
          romPrediction: { divisions: { "09": { mid: 100000 } } },
          actuals: { divisions: { "09": 90000 } },
          normalizedToYear: currentYear,
        },
      ],
    });
    const factors = useScanStore.getState().getCalibrationFactors(null, "renovation", "union");
    expect(factors["09"]).toBeCloseTo(1.3, 1);
  });
});

// ─── addParameterCorrection ──────────────────────────────────────────

describe("scanStore -- addParameterCorrection", () => {
  it("appends correction with enriched context", async () => {
    storage.set.mockResolvedValue(true);
    await useScanStore.getState().addParameterCorrection({
      field: "floorCount",
      detected: 3,
      corrected: 5,
    });
    const corrections = useScanStore.getState().parameterCorrections;
    expect(corrections).toHaveLength(1);
    expect(corrections[0].field).toBe("floorCount");
    expect(corrections[0].detected).toBe(3);
    expect(corrections[0].corrected).toBe(5);
    expect(corrections[0].timestamp).toBeGreaterThan(0);
  });

  it("parses string values to integers", async () => {
    storage.set.mockResolvedValue(true);
    await useScanStore.getState().addParameterCorrection({
      field: "floorCount",
      detected: "3",
      corrected: "5",
    });
    const corrections = useScanStore.getState().parameterCorrections;
    expect(corrections[0].detected).toBe(3);
    expect(corrections[0].corrected).toBe(5);
  });

  it("persists corrections to storage", async () => {
    storage.set.mockResolvedValue(true);
    await useScanStore.getState().addParameterCorrection({
      field: "floorCount",
      detected: 3,
      corrected: 5,
    });
    expect(storage.set).toHaveBeenCalledWith("bldg-param-corrections", expect.any(String));
  });
});

// ─── loadParameterCorrections ────────────────────────────────────────

describe("scanStore -- loadParameterCorrections", () => {
  it("loads corrections from storage", async () => {
    const corrections = [{ field: "floorCount", detected: 3, corrected: 5 }];
    storage.get.mockResolvedValue({ value: JSON.stringify(corrections) });
    await useScanStore.getState().loadParameterCorrections();
    expect(useScanStore.getState().parameterCorrections).toEqual(corrections);
  });

  it("handles missing storage gracefully", async () => {
    storage.get.mockResolvedValue(undefined);
    await useScanStore.getState().loadParameterCorrections();
    expect(useScanStore.getState().parameterCorrections).toEqual([]);
  });
});

// ─── getParameterCorrectionFactors ───────────────────────────────────

describe("scanStore -- getParameterCorrectionFactors", () => {
  it("returns empty object when no corrections", () => {
    expect(useScanStore.getState().getParameterCorrectionFactors()).toEqual({});
  });

  it("requires at least 2 data points per field", () => {
    useScanStore.setState({
      parameterCorrections: [{ field: "floorCount", detected: 3, corrected: 5, timestamp: Date.now() }],
    });
    expect(useScanStore.getState().getParameterCorrectionFactors()).toEqual({});
  });

  it("computes weighted ratio from 2+ corrections", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 3, corrected: 6, timestamp: now },
        { field: "floorCount", detected: 4, corrected: 8, timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors();
    // Both corrections have ratio 2.0, so factor should be 2.0
    expect(factors["floorCount"]).toBeCloseTo(2.0, 1);
  });

  it("clamps factors to 0.5-2.0 range", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 1, corrected: 10, timestamp: now },
        { field: "floorCount", detected: 1, corrected: 10, timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors();
    expect(factors["floorCount"]).toBe(2.0);
  });

  it("clamps low factors at 0.5", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 10, corrected: 1, timestamp: now },
        { field: "floorCount", detected: 10, corrected: 1, timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors();
    expect(factors["floorCount"]).toBe(0.5);
  });

  it("filters by buildingType when 3+ matches exist", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 3, corrected: 6, buildingType: "healthcare", timestamp: now },
        { field: "floorCount", detected: 4, corrected: 8, buildingType: "healthcare", timestamp: now },
        { field: "floorCount", detected: 5, corrected: 10, buildingType: "healthcare", timestamp: now },
        { field: "floorCount", detected: 10, corrected: 5, buildingType: "retail", timestamp: now },
        { field: "floorCount", detected: 10, corrected: 5, buildingType: "retail", timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors("healthcare");
    // Healthcare corrections: ratio ~2.0
    expect(factors["floorCount"]).toBeCloseTo(2.0, 1);
  });

  it("falls back to all corrections when <3 matches for buildingType", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 3, corrected: 6, buildingType: "healthcare", timestamp: now },
        { field: "floorCount", detected: 4, corrected: 8, buildingType: "retail", timestamp: now },
        { field: "floorCount", detected: 5, corrected: 10, buildingType: "retail", timestamp: now },
      ],
    });
    // Only 1 healthcare correction, falls back to all 3
    const factors = useScanStore.getState().getParameterCorrectionFactors("healthcare");
    expect(factors["floorCount"]).toBeDefined();
    expect(factors["floorCount"]).toBeCloseTo(2.0, 1);
  });

  it("skips corrections where detected equals corrected", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 5, corrected: 5, timestamp: now },
        { field: "floorCount", detected: 5, corrected: 5, timestamp: now },
        { field: "floorCount", detected: 5, corrected: 5, timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors();
    expect(factors["floorCount"]).toBeUndefined();
  });

  it("handles multiple fields independently", () => {
    const now = Date.now();
    useScanStore.setState({
      parameterCorrections: [
        { field: "floorCount", detected: 3, corrected: 6, timestamp: now },
        { field: "floorCount", detected: 4, corrected: 8, timestamp: now },
        { field: "roomCounts.bathrooms", detected: 2, corrected: 3, timestamp: now },
        { field: "roomCounts.bathrooms", detected: 4, corrected: 6, timestamp: now },
      ],
    });
    const factors = useScanStore.getState().getParameterCorrectionFactors();
    expect(factors["floorCount"]).toBeCloseTo(2.0, 1);
    expect(factors["roomCounts.bathrooms"]).toBeCloseTo(1.5, 1);
  });
});
