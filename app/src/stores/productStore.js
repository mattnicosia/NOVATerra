/**
 * productStore.js — Zustand store for external product data
 *
 * Manages search state, results, and source configuration for
 * Home Depot + BIMobject product lookups.
 */

import { create } from "zustand";
import { searchProducts, getProductCategories } from "@/services/productDataService";

export const useProductStore = create((set, get) => ({
  // ─── State ──────────────────────────────────────────────────────
  searchQuery: "",
  searchSource: "all",        // "all" | "homedepot" | "bimobject"
  searchCategory: "",         // HD category filter
  searchResults: [],           // unified product items
  searchSources: {},           // per-source result details
  totalItems: 0,
  page: 1,
  loading: false,
  error: null,

  // Source configuration status
  sourcesConfigured: {
    homedepot: false,
    bimobject: false,
  },
  availableCategories: [],

  // ─── Actions ────────────────────────────────────────────────────

  /** Run a product search */
  search: async (query, opts = {}) => {
    const source = opts.source || get().searchSource;
    const category = opts.category || get().searchCategory;
    const page = opts.page || 1;

    set({ loading: true, error: null, searchQuery: query, searchSource: source, searchCategory: category, page });

    try {
      const data = await searchProducts(query, { source, category, page });
      set({
        searchResults: data.items || [],
        searchSources: data.sources || {},
        totalItems: data.totalItems || 0,
        loading: false,
      });
      return data;
    } catch (err) {
      set({ error: err.message, loading: false, searchResults: [] });
      return null;
    }
  },

  /** Load next page of results */
  nextPage: async () => {
    const { searchQuery, page } = get();
    if (!searchQuery) return;
    return get().search(searchQuery, { page: page + 1 });
  },

  /** Check which sources are configured */
  checkSources: async () => {
    try {
      const data = await getProductCategories();
      const sources = data.sources || {};
      set({
        sourcesConfigured: {
          homedepot: sources.homedepot?.configured || false,
          bimobject: sources.bimobject?.configured || false,
        },
        availableCategories: sources.homedepot?.categories || [],
      });
    } catch {
      // Non-critical — sources just show as unconfigured
    }
  },

  /** Clear search state */
  clearSearch: () => set({
    searchQuery: "",
    searchResults: [],
    searchSources: {},
    totalItems: 0,
    page: 1,
    error: null,
  }),

  /** Set search source filter */
  setSource: (source) => set({ searchSource: source }),

  /** Set category filter */
  setCategory: (category) => set({ searchCategory: category }),
}));
