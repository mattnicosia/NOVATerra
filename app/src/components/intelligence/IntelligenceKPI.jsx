// IntelligenceKPI — Enhanced stat card with optional sparkline + delta
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { Spark } from "./PureCSSChart";

function useCountUp(value) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);
  useEffect(() => {
    const numVal = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
    if (isNaN(numVal)) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }
    const start = typeof prevRef.current === "number" ? prevRef.current : 0;
    const end = numVal;
    if (start === end) {
      setDisplay(value);
      return;
    }
    const duration = 400;
    const t0 = performance.now();
    const isFormatted = typeof value === "string";
    const prefix = isFormatted ? value.match(/^[^0-9.-]*/)?.[0] || "" : "";
    const suffix = isFormatted ? value.match(/[^0-9.,]*$/)?.[0] || "" : "";
    const hasCommas = isFormatted && value.includes(",");
    const fmt = n => {
      let s = Math.round(n).toString();
      if (hasCommas) s = Number(s).toLocaleString("en-US");
      return prefix + s + suffix;
    };
    const tick = now => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(isFormatted ? fmt(current) : Math.round(current));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    prevRef.current = numVal;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);
  return display;
}

export default function IntelligenceKPI({ label, value, sub, delta, icon, color, spark, accent, pulse }) {
  const C = useTheme();
  const T = C.T;
  const displayValue = useCountUp(value);
  const isPositive = delta && !String(delta).startsWith("-");
  const deltaColor = delta ? (isPositive ? C.green : C.red) : null;

  return (
    <div
      style={{
        padding: T.space[5],
        borderRadius: T.radius.md,
        background: C.glassBg || "rgba(18,21,28,0.55)",
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${accent ? C.borderAccent || C.accent + "30" : C.glassBorder || "rgba(255,255,255,0.06)"}`,
        boxShadow: accent ? `${T.shadow.md}, 0 0 20px ${C.accent}15` : T.shadow.sm,
        display: "flex",
        flexDirection: "column",
        gap: T.space[2],
        animation: pulse ? "kpiPulse 4s ease-in-out infinite" : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: T.fontSize.xs,
            fontWeight: T.fontWeight.bold,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: T.tracking.wider,
          }}
        >
          {label}
        </span>
        {icon && (
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: T.radius.sm,
              background: `${color || C.accent}12`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={icon} size={14} color={color || C.textDim} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div
          style={{
            fontFamily: T.font.sans,
            fontSize: T.fontSize["2xl"],
            fontWeight: T.fontWeight.bold,
            color: accent ? C.accent : C.text,
            letterSpacing: T.tracking.tight,
            fontFeatureSettings: "'tnum'",
          }}
        >
          {displayValue}
        </div>
        {delta && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: deltaColor,
              fontFamily: T.font.sans,
            }}
          >
            {isPositive ? "+" : ""}
            {delta}
          </span>
        )}
      </div>

      {sub && <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>{sub}</div>}

      {/* Sparkline at bottom */}
      {spark && spark.length > 0 && (
        <div style={{ marginTop: 2 }}>
          <Spark data={spark} height={16} color={color || C.accent} />
        </div>
      )}
    </div>
  );
}
