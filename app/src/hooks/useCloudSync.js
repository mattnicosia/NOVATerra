import { useEffect, useRef } from "react";
import { storage } from "@/utils/storage";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { resetAllStores } from "@/hooks/usePersistence";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";
import { useOrgStore } from "@/stores/orgStore";

/**
 * Bidirectional cloud sync on every app startup.
 *
 * Runs once per session after:
 *   1. persistenceLoaded === true (local data is in stores)
 *   2. user is authenticated (cloud needs user_id)
 *
 * Strategy:
 *   - Pull cloud data with timestamps
 *   - For each data type, merge cloud ↔ local:
 *     • If local has data but cloud doesn't → push local to cloud
 *     • If cloud has data but local doesn't → pull cloud to local
 *     • If both exist → use the one with more content (for master: more company profiles)
 *       then push the merged result to cloud so both sides converge
 *   - For estimates: push any local estimates missing from cloud,
 *     pull any cloud estimates missing from local
 */
// Exported for manual retry from UI
export async function retryCloudSync() {
  const user = useAuthStore.getState().user;
  if (!user) return;
  await runCloudSync();
}

async function runCloudSync() {
  console.log("[cloudSync] Starting bidirectional sync...");
  useUiStore.getState().setCloudSyncStatus("syncing");

  // User-switch detection now runs in usePersistenceLoad BEFORE data loads.
  // This is a safety-net in case persistence didn't catch it.
  const currentUserId = useAuthStore.getState().user?.id;
  if (currentUserId) {
    const lastUserRaw = await storage.get("bldg-last-user");
    const lastUserId = lastUserRaw?.value || null;
    if (lastUserId && lastUserId !== currentUserId) {
      console.log("[cloudSync] User switch detected (safety net) — clearing local data");
      resetAllStores();
      await storage.clearAll();
      await storage.set("bldg-last-user", currentUserId);
    }
  }

  let failures = 0;
  const trySync = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      failures++;
      console.warn(`[cloudSync] ${label} failed:`, err.message || err);
    }
  };

  await trySync("Master data", syncMasterData);
  await trySync("Estimates", syncEstimates);
  await trySync("Settings", syncSettings);
  await trySync("Assemblies", syncAssemblies);
  await trySync("Calendar", syncCalendar);

  // CRITICAL: If a user-switch wipe occurred above, resetAllStores() set
  // persistenceLoaded = false. The sync just pulled fresh data from cloud,
  // so we must restore persistenceLoaded so auto-save and EstimateLoader work.
  if (!useUiStore.getState().persistenceLoaded) {
    useUiStore.getState().setPersistenceLoaded(true);
    console.log("[cloudSync] Restored persistenceLoaded after user-switch recovery");
  }

  if (failures === 0) {
    useUiStore.getState().setCloudSyncStatus("synced");
    useUiStore
      .getState()
      .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    console.log("[cloudSync] Bidirectional sync complete.");
  } else if (failures < 5) {
    // Partial success — mark synced with warning logged
    useUiStore.getState().setCloudSyncStatus("synced");
    useUiStore
      .getState()
      .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    console.warn(`[cloudSync] Completed with ${failures} partial failure(s).`);
  } else {
    // All 4 sub-syncs failed — mark error
    console.error("[cloudSync] All sync operations failed.");
    useUiStore.getState().setCloudSyncStatus("error");
  }

  // One-time background migration: re-push estimates with blobs so they
  // get uploaded to Supabase Storage. Estimates created before the blob
  // sync feature were pushed with blobs stripped and never uploaded.
  runBlobMigration().catch(err => console.warn("[cloudSync] Blob migration failed:", err));
}

