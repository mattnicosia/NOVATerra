import { useState, useMemo, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useUiStore } from '@/stores/uiStore';
import { CODE_SYSTEMS } from '@/constants/codeSystems';
import { TRADE_GROUPINGS, TRADE_MAP, getTradeLabel } from '@/constants/tradeGroupings';
import { UNITS } from '@/constants/units';
import { useMasterDataStore } from '@/stores/masterDataStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt2, uid, titleCase } from '@/utils/format';
import { autoDirective } from '@/utils/directives';
import AssemblyCard from '@/components/shared/AssemblyCard';
import AIAssemblyGenerator from '@/components/shared/AIAssemblyGenerator';
import CodeManager from '@/components/shared/CodeManager';
import SubProposalModal from '@/components/database/SubProposalModal';
import EmptyState from '@/components/shared/EmptyState';

export default function CostDatabasePage() {
  const C = useTheme();
  const T = C.T;
  const codeSystem = useProjectStore(s => s.codeSystem);
  const setCodeSystem = useProjectStore(s => s.setCodeSystem);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const addSubdivision = useProjectStore(s => s.addSubdivision);
  const activeCodes = getActiveCodes();

  const elements = useDatabaseStore(s => s.elements);
  const setElements = useDatabaseStore(s => s.setElements);
  const dbExpandedDivs = useDatabaseStore(s => s.dbExpandedDivs);
  const toggleDbDiv = useDatabaseStore(s => s.toggleDbDiv);
  const dbSelectedSub = useDatabaseStore(s => s.dbSelectedSub);
  const setDbSelectedSub = useDatabaseStore(s => s.setDbSelectedSub);
  const dbSearch = useDatabaseStore(s => s.dbSearch);
  const setDbSearch = useDatabaseStore(s => s.setDbSearch);
  const removeElement = useDatabaseStore(s => s.removeElement);
  const updateElement = useDatabaseStore(s => s.updateElement);
  const duplicateElement = useDatabaseStore(s => s.duplicateElement);

  const assemblies = useDatabaseStore(s => s.assemblies);
  const dbActiveTab = useDatabaseStore(s => s.dbActiveTab);
  const setDbActiveTab = useDatabaseStore(s => s.setDbActiveTab);
  const dbAssemblySearch = useDatabaseStore(s => s.dbAssemblySearch);
  const setDbAssemblySearch = useDatabaseStore(s => s.setDbAssemblySearch);
  const addAssembly = useDatabaseStore(s => s.addAssembly);
  const removeAssembly = useDatabaseStore(s => s.removeAssembly);

  const customBundles = useDatabaseStore(s => s.customBundles);
  const setCustomBundles = useDatabaseStore(s => s.setCustomBundles);

  const addElement = useItemsStore(s => s.addElement);
  const showToast = useUiStore(s => s.showToast);
  const project = useProjectStore(s => s.project);
  const estimators = useMasterDataStore(s => s.masterData.estimators);

  const [codeManagerOpen, setCodeManagerOpen] = useState(false);
  const [aiAssemblyOpen, setAiAssemblyOpen] = useState(false);
  const [subProposalOpen, setSubProposalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBundleKey, setEditingBundleKey] = useState(null);
  const [expandedBundleKey, setExpandedBundleKey] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [moveCode, setMoveCode] = useState("");
  const [addSubForDiv, setAddSubForDiv] = useState(null);
  const [newSubCode, setNewSubCode] = useState("");
  const [newSubName, setNewSubName] = useState("");

  // Dismiss row action menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuOpenId]);

  // Active bundles — custom overrides or defaults
  const activeBundles = customBundles || TRADE_GROUPINGS;
  const bundleMap = useMemo(() => Object.fromEntries(activeBundles.map(t => [t.key, t])), [activeBundles]);

  // Build the CSI tree with item counts
  const dbTree = useMemo(() => {
    const tree = {};
    Object.entries(activeCodes).forEach(([dc, div]) => {
      tree[dc] = { name: div.name, count: 0, subs: {} };
      if (div.subs) {
        Object.entries(div.subs).forEach(([subKey, subName]) => {
          tree[dc].subs[subKey] = { name: subName, count: 0 };
        });
      }
    });
    elements.forEach(el => {
      if (!el.code) return;
      const dc = el.code.split(".")[0];
      const sk = el.code.split(".").slice(0, 2).join(".");
      if (tree[dc]) {
        tree[dc].count++;
        if (tree[dc].subs[sk]) tree[dc].subs[sk].count++;
      }
    });
    return tree;
  }, [activeCodes, elements]);

  // Filter visible elements
  const dbVisibleElements = useMemo(() => {
    let list = elements;
    if (dbSearch) {
      const q = dbSearch.toLowerCase();
      list = list.filter(el =>
        (el.name || "").toLowerCase().includes(q) ||
        (el.code || "").toLowerCase().includes(q)
      );
    } else if (dbSelectedSub) {
      list = list.filter(el => el.code && el.code.startsWith(dbSelectedSub));
    }
    return list;
  }, [elements, dbSearch, dbSelectedSub]);

  const addFromDB = (el) => {
    const dc = el.code ? el.code.split(".")[0] : "";
    const divName = activeCodes[dc]?.name || "";
    addElement(`${dc} - ${divName}`, {
      code: el.code, name: titleCase(el.name), unit: el.unit,
      material: el.material, labor: el.labor, equipment: el.equipment,
      subcontractor: el.subcontractor, trade: el.trade,
    });
    showToast(`Added "${titleCase(el.name)}" to estimate`);
  };

  // Trade bundle management helpers
  const initCustomBundles = () => {
    if (!customBundles) setCustomBundles(TRADE_GROUPINGS.map(t => ({ ...t, divisions: [...t.divisions] })));
  };
  const updateBundle = (key, field, value) => {
    initCustomBundles();
    const bundles = (customBundles || TRADE_GROUPINGS).map(b =>
      b.key === key ? { ...b, [field]: value } : b
    );
    setCustomBundles(bundles);
  };
  const addBundle = () => {
    initCustomBundles();
    const next = customBundles || TRADE_GROUPINGS.map(t => ({ ...t, divisions: [...t.divisions] }));
    const maxSort = next.reduce((m, b) => Math.max(m, b.sort), 0);
    const newKey = `custom_${uid().slice(0, 6)}`;
    setCustomBundles([...next, { key: newKey, label: "New Trade Bundle", sort: maxSort + 1, divisions: [] }]);
    setEditingBundleKey(newKey);
  };
  const removeBundle = (key) => {
    initCustomBundles();
    const next = (customBundles || TRADE_GROUPINGS).filter(b => b.key !== key);
    setCustomBundles(next);
  };
  const resetBundles = () => {
    if (confirm("Reset all trade bundles to defaults? Custom bundles will be lost.")) {
      setCustomBundles(null);
      setEditingBundleKey(null);
    }
  };

  // Count and group items per bundle
  const { bundleItemCounts, bundleItems } = useMemo(() => {
    const counts = {};
    const items = {};
    elements.forEach(el => {
      const trade = el.trade || "";
      if (trade) {
        counts[trade] = (counts[trade] || 0) + 1;
        if (!items[trade]) items[trade] = [];
        items[trade].push(el);
      }
    });
    return { bundleItemCounts: counts, bundleItems: items };
  }, [elements]);

  const gridCols = "80px 32px 1.5fr 100px 44px 58px 58px 58px 58px 68px 44px";

  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 160px)" }}>
        {/* Code System Selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, padding: "0 2px", alignItems: "stretch" }}>
          {Object.values(CODE_SYSTEMS).map((sys, si) => {
            const active = codeSystem === sys.id;
            return (
              <button key={sys.id} className={active ? "card-hover" : "ghost-btn"}
                onClick={() => {
                  if (!active && elements.length > 0 && !confirm(`Switch to ${sys.name}? Your existing database items will remain but codes may not match the new system.`)) return;
                  setCodeSystem(sys.id);
                }}
                style={{
                  flex: 1, padding: "10px 14px",
                  background: active ? C.accentBg : C.bg,
                  border: `2px solid ${active ? C.accent : C.border}`,
                  borderRadius: 8, display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer",
                  animation: `staggerFadeUp 400ms cubic-bezier(0.16,1,0.3,1) ${si * 60}ms both`,
                }}>
                <span style={{ fontSize: 20 }}>{sys.icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? C.accent : C.text }}>{sys.name}</div>
                  <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.3 }}>{sys.desc}</div>
                </div>
                {active && <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: C.accent, boxShadow: `0 0 8px ${C.accent}60` }} />}
              </button>
            );
          })}
          <button
            onClick={() => setCodeManagerOpen(true)}
            style={bt(C, {
              background: C.bg, border: `2px solid ${C.border}`, borderRadius: 8,
              padding: "10px 16px", color: C.text, flexDirection: "column",
              justifyContent: "center", gap: 4, minWidth: 100,
            })}
          >
            <Ic d={I.settings} size={16} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>Manage Codes</span>
          </button>
        </div>

        {/* Tab Switcher: Items | Assemblies | Trade Bundles */}
        <div style={{ marginBottom: 8, animation: "staggerFadeUp 400ms cubic-bezier(0.16,1,0.3,1) 150ms both" }}>
          <div style={{ background: C.bg2, borderRadius: T.radius.md, padding: 3, display: "inline-flex" }}>
            {[
              { key: "items", label: `Items (${elements.length})`, icon: null },
              { key: "assemblies", label: `Assemblies (${assemblies.length})`, icon: I.assembly },
              { key: "bundles", label: `Trade Bundles (${activeBundles.length})`, icon: I.bundle },
            ].map((tab) => {
              const active = dbActiveTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setDbActiveTab(tab.key)}
                  style={bt(C, {
                    padding: "8px 20px", fontSize: 12, fontWeight: 600,
                    background: active ? C.accent : "transparent",
                    color: active ? "#fff" : C.textMuted,
                    border: "none",
                    borderRadius: T.radius.sm,
                    cursor: "pointer",
                    transition: "all 200ms ease-out",
                    boxShadow: active ? `0 2px 8px ${C.accent}30` : "none",
                  })}>
                  {tab.icon && <Ic d={tab.icon} size={14} color={active ? "#fff" : C.textMuted} />}
                  {" "}{tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Items Tab */}
        {dbActiveTab === "items" && <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
          {/* LEFT: Division Tree */}
          <div style={{ width: 280, minWidth: 280, background: C.bg, borderRadius: `${T.radius.md}px 0 0 ${T.radius.md}px`, border: `1px solid ${C.border}`, borderRight: "none", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 1 }}>{(CODE_SYSTEMS[codeSystem] || CODE_SYSTEMS["csi-commercial"]).name}</span>
              <span style={{ fontSize: 9, color: C.textDim }}>{Object.keys(activeCodes).length} divisions</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
              <div className="nav-item" onClick={() => { setDbSelectedSub(null); setDbSearch(""); }}
                style={{ padding: "6px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: !dbSelectedSub && !dbSearch ? C.accent : C.textMuted, background: !dbSelectedSub && !dbSearch ? C.accentBg : "transparent", marginBottom: 2 }}>
                All Items ({elements.length})
              </div>
              {Object.entries(dbTree).sort(([a], [b]) => a.localeCompare(b)).map(([dc, div], dIdx) => (
                <div key={dc} style={{ animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${200 + dIdx * 18}ms both` }}>
                  <div className="nav-item" onClick={() => toggleDbDiv(dc)}
                    style={{ padding: "6px 10px", borderRadius: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: div.count > 0 ? C.text : C.textMuted }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={div.count > 0 ? C.accent : C.textDim} strokeWidth="1.5" style={{ transform: dbExpandedDivs.has(dc) ? "rotate(90deg)" : "rotate(0)", transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)", flexShrink: 0 }}><path d="M2 0.5l3.5 3.5L2 7.5" /></svg>
                    <Ic d={I.folder} size={12} color={div.count > 0 ? C.accent : C.textDim} />
                    <span style={{ color: div.count > 0 ? C.accent : C.textDim, fontFamily: "'DM Mono',monospace", fontSize: 10, minWidth: 18 }}>{dc}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{div.name}</span>
                    {div.count > 0 && <span style={{ fontSize: 9, color: C.accent, fontWeight: 600, background: `${C.accent}12`, padding: "1px 5px", borderRadius: 6 }}>{div.count}</span>}
                  </div>
                  {dbExpandedDivs.has(dc) && <>
                    {Object.entries(div.subs).sort(([a], [b]) => a.localeCompare(b)).map(([subKey, sub], sIdx) => {
                      const isActive = dbSelectedSub === subKey;
                      const hasItems = sub.count > 0;
                      return (
                        <div key={subKey} className="nav-item" onClick={() => { setDbSelectedSub(subKey); setDbSearch(""); }}
                          style={{
                            padding: "5px 10px 5px 34px", borderRadius: 4, fontSize: 10,
                            color: isActive ? C.accent : hasItems ? C.text : C.textDim,
                            background: isActive ? C.accentBg : "transparent",
                            fontWeight: isActive ? 600 : hasItems ? 500 : 400,
                            display: "flex", gap: 6, alignItems: "center",
                            opacity: isActive || hasItems ? 1 : 0.7,
                            animation: `staggerFadeRight 220ms cubic-bezier(0.16,1,0.3,1) ${sIdx * 25}ms both`,
                            borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                            transition: "border-color 200ms ease-out, background 150ms ease-out",
                          }}>
                          <span style={{ fontFamily: "'DM Mono',monospace", color: isActive ? C.accent : hasItems ? C.textMuted : C.textDim, fontSize: 9 }}>{subKey}</span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
                          {hasItems && <span style={{ fontSize: 9, color: C.accent, fontWeight: 600, background: `${C.accent}10`, padding: "0 4px", borderRadius: 4 }}>{sub.count}</span>}
                        </div>
                      );
                    })}
                    {/* Add subdivision */}
                    {addSubForDiv === dc ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 10px 4px 34px" }}>
                        <input placeholder={`${dc}.`} value={newSubCode} onChange={e => setNewSubCode(e.target.value)} autoFocus
                          style={inp(C, { width: 56, fontSize: 9, fontFamily: "'DM Mono',monospace", textAlign: "center", padding: "2px 3px" })} />
                        <input placeholder="Name..." value={newSubName} onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const code = newSubCode.trim();
                              const name = newSubName.trim();
                              if (code && name) {
                                const fullCode = code.includes(".") ? code : `${dc}.${code}`;
                                addSubdivision(dc, fullCode, name);
                                setNewSubCode(""); setNewSubName(""); setAddSubForDiv(null);
                                showToast(`Added subdivision ${fullCode}`);
                              }
                            }
                            if (e.key === "Escape") setAddSubForDiv(null);
                          }}
                          style={inp(C, { flex: 1, fontSize: 9, padding: "2px 4px" })} />
                        <button onClick={() => {
                          const code = newSubCode.trim();
                          const name = newSubName.trim();
                          if (code && name) {
                            const fullCode = code.includes(".") ? code : `${dc}.${code}`;
                            addSubdivision(dc, fullCode, name);
                            setNewSubCode(""); setNewSubName(""); setAddSubForDiv(null);
                            showToast(`Added subdivision ${fullCode}`);
                          }
                        }} style={bt(C, { background: C.accent, color: "#fff", padding: "2px 6px", fontSize: 8 })}>Add</button>
                        <button onClick={() => setAddSubForDiv(null)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "2px 5px", fontSize: 8 })}>✕</button>
                      </div>
                    ) : (
                      <div className="nav-item" onClick={() => { setAddSubForDiv(dc); setNewSubCode(""); setNewSubName(""); }}
                        style={{ padding: "4px 10px 4px 34px", borderRadius: 4, fontSize: 9, color: C.accent, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, opacity: 0.6 }}>
                        <Ic d={I.plus} size={9} color={C.accent} sw={2} /> Add subdivision...
                      </div>
                    )}
                  </>}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Items list */}
          <div style={{ flex: 1, background: C.bg1, borderRadius: `0 ${T.radius.md}px ${T.radius.md}px 0`, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                <input placeholder="Search items..." value={dbSearch} onChange={e => { setDbSearch(e.target.value); if (e.target.value) setDbSelectedSub(null); }} style={inp(C, { paddingLeft: 28, fontSize: 12 })} />
                <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Ic d={I.search} size={12} color={C.textDim} /></div>
              </div>
              {dbSelectedSub && <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>{dbSelectedSub} — {activeCodes[dbSelectedSub.split(".")[0]]?.subs?.[dbSelectedSub] || ""}</span>}
              <button className="accent-btn" onClick={() => {
                const sub = dbSelectedSub || "";
                // Auto-generate next code: find max item number under this subdivision
                let code = sub;
                if (sub) {
                  const existing = elements.filter(el => el.code && el.code.startsWith(sub + "."));
                  const nums = existing.map(el => {
                    const tail = el.code.slice(sub.length + 1);
                    return parseInt(tail, 10);
                  }).filter(n => !isNaN(n));
                  const next = nums.length > 0 ? Math.max(...nums) + 10 : 10;
                  code = `${sub}.${String(next).padStart(2, "0")}`;
                }
                // Resolve current user name: project estimator or first estimator in master data
                const userName = project?.estimator || (estimators.length > 0 ? estimators[0].name : "");
                useDatabaseStore.getState().addElement({
                  code, name: "", unit: "EA", material: 0, labor: 0, equipment: 0, subcontractor: 0,
                  directive: "", addedBy: userName, addedDate: new Date().toLocaleDateString(),
                  specVariants: [], specText: "",
                });
                showToast("New scope item created");
              }} style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}>
                <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Create Scope Item
              </button>
              <button className="accent-btn" onClick={() => setSubProposalOpen(true)}
                style={bt(C, {
                  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: "#fff", padding: "5px 12px", fontSize: 10, border: "none",
                  boxShadow: `0 1px 6px ${C.accent}30`,
                })}>
                <Ic d={I.upload} size={11} color="#fff" /> Import Sub Proposal
              </button>
              {elements.length > 0 && (
                <button className="ghost-btn" onClick={() => { if (confirm("Clear ALL scope items from database? This cannot be undone.")) setElements([]); }}
                  style={bt(C, { background: "transparent", border: `1px solid ${C.red}`, color: C.red, padding: "5px 10px", fontSize: 9 })}>Clear All</button>
              )}
              <span style={{ fontSize: 10, color: C.textDim }}>{dbVisibleElements.length} items</span>
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: gridCols, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <div>Code</div><div>Dir</div><div>Item</div><div>Bundle</div><div style={{ textAlign: "right" }}>Unit</div><div style={{ textAlign: "right" }}>Matl</div><div style={{ textAlign: "right" }}>Labor</div><div style={{ textAlign: "right" }}>Equip</div><div style={{ textAlign: "right" }}>Sub</div><div style={{ textAlign: "right" }}>Added By</div><div></div>
            </div>

            {/* Move bar */}
            {movingId && (() => {
              const movingEl = elements.find(e => e.id === movingId);
              if (!movingEl) return null;
              const canConfirm = moveCode && moveCode !== movingEl.code;
              // Build filtered subdivision chips
              const chips = Object.entries(activeCodes).flatMap(([dc, div]) =>
                Object.entries(div.subs || {})
                  .filter(([sk]) => !moveCode || sk.startsWith(moveCode.split(".")[0]))
                  .slice(0, 12)
                  .map(([sk, name]) => ({ sk, name }))
              ).slice(0, 10);
              return (
                <div style={{
                  padding: "8px 14px", background: C.accentBg, borderBottom: `2px solid ${C.accent}`,
                  display: "flex", alignItems: "center", gap: 10, fontSize: 11, flexShrink: 0,
                }}>
                  <Ic d={I.move} size={14} color={C.accent} />
                  <span style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                    Move "{movingEl.name}"
                  </span>
                  <span style={{ color: C.textDim, fontSize: 10, flexShrink: 0 }}>to:</span>
                  <input
                    value={moveCode} onChange={e => setMoveCode(e.target.value)}
                    placeholder="e.g. 05.210" autoFocus
                    style={inp(C, { width: 110, fontFamily: "'DM Mono',monospace", fontSize: 11, padding: "4px 8px" })}
                    onKeyDown={e => { if (e.key === "Enter" && canConfirm) { updateElement(movingId, "code", moveCode); showToast(`Moved to ${moveCode}`); setMovingId(null); setMoveCode(""); } if (e.key === "Escape") { setMovingId(null); setMoveCode(""); } }}
                  />
                  <div style={{ display: "flex", gap: 3, flex: 1, overflow: "hidden", flexWrap: "wrap" }}>
                    {chips.map(({ sk, name }) => (
                      <button key={sk} onClick={() => setMoveCode(sk)}
                        style={{
                          padding: "2px 7px", fontSize: 8, fontWeight: 600,
                          background: moveCode === sk ? C.accent : C.bg,
                          color: moveCode === sk ? "#fff" : C.textMuted,
                          border: `1px solid ${moveCode === sk ? C.accent : C.border}`,
                          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
                        }}>
                        {sk}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { if (canConfirm) { updateElement(movingId, "code", moveCode); showToast(`Moved "${movingEl.name}" to ${moveCode}`); } setMovingId(null); setMoveCode(""); }}
                    disabled={!canConfirm}
                    style={bt(C, { background: canConfirm ? C.accent : C.bg3, color: canConfirm ? "#fff" : C.textDim, padding: "4px 12px", fontSize: 10, fontWeight: 600, flexShrink: 0 })}>
                    <Ic d={I.check} size={10} color={canConfirm ? "#fff" : C.textDim} sw={2.5} /> Move
                  </button>
                  <button onClick={() => { setMovingId(null); setMoveCode(""); }}
                    style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "4px 10px", fontSize: 10, flexShrink: 0 })}>
                    Cancel
                  </button>
                </div>
              );
            })()}

            {/* Items list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {dbVisibleElements.sort((a, b) => (a.code || "").localeCompare(b.code || "")).map((el, idx) => {
                const dirColor = el.directive === "F/O" ? C.blue : el.directive === "I/O" ? C.orange : el.directive === "F/I" ? C.green : C.textDim;
                const isEditing = editingId === el.id;
                const tradeLabel = el.trade ? (bundleMap[el.trade]?.label || el.trade) : "";
                const editField = (field, value) => {
                  updateElement(el.id, field, value);
                  // Only auto-calculate directive if it hasn't been manually overridden
                  if (["material", "labor", "equipment", "subcontractor"].includes(field) && !el.directiveOverride) {
                    const m = field === "material" ? nn(value) : nn(el.material);
                    const l = field === "labor" ? nn(value) : nn(el.labor);
                    const e = field === "equipment" ? nn(value) : nn(el.equipment);
                    const s = field === "subcontractor" ? nn(value) : nn(el.subcontractor);
                    updateElement(el.id, "directive", autoDirective(m, l, e, s));
                  }
                };
                return (
                  <div key={el.id} className="db-row"
                    style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      padding: isEditing ? "5px 14px" : "7px 14px",
                      borderBottom: `1px solid ${C.bg}`, alignItems: "center",
                      background: isEditing ? C.accentBg : idx % 2 === 1 ? C.bg2 + '40' : 'transparent',
                      animation: idx < 40 ? `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 25}ms both` : undefined,
                    }}>
                    {isEditing ? (<>
                      <input value={el.code} onChange={e => editField("code", e.target.value)}
                        style={inp(C, { fontFamily: "'DM Mono',monospace", fontSize: 10, padding: "3px 4px", textAlign: "center" })} />
                      <select value={el.directive || ""} onChange={e => { updateElement(el.id, "directive", e.target.value); updateElement(el.id, "directiveOverride", !!e.target.value); }}
                        style={inp(C, { fontSize: 8, padding: "2px 1px", textAlign: "center", fontWeight: 700, color: dirColor })}>
                        <option value="">Auto</option>
                        <option value="F/I">F/I</option>
                        <option value="F/O">F/O</option>
                        <option value="I/O">I/O</option>
                      </select>
                      <input value={el.name} onChange={e => editField("name", e.target.value)} autoFocus
                        style={inp(C, { fontSize: 11, padding: "3px 6px" })} />
                      <select value={el.trade || ""} onChange={e => updateElement(el.id, "trade", e.target.value)}
                        style={inp(C, { fontSize: 9, padding: "3px 4px" })}>
                        <option value="">— None —</option>
                        {activeBundles.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                      </select>
                      <select value={el.unit} onChange={e => editField("unit", e.target.value)}
                        style={inp(C, { fontSize: 10, padding: "3px 4px", textAlign: "center", width: "100%" })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <input type="number" value={el.material} onChange={e => editField("material", e.target.value)}
                        style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.green })} />
                      <input type="number" value={el.labor} onChange={e => editField("labor", e.target.value)}
                        style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.blue })} />
                      <input type="number" value={el.equipment} onChange={e => editField("equipment", e.target.value)}
                        style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.orange })} />
                      <input type="number" value={el.subcontractor || 0} onChange={e => editField("subcontractor", e.target.value)}
                        style={nInp(C, { fontSize: 10, padding: "3px 4px", color: C.red })} />
                      <div />
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        <button className="icon-btn" title="Done" onClick={() => setEditingId(null)}
                          style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <Ic d={I.check} size={12} color={C.green} sw={2.5} />
                        </button>
                      </div>
                    </>) : (<>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.purple, fontWeight: 600, cursor: "pointer" }} onClick={() => addFromDB(el)}>{el.code}</div>
                      <select value={el.directive || ""} onChange={e => { updateElement(el.id, "directive", e.target.value); updateElement(el.id, "directiveOverride", !!e.target.value); }}
                        title={el.directiveOverride ? "Manual override (click to change)" : "Auto-calculated"}
                        style={{ fontSize: 8, fontWeight: 700, color: dirColor, textAlign: "center", background: "transparent", border: "none", cursor: "pointer", padding: "1px 0", appearance: "none", WebkitAppearance: "none", width: "100%", textDecoration: el.directiveOverride ? "underline" : "none" }}>
                        <option value="">—</option>
                        <option value="F/I">F/I</option>
                        <option value="F/O">F/O</option>
                        <option value="I/O">I/O</option>
                      </select>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => addFromDB(el)}>
                        {titleCase(el.name)}
                        {(el.specVariants || []).length > 0 && <span style={{ marginLeft: 4, fontSize: 7, fontWeight: 700, color: C.purple, background: `${C.purple}12`, padding: "1px 4px", borderRadius: 3, verticalAlign: "middle" }}>{(el.specVariants || []).length} var</span>}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        {tradeLabel && (
                          <span style={{ fontSize: 8, fontWeight: 600, color: C.accent, background: C.accentBg, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: "100%" }}>{tradeLabel}</span>
                        )}
                      </div>
                      <div style={{ textAlign: "right", fontSize: 10, color: C.textMuted }}>/{el.unit}</div>
                      <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.green }}>{fmt2(el.material)}</div>
                      <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.blue }}>{fmt2(el.labor)}</div>
                      <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.orange }}>{fmt2(el.equipment)}</div>
                      <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.red }}>{nn(el.subcontractor) > 0 ? fmt2(el.subcontractor) : "—"}</div>
                      <div style={{ textAlign: "right", fontSize: 8, color: C.textDim, lineHeight: 1.3 }}><div>{el.addedBy || "—"}</div><div>{el.addedDate || ""}</div></div>
                      <div style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
                        <button className="icon-btn" title="Actions"
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === el.id ? null : el.id); }}
                          style={{ width: 22, height: 22, border: "none", background: menuOpenId === el.id ? C.accentBg : "transparent", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.7 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill={C.textDim}><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                        </button>
                        {menuOpenId === el.id && (
                          <div onClick={e => e.stopPropagation()} style={{
                            position: "absolute", right: 0, top: 24, zIndex: 100,
                            background: C.glassBgDark || C.bg, border: `1px solid ${C.glassBorder || C.border}`, borderRadius: 8,
                            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 0 12px rgba(0,0,0,0.10)", minWidth: 160, padding: "4px 0",
                            animation: "staggerFadeUp 200ms cubic-bezier(0.16,1,0.3,1) both",
                          }}>
                            <button onMouseDown={(e) => { e.stopPropagation(); duplicateElement(el.id); setMenuOpenId(null); showToast(`Copied "${el.name}"`); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", fontSize: 11, fontWeight: 500, background: "transparent", border: "none", color: C.text, cursor: "pointer", textAlign: "left" }}>
                              <Ic d={I.copy} size={12} color={C.textMuted} /> Copy Item
                            </button>
                            <button onMouseDown={(e) => { e.stopPropagation(); setMovingId(el.id); setMoveCode(el.code); setMenuOpenId(null); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", fontSize: 11, fontWeight: 500, background: "transparent", border: "none", color: C.text, cursor: "pointer", textAlign: "left" }}>
                              <Ic d={I.move} size={12} color={C.textMuted} /> Move to Code...
                            </button>
                            <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                            <button onMouseDown={(e) => { e.stopPropagation(); setEditingId(el.id); setMovingId(null); setMenuOpenId(null); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", fontSize: 11, fontWeight: 500, background: "transparent", border: "none", color: C.text, cursor: "pointer", textAlign: "left" }}>
                              <Ic d={I.edit} size={12} color={C.textMuted} /> Edit
                            </button>
                            <button onMouseDown={(e) => { e.stopPropagation(); if (confirm(`Delete "${el.name}"?`)) removeElement(el.id); setMenuOpenId(null); }}
                              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 14px", fontSize: 11, fontWeight: 500, background: "transparent", border: "none", color: C.red, cursor: "pointer", textAlign: "left" }}>
                              <Ic d={I.trash} size={12} color={C.red} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </>)}
                  </div>
                );
              })}
              {dbVisibleElements.length === 0 && (
                <EmptyState
                  icon={I.database}
                  title={`No items${dbSelectedSub ? ` in ${dbSelectedSub}` : ""}`}
                  subtitle={dbSearch ? `No results for "${dbSearch}"` : 'Click "Create Scope Item" to add one.'}
                />
              )}
            </div>
          </div>
        </div>}

        {/* Assemblies Tab */}
        {dbActiveTab === "assemblies" && (
          <div style={{ flex: 1, background: C.bg1, borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
                <input placeholder="Search assemblies..." value={dbAssemblySearch} onChange={e => setDbAssemblySearch(e.target.value)}
                  style={inp(C, { paddingLeft: 28, fontSize: 12 })} />
                <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Ic d={I.search} size={12} color={C.textDim} /></div>
              </div>
              <button className="accent-btn" onClick={() => setAiAssemblyOpen(true)} style={bt(C, {
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple})`,
                color: "#fff", padding: "5px 14px", fontSize: 10, border: "none",
                boxShadow: `0 1px 6px ${C.accent}30`,
              })}>
                <Ic d={I.ai} size={12} color="#fff" /> AI Generate
              </button>
              <button className="accent-btn" onClick={() => {
                addAssembly({ code: "", name: "New Assembly", description: "", elements: [] });
                showToast("New assembly created");
              }} style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}>
                <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Create Assembly
              </button>
              <span style={{ fontSize: 10, color: C.textDim }}>{assemblies.length} assemblies</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {assemblies
                .filter(asm => {
                  if (!dbAssemblySearch) return true;
                  const q = dbAssemblySearch.toLowerCase();
                  return (asm.name || "").toLowerCase().includes(q) || (asm.code || "").toLowerCase().includes(q) || (asm.description || "").toLowerCase().includes(q);
                })
                .map(asm => <AssemblyCard key={asm.id} asm={asm} onDelete={(id) => { if (confirm(`Delete assembly "${asm.name}"?`)) { removeAssembly(id); showToast("Assembly deleted"); } }} />)}
              {assemblies.length === 0 && (
                <EmptyState
                  icon={I.assembly}
                  title="No assemblies yet"
                  subtitle="Assemblies are pre-built combinations of scope items. Create one or use AI to generate."
                  action={() => setAiAssemblyOpen(true)}
                  actionLabel="AI Generate"
                  actionIcon={I.ai}
                />
              )}
            </div>
          </div>
        )}

        {/* Trade Bundles Tab */}
        {dbActiveTab === "bundles" && (
          <div style={{ flex: 1, background: C.bg1, borderRadius: 8, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  Trade bundles group CSI divisions into how you present estimates to owners.
                  {customBundles && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.orange, background: "rgba(224,135,58,0.12)", padding: "2px 6px", borderRadius: 3 }}>CUSTOMIZED</span>}
                </span>
              </div>
              <button className="accent-btn" onClick={addBundle}
                style={bt(C, { background: C.accent, color: "#fff", padding: "5px 12px", fontSize: 10 })}>
                <Ic d={I.plus} size={11} color="#fff" sw={2.5} /> Add Bundle
              </button>
              {customBundles && (
                <button className="ghost-btn" onClick={resetBundles}
                  style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "5px 10px", fontSize: 9 })}>
                  <Ic d={I.refresh} size={10} color={C.textMuted} /> Reset to Defaults
                </button>
              )}
              <span style={{ fontSize: 10, color: C.textDim }}>{activeBundles.length} bundles</span>
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 2fr 100px 60px 52px", gap: 4, padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 9, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <div style={{ textAlign: "center" }}>Order</div>
              <div>Bundle Label</div>
              <div>CSI Divisions</div>
              <div style={{ textAlign: "center" }}>Items</div>
              <div></div>
            </div>

            {/* Bundle rows */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {[...activeBundles].sort((a, b) => a.sort - b.sort).map((bundle, idx) => {
                const isEditing = editingBundleKey === bundle.key;
                const count = bundleItemCounts[bundle.key] || 0;
                const isExpanded = expandedBundleKey === bundle.key;
                const items = bundleItems[bundle.key] || [];
                return (
                  <div key={bundle.key} style={{ animation: idx < 30 ? `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${idx * 30}ms both` : undefined }}>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "40px 2fr 100px 60px 52px", gap: 4, padding: "8px 14px", borderBottom: `1px solid ${C.bg}`, alignItems: "center", background: isEditing ? C.accentBg : isExpanded ? C.accentBg : idx % 2 === 1 ? C.bg2 + '40' : 'transparent', cursor: isEditing ? "default" : "pointer" }}
                      onClick={() => { if (!isEditing && count > 0) setExpandedBundleKey(isExpanded ? null : bundle.key); }}
                    >
                      {isEditing ? (<>
                        <input type="number" value={bundle.sort} onChange={e => updateBundle(bundle.key, "sort", parseInt(e.target.value) || 0)}
                          onClick={e => e.stopPropagation()}
                          style={nInp(C, { fontSize: 10, padding: "3px 4px", textAlign: "center", width: "100%" })} />
                        <input value={bundle.label} onChange={e => updateBundle(bundle.key, "label", e.target.value)} autoFocus
                          onClick={e => e.stopPropagation()}
                          style={inp(C, { fontSize: 12, padding: "4px 8px", fontWeight: 600 })} />
                        <input value={(bundle.divisions || []).join(", ")} onChange={e => updateBundle(bundle.key, "divisions", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                          placeholder="01, 02..."
                          onClick={e => e.stopPropagation()}
                          style={inp(C, { fontSize: 10, padding: "3px 6px", fontFamily: "'DM Mono',monospace" })} />
                        <div style={{ textAlign: "center", fontSize: 10, color: C.textDim }}>{count}</div>
                        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                          <button className="icon-btn" title="Done" onClick={(e) => { e.stopPropagation(); setEditingBundleKey(null); }}
                            style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            <Ic d={I.check} size={12} color={C.green} sw={2.5} />
                          </button>
                        </div>
                      </>) : (<>
                        <div style={{ textAlign: "center", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.textDim }}>{bundle.sort}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {count > 0 && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={isExpanded ? C.accent : C.textDim} strokeWidth="1.5" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 200ms cubic-bezier(0.16,1,0.3,1), stroke 200ms ease-out", flexShrink: 0 }}><path d="M2 0.5l3.5 3.5L2 7.5" /></svg>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{bundle.label}</span>
                        </div>
                        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.textMuted }}>
                          {(bundle.divisions || []).length > 0 ? bundle.divisions.join(", ") : <span style={{ fontStyle: "italic", color: C.textDim }}>sub-based</span>}
                        </div>
                        <div style={{ textAlign: "center", fontSize: 10, color: count > 0 ? C.accent : C.textDim, fontWeight: count > 0 ? 600 : 400 }}>{count}</div>
                        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                          <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); initCustomBundles(); setEditingBundleKey(bundle.key); }}
                            style={{ width: 22, height: 22, border: "none", background: "transparent", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.6 }}>
                            <Ic d={I.edit} size={11} color={C.textDim} />
                          </button>
                          <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete bundle "${bundle.label}"?`)) { initCustomBundles(); removeBundle(bundle.key); } }}
                            style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.red, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.6 }}>
                            <Ic d={I.trash} size={11} />
                          </button>
                        </div>
                      </>)}
                    </div>
                    {/* Expanded items list */}
                    {isExpanded && !isEditing && items.length > 0 && (
                      <div style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                        {/* Item sub-header */}
                        <div style={{ display: "grid", gridTemplateColumns: "80px 1.5fr 60px 62px 62px 62px 62px 100px", gap: 4, padding: "4px 14px 4px 54px", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${C.border}` }}>
                          <div>Code</div><div>Name</div><div style={{ textAlign: "right" }}>Unit</div><div style={{ textAlign: "right" }}>Matl</div><div style={{ textAlign: "right" }}>Labor</div><div style={{ textAlign: "right" }}>Equip</div><div style={{ textAlign: "right" }}>Sub</div><div style={{ textAlign: "right" }}>Bundle</div>
                        </div>
                        {items.sort((a, b) => (a.code || "").localeCompare(b.code || "")).map((el, i) => (
                          <div key={el.id} style={{ display: "grid", gridTemplateColumns: "80px 1.5fr 60px 62px 62px 62px 62px 100px", gap: 4, padding: "4px 14px 4px 54px", fontSize: 11, borderBottom: `1px solid ${C.borderLight || C.border}`, alignItems: "center" }}>
                            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.purple }}>{el.code || "—"}</div>
                            <div style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleCase(el.name) || "Unnamed"}</div>
                            <div style={{ textAlign: "right", fontSize: 10, color: C.textMuted }}>/{el.unit}</div>
                            <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.green }}>{fmt2(el.material)}</div>
                            <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.blue }}>{fmt2(el.labor)}</div>
                            <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.orange }}>{fmt2(el.equipment)}</div>
                            <div style={{ textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 10, color: C.red }}>{nn(el.subcontractor) > 0 ? fmt2(el.subcontractor) : "—"}</div>
                            <div style={{ textAlign: "right" }}>
                              <select value={el.trade || ""} onChange={e => updateElement(el.id, "trade", e.target.value)}
                                style={{ fontSize: 9, padding: "2px 4px", background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", maxWidth: "100%" }}>
                                <option value="">— None —</option>
                                {activeBundles.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                              </select>
                            </div>
                          </div>
                        ))}
                        <div style={{ padding: "4px 14px 4px 54px", fontSize: 9, color: C.textDim, fontStyle: "italic" }}>
                          {items.length} item{items.length !== 1 ? "s" : ""} in this bundle
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 9, color: C.textDim, lineHeight: 1.6 }}>
              <strong>Order</strong> controls sort order in reports and SOV.{" "}
              <strong>CSI Divisions</strong> auto-assigns items by code (leave empty for bundles assigned by subdivision, e.g. Div 06–09 splits).{" "}
              Items assigned to a deleted bundle will show as "Unassigned" in reports.
            </div>
          </div>
        )}
      </div>

      {/* Code Manager Modal */}
      {codeManagerOpen && <CodeManager onClose={() => setCodeManagerOpen(false)} />}
      {/* AI Assembly Generator Modal */}
      {aiAssemblyOpen && <AIAssemblyGenerator onClose={() => setAiAssemblyOpen(false)} />}
      {/* Sub Proposal Import Modal */}
      {subProposalOpen && <SubProposalModal onClose={() => setSubProposalOpen(false)} />}
    </div>
  );
}
