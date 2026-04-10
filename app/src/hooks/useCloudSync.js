import { useEffect, useRef } from "react";
import { storage } from "@/utils/storage";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { resetAllStores, getDirtyEstimates, clearDirtyEstimate, markDirtyEstimate } from "@/hooks/usePersistence";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";
import { useOrgStore } from "@/stores/orgStore";
import * as nova from "@/utils/novaLogger";
import { hasPendingEstimateItemsNewerThan } from "@/utils/estimateLocalDraft";

const DIRTY_RETRY_INTERVAL_MS = 30_000;
let _dirtyFlushPromise = null;

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

export async function flushDirtyEstimates({ source = "manual" } = {}) {
  if (_dirtyFlushPromise) return _dirtyFlushPromise;

  _dirtyFlushPromise = (async () => {
    if (useUiStore.getState().cloudSyncInProgress) {
      return { attempted: 0, flushed: 0, failed: 0, skipped: true };
    }

    const dirtyIds = getDirtyEstimates();
    if (dirtyIds.length === 0) {
      return { attempted: 0, flushed: 0, failed: 0, skipped: false };
    }

    let flushed = 0;
    let failed = 0;
    nova.sync.info(`Flushing ${dirtyIds.length} dirty estimate(s)`, { source, count: dirtyIds.length });

    for (const estimateId of dirtyIds) {
      try {
        const localRecord = await cloudSync.readLocalEstimateRecord(estimateId);
        if (!localRecord.exists) {
          clearDirtyEstimate(estimateId);
          nova.orphan.warn(`Dirty estimate ${estimateId.slice(0, 8)} has no IDB data — cleared from queue`);
          continue;
        }
        if (!localRecord.data) {
          failed++;
          nova.sync.warn(`Dirty estimate ${estimateId.slice(0, 8)} has corrupted local data`, { source });
          continue;
        }

        await cloudSync.pushEstimate(estimateId, localRecord.data);
        clearDirtyEstimate(estimateId);
        flushed++;
      } catch (err) {
        failed++;
        nova.sync.warn(`Failed to push dirty estimate ${estimateId.slice(0, 8)}`, { error: err, source });
      }
    }

    return { attempted: dirtyIds.length, flushed, failed, skipped: false };
  })().finally(() => {
    _dirtyFlushPromise = null;
  });

  return _dirtyFlushPromise;
}

