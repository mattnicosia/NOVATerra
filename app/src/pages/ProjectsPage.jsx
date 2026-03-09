import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";
import { loadEstimate } from "@/hooks/usePersistence";
import { supabase } from "@/utils/supabase";
import Ic from "@/components/shared/Ic";
import EmptyState from "@/components/shared/EmptyState";
import CompanySwitcher from "@/components/shared/CompanySwitcher";
import NewEstimateModal from "@/components/shared/NewEstimateModal";
import CompletionSummary from "@/components/shared/CompletionSummary";
import OutcomeFeedbackModal from "@/components/shared/OutcomeFeedbackModal";
import { I } from "@/constants/icons";
import { inp, bt, card, statusBadge, moneyCell } from "@/utils/styles";
import { fmt } from "@/utils/format";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Qualifying", label: "Qualifying" },
  { key: "Bidding", label: "Bidding" },
  { key: "Submitted", label: "Submitted" },
  { key: "Won", label: "Won" },
  { key: "Lost", label: "Lost" },
  { key: "On Hold", label: "On Hold" },
  { key: "Trash", label: "Trash" },
];

const SORT_OPTIONS = [
  { key: "lastModified", label: "Last Modified" },
  { key: "name", label: "Name" },
  { key: "grandTotal", label: "Value" },
  { key: "status", label: "Status" },
  { key: "bidDue", label: "Bid Due" },
];

const STATUS_COLORS = {
  Qualifying: "#F59E0B",
  Bidding: "#A78BFA",
  Submitted: "#60A5FA",
  Won: "#34D399",
  Lost: "#FB7185",
  "On Hold": "#FBBF24",
  Draft: "#8E8E93",
  Cancelled: "#8E8E93",
  Trash: "#8E8E93",
};

const STATUS_ORDER = ["Qualifying", "Bidding", "Submitted", "Won", "Lost", "On Hold", "Draft"];

/* ── Helper: is date within this week (Mon–Sun)? ── */
function isDueThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return d >= monday && d <= sunday;
}

