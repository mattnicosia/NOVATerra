/**
 * DocumentManagement Store — Consolidated from documentsStore + specsStore + rfiStore
 *
 * Single store for all document-related state: documents, tags, transmittals,
 * specs, exclusions, clarifications, and RFIs.
 */
import { create } from "zustand";
import { uid, nowStr } from "@/utils/format";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

const RFI_KEY_PREFIX = "bldg-rfis-";

export const useDocumentManagementStore = create((set, get) => ({
  // ═══════════════════════════════════════════════════════════════
  // Documents (from documentsStore)
  // ═══════════════════════════════════════════════════════════════
  documents: [],
  tagPalette: [],   // [{ id, name, color }]
  transmittals: [], // [{ id, date, direction, party, method, docIds, notes }]

  setDocuments: (docs) => set({ documents: docs }),

  addDocument: (doc) => {
    const newDoc = {
      id: uid(),
      filename: doc.filename,
      contentType: doc.contentType || "application/octet-stream",
      size: doc.size || 0,
      source: doc.source || "upload",
      storagePath: doc.storagePath || null,
      data: doc.data || null,
      uploadDate: new Date().toISOString(),
      docType: doc.docType || "general",
      processingStatus: doc.processingStatus || "pending",
      processingMessage: doc.processingMessage || "",
      processingError: doc.processingError || null,
      pageCount: doc.pageCount || null,
      drawingIds: doc.drawingIds || [],
      folder: doc.folder || "",
      tags: doc.tags || [],
      version: doc.version || 1,
      replacesId: doc.replacesId || null,
      replacedById: null,
    };
    set({ documents: [...get().documents, newDoc] });
    return newDoc;
  },

  updateDocument: (id, updates) => {
    set({
      documents: get().documents.map(d =>
        d.id === id ? { ...d, ...updates } : d
      ),
    });
  },

  removeDocument: (id) => {
    set({ documents: get().documents.filter(d => d.id !== id) });
  },

  moveToFolder: (docId, folder) => {
    const docs = get().documents.map(d =>
      d.id === docId ? { ...d, folder } : d
    );
    set({ documents: docs });
  },

  getFolders: () => {
    const folders = new Set();
    get().documents.forEach(d => {
      if (d.folder) folders.add(d.folder);
    });
    return [...folders].sort();
  },

  setTagPalette: (tags) => set({ tagPalette: tags }),

  addTag: (name, color) => {
    const tag = { id: uid(), name, color: color || "#6B7280" };
    set({ tagPalette: [...get().tagPalette, tag] });
    return tag;
  },

  removeTag: (tagId) => {
    set({
      tagPalette: get().tagPalette.filter(t => t.id !== tagId),
      documents: get().documents.map(d => ({
        ...d,
        tags: (d.tags || []).filter(t => t !== tagId),
      })),
    });
  },

  toggleDocTag: (docId, tagId) => {
    set({
      documents: get().documents.map(d => {
        if (d.id !== docId) return d;
        const tags = d.tags || [];
        return {
          ...d,
          tags: tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId],
        };
      }),
    });
  },

  uploadNewVersion: (oldDocId, newDocData) => {
    const oldDoc = get().documents.find(d => d.id === oldDocId);
    if (!oldDoc) return null;
    const newDoc = get().addDocument({
      ...newDocData,
      folder: oldDoc.folder,
      tags: [...(oldDoc.tags || [])],
      version: (oldDoc.version || 1) + 1,
      replacesId: oldDocId,
    });
    get().updateDocument(oldDocId, { replacedById: newDoc.id });
    return newDoc;
  },

  getVersionHistory: (docId) => {
    const docs = get().documents;
    const chain = [];
    let current = docs.find(d => d.id === docId);
    while (current?.replacesId) {
      current = docs.find(d => d.id === current.replacesId);
      if (current) chain.unshift(current);
    }
    current = docs.find(d => d.id === docId);
    if (current) chain.push(current);
    while (current?.replacedById) {
      current = docs.find(d => d.id === current.replacedById);
      if (current) chain.push(current);
    }
    return chain;
  },

  setTransmittals: (list) => set({ transmittals: list }),

  addTransmittal: (entry) => {
    const t = {
      id: uid(),
      date: new Date().toISOString(),
      direction: entry.direction || "sent",
      party: entry.party || "",
      method: entry.method || "email",
      docIds: entry.docIds || [],
      notes: entry.notes || "",
    };
    set({ transmittals: [...get().transmittals, t] });
    return t;
  },

  removeTransmittal: (id) => {
    set({ transmittals: get().transmittals.filter(t => t.id !== id) });
  },

  // ═══════════════════════════════════════════════════════════════
  // Specs (from specsStore)
  // ═══════════════════════════════════════════════════════════════
  specs: [],
  specPdf: null,
  specViewPage: null,
  specParseLoading: false,
  exclusions: [],
  clarifications: [],
  aiExclusionLoading: false,

  setSpecs: v => set({ specs: v }),
  setSpecPdf: v => set({ specPdf: v }),
  setSpecViewPage: v => set({ specViewPage: v }),
  setSpecParseLoading: v => set({ specParseLoading: v }),
  setExclusions: v => set({ exclusions: v }),
  setClarifications: v => set({ clarifications: v }),
  setAiExclusionLoading: v => set({ aiExclusionLoading: v }),

  addSpec: spec =>
    set(s => ({
      specs: [...s.specs, { id: uid(), ...spec }],
    })),

  updateSpec: (id, field, value) =>
    set(s => ({
      specs: s.specs.map(sp => (sp.id === id ? { ...sp, [field]: value } : sp)),
    })),

  removeSpec: id =>
    set(s => ({
      specs: s.specs.filter(sp => sp.id !== id),
    })),

  addExclusion: exclusion =>
    set(s => ({
      exclusions: [...s.exclusions, { id: uid(), ...exclusion }],
    })),

  removeExclusion: id =>
    set(s => ({
      exclusions: s.exclusions.filter(e => e.id !== id),
    })),

  addClarification: (category, text) =>
    set(s => ({
      clarifications: [...s.clarifications, { id: uid(), text: text || "", category: category || "" }],
    })),

  updateClarification: (id, field, value) =>
    set(s => ({
      clarifications: s.clarifications.map(c => (c.id === id ? { ...c, [field]: value } : c)),
    })),

  removeClarification: id =>
    set(s => ({
      clarifications: s.clarifications.filter(c => c.id !== id),
    })),

  // ═══════════════════════════════════════════════════════════════
  // RFIs (from rfiStore)
  // ═══════════════════════════════════════════════════════════════
  rfis: [],
  loaded: false,

  loadRFIs: async estimateId => {
    try {
      const raw = await storage.get(idbKey(`${RFI_KEY_PREFIX}${estimateId}`));
      if (raw) {
        set({ rfis: JSON.parse(raw.value), loaded: true });
      } else {
        set({ rfis: [], loaded: true });
      }
    } catch (e) {
      console.error("Failed to load RFIs:", e);
      set({ loaded: true });
    }
  },

  _persist: async estimateId => {
    const list = get().rfis;
    await storage.set(idbKey(`${RFI_KEY_PREFIX}${estimateId}`), JSON.stringify(list));
  },

  addRFI: (estimateId, rfi) => {
    const nextNumber = get().rfis.length + 1;
    const newRfi = {
      id: uid(),
      number: rfi.number || nextNumber,
      subject: rfi.subject || "",
      reference: rfi.reference || "",
      question: rfi.question || "",
      impact: rfi.impact || "",
      status: "open",
      dateCreated: nowStr(),
      dateDue: rfi.dateDue || "",
      dateAnswered: "",
      responsibleParty: rfi.responsibleParty || "",
      answer: "",
      costImpact: "",
      linkedItemIds: rfi.linkedItemIds || [],
      specSection: rfi.specSection || "",
      source: rfi.source || "manual",
    };
    set(s => ({ rfis: [...s.rfis, newRfi] }));
    get()._persist(estimateId);
    return newRfi;
  },

  addBulkRFIs: (estimateId, rfis) => {
    const startNum = get().rfis.length + 1;
    const newRfis = rfis.map((rfi, i) => ({
      id: uid(),
      number: startNum + i,
      subject: rfi.subject || "",
      reference: rfi.reference || "",
      question: rfi.question || "",
      impact: rfi.impact || "",
      status: "open",
      dateCreated: nowStr(),
      dateDue: "",
      dateAnswered: "",
      responsibleParty: "",
      answer: "",
      costImpact: "",
      linkedItemIds: [],
      specSection: "",
      source: "ai",
    }));
    set(s => ({ rfis: [...s.rfis, ...newRfis] }));
    get()._persist(estimateId);
  },

  updateRFI: (estimateId, rfiId, field, value) => {
    set(s => ({
      rfis: s.rfis.map(r => (r.id === rfiId ? { ...r, [field]: value } : r)),
    }));
    get()._persist(estimateId);
  },

  setRFIStatus: (estimateId, rfiId, status) => {
    set(s => ({
      rfis: s.rfis.map(r =>
        r.id === rfiId
          ? { ...r, status, ...(status === "answered" ? { dateAnswered: nowStr() } : {}) }
          : r,
      ),
    }));
    get()._persist(estimateId);
  },

  removeRFI: (estimateId, rfiId) => {
    set(s => ({ rfis: s.rfis.filter(r => r.id !== rfiId) }));
    get()._persist(estimateId);
  },

  getRFIsByStatus: status => get().rfis.filter(r => r.status === status),
  getOverdueRFIs: () => {
    const now = Date.now();
    return get().rfis.filter(r => r.status === "open" && r.dateDue && new Date(r.dateDue).getTime() < now);
  },
}));
