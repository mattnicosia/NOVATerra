import { useMemo, useState } from 'react';
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
import { nn, fmt, fmt2, titleCase } from '@/utils/format';
import { evalFormula } from '@/utils/formula';
import { getTradeLabel, getTradeSortOrder, getTradeKeyFromLabel } from '@/constants/tradeGroupings';
import { callAnthropic } from '@/utils/ai';
import { hasAllowance, getAllowanceFields, getItemAllowanceTotal, generateAllowanceNote } from '@/utils/allowances';
import { resolveLocationFactors, METRO_AREAS } from '@/constants/locationFactors';
import AssemblySearch from '@/components/shared/AssemblySearch';
import DatabasePickerModal from '@/components/estimate/DatabasePickerModal';
import NotesPanel from '@/components/estimate/NotesPanel';
import SpecPanel from '@/components/estimate/SpecPanel';
import AIPricingModal from '@/components/estimate/AIPricingModal';
import SendToDbModal from '@/components/estimate/SendToDbModal';
import ComputationChain from '@/components/estimate/ComputationChain';
import BidIntelModal from '@/components/estimate/BidIntelModal';
import CsvImportModal from '@/components/import/CsvImportModal';

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
  const addSubItem = useItemsStore(s => s.addSubItem);
  const updateSubItem = useItemsStore(s => s.updateSubItem);
  const removeSubItem = useItemsStore(s => s.removeSubItem);

  const elements = useDatabaseStore(s => s.elements);

  const subBidSubs = useBidLevelingStore(s => s.subBidSubs);
  const setSubBidSubs = useBidLevelingStore(s => s.setSubBidSubs);
  const bidTotals = useBidLevelingStore(s => s.bidTotals);
  const setBidTotals = useBidLevelingStore(s => s.setBidTotals);
  const bidCells = useBidLevelingStore(s => s.bidCells);
  const setBidCells = useBidLevelingStore(s => s.setBidCells);
  const bidSelections = useBidLevelingStore(s => s.bidSelections);
  const setBidSelections = useBidLevelingStore(s => s.setBidSelections);
  const linkedSubs = useBidLevelingStore(s => s.linkedSubs);
  const subKeyLabels = useBidLevelingStore(s => s.subKeyLabels);
  const setSkLabel = useBidLevelingStore(s => s.setSkLabel);
  const showBidPanel = useBidLevelingStore(s => s.showBidPanel);
  const setShowBidPanel = useBidLevelingStore(s => s.setShowBidPanel);
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
  const estShowVars = useUiStore(s => s.estShowVars);
  const setEstShowVars = useUiStore(s => s.setEstShowVars);
  const estShowSpec = useUiStore(s => s.estShowSpec);
  const setEstShowSpec = useUiStore(s => s.setEstShowSpec);
  const estShowAllowance = useUiStore(s => s.estShowAllowance);
  const setEstShowAllowance = useUiStore(s => s.setEstShowAllowance);
  const estViewMode = useUiStore(s => s.estViewMode);
  const setEstViewMode = useUiStore(s => s.setEstViewMode);
  const showToast = useUiStore(s => s.showToast);
  const showNotesPanel = useUiStore(s => s.showNotesPanel);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const pricingModal = useUiStore(s => s.pricingModal);
  const setPricingModal = useUiStore(s => s.setPricingModal);
  const appSettings = useUiStore(s => s.appSettings);
  const setPickerForItemId = useDatabaseStore(s => s.setPickerForItemId);
  const addExclusion = useSpecsStore(s => s.addExclusion);
  const setAiExclusionLoading = useSpecsStore(s => s.setAiExclusionLoading);
  const project = useProjectStore(s => s.project);
  const [sendToDbItem, setSendToDbItem] = useState(null);
  const [bidIntelOpen, setBidIntelOpen] = useState(false);
  const [expandedSubItems, setExpandedSubItems] = useState(new Set());
  const [csvImportOpen, setCsvImportOpen] = useState(false);

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

  // Assembly search handlers — insert as single scope item with sub-items
  const handleInsertAssembly = (asm) => {
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
    });
    showToast(`Inserted "${titleCase(asm.name)}" as scope item with ${asm.elements.length} sub-items`);
  };

  const handleInsertDbItem = (el) => {
    const dc = el.code ? el.code.split(".")[0] : "";
    const divName = activeCodes[dc]?.name || "";
    addElement(`${dc} - ${divName}`, {
      code: el.code, name: el.name, unit: el.unit,
      material: el.material, labor: el.labor, equipment: el.equipment,
    });
    showToast(`Added "${el.name}" to estimate`);
  };

  // Helpers
  const getTotal = (item) => getItemTotal(item);
  const getItemComputedQty = (item) => {
    if (!item.formula || !item.formula.trim()) return nn(item.quantity);
    const varArr = (item.variables || []).filter(v => v.key).map(v => ({ name: v.key, value: nn(v.value) }));
    return evalFormula(item.formula, varArr, nn(item.quantity));
  };

  // Filter items
  const filteredItems = useMemo(() => {
    let list = items;
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
  }, [items, estDivision, estSearch]);

  // Helper: get subdivision key for an item
  const getSubKey = (item) => {
    const code = item.code || "";
    const sk = code.includes(".") ? code.split(".").slice(0, 2).join(".") : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  // Unified grouping — supports subdivision, division, and trade bundle modes
  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach(item => {
      let key;
      if (estGroupBy === "trade") {
        key = getTradeLabel(item);
      } else if (estGroupBy === "division") {
        // Normalize division — some items may have just the code (e.g. "05") instead of "05 - Metals"
        const rawDiv = item.division || "";
        key = rawDiv.includes(" - ") ? rawDiv : (divFromCode(rawDiv) || rawDiv || "Unassigned");
      } else {
        // subdivision (default)
        key = getSubKey(item);
      }
      if (!groups[key]) groups[key] = { items: [], sortVal: 0 };
      groups[key].items.push(item);
      if (estGroupBy === "trade") groups[key].sortVal = getTradeSortOrder(item);
    });
    return groups;
  }, [filteredItems, estGroupBy]);

  // Used divisions for dropdown — normalize raw division codes to "XX - Name" format
  const usedDivisions = useMemo(() => {
    const divs = new Set();
    items.forEach(i => {
      if (i.division) {
        const d = i.division.includes(" - ") ? i.division : (divFromCode(i.division) || i.division);
        divs.add(d);
      }
    });
    return [...divs].sort();
  }, [items]);

  // Division totals — normalize raw codes to "XX - Name"
  const divTotals = useMemo(() => {
    const t = {};
    items.forEach(i => {
      const raw = i.division || "Unassigned";
      const d = raw.includes(" - ") ? raw : (divFromCode(raw) || raw);
      if (!t[d]) t[d] = { count: 0, total: 0 };
      t[d].count++;
      t[d].total += getTotal(i);
    });
    return t;
  }, [items]);

  // Group key totals
  const groupKeyTotals = useMemo(() => {
    const t = {};
    Object.entries(groupedItems).forEach(([gk, g]) => {
      t[gk] = { count: g.items.length, total: g.items.reduce((s, i) => s + getTotal(i), 0) };
    });
    return t;
  }, [groupedItems]);

  // Bid leveling helpers
  const getSubSubs = (sk) => (subBidSubs[sk] || []);
  const addSubBidSub = (sk) => {
    const subs = [...(subBidSubs[sk] || []), { id: `sub_${Date.now()}`, name: "" }];
    setSubBidSubs({ ...subBidSubs, [sk]: subs });
  };
  const updateSubBidSubName = (sk, subId, name) => {
    setSubBidSubs({ ...subBidSubs, [sk]: (subBidSubs[sk] || []).map(s => s.id === subId ? { ...s, name } : s) });
  };
  const removeSubBidSub = (sk, subId) => {
    setSubBidSubs({ ...subBidSubs, [sk]: (subBidSubs[sk] || []).filter(s => s.id !== subId) });
  };

  const getCell = (itemId, subId) => bidCells[`${itemId}_${subId}`] || { status: "blank", value: "" };
  const setCell = (itemId, subId, updates) => {
    const key = `${itemId}_${subId}`;
    setBidCells({ ...bidCells, [key]: { ...getCell(itemId, subId), ...updates } });
  };

  // Compute the dollar value a cell contributes to the sub total
  const getCellComputedValue = (item, cell) => {
    const st = cell.status;
    if (st === "blank") return 0;
    if (st === "lumpsum" || st === "amount") return nn(cell.value); // "amount" = legacy compat
    if (st === "unitrate") return nn(cell.value) * nn(item.quantity);
    if (st === "included") return 0;
    if (st === "excluded") return 0;
    if (st === "carried") return getItemTotal(item);
    return 0;
  };

  const isActiveCell = (cell) => cell.status !== "blank";

  const getBidSelection = (sk) => bidSelections[sk] || { source: "", customValue: "" };
  const setBidSelection = (sk, updates) => {
    setBidSelections({ ...bidSelections, [sk]: { ...getBidSelection(sk), ...updates } });
  };

  const getSkSubTotal = (sk, subId) => {
    const skItems = (groupedItems[sk]?.items) || [];
    let cellTotal = 0;
    let hasCells = false;
    skItems.forEach(item => {
      const cell = getCell(item.id, subId);
      if (isActiveCell(cell)) {
        cellTotal += getCellComputedValue(item, cell);
        hasCells = true;
      }
    });
    // If per-item cells are filled, use their sum; otherwise fall back to proposal total
    if (hasCells) return cellTotal;
    return nn(bidTotals[subId]);
  };

  const getSelectedBidValue = (sk) => {
    const sel = getBidSelection(sk);
    if (!sel.source) return 0;
    if (sel.source === "internal") return groupKeyTotals[sk]?.total || 0;
    if (sel.source === "custom") return nn(sel.customValue);
    if (sel.source.startsWith("linked_")) {
      const ls = linkedSubs.find(l => `linked_${l.id}` === sel.source);
      return ls ? nn(ls.totalBid) : 0;
    }
    return getSkSubTotal(sk, sel.source);
  };

  const totalBidValue = useMemo(() => {
    return Object.keys(groupedItems).reduce((sum, sk) => sum + getSelectedBidValue(sk), 0);
  }, [groupedItems, bidSelections, bidCells, bidTotals, subBidSubs, groupKeyTotals, linkedSubs]);

  const getLinkedSubsForSk = (sk) => linkedSubs.filter(ls => (ls.subKeys || []).includes(sk));

  const getSubLabel = (sk) => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return `${sk} ${subName}`;
  };

  // Exclude item → create exclusion + optional AI text
  const excludeItem = (item) => {
    const excText = item.directive ? `${item.directive} of ${item.description}` : (item.description || "");
    addExclusion({ text: excText, aiText: "", code: item.code, division: item.division, description: item.description, source: "estimate" });
    removeItem(item.id);
    showToast("Item excluded");
    if (appSettings.apiKey) {
      setAiExclusionLoading(true);
      callAnthropic({
        apiKey: appSettings.apiKey, max_tokens: 100,
        messages: [{ role: "user", content: `Write a professional construction exclusion clause (one concise sentence, under 15 words) for: ${item.description}${item.code ? ` (${item.code})` : ""}` }],
      }).then(text => {
        const exs = useSpecsStore.getState().exclusions;
        const last = exs[exs.length - 1];
        if (last) useSpecsStore.getState().setExclusions(exs.map(x => x.id === last.id ? { ...x, aiText: text } : x));
      }).catch(() => {}).finally(() => setAiExclusionLoading(false));
    }
  };

  // CSV export
  const exportCSV = () => {
    const headers = ["Code", "Description", "Division", "Qty", "Unit", "Material", "Labor", "Equipment", "Sub", "Total"];
    const rows = items.map(i => [i.code, `"${(i.description || "").replace(/"/g, '""')}"`, `"${(i.division || "").replace(/"/g, '""')}"`, i.quantity, i.unit, i.material, i.labor, i.equipment, i.subcontractor, getTotal(i).toFixed(2)]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(project.name || "estimate").replace(/\s+/g, "_")}_export.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  };

  // Allowance toggle
  const toggleAllowance = (itemId, field) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    let ao = item.allowanceOf;
    if (typeof ao === "string" || !ao) {
      ao = { material: false, labor: false, equipment: false, subcontractor: false };
      if (typeof item.allowanceOf === "string" && item.allowanceOf) ao[item.allowanceOf] = true;
    } else {
      ao = { ...ao };
    }
    ao[field] = !ao[field];
    const anyActive = ao.material || ao.labor || ao.equipment || ao.subcontractor;
    updateItem(itemId, "allowanceOf", anyActive ? ao : "");
  };

  const toggleDiv = (sk) => toggleExpandedDiv(sk);

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }} className="blueprint-grid">
      {/* Toolbar — Row 1: Search, filters, toggles, add */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 220, minWidth: 120 }}>
          <input placeholder="Search items..." value={estSearch} onChange={e => setEstSearch(e.target.value)} style={inp(C, { paddingLeft: 32 })} />
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><Ic d={I.search} size={14} color={C.textDim} /></div>
        </div>
        <select value={estDivision} onChange={e => setEstDivision(e.target.value)} style={inp(C, { maxWidth: 220 })}>
          <option value="All">All Divisions ({items.length})</option>
          {usedDivisions.map(d => <option key={d} value={d}>{d} ({divTotals[d]?.count || 0})</option>)}
        </select>
        <div style={{ display: "flex", background: C.bg2, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[{ key: "subdivision", label: "Subdiv" }, { key: "division", label: "Division" }, { key: "trade", label: "Trade" }].map(g => (
            <button key={g.key} onClick={() => setEstGroupBy(g.key)}
              style={{ padding: "5px 8px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s", background: estGroupBy === g.key ? C.accent : "transparent", color: estGroupBy === g.key ? "#fff" : C.textMuted }}>
              {g.label}
            </button>
          ))}
          <div style={{ width: 1, background: C.border, margin: "4px 0", flexShrink: 0 }} />
          {[{ key: "scope", label: "Scope" }, { key: "detailed", label: "Detail" }, { key: "both", label: "Both" }].map(v => (
            <button key={v.key} onClick={() => { setEstViewMode(v.key); setExpandedSubItems(new Set()); }}
              style={{ padding: "5px 8px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s", background: estViewMode === v.key ? (C.purple || C.accent) : "transparent", color: estViewMode === v.key ? "#fff" : C.textMuted }}>
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ maxWidth: 240, minWidth: 140, flex: 1 }}>
          <AssemblySearch
            onInsertAssembly={handleInsertAssembly}
            onInsertItem={handleInsertDbItem}
            placeholder="Add from database..."
          />
        </div>
        <div style={{ flex: 1 }} />
        <button className="accent-btn" onClick={() => addElement(estDivision === "All" ? DIVISIONS[0] : estDivision)}
          style={bt(C, { background: C.gradient || C.accent, color: "#fff", padding: "7px 16px", boxShadow: `0 0 12px ${C.accent}20`, flexShrink: 0, whiteSpace: "nowrap" })}>
          <Ic d={I.plus} size={14} color="#fff" sw={2.5} /> Add Scope Item
        </button>
      </div>
      {/* Toolbar — Row 2: Status badges + action buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
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
        {totalBidValue > 0 && (
          <div style={{ padding: "4px 10px", borderRadius: 5, background: `${C.accent}18`, border: `1px solid ${C.accent}40` }}>
            <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>BID TOTAL </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFeatureSettings: "'tnum'" }}>{fmt(totalBidValue)}</span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="ghost-btn" onClick={() => setBidIntelOpen(true)} title="Bid Day Intelligence — AI cost analysis"
          style={bt(C, { background: `linear-gradient(135deg, ${C.accent}12, ${C.purple || C.accent}12)`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "6px 10px", fontWeight: 600, fontSize: 10 })}>
          <Ic d={I.ai} size={12} color={C.accent} /> Bid Intel
        </button>
        <button className="ghost-btn" onClick={exportCSV} title="Export CSV"
          style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 8px" })}>
          <Ic d={I.download} size={13} color={C.textMuted} />
        </button>
        <button className="ghost-btn" onClick={() => setCsvImportOpen(true)} title="Import CSV"
          style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 8px" })}>
          <Ic d={I.upload} size={13} color={C.textMuted} />
        </button>
        <button className="ghost-btn" onClick={() => setShowBidPanel(!showBidPanel)}
          style={bt(C, { background: showBidPanel ? C.accentBg : "transparent", border: `1px solid ${showBidPanel ? C.accent : C.border}`, color: showBidPanel ? C.accent : C.textMuted, padding: "6px 10px", fontSize: 10 })}>
          <Ic d={I.bid} size={13} color={showBidPanel ? C.accent : C.textMuted} /> Bid Leveling
        </button>
        <button className="ghost-btn" onClick={() => setShowNotesPanel(!showNotesPanel)}
          style={bt(C, { background: showNotesPanel ? `${C.blue}12` : "transparent", border: `1px solid ${showNotesPanel ? C.blue : C.border}`, color: showNotesPanel ? C.blue : C.textMuted, padding: "6px 10px", fontSize: 10 })}>
          <Ic d={I.report} size={13} color={showNotesPanel ? C.blue : C.textMuted} /> Notes{(exclusions.length + clarifications.length) > 0 ? ` (${exclusions.length + clarifications.length})` : ""}
        </button>
      </div>

      {/* Estimate Grid - grouped by selected mode */}
      {Object.entries(groupedItems).sort(([a, ag], [b, bg]) =>
        estGroupBy === "trade" ? (ag.sortVal || 0) - (bg.sortVal || 0) : a.localeCompare(b)
      ).map(([gk, group]) => {
        const skItems = group.items;
        const subs = getSubSubs(gk);
        const hasSubs = showBidPanel && subs.length > 0;
        const customLabel = subKeyLabels[gk];
        const gkLabel = estGroupBy === "subdivision" ? getSubLabel(gk) : gk;
        const skLinked = getLinkedSubsForSk(gk);
        const skTotal = groupKeyTotals[gk]?.total || 0;
        const skCount = skItems.length;
        const isExpanded = expandedDivs.has(gk);
        const sel = getBidSelection(gk);
        const selVal = getSelectedBidValue(gk);

        return (
          <div key={gk} style={{ marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: T.radius.sm, boxShadow: T.shadow.sm, overflow: "visible" }}>
            {/* Group Header */}
            <div style={{ display: "flex", minWidth: "fit-content", background: dragOverSk === gk ? `${C.orange}15` : C.bg1, transition: "background 0.15s" }}
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
                    setItems(items.map(i => i.id === itemId ? { ...i, code: newCode, division: `${targetDiv} - ${divName}` } : i));
                    showToast(`Moved to ${gk}`);
                  }
                }
                setDragItemId(null);
                setDragOverSk(null);
              }}>
              <div className="nav-item" onClick={() => toggleDiv(gk)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", flex: "0 0 auto", minWidth: 960 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textMuted} strokeWidth="2" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M3 1l4 4-4 4" /></svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFeatureSettings: "'tnum'" }}>{gk}</span>
                  {estGroupBy === "subdivision" && <input value={customLabel || ""} onChange={e => { e.stopPropagation(); setSkLabel(gk, e.target.value); }} onClick={e => e.stopPropagation()}
                    placeholder={gkLabel.replace(gk, "").trim() || "Name this subdivision..."}
                    style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 6px", fontSize: 12, fontWeight: 600, color: customLabel ? C.accent : C.text, width: 200, fontStyle: customLabel ? "italic" : "normal" })} />}
                  <span style={{ fontSize: 11, color: C.textDim, background: C.bg, padding: "1px 6px", borderRadius: 8 }}>{skCount} items</span>
                  {skLinked.length > 0 && <span style={{ fontSize: 10, color: C.orange, background: `${C.orange}18`, padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>LINKED</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>Internal: {fmt(skTotal)}</span>
                  {sel.source && <span style={{ fontSize: 13, fontWeight: 700, color: C.green, background: `${C.green}18`, padding: "3px 10px", borderRadius: 4, boxShadow: `0 0 6px ${C.green}15`, fontFeatureSettings: "'tnum'" }}>Bid: {fmt(selVal)}</span>}
                </div>
              </div>

              {/* Sub bid columns */}
              {showBidPanel && subs.length > 0 && (
                <div style={{ display: "flex", borderLeft: `2px solid ${C.accent}`, flexShrink: 0, alignItems: "stretch" }} onClick={e => e.stopPropagation()}>
                  {subs.map(sub => (
                    <div key={sub.id} style={{ width: 180, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
                      <div style={{ padding: "4px 6px", display: "flex", alignItems: "center", gap: 3 }}>
                        <input value={sub.name} onChange={e => updateSubBidSubName(gk, sub.id, e.target.value)} placeholder="Sub Name..."
                          style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 4px", fontSize: 12, fontWeight: 700, textAlign: "center", color: C.text, flex: 1 })} />
                        <button className="icon-btn" onClick={() => removeSubBidSub(gk, sub.id)}
                          style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.red, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Ic d={I.x} size={9} />
                        </button>
                      </div>
                      <div style={{ padding: "3px 6px 4px", borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.textDim, textAlign: "center", marginBottom: 2, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Proposal Total</div>
                        <input type="number" value={bidTotals[sub.id] || ""} onChange={e => setBidTotals({ ...bidTotals, [sub.id]: e.target.value })} placeholder="$0.00"
                          style={nInp(C, { background: C.bg, padding: "4px 6px", fontSize: 13, fontWeight: 600, textAlign: "center", width: "100%", fontFeatureSettings: "'tnum'" })} />
                      </div>
                    </div>
                  ))}
                  <div style={{ width: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <button className="icon-btn" onClick={() => addSubBidSub(gk)} title="Add Sub"
                      style={{ width: 22, height: 22, border: `1px dashed ${C.border}`, background: "transparent", color: C.accent, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ic d={I.plus} size={11} />
                    </button>
                  </div>
                </div>
              )}
              {showBidPanel && subs.length === 0 && (
                <div style={{ borderLeft: `2px solid ${C.accent}`, display: "flex", alignItems: "center", padding: "0 10px" }} onClick={e => e.stopPropagation()}>
                  <button className="ghost-btn" onClick={() => addSubBidSub(gk)} style={bt(C, { background: "transparent", border: `1px dashed ${C.border}`, color: C.accent, padding: "4px 10px", fontSize: 11 })}>
                    <Ic d={I.plus} size={10} color={C.accent} /> Add Sub
                  </button>
                </div>
              )}
            </div>

            {/* Column headers */}
            {isExpanded && (
              <div style={{ display: "flex", minWidth: "fit-content", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.bg2, position: "sticky", top: 0, zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 8px 5px 12px", fontSize: T.fontSize.xs, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, minWidth: 1016, flexShrink: 0 }}>
                  <div className="est-col" style={{ width: 32 }}>#</div><div className="est-col" style={{ width: 82 }}>Code</div><div className="est-col" style={{ width: 42, textAlign: "center" }}>Dir</div><div className="est-col" style={{ width: 160 }}>Scope Item</div><div className="est-col" style={{ width: 52, textAlign: "right" }}>Qty</div><div className="est-col" style={{ width: 38 }}>Unit</div><div className="est-col" style={{ width: 65, textAlign: "right" }}>Matl</div><div className="est-col" style={{ width: 65, textAlign: "right" }}>Labor</div><div className="est-col" style={{ width: 65, textAlign: "right" }}>Equip</div><div className="est-col" style={{ width: 65, textAlign: "right" }}>Sub</div><div className="est-col" style={{ width: 82, textAlign: "right" }}>Total</div><div style={{ width: 210 }}></div>
                </div>
                {showBidPanel && subs.length > 0 && (
                  <div style={{ display: "flex", borderLeft: `2px solid ${C.accent}`, flexShrink: 0 }}>
                    {subs.map(sub => (
                      <div key={sub.id} style={{ width: 180, textAlign: "center", padding: "6px 6px", fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.6, borderRight: `1px solid ${C.border}` }}>
                        {sub.name || "Sub"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scope item rows */}
            {isExpanded && skItems.map((item, rowIdx) => {
              const lt = getTotal(item);
              const gi = items.findIndex(i => i.id === item.id) + 1;
              const sItemList = item.subItems || [];
              const hasSubItems = sItemList.length > 0;
              const autoExpand = estViewMode === "detailed" || estViewMode === "both";
              const manualToggled = expandedSubItems.has(item.id);
              const subItemsExpanded = hasSubItems && (autoExpand ? !manualToggled : manualToggled);
              const subItemTotal = sItemList.reduce((s, si) => s + (nn(si.m) + nn(si.l) + nn(si.e)) * nn(si.factor || 1), 0);
              const scopeUnitTotal = nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor);
              const isEvenRow = rowIdx % 2 === 0;
              return (
                <div key={item.id}>
                <div className="est-row"
                  style={{ display: "flex", alignItems: "center", minWidth: "fit-content", borderBottom: `1px solid ${C.border}`, background: isEvenRow ? "transparent" : `${C.text}06`, opacity: dragItemId === item.id ? 0.4 : 1, transition: "background 0.1s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 8px 5px 10px", minWidth: 1016, flexShrink: 0 }}>
                    <div className="est-col" draggable
                      onDragStart={e => { setDragItemId(item.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); }}
                      onDragEnd={() => { setDragItemId(null); setDragOverSk(null); }}
                      style={{ width: 32, fontSize: 12, color: C.textDim, fontFeatureSettings: "'tnum'", cursor: "grab", display: "flex", alignItems: "center", gap: 2 }}
                      title="Drag to reorder">
                      <Ic d={I.move} size={9} color={C.textDim} />
                      <span>{gi}</span>
                    </div>
                    <div className="est-col" onClick={() => setPickerForItemId(item.id)} title="Pick from database"
                      style={{ width: 82, padding: "3px 3px", fontSize: 12, fontWeight: 600, color: item.code ? C.text : C.textDim, background: item.code ? "transparent" : C.bg2, borderRadius: 3, cursor: "pointer", fontFeatureSettings: "'tnum'" }}>
                      {item.code || "Pick..."}
                    </div>
                    <div className="est-col" style={{ width: 42 }}>
                      <select value={item.directive || ""} onChange={e => updateItem(item.id, "directive", e.target.value)}
                        title={item.directiveOverride ? "Manual override" : "Auto-calculated"}
                        style={{ fontSize: 12, fontWeight: 600, fontFeatureSettings: "'tnum'", color: item.directive ? C.text : C.textDim, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", appearance: "none", WebkitAppearance: "none", width: "100%", textAlign: "center", textDecoration: item.directiveOverride ? "underline" : "none", fontFamily: "inherit" }}>
                        <option value="">—</option>
                        <option value="F/I">F/I</option>
                        <option value="F/O">F/O</option>
                        <option value="I/O">I/O</option>
                      </select>
                    </div>
                    <div className="est-col" style={{ width: 160 }}>
                      <input value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)} placeholder="Description..."
                        style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 4px", fontSize: 12 })} />
                      {item.specText && <div style={{ fontSize: 9, color: C.purple, padding: "0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 155 }}>{item.specText}</div>}
                      {hasAllowance(item) && <div onClick={() => setEstShowAllowance(estShowAllowance === item.id ? null : item.id)} style={{ fontSize: 9, color: C.orange, fontWeight: 700, padding: "0 4px", cursor: "pointer" }}>⚑ ALLOWANCE ({getAllowanceFields(item).join(", ")})</div>}
                    </div>
                    <div className="est-col" style={{ width: 52 }}>
                      <input type="number" value={item.quantity} onChange={e => updateItem(item.id, "quantity", e.target.value)} placeholder="0"
                        style={nInp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 2px", fontSize: 12, fontFamily: "'DM Sans',sans-serif" })} />
                      {item.formula && item.formula.trim() && <div style={{ fontSize: 9, color: C.accent, paddingLeft: 2 }}>={Math.round(getItemComputedQty(item) * 100) / 100}</div>}
                    </div>
                    <div className="est-col" style={{ width: 38 }}>
                      <select value={item.unit} onChange={e => updateItem(item.id, "unit", e.target.value)}
                        style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 0", fontSize: 12 })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    {["material", "labor", "equipment", "subcontractor"].map(f => {
                      const ao = item.allowanceOf;
                      const isAllowance = ao && (typeof ao === "string" ? ao === f : ao[f]);
                      return (
                        <div className="est-col" key={f} style={{ width: 65, textAlign: "center" }}>
                          <input type="number" value={item[f]} onChange={e => updateItem(item.id, f, e.target.value)} placeholder="0.00"
                            style={nInp(C, { background: isAllowance ? `${C.orange}12` : "transparent", border: isAllowance ? `1px solid ${C.orange}30` : "1px solid transparent", padding: "3px 2px", fontSize: 12, fontFamily: "'DM Sans',sans-serif", textAlign: "right" })} />
                          <button onClick={() => toggleAllowance(item.id, f)} title={`${isAllowance ? "Remove" : "Flag"} ${f} allowance`}
                            style={{ display: "block", margin: "3px 2px 0 auto", width: 18, height: 15, borderRadius: 3, cursor: "pointer", fontSize: 9, fontWeight: 800, lineHeight: "14px", textAlign: "center", padding: 0,
                              background: isAllowance ? `linear-gradient(180deg, ${C.orange}, ${C.orange}CC)` : `linear-gradient(180deg, ${C.text}10, ${C.text}06)`,
                              color: isAllowance ? "#fff" : C.orange,
                              border: isAllowance ? `1px solid ${C.orange}` : `1px solid ${C.text}12`,
                              boxShadow: isAllowance ? `0 2px 4px ${C.orange}40, inset 0 1px 0 rgba(255,255,255,0.25)` : `0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
                              textShadow: isAllowance ? "0 1px 1px rgba(0,0,0,0.3)" : "none",
                            }}>A</button>
                        </div>
                      );
                    })}
                    <div className="est-col" style={{ width: 82, textAlign: "right", fontSize: 12, fontWeight: 600, color: lt > 0 ? C.text : C.textDim, paddingTop: 2, fontFeatureSettings: "'tnum'" }}>{fmt(lt)}</div>
                    <div style={{ width: 210, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", padding: "0 6px" }}>
                      {/* Sub-items toggle */}
                      <button className="icon-btn" title={`Sub-items (${sItemList.length})`}
                        onClick={() => setExpandedSubItems(prev => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}
                        style={{ width: 28, height: 28, border: `1px solid ${hasSubItems ? C.accent + "40" : C.border}`, background: subItemsExpanded ? C.accentBg : hasSubItems ? `${C.accent}08` : "transparent", color: hasSubItems ? C.accent : C.textMuted, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: 0.3, position: "relative" }}>
                        <Ic d={I.assembly} size={13} color={hasSubItems ? C.accent : C.textMuted} />
                        {hasSubItems && <span style={{ position: "absolute", top: -4, right: -4, fontSize: 7, fontWeight: 700, background: C.accent, color: "#fff", borderRadius: 6, padding: "0 3px", minWidth: 12, textAlign: "center", lineHeight: "14px" }}>{sItemList.length}</span>}
                      </button>
                      {hasLocationAdj && (
                        <button className="icon-btn" title={item.locationLocked ? "Location adjustment OFF (raw costs)" : "Location adjustment ON — click to lock"}
                          onClick={() => updateItem(item.id, "locationLocked", !item.locationLocked)}
                          style={{ width: 28, height: 28, border: `1px solid ${item.locationLocked ? C.orange + "40" : C.green + "40"}`, background: item.locationLocked ? `${C.orange}18` : `${C.green}12`, color: item.locationLocked ? C.orange : C.green, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>
                          {item.locationLocked ? "LC" : "LC"}
                        </button>
                      )}
                      <button className="icon-btn" title="Specification" onClick={() => setEstShowSpec(estShowSpec === item.id ? null : item.id)}
                        style={{ width: 28, height: 28, border: `1px solid ${(item.specSection || item.specText) ? C.purple + "40" : C.border}`, background: (item.specSection || item.specText) ? `${C.purple}18` : "transparent", color: (item.specSection || item.specText) ? C.purple : C.textMuted, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>SP</button>
                      <button className="icon-btn" title="Computation Chain" onClick={() => setEstShowVars(estShowVars === item.id ? null : item.id)}
                        style={{ width: 28, height: 28, border: `1px solid ${(item.variables?.length || item.formula) ? (C.cyan || C.accent) + "40" : C.border}`, background: (item.variables?.length || item.formula) ? `${C.cyan || C.accent}18` : "transparent", color: (item.variables?.length || item.formula) ? (C.cyan || C.accent) : C.textMuted, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Ic d={I.layers} size={13} />
                      </button>
                      <button className="icon-btn" title="AI Pricing" onClick={() => setPricingModal(item)}
                        style={{ width: 28, height: 28, border: `1px solid ${C.border}`, background: "transparent", color: C.cyan || C.accent, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>AI</button>
                      <button className="icon-btn" title="Send to Database" onClick={() => setSendToDbItem(item)}
                        style={{ width: 28, height: 28, border: `1px solid ${C.border}`, background: "transparent", color: C.green, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Ic d={I.send} size={13} />
                      </button>
                      <button className="icon-btn" title="Exclude" onClick={() => excludeItem(item)}
                        style={{ width: 28, height: 28, border: `1px solid ${C.border}`, background: "transparent", color: C.orange, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: 0.3 }}>
                        Exc
                      </button>
                      <button className="icon-btn" title="Duplicate" onClick={() => duplicateItem(item.id)}
                        style={{ width: 28, height: 28, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Ic d={I.copy} size={13} />
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => removeItem(item.id)}
                        style={{ width: 28, height: 28, border: `1px solid ${C.border}`, background: "transparent", color: C.red, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Ic d={I.trash} size={13} />
                      </button>
                    </div>
                  </div>
                  {/* Per-item bid cells */}
                  {showBidPanel && subs.length > 0 && (
                    <div style={{ display: "flex", borderLeft: `2px solid ${C.accent}`, flexShrink: 0, alignItems: "stretch" }}>
                      {subs.map(sub => {
                        const cell = getCell(item.id, sub.id);
                        const typeColors = { blank: C.textDim, lumpsum: C.orange, unitrate: C.blue, included: C.green, excluded: C.red, carried: "#a855f7", amount: C.orange };
                        const tc = typeColors[cell.status] || C.textDim;
                        const computedVal = getCellComputedValue(item, cell);
                        return (
                          <div key={sub.id} style={{ width: 180, borderRight: `1px solid ${C.border}`, padding: "4px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                            <select value={cell.status === "amount" ? "lumpsum" : cell.status}
                              onChange={e => setCell(item.id, sub.id, { status: e.target.value, value: (e.target.value === "blank" || e.target.value === "included" || e.target.value === "excluded" || e.target.value === "carried") ? "" : cell.value })}
                              style={inp(C, { width: "100%", padding: "4px 6px", fontSize: 12, fontWeight: 600, border: `1px solid ${tc}30`, background: `${tc}10`, color: tc, cursor: "pointer", borderRadius: 4 })}>
                              <option value="blank">— Not Set —</option>
                              <option value="lumpsum">Lump Sum</option>
                              <option value="unitrate">Unit Rate</option>
                              <option value="included">Included</option>
                              <option value="excluded">Excluded</option>
                              <option value="carried">Use Internal</option>
                            </select>
                            {(cell.status === "lumpsum" || cell.status === "amount") && (
                              <input type="number" value={cell.value} onChange={e => setCell(item.id, sub.id, { value: e.target.value })} placeholder="$0.00"
                                style={nInp(C, { width: "100%", background: `${tc}06`, border: `1px solid ${tc}25`, padding: "4px 6px", fontSize: 13, fontWeight: 600, color: tc, textAlign: "right", borderRadius: 4, fontFeatureSettings: "'tnum'" })} />
                            )}
                            {cell.status === "unitrate" && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <input type="number" value={cell.value} onChange={e => setCell(item.id, sub.id, { value: e.target.value })} placeholder="$/unit"
                                  style={nInp(C, { width: "100%", background: `${tc}06`, border: `1px solid ${tc}25`, padding: "4px 6px", fontSize: 13, fontWeight: 600, color: tc, textAlign: "right", borderRadius: 4, fontFeatureSettings: "'tnum'" })} />
                                <div style={{ fontSize: 12, color: C.textMuted, textAlign: "right", fontFeatureSettings: "'tnum'" }}>
                                  <span style={{ color: C.textDim }}>× {nn(item.quantity)}</span> = <span style={{ fontWeight: 600, color: tc }}>{fmt(computedVal)}</span>
                                </div>
                              </div>
                            )}
                            {cell.status === "included" && (
                              <div style={{ padding: "4px 0", fontSize: 12, fontWeight: 600, color: C.green, textAlign: "center", background: `${C.green}08`, borderRadius: 4 }}>Included</div>
                            )}
                            {cell.status === "excluded" && (
                              <div style={{ padding: "4px 0", fontSize: 12, fontWeight: 700, color: C.red, textAlign: "center", background: `${C.red}08`, borderRadius: 4 }}>Excluded</div>
                            )}
                            {cell.status === "carried" && (
                              <div style={{ padding: "4px 6px", fontSize: 13, fontWeight: 600, color: "#a855f7", textAlign: "right", fontFeatureSettings: "'tnum'", background: "#a855f708", borderRadius: 4 }}>{fmt(computedVal)}</div>
                            )}
                            {cell.status === "blank" && (
                              <div style={{ padding: "4px 0", fontSize: 12, color: C.textDim, textAlign: "center", opacity: 0.35 }}>—</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sub-items panel — cost breakdown below scope item */}
                {subItemsExpanded && (
                  <div style={{ padding: "8px 12px 8px 48px", background: C.bg2, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, animation: "fadeIn 0.15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8 }}>
                          Sub-Items — Cost Breakdown
                        </span>
                        {hasSubItems && (
                          <span style={{ fontSize: 10, color: subItemTotal > 0 && Math.abs(subItemTotal - scopeUnitTotal) > 0.01 ? C.orange : C.green, fontWeight: 600, fontFeatureSettings: "'tnum'" }}>
                            Sub: {fmt2(subItemTotal)} vs Scope: {fmt2(scopeUnitTotal)}
                            {Math.abs(subItemTotal - scopeUnitTotal) > 0.01 && (
                              <span style={{ marginLeft: 4, fontSize: 9, color: C.orange }}>
                                ({subItemTotal > scopeUnitTotal ? "+" : ""}{fmt2(subItemTotal - scopeUnitTotal)})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setExpandedSubItems(prev => { const next = new Set(prev); next.delete(item.id); return next; })}
                        style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        <Ic d={I.x} size={9} />
                      </button>
                    </div>

                    {/* Sub-item column headers */}
                    {hasSubItems && (
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 40px 65px 65px 65px 45px 70px 24px", gap: 4, marginBottom: 2, fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, padding: "0 2px" }}>
                        <span>Description</span><span>Unit</span>
                        <span style={{ textAlign: "right" }}>Matl</span>
                        <span style={{ textAlign: "right" }}>Labor</span>
                        <span style={{ textAlign: "right" }}>Equip</span>
                        <span style={{ textAlign: "center" }}>Factor</span>
                        <span style={{ textAlign: "right" }}>Total</span>
                        <span></span>
                      </div>
                    )}

                    {/* Sub-item rows */}
                    {sItemList.map(si => {
                      const siTotal = (nn(si.m) + nn(si.l) + nn(si.e)) * nn(si.factor || 1);
                      return (
                        <div key={si.id} style={{ display: "grid", gridTemplateColumns: "2fr 40px 65px 65px 65px 45px 70px 24px", gap: 4, padding: "3px 2px", borderBottom: `1px solid ${C.bg}`, alignItems: "center" }}>
                          <input value={si.desc} onChange={e => updateSubItem(item.id, si.id, "desc", e.target.value)} placeholder="Item description..."
                            style={inp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 4px", fontSize: 11 })} />
                          <input value={si.unit} onChange={e => updateSubItem(item.id, si.id, "unit", e.target.value)}
                            style={inp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 2px", fontSize: 10, textAlign: "center" })} />
                          <input type="number" value={si.m} onChange={e => updateSubItem(item.id, si.id, "m", parseFloat(e.target.value) || 0)} placeholder="0.00"
                            style={nInp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 2px", fontSize: 11, color: C.green })} />
                          <input type="number" value={si.l} onChange={e => updateSubItem(item.id, si.id, "l", parseFloat(e.target.value) || 0)} placeholder="0.00"
                            style={nInp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 2px", fontSize: 11, color: C.blue })} />
                          <input type="number" value={si.e} onChange={e => updateSubItem(item.id, si.id, "e", parseFloat(e.target.value) || 0)} placeholder="0.00"
                            style={nInp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 2px", fontSize: 11, color: C.orange })} />
                          <input type="number" value={si.factor || 1} onChange={e => updateSubItem(item.id, si.id, "factor", parseFloat(e.target.value) || 1)} placeholder="1"
                            style={nInp(C, { background: "transparent", border: `1px solid transparent`, padding: "2px 2px", fontSize: 10, textAlign: "center" })} />
                          <div style={{ textAlign: "right", fontSize: 11, fontWeight: 600, color: siTotal > 0 ? C.text : C.textDim, fontFeatureSettings: "'tnum'" }}>{fmt2(siTotal)}</div>
                          <button onClick={() => removeSubItem(item.id, si.id)} title="Remove sub-item"
                            style={{ width: 18, height: 18, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5 }}>
                            <Ic d={I.x} size={9} color={C.red} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Add sub-item button */}
                    <button onClick={() => addSubItem(item.id)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", marginTop: 4, background: "transparent", color: C.accent, cursor: "pointer", fontSize: 10, fontWeight: 600, border: `1px dashed ${C.accent}40`, borderRadius: 4 }}>
                      <Ic d={I.plus} size={10} color={C.accent} sw={2.5} /> Add Sub-Item
                    </button>
                  </div>
                )}
                </div>
              );
            })}

            {/* Computation Chain */}
            {isExpanded && estShowVars && skItems.find(i => i.id === estShowVars) && (
              <ComputationChain item={skItems.find(i => i.id === estShowVars)} />
            )}

            {/* Specification panel */}
            {isExpanded && estShowSpec && skItems.find(i => i.id === estShowSpec) && (
              <SpecPanel item={skItems.find(i => i.id === estShowSpec)} />
            )}

            {/* Allowance detail panel */}
            {isExpanded && estShowAllowance && (() => {
              const item = skItems.find(i => i.id === estShowAllowance);
              if (!item || !hasAllowance(item)) return null;
              const fields = getAllowanceFields(item);
              const total = getItemAllowanceTotal(item);
              return (
                <div style={{ padding: "8px 12px 8px 60px", background: C.bg2, borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`, animation: "fadeIn 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, textTransform: "uppercase", letterSpacing: 0.8 }}>Allowance — {item.description.substring(0, 40)}</div>
                    <button className="icon-btn" onClick={() => setEstShowAllowance(null)} style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ic d={I.x} size={9} /></button>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 6, fontSize: 12 }}>
                    {fields.map(f => (
                      <div key={f} style={{ color: C.orange }}>
                        <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{f}: </span>
                        <span style={{ fontFeatureSettings: "'tnum'" }}>{fmt2(nn(item[f]))} × {nn(item.quantity)} = {fmt2(nn(item[f]) * nn(item.quantity))}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: C.textDim }}>Sub Markup %:</span>
                    <input type="number" value={item.allowanceSubMarkup || ""} onChange={e => updateItem(item.id, "allowanceSubMarkup", e.target.value)}
                      placeholder="0" style={nInp(C, { width: 60, padding: "3px 6px", fontSize: 12 })} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.orange, fontFeatureSettings: "'tnum'" }}>Total: {fmt(total)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontStyle: "italic", lineHeight: 1.4, padding: "4px 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>{generateAllowanceNote(item)}</div>
                </div>
              );
            })()}

            {/* Add item + subtotals */}
            {isExpanded && (
              <div style={{ display: "flex", minWidth: "fit-content", borderTop: `1px solid ${C.border}`, background: C.bg }}>
                <button className="ghost-btn" onClick={() => {
                    if (estGroupBy === "division") {
                      addElement(gk !== "Unassigned" ? gk : DIVISIONS[0]);
                    } else if (estGroupBy === "trade") {
                      // Find the first item in this group to inherit its division, and set the trade key
                      const tradeKey = getTradeKeyFromLabel(gk);
                      const firstItem = skItems[0];
                      const div = firstItem?.division || (estDivision !== "All" ? estDivision : DIVISIONS[0]);
                      addElement(div, { trade: tradeKey });
                    } else {
                      const dc = gk.split(".")[0];
                      addElement(`${dc} - ${activeCodes[dc]?.name || ""}`);
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 12, border: "none", minWidth: 960, flexShrink: 0 }}>
                  <Ic d={I.plus} size={10} /> Add Scope Item
                </button>
              </div>
            )}

            {/* Sub column subtotal row */}
            {isExpanded && showBidPanel && subs.length > 0 && (
              <div style={{ display: "flex", minWidth: "fit-content", borderTop: `2px solid ${C.accent}40`, background: `${C.accent}06` }}>
                <div style={{ minWidth: 960, flexShrink: 0, padding: "8px 12px", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8 }}>Sub Totals</span>
                </div>
                <div style={{ display: "flex", borderLeft: `2px solid ${C.accent}`, flexShrink: 0 }}>
                  {subs.map(sub => {
                    const subTotal = getSkSubTotal(gk, sub.id);
                    return (
                      <div key={sub.id} style={{ width: 180, borderRight: `1px solid ${C.border}`, padding: "8px 8px", textAlign: "right" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: subTotal > 0 ? C.accent : C.textDim, fontFeatureSettings: "'tnum'" }}>{fmt(subTotal)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bid selector */}
            {isExpanded && showBidPanel && (
              <div style={{ display: "flex", minWidth: "fit-content", borderTop: `2px solid ${C.green}`, background: `${C.green}08` }}>
                <div style={{ minWidth: 960, flexShrink: 0, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Ic d={I.check} size={16} color={C.green} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: 0.8 }}>Use for Bid:</span>
                  <select value={sel.source} onChange={e => setBidSelection(gk, { source: e.target.value })}
                    style={inp(C, { width: 220, padding: "5px 10px", fontSize: 12, fontWeight: 600, background: C.bg, border: `1px solid ${sel.source ? C.green : C.border}`, color: sel.source ? C.green : C.textMuted })}>
                    <option value="">— Select Source —</option>
                    <option value="internal">Internal Estimate ({fmt(skTotal)})</option>
                    {subs.map(sub => {
                      const st = getSkSubTotal(gk, sub.id);
                      return <option key={sub.id} value={sub.id}>{sub.name || "Unnamed"} ({st > 0 ? fmt(st) : "no data"})</option>;
                    })}
                    {skLinked.map(ls => <option key={ls.id} value={`linked_${ls.id}`}>⟐ {ls.name || "Linked Sub"} — {fmt(nn(ls.totalBid))}</option>)}
                    <option value="custom">Custom Value...</option>
                  </select>
                  {sel.source === "custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 12, color: C.textDim }}>$</span>
                      <input type="number" value={sel.customValue || ""} onChange={e => setBidSelection(gk, { customValue: e.target.value })} placeholder="Enter amount"
                        style={nInp(C, { width: 140, padding: "5px 8px", fontSize: 14, fontWeight: 700, color: C.green, background: C.bg, border: `1px solid ${C.green}`, fontFeatureSettings: "'tnum'" })} />
                    </div>
                  )}
                  {sel.source && (
                    <div style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, color: C.green, background: `${C.green}20`, padding: "5px 14px", borderRadius: 4, boxShadow: `0 0 6px ${C.green}15`, fontFeatureSettings: "'tnum'" }}>
                      {fmt(selVal)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <div style={{ textAlign: "center", padding: 50, border: `1px dashed ${C.border}`, borderRadius: 8, marginTop: 16 }}>
          <div style={{ color: C.textMuted, fontSize: 13 }}>No scope items. Add from Database, Assemblies, or manually.</div>
        </div>
      )}

      {/* Grand totals bar */}
      {items.length > 0 && (
        <div style={{
          marginTop: 12, padding: "12px 16px", background: C.bg1, borderRadius: T.radius.md,
          border: `1px solid ${C.border}`, boxShadow: T.shadow.md,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Internal Direct: <strong style={{ color: C.text }}>{fmt(totals.direct)}</strong></span>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {totalBidValue > 0 && <span style={{ fontSize: 12, color: C.textMuted }}>Bid Total: <strong style={{ color: C.green, fontFeatureSettings: "'tnum'", fontSize: 14 }}>{fmt(totalBidValue)}</strong></span>}
            <span style={{
              fontSize: T.fontSize.xl, fontWeight: 700, fontFeatureSettings: "'tnum'",
              display: "inline-block",
              ...(C.isDark && C.gradient
                ? {
                    background: C.gradient,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }
                : { color: C.accent }),
            }}>Grand: {fmt(totals.grand)}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <DatabasePickerModal />
      <AIPricingModal />
      {sendToDbItem && <SendToDbModal item={sendToDbItem} onClose={() => setSendToDbItem(null)} />}
      {bidIntelOpen && <BidIntelModal onClose={() => setBidIntelOpen(false)} />}
      {csvImportOpen && <CsvImportModal onClose={() => setCsvImportOpen(false)} mode="append" />}

      {/* Notes & Exclusions slide-out panel */}
      {showNotesPanel && <NotesPanel />}
    </div>
  );
}
