import { useState, useMemo, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { bt } from "@/utils/styles";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import ScopeItemRow from "./ScopeItemRow";
import ScopeNarrativeBlock from "./ScopeNarrativeBlock";
import ScopeNovaChat from "./ScopeNovaChat";

export default function ScopeReviewPanel({ onDrawingRefClick }) {
  const C = useTheme();
  const T = C.T;
  const scopeItems = useDrawingPipelineStore(s => s.scopeItems);
  const toggleSelected = useDrawingPipelineStore(s => s.toggleScopeItemSelected);
  const selectAll = useDrawingPipelineStore(s => s.selectAllScopeItems);
  const deselectAll = useDrawingPipelineStore(s => s.deselectAllScopeItems);
  const markPushed = useDrawingPipelineStore(s => s.markScopeItemsPushed);

  const [groupBy, setGroupBy] = useState("division");
  const [showNarrative, setShowNarrative] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  // Group items
  const grouped = useMemo(() => {
    const groups = {};
    for (const si of scopeItems) {
      const key =
        groupBy === "division"
          ? si.division || "Unassigned"
          : groupBy === "scheduleType"
            ? si.scheduleType || "Other"
            : si.confidence >= 0.8
              ? "High Confidence"
              : si.confidence >= 0.6
                ? "Medium Confidence"
                : "Low Confidence";
      if (!groups[key]) groups[key] = [];
      groups[key].push(si);
    }
    // Sort by key
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [scopeItems, groupBy]);

  // Counts
  const scheduleCount = scopeItems.filter(si => si.source === "schedule").length;
  const aiCount = scopeItems.filter(si => si.source !== "schedule").length;
  const selectedCount = scopeItems.filter(si => si.selected && !si.pushed).length;
  const pushedCount = scopeItems.filter(si => si.pushed).length;

  // Push to estimate
  const handlePush = useCallback(() => {
    const toPush = scopeItems.filter(si => si.selected && !si.pushed);
    if (toPush.length === 0) return;

    const { addElement } = useItemsStore.getState();
    const ids = [];

    for (const si of toPush) {
      addElement(si.division, {
        code: si.code,
        name: si.description,
        unit: si.unit || "EA",
        quantity: si.quantity || 1,
        material: 0,
        labor: 0,
        equipment: 0,
        subcontractor: 0,
        trade: autoTradeFromCode(si.code) || "",
        source: { category: "nova-scope", label: "NOVA Scope", confidence: si.confidence, scopeItemId: si.id },
      });
      ids.push(si.id);
    }

    markPushed(ids);

    // Navigate to estimate tab with toast
    useUiStore.getState().setCoreActiveTab?.("estimate");
    useUiStore.getState().showToast?.(
      `${toPush.length} scope items added — price them to complete your estimate`,
      "success",
    );
  }, [scopeItems, markPushed]);

  const toggleGroup = useCallback(
    key => setCollapsed(c => ({ ...c, [key]: !c[key] })),
    [],
  );

  if (!scopeItems.length) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.fg + "66", fontSize: 13 }}>
        No scope items detected. Run a scan to detect scope from drawings.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: T.cardBg || T.bg,
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
      }}
    >
      {/* Zone 1: Toolbar */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: T.fg }}>
          Scope Review
        </span>
        <span style={{ fontSize: 11, color: T.fg + "88" }}>
          {scheduleCount} from schedules{aiCount > 0 ? `, ${aiCount} AI` : ""}
          {pushedCount > 0 ? ` · ${pushedCount} pushed` : ""}
        </span>
        <div style={{ flex: 1 }} />

        {/* Group-by toggle */}
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value)}
          style={{
            fontSize: 10,
            background: T.inputBg || T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            color: T.fg,
            padding: "2px 4px",
          }}
        >
          <option value="division">By Division</option>
          <option value="scheduleType">By Schedule</option>
          <option value="confidence">By Confidence</option>
        </select>

        {/* Narrative toggle */}
        <button
          onClick={() => setShowNarrative(!showNarrative)}
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: showNarrative ? T.accent + "20" : "transparent",
            color: showNarrative ? T.accent : T.fg + "88",
            cursor: "pointer",
          }}
        >
          {showNarrative ? "Items" : "Narrative"}
        </button>

        {/* Accept/Reject all */}
        <button
          onClick={selectAll}
          style={{ fontSize: 10, color: T.accent, background: "none", border: "none", cursor: "pointer" }}
        >
          All
        </button>
        <button
          onClick={deselectAll}
          style={{ fontSize: 10, color: T.fg + "66", background: "none", border: "none", cursor: "pointer" }}
        >
          None
        </button>
      </div>

      {/* Zone 2: Item list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {grouped.map(([groupKey, items]) => (
          <div key={groupKey}>
            {/* Group header */}
            <div
              onClick={() => toggleGroup(groupKey)}
              style={{
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                color: T.fg,
                background: `${T.accent}0a`,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                position: "sticky",
                top: 0,
                zIndex: 1,
                borderBottom: `1px solid ${T.border}22`,
              }}
            >
              <span style={{ fontSize: 9, opacity: 0.5 }}>
                {collapsed[groupKey] ? "▶" : "▼"}
              </span>
              {groupKey}
              <span style={{ fontWeight: 400, color: T.fg + "66" }}>
                ({items.length})
              </span>
            </div>

            {!collapsed[groupKey] && (
              <>
                {showNarrative && (
                  <ScopeNarrativeBlock division={groupKey} items={items} T={T} />
                )}
                {items.map(item => (
                  <ScopeItemRow
                    key={item.id}
                    item={item}
                    T={T}
                    onToggle={toggleSelected}
                    onDrawingRefClick={onDrawingRefClick}
                  />
                ))}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Zone 3: NOVA Chat + Push */}
      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          flexShrink: 0,
        }}
      >
        <ScopeNovaChat T={T} />
        <div style={{ padding: "6px 12px 10px", display: "flex", gap: 8 }}>
          <button
            onClick={handlePush}
            disabled={selectedCount === 0}
            style={{
              ...bt(T),
              flex: 1,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              opacity: selectedCount === 0 ? 0.4 : 1,
            }}
          >
            Push to Estimate ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
