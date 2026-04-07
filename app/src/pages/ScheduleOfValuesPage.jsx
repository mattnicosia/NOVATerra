import { useState, useMemo, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore, DEFAULT_MARKUP_ORDER } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useBidManagementStore } from "@/stores/bidManagementStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import { nn, fmt, uid } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";

// Local-state input to prevent scroll-to-top on every keystroke
function LocalInput({ value, onCommit, ...props }) {
  const [local, setLocal] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current !== document.activeElement) setLocal(value);
  }, [value]);
  return (
    <input ref={ref} {...props} value={local} onChange={e => setLocal(e.target.value)} onBlur={() => onCommit(local)} />
  );
}

export default function ScheduleOfValuesPage() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const markup = useItemsStore(s => s.markup);
  const setMarkup = useItemsStore(s => s.setMarkup);
  const markupOrder = useItemsStore(s => s.markupOrder) || DEFAULT_MARKUP_ORDER;
  const setMarkupOrder = useItemsStore(s => s.setMarkupOrder);
  const customMarkups = useItemsStore(s => s.customMarkups);
  const setCustomMarkups = useItemsStore(s => s.setCustomMarkups);
  const updateCustomMarkup = useItemsStore(s => s.updateCustomMarkup);
  const getActiveCodes = useProjectStore(s => s.getActiveCodes);
  const activeCodes = getActiveCodes();
  const bidSelections = useBidManagementStore(s => s.bidSelections);
  const subKeyLabels = useBidManagementStore(s => s.subKeyLabels);

  // Local SOV state
  const [sovGroupBy, setSovGroupBy] = useState("trade");
  const [sovCatMarkup, setSovCatMarkup] = useState({ material: "", labor: "", equipment: "", sub: "" });
  const [sovBlockOrder, setSovBlockOrder] = useState(["sov-grid", "comparison", "markup"]);
  const sovDragItem = useRef(null);
  const sovDragOver = useRef(null);

  const sovDragSort = () => {
    const from = sovBlockOrder.indexOf(sovDragItem.current);
    const to = sovBlockOrder.indexOf(sovDragOver.current);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...sovBlockOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSovBlockOrder(next);
  };

  // Helper to get subdivision key from item
  const getSubKey = item => {
    if (!item.code) return "";
    const parts = item.code.split(".");
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
  };

  const getBidSelection = sk => bidSelections[sk] || { source: "internal" };

  // Compute totals matching what itemsStore.getTotals produces
  // Order must match store: standard markups → tax → bond → custom markups
  const estimateTotals = useMemo(() => {
    let material = 0,
      labor = 0,
      equipment = 0,
      sub = 0;
    items.forEach(it => {
      const q = nn(it.quantity);
      material += q * nn(it.material);
      labor += q * nn(it.labor);
      equipment += q * nn(it.equipment);
      sub += q * nn(it.subcontractor);
    });
    const direct = material + labor + equipment + sub;

    // Ordered markup calculation — skip inactive markups (matches store)
    let running = direct;
    const markupAmounts = {};
    markupOrder.forEach(mo => {
      if (mo.active === false) { markupAmounts[mo.key] = 0; return; }
      const pct = nn(markup[mo.key]);
      if (pct === 0) {
        markupAmounts[mo.key] = 0;
        return;
      }
      const base = mo.compound ? running : direct;
      const amt = Math.round((base * pct) / 100 * 100) / 100;
      markupAmounts[mo.key] = amt;
      running += amt;
    });
    const subtotal = running;

    // Tax on post-markup subtotal (matches store order)
    const tx = Math.round(subtotal * nn(markup.tax) / 100 * 100) / 100;
    // Bond on (subtotal + tax)
    const bd = Math.round((subtotal + tx) * nn(markup.bond) / 100 * 100) / 100;
    let afterTaxBond = subtotal + tx + bd;

    // Custom markups on post-tax-bond total (matches store order)
    const customAmounts = customMarkups.map(cm => {
      let amt = 0;
      if (cm.type === "pct") {
        amt = Math.round(afterTaxBond * nn(cm.value) / 100 * 100) / 100;
        afterTaxBond += amt;
      } else {
        amt = Math.round(nn(cm.value) * 100) / 100;
        afterTaxBond += amt;
      }
      return { id: cm.id, label: cm.label, type: cm.type, value: cm.value, amount: amt };
    });
    const customTotal = customAmounts.reduce((s, a) => s + a.amount, 0);
    const grand = afterTaxBond;
    return {
      material,
      labor,
      equipment,
      sub,
      direct,
      markupAmounts,
      subtotal,
      customAmounts,
      customTotal,
      afterCustom: grand,
      bd,
      tx,
      grand,
    };
  }, [items, markup, markupOrder, customMarkups]);

  // SOV computation
  const sovData = useMemo(() => {
    const catMkup = {
      material: 1 + nn(sovCatMarkup.material) / 100,
      labor: 1 + nn(sovCatMarkup.labor) / 100,
      equipment: 1 + nn(sovCatMarkup.equipment) / 100,
      sub: 1 + nn(sovCatMarkup.sub) / 100,
    };
    const hasCatMkup = Object.values(sovCatMarkup).some(v => nn(v) !== 0);
    // Compute effective markup factor from direct to post-standard-markups
    // Use the same ordered logic: compound items multiply running total, non-compound add from base
    let mkupRunning = 1; // represents multiplier from direct
    markupOrder.forEach(mo => {
      const pct = nn(markup[mo.key]);
      if (pct === 0) return;
      if (mo.compound) {
        mkupRunning *= 1 + pct / 100;
      } else {
        mkupRunning += pct / 100;
      }
    });
    const mkupFactor = mkupRunning;
    const customPctFactor = customMarkups.filter(cm => cm.type === "pct").reduce((f, cm) => f + nn(cm.value) / 100, 0);
    const customFlatTotal = customMarkups.filter(cm => cm.type === "flat").reduce((s, cm) => s + nn(cm.value), 0);
    const bondFactor = 1 + nn(markup.bond) / 100;
    const taxFactor = 1 + nn(markup.tax) / 100;

    const groups = {};
    items.forEach(item => {
      let key, label, sortVal;
      if (sovGroupBy === "trade") {
        label = getTradeLabel(item);
        key = label;
        sortVal = getTradeSortOrder(item);
      } else if (sovGroupBy === "subdivision") {
        key = getSubKey(item);
        const dc = key.split(".")[0];
        const customLbl = subKeyLabels[key];
        label = customLbl
          ? `${key} \u2014 ${customLbl}`
          : `${key} \u2014 ${activeCodes[dc]?.subs?.[key] || activeCodes[dc]?.name || key}`;
      } else {
        key = item.division || "Unassigned";
        label = key;
      }
      if (!groups[key])
        groups[key] = {
          label,
          material: 0,
          labor: 0,
          equipment: 0,
          sub: 0,
          items: [],
          subKeys: new Set(),
          sortVal: sortVal ?? 0,
        };
      const q = nn(item.quantity);
      groups[key].material += q * nn(item.material);
      groups[key].labor += q * nn(item.labor);
      groups[key].equipment += q * nn(item.equipment);
      groups[key].sub += q * nn(item.subcontractor);
      groups[key].items.push(item);
      groups[key].subKeys.add(getSubKey(item));
    });

    const grandDirectPreCalc = Object.values(groups).reduce(
      (s, g) =>
        s +
        (g.material * catMkup.material +
          g.labor * catMkup.labor +
          g.equipment * catMkup.equipment +
          g.sub * catMkup.sub),
      0,
    );
    const sortedGroups = Object.entries(groups).sort(([a, ag], [b, bg]) =>
      sovGroupBy === "trade" ? ag.sortVal - bg.sortVal : a.localeCompare(b),
    );
    let grandDirect = 0,
      grandMarkup = 0,
      grandTotal = 0;

    const getGroupSource = (key, g) => {
      const internal = g.material + g.labor + g.equipment;
      const subAmt = g.sub;
      const bidSources = [...g.subKeys].map(sk => getBidSelection(sk).source).filter(Boolean);
      const hasLinked = bidSources.some(s => s.startsWith("linked_"));
      const hasBidSub = bidSources.some(s => s && s !== "internal" && s !== "custom" && !s.startsWith("linked_"));
      const hasBidInternal = bidSources.some(s => s === "internal");
      const hasCustom = bidSources.some(s => s === "custom");
      if (hasLinked) return { label: "Linked Sub", color: C.orange };
      if (hasBidSub && hasBidInternal) return { label: "Mixed", color: C.purple };
      if (hasBidSub) return { label: "Sub", color: C.blue };
      if (hasCustom) return { label: "Custom", color: C.cyan || C.blue };
      if (subAmt > 0 && internal > 0) return { label: "Mixed", color: C.purple };
      if (subAmt > 0 && internal === 0) return { label: "Sub", color: C.blue };
      if (internal > 0) return { label: "Internal", color: C.green };
      return { label: "\u2014", color: C.textDim };
    };

    const rowData = sortedGroups.map(([key, g]) => {
      const adjMat = g.material * catMkup.material,
        adjLab = g.labor * catMkup.labor,
        adjEqp = g.equipment * catMkup.equipment,
        adjSub = g.sub * catMkup.sub;
      const direct = adjMat + adjLab + adjEqp + adjSub;
      const marked = direct * mkupFactor;
      const afterCustomPct = marked * (1 + customPctFactor);
      const shareRatio = grandDirectPreCalc > 0 ? direct / grandDirectPreCalc : 0;
      const afterCustom = afterCustomPct + customFlatTotal * shareRatio;
      const withBondTax = afterCustom * bondFactor * taxFactor;
      grandDirect += direct;
      grandMarkup += afterCustom;
      grandTotal += withBondTax;
      const src = getGroupSource(key, g);
      return { key, g, adjMat, adjLab, adjEqp, adjSub, direct, afterCustom, withBondTax, src };
    });

    // Column totals
    const grandMat = rowData.reduce((s, r) => s + r.adjMat, 0);
    const grandLab = rowData.reduce((s, r) => s + r.adjLab, 0);
    const grandEqp = rowData.reduce((s, r) => s + r.adjEqp, 0);
    const grandSub = rowData.reduce((s, r) => s + r.adjSub, 0);

    return {
      rowData,
      grandDirect,
      grandMarkup,
      grandTotal,
      grandMat,
      grandLab,
      grandEqp,
      grandSub,
      hasCatMkup,
      catMkup,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, markup, markupOrder, customMarkups, sovGroupBy, sovCatMarkup, activeCodes, bidSelections, subKeyLabels]); // C theme colors and getBidSelection are stable within a render

  // Draggable block wrapper
  const DBlock = ({ id, title, children }) => (
    <div
      draggable
      onDragStart={() => {
        sovDragItem.current = id;
      }}
      onDragEnter={() => {
        sovDragOver.current = id;
      }}
      onDragEnd={sovDragSort}
      onDragOver={e => e.preventDefault()}
      style={{
        marginBottom: 14,
        background: C.bg1,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        overflow: "hidden",
        transition: "box-shadow 0.15s",
      }}
    >
      <div
        style={{
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "grab",
          borderBottom: `1px solid ${C.border}`,
          background: C.bg2,
          userSelect: "none",
        }}
        onMouseDown={e => (e.currentTarget.style.cursor = "grabbing")}
        onMouseUp={e => (e.currentTarget.style.cursor = "grab")}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill={C.textDim}>
          <circle cx="3" cy="2" r="1.2" />
          <circle cx="7" cy="2" r="1.2" />
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="3" cy="12" r="1.2" />
          <circle cx="7" cy="12" r="1.2" />
        </svg>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            flex: 1,
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );

  const blocks = {
    "sov-grid": (
      <DBlock key="sov-grid" id="sov-grid" title="Schedule of Values Grid">
        {/* Controls */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ display: "flex", background: C.bg2, borderRadius: 4, overflow: "hidden" }}>
              {["trade", "subdivision", "division"].map(g => (
                <button
                  key={g}
                  onClick={() => setSovGroupBy(g)}
                  style={{
                    padding: "5px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: sovGroupBy === g ? C.accent : "transparent",
                    color: sovGroupBy === g ? "#fff" : C.textMuted,
                  }}
                >
                  {g === "trade" ? "By Trade Bundle" : g === "subdivision" ? "By Subdivision" : "By Division"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: C.accentBg,
                  borderRadius: 6,
                  border: `1px solid ${C.accent}30`,
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 700, color: C.accent }}>All</span>
                <input
                  type="number"
                  placeholder="0"
                  onChange={e => {
                    const v = e.target.value;
                    setSovCatMarkup({ material: v, labor: v, equipment: v, sub: v });
                  }}
                  value={
                    sovCatMarkup.material === sovCatMarkup.labor &&
                    sovCatMarkup.labor === sovCatMarkup.equipment &&
                    sovCatMarkup.equipment === sovCatMarkup.sub
                      ? sovCatMarkup.material
                      : ""
                  }
                  style={nInp(C, {
                    width: 42,
                    padding: "2px 3px",
                    fontSize: 10,
                    fontWeight: 700,
                    textAlign: "center",
                    border: `1px solid ${C.accent}30`,
                  })}
                />
                <span style={{ fontSize: 8, color: C.textDim }}>%</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: C.bg,
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 600, color: C.textDim }}>Adjust</span>
                {[
                  { k: "material", label: "M", color: C.green },
                  { k: "labor", label: "L", color: C.blue },
                  { k: "equipment", label: "E", color: C.orange },
                  { k: "sub", label: "S", color: C.purple },
                ].map(c => (
                  <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: c.color }}>{c.label}</span>
                    <input
                      type="number"
                      value={sovCatMarkup[c.k]}
                      onChange={e => setSovCatMarkup(p => ({ ...p, [c.k]: e.target.value }))}
                      placeholder="0"
                      style={nInp(C, {
                        width: 36,
                        padding: "2px 3px",
                        fontSize: 10,
                        fontWeight: 700,
                        textAlign: "center",
                      })}
                    />
                    <span style={{ fontSize: 8, color: C.textDim }}>%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "7px 12px",
            fontSize: 8,
            fontWeight: 700,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            borderBottom: `2px solid ${C.border}`,
            background: C.bg2,
            borderRadius: "4px 4px 0 0",
          }}
        >
          <div style={{ flex: 3, minWidth: 180 }}>
            {sovGroupBy === "trade" ? "Trade Bundle" : sovGroupBy === "subdivision" ? "Subdivision" : "Division"}
          </div>
          <div style={{ width: 42, textAlign: "center" }}>Items</div>
          <div style={{ width: 80, textAlign: "right" }}>
            Material
            {nn(sovCatMarkup.material) ? ` (${nn(sovCatMarkup.material) > 0 ? "+" : ""}${sovCatMarkup.material}%)` : ""}
          </div>
          <div style={{ width: 80, textAlign: "right" }}>
            Labor{nn(sovCatMarkup.labor) ? ` (${nn(sovCatMarkup.labor) > 0 ? "+" : ""}${sovCatMarkup.labor}%)` : ""}
          </div>
          <div style={{ width: 75, textAlign: "right" }}>
            Equip
            {nn(sovCatMarkup.equipment)
              ? ` (${nn(sovCatMarkup.equipment) > 0 ? "+" : ""}${sovCatMarkup.equipment}%)`
              : ""}
          </div>
          <div style={{ width: 80, textAlign: "right" }}>
            Sub{nn(sovCatMarkup.sub) ? ` (${nn(sovCatMarkup.sub) > 0 ? "+" : ""}${sovCatMarkup.sub}%)` : ""}
          </div>
          <div style={{ width: 95, textAlign: "right" }}>Direct</div>
          <div style={{ width: 95, textAlign: "right" }}>w/ Markup</div>
          <div style={{ width: 100, textAlign: "right", color: C.accent }}>SOV Total</div>
          <div style={{ width: 72, textAlign: "center" }}>Source</div>
        </div>

        {/* Data rows */}
        {sovData.rowData.map(r => (
          <div
            key={r.key}
            className="row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              borderBottom: `1px solid ${C.bg2}`,
            }}
          >
            <div style={{ flex: 3, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{r.g.label}</div>
            </div>
            <div style={{ width: 42, textAlign: "center", fontSize: 10, color: C.textDim }}>{r.g.items.length}</div>
            <div
              style={{
                width: 80,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 10,
                color: nn(sovCatMarkup.material) ? C.green : C.textMuted,
              }}
            >
              {fmt(r.adjMat)}
            </div>
            <div
              style={{
                width: 80,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 10,
                color: nn(sovCatMarkup.labor) ? C.blue : C.textMuted,
              }}
            >
              {fmt(r.adjLab)}
            </div>
            <div
              style={{
                width: 75,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 10,
                color: nn(sovCatMarkup.equipment) ? C.orange : C.textMuted,
              }}
            >
              {fmt(r.adjEqp)}
            </div>
            <div
              style={{
                width: 80,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 10,
                color: nn(sovCatMarkup.sub) ? C.purple : C.textMuted,
              }}
            >
              {fmt(r.adjSub)}
            </div>
            <div
              style={{
                width: 95,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 11,
                fontWeight: 600,
                color: C.text,
              }}
            >
              {fmt(r.direct)}
            </div>
            <div
              style={{ width: 95, textAlign: "right", fontFeatureSettings: "'tnum'", fontSize: 10, color: C.textMuted }}
            >
              {fmt(r.afterCustom)}
            </div>
            <div
              style={{
                width: 100,
                textAlign: "right",
                fontFeatureSettings: "'tnum'",
                fontSize: 12,
                fontWeight: 700,
                color: C.accent,
              }}
            >
              {fmt(r.withBondTax)}
            </div>
            <div style={{ width: 72, textAlign: "center" }}>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: `${r.src.color}18`,
                  color: r.src.color,
                  border: `1px solid ${r.src.color}30`,
                }}
              >
                {r.src.label}
              </span>
            </div>
          </div>
        ))}

        {/* Totals row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "10px 12px",
            borderTop: `2px solid ${C.accent}`,
            background: C.bg2,
            borderRadius: "0 0 4px 4px",
          }}
        >
          <div style={{ flex: 3, minWidth: 180, fontSize: 12, fontWeight: 700, color: C.accent }}>TOTALS</div>
          <div style={{ width: 42, textAlign: "center", fontSize: 10, fontWeight: 600, color: C.text }}>
            {items.length}
          </div>
          <div
            style={{
              width: 80,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 10,
              fontWeight: 700,
              color: C.green,
            }}
          >
            {fmt(sovData.grandMat)}
          </div>
          <div
            style={{
              width: 80,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 10,
              fontWeight: 700,
              color: C.blue,
            }}
          >
            {fmt(sovData.grandLab)}
          </div>
          <div
            style={{
              width: 75,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 10,
              fontWeight: 700,
              color: C.orange,
            }}
          >
            {fmt(sovData.grandEqp)}
          </div>
          <div
            style={{
              width: 80,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 10,
              fontWeight: 700,
              color: C.purple,
            }}
          >
            {fmt(sovData.grandSub)}
          </div>
          <div
            style={{
              width: 95,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 12,
              fontWeight: 700,
              color: C.text,
            }}
          >
            {fmt(sovData.grandDirect)}
          </div>
          <div
            style={{
              width: 95,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 12,
              fontWeight: 600,
              color: C.textMuted,
            }}
          >
            {fmt(sovData.grandMarkup)}
          </div>
          <div
            style={{
              width: 100,
              textAlign: "right",
              fontFeatureSettings: "'tnum'",
              fontSize: 14,
              fontWeight: 700,
              color: C.accent,
            }}
          >
            {fmt(sovData.grandTotal)}
          </div>
          <div style={{ width: 72 }} />
        </div>

        {sovData.hasCatMkup && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              background: C.accentBg,
              borderRadius: 4,
              fontSize: 10,
              color: C.textMuted,
            }}
          >
            <strong style={{ color: C.accent }}>Category Adjustments:</strong>{" "}
            {nn(sovCatMarkup.material) !== 0 && (
              <span>
                Material{" "}
                <strong style={{ color: C.green }}>
                  {nn(sovCatMarkup.material) > 0 ? "+" : ""}
                  {sovCatMarkup.material}%
                </strong>{" "}
              </span>
            )}
            {nn(sovCatMarkup.labor) !== 0 && (
              <span>
                Labor{" "}
                <strong style={{ color: C.blue }}>
                  {nn(sovCatMarkup.labor) > 0 ? "+" : ""}
                  {sovCatMarkup.labor}%
                </strong>{" "}
              </span>
            )}
            {nn(sovCatMarkup.equipment) !== 0 && (
              <span>
                Equipment{" "}
                <strong style={{ color: C.orange }}>
                  {nn(sovCatMarkup.equipment) > 0 ? "+" : ""}
                  {sovCatMarkup.equipment}%
                </strong>{" "}
              </span>
            )}
            {nn(sovCatMarkup.sub) !== 0 && (
              <span>
                Sub{" "}
                <strong style={{ color: C.purple }}>
                  {nn(sovCatMarkup.sub) > 0 ? "+" : ""}
                  {sovCatMarkup.sub}%
                </strong>{" "}
              </span>
            )}
          </div>
        )}
      </DBlock>
    ),

    comparison: (
      <DBlock key="comparison" id="comparison" title="Estimate vs SOV Comparison">
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
        >
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            <span style={{ color: C.textMuted }}>
              Estimate Grand Total:{" "}
              <strong style={{ color: C.text, fontFeatureSettings: "'tnum'" }}>{fmt(estimateTotals.grand)}</strong>
            </span>
            <span style={{ color: C.textMuted }}>
              SOV Total:{" "}
              <strong style={{ color: C.accent, fontFeatureSettings: "'tnum'" }}>{fmt(sovData.grandTotal)}</strong>
            </span>
            {(sovData.hasCatMkup || sovData.grandTotal !== estimateTotals.grand) && (
              <span style={{ color: sovData.grandTotal >= estimateTotals.grand ? C.green : C.red }}>
                {"\u0394"}:{" "}
                <strong style={{ fontFeatureSettings: "'tnum'" }}>
                  {sovData.grandTotal >= estimateTotals.grand ? "+" : ""}
                  {fmt(sovData.grandTotal - estimateTotals.grand)}
                </strong>
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 10, color: C.textDim, flexWrap: "wrap" }}>
            <span>
              {markupOrder.map(mo => `${mo.label} ${markup[mo.key] || 0}%${mo.compound ? "★" : ""}`).join(" → ")}
            </span>
            {markupOrder.some(mo => mo.compound) && <span style={{ color: C.accent }}>★ = compounded</span>}
          </div>
        </div>
      </DBlock>
    ),

    markup: (
      <DBlock key="markup" id="markup" title="Markup & Adjustments">
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 8,
          }}
        >
          Standard Markups — drag to reorder
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {markupOrder.map((mo, idx) => {
            const moColors = {
              overhead: C.blue,
              profit: C.green,
              contingency: C.orange,
              generalConditions: C.cyan,
              insurance: C.purple,
              fee: C.red,
            };
            const moColor = moColors[mo.key] || C.textDim;
            const amt = estimateTotals.markupAmounts?.[mo.key] || 0;
            return (
              <div
                key={mo.key}
                draggable
                onDragStart={e => {
                  e.stopPropagation();
                  e.dataTransfer.effectAllowed = "move";
                  sovDragItem.current = `mkup-${idx}`;
                }}
                onDragOver={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onDrop={e => {
                  e.stopPropagation();
                  e.preventDefault();
                  const fromStr = sovDragItem.current;
                  if (!fromStr?.startsWith("mkup-")) return;
                  const from = parseInt(fromStr.split("-")[1]);
                  if (from === idx) return;
                  const next = [...markupOrder];
                  const [moved] = next.splice(from, 1);
                  next.splice(idx, 0, moved);
                  setMarkupOrder(next);
                  sovDragItem.current = null;
                }}
                onDragEnd={e => {
                  e.stopPropagation();
                  sovDragItem.current = null;
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  background: C.bg,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  cursor: "grab",
                }}
              >
                <svg width="8" height="12" viewBox="0 0 10 14" fill={C.textDim} style={{ opacity: 0.4, flexShrink: 0 }}>
                  <circle cx="3" cy="2" r="1.2" />
                  <circle cx="7" cy="2" r="1.2" />
                  <circle cx="3" cy="7" r="1.2" />
                  <circle cx="7" cy="7" r="1.2" />
                  <circle cx="3" cy="12" r="1.2" />
                  <circle cx="7" cy="12" r="1.2" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600, color: moColor, minWidth: 90 }}>{mo.label}</span>
                <input
                  type="number"
                  value={markup[mo.key]}
                  onChange={e => setMarkup({ ...markup, [mo.key]: e.target.value })}
                  onClick={e => e.stopPropagation()}
                  style={nInp(C, { width: 60, padding: "4px 6px", fontSize: 12, fontWeight: 600 })}
                />
                <span style={{ fontSize: 10, color: C.textDim }}>%</span>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: mo.compound ? `${C.accent}18` : "transparent",
                    border: `1px solid ${mo.compound ? C.accent + "50" : C.border}`,
                    marginLeft: 4,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={mo.compound || false}
                    onChange={e => {
                      const next = [...markupOrder];
                      next[idx] = { ...next[idx], compound: e.target.checked };
                      setMarkupOrder(next);
                    }}
                    style={{ width: 11, height: 11, accentColor: C.accent }}
                  />
                  <span style={{ fontSize: 8, fontWeight: 600, color: mo.compound ? C.accent : C.textDim }}>
                    Compound
                  </span>
                </label>
                {nn(markup[mo.key]) > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: moColor,
                      fontWeight: 600,
                      fontFeatureSettings: "'tnum'",
                    }}
                  >
                    {fmt(amt)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Bond & Tax */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
          {[
            { k: "bond", l: "Bond", c: C.textMuted },
            { k: "tax", l: "Tax", c: C.textDim },
          ].map(m => (
            <div key={m.k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 9, color: m.c, fontWeight: 600 }}>{m.l} %</span>
              <input
                type="number"
                value={markup[m.k]}
                onChange={e => setMarkup({ ...markup, [m.k]: e.target.value })}
                style={nInp(C, { width: 72, padding: "6px 8px", fontSize: 13, fontWeight: 600 })}
              />
            </div>
          ))}
        </div>

        {/* Custom markups */}
        {customMarkups.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginBottom: 8 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              Additional Markups
            </div>
            {customMarkups.map(cm => {
              const amt = estimateTotals.customAmounts?.find(a => a.id === cm.id);
              return (
                <div key={cm.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <LocalInput
                    value={cm.label}
                    onCommit={v => updateCustomMarkup(cm.id, "label", v)}
                    placeholder="Label (e.g. Design Fee, Supervision...)"
                    style={inp(C, { flex: 1, maxWidth: 260, padding: "5px 8px", fontSize: 11 })}
                  />
                  <LocalInput
                    type="number"
                    value={cm.value}
                    onCommit={v => updateCustomMarkup(cm.id, "value", v)}
                    placeholder="0"
                    style={nInp(C, { width: 72, padding: "5px 8px", fontSize: 12, fontWeight: 600 })}
                  />
                  <select
                    value={cm.type}
                    onChange={e => updateCustomMarkup(cm.id, "type", e.target.value)}
                    style={inp(C, { width: 60, padding: "5px 4px", fontSize: 10 })}
                  >
                    <option value="pct">%</option>
                    <option value="flat">$</option>
                  </select>
                  {amt && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.accent,
                        fontWeight: 600,
                        fontFeatureSettings: "'tnum'",
                        minWidth: 80,
                        textAlign: "right",
                      }}
                    >
                      {fmt(amt.amount)}
                    </span>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() => setCustomMarkups(customMarkups.filter(c => c.id !== cm.id))}
                    style={{
                      width: 20,
                      height: 20,
                      border: "none",
                      background: "transparent",
                      color: C.red,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      opacity: 0.6,
                    }}
                  >
                    <Ic d={I.trash} size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: `1px solid ${C.border}`,
            paddingTop: 8,
          }}
        >
          <button
            className="ghost-btn"
            onClick={() => setCustomMarkups([...customMarkups, { id: uid(), label: "", value: "", type: "pct" }])}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.accent,
              padding: "5px 12px",
              fontSize: 10,
            })}
          >
            <Ic d={I.plus} size={10} color={C.accent} sw={2} /> Add Markup Line
          </button>
          <div style={{ display: "flex", gap: 16, fontSize: 11, fontFeatureSettings: "'tnum'" }}>
            <span style={{ color: C.textDim }}>
              Direct: <strong style={{ color: C.text }}>{fmt(estimateTotals.direct)}</strong>
            </span>
            <span style={{ color: C.textDim }}>
              Subtotal: <strong style={{ color: C.text }}>{fmt(estimateTotals.subtotal)}</strong>
            </span>
            {estimateTotals.customTotal !== 0 && (
              <span style={{ color: C.textDim }}>
                + Custom: <strong style={{ color: C.accent }}>{fmt(estimateTotals.customTotal)}</strong>
              </span>
            )}
            <span style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>Grand: {fmt(estimateTotals.grand)}</span>
          </div>
        </div>
      </DBlock>
    ),
  };

  return <div style={{ padding: T.space[7], minHeight: "100%" }}>{sovBlockOrder.map(id => blocks[id])}</div>;
}