async function runCloudSync() {
  nova.sync.info("Starting bidirectional sync...");
  useUiStore.getState().setCloudSyncStatus("syncing");
  useUiStore.setState({ cloudSyncInProgress: true });

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
  const MAX_RETRIES = 2;
  const trySync = async (label, fn) => {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        await fn();
        return; // Success
      } catch (err) {
        if (attempt <= MAX_RETRIES) {
          // Exponential backoff: 1s, 2s
          const delay = Math.pow(2, attempt - 1) * 1000;
          nova.sync.warn(`${label} attempt ${attempt} failed — retrying in ${delay}ms`, { error: err, label, attempt });
          await new Promise(r => setTimeout(r, delay));
        } else {
          failures++;
          nova.sync.error(`${label} failed after ${MAX_RETRIES + 1} attempts`, { error: err, label });
        }
      }
    }
  };

  // ── Flush dirty estimates first (failed/deferred pushes from last session) ──
  await trySync("Dirty estimates", async () => {
    await flushDirtyEstimates({ source: "startup" });
  });

  await trySync("Master data", syncMasterData);
  await trySync("Estimates", syncEstimates);
  await trySync("Settings", syncSettings);
  await trySync("Assemblies", syncAssemblies);
  await trySync("User cost library", syncUserElements);
  await trySync("Calendar", syncCalendar);

  // CRITICAL: If a user-switch wipe occurred above, resetAllStores() set
  // persistenceLoaded = false. The sync just pulled fresh data from cloud,
  // so we must restore persistenceLoaded so auto-save and EstimateLoader work.
  if (!useUiStore.getState().persistenceLoaded) {
    useUiStore.getState().setPersistenceLoaded(true);
    nova.sync.info("Restored persistenceLoaded after user-switch recovery");
  }

  if (failures === 0) {
    useUiStore.getState().setCloudSyncStatus("synced");
    useUiStore
      .getState()
      .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    if (useUiStore.getState().setCloudSyncLastFullAt) useUiStore.getState().setCloudSyncLastFullAt(new Date().toISOString());
    nova.sync.info("Bidirectional sync complete");
  } else if (failures <= 3) {
    useUiStore.getState().setCloudSyncStatus("partial");
    useUiStore
      .getState()
      .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    if (useUiStore.getState().setCloudSyncLastFullAt) useUiStore.getState().setCloudSyncLastFullAt(new Date().toISOString());
    nova.sync.warn(`Completed with ${failures}/6 failure(s)`, { failures });
  } else {
    nova.sync.error(`${failures}/6 sync operations failed`, { failures });
    useUiStore.getState().setCloudSyncStatus("error");
  }

  // Clear the in-progress flag so auto-save cloud pushes can resume
  useUiStore.setState({ cloudSyncInProgress: false });

  // One-time background migration: re-push estimates with blobs so they
  // get uploaded to Supabase Storage. Estimates created before the blob
  // sync feature were pushed with blobs stripped and never uploaded.
  // Delay to avoid overlapping with the dirty-estimate flush above.
  setTimeout(() => {
    runBlobMigration().catch(err => console.warn("[cloudSync] Blob migration failed:", err));
  }, 5000);
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
        nova.sync.info("Health check passed");
        console.log("[cloudSync] ✅ Health check passed — starting sync");
      } catch (err) {
        nova.sync.error("Health check failed", { error: err });
        console.error("[cloudSync] ❌ Health check FAILED:", err.message);
        useUiStore.getState().setCloudSyncStatus("error");
        useUiStore.getState().setCloudSyncError(err.message);
        return;
      }
      await runCloudSync();
      console.log("[cloudSync] ✅ Sync complete — status:", useUiStore.getState().cloudSyncStatus);
    })();
  }, [persistenceLoaded, user, orgReady]);

  useEffect(() => {
    if (!persistenceLoaded || !user || !orgReady) return undefined;

    const flush = () => {
      flushDirtyEstimates({ source: "interval" }).catch(err => {
        console.warn("[cloudSync] Dirty retry loop failed:", err.message || err);
      });
    };

    const intervalId = setInterval(flush, DIRTY_RETRY_INTERVAL_MS);
    const handleOnline = () => flush();
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
    };
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
  let cloudResult = await cloudSync.pullDataWithMeta("master");

  // ── Solo→org migration: if org-mode cloud is empty, check solo-mode cloud ──
  // When a user creates/joins an org, their data is in user_data with org_id=NULL.
  // Pull that as a fallback so company profiles, contacts, etc. aren't lost.
  if (!cloudResult) {
    const soloResult = await cloudSync.pullSoloFallback("master");
    if (soloResult) {
      console.log("[cloudSync] Master: org cloud empty — migrating from solo-mode cloud");
      cloudResult = soloResult;
    }
  }

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
    // Push to org-scoped cloud so future loads find it directly
    await cloudSync.pushData("master", cloudResult.data);
    return;
  }

  // Both exist → merge with timestamp-based conflict resolution
  const cloudMaster = cloudResult.data;
  const cloudTime = cloudResult.updated_at ? new Date(cloudResult.updated_at).getTime() : 0;
  const localTime = localMaster._savedAt ? new Date(localMaster._savedAt).getTime() : 0;
  const cloudNewer = cloudTime > localTime;
  const merged = mergeMasterData(localMaster, cloudMaster, cloudNewer);

  // Log the conflict resolution for debugging
  nova.sync.conflict("Master data merge", {
    winner: cloudNewer ? "cloud" : "local",
    cloudTime: cloudTime ? new Date(cloudTime).toISOString() : "none",
    localTime: localTime ? new Date(localTime).toISOString() : "none",
    cloudProfiles: (cloudMaster.companyProfiles || []).length,
    localProfiles: (localMaster.companyProfiles || []).length,
    mergedProfiles: (merged.companyProfiles || []).length,
  });

  // Apply merged data locally
  applyMasterData(merged);
  await storage.set(idbKey("bldg-master"), JSON.stringify(merged));

  // Push merged data to cloud so the other device gets it
  await cloudSync.pushData("master", merged);

  // Seed normalized tables from JSONB blob (one-time migration)
  const { pullProfiles, pullContacts } = await import("@/utils/cloudSyncProfiles");

  // Safety net: if normalized tables have data the JSONB merge lost, restore it
  try {
    const current = useMasterDataStore.getState().masterData;
    const normalizedProfiles = await pullProfiles();
    const normalizedContacts = await pullContacts();
    let restored = false;

    // Restore companyProfiles if JSONB merge wiped them
    if (current.companyProfiles.length === 0 && normalizedProfiles.filter(p => !p.is_default).length > 0) {
      const restoredProfiles = normalizedProfiles.filter(p => !p.is_default).map(p => ({
        id: p.id, name: p.name, shortName: p.short_name, address: p.address, city: p.city,
        state: p.state, zip: p.zip, phone: p.phone, email: p.email, website: p.website,
        licenseNo: p.license_no, ein: p.ein, logo: p.logo, brandColors: p.brand_colors || [],
        palettes: p.palettes || [], boilerplateExclusions: p.boilerplate_exclusions || [],
        boilerplateNotes: p.boilerplate_notes || [],
      }));
      current.companyProfiles = restoredProfiles;
      restored = true;
    }

    // Restore companyInfo if JSONB merge wiped it
    const defaultProfile = normalizedProfiles.find(p => p.is_default);
    if (defaultProfile && !current.companyInfo?.name && defaultProfile.name) {
      current.companyInfo = {
        ...current.companyInfo,
        id: defaultProfile.id, name: defaultProfile.name, address: defaultProfile.address,
        city: defaultProfile.city, state: defaultProfile.state, zip: defaultProfile.zip,
        phone: defaultProfile.phone, email: defaultProfile.email, website: defaultProfile.website,
        licenseNo: defaultProfile.license_no, logo: defaultProfile.logo,
        brandColors: defaultProfile.brand_colors || [], palettes: defaultProfile.palettes || [],
        boilerplateExclusions: defaultProfile.boilerplate_exclusions || [],
        boilerplateNotes: defaultProfile.boilerplate_notes || [],
      };
      restored = true;
    }

    // Restore contacts if JSONB merge wiped them
    const contactTypeMap = { client: "clients", architect: "architects", engineer: "engineers", estimator: "estimators", subcontractor: "subcontractors" };
    for (const [type, key] of Object.entries(contactTypeMap)) {
      const normalizedOfType = normalizedContacts.filter(c => c.contact_type === type);
      if ((current[key] || []).length === 0 && normalizedOfType.length > 0) {
        current[key] = normalizedOfType.map(c => ({
          id: c.id, name: c.company_name || c.contact_name, company: c.company_name,
          contactName: c.contact_name, title: c.title, email: c.email, phone: c.phone,
          address: c.address, city: c.city, state: c.state, zip: c.zip, notes: c.notes,
          companyProfileId: c.metadata?.companyProfileId || "",
          ...(type === "subcontractor" ? {
            trades: c.metadata?.trades || [], markets: c.metadata?.markets || [],
            certifications: c.metadata?.certifications || [],
            insuranceExpiry: c.metadata?.insuranceExpiry || "",
            bondingCapacity: c.metadata?.bondingCapacity || "",
            emr: c.metadata?.emr || "", yearsInBusiness: c.metadata?.yearsInBusiness || "",
            preferred: c.metadata?.preferred || false, website: c.metadata?.website || "",
            licenseNo: c.metadata?.licenseNo || "",
          } : {}),
          ...(type === "estimator" ? { initials: c.metadata?.initials || "" } : {}),
        }));
        restored = true;
      }
    }

    if (restored) {
      nova.sync.conflict("Normalized table recovery", { restored: true });
      applyMasterData(current);
      await storage.set(idbKey("bldg-master"), JSON.stringify(current));
    }
  } catch (err) {
    console.warn("[cloudSync] Normalized table recovery failed:", err?.message);
  }
}

