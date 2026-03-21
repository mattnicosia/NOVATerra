import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useBidLevelingStore } from "@/stores/bidLevelingStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useGroupsStore } from "@/stores/groupsStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn, fmt, titleCase } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder, getTradeKeyFromLabel } from "@/constants/tradeGroupings";
import { resolveLocationFactors, METRO_AREAS } from "@/constants/locationFactors";
import NotesPanel from "@/components/estimate/NotesPanel";
import EmptyState from "@/components/shared/EmptyState";
import CostValidationPanel from "@/components/estimate/CostValidationPanel";
import { VIRTUAL_THRESHOLD } from "@/hooks/useVirtualList";
import { exportEstimateXlsx } from "@/utils/exportXlsx";
import EstimateKPIStrip from "@/components/estimate/EstimateKPIStrip";
import DivisionNavigator from "@/components/estimate/DivisionNavigator";
import LevelingView from "@/components/estimate/LevelingView";
import CollaborationBar from "@/components/estimate/CollaborationBar";
import ScenariosPanel from "@/components/estimate/ScenariosPanel";
import RFIPanel from "@/components/estimate/RFIPanel";
import EstimateItemRow from "@/components/estimate/EstimateItemRow";
import EstimateTotalsBar from "@/components/estimate/EstimateTotalsBar";
import EstimateModals from "@/components/estimate/EstimateModals";
import SpatialTreemap from "@/components/estimate/SpatialTreemap";

