import { useMemo, useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { GradientBar } from "@/components/intelligence/PureCSSChart";
import { fmt } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function DivisionNavigator({ activeDivision, onSelectDivision }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const items = useItemsStore(s => s.items);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const [collapsed, setCollapsed] = useState(false);

  const divisions = useMemo(() => {
    const map = {};
    items.forEach(item => {
      const raw = item.division || "Unassigned";
      const d = raw.includes(" - ") ? raw : divFromCode(raw) || raw;
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
        health:
          d.items.length === 0
            ? "empty"
            : d.withCost === d.items.length
              ? "complete"
              : d.withCost > 0
                ? "partial"
                : "empty",
      }))
      .sort((a, b) => {
        const aNum = parseInt((a.code.match(/^\d+/) || ["99"])[0], 10);
        const bNum = parseInt((b.code.match(/^\d+/) || ["99"])[0], 10);
        return aNum - bNum;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const totalItems = items.length;
  const totalDivisions = divisions.length;

  const healthDot = health => {
    if (health === "complete") return { color: C.green, char: "\u25CF" };
    if (health === "partial") return { color: C.orange, char: "\u25D0" };
    return { color: C.textDim, char: "\u25CB" };
  };

  /* ── Collapsed strip ── */
  if (collapsed) {
    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
          paddingTop: 8,
          gap: 8,
          background: dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
          backdropFilter: T.glass.blurLight,
          WebkitBackdropFilter: T.glass.blurLight,
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 6,
            borderRadius: T.radius.sm,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          title="Expand divisions"
        >
          <Ic d={I.chevron} size={12} color={C.textDim} style={{ transform: "rotate(0deg)" }} />
        </button>
        <span
          style={{
            writingMode: "vertical-rl",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 1.2,
            color: C.textDim,
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          DIVISIONS
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.accent,
            background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            borderRadius: T.radius.full,
            padding: "2px 0",
            width: 24,
            textAlign: "center",
          }}
        >
          {totalDivisions}
        </span>
      </div>
    );
  }

  /* ── Expanded glass panel ── */
  return (
    <div
      style={{
        width: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        backdropFilter: T.glass.blurLight,
        WebkitBackdropFilter: T.glass.blurLight,
      }}
    >
      {/* Header with collapse toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${T.space[2]}px ${T.space[3]}px`,
          borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
        }}
      >
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: T.radius.sm,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          title="Collapse divisions"
        >
          <Ic d={I.chevron} size={10} color={C.textDim} style={{ transform: "rotate(180deg)" }} />
        </button>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 1,
            color: C.textDim,
            textTransform: "uppercase",
          }}
        >
          Divisions
        </span>
        <span
          style={{
            fontSize: 9,
            color: C.textDim,
            background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            padding: "1px 6px",
            borderRadius: T.radius.full,
            fontWeight: 500,
          }}
        >
          {totalDivisions}
        </span>
      </div>

      {/* All button */}
      <button
        onClick={() => onSelectDivision("All")}
        style={{
          width: "100%",
          padding: `${T.space[2]}px ${T.space[3]}px`,
          background:
            activeDivision === "All" ? (dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.25)") : "transparent",
          border: "none",
          borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: T.fontSize.xs,
          fontWeight: 600,
          color: activeDivision === "All" ? C.text : C.textDim,
          fontFamily: T.font.sans,
          transition: "all 0.2s ease",
          boxShadow:
            activeDivision === "All"
              ? `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.4)"}`
              : "none",
        }}
        onMouseEnter={e => {
          if (activeDivision !== "All")
            e.currentTarget.style.background = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
        }}
        onMouseLeave={e => {
          if (activeDivision !== "All") e.currentTarget.style.background = "transparent";
        }}
      >
        <span>All</span>
        <span
          style={{
            fontSize: 9,
            color: C.textDim,
            background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            padding: "1px 6px",
            borderRadius: T.radius.full,
            fontWeight: 500,
          }}
        >
          {totalItems}
        </span>
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
                padding: `${T.space[2]}px ${T.space[3]}px`,
                background: isActive ? (dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.25)") : "transparent",
                border: "none",
                borderBottom: `0.5px solid ${dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)"}`,
                borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                textAlign: "left",
                transition: "all 0.2s ease",
                fontFamily: T.font.sans,
                boxShadow: isActive
                  ? `inset 0 0.5px 0 ${dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.35)"}`
                  : "none",
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                <span style={{ fontSize: 8, color: dot.color, lineHeight: 1 }}>{dot.char}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? C.text : C.textDim,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: 0.1,
                  }}
                >
                  {div.name}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    color: C.textDim,
                    flexShrink: 0,
                    opacity: 0.6,
                  }}
                >
                  {div.itemCount}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 13 }}>
                <GradientBar
                  pct={div.pricedPct}
                  color={div.health === "complete" ? C.green : div.health === "partial" ? C.orange : C.textDim}
                  height={2}
                />
                <span
                  style={{
                    fontSize: 8,
                    color: C.textDim,
                    fontFamily: T.font.sans,
                    flexShrink: 0,
                    minWidth: 28,
                    textAlign: "right",
                    opacity: 0.7,
                  }}
                >
                  {fmt(div.total)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom summary */}
      <div
        style={{
          padding: `${T.space[2]}px ${T.space[3]}px`,
          borderTop: `0.5px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
          fontSize: 9,
          color: C.textDim,
          display: "flex",
          justifyContent: "space-between",
          opacity: 0.7,
        }}
      >
        <span>{totalDivisions} div</span>
        <span>{totalItems} items</span>
      </div>
    </div>
  );
}