/**
 * Merge two master data objects. Strategy:
 * - For companyProfiles: union by id (winner overwrites on conflict)
 * - For companyInfo: prefer winner (based on timestamp)
 * - For contact arrays (clients, architects, etc): union by id
 * - For static arrays (jobTypes, bidTypes, etc): prefer winner
 * @param {boolean} cloudNewer — if true, cloud data wins on same-id conflicts
 */
function mergeMasterData(local, cloud, cloudNewer = false) {
  // Winner's data is applied SECOND (overwrites conflicts)
  const [loser, winner] = cloudNewer ? [local, cloud] : [cloud, local];
  const merged = { ...winner };

  // Merge companyProfiles — union by id, winner overwrites conflicts
  const loserProfiles = loser.companyProfiles || [];
  const winnerProfiles = winner.companyProfiles || [];
  const profileMap = new Map();
  for (const p of loserProfiles) profileMap.set(p.id, p);
  for (const p of winnerProfiles) profileMap.set(p.id, p);
  merged.companyProfiles = Array.from(profileMap.values());

  // Merge contact categories — union by id, winner overwrites conflicts
  for (const cat of ["clients", "architects", "engineers", "estimators", "subcontractors"]) {
    const loserItems = loser[cat] || [];
    const winnerItems = winner[cat] || [];
    const itemMap = new Map();
    for (const item of loserItems) itemMap.set(item.id, item);
    for (const item of winnerItems) itemMap.set(item.id, item);
    merged[cat] = Array.from(itemMap.values());
  }

  // Merge historicalProposals — union by id (prevents proposals from being dropped)
  const loserProposals = loser.historicalProposals || [];
  const winnerProposals = winner.historicalProposals || [];
  const proposalMap = new Map();
  for (const p of loserProposals) proposalMap.set(p.id, p);
  for (const p of winnerProposals) proposalMap.set(p.id, p);
  merged.historicalProposals = Array.from(proposalMap.values());

  // companyInfo: deep merge — never let empty fields overwrite populated ones
  const winnerInfo = winner.companyInfo || {};
  const loserInfo = loser.companyInfo || {};
  const mergedInfo = { ...loserInfo };
  for (const [k, v] of Object.entries(winnerInfo)) {
    // Winner field wins if it has a value, OR if loser also has no value
    if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      mergedInfo[k] = v;
    }
    // If winner field is empty but loser has data, keep loser's value (already in mergedInfo)
  }
  merged.companyInfo = mergedInfo;

  return merged;
}

