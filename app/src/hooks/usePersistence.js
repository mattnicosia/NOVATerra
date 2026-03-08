import { useEffect, useRef } from "react";
import { storage } from "@/utils/storage";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore, DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useMasterDataStore, migrateSubcontractorSchema } from "@/stores/masterDataStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useReportsStore } from "@/stores/reportsStore";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useModuleStore, migrateModuleInstances } from "@/stores/moduleStore";
import { useUiStore } from "@/stores/uiStore";
import { useScanStore } from "@/stores/scanStore";
import { useGroupsStore, DEFAULT_GROUPS } from "@/stores/groupsStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useAutoResponseStore } from "@/stores/autoResponseStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import * as cloudSync from "@/utils/cloudSync";
import { loadAudioMeta } from "@/utils/novaAudioStorage";
import { migrateIndexEntry, migrateProposal } from "@/utils/costHistoryMigration";
import { idbKey } from "@/utils/idbKey";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { drainPendingSessions } from "@/hooks/useActivityTracker";

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

// Reset all Zustand stores to defaults and clear localStorage flags.
// Called on sign-out to prevent data leaking between users.
export function resetAllStores() {
  useEstimatesStore.getState().setEstimatesIndex([]);
  useEstimatesStore.setState({ activeEstimateId: null, draftId: null });
  useMasterDataStore.getState().setMasterData({
    clients: [],
    architects: [],
    engineers: [],
    estimators: [],
    subcontractors: [],
    historicalProposals: [],
    companyProfiles: [],
    jobTypes: useMasterDataStore.getState().masterData.jobTypes, // keep defaults
    bidDeliveryTypes: useMasterDataStore.getState().masterData.bidDeliveryTypes,
    bidTypes: useMasterDataStore.getState().masterData.bidTypes,
    companyInfo: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
      licenseNo: "",
      logo: null,
      brandColors: [],
      palettes: [],
      boilerplateExclusions: [],
      boilerplateNotes: [],
    },
  });
  useMasterDataStore.setState({ pdfUploadQueue: [] });
  useCalendarStore.getState().setTasks([]);
  useDatabaseStore.getState().setAssemblies([]);
  useUiStore.getState().setPersistenceLoaded(false);
  useUiStore.setState({ aiChatMessages: [], aiChatInput: "" });

  // Clear localStorage flags that are user-session-scoped
  localStorage.removeItem("blob_migration_v2");
  localStorage.removeItem("nova_cmd_recents");
  localStorage.removeItem("READ_IDS_KEY");
  localStorage.removeItem("intelligence_cache");
}

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

      // ── Startup Diagnostics ──
      const _orgState = useOrgStore.getState();
      const _activeKey = idbKey("bldg-index");
      console.log(`[usePersistence] ── BOOT DIAGNOSTIC ──`);
      console.log(`  userId: ${currentUserId || "(none)"}`);
      console.log(`  orgId: ${_orgState.org?.id || "(none)"} | orgReady: ${_orgState.orgReady}`);
      console.log(`  IDB key for index: "${_activeKey}"`);
      console.log(`  localStorage mirror exists: ${!!localStorage.getItem(`bldg-index-mirror-${currentUserId}`)}`);

      let localHasData = false;
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
          useEstimatesStore.getState().setEstimatesIndex(migrated);
          if (migrated.some((e, i) => e !== parsed[i])) {
            await storage.set(idbKey("bldg-index"), JSON.stringify(migrated));
          }
          if (migrated.length > 0) localHasData = true;
        } catch (err) {
          console.error("[usePersistence] Failed to parse estimates index:", err);
          hadCorruptedIndex = true;
          await storage.delete(idbKey("bldg-index")); // Clear corrupted data so cloud sync can recover
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
          localHasData = true;
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

      // Load auto-response config
      const arConfigRaw = await storage.get(idbKey("bldg-auto-response-config"));
      if (arConfigRaw?.value) {
        try {
          const config = JSON.parse(arConfigRaw.value);
          if (config && typeof config === "object") {
            // Merge with defaults so new triggers get default values
            const current = useAutoResponseStore.getState().triggerConfig;
            useAutoResponseStore.getState().setTriggerConfig({ ...current, ...config });
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
            useAutoResponseStore.getState().setDrafts(drafts);
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
            useBidPackagesStore.getState().setBidPackagePresets(presets);
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
            await storage.set(idbKey("bldg-subdivision-config"), JSON.stringify(cloudSubConfig));
          }
        } catch (err) {
          console.warn("[usePersistence] Cloud pull for subdivision config failed:", err);
        }
      }

      // Load proposal templates
      await useReportsStore.getState().loadTemplatesFromStorage();

      // Load scan learning records (global)
      await useScanStore.getState().loadLearningRecords();
      await useScanStore.getState().loadParameterCorrections();

      // Load PDF upload queue (resumes pending extractions)
      await loadUploadQueue();

      // ─── Cloud Pull: if local is empty or corrupted, try pulling from cloud ───
      if (!localHasData) {
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

          // Pull estimates index
          const cloudIndex = await cloudSync.pullData("index");
          if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
            // Filter out locally-deleted estimates before restoring
            const filteredIndex = deletedSet.size > 0 ? cloudIndex.filter(e => !deletedSet.has(e.id)) : cloudIndex;
            useEstimatesStore.getState().setEstimatesIndex(filteredIndex);
            await storage.set(idbKey("bldg-index"), JSON.stringify(filteredIndex));
            if (hadCorruptedIndex) recoveredFromCloud = true;

            // Pull all estimates and cache locally (skip deleted)
            const cloudEstimates = await cloudSync.pullAllEstimates();
            for (const ce of cloudEstimates) {
              if (deletedSet.has(ce.estimate_id)) continue; // Don't resurrect deleted
              await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(ce.data));
            }
          }

          // Pull master data
          const cloudMaster = await cloudSync.pullData("master");
          if (cloudMaster) {
            useMasterDataStore.getState().setMasterData({
              ...useMasterDataStore.getState().masterData,
              ...cloudMaster,
            });
            await storage.set(idbKey("bldg-master"), JSON.stringify(cloudMaster));
            if (hadCorruptedMaster) recoveredFromCloud = true;
          }

          // Pull settings
          const cloudSettings = await cloudSync.pullData("settings");
          if (cloudSettings) {
            useUiStore.getState().setAppSettings({
              ...useUiStore.getState().appSettings,
              ...cloudSettings,
            });
            await storage.set(idbKey("bldg-settings"), JSON.stringify(cloudSettings));
          }

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
          const lsKey = `bldg-deleted-ids-${currentUserId}`;
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
        const possibleKeys = [
          `u-${currentUserId}-bldg-index`,
          orgId ? `org-${orgId}-bldg-index` : null,
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

        // 3. Try cloud pull (last resort)
        if (!recovered) {
          try {
            const cloudIndex = await cloudSync.pullData("index");
            if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
              const filtered =
                recoveryDeletedSet.size > 0 ? cloudIndex.filter(e => !recoveryDeletedSet.has(e.id)) : cloudIndex;
              if (filtered.length > 0) {
                console.log(
                  `[usePersistence] RECOVERED ${filtered.length} estimates from cloud (${cloudIndex.length - filtered.length} deleted filtered)`,
                );
                recovered = filtered;
                await storage.set(activeKey, JSON.stringify(filtered));
                // Also pull estimate data (skip deleted)
                const cloudEstimates = await cloudSync.pullAllEstimates();
                for (const ce of cloudEstimates) {
                  if (recoveryDeletedSet.has(ce.estimate_id)) continue;
                  await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(ce.data));
                }
              }
            }
          } catch (err) {
            console.warn("[usePersistence] Cloud pull recovery failed:", err);
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

      // Signal that persistence load is complete — auto-save can now safely write
      useUiStore.getState().setPersistenceLoaded(true);
    })();
  }, [orgReady]);
}

