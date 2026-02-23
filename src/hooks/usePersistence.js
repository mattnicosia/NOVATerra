import { useEffect, useRef } from 'react';
import { storage } from '@/utils/storage';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore, DEFAULT_MARKUP_ORDER } from '@/stores/itemsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useBidLevelingStore } from '@/stores/bidLevelingStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import { SEED_ELEMENTS } from '@/constants/seedAssemblies';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useAlternatesStore } from '@/stores/alternatesStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useReportsStore } from '@/stores/reportsStore';
import { useDocumentsStore } from '@/stores/documentsStore';
import { useModuleStore, migrateModuleInstances } from '@/stores/moduleStore';
import { useUiStore } from '@/stores/uiStore';
import { useScanStore } from '@/stores/scanStore';
import * as cloudSync from '@/utils/cloudSync';

// Load all persisted data on mount
export function usePersistenceLoad() {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    (async () => {
      let localHasData = false;

      // Load estimates index
      const idxRaw = await storage.get("bldg-index");
      if (idxRaw) {
        try {
          const parsed = JSON.parse(idxRaw.value);
          // Migrate: ensure all index entries have companyProfileId
          const migrated = parsed.map(e =>
            e.companyProfileId === undefined ? { ...e, companyProfileId: "" } : e
          );
          useEstimatesStore.getState().setEstimatesIndex(migrated);
          if (migrated.some((e, i) => e !== parsed[i])) {
            await storage.set("bldg-index", JSON.stringify(migrated));
          }
          if (migrated.length > 0) localHasData = true;
        } catch {}
      }

      // Load master data
      const masterRaw = await storage.get("bldg-master");
      if (masterRaw) {
        try {
          const master = JSON.parse(masterRaw.value);
          useMasterDataStore.getState().setMasterData({
            ...useMasterDataStore.getState().masterData,
            ...master,
          });
          localHasData = true;
        } catch {}
      }

      // Load app settings
      const settingsRaw = await storage.get("bldg-settings");
      if (settingsRaw) {
        try {
          const settings = JSON.parse(settingsRaw.value);
          useUiStore.getState().setAppSettings({
            ...useUiStore.getState().appSettings,
            ...settings,
          });
        } catch {}
      }
      // Migrate: ensure defaultMarkupOrder has all standard keys and `active` field
      {
        const as = useUiStore.getState().appSettings;
        const saved = as.defaultMarkupOrder || [];
        const savedKeys = new Set(saved.map(m => m.key));
        const missing = DEFAULT_MARKUP_ORDER.filter(m => !savedKeys.has(m.key));
        // Pre-launch: entries missing `active` default to false (user picks their own)
        const merged = [
          ...saved.map(m => ({ ...m, active: m.active !== undefined ? m.active : false })),
          ...missing,
        ];
        if (missing.length > 0 || saved.some(m => m.active === undefined)) {
          useUiStore.getState().updateSetting("defaultMarkupOrder", merged);
        }
        // Also ensure defaultMarkup has overheadAndProfit key
        if (as.defaultMarkup && as.defaultMarkup.overheadAndProfit === undefined) {
          useUiStore.getState().updateSetting("defaultMarkup.overheadAndProfit", 20);
        }
      }

      // Load assemblies (global library)
      const asmRaw = await storage.get("bldg-assemblies");
      if (asmRaw) {
        try {
          useDatabaseStore.getState().setAssemblies(JSON.parse(asmRaw.value));
        } catch {}
      }

      // Load proposal templates
      await useReportsStore.getState().loadTemplatesFromStorage();

      // Load scan learning records (global)
      await useScanStore.getState().loadLearningRecords();

      // ─── Cloud Pull: if local is empty, try pulling from cloud ───
      if (!localHasData) {
        try {
          // Pull estimates index
          const cloudIndex = await cloudSync.pullData('index');
          if (cloudIndex && Array.isArray(cloudIndex) && cloudIndex.length > 0) {
            useEstimatesStore.getState().setEstimatesIndex(cloudIndex);
            await storage.set("bldg-index", JSON.stringify(cloudIndex));

            // Pull all estimates and cache locally
            const cloudEstimates = await cloudSync.pullAllEstimates();
            for (const ce of cloudEstimates) {
              await storage.set(`bldg-est-${ce.estimate_id}`, JSON.stringify(ce.data));
            }
          }

          // Pull master data
          const cloudMaster = await cloudSync.pullData('master');
          if (cloudMaster) {
            useMasterDataStore.getState().setMasterData({
              ...useMasterDataStore.getState().masterData,
              ...cloudMaster,
            });
            await storage.set("bldg-master", JSON.stringify(cloudMaster));
          }

          // Pull settings
          const cloudSettings = await cloudSync.pullData('settings');
          if (cloudSettings) {
            useUiStore.getState().setAppSettings({
              ...useUiStore.getState().appSettings,
              ...cloudSettings,
            });
            await storage.set("bldg-settings", JSON.stringify(cloudSettings));
          }

          // Pull assemblies
          const cloudAsm = await cloudSync.pullData('assemblies');
          if (cloudAsm && Array.isArray(cloudAsm)) {
            useDatabaseStore.getState().setAssemblies(cloudAsm);
            await storage.set("bldg-assemblies", JSON.stringify(cloudAsm));
          }
        } catch (err) {
          console.warn('[usePersistence] Cloud pull failed:', err);
        }
      }

      // Signal that persistence load is complete — auto-save can now safely write
      useUiStore.getState().setPersistenceLoaded(true);
    })();
  }, []);
}

