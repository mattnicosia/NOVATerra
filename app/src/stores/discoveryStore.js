import { create } from "zustand";

/**
 * Discovery Store — tracks discovered sub-contractors and market intelligence.
 * Stub implementation — will be expanded when Discovery feature is built.
 */
export const useDiscoveryStore = create(set => ({
  discoveryIndex: [],

  setDiscoveryIndex: discoveryIndex => set({ discoveryIndex }),

  reset: () => set({ discoveryIndex: [] }),
}));
