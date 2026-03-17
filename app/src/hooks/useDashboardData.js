import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { loadEstimate } from "@/hooks/usePersistence";

/* ────────────────────────────────────────────────────────
   useDashboardData — centralized data for dashboard widgets
   Extracted from NovaDashboardPage.jsx so widgets can read
   directly without prop drilling through the grid.
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

function statusToDisplay(status) {
  if (status === "Qualifying") return "review";
  if (status === "Bidding") return "bidding";
  if (status === "Pending") return "bidding";
  if (status === "Won") return "active";
  if (status === "On Hold") return "review";
  if (status === "Lost") return "lost";
  if (status === "Cancelled") return "cancelled";
  return "review";
}

export function useDashboardData() {
  const navigate = useNavigate();
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const createEstimate = useEstimatesStore(s => s.createEstimate);
  const deleteEstimate = useEstimatesStore(s => s.deleteEstimate);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  const [selectedEstimateId, setSelectedEstimateId] = useState(null);

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
    const active = all.filter(e => e.status === "Bidding" || e.status === "Pending");
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