// Load a specific estimate into stores
export async function loadEstimate(id) {
  let raw = await storage.get(`bldg-est-${id}`);

  // If not in IndexedDB, try cloud
  if (!raw) {
    try {
      let cloudData = await cloudSync.pullEstimate(id);
      if (cloudData) {
        // Hydrate blobs from Supabase Storage (drawings, documents, specPdf)
        cloudData = await cloudSync.hydrateBlobs(cloudData);
        // Cache locally with hydrated blobs for next time
        await storage.set(`bldg-est-${id}`, JSON.stringify(cloudData));
        raw = { value: JSON.stringify(cloudData) };
      }
    } catch (err) {
      console.warn('[loadEstimate] Cloud pull failed:', err);
    }
  }

  // Check if locally cached data has stripped blobs that need hydration
  if (raw) {
    try {
      const parsed = JSON.parse(raw.value);
      const hasStrippedBlobs = (Array.isArray(parsed.drawings) && parsed.drawings.some(d => d._cloudBlobStripped && d.storagePath && !d.data))
        || (Array.isArray(parsed.documents) && parsed.documents.some(d => d._cloudBlobStripped && d.storagePath && !d.data))
        || (parsed._specPdfStripped && parsed._specPdfStoragePath && !parsed.specPdf);
      if (hasStrippedBlobs) {
        const hydrated = await cloudSync.hydrateBlobs(parsed);
        await storage.set(`bldg-est-${id}`, JSON.stringify(hydrated));
        raw = { value: JSON.stringify(hydrated) };
      }
    } catch (err) {
      console.warn('[loadEstimate] Blob hydration failed:', err);
    }
  }

  // Fallback: if drawings/docs still have no data (stale cache from before blob sync),
  // re-pull from cloud where storagePaths may now be available, then hydrate
  if (raw) {
    try {
      const parsed = JSON.parse(raw.value);
      const drawingsMissing = Array.isArray(parsed.drawings) && parsed.drawings.length > 0
        && parsed.drawings.some(d => !d.data);
      const docsMissing = Array.isArray(parsed.documents) && parsed.documents.length > 0
        && parsed.documents.some(d => !d.data);

      if (drawingsMissing || docsMissing) {
        console.log('[loadEstimate] Drawings/docs missing data, refreshing from cloud...');
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

          await storage.set(`bldg-est-${id}`, JSON.stringify(merged));
          raw = { value: JSON.stringify(merged) };
        }
      }
    } catch (err) {
      console.warn('[loadEstimate] Cloud blob refresh failed:', err);
    }
  }

  if (!raw) return false;

  try {
    const data = JSON.parse(raw.value);

    useProjectStore.getState().setProject(data.project || useProjectStore.getState().project);
    useProjectStore.getState().setCodeSystem(data.codeSystem || "csi-commercial");
    useProjectStore.getState().setCustomCodes(data.customCodes || {});
    useItemsStore.getState().setItems(data.items || []);
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
      const merged = [
        ...cur.map(m => ({ ...m, active: m.active !== undefined ? m.active : true })),
        ...missing,
      ];
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
    useTakeoffsStore.getState().setTakeoffs(migratedTakeoffs);
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
    useModuleStore.getState().setActiveModule(
      (data.activeModule || data.activeBuilder || "") === "framing" ? "walls" : (data.activeModule || data.activeBuilder || null)
    );

    // Restore scan results if present
    if (data.scanResults) {
      useScanStore.getState().setScanResults(data.scanResults);
    } else {
      useScanStore.getState().clearScan();
    }

    if (data.elements && data.elements.length > 0) {
      // Merge any new seed elements not already in saved data
      const existingCodes = new Set(data.elements.map(e => e.code + '|' + e.name));
      const missing = SEED_ELEMENTS.filter(se => !existingCodes.has(se.code + '|' + se.name));
      useDatabaseStore.getState().setElements(missing.length > 0 ? [...data.elements, ...missing] : data.elements);
    }

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

  const data = {
    project: useProjectStore.getState().project,
    codeSystem: useProjectStore.getState().codeSystem,
    customCodes: useProjectStore.getState().customCodes,
    items: useItemsStore.getState().items,
    markup: useItemsStore.getState().markup,
    markupOrder: useItemsStore.getState().markupOrder,
    customMarkups: useItemsStore.getState().customMarkups,
    changeOrders: useItemsStore.getState().changeOrders,
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
    elements: useDatabaseStore.getState().elements,
    scanResults: useScanStore.getState().scanResults,
  };

  await storage.set(`bldg-est-${id}`, JSON.stringify(data));

  // Update index entry
  const totals = useItemsStore.getState().getTotals();
  useEstimatesStore.getState().updateIndexEntry(id, {
    name: data.project.name,
    client: data.project.client,
    status: data.project.status,
    bidDue: data.project.bidDue,
    grandTotal: totals.grand,
    elementCount: data.items.length,
    lastModified: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
    estimator: data.project.estimator,
    jobType: data.project.jobType,
    companyProfileId: data.project.companyProfileId || "",
  });

  const idx = useEstimatesStore.getState().estimatesIndex;
  await storage.set("bldg-index", JSON.stringify(idx));

  // ─── Cloud Push (non-blocking) ───
  cloudSync.pushEstimate(id, data).catch(() => {});
  cloudSync.pushData('index', idx).catch(() => {});
}

// Save master data
export async function saveMasterData() {
  const master = useMasterDataStore.getState().masterData;
  await storage.set("bldg-master", JSON.stringify(master));

  // Cloud push (non-blocking)
  cloudSync.pushData('master', master).catch(() => {});
}

// Save app settings
export async function saveSettings() {
  const settings = useUiStore.getState().appSettings;
  await storage.set("bldg-settings", JSON.stringify(settings));

  // Cloud push (non-blocking)
  cloudSync.pushData('settings', settings).catch(() => {});
}

// Save assemblies (global library)
export async function saveAssemblies() {
  const assemblies = useDatabaseStore.getState().assemblies;
  await storage.set("bldg-assemblies", JSON.stringify(assemblies));

  // Cloud push (non-blocking)
  cloudSync.pushData('assemblies', assemblies).catch(() => {});
}