function applyMasterData(data) {
  const current = useMasterDataStore.getState().masterData;
  const safe = { ...current };
  for (const [k, v] of Object.entries(data)) {
    const cur = current[k];
    // Never let an empty array overwrite a populated one
    if (Array.isArray(cur) && cur.length > 0 && Array.isArray(v) && v.length === 0) continue;
    // Never let an empty/null companyInfo overwrite a populated one
    if (k === "companyInfo" && cur?.name && (!v || !v.name)) continue;
    safe[k] = v;
  }
  useMasterDataStore.getState().setMasterData(safe);
}

// ─── Estimates Sync ────────────────────────────────────────────────
//
// CRITICAL FIX (v5): This function does async cloud operations that can take
// several seconds. Previously it read a snapshot of the IDB index at the start,
// then REPLACED the Zustand store at the end — any estimates the user created
// or deleted during the async window were silently lost.
//
// v5 strategy: ADDITIVE MERGE ONLY.
//   - Track which entries were pulled from cloud during sync.
//   - At the END, re-read the CURRENT Zustand store + fresh deleted-IDs.
//   - ADD cloud-pulled entries that aren't already in the store and aren't deleted.
//   - NEVER call setEstimatesIndex() to replace the store — only additive operations.
//   - Push local-only estimates to cloud (also using fresh state).

