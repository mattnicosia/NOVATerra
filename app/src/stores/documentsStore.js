import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useDocumentsStore = create((set, get) => ({
  documents: [],

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
}));
