import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useBidLevelingStore } from '@/stores/bidLevelingStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useUiStore } from '@/stores/uiStore';
import { UNITS } from '@/constants/units';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt, fmt2, titleCase, formatCurrency, parseCurrency } from '@/utils/format';
import { evalFormula } from '@/utils/formula';
import { getTradeLabel, getTradeSortOrder, getTradeKeyFromLabel } from '@/constants/tradeGroupings';
import { callAnthropic } from '@/utils/ai';
import { hasAllowance, getAllowanceFields, getItemAllowanceTotal, generateAllowanceNote } from '@/utils/allowances';
import { resolveLocationFactors, METRO_AREAS } from '@/constants/locationFactors';
import { CARBON_TRADE_DEFAULTS } from '@/constants/embodiedCarbonDb';
import { formatCarbon } from '@/utils/carbonEngine';
import DatabasePickerModal from '@/components/estimate/DatabasePickerModal';
import AssemblyPickerModal from '@/components/estimate/AssemblyPickerModal';
import NotesPanel from '@/components/estimate/NotesPanel';
import AIPricingModal from '@/components/estimate/AIPricingModal';
import EmptyState from '@/components/shared/EmptyState';
import SendToDbModal from '@/components/estimate/SendToDbModal';
import BidIntelModal from '@/components/estimate/BidIntelModal';
import CsvImportModal from '@/components/import/CsvImportModal';
import CostValidationPanel from '@/components/estimate/CostValidationPanel';
import AIScopeGenerateModal from '@/components/estimate/AIScopeGenerateModal';
import { exportEstimateXlsx } from '@/utils/exportXlsx';
import EstimateKPIStrip from '@/components/estimate/EstimateKPIStrip';
import DivisionNavigator from '@/components/estimate/DivisionNavigator';
import ItemDetailPanel from '@/components/estimate/ItemDetailPanel';
import LevelingView from '@/components/estimate/LevelingView';
import GroupBar from '@/components/shared/GroupBar';