// Helper: read all deleted IDs from both IDB and localStorage
async function readDeletedIds() {
  let deletedIds = [];
  try {
    const deletedRaw = await storage.get(idbKey("bldg-deleted-ids"));
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
  return deletedIds;
}

async function syncEstimates() {
  // ── Phase 1: Read initial deleted IDs for cloud operations ──
  const initialDeletedIds = await readDeletedIds();
  const initialDeletedSet = new Set(initialDeletedIds);

  // ── Phase 2: Fetch cloud data ──
  let cloudIndexResult = await cloudSync.pullDataWithMeta("index");
  let cloudEstimates = await cloudSync.pullAllEstimatesWithMeta();

  // ── Solo→org migration: if org cloud is empty, check solo-mode cloud ──
  // If org has estimates, merge solo estimates in (don't replace).
  {
    const soloIndex = await cloudSync.pullSoloFallback("index");
    const soloEstimates = await cloudSync.pullAllEstimatesSoloFallback();
    if (soloEstimates.length > 0) {
      if (cloudEstimates.length === 0) {
        console.log(`[cloudSync] Estimates: org cloud empty — migrating ${soloEstimates.length} from solo-mode cloud`);
        cloudEstimates = soloEstimates;
        if (soloIndex && !cloudIndexResult) cloudIndexResult = soloIndex;
      } else {
        // Merge: add solo estimates not already present in org cloud
        const orgIds = new Set(cloudEstimates.map(e => e.estimate_id));
        const newFromSolo = soloEstimates.filter(e => !orgIds.has(e.estimate_id));
        if (newFromSolo.length > 0) {
          console.log(`[cloudSync] Estimates: merging ${newFromSolo.length} solo-mode estimates into org cloud (${cloudEstimates.length} existing)`);
          cloudEstimates = [...cloudEstimates, ...newFromSolo];
        }
        // Merge solo index entries too
        if (soloIndex?.data && Array.isArray(soloIndex.data) && cloudIndexResult?.data) {
          const orgIndexIds = new Set(cloudIndexResult.data.map(e => e.id));
          const newIndexEntries = soloIndex.data.filter(e => !orgIndexIds.has(e.id));
          if (newIndexEntries.length > 0) {
            cloudIndexResult = { ...cloudIndexResult, data: [...cloudIndexResult.data, ...newIndexEntries] };
          }
        }
      }
    }
  }

  const cloudIndexRaw = cloudIndexResult?.data && Array.isArray(cloudIndexResult.data) ? cloudIndexResult.data : [];
  const cloudIndexMap = new Map(cloudIndexRaw.filter(e => !initialDeletedSet.has(e.id)).map(e => [e.id, e]));
  const cloudEstMap = new Map(cloudEstimates.map(e => [e.estimate_id, e]));

  // ── Phase 3: Retry cloud deletion for locally-deleted estimates still in cloud ──
  for (const delId of initialDeletedIds) {
    if (cloudEstMap.has(delId)) {
      console.log(`[cloudSync] Estimates: retrying cloud deletion for ${delId}`);
      try {
        await cloudSync.deleteEstimate(delId);
      } catch (err) {
        console.warn(`[cloudSync] Retry delete failed for ${delId}:`, err.message);
      }
    }
  }

  // ── Phase 4: Cache cloud-only estimate data to IDB (doesn't touch the store yet) ──
  const pulledEntries = []; // track entries pulled from cloud for Phase 5 merge
  // Use initial IDB snapshot just for diffing against cloud — NOT for store replacement
  let idbIndex = [];
  try {
    const idxRaw = await storage.get(idbKey("bldg-index"));
    idbIndex = idxRaw ? JSON.parse(idxRaw.value) : [];
  } catch {
    idbIndex = [];
  }
  const idbIndexMap = new Map(idbIndex.map(e => [e.id, e]));

  const updatedFromCloud = []; // track estimates overwritten by newer cloud data
  for (const ce of cloudEstimates) {
    if (initialDeletedSet.has(ce.estimate_id)) continue; // Don't pull back deleted

    const existsLocally = idbIndexMap.has(ce.estimate_id);

    if (!existsLocally) {
      // ── New estimate from cloud — fetch full data on demand ──
      console.log(`[cloudSync] Estimates: caching cloud estimate ${ce.estimate_id} to IDB`);
      let estData = await cloudSync.pullEstimate(ce.estimate_id);
      if (!estData) continue; // Failed to fetch — skip
      try {
        estData = await cloudSync.hydrateBlobs(estData);
      } catch {
        /* blob hydration failed — use raw data */
      }
      await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
      const cloudEntry = cloudIndexMap.get(ce.estimate_id);
      if (cloudEntry) {
        pulledEntries.push(cloudEntry);
      }
    } else {
      // ── Estimate exists locally — check if cloud is newer ──
      // Compare cloud updated_at vs local _savedAt timestamp
      const cloudTime = ce.updated_at ? new Date(ce.updated_at).getTime() : 0;
      if (cloudTime > 0) {
        let localTime = 0;
        const localRecord = await cloudSync.readLocalEstimateRecord(ce.estimate_id);
        if (localRecord.data?._savedAt) {
          localTime = new Date(localRecord.data._savedAt).getTime();
        }

        // Cloud is newer — fetch full data and overwrite local
        // Also handle case where local has no _savedAt (legacy data before this fix)
        if (cloudTime > localTime) {
          const activeId = useEstimatesStore.getState().activeEstimateId;
          const protectRecentActiveEdits = activeId === ce.estimate_id && cloudSync.isRecentlyEdited();
          const protectPendingLocalItems = hasPendingEstimateItemsNewerThan(ce.estimate_id, localRecord.data?._savedAt);
          if (protectRecentActiveEdits || protectPendingLocalItems) {
            if (protectRecentActiveEdits) {
              const delay = cloudSync.scheduleDeferredEstimatePull(ce.estimate_id);
              console.log(
                `[cloudSync] Estimates: deferring overwrite for ${ce.estimate_id} by ${delay}ms to protect local edits`,
              );
            } else {
              console.log(
                `[cloudSync] Estimates: skipping cloud overwrite for ${ce.estimate_id} because newer local item edits are pending`,
              );
            }
            continue;
          }

          console.log(
            `[cloudSync] Estimates: cloud is newer for ${ce.estimate_id} (cloud: ${ce.updated_at}, local _savedAt: ${localTime ? new Date(localTime).toISOString() : "none"}) — overwriting local`,
          );
          let estData = await cloudSync.pullEstimate(ce.estimate_id);
          if (!estData) continue; // Failed to fetch — skip
          try {
            estData = await cloudSync.hydrateBlobs(estData);
          } catch {
            /* blob hydration failed — use raw data */
          }
          // Stamp with _savedAt so future comparisons work
          estData._savedAt = ce.updated_at;
          await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
          updatedFromCloud.push(ce.estimate_id);

          // Update the index entry from cloud too
          const cloudEntry = cloudIndexMap.get(ce.estimate_id);
          if (cloudEntry) {
            const localEntry = idbIndexMap.get(ce.estimate_id);
            // Merge cloud entry fields into local entry
            idbIndexMap.set(ce.estimate_id, { ...localEntry, ...cloudEntry });
          }
        }
      }
    }
  }

  // If any existing estimates were updated from cloud, reload them into stores
  if (updatedFromCloud.length > 0) {
    console.log(`[cloudSync] Estimates: ${updatedFromCloud.length} estimate(s) updated from cloud — refreshing stores`);
    // Update IDB index with merged entries
    const mergedIndex = Array.from(idbIndexMap.values());
    await storage.set(idbKey("bldg-index"), JSON.stringify(mergedIndex));

    // If the active estimate was updated, reload it into stores.
    // Use reloadActiveEstimate (not direct setItems) so the edit recency guard
    // applies — prevents cloud sync from wiping division/pricing changes that
    // are in-flight in the 1.5s auto-save debounce window.
    const activeId = useEstimatesStore.getState().activeEstimateId;
    if (activeId && updatedFromCloud.includes(activeId)) {
      try {
        const freshRaw = await storage.get(idbKey(`bldg-est-${activeId}`));
        if (freshRaw) {
          const freshData = JSON.parse(freshRaw.value);
          const { reloadActiveEstimate } = await import("@/utils/cloudSync");
          await reloadActiveEstimate(freshData, activeId);
          console.log(`[cloudSync] Active estimate ${activeId} reloaded from newer cloud data`);
          useUiStore.getState().showToast("Estimate updated from another device", "info");
        }
      } catch (err) {
        console.warn("[cloudSync] Failed to reload active estimate from cloud:", err.message);
      }
    }

    // Update estimates index in store
    useEstimatesStore.setState(state => {
      const updated = state.estimatesIndex.map(e => {
        const merged = idbIndexMap.get(e.id);
        return merged || e;
      });
      return { estimatesIndex: updated };
    });
  }

  // ── Phase 5: SAFE ADDITIVE MERGE — re-read FRESH state, never replace ──
  // Re-read deleted IDs (user may have deleted more estimates during the async window)
  const freshDeletedIds = await readDeletedIds();
  const freshDeletedSet = new Set(freshDeletedIds);

  // Read the CURRENT Zustand store (NOT the stale IDB snapshot from Phase 4)
  const currentIndex = useEstimatesStore.getState().estimatesIndex;
  const currentIndexMap = new Map(currentIndex.map(e => [e.id, e]));

  // Only ADD entries pulled from cloud that aren't already in store and aren't deleted.
  // Pre-filter against the snapshot we just read — but the real dedup happens inside
  // the functional setState below, which reads store state at write-time.
  const toAdd = pulledEntries.filter(e => !currentIndexMap.has(e.id) && !freshDeletedSet.has(e.id));

  if (toAdd.length > 0) {
    console.log(`[cloudSync] Estimates: adding ${toAdd.length} cloud-pulled entries to store`);
    // ATOMIC: route through setEstimatesIndex (has built-in Map dedup) with
    // functional updater so store state is read at write-time, not from the stale
    // closure snapshot. Re-check freshDeletedSet inside the updater so user
    // deletes between the filter above and this write are respected.
    useEstimatesStore.getState().setEstimatesIndex(prev => {
      const existingIds = new Set(prev.map(ex => ex.id));
      const safe = toAdd.filter(e => !existingIds.has(e.id) && !freshDeletedSet.has(e.id));
      if (safe.length === 0) return prev; // no-op
      return [...prev, ...safe];
    });
    const merged = useEstimatesStore.getState().estimatesIndex;
    const idxJson = JSON.stringify(merged);
    await storage.set(idbKey("bldg-index"), idxJson);

    // Mirror index to localStorage — resilient backup
    try {
      const userId = useAuthStore.getState().user?.id;
      if (userId && typeof localStorage !== "undefined") localStorage.setItem(`bldg-index-mirror-${userId}`, idxJson);
    } catch {
      /* quota exceeded */
    }
  }

  // ── Phase 6: Push local-only estimates to cloud (using FRESH store state) ──
  // Re-read fresh state since we may have just added entries
  const finalIndex = useEstimatesStore.getState().estimatesIndex;
  let pushed = false;
  const orphanIds = []; // index entries with no data anywhere
  for (const entry of finalIndex) {
    if (!cloudEstMap.has(entry.id) && !freshDeletedSet.has(entry.id)) {
      console.log(`[cloudSync] Estimates: pushing local estimate ${entry.id}`);
      const estRaw = await storage.get(idbKey(`bldg-est-${entry.id}`));
      if (estRaw) {
        let estData;
        try {
          estData = JSON.parse(estRaw.value);
        } catch {
          continue;
        } // Skip corrupted
        try {
          await cloudSync.pushEstimate(entry.id, estData);
        } catch (err) {
          markDirtyEstimate(entry.id);
          throw err;
        }
        pushed = true;
      } else {
        // No IDB data under current key — but data may exist under a different
        // key prefix (solo vs org vs bare). Do NOT mark as orphan; loadEstimate
        // has multi-key fallback logic that can find and migrate these.
        console.warn(`[cloudSync] Estimate ${entry.id} has no data under current IDB key — skipping (not orphaning)`);
      }
    }
  }

  // Remove orphaned index entries (metadata with no backing data)
  if (orphanIds.length > 0) {
    const orphanSet = new Set(orphanIds);
    nova.orphan.cleaned(orphanIds.length, orphanIds);
    useEstimatesStore.setState(state => ({
      estimatesIndex: state.estimatesIndex.filter(e => !orphanSet.has(e.id)),
    }));
    // Persist cleaned index
    const cleanedIdx = useEstimatesStore.getState().estimatesIndex;
    await storage.set(idbKey("bldg-index"), JSON.stringify(cleanedIdx));
    try {
      const userId = useAuthStore.getState().user?.id;
      if (userId && typeof localStorage !== "undefined") localStorage.setItem(`bldg-index-mirror-${userId}`, JSON.stringify(cleanedIdx));
    } catch {
      /* quota exceeded */
    }

    // Add orphan IDs to deleted-IDs list so the data-loss guard knows about the reduction
    // and cloud sync won't resurrect them from the cloud index
    try {
      const currentDeleted = await readDeletedIds();
      const merged = [...new Set([...currentDeleted, ...orphanIds])];
      await storage.set(idbKey("bldg-deleted-ids"), JSON.stringify(merged));
      const userId = useAuthStore.getState().user?.id;
      const orgId = useOrgStore.getState().org?.id || "solo";
      if (userId && typeof localStorage !== "undefined") localStorage.setItem(`bldg-deleted-ids-${userId}-${orgId}`, JSON.stringify(merged));
      console.log(`[cloudSync] Added ${orphanIds.length} orphan(s) to deleted-IDs list`);
    } catch {
      /* storage write failed */
    }

    // Also soft-delete orphans in cloud so cloud index shrinks too
    for (const oid of orphanIds) {
      try {
        await cloudSync.deleteEstimate(oid);
      } catch {
        /* cloud delete failed — will retry next sync */
      }
    }
  }

  // ── Phase 7: Clean deleted entries from IDB index ──
  // ATOMIC: Use functional setState so concurrent user creates are preserved.
  // Re-read freshDeletedIds one final time to catch any deletes during Phase 6.
  const finalDeletedIds = await readDeletedIds();
  const finalDeletedSet = new Set(finalDeletedIds);
  const beforeLen = useEstimatesStore.getState().estimatesIndex.length;
  useEstimatesStore.setState(state => ({
    estimatesIndex: state.estimatesIndex.filter(e => !finalDeletedSet.has(e.id)),
  }));
  const afterLen = useEstimatesStore.getState().estimatesIndex.length;
  if (afterLen < beforeLen) {
    console.log(`[cloudSync] Estimates: filtered ${beforeLen - afterLen} deleted entries from index`);
  }
  // Persist the cleaned index to IDB + localStorage mirror
  const cleanedIndex = useEstimatesStore.getState().estimatesIndex;
  const cleanedJson = JSON.stringify(cleanedIndex);
  await storage.set(idbKey("bldg-index"), cleanedJson);
  try {
    const userId = useAuthStore.getState().user?.id;
    if (userId) localStorage.setItem(`bldg-index-mirror-${userId}`, cleanedJson);
  } catch {
    /* quota exceeded */
  }

  // Log completion (index blob no longer pushed — normalized columns are authoritative)
  const pushIndex = useEstimatesStore.getState().estimatesIndex;
  if (toAdd.length > 0 || pushed || afterLen < beforeLen) {
    console.log(`[cloudSync] Estimates: synced, ${pushIndex.length} total estimates`);
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

  // Both exist — compare timestamps: cloud-newer wins
  if (localSettings && cloudResult) {
    const cloudTime = cloudResult.updated_at ? new Date(cloudResult.updated_at).getTime() : 0;
    const localTime = localSettings._savedAt ? new Date(localSettings._savedAt).getTime() : 0;

    if (cloudTime > localTime) {
      // Cloud is newer — pull cloud settings
      console.log("[cloudSync] Settings: cloud is newer — pulling");
      useUiStore.getState().setAppSettings({
        ...useUiStore.getState().appSettings,
        ...cloudResult.data,
      });
      cloudResult.data._savedAt = cloudResult.updated_at;
      await storage.set(idbKey("bldg-settings"), JSON.stringify(cloudResult.data));
    } else {
      // Local is newer or same — push to cloud
      await cloudSync.pushData("settings", localSettings);
    }
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

  // Both exist — union by id, then use timestamps to decide winner on conflicts
  if (localAsm && cloudResult?.data && Array.isArray(localAsm) && Array.isArray(cloudResult.data)) {
    const cloudTime = cloudResult.updated_at ? new Date(cloudResult.updated_at).getTime() : 0;
    const localMeta = localAsm._meta || {};
    const localTime = localMeta._savedAt ? new Date(localMeta._savedAt).getTime() : 0;

    const asmMap = new Map();
    if (cloudTime > localTime) {
      // Cloud newer — cloud wins on conflict
      for (const a of localAsm) if (a.id) asmMap.set(a.id, a);
      for (const a of cloudResult.data) if (a.id) asmMap.set(a.id, a);
    } else {
      // Local newer — local wins on conflict
      for (const a of cloudResult.data) if (a.id) asmMap.set(a.id, a);
      for (const a of localAsm) if (a.id) asmMap.set(a.id, a);
    }
    const merged = Array.from(asmMap.values());
    useDatabaseStore.getState().setAssemblies(merged);
    await storage.set(idbKey("bldg-assemblies"), JSON.stringify(merged));
    await cloudSync.pushData("assemblies", merged);
  } else if (localAsm) {
    await cloudSync.pushData("assemblies", localAsm);
  }
}

// ─── User Cost Library Sync ───────────────────────────────────────

async function syncUserElements() {
  const cloudResult = await cloudSync.pullDataWithMeta("user-elements");
  const localRaw = await storage.get(idbKey("bldg-user-elements"));
  let localEl = null;
  try {
    localEl = localRaw ? JSON.parse(localRaw.value) : null;
  } catch {
    localEl = null;
  }

  if (localEl && !cloudResult) {
    await cloudSync.pushData("user-elements", localEl);
    return;
  }

  if (!localEl && cloudResult) {
    if (Array.isArray(cloudResult.data)) {
      useDatabaseStore.getState().loadUserElements(cloudResult.data);
      await storage.set(idbKey("bldg-user-elements"), JSON.stringify(cloudResult.data));
    }
    return;
  }

  // Both exist — union by id, timestamps decide conflict winner
  if (localEl && cloudResult?.data && Array.isArray(localEl) && Array.isArray(cloudResult.data)) {
    const cloudTime = cloudResult.updated_at ? new Date(cloudResult.updated_at).getTime() : 0;
    const localMeta = localEl._meta || {};
    const localTime = localMeta._savedAt ? new Date(localMeta._savedAt).getTime() : 0;

    const elMap = new Map();
    if (cloudTime > localTime) {
      for (const e of localEl) if (e.id) elMap.set(e.id, e);
      for (const e of cloudResult.data) if (e.id) elMap.set(e.id, e); // cloud wins
    } else {
      for (const e of cloudResult.data) if (e.id) elMap.set(e.id, e);
      for (const e of localEl) if (e.id) elMap.set(e.id, e); // local wins
    }
    const merged = Array.from(elMap.values());
    useDatabaseStore.getState().loadUserElements(merged);
    await storage.set(idbKey("bldg-user-elements"), JSON.stringify(merged));
    await cloudSync.pushData("user-elements", merged);
  } else if (localEl) {
    await cloudSync.pushData("user-elements", localEl);
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

  // Both exist — union by id, timestamps decide conflict winner
  if (localTasks && cloudResult?.data && Array.isArray(localTasks) && Array.isArray(cloudResult.data)) {
    const cloudTime = cloudResult.updated_at ? new Date(cloudResult.updated_at).getTime() : 0;
    const localTime = localTasks._savedAt ? new Date(localTasks._savedAt).getTime() : 0;

    const taskMap = new Map();
    if (cloudTime > localTime) {
      // Cloud newer — cloud wins on conflict
      for (const t of localTasks) if (t.id) taskMap.set(t.id, t);
      for (const t of cloudResult.data) if (t.id) taskMap.set(t.id, t);
    } else {
      // Local newer — local wins on conflict
      for (const t of cloudResult.data) if (t.id) taskMap.set(t.id, t);
      for (const t of localTasks) if (t.id) taskMap.set(t.id, t);
    }
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

  // Load deleted IDs from BOTH IDB + localStorage to avoid re-pushing deleted estimates
  let deletedIds = [];
  try {
    const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
    const idbIds = delRaw ? JSON.parse(delRaw.value) : [];
    const lsKey = `bldg-deleted-ids-${useAuthStore.getState().user?.id || "anon"}`;
    const lsRaw = localStorage.getItem(lsKey);
    const lsIds = lsRaw ? JSON.parse(lsRaw) : [];
    deletedIds = [...new Set([...idbIds, ...lsIds])];
  } catch {
    /* ignore */
  }
  const deletedSet = new Set(deletedIds);

  console.log(`[cloudSync] Blob migration: checking ${index.length} estimates...`);
  let migrated = 0;

  for (const entry of index) {
    // Skip deleted estimates — pushEstimate could un-delete them
    if (deletedSet.has(entry.id)) continue;

    try {
      const localRecord = await cloudSync.readLocalEstimateRecord(entry.id);
      if (!localRecord.data) continue;

      const data = localRecord.data;
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
        try {
          await cloudSync.pushEstimate(entry.id, data);
        } catch (err) {
          markDirtyEstimate(entry.id);
          throw err;
        }
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
