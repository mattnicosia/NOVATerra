import { create } from 'zustand';
import { storage } from '@/utils/storage';

export const useScanStore = create((set, get) => ({
  // Scan results for the current estimate
  scanResults: null,          // { schedules: [], rom: null, timestamp }
  scanProgress: { phase: null, current: 0, total: 0, message: "" },
  scanError: null,

  // Learning records — shared across estimates
  learningRecords: [],        // [{ estimateId, romPrediction, actuals, calibration, timestamp }]

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
    await storage.set('bldg-scan-learning', JSON.stringify(records));
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
  // Returns { "03": 1.12, "05": 0.94, ... } — ratio of actuals/predicted per division
  getCalibrationFactors: () => {
    const records = get().learningRecords;
    if (records.length === 0) return {};

    const divTotals = {};  // { div: { predicted: 0, actual: 0, count: 0 } }

    records.forEach(rec => {
      if (!rec.romPrediction?.divisions || !rec.actuals?.divisions) return;
      Object.keys(rec.romPrediction.divisions).forEach(div => {
        const predicted = rec.romPrediction.divisions[div]?.mid || 0;
        const actual = rec.actuals.divisions[div] || 0;
        if (predicted > 0 && actual > 0) {
          if (!divTotals[div]) divTotals[div] = { predicted: 0, actual: 0, count: 0 };
          divTotals[div].predicted += predicted;
          divTotals[div].actual += actual;
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
}));
