// ============================================================
// NOVA Core — Admin Carbon Intelligence Panel
// /admin/carbon
//
// Four sections:
// 1. Carbon data coverage by trade
// 2. Org carbon tier distribution
// 3. Tree planting log (last 20)
// 4. Top 10 orgs by carbon performance (30 days)
//
// Style: Between Stars and Stone — teal family throughout
// ============================================================

import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";

// ── Teal palette ──
const TEAL = "#2DD4BF";
const TEAL_DIM = "rgba(45,212,191,0.10)";
const TEAL_BORDER = "rgba(45,212,191,0.18)";
const TEAL_GLOW = "rgba(45,212,191,0.25)";

const TIER_COLORS = {
  carbon_champion: "#2DD4BF",
  carbon_leader: "#34D399",
  carbon_conscious: "#60A5FA",
  carbon_aware: "#A78BFA",
  baseline: "#6B7280",
  unknown: "#4B5563",
};

const TIER_LABELS = {
  carbon_champion: "Champion",
  carbon_leader: "Leader",
  carbon_conscious: "Conscious",
  carbon_aware: "Aware",
  baseline: "Baseline",
};

const SOURCE_LABELS = {
  ice_generic: "ICE Generic",
  ice_generic_ec3: "ICE + EC3",
  epd_specific: "EPD Specific",
  estimated: "Estimated",
};

// ── Shared card style ──
function carbonCard(C) {
  return {
    background: C.bg1 || "#0C0B14",
    border: `1px solid ${TEAL_BORDER}`,
    borderRadius: C.T?.radius?.md || 14,
    padding: "24px 28px",
  };
}

// ── Section header ──
function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{
        fontSize: 16,
        fontWeight: 700,
        color: TEAL,
        margin: 0,
        letterSpacing: "-0.01em",
      }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 12, color: "rgba(238,237,245,0.45)", margin: "4px 0 0" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ── Table styles ──
const thStyle = {
  fontSize: 10,
  fontWeight: 600,
  color: "rgba(238,237,245,0.4)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "8px 12px",
  textAlign: "left",
  borderBottom: `1px solid ${TEAL_BORDER}`,
};

const tdStyle = {
  fontSize: 13,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

// ── Source badge ──
function SourceBadge({ source, count }) {
  const colors = {
    ice_generic: "#60A5FA",
    ice_generic_ec3: "#34D399",
    epd_specific: TEAL,
    estimated: "#F59E0B",
  };
  const color = colors[source] || "#6B7280";

  return count > 0 ? (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color,
      background: `${color}15`,
      padding: "3px 8px",
      borderRadius: 100,
    }}>
      {count}
      <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>
        {SOURCE_LABELS[source] || source}
      </span>
    </span>
  ) : (
    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>—</span>
  );
}

// ── Tier bar ──
function TierBar({ tier, count, maxCount }) {
  const color = TIER_COLORS[tier] || TIER_COLORS.unknown;
  const label = TIER_LABELS[tier] || tier;
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        color: "rgba(238,237,245,0.6)",
        width: 90,
        textAlign: "right",
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: 24,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: `${Math.max(pct, 2)}%`,
          height: "100%",
          background: `${color}40`,
          borderRight: `2px solid ${color}`,
          borderRadius: 6,
          transition: "width 0.6s ease",
        }} />
        <span style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 12,
          fontWeight: 700,
          color,
        }}>
          {count}
        </span>
      </div>
    </div>
  );
}

