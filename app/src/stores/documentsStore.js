import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useDocumentsStore = create((set, get) => ({
  documents: [],
  // Tags palette — user-defined tag names with colors
  tagPalette: [],   // [{ id, name, color }]
  // Transmittal log — tracks document send/receive events
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
      // Enhanced fields for auto-processing
      docType: doc.docType || "general",           // "drawing" | "specification" | "general"
      processingStatus: doc.processingStatus || "pending",  // "pending" | "processing" | "complete" | "error"
      processingMessage: doc.processingMessage || "",
      processingError: doc.processingError || null,
      pageCount: doc.pageCount || null,
      drawingIds: doc.drawingIds || [],             // Links to drawingsStore entries
      // Folder & tags
      folder: doc.folder || "",                     // folder path e.g. "Addenda" or "Submittals/MEP"
      tags: doc.tags || [],                         // array of tag IDs
      // Version tracking
      version: doc.version || 1,                    // numeric version
      replacesId: doc.replacesId || null,           // ID of previous version
      replacedById: null,                           // set when superseded
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

  // ── Folder operations ──────────────────────────────────────────
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

  // ── Tag operations ─────────────────────────────────────────────
  setTagPalette: (tags) => set({ tagPalette: tags }),

  addTag: (name, color) => {
    const tag = { id: uid(), name, color: color || "#6B7280" };
    set({ tagPalette: [...get().tagPalette, tag] });
    return tag;
  },

  removeTag: (tagId) => {
    // Remove from palette and from all documents
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

  // ── Version tracking ───────────────────────────────────────────
  /** Upload a new version of a document — creates new doc, marks old as superseded */
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

  /** Get version history chain for a document */
  getVersionHistory: (docId) => {
    const docs = get().documents;
    const chain = [];
    // Walk back through replacesId
    let current = docs.find(d => d.id === docId);
    while (current?.replacesId) {
      current = docs.find(d => d.id === current.replacesId);
      if (current) chain.unshift(current);
    }
    // Walk forward through replacedById
    current = docs.find(d => d.id === docId);
    if (current) chain.push(current);
    while (current?.replacedById) {
      current = docs.find(d => d.id === current.replacedById);
      if (current) chain.push(current);
    }
    return chain;
  },

  // ── Transmittal log ────────────────────────────────────────────
  setTransmittals: (list) => set({ transmittals: list }),

  addTransmittal: (entry) => {
    const t = {
      id: uid(),
      date: new Date().toISOString(),
      direction: entry.direction || "sent",       // "sent" | "received"
      party: entry.party || "",                   // company/person name
      method: entry.method || "email",            // "email" | "planroom" | "hand-delivery" | "ftp"
      docIds: entry.docIds || [],                 // array of document IDs included
      notes: entry.notes || "",
    };
    set({ transmittals: [...get().transmittals, t] });
    return t;
  },

  removeTransmittal: (id) => {
    set({ transmittals: get().transmittals.filter(t => t.id !== id) });
  },
}));
