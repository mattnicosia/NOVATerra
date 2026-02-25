import { useEffect, useRef } from 'react';
import { useSnapshotsStore } from '@/stores/snapshotsStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';

/**
 * Auto-snapshot hook — captures estimate state at key moments:
 *  - On first load (if no snapshots exist yet)
 *  - When grand total changes by more than 5% since last snapshot
 *  - At most once per 10 minutes for significant changes
 *
 * Mount this inside EstimateLoader to start tracking automatically.
 */
export function useAutoSnapshot(estimateId) {
  const lastSnapRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!estimateId) return;

    // Load existing snapshots on mount
    useSnapshotsStore.getState().loadSnapshots(estimateId);

    // Small delay to let stores hydrate
    const initTimer = setTimeout(() => {
      const snaps = useSnapshotsStore.getState().getSnapshots(estimateId);
      const totals = useItemsStore.getState().getTotals();
      const items = useItemsStore.getState().items;
      const project = useProjectStore.getState().project;

      if (snaps.length === 0 && items.length > 0) {
        // First snapshot ever for this estimate
        useSnapshotsStore.getState().captureSnapshot(
          estimateId, items, totals, null, null, null, project,
          { label: "Initial", trigger: "initial" }
        );
      }

      lastSnapRef.current = totals.grand;
    }, 2000);

    return () => clearTimeout(initTimer);
  }, [estimateId]);

  // Watch for significant changes
  useEffect(() => {
    if (!estimateId) return;

    const unsub = useItemsStore.subscribe((state) => {
      const totals = state.getTotals();
      const current = totals.grand;
      const last = lastSnapRef.current;

      if (last === null || last === undefined) {
        lastSnapRef.current = current;
        return;
      }

      // Check if change is > 5%
      const pctChange = last > 0 ? Math.abs((current - last) / last) : 0;
      if (pctChange < 0.05) return;

      // Debounce: at most once per 10 minutes
      if (timerRef.current) return;

      timerRef.current = setTimeout(() => {
        const items = useItemsStore.getState().items;
        const project = useProjectStore.getState().project;
        const freshTotals = useItemsStore.getState().getTotals();

        if (items.length > 0) {
          const direction = freshTotals.grand > last ? "increased" : "decreased";
          const pct = last > 0 ? Math.abs((freshTotals.grand - last) / last * 100).toFixed(1) : "—";
          useSnapshotsStore.getState().captureSnapshot(
            estimateId, items, freshTotals, null, null, null, project,
            { label: `Total ${direction} ${pct}%`, trigger: "auto" }
          );
          lastSnapRef.current = freshTotals.grand;
        }

        timerRef.current = null;
      }, 600000); // 10 minutes
    });

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [estimateId]);
}

/**
 * Manual snapshot — call from UI buttons.
 */
export function captureManualSnapshot(estimateId, label) {
  const items = useItemsStore.getState().items;
  const totals = useItemsStore.getState().getTotals();
  const project = useProjectStore.getState().project;

  return useSnapshotsStore.getState().captureSnapshot(
    estimateId, items, totals, null, null, null, project,
    { label: label || "Manual snapshot", trigger: "manual" }
  );
}
