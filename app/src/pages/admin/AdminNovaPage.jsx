// AdminNovaPage — /admin/nova
// Live visibility into NOVA's brain: proposals, calibration pipeline, knowledge base
// Matt's eyes only — admin-gated

import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { normalizeProposal, getNormalizationTrace } from "@/utils/normalizationEngine";
import { validateProposal, getStatusColor, getStatusLabel } from "@/utils/proposalValidation";

const ff = { fontFamily: "'Switzer', -apple-system, sans-serif" };

const TABS = [
  { key: "proposals", label: "Proposals" },
  { key: "calibration", label: "Calibration" },
  { key: "pipeline", label: "Pipeline" },
  { key: "knowledge", label: "Knowledge" },
  { key: "agents", label: "Agents" },
];

function fmt(n) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/* ── PROPOSALS TAB ── */
function ProposalsTab() {
  const proposals = useMasterDataStore(s => s.masterData?.historicalProposals || []);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter) return proposals;
    const lower = filter.toLowerCase();
    return proposals.filter(p =>
      (p.projectName || p.name || "").toLowerCase().includes(lower) ||
      (p.jobType || "").toLowerCase().includes(lower) ||
      (p.source || "").toLowerCase().includes(lower)
    );
  }, [proposals, filter]);

  const stats = useMemo(() => {
    const gcCount = proposals.filter(p => p.proposalType === "gc").length;
    const subCount = proposals.filter(p => p.proposalType === "sub").length;
    const totalValue = proposals.reduce((s, p) => s + (p.totalCost || 0), 0);
    const types = new Set(proposals.map(p => p.jobType || p.buildingType || "unknown"));
    return { total: proposals.length, gcCount, subCount, totalValue, typeCount: types.size };
  }, [proposals]);

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL PROPOSALS", value: stats.total, color: "#00D4AA" },
          { label: "GC PROPOSALS", value: stats.gcCount, color: "#4DA6FF" },
          { label: "SUB PROPOSALS", value: stats.subCount, color: "#FFB020" },
          { label: "TOTAL VALUE", value: fmt(stats.totalValue), color: "#EEEDF5" },
          { label: "PROJECT TYPES", value: stats.typeCount, color: "#A855F7" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4, ...ff }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, ...ff }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text" placeholder="Search proposals..." value={filter} onChange={e => setFilter(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#EEEDF5", fontSize: 13, marginBottom: 16, outline: "none", ...ff }}
      />

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...ff }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Project", "Type", "SF", "Total", "$/SF", "Source", "Proposal Type", "Status", "Divisions"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const divCount = Object.keys(p.divisions || {}).filter(d => parseFloat(p.divisions[d]) > 0).length;
              const perSF = p.projectSF > 0 ? (p.totalCost / p.projectSF).toFixed(2) : "—";
              return (
                <tr key={p.id || i}
                  onClick={() => setSelected(selected === i ? null : i)}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", background: selected === i ? "rgba(0,212,170,0.06)" : "transparent" }}
                >
                  <td style={{ padding: "8px 10px", color: "#EEEDF5" }}>{p.projectName || p.name}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>{p.jobType || p.buildingType || "—"}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>{p.projectSF ? p.projectSF.toLocaleString() : "—"}</td>
                  <td style={{ padding: "8px 10px", color: "#00D4AA", fontWeight: 600 }}>{fmt(p.totalCost || 0)}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>${perSF}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: p.source === "pdf-upload" ? "rgba(0,212,170,0.1)" : "rgba(77,166,255,0.1)", color: p.source === "pdf-upload" ? "#00D4AA" : "#4DA6FF" }}>
                      {p.source || "manual"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: p.proposalType === "gc" ? "rgba(77,166,255,0.1)" : "rgba(255,176,32,0.1)", color: p.proposalType === "gc" ? "#4DA6FF" : "#FFB020" }}>
                      {p.proposalType === "gc" ? "GC" : "SUB"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {(() => {
                      const v = validateProposal(p, proposals);
                      return (
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                          background: `${getStatusColor(v.overallStatus)}15`, color: getStatusColor(v.overallStatus) }}>
                          {v.overallStatus}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>{divCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Full traceability panel */}
      {selected !== null && filtered[selected] && (() => {
        const p = filtered[selected];
        const trace = getNormalizationTrace(p);
        const norm = normalizeProposal(p);
        const validation = validateProposal(p, proposals);
        const divs = Object.entries(norm.divisions).sort(([a], [b]) => a.localeCompare(b));
        const sectionLabel = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, marginTop: 20, ...ff };
        const metaLabel = { color: "rgba(255,255,255,0.35)", fontSize: 10, ...ff };
        const metaValue = { color: "#EEEDF5", fontSize: 13, fontWeight: 500, ...ff };
        return (
          <div style={{ marginTop: 16, padding: 24, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>

            {/* Header */}
            <div style={{ fontSize: 18, fontWeight: 600, color: "#EEEDF5", marginBottom: 4, ...ff }}>{p.projectName || p.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 16, ...ff }}>Full normalization trace — every step from raw data to calibrated baseline</div>

            {/* ── STEP 0: VALIDATION GATES ── */}
            <div style={sectionLabel}>0. VALIDATION GATES</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: `${getStatusColor(validation.overallStatus)}15`,
                color: getStatusColor(validation.overallStatus),
                border: `1px solid ${getStatusColor(validation.overallStatus)}30`,
                ...ff,
              }}>
                {validation.overallStatus}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", ...ff }}>
                {getStatusLabel(validation.overallStatus)}
              </span>
              {validation.usableFor.length > 0 && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...ff }}>
                  Usable for: {validation.usableFor.join(", ")}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {Object.entries(validation.gates).map(([key, gate]) => (
                <div key={key} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px",
                  background: `${getStatusColor(gate.status)}06`, borderRadius: 6,
                  border: `1px solid ${getStatusColor(gate.status)}15`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0,
                    background: getStatusColor(gate.status),
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#EEEDF5", textTransform: "uppercase", letterSpacing: "0.08em", ...ff }}>
                        {gate.label}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: getStatusColor(gate.status), ...ff }}>
                        {gate.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, ...ff }}>{gate.reason}</div>
                    {gate.issues.length > 0 && gate.status !== "PASS" && (
                      <div style={{ marginTop: 4 }}>
                        {gate.issues.map((issue, i) => (
                          <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", paddingLeft: 8, borderLeft: `2px solid ${getStatusColor(gate.status)}30`, marginTop: 2, ...ff }}>
                            {issue}
                          </div>
                        ))}
                      </div>
                    )}
                    {gate.details?.formula && (
                      <div style={{ fontSize: 11, color: "#4DA6FF", marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {gate.details.formula}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── STEP 1: RAW INPUT ── */}
            <div style={sectionLabel}>1. RAW INPUT</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 8 }}>
              <div><div style={metaLabel}>SF</div><div style={metaValue}>{p.projectSF?.toLocaleString() || "—"}</div></div>
              <div><div style={metaLabel}>TOTAL COST</div><div style={{ ...metaValue, color: "#00D4AA" }}>{fmt(p.totalCost || 0)}</div></div>
              <div><div style={metaLabel}>RAW $/SF</div><div style={metaValue}>${trace.summary.rawPerSF}</div></div>
              <div><div style={metaLabel}>TYPE</div><div style={metaValue}>{p.jobType || p.buildingType || "—"}</div></div>
              <div><div style={metaLabel}>LABOR</div><div style={metaValue}>{p.laborType || "open-shop"}</div></div>
              <div><div style={metaLabel}>LOCATION</div><div style={metaValue}>{trace.summary.location}</div></div>
              <div><div style={metaLabel}>ZIP</div><div style={metaValue}>{p.zipCode || "—"}</div></div>
              <div><div style={metaLabel}>PROPOSAL TYPE</div><div style={{ ...metaValue, color: p.proposalType === "gc" ? "#4DA6FF" : "#FFB020" }}>{p.proposalType === "gc" ? "GC" : "SUB"}</div></div>
              <div><div style={metaLabel}>OUTCOME</div><div style={{ ...metaValue, color: p.outcome === "won" ? "#00D4AA" : p.outcome === "lost" ? "#FF4757" : "#FFB020" }}>{p.outcome || "pending"}</div></div>
            </div>

            {/* ── STEP 2: NORMALIZATION FACTORS ── */}
            <div style={sectionLabel}>2. NORMALIZATION FACTORS</div>
            <div style={{ padding: 14, background: "rgba(77,166,255,0.04)", borderRadius: 8, border: "1px solid rgba(77,166,255,0.1)", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#4DA6FF", marginBottom: 8, fontWeight: 600, ...ff }}>Adjusting to National Average, Open Shop baseline</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div style={metaLabel}>LOCATION FACTOR</div>
                  <div style={metaValue}>{norm.normalization.locationFactor}×</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...ff }}>mat={norm.normalization.locationBreakdown.material} lab={norm.normalization.locationBreakdown.labor} equip={norm.normalization.locationBreakdown.equipment}</div>
                </div>
                <div>
                  <div style={metaLabel}>LABOR FACTOR</div>
                  <div style={metaValue}>{norm.normalization.laborFactor}×</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...ff }}>{p.laborType || "open-shop"}</div>
                </div>
                <div>
                  <div style={metaLabel}>COMBINED FACTOR</div>
                  <div style={{ ...metaValue, color: "#4DA6FF", fontWeight: 700 }}>{norm.normalization.combinedFactor}×</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...ff }}>location × labor</div>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.4)", ...ff }}>
                Formula: <span style={{ color: "#EEEDF5" }}>${trace.summary.rawPerSF}/SF ÷ {norm.normalization.combinedFactor} = ${trace.summary.normalizedPerSF}/SF baseline</span>
              </div>
            </div>

            {/* ── STEP 3: NORMALIZED DIVISION BREAKDOWN ── */}
            <div style={sectionLabel}>3. NORMALIZED DIVISION BREAKDOWN</div>
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 80px 80px 60px", gap: "2px 8px", fontSize: 11, ...ff }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>DIV</div>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>BAR</div>
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "right" }}>RAW $/SF</div>
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "right" }}>÷ FACTOR</div>
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "right" }}>BASELINE</div>
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "right" }}>TOTAL</div>
              {divs.map(([div, d]) => {
                const maxPerSF = Math.max(...divs.map(([, x]) => x.rawPerSF));
                const barPct = maxPerSF > 0 ? (d.rawPerSF / maxPerSF) * 100 : 0;
                return [
                  <div key={`${div}-code`} style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>{div}</div>,
                  <div key={`${div}-bar`} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#00D4AA", borderRadius: 2, width: `${barPct}%` }} />
                    </div>
                  </div>,
                  <div key={`${div}-raw`} style={{ textAlign: "right", color: "#EEEDF5" }}>${d.rawPerSF}</div>,
                  <div key={`${div}-factor`} style={{ textAlign: "right", color: "rgba(255,255,255,0.3)" }}>÷ {d.factor}</div>,
                  <div key={`${div}-norm`} style={{ textAlign: "right", color: "#4DA6FF", fontWeight: 600 }}>${d.normalizedPerSF}</div>,
                  <div key={`${div}-total`} style={{ textAlign: "right", color: "rgba(255,255,255,0.4)" }}>{fmt(d.normalizedTotal)}</div>,
                ];
              })}
            </div>

            {/* ── STEP 4: NORMALIZED TOTALS ── */}
            <div style={sectionLabel}>4. NORMALIZED TOTALS</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ padding: "10px 16px", background: "rgba(0,212,170,0.06)", borderRadius: 8, border: "1px solid rgba(0,212,170,0.1)" }}>
                <div style={metaLabel}>RAW TOTAL</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#00D4AA", ...ff }}>{fmt(trace.summary.rawTotal)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", ...ff }}>${trace.summary.rawPerSF}/SF</div>
              </div>
              <div style={{ padding: "2px 16px", display: "flex", alignItems: "center", color: "rgba(255,255,255,0.3)", fontSize: 20 }}>→</div>
              <div style={{ padding: "10px 16px", background: "rgba(77,166,255,0.06)", borderRadius: 8, border: "1px solid rgba(77,166,255,0.1)" }}>
                <div style={metaLabel}>NORMALIZED (BASELINE)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#4DA6FF", ...ff }}>{fmt(trace.summary.normalizedTotal)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", ...ff }}>${trace.summary.normalizedPerSF}/SF at national avg open-shop</div>
              </div>
            </div>

            {/* ── STEP 5: MARKUP ANALYSIS ── */}
            {norm.markups?.items?.length > 0 && (
              <>
                <div style={sectionLabel}>5. MARKUP PATTERN</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8, ...ff }}>
                  Total markups: <span style={{ color: "#EEEDF5" }}>{fmt(norm.markups.rawMarkupTotal)} ({norm.markups.markupPctOfDirect}% of direct cost)</span>
                </div>
                {norm.markups.items.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, ...ff }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>{m.label}</span>
                    <span style={{ color: "#EEEDF5" }}>{m.pct ? `${m.pct}%` : fmt(m.amount)}</span>
                  </div>
                ))}
              </>
            )}

            {p.notes && <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic", ...ff }}>Notes: {p.notes}</div>}
          </div>
        );
      })()}
    </div>
  );
}

