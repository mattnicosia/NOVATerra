import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { nInp, inp, bt } from "@/utils/styles";
import { nn, fmt, fmt2, titleCase } from "@/utils/format";

// Compute element total based on mode
const elCost = el => {
  const f = nn(el.factor || 1);
  if (el.mode === "sub") return nn(el.sub) * f;
  return (nn(el.m) + nn(el.l) + nn(el.e)) * f;
};

export default function AssemblyCard({ asm, onDelete }) {
  const C = useTheme();
  const T = C.T;
  const addElement = useItemsStore(s => s.addElement);
  const updateAssembly = useDatabaseStore(s => s.updateAssembly);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const showToast = useUiStore(s => s.showToast);
  const [qty, setQty] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editingHeader, setEditingHeader] = useState(false);

  const totalPer = asm.elements.reduce((s, el) => s + elCost(el), 0);
  const grandTotal = totalPer * nn(qty);

  // ─── Element CRUD ───
  const updateEl = (idx, field, value) => {
    const els = [...asm.elements];
    els[idx] = { ...els[idx], [field]: value };
    updateAssembly(asm.id, "elements", els);
  };

  const removeEl = idx => {
    updateAssembly(asm.id, "elements", asm.elements.filter((_, i) => i !== idx));
  };

  const addEl = () => {
    const els = [...asm.elements, { code: "", desc: "New Item", unit: "SF", m: 0, l: 0, e: 0, sub: 0, mode: "mle", factor: 1 }];
    updateAssembly(asm.id, "elements", els);
    setEditingIdx(els.length - 1);
  };

  const toggleMode = idx => {
    const el = asm.elements[idx];
    const newMode = el.mode === "sub" ? "mle" : "sub";
    const updates = { mode: newMode };
    if (newMode === "sub" && !nn(el.sub)) {
      updates.sub = nn(el.m) + nn(el.l) + nn(el.e);
    }
    const els = [...asm.elements];
    els[idx] = { ...els[idx], ...updates };
    updateAssembly(asm.id, "elements", els);
  };

  const insertAssembly = () => {
    const q = nn(qty);
    if (q <= 0) return;
    const totalM = asm.elements.filter(el => el.mode !== "sub").reduce((s, el) => s + nn(el.m) * nn(el.factor || 1), 0);
    const totalL = asm.elements.filter(el => el.mode !== "sub").reduce((s, el) => s + nn(el.l) * nn(el.factor || 1), 0);
    const totalE = asm.elements.filter(el => el.mode !== "sub").reduce((s, el) => s + nn(el.e) * nn(el.factor || 1), 0);
    const totalSub = asm.elements.filter(el => el.mode === "sub").reduce((s, el) => s + nn(el.sub) * nn(el.factor || 1), 0);
    const division = divFromCode(asm.code || asm.elements[0]?.code);
    const subItems = asm.elements.map(el => ({
      id: `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      desc: titleCase(el.desc),
      unit: el.unit,
      m: nn(el.m),
      l: nn(el.l),
      e: nn(el.e),
      sub: nn(el.sub),
      mode: el.mode || "mle",
      factor: nn(el.factor) || 1,
    }));
    addElement(division, {
      code: asm.code || asm.elements[0]?.code || "",
      name: titleCase(asm.name),
      unit: "EA",
      material: Math.round(totalM * 100) / 100,
      labor: Math.round(totalL * 100) / 100,
      equipment: Math.round(totalE * 100) / 100,
      subcontractor: Math.round(totalSub * 100) / 100,
      subItems,
    });
    if (q !== 1) {
      const items = useItemsStore.getState().items;
      const lastItem = items[items.length - 1];
      if (lastItem) useItemsStore.getState().updateItem(lastItem.id, "quantity", q);
    }
    showToast(`Inserted "${titleCase(asm.name)}" as scope item with ${asm.elements.length} sub-items`);
  };

  // Grid: Code | Desc | Unit | Mode | M/L/E or Sub | Factor | Total | Actions
  const GRID = "60px 2fr 36px 32px 68px 68px 68px 42px 68px 24px";

  return (
    <div
      style={{
        marginBottom: T.space[3],
        background: C.bg1,
        borderRadius: T.radius.md,
        border: `1px solid ${C.border}`,
        boxShadow: T.shadow.sm,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}
        >
          <path d="M2 0.5l3.5 3.5L2 7.5" />
        </svg>
        <Ic d={I.assembly} size={16} color={C.accent} />
        {editingHeader ? (
          <div style={{ flex: 1, display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
            <input
              value={asm.name}
              onChange={e => updateAssembly(asm.id, "name", e.target.value)}
              style={inp(C, { flex: 1, fontSize: 13, fontWeight: 700, padding: "3px 8px" })}
              autoFocus
              onKeyDown={e => e.key === "Enter" && setEditingHeader(false)}
            />
            <input
              value={asm.code || ""}
              onChange={e => updateAssembly(asm.id, "code", e.target.value)}
              style={inp(C, { width: 80, fontSize: 10, padding: "3px 6px", fontFamily: T.font.sans, color: C.purple })}
              placeholder="Code"
            />
            <button onClick={e => { e.stopPropagation(); setEditingHeader(false); }}
              style={{ border: "none", background: "transparent", cursor: "pointer" }}>
              <Ic d={I.check} size={12} color={C.green} sw={2.5} />
            </button>
          </div>
        ) : (
          <div style={{ flex: 1 }} onDoubleClick={e => { e.stopPropagation(); setEditingHeader(true); }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{titleCase(asm.name)}</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>
              {asm.description || "Double-click to edit"} &bull; {asm.elements.length} elements
            </div>
          </div>
        )}
        <div style={{ fontFamily: T.font.sans, fontSize: 10, color: C.purple, fontWeight: 600 }}>{asm.code}</div>
        <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: C.accent }}>
          {fmt2(totalPer)}
          <span style={{ fontSize: 9, color: C.textDim }}>/unit</span>
        </div>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(asm.id); }}
            style={{
              width: 24, height: 24, border: "none", background: "transparent",
              borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", opacity: 0.7, flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = C.red + "18"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = 0.7; e.currentTarget.style.background = "transparent"; }}
            title="Delete assembly"
          >
            <Ic d={I.trash} size={12} color={C.red} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.border}` }}>
          {/* Column headers */}
          <div
            style={{
              display: "grid", gridTemplateColumns: GRID, gap: 4, marginTop: 10, marginBottom: 4,
              fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5,
              padding: "0 0 4px", borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span>Code</span>
            <span>Description</span>
            <span>Unit</span>
            <span></span>
            <span style={{ textAlign: "right" }}>Material</span>
            <span style={{ textAlign: "right" }}>Labor</span>
            <span style={{ textAlign: "right" }}>Equip</span>
            <span style={{ textAlign: "center" }}>Factor</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span></span>
          </div>

          {/* Element rows */}
          {asm.elements.map((el, i) => {
            const total = elCost(el);
            const isEditing = editingIdx === i;
            const isSub = el.mode === "sub";
            return (
              <div
                key={i}
                style={{
                  display: "grid", gridTemplateColumns: GRID, gap: 4, padding: "4px 0",
                  borderBottom: `1px solid ${C.bg}`, alignItems: "center", fontSize: 11,
                  background: isEditing ? `${C.accent}08` : i % 2 === 1 ? `${C.bg2}40` : "transparent",
                }}
              >
                {isEditing ? (
                  <>
                    <input value={el.code} onChange={e => updateEl(i, "code", e.target.value)}
                      style={inp(C, { fontFamily: T.font.sans, fontSize: 9, padding: "2px 4px" })} />
                    <input value={el.desc} onChange={e => updateEl(i, "desc", e.target.value)} autoFocus
                      style={inp(C, { fontSize: 11, padding: "2px 6px" })} />
                    <input value={el.unit} onChange={e => updateEl(i, "unit", e.target.value)}
                      style={inp(C, { fontSize: 9, padding: "2px 4px", textAlign: "center" })} />
                    <button onClick={() => toggleMode(i)} title={isSub ? "Switch to M/L/E" : "Switch to Sub"}
                      style={{
                        width: 28, height: 20, border: `1px solid ${isSub ? C.purple : C.border}`,
                        background: isSub ? `${C.purple}18` : "transparent", borderRadius: 4,
                        fontSize: 7, fontWeight: 700, color: isSub ? C.purple : C.textDim,
                        cursor: "pointer", textTransform: "uppercase",
                      }}>
                      {isSub ? "Sub" : "MLE"}
                    </button>
                    {isSub ? (
                      <input type="number" value={el.sub || 0}
                        onChange={e => updateEl(i, "sub", parseFloat(e.target.value) || 0)}
                        style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.purple, gridColumn: "span 3" })}
                        placeholder="Sub rate" />
                    ) : (
                      <>
                        <input type="number" value={el.m || 0} onChange={e => updateEl(i, "m", parseFloat(e.target.value) || 0)}
                          style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.green })} />
                        <input type="number" value={el.l || 0} onChange={e => updateEl(i, "l", parseFloat(e.target.value) || 0)}
                          style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.blue })} />
                        <input type="number" value={el.e || 0} onChange={e => updateEl(i, "e", parseFloat(e.target.value) || 0)}
                          style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.orange })} />
                      </>
                    )}
                    <input type="number" value={el.factor || 1}
                      onChange={e => updateEl(i, "factor", parseFloat(e.target.value) || 1)}
                      style={nInp(C, { fontSize: 10, padding: "2px 4px", textAlign: "center" })} />
                    <div style={{ textAlign: "right", fontFamily: T.font.sans, fontWeight: 600 }}>{fmt2(total)}</div>
                    <button onClick={() => setEditingIdx(null)}
                      style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ic d={I.check} size={11} color={C.green} sw={2.5} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontFamily: T.font.sans, fontSize: 9, color: C.purple }}>{el.code}</span>
                    <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {titleCase(el.desc)}
                    </span>
                    <span style={{ color: C.textDim, fontSize: 10, textAlign: "center" }}>{el.unit}</span>
                    <button onClick={() => toggleMode(i)}
                      title={isSub ? "Using sub rate — click for M/L/E" : "Using M/L/E — click for sub rate"}
                      style={{
                        width: 28, height: 16, border: `1px solid ${isSub ? C.purple + "60" : C.border}`,
                        background: isSub ? `${C.purple}15` : "transparent", borderRadius: 3,
                        fontSize: 7, fontWeight: 700, color: isSub ? C.purple : C.textDim,
                        cursor: "pointer", textTransform: "uppercase", padding: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                      {isSub ? "Sub" : "MLE"}
                    </button>
                    {isSub ? (
                      <span style={{
                        textAlign: "right", fontFamily: T.font.sans, fontSize: 10,
                        color: C.purple, fontWeight: 600, gridColumn: "span 3",
                      }}>
                        {fmt2(nn(el.sub) * nn(el.factor || 1))}
                        <span style={{ fontWeight: 400, color: C.textDim, fontSize: 8, marginLeft: 3 }}>sub</span>
                      </span>
                    ) : (
                      <>
                        <span style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.green }}>
                          {fmt2(nn(el.m) * nn(el.factor || 1))}
                        </span>
                        <span style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.blue }}>
                          {fmt2(nn(el.l) * nn(el.factor || 1))}
                        </span>
                        <span style={{ textAlign: "right", fontFamily: T.font.sans, fontSize: 10, color: C.orange }}>
                          {fmt2(nn(el.e) * nn(el.factor || 1))}
                        </span>
                      </>
                    )}
                    <span style={{ textAlign: "center", fontFamily: T.font.sans, fontSize: 9, color: C.textDim }}>
                      {nn(el.factor || 1) !== 1 ? `×${el.factor}` : ""}
                    </span>
                    <span style={{ textAlign: "right", fontFamily: T.font.sans, fontWeight: 600 }}>{fmt2(total)}</span>
                    <div style={{ display: "flex", gap: 1 }}>
                      <button onClick={() => setEditingIdx(i)} title="Edit"
                        style={{
                          width: 16, height: 16, border: "none", background: "transparent",
                          borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", opacity: 0.5,
                        }}>
                        <Ic d={I.edit} size={8} color={C.textDim} />
                      </button>
                      <button onClick={() => removeEl(i)} title="Remove"
                        style={{
                          width: 16, height: 16, border: "none", background: "transparent",
                          borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", opacity: 0.7,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = C.red + "18"; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = 0.7; e.currentTarget.style.background = "transparent"; }}>
                        <Ic d={I.close} size={8} color={C.red} sw={2} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Add Element button */}
          <button
            onClick={addEl}
            style={{
              ...bt(C),
              width: "100%", marginTop: 6, padding: "6px 0", fontSize: 10, fontWeight: 600,
              background: "transparent", border: `1px dashed ${C.border}`,
              color: C.textMuted, borderRadius: 4, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
          >
            <Ic d={I.plus} size={10} color="currentColor" sw={2} /> Add Element
          </button>

          {/* Insert controls */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 12,
              padding: "10px 12px", background: C.bg2, borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Quantity:</span>
            <input
              type="number" value={qty} onChange={e => setQty(e.target.value)} min="1"
              style={nInp(C, { width: 70, padding: "6px 8px", fontSize: 13, fontWeight: 600, textAlign: "center" })}
            />
            <div style={{ flex: 1, textAlign: "right" }}>
              <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: C.accent }}>
                {fmt(grandTotal)}
              </span>
              <span style={{ fontSize: 10, color: C.textDim, marginLeft: 6 }}>total</span>
            </div>
            <button className="accent-btn" onClick={insertAssembly}
              style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px", fontSize: 11 })}>
              <Ic d={I.plus} size={12} color="#fff" sw={2.5} /> Insert into Estimate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
