import { useMemo, useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useBidLevelingStore } from '@/stores/bidLevelingStore';
import { useProjectStore } from '@/stores/projectStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt } from '@/utils/format';

/* ─── Inline-editable cell ─── */
function BidCell({ value, status, onSave, highlight, C, T }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: "100%",
          padding: "2px 6px",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif",
          textAlign: "right",
          border: `1.5px solid ${C.accent}`,
          borderRadius: 3,
          outline: "none",
          background: C.bg,
          color: C.text,
          boxSizing: "border-box",
        }}
      />
    );
  }

  const display = status === "blank" ? "" : fmt(nn(value));
  const bg = highlight === "low" ? `${C.green}12` : highlight === "high" ? `${C.red || C.orange}12` : "transparent";
  const color = highlight === "low" ? C.green : highlight === "high" ? (C.red || C.orange) : (status === "blank" ? C.textDim : C.text);

  return (
    <div
      onClick={() => { setDraft(status === "blank" ? "" : String(value || "")); setEditing(true); }}
      title={status === "blank" ? "Click to enter bid" : `${status}: ${value}`}
      style={{
        padding: "2px 6px",
        fontSize: 11,
        fontWeight: status === "blank" ? 400 : 600,
        fontFamily: "'DM Sans',sans-serif",
        fontFeatureSettings: "'tnum'",
        textAlign: "right",
        cursor: "pointer",
        minHeight: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        background: bg,
        color,
        borderRadius: 2,
        transition: "background 0.1s",
      }}
    >
      {display || "—"}
    </div>
  );
}

