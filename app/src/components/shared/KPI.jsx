import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "./Ic";

function useCountUp(value) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    // Only animate numeric values
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
    const hasDecimals = isFormatted && value.includes(".");
    const decimalPlaces = hasDecimals ? value.split(".")[1]?.replace(/[^0-9]/g, "").length || 0 : 0;

    const fmt = n => {
      let s = decimalPlaces > 0 ? n.toFixed(decimalPlaces) : Math.round(n).toString();
      if (hasCommas)
        s = Number(s).toLocaleString("en-US", {
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        });
      return prefix + s + suffix;
    };

    const tick = now => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
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

export default function KPI({ label, value, sub, icon, color, accent }) {
  const C = useTheme();
  const T = C.T;
  const displayValue = useCountUp(value);
  const isNero = C.neroMode;

  // ── Nero: MD-tier black glass — NO carbon texture ──
  const ng = T.neroGlass?.md || {};

  const glassBg = isNero
    ? ng.bg || "rgba(255,255,255,0.08)"
    : C.glassBg || (C.isDark ? "rgba(15,15,30,0.38)" : "rgba(255,255,255,0.32)");

  const shadow = isNero
    ? [
        ng.specular,
        ng.specularBottom,
        ng.innerDepth,
        accent ? `${ng.shadow}, 0 0 24px ${C.accent}20` : ng.shadow,
        ng.edge,
      ]
        .filter(Boolean)
        .join(", ")
    : [
        T.glass.specular,
        accent ? `${T.shadow.md}, 0 0 24px ${C.accent}${C.isDark ? "20" : "30"}` : T.shadow.sm,
        T.glass.edge,
      ]
        .filter(Boolean)
        .join(", ");

  return (
    <div
      className="kpi-card"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: T.space[5],
        borderRadius: T.radius.md,
        background: isNero
          ? glassBg
          : C.isDark
            ? glassBg
            : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`,
        backdropFilter: isNero ? ng.blur || "blur(16px) saturate(150%)" : T.glass.blur,
        WebkitBackdropFilter: isNero ? ng.blur || "blur(16px) saturate(150%)" : T.glass.blur,
        border: `1px solid ${accent ? C.accent + (C.isDark ? "30" : "25") : isNero ? ng.border || "rgba(255,255,255,0.12)" : T.glass.border}`,
        boxShadow: shadow,
        display: "flex",
        flexDirection: "column",
        gap: T.space[2],
        transition: isNero ? T.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
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
      <div
        style={{
          fontFamily: "'DM Sans','Inter',sans-serif",
          fontSize: T.fontSize["2xl"],
          fontWeight: T.fontWeight.bold,
          color: accent ? C.accent : C.text,
          letterSpacing: T.tracking.tight,
          fontFeatureSettings: "'tnum'",
        }}
      >
        {displayValue}
      </div>
      {sub && <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>{sub}</div>}
    </div>
  );
}
