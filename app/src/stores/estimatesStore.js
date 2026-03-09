import { create } from "zustand";
import { uid, today, nowStr } from "@/utils/format";
import { storage } from "@/utils/storage";
import { useUiStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useAlternatesStore } from "@/stores/alternatesStore";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useScanStore } from "@/stores/scanStore";

import { useMasterDataStore } from "@/stores/masterDataStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import * as cloudSync from "@/utils/cloudSync";
import { idbKey } from "@/utils/idbKey";
import { TEMPLATE_MAP, resolveTemplateItems } from "@/constants/seedTemplates";
import { autoDirective } from "@/utils/directives";
import { autoTradeFromCode } from "@/constants/tradeGroupings";

export const useEstimatesStore = create((set, get) => ({
  estimatesIndex: [],
  activeEstimateId: null,
  draftId: null, // Non-null when estimate is a draft (not yet persisted to DB)

  setEstimatesIndex: v => set({ estimatesIndex: v }),
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
      startDate: "",
      estimatedHours: 0,
      grandTotal: 0,
      elementCount: templateItems.length,
      lastModified: nowStr(),
      estimator: "",
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
    cloudSync.pushEstimate(id, data).catch(() => {});
    cloudSync.pushData("index", idx).catch(() => {});

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
      address: "",
      date: today(),
      startDate: "",
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
    useDrawingsStore.getState().setDrawings([]);
    useDrawingsStore.getState().setDrawingScales({});
    useDrawingsStore.getState().setDrawingDpi({});
    useTakeoffsStore.getState().setTakeoffs([]);
    useTakeoffsStore.getState().setTkCalibrations({});
    useBidLevelingStore.getState().setSubBidSubs({});
    useBidLevelingStore.getState().setBidTotals({});
    useBidLevelingStore.getState().setBidCells({});
    useBidLevelingStore.getState().setBidSelections({});
    useBidLevelingStore.getState().setLinkedSubs([]);
    useBidLevelingStore.getState().setSubKeyLabels({});
    useSpecsStore.getState().setSpecs([]);
    useSpecsStore.getState().setSpecPdf(null);
    // Auto-populate boilerplate from company profile
    const draftProfile = useMasterDataStore.getState().getCompanyInfo(companyProfileId);
    const bpExclusions = (draftProfile?.boilerplateExclusions || [])
      .filter(e => e.text)
      .map(e => ({ id: uid(), text: e.text, source: "boilerplate" }));
    const bpClarifications = (draftProfile?.boilerplateNotes || [])
      .filter(n => n.text)
      .map(n => ({ id: uid(), text: n.text, category: n.category || "clarification", source: "boilerplate" }));
    useSpecsStore.getState().setExclusions(bpExclusions);
    useSpecsStore.getState().setClarifications(bpClarifications);
    useAlternatesStore.getState().setAlternates([]);
    useDocumentsStore.getState().setDocuments([]);
    useModuleStore.getState().setModuleInstances({});
    useModuleStore.getState().setActiveModule(null);
    useScanStore.getState().clearScan();

    // Set active ID last — EstimateLoader checks activeId === id to skip DB load
    set({ activeEstimateId: id, draftId: id });

    return id;
  },

  deleteEstimate: async id => {
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
      await cloudSync.pushData("index", idx);
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
    cloudSync.pushEstimate(newId, data).catch(() => {});
    cloudSync.pushData("index", idx).catch(() => {});

    return newId;
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
  },

  assignEstimate: (estimateId, userIds) => {
    // No-op guard: skip if assignedTo hasn't changed
    const entry = get().estimatesIndex.find(e => e.id === estimateId);
    if (entry && JSON.stringify(entry.assignedTo) === JSON.stringify(userIds)) return;
    set(s => ({
      estimatesIndex: s.estimatesIndex.map(e => (e.id === estimateId ? { ...e, assignedTo: userIds } : e)),
    }));
    // Cloud push happens via auto-save index sync
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
      jobType: data.project?.jobType || "",
      companyProfileId: data.project?.companyProfileId || "",
      buildingType: data.project?.buildingType || "",
      workType: data.project?.workType || "",
      architect: data.project?.architect || "",
      projectSF: data.project?.projectSF || 0,
      zipCode: data.project?.zipCode || "",
      divisionTotals: {},
      outcomeMetadata: data.project?.outcomeMetadata || {},
      ownerId,
      orgId,
      sourceRfpId: options.sourceRfpId || "",
      emailCount: 1, // The initial RFP counts as the first email
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
    cloudSync.pushEstimate(id, data).catch(() => {});
    cloudSync.pushData("index", idx).catch(() => {});

    return id;
  },
}));