/* ── CALIBRATION TAB ── */
function CalibrationTab() {
  const getCalibrationFactors = useDrawingPipelineStore(s => s.getCalibrationFactors);
  const learningRecords = useDrawingPipelineStore(s => s.learningRecords);

  const factors = useMemo(() => getCalibrationFactors(), [getCalibrationFactors]);

  const divEntries = Object.entries(factors).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4, ...ff }}>LEARNING RECORDS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#00D4AA", ...ff }}>{learningRecords.length}</div>
        </div>
        <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4, ...ff }}>CALIBRATED DIVISIONS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#4DA6FF", ...ff }}>{divEntries.length}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, ...ff }}>
        Per-Division Calibration Factors
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 16, ...ff }}>
        Factor &gt; 1.0 = baseline was too low (actual costs higher). Factor &lt; 1.0 = baseline was too high.
      </div>

      {divEntries.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, ...ff }}>
          No calibration data. Import proposals and generate learning records.
        </div>
      ) : (
        <div>
          {divEntries.map(([div, data]) => {
            const d = typeof data === "number" ? { factor: data, count: 1, confidence: "low", gcFactor: null, subFactor: null, gcCount: 0, subCount: 0 } : data;
            const factorColor = d.factor > 1.15 ? "#FF4757" : d.factor < 0.85 ? "#4DA6FF" : "#00D4AA";
            const confColor = d.confidence === "high" ? "#00D4AA" : d.confidence === "medium" ? "#FFB020" : "#FF4757";
            return (
              <div key={div} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12, ...ff }}>
                <span style={{ width: 30, fontWeight: 700, color: "#EEEDF5" }}>{div}</span>

                {/* Factor bar */}
                <div style={{ flex: 1, position: "relative", height: 20 }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.1)" }} />
                  <div style={{
                    position: "absolute",
                    left: d.factor < 1 ? `${d.factor * 50}%` : "50%",
                    width: d.factor < 1 ? `${(1 - d.factor) * 50}%` : `${(d.factor - 1) * 50}%`,
                    top: 4, height: 12, background: factorColor, borderRadius: 2, opacity: 0.6,
                    maxWidth: "45%",
                  }} />
                </div>

                <span style={{ width: 50, textAlign: "right", fontWeight: 700, color: factorColor }}>{d.factor.toFixed(2)}x</span>
                <span style={{ width: 30, textAlign: "right", color: "rgba(255,255,255,0.4)" }}>{d.count}</span>
                <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${confColor}15`, color: confColor }}>{d.confidence?.toUpperCase() || "LOW"}</span>

                {/* GC/Sub breakdown */}
                <div style={{ width: 120, display: "flex", gap: 8, fontSize: 10 }}>
                  {d.gcFactor != null && <span style={{ color: "#4DA6FF" }}>GC:{d.gcFactor.toFixed(2)} ({d.gcCount})</span>}
                  {d.subFactor != null && <span style={{ color: "#FFB020" }}>Sub:{d.subFactor.toFixed(2)} ({d.subCount})</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── PIPELINE TAB ── */
function PipelineTab() {
  const proposals = useMasterDataStore(s => s.masterData?.historicalProposals || []);
  const learningRecords = useDrawingPipelineStore(s => s.learningRecords);

  const steps = [
    { label: "1. IMPORT", desc: "Proposal PDF uploaded or batch imported", count: proposals.length, color: "#4DA6FF", detail: `${proposals.filter(p => p.source === "pdf-upload").length} PDF uploads, ${proposals.filter(p => p.source?.includes("import")).length} batch imports` },
    { label: "2. EXTRACT", desc: "AI extracts 14 fields: SF, divisions, markups, building type", count: proposals.filter(p => Object.keys(p.divisions || {}).length > 0).length, color: "#A855F7", detail: "Claude Sonnet for PDF uploads, pre-structured for imports" },
    { label: "3. STORE", desc: "Stored in masterDataStore.historicalProposals (IndexedDB + Supabase)", count: proposals.length, color: "#00D4AA", detail: `${proposals.filter(p => p.proposalType === "gc").length} GC, ${proposals.filter(p => p.proposalType === "sub" || !p.proposalType).length} Sub` },
    { label: "4. GENERATE LEARNING", desc: "generateBaselineROM() → compare prediction vs actual → computeCalibration()", count: learningRecords.length, color: "#FFB020", detail: `${learningRecords.length} learning records from ${proposals.length} proposals` },
    { label: "5. CALIBRATE", desc: "getCalibrationFactors() aggregates with recency + completeness weighting", count: learningRecords.length > 0 ? "Active" : "Inactive", color: learningRecords.length > 0 ? "#00D4AA" : "#FF4757", detail: "Recency: 15% decay/year. Completeness: divisions/10. GC weight: 1.0x, Sub: 0.85x" },
    { label: "6. ROM OUTPUT", desc: "generateBaselineROM() applies calibration × multipliers to benchmarks", count: "Ready", color: "#00D4AA", detail: "Benchmark × calibration × workType × laborType × market × buildingParams" },
  ];

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#EEEDF5", marginBottom: 20, ...ff }}>Data Pipeline: Proposal → Calibrated ROM</div>

      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-start" }}>
          {/* Connector line */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: step.color, flexShrink: 0 }} />
            {i < steps.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 40, background: "rgba(255,255,255,0.08)" }} />}
          </div>

          <div style={{ flex: 1, padding: "8px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: step.color, ...ff }}>{step.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#EEEDF5", ...ff }}>{step.count}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4, ...ff }}>{step.desc}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", ...ff }}>{step.detail}</div>
          </div>
        </div>
      ))}

      {/* Health check */}
      <div style={{ marginTop: 24, padding: 16, borderRadius: 8, border: `1px solid ${learningRecords.length > 0 ? "rgba(0,212,170,0.2)" : "rgba(255,71,87,0.2)"}`, background: learningRecords.length > 0 ? "rgba(0,212,170,0.04)" : "rgba(255,71,87,0.04)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: learningRecords.length > 0 ? "#00D4AA" : "#FF4757", ...ff }}>
          {learningRecords.length > 0 ? `PIPELINE HEALTHY — ${learningRecords.length} learning records active` : "PIPELINE BROKEN — No learning records. Proposals are not calibrating the ROM."}
        </div>
      </div>
    </div>
  );
}

/* ── KNOWLEDGE TAB ── */
function KnowledgeTab() {
  const categories = [
    { name: "CSI Structure", files: 1, items: "50 divisions, 700+ codes", source: "Standard", confidence: "Deterministic", color: "#00D4AA" },
    { name: "Trade Groupings", files: 1, items: "23 bundles, 230+ aliases", source: "Matt's expertise", confidence: "Deterministic", color: "#00D4AA" },
    { name: "ROM Benchmarks", files: 1, items: "13 types × 20+ divisions", source: "Calibrated proposals", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Scope Templates", files: 1, items: "13 building types, 30-50 items each", source: "Matt's 15+ years", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Seed Assemblies", files: 1, items: "700+ pre-built line items", source: "RSMeans + market data", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Material Catalog", files: 1, items: "500+ materials with costs", source: "Manufacturer data", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Location Factors", files: 1, items: "100+ cities/regions", source: "RSMeans CCI", confidence: "Annual update", color: "#FFB020" },
    { name: "Schedule Parsers", files: 1, items: "9 schedule types", source: "AI prompts + rules", confidence: "85-90% accuracy", color: "#FFB020" },
    { name: "Blueprint Intelligence", files: 6, items: "4,990 lines", source: "Matt's expertise", confidence: "Canonical", color: "#00D4AA" },
    { name: "Construction Types", files: 1, items: "13 building + 12 work + 3 labor types", source: "Industry standard", confidence: "Deterministic", color: "#00D4AA" },
    { name: "Modules Encyclopedia", files: 1, items: "1,000+ system configs", source: "Matt's expertise", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Subdivision Benchmarks", files: 1, items: "50+ system archetypes", source: "Statistical analysis", confidence: "Medium", color: "#FFB020" },
    { name: "Embodied Carbon DB", files: 1, items: "100+ materials", source: "Athena/NIST", confidence: "Deterministic", color: "#00D4AA" },
    { name: "Labor Productivity", files: 1, items: "2,000+ task definitions", source: "RSMeans historical", confidence: "Calibrated", color: "#4DA6FF" },
    { name: "Cost Index", files: 1, items: "Annual inflation factors", source: "BLS PPI", confidence: "Annual update", color: "#FFB020" },
  ];

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#EEEDF5", marginBottom: 8, ...ff }}>NOVA Knowledge Base — {categories.length} Categories</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 20, ...ff }}>Total: ~13,000+ data points across ~25MB of structured construction knowledge</div>

      {categories.map((cat, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12, ...ff }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: "#EEEDF5", fontWeight: 500 }}>{cat.name}</span>
          <span style={{ width: 200, color: "rgba(255,255,255,0.4)" }}>{cat.items}</span>
          <span style={{ width: 120, color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{cat.source}</span>
          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${cat.color}15`, color: cat.color }}>{cat.confidence}</span>
        </div>
      ))}
    </div>
  );
}