// Load a specific estimate into stores
export async function loadEstimate(id) {
  let raw = await storage.get(idbKey(`bldg-est-${id}`));

  // If not in IndexedDB, try cloud
  if (!raw) {
    try {
      let cloudData = await cloudSync.pullEstimate(id);
      if (cloudData) {
        // Hydrate blobs from Supabase Storage (drawings, documents, specPdf)
        cloudData = await cloudSync.hydrateBlobs(cloudData);
        // Cache locally with hydrated blobs for next time
        await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(cloudData));
        raw = { value: JSON.stringify(cloudData) };
      }
    } catch (err) {
      console.warn("[loadEstimate] Cloud pull failed:", err);
    }
  }

  // Check if locally cached data has stripped blobs that need hydration
  if (raw) {
    try {
      const parsed = JSON.parse(raw.value);
      const hasStrippedBlobs =
        (Array.isArray(parsed.drawings) &&
          parsed.drawings.some(d => d._cloudBlobStripped && d.storagePath && !d.data)) ||
        (Array.isArray(parsed.documents) &&
          parsed.documents.some(d => d._cloudBlobStripped && d.storagePath && !d.data)) ||
        (parsed._specPdfStripped && parsed._specPdfStoragePath && !parsed.specPdf);
      if (hasStrippedBlobs) {
        const hydrated = await cloudSync.hydrateBlobs(parsed);
        await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(hydrated));
        raw = { value: JSON.stringify(hydrated) };
      }
    } catch (err) {
      console.warn("[loadEstimate] Blob hydration failed:", err);
      useUiStore.getState().showToast("Some drawings may not have loaded — check cloud connection", "error");
    }
  }

  // Fallback: if drawings/docs still have no data (stale cache from before blob sync),
  // re-pull from cloud where storagePaths may now be available, then hydrate
  if (raw) {
    try {
      const parsed = JSON.parse(raw.value);
      const drawingsMissing =
        Array.isArray(parsed.drawings) && parsed.drawings.length > 0 && parsed.drawings.some(d => !d.data);
      const docsMissing =
        Array.isArray(parsed.documents) && parsed.documents.length > 0 && parsed.documents.some(d => !d.data);

      if (drawingsMissing || docsMissing) {
        console.log("[loadEstimate] Drawings/docs missing data, refreshing from cloud...");
        let cloudData = await cloudSync.pullEstimate(id);
        if (cloudData) {
          cloudData = await cloudSync.hydrateBlobs(cloudData);

          // Merge hydrated cloud blobs into local data (preserves local non-blob changes)
          const merged = { ...parsed };

          if (Array.isArray(cloudData.drawings) && drawingsMissing) {
            merged.drawings = merged.drawings.map(d => {
              if (d.data) return d; // already have blob locally
              const cd = cloudData.drawings.find(c => c.id === d.id);
              return cd?.data ? { ...d, data: cd.data, storagePath: cd.storagePath } : d;
            });
          }

          if (Array.isArray(cloudData.documents) && docsMissing) {
            merged.documents = merged.documents.map(d => {
              if (d.data) return d;
              const cd = cloudData.documents.find(c => c.id === d.id);
              return cd?.data ? { ...d, data: cd.data, storagePath: cd.storagePath } : d;
            });
          }

          if (!merged.specPdf && cloudData.specPdf) {
            merged.specPdf = cloudData.specPdf;
          }

          await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(merged));
          raw = { value: JSON.stringify(merged) };
        }
      }
    } catch (err) {
      console.warn("[loadEstimate] Cloud blob refresh failed:", err);
      useUiStore.getState().showToast("Some drawings may not have loaded — check cloud connection", "error");
    }
  }

  if (!raw) return false;

  try {
    const data = JSON.parse(raw.value);

    // Ensure backwards compatibility: old estimates without setupComplete are treated as complete
    const projectData = data.project || useProjectStore.getState().project;
    if (projectData.setupComplete === undefined) projectData.setupComplete = true;
    useProjectStore.getState().setProject(projectData);
    useProjectStore.getState().setCodeSystem(data.codeSystem || "csi-commercial");
    useProjectStore.getState().setCustomCodes(data.customCodes || {});
    // Migrate: ensure all items have bidContext
    const itemsWithContext = (data.items || []).map(i =>
      i.bidContext !== undefined ? i : { ...i, bidContext: "base" },
    );
    useItemsStore.getState().setItems(itemsWithContext);
    const loadedMarkup = data.markup || useItemsStore.getState().markup;
    // Strip legacy compound flag from markup object
    const { compound: _legacyCompound, ...cleanMarkup } = loadedMarkup;
    useItemsStore.getState().setMarkup(cleanMarkup);
    if (data.markupOrder) {
      useItemsStore.getState().setMarkupOrder(data.markupOrder);
    } else if (_legacyCompound) {
      // Migrate: old compound:true → set all markupOrder items to compound:true
      useItemsStore.getState().setMarkupOrder(DEFAULT_MARKUP_ORDER.map(mo => ({ ...mo, compound: true })));
    }
    // Migrate: ensure per-estimate markupOrder has all standard keys and `active` field
    {
      const cur = useItemsStore.getState().markupOrder || [];
      const curKeys = new Set(cur.map(m => m.key));
      const missing = DEFAULT_MARKUP_ORDER.filter(m => !curKeys.has(m.key));
      // Existing estimate entries that lack `active` were active before this feature → default true
      // Newly added missing entries use the DEFAULT (false) so they don't surprise the user
      const merged = [...cur.map(m => ({ ...m, active: m.active !== undefined ? m.active : true })), ...missing];
      if (missing.length > 0 || cur.some(m => m.active === undefined)) {
        useItemsStore.getState().setMarkupOrder(merged);
      }
      // Ensure markup object has overheadAndProfit
      const mk = useItemsStore.getState().markup;
      if (mk.overheadAndProfit === undefined) {
        useItemsStore.getState().setMarkup({ ...mk, overheadAndProfit: 20 });
      }
    }
    useItemsStore.getState().setCustomMarkups(data.customMarkups || []);
    useItemsStore.getState().setChangeOrders(data.changeOrders || []);
    useItemsStore.getState().setProjectAssemblies(data.projectAssemblies || []);
    useDrawingsStore.getState().setDrawings(data.drawings || []);
    useDrawingsStore.getState().setDrawingScales(data.drawingScales || {});
    useDrawingsStore.getState().setDrawingDpi(data.drawingDpi || {});
    // Migrate takeoff data: rename builderId→moduleId, builderItemId→moduleItemId
    const migratedTakeoffs = (data.takeoffs || []).map(t => {
      if (t.builderId !== undefined && t.moduleId === undefined) {
        const { builderId, builderItemId, ...rest } = t;
        return { ...rest, moduleId: builderId, moduleItemId: builderItemId };
      }
      return t;
    });
    // Migrate: ensure all takeoffs have bidContext
    const takeoffsWithContext = migratedTakeoffs.map(t =>
      t.bidContext !== undefined ? t : { ...t, bidContext: "base" },
    );
    useTakeoffsStore.getState().setTakeoffs(takeoffsWithContext);
    useTakeoffsStore.getState().setTkCalibrations(data.tkCalibrations || {});
    useBidLevelingStore.getState().setSubBidSubs(data.subBidSubs || {});
    useBidLevelingStore.getState().setBidTotals(data.bidTotals || {});
    useBidLevelingStore.getState().setBidCells(data.bidCells || {});
    useBidLevelingStore.getState().setBidSelections(data.bidSelections || {});
    useBidLevelingStore.getState().setLinkedSubs(data.linkedSubs || []);
    useBidLevelingStore.getState().setSubKeyLabels(data.subKeyLabels || {});
    useSpecsStore.getState().setSpecs(data.specs || []);
    useSpecsStore.getState().setSpecPdf(data.specPdf || null);
    useSpecsStore.getState().setExclusions(data.exclusions || []);
    useSpecsStore.getState().setClarifications(data.clarifications || []);
    useAlternatesStore.getState().setAlternates(data.alternates || []);
    useDocumentsStore.getState().setDocuments(data.documents || []);
    // Migrate module instances + rename framing → walls (backwards compat: read old builderInstances key)
    let bInst = migrateModuleInstances(data.moduleInstances || data.builderInstances || {});
    if (bInst["framing"] && !bInst["walls"]) {
      bInst["walls"] = bInst["framing"];
      delete bInst["framing"];
    }
    useModuleStore.getState().setModuleInstances(bInst);
    useModuleStore
      .getState()
      .setActiveModule(
        (data.activeModule || data.activeBuilder || "") === "framing"
          ? "walls"
          : data.activeModule || data.activeBuilder || null,
      );

    // Restore scan results if present
    if (data.scanResults) {
      useScanStore.getState().setScanResults(data.scanResults);
    } else {
      useScanStore.getState().clearScan();
    }

    // Load groups (bid context)
    useGroupsStore.getState().setGroups(data.groups || [...DEFAULT_GROUPS]);

    // Load bid packages
    useBidPackagesStore.getState().setBidPackages(data.bidPackages || []);
    useBidPackagesStore.getState().setInvitations(data.bidInvitations || {});
    useBidPackagesStore.getState().setProposals(data.bidProposals || {});
    useBidPackagesStore.getState().setScopeGapResults(data.bidScopeGapResults || {});

    // Load database elements with master/override merge + migration
    useDatabaseStore.getState().loadUserElements(data.elements || []);

    // Load subdivision data for this estimate
    if (data.subdivisionData) useSubdivisionStore.getState().setSubdivisionData(data.subdivisionData);
    else useSubdivisionStore.getState().clearSubdivisionData();
    if (data.subdivisionOverrides) {
      Object.entries(data.subdivisionOverrides).forEach(([code, override]) => {
        useSubdivisionStore.getState().setUserOverride(code, override);
      });
    }
    if (data.subdivisionLlm) useSubdivisionStore.getState().setLlmRefinements(data.subdivisionLlm);

    useEstimatesStore.getState().setActiveEstimateId(id);
    return true;
  } catch (e) {
    console.error("Failed to load estimate:", e);
    return false;
  }
}

