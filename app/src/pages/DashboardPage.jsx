import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useInboxStore } from "@/stores/inboxStore";
import { supabase } from "@/utils/supabase";
import { loadEstimate } from "@/hooks/usePersistence";
import KPI from "@/components/shared/KPI";
import Ic from "@/components/shared/Ic";
import CompanySwitcher from "@/components/shared/CompanySwitcher";
import AnimateIn from "@/components/ambient/AnimateIn";
import { I } from "@/constants/icons";
import { fmt, nn } from "@/utils/format";
import { inp, bt, pageContainer, card, sectionLabel, mono, statusBadge, moneyCell } from "@/utils/styles";
import CsvImportModal from "@/components/import/CsvImportModal";
import NewEstimateModal from "@/components/shared/NewEstimateModal";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";

const STATUSES = ["All", "Bidding", "Submitted", "Won", "Lost", "On Hold", "Cancelled"];

export default function DashboardPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const createEstimate = useEstimatesStore(s => s.createEstimate);
  const deleteEstimate = useEstimatesStore(s => s.deleteEstimate);
  const duplicateEstimate = useEstimatesStore(s => s.duplicateEstimate);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const onboardingDismissed = useUiStore(s => s.appSettings.onboardingDismissed);
  const updateSetting = useUiStore(s => s.updateSetting);
  const companyName = useMasterDataStore(s => s.masterData.companyInfo.name);

  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  // Company-scoped estimates — include unassigned (empty companyProfileId) estimates
  const companyEstimates = useMemo(() => {
    if (activeCompanyId === "__all__") return estimatesIndex;
    return estimatesIndex.filter(e => {
      const cid = e.companyProfileId || "";
      return cid === activeCompanyId || cid === "";
    });
  }, [estimatesIndex, activeCompanyId]);

  // Onboarding step completion
  const step1Done = !!companyName;
  const step2Done = true; // Cost DB has seed data
  const step3Done = companyEstimates.length > 0;
  const showOnboarding = !onboardingDismissed && companyEstimates.length === 0;

  const filtered = useMemo(() => {
    let list = companyEstimates;
    if (statusFilter !== "All") list = list.filter(e => e.status === statusFilter);
    if (search)
      list = list.filter(
        e =>
          (e.name || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.estimateNumber || "").toLowerCase().includes(search.toLowerCase()) ||
          (e.client || "").toLowerCase().includes(search.toLowerCase()),
      );
    return list;
  }, [companyEstimates, statusFilter, search]);

  // KPI calculations — scoped to active company
  const active = companyEstimates.filter(e => e.status === "Bidding" || e.status === "Submitted").length;
  const pipeline = companyEstimates
    .filter(e => e.status === "Bidding" || e.status === "Submitted")
    .reduce((s, e) => s + nn(e.grandTotal), 0);
  const won = companyEstimates.filter(e => e.status === "Won").length;
  const pending = companyEstimates.filter(e => e.status === "Submitted").length;
  const lost = companyEstimates.filter(e => e.status === "Lost").length;
  const winRate = won + lost > 0 ? ((won / (won + lost)) * 100).toFixed(0) + "%" : "N/A";

  // Pipeline breakdown — scoped to active company
  const statusCounts = {};
  STATUSES.filter(s => s !== "All").forEach(s => {
    statusCounts[s] = companyEstimates.filter(e => e.status === s).length;
  });
  const totalEstimates = companyEstimates.length || 1;

  // Upcoming deadlines — scoped to active company
  const upcoming = companyEstimates
    .filter(e => e.bidDue && (e.status === "Bidding" || e.status === "Submitted"))
    .sort((a, b) => new Date(a.bidDue) - new Date(b.bidDue))
    .slice(0, 5);

  const handleCreate = () => setShowNewModal(true);

  const handleNewCreated = async id => {
    setShowNewModal(false);
    await loadEstimate(id);
    navigate(`/estimate/${id}/takeoffs`);
  };

  const handleOpen = async id => {
    await loadEstimate(id);
    navigate(`/estimate/${id}/takeoffs`);
  };

  const handleDelete = async id => {
    await deleteEstimate(id);
    setDeleteConfirm(null);
  };

  const handleDuplicate = async id => {
    await duplicateEstimate(id);
  };

  const statusColor = s => {
    switch (s) {
      case "Bidding":
        return C.accent;
      case "Submitted":
        return C.orange;
      case "Won":
        return C.green;
      case "Lost":
        return C.red;
      case "On Hold":
        return C.purple;
      case "Cancelled":
        return C.textDim;
      default:
        return C.textMuted;
    }
  };

  if (showOnboarding) {
    const steps = [
      {
        icon: I.settings,
        label: "Company Profile",
        desc: "Add your company name, logo, and contact info for proposals.",
        done: step1Done,
        action: () => navigate("/settings"),
        color: C.accent,
      },
      {
        icon: I.database,
        label: "Cost Database",
        desc: "Review pre-loaded cost items or add your own pricing data.",
        done: step2Done,
        action: () => navigate("/core?tab=database"),
        color: C.green,
      },
      {
        icon: I.estimate,
        label: "First Estimate",
        desc: "Create your first project estimate and start building scope.",
        done: step3Done,
        action: () => handleCreate(),
        color: C.purple,
      },
    ];
    return (
      <div style={{ ...pageContainer(C), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 680 }}>
          <div style={{ marginBottom: T.space[2] }}>
            <NovaTerraLogo size={48} />
          </div>
          <div style={{ fontSize: T.fontSize.lg, color: C.textMuted, marginBottom: T.space[8] }}>
            Professional construction estimating. Powered by NOVA.
          </div>
          <div style={{ display: "flex", gap: T.space[4], justifyContent: "center" }}>
            {steps.map((s, i) => (
              <button
                key={i}
                onClick={s.action}
                style={{
                  ...card(C),
                  width: 200,
                  padding: T.space[5],
                  cursor: "pointer",
                  textAlign: "center",
                  transition: T.transition.base,
                  position: "relative",
                  animation: `staggerFadeUp 500ms cubic-bezier(0.16,1,0.3,1) ${200 + i * 120}ms both`,
                }}
                className="card-hover"
              >
                {s.done && (
                  <div
                    style={{
                      position: "absolute",
                      top: T.space[2],
                      right: T.space[2],
                      width: 20,
                      height: 20,
                      borderRadius: T.radius.full,
                      background: C.green,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 0 8px ${C.green}40`,
                    }}
                  >
                    <Ic d={I.check} size={12} color="#fff" sw={2.5} />
                  </div>
                )}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: T.radius.full,
                    margin: "0 auto",
                    marginBottom: T.space[3],
                    background: `linear-gradient(135deg, ${s.color}25, ${s.color}08)`,
                    border: `1px solid ${s.color}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ic d={s.icon} size={24} color={s.color} sw={1.7} />
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.md,
                    fontWeight: T.fontWeight.semibold,
                    color: C.text,
                    marginBottom: T.space[1],
                  }}
                >
                  {s.label}
                </div>
                <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, lineHeight: T.lineHeight.normal }}>
                  {s.desc}
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => updateSetting("onboardingDismissed", true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: T.fontSize.sm,
              color: C.textDim,
              marginTop: T.space[7],
              transition: T.transition.fast,
            }}
          >
            Skip setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainer(C)} className="blueprint-grid">
      {/* Company Switcher */}
      <div style={{ marginBottom: T.space[4] }}>
        <CompanySwitcher />
      </div>

      {/* Page Title */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: T.fontWeight.heavy,
          color: C.text,
          letterSpacing: -0.5,
          margin: 0,
          marginBottom: T.space[6],
          lineHeight: T.lineHeight.tight,
        }}
      >
        Estimates
      </h1>

      {/* KPI Row */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: T.space[5], marginBottom: T.space[8] }}
      >
        <KPI label="Active Bids" value={active} icon={I.estimate} color={C.accent} />
        <KPI label="Pipeline Value" value={fmt(pipeline)} icon={I.dollar} color={C.green} accent />
        <KPI label="Win Rate" value={winRate} icon={I.check} color={C.green} />
        <KPI label="Pending" value={pending} icon={I.bid} color={C.orange} />
        <KPI label="Total Estimates" value={companyEstimates.length} icon={I.folder} color={C.purple} />
      </div>

      {/* Pipeline Status Bar — animated segments */}
      {companyEstimates.length > 0 && (
        <div style={{ ...card(C), marginBottom: T.space[8], padding: T.space[4] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Pipeline Status</div>
          <div style={{ display: "flex", gap: 2, height: 14 }}>
            {STATUSES.filter(s => s !== "All" && statusCounts[s] > 0).map((s, i, arr) => {
              const pct = (statusCounts[s] / totalEstimates) * 100;
              const sc = statusColor(s);
              return (
                <div
                  key={s}
                  className="pipeline-bar-segment"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(180deg, ${sc}, ${sc}A0)`,
                    minWidth: 6,
                    boxShadow: `0 0 10px ${sc}25`,
                    animationDelay: `${450 + i * 80}ms`,
                    borderRadius:
                      i === 0 && arr.length === 1
                        ? T.radius.full
                        : i === 0
                          ? `${T.radius.full} 0 0 ${T.radius.full}`
                          : i === arr.length - 1
                            ? `0 ${T.radius.full} ${T.radius.full} 0`
                            : 2,
                    transition: "filter 150ms ease-out",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.filter = "brightness(1.25)")}
                  onMouseLeave={e => (e.currentTarget.style.filter = "brightness(1)")}
                  title={`${s}: ${statusCounts[s]} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: T.space[4], marginTop: T.space[3], flexWrap: "wrap" }}>
            {STATUSES.filter(s => s !== "All" && statusCounts[s] > 0).map((s, i) => {
              const pct = Math.round((statusCounts[s] / totalEstimates) * 100);
              return (
                <div
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[1],
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    animation: `staggerFadeUp 350ms cubic-bezier(0.16,1,0.3,1) ${500 + i * 60}ms both`,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: T.radius.sm,
                      background: statusColor(s),
                      boxShadow: `0 0 4px ${statusColor(s)}30`,
                    }}
                  />
                  {s} <span style={{ fontWeight: T.fontWeight.semibold, color: C.text }}>{statusCounts[s]}</span>{" "}
                  <span style={{ fontSize: 9, color: C.textDim }}>({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Deadlines — staggered rows */}
      {upcoming.length > 0 && (
        <div style={{ ...card(C), marginBottom: T.space[8], padding: T.space[4] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Upcoming Bid Deadlines</div>
          {upcoming.map((e, i) => {
            const daysLeft = Math.ceil((new Date(e.bidDue) - new Date()) / 86400000);
            const urgent = daysLeft <= 3;
            return (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: `${T.space[3]}px 0`,
                  borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.medium, color: C.text }}>
                    {e.name}
                  </span>
                  <span style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginLeft: T.space[2] }}>
                    {e.client}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: T.space[2], flexShrink: 0 }}>
                  <span style={{ fontSize: T.fontSize.sm, color: urgent ? C.red : C.textMuted }}>{e.bidDue}</span>
                  <span
                    style={statusBadge(urgent ? C.red : C.accent, {
                      boxShadow: urgent ? `0 0 6px ${C.red}20` : "none",
                      animation: urgent ? "glowPulse 2s ease-in-out infinite" : "none",
                    })}
                  >
                    {daysLeft <= 0 ? "OVERDUE" : `${daysLeft}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inbox Notification */}
      <InboxNotification C={C} T={T} navigate={navigate} />

      {/* Estimates Table */}
      <div
        style={{
          ...card(C),
          overflow: "hidden",
          animation: "staggerFadeUp 450ms cubic-bezier(0.16,1,0.3,1) 500ms both",
        }}
      >
        {/* Table Header */}
        <div
          style={{
            padding: `${T.space[4]}px ${T.space[5]}px`,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
            <span style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold, color: C.text }}>Estimates</span>
            <div style={{ position: "relative" }}>
              <input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={inp(C, { width: 180, paddingLeft: 28, fontSize: 11, padding: "5px 10px 5px 28px" })}
              />
              <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
                <Ic d={I.search} size={12} color={C.textDim} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 2 }}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    ...bt(C),
                    padding: "4px 10px",
                    fontSize: T.fontSize.xs,
                    background: statusFilter === s ? C.accent : "transparent",
                    color: statusFilter === s ? "#fff" : C.textMuted,
                    borderRadius: T.radius.full,
                    boxShadow: statusFilter === s ? `0 0 8px ${C.accent}30` : "none",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCsvImportOpen(true)}
              style={bt(C, {
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                padding: "7px 14px",
                borderRadius: T.radius.sm,
              })}
            >
              <Ic d={I.upload} size={14} color={C.textMuted} /> Import CSV
            </button>
            <button
              onClick={handleCreate}
              className="accent-btn"
              style={bt(C, {
                background: C.gradient || C.accent,
                color: "#fff",
                padding: "7px 14px",
                borderRadius: T.radius.sm,
                boxShadow: `0 0 12px ${C.accent}20`,
              })}
            >
              <Ic d={I.plus} size={14} color="#fff" sw={2.5} /> New Estimate
            </button>
          </div>
        </div>

        {/* Table Body */}
        {filtered.length === 0 ? (
          <div style={{ padding: T.space[10], textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: T.radius.full,
                margin: "0 auto",
                marginBottom: T.space[3],
                background: `linear-gradient(135deg, ${C.accent}25, ${C.accent}08)`,
                border: `1px solid ${C.accent}30`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ic d={I.folder} size={28} color={C.accent} sw={1.7} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.lg,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[1],
              }}
            >
              {companyEstimates.length === 0 ? "No estimates yet" : "No matches"}
            </div>
            <div style={{ fontSize: T.fontSize.base, color: C.textMuted, marginBottom: T.space[4] }}>
              {companyEstimates.length === 0
                ? "Create your first estimate to get started."
                : "No estimates match your current filter."}
            </div>
            {companyEstimates.length === 0 && (
              <button
                onClick={handleCreate}
                className="accent-btn"
                style={bt(C, {
                  background: C.gradient || C.accent,
                  color: "#fff",
                  padding: "10px 20px",
                  borderRadius: T.radius.sm,
                  boxShadow: `0 0 12px ${C.accent}20`,
                })}
              >
                <Ic d={I.plus} size={14} color="#fff" sw={2.5} /> Create Estimate
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 80px",
                padding: `${T.space[3]}px ${T.space[5]}px`,
                background: C.bg2,
                borderBottom: `1px solid ${C.border}`,
                ...sectionLabel(C),
              }}
            >
              <span>Name</span>
              <span>Client</span>
              <span>Status</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span>Modified</span>
              <span></span>
            </div>
            {filtered.map((est, idx) => {
              const sc = statusColor(est.status);
              const total = nn(est.grandTotal);
              return (
                <div
                  key={est.id}
                  className="row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 80px",
                    padding: `${T.space[3]}px ${T.space[5]}px`,
                    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                    borderLeft: `3px solid ${sc}40`,
                    alignItems: "center",
                    cursor: "pointer",
                    background:
                      idx % 2 === 1 ? (C.isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)") : "transparent",
                    animation: `staggerFadeRight 300ms cubic-bezier(0.16,1,0.3,1) ${600 + idx * 35}ms both`,
                  }}
                  onClick={() => handleOpen(est.id)}
                >
                  <span
                    style={{
                      fontSize: T.fontSize.md,
                      fontWeight: T.fontWeight.semibold,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingRight: 8,
                    }}
                  >
                    {est.name || "Untitled"}
                    {est.estimateNumber && (
                      <span style={{ fontSize: T.fontSize.xs, color: C.accent, fontWeight: 500, marginLeft: 6 }}>
                        #{est.estimateNumber}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: T.fontSize.sm,
                      color: C.textMuted,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {est.client || "\u2014"}
                  </span>
                  <span>
                    <span style={statusBadge(sc)}>{est.status || "Draft"}</span>
                  </span>
                  <span style={moneyCell(C, total)}>{fmt(est.grandTotal)}</span>
                  <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{est.lastModified || "\u2014"}</span>
                  <div
                    style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleDuplicate(est.id)}
                      title="Duplicate"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        borderRadius: 4,
                        display: "flex",
                      }}
                      className="icon-btn"
                    >
                      <Ic d={I.copy} size={13} color={C.textDim} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(est.id)}
                      title="Delete"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 4,
                        borderRadius: 4,
                        display: "flex",
                      }}
                      className="icon-btn"
                    >
                      <Ic d={I.trash} size={13} color={C.red} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation — cinematic modal */}
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
              width: 380,
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
                fontSize: T.fontSize.lg,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[2],
                textAlign: "center",
              }}
            >
              Delete Estimate?
            </div>
            <div
              style={{
                fontSize: T.fontSize.base,
                color: C.textMuted,
                marginBottom: T.space[5],
                textAlign: "center",
                lineHeight: T.lineHeight.normal,
              }}
            >
              This cannot be undone. All data for this estimate will be permanently removed.
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
                onClick={() => handleDelete(deleteConfirm)}
                style={bt(C, {
                  background: C.red,
                  color: "#fff",
                  padding: `${T.space[2]}px ${T.space[5]}px`,
                  boxShadow: `0 0 12px ${C.red}30`,
                  borderRadius: T.radius.sm,
                })}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {csvImportOpen && <CsvImportModal onClose={() => setCsvImportOpen(false)} mode="new" />}
      {showNewModal && (
        <NewEstimateModal
          companyProfileId={activeCompanyId === "__all__" ? "" : activeCompanyId}
          onCreated={handleNewCreated}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}

// Inbox notification card — only shows when there are pending RFPs
function InboxNotification({ C, T, navigate }) {
  const unreadCount = useInboxStore(s => s.unreadCount);

  if (!supabase || unreadCount === 0) return null;

  return (
    <div
      style={{
        ...card(C),
        padding: `${T.space[3]}px ${T.space[4]}px`,
        marginBottom: T.space[5],
        display: "flex",
        alignItems: "center",
        gap: T.space[3],
        cursor: "pointer",
        background: `${C.accent}08`,
        border: `1px solid ${C.accent}25`,
      }}
      onClick={() => navigate("/inbox")}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = C.accent + "50";
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = C.accent + "25";
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: T.radius.sm,
          background: `${C.accent}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ic d={I.inbox} size={16} color={C.accent} />
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text }}>
          {unreadCount} new RFP{unreadCount !== 1 ? "s" : ""} in your inbox
        </span>
        <span style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginLeft: T.space[2] }}>
          — ready to import as estimates
        </span>
      </div>
      <span style={{ fontSize: T.fontSize.xs, color: C.accent, fontWeight: T.fontWeight.semibold }}>View Inbox →</span>
    </div>
  );
}
