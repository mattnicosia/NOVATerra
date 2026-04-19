import { useEffect, useRef } from "react";
import { storage } from "@/utils/storage";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore, migrateSubcontractorSchema } from "@/stores/masterDataStore";
import { useReportsStore } from "@/stores/reportsStore";
import { useUiStore } from "@/stores/uiStore";
import { useDiscoveryStore } from "@/stores/discoveryStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useTaskStore } from "@/stores/taskStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import * as cloudSync from "@/utils/cloudSync";
import { loadAudioMeta } from "@/utils/novaAudioStorage";
import { migrateIndexEntry, migrateProposal } from "@/utils/costHistoryMigration";
import { idbKey } from "@/utils/idbKey";
import { useAuthStore } from "@/stores/authStore";
import * as nova from "@/utils/novaLogger";
import { useOrgStore } from "@/stores/orgStore";
import { resetAllStores, loadUploadQueue, markDirtyEstimate } from "@/hooks/persistenceCleanup";
import { saveMasterData } from "@/hooks/persistenceGlobal";

// One-time migration: copy solo-mode IDB data into org-scoped keys.
// When a user creates/joins an org, the idbKey() namespace changes from
// `u-{userId}-bldg-*` to `org-{orgId}-bldg-*`, making all existing data
// invisible. This migration copies it forward so nothing is lost.
async function migrateSoloToOrg() {
  const userId = useAuthStore.getState().user?.id;
  const org = useOrgStore.getState().org;
  if (!userId || !org?.id) return; // Only needed in org mode

  const flag = `idb-solo-to-org-${userId}-${org.id}`;
  if (localStorage.getItem(flag)) return; // Already migrated

  const dataKeys = ["bldg-index", "bldg-master", "bldg-deleted-ids"];
  let migrated = 0;

  try {
    for (const key of dataKeys) {
      const soloKey = `u-${userId}-${key}`;
      const orgKey = `org-${org.id}-${key}`;

      // Only migrate if org key is empty AND solo key has data
      const orgData = await storage.get(orgKey);
      if (orgData) continue; // org already has data for this key

      const soloData = await storage.get(soloKey);
      if (soloData?.value) {
        await storage.set(orgKey, soloData.value);
        migrated++;
      }
    }

    // Also migrate individual estimate data blobs (bldg-est-{id})
    // The index was migrated above, but the actual estimate data blobs
    // are stored under separate keys that also need org-scoping.
    try {
      const _soloIndexKey = `u-${userId}-bldg-index`;
      const indexRaw = await storage.get(`org-${org.id}-bldg-index`);
      const indexData = indexRaw?.value ? JSON.parse(indexRaw.value) : null;
      if (Array.isArray(indexData)) {
        for (const est of indexData) {
          if (!est.id) continue;
          const orgEstKey = `org-${org.id}-bldg-est-${est.id}`;
          const orgEst = await storage.get(orgEstKey);
          if (orgEst) continue; // already exists in org scope

          const soloEstKey = `u-${userId}-bldg-est-${est.id}`;
          const soloEst = await storage.get(soloEstKey);
          if (soloEst?.value) {
            await storage.set(orgEstKey, soloEst.value);
            migrated++;
          }
        }
      }
    } catch (estErr) {
      console.warn("[migration] Estimate blob migration failed:", estErr);
    }

    if (migrated > 0) {
      console.log(`[migration] Copied ${migrated} solo-mode IDB keys → org-${org.id.slice(0, 8)}`);
    }
  } catch (err) {
    console.warn("[migration] Solo→org IDB migration failed:", err);
  }
  localStorage.setItem(flag, "1");
}

// One-time migration: rename bare `bldg-*` keys to `u-{userId}-bldg-*`
// so different users on the same browser have isolated IndexedDB data.
async function migrateIdbKeysForUser() {
  const userId = useAuthStore.getState().user?.id;
  const org = useOrgStore.getState().org;
  if (!userId || org?.id) return; // Only needed in solo mode (org mode already prefixed)
  const flag = `idb-user-ns-${userId}`;
  if (localStorage.getItem(flag)) return; // Already migrated

  try {
    const allKeys = await storage.keys();
    // Find bare bldg-* keys (not already prefixed with u- or org-)
    const bareKeys = allKeys.filter(
      k => typeof k === "string" && k.startsWith("bldg-") && k !== "bldg-settings", // settings stay unprefixed
    );
    if (bareKeys.length === 0) {
      localStorage.setItem(flag, "1");
      return;
    }

    console.log(`[migration] Renaming ${bareKeys.length} bare IDB keys to u-${userId.slice(0, 8)}-*`);
    for (const oldKey of bareKeys) {
      const newKey = `u-${userId}-${oldKey}`;
      // Only migrate if new key doesn't already exist
      const existing = await storage.get(newKey);
      if (!existing) {
        const old = await storage.get(oldKey);
        if (old) {
          await storage.set(newKey, old.value);
        }
      }
      // Delete old bare key so other users don't see it
      await storage.delete(oldKey);
    }
    console.log("[migration] IDB key namespacing complete");
  } catch (err) {
    console.warn("[migration] IDB key namespacing failed:", err);
  }
  localStorage.setItem(flag, "1");
}

// resetAllStores — extracted to @/hooks/persistenceCleanup (re-exported below)

