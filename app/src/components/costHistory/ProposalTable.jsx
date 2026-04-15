// ProposalTable — Unified table of estimates + historical proposals with expanded detail
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { getBuildingTypeLabel, getWorkTypeLabel, getOutcomeInfo, OUTCOME_STATUSES, LOST_REASONS, getStructuralSystemLabel, getDeliveryMethodLabel } from "@/constants/constructionTypes";
import { resolveLocationFactors } from "@/constants/locationFactors";
import { extractYear, getEscalationFactor, formatEscalation } from "@/utils/costEscalation";
import { sortDivisionNames } from "@/utils/csiFormat";
import { getCurrentYear } from "@/constants/constructionCostIndex";
import { MARKUP_CATEGORIES, classifyMarkup } from "@/constants/markupTaxonomy";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";

const fmtCost = n => {
  if (!n && n !== 0) return "\u2014";
  return "$" + Math.round(n).toLocaleString();
};

const ROM_DIVISIONS = [
  { code: "01", label: "General Requirements" }, { code: "02", label: "Existing Conditions/Demo" },
  { code: "03", label: "Concrete" }, { code: "04", label: "Masonry" }, { code: "05", label: "Metals" },
  { code: "06", label: "Wood & Plastics" }, { code: "07", label: "Thermal & Moisture" },
  { code: "08", label: "Openings" }, { code: "09", label: "Finishes" }, { code: "10", label: "Specialties" },
  { code: "11", label: "Equipment" }, { code: "14", label: "Conveying" }, { code: "21", label: "Fire Suppression" },
  { code: "22", label: "Plumbing" }, { code: "23", label: "HVAC" }, { code: "26", label: "Electrical" },
  { code: "27", label: "Communications" }, { code: "28", label: "Electronic Safety" },
  { code: "31", label: "Earthwork" }, { code: "32", label: "Exterior Improvements" }, { code: "33", label: "Utilities" },
];

function SourceBadge({ source, C }) {
  const colors = { estimate: C.blue, pdf: C.purple, manual: C.textDim };
  const labels = { estimate: "Estimate", pdf: "PDF", manual: "Manual" };
  return (
    <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${colors[source] || C.textDim}20`, color: colors[source] || C.textDim }}>
      {labels[source] || source}
    </span>
  );
}

function OutcomeBadge({ outcomeKey, C }) {
  const info = getOutcomeInfo(outcomeKey);
  const colorMap = { green: C.green, red: C.red, blue: C.blue, orange: C.orange, textDim: C.textDim };
  const color = colorMap[info.color] || C.textDim;
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${color}18`, color }}>
      {info.label}
    </span>
  );
}

