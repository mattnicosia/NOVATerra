import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { loadEstimate } from "@/hooks/usePersistence";
import { storage } from "@/utils/storage";
import { idbKey } from "@/utils/idbKey";

/* ────────────────────────────────────────────────────────
   useDashboardData — centralized data for dashboard widgets
   Extracted from NovaDashboardPage.jsx so widgets can read
   directly without prop drilling through the grid.
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

function statusToDisplay(status) {
  if (status === "Qualifying") return "review";
  if (status === "Bidding") return "bidding";
  if (status === "Submitted") return "bidding";
  if (status === "Won") return "active";
  if (status === "On Hold") return "review";
  if (status === "Lost") return "lost";
  if (status === "Cancelled") return "cancelled";
  return "review";
}

// ── One-time repair: recompute grandTotal for stale index entries ──
// Estimates saved before the grandTotal-in-blob fix have grand_total = 0.
// Load their IDB blobs, compute direct costs, and patch the index.
function computeDirectFromBlob(data) {
  if (!data?.items?.length) return 0;
  let total = 0;
  for (const it of data.items) {
    const q = parseFloat(it.quantity) || 0;
    total += q * (parseFloat(it.material) || 0);
    total += q * (parseFloat(it.labor) || 0);
    total += q * (parseFloat(it.equipment) || 0);
    total += q * (parseFloat(it.subcontractor) || 0);
  }
  // Apply markup from blob if present (simplified — uses overhead+profit only)
  const m = data.markup || {};
  const overhead = parseFloat(m.overhead) || 0;
  const profit = parseFloat(m.profit) || 0;
  let grand = total;
  if (overhead) grand += (total * overhead) / 100;
  if (profit) grand += (grand * profit) / 100;
  // If the blob already has grandTotal embedded (new saves), prefer it
  if (data.project?.grandTotal > 0) return data.project.grandTotal;
  return grand;
}

export function useDashboardData() {
  const navigate = useNavigate();
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const deleteEstimate = useEstimatesStore(s => s.deleteEstimate);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  const [selectedEstimateId, setSelectedEstimateId] = useState(null);
  const repairRan = useRef(false);

  // Repair stale grandTotals on first dashboard mount
  useEffect(() => {
    if (repairRan.current) return;
    repairRan.current = true;
    const stale = estimatesIndex.filter(e => !e.grandTotal && (e.elementCount > 0));
    if (stale.length === 0) return;

    (async () => {
      const updateIndexEntry = useEstimatesStore.getState().updateIndexEntry;
      for (const entry of stale) {
        try {
          const raw = await storage.get(idbKey(`bldg-est-${entry.id}`));
          if (!raw) continue;
          const data = JSON.parse(raw.value || raw);
          const grand = computeDirectFromBlob(data);
          if (grand > 0) {
            // Also compute divisionTotals
            const divisionTotals = {};
            for (const item of (data.items || [])) {
              const div = item.division || item.code?.slice(0, 2) || "00";
              const q = parseFloat(item.quantity) || 0;
              const itemTotal = q * ((parseFloat(item.material) || 0) + (parseFloat(item.labor) || 0) +
                (parseFloat(item.equipment) || 0) + (parseFloat(item.subcontractor) || 0));
              divisionTotals[div] = (divisionTotals[div] || 0) + itemTotal;
            }
            updateIndexEntry(entry.id, { grandTotal: grand, divisionTotals });
          }
        } catch { /* skip broken entries */ }
      }
    })();
  }, [estimatesIndex]);

  // Filter by company — "__all__" shows everything, otherwise exact match
  const companyEstimates = useMemo(() => {
    if (activeCompanyId === "__all__") return estimatesIndex;
    return estimatesIndex.filter(e => (e.companyProfileId || "") === (activeCompanyId || ""));
  }, [estimatesIndex, activeCompanyId]);

  // Sort by lastModified descending
  const sortedEstimates = useMemo(
    () =>
      [...companyEstimates].sort((a, b) => {
        const ta = a.lastModified || "";
        const tb = b.lastModified || "";
        return tb.localeCompare(ta);
      }),
    [companyEstimates],
  );

  // Active estimate
  const activeEstimate = useMemo(() => {
    if (selectedEstimateId) {
      const found = sortedEstimates.find(e => e.id === selectedEstimateId);
      if (found) return found;
    }
    return sortedEstimates[0] || null;
  }, [sortedEstimates, selectedEstimateId]);

  // Open estimate handler
  const handleOpenEstimate = useCallback(
    id => {
      setSelectedEstimateId(id);
      navigate(`/estimate/${id}/takeoffs`);
    },
    [navigate],
  );

  // KPIs (benchmarks)
  const benchmarks = useMemo(() => {
    const all = companyEstimates;
    const active = all.filter(e => e.status === "Bidding" || e.status === "Submitted");
    const won = all.filter(e => e.status === "Won");
    const lost = all.filter(e => e.status === "Lost");

    const withSF = all.filter(e => nn(e.grandTotal) > 0 && nn(e.projectSF) > 0);
    const costPerSF =
      withSF.length > 0 ? withSF.reduce((s, e) => s + nn(e.grandTotal) / nn(e.projectSF), 0) / withSF.length : 0;

    const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : null;

    const pipeline = active.reduce((s, e) => s + nn(e.grandTotal), 0);

    return { costPerSF, winRate, openBids: active.length, pipeline, total: all.length };
  }, [companyEstimates]);

  // Delete estimate handler
  const handleDeleteEstimate = useCallback(
    async id => {
      if (selectedEstimateId === id) setSelectedEstimateId(null);
      await deleteEstimate(id);
    },
    [selectedEstimateId, deleteEstimate],
  );

  // Create estimate handler — opens the NewEstimateModal
  const [showNewEstimateModal, setShowNewEstimateModal] = useState(false);
  const handleCreateEstimate = useCallback(() => {
    setShowNewEstimateModal(true);
  }, []);

  const handleNewEstimateCreated = useCallback(
    async id => {
      setShowNewEstimateModal(false);
      await loadEstimate(id);
      navigate(`/estimate/${id}/documents`);
    },
    [navigate],
  );

  // Map estimate to display props
  const activeProject = useMemo(() => {
    if (!activeEstimate) return null;
    const e = activeEstimate;
    let deltaText = e.status || "Draft";
    if (e.bidDue) {
      const due = new Date(e.bidDue);
      const now = new Date();
      const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) deltaText += " · OVERDUE";
      else if (daysLeft === 0) deltaText += " · Due today";
      else deltaText += ` · Due in ${daysLeft}d`;
    }
    return {
      id: e.id,
      name: e.name || "Untitled Estimate",
      value: nn(e.grandTotal),
      status: statusToDisplay(e.status),
      deltaText,
      divisionTotals: e.divisionTotals || {},
      client: e.client || "",
      projectSF: nn(e.projectSF),
      buildingType: e.buildingType || "",
      bidDue: e.bidDue || "",
    };
  }, [activeEstimate]);

  // Map estimates list for project widget
  const estimatesList = useMemo(
    () =>
      sortedEstimates.map(e => ({
        id: e.id,
        name: e.name || "Untitled Estimate",
        type: e.client || e.jobType || e.buildingType || "Estimate",
        value: nn(e.grandTotal),
        status: statusToDisplay(e.status),
        statusLabel: e.status || "Draft",
        isDraft: !!e.draft,
      })),
    [sortedEstimates],
  );

  return {
    activeProject,
    estimatesList,
    benchmarks,
    companyEstimates,
    sortedEstimates,
    selectedEstimateId,
    setSelectedEstimateId,
    activeEstimate,
    handleOpenEstimate,
    handleCreateEstimate,
    handleDeleteEstimate,
    showNewEstimateModal,
    setShowNewEstimateModal,
    handleNewEstimateCreated,
    activeCompanyId,
  };
}
