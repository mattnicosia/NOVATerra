import { useEffect, useRef } from "react";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useScanStore } from "@/stores/scanStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { runFullScan } from "@/utils/scanRunner";

/**
 * useAutoDiscovery — Global recovery hook for NOVA scan pipeline.
 *
 * Mounted in AppContent to ensure Discovery runs regardless of which page
 * the user is on. Acts as a SAFETY NET — does NOT duplicate scans that
 * upload pipeline or inbox import already triggered.
 *
 * Triggers when:
 *   1. persistenceLoaded === true (IDB hydration complete)
 *   2. An active estimate exists
 *   3. Drawings with .data blobs exist in the store
 *   4. No scan results exist
 *   5. No scan is currently running (scanProgress.phase === null)
 *
 * Uses a 3-second delay after conditions are met to allow IDB hydration
 * to finish loading scan results (which load slightly after drawings).
 */
export function useAutoDiscovery() {
  const scanTriggeredForEstimate = useRef(null);
  const timerRef = useRef(null);

  const persistenceLoaded = useUiStore(s => s.persistenceLoaded);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const drawingsCount = useDrawingsStore(s => s.drawings.length);
  const scanResults = useScanStore(s => s.scanResults);
  const scanPhase = useScanStore(s => s.scanProgress.phase);

  useEffect(() => {
    // Clear timer on any dependency change (re-evaluate from scratch)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Gate: persistence must have loaded (IDB hydration complete)
    if (!persistenceLoaded) return;

    // Gate: must have an active estimate
    if (!activeEstimateId) return;

    // Gate: must have drawings
    if (drawingsCount === 0) return;

    // Gate: must NOT already have scan results
    if (scanResults !== null) return;

    // Gate: must NOT have a scan already running
    if (scanPhase !== null) return;

    // Gate: don't re-trigger for the same estimate
    if (scanTriggeredForEstimate.current === activeEstimateId) return;

    // All conditions met — wait 3 seconds for IDB to finish hydrating
    // scan results (which load slightly after drawings)
    timerRef.current = setTimeout(() => {
      // Re-check from fresh store state (not stale closure)
      const freshDrawings = useDrawingsStore.getState().drawings;
      const freshResults = useScanStore.getState().scanResults;
      const freshProgress = useScanStore.getState().scanProgress;
      const freshEstId = useEstimatesStore.getState().activeEstimateId;

      if (!freshEstId) return;
      if (freshResults !== null) return;
      if (freshProgress.phase !== null) return;

      // Verify drawings actually have image data
      const drawingsWithData = freshDrawings.filter(d => d.data);
      if (drawingsWithData.length === 0) {
        console.warn(
          `[AutoDiscovery] Skipped — ${freshDrawings.length} drawings but none have .data`,
        );
        return;
      }

      // Mark this estimate as triggered (prevents re-entry)
      scanTriggeredForEstimate.current = freshEstId;

      console.log(`[AutoDiscovery] Triggering scan — ${drawingsWithData.length} drawings, no results`);

      const showToast = useUiStore.getState().showToast;
      showToast(`NOVA is scanning ${drawingsWithData.length} drawings...`);

      // Set scanResultsPending so PlanRoomPage auto-opens results modal
      // when the user eventually navigates there
      useScanStore.getState().setScanResultsPending(true);

      runFullScan({
        onComplete: () => {
          console.log("[AutoDiscovery] Scan complete");
        },
        onError: err => {
          console.error("[AutoDiscovery] Scan failed:", err);
          // Reset so it can be retried on next trigger
          scanTriggeredForEstimate.current = null;
        },
      });
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [persistenceLoaded, activeEstimateId, drawingsCount, scanResults, scanPhase]);

  // Reset the trigger guard when estimate changes
  useEffect(() => {
    if (scanTriggeredForEstimate.current && scanTriggeredForEstimate.current !== activeEstimateId) {
      scanTriggeredForEstimate.current = null;
    }
  }, [activeEstimateId]);
}
