// NovaCoreRomInsight — Display component for a single NOVA Core ROM result
// Shows: p10/p50/p90 confidence band, display flag badge, disclosure, data-as-of
// Designed for Between Stars and Stone palette. Does NOT modify any existing files.

import { useTheme } from "@/hooks/useTheme";
import { fmt2 } from "@/utils/format";
import NovaCarbonInsight from "./NovaCarbonInsight";

// ── Badge config by display_flag ──
const BADGE_CONFIG = {
  indicative: { label: "Indicative", bg: "orange", border: "orange" },
  insufficient_data: { label: "Limited data", bg: "orange", border: "orange" },
  national_fallback: { label: "National avg", bg: "textDim", border: "border" },
  no_data: { label: "No data", bg: "red", border: "red" },
  seed_fallback: { label: "Seed data", bg: "purple", border: "purple" },
};

function DisplayFlagBadge({ flag, C }) {
  const cfg = BADGE_CONFIG[flag];
  if (!cfg) return null;

  const color = C[cfg.bg] || cfg.bg;
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

function ConfidenceBandDisplay({ band, C, T }) {
  if (!band || (band.p10 === null && band.p50 === null && band.p90 === null)) {
    return (
      <span style={{ fontSize: 10, color: C.textDim, fontStyle: "italic" }}>
        No cost data available
      </span>
    );
  }

  const fmtVal = v => (v !== null ? fmt2(v) : "—");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* Primary: p50 median */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          fontFamily: T.font.sans,
          fontFeatureSettings: "'tnum'",
          letterSpacing: -0.3,
        }}
      >
        {fmtVal(band.p50)}
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: C.textDim,
            marginLeft: 6,
            letterSpacing: 0,
          }}
        >
          / unit
        </span>
      </div>

      {/* Confidence band: P10 — P50 — P90 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          fontSize: 10,
          fontFamily: T.font.sans,
          fontFeatureSettings: "'tnum'",
          color: C.textMuted,
        }}
      >
        <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>
          P10
        </span>
        <span>{fmtVal(band.p10)}</span>
        <span style={{ margin: "0 6px", color: C.textDim, fontSize: 8 }}>—</span>
        <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>
          P50
        </span>
        <span style={{ fontWeight: 600, color: C.accent }}>{fmtVal(band.p50)}</span>
        <span style={{ margin: "0 6px", color: C.textDim, fontSize: 8 }}>—</span>
        <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>
          P90
        </span>
        <span>{fmtVal(band.p90)}</span>
      </div>

      {/* Visual band bar */}
      {band.p10 !== null && band.p90 !== null && band.p50 !== null && band.p90 > band.p10 && (
        <div style={{ position: "relative", height: 4, borderRadius: 2, marginTop: 2 }}>
          {/* Full range bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 4,
              borderRadius: 2,
              background: `${C.accent}15`,
            }}
          />
          {/* P50 marker */}
          <div
            style={{
              position: "absolute",
              left: `${((band.p50 - band.p10) / (band.p90 - band.p10)) * 100}%`,
              top: -1,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.accent,
              transform: "translateX(-3px)",
              boxShadow: `0 0 4px ${C.accent}60`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function NovaCoreRomInsight({ result, carbon = null, showExtended = false }) {
  const C = useTheme();
  const T = C.T;

  if (!result) return null;

  const {
    adjusted_band,
    display_flag,
    disclosure,
    csi_title,
    trade_name,
    unit_code,
    extended_costs,
    fetched_at,
    is_seed_fallback,
    is_national,
    local_sample_count,
    national_sample_count,
  } = result;

  const effectiveFlag = is_seed_fallback ? "seed_fallback" : display_flag;
  const showBadge = effectiveFlag && effectiveFlag !== "none";
  const showDisclosure = disclosure && effectiveFlag !== "none";

  // Format data-as-of timestamp
  const dataAsOf = fetched_at
    ? new Date(fetched_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const fmtExt = v => (v !== null ? fmt2(v) : "—");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 12px",
        borderRadius: T.radius.md,
        background: `linear-gradient(135deg, ${C.accent}04, ${C.accent}08)`,
        border: `1px solid ${C.accent}15`,
      }}
    >
      {/* Header: NOVA Core + badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: C.accent,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            NOVA Core
          </span>
          {trade_name && (
            <span style={{ fontSize: 9, color: C.textDim }}>
              {trade_name}
            </span>
          )}
        </div>
        {showBadge && <DisplayFlagBadge flag={effectiveFlag} C={C} />}
      </div>

      {/* CSI title + unit */}
      {csi_title && (
        <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.3 }}>
          {csi_title}
          {unit_code && (
            <span style={{ color: C.textDim, marginLeft: 6, fontSize: 9 }}>
              per {unit_code}
            </span>
          )}
        </div>
      )}

      {/* Confidence band */}
      <ConfidenceBandDisplay band={adjusted_band} C={C} T={T} />

      {/* Carbon insight — rendered when carbon prop is non-null */}
      {carbon && <NovaCarbonInsight carbon={carbon} />}

      {/* Extended costs (quantity-based) */}
      {showExtended && extended_costs && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            paddingTop: 6,
            borderTop: `1px solid ${C.border}30`,
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            Extended
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              fontSize: 10,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
              color: C.textMuted,
            }}
          >
            <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>P10</span>
            <span>{fmtExt(extended_costs.p10_extended)}</span>
            <span style={{ margin: "0 6px", color: C.textDim, fontSize: 8 }}>—</span>
            <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>P50</span>
            <span style={{ fontWeight: 600, color: C.text }}>
              {fmtExt(extended_costs.p50_extended)}
            </span>
            <span style={{ margin: "0 6px", color: C.textDim, fontSize: 8 }}>—</span>
            <span style={{ fontWeight: 500, color: C.textDim, fontSize: 8, marginRight: 4 }}>P90</span>
            <span>{fmtExt(extended_costs.p90_extended)}</span>
          </div>
        </div>
      )}

      {/* Disclosure text */}
      {showDisclosure && (
        <div
          style={{
            fontSize: 9,
            color: C.textDim,
            lineHeight: 1.4,
            padding: "4px 8px",
            borderRadius: 4,
            background: `${C.text}04`,
            borderLeft: `2px solid ${effectiveFlag === "no_data" || effectiveFlag === "seed_fallback" ? C.red : C.orange}30`,
          }}
        >
          {disclosure}
        </div>
      )}

      {/* Footer: sample counts + data-as-of */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 8,
          color: C.textDim,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {local_sample_count > 0 && (
            <span>{local_sample_count} local sample{local_sample_count !== 1 ? "s" : ""}</span>
          )}
          {national_sample_count > 0 && (
            <span>{national_sample_count} national sample{national_sample_count !== 1 ? "s" : ""}</span>
          )}
          {is_national && local_sample_count === 0 && national_sample_count === 0 && (
            <span>National average</span>
          )}
        </div>
        {dataAsOf && (
          <span style={{ fontStyle: "italic" }}>
            Data as of {dataAsOf}
          </span>
        )}
      </div>
    </div>
  );
}

// Export sub-components for flexible composition
export { DisplayFlagBadge, ConfidenceBandDisplay };
