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
import { useCorrespondenceStore } from "@/stores/correspondenceStore";
import { useReportsStore } from "@/stores/reportsStore";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useModuleStore, migrateModuleInstances } from "@/stores/moduleStore";
import { useUiStore } from "@/stores/uiStore";
import { useScanStore } from "@/stores/scanStore";
import { useDiscoveryStore } from "@/stores/discoveryStore";
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
import * as nova from "@/utils/novaLogger";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useInboxStore } from "@/stores/inboxStore";
import { useNovaStore } from "@/stores/novaStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { useSnapshotsStore } from "@/stores/snapshotsStore";
import { useUndoStore } from "@/stores/undoStore";
import { peekPendingSessions, drainPendingSessions } from "@/hooks/useActivityTracker";

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
  useDatabaseStore.getState().resetToMaster();
  useUiStore.getState().setPersistenceLoaded(false);
  useUiStore.setState({ aiChatMessages: [], aiChatInput: "" });

  // Reset stores that hold user/estimate-specific data
  useProjectStore.setState({ project: { name: "New Estimate" } });
  useItemsStore.setState({ items: [], customMarkups: [], changeOrders: [], projectAssemblies: [] });
  useTakeoffsStore.setState({
    takeoffs: [],
    tkCalibrations: {},
    tkPredictions: null,
    tkPredAccepted: [],
    tkPredRejected: [],
    tkPredContext: null,
    tkPredRefining: false,
    tkNovaPanelOpen: false,
  });
  useDrawingsStore.setState({ drawings: [], drawingScales: {}, drawingDpi: {} });
  useBidLevelingStore.setState({
    subBidSubs: {},
    bidTotals: {},
    bidCells: {},
    bidSelections: {},
    linkedSubs: [],
    subKeyLabels: {},
  });
  useAlternatesStore.setState({ alternates: [] });
  useSpecsStore.setState({ specs: [], specPdf: null, exclusions: [], clarifications: [] });
  useCorrespondenceStore.setState({ correspondences: [] });
  useDocumentsStore.setState({ documents: [], tagPalette: [], transmittals: [] });
  useCorrectionStore.setState({ corrections: [], globalPatterns: [] });
  useFirmMemoryStore.setState({ firms: {} });
  useModuleStore.setState({ moduleInstances: {}, activeModule: null });
  useScanStore.getState().clearScan?.();
  useDiscoveryStore.getState().reset();
  useBidPackagesStore.setState({ bidPackages: [], invitations: {}, proposals: {}, scopeGapResults: {} });
  useGroupsStore.setState({ groups: [...DEFAULT_GROUPS] });
  useSubdivisionStore.getState().clearSubdivisionData?.();

  // Reset session-specific stores not tied to persistence
  useCollaborationStore.getState().cleanup?.();
  useCollaborationStore.setState({ currentLock: null, isLockHolder: false, lockError: null, presenceUsers: [] });
  useInboxStore.setState({ rfps: [], unreadCount: 0 });
  useNovaStore.setState({ notifications: [], history: [], activity: null, alert: null });
  useActivityTimerStore.setState({ currentSession: null, isRunning: false });
  useActivityTimerStore._pendingSessions = [];
  useSnapshotsStore.setState({ snapshots: [] });
  useUndoStore.setState({ past: [], future: [] });

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
            const lsKey = `bldg-deleted-ids-${userId || "anon"}`;
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

          // Pull estimates index (try current scope, then fallback to last-known org)
          let cloudIndex = await cloudSync.pullData("index");

          // ─── ORG-SCOPE RECOVERY ───
          // If pullData returned nothing, try last-known org, then scope-blind pull.
          if (!cloudIndex || !Array.isArray(cloudIndex) || cloudIndex.length === 0) {
            // Try 1: last-known org ID from localStorage
            const lastOrgId = localStorage.getItem("bldg-last-org-id");
            if (lastOrgId) {
              console.log(`[usePersistence] Cloud pull empty — trying last-known org "${lastOrgId.slice(0, 8)}..."`);
              const orgIndex = await cloudSync.pullDataWithOrgId("index", lastOrgId);
              if (orgIndex && Array.isArray(orgIndex) && orgIndex.length > 0) {
                console.log(`[usePersistence] FOUND ${orgIndex.length} estimates in org-scoped cloud — recovering`);
                cloudIndex = orgIndex;
              }
            }
            // Try 2: SCOPE-BLIND pull — searches ALL orgs for this user
            if (!cloudIndex || !Array.isArray(cloudIndex) || cloudIndex.length === 0) {
              console.log("[usePersistence] Cloud pull still empty — trying scope-blind recovery (all orgs)...");
              const anyIndex = await cloudSync.pullDataAnyScope("index");
              if (anyIndex && Array.isArray(anyIndex) && anyIndex.length > 0) {
                console.log(`[usePersistence] SCOPE-BLIND RECOVERY: found ${anyIndex.length} estimates`);
                cloudIndex = anyIndex;
              }
            }
          }

          if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
            // Filter out locally-deleted estimates before restoring
            const filteredIndex = deletedSet.size > 0 ? cloudIndex.filter(e => !deletedSet.has(e.id)) : cloudIndex;
            useEstimatesStore.getState().setEstimatesIndex(filteredIndex);
            await storage.set(idbKey("bldg-index"), JSON.stringify(filteredIndex));
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
                  projectSF: proj.projectSF || 0,
                  zipCode: proj.zipCode || "",
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

        // 3. Try cloud pull — scope-aware with scope-blind ultimate fallback
        if (!recovered) {
          try {
            // Try current scope first
            let cloudIndex = await cloudSync.pullData("index");
            // Try last-known org
            if (!cloudIndex || !Array.isArray(cloudIndex) || cloudIndex.length === 0) {
              const lastOrgId = localStorage.getItem("bldg-last-org-id");
              if (lastOrgId) {
                console.log(`[usePersistence] RECOVERY GUARD: trying last-known org for cloud index`);
                cloudIndex = await cloudSync.pullDataWithOrgId("index", lastOrgId);
              }
            }
            // SCOPE-BLIND: try ALL orgs
            if (!cloudIndex || !Array.isArray(cloudIndex) || cloudIndex.length === 0) {
              console.log("[usePersistence] RECOVERY GUARD: scope-blind cloud index pull...");
              cloudIndex = await cloudSync.pullDataAnyScope("index");
            }
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
          const estIdRegex = /bldg-est-([0-9a-f-]{36})/;
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
          }
        }
      } catch (repairErr) {
        console.warn("[repair] Estimate blob repair failed:", repairErr);
      }

      // ── Startup integrity check — validate IDB index matches data blobs ──
      try {
        const integrity = await nova.runIntegrityCheck(storage, idbKey);
        if (!integrity.healthy && integrity.orphanCount > 0) {
          nova.orphan.warn(`Startup integrity: ${integrity.orphanCount} orphaned entries detected`, {
            orphanIds: integrity.orphanIds,
            totalCount: integrity.totalCount,
          });
          // Don't auto-remove here — cloud sync Phase 6 will handle cleanup
          // after attempting to pull missing data from cloud. Just log for awareness.
        }
      } catch (intErr) {
        nova.idb.error("Startup integrity check failed", { error: intErr });
      }

      // Signal that persistence load is complete — auto-save can now safely write
      useUiStore.getState().setPersistenceLoaded(true);
    })();
  }, [orgReady]);
}

