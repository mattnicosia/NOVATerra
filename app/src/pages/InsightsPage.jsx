import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useSnapshotsStore } from "@/stores/snapshotsStore";

import { getTradeLabel, getTradeSortOrder, TRADE_MAP } from "@/constants/tradeGroupings";
import { fmt, nn } from "@/utils/format";
import { bt, card, sectionLabel, pageContainer, accentButton } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// Lazy-load 3D Model tab — Three.js + web-ifc are ~1.5MB, only load when needed
const ModelTab = lazy(() => import("@/components/insights/ModelTab"));

// Lazy-load Schedule tab
const ScheduleTab = lazy(() => import("@/components/insights/ScheduleTab"));

// Stable empty array — prevents selector from creating new [] on every store change
const EMPTY_SNAPS = [];

// ────────────────────────────────────────────────────────────
// INSIGHTS PAGE — Model · Schedule · Compare
// ────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const C = useTheme();
  const T = C.T;
  const [tab, setTab] = useState("model");

  const tabs = [
    { key: "model", label: "Model", icon: I.cube },
    { key: "schedule", label: "Schedule", icon: I.schedule },
    { key: "compare", label: "Compare", icon: I.bid },
  ];

  return (
    <div style={pageContainer(C)}>
      {/* Tab Header */}
      <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[6] }}>
        <div
          style={{
            fontSize: T.fontSize.xl,
            fontWeight: T.fontWeight.heavy,
            color: C.text,
            background: C.gradientText,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Insights
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: 3,
            background: C.glassBg,
            borderRadius: T.radius.md,
            border: `1px solid ${C.glassBorder}`,
          }}
        >
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                ...bt(C),
                padding: "8px 16px",
                background: tab === t.key ? C.gradient || C.accent : "transparent",
                color: tab === t.key ? "#fff" : C.textMuted,
                borderRadius: T.radius.sm - 1,
                gap: 6,
              }}
            >
              <Ic d={t.icon} size={14} color={tab === t.key ? "#fff" : C.textMuted} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tab === "compare" && <CompareTab />}
      {tab === "model" && (
        <Suspense
          fallback={
            <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: `3px solid ${C.bg3}`,
                  borderTopColor: C.accent,
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto",
                  marginBottom: T.space[3],
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Loading 3D engine...</div>
            </div>
          }
        >
          <ModelTab />
        </Suspense>
      )}
      {tab === "schedule" && (
        <Suspense
          fallback={
            <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: `3px solid ${C.bg3}`,
                  borderTopColor: C.accent,
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto",
                  marginBottom: T.space[3],
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Loading schedule engine...</div>
            </div>
          }
        >
          <ScheduleTab />
        </Suspense>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// COMPARE TAB — Living Comparison
// ════════════════════════════════════════════════════════════
function CompareTab() {
  const C = useTheme();
  const T = C.T;
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);
  const project = useProjectStore(s => s.project);
  const estimates = useEstimatesStore(s => s.estimates);

  // Direct state access with stable fallback
  const snapshots = useSnapshotsStore(s => s.snapshots[estimateId] ?? EMPTY_SNAPS);
  const computeDelta = useSnapshotsStore(s => s.computeDelta);
  const buildLive = useSnapshotsStore(s => s.buildLiveSnapshot);

  const [compareMode, setCompareMode] = useState("snapshot"); // "snapshot" | "estimate"
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("_live");

  // Force-load snapshots from IndexedDB when this tab mounts
  useEffect(() => {
    if (estimateId) useSnapshotsStore.getState().loadSnapshots(estimateId);
  }, [estimateId]);

  // Auto-select first snapshot as baseline when snapshots become available
  useEffect(() => {
    if (snapshots.length > 0 && !selectedA) {
      setSelectedA(snapshots[0].id);
    }
  }, [snapshots, selectedA]);

  const totals = getTotals();
  const liveSnap = useMemo(
    () => buildLive(estimateId, items, totals, project),
    [estimateId, items, totals, project, buildLive],
  );

  const allSnapOptions = useMemo(() => {
    const snaps = snapshots.map(s => ({ id: s.id, label: s.label, dateStr: s.dateStr, snap: s }));
    snaps.push({ id: "_live", label: "Current (Live)", dateStr: "Now", snap: liveSnap });
    return snaps;
  }, [snapshots, liveSnap]);

  // Resolve snapshots for comparison
  const snapA = useMemo(() => {
    if (!selectedA) return null;
    if (selectedA === "_live") return liveSnap;
    return snapshots.find(s => s.id === selectedA);
  }, [selectedA, snapshots, liveSnap]);

  const snapB = useMemo(() => {
    if (!selectedB) return null;
    if (selectedB === "_live") return liveSnap;
    return snapshots.find(s => s.id === selectedB);
  }, [selectedB, snapshots, liveSnap]);

  const delta = useMemo(() => computeDelta(snapA, snapB), [snapA, snapB, computeDelta]);

  return (
    <div>
      {/* Selector Row */}
      <div style={{ ...card(C), padding: T.space[4], marginBottom: T.space[4] }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[4] }}>
          {/* Snapshot A */}
          <div style={{ flex: 1 }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Baseline (A)</div>
            <select
              value={selectedA}
              onChange={e => setSelectedA(e.target.value)}
              style={{
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
                color: C.text,
                padding: "8px 12px",
                fontSize: T.fontSize.sm,
                width: "100%",
                fontFamily: T.font.sans,
              }}
            >
              <option value="">-- Select --</option>
              {allSnapOptions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.dateStr})
                </option>
              ))}
            </select>
          </div>

          {/* VS */}
          <div
            style={{
              fontSize: T.fontSize.lg,
              fontWeight: T.fontWeight.heavy,
              color: C.textDim,
              paddingTop: 20,
            }}
          >
            vs
          </div>

          {/* Snapshot B */}
          <div style={{ flex: 1 }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Compare (B)</div>
            <select
              value={selectedB}
              onChange={e => setSelectedB(e.target.value)}
              style={{
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
                color: C.text,
                padding: "8px 12px",
                fontSize: T.fontSize.sm,
                width: "100%",
                fontFamily: T.font.sans,
              }}
            >
              <option value="">-- Select --</option>
              {allSnapOptions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.dateStr})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Comparison Result */}
      {delta ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[4] }}>
          {/* Summary Cards */}
          <div style={{ ...card(C), padding: T.space[4], gridColumn: "1 / -1" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: T.space[4] }}>
              <DeltaCard C={C} T={T} label="Grand Total" delta={delta.grandTotal} pct={delta.grandTotalPct} />
              <DeltaCard C={C} T={T} label="Direct Cost" delta={delta.direct} pct={delta.directPct} />
              <DeltaCard C={C} T={T} label="Markup Total" delta={delta.markupTotal} />
              <DeltaCard C={C} T={T} label="Item Count" delta={delta.itemCount} isCurrency={false} />
            </div>
          </div>

          {/* Division Breakdown */}
          <div style={{ ...card(C), padding: T.space[4] }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>By Division</div>
            {Object.entries(delta.divisions || {})
              .sort(([, a], [, b]) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
              .map(([div, d]) => (
                <DivisionRow key={div} C={C} T={T} label={div} d={d} />
              ))}
            {Object.keys(delta.divisions || {}).length === 0 && (
              <div style={{ color: C.textDim, fontSize: T.fontSize.sm }}>No division data</div>
            )}
          </div>

          {/* Trade Breakdown */}
          <div style={{ ...card(C), padding: T.space[4] }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>By Trade</div>
            {Object.entries(delta.trades || {})
              .sort(([, a], [, b]) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
              .map(([trade, d]) => (
                <DivisionRow key={trade} C={C} T={T} label={TRADE_MAP[trade]?.label || trade} d={d} />
              ))}
            {Object.keys(delta.trades || {}).length === 0 && (
              <div style={{ color: C.textDim, fontSize: T.fontSize.sm }}>No trade data</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
          <Ic d={I.bid} size={48} color={C.textDim} />
          <div style={{ fontSize: T.fontSize.lg, color: C.textMuted, marginTop: T.space[4] }}>
            Select two points to compare
          </div>
          <div style={{ fontSize: T.fontSize.sm, color: C.textDim, marginTop: T.space[2] }}>
            Choose a baseline snapshot and a comparison point to see a full delta analysis.
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ────────────────────────────────────────────────────────────

function DeltaPanel({ delta, snapLabel }) {
  const C = useTheme();
  const T = C.T;

  return (
    <div style={{ ...card(C), padding: T.space[4] }}>
      <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Changes since "{snapLabel}"</div>

      {/* Summary */}
      <div style={{ marginBottom: T.space[4] }}>
        <DeltaRow C={C} T={T} label="Grand Total" value={delta.grandTotal} pct={delta.grandTotalPct} large />
        <DeltaRow C={C} T={T} label="Direct Cost" value={delta.direct} pct={delta.directPct} />
        <DeltaRow C={C} T={T} label="Material" value={delta.material} />
        <DeltaRow C={C} T={T} label="Labor" value={delta.labor} />
        <DeltaRow C={C} T={T} label="Equipment" value={delta.equipment} />
        <DeltaRow C={C} T={T} label="Subcontractor" value={delta.sub} />
        <DeltaRow C={C} T={T} label="Markup" value={delta.markupTotal} />
      </div>

      {/* Division deltas */}
      {Object.keys(delta.divisions || {}).length > 0 && (
        <>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Division Changes</div>
          {Object.entries(delta.divisions)
            .filter(([, d]) => Math.abs(d.totalDelta) > 0)
            .sort(([, a], [, b]) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
            .map(([div, d]) => (
              <DeltaRow key={div} C={C} T={T} label={div} value={d.totalDelta} pct={d.pct} />
            ))}
        </>
      )}
    </div>
  );
}

function DeltaRow({ C, T, label, value, pct, large }) {
  const isPositive = value > 0;
  const isZero = value === 0;
  const color = isZero ? C.textDim : isPositive ? C.red : C.green;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "4px 0",
        borderBottom: `1px solid ${C.borderLight || C.border}`,
      }}
    >
      <span
        style={{
          fontSize: large ? T.fontSize.md : T.fontSize.sm,
          fontWeight: large ? T.fontWeight.bold : T.fontWeight.normal,
          color: C.text,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: large ? T.fontSize.md : T.fontSize.sm,
            fontFamily: T.font.sans,
            fontWeight: large ? T.fontWeight.bold : T.fontWeight.medium,
            color,
          }}
        >
          {isPositive ? "+" : ""}
          {fmt(value)}
        </span>
        {pct !== undefined && !isZero && (
          <span style={{ fontSize: 9, color, fontFamily: T.font.sans }}>
            ({isPositive ? "+" : ""}
            {pct.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  );
}

function DeltaCard({ C, T, label, delta, pct, isCurrency = true }) {
  const isPositive = delta > 0;
  const isZero = delta === 0;
  const color = isZero ? C.textDim : isPositive ? C.red : C.green;

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...sectionLabel(C), marginBottom: 4 }}>{label}</div>
      <div
        style={{
          fontSize: T.fontSize.lg,
          fontWeight: T.fontWeight.heavy,
          fontFamily: T.font.sans,
          color,
        }}
      >
        {isPositive ? "+" : ""}
        {isCurrency ? fmt(delta) : delta}
      </div>
      {pct !== undefined && !isZero && (
        <div style={{ fontSize: T.fontSize.xs, color, fontFamily: T.font.sans }}>
          ({isPositive ? "+" : ""}
          {pct.toFixed(1)}%)
        </div>
      )}
    </div>
  );
}

function DivisionRow({ C, T, label, d }) {
  const isPositive = d.totalDelta > 0;
  const isZero = d.totalDelta === 0;
  const color = isZero ? C.textDim : isPositive ? C.red : C.green;

  // Divergence bar: centered at 0, extends left (decrease) or right (increase)
  const maxVal = Math.max(Math.abs(d.totalA), Math.abs(d.totalB), 1);
  const barPct = Math.min((Math.abs(d.totalDelta) / maxVal) * 100, 100);

  return (
    <div style={{ marginBottom: T.space[2] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontSize: T.fontSize.sm,
            color: C.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 160,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: T.fontSize.sm, fontFamily: T.font.sans, color, flexShrink: 0 }}>
          {isPositive ? "+" : ""}
          {fmt(d.totalDelta)}
        </span>
      </div>
      {/* Divergence bar */}
      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: C.bg3, marginTop: 3 }}>
        <div style={{ flex: 1 }} />
        {d.totalDelta < 0 && (
          <div
            style={{
              width: `${barPct / 2}%`,
              height: "100%",
              background: C.green,
              borderRadius: "2px 0 0 2px",
            }}
          />
        )}
        <div style={{ width: 1, background: C.border }} />
        {d.totalDelta > 0 && (
          <div
            style={{
              width: `${barPct / 2}%`,
              height: "100%",
              background: C.red,
              borderRadius: "0 2px 2px 0",
            }}
          />
        )}
        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}