export default function AdminCarbonPage() {
  const C = useTheme();
  const T = C.T;
  const { data, loading, error } = useAdminFetch("nova-carbon");

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 200,
        color: TEAL,
        fontSize: 13,
      }}>
        Loading carbon intelligence...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        ...carbonCard(C),
        textAlign: "center",
        color: "#FB7185",
        fontSize: 13,
      }}>
        Failed to load carbon data: {error}
      </div>
    );
  }

  const tierOrder = ["carbon_champion", "carbon_leader", "carbon_conscious", "carbon_aware", "baseline"];
  const tierDist = data?.tier_distribution || {};
  const maxTierCount = Math.max(...Object.values(tierDist), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Header */}
      <div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: C.text,
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <span style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: TEAL_DIM,
            border: `1px solid ${TEAL_BORDER}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}>
            🌿
          </span>
          Carbon Intelligence
        </h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "6px 0 0" }}>
          Environmental impact coverage, tier distribution, and planting activity
        </p>
      </div>

      {/* ── Section 1: Carbon Data Coverage ── */}
      <div style={carbonCard(C)}>
        <SectionHeader
          title="Carbon Data Coverage"
          subtitle="CSI codes with carbon coefficients, grouped by trade and data source"
        />
        {data?.coverage?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Trade</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>CSI Codes</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>ICE Generic</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>ICE + EC3</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>EPD Specific</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Estimated</th>
                </tr>
              </thead>
              <tbody>
                {data.coverage.map((row, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 500 }}>
                      {row.trade_name}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: TEAL,
                        textShadow: `0 0 20px ${TEAL_GLOW}`,
                      }}>
                        {row.total_csi_codes}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <SourceBadge source="ice_generic" count={row.ice_generic} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <SourceBadge source="ice_generic_ec3" count={row.ice_generic_ec3} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <SourceBadge source="epd_specific" count={row.epd_specific} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <SourceBadge source="estimated" count={row.estimated} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.textDim }}>No carbon data found.</p>
        )}
      </div>

      {/* ── Section 2: Org Carbon Tier Distribution ── */}
      <div style={carbonCard(C)}>
        <SectionHeader
          title="Org Carbon Tier Distribution"
          subtitle="Number of organizations at each carbon commitment tier"
        />
        <div style={{ maxWidth: 480 }}>
          {tierOrder.map(tier => (
            <TierBar
              key={tier}
              tier={tier}
              count={tierDist[tier] || 0}
              maxCount={maxTierCount}
            />
          ))}
          {/* Show any unexpected tiers */}
          {Object.keys(tierDist)
            .filter(t => !tierOrder.includes(t))
            .map(tier => (
              <TierBar
                key={tier}
                tier={tier}
                count={tierDist[tier]}
                maxCount={maxTierCount}
              />
            ))}
        </div>
        <div style={{
          marginTop: 12,
          fontSize: 11,
          color: C.textDim,
        }}>
          Total orgs: {Object.values(tierDist).reduce((a, b) => a + b, 0)}
        </div>
      </div>

      {/* ── Section 3: Tree Planting Log ── */}
      <div style={carbonCard(C)}>
        <SectionHeader
          title="Tree Planting Log"
          subtitle="Last 20 planting events from carbon tier milestones"
        />
        {data?.tree_log?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Org</th>
                  <th style={thStyle}>Event</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Trees</th>
                  <th style={thStyle}>Grove</th>
                  <th style={thStyle}>Tier</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.tree_log.map((row, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.org_name}
                    </td>
                    <td style={{ ...tdStyle, color: C.textMuted }}>
                      <span style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 100,
                        background: TEAL_DIM,
                        color: TEAL,
                        fontWeight: 500,
                      }}>
                        {row.event_type?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#34D399",
                      }}>
                        {row.trees_awarded}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: row.grove_name ? TEAL : C.textDim, fontStyle: row.grove_name ? "normal" : "italic" }}>
                      {row.grove_name || "—"}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: TIER_COLORS[row.carbon_tier] || "#6B7280",
                      }}>
                        {TIER_LABELS[row.carbon_tier] || row.carbon_tier}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: C.textDim, fontSize: 11 }}>
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.textDim }}>No tree planting events yet.</p>
        )}
      </div>

      {/* ── Section 4: Top 10 Orgs by Carbon Performance ── */}
      <div style={carbonCard(C)}>
        <SectionHeader
          title="Top Carbon Performers"
          subtitle="Top 10 organizations by CO2e saved in the last 30 days"
        />
        {data?.top_orgs?.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 32 }}>#</th>
                  <th style={thStyle}>Organization</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>CO2e Saved (kg)</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Scores</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Avg Sub. Rate</th>
                  <th style={thStyle}>Best Tier</th>
                </tr>
              </thead>
              <tbody>
                {data.top_orgs.map((org, i) => (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: i < 3 ? TEAL : C.textDim,
                      }}>
                        {i + 1}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: C.text, fontWeight: 500 }}>
                      {org.org_name}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: TEAL,
                        textShadow: `0 0 20px ${TEAL_GLOW}`,
                      }}>
                        {org.total_co2e_saved.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: C.textMuted }}>
                      {org.score_count}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: C.textMuted }}>
                      {(org.avg_substitution_rate * 100).toFixed(1)}%
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: TIER_COLORS[org.best_tier] || "#6B7280",
                      }}>
                        {TIER_LABELS[org.best_tier] || org.best_tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.textDim }}>No carbon scores in the last 30 days.</p>
        )}
      </div>

      {/* Timestamp */}
      {data?.timestamp && (
        <p style={{ fontSize: 11, color: C.textDim, textAlign: "right" }}>
          Data as of {new Date(data.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}
