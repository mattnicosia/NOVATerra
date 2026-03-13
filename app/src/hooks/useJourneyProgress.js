// ═══════════════════════════════════════════════════════════════════════════════
// Journey Progress — Computes completion state for the 5 bid lifecycle stages
// Used by JourneyStrip for visual progress. Reads from existing stores only.
//
// Stages: Discover → Define → Estimate → Network → Propose
// Completion criteria are "meaningful" per Chamath — not just visiting a page.
// ═══════════════════════════════════════════════════════════════════════════════
import { useMemo, useRef } from "react";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useScanStore } from "@/stores/scanStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

export function useJourneyProgress() {
  // Targeted primitive selectors — minimize re-renders
  const drawingCount = useDrawingsStore(s => s.drawings.length);
  const scanResults = useScanStore(s => s.scanResults);
  const setupComplete = useProjectStore(s => s.project.setupComplete);
  const projectName = useProjectStore(s => s.project.name);
  const jobType = useProjectStore(s => s.project.jobType);
  const projectSF = useProjectStore(s => s.project.projectSF);
  const bidDue = useProjectStore(s => s.project.bidDue);
  const itemCount = useItemsStore(s => s.items.length);
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  const prevRef = useRef({});

  return useMemo(() => {
    const activeEntry = estimatesIndex.find(e => e.id === activeEstimateId);
    const hasInvitations = Object.values(invitations || {}).some(arr => arr?.length > 0);

    const stages = [
      {
        key: "discover",
        label: "Discover",
        path: "plans",
        complete: drawingCount > 0 && scanResults !== null,
      },
      {
        key: "define",
        label: "Define",
        path: "info",
        complete:
          setupComplete !== false &&
          !!projectName &&
          projectName !== "New Estimate" &&
          !!(jobType || projectSF || bidDue),
      },
      {
        key: "estimate",
        label: "Estimate",
        path: "takeoffs",
        complete: itemCount >= 5,
      },
      {
        key: "network",
        label: "Network",
        path: "network",
        complete: bidPackages.length > 0 && hasInvitations,
      },
      {
        key: "propose",
        label: "Propose",
        path: "reports",
        complete: !!(activeEntry && activeEntry.status && activeEntry.status !== "Bidding"),
      },
    ];

    // Detect which stages just completed (for animation trigger)
    const justCompleted = {};
    const prev = prevRef.current;
    stages.forEach(s => {
      if (s.complete && !prev[s.key]) justCompleted[s.key] = true;
    });
    prevRef.current = Object.fromEntries(stages.map(s => [s.key, s.complete]));

    return { stages, justCompleted };
  }, [
    drawingCount,
    scanResults,
    setupComplete,
    projectName,
    jobType,
    projectSF,
    bidDue,
    itemCount,
    bidPackages.length,
    invitations,
    activeEstimateId,
    estimatesIndex,
  ]);
}