// Save the active estimate
export async function saveEstimate() {
  const id = useEstimatesStore.getState().activeEstimateId;
  if (!id) return;

  // Guard: skip save if in org mode and not the lock holder
  const orgId = useOrgStore.getState().org?.id;
  if (orgId) {
    const { isLockHolder } = useCollaborationStore.getState();
    if (!isLockHolder) {
      console.warn("[saveEstimate] Not lock holder — skipping save");
      return;
    }
  }

  // Guard: skip save if estimate was deleted (race with auto-save debounce timer)
  const draftId = useEstimatesStore.getState().draftId;
  if (!draftId || id !== draftId) {
    // Not a draft — verify it still exists in the index
    const existsLocally = useEstimatesStore.getState().estimatesIndex.some(e => e.id === id);
    if (!existsLocally) {
      console.warn("[saveEstimate] Estimate no longer in index — skipping save for", id);
      return;
    }
  }

  const data = {
    project: useProjectStore.getState().project,
    codeSystem: useProjectStore.getState().codeSystem,
    customCodes: useProjectStore.getState().customCodes,
    items: useItemsStore.getState().items,
    markup: useItemsStore.getState().markup,
    markupOrder: useItemsStore.getState().markupOrder,
    customMarkups: useItemsStore.getState().customMarkups,
    changeOrders: useItemsStore.getState().changeOrders,
    projectAssemblies: useItemsStore.getState().projectAssemblies,
    drawings: useDrawingsStore.getState().drawings,
    drawingScales: useDrawingsStore.getState().drawingScales,
    drawingDpi: useDrawingsStore.getState().drawingDpi,
    takeoffs: useTakeoffsStore.getState().takeoffs,
    tkCalibrations: useTakeoffsStore.getState().tkCalibrations,
    subBidSubs: useBidLevelingStore.getState().subBidSubs,
    bidTotals: useBidLevelingStore.getState().bidTotals,
    bidCells: useBidLevelingStore.getState().bidCells,
    bidSelections: useBidLevelingStore.getState().bidSelections,
    linkedSubs: useBidLevelingStore.getState().linkedSubs,
    subKeyLabels: useBidLevelingStore.getState().subKeyLabels,
    exclusions: useSpecsStore.getState().exclusions,
    clarifications: useSpecsStore.getState().clarifications,
    specs: useSpecsStore.getState().specs,
    specPdf: useSpecsStore.getState().specPdf,
    alternates: useAlternatesStore.getState().alternates,
    documents: useDocumentsStore.getState().documents,
    moduleInstances: useModuleStore.getState().moduleInstances,
    activeModule: useModuleStore.getState().activeModule,
    elements: useDatabaseStore.getState().getUserElements(),
    subdivisionData: useSubdivisionStore.getState().subdivisionData,
    subdivisionOverrides: useSubdivisionStore.getState().userOverrides,
    subdivisionLlm: useSubdivisionStore.getState().llmRefinements,
    scanResults: useScanStore.getState().scanResults,
    groups: useGroupsStore.getState().groups,
    bidPackages: useBidPackagesStore.getState().bidPackages,
    bidInvitations: useBidPackagesStore.getState().invitations,
    bidProposals: useBidPackagesStore.getState().proposals,
    bidScopeGapResults: useBidPackagesStore.getState().scopeGapResults,
  };

  // ── Merge activity timer data ──
  // Load existing timer sessions from the saved estimate blob, then append any new
  // pending sessions that were collected since the last save.
  try {
    const existingRaw = await storage.get(idbKey(`bldg-est-${id}`));
    if (existingRaw) {
      const existing = JSON.parse(existingRaw.value);
      data.timerSessions = existing.timerSessions || [];
      data.timerTotalMs = existing.timerTotalMs || 0;
    } else {
      data.timerSessions = [];
      data.timerTotalMs = 0;
    }
  } catch {
    data.timerSessions = [];
    data.timerTotalMs = 0;
  }

  // Drain any pending sessions collected by useActivityTracker
  const pendingSessions = drainPendingSessions(id);
  if (pendingSessions.length > 0) {
    data.timerSessions = [...data.timerSessions, ...pendingSessions];
    // Recalculate total from all sessions
    data.timerTotalMs = data.timerSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  }

  const estOk = await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(data));
  if (!estOk) {
    useUiStore.getState().showToast("Save failed — check storage space", "error");
    return; // Don't update index if estimate didn't save
  }

  // Compute division totals snapshot for Cost History analytics
  const divisionTotals = {};
  for (const item of data.items) {
    const div = item.division || item.code?.slice(0, 2) || "00";
    divisionTotals[div] = (divisionTotals[div] || 0) + (item.total || 0);
  }

  // Build index entry fields
  const totals = useItemsStore.getState().getTotals();
  const entryFields = {
    name: data.project.name,
    estimateNumber: data.project.estimateNumber || "",
    client: data.project.client,
    status: data.project.status,
    bidDue: data.project.bidDue,
    startDate: data.project.startDate || "",
    estimatedHours: data.project.estimatedHours || 0,
    walkthroughDate: data.project.walkthroughDate || "",
    rfiDueDate: data.project.rfiDueDate || "",
    otherDueDate: data.project.otherDueDate || "",
    otherDueLabel: data.project.otherDueLabel || "",
    grandTotal: totals.grand,
    elementCount: data.items.length,
    lastModified: new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    estimator: data.project.estimator,
    jobType: data.project.jobType,
    companyProfileId: data.project.companyProfileId || "",
    buildingType: data.project.buildingType || "",
    workType: data.project.workType || "",
    architect: data.project.architect || "",
    projectSF: data.project.projectSF || 0,
    zipCode: data.project.zipCode || "",
    divisionTotals,
    outcomeMetadata: data.project.outcomeMetadata || {},
    timerTotalMs: data.timerTotalMs || 0,
    ownerId: data.project.ownerId || useAuthStore.getState().user?.id || null,
    orgId: data.project.orgId || useOrgStore.getState().org?.id || null,
  };

  // If this estimate isn't in the index yet (freshly created), add it
  const existsInIndex = useEstimatesStore.getState().estimatesIndex.some(e => e.id === id);
  if (!existsInIndex) {
    const newEntry = { id, ...entryFields };
    useEstimatesStore.getState().setEstimatesIndex([...useEstimatesStore.getState().estimatesIndex, newEntry]);
  } else {
    useEstimatesStore.getState().updateIndexEntry(id, entryFields);
  }

  const idx = useEstimatesStore.getState().estimatesIndex;
  const idxJson = JSON.stringify(idx);
  const idxOk = await storage.set(idbKey("bldg-index"), idxJson);
  if (!idxOk) {
    console.error("[usePersistence] Failed to save estimates index");
  }

  // Mirror index to localStorage — resilient backup that survives IDB eviction
  try {
    const userId = useAuthStore.getState().user?.id;
    if (userId && idx.length > 0) {
      localStorage.setItem(`bldg-index-mirror-${userId}`, idxJson);
    }
  } catch {
    /* localStorage quota exceeded or unavailable */
  }

  // ─── Cloud Push (non-blocking) ───
  cloudSync.pushEstimate(id, data).catch(err => {
    console.warn("[usePersistence] Cloud push failed for estimate:", err?.message);
  });
  cloudSync.pushData("index", idx).catch(err => {
    console.warn("[usePersistence] Cloud push failed for index:", err?.message);
  });
}

