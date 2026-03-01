import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { GradientBar } from '@/components/intelligence/PureCSSChart';
import { fmt } from '@/utils/format';

export default function DivisionNavigator({ activeDivision, onSelectDivision }) {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const getItemTotal = useItemsStore(s => s.getItemTotal);

  const divisions = useMemo(() => {
    const map = {};
    items.forEach(item => {
      const raw = item.division || "Unassigned";
      const d = raw.includes(" - ") ? raw : (divFromCode(raw) || raw);
      if (!map[d]) map[d] = { code: d, items: [], withCost: 0, total: 0 };
      map[d].items.push(item);
      const t = getItemTotal(item);
      map[d].total += t;
      if (t > 0) map[d].withCost++;
    });
    return Object.values(map)
      .map(d => ({
        ...d,
        name: d.code,
        itemCount: d.items.length,
        pricedPct: d.items.length > 0 ? Math.round((d.withCost / d.items.length) * 100) : 0,
        health: d.items.length === 0 ? "empty"
          : d.withCost === d.items.length ? "complete"
          : d.withCost > 0 ? "partial"
          : "empty",
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [items]);

  const totalItems = items.length;
  const totalDivisions = divisions.length;

  const healthDot = (health) => {
    if (health === "complete") return { color: C.green, char: "\u25CF" };
    if (health === "partial") return { color: C.orange, char: "\u25D0" };
    return { color: C.textDim, char: "\u25CB" };
  };

  return (
    <div style={{
      width: 200,
      borderRight: `1px solid ${C.border}`,
      overflowY: "auto",
      background: C.bg,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* All button */}
      <button
        onClick={() => onSelectDivision("All")}
        style={{
          width: "100%",
          padding: `${T.space[3]}px ${T.space[4]}px`,
          background: activeDivision === "All" ? `${C.accent}15` : "transparent",
          border: "none",
          borderBottom: `1px solid ${C.border}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: T.fontSize.sm,
          fontWeight: 700,
          color: activeDivision === "All" ? C.accent : C.text,
          fontFamily: "'DM Sans',sans-serif",
          transition: T.transition.fast,
        }}
      >
        <span>All Divisions</span>
        <span style={{
          fontSize: T.fontSize.xs,
          color: C.textDim,
          background: C.bg2,
          padding: "1px 6px",
          borderRadius: T.radius.full,
        }}>{totalItems}</span>
      </button>

      {/* Division list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {divisions.map(div => {
          const dot = healthDot(div.health);
          const isActive = activeDivision === div.code;
          return (
            <button
              key={div.code}
              onClick={() => onSelectDivision(isActive ? "All" : div.code)}
              style={{
                width: "100%",
                padding: `${T.space[2]}px ${T.space[4]}px`,
                background: isActive ? `${C.accent}12` : "transparent",
                border: "none",
                borderBottom: `1px solid ${C.border}30`,
                borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                textAlign: "left",
                transition: T.transition.fast,
                fontFamily: "'DM Sans',sans-serif",
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = `${C.text}06`; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                <span style={{ fontSize: 10, color: dot.color, lineHeight: 1 }}>{dot.char}</span>
                <span style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: isActive ? C.accent : C.text,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>{div.name}</span>
                <span style={{
                  fontSize: 9,
                  color: C.textDim,
                  flexShrink: 0,
                }}>{div.itemCount}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 16 }}>
                <GradientBar
                  pct={div.pricedPct}
                  color={div.health === "complete" ? C.green : div.health === "partial" ? C.orange : C.textDim}
                  height={3}
                />
                <span style={{
                  fontSize: 8,
                  color: C.textDim,
                  fontFamily: "'DM Mono',monospace",
                  flexShrink: 0,
                  minWidth: 28,
                  textAlign: "right",
                }}>{fmt(div.total)}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom summary */}
      <div style={{
        padding: `${T.space[3]}px ${T.space[4]}px`,
        borderTop: `1px solid ${C.border}`,
        fontSize: T.fontSize.xs,
        color: C.textDim,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>{totalDivisions} divisions</span>
        <span>{totalItems} items</span>
      </div>
    </div>
  );
}
