/**
 * EstimatePanelView — Lightweight estimate grid for TakeoffsPage Full tier panel.
 * Renders grouped items with inline cost editing, same data sources as EstimatePage.
 */
import { useMemo, useState, useCallback, memo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { UNITS } from "@/constants/units";
import { inp, nInp, moneyCell } from "@/utils/styles";
import { nn, fmt, fmt2, formatCurrency } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";
import LevelingView from "@/components/estimate/LevelingView";

function EstimatePanelView({ onSelectItem, selectedItemId }) {
  const C = useTheme();
  const T = C.T;

  const items = useItemsStore(s => s.items);
  const updateItem = useItemsStore(s => s.updateItem);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const getTotals = useItemsStore(s => s.getTotals);

  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const activeCodes = getActiveCodes();
  const divFromCode = useProjectStore(s => s.divFromCode);

  const estGroupBy = useUiStore(s => s.estGroupBy);
  const setEstGroupBy = useUiStore(s => s.setEstGroupBy);
  const estDivision = useUiStore(s => s.estDivision);
  const estSearch = useUiStore(s => s.estSearch);
  const setEstSearch = useUiStore(s => s.setEstSearch);
  const expandedDivs = useUiStore(s => s.expandedDivs);
  const toggleExpandedDiv = useUiStore(s => s.toggleExpandedDiv);
  const estViewMode = useUiStore(s => s.estViewMode);
  const setEstViewMode = useUiStore(s => s.setEstViewMode);
  const activeGroupId = useUiStore(s => s.activeGroupId);

  const [focusedCostCell, setFocusedCostCell] = useState(null);

  const viewMode =
    estViewMode === "scope" || estViewMode === "detail" || estViewMode === "level"
      ? estViewMode
      : estViewMode === "pricing" || estViewMode === "detailed" || estViewMode === "both"
        ? "detail"
        : estViewMode === "leveling"
          ? "level"
          : "scope";
  const isPricing = viewMode === "detail";

  // Filter items
  const filteredItems = useMemo(() => {
    let list = items.filter(i => (i.bidContext || "base") === activeGroupId);
    if (estDivision !== "All")
      list = list.filter(i => {
        const raw = i.division || "";
        const norm = raw.includes(" - ") ? raw : divFromCode(raw) || raw;
        return norm === estDivision || raw === estDivision;
      });
    if (estSearch) {
      const q = estSearch.toLowerCase();
      list = list.filter(
        i => (i.description || "").toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, estDivision, estSearch, activeGroupId]);

  // Grouping
  const getSubKey = item => {
    const code = item.code || "";
    const sk = code.includes(".")
      ? code.split(".").slice(0, 2).join(".")
      : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach(item => {
      let key;
      if (estGroupBy === "trade") key = getTradeLabel(item);
      else if (estGroupBy === "division") {
        const rawDiv = item.division || "";
        key = rawDiv.includes(" - ") ? rawDiv : divFromCode(rawDiv) || rawDiv || "Unassigned";
      } else key = getSubKey(item);
      if (!groups[key]) groups[key] = { items: [], sortVal: 0 };
      groups[key].items.push(item);
      if (estGroupBy === "trade") groups[key].sortVal = getTradeSortOrder(item);
    });
    return groups;
  }, [filteredItems, estGroupBy]);

  const groupKeyTotals = useMemo(() => {
    const t = {};
    Object.entries(groupedItems).forEach(([gk, g]) => {
      t[gk] = { count: g.items.length, total: g.items.reduce((s, i) => s + getItemTotal(i), 0) };
    });
    return t;
  }, [groupedItems]);

  const sortedGroups = useMemo(
    () =>
      Object.entries(groupedItems).sort(([a, ag], [b, bg]) =>
        estGroupBy === "trade" ? (ag.sortVal || 0) - (bg.sortVal || 0) : a.localeCompare(b),
      ),
    [groupedItems, estGroupBy],
  );

  const getSubLabel = sk => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return `${sk} ${subName}`;
  };

  const totals = getTotals();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Mini toolbar */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* View mode toggle */}
        <div style={{ display: "flex", gap: 0, background: C.bg2, borderRadius: 4, padding: 1 }}>
          {[
            { key: "scope", label: "Scope" },
            { key: "detail", label: "Detail" },
            { key: "level", label: "Level" },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setEstViewMode(v.key)}
              style={{
                padding: "2px 7px",
                fontSize: 8,
                fontWeight: viewMode === v.key ? 700 : 500,
                background: viewMode === v.key ? C.accent : "transparent",
                color: viewMode === v.key ? "#fff" : C.textDim,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <input
          value={estSearch || ""}
          onChange={e => setEstSearch(e.target.value)}
          placeholder="Search..."
          style={inp(C, {
            flex: 1,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            padding: "3px 6px",
            fontSize: 9,
            borderRadius: 4,
            minWidth: 60,
          })}
        />
      </div>

      {/* Grid or Leveling */}
      {viewMode === "level" ? (
        <div style={{ flex: 1, overflow: "auto" }}>
          <LevelingView />
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
          <div style={{ padding: "4px 6px" }}>
            {sortedGroups.map(([gk, group]) => {
              const skItems = group.items;
              const skTotal = groupKeyTotals[gk]?.total || 0;
              const skCount = skItems.length;
              const isExpanded = expandedDivs.has(gk);
              const gkLabel = estGroupBy === "subdivision" ? getSubLabel(gk) : gk;

              return (
                <div
                  key={gk}
                  style={{
                    marginBottom: 4,
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.sm,
                    overflow: "hidden",
                  }}
                >
                  {/* Group Header */}
                  <div
                    className="nav-item"
                    onClick={() => toggleExpandedDiv(gk)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "5px 8px",
                      background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}40)`,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke={C.textMuted}
                        strokeWidth="2"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}
                      >
                        <path d="M3 1l4 4-4 4" />
                      </svg>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFeatureSettings: "'tnum'" }}>
                        {gkLabel}
                      </span>
                      <span
                        style={{ fontSize: 9, color: C.textDim, background: C.bg, padding: "0 4px", borderRadius: 6 }}
                      >
                        {skCount}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.textMuted,
                        fontFeatureSettings: "'tnum'",
                        fontFamily: T.font.sans,
                      }}
                    >
                      {fmt(skTotal)}
                    </span>
                  </div>

                  {/* Column headers */}
                  {isExpanded && (
                    <div
                      style={{
                        display: "flex",
                        borderTop: `1px solid ${C.border}`,
                        borderBottom: `1px solid ${C.border}`,
                        background: C.bg2,
                        padding: "4px 6px",
                        fontSize: 7,
                        fontWeight: 600,
                        color: C.textDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        gap: 3,
                      }}
                    >
                      <div style={{ width: 60 }}>Code</div>
                      <div style={{ flex: 1, minWidth: 80 }}>Description</div>
                      <div style={{ width: 48, textAlign: "right" }}>Qty</div>
                      <div style={{ width: 32 }}>Unit</div>
                      {isPricing && (
                        <>
                          <div style={{ width: 56, textAlign: "right" }}>Matl</div>
                          <div style={{ width: 56, textAlign: "right" }}>Labor</div>
                          <div style={{ width: 56, textAlign: "right" }}>Equip</div>
                          <div style={{ width: 56, textAlign: "right" }}>Sub</div>
                        </>
                      )}
                      <div style={{ width: 70, textAlign: "right" }}>Total</div>
                    </div>
                  )}

                  {/* Item rows */}
                  {isExpanded &&
                    skItems.map((item, rowIdx) => {
                      const lt = getItemTotal(item);
                      const isSelected = selectedItemId === item.id;
                      const isOddRow = rowIdx % 2 === 1;
                      const isZeroTotal = !lt;

                      return (
                        <div
                          key={item.id}
                          onClick={() => onSelectItem?.(item.id)}
                          onMouseEnter={e => {
                            if (!isSelected) e.currentTarget.style.background = `${C.accent}08`;
                          }}
                          onMouseLeave={e => {
                            if (!isSelected)
                              e.currentTarget.style.background = isOddRow
                                ? C.isDark
                                  ? "rgba(255,255,255,0.025)"
                                  : "rgba(0,0,0,0.025)"
                                : "transparent";
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                            padding: "4px 6px",
                            borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                            background: isSelected
                              ? `${C.accent}12`
                              : isOddRow
                                ? C.isDark
                                  ? "rgba(255,255,255,0.025)"
                                  : "rgba(0,0,0,0.025)"
                                : "transparent",
                            borderLeft: isSelected
                              ? `3px solid ${C.accent}`
                              : `3px solid ${isZeroTotal ? "transparent" : C.accent + "20"}`,
                            cursor: "pointer",
                            transition: "background 100ms ease-out",
                          }}
                        >
                          {/* Code */}
                          <div
                            style={{
                              width: 60,
                              fontSize: 9,
                              fontWeight: 600,
                              color: item.code ? C.text : C.textDim,
                              fontFeatureSettings: "'tnum'",
                            }}
                          >
                            {item.code || "\u2014"}
                          </div>
                          {/* Description */}
                          <div style={{ flex: 1, minWidth: 80 }}>
                            <input
                              value={item.description}
                              onChange={e => {
                                e.stopPropagation();
                                updateItem(item.id, "description", e.target.value);
                              }}
                              onClick={e => e.stopPropagation()}
                              placeholder="Description..."
                              style={inp(C, {
                                background: "transparent",
                                border: "1px solid transparent",
                                padding: "2px 3px",
                                fontSize: 9,
                              })}
                            />
                          </div>
                          {/* Qty */}
                          <div style={{ width: 48 }} onClick={e => e.stopPropagation()}>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateItem(item.id, "quantity", e.target.value)}
                              placeholder="0"
                              style={nInp(C, {
                                background: "transparent",
                                border: "1px solid transparent",
                                padding: "2px 2px",
                                fontSize: 9,
                              })}
                            />
                          </div>
                          {/* Unit */}
                          <div style={{ width: 32 }} onClick={e => e.stopPropagation()}>
                            <select
                              value={item.unit}
                              onChange={e => updateItem(item.id, "unit", e.target.value)}
                              style={inp(C, {
                                background: "transparent",
                                border: "1px solid transparent",
                                padding: "2px 0",
                                fontSize: 8,
                              })}
                            >
                              {UNITS.map(u => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </div>
                          {/* Pricing columns */}
                          {isPricing &&
                            ["material", "labor", "equipment", "subcontractor"].map(f => {
                              const cellKey = `${item.id}-${f}`;
                              const isFocused = focusedCostCell === cellKey;
                              const rawVal = item[f];
                              const displayVal = isFocused ? rawVal : nn(rawVal) ? formatCurrency(rawVal) : rawVal;
                              return (
                                <div key={f} style={{ width: 56 }} onClick={e => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={displayVal}
                                    onFocus={() => setFocusedCostCell(cellKey)}
                                    onBlur={() => setFocusedCostCell(null)}
                                    onChange={e => updateItem(item.id, f, e.target.value.replace(/[$,]/g, ""))}
                                    placeholder="0"
                                    style={nInp(C, {
                                      background: "transparent",
                                      border: "1px solid transparent",
                                      padding: "2px 1px",
                                      fontSize: 9,
                                      textAlign: "right",
                                    })}
                                  />
                                </div>
                              );
                            })}
                          {/* Total */}
                          <div style={moneyCell(C, lt, { width: 70, fontSize: 10, padding: "2px 2px" })}>{fmt(lt)}</div>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {filteredItems.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.textDim }}>
                {estSearch ? `No matches for "${estSearch}"` : "No scope items yet"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Totals bar */}
      {items.length > 0 && (
        <div
          style={{
            padding: "5px 8px",
            borderTop: `1px solid ${C.border}`,
            background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}40)`,
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, color: C.textDim }}>{filteredItems.length} items</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: C.text,
              fontFeatureSettings: "'tnum'",
              fontFamily: T.font.sans,
            }}
          >
            {fmt(totals.grand)}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(EstimatePanelView);
