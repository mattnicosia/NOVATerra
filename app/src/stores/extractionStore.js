// Extraction Pipeline Store — tracks PDF extraction queue, status, and results
import { create } from "zustand";
import { uid } from "@/utils/format";

const useExtractionStore = create((set, get) => ({
  // Queue of files being processed
  queue: [],
  // Map of extractionId -> result
  results: {},
  // Currently active extraction for preview
  activeExtractionId: null,

  // ── Actions ──────────────────────────────────────────────
  enqueue: (file, fileName) => {
    const id = uid();
    const entry = {
      id,
      fileName,
      file,
      status: "pending",
      progress: 0,
      documentType: null,
      markdown: null,
      rawExtraction: null,
      normalized: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    set(state => ({ queue: [...state.queue, entry] }));
    return id;
  },

  updateEntry: (id, updates) => {
    set(state => ({
      queue: state.queue.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  setResult: (id, result) => {
    set(state => ({
      results: { ...state.results, [id]: result },
    }));
  },

  removeEntry: (id) => {
    set(state => ({
      queue: state.queue.filter(e => e.id !== id),
      results: Object.fromEntries(
        Object.entries(state.results).filter(([k]) => k !== id)
      ),
    }));
  },

  setActiveExtractionId: (id) => set({ activeExtractionId: id }),

  clearCompleted: () => {
    set(state => ({
      queue: state.queue.filter(e => e.status !== "done" && e.status !== "error"),
    }));
  },
}));

export default useExtractionStore;
