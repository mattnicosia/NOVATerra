import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useSnapshotsStore } from '@/stores/snapshotsStore';
import { captureManualSnapshot } from '@/hooks/useAutoSnapshot';
import { getTradeLabel, getTradeSortOrder, TRADE_MAP } from '@/constants/tradeGroupings';
import { fmt, nn } from '@/utils/format';
import { bt, card, sectionLabel, pageContainer, accentButton } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

// ────────────────────────────────────────────────────────────
// INSIGHTS PAGE — Spatial · Timeline · Compare
// ────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const C = useTheme();
  const T = C.T;
  const [tab, setTab] = useState("spatial");

  const tabs = [
    { key: "spatial",  label: "Spatial",  icon: I.layers },
    { key: "timeline", label: "Timeline", icon: I.report },
    { key: "compare",  label: "Compare",  icon: I.bid },
  ];

  return (
    <div style={pageContainer(C)}>
      {/* Tab Header */}
      <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[6] }}>
        <div style={{
          fontSize: T.fontSize.xl, fontWeight: T.fontWeight.heavy, color: C.text,
          background: C.gradientText, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Insights
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: "flex", gap: 2, padding: 3,
          background: C.glassBg, borderRadius: T.radius.md,
          border: `1px solid ${C.glassBorder}`,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                ...bt(C),
                padding: "8px 16px",
                background: tab === t.key ? (C.gradient || C.accent) : "transparent",
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
      {tab === "spatial"  && <SpatialTab />}
      {tab === "timeline" && <TimelineTab />}
      {tab === "compare"  && <CompareTab />}
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// SPATIAL TAB — Cost density mapped to drawings
// ════════════════════════════════════════════════════════════
function SpatialTab() {
  const C = useTheme();
  const T = C.T;
  const drawings = useDrawingsStore(s => s.drawings);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const [selectedSheetId, setSelectedSheetId] = useState(null);
  const [hovered, setHovered] = useState(null);
  const canvasRef = useRef(null);

  // Build cost map: takeoff → item cost
  const costMap = useMemo(() => {
    const map = {};
    takeoffs.forEach(to => {
      if (!to.linkedItemId || to.linkedItemId === "grouped") return;
      const item = items.find(it => it.id === to.linkedItemId);
      if (item) {
        map[to.id] = {
          total: getItemTotal(item),
          trade: item.trade || "unassigned",
          division: item.division || "Unassigned",
          description: item.description,
          takeoff: to,
        };
      }
    });
    return map;
  }, [takeoffs, items, getItemTotal]);

  // Per-sheet cost summaries
  const sheetCosts = useMemo(() => {
    const sheets = {};
    drawings.forEach(d => { sheets[d.id] = { total: 0, items: 0, trades: {} }; });
    takeoffs.forEach(to => {
      const cost = costMap[to.id];
      if (!cost) return;
      to.measurements.forEach(m => {
        if (m.sheetId && sheets[m.sheetId]) {
          sheets[m.sheetId].total += cost.total;
          sheets[m.sheetId].items += 1;
          const trd = cost.trade;
          sheets[m.sheetId].trades[trd] = (sheets[m.sheetId].trades[trd] || 0) + cost.total;
        }
      });
    });
    return sheets;
  }, [drawings, takeoffs, costMap]);

  // Active sheet
  const activeSheet = selectedSheetId || (drawings[0]?.id);
  const activeDrawing = drawings.find(d => d.id === activeSheet);
  const activeCosts = sheetCosts[activeSheet] || { total: 0, items: 0, trades: {} };

  // Sort trades for display
  const sortedTrades = useMemo(() => {
    return Object.entries(activeCosts.trades)
      .sort(([, a], [, b]) => b - a)
      .map(([trade, total]) => ({
        trade,
        label: TRADE_MAP[trade]?.label || trade,
        total,
        pct: activeCosts.total > 0 ? (total / activeCosts.total * 100) : 0,
      }));
  }, [activeCosts]);

  // Max cost for heat map scaling
  const maxCost = useMemo(() => {
    const vals = Object.values(costMap).map(c => c.total);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [costMap]);

  // Render heat map on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeDrawing) return;

    const imgSrc = activeDrawing.type === "pdf"
      ? pdfCanvases[activeSheet]
      : activeDrawing.data;
    if (!imgSrc) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw measurements as colored regions
      takeoffs.forEach(to => {
        const cost = costMap[to.id];
        if (!cost) return;
        const intensity = Math.min(cost.total / maxCost, 1);

        to.measurements.forEach(m => {
          if (m.sheetId !== activeSheet) return;
          if (!m.points || m.points.length < 1) return;

          // Color: green (low cost) → yellow → red (high cost)
          const r = Math.round(255 * Math.min(intensity * 2, 1));
          const g = Math.round(255 * Math.min((1 - intensity) * 2, 1));
          const color = `rgba(${r},${g},60,0.45)`;
          const stroke = `rgba(${r},${g},60,0.85)`;

          ctx.fillStyle = color;
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;

          if (m.type === "area" && m.points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(m.points[0].x, m.points[0].y);
            for (let i = 1; i < m.points.length; i++) {
              ctx.lineTo(m.points[i].x, m.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (m.type === "linear" && m.points.length >= 2) {
            ctx.lineWidth = 6;
            ctx.strokeStyle = color;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(m.points[0].x, m.points[0].y);
            for (let i = 1; i < m.points.length; i++) {
              ctx.lineTo(m.points[i].x, m.points[i].y);
            }
            ctx.stroke();
          } else if (m.type === "count") {
            ctx.beginPath();
            ctx.arc(m.points[0].x, m.points[0].y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          // Cost label
          if (m.points.length > 0) {
            const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
            const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length;
            ctx.font = "bold 11px 'DM Sans', sans-serif";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            // Background for label
            const label = fmt(cost.total);
            const tw = ctx.measureText(label).width + 8;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillRect(cx - tw / 2, cy - 8, tw, 16);
            ctx.fillStyle = "#fff";
            ctx.fillText(label, cx, cy);
          }
        });
      });
    };
    img.src = imgSrc;
  }, [activeSheet, activeDrawing, takeoffs, costMap, maxCost, pdfCanvases]);

  if (drawings.length === 0) {
    return (
      <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
        <Ic d={I.plans} size={48} color={C.textDim} />
        <div style={{ fontSize: T.fontSize.lg, color: C.textMuted, marginTop: T.space[4] }}>
          No drawings uploaded yet
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: C.textDim, marginTop: T.space[2] }}>
          Upload drawings in the Plan Room, then create takeoffs to see spatial cost mapping.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: T.space[4], height: "calc(100vh - 160px)" }}>
      {/* Sheet Selector */}
      <div style={{ ...card(C), padding: T.space[3], overflowY: "auto" }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Sheets</div>
        {drawings.map(d => {
          const sc = sheetCosts[d.id] || { total: 0, items: 0 };
          const isActive = d.id === activeSheet;
          return (
            <div
              key={d.id}
              onClick={() => setSelectedSheetId(d.id)}
              style={{
                padding: "8px 10px", borderRadius: T.radius.sm, cursor: "pointer",
                background: isActive ? C.accentBg : "transparent",
                border: isActive ? `1px solid ${C.borderAccent}` : "1px solid transparent",
                marginBottom: 4,
                transition: T.transition.fast,
              }}
            >
              <div style={{
                fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium,
                color: isActive ? C.accent : C.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {d.sheetNumber || d.label || `Sheet ${drawings.indexOf(d) + 1}`}
              </div>
              {sc.total > 0 && (
                <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 2 }}>
                  {fmt(sc.total)} · {sc.items} items
                </div>
              )}
              {/* Mini cost bar */}
              {sc.total > 0 && (() => {
                const maxSheetCost = Math.max(...Object.values(sheetCosts).map(s => s.total), 1);
                return (
                  <div style={{
                    height: 3, borderRadius: 2, marginTop: 4,
                    background: C.bg3, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${(sc.total / maxSheetCost * 100).toFixed(1)}%`,
                      background: C.gradient || C.accent,
                    }} />
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Main Drawing Canvas */}
      <div style={{ ...card(C), position: "relative", overflow: "hidden" }}>
        {activeDrawing && (
          <div style={{ position: "relative", width: "100%", height: "100%", overflow: "auto" }}>
            {/* Background drawing */}
            <img
              src={activeDrawing.type === "pdf" ? pdfCanvases[activeSheet] : activeDrawing.data}
              style={{ width: "100%", display: "block", opacity: 0.5 }}
              alt=""
            />
            {/* Cost overlay canvas */}
            <canvas
              ref={canvasRef}
              style={{
                position: "absolute", top: 0, left: 0,
                width: "100%", height: "100%",
                pointerEvents: "none",
              }}
            />
            {/* Legend */}
            <div style={{
              position: "absolute", bottom: 12, right: 12,
              background: "rgba(0,0,0,0.75)", borderRadius: T.radius.sm,
              padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: "rgba(0,255,60,0.6)" }} />
                <span style={{ fontSize: 9, color: "#ccc" }}>Low</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: "rgba(255,255,60,0.6)" }} />
                <span style={{ fontSize: 9, color: "#ccc" }}>Med</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: "rgba(255,0,60,0.6)" }} />
                <span style={{ fontSize: 9, color: "#ccc" }}>High</span>
              </div>
            </div>
          </div>
        )}
        {!activeDrawing && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.textDim }}>
            Select a sheet to view
          </div>
        )}
      </div>

      {/* Cost Panel */}
      <div style={{ ...card(C), padding: T.space[4], overflowY: "auto" }}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Sheet Cost Summary</div>
        <div style={{
          fontSize: T.fontSize.xl, fontWeight: T.fontWeight.heavy, color: C.text,
          fontFamily: "'DM Mono',monospace",
          marginBottom: T.space[4],
        }}>
          {fmt(activeCosts.total)}
        </div>

        {sortedTrades.length > 0 && (
          <>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>By Trade</div>
            {sortedTrades.map(t => (
              <div key={t.trade} style={{ marginBottom: T.space[2] }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: T.fontSize.sm, color: C.text }}>{t.label}</span>
                  <span style={{ fontSize: T.fontSize.sm, color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>
                    {fmt(t.total)}
                  </span>
                </div>
                <div style={{
                  height: 4, borderRadius: 2, marginTop: 3,
                  background: C.bg3, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${t.pct.toFixed(1)}%`,
                    background: C.accent,
                    transition: "width 300ms ease-out",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                  {t.pct.toFixed(1)}%
                </div>
              </div>
            ))}
          </>
        )}

        {sortedTrades.length === 0 && (
          <div style={{ fontSize: T.fontSize.sm, color: C.textDim }}>
            No takeoff-linked items on this sheet.
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════
// TIMELINE TAB — Temporal view of estimate evolution
// ════════════════════════════════════════════════════════════
function TimelineTab() {
  const C = useTheme();
  const T = C.T;
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);
  const project = useProjectStore(s => s.project);

  const snapshots = useSnapshotsStore(s => s.getSnapshots(estimateId));
  const deleteSnapshot = useSnapshotsStore(s => s.deleteSnapshot);
  const renameSnapshot = useSnapshotsStore(s => s.renameSnapshot);
  const computeDelta = useSnapshotsStore(s => s.computeDelta);
  const buildLive = useSnapshotsStore(s => s.buildLiveSnapshot);

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [selectedSnapId, setSelectedSnapId] = useState(null);

  const totals = getTotals();
  const liveSnap = useMemo(() => buildLive(estimateId, items, totals, project), [estimateId, items, totals, project, buildLive]);

  // Include live as the last point
  const allPoints = useMemo(() => [...snapshots, liveSnap], [snapshots, liveSnap]);

  // Chart dimensions
  const chartW = 700;
  const chartH = 200;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  // Sparkline path
  const sparkline = useMemo(() => {
    if (allPoints.length < 2) return null;
    const vals = allPoints.map(p => p.grandTotal);
    const minV = Math.min(...vals) * 0.95;
    const maxV = Math.max(...vals) * 1.05;
    const range = maxV - minV || 1;
    const w = chartW - padL - padR;
    const h = chartH - padT - padB;

    const points = allPoints.map((p, i) => {
      const x = padL + (i / (allPoints.length - 1)) * w;
      const y = padT + h - ((p.grandTotal - minV) / range) * h;
      return { x, y, snap: p };
    });

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaPath = path + ` L ${points[points.length - 1].x.toFixed(1)} ${chartH - padB} L ${padL} ${chartH - padB} Z`;

    return { points, path, areaPath, minV, maxV };
  }, [allPoints]);

  // Delta between first and live
  const totalDelta = useMemo(() => {
    if (snapshots.length === 0) return null;
    return computeDelta(snapshots[0], liveSnap);
  }, [snapshots, liveSnap, computeDelta]);

  const handleCapture = () => {
    captureManualSnapshot(estimateId, "Manual snapshot");
  };

  const handleRename = (snapId) => {
    if (editLabel.trim()) {
      renameSnapshot(estimateId, snapId, editLabel.trim());
    }
    setEditingId(null);
    setEditLabel("");
  };

  // Selected snapshot delta (vs live)
  const selectedDelta = useMemo(() => {
    if (!selectedSnapId) return null;
    const snap = snapshots.find(s => s.id === selectedSnapId);
    if (!snap) return null;
    return computeDelta(snap, liveSnap);
  }, [selectedSnapId, snapshots, liveSnap, computeDelta]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: T.space[4] }}>
      {/* Main Timeline */}
      <div>
        {/* Grand Total Trend Chart */}
        <div style={{ ...card(C), padding: T.space[4], marginBottom: T.space[4] }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
            <div>
              <div style={{ ...sectionLabel(C) }}>Grand Total Trend</div>
              <div style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.heavy, color: C.text, fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
                {fmt(totals.grand)}
              </div>
              {totalDelta && (
                <div style={{
                  fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, marginTop: 2,
                  color: totalDelta.grandTotal > 0 ? C.red : totalDelta.grandTotal < 0 ? C.green : C.textDim,
                }}>
                  {totalDelta.grandTotal > 0 ? "+" : ""}{fmt(totalDelta.grandTotal)}
                  {" "}({totalDelta.grandTotalPct > 0 ? "+" : ""}{totalDelta.grandTotalPct.toFixed(1)}%)
                  <span style={{ color: C.textDim, fontWeight: T.fontWeight.normal }}> since first snapshot</span>
                </div>
              )}
            </div>
            <button onClick={handleCapture} style={accentButton(C, { padding: "8px 14px" })}>
              <Ic d={I.save} size={14} color="#fff" />
              Snapshot
            </button>
          </div>

          {/* SVG Chart */}
          {sparkline ? (
            <svg width={chartW} height={chartH} style={{ display: "block", width: "100%", height: "auto" }} viewBox={`0 0 ${chartW} ${chartH}`}>
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map(frac => {
                const y = padT + (chartH - padT - padB) * (1 - frac);
                const val = sparkline.minV + (sparkline.maxV - sparkline.minV) * frac;
                return (
                  <g key={frac}>
                    <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={C.border} strokeWidth={1} />
                    <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill={C.textDim} fontFamily="'DM Mono',monospace">
                      {fmt(val)}
                    </text>
                  </g>
                );
              })}

              {/* Area fill */}
              <path d={sparkline.areaPath} fill="url(#sparkGrad)" opacity={0.3} />

              {/* Line */}
              <path d={sparkline.path} fill="none" stroke={C.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

              {/* Points */}
              {sparkline.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x} cy={p.y} r={p.snap.id === "_live" ? 5 : 3.5}
                  fill={p.snap.id === "_live" ? C.accent : C.bg1}
                  stroke={C.accent}
                  strokeWidth={2}
                  style={{ cursor: "pointer" }}
                  onClick={() => p.snap.id !== "_live" && setSelectedSnapId(p.snap.id)}
                />
              ))}

              {/* Gradient definition */}
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
            </svg>
          ) : (
            <div style={{ height: chartH, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: T.fontSize.sm }}>
              {snapshots.length === 0 ? "Click \"Snapshot\" to start tracking changes" : "Need at least 2 points for a chart"}
            </div>
          )}
        </div>

        {/* Snapshot List */}
        <div style={{ ...card(C), padding: T.space[4] }}>
          <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Snapshot History</div>
          {allPoints.length === 0 && (
            <div style={{ color: C.textDim, fontSize: T.fontSize.sm }}>No snapshots yet.</div>
          )}
          {[...allPoints].reverse().map((snap, i) => {
            const isLive = snap.id === "_live";
            const isSelected = snap.id === selectedSnapId;
            const prev = allPoints[allPoints.indexOf(snap) - 1];
            const delta = prev ? snap.grandTotal - prev.grandTotal : 0;
            return (
              <div
                key={snap.id}
                onClick={() => !isLive && setSelectedSnapId(isSelected ? null : snap.id)}
                style={{
                  display: "flex", alignItems: "center", gap: T.space[3],
                  padding: "10px 12px", borderRadius: T.radius.sm,
                  background: isSelected ? C.accentBg : "transparent",
                  border: isSelected ? `1px solid ${C.borderAccent}` : "1px solid transparent",
                  cursor: isLive ? "default" : "pointer",
                  marginBottom: 2,
                  transition: T.transition.fast,
                }}
              >
                {/* Dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: T.radius.full, flexShrink: 0,
                  background: isLive ? C.accent : C.bg3,
                  border: `2px solid ${isLive ? C.accent : C.textDim}`,
                  boxShadow: isLive ? `0 0 8px ${C.accent}60` : "none",
                }} />

                {/* Info */}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  {editingId === snap.id ? (
                    <input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => handleRename(snap.id)}
                      onKeyDown={e => e.key === "Enter" && handleRename(snap.id)}
                      autoFocus
                      style={{
                        background: "transparent", border: `1px solid ${C.accent}`,
                        borderRadius: 4, color: C.text, fontSize: T.fontSize.sm,
                        padding: "2px 6px", width: "100%", outline: "none",
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <div style={{
                      fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium,
                      color: isLive ? C.accent : C.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {isLive ? "Current (Live)" : snap.label}
                    </div>
                  )}
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 1 }}>
                    {snap.dateStr} · {snap.itemCount} items
                  </div>
                </div>

                {/* Grand total */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: T.fontSize.sm, fontFamily: "'DM Mono',monospace", color: C.text }}>
                    {fmt(snap.grandTotal)}
                  </div>
                  {delta !== 0 && (
                    <div style={{
                      fontSize: 9, fontFamily: "'DM Mono',monospace",
                      color: delta > 0 ? C.red : C.green,
                    }}>
                      {delta > 0 ? "+" : ""}{fmt(delta)}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isLive && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(snap.id); setEditLabel(snap.label); }}
                      style={{ ...bt(C), padding: 4, background: "transparent" }}
                      title="Rename"
                    >
                      <Ic d={I.edit} size={12} color={C.textDim} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSnapshot(estimateId, snap.id); }}
                      style={{ ...bt(C), padding: 4, background: "transparent" }}
                      title="Delete"
                    >
                      <Ic d={I.trash} size={12} color={C.textDim} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delta Panel */}
      <div>
        {selectedDelta ? (
          <DeltaPanel delta={selectedDelta} snapLabel={snapshots.find(s => s.id === selectedSnapId)?.label || "Selected"} />
        ) : (
          <div style={{ ...card(C), padding: T.space[5], textAlign: "center" }}>
            <Ic d={I.bid} size={32} color={C.textDim} />
            <div style={{ fontSize: T.fontSize.sm, color: C.textDim, marginTop: T.space[3] }}>
              Click a snapshot to see what changed since then
            </div>
          </div>
        )}
      </div>
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

  const snapshots = useSnapshotsStore(s => s.getSnapshots(estimateId));
  const computeDelta = useSnapshotsStore(s => s.computeDelta);
  const buildLive = useSnapshotsStore(s => s.buildLiveSnapshot);

  const [compareMode, setCompareMode] = useState("snapshot"); // "snapshot" | "estimate"
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("_live");

  const totals = getTotals();
  const liveSnap = useMemo(() => buildLive(estimateId, items, totals, project), [estimateId, items, totals, project, buildLive]);

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
                background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.sm,
                color: C.text, padding: "8px 12px", fontSize: T.fontSize.sm, width: "100%",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <option value="">-- Select --</option>
              {allSnapOptions.map(s => (
                <option key={s.id} value={s.id}>{s.label} ({s.dateStr})</option>
              ))}
            </select>
          </div>

          {/* VS */}
          <div style={{
            fontSize: T.fontSize.lg, fontWeight: T.fontWeight.heavy, color: C.textDim,
            paddingTop: 20,
          }}>
            vs
          </div>

          {/* Snapshot B */}
          <div style={{ flex: 1 }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>Compare (B)</div>
            <select
              value={selectedB}
              onChange={e => setSelectedB(e.target.value)}
              style={{
                background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.sm,
                color: C.text, padding: "8px 12px", fontSize: T.fontSize.sm, width: "100%",
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <option value="">-- Select --</option>
              {allSnapOptions.map(s => (
                <option key={s.id} value={s.id}>{s.label} ({s.dateStr})</option>
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
      <div style={{ ...sectionLabel(C), marginBottom: T.space[2] }}>
        Changes since "{snapLabel}"
      </div>

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
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "4px 0",
      borderBottom: `1px solid ${C.borderLight || C.border}`,
    }}>
      <span style={{
        fontSize: large ? T.fontSize.md : T.fontSize.sm,
        fontWeight: large ? T.fontWeight.bold : T.fontWeight.normal,
        color: C.text,
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontSize: large ? T.fontSize.md : T.fontSize.sm,
          fontFamily: "'DM Mono',monospace",
          fontWeight: large ? T.fontWeight.bold : T.fontWeight.medium,
          color,
        }}>
          {isPositive ? "+" : ""}{fmt(value)}
        </span>
        {pct !== undefined && !isZero && (
          <span style={{ fontSize: 9, color, fontFamily: "'DM Mono',monospace" }}>
            ({isPositive ? "+" : ""}{pct.toFixed(1)}%)
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
      <div style={{
        fontSize: T.fontSize.lg, fontWeight: T.fontWeight.heavy,
        fontFamily: "'DM Mono',monospace", color,
      }}>
        {isPositive ? "+" : ""}{isCurrency ? fmt(delta) : delta}
      </div>
      {pct !== undefined && !isZero && (
        <div style={{ fontSize: T.fontSize.xs, color, fontFamily: "'DM Mono',monospace" }}>
          ({isPositive ? "+" : ""}{pct.toFixed(1)}%)
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
  const barPct = Math.min(Math.abs(d.totalDelta) / maxVal * 100, 100);

  return (
    <div style={{ marginBottom: T.space[2] }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: T.fontSize.sm, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
          {label}
        </span>
        <span style={{ fontSize: T.fontSize.sm, fontFamily: "'DM Mono',monospace", color, flexShrink: 0 }}>
          {isPositive ? "+" : ""}{fmt(d.totalDelta)}
        </span>
      </div>
      {/* Divergence bar */}
      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: C.bg3, marginTop: 3 }}>
        <div style={{ flex: 1 }} />
        {d.totalDelta < 0 && (
          <div style={{
            width: `${barPct / 2}%`, height: "100%",
            background: C.green, borderRadius: "2px 0 0 2px",
          }} />
        )}
        <div style={{ width: 1, background: C.border }} />
        {d.totalDelta > 0 && (
          <div style={{
            width: `${barPct / 2}%`, height: "100%",
            background: C.red, borderRadius: "0 2px 2px 0",
          }} />
        )}
        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}
