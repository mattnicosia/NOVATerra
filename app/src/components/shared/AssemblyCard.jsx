import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt, fmt2, titleCase } from '@/utils/format';

export default function AssemblyCard({ asm, onDelete }) {
  const C = useTheme();
  const T = C.T;
  const addElement = useItemsStore(s => s.addElement);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const showToast = useUiStore(s => s.showToast);
  const [qty, setQty] = useState(1);
  const [expanded, setExpanded] = useState(false);

  const totalPer = asm.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor), 0);
  const grandTotal = totalPer * nn(qty);

  const insertAssembly = () => {
    const q = nn(qty);
    if (q <= 0) return;
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
    // Update quantity if different from 1
    if (q !== 1) {
      const items = useItemsStore.getState().items;
      const lastItem = items[items.length - 1];
      if (lastItem) useItemsStore.getState().updateItem(lastItem.id, "quantity", q);
    }
    showToast(`Inserted "${titleCase(asm.name)}" as scope item with ${asm.elements.length} sub-items`);
  };

  return (
    <div style={{ marginBottom: T.space[3], background: C.bg1, borderRadius: T.radius.md, border: `1px solid ${C.border}`, boxShadow: T.shadow.sm, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.5" style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}>
          <path d="M2 0.5l3.5 3.5L2 7.5" />
        </svg>
        <Ic d={I.assembly} size={16} color={C.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{titleCase(asm.name)}</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>{asm.description} &bull; {asm.elements.length} elements</div>
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: C.purple, fontWeight: 600 }}>{asm.code}</div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: C.accent }}>{fmt2(totalPer)}<span style={{ fontSize: 9, color: C.textDim }}>/unit</span></div>
        {onDelete && (
          <button onClick={e => { e.stopPropagation(); onDelete(asm.id); }}
            style={{ width: 24, height: 24, border: "none", background: "transparent", color: C.red, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, flexShrink: 0 }}
            title="Delete assembly">
            <Ic d={I.trash} size={12} color={C.red} />
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.border}` }}>
          {/* Elements table */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 2fr 40px 70px 70px 70px 80px", gap: 6, marginBottom: 4, fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              <span>Code</span><span>Description</span><span>Unit</span><span style={{ textAlign: "right" }}>Material</span><span style={{ textAlign: "right" }}>Labor</span><span style={{ textAlign: "right" }}>Equip</span><span style={{ textAlign: "right" }}>Total</span>
            </div>
            {asm.elements.map((el, i) => {
              const elTotal = (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 2fr 40px 70px 70px 70px 80px", gap: 6, padding: "4px 0", borderBottom: `1px solid ${C.bg}`, alignItems: "center", fontSize: 11 }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.purple }}>{el.code}</span>
                  <span style={{ color: C.text }}>{titleCase(el.desc)}</span>
                  <span style={{ color: C.textDim, fontSize: 10 }}>{el.unit}</span>
                  <span style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: C.green }}>{fmt2(nn(el.m) * nn(el.factor))}</span>
                  <span style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: C.blue }}>{fmt2(nn(el.l) * nn(el.factor))}</span>
                  <span style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: C.orange }}>{fmt2(nn(el.e) * nn(el.factor))}</span>
                  <span style={{ textAlign: "right", fontFamily: "'DM Sans',sans-serif", fontWeight: 600 }}>{fmt2(elTotal)}</span>
                </div>
              );
            })}
          </div>

          {/* Insert controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, padding: "10px 12px", background: C.bg2, borderRadius: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Quantity:</span>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" style={nInp(C, { width: 70, padding: "6px 8px", fontSize: 13, fontWeight: 600, textAlign: "center" })} />
            <div style={{ flex: 1, textAlign: "right" }}>
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: C.accent }}>{fmt(grandTotal)}</span>
              <span style={{ fontSize: 10, color: C.textDim, marginLeft: 6 }}>total</span>
            </div>
            <button className="accent-btn" onClick={insertAssembly} style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px", fontSize: 11 })}>
              <Ic d={I.plus} size={12} color="#fff" sw={2.5} /> Insert into Estimate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
