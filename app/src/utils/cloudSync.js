/**
 * Cloud Sync — Supabase push/pull layer for cross-device persistence
 *
 * IndexedDB stays the primary store (offline-first). This module pushes data
 * to Supabase in the background and pulls from cloud when local is empty.
 *
 * All operations are fire-and-forget — cloud errors never block the UI.
 *
 * Module structure:
 *   cloudSync-auth.js   — Auth & scope helpers
 *   cloudSync-retry.js  — Retry & error classification
 *   cloudSync-blobs.js  — Blob handling (compress, upload, download, hydrate, strip)
 *   cloudSync-push.js   — Push operations (pushData, pushEstimate, deleteEstimate)
 *   cloudSync-pull.js   — Pull operations (pullData, pullEstimate, pullAllEstimates, etc.)
 *   cloudSync.js         — Realtime helpers + re-exports for backwards compatibility
 */

import { useUiStore } from "@/stores/uiStore";

// ---------- Re-exports: auth helpers ----------
import { getUserId, getScope, applyScope, isReady, markSynced, markError, markSyncing } from "./cloudSync-auth";
export { getUserId, getScope, applyScope, isReady, markSynced, markError, markSyncing };

// ---------- Re-exports: retry helpers ----------
import { withRetry, isPermanentError } from "./cloudSync-retry";
export { withRetry, isPermanentError };

// ---------- Re-exports: blob handling ----------
import { downloadBlob, hydrateBlobs, stripAndUploadBlobs, stripMasterBlobs, uploadBlob, dataUrlToBlob, compressImage } from "./cloudSync-blobs";
export { downloadBlob, hydrateBlobs, stripAndUploadBlobs, stripMasterBlobs, uploadBlob, dataUrlToBlob, compressImage };

// ---------- Re-exports: push operations ----------
import { pushData, pushEstimate, deleteEstimate, syncIndexColumns } from "./cloudSync-push";
export { pushData, pushEstimate, deleteEstimate, syncIndexColumns };

// ---------- Re-exports: pull operations ----------
import {
  pullData,
  pullDataWithOrgId,
  pullAllEstimatesWithOrgId,
  pullDataAnyScope,
  pullAllEstimatesAnyScope,
  pullDataWithMeta,
  pullSoloFallback,
  pullAllEstimatesWithMeta,
  pullAllEstimatesSoloFallback,
  pullEstimate,
  pullAllEstimates,
  pullEstimatesIndex,
} from "./cloudSync-pull";
export {
  pullData,
  pullDataWithOrgId,
  pullAllEstimatesWithOrgId,
  pullDataAnyScope,
  pullAllEstimatesAnyScope,
  pullDataWithMeta,
  pullSoloFallback,
  pullAllEstimatesWithMeta,
  pullAllEstimatesSoloFallback,
  pullEstimate,
  pullAllEstimates,
  pullEstimatesIndex,
};

// ---------- Re-exports: normalized profile/contact sync ----------
export { saveAtomically, pullProfiles, pullContacts } from "./cloudSyncProfiles";

// ---------- Realtime sync helpers ----------
// These are used by useRealtimeSync to apply incoming changes from other devices.

const _corruptLocalEstimateWarnings = new Set();

/**
 * Read a local estimate blob from IndexedDB with corruption guards.
 * Returns whether the record exists and whether it was parseable.
 */
export const readLocalEstimateRecord = async estimateId => {
  if (!estimateId) return { exists: false, corrupted: false, data: null };

  const { storage } = await import("@/utils/storage");
  const { idbKey } = await import("@/utils/idbKey");
  const raw = await storage.get(idbKey(`bldg-est-${estimateId}`));
  if (!raw) return { exists: false, corrupted: false, data: null };

  const value = raw.value;
  if (value == null) {
    if (!_corruptLocalEstimateWarnings.has(estimateId)) {
      _corruptLocalEstimateWarnings.add(estimateId);
      console.warn(`[cloudSync] Local estimate "${estimateId}" is missing its IndexedDB payload`);
    }
    return { exists: true, corrupted: true, data: null };
  }

  if (typeof value !== "string") {
    if (typeof value === "object") {
      _corruptLocalEstimateWarnings.delete(estimateId);
      return { exists: true, corrupted: false, data: value };
    }
    if (!_corruptLocalEstimateWarnings.has(estimateId)) {
      _corruptLocalEstimateWarnings.add(estimateId);
      console.warn(`[cloudSync] Local estimate "${estimateId}" has an unsupported IndexedDB payload type`);
    }
    return { exists: true, corrupted: true, data: null };
  }

  try {
    const data = JSON.parse(value);
    _corruptLocalEstimateWarnings.delete(estimateId);
    return { exists: true, corrupted: false, data };
  } catch (err) {
    if (!_corruptLocalEstimateWarnings.has(estimateId)) {
      _corruptLocalEstimateWarnings.add(estimateId);
      console.warn(`[cloudSync] Local estimate "${estimateId}" is corrupted in IndexedDB:`, err.message || err);
    }
    return { exists: true, corrupted: true, data: null };
  }
};

