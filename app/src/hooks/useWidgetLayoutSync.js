import { useEffect, useRef } from 'react';
import { useWidgetStore } from '@/stores/widgetStore';
import { useUiStore } from '@/stores/uiStore';
import { WIDGET_REGISTRY } from '@/constants/widgetRegistry';

/* ────────────────────────────────────────────────────────
   useWidgetLayoutSync — persist/restore widget layouts
   Bridges widgetStore ↔ appSettings.widgetLayouts.

   Three-tier persistence:
   1. localStorage (sync boot — no flash)
   2. IndexedDB via appSettings (durable local)
   3. Cloud via pushData/pullData (cross-device)
   ──────────────────────────────────────────────────────── */

const LS_KEY = "nova-widget-layouts";

function cleanLayout(layouts) {
  const result = {};
  for (const [bp, items] of Object.entries(layouts)) {
    if (!Array.isArray(items)) continue;
    result[bp] = items.filter(item => WIDGET_REGISTRY[item.widgetType]);
  }
  return result;
}

function persistLayoutToLocalStorage(layouts) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(layouts));
  } catch {
    // Storage access can fail in private browsing or when quota is exceeded.
  }
}

function hydrateFromSettings() {
  const saved = useUiStore.getState().appSettings.widgetLayouts;
  if (saved && typeof saved === 'object' && saved.lg) {
    const cleaned = cleanLayout(saved);
    if (cleaned.lg && cleaned.lg.length > 0) {
      useWidgetStore.getState().setLayouts(cleaned);
      // Also update localStorage for instant boot
      persistLayoutToLocalStorage(cleaned);
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
  // after initial IDB load). This ensures cross-device layout sync works.
  // Compare serialized values to avoid re-hydrating from our own writes.
  const lastCloudRef = useRef(null);
  useEffect(() => {
    const unsub = useUiStore.subscribe(
      state => {
        if (!initialized.current) return;
        const next = state.appSettings?.widgetLayouts;
        if (!next) return;
        const serialized = JSON.stringify(next);
        if (serialized !== lastCloudRef.current) {
          lastCloudRef.current = serialized;
          hydrateFromSettings();
        }
      }
    );
    return unsub;
  }, []);

  // Persist layout changes to appSettings + localStorage
  useEffect(() => {
    const unsub = useWidgetStore.subscribe(
      (state, prevState) => {
        if (state.layouts !== prevState.layouts && initialized.current) {
          // localStorage — instant boot on next load
          persistLayoutToLocalStorage(state.layouts);
          // appSettings — triggers auto-save to IDB + cloud
          useUiStore.getState().updateSetting('widgetLayouts', state.layouts);
        }
      }
    );
    return unsub;
  }, []);
}