// Save master data
export async function saveMasterData() {
  const master = useMasterDataStore.getState().masterData;
  const ok = await storage.set(idbKey("bldg-master"), JSON.stringify(master));
  if (!ok) {
    useUiStore.getState().showToast("Failed to save company data", "error");
  }

  // Cloud push (non-blocking)
  cloudSync.pushData("master", master).catch(err => {
    console.warn("[usePersistence] Cloud push failed for master:", err?.message);
  });
}

// Save PDF upload queue (separate from master data to keep it lean)
export async function saveUploadQueue() {
  const queue = useMasterDataStore.getState().pdfUploadQueue;
  // Keep extractedData for "extracted" items (needed for review after refresh)
  // Strip it from other statuses to save space; filter out "saved" items entirely
  const slim = queue
    .filter(q => q.status !== "saved")
    .map(q => {
      if (q.status === "extracted") return q; // keep extractedData for review
      const { extractedData: _extractedData, ...rest } = q;
      return rest;
    });
  await storage.set(idbKey("bldg-upload-queue"), JSON.stringify(slim));
}

// Load PDF upload queue
export async function loadUploadQueue() {
  const raw = await storage.get(idbKey("bldg-upload-queue"));
  if (raw?.value) {
    try {
      const queue = JSON.parse(raw.value);
      // Crash recovery: "extracting" items → reset to "queued" (file data lost)
      const fixed = queue.map(q => (q.status === "extracting" ? { ...q, status: "queued" } : q));
      useMasterDataStore.setState({ pdfUploadQueue: fixed });
    } catch {
      console.warn("[usePersistence] Failed to parse upload queue");
    }
  }
}