export default function EstimatePage() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const activeCodes = getActiveCodes();
  const getDivisions = useProjectStore(s => s.getDivisions);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const subFromCode = useProjectStore(s => s.subFromCode);
  const DIVISIONS = getDivisions();

  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const items = useItemsStore(s => s.items);
  const setItems = useItemsStore(s => s.setItems);
  const addElement = useItemsStore(s => s.addElement);
  const updateItem = useItemsStore(s => s.updateItem);
  const getTotals = useItemsStore(s => s.getTotals);
  const markup = useItemsStore(s => s.markup);

  const dragItemId = useBidLevelingStore(s => s.dragItemId);
  const setDragItemId = useBidLevelingStore(s => s.setDragItemId);
  const dragOverSk = useBidLevelingStore(s => s.dragOverSk);
  const setDragOverSk = useBidLevelingStore(s => s.setDragOverSk);

  const exclusions = useSpecsStore(s => s.exclusions);
  const clarifications = useSpecsStore(s => s.clarifications);

  const estSearch = useUiStore(s => s.estSearch);
  const setEstSearch = useUiStore(s => s.setEstSearch);
  const estDivision = useUiStore(s => s.estDivision);
  const setEstDivision = useUiStore(s => s.setEstDivision);
  const estGroupBy = useUiStore(s => s.estGroupBy);
  const setEstGroupBy = useUiStore(s => s.setEstGroupBy);
  const estGroupBy2 = useUiStore(s => s.estGroupBy2);
  const setEstGroupBy2 = useUiStore(s => s.setEstGroupBy2);
  const expandedDivs = useUiStore(s => s.expandedDivs);
  const toggleExpandedDiv = useUiStore(s => s.toggleExpandedDiv);
  const setExpandedDivs = useUiStore(s => s.setExpandedDivs);
  const estViewMode = useUiStore(s => s.estViewMode);
  const setEstViewMode = useUiStore(s => s.setEstViewMode);
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const appSettings = useUiStore(s => s.appSettings);
  const setPickerForItemId = useDatabaseStore(s => s.setPickerForItemId);
  const project = useProjectStore(s => s.project);

  // Local state
  const [sendToDbItem, setSendToDbItem] = useState(null);
  const [bidIntelOpen, setBidIntelOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showAssemblyPicker, setShowAssemblyPicker] = useState(false);
  const [showScopeGenerate, setShowScopeGenerate] = useState(false);
  const [focusedCostCell, setFocusedCostCell] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(0); // 0 = idle, 1 = first confirm, 2 = second confirm
  const [leftPanelTab, setLeftPanelTab] = useState("estimate"); // "estimate" | "scenarios" | "notes" | "rfis"
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    try {
      return parseInt(sessionStorage.getItem("bldg-estLeftWidth")) || 230;
    } catch {
      return 230;
    }
  });
  const addMenuRef = useRef(null);
  const exportMenuRef = useRef(null);
  const grandTotalRef = useRef(null);
  const prevGrandRef = useRef(null);
  const itemTotalKeys = useRef({});

  // ── Panel resize drag handler ──
  const leftWidthRef = useRef(leftPanelWidth);
  leftWidthRef.current = leftPanelWidth;

  const startLeftDrag = useCallback(e => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidthRef.current;
    const onMove = ev => {
      const newW = Math.min(400, Math.max(160, startW + (ev.clientX - startX)));
      setLeftPanelWidth(newW);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        sessionStorage.setItem("bldg-estLeftWidth", String(leftWidthRef.current));
      } catch {
        /* sessionStorage unavailable */
      }
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Normalize view mode — map old values to current modes
  const viewMode =
    estViewMode === "scope" || estViewMode === "detail" || estViewMode === "level" || estViewMode === "spatial"
      ? estViewMode
      : estViewMode === "pricing" || estViewMode === "detailed" || estViewMode === "both"
        ? "detail"
        : estViewMode === "leveling"
          ? "level"
          : "scope";

  const laborType = useProjectStore(s => s.project.laborType);
  const currentLaborType = (appSettings.laborTypes || []).find(lt => lt.key === laborType);
  const laborMult = currentLaborType?.multiplier || 1.0;

  // Location factors
  const zipCode = useProjectStore(s => s.project.zipCode);
  const locationMetroId = useProjectStore(s => s.project.locationMetroId);
  const locationInfo = useMemo(() => {
    if (locationMetroId) {
      const metro = METRO_AREAS.find(m => m.id === locationMetroId);
      if (metro) return { mat: metro.mat, lab: metro.lab, equip: metro.equip, label: metro.label, source: "metro" };
    }
    return resolveLocationFactors(zipCode);
  }, [zipCode, locationMetroId]);
  const hasLocationAdj = locationInfo.mat !== 1 || locationInfo.lab !== 1 || locationInfo.equip !== 1;

  const totals = getTotals();

  // Grand total pulse animation
  useEffect(() => {
    if (prevGrandRef.current !== null && prevGrandRef.current !== totals.grand && grandTotalRef.current) {
      grandTotalRef.current.style.animation = "none";
      void grandTotalRef.current.offsetWidth;
      grandTotalRef.current.style.animation = "totalPulse 350ms ease-out";
    }
    prevGrandRef.current = totals.grand;
  }, [totals.grand]);

  // Listen for sendToDb events from detail panel
  useEffect(() => {
    const handler = e => setSendToDbItem(e.detail);
    window.addEventListener("openSendToDb", handler);
    return () => window.removeEventListener("openSendToDb", handler);
  }, []);

  // Assembly insert handler
  const handleInsertAssembly = useCallback(
    asm => {
      const totalM = asm.elements.reduce((s, el) => s + nn(el.m) * nn(el.factor), 0);
      const totalL = asm.elements.reduce((s, el) => s + nn(el.l) * nn(el.factor), 0);
      const totalE = asm.elements.reduce((s, el) => s + nn(el.e) * nn(el.factor), 0);
      const division = divFromCode(asm.code || asm.elements[0]?.code);
      const subItems = asm.elements.map(el => ({
        id: `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        desc: titleCase(el.desc),
        unit: el.unit,
        m: nn(el.m),
        l: nn(el.l),
        e: nn(el.e),
        factor: nn(el.factor) || 1,
      }));
      addElement(
        division,
        {
          code: asm.code || asm.elements[0]?.code || "",
          name: titleCase(asm.name),
          unit: "EA",
          material: Math.round(totalM * 100) / 100,
          labor: Math.round(totalL * 100) / 100,
          equipment: Math.round(totalE * 100) / 100,
          subItems,
        },
        useUiStore.getState().activeGroupId,
      );
      showToast(`Inserted "${titleCase(asm.name)}" as scope item with ${asm.elements.length} sub-items`);
    },
    [addElement, divFromCode, showToast],
  );

  const handleInsertDbItem = useCallback(el => {
    const codes = useProjectStore.getState().getActiveCodes();
    const dc = el.code ? el.code.split(".")[0] : "";
    const divName = codes[dc]?.name || "";
    useItemsStore.getState().addElement(
      `${dc} - ${divName}`,
      {
        code: el.code,
        name: el.name,
        unit: el.unit,
        material: el.material,
        labor: el.labor,
        equipment: el.equipment,
      },
      useUiStore.getState().activeGroupId,
    );
    useUiStore.getState().showToast(`Added "${el.name}" to estimate`);
  }, []);

  // Stable total helper
  const getTotal = useCallback(item => useItemsStore.getState().getItemTotal(item), []);
  // Filter items — include sub-group items when parent group is selected
  const activeGroupIds = useMemo(() => {
    const ids = new Set([activeGroupId]);
    // Include child groups of the active group
    const allGroups = useGroupsStore.getState().groups;
    allGroups.forEach(g => {
      if (g.parentId === activeGroupId) ids.add(g.id);
    });
    return ids;
  }, [activeGroupId]);

  const filteredItems = useMemo(() => {
    let list = items.filter(i => activeGroupIds.has(i.bidContext || "base"));
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
  }, [items, estDivision, estSearch, activeGroupIds, divFromCode]);

  // Item index map
  const itemIndexMap = useMemo(() => {
    const map = {};
    items.forEach((item, idx) => {
      map[item.id] = idx + 1;
    });
    return map;
  }, [items]);

  // Helper: get subdivision key
  const getSubKey = item => {
    const code = item.code || "";
    const sk = code.includes(".")
      ? code.split(".").slice(0, 2).join(".")
      : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  // Helper: get group key for item based on groupBy type
  const getGroupKey = useCallback(
    (item, groupByType) => {
      if (groupByType === "trade") return getTradeLabel(item);
      if (groupByType === "division") {
        const rawDiv = item.division || "";
        return rawDiv.includes(" - ") ? rawDiv : divFromCode(rawDiv) || rawDiv || "Unassigned";
      }
      return getSubKey(item); // subdivision
    },
    [divFromCode],
  );

  // Grouping — supports optional secondary groupBy for nested hierarchy
  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach(item => {
      const key = getGroupKey(item, estGroupBy);
      if (!groups[key]) groups[key] = { items: [], sortVal: 0, subGroups: null };
      groups[key].items.push(item);
      if (estGroupBy === "trade") groups[key].sortVal = getTradeSortOrder(item);
    });
    // Build sub-groups if secondary groupBy is set
    if (estGroupBy2 && estGroupBy2 !== estGroupBy) {
      Object.values(groups).forEach(g => {
        const subs = {};
        g.items.forEach(item => {
          const sk = getGroupKey(item, estGroupBy2);
          if (!subs[sk]) subs[sk] = { items: [], sortVal: 0 };
          subs[sk].items.push(item);
          if (estGroupBy2 === "trade") subs[sk].sortVal = getTradeSortOrder(item);
        });
        g.subGroups = subs;
      });
    }
    return groups;
  }, [filteredItems, estGroupBy, estGroupBy2, getGroupKey]);

  // Group key totals
  const groupKeyTotals = useMemo(() => {
    const t = {};
    Object.entries(groupedItems).forEach(([gk, g]) => {
      t[gk] = { count: g.items.length, total: g.items.reduce((s, i) => s + getTotal(i), 0) };
    });
    return t;
  }, [groupedItems, getTotal]);

  // Pre-sort groups
  const sortedGroups = useMemo(() => {
    return Object.entries(groupedItems).sort(([a, ag], [b, bg]) =>
      estGroupBy === "trade" ? (ag.sortVal || 0) - (bg.sortVal || 0) : a.localeCompare(b),
    );
  }, [groupedItems, estGroupBy]);

  const getSubLabel = sk => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return `${sk} ${subName}`;
  };

  // CSV export
  const exportCSV = useCallback(() => {
    const currentItems = useItemsStore.getState().items;
    const getItemTot = useItemsStore.getState().getItemTotal;
    const proj = useProjectStore.getState().project;
    const headers = [
      "Code",
      "Description",
      "Division",
      "Qty",
      "Unit",
      "Material",
      "Labor",
      "Equipment",
      "Sub",
      "Total",
    ];
    const rows = currentItems.map(i => [
      i.code,
      `"${(i.description || "").replace(/"/g, '""')}"`,
      `"${(i.division || "").replace(/"/g, '""')}"`,
      i.quantity,
      i.unit,
      i.material,
      i.labor,
      i.equipment,
      i.subcontractor,
      getItemTot(i).toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(proj.name || "estimate").replace(/\s+/g, "_")}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    useUiStore.getState().showToast("CSV exported");
  }, []);

  const toggleDiv = sk => toggleExpandedDiv(sk);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = e => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Count of items with incomplete division labels — drives auto-fix effect
  const incompleteDivCount = items.filter(i => {
    const d = i.division;
    return d && d !== "Unassigned" && (!d.includes(" - ") || !d.split(" - ")[1]?.trim());
  }).length;

  // Normalize division codes — catches both bare codes ("07") and incomplete labels ("07 - ")
  useEffect(() => {
    const isIncomplete = div => {
      if (!div || div === "Unassigned") return false;
      if (!div.includes(" - ")) return true;
      const afterDash = div.split(" - ")[1];
      if (!afterDash || !afterDash.trim()) return true;
      return false;
    };
    const needsFix = items.some(i => isIncomplete(i.division));
    if (!needsFix) return;
    const fixed = items.map(i => {
      if (!isIncomplete(i.division)) return i;
      const code = i.code || (i.division ? i.division.split(" - ")[0].trim() : "");
      const full = divFromCode(code);
      return full && full !== i.division ? { ...i, division: full } : i;
    });
    if (fixed.some((f, idx) => f !== items[idx])) setItems(fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- divFromCode/setItems are stable Zustand actions; items tracked via length+incompleteDivCount to avoid loops
  }, [items.length, incompleteDivCount]);

  // Flat item list for row click
  const handleRowClick = useCallback(itemId => {
    setSelectedItemId(prev => (prev === itemId ? null : itemId));
  }, []);

  // Stable drag-end handler for memoized rows
  const handleDragEnd = useCallback(() => {
    setDragItemId(null);
    setDragOverSk(null);
  }, [setDragItemId, setDragOverSk]);

  // Stable blur handler for cost cells
  const handleBlurCostCell = useCallback(() => setFocusedCostCell(null), []);

  // isPricing mode — shows M/L/E/S columns inline
  const isPricing = viewMode === "detail";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", animation: "fadeIn 0.15s ease-out" }}>
      {/* Collaboration Bar */}
      <CollaborationBar />

      {/* Zone 1: KPI Strip */}
      <EstimateKPIStrip />

      {/* Zone 2+3: Navigator + Grid + Detail */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Panel — Divisions / Notes tab switch */}
        <div
          style={{
            width: leftPanelWidth,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "width 0.15s ease",
          }}
        >
          {/* Tab strip */}
          <div
            style={{
              display: "flex",
              borderBottom: `0.5px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              flexShrink: 0,
            }}
          >
            {[
              { key: "estimate", label: "Estimate" },
              { key: "scenarios", label: "Scenarios" },
              { key: "notes", label: "Notes", count: (exclusions?.length || 0) + (clarifications?.length || 0) },
              { key: "rfis", label: "RFIs" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setLeftPanelTab(t.key)}
                style={{
                  flex: 1,
                  padding: "4px 3px",
                  fontSize: 7,
                  fontWeight: leftPanelTab === t.key ? 700 : 500,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: T.font.sans,
                  background:
                    leftPanelTab === t.key
                      ? C.estTabActiveBg || (C.isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.20)")
                      : "transparent",
                  color: leftPanelTab === t.key ? C.text : C.textDim,
                  borderBottom:
                    leftPanelTab === t.key
                      ? C.estTabActiveBorder !== undefined
                        ? C.estTabActiveBorder
                        : `2px solid ${C.accent}`
                      : "2px solid transparent",
                  borderRadius: leftPanelTab === t.key && C.estTabActiveRadius ? C.estTabActiveRadius : 0,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    style={{
                      fontSize: 8,
                      background: `${C.accent}20`,
                      padding: "1px 4px",
                      borderRadius: 6,
                      marginLeft: 3,
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {leftPanelTab === "estimate" ? (
              <DivisionNavigator activeDivision={estDivision} onSelectDivision={setEstDivision} />
            ) : leftPanelTab === "scenarios" ? (
              <ScenariosPanel />
            ) : leftPanelTab === "rfis" ? (
              <RFIPanel />
            ) : (
              <NotesPanel inline />
            )}
          </div>
        </div>

        {/* Left resize handle */}
        <div
          onMouseDown={startLeftDrag}
          style={{
            width: 4,
            cursor: "col-resize",
            flexShrink: 0,
            background: "transparent",
            transition: "background 0.15s",
            position: "relative",
            zIndex: 5,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}30`)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        />

        {/* Main content (center) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Unified Toolbar — grouped with visual hierarchy */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: `${T.space[2]}px ${T.space[5]}px`,
              borderBottom: `1px solid ${C.border}`,
              flexShrink: 0,
              flexWrap: "wrap",
              minHeight: 44,
            }}
          >
            {/* Group 1: Primary CTA */}
            <div ref={addMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                className="accent-btn"
                onClick={() => setAddMenuOpen(v => !v)}
                style={bt(C, {
                  background: dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.22)",
                  color: C.text,
                  padding: "7px 16px",
                  border: `0.5px solid ${dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.35)"}`,
                  boxShadow: [
                    `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.50)"}`,
                    `0 0 0 0.5px ${dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.12)"}`,
                  ].join(", "),
                  backdropFilter: "blur(12px) saturate(160%)",
                  WebkitBackdropFilter: "blur(12px) saturate(160%)",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: T.radius.sm,
                  transition: "all 0.25s ease",
                })}
              >
                <Ic d={I.plus} size={14} color={C.accent} sw={2.5} /> Add
                <Ic d={I.chevron} size={8} color={C.textDim} style={{ transform: "rotate(90deg)", marginLeft: 2 }} />
              </button>
              {addMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "100%",
                    marginTop: 4,
                    zIndex: 200,
                    background: dk ? "rgba(20,20,35,0.75)" : "rgba(255,255,255,0.72)",
                    backdropFilter: "blur(24px) saturate(180%)",
                    WebkitBackdropFilter: "blur(24px) saturate(180%)",
                    border: `0.5px solid ${dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.35)"}`,
                    borderRadius: T.radius.md,
                    boxShadow: [
                      `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.50)"}`,
                      `0 8px 32px ${dk ? "rgba(0,0,0,0.40)" : "rgba(0,0,0,0.12)"}`,
                      `0 0 0 0.5px ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                    ].join(", "),
                    minWidth: 200,
                    overflow: "hidden",
                  }}
                >
                  {[
                    {
                      label: "Blank Item",
                      icon: I.plus,
                      action: () =>
                        addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId),
                    },
                    {
                      label: "From Database",
                      icon: I.search,
                      action: () => {
                        addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId);
                        setTimeout(
                          () =>
                            setPickerForItemId(
                              useItemsStore.getState().items[useItemsStore.getState().items.length - 1]?.id,
                            ),
                          50,
                        );
                      },
                    },
                    { label: "From Assembly", icon: I.assembly, action: () => setShowAssemblyPicker(true) },
                    { label: "AI Generate", icon: I.ai, action: () => setShowScopeGenerate(true) },
                    { label: "Import CSV", icon: I.upload, action: () => setCsvImportOpen(true) },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      className="nav-item"
                      onClick={() => {
                        opt.action();
                        setAddMenuOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12,
                        fontWeight: 500,
                        color: C.text,
                        fontFamily: T.font.sans,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <Ic d={opt.icon} size={14} color={C.accent} /> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div style={{ position: "relative", flex: 1, maxWidth: 240, minWidth: 120 }}>
              <input
                placeholder="Search items..."
                value={estSearch}
                onChange={e => setEstSearch(e.target.value)}
                style={inp(C, { paddingLeft: 32, fontSize: 12 })}
              />
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <Ic d={I.search} size={13} color={C.textDim} />
              </div>
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0, opacity: 0.6 }} />

            {/* GroupBy toggle: Subdivision | Division | Trade — click=primary, shift+click=add secondary */}
            {viewMode !== "level" && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <div
                  style={{
                    display: "flex",
                    background: dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.10)",
                    backdropFilter: "blur(8px) saturate(150%)",
                    WebkitBackdropFilter: "blur(8px) saturate(150%)",
                    borderRadius: T.radius.sm,
                    overflow: "hidden",
                    border: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.20)"}`,
                    boxShadow: `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.35)"}`,
                  }}
                >
                  {[
                    { key: "subdivision", label: "Sub" },
                    { key: "division", label: "Div" },
                    { key: "trade", label: "Trade" },
                  ].map(v => {
                    const isPrimary = estGroupBy === v.key;
                    const isSecondary = estGroupBy2 === v.key;
                    return (
                      <button
                        key={v.key}
                        onClick={e => {
                          if (e.shiftKey && v.key !== estGroupBy) {
                            // Shift+click toggles secondary grouping
                            setEstGroupBy2(estGroupBy2 === v.key ? null : v.key);
                          } else {
                            setEstGroupBy(v.key);
                            if (estGroupBy2 === v.key) setEstGroupBy2(null); // clear secondary if same
                          }
                        }}
                        title={`Click: group by ${v.key}. Shift+Click: add as secondary grouping level.`}
                        style={{
                          padding: "5px 10px",
                          fontSize: 9,
                          fontWeight: 600,
                          border: "none",
                          cursor: "pointer",
                          transition: "all 0.25s ease",
                          background: isPrimary
                            ? dk
                              ? "rgba(255,255,255,0.10)"
                              : "rgba(255,255,255,0.40)"
                            : isSecondary
                              ? C.accentBg
                              : "transparent",
                          color: isPrimary ? C.text : isSecondary ? C.purple || C.accent : C.textMuted,
                          fontFamily: T.font.sans,
                          boxShadow: isPrimary
                            ? `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.50)"}`
                            : "none",
                          position: "relative",
                        }}
                      >
                        {v.label}
                        {isSecondary && (
                          <span
                            style={{
                              position: "absolute",
                              top: 1,
                              right: 2,
                              fontSize: 7,
                              color: C.purple || C.accent,
                              fontWeight: 800,
                            }}
                          >
                            2
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Clear secondary grouping */}
                {estGroupBy2 && (
                  <button
                    onClick={() => setEstGroupBy2(null)}
                    title="Remove secondary grouping"
                    style={{
                      width: 16,
                      height: 16,
                      border: `1px solid ${C.border}`,
                      background: "transparent",
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: 9,
                      color: C.textDim,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Expand/Collapse all toggle */}
            {viewMode !== "level" && sortedGroups.length > 0 && (
              <button
                onClick={() => {
                  const allKeys = sortedGroups.map(([gk]) => gk);
                  const allExpanded = allKeys.every(k => expandedDivs.has(k));
                  if (allExpanded) {
                    setExpandedDivs(new Set());
                  } else {
                    setExpandedDivs(new Set(allKeys));
                  }
                }}
                title={sortedGroups.every(([gk]) => expandedDivs.has(gk)) ? "Collapse all" : "Expand all"}
                style={{
                  width: 22,
                  height: 22,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.textMuted}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {sortedGroups.every(([gk]) => expandedDivs.has(gk)) ? (
                    <path d="M4 14l8-8 8 8" />
                  ) : (
                    <path d="M4 10l8 8 8-8" />
                  )}
                </svg>
              </button>
            )}

            {/* Table / Spatial toggle */}
            {viewMode !== "level" && (
              <div
                style={{
                  display: "flex",
                  background: dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.10)",
                  borderRadius: T.radius.sm,
                  overflow: "hidden",
                  border: `0.5px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.20)"}`,
                  marginLeft: 4,
                  flexShrink: 0,
                }}
              >
                {[
                  { key: "table", label: "Table", icon: "≡" },
                  { key: "spatial", label: "Spatial", icon: "⬡" },
                ].map(v => {
                  const isActive = v.key === "spatial" ? viewMode === "spatial" : viewMode !== "spatial";
                  return (
                    <button
                      key={v.key}
                      onClick={() => {
                        if (v.key === "spatial") setEstViewMode("spatial");
                        else if (viewMode === "spatial") setEstViewMode("scope");
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 9,
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        background: isActive
                          ? v.key === "spatial"
                            ? `${C.accent}25`
                            : dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.40)"
                          : "transparent",
                        color: isActive ? (v.key === "spatial" ? C.accent : C.text) : C.textMuted,
                        fontFamily: T.font.sans,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{v.icon}</span> {v.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ flex: 1 }} />

            {/* Status indicators — quiet, informational */}
            {(laborMult !== 1.0 || hasLocationAdj) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 2 }}>
                {laborMult !== 1.0 && (
                  <span style={{ fontSize: 9, color: C.blue, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {currentLaborType?.label || "Labor"} {laborMult}×
                  </span>
                )}
                {laborMult !== 1.0 && hasLocationAdj && <span style={{ fontSize: 9, color: C.textDim }}>·</span>}
                {hasLocationAdj && (
                  <span style={{ fontSize: 9, color: C.blue, fontWeight: 600, whiteSpace: "nowrap" }}>
                    📍 {locationInfo.label}
                  </span>
                )}
              </div>
            )}

            {/* Separator before actions */}
            <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0, opacity: 0.6 }} />

            {/* Right-side actions — secondary */}
            <div ref={exportMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                className="ghost-btn"
                onClick={() => setExportMenuOpen(v => !v)}
                style={bt(C, {
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  padding: "5px 10px",
                  fontSize: 10,
                })}
              >
                <Ic d={I.download} size={12} color={C.textMuted} /> Export
              </button>
              {exportMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    marginTop: 4,
                    zIndex: 200,
                    background: C.bg1,
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.md,
                    boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
                    minWidth: 140,
                    overflow: "hidden",
                  }}
                >
                  {[
                    { label: "CSV", action: exportCSV },
                    {
                      label: "XLSX",
                      action: () => {
                        exportEstimateXlsx(project, items, totals, markup);
                        setExportMenuOpen(false);
                      },
                    },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      className="nav-item"
                      onClick={() => {
                        opt.action();
                        setExportMenuOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 12,
                        fontWeight: 500,
                        color: C.text,
                        fontFamily: T.font.sans,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="ghost-btn"
              onClick={() => setShowHistory(v => !v)}
              title="Version History"
              style={bt(C, {
                background: showHistory ? `${C.accent}12` : "transparent",
                border: `1px solid ${showHistory ? C.accent + "30" : C.border}`,
                color: showHistory ? C.accent : C.textMuted,
                padding: "5px 10px",
                fontSize: 10,
              })}
            >
              <Ic d={I.clock || I.calendar} size={12} color={showHistory ? C.accent : C.textMuted} /> History
            </button>
            <button
              className="ghost-btn"
              onClick={() => setShowNova(v => !v)}
              title="NOVA AI Assistant"
              style={bt(C, {
                background: showNova ? `${C.accent}12` : "transparent",
                border: `1px solid ${showNova ? C.accent + "30" : C.border}`,
                color: showNova ? C.accent : C.textMuted,
                padding: "5px 10px",
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                gap: 4,
              })}
            >
              <Ic d={I.ai} size={12} color={showNova ? C.accent : C.textMuted} /> NOVA
            </button>
            <button
              className="ghost-btn"
              onClick={() => setBidIntelOpen(true)}
              title="AI Review"
              style={bt(C, {
                background: `linear-gradient(135deg, ${C.accent}08, ${C.purple || C.accent}08)`,
                border: `1px solid ${C.accent}20`,
                color: C.accent,
                padding: "5px 10px",
                fontWeight: 600,
                fontSize: 10,
              })}
            >
              <Ic d={I.ai} size={12} color={C.accent} /> Review
            </button>

            {/* Clear All Items — two-layer confirmation */}
            {items.length > 0 && (
              <div style={{ position: "relative" }}>
                <button
                  className="ghost-btn"
                  onClick={() => setClearConfirm(1)}
                  title="Clear All Items"
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textMuted,
                    padding: "5px 10px",
                    fontSize: 10,
                  })}
                >
                  <Ic d={I.trash} size={12} color={C.textMuted} />
                </button>

                {clearConfirm > 0 && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setClearConfirm(0)} />
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        marginTop: 6,
                        zIndex: 1000,
                        background: C.bg1,
                        border: `1px solid ${clearConfirm === 2 ? "#ef4444" : C.border}`,
                        borderRadius: T.radius.md,
                        boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)",
                        padding: "16px 20px",
                        minWidth: 260,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: C.text,
                          fontFamily: T.font.sans,
                          marginBottom: 4,
                        }}
                      >
                        {clearConfirm === 1 ? "Delete all items?" : "Are you sure you're sure?"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.textDim,
                          fontFamily: T.font.sans,
                          marginBottom: 14,
                        }}
                      >
                        {clearConfirm === 1
                          ? `This will remove all ${items.length} items from the estimate.`
                          : "This cannot be undone."}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button
                          onClick={() => setClearConfirm(0)}
                          style={bt(C, {
                            padding: "6px 16px",
                            fontSize: 11,
                            fontWeight: 500,
                            color: C.textDim,
                            background: C.bg2,
                          })}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (clearConfirm === 1) {
                              setClearConfirm(2);
                            } else {
                              useItemsStore.getState().setItems([]);
                              setClearConfirm(0);
                              useUiStore.getState().showToast(`Cleared ${items.length} items`);
                            }
                          }}
                          style={bt(C, {
                            padding: "6px 16px",
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#fff",
                            background: clearConfirm === 2 ? "#dc2626" : "#ef4444",
                          })}
                        >
                          {clearConfirm === 1 ? "Yes, Clear All" : "Yes, I'm Sure"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Content area — grid, leveling, or spatial */}
          {viewMode === "level" ? (
            <LevelingView />
          ) : viewMode === "spatial" ? (
            <SpatialTreemap />
          ) : (
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "auto",
                minHeight: 0,
                background: C.estGridBg || "transparent",
              }}
              className="blueprint-grid"
            >
              <div style={{ padding: `${T.space[3]}px ${T.space[5]}px` }}>
                <CostValidationPanel items={items} />

                {/* Estimate Grid */}
                {sortedGroups.map(([gk, group]) => {
                  const skItems = group.items;
                  const skTotal = groupKeyTotals[gk]?.total || 0;
                  const skCount = skItems.length;
                  const isExpanded = expandedDivs.has(gk);
                  const gkLabel =
                    estGroupBy === "subdivision"
                      ? getSubLabel(gk)
                      : estGroupBy === "division" && !gk.includes(" - ")
                        ? divFromCode(gk) || gk
                        : gk;

                  return (
                    <div
                      key={gk}
                      className="est-division-group"
                      style={{
                        marginBottom: 8,
                        border: `1px solid ${C.border}`,
                        borderRadius: T.radius.sm,
                        boxShadow: T.shadow.sm,
                        overflow: "visible",
                      }}
                    >
                      {/* Group Header */}
                      <div
                        style={{
                          display: "flex",
                          background:
                            dragOverSk === gk ? `${C.orange}15` : `linear-gradient(180deg, ${C.bg1}, ${C.bg2}40)`,
                          transition: "background 0.15s",
                        }}
                        onDragOver={e => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDragEnter={e => {
                          e.preventDefault();
                          setDragOverSk(gk);
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget)) setDragOverSk(null);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          const itemId = e.dataTransfer.getData("text/plain");
                          if (itemId && estGroupBy === "subdivision") {
                            const item = items.find(i => i.id === itemId);
                            if (item) {
                              const targetDiv = gk.split(".")[0];
                              const divName = activeCodes[targetDiv]?.name || "";
                              const oldCode = item.code || "";
                              let newCode =
                                oldCode && oldCode.includes(".")
                                  ? `${gk}.${oldCode.split(".").slice(2).join(".") || "000"}`
                                  : `${gk}.000`;
                              useItemsStore
                                .getState()
                                .batchUpdateItem(itemId, { code: newCode, division: `${targetDiv} - ${divName}` });
                              showToast(`Moved to ${gk}`);
                            }
                          }
                          setDragItemId(null);
                          setDragOverSk(null);
                        }}
                      >
                        <div
                          className="nav-item"
                          onClick={() => toggleDiv(gk)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "7px 12px",
                            flex: 1,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                              stroke={C.textMuted}
                              strokeWidth="2"
                              style={{
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                                transition: "transform 0.2s",
                              }}
                            >
                              <path d="M3 1l4 4-4 4" />
                            </svg>
                            <span
                              style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFeatureSettings: "'tnum'" }}
                            >
                              {gkLabel}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: C.textDim,
                                background: C.bg,
                                padding: "1px 6px",
                                borderRadius: 8,
                              }}
                            >
                              {skCount} items
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              color: C.textMuted,
                              fontFeatureSettings: "'tnum'",
                              fontFamily: T.font.sans,
                            }}
                          >
                            {fmt(skTotal)}
                          </span>
                        </div>
                      </div>

                      {/* Column headers */}
                      {isExpanded && (
                        <div
                          style={{
                            display: "flex",
                            borderTop: `1px solid ${C.border}`,
                            borderBottom: `1px solid ${C.border}`,
                            background: C.bg2,
                            position: "sticky",
                            top: 0,
                            zIndex: 10,
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                            padding: "6px 8px 6px 12px",
                            fontSize: T.fontSize.xs,
                            fontWeight: T.fontWeight.medium,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: T.tracking.wider,
                            gap: 4,
                          }}
                        >
                          <div style={{ width: 32 }}>#</div>
                          <div style={{ width: 82 }}>Code</div>
                          <div style={{ flex: 1, minWidth: 160 }}>Description</div>
                          <div style={{ width: 60, textAlign: "right" }}>Qty</div>
                          <div style={{ width: 42 }}>Unit</div>
                          {isPricing && (
                            <>
                              <div style={{ width: 72, textAlign: "right" }}>Matl</div>
                              <div style={{ width: 72, textAlign: "right" }}>Labor</div>
                              <div style={{ width: 72, textAlign: "right" }}>Equip</div>
                              <div style={{ width: 72, textAlign: "right" }}>Sub</div>
                            </>
                          )}
                          <div style={{ width: 90, textAlign: "right" }}>Total</div>
                        </div>
                      )}

                      {/* Item rows — supports nested sub-groups when estGroupBy2 is set */}
                      {isExpanded &&
                        (() => {
                          // Render function for a list of items.
                          // Large groups (>VIRTUAL_THRESHOLD) are initially capped to prevent
                          // DOM node explosion. User can expand to see all.
                          const renderItems = (itemList, rowOffset = 0) => {
                            const capped = itemList.length > VIRTUAL_THRESHOLD && !expandedDivs.has(`${gk}::__full__`);
                            const displayList = capped ? itemList.slice(0, VIRTUAL_THRESHOLD) : itemList;
                            const rendered = displayList.map((item, rowIdx) => {
                              const lt = getTotal(item);
                              const gi = itemIndexMap[item.id] || 0;
                              if (!itemTotalKeys.current[item.id]) itemTotalKeys.current[item.id] = { val: lt, k: 0 };
                              else if (itemTotalKeys.current[item.id].val !== lt) {
                                itemTotalKeys.current[item.id] = { val: lt, k: itemTotalKeys.current[item.id].k + 1 };
                              }
                              const focusedField = focusedCostCell?.startsWith(item.id + "-")
                                ? focusedCostCell.slice(item.id.length + 1)
                                : null;
                              return (
                                <EstimateItemRow
                                  key={item.id}
                                  item={item}
                                  rowIdx={rowIdx + rowOffset}
                                  globalIndex={gi}
                                  lineTotal={lt}
                                  animKey={itemTotalKeys.current[item.id].k}
                                  isSelected={selectedItemId === item.id}
                                  isDragging={dragItemId === item.id}
                                  isOddRow={(rowIdx + rowOffset) % 2 === 1}
                                  isPricing={isPricing}
                                  focusedField={focusedField}
                                  C={C}
                                  T={T}
                                  updateItem={updateItem}
                                  onDragStart={setDragItemId}
                                  onDragEnd={handleDragEnd}
                                  onRowClick={handleRowClick}
                                  onFocusCostCell={setFocusedCostCell}
                                  onBlurCostCell={handleBlurCostCell}
                                  subFromCode={subFromCode}
                                />
                              );
                            });

                            if (capped) {
                              rendered.push(
                                <div
                                  key="__show-all__"
                                  onClick={() => toggleDiv(`${gk}::__full__`)}
                                  className="ghost-btn"
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 6,
                                    padding: "6px 12px",
                                    fontSize: 11,
                                    color: C.accent,
                                    cursor: "pointer",
                                    borderTop: `1px solid ${C.border}20`,
                                  }}
                                >
                                  <Ic i={I.chevronDown} s={10} c={C.accent} />
                                  Show all {itemList.length} items ({itemList.length - VIRTUAL_THRESHOLD} more)
                                </div>,
                              );
                            }
                            return rendered;
                          };

                          // Nested sub-groups
                          if (group.subGroups) {
                            const sortedSubs = Object.entries(group.subGroups).sort(([a, ag], [b, bg]) =>
                              estGroupBy2 === "trade" ? (ag.sortVal || 0) - (bg.sortVal || 0) : a.localeCompare(b),
                            );
                            let runningOffset = 0;
                            return sortedSubs.map(([sk, sg]) => {
                              const subKey = `${gk}::${sk}`;
                              const subExpanded = expandedDivs.has(subKey);
                              const subTotal = sg.items.reduce((s, i) => s + getTotal(i), 0);
                              const subLabel =
                                estGroupBy2 === "subdivision"
                                  ? getSubLabel(sk)
                                  : estGroupBy2 === "division" && !sk.includes(" - ")
                                    ? divFromCode(sk) || sk
                                    : sk;
                              const offset = runningOffset;
                              runningOffset += sg.items.length;
                              return (
                                <div key={subKey}>
                                  {/* Sub-group header */}
                                  <div
                                    className="nav-item"
                                    onClick={() => toggleDiv(subKey)}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "4px 12px 4px 28px",
                                      borderTop: `1px solid ${C.border}30`,
                                      background: `${C.accent}04`,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <svg
                                        width="8"
                                        height="8"
                                        viewBox="0 0 10 10"
                                        fill="none"
                                        stroke={C.textDim}
                                        strokeWidth="2"
                                        style={{
                                          transform: subExpanded ? "rotate(90deg)" : "rotate(0)",
                                          transition: "transform 0.2s",
                                        }}
                                      >
                                        <path d="M3 1l4 4-4 4" />
                                      </svg>
                                      <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted }}>
                                        {subLabel}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 9,
                                          color: C.textDim,
                                          background: C.bg,
                                          padding: "0px 5px",
                                          borderRadius: 6,
                                        }}
                                      >
                                        {sg.items.length}
                                      </span>
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: C.textDim,
                                        fontFeatureSettings: "'tnum'",
                                        fontFamily: T.font.sans,
                                      }}
                                    >
                                      {fmt(subTotal)}
                                    </span>
                                  </div>
                                  {subExpanded && renderItems(sg.items, offset)}
                                </div>
                              );
                            });
                          }

                          // Flat rendering (no sub-groups)
                          return renderItems(skItems);
                        })()}

                      {/* Add item row */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                          <button
                            className="ghost-btn"
                            onClick={() => {
                              if (estGroupBy === "division") {
                                addElement(gk !== "Unassigned" ? gk : DIVISIONS[0], undefined, activeGroupId);
                              } else if (estGroupBy === "trade") {
                                const tradeKey = getTradeKeyFromLabel(gk);
                                const firstItem = skItems[0];
                                const div = firstItem?.division || (estDivision !== "All" ? estDivision : DIVISIONS[0]);
                                addElement(div, { trade: tradeKey }, activeGroupId);
                              } else {
                                const dc = gk.split(".")[0];
                                addElement(`${dc} - ${activeCodes[dc]?.name || ""}`, undefined, activeGroupId);
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "5px 12px",
                              background: "transparent",
                              color: C.textDim,
                              cursor: "pointer",
                              fontSize: 12,
                              border: "none",
                              width: "100%",
                            }}
                          >
                            <Ic d={I.plus} size={10} /> Add Scope Item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty state — confident & inviting */}
                {filteredItems.length === 0 && !estSearch && (
                  <EmptyState
                    icon={I.plans}
                    title="Build your estimate"
                    subtitle="Add scope items from your Database, import Assemblies, or let NOVA AI generate a complete scope for you."
                    action={() =>
                      addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId)
                    }
                    actionLabel="Add First Item"
                    actionIcon={I.plus}
                  />
                )}
                {filteredItems.length === 0 && estSearch && (
                  <EmptyState
                    icon={I.search}
                    title="No matches"
                    subtitle={`Nothing matches "${estSearch}". Try a different search or clear the filter.`}
                  />
                )}
              </div>
            </div>
          )}

          {/* Totals bar — grand total dominates */}
          {items.length > 0 && (
            <EstimateTotalsBar totals={totals} filteredItemCount={filteredItems.length} grandTotalRef={grandTotalRef} />
          )}
        </div>

        {/* Right panel removed — item details handled inline */}
      </div>

      {/* Modals + sidebars */}
      <EstimateModals
        sendToDbItem={sendToDbItem}
        setSendToDbItem={setSendToDbItem}
        bidIntelOpen={bidIntelOpen}
        setBidIntelOpen={setBidIntelOpen}
        csvImportOpen={csvImportOpen}
        setCsvImportOpen={setCsvImportOpen}
        showAssemblyPicker={showAssemblyPicker}
        setShowAssemblyPicker={setShowAssemblyPicker}
        showScopeGenerate={showScopeGenerate}
        setShowScopeGenerate={setShowScopeGenerate}
        handleInsertAssembly={handleInsertAssembly}
        handleInsertDbItem={handleInsertDbItem}
        showNova={showNova}
        setShowNova={setShowNova}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        activeEstimateId={activeEstimateId}
      />
    </div>
  );
}
