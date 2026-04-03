// DEPRECATED — consolidated into uiStore. Use useUiStore directly.
import { useUiStore } from "./uiStore";
export const useFeatureFlagStore = (selector) => useUiStore(s => {
  const mapped = {
    flags: s.featureFlags,
    isEnabled: s.isFeatureEnabled,
    toggle: s.toggleFeatureFlag,
    setFlag: s.setFeatureFlag,
    setFlags: s.setFeatureFlags,
    reset: s.resetFeatureFlags,
    getAllFlags: s.getAllFeatureFlags,
  };
  return selector ? selector(mapped) : mapped;
});