// ── Per-item PDF base64 persistence (survives page refresh) ──
const PDF_BASE64_PREFIX = "bldg-pdf-b64-";

export async function savePdfBase64(queueId, base64) {
  if (!queueId || !base64) return;
  await storage.set(idbKey(PDF_BASE64_PREFIX + queueId), base64);
}

export async function loadPdfBase64(queueId) {
  if (!queueId) return null;
  const raw = await storage.get(idbKey(PDF_BASE64_PREFIX + queueId));
  return raw?.value || null;
}

export async function deletePdfBase64(queueId) {
  if (!queueId) return;
  await storage.delete(idbKey(PDF_BASE64_PREFIX + queueId));
}

export async function deletePdfBase64Batch(queueIds) {
  await Promise.all(queueIds.map(id => deletePdfBase64(id)));
}

// Save app settings
export async function saveSettings() {
  const settings = useUiStore.getState().appSettings;
  const ok = await storage.set(idbKey("bldg-settings"), JSON.stringify(settings));
  if (!ok) {
    console.error("[usePersistence] Failed to save settings");
  }

  // Cloud push (non-blocking)
  cloudSync.pushData("settings", settings).catch(err => {
    console.warn("[usePersistence] Cloud push failed for settings:", err?.message);
  });
}

// Save assemblies (global library)
export async function saveAssemblies() {
  const assemblies = useDatabaseStore.getState().assemblies;
  const ok = await storage.set(idbKey("bldg-assemblies"), JSON.stringify(assemblies));
  if (!ok) {
    console.error("[usePersistence] Failed to save assemblies");
  }

  // Cloud push (non-blocking)
  cloudSync.pushData("assemblies", assemblies).catch(err => {
    console.warn("[usePersistence] Cloud push failed for assemblies:", err?.message);
  });
}

