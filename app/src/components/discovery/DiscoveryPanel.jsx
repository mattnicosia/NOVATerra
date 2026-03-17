// ═══════════════════════════════════════════════════════════════════════════════
// DiscoveryPanel — Dashboard UI for Proactive Discovery Scan results
//
// Shows a collapsible panel with:
// - Summary stats (total elements, sheets scanned, categories)
// - Category-grouped discovery items with one-click takeoff creation
// - Scan progress indicator during active scans
// - Rescan button for re-running after new uploads
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useMemo, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card, bt, sectionLabel } from "@/utils/styles";
import { useDiscoveryStore, DISCOVERY_CATEGORIES } from "@/stores/discoveryStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { rescanDrawings } from "@/utils/discoveryScan";
import { uid, nowStr } from "@/utils/format";
import DiscoveryItemRow from "./DiscoveryItemRow";

// Category display order & labels
const CATEGORY_ORDER = [
  { key: DISCOVERY_CATEGORIES.OPENING, label: "Openings" },
  { key: DISCOVERY_CATEGORIES.STRUCTURAL, label: "Structural" },
  { key: DISCOVERY_CATEGORIES.FINISH, label: "Finishes" },
  { key: DISCOVERY_CATEGORIES.FIXTURE, label: "Fixtures" },
  { key: DISCOVERY_CATEGORIES.EQUIPMENT, label: "Equipment" },
  { key: DISCOVERY_CATEGORIES.EXTERIOR, label: "Exterior" },
  { key: DISCOVERY_CATEGORIES.SITE, label: "Site" },
  { key: DISCOVERY_CATEGORIES.OTHER, label: "Other" },
];