// Load a specific estimate into stores
export async function loadEstimate(id) {
  const resolvedKey = idbKey(`bldg-est-${id}`);
  console.log(`[loadEstimate] Looking for estimate ${id} — IDB key: "${resolvedKey}"`);
  let raw = await storage.get(resolvedKey);
  console.log(`[loadEstimate] IDB lookup result: ${raw ? "FOUND" : "MISS"}`);

  // Fallback: if in org mode and org-scoped key missed, check solo-scoped key
  // (handles estimates created before org migration that weren't copied)
  if (!raw) {
    const org = useOrgStore.getState().org;
    const userId = useAuthStore.getState().user?.id;
    if (org?.id && userId) {
      const soloKey = `u-${userId}-bldg-est-${id}`;
      const soloRaw = await storage.get(soloKey);
      if (soloRaw?.value) {
        console.log(`[loadEstimate] Found estimate ${id} under solo key — copying to org scope`);
        const orgKey = `org-${org.id}-bldg-est-${id}`;
        await storage.set(orgKey, soloRaw.value);
        raw = soloRaw;
      }
    }
    // Also check bare key (pre-migration estimates stored without user/org prefix)
    if (!raw) {
      const bareKey = `bldg-est-${id}`;
      if (bareKey !== resolvedKey) {
        const bareRaw = await storage.get(bareKey);
        if (bareRaw?.value) {
          console.log(`[loadEstimate] Found estimate ${id} under bare key — copying to scoped key`);
          await storage.set(resolvedKey, bareRaw.value);
          raw = bareRaw;
        }
      }
    }
    // Brute-force: scan ALL IDB keys for any key containing this estimate ID
    if (!raw) {
      try {
        const allKeys = await storage.keys();
        const matchingKey = allKeys.find(k => k.includes(`bldg-est-${id}`));
        if (matchingKey) {
          console.log(`[loadEstimate] Brute-force found estimate ${id} under key: "${matchingKey}"`);
          const matchRaw = await storage.get(matchingKey);
          if (matchRaw?.value) {
            await storage.set(resolvedKey, matchRaw.value);
            raw = matchRaw;
          }
        } else {
          console.warn(
            `[loadEstimate] Brute-force: NO IDB key contains bldg-est-${id}. All keys:`,
            allKeys.filter(k => k.includes("bldg-est-")).slice(0, 10),
          );
        }
      } catch (e) {
        console.warn("[loadEstimate] Brute-force key scan failed:", e);
      }
    }
  }

  // If not in IndexedDB, try cloud
  if (!raw) {
    console.log(`[loadEstimate] Not in IDB — trying cloud pull for ${id}...`);
    try {
      let cloudData = await cloudSync.pullEstimate(id);
      console.log(`[loadEstimate] Cloud pull result: ${cloudData ? "FOUND" : "MISS"}`);
      if (cloudData) {
        // Hydrate blobs from Supabase Storage (drawings, documents, specPdf)
        cloudData = await cloudSync.hydrateBlobs(cloudData);
        // Cache locally — but only persist if all blobs hydrated (keep markers for retry)
        const stats = cloudData._hydrationStats;
        if (!stats || stats.failed === 0) {
          await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(cloudData));
        } else {
          // Store cloud data WITH markers so next load retries hydration
          console.warn(`[loadEstimate] Partial hydration from cloud — caching with markers for retry`);
          await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(cloudData));
        }
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
        // Only overwrite IDB if ALL blobs were hydrated — otherwise keep
        // the existing IDB entry with _cloudBlobStripped markers intact
        // so we can retry hydration on next load.
        const stats = hydrated._hydrationStats;
        if (!stats || stats.failed === 0) {
          await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(hydrated));
          raw = { value: JSON.stringify(hydrated) };
        } else {
          // Partial success — use hydrated data in-memory but don't persist
          // the partial result (markers still intact for retry next load)
          console.warn(
            `[loadEstimate] Partial hydration (${stats.hydrated} ok, ${stats.failed} failed) — not persisting to IDB`,
          );
          raw = { value: JSON.stringify(hydrated) };
        }
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
  if (!raw.value) {
    console.error(`[loadEstimate] raw exists but raw.value is ${typeof raw.value}:`, raw);
    return false;
  }

  try {
    const data = JSON.parse(raw.value);
    // Clean up internal hydration stats — not part of estimate data
    delete data._hydrationStats;

    // Ensure backwards compatibility: old estimates without setupComplete are treated as complete
    const projectData = data.project || useProjectStore.getState().project;
    if (projectData.setupComplete === undefined) projectData.setupComplete = true;
    useProjectStore.getState().setProject(projectData);
    useTakeoffsStore.getState().clearPredictions();
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
    useBidLevelingStore.getState().setPreferredSubs(data.preferredSubs || {});
    useSpecsStore.getState().setSpecs(data.specs || []);
    useSpecsStore.getState().setSpecPdf(data.specPdf || null);
    useSpecsStore.getState().setExclusions(data.exclusions || []);
    useSpecsStore.getState().setClarifications(data.clarifications || []);
    useAlternatesStore.getState().setAlternates(data.alternates || []);
    useCorrespondenceStore.getState().setCorrespondences(data.correspondences || []);
    useDocumentsStore.getState().setDocuments(data.documents || []);
    useDocumentsStore.getState().setTagPalette(data.docTagPalette || []);
    useDocumentsStore.getState().setTransmittals(data.docTransmittals || []);
    useCorrectionStore.getState().setCorrections(data.novaCorrections || []);
    useCorrectionStore.getState().setGlobalPatterns(data.novaCorrectionPatterns || []);
    useFirmMemoryStore.getState().setFirms(data.novaFirmMemory || {});
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

    // Restore discovery index if present
    if (data.discoveryIndex && Array.isArray(data.discoveryIndex)) {
      useDiscoveryStore.getState().setDiscoveryIndex(data.discoveryIndex);
    } else {
      useDiscoveryStore.getState().reset();
    }

    // Load groups (bid context)
    useGroupsStore.getState().setGroups(data.groups || [...DEFAULT_GROUPS]);

    // Load bid packages
    useBidPackagesStore.getState().setBidPackages(data.bidPackages || []);
    useBidPackagesStore.getState().setInvitations(data.bidInvitations || {});
    useBidPackagesStore.getState().setProposals(data.bidProposals || {});
    useBidPackagesStore.getState().setScopeGapResults(data.bidScopeGapResults || {});

    // One-time migration: if user cost library is empty but estimate has elements,
    // seed the global library from this estimate's elements (first load after architecture change)
    const libEmpty = useDatabaseStore.getState().getUserElements().length === 0;
    if (libEmpty && data.elements?.length > 0) {
      useDatabaseStore.getState().loadUserElements(data.elements);
      saveUserLibrary().catch(err => console.warn("[migration] Failed to seed cost library:", err));
      console.log("[migration] Seeded cost library from estimate:", id);
    }

    // Load subdivision data for this estimate
    if (data.subdivisionData) useSubdivisionStore.getState().setSubdivisionData(data.subdivisionData);
    else useSubdivisionStore.getState().clearSubdivisionData();
    if (data.subdivisionOverrides) {
      Object.entries(data.subdivisionOverrides).forEach(([code, override]) => {
        useSubdivisionStore.getState().setUserOverride(code, override);
      });
    }
    if (data.subdivisionLlm) useSubdivisionStore.getState().setLlmRefinements(data.subdivisionLlm);

    // Clear NOVA chat from previous estimate
    useUiStore.getState().setAiChatMessages([]);

    useEstimatesStore.getState().setActiveEstimateId(id);
    return true;
  } catch (e) {
    console.error("Failed to load estimate:", e);
    // Surface the actual error so we can diagnose — the generic "could not load" toast hides root cause
    useUiStore.getState().showToast(`Load error: ${e?.message || e}`, "error");
    return false;
  }
}

