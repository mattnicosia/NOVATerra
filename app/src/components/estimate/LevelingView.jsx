import { useMemo, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useBidLevelingStore } from '@/stores/bidLevelingStore';
import { useProjectStore } from '@/stores/projectStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt, card } from '@/utils/styles';
import { nn, fmt } from '@/utils/format';

export default function LevelingView() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const activeCodes = useProjectStore(s => s.getActiveCodes)();

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

  const getSubSubs = (sk) => subBidSubs[sk] || [];
  const addSubBidSub = (sk) => {
    const current = useBidLevelingStore.getState().subBidSubs;
    const subs = [...(current[sk] || []), { id: `sub_${Date.now()}`, name: "" }];
    useBidLevelingStore.getState().setSubBidSubs({ ...current, [sk]: subs });
  };
  const updateSubBidSubName = (sk, subId, name) => {
    const current = useBidLevelingStore.getState().subBidSubs;
    useBidLevelingStore.getState().setSubBidSubs({ ...current, [sk]: (current[sk] || []).map(s => s.id === subId ? { ...s, name } : s) });
  };
  const removeSubBidSub = (sk, subId) => {
    const current = useBidLevelingStore.getState().subBidSubs;
    useBidLevelingStore.getState().setSubBidSubs({ ...current, [sk]: (current[sk] || []).filter(s => s.id !== subId) });
  };

  const getCell = (itemId, subId) => bidCells[`${itemId}_${subId}`] || { status: "blank", value: "" };
  const getCellComputedValue = (item, cell) => {
    if (cell.status === "blank") return 0;
    if (cell.status === "lumpsum" || cell.status === "amount") return nn(cell.value);
    if (cell.status === "unitrate") return nn(cell.value) * nn(item.quantity);
    if (cell.status === "carried") return getItemTotal(item);
    return 0;
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

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: T.space[5] }}>
      {/* Summary bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: T.space[5], padding: `${T.space[3]}px ${T.space[4]}px`,
        background: `${C.green}08`, border: `1px solid ${C.green}30`,
        borderRadius: T.radius.md,
      }}>
        <span style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: C.green }}>
          Bid Leveling — {subdivisions.length} subdivisions
        </span>
        <span style={{
          fontSize: T.fontSize.xl, fontWeight: 700, color: C.green,
          fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'",
        }}>
          {fmt(totalBidValue)}
        </span>
      </div>

      {/* Division cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        {subdivisions.map(sub => {
          const subs = getSubSubs(sub.sk);
          const sel = getBidSelection(sub.sk);
          const selVal = getSelectedBidValue(sub.sk);
          const skLinked = linkedSubs.filter(ls => (ls.subKeys || []).includes(sub.sk));

          return (
            <div key={sub.sk} style={card(C, { padding: 0, overflow: "hidden" })}>
              {/* Card header */}
              <div style={{
                padding: `${T.space[3]}px ${T.space[4]}px`,
                borderBottom: `1px solid ${C.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: sel.source ? `${C.green}06` : undefined,
              }}>
                <div>
                  <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text }}>{getSubLabel(sub.sk)}</div>
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{sub.items.length} items</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>Internal</div>
                  <div style={{ fontSize: T.fontSize.base, fontWeight: 700, color: C.text, fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'" }}>{fmt(sub.total)}</div>
                </div>
              </div>

              {/* Sub bids table */}
              <div style={{ padding: `${T.space[3]}px ${T.space[4]}px` }}>
                {subs.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Sub header row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: 8, alignItems: "center", fontSize: T.fontSize.xs, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, paddingBottom: 4, borderBottom: `1px solid ${C.border}30` }}>
                      <span>Subcontractor</span>
                      <span style={{ textAlign: "right" }}>Total</span>
                      <span />
                    </div>
                    {/* Sub rows */}
                    {subs.map(subBid => {
                      const subTotal = getSkSubTotal(sub.sk, subBid.id);
                      const isSelected = sel.source === subBid.id;
                      return (
                        <div key={subBid.id} style={{
                          display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: 8, alignItems: "center",
                          padding: "6px 0",
                          borderLeft: isSelected ? `3px solid ${C.green}` : "3px solid transparent",
                          paddingLeft: 8,
                          background: isSelected ? `${C.green}08` : undefined,
                          borderRadius: 4,
                        }}>
                          <input value={subBid.name} onChange={e => updateSubBidSubName(sub.sk, subBid.id, e.target.value)}
                            placeholder="Sub name..."
                            style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 4px", fontSize: T.fontSize.sm, fontWeight: 600 })} />
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <input type="number" value={bidTotals[subBid.id] || ""}
                              onChange={e => setBidTotals({ ...bidTotals, [subBid.id]: e.target.value })}
                              placeholder="$0"
                              style={nInp(C, { width: "100%", padding: "3px 6px", fontSize: T.fontSize.sm, fontWeight: 600, textAlign: "right" })} />
                            {subTotal > 0 && subTotal !== nn(bidTotals[subBid.id]) && (
                              <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>Items: {fmt(subTotal)}</span>
                            )}
                          </div>
                          <button onClick={() => removeSubBidSub(sub.sk, subBid.id)}
                            style={{ width: 24, height: 24, border: `1px solid ${C.border}`, background: "transparent", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            <Ic d={I.x} size={10} color={C.red} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: T.space[3], color: C.textDim, fontSize: T.fontSize.xs }}>
                    No subs added yet
                  </div>
                )}

                {/* Linked subs */}
                {skLinked.length > 0 && (
                  <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}30`, paddingTop: 8 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, textTransform: "uppercase", letterSpacing: 0.5 }}>Linked Subs</span>
                    {skLinked.map(ls => (
                      <div key={ls.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: T.fontSize.xs }}>
                        <span style={{ color: C.orange }}>{ls.name || "Linked"}</span>
                        <span style={{ fontFamily: "'DM Sans',sans-serif", color: C.orange, fontWeight: 600 }}>{fmt(nn(ls.totalBid))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add sub button */}
                <button onClick={() => addSubBidSub(sub.sk)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, marginTop: 8,
                    padding: "5px 0", background: "transparent", border: "none",
                    color: C.accent, cursor: "pointer", fontSize: T.fontSize.xs, fontWeight: 600,
                    fontFamily: "'DM Sans',sans-serif",
                  }}>
                  <Ic d={I.plus} size={10} color={C.accent} sw={2.5} /> Add Sub
                </button>
              </div>

              {/* Bid selection */}
              <div style={{
                padding: `${T.space[3]}px ${T.space[4]}px`,
                borderTop: `2px solid ${sel.source ? C.green : C.border}`,
                background: sel.source ? `${C.green}08` : C.bg,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Ic d={I.check} size={14} color={sel.source ? C.green : C.textDim} />
                <select value={sel.source} onChange={e => setBidSelection(sub.sk, { source: e.target.value })}
                  style={inp(C, { flex: 1, padding: "5px 8px", fontSize: T.fontSize.sm, fontWeight: 600, border: `1px solid ${sel.source ? C.green : C.border}`, color: sel.source ? C.green : C.textMuted })}>
                  <option value="">Select Source</option>
                  <option value="internal">Internal ({fmt(sub.total)})</option>
                  {subs.map(s => {
                    const st = getSkSubTotal(sub.sk, s.id);
                    return <option key={s.id} value={s.id}>{s.name || "Unnamed"} ({st > 0 ? fmt(st) : "no data"})</option>;
                  })}
                  {skLinked.map(ls => <option key={ls.id} value={`linked_${ls.id}`}>{ls.name || "Linked"} ({fmt(nn(ls.totalBid))})</option>)}
                  <option value="custom">Custom...</option>
                </select>
                {sel.source === "custom" && (
                  <input type="number" value={sel.customValue || ""} onChange={e => setBidSelection(sub.sk, { customValue: e.target.value })}
                    placeholder="$0" style={nInp(C, { width: 100, padding: "5px 8px", fontSize: T.fontSize.base, fontWeight: 700, color: C.green, border: `1px solid ${C.green}` })} />
                )}
                {sel.source && (
                  <span style={{ fontSize: T.fontSize.base, fontWeight: 700, color: C.green, fontFamily: "'DM Sans',sans-serif", fontFeatureSettings: "'tnum'", whiteSpace: "nowrap" }}>
                    {fmt(selVal)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
