import { useMemo } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";

/* ────────────────────────────────────────────────────────
   PipelineHeroWidget — Financial instrument, not a map.
   Full-width hero. Carbon fiber material. Two columns:
   Left: pipeline summary. Right: active bid list.
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

function formatValue(v) {
  if (v >= 1_000_000) return { num: (v / 1_000_000).toFixed(2), suffix: "M" };
  if (v >= 1_000) return { num: (v / 1_000).toFixed(0), suffix: "K" };
  return { num: v.toFixed(0), suffix: "" };
}

function formatShort(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return "—";
}

export default function PipelineHeroWidget() {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  const data = useMemo(() => {
    const filtered =
      activeCompanyId === "__all__"
        ? estimatesIndex
        : estimatesIndex.filter(e => (e.companyProfileId || "") === (activeCompanyId || ""));

    const bidding = filtered.filter(e => e.status === "Bidding" || e.status === "Submitted");
    const won = filtered.filter(e => e.status === "Won");
    const lost = filtered.filter(e => e.status === "Lost");
    const pipeline = bidding.reduce((s, e) => s + nn(e.grandTotal), 0);

    return {
      pipeline,
      biddingCount: bidding.length,
      wonCount: won.length,
      lostCount: lost.length,
      activeBids: bidding
        .sort((a, b) => nn(b.grandTotal) - nn(a.grandTotal))
        .slice(0, 8)
        .map(e => ({
          id: e.id,
          name: e.name || "Untitled",
          value: nn(e.grandTotal),
          status: e.status === "Submitted" ? "Submitted" : "Bidding",
        })),
    };
  }, [estimatesIndex, activeCompanyId]);

  const hero = formatValue(data.pipeline);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* ── Left column: pipeline summary ── */}
      <div
        style={{
          width: 180,
          minWidth: 180,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderRight: "0.5px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Label */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#E85C30",
            marginBottom: 8,
            fontFamily: "'Switzer', sans-serif",
          }}
        >
          Active Pipeline
        </div>

        {/* Hero number */}
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              fontSize: 52,
              fontWeight: 400,
              color: "rgba(255,255,255,0.95)",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            ${hero.num}
          </span>
          {hero.suffix && (
            <span
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: "italic",
                fontSize: 18,
                color: "rgba(255,255,255,0.4)",
                marginLeft: 2,
              }}
            >
              {hero.suffix}
            </span>
          )}
        </div>

        {/* Active count */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 400,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
            fontFamily: "'Switzer', sans-serif",
            fontVariantNumeric: "tabular-nums",
            marginBottom: 16,
          }}
        >
          {data.biddingCount} Active Bids
        </div>

        {/* Stat columns */}
        <div style={{ display: "flex", gap: 20 }}>
          <StatCol label="Bidding" value={data.biddingCount} color="rgba(255,255,255,0.7)" />
          <StatCol label="Won" value={data.wonCount} color="#4ADE80" />
          <StatCol label="Lost" value={data.lostCount} color="rgba(248,113,113,0.7)" />
        </div>
      </div>

      {/* ── Right column: active bids list ── */}
      <div
        style={{
          flex: 1,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Label */}
        <div
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#E85C30",
            marginBottom: 10,
            fontFamily: "'Switzer', sans-serif",
          }}
        >
          Active Bids
        </div>

        {/* Bid rows */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {data.activeBids.length === 0 && (
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                fontFamily: "'Switzer', sans-serif",
                paddingTop: 8,
              }}
            >
              No active bids
            </div>
          )}
          {data.activeBids.map(bid => (
            <div
              key={bid.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: "0.5px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Name */}
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.42)",
                  fontFamily: "'Switzer', sans-serif",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginRight: 12,
                }}
              >
                {bid.name}
              </div>

              {/* Badge + value */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontFamily: "'Switzer', sans-serif",
                    background: "rgba(232,92,48,0.12)",
                    color: "rgba(232,92,48,0.75)",
                    border: "0.5px solid rgba(232,92,48,0.22)",
                    padding: "2px 6px",
                  }}
                >
                  {bid.status}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: "'Switzer', sans-serif",
                    fontVariantNumeric: "tabular-nums",
                    color: bid.value > 0 ? "#E85C30" : "rgba(255,255,255,0.25)",
                    minWidth: 60,
                    textAlign: "right",
                  }}
                >
                  {bid.value > 0 ? formatShort(bid.value) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCol({ label, value, color }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.3)",
          fontFamily: "'Switzer', sans-serif",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color,
          fontFamily: "'Switzer', sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