// Save the active estimate
export async function saveEstimate(overrideId) {
  const id = overrideId || useEstimatesStore.getState().activeEstimateId;
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
    preferredSubs: useBidLevelingStore.getState().preferredSubs,
    exclusions: useSpecsStore.getState().exclusions,
    clarifications: useSpecsStore.getState().clarifications,
    specs: useSpecsStore.getState().specs,
    specPdf: useSpecsStore.getState().specPdf,
    alternates: useAlternatesStore.getState().alternates,
    correspondences: useCorrespondenceStore.getState().correspondences,
    documents: useDocumentsStore.getState().documents,
    docTagPalette: useDocumentsStore.getState().tagPalette,
    docTransmittals: useDocumentsStore.getState().transmittals,
    novaCorrections: useCorrectionStore.getState().corrections,
    novaCorrectionPatterns: useCorrectionStore.getState().globalPatterns,
    novaFirmMemory: useFirmMemoryStore.getState().firms,
    moduleInstances: useModuleStore.getState().moduleInstances,
    activeModule: useModuleStore.getState().activeModule,
    elements: useDatabaseStore.getState().getUserElements(),
    subdivisionData: useSubdivisionStore.getState().subdivisionData,
    subdivisionOverrides: useSubdivisionStore.getState().userOverrides,
    subdivisionLlm: useSubdivisionStore.getState().llmRefinements,
    scanResults: useScanStore.getState().scanResults,
    discoveryIndex: useDiscoveryStore.getState().discoveryIndex,
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

  // Peek at pending sessions (don't drain yet — only drain after confirmed write)
  const pendingSessions = peekPendingSessions(id);
  if (pendingSessions.length > 0) {
    data.timerSessions = [...data.timerSessions, ...pendingSessions];
    // Recalculate total from all sessions
    data.timerTotalMs = data.timerSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  }

  // Stamp save time for cross-device sync freshness comparison
  data._savedAt = new Date().toISOString();

  const estOk = await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(data));
  if (!estOk) {
    useUiStore.getState().showToast("Save failed — check storage space", "error");
    return; // Don't update index if estimate didn't save — pending sessions preserved
  }

  // IDB write confirmed — now safely drain the pending sessions
  if (pendingSessions.length > 0) {
    drainPendingSessions(id);
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
    coEstimators: data.project.coEstimators || [],
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

  // CRITICAL FIX (v5): Re-check that this estimate still exists in the index.
  // During the async IDB operations above, the user may have deleted this estimate.
  // Previously, !existsInIndex would RE-ADD the deleted estimate to the index (zombie bug).
  // createEstimate() already adds to the index immediately, so the only reason
  // !existsInIndex would be true here is if the estimate was DELETED during save.
  const existsInIndex = useEstimatesStore.getState().estimatesIndex.some(e => e.id === id);
  if (!existsInIndex) {
    // Double-check: was this estimate intentionally deleted?
    let wasDeleted = false;
    try {
      const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
      const deletedIds = delRaw ? JSON.parse(delRaw.value) : [];
      // Also check localStorage backup (survives IDB eviction)
      try {
        const userId = useAuthStore.getState().user?.id;
        const lsKey = `bldg-deleted-ids-${userId || "anon"}`;
        const lsRaw = localStorage.getItem(lsKey);
        if (lsRaw) {
          for (const delId of JSON.parse(lsRaw)) {
            if (!deletedIds.includes(delId)) deletedIds.push(delId);
          }
        }
      } catch {
        /* ignore */
      }
      wasDeleted = deletedIds.includes(id);
    } catch {
      /* proceed cautiously */
    }

    if (wasDeleted) {
      console.warn("[saveEstimate] Estimate was deleted during save — aborting save for", id);
      return;
    }

    // Only re-add if it genuinely wasn't in the index (e.g., draft-to-real transition)
    // AND it's still the active estimate (not deleted)
    const stillActive = useEstimatesStore.getState().activeEstimateId === id;
    if (stillActive) {
      const newEntry = { id, ...entryFields };
      useEstimatesStore.setState(s => ({
        estimatesIndex: [...s.estimatesIndex, newEntry],
      }));
    } else {
      console.warn("[saveEstimate] Estimate not in index and not active — skipping re-add for", id);
      return;
    }
  } else {
    useEstimatesStore.getState().updateIndexEntry(id, entryFields);
  }

  const idx = useEstimatesStore.getState().estimatesIndex;
  const idxJson = JSON.stringify(idx);

  // ─── DATA LOSS PREVENTION GUARD ───
  // If the current index is empty but the localStorage mirror has data,
  // something went wrong (IDB eviction, race condition, etc.).
  // NEVER overwrite good data with empty data.
  try {
    const userId = useAuthStore.getState().user?.id;
    if (idx.length === 0 && userId) {
      const mirrorRaw = localStorage.getItem(`bldg-index-mirror-${userId}`);
      if (mirrorRaw) {
        const mirrorParsed = JSON.parse(mirrorRaw);
        if (Array.isArray(mirrorParsed) && mirrorParsed.length > 0) {
          // CRITICAL: Filter deleted IDs before recovering — otherwise this
          // guard resurrects deliberately-deleted estimates from the mirror.
          let filtered = mirrorParsed;
          try {
            const delRaw = await storage.get(idbKey("bldg-deleted-ids"));
            let delIds = delRaw ? JSON.parse(delRaw.value) : [];
            const lsKey = `bldg-deleted-ids-${userId || "anon"}`;
            const lsDelRaw = localStorage.getItem(lsKey);
            if (lsDelRaw) {
              const lsDel = JSON.parse(lsDelRaw);
              for (const d of lsDel) {
                if (!delIds.includes(d)) delIds.push(d);
              }
            }
            if (delIds.length > 0) {
              const delSet = new Set(delIds);
              filtered = mirrorParsed.filter(e => !delSet.has(e.id));
            }
          } catch {
            /* proceed with unfiltered */
          }
          if (filtered.length === 0) {
            console.log("[saveEstimate] DLP guard: mirror entries are all deleted — not recovering");
          } else {
            console.error(
              `[saveEstimate] DATA LOSS PREVENTION: Refusing to save empty index — localStorage mirror has ${filtered.length} estimates (${mirrorParsed.length - filtered.length} deleted filtered). Recovering...`,
            );
            // Recover from mirror instead of overwriting
            useEstimatesStore.getState().setEstimatesIndex(filtered);
            await storage.set(idbKey("bldg-index"), JSON.stringify(filtered));
          }
          return; // Abort this save — data recovered (or all deleted)
        }
      }
    }
  } catch {
    /* guard must not break saves */
  }

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
  // Guard 1: Skip cloud push while startup sync is running to prevent race conditions.
  if (useUiStore.getState().cloudSyncInProgress) {
    console.log("[saveEstimate] Startup cloud sync in progress — deferring cloud push, marking dirty");
    markDirtyEstimate(id);
    return;
  }
  // Guard 2: Check if this estimate was deleted during the save window.
  // This prevents a race where auto-save fires → user deletes → push un-deletes.
  const pushId = useEstimatesStore.getState().activeEstimateId;
  if (pushId === id && useEstimatesStore.getState().estimatesIndex.some(e => e.id === id)) {
    cloudSync
      .pushEstimate(id, data)
      .then(() => clearDirtyEstimate(id))
      .catch(err => {
        console.warn("[usePersistence] Cloud push failed for estimate:", err?.message);
        markDirtyEstimate(id);
      });
    cloudSync.pushData("index", idx).catch(err => {
      console.warn("[usePersistence] Cloud push failed for index:", err?.message);
    });
  } else {
    console.warn("[usePersistence] Estimate deleted during save — skipping cloud push for", id);
  }
}

