import React, { useMemo, useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";
import { CARBON_TRADE_DEFAULTS } from "@/constants/embodiedCarbonDb";
import { formatCarbon } from "@/utils/carbonEngine";

/* ────────────────────────────────────────────────────────
   CarbonBreakdownWidget — Terra Carbon: division CO2e bars
   Estimates embodied carbon from division cost totals using
   trade-level carbon intensity factors (kgCO2e per $ material).
   ──────────────────────────────────────────────────────── */

// Map CSI divisions to trades for carbon factor lookup
const DIV_TO_TRADE = {
  "03": "concrete",
  "04": "masonry",
  "05": "metals",
  "06": "carpentry",
  "07": "insulation",
  "08": "doors",
  "09": "finishes",
  10: "specialties",
  15: "hvac",
  16: "electrical",
  21: "fireSuppression",
  22: "plumbing",
  23: "hvac",
  26: "electrical",
  27: "electrical",
  28: "electrical",
  31: "sitework",
  32: "sitework",
  33: "sitework",
};

const DIVISION_LABELS = {
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood/Framing",
  "07": "Thermal",
  "08": "Openings",
  "09": "Finishes",
  15: "Mechanical",
  16: "Electrical",
  21: "Fire Supp.",
  22: "Plumbing",
  23: "HVAC",
  26: "Electrical",
  31: "Earthwork",
  32: "Exterior",
  33: "Utilities",
};

// Carbon-themed gradients (green = low impact, amber = medium, red = high)
const CARBON_STYLES = {
  "03": { gradient: "linear-gradient(90deg, #92400E, #D97706)", shadow: "rgba(217,119,6,0.45)" },
  "05": { gradient: "linear-gradient(90deg, #9F1239, #FB7185)", shadow: "rgba(251,113,133,0.45)" },
  "09": { gradient: "linear-gradient(90deg, #065F46, #34D399)", shadow: "rgba(52,211,153,0.5)" },
  "07": { gradient: "linear-gradient(90deg, #1E3A5F, #64A9D9)", shadow: "rgba(100,169,217,0.35)" },
  23: { gradient: "linear-gradient(90deg, #312E81, #6366F1)", shadow: "rgba(99,102,241,0.55)" },
};

const DEFAULT_CARBON_STYLE = { gradient: "linear-gradient(90deg, #374151, #6B7280)", shadow: "rgba(107,114,128,0.4)" };

const FALLBACK_ROWS = [
  { label: "Concrete", gradient: "linear-gradient(90deg, #92400E, #D97706)", shadow: "rgba(217,119,6,0.45)" },
  { label: "Metals", gradient: "linear-gradient(90deg, #9F1239, #FB7185)", shadow: "rgba(251,113,133,0.45)" },
  { label: "Thermal", gradient: "linear-gradient(90deg, #1E3A5F, #64A9D9)", shadow: "rgba(100,169,217,0.35)" },
  { label: "Finishes", gradient: "linear-gradient(90deg, #065F46, #34D399)", shadow: "rgba(52,211,153,0.5)" },
  { label: "MEP", gradient: "linear-gradient(90deg, #312E81, #6366F1)", shadow: "rgba(99,102,241,0.55)" },
];

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);
const EMPTY_OBJ = {};

export default function CarbonBreakdownWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const isConcrete = C.noGlass && C.materialMode === "concrete";
  const { activeProject } = useDashboardData();

  const divisionTotals = activeProject?.divisionTotals || EMPTY_OBJ;
  const projectSF = activeProject?.projectSF || 0;

  // Estimate carbon from division costs using trade carbon intensity
  const { carbonRows, totalCO2e } = useMemo(() => {
    const entries = Object.entries(divisionTotals)
      .map(([code, costVal]) => {
        const trade = DIV_TO_TRADE[code] || "general";
        // Carbon ≈ material cost portion × carbon factor per $
        // Assume ~40% of total division cost is material
        const materialPortion = nn(costVal) * 0.4;
        const carbonFactor = CARBON_TRADE_DEFAULTS[trade] || 0.06;
        const kgCO2e = materialPortion * carbonFactor;
        return { code, kgCO2e };
      })
      .filter(e => e.kgCO2e > 0)
      .sort((a, b) => b.kgCO2e - a.kgCO2e)
      .slice(0, 5);

    if (entries.length === 0) {
      return {
        carbonRows: FALLBACK_ROWS.map(r => ({ ...r, value: 0, bar: 0, display: "\u2014" })),
        totalCO2e: 0,
      };
    }

    const maxVal = entries[0].kgCO2e;
    const total = entries.reduce((s, e) => s + e.kgCO2e, 0);
    const rows = entries.map(e => {
      const style = CARBON_STYLES[e.code] || DEFAULT_CARBON_STYLE;
      return {
        label: DIVISION_LABELS[e.code] || `Div ${e.code}`,
        gradient: style.gradient,
        shadow: style.shadow,
        value: e.kgCO2e,
        bar: maxVal > 0 ? e.kgCO2e / maxVal : 0,
        display: formatCarbon(e.kgCO2e),
      };
    });
    return { carbonRows: rows, totalCO2e: total };
  }, [divisionTotals]);

  const [barScales, setBarScales] = useState([]);

  useEffect(() => {
    setBarScales(carbonRows.map(() => 0));
    const timers = carbonRows.map((row, i) =>
      setTimeout(
        () => {
          setBarScales(prev => {
            const next = [...prev];
            next[i] = row.bar;
            return next;
          });
        },
        200 + i * 80,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [carbonRows]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: T.font.display,
      }}
    >
      {/* Header with Terra branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.textDim,
          }}
        >
          <span style={{ color: isConcrete ? C.accent : C.green }}>TERRA</span> CARBON
        </div>
        {totalCO2e > 0 && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.text,
              fontFamily: T.font.sans,
            }}
          >
            {formatCarbon(totalCO2e)}
            {projectSF > 0 && (
              <span style={{ fontSize: 8, color: C.textDim, marginLeft: 4 }}>
                ({(totalCO2e / projectSF).toFixed(1)} kg/SF)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bars */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {carbonRows.map((row, i) => (
          <div
            key={row.label + i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: i < carbonRows.length - 1 ? 10 : 0,
            }}
          >
            <div
              style={{
                width: 84,
                textAlign: "right",
                fontSize: 9.5,
                fontWeight: 400,
                color: C.textMuted,
                fontFamily: T.font.display,
                flexShrink: 0,
              }}
            >
              {row.label}
            </div>
            <div
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: ov(0.06),
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  borderRadius: 2,
                  background: isConcrete
                    ? `linear-gradient(90deg, ${C.textDim}, ${C.textMuted})`
                    : row.gradient,
                  boxShadow: isConcrete ? "none" : `0 0 8px ${row.shadow}`,
                  transform: `scaleX(${barScales[i] || 0})`,
                  transformOrigin: "left",
                  transition: "transform 0.8s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <div
              style={{
                width: 72,
                textAlign: "right",
                fontSize: 10,
                fontWeight: 500,
                color: C.text,
                fontFamily: T.font.display,
                flexShrink: 0,
              }}
            >
              {row.display}
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      {totalCO2e > 0 && (
        <div
          style={{
            fontSize: 7.5,
            color: C.textDim,
            marginTop: 8,
            fontStyle: "italic",
            textAlign: "right",
          }}
        >
          Estimated from cost data &middot; ICE Database v4.1
        </div>
      )}
    </div>
  );
}
