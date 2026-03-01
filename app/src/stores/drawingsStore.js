import { create } from 'zustand';
import { uid } from '@/utils/format';

export const useDrawingsStore = create((set, get) => ({
  drawings: [],
  selectedDrawingId: null,
  pdfCanvases: {},
  drawingScales: {},
  drawingDpi: {},
  previewDrawingId: null,
  smartLabelMode: false,
  smartLabelRegion: null,
  smartLabelDragging: null,
  aiLabelLoading: false,
  autoLabelProgress: null,

  setDrawings: (v) => set({ drawings: v }),
  setSelectedDrawingId: (v) => set({ selectedDrawingId: v }),
  setPdfCanvases: (v) => set({ pdfCanvases: v }),
  setDrawingScales: (v) => set({ drawingScales: v }),
  setDrawingDpi: (v) => set({ drawingDpi: v }),
  setPreviewDrawingId: (v) => set({ previewDrawingId: v }),
  setSmartLabelMode: (v) => set({ smartLabelMode: v }),
  setSmartLabelRegion: (v) => set({ smartLabelRegion: v }),
  setSmartLabelDragging: (v) => set({ smartLabelDragging: v }),
  setAiLabelLoading: (v) => set({ aiLabelLoading: v }),
  setAutoLabelProgress: (v) => set({ autoLabelProgress: v }),

  addDrawing: (drawing) => set(s => ({
    drawings: [...s.drawings, { id: uid(), ...drawing }],
  })),

  updateDrawing: (id, field, value) => set(s => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, [field]: value } : d),
  })),

  removeDrawing: (id) => set(s => ({
    drawings: s.drawings.filter(d => d.id !== id),
    selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId,
  })),

  getSelectedDrawing: () => {
    const { drawings, selectedDrawingId } = get();
    return drawings.find(d => d.id === selectedDrawingId) || null;
  },
}));
