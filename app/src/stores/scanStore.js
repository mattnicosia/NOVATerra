import { create } from 'zustand';
import { storage } from '@/utils/storage';
import { useUiStore } from '@/stores/uiStore';

export const useScanStore = create((set, get) => ({
  // Scan results for the current estimate
  scanResults: null,          // { schedules: [], rom: null, timestamp }
  scanProgress: { phase: null, current: 0, total: 0, message: "" },
  scanError: null,

  // Learning records — shared across estimates
  learningRecords: [],        // [{ estimateId, romPrediction, actuals, calibration, timestamp }]

  // Parameter correction records — tracks user corrections to auto-detected values
  parameterCorrections: [],   // [{ field, detected, corrected, buildingType, projectSF, timestamp }]

  // ── Actions ──
  setScanResults: (results) => set({ scanResults: results }),

  setScanProgress: (progress) => set({ scanProgress: progress }),

  setScanError: (error) => set({ scanError: error }),

  clearScan: () => set({ scanResults: null, scanProgress: { phase: null, current: 0, total: 0, message: "" }, scanError: null }),

  // ── Learning Records ──
  addLearningRecord: async (record) => {
    const records = [...get().learningRecords, { ...record, timestamp: Date.now() }];
    set({ learningRecords: records });
    // Persist learning data globally (shared across estimates)
    try {
      const ok = await storage.set('bldg-scan-learning', JSON.stringify(records));
      if (!ok) {
        console.error('[scanStore] Failed to persist learning record');
        useUiStore.getState().showToast("Calibration data save failed", "error");
      }
    } catch (err) {
      console.error('[scanStore] Learning record persistence error:', err);
      useUiStore.getState().showToast("Calibration data save failed", "error");
    }
  },

  loadLearningRecords: async () => {
    try {
      const raw = await storage.get('bldg-scan-learning');
      if (raw) {
        const records = JSON.parse(raw.value);
        set({ learningRecords: records });
      }
    } catch (err) {
      console.warn('[scanStore] Failed to load learning records:', err);
    }
  },

  // Compute calibration factors from learning history
  // Returns { "03": 1.12, "05": 0.94, ... } — weighted ratio of actuals/predicted per division
  // Optional filters: buildingType, workType, laborType — narrows to matching records, falls back to all
  // Applies recency weighting (15% decay/year) and completeness weighting (division count)
  getCalibrationFactors: (buildingType, workType, laborType) => {
    let records = get().learningRecords;
    if (records.length === 0) return {};

    // Filter by taxonomy if provided (fall back to all records if no matches)
    if (buildingType || workType || laborType) {
      const filtered = records.filter(rec => {
        if (buildingType && rec.buildingType && rec.buildingType !== buildingType) return false;
        if (workType && rec.workType && rec.workType !== workType) return false;
        if (laborType && rec.laborType && rec.laborType !== laborType) return false;
        return true;
      });
      if (filtered.length > 0) records = filtered;
    }

    const currentYear = new Date().getFullYear();
    const divTotals = {};  // { div: { predicted: 0, actual: 0, count: 0 } }

    records.forEach(rec => {
      if (!rec.romPrediction?.divisions || !rec.actuals?.divisions) return;

      // Recency weight: 15% decay per year from current year
      const recYear = rec.normalizedToYear || rec.originalYear || currentYear;
      const age = Math.max(0, currentYear - recYear);
      const recencyWeight = Math.pow(0.85, age);

      // Completeness weight: entries with more divisions carry more influence
      const divCount = Object.keys(rec.actuals.divisions).length;
      const completenessWeight = Math.min(1, divCount / 10);

      const weight = recencyWeight * completenessWeight;

      Object.keys(rec.romPrediction.divisions).forEach(div => {
        const predicted = rec.romPrediction.divisions[div]?.mid || 0;
        const actual = rec.actuals.divisions[div] || 0;
        if (predicted > 0 && actual > 0) {
          if (!divTotals[div]) divTotals[div] = { predicted: 0, actual: 0, count: 0 };
          divTotals[div].predicted += predicted * weight;
          divTotals[div].actual += actual * weight;
          divTotals[div].count += 1;
        }
      });
    });

    const factors = {};
    Object.entries(divTotals).forEach(([div, { predicted, actual, count }]) => {
      if (count >= 1 && predicted > 0) {
        factors[div] = actual / predicted;
      }
    });
    return factors;
  },

  // ── Parameter Correction Tracking ──
  // When user corrects an auto-detected parameter, record it for future scans

  addParameterCorrection: async ({ field, detected, corrected }) => {
    // Enrich with project context for better filtering later
    let buildingType = '', projectSF = 0;
    try {
      const { useProjectStore } = await import('@/stores/projectStore');
      const proj = useProjectStore.getState().project;
      buildingType = proj.jobType || proj.buildingType || '';
      projectSF = parseFloat(proj.projectSF) || 0;
    } catch { /* non-critical */ }

    const record = {
      field,
      detected: typeof detected === 'number' ? detected : parseInt(detected) || 0,
      corrected: typeof corrected === 'number' ? corrected : parseInt(corrected) || 0,
      buildingType,
      projectSF,
      timestamp: Date.now(),
    };

    const corrections = [...get().parameterCorrections, record];
    set({ parameterCorrections: corrections });

    // Persist globally
    try {
      await storage.set('bldg-param-corrections', JSON.stringify(corrections));
    } catch (err) {
      console.warn('[scanStore] Failed to persist parameter correction:', err);
    }
  },

  loadParameterCorrections: async () => {
    try {
      const raw = await storage.get('bldg-param-corrections');
      if (raw) {
        const corrections = JSON.parse(raw.value);
        set({ parameterCorrections: corrections });
      }
    } catch (err) {
      console.warn('[scanStore] Failed to load parameter corrections:', err);
    }
  },

  // Compute correction factors from user correction history
  // Returns { "roomCounts.bathrooms": 1.15, "floorCount": 0.8, ... }
  // Multiplied against detected values to adjust for systematic detection errors
  getParameterCorrectionFactors: (buildingType) => {
    let corrections = get().parameterCorrections;
    if (corrections.length === 0) return {};

    // Filter by building type if provided (fall back to all if < 3 matches)
    if (buildingType) {
      const filtered = corrections.filter(c => c.buildingType === buildingType);
      if (filtered.length >= 3) corrections = filtered;
    }

    const currentYear = new Date().getFullYear();
    const fieldData = {}; // { field: [{ detected, corrected, weight }] }

    corrections.forEach(c => {
      if (!c.detected || !c.corrected || c.detected === c.corrected) return;

      // Recency weighting: 20% decay per year
      const age = Math.max(0, (Date.now() - c.timestamp) / (365.25 * 24 * 60 * 60 * 1000));
      const weight = Math.pow(0.80, age);

      if (!fieldData[c.field]) fieldData[c.field] = [];
      fieldData[c.field].push({
        detected: c.detected,
        corrected: c.corrected,
        weight,
      });
    });

    const factors = {};
    Object.entries(fieldData).forEach(([field, items]) => {
      // Require at least 2 data points per field
      if (items.length < 2) return;

      let weightedDetected = 0, weightedCorrected = 0, totalWeight = 0;
      items.forEach(({ detected, corrected, weight }) => {
        weightedDetected += detected * weight;
        weightedCorrected += corrected * weight;
        totalWeight += weight;
      });

      if (weightedDetected > 0 && totalWeight > 0) {
        const ratio = weightedCorrected / weightedDetected;
        // Clamp to 0.5x-2.0x range
        factors[field] = Math.max(0.5, Math.min(2.0, ratio));
      }
    });

    return factors;
  },
}));
