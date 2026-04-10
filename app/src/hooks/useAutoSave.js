import { useEffect, useRef } from "react";
import {
  saveEstimate,
  saveMasterData,
  saveSettings,
  saveAssemblies,
  saveCalendar,
  saveTasks,
  saveBidPackagePresets,
  saveAutoResponseConfig,
  saveAutoResponseDrafts,
  saveSubdivisionConfig,
  saveUserLibrary,
} from "./usePersistence";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";

const CRDT_ENABLED = import.meta.env.VITE_ENABLE_CRDT === "true";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGroupsStore } from "@/stores/groupsStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { useUiStore } from "@/stores/uiStore";

// ── Selector-based subscribe helper ─────────────────────────
// Zustand v4 subscribe(listener) fires on ANY state change.
// This helper only fires the callback when the selected slice
// changes (by reference), avoiding spurious saves from cursor
// movement, zoom, pan, prediction state, etc.
function subSlice(store, selector, callback) {
  let prev = selector(store.getState());
  return store.subscribe((state) => {
    const next = selector(state);
    if (next !== prev) {
      prev = next;
      callback();
    }
  });
}

export function useAutoSave() {
  const masterTimer = useRef(null);
  const settingsTimer = useRef(null);
  const assemblyTimer = useRef(null);
  const calTimer = useRef(null);
  const taskTimer = useRef(null);
  const bpPresetsTimer = useRef(null);
  const arConfigTimer = useRef(null);
  const arDraftsTimer = useRef(null);
  const subConfigTimer = useRef(null);
  const userElTimer = useRef(null);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);

  // ══════════════════════════════════════════════════════════════
  // Estimate auto-save: Imperative Zustand subscriptions
  //
  // Previously used 15+ React hook subscriptions (useEffect deps),
  // causing App.jsx re-renders on every store change. Now uses
  // Zustand's subscribe() API — fires callbacks directly without
  // React re-renders. saveEstimate() reads fresh state via getState().
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!persistenceLoaded) return;

    let estTimer = null;
    let drawTimer = null;

    const scheduleEstSave = () => {
      const { activeEstimateId, draftId, clearDraft } = useEstimatesStore.getState();
      if (!activeEstimateId) return;
      // Draft guard: skip save on blank new estimates (no project info filled yet).
      // But if items exist the user has done real work — clear draft and save.
      if (draftId && activeEstimateId === draftId) {
        if (useItemsStore.getState().items.length === 0) return;
        clearDraft(); // estimate has content — promote from draft to saved
      }
      // In CRDT mode, all org users can save concurrently (no lock guard).
      // In legacy mode, only the lock holder can save.
      if (!CRDT_ENABLED && useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;

      if (estTimer) clearTimeout(estTimer);
      estTimer = setTimeout(() => {
        const currentId = useEstimatesStore.getState().activeEstimateId;
        if (!currentId) return;
        if (!CRDT_ENABLED && useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;
        saveEstimate().catch(err => {
          console.error("[autoSave] Estimate save failed:", err);
          useUiStore.getState().showToast("Auto-save failed — retrying...", "error");
        });
      }, 1500); // AUTOSAVE_DEBOUNCE_MS
    };

    const scheduleDrawSave = () => {
      const { activeEstimateId, draftId } = useEstimatesStore.getState();
      if (!activeEstimateId) return;
      if (draftId && activeEstimateId === draftId) return; // drawings don't promote draft

      if (drawTimer) clearTimeout(drawTimer);
      drawTimer = setTimeout(() => {
        const currentId = useEstimatesStore.getState().activeEstimateId;
        if (!currentId) return;
        saveEstimate().catch(err => {
          console.error("[autoSave] Drawing save failed:", err);
        });
      }, 3000);
    };

    // Subscribe to DATA slices only — ignores UI-only state (cursor, zoom,
    // pan, predictions, loading flags, selections, etc.) to prevent
    // spurious debounce resets on every mouse move or tool switch.
    const unsubs = [
      subSlice(useProjectStore, s => s.project, scheduleEstSave),
      subSlice(useItemsStore, s => s.items, scheduleEstSave),
      subSlice(useDrawingPipelineStore, s => s.takeoffs, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.subBidSubs, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.linkedSubs, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.overrides, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.selections, scheduleEstSave),
      subSlice(useAlternatesStore, s => s.alternates, scheduleEstSave),
      subSlice(useDocumentManagementStore, s => s.specs, scheduleEstSave),
      subSlice(useDocumentManagementStore, s => s.exclusions, scheduleEstSave),
      subSlice(useDocumentManagementStore, s => s.clarifications, scheduleEstSave),
      subSlice(useCollaborationStore, s => s.correspondences, scheduleEstSave),
      subSlice(useModuleStore, s => s.moduleInstances, scheduleEstSave),
      subSlice(useGroupsStore, s => s.groups, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.bidPackages, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.invitations, scheduleEstSave),
      subSlice(useBidManagementStore, s => s.proposals, scheduleEstSave),
      subSlice(useDrawingPipelineStore, s => s.elements, scheduleEstSave),
      subSlice(useDrawingPipelineStore, s => s.levels, scheduleEstSave),
      subSlice(useDrawingPipelineStore, s => s.drawings, scheduleDrawSave),
      // Flush pending save for outgoing estimate, then cancel timers
      useEstimatesStore.subscribe((state, prev) => {
        if (state.activeEstimateId !== prev.activeEstimateId) {
          if (estTimer) clearTimeout(estTimer);
          if (drawTimer) clearTimeout(drawTimer);
          estTimer = null;
          drawTimer = null;
          // If there was a pending save, flush the outgoing estimate immediately.
          // At this point stores still contain the outgoing estimate's data
          // (loading the new estimate is async), so we can safely save it.
          if (prev.activeEstimateId) {
            saveEstimate(prev.activeEstimateId, { allowInactiveCloudPush: true }).catch(err => {
              console.error("[autoSave] Flush on estimate switch failed:", err);
            });
          }
        }
      }),
    ];

    return () => {
      unsubs.forEach(u => u());
      if (estTimer) clearTimeout(estTimer);
      if (drawTimer) clearTimeout(drawTimer);
    };
  }, [persistenceLoaded]);

  // ── Master data (debounced) ───────────────────────────────────
  // NOT gated on persistenceLoaded — saveMasterData() has its own auth/scope
  // checks. Gating here caused a race: edits made before orgReady (and thus
  // before persistenceLoaded) were silently dropped, losing company profiles.
  const masterData = useMasterDataStore(s => s.masterData);
  const masterDataInitRef = useRef(true);
  useEffect(() => {
    // Skip the very first render (initial store hydration, not a user edit)
    if (masterDataInitRef.current) {
      masterDataInitRef.current = false;
      return;
    }
    if (masterTimer.current) clearTimeout(masterTimer.current);
    masterTimer.current = setTimeout(() => {
      saveMasterData().catch(err => {
        console.error("[autoSave] Master data save failed:", err);
      });
    }, 2000);
    return () => {
      if (masterTimer.current) clearTimeout(masterTimer.current);
    };
  }, [masterData]);

  // ── Settings (debounced) ───────────────────────────────────
  const appSettings = useUiStore(s => s.appSettings);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      saveSettings().catch(err => {
        console.error("[autoSave] Settings save failed:", err);
      });
    }, 2000);
    return () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
    };
  }, [persistenceLoaded, appSettings]);

  // ── Assemblies (debounced) ─────────────────────────────────
  const assemblies = useDatabaseStore(s => s.assemblies);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (assemblyTimer.current) clearTimeout(assemblyTimer.current);
    assemblyTimer.current = setTimeout(() => {
      saveAssemblies().catch(err => {
        console.error("[autoSave] Assemblies save failed:", err);
      });
    }, 2000);
    return () => {
      if (assemblyTimer.current) clearTimeout(assemblyTimer.current);
    };
  }, [persistenceLoaded, assemblies]);

  // ── User cost library (debounced) ───────────────────────
  const dbElements = useDatabaseStore(s => s.elements);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (userElTimer.current) clearTimeout(userElTimer.current);
    userElTimer.current = setTimeout(() => {
      saveUserLibrary().catch(err => {
        console.error("[autoSave] User cost library save failed:", err);
      });
    }, 2000);
    return () => {
      if (userElTimer.current) clearTimeout(userElTimer.current);
    };
  }, [persistenceLoaded, dbElements]);

  // ── Calendar tasks (debounced) ─────────────────────────
  const calendarTasks = useCalendarStore(s => s.tasks);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (calTimer.current) clearTimeout(calTimer.current);
    calTimer.current = setTimeout(() => {
      saveCalendar().catch(err => {
        console.error("[autoSave] Calendar save failed:", err);
      });
    }, 2000);
    return () => {
      if (calTimer.current) clearTimeout(calTimer.current);
    };
  }, [persistenceLoaded, calendarTasks]);

  // ── Tasks (debounced) ─────────────────────────────────
  const storeTasks = useTaskStore(s => s.tasks);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (taskTimer.current) clearTimeout(taskTimer.current);
    taskTimer.current = setTimeout(() => {
      saveTasks().catch(err => {
        console.error("[autoSave] Tasks save failed:", err);
      });
    }, 2000);
    return () => {
      if (taskTimer.current) clearTimeout(taskTimer.current);
    };
  }, [persistenceLoaded, storeTasks]);

  // ── Bid package presets (debounced) ────────────────────
  const bpPresets = useBidManagementStore(s => s.bidPackagePresets);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (bpPresetsTimer.current) clearTimeout(bpPresetsTimer.current);
    bpPresetsTimer.current = setTimeout(() => {
      saveBidPackagePresets().catch(err => {
        console.error("[autoSave] Bid package presets save failed:", err);
      });
    }, 2000);
    return () => {
      if (bpPresetsTimer.current) clearTimeout(bpPresetsTimer.current);
    };
  }, [persistenceLoaded, bpPresets]);

  // ── Auto-response config (debounced) ──────────────────
  const arTriggerConfig = useCollaborationStore(s => s.triggerConfig);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (arConfigTimer.current) clearTimeout(arConfigTimer.current);
    arConfigTimer.current = setTimeout(() => {
      saveAutoResponseConfig().catch(err => {
        console.error("[autoSave] Auto-response config save failed:", err);
      });
    }, 2000);
    return () => {
      if (arConfigTimer.current) clearTimeout(arConfigTimer.current);
    };
  }, [persistenceLoaded, arTriggerConfig]);

  // ── Auto-response drafts (debounced) ──────────────────
  const arDrafts = useCollaborationStore(s => s.drafts);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (arDraftsTimer.current) clearTimeout(arDraftsTimer.current);
    arDraftsTimer.current = setTimeout(() => {
      saveAutoResponseDrafts().catch(err => {
        console.error("[autoSave] Auto-response drafts save failed:", err);
      });
    }, 1500);
    return () => {
      if (arDraftsTimer.current) clearTimeout(arDraftsTimer.current);
    };
  }, [persistenceLoaded, arDrafts]);

  // ── Subdivision config (engine config + calibration + overrides) ──
  const subEngineConfig = useSubdivisionStore(s => s.engineConfig);
  const subCalibration = useSubdivisionStore(s => s.calibrationFactors);
  const subUserOverrides = useSubdivisionStore(s => s.userOverrides);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (subConfigTimer.current) clearTimeout(subConfigTimer.current);
    subConfigTimer.current = setTimeout(() => {
      saveSubdivisionConfig().catch(err => {
        console.error("[autoSave] Subdivision config save failed:", err);
      });
    }, 2000);
    return () => {
      if (subConfigTimer.current) clearTimeout(subConfigTimer.current);
    };
  }, [persistenceLoaded, subEngineConfig, subCalibration, subUserOverrides]);
}
