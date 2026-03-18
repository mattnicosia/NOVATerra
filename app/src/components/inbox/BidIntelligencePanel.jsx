import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBidIntelligence } from "@/hooks/useBidIntelligence";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const SENTIMENT_ICONS = {
  positive: I.check,
  caution: I.alert,
  neutral: I.info || I.eye,
};

const formatCurrency = n => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

export default function BidIntelligencePanel({ parsedData, editedFields }) {
  const C = useTheme();
  const T = C.T;
  const [expanded, setExpanded] = useState(true);

  const intel = useBidIntelligence(parsedData, editedFields);

  // Don't render if no historical data at all
  if (!intel.hasData) return null;

  const recColors = {
    strong_bid: C.green,
    consider: C.accent,
    caution: "#FF9500",
    insufficient_data: C.textDim,
  };
  const recLabels = {
    strong_bid: "Strong Bid",
    consider: "Consider",
    caution: "Use Caution",
    insufficient_data: "No History",
  };

  const recColor = recColors[intel.recommendation] || C.textDim;
  const recLabel = recLabels[intel.recommendation] || "";

  return (
    <div
      style={{
        borderRadius: T.radius.sm,
        border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
        background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
        marginBottom: T.space[4],
        overflow: "hidden",
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: `${T.space[3]} ${T.space[4]}`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: C.text,
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.chart || I.eye} size={14} color={C.accent} />
          <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold }}>Bid Intelligence</span>
          {recLabel && (
            <span
              style={{
                fontSize: 10,
                fontWeight: T.fontWeight.bold,
                padding: "2px 8px",
                borderRadius: T.radius.full,
                background: `${recColor}18`,
                color: recColor,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {recLabel}
            </span>
          )}
        </div>
        <Ic
          d={I.chevDown || I.down}
          size={12}
          color={C.textDim}
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: `0 ${T.space[4]} ${T.space[4]}` }}>
          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: T.space[3],
              marginBottom: T.space[3],
            }}
          >
            {/* Client History */}
            {intel.clientHistory.totalProjects > 0 && (
              <StatBox
                C={C}
                T={T}
                label="Client History"
                value={
                  intel.clientHistory.winRate !== null
                    ? `${intel.clientHistory.winRate}% win rate`
                    : `${intel.clientHistory.totalProjects} project${intel.clientHistory.totalProjects > 1 ? "s" : ""}`
                }
                sub={intel.clientHistory.lastProject ? `Last: ${intel.clientHistory.lastProject.name}` : null}
                accent={intel.clientHistory.winRate !== null && intel.clientHistory.winRate >= 50 ? C.green : null}
              />
            )}

            {/* Job Type Stats */}
            {intel.jobTypeStats.totalBid > 0 && (
              <StatBox
                C={C}
                T={T}
                label="Job Type"
                value={
                  intel.jobTypeStats.winRate !== null
                    ? `${intel.jobTypeStats.winRate}% win rate`
                    : `${intel.jobTypeStats.totalBid} past bid${intel.jobTypeStats.totalBid > 1 ? "s" : ""}`
                }
                sub={
                  intel.jobTypeStats.avgCostPerSF
                    ? `Avg: $${intel.jobTypeStats.avgCostPerSF}/SF`
                    : `${intel.jobTypeStats.won} won, ${intel.jobTypeStats.lost} lost`
                }
              />
            )}

            {/* ROM Preview */}
            {intel.romPreview && (
              <StatBox
                C={C}
                T={T}
                label="ROM Preview"
                value={`${formatCurrency(intel.romPreview.totalRange[0])} — ${formatCurrency(intel.romPreview.totalRange[1])}`}
                sub={intel.romPreview.costPerSF ? `$${Math.round(intel.romPreview.costPerSF.mid || 0)}/SF` : null}
                accent={C.accent}
              />
            )}

            {/* Architect History */}
            {intel.architectHistory.totalProjects > 0 && (
              <StatBox
                C={C}
                T={T}
                label="Architect"
                value={`${intel.architectHistory.totalProjects} project${intel.architectHistory.totalProjects > 1 ? "s" : ""}`}
                sub={
                  intel.architectHistory.avgValue > 0
                    ? `Avg value: ${formatCurrency(intel.architectHistory.avgValue)}`
                    : null
                }
              />
            )}
          </div>

          {/* Signals */}
          {intel.signals.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: T.space[3],
                borderRadius: T.radius.sm,
                background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              }}
            >
              {intel.signals.map((signal, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[2],
                    fontSize: T.fontSize.xs,
                    color:
                      signal.sentiment === "positive"
                        ? C.green
                        : signal.sentiment === "caution"
                          ? "#FF9500"
                          : C.textMuted,
                  }}
                >
                  <Ic
                    d={SENTIMENT_ICONS[signal.sentiment] || I.info}
                    size={12}
                    color={
                      signal.sentiment === "positive" ? C.green : signal.sentiment === "caution" ? "#FF9500" : C.textDim
                    }
                  />
                  <span>{signal.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ C, T, label, value, sub, accent }) {
  return (
    <div
      style={{
        padding: T.space[3],
        borderRadius: T.radius.sm,
        background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: T.fontWeight.semibold,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: T.fontSize.sm,
          fontWeight: T.fontWeight.semibold,
          color: accent || C.text,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: T.fontSize.xs,
            color: C.textDim,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
