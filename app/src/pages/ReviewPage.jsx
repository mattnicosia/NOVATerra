// ═══════════════════════════════════════════════════════════════════════════════
// ReviewPage — Quality gate before Network & Reports
//
// Four blocks:
//   1. Completeness Score — % of items with quantities, pricing, codes
//   2. Cost Validation — zero-cost, high rates, missing codes, duplicates
//   3. Scope Gap Check — missing CSI divisions for building type
//   4. Schedule of Values — trade-grouped breakdown with markup editor
//
// SOV lives here as the "final numbers" view before sending proposals.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useMemo, lazy, Suspense } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { runValidation } from "@/utils/costValidation";
import { detectScopeGaps } from "@/nova/predictive/scopeGapDetector";
import { fmt } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const ScheduleOfValuesPage = lazy(() => import("./ScheduleOfValuesPage"));

// ─── Completeness Check ──────────────────────────────────────────────────────
function computeCompleteness(items) {
  if (items.length === 0) return { pct: 0, details: [] };

  let withQty = 0, withPricing = 0, withCode = 0, withUnit = 0;
  for (const it of items) {
    if (it.quantity > 0) withQty++;
    if (it.material > 0 || it.labor > 0 || it.equipment > 0 || it.subcontractor > 0) withPricing++;
    if (it.code) withCode++;
    if (it.unit) withUnit++;
  }

  const total = items.length;
  const checks = [
    { label: "Have quantities", count: withQty, total, pct: Math.round((withQty / total) * 100) },
    { label: "Have pricing", count: withPricing, total, pct: Math.round((withPricing / total) * 100) },
    { label: "Have CSI codes", count: withCode, total, pct: Math.round((withCode / total) * 100) },
    { label: "Have units", count: withUnit, total, pct: Math.round((withUnit / total) * 100) },
  ];

  const pct = Math.round(checks.reduce((sum, c) => sum + c.pct, 0) / checks.length);
  return { pct, details: checks };
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, count, label }) {
  const C = useTheme();
  const color = status === "pass" ? C.green : status === "warn" ? "#eab308" : "#ef4444";
  const icon = status === "pass" ? I.check : status === "warn" ? I.alert : I.close;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 99,
      background: `${color}10`, fontSize: 11, fontWeight: 600,
      color, letterSpacing: "0.01em",
    }}>
      <Ic i={icon} s={12} c={color} />
      {count !== undefined ? `${count} ${label}` : label}
    </div>
  );
}

// ─── Section Card ────────────────────────────────────────────────────────────
function ReviewCard({ title, icon, badge, children, defaultOpen = true }) {
  const C = useTheme();
  const T = C.T;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: C.bg1,
      border: `1px solid ${C.border}`,
      borderRadius: T.radius.lg,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="ghost-btn"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "12px 16px",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: T.font.sans,
        }}
      >
        <Ic i={icon} s={16} c={C.accent} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, textAlign: "left" }}>
          {title}
        </span>
        {badge}
        <Ic i={open ? I.up : I.down} s={12} c={C.textDim} />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}


