/**
 * EstimatePanelView — Lightweight estimate grid for TakeoffsPage Full tier panel.
 * Renders grouped items with inline cost editing, Source column, NOVA tint, and sorting.
 */
import { useMemo, useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { UNITS } from "@/constants/units";
import { inp, nInp, moneyCell } from "@/utils/styles";
import { nn, fmt, formatCurrency } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";
import { VIRTUAL_THRESHOLD } from "@/hooks/useVirtualList";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import LevelingView from "@/components/estimate/LevelingView";
import { hasAllowance, hasExclusion, isFullyExcluded, resolveColumnStatus } from "@/utils/allowances";
import { useGroupsStore } from "@/stores/groupsStore";

// ── Source pill color mapping ──
const SOURCE_COLORS = {
  user: null, // no pill for user-entered
  nova: "accent", // purple/accent
  scan: "accent", // same as NOVA
  database: "grey",
  core: "grey",
  sub: "blue",
  web: "green",
};

function getSourceLabel(item) {
  const src = item?.source;
  if (!src || !src.category || src.category === "user") return null;
  return src.label || src.category.toUpperCase();
}

function getSourceCategory(item) {
  return item?.source?.category || "user";
}

function SourcePill({ item, C }) {
  const label = getSourceLabel(item);
  if (!label) return null;

  const cat = getSourceCategory(item);
  const colorKey = SOURCE_COLORS[cat] || "grey";
  const color =
    colorKey === "accent"
      ? C.accent
      : colorKey === "blue"
        ? C.blue || "#3B82F6"
        : colorKey === "green"
          ? C.green || "#10B981"
          : C.textDim;

  return (
    <span
      title={`Source: ${label}`}
      style={{
        fontSize: 7,
        fontWeight: 700,
        color,
        background: `${color}15`,
        border: `1px solid ${color}20`,
        padding: "1px 5px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 60,
        display: "inline-block",
        lineHeight: 1.4,
        letterSpacing: 0.2,
      }}
    >
      {label}
    </span>
  );
}

/* ─── Compact row action chevron for panel view rows ─── */
function PanelRowAction({ itemId, C }) {
  const T = C.T;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [section, setSection] = useState(null); // "allowance" | "exclusion" | null
  const ref = useRef(null);
  const item = useItemsStore(s => s.items.find(i => i.id === itemId));
  const itemStatus = item?.status || "firm";
  const isInAlt = item && (item.bidContext || "base") !== "base";
  const isExcludedOrAllow = itemStatus === "excluded" || itemStatus === "allowance";
  const hasAnyColAllow = item && ["material","labor","equipment","subcontractor"].some(c => resolveColumnStatus(item, c) === "allowance");
  const hasAnyColExcl = item && ["material","labor","equipment","subcontractor"].some(c => resolveColumnStatus(item, c) === "excluded");

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest("[data-pv-action]")) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  if (!item) return null;

  const switchToNotes = (notesTab) => {
    useUiStore.getState().setNotesTabHint(notesTab);
    useUiStore.getState().setRequestLeftPanelTab("notes");
  };
  const showToast = useUiStore.getState().showToast;

  const handleAllowance = () => {
    const next = itemStatus === "allowance" ? "firm" : "allowance";
    useItemsStore.getState().setItemStatus(item.id, next);
    if (next !== "firm") switchToNotes("allowances");
  };
  const handleExclusion = () => {
    const next = itemStatus === "excluded" ? "firm" : "excluded";
    useItemsStore.getState().setItemStatus(item.id, next);
    if (next !== "firm") switchToNotes("exclusions");
  };
  const handleAlternate = () => {
    const name = item.description || "Untitled";
    const newGroupId = useGroupsStore.getState().addGroup(`Alt: ${name}`, "deduct", null);
    useItemsStore.getState().updateItem(item.id, "bidContext", newGroupId);
    showToast(`Moved to Alternate: ${name}`);
    useUiStore.getState().setRequestLeftPanelTab("scenarios");
    setOpen(false);
  };
  const handleReintroduce = () => {
    if (isInAlt) {
      const prevContext = item.bidContext;
      useItemsStore.getState().updateItem(item.id, "bidContext", "base");
      // Clean up empty alternate group
      const remaining = useItemsStore.getState().items.filter(i => (i.bidContext || "base") === prevContext);
      if (remaining.length === 0) useGroupsStore.getState().removeGroup(prevContext);
      showToast("Returned to Base Bid");
    } else {
      useItemsStore.getState().setItemStatus(item.id, "firm");
    }
    setOpen(false);
  };

  const COLS = [
    { key: "material", label: "Matl" },
    { key: "labor", label: "Labor" },
    { key: "equipment", label: "Equip" },
    { key: "subcontractor", label: "Sub" },
  ];

  const colBadge = (letter, color, active) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    height: 22, padding: "0 6px", borderRadius: 4, fontSize: 8, fontWeight: 800,
    letterSpacing: 0.3, cursor: "pointer", transition: "all 0.12s",
    background: active ? `${color}25` : "transparent",
    color: active ? color : C.textDim,
    border: active ? `1.5px solid ${color}` : `1px solid ${C.border}`,
  });

  const handleColToggle = (col, targetStatus) => {
    const current = resolveColumnStatus(item, col);
    const next = current === targetStatus ? "firm" : targetStatus;
    useItemsStore.getState().setColumnStatus(item.id, col, next);
    if (next !== "firm") switchToNotes(targetStatus === "allowance" ? "allowances" : "exclusions");
  };

  const handleAllToggle = (targetStatus) => {
    const next = itemStatus === targetStatus ? "firm" : targetStatus;
    useItemsStore.getState().setItemStatus(item.id, next);
    if (next !== "firm") switchToNotes();
  };

  return (
    <>
      <button
        data-pv-action="true"
        onClick={e => {
          e.stopPropagation();
          if (open) { setOpen(false); setSection(null); } else {
            const r = e.currentTarget.getBoundingClientRect();
            setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
            // Auto-open to the relevant section
            if (itemStatus === "allowance" || hasAnyColAllow) setSection("allowance");
            else if (itemStatus === "excluded" || hasAnyColExcl) setSection("exclusion");
            else setSection(null);
            setOpen(true);
          }
        }}
        style={{
          width: 20, height: 18, flexShrink: 0, border: open ? `1px solid ${C.accent}50` : `1px solid ${C.accent}20`,
          background: open ? `${C.accent}20` : `${C.accent}08`, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = C.accent + "18"; }}
        onMouseLeave={e => { e.currentTarget.style.background = open ? C.accent + "20" : C.accent + "08"; }}
      >
        <svg width="8" height="8" viewBox="0 0 10 10" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke={open ? C.accent : C.accent + "80"} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={ref} style={{ position: "fixed", top: pos?.top || 0, right: pos?.right || 0, zIndex: 100010, minWidth: 220, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: T.shadow.lg, padding: "6px 0" }} onClick={e => e.stopPropagation()}>

          {/* ── Allowance header ── */}
          {(() => {
            const isActive = itemStatus === "allowance" || hasAnyColAllow;
            const isOpen = section === "allowance";
            return (
              <>
                <div
                  onClick={() => setSection(isOpen ? null : "allowance")}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: isActive ? C.orange : C.text, fontWeight: isActive ? 600 : 400, fontSize: 12, transition: "background 80ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${C.orange}08`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ ...colBadge("A", C.orange, isActive), width: 20, height: 18, padding: 0 }}>A</span>
                  <span>Allowance</span>
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 8, color: C.orange }}>●</span>}
                  <svg width="8" height="8" viewBox="0 0 10 10" style={{ marginLeft: isActive ? 4 : "auto", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                    <path d="M2 3.5L5 6.5L8 3.5" stroke={C.textDim} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {isOpen && (
                  <div style={{ display: "flex", gap: 4, padding: "2px 12px 8px 38px", flexWrap: "wrap" }}>
                    <span onClick={() => handleAllToggle("allowance")} style={colBadge("A", C.orange, itemStatus === "allowance")}>All</span>
                    {COLS.map(c => {
                      const active = resolveColumnStatus(item, c.key) === "allowance";
                      return <span key={c.key} onClick={() => handleColToggle(c.key, "allowance")} style={colBadge("A", C.orange, active)}>{c.label}</span>;
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* ── Exclusion header ── */}
          {(() => {
            const isActive = itemStatus === "excluded" || hasAnyColExcl;
            const isOpen = section === "exclusion";
            const red = C.red || "#e05252";
            return (
              <>
                <div
                  onClick={() => setSection(isOpen ? null : "exclusion")}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: isActive ? red : C.text, fontWeight: isActive ? 600 : 400, fontSize: 12, transition: "background 80ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${red}08`)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ ...colBadge("E", red, isActive), width: 20, height: 18, padding: 0 }}>E</span>
                  <span>Exclusion</span>
                  {isActive && <span style={{ marginLeft: "auto", fontSize: 8, color: red }}>●</span>}
                  <svg width="8" height="8" viewBox="0 0 10 10" style={{ marginLeft: isActive ? 4 : "auto", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                    <path d="M2 3.5L5 6.5L8 3.5" stroke={C.textDim} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {isOpen && (
                  <div style={{ display: "flex", gap: 4, padding: "2px 12px 8px 38px", flexWrap: "wrap" }}>
                    <span onClick={() => handleAllToggle("excluded")} style={colBadge("E", red, itemStatus === "excluded")}>All</span>
                    {COLS.map(c => {
                      const active = resolveColumnStatus(item, c.key) === "excluded";
                      return <span key={c.key} onClick={() => handleColToggle(c.key, "excluded")} style={colBadge("E", red, active)}>{c.label}</span>;
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* ── Alternate ── */}
          {!isInAlt && (
            <>
              <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
              <div
                onClick={handleAlternate}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer", color: C.accent, fontSize: 12, transition: "background 80ms" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}08`)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ ...colBadge("Alt", C.accent, false), padding: "0 4px" }}>Alt</span>
                <span>Move to Alternate</span>
              </div>
            </>
          )}

          {/* ── Reintroduce ── */}
          {(isExcludedOrAllow || isInAlt) && (
            <>
              <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
              <div
                onClick={handleReintroduce}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", cursor: "pointer", color: C.green, fontSize: 11, transition: "background 80ms" }}
                onMouseEnter={e => (e.currentTarget.style.background = `${C.green}10`)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                <span>{isInAlt ? "Return to Base Bid" : "Reintroduce to Bid"}</span>
              </div>
            </>
          )}

          {/* ── Done ── */}
          <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
          <div
            onClick={() => setOpen(false)}
            style={{ textAlign: "center", padding: "5px 12px", cursor: "pointer", color: C.textDim, fontSize: 10, transition: "background 80ms" }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >Done</div>
        </div>,
        document.body,
      )}
    </>
  );
}

function EstimatePanelView({ onSelectItem, selectedItemId }) {
  const C = useTheme();
  const T = C.T;

  const items = useItemsStore(s => s.items);
  const updateItem = useItemsStore(s => s.updateItem);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const getTotals = useItemsStore(s => s.getTotals);
  const markNovaReviewed = useItemsStore(s => s.markNovaReviewed);

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

  // ── NOVA proposed count (for badge) ──
  const novaCount = useMemo(() => items.filter(i => i.novaProposed).length, [items]);

  // ── Detect if Source column should show (any non-user source exists) ──
  const hasSourceData = useMemo(
    () => items.some(i => i.source && i.source.category && i.source.category !== "user"),
    [items],
  );

  // Filter items
  const filteredItems = useMemo(() => {
    let list = items.filter(i => (i.bidContext || "base") === activeGroupId);
    if (estDivision !== "All")
      list = list.filter(i => {
        const raw = i.division || "";
        const norm = raw.includes(" - ") ? raw : divFromCode(raw) || raw;
        return norm === estDivision || raw === estDivision;
      });
    if (estSearch === "__hide_zero__") {
      list = list.filter(i => getItemTotal(i) > 0);
    } else if (estSearch) {
      const q = estSearch.toLowerCase();
      list = list.filter(
        i => (i.description || "").toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, estDivision, estSearch, activeGroupId]);

  // Grouping
  const getSubKey = item => {
    const code = item.code || "";
    if (!code.includes(".")) {
      const d = (item.division || "Unassigned").split(" - ")[0] || "00";
      return d.includes(".") ? d : `${d}.000`;
    }
    // Extract division.subdivision (first two segments)
    const parts = code.split(".");
    const div = parts[0] || "00";
    let sub = parts[1] || "000";
    // Normalize subdivision to 3 digits to match CSI format (e.g., "2300" → "230", "00" → "000")
    if (sub.length < 3) sub = sub.padEnd(3, "0");
    else if (sub.length > 3) sub = sub.slice(0, 3);
    return `${div}.${sub}`;
  };

  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach(item => {
      let key;
      if (estGroupBy === "source") {
        // Group by source category
        key = getSourceLabel(item) || "User";
      } else if (estGroupBy === "trade") key = getTradeLabel(item);
      else if (estGroupBy === "division") {
        const rawDiv = item.division || "";
        key = rawDiv.includes(" - ") ? rawDiv : divFromCode(rawDiv) || rawDiv || "Unassigned";
      } else key = getSubKey(item);
      if (!groups[key]) groups[key] = { items: [], sortVal: 0 };
      groups[key].items.push(item);
      if (estGroupBy === "trade") groups[key].sortVal = getTradeSortOrder(item);
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, estGroupBy]);

  const groupKeyTotals = useMemo(() => {
    const t = {};
    Object.entries(groupedItems).forEach(([gk, g]) => {
      t[gk] = { count: g.items.length, total: g.items.reduce((s, i) => s + getItemTotal(i), 0) };
    });
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const subs = activeCodes[dc]?.subs || {};
    // Try exact match first, then normalized 3-digit form
    let subName = subs[sk] || "";
    if (!subName) {
      const sub3 = sk.split(".")[1] || "";
      const norm = sub3.length < 3 ? sub3.padEnd(3, "0") : sub3.slice(0, 3);
      subName = subs[`${dc}.${norm}`] || "";
    }
    return subName ? `${sk} ${subName}` : sk;
  };

  const totals = getTotals();

  // ── Source sort order for grouping ──
  const _SOURCE_SORT = { nova: 0, scan: 0, web: 1, core: 2, database: 3, sub: 4, user: 5 };

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
        {/* Group by — includes Source option */}
        <select
          value={estGroupBy || "trade"}
          onChange={e => setEstGroupBy(e.target.value)}
          style={inp(C, {
            background: C.bg2,
            border: `1px solid ${C.border}`,
            padding: "2px 4px",
            fontSize: 8,
            borderRadius: 4,
            width: 70,
          })}
        >
          <option value="trade">Trade</option>
          <option value="division">Division</option>
          <option value="subdivision">Sub-Div</option>
          <option value="source">Source</option>
        </select>
        {/* Search */}
        <input
          value={estSearch === "__hide_zero__" ? "" : estSearch || ""}
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
        {/* NOVA proposed count badge */}
        {novaCount > 0 && (
          <span
            style={{
              fontSize: 7,
              fontWeight: 800,
              color: "#fff",
              background: C.accent,
              borderRadius: 6,
              padding: "2px 6px",
              lineHeight: 1.3,
              flexShrink: 0,
            }}
          >
            {novaCount} NOVA
          </span>
        )}
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
                        paddingLeft: 9, // 6px + 3px to match data row borderLeft offset
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
                      {hasSourceData && <div style={{ width: 60, textAlign: "center" }}>Source</div>}
                      <div style={{ width: 20 }} /> {/* spacer for chevron column */}
                    </div>
                  )}

                  {/* Item rows */}
                  {isExpanded &&
                    (() => {
                      const capped = skItems.length > VIRTUAL_THRESHOLD && !expandedDivs.has(`${gk}::__full__`);
                      const displayList = capped ? skItems.slice(0, VIRTUAL_THRESHOLD) : skItems;
                      const rows = displayList.map((item, rowIdx) => {
                        const lt = getItemTotal(item);
                        const isSelected = selectedItemId === item.id;
                        const isOddRow = rowIdx % 2 === 1;
                        const isZeroTotal = !lt;
                        const isNova = !!item.novaProposed;

                        // Row background: NOVA tint takes priority, then selection, then alternating
                        const rowBg = isSelected
                          ? `${C.accent}12`
                          : isNova
                            ? `${C.accent}05`
                            : isOddRow
                              ? C.isDark
                                ? "rgba(255,255,255,0.025)"
                                : "rgba(0,0,0,0.025)"
                              : "transparent";

                        const hoverBg = isNova ? `${C.accent}08` : `${C.accent}08`;
                        const restBg = isNova
                          ? `${C.accent}05`
                          : isOddRow
                            ? C.isDark
                              ? "rgba(255,255,255,0.025)"
                              : "rgba(0,0,0,0.025)"
                            : "transparent";

                        const rowSubItems = item.subItems || [];
                        const excluded = isFullyExcluded(item);
                        return (
                          <div key={item.id}>
                          <div
                            onClick={() => onSelectItem && onSelectItem(item.id)}
                            onMouseEnter={e => {
                              if (!isSelected) e.currentTarget.style.background = hoverBg;
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) e.currentTarget.style.background = restBg;
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 3,
                              padding: "4px 6px",
                              borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}`,
                              background: rowBg,
                              borderLeft: isSelected
                                ? `3px solid ${C.accent}`
                                : excluded
                                  ? `3px solid ${C.red || "#e05252"}`
                                  : hasAllowance(item)
                                    ? `3px solid ${C.orange}`
                                    : isNova
                                      ? `3px solid ${C.accent}30`
                                      : `3px solid ${isZeroTotal ? "transparent" : C.accent + "20"}`,
                              cursor: "pointer",
                              transition: "background 100ms ease-out",
                              opacity: excluded ? 0.5 : 1,
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
                                  textDecoration: excluded ? "line-through" : "none",
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
                                const cleaned = typeof rawVal === "string" ? rawVal.replace(/[$,]/g, "") : rawVal;
                                const num = nn(cleaned);
                                const displayVal = isFocused ? (num || "") : num ? formatCurrency(num) : "";
                                const colStatus = resolveColumnStatus(item, f);
                                const isColAllow = colStatus === "allowance";
                                const isColExcl = colStatus === "excluded";
                                return (
                                  <div key={f} style={{ width: 56, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={displayVal}
                                      onFocus={() => setFocusedCostCell(cellKey)}
                                      onBlur={() => setFocusedCostCell(null)}
                                      onChange={e => updateItem(item.id, f, e.target.value.replace(/[$,]/g, ""))}
                                      placeholder="—"
                                      style={nInp(C, {
                                        background: isFocused ? `${C.accent}08` : isColAllow ? `${C.orange}10` : num ? "transparent" : `${C.text}04`,
                                        border: isFocused ? `1px solid ${C.accent}40` : isColAllow ? `1.5px solid ${C.orange}` : `1px solid ${num ? "transparent" : C.border}`,
                                        borderRadius: isColAllow ? 3 : undefined,
                                        padding: "2px 1px",
                                        fontSize: 9,
                                        textAlign: "right",
                                        color: isColExcl ? (C.red || "#e05252") : num ? C.text : C.textDim,
                                        textDecoration: isColExcl ? "line-through" : "none",
                                        opacity: isColExcl ? 0.5 : 1,
                                      })}
                                    />
                                  </div>
                                );
                              })}
                            {/* Total */}
                            <div style={{
                              ...moneyCell(C, lt, { width: 70, fontSize: 10, padding: "2px 2px" }),
                              ...(excluded ? { textDecoration: "line-through", opacity: 0.6 } : {}),
                            }}>
                              {fmt(lt)}
                            </div>
                            {/* Source pill */}
                            {hasSourceData && (
                              <div
                                style={{ width: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
                              >
                                <SourcePill item={item} C={C} />
                                {/* Review checkmark for NOVA items */}
                                {isNova && (
                                  <button
                                    title="Mark as reviewed"
                                    onClick={e => {
                                      e.stopPropagation();
                                      markNovaReviewed(item.id);
                                    }}
                                    style={{
                                      marginLeft: 2,
                                      width: 14,
                                      height: 14,
                                      borderRadius: 3,
                                      border: `1px solid ${C.accent}30`,
                                      background: "transparent",
                                      color: C.accent,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                      padding: 0,
                                    }}
                                  >
                                    <Ic d={I.check} size={8} color={C.accent} sw={2.5} />
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Chevron action menu */}
                            <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                              <PanelRowAction itemId={item.id} C={C} />
                            </div>
                          </div>
                          {/* Sub-items expansion */}
                          {isSelected && rowSubItems.length > 0 && (
                            <div style={{
                              background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                              borderBottom: `1px solid ${C.border}`,
                              borderLeft: `3px solid ${C.accent}40`,
                              padding: "4px 10px 4px 30px",
                            }}>
                              <div style={{ fontSize: 8, fontWeight: 600, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
                                Included ({rowSubItems.length})
                              </div>
                              {rowSubItems.map(si => {
                                const siTotal = (nn(si.m) + nn(si.l) + nn(si.e)) * nn(si.factor || 1);
                                return (
                                  <div key={si.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 9, color: C.textDim }}>
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{si.desc || "—"}</span>
                                    <span style={{ fontSize: 8, color: C.textDim, whiteSpace: "nowrap" }}>{si.unit || ""}</span>
                                    <span style={{ fontSize: 9, color: C.text, fontFeatureSettings: "'tnum'", minWidth: 60, textAlign: "right" }}>
                                      {siTotal > 0 ? fmt(siTotal) : "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          </div>
                        );
                      });
                      if (capped) {
                        rows.push(
                          <div
                            key="__show-all__"
                            onClick={() => toggleExpandedDiv(`${gk}::__full__`)}
                            className="ghost-btn"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "5px 8px",
                              fontSize: 10,
                              color: C.accent,
                              cursor: "pointer",
                              borderTop: `1px solid ${C.border}20`,
                            }}
                          >
                            <Ic i={I.chevronDown} s={9} c={C.accent} />
                            Show all {skItems.length} items ({skItems.length - VIRTUAL_THRESHOLD} more)
                          </div>,
                        );
                      }
                      return rows;
                    })()}
                </div>
              );
            })}

            {filteredItems.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.textDim }}>
                {estSearch === "__hide_zero__"
                  ? "No items with $0 total"
                  : estSearch
                    ? `No matches for "${estSearch}"`
                    : "No scope items yet"}
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