// Save calendar tasks
export async function saveCalendar() {
  const tasks = useCalendarStore.getState().tasks;
  const ok = await storage.set(idbKey("bldg-calendar"), JSON.stringify(tasks));
  if (!ok) {
    console.error("[usePersistence] Failed to save calendar");
  }

  // Cloud push (non-blocking)
  cloudSync.pushData("calendar", tasks).catch(err => {
    console.warn("[usePersistence] Cloud push failed for calendar:", err?.message);
  });
}

// Save bid package presets
export async function saveBidPackagePresets() {
  const presets = useBidPackagesStore.getState().bidPackagePresets;
  const ok = await storage.set(idbKey("bldg-bid-package-presets"), JSON.stringify(presets));
  if (!ok) {
    console.error("[usePersistence] Failed to save bid package presets");
  }
}

// Save subdivision engine config (global — persists across estimates)
export async function saveSubdivisionConfig() {
  const { engineConfig, calibrationFactors } = useSubdivisionStore.getState();
  const data = { engineConfig, calibrationFactors };
  const ok = await storage.set(idbKey("bldg-subdivision-config"), JSON.stringify(data));
  if (!ok) {
    console.error("[usePersistence] Failed to save subdivision config");
  }
  // Cloud sync (non-blocking, same pattern as saveMasterData)
  cloudSync.pushData("subdivisionConfig", data).catch(() => {});
}

// Save auto-response trigger config
export async function saveAutoResponseConfig() {
  const config = useAutoResponseStore.getState().triggerConfig;
  const ok = await storage.set(idbKey("bldg-auto-response-config"), JSON.stringify(config));
  if (!ok) {
    console.error("[usePersistence] Failed to save auto-response config");
  }
}

// Save auto-response drafts queue
export async function saveAutoResponseDrafts() {
  const drafts = useAutoResponseStore.getState().drafts;
  // Only persist pending + sent drafts (dismiss = discard)
  const keep = drafts.filter(d => d.status !== "dismissed");
  const ok = await storage.set(idbKey("bldg-auto-response-drafts"), JSON.stringify(keep));
  if (!ok) {
    console.error("[usePersistence] Failed to save auto-response drafts");
  }
}