export default function EstimatePage() {
  const C = useTheme();
  const T = C.T;
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const activeCodes = getActiveCodes();
  const getDivisions = useProjectStore(s => s.getDivisions);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const DIVISIONS = getDivisions();

  const items = useItemsStore(s => s.items);
  const setItems = useItemsStore(s => s.setItems);
  const addElement = useItemsStore(s => s.addElement);
  const updateItem = useItemsStore(s => s.updateItem);
  const removeItem = useItemsStore(s => s.removeItem);
  const duplicateItem = useItemsStore(s => s.duplicateItem);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const getTotals = useItemsStore(s => s.getTotals);
  const markup = useItemsStore(s => s.markup);

  const elements = useDatabaseStore(s => s.elements);

  const subBidSubs = useBidLevelingStore(s => s.subBidSubs);
  const bidTotals = useBidLevelingStore(s => s.bidTotals);
  const bidCells = useBidLevelingStore(s => s.bidCells);
  const bidSelections = useBidLevelingStore(s => s.bidSelections);
  const linkedSubs = useBidLevelingStore(s => s.linkedSubs);
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
  const expandedDivs = useUiStore(s => s.expandedDivs);
  const toggleExpandedDiv = useUiStore(s => s.toggleExpandedDiv);
  const estViewMode = useUiStore(s => s.estViewMode);
  const setEstViewMode = useUiStore(s => s.setEstViewMode);
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const showNotesPanel = useUiStore(s => s.showNotesPanel);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const pricingModal = useUiStore(s => s.pricingModal);
  const setPricingModal = useUiStore(s => s.setPricingModal);
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
  const addMenuRef = useRef(null);
  const exportMenuRef = useRef(null);
  const grandTotalRef = useRef(null);
  const prevGrandRef = useRef(null);
  const itemTotalKeys = useRef({});

  // Normalize view mode — map old "both"/"detailed" to new modes
  const viewMode = (estViewMode === "scope" || estViewMode === "pricing" || estViewMode === "leveling") ? estViewMode : "scope";

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
      grandTotalRef.current.style.animation = 'none';
      void grandTotalRef.current.offsetWidth;
      grandTotalRef.current.style.animation = 'totalPulse 350ms ease-out';
    }
    prevGrandRef.current = totals.grand;
  }, [totals.grand]);

  // Listen for sendToDb events from detail panel
  useEffect(() => {
    const handler = (e) => setSendToDbItem(e.detail);
    window.addEventListener('openSendToDb', handler);
    return () => window.removeEventListener('openSendToDb', handler);
  }, []);

  // Assembly insert handler
  const handleInsertAssembly = useCallback((asm) => {
    const totalM = asm.elements.reduce((s, el) => s + nn(el.m) * nn(el.factor), 0);
    const totalL = asm.elements.reduce((s, el) => s + nn(el.l) * nn(el.factor), 0);
    const totalE = asm.elements.reduce((s, el) => s + nn(el.e) * nn(el.factor), 0);
    const division = divFromCode(asm.code || asm.elements[0]?.code);
    const subItems = asm.elements.map(el => ({
      id: `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      desc: titleCase(el.desc), unit: el.unit,
      m: nn(el.m), l: nn(el.l), e: nn(el.e), factor: nn(el.factor) || 1,
    }));
    addElement(division, {
      code: asm.code || asm.elements[0]?.code || "",
      name: titleCase(asm.name),
      unit: "EA",
      material: Math.round(totalM * 100) / 100,
      labor: Math.round(totalL * 100) / 100,
      equipment: Math.round(totalE * 100) / 100,
      subItems,
    }, useUiStore.getState().activeGroupId);
    showToast(`Inserted "${titleCase(asm.name)}" as scope item with ${asm.elements.length} sub-items`);
  }, [addElement, divFromCode, showToast]);

  const handleInsertDbItem = useCallback((el) => {
    const codes = useProjectStore.getState().getActiveCodes();
    const dc = el.code ? el.code.split(".")[0] : "";
    const divName = codes[dc]?.name || "";
    useItemsStore.getState().addElement(`${dc} - ${divName}`, {
      code: el.code, name: el.name, unit: el.unit,
      material: el.material, labor: el.labor, equipment: el.equipment,
    }, useUiStore.getState().activeGroupId);
    useUiStore.getState().showToast(`Added "${el.name}" to estimate`);
  }, []);

  // Stable total helper
  const getTotal = useCallback((item) => useItemsStore.getState().getItemTotal(item), []);
  const getItemComputedQty = useCallback((item) => {
    if (!item.formula || !item.formula.trim()) return nn(item.quantity);
    const varArr = (item.variables || []).filter(v => v.key).map(v => ({ name: v.key, value: nn(v.value) }));
    return evalFormula(item.formula, varArr, nn(item.quantity));
  }, []);

  // Filter items
  const filteredItems = useMemo(() => {
    let list = items.filter(i => (i.bidContext || "base") === activeGroupId);
    if (estDivision !== "All") list = list.filter(i => {
      const raw = i.division || "";
      const norm = raw.includes(" - ") ? raw : (divFromCode(raw) || raw);
      return norm === estDivision || raw === estDivision;
    });
    if (estSearch) {
      const q = estSearch.toLowerCase();
      list = list.filter(i => (i.description || "").toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q));
    }
    return list;
  }, [items, estDivision, estSearch, activeGroupId]);

  // Item index map
  const itemIndexMap = useMemo(() => {
    const map = {};
    items.forEach((item, idx) => { map[item.id] = idx + 1; });
    return map;
  }, [items]);

  // Helper: get subdivision key
  const getSubKey = (item) => {
    const code = item.code || "";
    const sk = code.includes(".") ? code.split(".").slice(0, 2).join(".") : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  // Grouping
  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach(item => {
      let key;
      if (estGroupBy === "trade") {
        key = getTradeLabel(item);
      } else if (estGroupBy === "division") {
        const rawDiv = item.division || "";
        key = rawDiv.includes(" - ") ? rawDiv : (divFromCode(rawDiv) || rawDiv || "Unassigned");
      } else {
        key = getSubKey(item);
      }
      if (!groups[key]) groups[key] = { items: [], sortVal: 0 };
      groups[key].items.push(item);
      if (estGroupBy === "trade") groups[key].sortVal = getTradeSortOrder(item);
    });
    return groups;
  }, [filteredItems, estGroupBy]);

  // Group key totals
  const groupKeyTotals = useMemo(() => {
    const t = {};
    Object.entries(groupedItems).forEach(([gk, g]) => {
      t[gk] = { count: g.items.length, total: g.items.reduce((s, i) => s + getTotal(i), 0) };
    });
    return t;
  }, [groupedItems]);

  // Pre-sort groups
  const sortedGroups = useMemo(() => {
    return Object.entries(groupedItems).sort(([a, ag], [b, bg]) =>
      estGroupBy === "trade" ? (ag.sortVal || 0) - (bg.sortVal || 0) : a.localeCompare(b)
    );
  }, [groupedItems, estGroupBy]);

  const getSubLabel = (sk) => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return `${sk} ${subName}`;
  };

  // CSV export
  const exportCSV = useCallback(() => {
    const currentItems = useItemsStore.getState().items;
    const getItemTot = useItemsStore.getState().getItemTotal;
    const proj = useProjectStore.getState().project;
    const headers = ["Code", "Description", "Division", "Qty", "Unit", "Material", "Labor", "Equipment", "Sub", "Total"];
    const rows = currentItems.map(i => [i.code, `"${(i.description || "").replace(/"/g, '""')}"`, `"${(i.division || "").replace(/"/g, '""')}"`, i.quantity, i.unit, i.material, i.labor, i.equipment, i.subcontractor, getItemTot(i).toFixed(2)]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(proj.name || "estimate").replace(/\s+/g, "_")}_export.csv`; a.click();
    URL.revokeObjectURL(url);
    useUiStore.getState().showToast("CSV exported");
  }, []);

  const toggleDiv = (sk) => toggleExpandedDiv(sk);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setAddMenuOpen(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Normalize division codes
  useEffect(() => {
    const needsFix = items.some(i => i.division && !i.division.includes(" - ") && i.division !== "Unassigned");
    if (!needsFix) return;
    const fixed = items.map(i => {
      if (!i.division || i.division.includes(" - ") || i.division === "Unassigned") return i;
      const full = divFromCode(i.division);
      return full && full !== i.division ? { ...i, division: full } : i;
    });
    if (fixed.some((f, idx) => f !== items[idx])) setItems(fixed);
  }, [items.length, items.filter(i => i.division && !i.division.includes(" - ") && i.division !== "Unassigned").length]);

  // Detail panel navigation
  const handleDetailNavigate = useCallback((direction) => {
    if (!selectedItemId) return;
    const idx = filteredItems.findIndex(i => i.id === selectedItemId);
    if (idx === -1) return;
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < filteredItems.length) {
      setSelectedItemId(filteredItems[nextIdx].id);
    }
  }, [selectedItemId, filteredItems]);

  // Flat item list for row click
  const handleRowClick = useCallback((itemId) => {
    setSelectedItemId(prev => prev === itemId ? null : itemId);
  }, []);

  // isPricing mode — shows M/L/E/S columns inline
  const isPricing = viewMode === "pricing";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", animation: "fadeIn 0.15s ease-out" }}>

      {/* Zone 1: KPI Strip */}
      <EstimateKPIStrip />

      {/* Group Bar (bid context tabs) */}
      <div style={{ padding: `0 ${T.space[5]}px`, flexShrink: 0 }}>
        <GroupBar />
      </div>

      {/* Zone 2+3: Navigator + Grid + Detail */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Division Navigator (left sidebar) */}
        <DivisionNavigator activeDivision={estDivision} onSelectDivision={setEstDivision} />

        {/* Main content (center) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Unified Toolbar — single row */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: `${T.space[3]}px ${T.space[5]}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>
            {/* Add dropdown */}
            <div ref={addMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button className="accent-btn" onClick={() => setAddMenuOpen(v => !v)}
                style={bt(C, { background: C.gradient || C.accent, color: "#fff", padding: "7px 14px", boxShadow: `0 0 12px ${C.accent}20`, whiteSpace: "nowrap" })}>
                <Ic d={I.plus} size={14} color="#fff" sw={2.5} /> Add
                <Ic d={I.chevron} size={8} color="#fff" style={{ transform: "rotate(90deg)", marginLeft: 2 }} />
              </button>
              {addMenuOpen && (
                <div style={{ position: "absolute", left: 0, top: "100%", marginTop: 4, zIndex: 200, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.md, boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)", minWidth: 200, overflow: "hidden" }}>
                  {[
                    { label: "Blank Item", icon: I.plus, action: () => addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId) },
                    { label: "From Database", icon: I.search, action: () => { addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId); setTimeout(() => setPickerForItemId(useItemsStore.getState().items[useItemsStore.getState().items.length - 1]?.id), 50); } },
                    { label: "From Assembly", icon: I.assembly, action: () => setShowAssemblyPicker(true) },
                    { label: "AI Generate", icon: I.ai, action: () => setShowScopeGenerate(true) },
                    { label: "Import CSV", icon: I.upload, action: () => setCsvImportOpen(true) },
                  ].map(opt => (
                    <button key={opt.label} className="nav-item"
                      onClick={() => { opt.action(); setAddMenuOpen(false); }}
                      style={{ width: "100%", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 500, color: C.text, fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.accent}10`}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <Ic d={opt.icon} size={14} color={C.accent} /> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div style={{ position: "relative", flex: 1, maxWidth: 220, minWidth: 120 }}>
              <input placeholder="Search items..." value={estSearch} onChange={e => setEstSearch(e.target.value)} style={inp(C, { paddingLeft: 32 })} />
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Ic d={I.search} size={14} color={C.textDim} /></div>
            </div>

            {/* View mode toggle: Scope | Pricing | Leveling */}
            <div style={{ display: "flex", background: C.bg2, borderRadius: T.radius.sm, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
              {[
                { key: "scope", label: "Scope" },
                { key: "pricing", label: "Pricing" },
                { key: "leveling", label: "Leveling" },
              ].map(v => (
                <button key={v.key} onClick={() => { setEstViewMode(v.key); setSelectedItemId(null); }}
                  style={{
                    padding: "5px 12px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                    transition: "all 0.15s",
                    background: viewMode === v.key ? C.accent : "transparent",
                    color: viewMode === v.key ? "#fff" : C.textMuted,
                    fontFamily: "'DM Sans',sans-serif",
                  }}>
                  {v.label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {/* Status badges */}
            {laborMult !== 1.0 && (
              <div style={{ padding: "4px 10px", borderRadius: 5, background: `${C.blue}18`, border: `1px solid ${C.blue}40` }}>
                <span style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>
                  {currentLaborType?.label || "Labor"} ({laborMult}x)
                </span>
              </div>
            )}
            {hasLocationAdj && (
              <div style={{ padding: "4px 10px", borderRadius: 5, background: `${C.blue}18`, border: `1px solid ${C.blue}40` }}>
                <span style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>
                  {locationInfo.label} (M:{locationInfo.mat}x L:{locationInfo.lab}x E:{locationInfo.equip}x)
                </span>
              </div>
            )}

            {/* Right-side actions */}
            <div ref={exportMenuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button className="ghost-btn" onClick={() => setExportMenuOpen(v => !v)}
                style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 10px", fontSize: 10 })}>
                <Ic d={I.download} size={13} color={C.textMuted} /> Export
                <Ic d={I.chevron} size={8} color={C.textMuted} style={{ transform: "rotate(90deg)", marginLeft: 2 }} />
              </button>
              {exportMenuOpen && (
                <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 200, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: T.radius.md, boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.25)", minWidth: 140, overflow: "hidden" }}>
                  {[
                    { label: "CSV", action: exportCSV },
                    { label: "XLSX", action: () => { exportEstimateXlsx(project, items, totals, markup); setExportMenuOpen(false); } },
                  ].map(opt => (
                    <button key={opt.label} className="nav-item"
                      onClick={() => { opt.action(); setExportMenuOpen(false); }}
                      style={{ width: "100%", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 500, color: C.text, fontFamily: "'DM Sans',sans-serif", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.accent}10`}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="ghost-btn" onClick={() => setBidIntelOpen(true)} title="AI Review"
              style={bt(C, { background: `linear-gradient(135deg, ${C.accent}12, ${C.purple || C.accent}12)`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "6px 10px", fontWeight: 600, fontSize: 10 })}>
              <Ic d={I.ai} size={12} color={C.accent} /> AI Review
            </button>
            <button className="ghost-btn" onClick={() => setShowNotesPanel(!showNotesPanel)}
              style={bt(C, { background: showNotesPanel ? `${C.blue}12` : "transparent", border: `1px solid ${showNotesPanel ? C.blue : C.border}`, color: showNotesPanel ? C.blue : C.textMuted, padding: "6px 10px", fontSize: 10 })}>
              <Ic d={I.report} size={13} color={showNotesPanel ? C.blue : C.textMuted} /> Notes{(exclusions.length + clarifications.length) > 0 ? ` (${exclusions.length + clarifications.length})` : ""}
            </button>
          </div>

          {/* Content area — grid or leveling */}
          {viewMode === "leveling" ? (
            <LevelingView />
          ) : (
            <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", minHeight: 0 }} className="blueprint-grid">
              <div style={{ padding: `${T.space[3]}px ${T.space[5]}px` }}>
                <CostValidationPanel items={items} />

                {/* Estimate Grid */}
                {sortedGroups.map(([gk, group]) => {
                  const skItems = group.items;
                  const skTotal = groupKeyTotals[gk]?.total || 0;
                  const skCount = skItems.length;
                  const isExpanded = expandedDivs.has(gk);
                  const gkLabel = estGroupBy === "subdivision" ? getSubLabel(gk) : estGroupBy === "division" && !gk.includes(" - ") ? (divFromCode(gk) || gk) : gk;

                  return (
                    <div key={gk} style={{ marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: T.radius.sm, boxShadow: T.shadow.sm, overflow: "visible" }}>
                      {/* Group Header */}
                      <div
                        style={{
                          display: "flex", background: dragOverSk === gk ? `${C.orange}15` : `linear-gradient(180deg, ${C.bg1}, ${C.bg2}40)`,
                          transition: "background 0.15s",
                        }}
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDragEnter={e => { e.preventDefault(); setDragOverSk(gk); }}
                        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverSk(null); }}
                        onDrop={e => {
                          e.preventDefault();
                          const itemId = e.dataTransfer.getData("text/plain");
                          if (itemId && estGroupBy === "subdivision") {
                            const item = items.find(i => i.id === itemId);
                            if (item) {
                              const targetDiv = gk.split(".")[0];
                              const divName = activeCodes[targetDiv]?.name || "";
                              const oldCode = item.code || "";
                              let newCode = oldCode && oldCode.includes(".") ? `${gk}.${oldCode.split(".").slice(2).join(".") || "000"}` : `${gk}.000`;
                              useItemsStore.getState().batchUpdateItem(itemId, { code: newCode, division: `${targetDiv} - ${divName}` });
                              showToast(`Moved to ${gk}`);
                            }
                          }
                          setDragItemId(null);
                          setDragOverSk(null);
                        }}
                      >
                        <div className="nav-item" onClick={() => toggleDiv(gk)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textMuted} strokeWidth="2" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M3 1l4 4-4 4" /></svg>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFeatureSettings: "'tnum'" }}>{gkLabel}</span>
                            <span style={{ fontSize: 11, color: C.textDim, background: C.bg, padding: "1px 6px", borderRadius: 8 }}>{skCount} items</span>
                          </div>
                          <span style={{ fontSize: 12, color: C.textMuted, fontFeatureSettings: "'tnum'", fontFamily: "'DM Mono',monospace" }}>{fmt(skTotal)}</span>
                        </div>
                      </div>

                      {/* Column headers */}
                      {isExpanded && (
                        <div style={{
                          display: "flex", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
                          background: C.bg2, position: "sticky", top: 0, zIndex: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          padding: "5px 8px 5px 12px", fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim,
                          textTransform: "uppercase", letterSpacing: 0.7, gap: 3,
                        }}>
                          <div style={{ width: 32 }}>#</div>
                          <div style={{ width: 82 }}>Code</div>
                          <div style={{ flex: 1, minWidth: 160 }}>Description</div>
                          <div style={{ width: 60, textAlign: "right" }}>Qty</div>
                          <div style={{ width: 42 }}>Unit</div>
                          {isPricing && <>
                            <div style={{ width: 72, textAlign: "right" }}>Matl</div>
                            <div style={{ width: 72, textAlign: "right" }}>Labor</div>
                            <div style={{ width: 72, textAlign: "right" }}>Equip</div>
                            <div style={{ width: 72, textAlign: "right" }}>Sub</div>
                          </>}
                          <div style={{ width: 90, textAlign: "right" }}>Total</div>
                        </div>
                      )}

                      {/* Item rows */}
                      {isExpanded && skItems.map((item, rowIdx) => {
                        const lt = getTotal(item);
                        const gi = itemIndexMap[item.id] || 0;
                        const isEvenRow = rowIdx % 2 === 0;
                        const isSelected = selectedItemId === item.id;

                        // Animated total key
                        if (!itemTotalKeys.current[item.id]) itemTotalKeys.current[item.id] = { val: lt, k: 0 };
                        else if (itemTotalKeys.current[item.id].val !== lt) { itemTotalKeys.current[item.id] = { val: lt, k: itemTotalKeys.current[item.id].k + 1 }; }
                        const tk = itemTotalKeys.current[item.id].k;

                        return (
                          <div key={item.id} className="est-row" data-item-id={item.id}
                            onClick={() => handleRowClick(item.id)}
                            onMouseEnter={e => { if (!dragItemId && !isSelected) e.currentTarget.style.background = `${C.accent}06`; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isEvenRow ? "transparent" : `${C.text}03`; }}
                            style={{
                              display: "flex", alignItems: "center", gap: 3,
                              padding: "5px 8px 5px 10px",
                              borderBottom: `1px solid ${C.border}`,
                              background: isSelected ? `${C.accent}12` : isEvenRow ? "transparent" : `${C.text}03`,
                              borderLeft: isSelected ? `3px solid ${C.accent}` : "3px solid transparent",
                              opacity: dragItemId === item.id ? 0.4 : 1,
                              transition: "background 0.15s",
                              cursor: "pointer",
                            }}>
                            {/* Drag handle + index */}
                            <div className="est-col" draggable
                              onDragStart={e => { e.stopPropagation(); setDragItemId(item.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); }}
                              onDragEnd={() => { setDragItemId(null); setDragOverSk(null); }}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 32, fontSize: 12, color: C.textDim, fontFeatureSettings: "'tnum'", cursor: "grab", display: "flex", alignItems: "center", gap: 2 }}
                              title="Drag to reorder">
                              <Ic d={I.move} size={9} color={C.textDim} />
                              <span>{gi}</span>
                            </div>
                            {/* Code */}
                            <div className="est-col" style={{ width: 82, fontSize: 12, fontWeight: 600, color: item.code ? C.text : C.textDim, fontFeatureSettings: "'tnum'" }}>
                              {item.code || "\u2014"}
                            </div>
                            {/* Description */}
                            <div className="est-col" style={{ flex: 1, minWidth: 160 }}>
                              <input value={item.description} onChange={e => { e.stopPropagation(); updateItem(item.id, "description", e.target.value); }}
                                onClick={e => e.stopPropagation()}
                                placeholder="Description..."
                                style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 4px", fontSize: 12 })} />
                              {hasAllowance(item) && <span style={{ fontSize: 9, color: C.orange, fontWeight: 700, marginLeft: 4 }}>ALLOW</span>}
                            </div>
                            {/* Qty */}
                            <div className="est-col" style={{ width: 60 }}>
                              <input type="number" value={item.quantity}
                                onChange={e => { e.stopPropagation(); updateItem(item.id, "quantity", e.target.value); }}
                                onClick={e => e.stopPropagation()}
                                placeholder="0"
                                style={nInp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 2px", fontSize: 12 })} />
                            </div>
                            {/* Unit */}
                            <div className="est-col" style={{ width: 42 }}>
                              <select value={item.unit}
                                onChange={e => { e.stopPropagation(); updateItem(item.id, "unit", e.target.value); }}
                                onClick={e => e.stopPropagation()}
                                style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 0", fontSize: 12 })}>
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                            {/* Pricing columns — only in pricing view */}
                            {isPricing && ["material", "labor", "equipment", "subcontractor"].map(f => {
                              const cellKey = `${item.id}-${f}`;
                              const isFocused = focusedCostCell === cellKey;
                              const rawVal = item[f];
                              const displayVal = isFocused ? rawVal : (nn(rawVal) ? formatCurrency(rawVal) : rawVal);
                              return (
                                <div className="est-col" key={f} style={{ width: 72, textAlign: "right" }}>
                                  <input type="text" inputMode="decimal" value={displayVal}
                                    onFocus={() => setFocusedCostCell(cellKey)}
                                    onBlur={() => setFocusedCostCell(null)}
                                    onChange={e => updateItem(item.id, f, e.target.value.replace(/[$,]/g, ''))}
                                    onClick={e => e.stopPropagation()}
                                    placeholder="0.00"
                                    style={nInp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 2px", fontSize: 12, textAlign: "right" })} />
                                </div>
                              );
                            })}
                            {/* Total */}
                            <div key={`${item.id}-t-${tk}`} className="est-col" style={{
                              width: 90, textAlign: "right", fontSize: 13, fontWeight: 700,
                              color: lt > 0 ? C.text : C.textDim, paddingTop: 2,
                              fontFeatureSettings: "'tnum'", fontFamily: "'DM Mono',monospace",
                              animation: tk > 0 ? 'lineFlash 400ms ease-out' : 'none',
                            }}>{fmt(lt)}</div>
                          </div>
                        );
                      })}

                      {/* Add item row */}
                      {isExpanded && (
                        <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                          <button className="ghost-btn" onClick={() => {
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
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 12, border: "none", width: "100%" }}>
                            <Ic d={I.plus} size={10} /> Add Scope Item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty state */}
                {filteredItems.length === 0 && (
                  <EmptyState
                    icon={I.plans}
                    title="No scope items yet"
                    subtitle="Add line items from the Database, Assemblies, or create them manually to start building your estimate."
                    action={() => addElement(estDivision === "All" ? DIVISIONS[0] : estDivision, undefined, activeGroupId)}
                    actionLabel="Add Line Item"
                    actionIcon={I.plus}
                  />
                )}
              </div>
            </div>
          )}

          {/* Totals bar */}
          {items.length > 0 && (
            <div style={{
              padding: "10px 20px", borderTop: `1px solid ${C.border}`,
              background: C.bg1, flexShrink: 0,
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
            }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>
                Direct: <strong style={{ color: C.text, fontFamily: "'DM Mono',monospace", fontFeatureSettings: "'tnum'" }}>{fmt(totals.direct)}</strong>
              </span>
              <span ref={grandTotalRef} style={{
                fontSize: T.fontSize.xl, fontWeight: 700, fontFeatureSettings: "'tnum'", fontFamily: "'DM Mono',monospace",
                display: "inline-block",
                ...(C.isDark && C.gradient
                  ? { background: C.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
                  : { color: C.accent }),
              }}>Grand: {fmt(totals.grand)}</span>
            </div>
          )}
        </div>

        {/* Detail Panel (right side, slides in) */}
        {selectedItemId && viewMode !== "leveling" && (
          <ItemDetailPanel
            itemId={selectedItemId}
            onClose={() => setSelectedItemId(null)}
            onNavigate={handleDetailNavigate}
          />
        )}

        {/* Notes Panel */}
        {showNotesPanel && <NotesPanel />}
      </div>

      {/* Modals */}
      <DatabasePickerModal />
      <AIPricingModal />
      {sendToDbItem && <SendToDbModal item={sendToDbItem} onClose={() => setSendToDbItem(null)} />}
      {bidIntelOpen && <BidIntelModal onClose={() => setBidIntelOpen(false)} />}
      {csvImportOpen && <CsvImportModal onClose={() => setCsvImportOpen(false)} mode="append" />}
      {showAssemblyPicker && <AssemblyPickerModal onClose={() => setShowAssemblyPicker(false)} onInsertAssembly={handleInsertAssembly} onInsertItem={handleInsertDbItem} />}
      {showScopeGenerate && <AIScopeGenerateModal onClose={() => setShowScopeGenerate(false)} />}
    </div>
  );
}
