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
import { pushData, pushEstimate, deleteEstimate } from "./cloudSync-push";
export { pushData, pushEstimate, deleteEstimate };

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
};

// ---------- Re-exports: normalized profile/contact sync ----------
export { pushProfiles, pullProfiles, pushContacts, pullContacts, seedFromJsonb } from "./cloudSyncProfiles";

// ---------- Realtime sync helpers ----------
// These are used by useRealtimeSync to apply incoming changes from other devices.

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

    // Hydrate blobs (drawings, documents, specPdf)
    cloudData = await hydrateBlobs(cloudData);
    delete cloudData._hydrationStats;

    // Write to IDB
    const { storage } = await import("@/utils/storage");
    const { idbKey } = await import("@/utils/idbKey");
    await storage.set(idbKey(`bldg-est-${estimateId}`), JSON.stringify(cloudData));

    // If this is the active estimate, reload into stores
    const { useEstimatesStore } = await import("@/stores/estimatesStore");
    const activeId = useEstimatesStore.getState().activeEstimateId;
    if (activeId === estimateId) {
      await _reloadActiveEstimate(cloudData);
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

/** Reload the currently active estimate's stores from fresh data */
async function _reloadActiveEstimate(data) {
  try {
    const { useProjectStore } = await import("@/stores/projectStore");
    const { useItemsStore } = await import("@/stores/itemsStore");
    const { useDrawingsStore } = await import("@/stores/drawingsStore");
    const { useTakeoffsStore } = await import("@/stores/takeoffsStore");
    const { useSpecsStore } = await import("@/stores/specsStore");
    const { useGroupsStore } = await import("@/stores/groupsStore");
    const { useBidLevelingStore } = await import("@/stores/bidLevelingStore");
    const { useAlternatesStore } = await import("@/stores/alternatesStore");
    const { useCorrespondenceStore } = await import("@/stores/correspondenceStore");
    const { useModuleStore } = await import("@/stores/moduleStore");
    const { useBidPackagesStore } = await import("@/stores/bidPackagesStore");

    if (data.project) useProjectStore.getState().setProject(data.project);
    if (data.items !== undefined) useItemsStore.getState().setItems(data.items || []);
    if (data.markup !== undefined) useItemsStore.getState().setMarkup(data.markup);
    if (data.markupOrder) useItemsStore.getState().setMarkupOrder(data.markupOrder);
    if (data.drawings) useDrawingsStore.getState().setDrawings(data.drawings);
    if (data.takeoffs) useTakeoffsStore.getState().setTakeoffs(data.takeoffs);
    if (data.specs) useSpecsStore.getState().setSpecs(data.specs);
    if (data.exclusions) useSpecsStore.getState().setExclusions(data.exclusions);
    if (data.clarifications) useSpecsStore.getState().setClarifications(data.clarifications);
    if (data.groups) useGroupsStore.getState().setGroups(data.groups);
    if (data.bidLeveling) useBidLevelingStore.getState().setBidLeveling(data.bidLeveling);
    if (data.alternates) useAlternatesStore.getState().setAlternates(data.alternates);
    if (data.correspondence) useCorrespondenceStore.getState().setCorrespondence(data.correspondence);
    if (data.modules) useModuleStore.getState().setModules(data.modules);
    if (data.bidPackages) useBidPackagesStore.getState().setBidPackages(data.bidPackages);

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
      if (data.companyProfiles) useMasterDataStore.getState().setCompanyProfiles(data.companyProfiles);
      if (data.contacts) useMasterDataStore.getState().setContacts(data.contacts);
      if (data.companyInfo) useMasterDataStore.getState().setCompanyInfo(data.companyInfo);
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
        useEstimatesStore.setState(s => ({
          estimatesIndex: [...s.estimatesIndex, ...newEntries],
        }));
      }
    }
    console.log(`[cloudSync] Applied Realtime data for key "${key}"`);
  } catch (err) {
    console.warn(`[cloudSync] _applyDataToStore("${key}") failed:`, err.message);
  }
}
