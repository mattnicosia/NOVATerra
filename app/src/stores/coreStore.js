// DEPRECATED — consolidated into uiStore. Use useUiStore directly.
import { useUiStore } from "./uiStore";
export const useCoreStore = (selector) => useUiStore(s => {
  const mapped = {
    activeTab: s.coreActiveTab, setActiveTab: s.setCoreActiveTab,
    statsLastComputed: s.coreStatsLastComputed, cachedStats: s.coreCachedStats,
    setCachedStats: s.setCoreCachedStats,
  };
  return selector ? selector(mapped) : mapped;
});
