/**
 * featureFlagStore — Feature flags for gradual rollout
 *
 * Sprint 5.3: Simple boolean flags for beta features.
 * Flags can be toggled from Settings, overridden per-user via Supabase,
 * or set via URL query params (?ff_predictive=1).
 *
 * Usage:
 *   const isEnabled = useFeatureFlagStore(s => s.isEnabled("predictive-takeoffs"));
 */

import { create } from "zustand";

// Default feature flags — all new features start disabled for beta safety
const DEFAULT_FLAGS = {
  "predictive-takeoffs": true,      // NOVA predictive takeoff suggestions
  "drawing-overlay": true,          // Revision comparison overlay
  "firm-memory": true,              // Cross-project architect pattern learning
  "collaboration": true,            // Real-time multi-user editing
  "dashboard-widgets": true,        // Sprint 4.2 dashboard widgets
  "onboarding-v2": true,            // Sprint 4.3 guided onboarding
  "feedback-widget": true,          // In-app feedback button
  "version-history": true,          // Estimate snapshots/restore
  "nova-insights": true,            // NOVA learning insights widget
  "tablet-mode": true,              // iPad responsive layout
};

// Parse URL query params for flag overrides (?ff_predictive-takeoffs=0)
function parseUrlOverrides() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const overrides = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("ff_")) {
      const flagName = key.slice(3);
      overrides[flagName] = value === "1" || value === "true";
    }
  }
  return overrides;
}

export const useFeatureFlagStore = create((set, get) => ({
  flags: { ...DEFAULT_FLAGS, ...parseUrlOverrides() },

  // Check if a feature flag is enabled
  isEnabled: name => {
    return get().flags[name] ?? false;
  },

  // Toggle a flag
  toggle: name => {
    set(s => ({
      flags: { ...s.flags, [name]: !s.flags[name] },
    }));
  },

  // Set a flag directly
  setFlag: (name, value) => {
    set(s => ({
      flags: { ...s.flags, [name]: value },
    }));
  },

  // Bulk update flags (e.g., from Supabase remote config)
  setFlags: updates => {
    set(s => ({
      flags: { ...s.flags, ...updates },
    }));
  },

  // Reset to defaults
  reset: () => {
    set({ flags: { ...DEFAULT_FLAGS } });
  },

  // Get all flags for debugging/settings display
  getAllFlags: () => {
    return Object.entries(get().flags).map(([name, enabled]) => ({
      name,
      enabled,
      isDefault: DEFAULT_FLAGS[name] === enabled,
    }));
  },
}));
