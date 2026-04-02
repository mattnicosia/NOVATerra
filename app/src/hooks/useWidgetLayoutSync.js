import { useEffect, useRef } from 'react';
import { useWidgetStore } from '@/stores/widgetStore';
import { useUiStore } from '@/stores/uiStore';
import { WIDGET_REGISTRY } from '@/constants/widgetRegistry';

/* ────────────────────────────────────────────────────────
   useWidgetLayoutSync — persist/restore widget layouts
   Bridges widgetStore ↔ appSettings.widgetLayouts.
   The existing useAutoSave + saveSettings pipeline handles
   IndexedDB + cloud sync automatically.
   ──────────────────────────────────────────────────────── */

function cleanLayout(layouts) {
  const result = {};
  for (const [bp, items] of Object.entries(layouts)) {
    if (!Array.isArray(items)) continue;
    result[bp] = items.filter(item => WIDGET_REGISTRY[item.widgetType]);
  }
  return result;
}

function hydrateFromSettings() {
  const saved = useUiStore.getState().appSettings.widgetLayouts;
  if (saved && typeof saved === 'object' && saved.lg) {
    const cleaned = cleanLayout(saved);
    if (cleaned.lg && cleaned.lg.length > 0) {
      useWidgetStore.getState().setLayouts(cleaned);
      return true;
    }
  }
  return false;
}

export function useWidgetLayoutSync() {
  const initialized = useRef(false);
  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);

  // Hydrate from appSettings on mount (after persistence loads)
  useEffect(() => {
    if (!persistenceLoaded || initialized.current) return;
    initialized.current = true;
    hydrateFromSettings();
  }, [persistenceLoaded]);

  // Re-hydrate when appSettings.widgetLayouts changes (e.g., cloud pull arrives
  // after initial IDB load). This ensures cross-device layout sync works —
  // the cloud pull overwrites appSettings AFTER the initial hydration above,
  // so we need to pick up the newer cloud version.
  useEffect(() => {
    const unsub = useUiStore.subscribe(
      (state, prevState) => {
        if (!initialized.current) return;
        const prev = prevState.appSettings?.widgetLayouts;
        const next = state.appSettings?.widgetLayouts;
        // Only re-hydrate if widgetLayouts actually changed (cloud pull arrived)
        if (next && next !== prev) {
          hydrateFromSettings();
        }
      }
    );
    return unsub;
  }, []);

  // Persist layout changes to appSettings (auto-save picks it up)
  useEffect(() => {
    // Subscribe to widgetStore layout changes
    const unsub = useWidgetStore.subscribe(
      (state, prevState) => {
        if (state.layouts !== prevState.layouts && initialized.current) {
          useUiStore.getState().updateSetting('widgetLayouts', state.layouts);
        }
      }
    );
    return unsub;
  }, []);
}