export default function LevelingView() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const activeCodes = useProjectStore(s => s.getActiveCodes)();

  const subBidSubs = useBidLevelingStore(s => s.subBidSubs);
  const bidTotals = useBidLevelingStore(s => s.bidTotals);
  const setBidTotals = useBidLevelingStore(s => s.setBidTotals);
  const bidCells = useBidLevelingStore(s => s.bidCells);
  const setBidCells = useBidLevelingStore(s => s.setBidCells);
  const bidSelections = useBidLevelingStore(s => s.bidSelections);
  const setBidSelections = useBidLevelingStore(s => s.setBidSelections);
  const linkedSubs = useBidLevelingStore(s => s.linkedSubs);
  const subKeyLabels = useBidLevelingStore(s => s.subKeyLabels);

  const [collapsed, setCollapsed] = useState({});
  const [addSubSk, setAddSubSk] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const newSubRef = useRef(null);

  // Group items by subdivision
  const getSubKey = (item) => {
    const code = item.code || "";
    const sk = code.includes(".") ? code.split(".").slice(0, 2).join(".") : (item.division || "Unassigned").split(" - ")[0] || "00";
    return sk.includes(".") ? sk : `${sk}.00`;
  };

  const subdivisions = useMemo(() => {
    const groups = {};
    items.forEach(item => {
      const sk = getSubKey(item);
      if (!groups[sk]) groups[sk] = { sk, items: [], total: 0 };
      groups[sk].items.push(item);
      groups[sk].total += getItemTotal(item);
    });
    return Object.values(groups).sort((a, b) => a.sk.localeCompare(b.sk));
  }, [items]);

  // Collect ALL subs across all subdivisions for column headers
  const allSubs = useMemo(() => {
    const map = new Map();
    Object.entries(subBidSubs).forEach(([, subs]) => {
      (subs || []).forEach(s => { if (!map.has(s.id)) map.set(s.id, s); });
    });
    return Array.from(map.values());
  }, [subBidSubs]);

  const getSubSubs = (sk) => subBidSubs[sk] || [];
  const addSubBidSub = (sk, name) => {
    const current = useBidLevelingStore.getState().subBidSubs;
    const subs = [...(current[sk] || []), { id: `sub_${Date.now()}`, name: name || "" }];
    useBidLevelingStore.getState().setSubBidSubs({ ...current, [sk]: subs });
  };
  const updateSubBidSubName = (sk, subId, name) => {
    const current = useBidLevelingStore.getState().subBidSubs;
    useBidLevelingStore.getState().setSubBidSubs({ ...current, [sk]: (current[sk] || []).map(s => s.id === subId ? { ...s, name } : s) });
  };

  const getCell = (itemId, subId) => bidCells[`${itemId}_${subId}`] || { status: "blank", value: "" };
  const getCellComputedValue = (item, cell) => {
    if (cell.status === "blank") return 0;
    if (cell.status === "lumpsum" || cell.status === "amount") return nn(cell.value);
    if (cell.status === "unitrate") return nn(cell.value) * nn(item.quantity);
    if (cell.status === "carried") return getItemTotal(item);
    return 0;
  };

  const saveCell = (itemId, subId, value) => {
    const key = `${itemId}_${subId}`;
    const numVal = nn(value);
    setBidCells({ ...bidCells, [key]: numVal ? { status: "amount", value: String(numVal) } : { status: "blank", value: "" } });
  };

  const getSkSubTotal = (sk, subId) => {
    const skItems = subdivisions.find(s => s.sk === sk)?.items || [];
    let cellTotal = 0;
    let hasCells = false;
    skItems.forEach(item => {
      const cell = getCell(item.id, subId);
      if (cell.status !== "blank") {
        cellTotal += getCellComputedValue(item, cell);
        hasCells = true;
      }
    });
    if (hasCells) return cellTotal;
    return nn(bidTotals[subId]);
  };

  const getBidSelection = (sk) => bidSelections[sk] || { source: "", customValue: "" };
  const setBidSelection = (sk, updates) => {
    setBidSelections({ ...bidSelections, [sk]: { ...getBidSelection(sk), ...updates } });
  };
  const getSelectedBidValue = (sk) => {
    const sel = getBidSelection(sk);
    if (!sel.source) return 0;
    if (sel.source === "internal") return subdivisions.find(s => s.sk === sk)?.total || 0;
    if (sel.source === "custom") return nn(sel.customValue);
    if (sel.source.startsWith("linked_")) {
      const ls = linkedSubs.find(l => `linked_${l.id}` === sel.source);
      return ls ? nn(ls.totalBid) : 0;
    }
    return getSkSubTotal(sk, sel.source);
  };

  const getSubLabel = (sk) => {
    const dc = sk.split(".")[0];
    const subName = activeCodes[dc]?.subs?.[sk] || "";
    return subKeyLabels[sk] || `${sk} ${subName}`;
  };

  const totalBidValue = useMemo(() =>
    subdivisions.reduce((sum, sub) => sum + getSelectedBidValue(sub.sk), 0),
  [subdivisions, bidSelections, bidCells, bidTotals, subBidSubs, linkedSubs]);

  // Get highlight for a cell (lowest/highest among subs for a given item)
  const getHighlight = (item, subId, sk) => {
    const subs = getSubSubs(sk);
    if (subs.length < 2) return null;
    const values = subs.map(s => {
      const cell = getCell(item.id, s.id);
      return { id: s.id, val: getCellComputedValue(item, cell), blank: cell.status === "blank" };
    }).filter(v => !v.blank && v.val > 0);
    if (values.length < 2) return null;
    const min = Math.min(...values.map(v => v.val));
    const max = Math.max(...values.map(v => v.val));
    const thisCell = getCell(item.id, subId);
    const thisVal = getCellComputedValue(item, thisCell);
    if (thisCell.status === "blank" || thisVal === 0) return null;
    if (thisVal === min && min !== max) return "low";
    if (thisVal === max && min !== max) return "high";
    return null;
  };

  // Focus new sub input when addSubSk changes
  useEffect(() => {
    if (addSubSk && newSubRef.current) newSubRef.current.focus();
  }, [addSubSk]);

  const fixedCols = 5; // #, Code, Desc, Qty, Unit
  const subColWidth = 110;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Summary bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", flexShrink: 0,
        background: `${C.green}08`, borderBottom: `1px solid ${C.green}30`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>
          Bid Leveling — {subdivisions.length} subdivisions · {items.length} items
        </span>
        <span style={{
          fontSize: 18, fontWeight: 700, color: C.green,
          fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
        }}>
          {fmt(totalBidValue)}
        </span>
      </div>

      {/* Spreadsheet grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 11,
          fontFamily: "'DM Sans',sans-serif",
          tableLayout: "auto",
        }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 10, background: C.bg }}>
              <th style={{ ...thStyle(C), width: 30, textAlign: "center" }}>#</th>
              <th style={{ ...thStyle(C), width: 70 }}>Code</th>
              <th style={{ ...thStyle(C), minWidth: 180 }}>Description</th>
              <th style={{ ...thStyle(C), width: 60, textAlign: "right" }}>Qty</th>
              <th style={{ ...thStyle(C), width: 40, textAlign: "center" }}>Unit</th>
              <th style={{ ...thStyle(C), width: subColWidth, textAlign: "right", color: C.accent, borderLeft: `2px solid ${C.accent}30` }}>Internal</th>
              {allSubs.map(sub => {
                const sel = Object.entries(bidSelections).some(([, v]) => v.source === sub.id);
                return (
                  <th key={sub.id} style={{
                    ...thStyle(C),
                    width: subColWidth,
                    textAlign: "right",
                    borderLeft: sel ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                    color: sel ? C.green : C.text,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                      <input
                        value={sub.name}
                        onChange={e => {
                          // Find which sk this sub belongs to and update
                          Object.entries(subBidSubs).forEach(([sk, subs]) => {
                            if (subs.some(s => s.id === sub.id)) updateSubBidSubName(sk, sub.id, e.target.value);
                          });
                        }}
                        placeholder="Sub name"
                        style={{
                          background: "transparent",
                          border: "none",
                          fontSize: 10,
                          fontWeight: 700,
                          color: sel ? C.green : C.text,
                          textAlign: "right",
                          width: "100%",
                          outline: "none",
                          padding: 0,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      />
                    </div>
                  </th>
                );
              })}
              <th style={{ ...thStyle(C), width: 36 }}>
                {/* Add sub button placeholder */}
              </th>
            </tr>
          </thead>
          <tbody>
            {subdivisions.map((sub, subIdx) => {
              const subs = getSubSubs(sub.sk);
              const sel = getBidSelection(sub.sk);
              const isCollapsed = collapsed[sub.sk];
              const skLinked = linkedSubs.filter(ls => (ls.subKeys || []).includes(sub.sk));

              return (
                <SubdivisionGroup
                  key={sub.sk}
                  sub={sub}
                  subIdx={subIdx}
                  subs={subs}
                  allSubs={allSubs}
                  sel={sel}
                  isCollapsed={isCollapsed}
                  C={C}
                  T={T}
                  subColWidth={subColWidth}
                  getCell={getCell}
                  getCellComputedValue={getCellComputedValue}
                  saveCell={saveCell}
                  getHighlight={getHighlight}
                  getItemTotal={getItemTotal}
                  getSubLabel={getSubLabel}
                  getSkSubTotal={getSkSubTotal}
                  getSelectedBidValue={getSelectedBidValue}
                  setBidSelection={setBidSelection}
                  setBidTotals={setBidTotals}
                  bidTotals={bidTotals}
                  onToggle={() => setCollapsed(c => ({ ...c, [sub.sk]: !c[sub.sk] }))}
                  onAddSub={() => { setAddSubSk(sub.sk); setNewSubName(""); }}
                  addSubSk={addSubSk}
                  newSubName={newSubName}
                  setNewSubName={setNewSubName}
                  newSubRef={newSubRef}
                  onConfirmAddSub={() => {
                    addSubBidSub(sub.sk, newSubName);
                    setAddSubSk(null);
                    setNewSubName("");
                  }}
                  onCancelAddSub={() => { setAddSubSk(null); setNewSubName(""); }}
                  skLinked={skLinked}
                  linkedSubs={linkedSubs}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Subdivision group (header + items + subtotal) ─── */
function SubdivisionGroup({
  sub, subIdx, subs, allSubs, sel, isCollapsed, C, T, subColWidth,
  getCell, getCellComputedValue, saveCell, getHighlight, getItemTotal, getSubLabel,
  getSkSubTotal, getSelectedBidValue, setBidSelection, setBidTotals, bidTotals,
  onToggle, onAddSub, addSubSk, newSubName, setNewSubName, newSubRef,
  onConfirmAddSub, onCancelAddSub, skLinked, linkedSubs,
}) {
  const selVal = getSelectedBidValue(sub.sk);
  const totalCols = 6 + allSubs.length + 1; // fixed + internal + subs + add btn

  return (
    <>
      {/* ─── Subdivision header row ─── */}
      <tr
        onClick={onToggle}
        style={{
          background: sel.source ? `${C.green}06` : C.bg2,
          cursor: "pointer",
        }}
      >
        <td
          colSpan={5}
          style={{
            padding: "6px 10px",
            fontWeight: 700,
            fontSize: 12,
            color: C.text,
            borderBottom: `1px solid ${C.border}`,
            borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {getSubLabel(sub.sk)}
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>
              ({sub.items.length} items)
            </span>
          </div>
        </td>
        <td style={{
          padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: 11,
          color: C.accent, borderBottom: `1px solid ${C.border}`, borderLeft: `2px solid ${C.accent}30`,
          borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
          fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
        }}>
          {fmt(sub.total)}
        </td>
        {allSubs.map(s => {
          const isSk = subs.some(ss => ss.id === s.id);
          const subTotal = isSk ? getSkSubTotal(sub.sk, s.id) : 0;
          const isSelected = sel.source === s.id;
          return (
            <td key={s.id} style={{
              padding: "6px 8px", textAlign: "right", fontWeight: 700, fontSize: 11,
              color: isSelected ? C.green : (isSk ? C.text : C.textDim),
              borderBottom: `1px solid ${C.border}`,
              borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
              borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
              fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
              background: isSelected ? `${C.green}08` : undefined,
            }}>
              {isSk ? fmt(subTotal) : "—"}
            </td>
          );
        })}
        <td style={{
          padding: "6px 4px", textAlign: "center",
          borderBottom: `1px solid ${C.border}`,
          borderTop: subIdx > 0 ? `2px solid ${C.border}` : `1px solid ${C.border}`,
        }}>
          <button
            onClick={e => { e.stopPropagation(); onAddSub(); }}
            title="Add subcontractor to this trade"
            style={{
              width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 4,
              background: "transparent", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Ic d={I.plus} size={10} color={C.accent} sw={2} />
          </button>
        </td>
      </tr>

      {/* Add sub inline form */}
      {addSubSk === sub.sk && (
        <tr>
          <td colSpan={totalCols} style={{ padding: "4px 10px", borderBottom: `1px solid ${C.border}`, background: `${C.accent}06` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>New sub:</span>
              <input
                ref={newSubRef}
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") onConfirmAddSub();
                  if (e.key === "Escape") onCancelAddSub();
                }}
                placeholder="Subcontractor name..."
                style={{
                  flex: 1, maxWidth: 200, padding: "3px 8px", fontSize: 11,
                  border: `1px solid ${C.accent}40`, borderRadius: 4, outline: "none",
                  background: C.bg, color: C.text, fontFamily: "'DM Sans',sans-serif",
                }}
              />
              <button onClick={onConfirmAddSub}
                style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, border: "none", borderRadius: 4, background: C.accent, color: "#fff", cursor: "pointer" }}>
                Add
              </button>
              <button onClick={onCancelAddSub}
                style={{ padding: "3px 8px", fontSize: 10, border: `1px solid ${C.border}`, borderRadius: 4, background: "transparent", color: C.textDim, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}

      {/* ─── Item rows (hidden when collapsed) ─── */}
      {!isCollapsed && sub.items.map((item, rowIdx) => {
        return (
          <tr key={item.id} style={{ background: rowIdx % 2 === 0 ? "transparent" : `${C.text}03` }}>
            <td style={{ ...tdStyle(C), textAlign: "center", color: C.textDim, fontSize: 9 }}>{rowIdx + 1}</td>
            <td style={{ ...tdStyle(C), fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{item.code || "—"}</td>
            <td style={{ ...tdStyle(C), fontSize: 11, color: C.text, fontWeight: 500 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }} title={item.name}>
                {item.name || "Untitled"}
              </div>
            </td>
            <td style={{ ...tdStyle(C), textAlign: "right", fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'", fontSize: 10, fontWeight: 600 }}>
              {nn(item.quantity) || "—"}
            </td>
            <td style={{ ...tdStyle(C), textAlign: "center", fontSize: 9, color: C.textDim }}>
              {item.unit || "—"}
            </td>
            <td style={{ ...tdStyle(C), textAlign: "right", fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'", color: C.accent, fontWeight: 600, borderLeft: `2px solid ${C.accent}30`, fontSize: 10 }}>
              {fmt(getItemTotal ? getItemTotal(item) : 0)}
            </td>
            {allSubs.map(s => {
              const isSk = subs.some(ss => ss.id === s.id);
              if (!isSk) {
                return (
                  <td key={s.id} style={{ ...tdStyle(C), textAlign: "center", color: `${C.textDim}60`, fontSize: 9, borderLeft: `1px solid ${C.border}` }}>
                    ·
                  </td>
                );
              }
              const cell = getCell(item.id, s.id);
              const highlight = getHighlight(item, s.id, sub.sk);
              const isSelected = sel.source === s.id;
              return (
                <td key={s.id} style={{
                  ...tdStyle(C),
                  padding: "1px 2px",
                  borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                  background: isSelected ? `${C.green}04` : undefined,
                }}>
                  <BidCell
                    value={cell.value}
                    status={cell.status}
                    onSave={val => saveCell(item.id, s.id, val)}
                    highlight={highlight}
                    C={C}
                    T={T}
                  />
                </td>
              );
            })}
            <td style={{ ...tdStyle(C), width: 36 }} />
          </tr>
        );
      })}

      {/* ─── Selection / subtotal row ─── */}
      <tr style={{ background: sel.source ? `${C.green}08` : C.bg2 }}>
        <td colSpan={5} style={{
          padding: "5px 10px",
          borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
          fontSize: 10, fontWeight: 700, color: sel.source ? C.green : C.textMuted,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Ic d={I.check} size={12} color={sel.source ? C.green : C.textDim} />
            <select
              value={sel.source}
              onChange={e => { e.stopPropagation(); setBidSelection(sub.sk, { source: e.target.value }); }}
              onClick={e => e.stopPropagation()}
              style={{
                padding: "3px 6px", fontSize: 10, fontWeight: 600,
                border: `1px solid ${sel.source ? C.green + "60" : C.border}`,
                borderRadius: 4, background: C.bg, color: sel.source ? C.green : C.textMuted,
                cursor: "pointer", outline: "none", fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <option value="">Select winner...</option>
              <option value="internal">Internal ({fmt(sub.total)})</option>
              {subs.map(s => {
                const st = getSkSubTotal(sub.sk, s.id);
                return <option key={s.id} value={s.id}>{s.name || "Unnamed"} ({st > 0 ? fmt(st) : "—"})</option>;
              })}
              {skLinked.map(ls => <option key={ls.id} value={`linked_${ls.id}`}>{ls.name || "Linked"} ({fmt(nn(ls.totalBid))})</option>)}
              <option value="custom">Custom...</option>
            </select>
            {sel.source === "custom" && (
              <input
                type="number"
                value={sel.customValue || ""}
                onChange={e => setBidSelection(sub.sk, { customValue: e.target.value })}
                onClick={e => e.stopPropagation()}
                placeholder="$0"
                style={{
                  width: 80, padding: "3px 6px", fontSize: 11, fontWeight: 700,
                  border: `1px solid ${C.green}`, borderRadius: 4, background: C.bg,
                  color: C.green, textAlign: "right", outline: "none",
                  fontFamily: "'DM Sans',sans-serif",
                }}
              />
            )}
            {sel.source && (
              <span style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'" }}>
                → {fmt(selVal)}
              </span>
            )}
          </div>
        </td>
        <td style={{
          padding: "5px 8px", textAlign: "right", fontWeight: 700, fontSize: 11,
          borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
          borderLeft: `2px solid ${C.accent}30`,
          color: sel.source === "internal" ? C.green : C.accent,
          fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
          background: sel.source === "internal" ? `${C.green}12` : undefined,
        }}>
          {fmt(sub.total)}
        </td>
        {allSubs.map(s => {
          const isSk = subs.some(ss => ss.id === s.id);
          const subTotal = isSk ? getSkSubTotal(sub.sk, s.id) : 0;
          const isSelected = sel.source === s.id;
          return (
            <td key={s.id} style={{
              padding: "5px 8px", textAlign: "right", fontWeight: 700, fontSize: 11,
              borderBottom: `2px solid ${sel.source ? C.green : C.border}`,
              borderLeft: isSelected ? `2px solid ${C.green}` : `1px solid ${C.border}`,
              color: isSelected ? C.green : (isSk ? C.text : C.textDim),
              fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
              background: isSelected ? `${C.green}12` : undefined,
            }}>
              {isSk ? fmt(subTotal) : "—"}
            </td>
          );
        })}
        <td style={{ borderBottom: `2px solid ${sel.source ? C.green : C.border}` }} />
      </tr>
    </>
  );
}

/* ─── Style helpers ─── */
function thStyle(C) {
  return {
    padding: "6px 8px",
    fontSize: 9,
    fontWeight: 700,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `2px solid ${C.border}`,
    position: "sticky",
    top: 0,
    background: C.bg,
    zIndex: 10,
    whiteSpace: "nowrap",
    fontFamily: "'DM Sans',sans-serif",
  };
}

function tdStyle(C) {
  return {
    padding: "3px 8px",
    borderBottom: `1px solid ${C.border}40`,
    verticalAlign: "middle",
  };
}
