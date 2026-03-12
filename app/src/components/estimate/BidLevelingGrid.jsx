import { useMemo, useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidPackagesStore } from "@/stores/bidPackagesStore";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useItemsStore } from "@/stores/itemsStore";
import { analyzeGaps, normalizeCSI } from "@/utils/scopeGapEngine";
import { CSI } from "@/constants/csi";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────────────
   BidLevelingGrid — Unified bid comparison matrix

   Shows all parsed proposals across all bid packages in a single
   spreadsheet-style grid. Divisions as rows, subs as columns.
   Includes gap analysis, NOVA Recommends, and adjusted cost.
   ──────────────────────────────────────────────────────────────── */

const fmt = v =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);

const fmtK = v => {
  if (!v) return "—";
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
};

const pct = v => (v != null ? `${v}%` : "—");

/* ── Inline editable cell for GC overrides ──────────── */
function EditableCell({ value, onSave, onCancel, onTab, accentColor }) {
  const inputRef = useRef(null);
  const [localVal, setLocalVal] = useState(value > 0 ? String(Math.round(value)) : "");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const num = parseFloat(localVal.replace(/[,$]/g, ""));
    onSave(isNaN(num) ? 0 : num);
  };

  return (
    <input
      ref={inputRef}
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        if (e.key === "Tab") { e.preventDefault(); commit(); onTab(e.shiftKey); }
      }}
      onClick={e => e.stopPropagation()}
      style={{
        width: 60,
        padding: "2px 4px",
        border: `1.5px solid ${accentColor}`,
        borderRadius: 4,
        background: `${accentColor}0D`,
        color: accentColor,
        fontSize: 11,
        fontFamily: "monospace",
        fontWeight: 700,
        textAlign: "center",
        outline: "none",
      }}
    />
  );
}