// Load all persisted data on mount
export function usePersistenceLoad() {
  const loaded = useRef(false);
  const orgReady = useOrgStore(s => s.orgReady);

  useEffect(() => {
    if (loaded.current) return;
    if (!orgReady) return; // Wait for org fetch to resolve before reading org-scoped keys
    loaded.current = true;

    (async () => {
      // ── User-switch detection: MUST run before loading any data ──
      // If a different user signed in without the previous user signing out,
      // clear all local stores and IndexedDB so the new user starts clean.
      const currentUserId = useAuthStore.getState().user?.id;
      if (currentUserId) {
        const lastUserRaw = await storage.get("bldg-last-user");
        const lastUserId = lastUserRaw?.value || null;
        if (lastUserId && lastUserId !== currentUserId) {
          console.log("[usePersistence] User switch detected BEFORE load — clearing stale data");
          resetAllStores();
          await storage.clearAll();
        }
        await storage.set("bldg-last-user", currentUserId);
      }

      // Migrate bare IDB keys to user-namespaced keys (one-time, solo mode only)
      await migrateIdbKeysForUser();

      // Migrate solo-mode data to org-scoped keys (one-time, on first org load)
      await migrateSoloToOrg();

      // ── Startup Diagnostics ──
      const _orgState = useOrgStore.getState();
      const _activeKey = idbKey("bldg-index");
      const _lastOrgId = localStorage.getItem("bldg-last-org-id");
      console.log(`[usePersistence] ── BOOT DIAGNOSTIC ──`);
      console.log(`  userId: ${currentUserId || "(none)"}`);
      console.log(`  orgId: ${_orgState.org?.id || "(none)"} | orgReady: ${_orgState.orgReady}`);
      console.log(`  lastKnownOrgId: ${_lastOrgId || "(none)"}`);
      console.log(`  IDB key for index: "${_activeKey}"`);
      console.log(`  localStorage mirror exists: ${!!localStorage.getItem(`bldg-index-mirror-${currentUserId}`)}`);

      // Persist org ID for recovery (survives IDB eviction and org fetch failures)
      if (_orgState.org?.id) {
        try {
          localStorage.setItem("bldg-last-org-id", _orgState.org.id);
        } catch {
          /* localStorage unavailable */
        }
      } else if (!_lastOrgId && currentUserId) {
        // First time with this code — try to discover org from IDB key scan
        // Look for any org-prefixed keys in IDB to discover the org ID
        try {
          const allKeys = await storage.keys();
          const orgKeyMatch = (allKeys || []).find(k => k.startsWith("org-") && k.includes("-bldg-index"));
          if (orgKeyMatch) {
            const discoveredOrgId = orgKeyMatch.replace("org-", "").replace("-bldg-index", "");
            console.log(`[usePersistence] Discovered org ID from IDB keys: ${discoveredOrgId.slice(0, 8)}...`);
            localStorage.setItem("bldg-last-org-id", discoveredOrgId);
          }
        } catch {
          /* ignore */
        }
      }

      let localHasIndex = false; // Track separately — master data should NOT prevent index cloud pull
      let hadCorruptedIndex = false;
      let hadCorruptedMaster = false;

      // Load estimates index
      const idxRaw = await storage.get(idbKey("bldg-index"));
      console.log(
        `[usePersistence]   IDB index raw: ${idxRaw ? `${String(idxRaw.value).length} chars` : "NULL (not found)"}`,
      );
      if (idxRaw) {
        try {
          // Defensive: validate value is a non-empty string before parsing
          if (!idxRaw.value || typeof idxRaw.value !== "string" || idxRaw.value.trim().length === 0) {
            throw new Error("Empty or invalid index data in IndexedDB");
          }
          const parsed = JSON.parse(idxRaw.value);
          if (!Array.isArray(parsed)) throw new Error("Index data is not an array");
          console.log(`[usePersistence]   Loaded ${parsed.length} estimates from IDB`);
          // Migrate: ensure all index entries have companyProfileId
          let migrated = parsed.map(e => (e.companyProfileId === undefined ? { ...e, companyProfileId: "" } : e));
          // Migrate: two-axis taxonomy (buildingType, workType) + new fields
          migrated = migrated.map(migrateIndexEntry);

          // ── Filter out deleted estimates BEFORE restoring ──
          // This prevents zombie resurrection when IDB still has stale index entries
          let deletedSet = new Set();
          try {
            const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
            let delIds = delRaw ? JSON.parse(delRaw.value) : [];
            // Merge localStorage backup (survives IDB clears)
            const userId = useAuthStore.getState().user?.id;
            const orgId = useOrgStore.getState().org?.id || "solo";
            const lsKey = `bldg-deleted-ids-${userId || "anon"}-${orgId}`;
            const lsRaw = localStorage.getItem(lsKey);
            if (lsRaw) {
              const lsIds = JSON.parse(lsRaw);
              for (const id of lsIds) {
                if (!delIds.includes(id)) delIds.push(id);
              }
            }
            deletedSet = new Set(delIds);
            // Hydrate the in-memory zombie guard so ALL future setEstimatesIndex
            // calls are automatically filtered — nuclear defense against resurrection.
            const { hydrateDeletedIds } = await import("@/stores/estimatesStore");
            hydrateDeletedIds(delIds);
          } catch {
            /* proceed without filter if read fails */
          }

          const beforeCount = migrated.length;
          if (deletedSet.size > 0) {
            migrated = migrated.filter(e => !deletedSet.has(e.id));
          }
          if (migrated.length < beforeCount) {
            console.log(
              `[usePersistence]   Filtered ${beforeCount - migrated.length} deleted estimates from IDB index`,
            );
          }

          useEstimatesStore.getState().setEstimatesIndex(migrated);
          if (migrated.some((e, i) => e !== parsed[i]) || migrated.length < beforeCount) {
            await storage.set(idbKey("bldg-index"), JSON.stringify(migrated));
          }
          if (migrated.length > 0) {
            localHasIndex = true;
          }
        } catch (err) {
          console.error("[usePersistence] Failed to parse estimates index:", err);
          hadCorruptedIndex = true;
          await storage.delete(idbKey("bldg-index")); // Clear corrupted data so cloud sync can recover
        }
      }

      // ─── ALWAYS reconcile local index against authoritative table (cross-device sync) ───
      // Two fixes over the previous impl that was causing duplicate resurrections:
      //   1. Use pullEstimatesIndex() (normalized columns, filters deleted_at) as source of
      //      truth instead of pullData("index") (stale JSONB blob that never gets cleaned).
      //   2. REMOVE locally-cached entries that are soft-deleted in the authoritative table.
      //      Previous merge only ADDED, so once a stale ID landed locally it lived forever.
      if (localHasIndex) {
        try {
          const [cloudLive, cloudDeletedIds] = await Promise.all([
            cloudSync.pullEstimatesIndex(),
            cloudSync.pullDeletedEstimateIds(),
          ]);

          // Load locally-tracked deleted IDs (persisted + localStorage mirror)
          let deletedIds = [];
          try {
            const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
            deletedIds = delRaw ? JSON.parse(delRaw.value) : [];
            const userId = useAuthStore.getState().user?.id;
            const orgId2 = useOrgStore.getState().org?.id || "solo";
            const lsRaw = localStorage.getItem(`bldg-deleted-ids-${userId || "anon"}-${orgId2}`);
            if (lsRaw) { for (const id of JSON.parse(lsRaw)) { if (!deletedIds.includes(id)) deletedIds.push(id); } }
          } catch { /* ignore */ }
          // Merge cloud-side deleted IDs into the local deleted-set
          for (const id of cloudDeletedIds || []) {
            if (!deletedIds.includes(id)) deletedIds.push(id);
          }
          const deletedSet = new Set(deletedIds);

          const localIndex = useEstimatesStore.getState().estimatesIndex;
          const localIds = new Set(localIndex.map(e => e.id));
          const cloudLiveArr = Array.isArray(cloudLive) ? cloudLive : [];
          const cloudLiveIds = new Set(cloudLiveArr.map(e => e.id));

          // 1) Remove any local entry that the cloud says is deleted
          const purgedIds = [];
          const filteredLocal = localIndex.filter(e => {
            if (deletedSet.has(e.id)) {
              purgedIds.push(e.id);
              return false;
            }
            return true;
          });

          // 2) Add any cloud-live entry missing locally
          const newEntries = [];
          for (const cloudEntry of cloudLiveArr) {
            if (deletedSet.has(cloudEntry.id)) continue;
            if (!localIds.has(cloudEntry.id)) newEntries.push(cloudEntry);
          }

          const indexChanged = purgedIds.length > 0 || newEntries.length > 0;
          if (indexChanged) {
            const combined = [...filteredLocal, ...newEntries];
            const dedupMap = new Map();
            for (const e of combined) { if (e?.id) dedupMap.set(e.id, e); }
            const finalIndex = [...dedupMap.values()];
            useEstimatesStore.getState().setEstimatesIndex(finalIndex);
            await storage.set(idbKey("bldg-index"), JSON.stringify(finalIndex));
            console.log(
              `[usePersistence] Cloud reconcile: +${newEntries.length} added, -${purgedIds.length} purged (cloud-deleted)`,
              purgedIds.length > 0 ? { purgedIds } : "",
            );

            // Persist expanded deleted-IDs set so they stay filtered across devices
            try { await storage.set(idbKey("bldg-deleted-ids"), JSON.stringify([...deletedSet])); } catch { /* ignore */ }

            // Also clean up the per-estimate IDB cache for purged IDs
            for (const id of purgedIds) {
              try { await storage.delete(idbKey(`bldg-est-${id}`)); } catch { /* ignore */ }
            }

            // Pull data blobs for newly added entries
            for (const entry of newEntries) {
              try {
                const estData = await cloudSync.pullEstimate(entry.id);
                if (estData) {
                  const hydrated = await cloudSync.hydrateBlobs(estData).catch(() => estData);
                  await storage.set(idbKey(`bldg-est-${entry.id}`), JSON.stringify(hydrated));
                }
              } catch (blobErr) {
                console.warn(`[usePersistence] Cloud reconcile: failed to pull data for ${entry.id}:`, blobErr.message);
              }
            }
          }
          void cloudLiveIds; // keep reference in case future code needs it
        } catch (mergeErr) {
          console.warn("[usePersistence] Cloud index reconcile failed (non-critical):", mergeErr.message);
        }
      }

      // Load master data
      const masterRaw = await storage.get(idbKey("bldg-master"));
      if (masterRaw) {
        try {
          // Defensive: validate value is a non-empty string before parsing
          if (!masterRaw.value || typeof masterRaw.value !== "string" || masterRaw.value.trim().length === 0) {
            throw new Error("Empty or invalid master data in IndexedDB");
          }
          const master = JSON.parse(masterRaw.value);
          if (typeof master !== "object" || master === null || Array.isArray(master)) {
            throw new Error("Master data is not a valid object");
          }
          // Migrate: two-axis taxonomy for historical proposals
          if (Array.isArray(master.historicalProposals)) {
            const before = master.historicalProposals;
            master.historicalProposals = before.map(migrateProposal);
            if (master.historicalProposals.some((p, i) => p !== before[i])) {
              await storage.set(idbKey("bldg-master"), JSON.stringify(master));
            }
          }
          // Migrate: subcontractor trade (string) → trades (string[]) + prequal fields
          const migratedMaster = migrateSubcontractorSchema(master);
          if (migratedMaster !== master) {
            Object.assign(master, migratedMaster);
            await storage.set(idbKey("bldg-master"), JSON.stringify(master));
          }
          useMasterDataStore.getState().setMasterData({
            ...useMasterDataStore.getState().masterData,
            ...master,
          });
        } catch (err) {
          console.error("[usePersistence] Failed to parse master data:", err);
          hadCorruptedMaster = true;
          await storage.delete(idbKey("bldg-master")); // Clear corrupted data so cloud sync can recover
        }
      }

      // Load app settings (user-scoped via idbKey)
      const settingsRaw = await storage.get(idbKey("bldg-settings"));
      if (settingsRaw) {
        try {
          if (!settingsRaw.value || typeof settingsRaw.value !== "string" || settingsRaw.value.trim().length === 0) {
            throw new Error("Empty or invalid settings value");
          }
          const settings = JSON.parse(settingsRaw.value);
          useUiStore.getState().setAppSettings({
            ...useUiStore.getState().appSettings,
            ...settings,
          });
        } catch (err) {
          console.error("[usePersistence] Failed to parse settings:", err);
          await storage.delete(idbKey("bldg-settings")); // Clear corrupted data so cloud sync can recover
        }
      }
      // Migrate: ensure defaultMarkupOrder has all standard keys and `active` field
      {
        const as = useUiStore.getState().appSettings;
        const saved = as.defaultMarkupOrder || [];
        const savedKeys = new Set(saved.map(m => m.key));
        const missing = DEFAULT_MARKUP_ORDER.filter(m => !savedKeys.has(m.key));
        // Pre-launch: entries missing `active` default to false (user picks their own)
        const merged = [...saved.map(m => ({ ...m, active: m.active !== undefined ? m.active : false })), ...missing];
        if (missing.length > 0 || saved.some(m => m.active === undefined)) {
          useUiStore.getState().updateSetting("defaultMarkupOrder", merged);
        }
        // Also ensure defaultMarkup has overheadAndProfit key
        if (as.defaultMarkup && as.defaultMarkup.overheadAndProfit === undefined) {
          useUiStore.getState().updateSetting("defaultMarkup.overheadAndProfit", 20);
        }
      }

      // Load assemblies (global library)
      const asmRaw = await storage.get(idbKey("bldg-assemblies"));
      if (asmRaw) {
        try {
          if (!asmRaw.value || typeof asmRaw.value !== "string" || asmRaw.value.trim().length === 0) {
            throw new Error("Empty or invalid assemblies value");
          }
          useDatabaseStore.getState().setAssemblies(JSON.parse(asmRaw.value));
        } catch (err) {
          console.error("[usePersistence] Failed to parse assemblies:", err);
          await storage.delete(idbKey("bldg-assemblies")); // Clear corrupted data so cloud sync can recover
        }
      }

      // Load user cost library (global, like assemblies)
      const userElRaw = await storage.get(idbKey("bldg-user-elements"));
      if (userElRaw) {
        try {
          if (!userElRaw.value || typeof userElRaw.value !== "string" || userElRaw.value.trim().length === 0) {
            throw new Error("Empty or invalid user cost library value");
          }
          useDatabaseStore.getState().loadUserElements(JSON.parse(userElRaw.value));
        } catch (err) {
          console.error("[usePersistence] Failed to parse user cost library:", err);
          await storage.delete(idbKey("bldg-user-elements"));
        }
      }

      // Load calendar tasks
      const calRaw = await storage.get(idbKey("bldg-calendar"));
      if (calRaw) {
        try {
          const tasks = JSON.parse(calRaw.value);
          if (Array.isArray(tasks)) useCalendarStore.getState().setTasks(tasks);
        } catch (err) {
          console.error("[usePersistence] Failed to parse calendar:", err);
          await storage.delete(idbKey("bldg-calendar"));
        }
      }

      // Load tasks
      const taskRaw = await storage.get(idbKey("bldg-tasks"));
      if (taskRaw) {
        try {
          const tasks = JSON.parse(taskRaw.value);
          if (Array.isArray(tasks)) useTaskStore.getState().setTasks(tasks);
        } catch (err) {
          console.error("[usePersistence] Failed to parse tasks:", err);
          await storage.delete(idbKey("bldg-tasks"));
        }
      }

      // Load auto-response config
      const arConfigRaw = await storage.get(idbKey("bldg-auto-response-config"));
      if (arConfigRaw?.value) {
        try {
          const config = JSON.parse(arConfigRaw.value);
          if (config && typeof config === "object") {
            // Merge with defaults so new triggers get default values
            const current = useCollaborationStore.getState().triggerConfig;
            useCollaborationStore.getState().setTriggerConfig({ ...current, ...config });
          }
        } catch (err) {
          console.warn("[usePersistence] Failed to parse auto-response config:", err);
        }
      }

      // Load auto-response drafts
      const arDraftsRaw = await storage.get(idbKey("bldg-auto-response-drafts"));
      if (arDraftsRaw?.value) {
        try {
          const drafts = JSON.parse(arDraftsRaw.value);
          if (Array.isArray(drafts)) {
            useCollaborationStore.getState().setDrafts(drafts);
          }
        } catch (err) {
          console.warn("[usePersistence] Failed to parse auto-response drafts:", err);
        }
      }

      // Load bid package presets
      const bpPresetsRaw = await storage.get(idbKey("bldg-bid-package-presets"));
      if (bpPresetsRaw?.value) {
        try {
          const presets = JSON.parse(bpPresetsRaw.value);
          if (Array.isArray(presets)) {
            useBidManagementStore.getState().setBidPackagePresets(presets);
          }
        } catch (err) {
          console.warn("[usePersistence] Failed to parse bid package presets:", err);
        }
      }

      // Load subdivision engine config (global)
      const subConfigRaw = await storage.get(idbKey("bldg-subdivision-config"));
      if (subConfigRaw?.value) {
        try {
          const subConfig = JSON.parse(subConfigRaw.value);
          if (subConfig.engineConfig) useSubdivisionStore.getState().updateEngineConfig(subConfig.engineConfig);
          if (subConfig.calibrationFactors)
            useSubdivisionStore.getState().setCalibrationFactors(subConfig.calibrationFactors);
          if (subConfig.userOverrides)
            useSubdivisionStore.getState().setUserOverrides(subConfig.userOverrides);
        } catch (err) {
          console.warn("[usePersistence] Failed to parse subdivision config:", err);
        }
      } else {
        // Cloud pull fallback — same pattern as masterData
        try {
          const cloudSubConfig = await cloudSync.pullData("subdivisionConfig");
          if (cloudSubConfig) {
            if (cloudSubConfig.engineConfig)
              useSubdivisionStore.getState().updateEngineConfig(cloudSubConfig.engineConfig);
            if (cloudSubConfig.calibrationFactors)
              useSubdivisionStore.getState().setCalibrationFactors(cloudSubConfig.calibrationFactors);
            if (cloudSubConfig.userOverrides)
              useSubdivisionStore.getState().setUserOverrides(cloudSubConfig.userOverrides);
            await storage.set(idbKey("bldg-subdivision-config"), JSON.stringify(cloudSubConfig));
          }
        } catch (err) {
          console.warn("[usePersistence] Cloud pull for subdivision config failed:", err);
        }
      }

      // Load proposal templates
      await useReportsStore.getState().loadTemplatesFromStorage();

      // Load scan learning records (global)
      await useDrawingPipelineStore.getState().loadLearningRecords();
      await useDrawingPipelineStore.getState().loadParameterCorrections();

      // Load cached symbol legends
      try {
        await useDrawingPipelineStore.getState().loadLegends();
      } catch { /* legend store non-critical */ }

      // Load PDF upload queue (resumes pending extractions)
      await loadUploadQueue();

      // ─── Cloud Pull: if local INDEX is empty or corrupted, try pulling from cloud ───
      // Use localHasIndex (not localHasData) — master data alone should NOT prevent index recovery.
      if (!localHasIndex) {
        let recoveredFromCloud = false;
        try {
          // Load deleted IDs — merge IndexedDB + localStorage backup
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
            const orgId3 = useOrgStore.getState().org?.id || "solo";
            const lsKey = `bldg-deleted-ids-${userId || "anon"}-${orgId3}`;
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

          // Pull estimates index — PRIMARY: query user_estimates normalized columns.
          // This is the authoritative source. No index blob involved.
          let cloudIndex = await cloudSync.pullEstimatesIndex();
          if (cloudIndex && cloudIndex.length > 0) {
            console.log(`[usePersistence] Loaded ${cloudIndex.length} estimates from normalized columns`);
          }

          // No legacy blob fallback. If pullEstimatesIndex() returns empty, the user
          // genuinely has no live estimates — or there's a transient DB error and we'd
          // rather show nothing than resurrect stale entries from a frozen JSONB blob.
          // Previous fallback to pullData("index") was the source of the deleted-estimate
          // resurrection bug (blob never gets cleaned when rows are soft-deleted).

          if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
            // Filter out locally-deleted estimates before restoring
            const filteredIndex = deletedSet.size > 0 ? cloudIndex.filter(e => !deletedSet.has(e.id)) : cloudIndex;
            // Dedup by ID before persisting — prevents duplicate dashboard entries
            const dedupMap2 = new Map();
            for (const e of filteredIndex) { if (e?.id) dedupMap2.set(e.id, e); }
            const dedupedCloud = [...dedupMap2.values()];
            useEstimatesStore.getState().setEstimatesIndex(dedupedCloud);
            await storage.set(idbKey("bldg-index"), JSON.stringify(dedupedCloud));
            // Immediately mirror to localStorage — most resilient backup
            try {
              if (currentUserId && filteredIndex.length > 0) {
                localStorage.setItem(`bldg-index-mirror-${currentUserId}`, JSON.stringify(filteredIndex));
              }
            } catch {
              /* ignore */
            }
            if (hadCorruptedIndex) recoveredFromCloud = true;

            // Pull all estimates, hydrate blobs, then cache locally (skip deleted)
            const lastOrgFallback = localStorage.getItem("bldg-last-org-id");
            let cloudEstimates;
            if (useOrgStore.getState().org) {
              cloudEstimates = await cloudSync.pullAllEstimates();
            } else if (lastOrgFallback) {
              cloudEstimates = await cloudSync.pullAllEstimatesWithOrgId(lastOrgFallback);
            } else {
              cloudEstimates = await cloudSync.pullAllEstimatesAnyScope();
            }
            for (const ce of cloudEstimates) {
              if (deletedSet.has(ce.estimate_id)) continue;
              let estData = ce.data;
              try {
                estData = await cloudSync.hydrateBlobs(ce.data);
              } catch {
                /* blob hydration failed — use raw data */
              }
              await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
            }
          } else if (useOrgStore.getState().org) {
            // ── ORG MODE: Index is empty but user may have ASSIGNED estimates ──
            // Pull estimates directly from user_estimates (RLS filters by visibility/assignment).
            // Build index entries from the pulled estimate data so they appear in the UI.
            console.log("[usePersistence] Index empty in org mode — pulling assigned estimates from cloud...");
            let cloudEstimates;
            try {
              cloudEstimates = await cloudSync.pullAllEstimates();
            } catch {
              cloudEstimates = [];
            }
            if (cloudEstimates && cloudEstimates.length > 0) {
              console.log(`[usePersistence] Found ${cloudEstimates.length} assigned estimate(s) — building index`);
              const builtIndex = [];
              for (const ce of cloudEstimates) {
                if (deletedSet.has(ce.estimate_id)) continue;
                let estData = ce.data;
                try {
                  estData = await cloudSync.hydrateBlobs(ce.data);
                } catch { /* use raw */ }
                await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
                // Build an index entry from the estimate data
                const proj = estData?.project || {};
                builtIndex.push({
                  id: ce.estimate_id,
                  name: proj.name || "Untitled",
                  estimateNumber: proj.estimateNumber || "",
                  client: proj.client || "",
                  status: proj.status || "Bidding",
                  bidDue: proj.bidDue || "",
                  startDate: proj.startDate || "",
                  estimatedHours: proj.estimatedHours || 0,
                  grandTotal: proj.grandTotal || 0,
                  elementCount: proj.elementCount || 0,
                  lastModified: proj.lastModified || new Date().toISOString(),
                  estimator: proj.estimator || "",
                  coEstimators: proj.coEstimators || [],
                  jobType: proj.jobType || "",
                  companyProfileId: proj.companyProfileId || "",
                  buildingType: proj.buildingType || "",
                  workType: proj.workType || "",
                  architect: proj.architect || "",
                  engineer: proj.engineer || "",
                  projectSF: proj.projectSF || 0,
                  zipCode: proj.zipCode || "",
                  address: proj.address || "",
                  description: proj.description || "",
                  bidDueTime: proj.bidDueTime || "",
                  bidType: proj.bidType || "",
                  bidDelivery: proj.bidDelivery || "",
                  bidRequirements: proj.bidRequirements || {},
                  walkthroughDate: proj.walkthroughDate || "",
                  rfiDueDate: proj.rfiDueDate || "",
                  date: proj.date || "",
                  ownerId: ce.user_id || "",
                  orgId: useOrgStore.getState().org?.id || "",
                  assignedTo: proj.assignedTo || [],
                  visibility: proj.visibility || "assigned",
                });
              }
              if (builtIndex.length > 0) {
                useEstimatesStore.getState().setEstimatesIndex(builtIndex);
                await storage.set(idbKey("bldg-index"), JSON.stringify(builtIndex));
                try {
                  localStorage.setItem(`bldg-index-mirror-${currentUserId}`, JSON.stringify(builtIndex));
                } catch { /* ignore */ }
              }
            }
          }

          // Pull master data — try org row first, fall back to solo row if org is empty
          let cloudMaster = await cloudSync.pullData("master");

          // If org pull returned empty/default data, check the solo row (pre-org data)
          const activeOrgId = useOrgStore?.getState?.()?.orgId;
          if (activeOrgId && cloudMaster) {
            const hasContent = cloudMaster.companyProfiles?.length > 0 ||
              cloudMaster.clients?.length > 0 || cloudMaster.subcontractors?.length > 0;
            if (!hasContent) {
              console.log("[usePersistence] Org master data empty — checking solo row for migration");
              const soloMaster = await cloudSync.pullDataWithOrgId("master", null);
              if (soloMaster) {
                const soloHasContent = soloMaster.companyProfiles?.length > 0 ||
                  soloMaster.clients?.length > 0 || soloMaster.subcontractors?.length > 0;
                if (soloHasContent) {
                  console.log("[usePersistence] Found rich solo data — migrating to org row");
                  cloudMaster = soloMaster;
                  // Push the solo data to org row so future pulls find it
                  cloudSync.pushData("master", soloMaster).catch(() => {});
                }
              }
            }
          }

          if (cloudMaster) {
            // Merge cloud data into local store — protect arrays from empty-clobber.
            // Shallow spread replaces arrays entirely, so cloud returning [] kills local data.
            // Rule: for array fields, keep the longer (richer) version; for objects, cloud wins.
            const localMaster = useMasterDataStore.getState().masterData;
            const merged = { ...localMaster, ...cloudMaster };

            // Protect all array fields — keep the version with more data
            const arrayFields = [
              "companyProfiles", "clients", "architects", "engineers",
              "estimators", "subcontractors", "historicalProposals",
            ];
            for (const key of arrayFields) {
              const local = localMaster[key] || [];
              const cloud = cloudMaster[key] || [];
              if (key === "historicalProposals") {
                // Merge by ID — keep both, cloud wins on duplicates
                const byId = new Map();
                local.forEach(p => byId.set(p.id || p.projectName, p));
                cloud.forEach(p => byId.set(p.id || p.projectName, p));
                merged[key] = Array.from(byId.values());
              } else {
                // For other arrays: keep the longer version (don't clobber with empty)
                // If both have data, cloud wins (it's the cross-device source of truth)
                if (cloud.length === 0 && local.length > 0) {
                  merged[key] = local;
                } else {
                  merged[key] = cloud.length > 0 ? cloud : local;
                }
              }
            }

            if (localMaster.historicalProposals?.length > 0 || cloudMaster.historicalProposals?.length > 0) {
              console.log(`[usePersistence] Master merge: ${(localMaster.historicalProposals||[]).length} local + ${(cloudMaster.historicalProposals||[]).length} cloud → ${merged.historicalProposals.length} merged proposals`);
            }

            useMasterDataStore.getState().setMasterData(merged);
            // Save the MERGED state to IDB, not just cloudMaster
            await storage.set(idbKey("bldg-master"), JSON.stringify(merged));
            if (hadCorruptedMaster) recoveredFromCloud = true;
          }

          // Pull settings — cloud version merges into local (preserves local-only keys like widgetLayouts)
          const cloudSettings = await cloudSync.pullData("settings");
          if (cloudSettings) {
            const merged = {
              ...useUiStore.getState().appSettings,
              ...cloudSettings,
            };
            useUiStore.getState().setAppSettings(merged);
            // Save MERGED settings to IDB — not just cloud.
            // Raw cloudSettings may be missing local-only keys (widgetLayouts, etc.)
            await storage.set(idbKey("bldg-settings"), JSON.stringify(merged));
          }
          // Gate: allow auto-save to push settings to cloud now that we've pulled
          useUiStore.getState().setCloudSettingsLoaded(true);

          // Pull assemblies
          const cloudAsm = await cloudSync.pullData("assemblies");
          if (cloudAsm && Array.isArray(cloudAsm)) {
            useDatabaseStore.getState().setAssemblies(cloudAsm);
            await storage.set(idbKey("bldg-assemblies"), JSON.stringify(cloudAsm));
          }
        } catch (err) {
          console.warn("[usePersistence] Cloud pull failed:", err);
        }

        // Only show error toast if data was corrupted AND cloud recovery didn't help
        if ((hadCorruptedIndex || hadCorruptedMaster) && !recoveredFromCloud) {
          const what = [hadCorruptedIndex && "estimates", hadCorruptedMaster && "company data"]
            .filter(Boolean)
            .join(" and ");
          useUiStore.getState().showToast(`Failed to load ${what} — please check your connection`, "error");
        } else if (recoveredFromCloud) {
          console.log("[usePersistence] Recovered corrupted local data from cloud successfully");
        }
      }

      // Load NOVA custom audio metadata
      try {
        await loadAudioMeta();
      } catch {
        /* audio not critical */
      }

      // ─── RECOVERY GUARD: Last-resort fallback if index is still empty ───
      // Catches namespace mismatches, IDB eviction, and silent failures.
      // Tries: (1) all possible IDB key namespaces, (2) localStorage mirror, (3) cloud pull.
      // IMPORTANT: All recovery paths filter against deleted IDs to prevent zombie resurrection.
      const finalIndex = useEstimatesStore.getState().estimatesIndex;
      if (finalIndex.length === 0 && currentUserId) {
        console.warn(
          "[usePersistence] RECOVERY GUARD: estimates index is EMPTY after load — attempting fallback recovery",
        );

        // Build deleted-IDs set from all available sources (IDB + localStorage)
        let recoveryDeletedIds = [];
        try {
          const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
          if (delRaw?.value) recoveryDeletedIds = JSON.parse(delRaw.value);
        } catch {
          /* ignore */
        }
        try {
          const orgId4 = useOrgStore.getState().org?.id || "solo";
          const lsKey = `bldg-deleted-ids-${currentUserId}-${orgId4}`;
          const lsRaw = localStorage.getItem(lsKey);
          if (lsRaw) {
            for (const id of JSON.parse(lsRaw)) {
              if (!recoveryDeletedIds.includes(id)) recoveryDeletedIds.push(id);
            }
          }
        } catch {
          /* ignore */
        }
        const recoveryDeletedSet = new Set(recoveryDeletedIds);

        // 1. Try reading from all possible IDB key namespaces
        const orgId = useOrgStore.getState().org?.id;
        const lastKnownOrgId = localStorage.getItem("bldg-last-org-id");
        const possibleKeys = [
          `u-${currentUserId}-bldg-index`,
          orgId ? `org-${orgId}-bldg-index` : null,
          // Also try last-known org key (handles org fetch failure case)
          lastKnownOrgId && lastKnownOrgId !== orgId ? `org-${lastKnownOrgId}-bldg-index` : null,
          "bldg-index", // bare key (pre-migration)
        ].filter(Boolean);
        const activeKey = idbKey("bldg-index");
        console.log(`[usePersistence] Active IDB key: "${activeKey}" — scanning fallback keys:`, possibleKeys);

        let recovered = null;
        for (const key of possibleKeys) {
          if (key === activeKey) continue; // already tried this
          try {
            const raw = await storage.get(key);
            if (raw?.value) {
              const parsed = JSON.parse(raw.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Filter out deleted estimates before recovering
                const filtered =
                  recoveryDeletedSet.size > 0 ? parsed.filter(e => !recoveryDeletedSet.has(e.id)) : parsed;
                if (filtered.length > 0) {
                  console.log(
                    `[usePersistence] RECOVERED ${filtered.length} estimates from fallback key "${key}" (${parsed.length - filtered.length} deleted filtered)`,
                  );
                  recovered = filtered;
                  await storage.set(activeKey, JSON.stringify(filtered));
                  break;
                }
              }
            }
          } catch (err) {
            console.warn(`[usePersistence] Fallback key "${key}" failed:`, err);
          }
        }

        // 2. Try localStorage mirror
        if (!recovered) {
          try {
            const lsMirror = localStorage.getItem(`bldg-index-mirror-${currentUserId}`);
            if (lsMirror) {
              const parsed = JSON.parse(lsMirror);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const filtered =
                  recoveryDeletedSet.size > 0 ? parsed.filter(e => !recoveryDeletedSet.has(e.id)) : parsed;
                if (filtered.length > 0) {
                  console.log(
                    `[usePersistence] RECOVERED ${filtered.length} estimates from localStorage mirror (${parsed.length - filtered.length} deleted filtered)`,
                  );
                  recovered = filtered;
                  await storage.set(activeKey, JSON.stringify(filtered));
                }
              }
            }
          } catch (err) {
            console.warn("[usePersistence] localStorage mirror recovery failed:", err);
          }
        }

        // 3. Try cloud pull — normalized columns are the only authoritative source.
        // Previous recovery path pulled the legacy JSONB "index" blob which is never
        // cleaned when rows are soft-deleted → resurrected deleted estimates.
        if (!recovered) {
          try {
            let cloudIndex = await cloudSync.pullEstimatesIndex();
            if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
              const filtered =
                recoveryDeletedSet.size > 0 ? cloudIndex.filter(e => !recoveryDeletedSet.has(e.id)) : cloudIndex;
              if (filtered.length > 0) {
                console.log(
                  `[usePersistence] RECOVERED ${filtered.length} estimates from cloud index (${cloudIndex.length - filtered.length} deleted filtered)`,
                );
                recovered = filtered;
                await storage.set(activeKey, JSON.stringify(filtered));
                // Pull estimates — scope-blind as ultimate fallback
                const lastOrgFb = localStorage.getItem("bldg-last-org-id");
                let cloudEstimates;
                if (useOrgStore.getState().org) {
                  cloudEstimates = await cloudSync.pullAllEstimates();
                } else if (lastOrgFb) {
                  cloudEstimates = await cloudSync.pullAllEstimatesWithOrgId(lastOrgFb);
                } else {
                  cloudEstimates = await cloudSync.pullAllEstimatesAnyScope();
                }
                for (const ce of cloudEstimates) {
                  if (recoveryDeletedSet.has(ce.estimate_id)) continue;
                  let estData = ce.data;
                  try {
                    estData = await cloudSync.hydrateBlobs(ce.data);
                  } catch {
                    /* blob hydration failed — use raw data */
                  }
                  await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
                }
              }
            }
          } catch (err) {
            console.warn("[usePersistence] Cloud index recovery failed:", err);
          }
        }

        // 4. Nuclear recovery: rebuild index from individual user_estimates rows
        // Even if the cloud index was wiped, individual estimate rows survive
        // (they use soft-delete with deleted_at, never hard-deleted).
        // Try both current scope AND last-known org scope.
        if (!recovered) {
          try {
            console.log(
              "[usePersistence] RECOVERY GUARD: Attempting nuclear recovery — rebuilding index from user_estimates rows...",
            );
            // Use scope-blind pull — finds ALL estimates for this user across all orgs
            let cloudEstimates = await cloudSync.pullAllEstimatesAnyScope();
            if (cloudEstimates.length > 0) {
              const rebuiltIndex = [];
              for (const ce of cloudEstimates) {
                if (recoveryDeletedSet.has(ce.estimate_id)) continue;
                let estData = ce.data;
                try {
                  estData = await cloudSync.hydrateBlobs(ce.data);
                } catch {
                  /* blob hydration failed — use raw data */
                }
                await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
                // Build minimal index entry from estimate data
                const proj = estData?.project || {};
                rebuiltIndex.push({
                  id: ce.estimate_id,
                  name: proj.name || "Recovered Estimate",
                  client: proj.client || "",
                  status: proj.status || "Active",
                  bidDue: proj.bidDue || "",
                  grandTotal: 0,
                  elementCount: (estData?.items || []).length,
                  lastModified: new Date().toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }),
                  estimator: proj.estimator || "",
                  jobType: proj.jobType || "",
                  companyProfileId: proj.companyProfileId || "",
                  buildingType: proj.buildingType || "",
                  workType: proj.workType || "",
                });
              }
              if (rebuiltIndex.length > 0) {
                console.log(
                  `[usePersistence] NUCLEAR RECOVERY: Rebuilt index with ${rebuiltIndex.length} estimates from user_estimates rows`,
                );
                recovered = rebuiltIndex;
                await storage.set(activeKey, JSON.stringify(rebuiltIndex));
              }
            }
          } catch (err) {
            console.warn("[usePersistence] Nuclear recovery failed:", err);
          }
        }

        if (recovered) {
          useEstimatesStore.getState().setEstimatesIndex(recovered);
          // Switch to "All" profile so recovered estimates aren't hidden by company filter
          const uiState = useUiStore.getState();
          if (uiState.appSettings.activeCompanyId !== "__all__") {
            uiState.setAppSettings({ ...uiState.appSettings, activeCompanyId: "__all__" });
          }
          uiState.showToast(`Recovered ${recovered.length} estimate(s)`, "success");
        } else {
          console.warn("[usePersistence] RECOVERY GUARD: all fallbacks exhausted — no estimates found");
        }
      }

      // Mirror index to localStorage as resilient backup (survives IDB eviction)
      try {
        const idxToMirror = useEstimatesStore.getState().estimatesIndex;
        if (idxToMirror.length > 0 && currentUserId) {
          localStorage.setItem(`bldg-index-mirror-${currentUserId}`, JSON.stringify(idxToMirror));
        }
      } catch {
        /* localStorage quota exceeded or unavailable */
      }

      // Repair: ensure ALL estimate blobs in IDB are available under the current org-scoped key.
      // This catches estimates stored under bare or solo keys that the one-time migration missed.
      try {
        const currentOrg = useOrgStore.getState().org;
        const currentUser = useAuthStore.getState().user?.id;
        if (currentOrg?.id && currentUser) {
          const allKeys = await storage.keys();
          const estBlobKeys = allKeys.filter(k => typeof k === "string" && k.includes("bldg-est-"));
          const orgPrefix = `org-${currentOrg.id}-`;
          // Group by estimate ID — find blobs NOT under current org prefix
          const estIdRegex = /bldg-est-([a-z0-9_-]+)/i;
          const orphans = new Map(); // estId → key
          const orgExists = new Set(); // estIds that already have org-scoped key
          for (const k of estBlobKeys) {
            const m = k.match(estIdRegex);
            if (!m) continue;
            const estId = m[1];
            if (k.startsWith(orgPrefix)) {
              orgExists.add(estId);
            } else if (!orphans.has(estId)) {
              orphans.set(estId, k);
            }
          }
          // Copy orphans to org scope
          let repaired = 0;
          for (const [estId, srcKey] of orphans) {
            if (orgExists.has(estId)) continue; // already exists under org key
            const destKey = `${orgPrefix}bldg-est-${estId}`;
            const srcData = await storage.get(srcKey);
            if (srcData?.value) {
              await storage.set(destKey, srcData.value);
              repaired++;
              console.log(`[repair] Copied estimate ${estId.slice(0, 8)} from "${srcKey.slice(0, 30)}" → org scope`);
            }
          }
          if (repaired > 0) {
            console.log(`[repair] Migrated ${repaired} orphaned estimate blob(s) to org-${currentOrg.id.slice(0, 8)}`);
            // Mark repaired estimates as dirty so cloud sync pushes them
            for (const [estId] of orphans) {
              if (!orgExists.has(estId)) {
                markDirtyEstimate(estId);
              }
            }
          }
        }
      } catch (repairErr) {
        console.warn("[repair] Estimate blob repair failed:", repairErr);
      }

      // ── Startup integrity check — validate IDB index matches data blobs ──
      try {
        const integrity = await nova.runIntegrityCheck(storage, idbKey);
        if (!integrity.healthy && integrity.orphanCount > 0) {
          nova.orphan.warn(`Startup integrity: ${integrity.orphanCount} orphaned entries detected — removing`, {
            orphanIds: integrity.orphanIds,
            totalCount: integrity.totalCount,
          });
          // Remove orphaned entries from the index — they have no backing data
          // in IDB or cloud, so they're just ghosts polluting the estimate list.
          const currentIndex = useEstimatesStore.getState().estimatesIndex;
          const cleaned = currentIndex.filter(e => !integrity.orphanIds.includes(e.id));
          if (cleaned.length < currentIndex.length) {
            useEstimatesStore.setState({ estimatesIndex: cleaned });
            const indexKey = idbKey("bldg-index");
            await storage.set(indexKey, JSON.stringify(cleaned));
            // Also update localStorage mirror
            localStorage.setItem("bldg-index-mirror", JSON.stringify(cleaned));
            console.log(`[repair] Removed ${currentIndex.length - cleaned.length} orphaned entries from index`);
          }
        }
      } catch (intErr) {
        nova.idb.error("Startup integrity check failed", { error: intErr });
      }

      // ── Enrich index entries with project fields that may be missing ──
      // Fields like bidRequirements, engineer, address, etc. were added to the index
      // after initial release. This backfills them from IDB estimate data blobs.
      try {
        const INDEX_FIELDS = ["bidRequirements","engineer","address","description","bidDelivery","bidDueTime","walkthroughDate","rfiDueDate","date","coEstimators","bidType"];
        const currentIndex = useEstimatesStore.getState().estimatesIndex;
        let enriched = false;
        const updatedIndex = await Promise.all(currentIndex.map(async entry => {
          // Check if bidRequirements is empty or any field is missing
          const brEmpty = !entry.bidRequirements || Object.keys(entry.bidRequirements).length === 0;
          const missing = INDEX_FIELDS.some(f => entry[f] === undefined);
          if (!missing && !brEmpty) return entry;
          try {
            const raw = await storage.get(idbKey(`bldg-est-${entry.id}`));
            if (!raw) return entry;
            const data = JSON.parse(raw);
            const proj = data?.project || {};
            enriched = true;
            // Always take project's bidRequirements if richer than index
            const projReqs = proj.bidRequirements || {};
            const entryReqs = entry.bidRequirements || {};
            const useProjectReqs = Object.keys(projReqs).length > Object.keys(entryReqs).length;
            return {
              ...entry,
              bidRequirements: useProjectReqs ? projReqs : entryReqs,
              engineer: entry.engineer || proj.engineer || "",
              address: entry.address ?? proj.address ?? "",
              description: entry.description ?? proj.description ?? "",
              bidDelivery: entry.bidDelivery ?? proj.bidDelivery ?? "",
              bidDueTime: entry.bidDueTime ?? proj.bidDueTime ?? "",
              walkthroughDate: entry.walkthroughDate ?? proj.walkthroughDate ?? "",
              rfiDueDate: entry.rfiDueDate ?? proj.rfiDueDate ?? "",
              date: entry.date ?? proj.date ?? "",
              coEstimators: entry.coEstimators ?? proj.coEstimators ?? [],
              bidType: entry.bidType ?? proj.bidType ?? "",
            };
          } catch { return entry; }
        }));
        if (enriched) {
          useEstimatesStore.getState().setEstimatesIndex(updatedIndex);
          await storage.set(idbKey("bldg-index"), JSON.stringify(updatedIndex));
          console.log("[usePersistence] Enriched index with missing project fields");
        }
      } catch (enrichErr) {
        console.warn("[usePersistence] Index enrichment failed:", enrichErr);
      }

      // ── One-time data imports + calibration (run after persistence loads) ──
      try {
        const { importMontanaProposals, importViolanteProposals, importAreaBuildersProposals, importExtractedProposals, calibrateFromImportedProposals } = await import("@/data/importProposals");
        const mCount = importMontanaProposals();
        const vCount = importViolanteProposals();
        const abCount = importAreaBuildersProposals();
        const exCount = importExtractedProposals();
        // Generate learning records from ALL imported proposals — this is what
        // makes them actually calibrate the ROM instead of just sitting in storage.
        await calibrateFromImportedProposals();
        // If any proposals were imported, persist immediately to IDB + cloud
        // so cloud sync doesn't overwrite with stale data
        if (mCount || vCount || abCount || exCount) {
          console.log(`[usePersistence] Imports changed data — persisting immediately`);
          await saveMasterData();
        }
      } catch (importErr) {
        console.warn("[usePersistence] Proposal import/calibration failed:", importErr);
      }

      // Signal that persistence load is complete — auto-save can now safely write
      useUiStore.getState().setPersistenceLoaded(true);
      // If cloudSettingsLoaded wasn't set during cloud pull (e.g., local-only path),
      // set it now so auto-save can push settings to cloud going forward.
      if (!useUiStore.getState().cloudSettingsLoaded) {
        useUiStore.getState().setCloudSettingsLoaded(true);
      }
    })();
  }, [orgReady]);
}

// ── Extracted modules (re-exported for backwards compatibility) ──
export { loadEstimate, saveEstimate } from "@/hooks/persistenceEstimate";
export { recoverFromCloud } from "@/hooks/persistenceRecovery";
export { saveMasterData, saveSettings, saveAssemblies, saveUserLibrary, saveCalendar, saveTasks, saveBidPackagePresets, saveSubdivisionConfig, saveAutoResponseConfig, saveAutoResponseDrafts } from "@/hooks/persistenceGlobal";
export { resetAllStores, saveUploadQueue, loadUploadQueue, savePdfBase64, loadPdfBase64, deletePdfBase64, deletePdfBase64Batch, markDirtyEstimate, clearDirtyEstimate, getDirtyEstimates, clearAllDirtyEstimates } from "@/hooks/persistenceCleanup";