export function useCloudSync() {
  const ran = useRef(false);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const user = useAuthStore(s => s.user);
  const orgReady = useOrgStore(s => s.orgReady);

  useEffect(() => {
    if (ran.current) return;
    if (!persistenceLoaded || !user || !orgReady) return; // Wait for org fetch
    ran.current = true;

    // Startup health check: verify Supabase connection before sync
    (async () => {
      try {
        const { supabase } = await import("@/utils/supabase");
        if (!supabase) {
          console.error("[cloudSync] Supabase client is null — env vars missing or malformed");
          useUiStore.getState().setCloudSyncStatus("error");
          useUiStore.getState().setCloudSyncError("Supabase not configured");
          return;
        }
        // Quick health check — verify auth session is valid
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
          console.warn("[cloudSync] Health check: no valid session —", error?.message || "session expired");
          useUiStore.getState().setCloudSyncStatus("error");
          useUiStore.getState().setCloudSyncError("Session expired — please refresh");
          return;
        }
        console.log("[cloudSync] Health check passed ✓");
      } catch (err) {
        console.error("[cloudSync] Health check failed:", err.message);
        useUiStore.getState().setCloudSyncStatus("error");
        useUiStore.getState().setCloudSyncError(err.message);
        return;
      }
      await runCloudSync();
    })();
  }, [persistenceLoaded, user, orgReady]);

  // ── beforeunload guard: warn if cloud sync hasn't completed ──
  useEffect(() => {
    const handler = e => {
      const status = useUiStore.getState().cloudSyncStatus;
      if (status === "syncing") {
        e.preventDefault();
        e.returnValue = "Your data is still syncing to the cloud. Are you sure you want to leave?";
        return e.returnValue;
      }
      if (status === "error") {
        e.preventDefault();
        e.returnValue = "Cloud sync failed — your latest changes may not be backed up. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}

// ─── Master Data Sync ──────────────────────────────────────────────

async function syncMasterData() {
  const cloudResult = await cloudSync.pullDataWithMeta("master");
  const localRaw = await storage.get(idbKey("bldg-master"));
  let localMaster = null;
  try {
    localMaster = localRaw ? JSON.parse(localRaw.value) : null;
  } catch {
    localMaster = null;
  } // Corrupted → treat as missing, cloud will restore

  if (!localMaster && !cloudResult) return; // nothing anywhere

  if (localMaster && !cloudResult) {
    // Local only → push to cloud
    console.log("[cloudSync] Master: local only → pushing to cloud");
    await cloudSync.pushData("master", localMaster);
    return;
  }

  if (!localMaster && cloudResult) {
    // Cloud only → pull to local
    console.log("[cloudSync] Master: cloud only → pulling to local");
    applyMasterData(cloudResult.data);
    await storage.set(idbKey("bldg-master"), JSON.stringify(cloudResult.data));
    return;
  }

  // Both exist → merge
  const cloudMaster = cloudResult.data;
  const merged = mergeMasterData(localMaster, cloudMaster);

  // Apply merged data locally
  applyMasterData(merged);
  await storage.set(idbKey("bldg-master"), JSON.stringify(merged));

  // Push merged data to cloud so the other device gets it
  await cloudSync.pushData("master", merged);
  console.log("[cloudSync] Master: merged and pushed");
}

/**
 * Merge two master data objects. Strategy:
 * - For companyProfiles: union by id (keep profiles from both sides)
 * - For companyInfo: prefer local (user is actively editing on this machine)
 * - For contact arrays (clients, architects, etc): union by id
 * - For static arrays (jobTypes, bidTypes, etc): prefer local
 */
function mergeMasterData(local, cloud) {
  const merged = { ...local };

  // Merge companyProfiles — union by id
  const localProfiles = local.companyProfiles || [];
  const cloudProfiles = cloud.companyProfiles || [];
  const profileMap = new Map();
  // Cloud first (so local overrides if same id)
  for (const p of cloudProfiles) profileMap.set(p.id, p);
  for (const p of localProfiles) profileMap.set(p.id, p);
  merged.companyProfiles = Array.from(profileMap.values());

  // Merge contact categories — union by id
  for (const cat of ["clients", "architects", "engineers", "estimators", "subcontractors"]) {
    const localItems = local[cat] || [];
    const cloudItems = cloud[cat] || [];
    const itemMap = new Map();
    for (const item of cloudItems) itemMap.set(item.id, item);
    for (const item of localItems) itemMap.set(item.id, item);
    merged[cat] = Array.from(itemMap.values());
  }

  // Merge historicalProposals — union by id (prevents proposals from being dropped)
  const localProposals = local.historicalProposals || [];
  const cloudProposals = cloud.historicalProposals || [];
  const proposalMap = new Map();
  for (const p of cloudProposals) proposalMap.set(p.id, p);
  for (const p of localProposals) proposalMap.set(p.id, p);
  merged.historicalProposals = Array.from(proposalMap.values());

  // companyInfo: prefer local (has logos etc), but if local has no name and cloud does, use cloud
  if (!local.companyInfo?.name && cloud.companyInfo?.name) {
    merged.companyInfo = { ...cloud.companyInfo };
  }

  return merged;
}

function applyMasterData(data) {
  useMasterDataStore.getState().setMasterData({
    ...useMasterDataStore.getState().masterData,
    ...data,
  });
}

// ─── Estimates Sync ────────────────────────────────────────────────

async function syncEstimates() {
  // Get local index
  const idxRaw = await storage.get(idbKey("bldg-index"));
  let localIndex = [];
  try {
    localIndex = idxRaw ? JSON.parse(idxRaw.value) : [];
  } catch {
    localIndex = [];
  } // Corrupted → treat as empty
  const localIndexMap = new Map(localIndex.map(e => [e.id, e]));

  // Get locally-deleted IDs — merge IndexedDB + localStorage backup
  const deletedRaw = await storage.get(idbKey("bldg-deleted-ids"));
  let deletedIds = [];
  try {
    deletedIds = deletedRaw ? JSON.parse(deletedRaw.value) : [];
  } catch {
    deletedIds = [];
  }
  // Merge localStorage backup (survives IndexedDB clears)
  try {
    const userId = useAuthStore.getState().user?.id;
    const lsKey = `bldg-deleted-ids-${userId || "anon"}`;
    const lsRaw = localStorage.getItem(lsKey);
    if (lsRaw) {
      const lsIds = JSON.parse(lsRaw);
      for (const id of lsIds) {
        if (!deletedIds.includes(id)) deletedIds.push(id);
      }
    }
  } catch {
    /* ignore */
  }
  const deletedSet = new Set(deletedIds);

  // Get cloud index — filter out any locally-deleted estimates to prevent resurrection
  const cloudIndexResult = await cloudSync.pullDataWithMeta("index");
  const cloudIndexRaw = cloudIndexResult?.data && Array.isArray(cloudIndexResult.data) ? cloudIndexResult.data : [];
  const cloudIndex = cloudIndexRaw.filter(e => !deletedSet.has(e.id));
  const cloudIndexMap = new Map(cloudIndex.map(e => [e.id, e]));

  // Get all cloud estimates with metadata
  const cloudEstimates = await cloudSync.pullAllEstimatesWithMeta();
  const cloudEstMap = new Map(cloudEstimates.map(e => [e.estimate_id, e]));

  let changed = false;

  // Retry cloud deletion for any locally-deleted estimates still in cloud
  const cleanedDeletedIds = [];
  for (const delId of deletedIds) {
    if (cloudEstMap.has(delId)) {
      console.log(`[cloudSync] Estimates: retrying cloud deletion for ${delId}`);
      try {
        await cloudSync.deleteEstimate(delId);
      } catch (err) {
        console.warn(`[cloudSync] Retry delete failed for ${delId}:`, err.message);
        cleanedDeletedIds.push(delId); // Keep in deleted list for next retry
      }
    }
    // else: already gone from cloud, no need to keep tracking
  }
  // Update deleted IDs list (remove successfully deleted ones)
  if (cleanedDeletedIds.length !== deletedIds.length) {
    await storage.set(idbKey("bldg-deleted-ids"), JSON.stringify(cleanedDeletedIds));
    // Also update localStorage backup
    try {
      const userId = useAuthStore.getState().user?.id;
      const lsKey = `bldg-deleted-ids-${userId || "anon"}`;
      localStorage.setItem(lsKey, JSON.stringify(cleanedDeletedIds));
    } catch {
      /* ignore */
    }
  }
  // Rebuild deleted set from cleaned list (original deletedSet is stale after retry loop)
  const activeDeletedSet = new Set(cleanedDeletedIds);

  // Pull estimates that exist in cloud but not locally
  // SKIP any that were locally deleted (prevents resurrection)
  for (const ce of cloudEstimates) {
    if (activeDeletedSet.has(ce.estimate_id)) {
      continue; // Don't pull back a deleted estimate
    }
    if (!localIndexMap.has(ce.estimate_id)) {
      console.log(`[cloudSync] Estimates: pulling cloud estimate ${ce.estimate_id}`);
      await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(ce.data));
      // Add to local index from cloud index entry
      const cloudEntry = cloudIndexMap.get(ce.estimate_id);
      if (cloudEntry) {
        localIndex.push(cloudEntry);
        localIndexMap.set(ce.estimate_id, cloudEntry);
      }
      changed = true;
    }
  }

  // Push estimates that exist locally but not in cloud
  for (const entry of localIndex) {
    if (!cloudEstMap.has(entry.id)) {
      console.log(`[cloudSync] Estimates: pushing local estimate ${entry.id}`);
      const estRaw = await storage.get(idbKey(`bldg-est-${entry.id}`));
      if (estRaw) {
        let estData;
        try {
          estData = JSON.parse(estRaw.value);
        } catch {
          continue;
        } // Skip corrupted estimate
        await cloudSync.pushEstimate(entry.id, estData);
      }
      changed = true;
    }
  }

  // Final filter: ensure no deleted estimates remain in localIndex before persisting
  // Uses original deletedSet (all known deleted IDs, not just retry failures)
  const cleanedIndex = localIndex.filter(e => !deletedSet.has(e.id));
  if (cleanedIndex.length !== localIndex.length) {
    console.log(`[cloudSync] Estimates: filtered ${localIndex.length - cleanedIndex.length} deleted entries from index`);
    localIndex = cleanedIndex;
    changed = true;
  }

  if (changed) {
    // Update local index in store and IndexedDB
    useEstimatesStore.getState().setEstimatesIndex(localIndex);
    const idxJson = JSON.stringify(localIndex);
    await storage.set(idbKey("bldg-index"), idxJson);

    // Mirror index to localStorage — resilient backup
    try {
      const userId = useAuthStore.getState().user?.id;
      if (userId) localStorage.setItem(`bldg-index-mirror-${userId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // Push merged index to cloud (excluding deleted)
    await cloudSync.pushData("index", localIndex);
    console.log(`[cloudSync] Estimates: synced, ${localIndex.length} total estimates`);
  }
}

// ─── Settings Sync ─────────────────────────────────────────────────

async function syncSettings() {
  const cloudResult = await cloudSync.pullDataWithMeta("settings");
  const localRaw = await storage.get(idbKey("bldg-settings"));
  let localSettings = null;
  try {
    localSettings = localRaw ? JSON.parse(localRaw.value) : null;
  } catch {
    localSettings = null;
  }

  if (localSettings && !cloudResult) {
    await cloudSync.pushData("settings", localSettings);
    return;
  }

  if (!localSettings && cloudResult) {
    useUiStore.getState().setAppSettings({
      ...useUiStore.getState().appSettings,
      ...cloudResult.data,
    });
    await storage.set(idbKey("bldg-settings"), JSON.stringify(cloudResult.data));
    return;
  }

  // Both exist — prefer local (settings are device-specific mostly),
  // but push local to cloud so other device gets apiKey etc.
  if (localSettings) {
    await cloudSync.pushData("settings", localSettings);
  }
}

// ─── Assemblies Sync ───────────────────────────────────────────────

async function syncAssemblies() {
  const cloudResult = await cloudSync.pullDataWithMeta("assemblies");
  const localRaw = await storage.get(idbKey("bldg-assemblies"));
  let localAsm = null;
  try {
    localAsm = localRaw ? JSON.parse(localRaw.value) : null;
  } catch {
    localAsm = null;
  }

  if (localAsm && !cloudResult) {
    await cloudSync.pushData("assemblies", localAsm);
    return;
  }

  if (!localAsm && cloudResult) {
    if (Array.isArray(cloudResult.data)) {
      useDatabaseStore.getState().setAssemblies(cloudResult.data);
      await storage.set(idbKey("bldg-assemblies"), JSON.stringify(cloudResult.data));
    }
    return;
  }

  // Both exist — union by id
  if (localAsm && cloudResult?.data && Array.isArray(localAsm) && Array.isArray(cloudResult.data)) {
    const asmMap = new Map();
    for (const a of cloudResult.data) asmMap.set(a.id, a);
    for (const a of localAsm) asmMap.set(a.id, a);
    const merged = Array.from(asmMap.values());
    useDatabaseStore.getState().setAssemblies(merged);
    await storage.set(idbKey("bldg-assemblies"), JSON.stringify(merged));
    await cloudSync.pushData("assemblies", merged);
  } else if (localAsm) {
    await cloudSync.pushData("assemblies", localAsm);
  }
}

// ─── Calendar Sync ────────────────────────────────────────────────

async function syncCalendar() {
  const cloudResult = await cloudSync.pullDataWithMeta("calendar");
  const localRaw = await storage.get(idbKey("bldg-calendar"));
  let localTasks = null;
  try {
    localTasks = localRaw ? JSON.parse(localRaw.value) : null;
  } catch {
    localTasks = null;
  }

  if (localTasks && !cloudResult) {
    await cloudSync.pushData("calendar", localTasks);
    return;
  }

  if (!localTasks && cloudResult) {
    if (Array.isArray(cloudResult.data)) {
      useCalendarStore.getState().setTasks(cloudResult.data);
      await storage.set(idbKey("bldg-calendar"), JSON.stringify(cloudResult.data));
    }
    return;
  }

  // Both exist — union by id
  if (localTasks && cloudResult?.data && Array.isArray(localTasks) && Array.isArray(cloudResult.data)) {
    const taskMap = new Map();
    for (const t of cloudResult.data) taskMap.set(t.id, t);
    for (const t of localTasks) taskMap.set(t.id, t); // local wins on conflict
    const merged = Array.from(taskMap.values());
    useCalendarStore.getState().setTasks(merged);
    await storage.set(idbKey("bldg-calendar"), JSON.stringify(merged));
    await cloudSync.pushData("calendar", merged);
  } else if (localTasks) {
    await cloudSync.pushData("calendar", localTasks);
  }
}

// ─── One-Time Blob Migration ────────────────────────────────────────
//
// Re-pushes any local estimates that have drawing/document/specPdf blob
// data but were previously synced without uploading blobs to Storage.
// Runs in the background after normal sync, throttled to avoid overload.

async function runBlobMigration() {
  // v2: previous migration used proxy upload which failed on files > 4.5MB (Vercel limit)
  // v2 uses signed-URL direct uploads — no size limit
  const MIGRATION_KEY = "blob_migration_v2";
  if (localStorage.getItem(MIGRATION_KEY) === "done") return;

  const idxRaw = await storage.get(idbKey("bldg-index"));
  if (!idxRaw) {
    localStorage.setItem(MIGRATION_KEY, "done");
    return;
  }

  let index;
  try {
    index = JSON.parse(idxRaw.value);
  } catch {
    localStorage.setItem(MIGRATION_KEY, "done");
    return;
  }
  if (!index.length) {
    localStorage.setItem(MIGRATION_KEY, "done");
    return;
  }

  console.log(`[cloudSync] Blob migration: checking ${index.length} estimates...`);
  let migrated = 0;

  for (const entry of index) {
    try {
      const raw = await storage.get(idbKey(`bldg-est-${entry.id}`));
      if (!raw) continue;

      const data = JSON.parse(raw.value);
      let hasUnuploadedBlobs = false;

      // Check drawings for blobs without storagePath
      if (Array.isArray(data.drawings)) {
        hasUnuploadedBlobs = data.drawings.some(d => d.data && !d.storagePath);
      }
      // Check documents
      if (!hasUnuploadedBlobs && Array.isArray(data.documents)) {
        hasUnuploadedBlobs = data.documents.some(d => d.data && !d.storagePath);
      }
      // Check specPdf
      if (!hasUnuploadedBlobs && data.specPdf && !data._specPdfStoragePath) {
        hasUnuploadedBlobs = true;
      }

      if (hasUnuploadedBlobs) {
        console.log(`[cloudSync] Blob migration: re-pushing estimate ${entry.id}`);
        await cloudSync.pushEstimate(entry.id, data);
        migrated++;
        // Small delay between pushes to avoid hammering the API
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.warn(`[cloudSync] Blob migration: failed for ${entry.id}:`, err.message);
    }
  }

  localStorage.setItem(MIGRATION_KEY, "done");
  console.log(`[cloudSync] Blob migration complete. Re-pushed ${migrated} estimate(s).`);
}
