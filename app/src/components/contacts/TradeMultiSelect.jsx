import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp } from "@/utils/styles";
import { TRADE_GROUPINGS, TRADE_MAP, TRADE_COLORS } from "@/constants/tradeGroupings";

/* ────────────────────────────────────────────────────────
   TradeBadge — small colored pill for a single trade key
   ──────────────────────────────────────────────────────── */
export function TradeBadge({ tradeKey, onRemove, size = "sm" }) {
  const C = useTheme();
  const T = C.T;
  const trade = TRADE_MAP[tradeKey];
  if (!trade) return null;
  const color = TRADE_COLORS[tradeKey] || C.accent;
  const isXs = size === "xs";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: isXs ? "1px 5px" : "2px 7px",
        borderRadius: T.radius.sm,
        background: `${color}15`,
        border: `1px solid ${color}25`,
        color,
        fontSize: isXs ? 9 : 10,
        fontWeight: 600,
        lineHeight: isXs ? "14px" : "16px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {trade.label}
      {onRemove && (
        <span
          onClick={e => { e.stopPropagation(); onRemove(tradeKey); }}
          style={{ cursor: "pointer", opacity: 0.7, display: "flex", alignItems: "center" }}
        >
          <Ic d={I.x} size={isXs ? 8 : 9} color={color} sw={2.5} />
        </span>
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────
   TradeMultiSelect — multi-select trade picker

   Props:
     value     string[]   Array of trade keys (e.g. ["hvac", "plumbing"])
     onChange   (string[]) => void
     compact    boolean    If true, uses inline badge layout (for grid rows)
     placeholder string
   ──────────────────────────────────────────────────────── */
export default function TradeMultiSelect({
  value = [],
  onChange,
  compact = false,
  placeholder = "Add trade...",
}) {
  const C = useTheme();
  const T = C.T;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const toggle = key => {
    const next = value.includes(key)
      ? value.filter(k => k !== key)
      : [...value, key];
    onChange(next);
  };

  const remove = key => onChange(value.filter(k => k !== key));

  const filtered = TRADE_GROUPINGS.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.label.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
  });

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      {/* Badge row + add button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          flexWrap: compact ? "nowrap" : "wrap",
          minHeight: compact ? 28 : 32,
          overflow: compact ? "hidden" : "visible",
        }}
      >
        {value.map(tk => (
          <TradeBadge key={tk} tradeKey={tk} onRemove={remove} size={compact ? "xs" : "sm"} />
        ))}
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: compact ? 22 : 26,
            height: compact ? 22 : 26,
            borderRadius: T.radius.sm,
            background: open ? `${C.accent}15` : "transparent",
            border: `1px solid ${open ? C.accent + "40" : C.border}`,
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
          }}
          title="Add trade"
        >
          <Ic d={I.plus} size={compact ? 10 : 12} color={open ? C.accent : C.textDim} sw={2} />
        </button>
        {value.length === 0 && !open && (
          <span
            onClick={() => setOpen(true)}
            style={{
              fontSize: compact ? 10 : 11,
              color: C.textDim,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {placeholder}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            width: 260,
            maxHeight: 320,
            overflowY: "auto",
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            boxShadow: T.shadow.lg,
            zIndex: 100,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Search */}
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              placeholder="Search trades..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={inp(C, {
                padding: "5px 8px",
                fontSize: 11,
                width: "100%",
                boxSizing: "border-box",
              })}
            />
          </div>

          {/* Trade list */}
          {filtered.map(t => {
            const checked = value.includes(t.key);
            const color = TRADE_COLORS[t.key] || C.accent;
            return (
              <div
                key={t.key}
                onClick={() => toggle(t.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: checked ? `${color}08` : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseOver={e => { if (!checked) e.currentTarget.style.background = C.bg2; }}
                onMouseOut={e => { if (!checked) e.currentTarget.style.background = "transparent"; }}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    border: `1.5px solid ${checked ? color : C.border}`,
                    background: checked ? `${color}20` : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {checked && <Ic d={I.check} size={10} color={color} sw={2.5} />}
                </div>
                {/* Color dot */}
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                    opacity: 0.7,
                  }}
                />
                {/* Label */}
                <span
                  style={{
                    fontSize: 12,
                    color: checked ? C.text : C.textMuted,
                    fontWeight: checked ? 600 : 400,
                    flex: 1,
                  }}
                >
                  {t.label}
                </span>
                {/* CSI hint */}
                {t.divisions.length > 0 && (
                  <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>
                    Div {t.divisions.join(", ")}
                  </span>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: "12px 10px", fontSize: 11, color: C.textDim, textAlign: "center" }}>
              No trades match "{search}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