// Save master data
export async function saveMasterData() {
  const master = useMasterDataStore.getState().masterData;

  // Guard: never push a clearly empty/reset master to cloud — this would wipe
  // company profiles, contacts, proposals, etc. that exist on the server.
  const hasContent =
    master.companyProfiles?.length > 0 ||
    master.companyInfo?.name ||
    master.clients?.length > 0 ||
    master.subcontractors?.length > 0 ||
    master.historicalProposals?.length > 0;

  const ok = await storage.set(idbKey("bldg-master"), JSON.stringify(master));
  if (!ok) {
    useUiStore.getState().showToast("Failed to save company data", "error");
  }

  // Cloud push (non-blocking) — skip if master looks empty to avoid wiping cloud data
  if (!hasContent) {
    console.warn("[saveMasterData] Skipping cloud push — master data appears empty/reset");
    return;
  }
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

// Save user cost library (global, independent of estimates)
export async function saveUserLibrary() {
  const lib = useDatabaseStore.getState().getUserElements();
  const ok = await storage.set(idbKey("bldg-user-elements"), JSON.stringify(lib));
  if (!ok) {
    console.error("[usePersistence] Failed to save user cost library");
  }

  // Cloud push (non-blocking)
  cloudSync.pushData("user-elements", lib).catch(err => {
    console.warn("[usePersistence] Cloud push failed for cost library:", err?.message);
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

// ── Dirty-flag system for failed cloud pushes ──────────────────────
// When a cloud push fails or is deferred, mark the estimate as "dirty".
// On next startup, useCloudSync re-pushes all dirty estimates before normal sync.

const DIRTY_KEY = "bldg-dirty-estimates";

export function markDirtyEstimate(estimateId) {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    if (!ids.includes(estimateId)) {
      ids.push(estimateId);
      localStorage.setItem(DIRTY_KEY, JSON.stringify(ids));
    }
  } catch {
    /* ignore */
  }
}

export function clearDirtyEstimate(estimateId) {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw).filter(id => id !== estimateId);
    localStorage.setItem(DIRTY_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function getDirtyEstimates() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearAllDirtyEstimates() {
  try {
    localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ignore */
  }
}

// ─── MANUAL CLOUD RECOVERY ─────────────────────────────────────────
// Explicit recovery function callable from UI. Bypasses all automatic
// logic and does a direct, scope-blind Supabase query for the user's data.
// Returns { recovered: number } or throws on error.
export async function recoverFromCloud() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { supabase: sbClient } = await import("@/utils/supabase");
  if (!sbClient) throw new Error("Supabase not configured");

  console.log("[recoverFromCloud] Starting manual recovery for user:", userId.slice(0, 8));

  // 1. Pull index — scope-blind (no org_id filter)
  let indexData = null;
  let discoveredOrgId = null;
  try {
    const { data, error } = await sbClient
      .from("user_data")
      .select("data, org_id")
      .eq("user_id", userId)
      .eq("key", "index");
    if (error) throw error;
    if (data && data.length > 0) {
      // Find the row with the most entries
      for (const row of data) {
        const d = row.data;
        const size = Array.isArray(d) ? d.length : 0;
        const bestSize = Array.isArray(indexData) ? indexData.length : 0;
        if (size > bestSize) {
          indexData = d;
          discoveredOrgId = row.org_id;
        }
      }
    }
    console.log(
      `[recoverFromCloud] Index query: ${data?.length || 0} rows, best has ${Array.isArray(indexData) ? indexData.length : 0} entries, org=${discoveredOrgId}`,
    );
  } catch (err) {
    console.error("[recoverFromCloud] Index query failed:", err);
    throw new Error(`Cloud query failed: ${err.message}`);
  }

  // 2. Pull all estimates — scope-blind
  let estimates = [];
  try {
    const { data, error } = await sbClient
      .from("user_estimates")
      .select("estimate_id, data, org_id")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) throw error;
    estimates = data || [];
    console.log(`[recoverFromCloud] Estimates query: ${estimates.length} rows`);
  } catch (err) {
    console.error("[recoverFromCloud] Estimates query failed:", err);
  }

  // 3. Build recovered index — prefer cloud index, fallback to rebuilding from estimates
  let recoveredIndex = [];
  if (Array.isArray(indexData) && indexData.length > 0) {
    recoveredIndex = indexData.map(migrateIndexEntry);
  } else if (estimates.length > 0) {
    // Rebuild from individual estimate rows
    for (const ce of estimates) {
      const proj = ce.data?.project || {};
      recoveredIndex.push({
        id: ce.estimate_id,
        name: proj.name || "Recovered Estimate",
        client: proj.client || "",
        status: proj.status || "Active",
        bidDue: proj.bidDue || "",
        grandTotal: 0,
        elementCount: (ce.data?.items || []).length,
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
  }

  if (recoveredIndex.length === 0 && estimates.length === 0) {
    console.warn("[recoverFromCloud] No data found in cloud");
    throw new Error("No data found in cloud. Your account may not have any saved estimates.");
  }

  // 4. Filter out deleted estimates
  let deletedIds = [];
  try {
    const lsRaw = localStorage.getItem(`bldg-deleted-ids-${userId}`);
    if (lsRaw) deletedIds = JSON.parse(lsRaw);
  } catch {
    /* ignore */
  }
  const deletedSet = new Set(deletedIds);
  recoveredIndex = recoveredIndex.filter(e => !deletedSet.has(e.id));

  // 5. Save recovered org ID
  if (discoveredOrgId) {
    try {
      localStorage.setItem("bldg-last-org-id", discoveredOrgId);
    } catch {
      /* localStorage unavailable */
    }
  }

  // 6. Save index to IDB and update store
  const activeKey = idbKey("bldg-index");
  console.log(`[recoverFromCloud] Saving ${recoveredIndex.length} estimates to IDB key "${activeKey}"`);
  await storage.set(activeKey, JSON.stringify(recoveredIndex));
  useEstimatesStore.getState().setEstimatesIndex(recoveredIndex);

  // Also try the org-scoped key directly if we discovered the org
  if (discoveredOrgId) {
    const orgKey = `org-${discoveredOrgId}-bldg-index`;
    if (orgKey !== activeKey) {
      console.log(`[recoverFromCloud] Also saving to org key "${orgKey}"`);
      await storage.set(orgKey, JSON.stringify(recoveredIndex));
    }
  }

  // Mirror to localStorage
  try {
    localStorage.setItem(`bldg-index-mirror-${userId}`, JSON.stringify(recoveredIndex));
  } catch {
    /* ignore */
  }

  // 7. Cache estimate data blobs locally
  let cachedCount = 0;
  for (const ce of estimates) {
    if (deletedSet.has(ce.estimate_id)) continue;
    try {
      let estData = ce.data;
      try {
        estData = await cloudSync.hydrateBlobs(ce.data);
      } catch {
        /* proceed without hydration */
      }
      await storage.set(idbKey(`bldg-est-${ce.estimate_id}`), JSON.stringify(estData));
      // Also save under org key if different
      if (discoveredOrgId) {
        const orgEstKey = `org-${discoveredOrgId}-bldg-est-${ce.estimate_id}`;
        const currentEstKey = idbKey(`bldg-est-${ce.estimate_id}`);
        if (orgEstKey !== currentEstKey) {
          await storage.set(orgEstKey, JSON.stringify(estData));
        }
      }
      cachedCount++;
    } catch (err) {
      console.warn(`[recoverFromCloud] Failed to cache estimate ${ce.estimate_id}:`, err);
    }
  }

  // 8. Pull master data
  try {
    const { data, error } = await sbClient.from("user_data").select("data").eq("user_id", userId).eq("key", "master");
    if (!error && data && data.length > 0) {
      const masterData = data[0].data;
      if (masterData && typeof masterData === "object") {
        useMasterDataStore.getState().setMasterData({
          ...useMasterDataStore.getState().masterData,
          ...masterData,
        });
        await storage.set(idbKey("bldg-master"), JSON.stringify(masterData));
      }
    }
  } catch {
    /* master data recovery is nice-to-have */
  }

  // 9. Switch to "All" profile so recovered estimates aren't hidden
  const uiState = useUiStore.getState();
  if (uiState.appSettings.activeCompanyId !== "__all__") {
    uiState.setAppSettings({ ...uiState.appSettings, activeCompanyId: "__all__" });
  }

  console.log(
    `[recoverFromCloud] DONE — recovered ${recoveredIndex.length} index entries, cached ${cachedCount} estimates`,
  );
  return { recovered: recoveredIndex.length };
}
