// NovaCarbonInsight — Carbon display for a single line item
// Receives a CarbonBand prop. Shows intensity, stage breakdown bar,
// source badge, transport disclosure, and substitutes.
// Between Stars and Stone palette — teal color family throughout.
// Does NOT modify any existing files.

import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";

// ── Teal family ──
const TEAL = {
  base: "#14B8A6",
  dim: "#0D9488",
  bright: "#2DD4BF",
  bg: "rgba(20,184,166,0.07)",
  border: "rgba(20,184,166,0.18)",
  glow: "rgba(20,184,166,0.35)",
};

// ── Source badge config ──
const SOURCE_BADGE = {
  ice_generic: { label: "ICE Generic", color: null },          // gray — uses textDim
  ice_generic_ec3: { label: "ICE + EC3", color: TEAL.base },
  epd_specific: { label: "EPD Verified", color: "#34D399" },   // green
  estimated: { label: "Estimated", color: null },
};

// ── Helpers ──
function fmtKg(v) {
  if (v == null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}t`;
  if (v >= 10) return `${Math.round(v)}`;
  return v.toFixed(1);
}

function pct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

// ── Source Badge ──
function SourceBadge({ source, C }) {
  const cfg = SOURCE_BADGE[source];
  if (!cfg) return null;
  const color = cfg.color || C.textDim;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontWeight: 700,
        color,
        background: `${color}12`,
        border: `1px solid ${color}25`,
        padding: "2px 8px",
        borderRadius: 4,
        letterSpacing: 0.3,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          opacity: 0.7,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}

// ── Stage Breakdown Bar (A1-A3, A4, A5) ──
function StageBar({ a1_a3, a4, a5, T }) {
  const total = (a1_a3 || 0) + (a4 || 0) + (a5 || 0);
  if (total <= 0) return null;

  const segments = [
    { label: "A1–A3 (Product)", value: a1_a3, color: TEAL.base },
    { label: "A4 (Transport)", value: a4, color: TEAL.dim },
    { label: "A5 (Construction)", value: a5, color: TEAL.bright },
  ].filter(s => s.value > 0);

  const [hover, setHover] = useState(null);

  return (
    <div style={{ position: "relative" }}>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          background: `${TEAL.base}10`,
        }}
      >
        {segments.map((s, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
              opacity: hover === null || hover === i ? 1 : 0.4,
              transition: "opacity 0.15s",
              cursor: "default",
              borderRight: i < segments.length - 1 ? `1px solid rgba(0,0,0,0.3)` : "none",
            }}
          />
        ))}
      </div>

      {/* Tooltip */}
      {hover !== null && (
        <div
          style={{
            position: "absolute",
            top: -32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            fontSize: 9,
            fontFamily: T.font.sans,
            fontFeatureSettings: "'tnum'",
            padding: "3px 8px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {segments[hover].label}: {fmtKg(segments[hover].value)} kg CO₂e
        </div>
      )}

      {/* Stage labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 2,
          fontSize: 8,
          color: TEAL.dim,
          fontFamily: T.font.sans,
          letterSpacing: 0.2,
        }}
      >
        {segments.map((s, i) => (
          <span key={i}>
            {s.label.split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Transport Disclosure Tooltip ──
function TransportDisclosure({ C, T }) {
  const [show, setShow] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg
        width={12}
        height={12}
        viewBox="0 0 16 16"
        fill="none"
        style={{ cursor: "help", opacity: 0.5 }}
      >
        <circle cx="8" cy="8" r="7" stroke={TEAL.base} strokeWidth="1.5" />
        <path d="M7.2 6.5h1.6V12H7.2z" fill={TEAL.base} />
        <circle cx="8" cy="4.5" r="0.9" fill={TEAL.base} />
      </svg>

      {show && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            width: 220,
            background: "rgba(0,0,0,0.88)",
            color: "#ddd",
            fontSize: 9,
            lineHeight: 1.45,
            fontFamily: T.font.sans,
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${TEAL.border}`,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          Transport carbon estimated. Actual emissions may vary 10–18% based on regional supply chain.
        </div>
      )}
    </span>
  );
}

// ── Substitutes List ──
function SubstitutesList({ substitutes, C, T }) {
  const [open, setOpen] = useState(false);
  if (!substitutes || substitutes.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9,
          fontWeight: 600,
          color: TEAL.base,
          letterSpacing: 0.3,
        }}
      >
        <svg
          width={8}
          height={8}
          viewBox="0 0 8 8"
          fill={TEAL.base}
          style={{
            transition: "transform 0.15s",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <path d="M2 1l4 3-4 3z" />
        </svg>
        {substitutes.length} lower-carbon alternative{substitutes.length !== 1 ? "s" : ""}
      </button>

      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 4,
            paddingLeft: 12,
          }}
        >
          {substitutes.map((sub, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: 9,
                fontFamily: T.font.sans,
                color: C.textMuted,
                padding: "3px 8px",
                borderRadius: 4,
                background: `${TEAL.base}06`,
                border: `1px solid ${TEAL.base}10`,
              }}
            >
              <span style={{ fontWeight: 500, color: C.text, flex: 1, minWidth: 0 }}>
                {sub.material_name}
              </span>
              <span style={{ color: TEAL.bright, fontWeight: 600, whiteSpace: "nowrap" }}>
                −{pct(sub.co2e_reduction_pct)} CO₂
              </span>
              <span style={{ color: C.textDim, whiteSpace: "nowrap" }}>
                +{pct(sub.cost_premium_pct)} cost
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export default function NovaCarbonInsight({ carbon }) {
  const C = useTheme();
  const T = C.T;

  if (!carbon || carbon.total_co2e == null) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 12px",
        borderRadius: T.radius.md,
        background: `linear-gradient(135deg, ${TEAL.base}04, ${TEAL.base}08)`,
        border: `1px solid ${TEAL.border}`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: TEAL.base,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            Carbon
          </span>
          {carbon.transport_disclosed && <TransportDisclosure C={C} T={T} />}
        </div>
        {carbon.active_co2e_source && (
          <SourceBadge source={carbon.active_co2e_source} C={C} />
        )}
      </div>

      {/* Intensity value */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: TEAL.bright,
          fontFamily: T.font.sans,
          fontFeatureSettings: "'tnum'",
          letterSpacing: -0.3,
        }}
      >
        {fmtKg(carbon.total_co2e)}
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: TEAL.dim,
            marginLeft: 4,
            letterSpacing: 0,
          }}
        >
          kg CO₂e / unit
        </span>
      </div>

      {/* Extended total if available */}
      {carbon.co2e_extended != null && (
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            fontFamily: T.font.sans,
            fontFeatureSettings: "'tnum'",
          }}
        >
          {fmtKg(carbon.co2e_extended)}
          <span style={{ color: C.textDim, marginLeft: 4, fontSize: 9 }}>
            kg CO₂e total
          </span>
        </div>
      )}

      {/* Stage breakdown bar */}
      <StageBar
        a1_a3={carbon.a1_a3_co2e}
        a4={carbon.a4_co2e}
        a5={carbon.a5_co2e}
        T={T}
      />

      {/* Substitutes */}
      <SubstitutesList substitutes={carbon.substitutes} C={C} T={T} />
    </div>
  );
}
