/**
 * Persistence — Estimate I/O (load + save).
 * Extracted from usePersistence.js. These are the two hottest functions:
 * loadEstimate reads IDB → solo key → bare key → brute force → cloud → blob hydration,
 * saveEstimate guards org lock, deleted race, index validation, data loss prevention.
 */

import { storage } from "@/utils/storage";

// ── Save failure backoff: suppress repeated toast spam ──
let _lastSaveFailToast = 0;
const SAVE_FAIL_COOLDOWN_MS = 30_000; // only show toast once per 30s
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore, DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useModuleStore, migrateModuleInstances } from "@/stores/moduleStore";
import { useUiStore } from "@/stores/uiStore";
import { useDiscoveryStore } from "@/stores/discoveryStore";
import { useGroupsStore, DEFAULT_GROUPS } from "@/stores/groupsStore";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { peekPendingSessions, drainPendingSessions } from "@/hooks/useActivityTracker";
import { markDirtyEstimate, clearDirtyEstimate } from "@/hooks/persistenceCleanup";
import { saveUserLibrary } from "@/hooks/persistenceGlobal";

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
    useDrawingPipelineStore.getState().clearPredictions();
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
    useDrawingPipelineStore.getState().setDrawings(data.drawings || []);
    useDrawingPipelineStore.getState().setDrawingScales(data.drawingScales || {});
    useDrawingPipelineStore.getState().setDrawingDpi(data.drawingDpi || {});
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
    useDrawingPipelineStore.getState().setTakeoffs(takeoffsWithContext);
    useDrawingPipelineStore.getState().setTkCalibrations(data.tkCalibrations || {});
    useBidManagementStore.getState().setSubBidSubs(data.subBidSubs || {});
    useBidManagementStore.getState().setBidTotals(data.bidTotals || {});
    useBidManagementStore.getState().setBidCells(data.bidCells || {});
    useBidManagementStore.getState().setBidSelections(data.bidSelections || {});
    useBidManagementStore.getState().setLinkedSubs(data.linkedSubs || []);
    useBidManagementStore.getState().setSubKeyLabels(data.subKeyLabels || {});
    useBidManagementStore.getState().setPreferredSubs(data.preferredSubs || {});
    useDocumentManagementStore.getState().setSpecs(data.specs || []);
    useDocumentManagementStore.getState().setSpecPdf(data.specPdf || null);
    useDocumentManagementStore.getState().setExclusions(data.exclusions || []);
    useDocumentManagementStore.getState().setClarifications(data.clarifications || []);
    useAlternatesStore.getState().setAlternates(data.alternates || []);
    useCollaborationStore.getState().setCorrespondences(data.correspondences || []);
    useDocumentManagementStore.getState().setDocuments(data.documents || []);
    useDocumentManagementStore.getState().setTagPalette(data.docTagPalette || []);
    useDocumentManagementStore.getState().setTransmittals(data.docTransmittals || []);
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
      useDrawingPipelineStore.getState().setScanResults(data.scanResults);
    } else {
      useDrawingPipelineStore.getState().clearScan();
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
    useBidManagementStore.getState().setBidPackages(data.bidPackages || []);
    useBidManagementStore.getState().setInvitations(data.bidInvitations || {});
    useBidManagementStore.getState().setProposals(data.bidProposals || {});
    useBidManagementStore.getState().setScopeGapResults(data.bidScopeGapResults || {});

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

    // Restore 3D model metadata
    useDrawingPipelineStore.getState().reset();
    if (data.modelOutlines) useDrawingPipelineStore.setState({ outlines: data.modelOutlines });
    if (data.modelFloorAssignments) useDrawingPipelineStore.setState({ floorAssignments: data.modelFloorAssignments });
    if (data.modelFloorHeight) useDrawingPipelineStore.setState({ floorHeight: data.modelFloorHeight });
    if (data.modelFloorHeights) useDrawingPipelineStore.setState({ floorHeights: data.modelFloorHeights });
    if (data.modelSpecOverrides) useDrawingPipelineStore.setState({ specOverrides: data.modelSpecOverrides });
    if (data.modelMaterialAssignments) useDrawingPipelineStore.setState({ materialAssignments: data.modelMaterialAssignments });
    if (data.modelViewMode) useDrawingPipelineStore.setState({ viewMode: data.modelViewMode });
    if (data.modelAutoGenerated) useDrawingPipelineStore.setState({ autoGenerated: true });
    if (data.modelIfcLoaded && data.modelIfcElements) {
      // IFC elements were persisted — restore them directly
      useDrawingPipelineStore.setState({ elements: data.modelIfcElements, ifcLoaded: true });
    }
    // Note: auto-generated elements are NOT persisted — they'll be regenerated
    // from takeoffs by ModelTab's useEffect when the user opens the Model tab.

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

  // Capture org context at entry — used to detect org-switch during async save
  const saveOrgId = useOrgStore.getState().org?.id || null;

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
    drawings: useDrawingPipelineStore.getState().drawings,
    drawingScales: useDrawingPipelineStore.getState().drawingScales,
    drawingDpi: useDrawingPipelineStore.getState().drawingDpi,
    takeoffs: useDrawingPipelineStore.getState().takeoffs,
    tkCalibrations: useDrawingPipelineStore.getState().tkCalibrations,
    subBidSubs: useBidManagementStore.getState().subBidSubs,
    bidTotals: useBidManagementStore.getState().bidTotals,
    bidCells: useBidManagementStore.getState().bidCells,
    bidSelections: useBidManagementStore.getState().bidSelections,
    linkedSubs: useBidManagementStore.getState().linkedSubs,
    subKeyLabels: useBidManagementStore.getState().subKeyLabels,
    preferredSubs: useBidManagementStore.getState().preferredSubs,
    exclusions: useDocumentManagementStore.getState().exclusions,
    clarifications: useDocumentManagementStore.getState().clarifications,
    specs: useDocumentManagementStore.getState().specs,
    specPdf: useDocumentManagementStore.getState().specPdf,
    alternates: useAlternatesStore.getState().alternates,
    correspondences: useCollaborationStore.getState().correspondences,
    documents: useDocumentManagementStore.getState().documents,
    docTagPalette: useDocumentManagementStore.getState().tagPalette,
    docTransmittals: useDocumentManagementStore.getState().transmittals,
    novaCorrections: useCorrectionStore.getState().corrections,
    novaCorrectionPatterns: useCorrectionStore.getState().globalPatterns,
    novaFirmMemory: useFirmMemoryStore.getState().firms,
    moduleInstances: useModuleStore.getState().moduleInstances,
    activeModule: useModuleStore.getState().activeModule,
    elements: useDatabaseStore.getState().getUserElements(),
    subdivisionData: useSubdivisionStore.getState().subdivisionData,
    subdivisionOverrides: useSubdivisionStore.getState().userOverrides,
    subdivisionLlm: useSubdivisionStore.getState().llmRefinements,
    scanResults: useDrawingPipelineStore.getState().scanResults,
    discoveryIndex: useDiscoveryStore.getState().discoveryIndex,
    groups: useGroupsStore.getState().groups,
    bidPackages: useBidManagementStore.getState().bidPackages,
    bidInvitations: useBidManagementStore.getState().invitations,
    bidProposals: useBidManagementStore.getState().proposals,
    bidScopeGapResults: useBidManagementStore.getState().scopeGapResults,
    // 3D model metadata (persisted to survive refresh)
    modelOutlines: useDrawingPipelineStore.getState().outlines,
    modelFloorAssignments: useDrawingPipelineStore.getState().floorAssignments,
    modelFloorHeight: useDrawingPipelineStore.getState().floorHeight,
    modelFloorHeights: useDrawingPipelineStore.getState().floorHeights,
    modelSpecOverrides: useDrawingPipelineStore.getState().specOverrides,
    modelViewMode: useDrawingPipelineStore.getState().viewMode,
    modelAutoGenerated: useDrawingPipelineStore.getState().autoGenerated,
    modelIfcLoaded: useDrawingPipelineStore.getState().ifcLoaded,
    modelMaterialAssignments: useDrawingPipelineStore.getState().materialAssignments,
    // IFC elements can't be regenerated (user uploaded a file) — persist them
    modelIfcElements: useDrawingPipelineStore.getState().ifcLoaded ? useDrawingPipelineStore.getState().elements : undefined,
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

  // Guard: abort if org context changed during async save (prevents cross-org writes)
  const currentOrgId = useOrgStore.getState().org?.id || null;
  if (currentOrgId !== saveOrgId) {
    console.error("[saveEstimate] Org context changed during save — aborting to prevent cross-org write");
    return;
  }

  const estOk = await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(data));
  if (!estOk) {
    // Throttle toast — only show once per 30s to prevent spam on repeated save attempts
    const now = Date.now();
    if (now - _lastSaveFailToast > SAVE_FAIL_COOLDOWN_MS) {
      _lastSaveFailToast = now;
      useUiStore.getState().showToast("Save failed — check storage space", "error");
    }
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
    ownerId: data.project.createdBy || data.project.ownerId || useAuthStore.getState().user?.id || null,
    updatedBy: useAuthStore.getState().user?.id || null,
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
    // AND it's not in the deleted-IDs set (prevents zombie resurrection)
    let isInDeletedSet = false;
    try {
      const delRaw2 = await storage.get(idbKey("bldg-deleted-ids"));
      const delIds2 = delRaw2 ? JSON.parse(delRaw2.value) : [];
      try {
        const userId2 = useAuthStore.getState().user?.id;
        const lsKey2 = `bldg-deleted-ids-${userId2 || "anon"}`;
        const lsRaw2 = localStorage.getItem(lsKey2);
        if (lsRaw2) {
          for (const d of JSON.parse(lsRaw2)) {
            if (!delIds2.includes(d)) delIds2.push(d);
          }
        }
      } catch { /* ignore */ }
      isInDeletedSet = delIds2.includes(id);
    } catch { /* proceed cautiously */ }

    if (isInDeletedSet) {
      console.warn("[saveEstimate] Estimate is in deleted-IDs set — refusing to re-add to index for", id);
      return;
    }

    const stillActive = useEstimatesStore.getState().activeEstimateId === id;
    if (stillActive) {
      const newEntry = { id, ...entryFields };
      useEstimatesStore.getState().setEstimatesIndex(prev => [...prev, newEntry]);
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
    // Push estimate data (RPC writes blob + normalized columns atomically).
    // Index blob no longer pushed — normalized columns on user_estimates are authoritative.
    Promise.all([
      cloudSync.pushEstimate(id, data),
    ])
      .then(() => {
        clearDirtyEstimate(id);
      })
      .catch(err => {
        console.warn("[usePersistence] Cloud push failed (estimate or index):", err?.message);
        markDirtyEstimate(id);
      });
  } else {
    console.warn("[usePersistence] Estimate deleted during save — skipping cloud push for", id);
  }
}