export default function ProposalTable({
  filteredEntries,
  unifiedEntries,
  learningRecords,
  historicalProposals,
  handleEdit,
  handleDelete,
  handleRecalibrate,
  handleOutcomeChange,
}) {
  const C = useTheme();
  const T = C.T;
  const [expandedId, setExpandedId] = useState(null);

  if (filteredEntries.length === 0) {
    return (
      <div style={{ padding: "20px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, textAlign: "center" }}>
        {unifiedEntries.length > 0 ? (
          <>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>No entries match your filters</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Try adjusting the filter criteria above.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>No cost history data yet</div>
            <div style={{ fontSize: 10, color: C.textMuted }}>Create an estimate or import past proposals to start building your cost intelligence.</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
          gap: 6,
          padding: "4px 8px",
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        <span>Project</span>
        <span>Client</span>
        <span>Type</span>
        <span style={{ textAlign: "right" }}>SF</span>
        <span style={{ textAlign: "right" }}>$/SF</span>
        <span style={{ textAlign: "right" }}>Adj $/SF</span>
        <span style={{ textAlign: "right" }}>Total</span>
        <span style={{ textAlign: "center" }}>Outcome</span>
        <span style={{ textAlign: "center" }}>Source</span>
        <span />
      </div>

      {filteredEntries.map(entry => {
        const isExpanded = expandedId === entry.id;
        const costPerSF = entry.projectSF > 0 && entry.totalCost > 0 ? Math.round(entry.totalCost / entry.projectSF) : 0;
        const entryYear = extractYear(entry.date);
        const currentYr = getCurrentYear();
        const escalationFactor = getEscalationFactor(entryYear, currentYr);
        const adjCostPerSF = costPerSF > 0 && escalationFactor !== 1 ? Math.round(costPerSF * escalationFactor) : costPerSF;
        const divCount = Object.keys(entry.divisions || {}).length;
        const hasLearning = learningRecords.some(r => r.proposalId === entry.id);
        const entryMarkups = entry.markups || [];

        return (
          <div key={`${entry.source}-${entry.id}`}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
                gap: 6,
                padding: "7px 8px",
                borderRadius: 5,
                cursor: "pointer",
                alignItems: "center",
                background: isExpanded ? `${C.accent}08` : C.bg2,
                border: `1px solid ${isExpanded ? C.accent + "30" : C.border}`,
                transition: "all 0.12s",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </div>
              </div>
              <div style={{ fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.client || "\u2014"}
              </div>
              <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.3 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getBuildingTypeLabel(entry.buildingType)}
                </div>
                {entry.workType && (
                  <div style={{ color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getWorkTypeLabel(entry.workType)}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: T.font.sans }}>
                {entry.projectSF > 0 ? entry.projectSF.toLocaleString() : "\u2014"}
              </div>
              <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: T.font.sans }}>
                {costPerSF > 0 ? `$${costPerSF}` : "\u2014"}
              </div>
              <div style={{ fontSize: 10, textAlign: "right", fontFamily: T.font.sans }}>
                {adjCostPerSF > 0 && adjCostPerSF !== costPerSF ? (
                  <span style={{ color: C.accent, fontWeight: 600 }}>${adjCostPerSF}</span>
                ) : adjCostPerSF > 0 ? (
                  <span style={{ color: C.textDim }}>\u2014</span>
                ) : "\u2014"}
              </div>
              <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontWeight: 600, fontFamily: T.font.sans }}>
                {entry.totalCost > 0 ? fmtCost(entry.totalCost) : "\u2014"}
              </div>
              <div style={{ textAlign: "center" }}><OutcomeBadge outcomeKey={entry.outcome} C={C} /></div>
              <div style={{ textAlign: "center", display: "flex", gap: 3, justifyContent: "center", alignItems: "center" }}>
                <SourceBadge source={entry.source} C={C} />
                {hasLearning && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Cal</span>}
              </div>
              <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                {entry.source !== "estimate" && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(entry.id, entry.source); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 3, opacity: 0.4 }}
                    title="Delete"
                  >
                    <Ic d={I.trash} size={11} color={C.red} />
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div
                style={{
                  padding: "10px 12px",
                  margin: "2px 0 4px",
                  background: C.bg1,
                  borderRadius: "0 0 6px 6px",
                  border: `1px solid ${C.accent}20`,
                  borderTop: "none",
                }}
              >
                {/* Meta row */}
                <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
                  {entry.architect && <div style={{ fontSize: 10, color: C.textDim }}>Architect: <strong style={{ color: C.text }}>{entry.architect}</strong></div>}
                  <div style={{ fontSize: 10, color: C.textDim }}>Date: <strong style={{ color: C.text }}>{entry.date || "\u2014"}</strong></div>
                  <div style={{ fontSize: 10, color: C.textDim }}>Divisions: <strong style={{ color: C.text }}>{divCount}</strong></div>
                  {entry.sourceFileName && <div style={{ fontSize: 10, color: C.textDim }}>File: <strong style={{ color: C.text }}>{entry.sourceFileName}</strong></div>}
                  {entry.source === "estimate" && <div style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>Status: {entry.status}</div>}
                  {escalationFactor !== 1 && costPerSF > 0 && (
                    <div style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>
                      Escalation: {formatEscalation(escalationFactor)} ({entryYear}\u2192{currentYr})
                    </div>
                  )}
                </div>

                {/* Extended data row */}
                {(entry.laborType || entry.zipCode || entry.stories > 0 || entry.structuralSystem || entry.deliveryMethod) && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                    {entry.laborType && (() => {
                      const ltColors = { union: C.orange, prevailing_wage: C.red, open_shop: C.green };
                      const ltLabels = { union: "Union", prevailing_wage: "Prevailing Wage", open_shop: "Open Shop" };
                      const c = ltColors[entry.laborType] || C.textDim;
                      return <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: `${c}15`, color: c }}>{ltLabels[entry.laborType] || entry.laborType}</span>;
                    })()}
                    {entry.zipCode && (() => {
                      const loc = resolveLocationFactors(entry.zipCode);
                      return <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: `${C.blue}12`, color: C.blue }}>{loc.source !== "none" ? `${loc.label} (L:${loc.lab}\u00D7)` : entry.zipCode}</span>;
                    })()}
                    {entry.stories > 0 && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>{entry.stories} {entry.stories === 1 ? "story" : "stories"}</span>}
                    {entry.structuralSystem && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>{getStructuralSystemLabel(entry.structuralSystem)}</span>}
                    {entry.deliveryMethod && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>{getDeliveryMethodLabel(entry.deliveryMethod)}</span>}
                  </div>
                )}

                {/* Outcome metadata */}
                {entry.outcomeMetadata && (entry.outcomeMetadata.lostReason || entry.outcomeMetadata.competitor || entry.outcomeMetadata.contractAmount) && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 10, padding: "6px 10px", borderRadius: 5, background: C.bg2 }}>
                    {entry.outcomeMetadata.lostReason && (
                      <div style={{ fontSize: 10, color: C.textDim }}>Reason: <strong style={{ color: C.red }}>{LOST_REASONS.find(r => r.key === entry.outcomeMetadata.lostReason)?.label || entry.outcomeMetadata.lostReason}</strong></div>
                    )}
                    {entry.outcomeMetadata.competitor && <div style={{ fontSize: 10, color: C.textDim }}>Competitor: <strong style={{ color: C.text }}>{entry.outcomeMetadata.competitor}</strong></div>}
                    {entry.outcomeMetadata.competitorAmount && <div style={{ fontSize: 10, color: C.textDim }}>Their Bid: <strong style={{ color: C.text }}>{fmtCost(entry.outcomeMetadata.competitorAmount)}</strong></div>}
                    {entry.outcomeMetadata.contractAmount && <div style={{ fontSize: 10, color: C.textDim }}>Contract: <strong style={{ color: C.green }}>{fmtCost(entry.outcomeMetadata.contractAmount)}</strong></div>}
                  </div>
                )}

                {/* Division breakdown */}
                {divCount > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 3, marginBottom: 10 }}>
                    {Object.entries(entry.divisions).sort(([a], [b]) => sortDivisionNames(a, b)).map(([div, cost]) => {
                      const divInfo = ROM_DIVISIONS.find(d => d.code === div);
                      return (
                        <div key={div} style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", borderRadius: 3, background: C.bg2, fontSize: 10 }}>
                          <span style={{ color: C.textDim }}><span style={{ fontWeight: 700, fontFamily: T.font.sans }}>{div}</span> {divInfo?.label || ""}</span>
                          <span style={{ fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>{fmtCost(cost)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Markups breakdown */}
                {entryMarkups.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      Indirect Costs / Markups
                    </div>
                    {MARKUP_CATEGORIES.map(cat => {
                      const catItems = entryMarkups.filter(m => classifyMarkup(m.key).category === cat.key);
                      if (catItems.length === 0) return null;
                      const catColor = C[cat.color] || C.accent;
                      return (
                        <div key={cat.key} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: catColor, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, opacity: 0.8 }}>
                            {cat.label}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 3 }}>
                            {catItems.map(m => (
                              <div key={m.id || m.key} style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", borderRadius: 3, background: `${catColor}08`, fontSize: 10 }}>
                                <span style={{ color: C.textDim }}>{m.label || m.key}</span>
                                <span style={{ fontWeight: 600, color: catColor, fontFamily: T.font.sans }}>
                                  {m.type === "percent" ? `${m.inputValue}%` : ""} {fmtCost(m.calculatedAmount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ height: 4 }} />
                  </>
                )}

                {/* Notes */}
                {entry.notes && <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, fontStyle: "italic" }}>{entry.notes}</div>}

                {/* Row actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  {entry.source !== "estimate" && (
                    <>
                      <button
                        onClick={() => handleEdit(entry)}
                        style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.text, padding: "4px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}
                      >
                        <Ic d={I.edit} size={11} color={C.textDim} /> Edit
                      </button>
                      <select
                        value={entry.outcome}
                        onChange={e => { e.stopPropagation(); handleOutcomeChange(entry, e.target.value); }}
                        onClick={e => e.stopPropagation()}
                        style={inp(C, { padding: "4px 8px", fontSize: 10, width: 90 })}
                      >
                        {OUTCOME_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </>
                  )}
                  {divCount > 0 && (
                    <button
                      onClick={() => handleRecalibrate(entry)}
                      style={bt(C, { background: `${C.accent}12`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "4px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}
                    >
                      <Ic d={I.ai} size={12} color={C.accent} /> {hasLearning ? "Recalibrate" : "Calibrate"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