/**
 * Pull a single estimate from cloud, hydrate blobs, write to IDB, and
 * optionally reload into Zustand stores if it's the active estimate.
 * Returns the hydrated data or null on failure.
 */
export const pullAndApplyEstimate = async estimateId => {
  if (!isReady()) return null;
  try {
    let cloudData = await pullEstimate(estimateId);
    if (!cloudData) return null;

    // ── Timestamp guard: never let stale cloud data overwrite newer local data ──
    // This prevents the "save bounce" race: user saves → cloud writes → Realtime
    // fires before cloud write confirms → pullEstimate returns old version → overwrites.
    const { storage } = await import("@/utils/storage");
    const { idbKey } = await import("@/utils/idbKey");
    const localRecord = await readLocalEstimateRecord(estimateId);
    const localTime = localRecord.data?._savedAt || null;
    const cloudTime = cloudData._savedAt;
    if (localTime && cloudTime && new Date(cloudTime) <= new Date(localTime)) {
      console.log(`[cloudSync] pullAndApplyEstimate: local is current (${localTime} >= ${cloudTime}), skipping reload`);
      return cloudData;
    }

    // Hydrate blobs (drawings, documents, specPdf)
    cloudData = await hydrateBlobs(cloudData);
    delete cloudData._hydrationStats;

    // Write to IDB — only reaches here when cloud is confirmed newer
    await storage.set(idbKey(`bldg-est-${estimateId}`), JSON.stringify(cloudData));

    // If this is the active estimate, reload into stores
    const { useEstimatesStore } = await import("@/stores/estimatesStore");
    const activeId = useEstimatesStore.getState().activeEstimateId;
    if (activeId === estimateId) {
      await _reloadActiveEstimate(cloudData, estimateId);
    }

    return cloudData;
  } catch (err) {
    console.warn(`[cloudSync] pullAndApplyEstimate("${estimateId}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull a data key from cloud and apply to the correct Zustand store + IDB.
 * Handles: master, settings, assemblies, index, calendar, user-elements, etc.
 */
export const pullAndApplyData = async key => {
  if (!isReady()) return null;
  try {
    const result = await pullData(key);
    if (!result) return null;

    const { storage } = await import("@/utils/storage");
    const { idbKey } = await import("@/utils/idbKey");

    // Write to IDB
    await storage.set(idbKey(`bldg-${key}`), JSON.stringify(result));

    // Apply to the appropriate Zustand store
    await _applyDataToStore(key, result);

    return result;
  } catch (err) {
    console.warn(`[cloudSync] pullAndApplyData("${key}") failed:`, err.message || err);
    return null;
  }
};

// Track last time user edited items in this session (module-level, reset on load)
let _lastItemEditMs = 0;
export const markItemEdited = () => { _lastItemEditMs = Date.now(); };
const EDIT_SAFE_WINDOW_MS = 10_000; // 10s — safely covers the 1.5s auto-save debounce

/** Reload the currently active estimate's stores from fresh data */
async function _reloadActiveEstimate(data, estimateId) {
  try {
    const { useProjectStore } = await import("@/stores/projectStore");
    const { useItemsStore } = await import("@/stores/itemsStore");
    const { useDrawingPipelineStore } = await import("@/stores/drawingPipelineStore");
    const { useDocumentManagementStore } = await import("@/stores/documentManagementStore");
    const { useGroupsStore } = await import("@/stores/groupsStore");
    const { useBidManagementStore } = await import("@/stores/bidManagementStore");
    const { useAlternatesStore } = await import("@/stores/alternatesStore");
    const { useCollaborationStore: useCorrespondenceStore } = await import("@/stores/collaborationStore");
    const { useModuleStore } = await import("@/stores/moduleStore");

    // ── Edit recency guard ───────────────────────────────────────────────
    // If the user touched items within the last 10s, defer this reload until
    // the auto-save debounce (1.5s) has had time to flush. This prevents a
    // Realtime bounce from wiping unsaved pricing changes.
    // On retry we re-pull fresh data rather than applying the stale closure.
    const msSinceEdit = Date.now() - _lastItemEditMs;
    if (_lastItemEditMs > 0 && msSinceEdit < EDIT_SAFE_WINDOW_MS) {
      const delay = EDIT_SAFE_WINDOW_MS - msSinceEdit + 500;
      console.log(`[cloudSync] Recent edit detected (${Math.round(msSinceEdit)}ms ago) — deferring reload by ${delay}ms`);
      if (estimateId) {
        // Re-pull fresh data after delay — don't apply the now-stale closure data
        setTimeout(() => pullAndApplyEstimate(estimateId), delay);
      }
      return;
    }

    if (data.project) useProjectStore.getState().setProject(data.project);
    if (data.items !== undefined) useItemsStore.getState().setItems(data.items || []);
    if (data.markup !== undefined) useItemsStore.getState().setMarkup(data.markup);
    if (data.markupOrder) useItemsStore.getState().setMarkupOrder(data.markupOrder);
    if (data.drawings) useDrawingPipelineStore.getState().setDrawings(data.drawings);
    if (data.takeoffs) useDrawingPipelineStore.getState().setTakeoffs(data.takeoffs);
    if (data.specs) useDocumentManagementStore.getState().setSpecs(data.specs);
    if (data.exclusions) useDocumentManagementStore.getState().setExclusions(data.exclusions);
    if (data.clarifications) useDocumentManagementStore.getState().setClarifications(data.clarifications);
    if (data.groups) useGroupsStore.getState().setGroups(data.groups);
    if (data.bidLeveling) useBidManagementStore.getState().setBidLeveling(data.bidLeveling);
    if (data.alternates) useAlternatesStore.getState().setAlternates(data.alternates);
    if (data.correspondence) useCorrespondenceStore.getState().setCorrespondence(data.correspondence);
    if (data.modules) useModuleStore.getState().setModules(data.modules);
    if (data.bidPackages) useBidManagementStore.getState().setBidPackages(data.bidPackages);

    console.log("[cloudSync] Active estimate reloaded from Realtime update");
    useUiStore.getState().showToast("Estimate updated from another device", "info");
  } catch (err) {
    console.warn("[cloudSync] _reloadActiveEstimate failed:", err.message);
  }
}

/** Apply pulled data to the correct Zustand store by key name */
async function _applyDataToStore(key, data) {
  try {
    if (key === "master") {
      const { useMasterDataStore } = await import("@/stores/masterDataStore");
      // Safe merge: never let empty Realtime data overwrite richer local state
      const current = useMasterDataStore.getState().masterData;
      const safe = { ...current };
      for (const [k, v] of Object.entries(data)) {
        const cur = current[k];
        if (Array.isArray(cur) && cur.length > 0 && Array.isArray(v) && v.length === 0) continue;
        if (k === "companyInfo" && cur?.name && (!v || !v.name)) continue;
        safe[k] = v;
      }
      useMasterDataStore.getState().setMasterData(safe);
    } else if (key === "settings") {
      useUiStore.getState().setAppSettings(data);
    } else if (key === "assemblies") {
      const { useDatabaseStore } = await import("@/stores/databaseStore");
      useDatabaseStore.getState().setAssemblies(data);
    } else if (key === "calendar") {
      const { useCalendarStore } = await import("@/stores/calendarStore");
      useCalendarStore.getState().setTasks(data);
    } else if (key === "user-elements") {
      const { useDatabaseStore } = await import("@/stores/databaseStore");
      useDatabaseStore.getState().loadUserElements(data);
    } else if (key === "index") {
      // Merge into estimates index additively (never replace)
      const { useEstimatesStore } = await import("@/stores/estimatesStore");
      const currentIndex = useEstimatesStore.getState().estimatesIndex;
      const currentIds = new Set(currentIndex.map(e => e.id));
      const newEntries = (Array.isArray(data) ? data : []).filter(e => !currentIds.has(e.id));
      if (newEntries.length > 0) {
        useEstimatesStore.getState().setEstimatesIndex(prev => [...prev, ...newEntries]);
      }
    }
    console.log(`[cloudSync] Applied Realtime data for key "${key}"`);
  } catch (err) {
    console.warn(`[cloudSync] _applyDataToStore("${key}") failed:`, err.message);
  }
}
