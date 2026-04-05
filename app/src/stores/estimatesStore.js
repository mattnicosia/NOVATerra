import { create } from "zustand";
import { uid, today, nowStr } from "@/utils/format";
import { storage } from "@/utils/storage";
import { useUiStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useModuleStore } from "@/stores/moduleStore";

import { useMasterDataStore } from "@/stores/masterDataStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";
import { TEMPLATE_MAP, resolveTemplateItems } from "@/constants/seedTemplates";
import { autoDirective } from "@/utils/directives";
import { autoTradeFromCode } from "@/constants/tradeGroupings";

// ═══ NUCLEAR ZOMBIE GUARD ═══
// In-memory set of deleted estimate IDs. Populated on delete + startup hydration.
// A Zustand subscriber watches estimatesIndex — ANY write from ANY code path
// (setEstimatesIndex, setState, functional setState) is intercepted and filtered.
// This makes resurrection physically impossible regardless of which code path runs.
const _deletedIds = new Set();

/** Mark an ID as permanently deleted (in-memory guard). */
export const markDeleted = id => {
  _deletedIds.add(id);
};

/** Hydrate the in-memory guard from an array of IDs (called on startup). */
export const hydrateDeletedIds = ids => {
  if (Array.isArray(ids)) ids.forEach(id => _deletedIds.add(id));
};

