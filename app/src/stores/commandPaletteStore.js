// DEPRECATED — consolidated into uiStore. Use useUiStore directly.
import { useUiStore } from "./uiStore";
export const useCommandPaletteStore = (selector) => useUiStore(s => {
  const mapped = {
    open: s.cmdOpen, query: s.cmdQuery, recentIds: s.cmdRecentIds,
    toggle: s.cmdToggle, setOpen: s.setCmdOpen, close: s.cmdClose,
    setQuery: s.setCmdQuery, addRecent: s.addCmdRecent,
  };
  return selector ? selector(mapped) : mapped;
});