/* ── Inline status dropdown ── */
function StatusDropdown({ currentStatus, onSelect, onClose, C, T }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 4,
        zIndex: 100,
        background: C.bg1,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 4,
        minWidth: 130,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        animation: "fadeIn 0.12s ease-out",
      }}
    >
      {STATUS_ORDER.map(status => {
        const sc = STATUS_COLORS[status];
        const isActive = currentStatus === status;
        return (
          <button
            key={status}
            onClick={() => {
              onSelect(status);
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 10px",
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              background: isActive ? `${sc}15` : "transparent",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400, color: isActive ? sc : C.textMuted }}>
              {status}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Presence Dots (shared helper) ── */
function PresenceDots({ viewers, C }) {
  if (!viewers?.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
      {viewers.slice(0, 4).map((v, i) => (
        <div
          key={i}
          title={v.userName}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: v.userColor || "#60A5FA",
            border: `1.5px solid ${C.bg1}`,
            marginLeft: i > 0 ? -3 : 0,
            flexShrink: 0,
          }}
        />
      ))}
      {viewers.length > 4 && (
        <span style={{ fontSize: 8, color: C.textDim, marginLeft: 2 }}>+{viewers.length - 4}</span>
      )}
    </div>
  );
}

/* ── Kanban Card ── */
function KanbanCard({ est, C, T, navigate, onStatusChange, onDuplicate, onDelete, viewers }) {
  const sc = STATUS_COLORS[est.status] || STATUS_COLORS.Draft;
  return (
    <div
      onClick={() => navigate(`/estimate/${est.id}/takeoffs`)}
      style={{
        background: C.glassBg || "rgba(255,255,255,0.03)",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 12,
        cursor: "pointer",
        transition: "all 0.15s ease",
        borderLeft: `3px solid ${sc}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = C.glassBg || "rgba(255,255,255,0.03)";
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {est.name || "Untitled"}
        </div>
        <PresenceDots viewers={viewers} C={C} />
        {est.status === "Won" && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: "#34D399",
              background: "rgba(52,211,153,0.15)",
              padding: "1px 5px",
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            WON
          </span>
        )}
        {est.status === "Lost" && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: "#FB7185",
              background: "rgba(251,113,133,0.15)",
              padding: "1px 5px",
              borderRadius: 3,
              flexShrink: 0,
            }}
          >
            LOST
          </span>
        )}
      </div>
      {est.estimateNumber && (
        <div style={{ fontSize: 9, color: C.accent, fontWeight: 500, marginBottom: 2 }}>#{est.estimateNumber}</div>
      )}
      {est.client && <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6 }}>{est.client}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: C.text }}>
          {est.grandTotal ? fmt(est.grandTotal) : "—"}
        </span>
        {est.bidDue && (
          <span style={{ fontSize: 9, color: isDueThisWeek(est.bidDue) ? "#FBBF24" : C.textDim }}>{est.bidDue}</span>
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const createEstimate = useEstimatesStore(s => s.createEstimate);
  const deleteEstimate = useEstimatesStore(s => s.deleteEstimate);
  const duplicateEstimate = useEstimatesStore(s => s.duplicateEstimate);
  const updateIndexEntry = useEstimatesStore(s => s.updateIndexEntry);
  const showToast = useUiStore(s => s.showToast);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const orgId = useOrgStore(s => s.org?.id);
  const userId = useAuthStore(s => s.user?.id);

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("lastModified");
  const [sortDir, setSortDir] = useState("desc");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewMode, setViewMode] = useState("table"); // table | board
  const [dueThisWeek, setDueThisWeek] = useState(false);
  const [statusDropdownId, setStatusDropdownId] = useState(null);
  const [scope, setScope] = useState("mine"); // "mine" | "team" (org mode only)
  const [presenceMap, setPresenceMap] = useState({}); // { estimateId: [{ user_name, user_color }] }
  const [completionEst, setCompletionEst] = useState(null); // For CompletionSummary modal
  const [outcomeEst, setOutcomeEst] = useState(null); // { estimate, status } for OutcomeFeedbackModal

  // Fetch presence dots for all estimates (org mode only)
  useEffect(() => {
    if (!orgId || !supabase) return;
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    supabase
      .from("estimate_presence")
      .select("estimate_id, user_name, user_color")
      .eq("org_id", orgId)
      .gte("last_seen", fiveMinAgo)
      .then(({ data }) => {
        const map = {};
        for (const row of data || []) {
          if (!map[row.estimate_id]) map[row.estimate_id] = [];
          map[row.estimate_id].push({ userName: row.user_name, userColor: row.user_color });
        }
        setPresenceMap(map);
      });
  }, [orgId]);

  // Filter by company — "__all__" shows everything, otherwise exact match
  const companyFiltered = useMemo(() => {
    if (activeCompanyId === "__all__") return estimatesIndex;
    return estimatesIndex.filter(e => (e.companyProfileId || "") === (activeCompanyId || ""));
  }, [estimatesIndex, activeCompanyId]);

  // Filter by scope — "mine" shows only assigned (org mode), "team" shows all
  const scopeFiltered = useMemo(() => {
    if (!orgId || scope === "team") return companyFiltered;
    return companyFiltered.filter(e => !e.assignedTo?.length || e.assignedTo.includes(userId));
  }, [companyFiltered, scope, orgId, userId]);

  // Filter by status tab — Trash items are excluded from "all" and only visible in Trash tab
  const tabFiltered = useMemo(() => {
    if (activeTab === "Trash") return scopeFiltered.filter(e => e.status === "Trash");
    if (activeTab === "all") return scopeFiltered.filter(e => e.status !== "Trash");
    return scopeFiltered.filter(e => (e.status || "Draft") === activeTab);
  }, [scopeFiltered, activeTab]);

  // Due this week filter
  const weekFiltered = useMemo(() => {
    if (!dueThisWeek) return tabFiltered;
    return tabFiltered.filter(e => isDueThisWeek(e.bidDue));
  }, [tabFiltered, dueThisWeek]);

  // Search filter
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return weekFiltered;
    const q = search.toLowerCase();
    return weekFiltered.filter(
      e =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.estimateNumber || "").toLowerCase().includes(q) ||
        (e.client || "").toLowerCase().includes(q) ||
        (e.estimator || "").toLowerCase().includes(q) ||
        (e.jobType || "").toLowerCase().includes(q) ||
        (e.status || "").toLowerCase().includes(q),
    );
  }, [weekFiltered, search]);

  // Sort
  const sorted = useMemo(() => {
    const list = [...searchFiltered];
    list.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case "name":
          av = (a.name || "").toLowerCase();
          bv = (b.name || "").toLowerCase();
          break;
        case "grandTotal":
          av = a.grandTotal || 0;
          bv = b.grandTotal || 0;
          break;
        case "status":
          av = (a.status || "").toLowerCase();
          bv = (b.status || "").toLowerCase();
          break;
        case "bidDue":
          av = a.bidDue || "";
          bv = b.bidDue || "";
          break;
        default:
          av = a.lastModified || "";
          bv = b.lastModified || "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [searchFiltered, sortBy, sortDir]);

  const tabCounts = useMemo(() => {
    const counts = { all: scopeFiltered.filter(e => e.status !== "Trash").length };
    STATUS_TABS.forEach(t => {
      if (t.key !== "all") counts[t.key] = scopeFiltered.filter(e => (e.status || "Draft") === t.key).length;
    });
    return counts;
  }, [scopeFiltered]);

  // Kanban: group by status
  const kanbanColumns = useMemo(() => {
    const cols = {};
    STATUS_ORDER.forEach(s => {
      cols[s] = [];
    });
    searchFiltered.forEach(e => {
      const status = e.status || "Draft";
      if (!cols[status]) cols[status] = [];
      cols[status].push(e);
    });
    return cols;
  }, [searchFiltered]);

  const dueThisWeekCount = useMemo(() => {
    return scopeFiltered.filter(e => isDueThisWeek(e.bidDue)).length;
  }, [scopeFiltered]);

  const [showNewModal, setShowNewModal] = useState(false);

  const handleNewEstimate = () => {
    setShowNewModal(true);
  };

  const handleNewCreated = async id => {
    setShowNewModal(false);
    await loadEstimate(id);
    navigate(`/estimate/${id}/documents`);
  };

  const handleDuplicate = async (e, est) => {
    e.stopPropagation();
    const newId = await duplicateEstimate(est.id);
    if (newId) showToast(`Duplicated "${est.name}"`);
  };

  // Move to Trash (soft) — saves original status so we can restore
  const handleTrash = () => {
    if (!deleteConfirm) return;
    const id = deleteConfirm;
    const est = estimatesIndex.find(e => e.id === id);
    setDeleteConfirm(null);
    updateIndexEntry(id, {
      status: "Trash",
      _preTrashStatus: est?.status || "Bidding",
      _trashedAt: new Date().toISOString(),
    });
    showToast("Moved to Trash");
  };

  // Restore from Trash
  const handleRestore = id => {
    const est = estimatesIndex.find(e => e.id === id);
    const restoreStatus = est?._preTrashStatus || "Bidding";
    updateIndexEntry(id, { status: restoreStatus, _preTrashStatus: undefined, _trashedAt: undefined });
    showToast("Restored");
  };

  // Permanent delete (from Trash only)
  const [permDeleteConfirm, setPermDeleteConfirm] = useState(null);
  const handlePermanentDelete = async () => {
    if (!permDeleteConfirm) return;
    const id = permDeleteConfirm;
    setPermDeleteConfirm(null);
    await deleteEstimate(id);
    showToast("Permanently deleted");
  };

  // Empty Trash
  const handleEmptyTrash = async () => {
    const trashed = estimatesIndex.filter(e => e.status === "Trash");
    for (const est of trashed) {
      await deleteEstimate(est.id);
    }
    showToast(`Deleted ${trashed.length} item${trashed.length !== 1 ? "s" : ""}`);
  };

  const handleStatusChange = useCallback(
    (estId, newStatus) => {
      updateIndexEntry(estId, { status: newStatus });
      showToast(`Status → ${newStatus}`);

      // Engagement: trigger modals on status change
      const est = estimatesIndex.find(e => e.id === estId);
      if (!est) return;

      if (newStatus === "Submitted") {
        setCompletionEst(est);
      } else if (newStatus === "Won" || newStatus === "Lost") {
        setOutcomeEst({ estimate: est, status: newStatus });
      }
    },
    [updateIndexEntry, showToast, estimatesIndex],
  );

  const toggleSort = key => {
    if (sortBy === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const statusColor = status => STATUS_COLORS[status] || STATUS_COLORS.Draft;

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }}>
      <div style={{ maxWidth: 1200 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: T.space[5],
          }}
        >
          <div>
            <h1
              style={{
                fontSize: T.fontSize.xl,
                fontWeight: T.fontWeight.bold,
                color: C.text,
                marginBottom: T.space[1],
              }}
            >
              Projects
            </h1>
            <p style={{ color: C.textMuted, fontSize: T.fontSize.sm }}>
              {activeTab === "Trash"
                ? `${tabCounts.Trash || 0} item${(tabCounts.Trash || 0) !== 1 ? "s" : ""} in Trash`
                : `${companyFiltered.filter(e => e.status !== "Trash").length} estimate${companyFiltered.filter(e => e.status !== "Trash").length !== 1 ? "s" : ""} across all statuses`}
            </p>
          </div>
          <div style={{ display: "flex", gap: T.space[2], alignItems: "center" }}>
            <CompanySwitcher />
            {orgId && (
              <div style={{ display: "flex", background: C.bg2, borderRadius: 6, padding: 2 }}>
                {[
                  { key: "mine", label: "Mine" },
                  { key: "team", label: "Team" },
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => setScope(s.key)}
                    style={{
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: scope === s.key ? 600 : 400,
                      color: scope === s.key ? C.text : C.textMuted,
                      background: scope === s.key ? C.accent + "20" : "transparent",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {activeTab === "Trash" && (tabCounts.Trash || 0) > 0 && (
              <button
                onClick={handleEmptyTrash}
                style={bt(C, {
                  background: C.red,
                  color: "#fff",
                  padding: "8px 18px",
                  borderRadius: T.radius.sm,
                  boxShadow: `0 0 12px ${C.red}20`,
                  fontSize: T.fontSize.sm,
                })}
              >
                <Ic d={I.trash} size={13} color="#fff" sw={2} /> Empty Trash
              </button>
            )}
            <button
              onClick={handleNewEstimate}
              className="accent-btn"
              style={bt(C, {
                background: C.gradient || C.accent,
                color: "#fff",
                padding: "8px 18px",
                borderRadius: T.radius.sm,
                boxShadow: `0 0 12px ${C.accent}20`,
              })}
            >
              <Ic d={I.plus} size={13} color="#fff" sw={2.5} /> New Estimate
            </button>
          </div>
        </div>

        {/* Status Tabs + Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: T.space[4],
            gap: T.space[3],
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
            {STATUS_TABS.map(tab => {
              const isActive = activeTab === tab.key;
              const tc = tab.key === "all" ? C.accent : STATUS_COLORS[tab.key] || C.accent;
              const count = tabCounts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    ...bt(C),
                    padding: "7px 14px",
                    fontSize: T.fontSize.sm,
                    borderRadius: T.radius.sm,
                    background: isActive ? C.glassBg || "rgba(18,21,28,0.85)" : "transparent",
                    color: isActive ? tc : C.textMuted,
                    boxShadow: isActive ? `0 0 12px ${tc}15, ${T.shadow.sm}` : "none",
                    border: isActive ? `1px solid ${tc}25` : "1px solid transparent",
                  }}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 8,
                        marginLeft: 4,
                        background: isActive ? `${tc}20` : `${C.textDim}15`,
                        color: isActive ? tc : C.textDim,
                        lineHeight: "14px",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: T.space[2], alignItems: "center" }}>
            {/* Due This Week toggle */}
            {dueThisWeekCount > 0 && (
              <button
                onClick={() => setDueThisWeek(v => !v)}
                style={{
                  ...bt(C),
                  padding: "6px 12px",
                  fontSize: 11,
                  borderRadius: T.radius.sm,
                  background: dueThisWeek ? "#FBBF2418" : "transparent",
                  color: dueThisWeek ? "#FBBF24" : C.textMuted,
                  border: `1px solid ${dueThisWeek ? "#FBBF2440" : C.border}`,
                  fontWeight: dueThisWeek ? 600 : 400,
                }}
              >
                Due This Week
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 8,
                    marginLeft: 4,
                    background: dueThisWeek ? "#FBBF2425" : `${C.textDim}15`,
                    color: dueThisWeek ? "#FBBF24" : C.textDim,
                  }}
                >
                  {dueThisWeekCount}
                </span>
              </button>
            )}

            {/* View toggle */}
            <div
              style={{
                display: "flex",
                background: C.bg2,
                borderRadius: 6,
                padding: 2,
                border: `1px solid ${C.border}`,
              }}
            >
              <button
                onClick={() => setViewMode("table")}
                title="Table view"
                style={{
                  width: 28,
                  height: 26,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: viewMode === "table" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: viewMode === "table" ? C.text : C.textDim,
                  transition: "all 0.12s",
                }}
              >
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 4h14M1 8h14M1 12h14" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("board")}
                title="Board view"
                style={{
                  width: 28,
                  height: 26,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: viewMode === "board" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: viewMode === "board" ? C.text : C.textDim,
                  transition: "all 0.12s",
                }}
              >
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="1" y="1" width="4" height="14" rx="1" />
                  <rect x="6" y="1" width="4" height="10" rx="1" />
                  <rect x="11" y="1" width="4" height="12" rx="1" />
                </svg>
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <input
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={inp(C, { width: 220, paddingLeft: 30, fontSize: 12, padding: "6px 10px 6px 30px" })}
              />
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <Ic d={I.search} size={12} color={C.textDim} />
              </div>
            </div>
            {viewMode === "table" && (
              <>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={inp(C, { fontSize: 11, padding: "6px 8px" })}
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
                  style={{
                    ...bt(C),
                    width: 28,
                    height: 28,
                    padding: 0,
                    borderRadius: T.radius.sm,
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textMuted}
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    {sortDir === "desc" ? <path d="M12 5v14M5 12l7 7 7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── TABLE VIEW ── */}
        {viewMode === "table" && (
          <div style={{ ...card(C), overflow: "hidden" }}>
            {sorted.length === 0 ? (
              search ? (
                <EmptyState
                  icon={I.search}
                  title="No matches"
                  subtitle={`No projects match "${search}"`}
                  color={C.accent}
                />
              ) : estimatesIndex.length > 0 && activeCompanyId && activeCompanyId !== "__all__" ? (
                <EmptyState
                  icon={I.filter || I.search}
                  title="No projects for this profile"
                  subtitle="Your estimates are assigned to a different company profile. Switch to 'All' to see everything."
                  action={() => useUiStore.getState().updateSetting("activeCompanyId", "__all__")}
                  actionLabel="Show All Projects"
                  actionIcon={I.eye || I.list}
                  color={C.accent}
                />
              ) : (
                <EmptyState
                  icon={I.estimate}
                  title="No projects yet"
                  subtitle="Create your first estimate to get started."
                  action={handleNewEstimate}
                  actionLabel="New Estimate"
                  actionIcon={I.plus}
                  color={C.accent}
                />
              )
            ) : (
              <>
                {/* Column headers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.5fr 1.2fr .8fr 1fr .8fr .9fr 80px",
                    gap: 8,
                    padding: `${T.space[2]}px ${T.space[4]}px`,
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    background: C.bg2,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ cursor: "pointer" }} onClick={() => toggleSort("name")}>
                    Project {sortBy === "name" && (sortDir === "asc" ? "↑" : "↓")}
                  </span>
                  <span>Client</span>
                  <span style={{ cursor: "pointer" }} onClick={() => toggleSort("status")}>
                    Status {sortBy === "status" && (sortDir === "asc" ? "↑" : "↓")}
                  </span>
                  <span style={{ cursor: "pointer", textAlign: "right" }} onClick={() => toggleSort("grandTotal")}>
                    Value {sortBy === "grandTotal" && (sortDir === "asc" ? "↑" : "↓")}
                  </span>
                  <span style={{ cursor: "pointer" }} onClick={() => toggleSort("bidDue")}>
                    Bid Due {sortBy === "bidDue" && (sortDir === "asc" ? "↑" : "↓")}
                  </span>
                  <span style={{ cursor: "pointer" }} onClick={() => toggleSort("lastModified")}>
                    Modified {sortBy === "lastModified" && (sortDir === "asc" ? "↑" : "↓")}
                  </span>
                  <span></span>
                </div>

                {/* Rows */}
                {sorted.map((est, idx) => {
                  const sc = statusColor(est.status);
                  const total = est.grandTotal || 0;
                  return (
                    <div
                      key={est.id}
                      className="row"
                      onClick={() => navigate(`/estimate/${est.id}/takeoffs`)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2.5fr 1.2fr .8fr 1fr .8fr .9fr 80px",
                        gap: 8,
                        padding: `${T.space[3]}px ${T.space[4]}px`,
                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                        borderLeft: `3px solid ${sc}40`,
                        background:
                          idx % 2 === 1 ? (C.isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)") : "transparent",
                        cursor: "pointer",
                        transition: "background 100ms ease-out",
                        animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 25}ms both`,
                        alignItems: "center",
                      }}
                    >
                      {/* Project name + estimate number + type */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span
                            style={{
                              fontSize: T.fontSize.base,
                              fontWeight: T.fontWeight.semibold,
                              color: C.text,
                              lineHeight: 1.3,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {est.name || "Untitled"}
                          </span>
                          {est.estimateNumber && (
                            <span style={{ fontSize: T.fontSize.xs, color: C.accent, fontWeight: 500, flexShrink: 0 }}>
                              #{est.estimateNumber}
                            </span>
                          )}
                          <PresenceDots viewers={presenceMap[est.id]} C={C} />
                        </div>
                        {(est.jobType || est.estimator) && (
                          <div
                            style={{
                              fontSize: T.fontSize.xs,
                              color: C.textDim,
                              marginTop: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {[est.jobType, est.estimator].filter(Boolean).join(" \u00b7 ")}
                          </div>
                        )}
                      </div>

                      {/* Client */}
                      <div
                        style={{
                          fontSize: T.fontSize.sm,
                          color: C.textMuted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {est.client || "\u2014"}
                      </div>

                      {/* Status badge — clickable for inline change */}
                      <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setStatusDropdownId(statusDropdownId === est.id ? null : est.id)}
                          style={statusBadge(sc, {
                            cursor: "pointer",
                            border: "none",
                            transition: "all 100ms ease-out",
                          })}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = `${sc}28`;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = `${sc}18`;
                          }}
                        >
                          {est.status || "Draft"}
                        </button>
                        {statusDropdownId === est.id && (
                          <StatusDropdown
                            currentStatus={est.status || "Draft"}
                            onSelect={s => handleStatusChange(est.id, s)}
                            onClose={() => setStatusDropdownId(null)}
                            C={C}
                            T={T}
                          />
                        )}
                      </div>

                      {/* Value */}
                      <div style={moneyCell(C, total)}>{total ? fmt(total) : "\u2014"}</div>

                      {/* Bid Due */}
                      <div
                        style={{
                          fontSize: T.fontSize.sm,
                          color: isDueThisWeek(est.bidDue) ? C.yellow || "#FBBF24" : C.textMuted,
                        }}
                      >
                        {est.bidDue || "\u2014"}
                      </div>

                      {/* Modified */}
                      <div
                        style={{
                          fontSize: T.fontSize.xs,
                          color: C.textDim,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {est.lastModified || "\u2014"}
                      </div>

                      {/* Actions */}
                      <div
                        style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {activeTab === "Trash" ? (
                          <>
                            <button
                              title="Restore"
                              onClick={() => handleRestore(est.id)}
                              className="icon-btn"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic d="M3 12a9 9 0 109-9M3 3v6h6" size={12} color="#34D399" />
                            </button>
                            <button
                              title="Delete permanently"
                              onClick={() => setPermDeleteConfirm(est.id)}
                              className="icon-btn"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic d={I.trash} size={12} color={C.red} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              title="Project Settings"
                              onClick={async () => {
                                await loadEstimate(est.id);
                                navigate(`/estimate/${est.id}/project`);
                              }}
                              className="icon-btn"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic d={I.settings} size={12} color={C.textDim} />
                            </button>
                            <button
                              title="Duplicate"
                              onClick={e => handleDuplicate(e, est)}
                              className="icon-btn"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic
                                d={
                                  I.copy ||
                                  I.duplicate ||
                                  "M8 4H4a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-4M14 2h-4v4h4V2zM12 2v4h4"
                                }
                                size={12}
                                color={C.textDim}
                              />
                            </button>
                            <button
                              title="Move to Trash"
                              onClick={e => {
                                e.stopPropagation();
                                setDeleteConfirm(est.id);
                              }}
                              className="icon-btn"
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: T.radius.sm,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic d={I.trash} size={12} color={C.red} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Footer stats */}
                <div
                  style={{
                    padding: `${T.space[3]}px ${T.space[4]}px`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11,
                    color: C.textDim,
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <span>
                    {sorted.length} project{sorted.length !== 1 ? "s" : ""}
                    {search && ` matching "${search}"`}
                    {dueThisWeek && " · due this week"}
                  </span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, color: C.textMuted }}>
                    Total: {fmt(sorted.reduce((s, e) => s + (e.grandTotal || 0), 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── KANBAN / BOARD VIEW ── */}
        {viewMode === "board" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${STATUS_ORDER.length}, 1fr)`,
              gap: 12,
              minHeight: 400,
            }}
          >
            {STATUS_ORDER.map(status => {
              const sc = STATUS_COLORS[status];
              const items = kanbanColumns[status] || [];
              return (
                <div
                  key={status}
                  style={{
                    background: C.bg2 || "rgba(255,255,255,0.02)",
                    borderRadius: 12,
                    padding: 10,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minHeight: 200,
                  }}
                >
                  {/* Column header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 4px 8px",
                      borderBottom: `2px solid ${sc}30`,
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc }} />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: C.text,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {status}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.textDim, marginLeft: "auto" }}>
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  {items.length === 0 ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, color: C.textDim, fontStyle: "italic" }}>No projects</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, overflow: "auto" }}>
                      {items.map(est => (
                        <KanbanCard
                          key={est.id}
                          est={est}
                          C={C}
                          T={T}
                          navigate={navigate}
                          onStatusChange={handleStatusChange}
                          onDuplicate={handleDuplicate}
                          onDelete={setDeleteConfirm}
                          viewers={presenceMap[est.id]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Move to Trash confirmation modal */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.lg,
              padding: T.space[7],
              width: 340,
              boxShadow: T.shadow.xl,
              animation: "modalEnter 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: T.radius.full,
                margin: "0 auto",
                marginBottom: T.space[4],
                background: `${C.accent}15`,
                border: `1px solid ${C.accent}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.trash} size={22} color={C.accent} sw={1.7} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.md,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[2],
                textAlign: "center",
              }}
            >
              Move to Trash?
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[5], textAlign: "center" }}>
              "{estimatesIndex.find(e => e.id === deleteConfirm)?.name || "Untitled"}" will be moved to Trash. You can
              restore it later.
            </div>
            <div style={{ display: "flex", gap: T.space[2], justifyContent: "center" }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={bt(C, {
                  background: C.bg2,
                  color: C.textMuted,
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm,
                })}
              >
                Cancel
              </button>
              <button
                onClick={handleTrash}
                style={bt(C, {
                  background: C.accent,
                  color: "#fff",
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  boxShadow: `0 0 12px ${C.accent}30`,
                  borderRadius: T.radius.sm,
                })}
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Permanent delete confirmation (from Trash view) */}
      {permDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setPermDeleteConfirm(null)}
        >
          <div
            style={{
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.lg,
              padding: T.space[7],
              width: 340,
              boxShadow: T.shadow.xl,
              animation: "modalEnter 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: T.radius.full,
                margin: "0 auto",
                marginBottom: T.space[4],
                background: `${C.red}15`,
                border: `1px solid ${C.red}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.trash} size={22} color={C.red} sw={1.7} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.md,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[2],
                textAlign: "center",
              }}
            >
              Delete Permanently?
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[5], textAlign: "center" }}>
              "{estimatesIndex.find(e => e.id === permDeleteConfirm)?.name || "Untitled"}" will be permanently removed.
              This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: T.space[2], justifyContent: "center" }}>
              <button
                onClick={() => setPermDeleteConfirm(null)}
                style={bt(C, {
                  background: C.bg2,
                  color: C.textMuted,
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: T.radius.sm,
                })}
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                style={bt(C, {
                  background: C.red,
                  color: "#fff",
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  boxShadow: `0 0 12px ${C.red}30`,
                  borderRadius: T.radius.sm,
                })}
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
      {showNewModal && (
        <NewEstimateModal
          companyProfileId={activeCompanyId === "__all__" ? "" : activeCompanyId}
          onCreated={handleNewCreated}
          onClose={() => setShowNewModal(false)}
        />
      )}
      {completionEst && <CompletionSummary estimate={completionEst} onClose={() => setCompletionEst(null)} />}
      {outcomeEst && (
        <OutcomeFeedbackModal
          estimate={outcomeEst.estimate}
          status={outcomeEst.status}
          onSave={outcome => {
            updateIndexEntry(outcomeEst.estimate.id, { outcomeMetadata: outcome });
            showToast("Outcome saved");
            setOutcomeEst(null);
          }}
          onSkip={() => setOutcomeEst(null)}
        />
      )}
    </div>
  );
}