export const useEstimatesStore = create((set, get) => ({
  estimatesIndex: [],
  activeEstimateId: null,
  draftId: null, // Non-null when estimate is a draft (not yet persisted to DB)

  setEstimatesIndex: v => {
    if (!Array.isArray(v)) return set({ estimatesIndex: [] });
    // Dedup by estimate ID — keep the LAST occurrence (most recent push wins)
    const seen = new Map();
    for (const entry of v) {
      if (entry?.id) seen.set(entry.id, entry);
    }
    set({ estimatesIndex: [...seen.values()] });
  },
  setActiveEstimateId: v => set({ activeEstimateId: v }),
  clearDraft: () => set({ draftId: null }),

  createEstimate: async (companyProfileId, estimateNumber, templateId) => {
    const id = uid();
    const settings = useUiStore.getState().appSettings;

    // Resolve template (if provided)
    const template = templateId ? TEMPLATE_MAP.get(templateId) : null;
    const templateProject = template?.project || {};
    const templateMarkup = template?.markup || null;

    // Build pre-populated items from template
    let templateItems = [];
    if (template) {
      const presets = resolveTemplateItems(template);
      templateItems = presets.map(p => ({
        id: uid(),
        code: p.code || "",
        description: p.name || "",
        division: "",
        quantity: p.quantity ?? 0,
        unit: p.unit || "EA",
        material: p.material || 0,
        labor: p.labor || 0,
        equipment: p.equipment || 0,
        subcontractor: p.subcontractor || 0,
        trade: p.trade || autoTradeFromCode(p.code) || "",
        directive: autoDirective(p.material || 0, p.labor || 0, p.equipment || 0, p.subcontractor || 0),
        notes: "",
        drawingRef: "",
        variables: [],
        formula: "",
        specSection: "",
        specText: "",
        specVariantLabel: "",
        allowanceOf: "",
        allowanceSubMarkup: "",
        locationLocked: false,
        subItems: [],
        bidContext: "base",
      }));
    }

    const estimateName = template ? template.name : "New Estimate";

    // Add to index immediately so the estimate is visible on the dashboard
    // even if the user navigates away before auto-save fires.
    const { ownerId, orgId } = get()._getOwnership();
    const newEntry = {
      id,
      name: estimateName,
      estimateNumber: estimateNumber || "",
      client: "",
      status: "Bidding",
      bidDue: "",
      startDate: today(),
      estimatedHours: 0,
      grandTotal: 0,
      elementCount: templateItems.length,
      lastModified: nowStr(),
      estimator: "",
      coEstimators: [],
      jobType: "",
      companyProfileId: companyProfileId || "",
      buildingType: templateProject.buildingType || "",
      workType: templateProject.workType || "",
      architect: "",
      projectSF: 0,
      zipCode: "",
      divisionTotals: {},
      outcomeMetadata: {},
      ownerId,
      orgId,
      assignedTo: ownerId ? [ownerId] : [],
      templateId: templateId || null,
      correspondenceCount: 0,
      correspondencePendingCount: 0,
      correspondenceNextDue: "",
      correspondenceTotalHours: 0,
      sourceRfpId: "",
      emailCount: 0,
      lastEmailAt: "",
      schedulePauses: [], // [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD", reason: "" }]
      manualPercentComplete: null, // number | null — overrides auto-calculated %
      manualHoursLogged: null, // number | null — overrides timer-based hours logged
      delegatedBy: "", // name of estimator who delegated (empty = direct assignment)
      visibility: "private",
    };
    set(s => ({
      activeEstimateId: id,
      estimatesIndex: [...s.estimatesIndex, newEntry],
    }));

    // Build markup from template or use defaults
    const finalMarkup = templateMarkup
      ? { ...templateMarkup }
      : { overhead: 10, profit: 10, contingency: 5, generalConditions: 0, insurance: 2, tax: 0, bond: 0 };

    // Save estimate data to IndexedDB so loadEstimate can hydrate stores
    const data = {
      project: {
        name: estimateName,
        client: "",
        architect: "",
        engineer: "",
        estimator: "",
        coEstimators: [],
        estimateNumber: estimateNumber || "",
        address: "",
        date: today(),
        bidDue: "",
        bidDueTime: "",
        walkthroughDate: "",
        walkthroughTime: "",
        rfiDueDate: "",
        rfiDueTime: "",
        otherDueDate: "",
        otherDueLabel: "",
        description: template ? `Created from "${template.name}" template` : "",
        projectSF: "",
        jobType: "",
        buildingType: templateProject.buildingType || "",
        workType: templateProject.workType || "",
        bidType: "Hard Bid",
        bidDelivery: "",
        bidRequirements: {},
        status: "Bidding",
        referredByType: "",
        referredByName: "",
        outcomeMetadata: {},
        laborType: settings.defaultLaborType || "open_shop",
        companyProfileId: companyProfileId || "",
        setupComplete: false, // triggers document-first onboarding
        ownerId,
        orgId,
      },
      codeSystem: "csi-commercial",
      items: templateItems,
      markup: finalMarkup,
      markupOrder: [
        { key: "overhead", label: "Overhead", compound: false },
        { key: "profit", label: "Profit", compound: false },
        { key: "contingency", label: "Contingency", compound: false },
        { key: "generalConditions", label: "General Conditions", compound: false },
        { key: "insurance", label: "Insurance", compound: false },
      ],
      customMarkups: [],
      changeOrders: [],
      drawings: [],
      takeoffs: [],
      drawingScales: {},
      drawingDpi: {},
      tkCalibrations: {},
      subBidSubs: {},
      bidTotals: {},
      bidCells: {},
      bidSelections: {},
      linkedSubs: [],
      subKeyLabels: {},
      preferredSubs: {},
      exclusions: (() => {
        const profile = useMasterDataStore.getState().getCompanyInfo(companyProfileId);
        return (profile?.boilerplateExclusions || [])
          .filter(e => e.text)
          .map(e => ({ id: uid(), text: e.text, source: "boilerplate" }));
      })(),
      clarifications: (() => {
        const profile = useMasterDataStore.getState().getCompanyInfo(companyProfileId);
        return (profile?.boilerplateNotes || [])
          .filter(n => n.text)
          .map(n => ({ id: uid(), text: n.text, category: n.category || "clarification", source: "boilerplate" }));
      })(),
      specs: [],
      specPdf: null,
      alternates: [],
      correspondences: [],
      documents: [],
    };
    await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(data));

    // Persist index immediately so the estimate survives a page reload
    const idx = get().estimatesIndex;
    const idxJson = JSON.stringify(idx);
    storage.set(idbKey("bldg-index"), idxJson).catch(() => {});

    // Mirror index to localStorage — resilient backup
    try {
      const authUserId = useAuthStore.getState().user?.id;
      if (authUserId) localStorage.setItem(`bldg-index-mirror-${authUserId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // Cloud sync estimate data (non-blocking)
    // Guard: skip if startup cloud sync hasn't finished yet (prevents race where
    // a partial local index overwrites the complete cloud index)
    if (!useUiStore.getState().cloudSyncInProgress) {
      cloudSync.pushEstimate(id, data).catch(() => {});
    }

    return id;
  },

  // Get ownership metadata for new estimates
  _getOwnership: () => {
    const userId = useAuthStore.getState().user?.id;
    const org = useOrgStore.getState().org;
    return {
      ownerId: userId || null,
      orgId: org?.id || null,
    };
  },

  // Create a draft estimate in memory only — no IndexedDB or cloud persistence.
  // Hydrates all stores with blank defaults so the Project Info page can render.
  // The first Save on ProjectInfoPage will persist to IndexedDB.
  initDraftEstimate: companyProfileId => {
    const id = uid();
    const settings = useUiStore.getState().appSettings;

    const blankProject = {
      name: "",
      client: "",
      architect: "",
      engineer: "",
      estimator: "",
      coEstimators: [],
      address: "",
      date: today(),
      startDate: today(),
      estimatedHours: "",
      bidDue: "",
      bidDueTime: "",
      walkthroughDate: "",
      rfiDueDate: "",
      otherDueDate: "",
      otherDueLabel: "",
      description: "",
      projectSF: "",
      jobType: "",
      buildingType: "",
      workType: "",
      bidType: "Hard Bid",
      bidDelivery: "",
      bidRequirements: {},
      status: "Bidding",
      referredByType: "",
      referredByName: "",
      outcomeMetadata: {},
      laborType: settings.defaultLaborType || "open_shop",
      companyProfileId: companyProfileId || "",
    };
    const blankMarkup = {
      overhead: 10,
      profit: 10,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
      overheadAndProfit: 20,
    };
    const blankMarkupOrder = [
      { key: "overhead", label: "Overhead", compound: false, active: true },
      { key: "profit", label: "Profit", compound: false, active: true },
      { key: "contingency", label: "Contingency", compound: false, active: true },
      { key: "generalConditions", label: "General Conditions", compound: false, active: false },
      { key: "insurance", label: "Insurance", compound: false, active: true },
    ];

    // Hydrate all stores with blank data (same stores as loadEstimate in usePersistence.js)
    useProjectStore.getState().setProject(blankProject);
    useProjectStore.getState().setCodeSystem("csi-commercial");
    useProjectStore.getState().setCustomCodes({});
    useItemsStore.getState().setItems([]);
    useItemsStore.getState().setMarkup(blankMarkup);
    useItemsStore.getState().setMarkupOrder(blankMarkupOrder);
    useItemsStore.getState().setCustomMarkups([]);
    useItemsStore.getState().setChangeOrders([]);
    useDrawingPipelineStore.getState().setDrawings([]);
    useDrawingPipelineStore.getState().setDrawingScales({});
    useDrawingPipelineStore.getState().setDrawingDpi({});
    useDrawingPipelineStore.getState().setTakeoffs([]);
    useDrawingPipelineStore.getState().setTkCalibrations({});
    useBidManagementStore.getState().setSubBidSubs({});
    useBidManagementStore.getState().setBidTotals({});
    useBidManagementStore.getState().setBidCells({});
    useBidManagementStore.getState().setBidSelections({});
    useBidManagementStore.getState().setLinkedSubs([]);
    useBidManagementStore.getState().setSubKeyLabels({});
    useDocumentManagementStore.getState().setSpecs([]);
    useDocumentManagementStore.getState().setSpecPdf(null);
    // Auto-populate boilerplate from company profile
    const draftProfile = useMasterDataStore.getState().getCompanyInfo(companyProfileId);
    const bpExclusions = (draftProfile?.boilerplateExclusions || [])
      .filter(e => e.text)
      .map(e => ({ id: uid(), text: e.text, source: "boilerplate" }));
    const bpClarifications = (draftProfile?.boilerplateNotes || [])
      .filter(n => n.text)
      .map(n => ({ id: uid(), text: n.text, category: n.category || "clarification", source: "boilerplate" }));
    useDocumentManagementStore.getState().setExclusions(bpExclusions);
    useDocumentManagementStore.getState().setClarifications(bpClarifications);
    useAlternatesStore.getState().setAlternates([]);
    useDocumentManagementStore.getState().setDocuments([]);
    useModuleStore.getState().setModuleInstances({});
    useModuleStore.getState().setActiveModule(null);
    useDrawingPipelineStore.getState().clearScan();

    // Clear NOVA chat from previous estimate
    useUiStore.getState().setAiChatMessages([]);

    // Set active ID last — EstimateLoader checks activeId === id to skip DB load
    set({ activeEstimateId: id, draftId: id });

    return id;
  },

  deleteEstimate: async id => {
    // STEP 0: In-memory guard — instant, synchronous, no async dependency
    _deletedIds.add(id);

    // STEP 1: Track deleted-ID FIRST — crash-safe. If app dies after this but
    // before index removal, the ID is recorded and cloud sync won't resurrect it.
    try {
      const raw = await storage.get(idbKey("bldg-deleted-ids"));
      const deletedIds = raw ? JSON.parse(raw.value) : [];
      if (!deletedIds.includes(id)) deletedIds.push(id);
      await storage.set(idbKey("bldg-deleted-ids"), JSON.stringify(deletedIds));
      // Backup to localStorage (survives IndexedDB clears)
      const lsKey = `bldg-deleted-ids-${useAuthStore.getState().user?.id || "anon"}`;
      localStorage.setItem(lsKey, JSON.stringify(deletedIds));
    } catch (err) {
      console.error("[deleteEstimate] Failed to track deleted ID — estimate may resurrect from cloud:", err);
    }

    // STEP 2: Remove from Zustand index (atomic)
    set(s => ({
      estimatesIndex: s.estimatesIndex.filter(e => e.id !== id),
      activeEstimateId: s.activeEstimateId === id ? null : s.activeEstimateId,
    }));
    const idx = get().estimatesIndex; // read after atomic set
    const idxJson = JSON.stringify(idx);
    await storage.set(idbKey("bldg-index"), idxJson);
    await storage.delete(idbKey(`bldg-est-${id}`));

    // Mirror index to localStorage — resilient backup that survives IDB eviction
    try {
      const authUserId = useAuthStore.getState().user?.id;
      if (authUserId) localStorage.setItem(`bldg-index-mirror-${authUserId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // STEP 3: Cloud sync — await so deletion completes before user closes app
    try {
      await cloudSync.deleteEstimate(id);
    } catch (err) {
      console.warn("[deleteEstimate] Cloud sync failed, will retry on next sync:", err.message);
    }
  },

  duplicateEstimate: async id => {
    const raw = await storage.get(idbKey(`bldg-est-${id}`));
    if (!raw) return;
    const data = JSON.parse(raw.value);
    const newId = uid();
    const { ownerId, orgId } = get()._getOwnership();
    data.project.name = data.project.name + " (Copy)";
    data.project.ownerId = ownerId;
    data.project.orgId = orgId;
    await storage.set(idbKey(`bldg-est-${newId}`), JSON.stringify(data));

    const src = get().estimatesIndex.find(e => e.id === id);
    if (!src) return; // guard against stale reference
    const newEntry = { ...src, id: newId, name: data.project.name, lastModified: nowStr(), ownerId, orgId };
    set(s => ({ estimatesIndex: [...s.estimatesIndex, newEntry] }));
    const idx = get().estimatesIndex; // read after atomic set
    const idxJson = JSON.stringify(idx);
    await storage.set(idbKey("bldg-index"), idxJson);

    // Mirror index to localStorage — resilient backup
    try {
      const authUserId = useAuthStore.getState().user?.id;
      if (authUserId) localStorage.setItem(`bldg-index-mirror-${authUserId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // Cloud sync (non-blocking)
    if (!useUiStore.getState().cloudSyncInProgress) {
      cloudSync.pushEstimate(newId, data).catch(() => {});
    }

    return newId;
  },

  // ── Create a revision of an existing estimate ──
  // Clones ALL data (items, markup, sub leveling, bid packages, alternates, etc.)
  // Links back to parent via parentEstimateId + revisionNumber.
  // The parent estimate keeps its status; the revision starts as "Bidding".
  createRevision: async (parentId, { revisionReason } = {}) => {
    const raw = await storage.get(idbKey(`bldg-est-${parentId}`));
    if (!raw) return null;

    const parentData = JSON.parse(raw.value);
    const newId = uid();
    const { ownerId, orgId } = get()._getOwnership();

    // Determine revision number from existing chain
    const allEstimates = get().estimatesIndex;
    const siblings = allEstimates.filter(e => e.parentEstimateId === parentId || e.id === parentId);
    const maxRev = siblings.reduce((max, e) => Math.max(max, e.revisionNumber || 0), 0);
    const revisionNumber = maxRev + 1;

    // Deep-clone the data blob — preserves everything:
    // items, markup, markupOrder, customMarkups, drawings, takeoffs,
    // sub leveling (subBidSubs, bidTotals, bidCells, bidSelections, linkedSubs),
    // bid packages, alternates, exclusions, clarifications, specs, etc.
    const clonedData = structuredClone(parentData);

    // Update project metadata for the revision
    const parentName = clonedData.project.name || "Untitled";
    clonedData.project.name = `${parentName} — Rev ${revisionNumber}`;
    clonedData.project.status = "Bidding";
    clonedData.project.ownerId = ownerId;
    clonedData.project.orgId = orgId;
    clonedData.project.parentEstimateId = parentId;
    clonedData.project.revisionNumber = revisionNumber;
    clonedData.project.revisionReason = revisionReason || "";
    clonedData.project.revisionCreatedAt = nowStr();

    // Re-generate IDs for items to avoid cross-estimate ID conflicts
    // but maintain internal references (subItems, linkedItemId in alternates)
    const itemIdMap = {};
    if (clonedData.items) {
      clonedData.items = clonedData.items.map(item => {
        const oldId = item.id;
        const newItemId = uid();
        itemIdMap[oldId] = newItemId;
        return { ...item, id: newItemId };
      });
    }

    // Remap alternate linkedItemIds
    if (clonedData.alternates) {
      clonedData.alternates = clonedData.alternates.map(alt => ({
        ...alt,
        id: uid(),
        items: (alt.items || []).map(ai => ({
          ...ai,
          id: uid(),
          linkedItemId: itemIdMap[ai.linkedItemId] || ai.linkedItemId,
        })),
      }));
    }

    // Clear timer sessions for the revision (fresh tracking)
    clonedData.timerSessions = [];
    clonedData.timerTotalMs = 0;
    clonedData._savedAt = nowStr();

    // Persist the cloned data
    await storage.set(idbKey(`bldg-est-${newId}`), JSON.stringify(clonedData));

    // Build index entry
    const parentEntry = allEstimates.find(e => e.id === parentId);
    const newEntry = {
      ...(parentEntry || {}),
      id: newId,
      name: clonedData.project.name,
      status: "Bidding",
      lastModified: nowStr(),
      startDate: today(),
      ownerId,
      orgId,
      parentEstimateId: parentId,
      revisionNumber,
      revisionReason: revisionReason || "",
      revisionCreatedAt: nowStr(),
      // Reset tracking fields for the revision
      manualPercentComplete: null,
      manualHoursLogged: null,
      schedulePauses: [],
    };
    set(s => ({ estimatesIndex: [...s.estimatesIndex, newEntry] }));

    // Persist index
    const idx = get().estimatesIndex;
    const idxJson = JSON.stringify(idx);
    await storage.set(idbKey("bldg-index"), idxJson);

    // Mirror index to localStorage
    try {
      const authUserId = useAuthStore.getState().user?.id;
      if (authUserId) localStorage.setItem(`bldg-index-mirror-${authUserId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // Cloud sync (non-blocking)
    if (!useUiStore.getState().cloudSyncInProgress) {
      cloudSync.pushEstimate(newId, clonedData).catch(() => {});
    }

    return { id: newId, revisionNumber };
  },

  // Get revision chain for an estimate (parent + all revisions)
  getRevisionChain: estimateId => {
    const all = get().estimatesIndex;
    const entry = all.find(e => e.id === estimateId);
    if (!entry) return [];

    // Find the root parent
    const rootId = entry.parentEstimateId || estimateId;

    // Collect all estimates in this chain
    const chain = all.filter(e => e.id === rootId || e.parentEstimateId === rootId);

    // Sort by revision number
    return chain.sort((a, b) => (a.revisionNumber || 0) - (b.revisionNumber || 0));
  },

  updateIndexEntry: (id, updates) => {
    // ATOMIC: functional setState to prevent concurrent mutations from overwriting each other.
    // No-op guard: skip if nothing actually changed — prevents re-renders in 30+ consumers.
    set(s => {
      const entry = s.estimatesIndex.find(e => e.id === id);
      if (!entry) return s;
      const changed = Object.keys(updates).some(k => entry[k] !== updates[k]);
      if (!changed) return s;
      return { estimatesIndex: s.estimatesIndex.map(e => (e.id === id ? { ...e, ...updates } : e)) };
    });
    // Persist index to IDB + localStorage mirror immediately.
    // Without this, status changes (e.g. "Trash") only live in memory
    // and are lost on refresh — causing "deleted" estimates to reappear.
    const idx = get().estimatesIndex;
    const idxJson = JSON.stringify(idx);
    storage.set(idbKey("bldg-index"), idxJson).catch(() => {});
    try {
      const userId = useAuthStore.getState().user?.id;
      if (userId) localStorage.setItem(`bldg-index-mirror-${userId}`, idxJson);
    } catch {
      /* quota */
    }
    // Sync normalized columns on user_estimates (authoritative source)
    cloudSync.syncIndexColumns(id, updates).catch(() => {});

    // ── FEEDBACK LOOP: generate learning record when estimate reaches final bid ──
    if (updates.status && ["Submitted", "Won", "Lost"].includes(updates.status)) {
      const entry = idx.find(e => e.id === id);
      if (entry && !entry.feedbackGenerated) {
        Promise.all([
          import("@/utils/estimateFeedback"),
          import("@/stores/uiStore"),
        ]).then(([{ generateLearningFromEstimate }, { useUiStore }]) => {
          generateLearningFromEstimate(id).then(record => {
            if (record) {
              get().updateIndexEntry(id, { feedbackGenerated: true });
              const divs = Object.keys(record.calibration || {}).length;
              useUiStore.getState().showToast(
                `NOVA learned from this bid — ${divs} calibration points added`,
                "success"
              );
            }
          }).catch(err => {
            console.warn(`[NOVA Feedback] Failed:`, err.message);
          });
        });
      }
    }
  },

  assignEstimate: (estimateId, userIds) => {
    // No-op guard: skip if assignedTo hasn't changed
    const entry = get().estimatesIndex.find(e => e.id === estimateId);
    if (entry && JSON.stringify(entry.assignedTo) === JSON.stringify(userIds)) return;
    // Auto-switch visibility to 'assigned' when users are added to a private estimate
    const autoVisibility =
      entry && entry.visibility === "private" && Array.isArray(userIds) && userIds.length > 0
        ? "assigned"
        : undefined;
    const updates = { assignedTo: userIds, ...(autoVisibility ? { visibility: autoVisibility } : {}) };
    // Use updateIndexEntry for proper IDB + cloud sync
    get().updateIndexEntry(estimateId, updates);
    // Also push the estimate itself so assigned_to column updates on user_estimates row
    storage.get(idbKey(`bldg-est-${estimateId}`)).then(raw => {
      if (raw) {
        try {
          const estData = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (estData?.project) {
            estData.project.assignedTo = userIds;
            if (autoVisibility) estData.project.visibility = autoVisibility;
          }
          cloudSync.pushEstimate(estimateId, estData).catch(() => {});
        } catch { /* non-critical */ }
      }
    }).catch(() => {});
  },

  setVisibility: (estimateId, visibility) => {
    const entry = get().estimatesIndex.find(e => e.id === estimateId);
    if (!entry || entry.visibility === visibility) return;
    get().updateIndexEntry(estimateId, { visibility });
    // Push estimate row so visibility column updates on user_estimates
    storage.get(idbKey(`bldg-est-${estimateId}`)).then(raw => {
      if (raw) {
        try {
          const estData = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (estData?.project) estData.project.visibility = visibility;
          cloudSync.pushEstimate(estimateId, estData).catch(() => {});
        } catch { /* non-critical */ }
      }
    }).catch(() => {});
  },

  // Import a pre-built estimate from an RFP
  // options.sourceRfpId: the RFP ID that originated this estimate (for email threading)
  importFromRfp: async (estimateData, options = {}) => {
    const id = uid();
    const data = { ...estimateData };
    const { ownerId, orgId } = get()._getOwnership();
    // Stamp ownership on project data
    if (data.project) {
      data.project.ownerId = ownerId;
      data.project.orgId = orgId;
    }
    const est = {
      id,
      name: data.project?.name || "Imported RFP",
      estimateNumber: data.project?.estimateNumber || "",
      client: data.project?.client || "",
      status: data.project?.status || "Bidding",
      bidDue: data.project?.bidDue || "",
      startDate: data.project?.startDate || "",
      estimatedHours: data.project?.estimatedHours || 0,
      grandTotal: 0,
      elementCount: 0,
      lastModified: nowStr(),
      estimator: data.project?.estimator || "",
      coEstimators: data.project?.coEstimators || [],
      jobType: data.project?.jobType || "",
      companyProfileId: data.project?.companyProfileId || "",
      buildingType: data.project?.buildingType || "",
      workType: data.project?.workType || "",
      architect: data.project?.architect || "",
      engineer: data.project?.engineer || "",
      projectSF: data.project?.projectSF || 0,
      zipCode: data.project?.zipCode || "",
      address: data.project?.address || "",
      description: data.project?.description || "",
      bidDueTime: data.project?.bidDueTime || "",
      bidType: data.project?.bidType || "",
      bidDelivery: data.project?.bidDelivery || "",
      bidRequirements: data.project?.bidRequirements || {},
      walkthroughDate: data.project?.walkthroughDate || "",
      rfiDueDate: data.project?.rfiDueDate || "",
      date: data.project?.date || "",
      divisionTotals: {},
      outcomeMetadata: data.project?.outcomeMetadata || {},
      ownerId,
      orgId,
      sourceRfpId: options.sourceRfpId || "",
      emailCount: 1,
      lastEmailAt: nowStr(),
    };
    set(s => ({ estimatesIndex: [...s.estimatesIndex, est], activeEstimateId: id }));
    const idx = get().estimatesIndex;
    const idxJson = JSON.stringify(idx);
    await storage.set(idbKey("bldg-index"), idxJson);
    await storage.set(idbKey(`bldg-est-${id}`), JSON.stringify(data));

    // Mirror index to localStorage — resilient backup
    try {
      const authUserId = useAuthStore.getState().user?.id;
      if (authUserId) localStorage.setItem(`bldg-index-mirror-${authUserId}`, idxJson);
    } catch {
      /* quota exceeded */
    }

    // Cloud sync (non-blocking)
    if (!useUiStore.getState().cloudSyncInProgress) {
      cloudSync.pushEstimate(id, data).catch(() => {});
    }

    return id;
  },
}));

// ═══ ZOMBIE GUARD SUBSCRIBER ═══
// Watches ALL writes to estimatesIndex — if a permanently-deleted ID appears,
// immediately strips it. Defense-in-depth against any resurrection code path.
let _guardActive = false;
useEstimatesStore.subscribe(state => {
  const index = state.estimatesIndex;
  if (!Array.isArray(index)) return;

  if (_guardActive || _deletedIds.size === 0) return;
  const hasZombie = index.some(e => _deletedIds.has(e.id));
  if (hasZombie) {
    _guardActive = true;
    const zombieIds = index.filter(e => _deletedIds.has(e.id)).map(e => e.id);
    const filtered = index.filter(e => !_deletedIds.has(e.id));
    console.error(`[ZOMBIE GUARD] INTERCEPTED ${zombieIds.length} zombie(s): ${zombieIds.join(", ")}`);
    console.trace("[ZOMBIE GUARD] Resurrection stack trace");
    useEstimatesStore.setState({ estimatesIndex: filtered });
    _guardActive = false;
  }
});
