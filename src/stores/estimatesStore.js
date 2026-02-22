import { create } from 'zustand';
import { uid, today, nowStr } from '@/utils/format';
import { storage } from '@/utils/storage';
import { useUiStore } from '@/stores/uiStore';
import * as cloudSync from '@/utils/cloudSync';

export const useEstimatesStore = create((set, get) => ({
  estimatesIndex: [],
  activeEstimateId: null,

  setEstimatesIndex: (v) => set({ estimatesIndex: v }),
  setActiveEstimateId: (v) => set({ activeEstimateId: v }),

  createEstimate: async (companyProfileId) => {
    const id = uid();
    const settings = useUiStore.getState().appSettings;
    const est = {
      id,
      name: "New Estimate",
      client: "",
      status: "Bidding",
      bidDue: "",
      grandTotal: 0,
      elementCount: 0,
      lastModified: nowStr(),
      estimator: "",
      jobType: "",
      companyProfileId: companyProfileId || "",
    };
    const idx = [...get().estimatesIndex, est];
    set({ estimatesIndex: idx, activeEstimateId: id });
    await storage.set("bldg-index", JSON.stringify(idx));

    // Save blank estimate data
    const data = {
      project: {
        name: "New Estimate", client: "", architect: "", engineer: "", estimator: "",
        address: "", date: today(), bidDue: "", bidDueTime: "", walkthroughDate: "",
        rfiDueDate: "", otherDueDate: "", otherDueLabel: "", description: "",
        projectSF: "", jobType: "", bidType: "", bidDelivery: "", bidRequirements: {},
        status: "Bidding", referredByType: "", referredByName: "",
        laborType: settings.defaultLaborType || "open_shop",
        companyProfileId: companyProfileId || "",
      },
      codeSystem: "csi-commercial",
      items: [],
      markup: { overhead: 10, profit: 10, contingency: 5, generalConditions: 0, insurance: 2, tax: 0, bond: 0 },
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
      exclusions: [],
      clarifications: [],
      specs: [],
      specPdf: null,
      alternates: [],
      documents: [],
    };
    await storage.set(`bldg-est-${id}`, JSON.stringify(data));

    // Cloud sync (non-blocking)
    cloudSync.pushEstimate(id, data).catch(() => {});
    cloudSync.pushData('index', idx).catch(() => {});

    return id;
  },

  deleteEstimate: async (id) => {
    const idx = get().estimatesIndex.filter(e => e.id !== id);
    set({
      estimatesIndex: idx,
      activeEstimateId: get().activeEstimateId === id ? null : get().activeEstimateId,
    });
    await storage.set("bldg-index", JSON.stringify(idx));
    await storage.delete(`bldg-est-${id}`);

    // Cloud sync (non-blocking)
    cloudSync.deleteEstimate(id).catch(() => {});
    cloudSync.pushData('index', idx).catch(() => {});
  },

  duplicateEstimate: async (id) => {
    const raw = await storage.get(`bldg-est-${id}`);
    if (!raw) return;
    const data = JSON.parse(raw.value);
    const newId = uid();
    data.project.name = data.project.name + " (Copy)";
    await storage.set(`bldg-est-${newId}`, JSON.stringify(data));

    const src = get().estimatesIndex.find(e => e.id === id);
    const newEntry = { ...src, id: newId, name: data.project.name, lastModified: nowStr() };
    const idx = [...get().estimatesIndex, newEntry];
    set({ estimatesIndex: idx });
    await storage.set("bldg-index", JSON.stringify(idx));

    // Cloud sync (non-blocking)
    cloudSync.pushEstimate(newId, data).catch(() => {});
    cloudSync.pushData('index', idx).catch(() => {});

    return newId;
  },

  updateIndexEntry: (id, updates) => {
    set(s => ({
      estimatesIndex: s.estimatesIndex.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  // Import a pre-built estimate from an RFP
  importFromRfp: async (estimateData) => {
    const id = uid();
    const data = { ...estimateData };
    const est = {
      id,
      name: data.project?.name || "Imported RFP",
      client: data.project?.client || "",
      status: data.project?.status || "Bidding",
      bidDue: data.project?.bidDue || "",
      grandTotal: 0,
      elementCount: 0,
      lastModified: nowStr(),
      estimator: data.project?.estimator || "",
      jobType: data.project?.jobType || "",
      companyProfileId: data.project?.companyProfileId || "",
    };
    const idx = [...get().estimatesIndex, est];
    set({ estimatesIndex: idx, activeEstimateId: id });
    await storage.set("bldg-index", JSON.stringify(idx));
    await storage.set(`bldg-est-${id}`, JSON.stringify(data));

    // Cloud sync (non-blocking)
    cloudSync.pushEstimate(id, data).catch(() => {});
    cloudSync.pushData('index', idx).catch(() => {});

    return id;
  },
}));
