import { useEffect, useRef } from "react";
import {
  saveEstimate,
  saveMasterData,
  saveSettings,
  saveAssemblies,
  saveCalendar,
  saveBidPackagePresets,
  saveAutoResponseConfig,
  saveAutoResponseDrafts,
  saveSubdivisionConfig,
} from "./usePersistence";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useCorrespondenceStore } from "@/stores/correspondenceStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useGroupsStore } from "@/stores/groupsStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useAutoResponseStore } from "@/stores/autoResponseStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { useUiStore } from "@/stores/uiStore";

export function useAutoSave() {
  const masterTimer = useRef(null);
  const settingsTimer = useRef(null);
  const assemblyTimer = useRef(null);
  const calTimer = useRef(null);
  const bpPresetsTimer = useRef(null);
  const arConfigTimer = useRef(null);
  const arDraftsTimer = useRef(null);
  const subConfigTimer = useRef(null);
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
      const { activeEstimateId, draftId } = useEstimatesStore.getState();
      if (!activeEstimateId) return;
      if (draftId && activeEstimateId === draftId) return;
      if (useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;

      if (estTimer) clearTimeout(estTimer);
      estTimer = setTimeout(() => {
        const currentId = useEstimatesStore.getState().activeEstimateId;
        if (!currentId) return;
        if (useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;
        saveEstimate().catch(err => {
          console.error("[autoSave] Estimate save failed:", err);
          useUiStore.getState().showToast("Auto-save failed — retrying...", "error");
        });
      }, 1500);
    };

    const scheduleDrawSave = () => {
      const { activeEstimateId, draftId } = useEstimatesStore.getState();
      if (!activeEstimateId) return;
      if (draftId && activeEstimateId === draftId) return;

      if (drawTimer) clearTimeout(drawTimer);
      drawTimer = setTimeout(() => {
        const currentId = useEstimatesStore.getState().activeEstimateId;
        if (!currentId) return;
        saveEstimate().catch(err => {
          console.error("[autoSave] Drawing save failed:", err);
        });
      }, 3000);
    };

    // Subscribe to all estimate-related stores (no React re-renders)
    const unsubs = [
      useProjectStore.subscribe(scheduleEstSave),
      useItemsStore.subscribe(scheduleEstSave),
      useTakeoffsStore.subscribe(scheduleEstSave),
      useBidLevelingStore.subscribe(scheduleEstSave),
      useAlternatesStore.subscribe(scheduleEstSave),
      useSpecsStore.subscribe(scheduleEstSave),
      useCorrespondenceStore.subscribe(scheduleEstSave),
      useModuleStore.subscribe(scheduleEstSave),
      useGroupsStore.subscribe(scheduleEstSave),
      useBidPackagesStore.subscribe(scheduleEstSave),
      useDrawingsStore.subscribe(scheduleDrawSave),
      // Cancel pending saves when active estimate changes
      useEstimatesStore.subscribe((state, prev) => {
        if (state.activeEstimateId !== prev.activeEstimateId) {
          if (estTimer) clearTimeout(estTimer);
          if (drawTimer) clearTimeout(drawTimer);
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
  const masterData = useMasterDataStore(s => s.masterData);
  useEffect(() => {
    if (!persistenceLoaded) return;
    if (masterTimer.current) clearTimeout(masterTimer.current);
    masterTimer.current = setTimeout(() => {
      saveMasterData().catch(err => {
        console.error("[autoSave] Master data save failed:", err);
      });
    }, 2000);
    return () => {
      if (masterTimer.current) clearTimeout(masterTimer.current);
    };
  }, [persistenceLoaded, masterData]);

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

  // ── Bid package presets (debounced) ────────────────────
  const bpPresets = useBidPackagesStore(s => s.bidPackagePresets);
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
  const arTriggerConfig = useAutoResponseStore(s => s.triggerConfig);
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
  const arDrafts = useAutoResponseStore(s => s.drafts);
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
