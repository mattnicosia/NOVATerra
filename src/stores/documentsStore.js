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
    };
    set({ documents: [...get().documents, newDoc] });
    return newDoc;
  },

  removeDocument: (id) => {
    set({ documents: get().documents.filter(d => d.id !== id) });
  },
}));
