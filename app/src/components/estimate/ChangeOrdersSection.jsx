import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { nn, fmt, uid, today } from '@/utils/format';

export default function ChangeOrdersSection() {
  const C = useTheme();
  const T = C.T;
  const changeOrders = useItemsStore(s => s.changeOrders);
  const setChangeOrders = useItemsStore(s => s.setChangeOrders);
  const getTotals = useItemsStore(s => s.getTotals);
  const [expanded, setExpanded] = useState(false);

  const totals = getTotals();
  const coTotal = changeOrders.reduce((s, co) => s + nn(co.amount), 0);
  const revised = totals.grand + coTotal;

  const addCO = () => {
    setChangeOrders([...changeOrders, { id: uid(), description: "", amount: 0, date: today(), status: "pending" }]);
    setExpanded(true);
  };

  const updateCO = (id, field, value) => {
    setChangeOrders(changeOrders.map(co => co.id === id ? { ...co, [field]: value } : co));
  };

  const removeCO = (id) => {
    setChangeOrders(changeOrders.filter(co => co.id !== id));
  };

  if (changeOrders.length === 0 && !expanded) {
    return (
      <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
        <button onClick={addCO}
          style={bt(C, { background: "transparent", border: `1px dashed ${C.border}`, color: C.textDim, padding: "5px 14px", fontSize: 12 })}>
          <Ic d={I.change} size={12} color={C.textDim} /> Add Change Order
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 8, border: `1px solid ${C.border}`, borderRadius: T.radius.sm,
      background: C.bg1, overflow: "hidden",
    }}>
      <div className="nav-item" onClick={() => setExpanded(!expanded)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textMuted} strokeWidth="2"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>
            <path d="M3 1l4 4-4 4" />
          </svg>
          <Ic d={I.change} size={14} color={C.orange} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Change Orders</span>
          <span style={{ fontSize: 12, color: C.textDim, background: C.bg, padding: "1px 6px", borderRadius: 8 }}>{changeOrders.length}</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12 }}>
          {coTotal !== 0 && <span style={{ color: coTotal > 0 ? C.green : C.red, fontWeight: 600, fontFeatureSettings: "'tnum'" }}>CO: {coTotal > 0 ? "+" : ""}{fmt(coTotal)}</span>}
          <span style={{ fontWeight: 700, color: C.accent, fontFeatureSettings: "'tnum'" }}>Revised: {fmt(revised)}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px" }}>
          {changeOrders.map(co => {
            const statusColors = { pending: C.orange, approved: C.green, rejected: C.red };
            return (
              <div key={co.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, padding: "4px 0" }}>
                <input value={co.description} onChange={e => updateCO(co.id, "description", e.target.value)} placeholder="Change order description..."
                  style={inp(C, { flex: 1, padding: "5px 8px", fontSize: 11 })} />
                <input type="number" value={co.amount} onChange={e => updateCO(co.id, "amount", e.target.value)} placeholder="$0"
                  style={nInp(C, { width: 100, padding: "5px 8px", fontSize: 12, fontWeight: 600 })} />
                <select value={co.status || "pending"} onChange={e => updateCO(co.id, "status", e.target.value)}
                  style={inp(C, { width: 80, padding: "4px 4px", fontSize: 11, fontWeight: 600, color: statusColors[co.status] || C.textDim })}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <span style={{ fontSize: 11, color: C.textDim, minWidth: 60 }}>{co.date}</span>
                <button onClick={() => removeCO(co.id)}
                  style={{ width: 20, height: 20, border: "none", background: "transparent", color: C.red, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Ic d={I.trash} size={10} />
                </button>
              </div>
            );
          })}
          <button onClick={addCO}
            style={bt(C, { background: "transparent", border: `1px dashed ${C.border}`, color: C.accent, padding: "4px 12px", fontSize: 11, marginTop: 4 })}>
            <Ic d={I.plus} size={10} /> Add Change Order
          </button>
        </div>
      )}
    </div>
  );
}
