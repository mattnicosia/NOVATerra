// ============================================================
// NOVA Core — Admin Intelligence Panel
// /admin/intelligence
//
// Four sections:
// 1. Coverage Map — per-metro CSI code counts by display_flag
// 2. National Fallback Rate — % queries falling back to national
// 3. Top 10 Most-Queried CSI Codes (30 days)
// 4. Display Flag Distribution (7 days) — stacked bar breakdown
// ============================================================

import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// ── Color mapping for display flags (M6: theme-aware via getter) ──
function getFlagColors(C) {
  return {
    none: C.green || "#34D399",
    indicative: C.yellow || "#F59E0B",
    insufficient_data: C.orange || "#FB923C",
    national_fallback: C.textDim || "#94A3B8",
    no_data: C.red || "#FB7185",
  };
}

const FLAG_LABELS = {
  none: "Full data",
  indicative: "Indicative",
  insufficient_data: "Limited data",
  national_fallback: "National avg",
  no_data: "No data",
};

function SectionHeader({ title, subtitle, icon, C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      {icon && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${C.accent}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={icon} size={13} color={C.accent} />
        </div>
      )}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: 10, color: C.textDim, margin: "2px 0 0" }}>{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Section 1: Coverage Map ──
function CoverageMap({ coverage, C, T, flagColors }) {
  if (!coverage || coverage.length === 0) {
    return (
      <div style={{ ...card(C), padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>
        No market intelligence data yet
      </div>
    );
  }

  return (
    <div style={{ ...card(C), padding: "16px 20px", overflow: "hidden" }}>
      <SectionHeader title="Coverage Map" subtitle="CSI code coverage by metro area" icon={I.plans} C={C} />

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 70px 70px 70px 70px",
          gap: 8,
          padding: "8px 12px",
          fontSize: 8,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          borderBottom: `1px solid ${C.border}`,
          background: C.bg2,
          borderRadius: `${T.radius.sm}px ${T.radius.sm}px 0 0`,
        }}
      >
        <span>Metro Area</span>
        <span style={{ textAlign: "right" }}>Total</span>
        <span style={{ textAlign: "right", color: flagColors.none }}>Full</span>
        <span style={{ textAlign: "right", color: flagColors.indicative }}>Indicative</span>
        <span style={{ textAlign: "right", color: flagColors.insufficient_data }}>Limited</span>
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {coverage.map((row, i) => (
          <div
            key={row.metro_area}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 70px 70px 70px 70px",
              gap: 8,
              padding: "7px 12px",
              fontSize: 11,
              color: C.text,
              borderBottom: `1px solid ${C.border}15`,
              background: i % 2 === 1 ? `${C.text}03` : "transparent",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 500,
              }}
            >
              {row.metro_area}
            </span>
            <span
              style={{
                textAlign: "right",
                fontWeight: 700,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
              }}
            >
              {row.total.toLocaleString()}
            </span>
            <span style={{ textAlign: "right", fontFamily: T.font.sans, color: flagColors.none }}>
              {row.none || 0}
            </span>
            <span style={{ textAlign: "right", fontFamily: T.font.sans, color: flagColors.indicative }}>
              {row.indicative || 0}
            </span>
            <span style={{ textAlign: "right", fontFamily: T.font.sans, color: flagColors.insufficient_data }}>
              {row.insufficient_data || 0}
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 12px", fontSize: 9, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
        {coverage.length} metro area{coverage.length !== 1 ? "s" : ""} with data
      </div>
    </div>
  );
}

// ── Section 2: National Fallback Rate ──
function FallbackRate({ fallback, C, T, flagColors }) {
  const { total_queries, national_queries, fallback_rate_pct } = fallback || {};
  const rate = fallback_rate_pct ?? 0;
  const rateColor = rate > 50 ? flagColors.no_data : rate > 25 ? flagColors.indicative : flagColors.none;

  return (
    <div style={{ ...card(C), padding: "20px 24px" }}>
      <SectionHeader
        title="National Fallback Rate"
        subtitle="ROM queries falling back to national data"
        icon={I.alertTriangle}
        C={C}
      />

      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        {/* Big number */}
        <div>
          <span
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: rateColor,
              fontFamily: T.font.sans,
              lineHeight: 1,
            }}
          >
            {rate}%
          </span>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>fallback rate</div>
        </div>

        {/* Detail stats */}
        <div style={{ display: "flex", gap: 20, paddingBottom: 4 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
              {(total_queries || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 9, color: C.textDim }}>total queries</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: flagColors.national_fallback, fontFamily: T.font.sans }}>
              {(national_queries || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 9, color: C.textDim }}>national fallbacks</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 14, height: 6, borderRadius: 3, background: `${C.text}08`, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(rate, 100)}%`,
            height: "100%",
            borderRadius: 3,
            background: rateColor,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Section 3: Top 10 CSI Codes ──
function TopCsiCodes({ topCodes, C, T }) {
  if (!topCodes || topCodes.length === 0) {
    return (
      <div style={{ ...card(C), padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>
        No ROM queries logged yet
      </div>
    );
  }

  const maxCount = topCodes[0]?.query_count || 1;

  return (
    <div style={{ ...card(C), padding: "16px 20px" }}>
      <SectionHeader title="Top 10 CSI Codes" subtitle="Most queried — last 30 days" icon={I.database} C={C} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {topCodes.map((row, i) => (
          <div
            key={row.csi_code_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 10px",
              borderRadius: T.radius.sm,
              background: `${C.text}03`,
            }}
          >
            <span
              style={{
                width: 20,
                fontSize: 10,
                fontWeight: 700,
                color: i < 3 ? C.accent : C.textDim,
                textAlign: "center",
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.text,
                fontFamily: T.font.sans,
                fontFeatureSettings: "'tnum'",
                width: 80,
              }}
            >
              {row.csi_code_id}
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: `${C.accent}10` }}>
              <div
                style={{
                  width: `${(row.query_count / maxCount) * 100}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${C.accent}, ${C.accentAlt || C.accent})`,
                  minWidth: 4,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.textMuted,
                fontFamily: T.font.sans,
                width: 40,
                textAlign: "right",
              }}
            >
              {row.query_count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section 4: Display Flag Distribution ──
function FlagDistribution({ distribution, total, C, T, flagColors }) {
  if (!distribution || distribution.length === 0) {
    return (
      <div style={{ ...card(C), padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>
        No ROM queries in the last 7 days
      </div>
    );
  }

  return (
    <div style={{ ...card(C), padding: "16px 20px" }}>
      <SectionHeader
        title="Display Flag Distribution"
        subtitle={`Last 7 days — ${(total || 0).toLocaleString()} queries`}
        icon={I.intelligence}
        C={C}
      />

      {/* Stacked bar */}
      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {distribution.map(d => {
          const color = flagColors[d.display_flag] || C.textDim;
          return (
            <div
              key={d.display_flag}
              title={`${FLAG_LABELS[d.display_flag] || d.display_flag}: ${d.count} (${d.pct}%)`}
              style={{
                width: `${d.pct}%`,
                minWidth: d.pct > 0 ? 2 : 0,
                background: color,
                transition: "width 0.4s ease",
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {distribution.map(d => {
          const color = flagColors[d.display_flag] || C.textDim;
          const label = FLAG_LABELS[d.display_flag] || d.display_flag;
          return (
            <div key={d.display_flag} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans, fontFeatureSettings: "'tnum'" }}>
                {d.count} ({d.pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Panel ──
export default function AdminIntelligencePage() {
  const C = useTheme();
  const T = C.T;
  const flagColors = getFlagColors(C);
  const { data, loading, error, refetch } = useAdminFetch("nova-intelligence");

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: C.textMuted,
          fontSize: 13,
        }}
      >
        Loading intelligence data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...card(C), padding: 24, textAlign: "center", color: C.red || "#F87171", fontSize: 13 }}>
        Failed to load intelligence data: {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>ROM Intelligence</h1>
          <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
            What users are seeing from the NOVA Core ROM engine
          </p>
        </div>
        <button
          onClick={refetch}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 600,
            color: C.textMuted,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = `${C.accent}40`;
            e.currentTarget.style.color = C.text;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.color = C.textMuted;
          }}
        >
          Refresh
        </button>
      </div>

      {/* Two-column: fallback rate + flag distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <FallbackRate fallback={data?.fallback} C={C} T={T} flagColors={flagColors} />
        <FlagDistribution distribution={data?.flag_distribution} total={data?.flag_total} C={C} T={T} flagColors={flagColors} />
      </div>

      {/* Full width */}
      <CoverageMap coverage={data?.coverage} C={C} T={T} flagColors={flagColors} />
      <TopCsiCodes topCodes={data?.top_csi_codes} C={C} T={T} />
    </div>
  );
}
