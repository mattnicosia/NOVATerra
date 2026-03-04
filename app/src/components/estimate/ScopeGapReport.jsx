import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { analyzeGaps } from "@/utils/scopeGapEngine";

const fmt = v =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);

export default function ScopeGapReport({ estimateItems, parsedProposal, projectName, packageName, subName }) {
  const C = useTheme();
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);

  const report = useMemo(() => analyzeGaps(estimateItems, parsedProposal), [estimateItems, parsedProposal]);

  const scoreColor = report.coverageScore >= 80 ? "#30D158" : report.coverageScore >= 60 ? "#FF9F0A" : "#FF453A";

  const handleLoadNarrative = async () => {
    if (narrative || narrativeLoading) return;
    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const res = await fetch("/api/scope-gap-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gapReport: report, projectName, packageName, subName }),
      });
      if (!res.ok) throw new Error("Failed to load narrative");
      const data = await res.json();
      setNarrative(data);
    } catch (err) {
      console.error("Scope gap narrative error:", err);
      setNarrativeError("Failed to generate analysis. Try again.");
    } finally {
      setNarrativeLoading(false);
    }
  };

  if (!report || (report.coverageScore === 0 && report.matched.length === 0)) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ color: C.textMuted, fontSize: 13 }}>No estimate items to compare against this proposal.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Coverage Score + Exposure Summary */}
      <div style={{ display: "flex", gap: 12 }}>
        {/* Score */}
        <div
          style={{
            flex: "0 0 auto",
            width: 120,
            textAlign: "center",
            padding: "16px 12px",
            borderRadius: 12,
            background: `${scoreColor}10`,
            border: `1px solid ${scoreColor}25`,
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{report.coverageScore}%</div>
          <div
            style={{
              color: C.textMuted,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginTop: 6,
            }}
          >
            Coverage
          </div>
        </div>

        {/* Stats cards */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <StatCard
            label="Missing Scope"
            value={report.missingFromProposal.length}
            suffix=" div"
            color="#FF453A"
            C={C}
          />
          <StatCard label="Exclusion Conflicts" value={report.exclusionConflicts.length} color="#FF9F0A" C={C} />
          <StatCard label="Qty Mismatches" value={report.quantityMismatches.length} color="#64D2FF" C={C} />
        </div>
      </div>

      {/* Total Exposure Banner */}
      {report.totalExposure > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(255,69,58,0.06)",
            border: "1px solid rgba(255,69,58,0.12)",
          }}
        >
          <Ic d={I.warn} size={16} color="#FF453A" />
          <div style={{ flex: 1, color: "#FF453A", fontSize: 13, fontWeight: 500 }}>
            Estimated Exposure: <strong>{fmt(report.totalExposure)}</strong> in uncovered or excluded scope
          </div>
        </div>
      )}

      {/* Missing from Proposal */}
      {report.missingFromProposal.length > 0 && (
        <GapSection
          title="Missing from Proposal"
          subtitle="Estimate divisions not covered by this proposal"
          icon={I.warn}
          color="#FF453A"
          expanded={expandedSection === "missing"}
          onToggle={() => setExpandedSection(expandedSection === "missing" ? null : "missing")}
          C={C}
        >
          {report.missingFromProposal.map((gap, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                borderBottom: i < report.missingFromProposal.length - 1 ? `1px solid ${C.border}10` : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span
                    style={{
                      background: "#FF453A20",
                      color: "#FF453A",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      marginRight: 8,
                    }}
                  >
                    Div {gap.division}
                  </span>
                  <span style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{gap.divisionName}</span>
                </div>
                <span style={{ color: "#FF453A", fontSize: 13, fontWeight: 600 }}>{fmt(gap.estimatedExposure)}</span>
              </div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {gap.estimateItems.slice(0, 5).map((item, j) => (
                  <div
                    key={j}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: C.textMuted,
                      paddingLeft: 8,
                    }}
                  >
                    <span>
                      {item.code ? `${item.code} — ` : ""}
                      {item.description}
                    </span>
                    <span>
                      {item.quantity} {item.unit} · {fmt(item.total)}
                    </span>
                  </div>
                ))}
                {gap.estimateItems.length > 5 && (
                  <div style={{ fontSize: 11, color: C.textDim, paddingLeft: 8 }}>
                    +{gap.estimateItems.length - 5} more items
                  </div>
                )}
              </div>
            </div>
          ))}
        </GapSection>
      )}

      {/* Exclusion Conflicts */}
      {report.exclusionConflicts.length > 0 && (
        <GapSection
          title="Exclusion Conflicts"
          subtitle="Sub excludes scope that your estimate includes"
          icon={I.warn}
          color="#FF9F0A"
          expanded={expandedSection === "exclusions"}
          onToggle={() => setExpandedSection(expandedSection === "exclusions" ? null : "exclusions")}
          C={C}
        >
          {report.exclusionConflicts.map((conflict, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                borderBottom: i < report.exclusionConflicts.length - 1 ? `1px solid ${C.border}10` : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#FF9F0A", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    "{conflict.exclusionText}"
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 12 }}>
                    Conflicts with {conflict.affectedDivisionName} (Div {conflict.affectedDivision})
                  </div>
                </div>
                <span style={{ color: "#FF9F0A", fontSize: 13, fontWeight: 600 }}>
                  {fmt(conflict.estimatedExposure)}
                </span>
              </div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {conflict.affectedItems.map((item, j) => (
                  <div
                    key={j}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: C.textMuted,
                      paddingLeft: 8,
                    }}
                  >
                    <span>
                      {item.code ? `${item.code} — ` : ""}
                      {item.description}
                    </span>
                    <span>{fmt(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </GapSection>
      )}

      {/* Quantity Mismatches */}
      {report.quantityMismatches.length > 0 && (
        <GapSection
          title="Quantity Mismatches"
          subtitle="Items where proposal quantities differ >20% from estimate"
          icon={I.change}
          color="#64D2FF"
          expanded={expandedSection === "qty"}
          onToggle={() => setExpandedSection(expandedSection === "qty" ? null : "qty")}
          C={C}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={thS(C)}>Division</th>
                <th style={{ ...thS(C), textAlign: "left" }}>Item</th>
                <th style={thS(C)}>Est Qty</th>
                <th style={thS(C)}>Prop Qty</th>
                <th style={thS(C)}>Diff</th>
              </tr>
            </thead>
            <tbody>
              {report.quantityMismatches.map((mm, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}10` }}>
                  <td style={tdS(C)}>
                    <span
                      style={{
                        background: "#64D2FF20",
                        color: "#64D2FF",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {mm.division}
                    </span>
                  </td>
                  <td style={{ ...tdS(C), textAlign: "left", color: C.text }}>{mm.estimateItem}</td>
                  <td style={tdS(C)}>
                    {mm.estQty} {mm.unit}
                  </td>
                  <td style={tdS(C)}>
                    {mm.propQty} {mm.unit}
                  </td>
                  <td
                    style={{
                      ...tdS(C),
                      color: mm.pctDiff > 0 ? "#30D158" : "#FF453A",
                      fontWeight: 600,
                    }}
                  >
                    {mm.pctDiff > 0 ? "+" : ""}
                    {mm.pctDiff}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GapSection>
      )}

      {/* Matched Divisions */}
      {report.matched.length > 0 && (
        <GapSection
          title="Covered Scope"
          subtitle="Estimate divisions with matching proposal items"
          icon={I.check}
          color="#30D158"
          expanded={expandedSection === "matched"}
          onToggle={() => setExpandedSection(expandedSection === "matched" ? null : "matched")}
          C={C}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {report.matched.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: "#30D15820",
                      color: "#30D158",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {m.division}
                  </span>
                  <span style={{ color: C.text, fontSize: 13 }}>{m.divisionName}</span>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span style={{ color: C.textMuted }}>Est: {fmt(m.estimateTotal)}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>Prop: {fmt(m.proposalTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        </GapSection>
      )}

      {/* Extra in Proposal */}
      {report.extraInProposal.length > 0 && (
        <GapSection
          title="Extra Scope in Proposal"
          subtitle="Items in proposal not found in your estimate"
          icon={I.plus}
          color="#BF5AF2"
          expanded={expandedSection === "extra"}
          onToggle={() => setExpandedSection(expandedSection === "extra" ? null : "extra")}
          C={C}
        >
          {report.extraInProposal.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 12px",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {item.csiCode && (
                  <span
                    style={{
                      background: "#BF5AF220",
                      color: "#BF5AF2",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {item.csiCode}
                  </span>
                )}
                <span style={{ color: C.text }}>{item.description}</span>
              </div>
              <span style={{ color: C.textMuted, fontWeight: 500 }}>{item.amount ? fmt(item.amount) : "—"}</span>
            </div>
          ))}
        </GapSection>
      )}

      {/* AI Analysis */}
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: `linear-gradient(135deg, ${C.accent}08, #BF5AF208)`,
          border: `1px solid ${C.accent}20`,
        }}
      >
        {narrative ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ic d={I.ai} size={14} color={C.accent} />
              <span
                style={{
                  color: C.accent,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                NOVA Analysis
              </span>
              <RiskBadge level={narrative.riskLevel} />
            </div>
            <div style={{ color: C.text, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {narrative.narrative}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            {narrativeError && <div style={{ color: "#FF453A", fontSize: 12, marginBottom: 6 }}>{narrativeError}</div>}
            <button
              onClick={handleLoadNarrative}
              disabled={narrativeLoading}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: C.accent,
                fontSize: 13,
                fontWeight: 600,
                cursor: narrativeLoading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "4px 0",
              }}
            >
              <Ic d={I.ai} size={14} color={C.accent} />
              {narrativeLoading
                ? "Analyzing..."
                : narrativeError
                  ? "Retry AI Risk Analysis"
                  : "Generate AI Risk Analysis"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function StatCard({ label, value, suffix, color, C }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: `${color}08`,
        border: `1px solid ${color}15`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {value}
        {suffix || ""}
      </div>
      <div
        style={{
          color: C.textMuted,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function GapSection({ title, subtitle, icon, color, expanded, onToggle, children, C }) {
  return (
    <div
      style={{
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${expanded ? color + "30" : C.border}`,
        background: expanded ? `${color}04` : "transparent",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        <Ic d={icon} size={14} color={color} />
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ color: C.textMuted, fontSize: 11, marginTop: 1 }}>{subtitle}</div>}
        </div>
        <Ic
          d={I.chevron}
          size={12}
          color={C.textMuted}
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
        />
      </div>
      {expanded && <div style={{ padding: "0 14px 12px" }}>{children}</div>}
    </div>
  );
}

function RiskBadge({ level }) {
  const colors = { low: "#30D158", medium: "#FF9F0A", high: "#FF453A" };
  const c = colors[level] || colors.medium;
  return (
    <span
      style={{
        background: `${c}18`,
        color: c,
        border: `1px solid ${c}30`,
        padding: "1px 8px",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {level} risk
    </span>
  );
}

const thS = C => ({
  padding: "6px",
  textAlign: "right",
  fontSize: 10,
  fontWeight: 600,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.3,
});

const tdS = C => ({
  padding: "6px",
  textAlign: "right",
  color: C.textMuted,
});
