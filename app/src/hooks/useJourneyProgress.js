// ═══════════════════════════════════════════════════════════════════════════════
// Journey Progress — Computes completion state for the 7 bid lifecycle stages
// Used by JourneyStrip for visual progress. Reads from existing stores only.
//
// Stages: Define → Docs → Discover → Estimate → Review → Network → Propose
// Completion criteria are "meaningful" per Chamath — not just visiting a page.
// ═══════════════════════════════════════════════════════════════════════════════
import { useMemo, useRef } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { runValidation } from "@/utils/costValidation";

export function useJourneyProgress() {
  // Targeted primitive selectors — minimize re-renders
  const drawingCount = useDrawingPipelineStore(s => s.drawings.length);
  const documentCount = useDocumentManagementStore(s => s.documents.length);
  const scanResults = useDrawingPipelineStore(s => s.scanResults);
  const setupComplete = useProjectStore(s => s.project.setupComplete);
  const projectName = useProjectStore(s => s.project.name);
  const jobType = useProjectStore(s => s.project.jobType);
  const projectSF = useProjectStore(s => s.project.projectSF);
  const bidDue = useProjectStore(s => s.project.bidDue);
  const items = useItemsStore(s => s.items);
  const itemCount = items.length;
  const bidPackages = useBidManagementStore(s => s.bidPackages);
  const invitations = useBidManagementStore(s => s.invitations);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  const prevRef = useRef({});

  return useMemo(() => {
    const activeEntry = estimatesIndex.find(e => e.id === activeEstimateId);
    const hasInvitations = Object.values(invitations || {}).some(arr => arr?.length > 0);

    // Review completion: no warnings from cost validation + items have quantities
    const warnings = itemCount >= 5 ? runValidation(items) : [];
    const warnCount = warnings.filter(w => w.severity === "WARN").length;
    const hasQuantities = items.filter(it => it.quantity > 0).length >= 5;

    const stages = [
      {
        key: "define",
        label: "Info",
        path: "info",
        complete:
          setupComplete !== false &&
          !!projectName &&
          projectName !== "New Estimate" &&
          !!(jobType || projectSF || bidDue),
      },
      {
        key: "documents",
        label: "Docs",
        path: "documents",
        complete: documentCount > 0 || drawingCount > 0,
      },
      {
        key: "discover",
        label: "Discovery",
        path: "plans",
        complete: drawingCount > 0 && scanResults !== null,
      },
      {
        key: "estimate",
        label: "Estimate",
        path: "takeoffs",
        complete: itemCount >= 5,
      },
      {
        key: "review",
        label: "Review",
        path: "review",
        complete: itemCount >= 5 && warnCount === 0 && hasQuantities,
      },
      {
        key: "network",
        label: "Network",
        path: "network",
        complete: bidPackages.length > 0 && hasInvitations,
      },
      {
        key: "propose",
        label: "Reports",
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
    documentCount,
    scanResults,
    setupComplete,
    projectName,
    jobType,
    projectSF,
    bidDue,
    items,
    itemCount,
    bidPackages.length,
    invitations,
    activeEstimateId,
    estimatesIndex,
  ]);
}