export default function DiscoveryPanel({ onNavigateToSheet }) {
  const C = useTheme();
  const T = C.T;
  const [showDismissed, setShowDismissed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Store state
  const scanStatus = useDiscoveryStore(s => s.scanStatus);
  const scanProgress = useDiscoveryStore(s => s.scanProgress);
  const scanActivity = useDiscoveryStore(s => s.scanActivity);
  const discoveryIndex = useDiscoveryStore(s => s.discoveryIndex);
  const lastScanAt = useDiscoveryStore(s => s.lastScanAt);
  const drawings = useDrawingsStore(s => s.drawings);

  // Filter items
  const visibleItems = useMemo(() => {
    if (!discoveryIndex) return [];
    return showDismissed ? discoveryIndex : discoveryIndex.filter(i => !i.dismissed);
  }, [discoveryIndex, showDismissed]);

  // Group by category
  const groupedItems = useMemo(() => {
    const groups = {};
    for (const item of visibleItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [visibleItems]);

  // Stats
  const stats = useMemo(() => {
    const active = discoveryIndex.filter(i => !i.dismissed);
    const created = active.filter(i => i.createdTakeoffId);
    const totalInstances = active.reduce((sum, i) => sum + i.instanceCount, 0);
    const sheetsScanned = new Set(active.flatMap(i => i.sheets.map(s => s.drawingId))).size;
    return {
      total: active.length,
      created: created.length,
      totalInstances,
      sheetsScanned,
      categories: Object.keys(groupedItems).length,
    };
  }, [discoveryIndex, groupedItems]);

  // Toggle category collapse
  const toggleCategory = useCallback(key => {
    setCollapsedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Create takeoff from discovery item
  const handleCreateTakeoff = useCallback(
    item => {
      if (!useEstimatesStore.getState().activeEstimateId) return;
      const takeoffId = uid();
      const itemId = uid();

      // Create a new line item for this discovery
      const newItem = {
        id: itemId,
        description: item.description,
        quantity: item.measurementType === "count" ? item.instanceCount : 0,
        unit: item.measurementType === "count" ? "EA" : item.measurementType === "linear" ? "LF" : "SF",
        unitCost: 0,
        totalCost: 0,
        csiCode: "",
        group: null,
        bidContext: "base",
        materialCost: 0,
        laborCost: 0,
        equipmentCost: 0,
        subCost: 0,
        notes: `Auto-discovered by NOVA: ${item.tag} (${item.instanceCount} instances across ${item.sheets.length} sheets)`,
      };

      // Create a new takeoff linked to the first sheet
      const firstSheet = item.sheets[0];
      const newTakeoff = {
        id: takeoffId,
        description: item.description,
        quantity: item.measurementType === "count" ? item.instanceCount : 0,
        unit: item.measurementType === "count" ? "EA" : item.measurementType === "linear" ? "LF" : "SF",
        color: ["#C0392B", "#27AE60", "#2980B9", "#D35400", "#8E44AD", "#16A085", "#F39C12", "#E74C3C"][Math.floor(Math.random() * 8)],
        drawingRef: "",
        group: "",
        linkedItemId: itemId,
        code: "",
        variables: [],
        formula: "",
        measurements: [],
        bidContext: "base",
        tag: item.tag,
        discoveryId: item.id,
      };

      // Add to stores
      const currentItems = useItemsStore.getState().items;
      useItemsStore.getState().setItems([...currentItems, newItem]);

      const currentTakeoffs = useTakeoffsStore.getState().takeoffs;
      useTakeoffsStore.getState().setTakeoffs([...currentTakeoffs, newTakeoff]);

      // Mark discovery as actioned
      useDiscoveryStore.getState().markTakeoffCreated(item.id, takeoffId);

      // Navigate to the sheet if callback provided
      if (onNavigateToSheet && firstSheet?.drawingId) {
        onNavigateToSheet(firstSheet.drawingId);
      }
    },
    [onNavigateToSheet],
  );

  // Dismiss / restore
  const handleDismiss = useCallback(id => {
    useDiscoveryStore.getState().dismissDiscovery(id);
  }, []);

  const handleRestore = useCallback(id => {
    useDiscoveryStore.getState().restoreDiscovery(id);
  }, []);

  // Rescan
  const handleRescan = useCallback(() => {
    const dwgs = useDrawingsStore.getState().drawings;
    rescanDrawings(dwgs);
  }, []);

  // ── Scanning state ──────────────────────────────────────────────────────────
  if (scanStatus === "scanning") {
    return (
      <div style={{ ...card(C), padding: T.space[4], marginBottom: T.space[3] }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: C.accent,
              animation: "pulse 1.5s infinite",
            }}
          />
          <span style={{ ...sectionLabel(C), margin: 0 }}>Discovery Scan</span>
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: C.textDim, marginBottom: T.space[2] }}>
          {scanActivity || "Scanning..."}
        </div>
        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: 4,
            borderRadius: 2,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${scanProgress}%`,
              height: "100%",
              borderRadius: 2,
              background: C.accent,
              transition: "width 300ms ease-out",
            }}
          />
        </div>
      </div>
    );
  }

  // ── No results yet ──────────────────────────────────────────────────────────
  if (scanStatus === "idle" && discoveryIndex.length === 0) {
    if (drawings.length === 0) return null; // No drawings uploaded yet
    return (
      <div style={{ ...card(C), padding: T.space[4], marginBottom: T.space[3] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: T.fontSize.sm, color: C.textDim }}>
            NOVA can scan your {drawings.length} drawing{drawings.length !== 1 ? "s" : ""} to discover takeoff elements.
          </span>
          <button
            onClick={handleRescan}
            style={{
              ...bt(C),
              padding: `${T.space[1]} ${T.space[3]}`,
              background: `${C.accent}18`,
              color: C.accent,
              fontSize: T.fontSize.sm,
            }}
          >
            Scan Drawings
          </button>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (scanStatus === "error") {
    return (
      <div style={{ ...card(C), padding: T.space[4], marginBottom: T.space[3], borderColor: "#EF4444" }}>
        <div style={{ fontSize: T.fontSize.sm, color: "#EF4444", marginBottom: T.space[2] }}>
          Discovery scan failed. Try again?
        </div>
        <button
          onClick={handleRescan}
          style={{
            ...bt(C),
            padding: `${T.space[1]} ${T.space[3]}`,
            background: "rgba(239,68,68,0.12)",
            color: "#EF4444",
            fontSize: T.fontSize.sm,
          }}
        >
          Retry Scan
        </button>
      </div>
    );
  }

  // ── Results dashboard ───────────────────────────────────────────────────────
  return (
    <div style={{ ...card(C), marginBottom: T.space[3], overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${T.space[3]} ${T.space[4]}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
          <span style={{ ...sectionLabel(C), margin: 0, fontSize: T.fontSize.xs }}>
            Discovery
          </span>
          <span
            style={{
              fontSize: T.fontSize.xs,
              color: C.accent,
              fontWeight: T.fontWeight.bold,
              background: `${C.accent}15`,
              padding: `1px ${T.space[2]}`,
              borderRadius: T.radius.sm,
            }}
          >
            {stats.total} elements
          </span>
          <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            {stats.totalInstances} instances \u00B7 {stats.sheetsScanned} sheets
          </span>
          {stats.created > 0 && (
            <span style={{ fontSize: T.fontSize.xs, color: "#10B981" }}>
              {stats.created} takeoff{stats.created !== 1 ? "s" : ""} created
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <button
            onClick={() => setShowDismissed(prev => !prev)}
            style={{
              ...bt(C),
              padding: `2px ${T.space[2]}`,
              fontSize: 10,
              background: "transparent",
              color: C.textDim,
            }}
          >
            {showDismissed ? "Hide dismissed" : "Show dismissed"}
          </button>
          <button
            onClick={handleRescan}
            style={{
              ...bt(C),
              padding: `2px ${T.space[2]}`,
              fontSize: 10,
              background: "transparent",
              color: C.textDim,
            }}
            title="Re-scan all drawings"
          >
            Rescan
          </button>
        </div>
      </div>

      {/* Category groups */}
      {CATEGORY_ORDER.map(({ key, label }) => {
        const items = groupedItems[key];
        if (!items || items.length === 0) return null;
        const isCollapsed = collapsedCategories[key];

        return (
          <div key={key}>
            {/* Category header */}
            <button
              onClick={() => toggleCategory(key)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: T.space[2],
                padding: `${T.space[2]} ${T.space[4]}`,
                background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: "transform 150ms",
                }}
              >
                \u25BC
              </span>
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: T.fontWeight.bold,
                  color: C.text,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  color: C.textDim,
                  fontWeight: T.fontWeight.medium,
                }}
              >
                ({items.length})
              </span>
            </button>

            {/* Items */}
            {!isCollapsed &&
              items.map(item => (
                <DiscoveryItemRow
                  key={item.id}
                  item={item}
                  onCreateTakeoff={handleCreateTakeoff}
                  onDismiss={handleDismiss}
                  onRestore={handleRestore}
                />
              ))}
          </div>
        );
      })}

      {/* Empty state after filtering */}
      {visibleItems.length === 0 && discoveryIndex.length > 0 && (
        <div style={{ padding: T.space[4], textAlign: "center", color: C.textDim, fontSize: T.fontSize.sm }}>
          All discoveries have been dismissed.{" "}
          <button
            onClick={() => setShowDismissed(true)}
            style={{ ...bt(C), display: "inline", background: "none", color: C.accent, fontSize: T.fontSize.sm, padding: 0 }}
          >
            Show dismissed
          </button>
        </div>
      )}
    </div>
  );
}