/* ── AGENTS TAB ── */
function AgentsTab() {
  const agents = [
    {
      name: "Data Agent",
      status: "Active",
      role: "Retrieves facts from databases. Cannot generate or infer.",
      sources: ["Historical proposals", "ROM benchmarks", "Scope templates", "Material catalog", "Location factors"],
      rules: ["Only queries — never generates", "Returns source attribution with every data point", "If data doesn't exist, returns null — never invents"],
    },
    {
      name: "Reasoning Agent",
      status: "Active",
      role: "Applies construction logic to facts. Cannot invent data.",
      sources: ["Data Agent output", "Construction type multipliers", "Calibration factors", "Scope gap rules"],
      rules: ["Takes facts from Data Agent only", "Applies multipliers, adjustments, scope analysis", "If needed data is missing, returns 'insufficient data'", "Never fills gaps with guesses"],
    },
    {
      name: "Generation Agent",
      status: "Active",
      role: "Produces user-facing output. Constrained by facts.",
      sources: ["Reasoning Agent output", "Confidence scores", "Formatting rules"],
      rules: ["Cannot add data other agents didn't provide", "Every number includes source + confidence", "Uses NOVA voice (professional, direct, precise)", "Flags gaps explicitly"],
    },
    {
      name: "Wall Detection Agent (NOVAAgent)",
      status: "Learning",
      role: "Self-improving wall detection from PDF vector data.",
      sources: ["PyMuPDF vector paths", "User corrections", "Detection parameters"],
      rules: ["Adjusts parameters after 3+ corrections", "Persists config across sessions", "Logs every improvement with version number"],
    },
    {
      name: "Cost Prediction Agent",
      status: "Planned",
      role: "Predicts project costs from building type, SF, location.",
      sources: ["Calibrated ROM engine", "Historical outcomes (won/lost)", "Market trend data"],
      rules: ["Outputs ranges, never single numbers", "Confidence based on data point count", "Recalibrates on outcome feedback"],
    },
  ];

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#EEEDF5", marginBottom: 20, ...ff }}>NOVA Agent Architecture</div>

      {agents.map((agent, i) => (
        <div key={i} style={{ marginBottom: 16, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#EEEDF5", ...ff }}>{agent.name}</span>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: agent.status === "Active" ? "rgba(0,212,170,0.1)" : agent.status === "Learning" ? "rgba(255,176,32,0.1)" : "rgba(255,255,255,0.05)", color: agent.status === "Active" ? "#00D4AA" : agent.status === "Learning" ? "#FFB020" : "rgba(255,255,255,0.3)" }}>
              {agent.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10, ...ff }}>{agent.role}</div>

          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, ...ff }}>Data Sources</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {agent.sources.map((s, j) => (
              <span key={j} style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", ...ff }}>{s}</span>
            ))}
          </div>

          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, ...ff }}>Rules</div>
          {agent.rules.map((r, j) => (
            <div key={j} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "2px 0", ...ff }}>• {r}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── MAIN PAGE ── */
export default function AdminNovaPage() {
  const C = useTheme();
  const [tab, setTab] = useState("proposals");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.accent || "#00D4AA", textTransform: "uppercase", letterSpacing: "0.15em", ...ff }}>ADMIN</div>
        <div style={{ fontSize: 28, fontWeight: 300, color: "#EEEDF5", letterSpacing: -1, ...ff }}>NOVA Intelligence</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4, ...ff }}>Live visibility into the calibration pipeline, knowledge base, and agent architecture</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: tab === t.key ? "2px solid #00D4AA" : "2px solid transparent",
            color: tab === t.key ? "#EEEDF5" : "rgba(255,255,255,0.35)",
            cursor: "pointer", fontSize: 12, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.08em", transition: "all 0.2s", ...ff,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "proposals" && <ProposalsTab />}
      {tab === "calibration" && <CalibrationTab />}
      {tab === "pipeline" && <PipelineTab />}
      {tab === "knowledge" && <KnowledgeTab />}
      {tab === "agents" && <AgentsTab />}
    </div>
  );
}