export default function BidLevelingGrid({ onViewProposal, onAward }) {
  const C = useTheme();
  const T = C.T;
  const bidPackages = useBidPackagesStore(s => s.bidPackages);
  const invitations = useBidPackagesStore(s => s.invitations);
  const proposals = useBidPackagesStore(s => s.proposals);
  const items = useItemsStore(s => s.items);

  // Editable leveling store
  const overrides = useBidLevelingStore(s => s.overrides);
  const selections = useBidLevelingStore(s => s.selections);
  const editingCell = useBidLevelingStore(s => s.editingCell);
  const setOverride = useBidLevelingStore(s => s.setOverride);
  const clearOverride = useBidLevelingStore(s => s.clearOverride);
  const toggleDivisionSelection = useBidLevelingStore(s => s.toggleDivisionSelection);
  const initSelectionsFromBest = useBidLevelingStore(s => s.initSelectionsFromBest);
  const setEditingCell = useBidLevelingStore(s => s.setEditingCell);
  const clearEditingCell = useBidLevelingStore(s => s.clearEditingCell);

  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [sortBy, setSortBy] = useState("adjusted"); // "adjusted" | "bid" | "coverage" | "name"
  const [hoveredCol, setHoveredCol] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [selectionsInitialized, setSelectionsInitialized] = useState(false);

  // Build the unified matrix from all packages + proposals
  const matrix = useMemo(() => {
    if (!items?.length) return null;

    // Collect all parsed proposals across all packages
    const subEntries = [];
    for (const pkg of bidPackages) {
      const pkgInvites = invitations[pkg.id] || [];
      for (const inv of pkgInvites) {
        const proposal = proposals[inv.id];
        if (!proposal?.parsedData || Object.keys(proposal.parsedData).length === 0) continue;
        const pd = proposal.parsedData;
        const report = analyzeGaps(items, pd);
        subEntries.push({
          id: inv.id,
          name: pd.subcontractorName || inv.subCompany || inv.sub_company || "Unknown",
          trade: inv.subTrade || inv.sub_trade || "",
          email: inv.subEmail || inv.sub_email || "",
          packageName: pkg.name,
          packageId: pkg.id,
          totalBid: pd.totalBid || 0,
          report,
          parsedData: pd,
          proposal,
          invitation: inv,
          awarded: inv.status === "awarded",
        });
      }
    }

    if (subEntries.length === 0) return null;

    // Build estimate divisions
    const estimateDivisions = {};
    let estimateGrandTotal = 0;
    for (const item of items.filter(i => !i.bidContext || i.bidContext === "base")) {
      const div = normalizeCSI(item.code) || normalizeCSI(item.division) || "00";
      if (!estimateDivisions[div]) estimateDivisions[div] = { items: [], total: 0 };
      const qty = Number(item.quantity) || 0;
      const m = Number(item.material) || 0;
      const l = Number(item.labor) || 0;
      const e = Number(item.equipment) || 0;
      const sub = Number(item.subcontractor) || 0;
      const itemTotal = qty * (m + l + e + sub);
      estimateDivisions[div].items.push(item);
      estimateDivisions[div].total += itemTotal;
      estimateGrandTotal += itemTotal;
    }

    const divisions = Object.keys(estimateDivisions).sort();

    // For each sub, build division-level data
    const subColumns = subEntries.map(entry => {
      const { report, totalBid } = entry;
      const missingDivs = new Set(report.missingFromProposal.map(m => m.division));
      const matchedMap = {};
      for (const m of report.matched) matchedMap[m.division] = m;

      const divData = {};
      for (const div of divisions) {
        if (missingDivs.has(div)) {
          divData[div] = { status: "missing", amount: 0, exposure: estimateDivisions[div].total };
        } else if (matchedMap[div]) {
          const hasQtyMismatch = report.quantityMismatches.some(q => q.division === div);
          divData[div] = {
            status: hasQtyMismatch ? "mismatch" : "covered",
            amount: matchedMap[div].proposalTotal,
            exposure: 0,
          };
        } else {
          divData[div] = { status: "none", amount: 0, exposure: 0 };
        }
      }

      const totalExposure = report.totalExposure;
      const adjustedCost = totalBid + totalExposure;

      return {
        ...entry,
        divData,
        coverageScore: report.coverageScore,
        exclusionCount: report.exclusionConflicts.length,
        totalExposure,
        adjustedCost,
        exclusionConflicts: report.exclusionConflicts,
      };
    });

    // Sort columns
    const sorted = [...subColumns].sort((a, b) => {
      if (sortBy === "adjusted") return a.adjustedCost - b.adjustedCost;
      if (sortBy === "bid") return a.totalBid - b.totalBid;
      if (sortBy === "coverage") return b.coverageScore - a.coverageScore;
      return a.name.localeCompare(b.name);
    });

    // NOVA Recommends: lowest adjusted cost with ≥60% coverage
    let recommendedIdx = -1;
    let bestAdjusted = Infinity;
    for (let i = 0; i < sorted.length; i++) {
      const sub = sorted[i];
      if (sub.totalBid > 0 && sub.coverageScore >= 60 && sub.adjustedCost < bestAdjusted) {
        bestAdjusted = sub.adjustedCost;
        recommendedIdx = i;
      }
    }

    // Per-division best: lowest amount with "covered" status
    const divBest = {};
    for (const div of divisions) {
      let bestIdx = -1;
      let bestAmt = Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const dd = sorted[i].divData[div];
        if (dd.status === "covered" && dd.amount > 0 && dd.amount < bestAmt) {
          bestAmt = dd.amount;
          bestIdx = i;
        }
      }
      divBest[div] = bestIdx;
    }

    return { divisions, estimateDivisions, estimateGrandTotal, subColumns: sorted, recommendedIdx, divBest };
  }, [items, bidPackages, invitations, proposals, sortBy]);

  const toggleDiv = div => {
    setExpandedDivs(prev => {
      const next = new Set(prev);
      next.has(div) ? next.delete(div) : next.add(div);
      return next;
    });
  };

  // Auto-init selections from divBest on first matrix load
  useEffect(() => {
    if (matrix && !selectionsInitialized && Object.keys(selections).length === 0) {
      initSelectionsFromBest(matrix.divBest);
      setSelectionsInitialized(true);
    }
  }, [matrix, selectionsInitialized, selections, initSelectionsFromBest]);

  // Compute cherry-picked "Selected Total" from selections + overrides
  const selectedTotal = useMemo(() => {
    if (!matrix) return 0;
    let total = 0;
    for (const div of matrix.divisions) {
      const selIdx = selections[div];
      if (selIdx == null || selIdx < 0 || selIdx >= matrix.subColumns.length) continue;
      const overrideKey = `${div}-${selIdx}`;
      const overrideVal = overrides[overrideKey];
      if (overrideVal != null) {
        total += Number(overrideVal) || 0;
      } else {
        total += matrix.subColumns[selIdx].divData[div]?.amount || 0;
      }
    }
    return total;
  }, [matrix, selections, overrides]);

  if (!matrix) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(124,92,252,0.15), rgba(191,90,242,0.08))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <Ic d={I.report} size={28} color={C.accent} />
        </div>
        <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>No proposals to level yet</h3>
        <p
          style={{ color: C.textMuted, fontSize: 13, margin: 0, lineHeight: 1.5, maxWidth: 360, marginInline: "auto" }}
        >
          Once subcontractors submit proposals through the portal, they'll appear here in a side-by-side comparison grid
          with NOVA's scope gap analysis.
        </p>
      </div>
    );
  }

  const { divisions, estimateDivisions, estimateGrandTotal, subColumns, recommendedIdx, divBest } = matrix;

  const cellBg = {
    covered: { bg: "rgba(48,209,88,0.08)", text: C.text },
    mismatch: { bg: "rgba(255,159,10,0.08)", text: C.text },
    missing: { bg: "rgba(255,69,58,0.06)", text: "#FF453A" },
    none: { bg: "transparent", text: C.textDim },
  };

  const statusDot = status => {
    const colors = {
      covered: "#30D158",
      mismatch: "#FF9F0A",
      missing: "#FF453A",
      none: C.textDim,
    };
    return (
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: colors[status] || C.textDim,
          flexShrink: 0,
        }}
      />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textMuted }}>
            {[
              { label: "Covered", color: "#30D158" },
              { label: "Qty Mismatch", color: "#FF9F0A" },
              { label: "Scope Gap", color: "#FF453A" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: l.color,
                  }}
                />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Sort control */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            Sort:
          </span>
          {[
            { key: "adjusted", label: "Adjusted Cost" },
            { key: "bid", label: "Bid Amount" },
            { key: "coverage", label: "Coverage" },
            { key: "name", label: "Name" },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              style={{
                background: sortBy === s.key ? `${C.accent}15` : "transparent",
                color: sortBy === s.key ? C.accent : C.textMuted,
                border: `1px solid ${sortBy === s.key ? `${C.accent}30` : "transparent"}`,
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          borderRadius: T.radius.lg,
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          background: C.cardBg || C.glassBg || "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}>
            <thead>
              {/* Sub name headers */}
              <tr>
                <th
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: C.bg || "#1C1C1E",
                    padding: "12px 14px",
                    textAlign: "left",
                    borderBottom: `1px solid ${C.border}`,
                    minWidth: 180,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  CSI Division
                </th>
                <th
                  style={{
                    padding: "12px 10px",
                    borderBottom: `1px solid ${C.border}`,
                    textAlign: "right",
                    minWidth: 90,
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    background: C.bg || "#1C1C1E",
                  }}
                >
                  Estimate
                </th>
                {subColumns.map((sub, i) => (
                  <th
                    key={sub.id}
                    onMouseEnter={() => setHoveredCol(i)}
                    onMouseLeave={() => setHoveredCol(null)}
                    style={{
                      padding: "10px 12px",
                      borderBottom: `1px solid ${C.border}`,
                      borderLeft: `1px solid ${C.border}20`,
                      textAlign: "center",
                      minWidth: 130,
                      background:
                        hoveredCol === i
                          ? `${C.accent}08`
                          : i === recommendedIdx
                            ? "rgba(124,92,252,0.04)"
                            : C.bg || "#1C1C1E",
                      transition: "background 100ms",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div
                        style={{
                          color: C.text,
                          fontWeight: 600,
                          fontSize: 12,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 120,
                        }}
                        title={sub.name}
                      >
                        {sub.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                        <span style={{ color: C.textMuted }}>{sub.trade || sub.packageName}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span
                          style={{
                            color:
                              sub.coverageScore >= 80 ? "#30D158" : sub.coverageScore >= 60 ? "#FF9F0A" : "#FF453A",
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {pct(sub.coverageScore)}
                        </span>
                        {sub.exclusionCount > 0 && (
                          <span
                            style={{
                              background: "rgba(255,159,10,0.12)",
                              color: "#FF9F0A",
                              padding: "0px 4px",
                              borderRadius: 3,
                              fontSize: 9,
                              fontWeight: 700,
                            }}
                          >
                            {sub.exclusionCount} excl
                          </span>
                        )}
                        {sub.awarded && (
                          <span
                            style={{
                              background: "rgba(48,209,88,0.15)",
                              color: "#30D158",
                              padding: "0px 4px",
                              borderRadius: 3,
                              fontSize: 9,
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      {i === recommendedIdx && (
                        <div
                          style={{
                            background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 8,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          NOVA Recommends
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {divisions.map(div => {
                const divData = estimateDivisions[div];
                const divName = CSI[div]?.name || `Division ${div}`;
                const isExpanded = expandedDivs.has(div);
                const hasItems = divData.items.length > 0;
                const bestColIdx = divBest[div];

                return (
                  <tr key={div} onMouseEnter={() => setHoveredRow(div)} onMouseLeave={() => setHoveredRow(null)}>
                    {/* Division label */}
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        padding: "8px 14px",
                        borderBottom: `1px solid ${C.border}15`,
                        background: hoveredRow === div ? `${C.accent}06` : C.bg || "#1C1C1E",
                        cursor: hasItems ? "pointer" : "default",
                        transition: "background 100ms",
                      }}
                      onClick={() => hasItems && toggleDiv(div)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {hasItems && (
                          <Ic
                            d={I.chevron}
                            size={10}
                            color={C.textDim}
                            style={{
                              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 100ms",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            background: `${C.accent}12`,
                            color: C.accent,
                            padding: "1px 5px",
                            borderRadius: 3,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "monospace",
                            flexShrink: 0,
                          }}
                        >
                          {div}
                        </span>
                        <span
                          style={{
                            color: C.text,
                            fontWeight: 500,
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {divName}
                        </span>
                      </div>
                    </td>

                    {/* Estimate total */}
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: `1px solid ${C.border}15`,
                        textAlign: "right",
                        color: C.textMuted,
                        fontFamily: "monospace",
                        fontSize: 11,
                        background: hoveredRow === div ? `${C.accent}04` : "transparent",
                      }}
                    >
                      {divData.total > 0 ? fmtK(Math.round(divData.total)) : "—"}
                    </td>

                    {/* Sub bid cells — editable + selectable */}
                    {subColumns.map((sub, i) => {
                      const dd = sub.divData[div];
                      const cs = cellBg[dd.status];
                      const isBest = i === bestColIdx;
                      const isSelected = selections[div] === i;
                      const overrideKey = `${div}-${i}`;
                      const overrideVal = overrides[overrideKey];
                      const isEditing = editingCell?.divKey === div && editingCell?.subIdx === i;
                      const displayAmount = overrideVal != null ? overrideVal : dd.amount;

                      return (
                        <td
                          key={sub.id}
                          onMouseEnter={() => setHoveredCol(i)}
                          onMouseLeave={() => setHoveredCol(null)}
                          onClick={() => {
                            if (!isEditing && dd.status !== "missing") {
                              setEditingCell({ divKey: div, subIdx: i });
                            }
                          }}
                          style={{
                            padding: "4px 6px",
                            borderBottom: `1px solid ${C.border}15`,
                            borderLeft: `1px solid ${C.border}10`,
                            textAlign: "center",
                            cursor: dd.status === "missing" ? "default" : "pointer",
                            background:
                              isSelected
                                ? `${C.accent}12`
                                : hoveredCol === i || hoveredRow === div
                                  ? `${C.accent}06`
                                  : i === recommendedIdx
                                    ? "rgba(124,92,252,0.02)"
                                    : cs.bg,
                            outline: isSelected ? `1.5px solid ${C.accent}40` : "none",
                            outlineOffset: -1,
                            transition: "background 100ms",
                            position: "relative",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            {/* Selection radio */}
                            <div
                              onClick={e => {
                                e.stopPropagation();
                                toggleDivisionSelection(div, i);
                              }}
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                border: `1.5px solid ${isSelected ? C.accent : C.textDim}`,
                                background: isSelected ? C.accent : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                flexShrink: 0,
                                transition: "all 150ms",
                              }}
                            >
                              {isSelected && (
                                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff" }} />
                              )}
                            </div>
                            {isEditing ? (
                              <EditableCell
                                value={displayAmount}
                                onSave={val => {
                                  if (val !== dd.amount) setOverride(div, i, val);
                                  else clearOverride(div, i);
                                  clearEditingCell();
                                }}
                                onCancel={clearEditingCell}
                                onTab={shift => {
                                  // Navigate to next/prev sub column
                                  const nextIdx = shift ? Math.max(0, i - 1) : Math.min(subColumns.length - 1, i + 1);
                                  if (nextIdx !== i) setEditingCell({ divKey: div, subIdx: nextIdx });
                                  else clearEditingCell();
                                }}
                                accentColor={C.accent}
                              />
                            ) : (
                              <>
                                {statusDot(dd.status)}
                                <span
                                  style={{
                                    color: overrideVal != null ? C.accent : dd.status === "missing" ? "#FF453A" : cs.text,
                                    fontSize: 11,
                                    fontFamily: "monospace",
                                    fontWeight: isBest || overrideVal != null ? 700 : 400,
                                    fontStyle: overrideVal != null ? "italic" : "normal",
                                    textDecoration: overrideVal != null ? `underline ${C.accent}40` : "none",
                                  }}
                                >
                                  {dd.status === "missing" ? "GAP" : displayAmount > 0 ? fmtK(displayAmount) : "—"}
                                </span>
                                {isBest && dd.amount > 0 && !overrideVal && (
                                  <span style={{ fontSize: 8, fontWeight: 700, color: "#30D158", textTransform: "uppercase" }}>
                                    ★
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* ── Summary Rows ────────────────────────────────────── */}

              {/* Spacer */}
              <tr>
                <td
                  colSpan={2 + subColumns.length}
                  style={{
                    padding: 0,
                    height: 2,
                    background: `linear-gradient(90deg, ${C.accent}30, ${C.accent}08)`,
                  }}
                />
              </tr>

              {/* Total Bid */}
              <tr>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "10px 14px",
                    background: C.bg || "#1C1C1E",
                    color: C.text,
                    fontWeight: 700,
                    fontSize: 13,
                    borderBottom: `1px solid ${C.border}20`,
                  }}
                >
                  Total Bid
                </td>
                <td
                  style={{
                    padding: "10px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: C.textMuted,
                    fontWeight: 600,
                    fontSize: 12,
                    borderBottom: `1px solid ${C.border}20`,
                  }}
                >
                  {estimateGrandTotal > 0 ? fmt(Math.round(estimateGrandTotal)) : "—"}
                </td>
                {subColumns.map((sub, i) => (
                  <td
                    key={sub.id}
                    style={{
                      padding: "10px 10px",
                      textAlign: "center",
                      borderLeft: `1px solid ${C.border}10`,
                      borderBottom: `1px solid ${C.border}20`,
                      background: i === recommendedIdx ? "rgba(124,92,252,0.04)" : "transparent",
                    }}
                  >
                    <span
                      style={{
                        color: C.text,
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: "monospace",
                      }}
                    >
                      {sub.totalBid > 0 ? fmt(sub.totalBid) : "—"}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Scope Exposure */}
              <tr>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "6px 14px",
                    background: C.bg || "#1C1C1E",
                    color: C.textMuted,
                    fontSize: 12,
                    borderBottom: `1px solid ${C.border}20`,
                  }}
                >
                  Scope Exposure
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}20` }} />
                {subColumns.map((sub, i) => (
                  <td
                    key={sub.id}
                    style={{
                      padding: "6px 10px",
                      textAlign: "center",
                      borderLeft: `1px solid ${C.border}10`,
                      borderBottom: `1px solid ${C.border}20`,
                      background: i === recommendedIdx ? "rgba(124,92,252,0.04)" : "transparent",
                    }}
                  >
                    {sub.totalExposure > 0 ? (
                      <span style={{ color: "#FF453A", fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
                        +{fmtK(sub.totalExposure)}
                      </span>
                    ) : (
                      <span style={{ color: "#30D158", fontSize: 11, fontWeight: 500 }}>None</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Exclusions */}
              <tr>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "6px 14px",
                    background: C.bg || "#1C1C1E",
                    color: C.textMuted,
                    fontSize: 12,
                    borderBottom: `1px solid ${C.border}20`,
                  }}
                >
                  Exclusion Conflicts
                </td>
                <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}20` }} />
                {subColumns.map((sub, i) => (
                  <td
                    key={sub.id}
                    style={{
                      padding: "6px 10px",
                      textAlign: "center",
                      borderLeft: `1px solid ${C.border}10`,
                      borderBottom: `1px solid ${C.border}20`,
                      background: i === recommendedIdx ? "rgba(124,92,252,0.04)" : "transparent",
                    }}
                  >
                    {sub.exclusionCount > 0 ? (
                      <span style={{ color: "#FF9F0A", fontSize: 11, fontWeight: 600 }}>
                        {sub.exclusionCount} conflict{sub.exclusionCount > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#30D158", fontSize: 11, fontWeight: 500 }}>Clean</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Adjusted Cost — the row that matters */}
              <tr style={{ background: "rgba(124,92,252,0.03)" }}>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "12px 14px",
                    background: C.bg || "#1C1C1E",
                    color: C.accent,
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  Adjusted Cost
                </td>
                <td
                  style={{
                    padding: "12px 10px",
                    textAlign: "right",
                    color: C.textDim,
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  Bid + Exposure
                </td>
                {subColumns.map((sub, i) => (
                  <td
                    key={sub.id}
                    style={{
                      padding: "12px 10px",
                      textAlign: "center",
                      borderLeft: `1px solid ${C.border}10`,
                      background: i === recommendedIdx ? "rgba(124,92,252,0.06)" : "transparent",
                    }}
                  >
                    <div
                      style={{
                        color: i === recommendedIdx ? C.accent : C.text,
                        fontWeight: 700,
                        fontSize: 14,
                        fontFamily: "monospace",
                      }}
                    >
                      {sub.totalBid > 0 ? fmt(sub.adjustedCost) : "—"}
                    </div>
                    {i === recommendedIdx && sub.totalBid > 0 && (
                      <div
                        style={{
                          color: C.accent,
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          marginTop: 2,
                        }}
                      >
                        Best Value
                      </div>
                    )}
                  </td>
                ))}
              </tr>
              {/* ── Selected Total (cherry-pick composite) ──────── */}
              <tr style={{ background: `${C.accent}06` }}>
                <td
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "12px 14px",
                    background: C.bg || "#1C1C1E",
                    color: "#30D158",
                    fontWeight: 700,
                    fontSize: 13,
                    borderTop: `2px solid ${C.accent}30`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Ic d={I.check || "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"} size={14} color="#30D158" />
                    Selected Total
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 500, color: C.textDim, marginTop: 2 }}>
                    Cherry-picked best per division
                  </div>
                </td>
                <td
                  style={{
                    padding: "12px 10px",
                    textAlign: "right",
                    fontFamily: "monospace",
                    color: C.textMuted,
                    fontSize: 11,
                    borderTop: `2px solid ${C.accent}30`,
                  }}
                >
                  {estimateGrandTotal > 0 ? fmt(Math.round(estimateGrandTotal)) : "—"}
                </td>
                {subColumns.map((sub, i) => {
                  // Count how many divisions this sub is selected for
                  const selectedDivCount = divisions.filter(d => selections[d] === i).length;
                  return (
                    <td
                      key={sub.id}
                      style={{
                        padding: "12px 10px",
                        textAlign: "center",
                        borderLeft: `1px solid ${C.border}10`,
                        borderTop: `2px solid ${C.accent}30`,
                        background: selectedDivCount > 0 ? `${C.accent}08` : "transparent",
                      }}
                    >
                      {selectedDivCount > 0 && (
                        <div
                          style={{
                            fontSize: 9,
                            color: C.textMuted,
                            marginBottom: 2,
                          }}
                        >
                          {selectedDivCount} div{selectedDivCount > 1 ? "s" : ""}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Grand selected total */}
              <tr>
                <td
                  colSpan={2}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    padding: "10px 14px",
                    background: C.bg || "#1C1C1E",
                    textAlign: "right",
                  }}
                >
                  <span style={{ color: "#30D158", fontWeight: 700, fontSize: 15, fontFamily: "monospace" }}>
                    {selectedTotal > 0 ? fmt(Math.round(selectedTotal)) : "—"}
                  </span>
                  {selectedTotal > 0 && subColumns[recommendedIdx]?.adjustedCost > 0 && (
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                      {selectedTotal < subColumns[recommendedIdx].adjustedCost
                        ? `${fmtK(subColumns[recommendedIdx].adjustedCost - selectedTotal)} less than best single sub`
                        : selectedTotal > subColumns[recommendedIdx].adjustedCost
                          ? `${fmtK(selectedTotal - subColumns[recommendedIdx].adjustedCost)} more than best single sub`
                          : "Same as best single sub"}
                    </div>
                  )}
                </td>
                <td colSpan={subColumns.length} style={{ borderTop: "none" }} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub action cards below the grid */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {subColumns.map((sub, i) => (
          <div
            key={sub.id}
            style={{
              flex: "1 1 200px",
              maxWidth: 280,
              padding: "10px 14px",
              borderRadius: T.radius.md,
              background: C.glassBg || "rgba(255,255,255,0.03)",
              border: `1px solid ${i === recommendedIdx ? `${C.accent}30` : C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sub.name}
              </div>
              <div style={{ color: C.textMuted, fontSize: 11 }}>{sub.packageName}</div>
            </div>
            {onViewProposal && (
              <button
                onClick={() => onViewProposal({ ...sub.proposal, _packageName: sub.packageName })}
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.color = C.accent;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.color = C.textMuted;
                }}
              >
                Details
              </button>
            )}
            {onAward && !sub.awarded && sub.totalBid > 0 && (
              <button
                onClick={() => {
                  const pkg = bidPackages.find(p => p.id === sub.packageId);
                  if (pkg) onAward(pkg);
                }}
                style={{
                  background: "none",
                  border: "1px solid rgba(48,209,88,0.3)",
                  color: "#30D158",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(48,209,88,0.1)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                Award
              </button>
            )}
            {sub.awarded && (
              <span
                style={{
                  background: "rgba(48,209,88,0.12)",
                  color: "#30D158",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                Awarded
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
