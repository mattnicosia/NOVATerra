// novaAudioStore — Zustand store for NOVA custom audio asset metadata
// Actual audio blobs live in IndexedDB (too large for state).
// This store holds metadata for reactive UI updates + per-slot volumes.
import { create } from 'zustand';

const DEFAULT_VOLUMES = { drone: 1.0, textPing: 1.0, activation: 1.0 };

export const useNovaAudioStore = create((set, get) => ({
  // { drone: { name, size, type }, textPing: {...}, activation: {...} }
  audioAssets: {},

  // Per-slot volume levels (0.0 – 1.0)
  volumes: { ...DEFAULT_VOLUMES },

  // Set metadata for a slot
  setAudioAsset: (slot, meta) => set(s => ({
    audioAssets: { ...s.audioAssets, [slot]: meta },
  })),

  // Remove metadata for a slot
  removeAudioAsset: (slot) => set(s => {
    const next = { ...s.audioAssets };
    delete next[slot];
    return { audioAssets: next };
  }),

  // Set volume for a single slot
  setSlotVolume: (slot, level) => set(s => ({
    volumes: { ...s.volumes, [slot]: Math.max(0, Math.min(1, level)) },
  })),

  // Load all metadata at once (on app startup)
  setAllAssets: (assets) => set({ audioAssets: assets || {} }),

  // Load volumes (on app startup)
  setAllVolumes: (vols) => set({ volumes: { ...DEFAULT_VOLUMES, ...vols } }),
}));