export default function ReviewPage() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const project = useProjectStore(s => s.project);

  // ─── Completeness ──────────────────────────────────────────────────────
  const completeness = useMemo(() => computeCompleteness(items), [items]);

  // ─── Cost Validation ───────────────────────────────────────────────────
  const warnings = useMemo(() => runValidation(items), [items]);
  const warnCount = warnings.filter(w => w.severity === "WARN").length;
  const infoCount = warnings.filter(w => w.severity === "INFO").length;

  // ─── Scope Gaps ────────────────────────────────────────────────────────
  const gaps = useMemo(() => {
    if (!project.buildingType || !project.projectSF || items.length === 0) return null;
    try {
      return detectScopeGaps({
        items,
        buildingType: project.buildingType,
        workType: project.workType,
        projectSF: project.projectSF,
        laborType: project.laborType,
      });
    } catch { return null; }
  }, [items, project.buildingType, project.workType, project.projectSF, project.laborType]);

  // ─── SOV tab state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("checklist"); // "checklist" | "sov"

  const pctColor = completeness.pct >= 90 ? C.green : completeness.pct >= 60 ? "#eab308" : "#ef4444";

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
      fontFamily: T.font.sans, background: C.bg,
    }}>
      {/* ── Header with tab toggle ── */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 20px", gap: 12,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Review</span>
        <div style={{ flex: 1 }} />

        {/* Tab pills */}
        {["checklist", "sov"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="ghost-btn"
            style={{
              padding: "5px 14px",
              borderRadius: T.radius.full,
              border: "none",
              background: activeTab === tab ? `${C.accent}14` : "transparent",
              color: activeTab === tab ? C.accent : C.textDim,
              fontSize: 11, fontWeight: activeTab === tab ? 600 : 500,
              cursor: "pointer", fontFamily: T.font.sans,
              transition: "all 150ms",
            }}
          >
            {tab === "checklist" ? "Checklist" : "Schedule of Values"}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {activeTab === "checklist" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 800, margin: "0 auto" }}>

            {/* 1. Completeness Score */}
            <ReviewCard
              title="Completeness"
              icon={I.chart}
              badge={
                <div style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "2px 10px", borderRadius: 99,
                  background: `${pctColor}12`, fontSize: 12, fontWeight: 700, color: pctColor,
                }}>
                  {completeness.pct}%
                </div>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
                {completeness.details.map(d => (
                  <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, width: 120, flexShrink: 0 }}>
                      {d.label}
                    </span>
                    <div style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: `${C.text}08`, overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${d.pct}%`, height: "100%", borderRadius: 3,
                        background: d.pct >= 90 ? C.green : d.pct >= 60 ? "#eab308" : "#ef4444",
                        transition: "width 400ms ease",
                      }} />
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, width: 48, textAlign: "right",
                      color: d.pct >= 90 ? C.green : d.pct >= 60 ? "#eab308" : "#ef4444",
                    }}>
                      {d.count}/{d.total}
                    </span>
                  </div>
                ))}
              </div>
            </ReviewCard>

            {/* 2. Cost Validation */}
            <ReviewCard
              title="Cost Validation"
              icon={I.alert}
              badge={
                warnCount === 0
                  ? <StatusBadge status="pass" label="All clear" />
                  : <StatusBadge status="warn" count={warnCount} label={`warning${warnCount !== 1 ? "s" : ""}`} />
              }
            >
              <div style={{ paddingTop: 12 }}>
                {warnings.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
                    No issues found. All items pass validation checks.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {warnings.map((w, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "6px 10px", borderRadius: T.radius.sm,
                        background: w.severity === "WARN" ? "#eab30808" : `${C.accent}06`,
                        fontSize: 11, color: C.textMuted, lineHeight: 1.4,
                      }}>
                        <Ic
                          i={w.severity === "WARN" ? I.alert : I.info}
                          s={12}
                          c={w.severity === "WARN" ? "#eab308" : C.accent}
                          style={{ flexShrink: 0, marginTop: 1 }}
                        />
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ReviewCard>

            {/* 3. Scope Gaps */}
            <ReviewCard
              title="Scope Coverage"
              icon={I.scope}
              defaultOpen={gaps?.missingCount > 0}
              badge={
                !gaps
                  ? <StatusBadge status="warn" label="Set building type" />
                  : gaps.missingCount === 0
                    ? <StatusBadge status="pass" label={`${gaps.completionPct}% covered`} />
                    : <StatusBadge status="fail" count={gaps.missingCount} label={`missing division${gaps.missingCount !== 1 ? "s" : ""}`} />
              }
            >
              <div style={{ paddingTop: 12 }}>
                {!gaps ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
                    Set building type and project SF on the Info page to enable scope gap detection.
                  </p>
                ) : gaps.missingCount === 0 ? (
                  <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
                    All expected CSI divisions for a {project.buildingType} project are covered.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(gaps.missingDivisions || []).map((div, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: T.radius.sm,
                        background: "#ef444408", fontSize: 11, color: C.textMuted,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: C.text, minWidth: 40 }}>
                          {div.code || div.division}
                        </span>
                        <span>{div.label || div.name}</span>
                        {div.estimatedCost > 0 && (
                          <span style={{ marginLeft: "auto", fontWeight: 600, color: "#ef4444" }}>
                            ~{fmt(div.estimatedCost)}
                          </span>
                        )}
                      </div>
                    ))}
                    {gaps.totalMissingCost > 0 && (
                      <div style={{
                        marginTop: 4, padding: "6px 10px", borderRadius: T.radius.sm,
                        background: "#ef444410", fontSize: 11, fontWeight: 600,
                        color: "#ef4444", textAlign: "right",
                      }}>
                        Total missing: ~{fmt(gaps.totalMissingCost)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ReviewCard>

            {/* 4. Markup Summary */}
            <ReviewCard
              title="Markup Summary"
              icon={I.dollar}
              badge={(() => {
                const totals = useItemsStore.getState().getTotals();
                const markupAmt = totals.grand - totals.direct;
                const markupPct = totals.direct > 0 ? ((markupAmt / totals.direct) * 100).toFixed(1) : "0.0";
                return (
                  <div style={{
                    padding: "2px 10px", borderRadius: 99,
                    background: `${C.accent}10`, fontSize: 11, fontWeight: 600, color: C.accent,
                  }}>
                    {markupPct}% markup
                  </div>
                );
              })()}
              defaultOpen={false}
            >
              <div style={{ paddingTop: 12 }}>
                {(() => {
                  const totals = useItemsStore.getState().getTotals();
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: C.textMuted }}>
                        <span>Direct Cost</span>
                        <span style={{ fontWeight: 600, color: C.text }}>{fmt(totals.direct)}</span>
                      </div>
                      {(totals.markupBreakdown || []).map((m, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", color: C.textMuted }}>
                          <span>{m.label}</span>
                          <span style={{ fontWeight: 500 }}>{fmt(m.amount)}</span>
                        </div>
                      ))}
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        paddingTop: 6, borderTop: `1px solid ${C.border}`,
                        fontWeight: 700, color: C.text,
                      }}>
                        <span>Grand Total</span>
                        <span>{fmt(totals.grand)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </ReviewCard>
          </div>
        ) : (
          /* SOV Tab — render the full ScheduleOfValuesPage */
          <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>Loading SOV...</div>}>
            <ScheduleOfValuesPage />
          </Suspense>
        )}
      </div>
    </div>
  );
}
