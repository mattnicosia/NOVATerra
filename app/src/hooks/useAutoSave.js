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
  const estTimer = useRef(null);
  const drawTimer = useRef(null);
  const masterTimer = useRef(null);
  const settingsTimer = useRef(null);
  const assemblyTimer = useRef(null);
  const calTimer = useRef(null);
  const bpPresetsTimer = useRef(null);
  const arConfigTimer = useRef(null);
  const arDraftsTimer = useRef(null);
  const subConfigTimer = useRef(null);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);

  // ── Estimate core data (fast-changing) ─────────────────────
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const draftId = useEstimatesStore(s => s.draftId);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const markup = useItemsStore(s => s.markup);
  const markupOrder = useItemsStore(s => s.markupOrder);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const bidCells = useBidLevelingStore(s => s.bidCells);
  const alternates = useAlternatesStore(s => s.alternates);
  const exclusions = useSpecsStore(s => s.exclusions);
  const moduleInstances = useModuleStore(s => s.moduleInstances);
  const groups = useGroupsStore(s => s.groups);
  const projectAssemblies = useItemsStore(s => s.projectAssemblies);
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const bidInvitations = useBidPackagesStore(s => s.invitations);

  useEffect(() => {
    if (!persistenceLoaded || !activeId) return;
    // Skip auto-save for draft estimates (not yet persisted — user must click Save first)
    if (draftId && activeId === draftId) return;
    // Skip auto-save in org mode if not the lock holder
    if (useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;
    if (estTimer.current) clearTimeout(estTimer.current);
    estTimer.current = setTimeout(() => {
      // Guard: verify estimate wasn't deleted during debounce window
      const currentId = useEstimatesStore.getState().activeEstimateId;
      if (!currentId) return;
      // Re-check lock status at save time (may have changed during debounce)
      if (useOrgStore.getState().org?.id && !useCollaborationStore.getState().isLockHolder) return;
      saveEstimate().catch(err => {
        console.error("[autoSave] Estimate save failed:", err);
        useUiStore.getState().showToast("Auto-save failed — retrying...", "error");
      });
    }, 1500); // 1.5s debounce — gives rapid edits time to settle
    return () => {
      if (estTimer.current) clearTimeout(estTimer.current);
    };
  }, [
    persistenceLoaded,
    activeId,
    draftId,
    project,
    items,
    markup,
    markupOrder,
    takeoffs,
    bidCells,
    alternates,
    exclusions,
    moduleInstances,
    groups,
    projectAssemblies,
    bidPackages,
    bidInvitations,
  ]);
  // NOTE: `drawings` and `elements` removed — drawings save separately below,
  // elements are database-level (not per-estimate) and don't need estimate saves

  // ── Drawings (large blobs — save separately, longer debounce) ──
  const drawings = useDrawingsStore(s => s.drawings);
  useEffect(() => {
    if (!persistenceLoaded || !activeId) return;
    if (draftId && activeId === draftId) return;
    if (drawTimer.current) clearTimeout(drawTimer.current);
    drawTimer.current = setTimeout(() => {
      const currentId = useEstimatesStore.getState().activeEstimateId;
      if (!currentId) return;
      saveEstimate().catch(err => {
        console.error("[autoSave] Drawing save failed:", err);
      });
    }, 3000); // 3s debounce — drawings change infrequently but are large
    return () => {
      if (drawTimer.current) clearTimeout(drawTimer.current);
    };
  }, [persistenceLoaded, activeId, draftId, drawings]);

  // ── Master data (debounced — was previously instant) ───────
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
