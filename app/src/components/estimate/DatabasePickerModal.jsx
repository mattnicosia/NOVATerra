import { useState, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDatabaseStore } from '@/stores/databaseStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { UNITS } from '@/constants/units';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt, titleCase } from '@/utils/format';

export default function DatabasePickerModal() {
  const C = useTheme();
  const T = C.T;
  const elements = useDatabaseStore(s => s.elements);
  const pickerForItemId = useDatabaseStore(s => s.pickerForItemId);
  const setPickerForItemId = useDatabaseStore(s => s.setPickerForItemId);
  const updateItem = useItemsStore(s => s.updateItem);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const showToast = useUiStore(s => s.showToast);

  const activeCodes = getActiveCodes();

  const [search, setSearch] = useState("");
  const [selectedSub, setSelectedSub] = useState(null);
  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [customMode, setCustomMode] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("EA");

  const toggleDiv = (dc) => {
    setExpandedDivs(prev => {
      const next = new Set(prev);
      next.has(dc) ? next.delete(dc) : next.add(dc);
      return next;
    });
  };

  // Build division tree with item counts
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

  // Filter items by search OR selected subdivision
  const filtered = useMemo(() => {
    let list = elements;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.code || "").toLowerCase().includes(q) ||
        (e.name || "").toLowerCase().includes(q)
      );
    } else if (selectedSub) {
      list = list.filter(e => e.code && e.code.startsWith(selectedSub));
    }
    return list.sort((a, b) => (a.code || "").localeCompare(b.code || "")).slice(0, 120);
  }, [elements, search, selectedSub]);

  const handlePick = (el) => {
    const id = pickerForItemId;
    if (!id) return;
    updateItem(id, "code", el.code || "");
    updateItem(id, "description", titleCase(el.name) || "");
    updateItem(id, "unit", el.unit || "EA");
    updateItem(id, "material", el.material || 0);
    updateItem(id, "labor", el.labor || 0);
    updateItem(id, "equipment", el.equipment || 0);
    if (el.trade) updateItem(id, "trade", el.trade);
    const dc = (el.code || "").split(".")[0];
    if (dc) {
      const divName = divFromCode(el.code);
      if (divName) updateItem(id, "division", divName);
    }
    showToast(`Applied "${el.name}" to item`);
    setPickerForItemId(null);
  };

  const handleCustomPick = () => {
    const id = pickerForItemId;
    if (!id || !customCode) return;
    updateItem(id, "code", customCode);
    if (customName) updateItem(id, "description", titleCase(customName));
    updateItem(id, "unit", customUnit);
    const dc = customCode.split(".")[0];
    if (dc) {
      const divName = divFromCode(customCode);
      if (divName) updateItem(id, "division", divName);
    }
    showToast(`Applied custom item "${customName || customCode}" to item`);
    setPickerForItemId(null);
    setCustomMode(false);
    setCustomCode("");
    setCustomName("");
    setCustomUnit("EA");
  };

  if (!pickerForItemId) return null;

  return (
    <Modal onClose={() => setPickerForItemId(null)} extraWide>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
          <Ic d={I.database} size={16} color={C.purple} /> Select from Cost Database
        </h3>
        <button onClick={() => setPickerForItemId(null)} style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}>
          <Ic d={I.x} size={16} />
        </button>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: "flex", gap: 0, height: 440 }}>
        {/* Left sidebar: Division tree */}
        <div style={{ width: 240, minWidth: 240, borderRight: `1px solid ${C.border}`, overflowY: "auto", paddingRight: 4 }}>
          <div className="nav-item" onClick={() => { setSelectedSub(null); setSearch(""); }}
            style={{ padding: "6px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: !selectedSub && !search ? C.accent : C.textMuted, background: !selectedSub && !search ? C.accentBg : "transparent", marginBottom: 2, cursor: "pointer" }}>
            All Items ({elements.length})
          </div>
          {Object.entries(dbTree).sort(([a], [b]) => a.localeCompare(b)).map(([dc, div]) => (
            <div key={dc}>
              <div className="nav-item" onClick={() => toggleDiv(dc)}
                style={{ padding: "6px 10px", borderRadius: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: div.count > 0 ? C.text : C.textMuted, cursor: "pointer" }}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: expandedDivs.has(dc) ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}><path d="M2 0.5l3.5 3.5L2 7.5" /></svg>
                <Ic d={I.folder} size={12} color={div.count > 0 ? C.accent : C.textDim} />
                <span style={{ fontFeatureSettings: "'tnum'", fontSize: 10, minWidth: 18 }}>{dc}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{div.name}</span>
                {div.count > 0 && <span style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>{div.count}</span>}
              </div>
              {expandedDivs.has(dc) && Object.entries(div.subs).sort(([a], [b]) => a.localeCompare(b)).map(([subKey, sub]) => {
                const isActive = selectedSub === subKey;
                const hasItems = sub.count > 0;
                return (
                  <div key={subKey} className="nav-item" onClick={() => { setSelectedSub(subKey); setSearch(""); }}
                    style={{ padding: "5px 10px 5px 34px", borderRadius: 4, fontSize: 10, color: isActive ? C.accent : hasItems ? C.text : C.textDim, background: isActive ? C.accentBg : "transparent", fontWeight: isActive ? 600 : hasItems ? 500 : 400, display: "flex", gap: 6, alignItems: "center", cursor: "pointer", opacity: isActive || hasItems ? 1 : 0.7 }}>
                    <span style={{ fontFeatureSettings: "'tnum'", fontSize: 9, color: isActive ? C.accent : hasItems ? C.textMuted : C.textDim }}>{subKey}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.name}</span>
                    {hasItems && <span style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>{sub.count}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Right panel: Item list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", paddingLeft: 10 }}>
          {/* Search bar + Custom button */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input placeholder="Search by code or name..." value={search}
                onChange={e => { setSearch(e.target.value); if (e.target.value) setSelectedSub(null); }} autoFocus
                style={inp(C, { width: "100%", paddingLeft: 32, padding: "8px 12px 8px 32" })} />
              <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <Ic d={I.search} size={14} color={C.textDim} />
              </div>
            </div>
            <button onClick={() => {
              setCustomMode(!customMode);
              if (!customMode && selectedSub) setCustomCode(selectedSub + ".");
            }} style={bt(C, {
              background: customMode ? C.accent : "transparent",
              border: `1px solid ${customMode ? C.accent : C.border}`,
              color: customMode ? "#fff" : C.textMuted,
              padding: "6px 12px", fontSize: 11, fontWeight: 600, flexShrink: 0,
            })}>
              <Ic d={I.plus} size={11} color={customMode ? "#fff" : C.textMuted} sw={2.5} /> Custom Item
            </button>
          </div>

          {/* Active subdivision label */}
          {selectedSub && !search && (
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{selectedSub} — {activeCodes[selectedSub.split(".")[0]]?.subs?.[selectedSub] || ""}</span>
              <span style={{ fontSize: 9, color: C.textDim }}>({filtered.length} items)</span>
            </div>
          )}

          {/* Custom entry form */}
          {customMode && (
            <div style={{ padding: "8px 10px", marginBottom: 8, borderRadius: 6, background: `${C.accent}08`, border: `1px solid ${C.accent}30`, display: "flex", gap: 8, alignItems: "center" }}>
              <input value={customCode} onChange={e => setCustomCode(e.target.value)} placeholder="Code (e.g. 03.310.10)"
                style={inp(C, { width: 120, fontFeatureSettings: "'tnum'", fontSize: 12, padding: "5px 8px" })} />
              <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Item name..." autoFocus
                style={inp(C, { flex: 1, fontSize: 12, padding: "5px 8px" })} />
              <select value={customUnit} onChange={e => setCustomUnit(e.target.value)}
                style={inp(C, { width: 60, fontSize: 11, padding: "5px 4px", textAlign: "center" })}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button disabled={!customCode || !customName} onClick={handleCustomPick}
                style={bt(C, {
                  background: customCode && customName ? C.accent : C.bg3,
                  color: customCode && customName ? "#fff" : C.textDim,
                  padding: "5px 14px", fontSize: 11, fontWeight: 600, border: "none", flexShrink: 0,
                })}>
                <Ic d={I.check} size={11} color={customCode && customName ? "#fff" : C.textDim} sw={2.5} /> Apply
              </button>
            </div>
          )}

          {/* Column headers */}
          <div style={{ fontSize: 10, display: "flex", gap: 3, padding: "4px 0", color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
            <div style={{ width: 70 }}>Code</div><div style={{ flex: 1 }}>Name</div><div style={{ width: 40 }}>Unit</div><div style={{ width: 55, textAlign: "right" }}>Matl</div><div style={{ width: 55, textAlign: "right" }}>Labor</div><div style={{ width: 55, textAlign: "right" }}>Equip</div><div style={{ width: 60, textAlign: "right" }}>Total</div>
          </div>

          {/* Item list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map(el => {
              const total = nn(el.material) + nn(el.labor) + nn(el.equipment);
              return (
                <div key={el.id || el.code} onClick={() => handlePick(el)}
                  style={{ display: "flex", gap: 3, padding: "5px 0", cursor: "pointer", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", transition: "background 0.1s" }}
                  onMouseOver={e => e.currentTarget.style.background = `${C.accent}08`}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 70, fontSize: 12, fontWeight: 600, color: C.purple, fontFeatureSettings: "'tnum'" }}>{el.code}</div>
                  <div style={{ flex: 1, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleCase(el.name)}</div>
                  <div style={{ width: 40, fontSize: 11, color: C.textDim }}>{el.unit}</div>
                  <div style={{ width: 55, textAlign: "right", fontSize: 12, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>{nn(el.material) > 0 ? fmt(nn(el.material)) : "—"}</div>
                  <div style={{ width: 55, textAlign: "right", fontSize: 12, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>{nn(el.labor) > 0 ? fmt(nn(el.labor)) : "—"}</div>
                  <div style={{ width: 55, textAlign: "right", fontSize: 12, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>{nn(el.equipment) > 0 ? fmt(nn(el.equipment)) : "—"}</div>
                  <div style={{ width: 60, textAlign: "right", fontSize: 12, fontWeight: 600, color: total > 0 ? C.accent : C.textDim, fontFeatureSettings: "'tnum'" }}>{total > 0 ? fmt(total) : "—"}</div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 32, textAlign: "center" }}>
                <Ic d={I.database} size={24} color={C.textDim} />
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>
                  {search ? "No matches found" : selectedSub ? `No items in ${selectedSub}` : "No items in database"}
                </div>
                {!customMode && (
                  <button onClick={() => { setCustomMode(true); if (selectedSub) setCustomCode(selectedSub + "."); }}
                    style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.accent, padding: "5px 12px", fontSize: 11, marginTop: 10 })}>
                    <Ic d={I.plus} size={11} color={C.accent} sw={2.5} /> Create Custom Item
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
