// ─── BLDG Talent — Assessment Store ─────────────────────────────────────
// Manages assessment session state, timer, responses, and scores
// Used by CognitiveModule, BehavioralModule, AssessmentShell

import { create } from "zustand";
import { BT_MODULES, BT_P0_MODULE_KEYS } from "@/constants/btBrand";
import { scoreCognitive, scoreBehavioral, computeOverall } from "@/utils/btScoring";
import { BT_COGNITIVE_QUESTIONS } from "@/constants/btCognitive";
import { BT_BEHAVIORAL_ITEMS } from "@/constants/btBehavioral";

export const useBTAssessmentStore = create((set, get) => ({
  // ── Session ──
  status: "not_started", // not_started | in_progress | completed
  startedAt: null,
  completedAt: null,

  // ── Module navigation ──
  activeModule: null, // 'cognitive' | 'behavioral' | null
  moduleStartedAt: null,
  timerRemaining: null, // seconds remaining for current module
  currentQuestionIndex: 0,

  // Which modules are done
  completedModules: [], // ['cognitive', 'behavioral']

  // ── Responses ──
  cognitiveResponses: {}, // { cog_01: '44.44', cog_02: '7560', ... }
  behavioralResponses: {}, // { beh_01: 4, beh_02: 3, ... }

  // ── Scores (computed after submission) ──
  moduleScores: {}, // { cognitive: { raw, max, pct, grade, perQuestion }, behavioral: { ... } }
  overallScore: null,
  overallGrade: null,
  certLevel: null,
  behavioralProfile: null, // { dimensionScores: { drive: 72, influence: 85, ... } }

  // ── Actions ──

  startAssessment: () => {
    set({
      status: "in_progress",
      startedAt: Date.now(),
      completedModules: [],
      moduleScores: {},
      cognitiveResponses: {},
      behavioralResponses: {},
      overallScore: null,
      overallGrade: null,
      certLevel: null,
      behavioralProfile: null,
    });
  },

  startModule: moduleKey => {
    const mod = BT_MODULES[moduleKey];
    if (!mod) return;
    set({
      activeModule: moduleKey,
      moduleStartedAt: Date.now(),
      timerRemaining: mod.timeLimit,
      currentQuestionIndex: 0,
    });
  },

  setCurrentQuestionIndex: idx => set({ currentQuestionIndex: idx }),

  submitResponse: (questionId, value) => {
    const { activeModule } = get();
    if (activeModule === "cognitive") {
      set(s => ({ cognitiveResponses: { ...s.cognitiveResponses, [questionId]: value } }));
    } else if (activeModule === "behavioral") {
      set(s => ({ behavioralResponses: { ...s.behavioralResponses, [questionId]: value } }));
    }
  },

  tickTimer: () => {
    const { timerRemaining } = get();
    if (timerRemaining === null || timerRemaining <= 0) return;
    set({ timerRemaining: timerRemaining - 1 });
    if (timerRemaining - 1 <= 0) {
      // Auto-submit on time expiry
      get().completeModule(get().activeModule);
    }
  },

  completeModule: moduleKey => {
    const state = get();
    let score = null;

    if (moduleKey === "cognitive") {
      score = scoreCognitive(state.cognitiveResponses, BT_COGNITIVE_QUESTIONS);
    } else if (moduleKey === "behavioral") {
      const result = scoreBehavioral(state.behavioralResponses, BT_BEHAVIORAL_ITEMS);
      score = result;
      set({ behavioralProfile: { dimensionScores: result.dimensionScores } });
    }

    const newModuleScores = { ...state.moduleScores, [moduleKey]: score };
    const newCompleted = [...state.completedModules, moduleKey];

    set({
      moduleScores: newModuleScores,
      completedModules: newCompleted,
      activeModule: null,
      timerRemaining: null,
      moduleStartedAt: null,
      currentQuestionIndex: 0,
    });

    // Check if all P0 modules are done
    const allDone = BT_P0_MODULE_KEYS.every(k => newCompleted.includes(k));
    if (allDone) {
      const overall = computeOverall(newModuleScores);
      set({
        status: "completed",
        completedAt: Date.now(),
        overallScore: overall.score,
        overallGrade: overall.grade,
        certLevel: overall.cert,
      });
    }
  },

  // Navigate to next available module
  getNextModule: () => {
    const { completedModules } = get();
    return BT_P0_MODULE_KEYS.find(k => !completedModules.includes(k)) || null;
  },

  // Reset everything
  reset: () =>
    set({
      status: "not_started",
      startedAt: null,
      completedAt: null,
      activeModule: null,
      moduleStartedAt: null,
      timerRemaining: null,
      currentQuestionIndex: 0,
      completedModules: [],
      cognitiveResponses: {},
      behavioralResponses: {},
      moduleScores: {},
      overallScore: null,
      overallGrade: null,
      certLevel: null,
      behavioralProfile: null,
    }),
}));
