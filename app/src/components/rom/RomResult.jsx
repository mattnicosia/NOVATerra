// RomResult — Full ROM result display with division breakdown table
import React, { useState, useCallback } from 'react';
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { useSubdivisionStore } from '@/stores/subdivisionStore';
import { generateSubdivisionROM } from '@/utils/romEngine';
import { CONFIDENCE_TIERS, getConfidenceTier } from '@/utils/confidenceEngine';

const BUILDING_TYPE_LABELS = {
  "commercial-office": "Commercial Office",
  retail: "Retail",
  healthcare: "Healthcare",
  education: "Education",
  industrial: "Industrial",
  "residential-multi": "Residential - Multi-Family",
  hospitality: "Hospitality",
  "residential-single": "Residential - Single Family",
  "mixed-use": "Mixed-Use",
  government: "Government",
  religious: "Religious",
  restaurant: "Restaurant",
  parking: "Parking",
};

function fmt(n) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtSF(n) {
  if (n == null || isNaN(n)) return "$0.00";
  return "$" + n.toFixed(2);
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function ConfidenceDot({ confidence, C }) {
  const tier = getConfidenceTier(confidence);
  return (
    <span title={tier.label} style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: tier.color, marginRight: 6, verticalAlign: "middle",
    }} />
  );
}

export default function RomResult({ rom, email }) {
  const C = useTheme();

  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [generatingSubdivisions, setGeneratingSubdivisions] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, divCode: '' });

  // Subdivision store
  const subdivisionData = useSubdivisionStore(s => s.subdivisionData);
  const setSubdivisionData = useSubdivisionStore(s => s.setSubdivisionData);
  const userOverrides = useSubdivisionStore(s => s.userOverrides);
  const llmRefinements = useSubdivisionStore(s => s.llmRefinements);
  const setLlmRefinements = useSubdivisionStore(s => s.setLlmRefinements);
  const engineConfig = useSubdivisionStore(s => s.engineConfig);
  const calibrationFactors = useSubdivisionStore(s => s.calibrationFactors);

  if (!rom) return null;

  const { divisions, totals, projectSF, jobType } = rom;
  const divEntries = Object.entries(divisions).sort(([a], [b]) => a.localeCompare(b));
  const totalPerSF =
    projectSF > 0
      ? { low: totals.low / projectSF, mid: totals.mid / projectSF, high: totals.high / projectSF }
      : { low: 0, mid: 0, high: 0 };

  const dimText = { color: C.textMuted, fontFamily: "'DM Sans',sans-serif" };
  const brightText = { color: C.text, fontFamily: "'DM Sans',sans-serif" };

  const cellBase = {
    padding: "10px 14px",
    fontFamily: "'DM Sans',sans-serif",
    fontSize: T.fontSize.sm,
    borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    verticalAlign: "middle",
  };

  const headerCell = {
    ...colHeader(C),
    padding: "10px 14px",
    borderBottom: `2px solid ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  const rightAlign = { textAlign: "right" };

  const toggleDiv = useCallback((divCode) => {
    setExpandedDivs(prev => {
      const next = new Set(prev);
      if (next.has(divCode)) next.delete(divCode);
      else next.add(divCode);
      return next;
    });
  }, []);

  const handleGenerateSubdivisions = useCallback(async () => {
    if (!rom || generatingSubdivisions) return;
    setGeneratingSubdivisions(true);
    try {
      const result = await generateSubdivisionROM({
        baselineRom: rom,
        buildingType: rom.buildingType || rom.jobType,
        userOverrides,
        llmRefinements,
        calibrationFactors,
        engineConfig,
        generateLlm: true,
        onProgress: (divCode, idx, total) => {
          setGenProgress({ current: idx + 1, total, divCode });
        },
      });
      if (result?.subdivisions) {
        setSubdivisionData(result.subdivisions);
        setLlmRefinements(result.subdivisions); // Store LLM data
        // Expand all divisions to show results
        setExpandedDivs(new Set(Object.keys(result.subdivisions)));
      }
    } catch (err) {
      console.error('[RomResult] Subdivision generation failed:', err);
    } finally {
      setGeneratingSubdivisions(false);
      setGenProgress({ current: 0, total: 0, divCode: '' });
    }
  }, [rom, generatingSubdivisions, userOverrides, llmRefinements, calibrationFactors, engineConfig]);

  return (
    <div style={{ width: "100%", maxWidth: 800 }}>
      {/* ── Project Summary Card ── */}
      <div style={card(C, { padding: T.space[6], marginBottom: T.space[5] })}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[6], alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Building Type</div>
            <div style={{ ...brightText, fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold }}>
              {BUILDING_TYPE_LABELS[jobType] || jobType}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Project Size</div>
            <div style={{ ...brightText, fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold }}>
              {fmtNum(projectSF)} SF
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ ...sectionLabel(C), marginBottom: 4 }}>Prepared For</div>
            <div style={{ ...brightText, fontSize: T.fontSize.md, fontWeight: T.fontWeight.medium }}>{email}</div>
          </div>
        </div>
      </div>

      {/* ── Cost Summary Card ── */}
      <div style={card(C, { padding: T.space[6], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[4] }}>Estimated Project Cost</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[6], alignItems: "flex-end" }}>
          {/* Low */}
          <div style={{ textAlign: "center", flex: 1, minWidth: 100 }}>
            <div
              style={{
                ...dimText,
                fontSize: T.fontSize.xs,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Low
            </div>
            <div style={{ ...brightText, fontSize: T.fontSize.xl, fontWeight: T.fontWeight.semibold, opacity: 0.7 }}>
              {fmt(totals.low)}
            </div>
          </div>
          {/* Mid — prominent */}
          <div style={{ textAlign: "center", flex: 1.4, minWidth: 140 }}>
            <div
              style={{
                ...dimText,
                fontSize: T.fontSize.xs,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
                color: C.accent,
              }}
            >
              Mid-Range Estimate
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: T.fontWeight.bold,
                fontFamily: "'DM Sans',sans-serif",
                background: C.gradient || C.accent,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                lineHeight: 1.1,
              }}
            >
              {fmt(totals.mid)}
            </div>
          </div>
          {/* High */}
          <div style={{ textAlign: "center", flex: 1, minWidth: 100 }}>
            <div
              style={{
                ...dimText,
                fontSize: T.fontSize.xs,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              High
            </div>
            <div style={{ ...brightText, fontSize: T.fontSize.xl, fontWeight: T.fontWeight.semibold, opacity: 0.7 }}>
              {fmt(totals.high)}
            </div>
          </div>
        </div>

        {/* Cost per SF */}
        <div
          style={{
            marginTop: T.space[5],
            paddingTop: T.space[4],
            borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Cost Per Square Foot</div>
          <div style={{ display: "flex", gap: T.space[6], flexWrap: "wrap" }}>
            <div style={{ ...dimText, fontSize: T.fontSize.md }}>
              Low: <span style={{ color: C.text, fontWeight: T.fontWeight.semibold }}>{fmtSF(totalPerSF.low)}/SF</span>
            </div>
            <div style={{ ...dimText, fontSize: T.fontSize.md }}>
              Mid: <span style={{ color: C.accent, fontWeight: T.fontWeight.bold }}>{fmtSF(totalPerSF.mid)}/SF</span>
            </div>
            <div style={{ ...dimText, fontSize: T.fontSize.md }}>
              High:{" "}
              <span style={{ color: C.text, fontWeight: T.fontWeight.semibold }}>{fmtSF(totalPerSF.high)}/SF</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Generate Subdivisions Button ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 12px" }}>
        <button
          onClick={handleGenerateSubdivisions}
          disabled={generatingSubdivisions}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8,
            background: generatingSubdivisions ? C.bg2 : `linear-gradient(135deg, #8B5CF6, #7C3AED)`,
            border: generatingSubdivisions ? `1px solid ${C.border}` : "none",
            cursor: generatingSubdivisions ? "default" : "pointer",
            color: generatingSubdivisions ? C.textMuted : "#fff",
            fontSize: 12, fontWeight: 600,
            transition: "all 0.15s",
          }}
        >
          {generatingSubdivisions ? (
            <>Generating... ({genProgress.current}/{genProgress.total})</>
          ) : (
            <>Generate Subdivisions</>
          )}
        </button>
      </div>

      {/* ── Division Breakdown Table ── */}
      <div style={card(C, { padding: 0, marginBottom: T.space[5], overflow: "hidden" })}>
        <div
          style={{
            padding: `${T.space[4]}px ${T.space[5]}px`,
            borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          <div style={{ ...sectionLabel(C), margin: 0 }}>Division Breakdown</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "'DM Sans',sans-serif",
              minWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th style={headerCell}>Div #</th>
                <th style={{ ...headerCell, width: "30%" }}>Division Name</th>
                <th style={{ ...headerCell, ...rightAlign }}>$/SF (Low)</th>
                <th style={{ ...headerCell, ...rightAlign }}>$/SF (Mid)</th>
                <th style={{ ...headerCell, ...rightAlign }}>$/SF (High)</th>
                <th style={{ ...headerCell, ...rightAlign }}>Total (Mid)</th>
              </tr>
            </thead>
            <tbody>
              {divEntries.map(([divNum, div], i) => (
                <React.Fragment key={divNum}>
                  <tr
                    onClick={() => toggleDiv(divNum)}
                    style={{
                      background: i % 2 === 0 ? "transparent" : C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ ...cellBase, color: C.textMuted, fontWeight: T.fontWeight.medium }}>
                      <span style={{ display: "inline-block", width: 14, fontSize: 10, color: C.textDim, transition: "transform 0.15s", transform: expandedDivs.has(divNum) ? "rotate(90deg)" : "none" }}>&#9656;</span>
                      {divNum}
                    </td>
                    <td style={{ ...cellBase, color: C.text, fontWeight: T.fontWeight.medium }}>{div.label}</td>
                    <td style={{ ...cellBase, ...rightAlign, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.low)}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        color: C.text,
                        fontWeight: T.fontWeight.semibold,
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {fmtSF(div.perSF.mid)}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, color: C.textMuted, fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.high)}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        color: C.text,
                        fontWeight: T.fontWeight.semibold,
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {fmt(div.total.mid)}
                    </td>
                  </tr>
                  {expandedDivs.has(divNum) && subdivisionData[divNum] && subdivisionData[divNum].map((sub, si) => (
                    <tr key={`${divNum}-${sub.code}`} style={{
                      background: C.isDark ? "rgba(139,92,246,0.04)" : "rgba(139,92,246,0.02)",
                    }}>
                      <td style={{ ...cellBase, paddingLeft: 36, color: C.textDim, fontSize: T.fontSize.xs }}>
                        <ConfidenceDot confidence={sub.confidence} C={C} />
                        {sub.code}
                      </td>
                      <td style={{ ...cellBase, color: C.textMuted, fontSize: T.fontSize.xs }}>
                        {sub.label}
                      </td>
                      <td style={{ ...cellBase, ...rightAlign, color: C.textDim, fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                        {sub.perSF ? fmtSF(sub.perSF.low) : "\u2014"}
                      </td>
                      <td style={{ ...cellBase, ...rightAlign, color: C.textMuted, fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                        {sub.perSF ? fmtSF(sub.perSF.mid) : "\u2014"}
                      </td>
                      <td style={{ ...cellBase, ...rightAlign, color: C.textDim, fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                        {sub.perSF ? fmtSF(sub.perSF.high) : "\u2014"}
                      </td>
                      <td style={{ ...cellBase, ...rightAlign, color: C.textMuted, fontSize: T.fontSize.xs, fontFeatureSettings: "'tnum'" }}>
                        {sub.total ? fmt(sub.total.mid) : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {/* Totals row */}
              <tr
                style={{
                  borderTop: `2px solid ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                  background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
                }}
              >
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }} />
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }}>
                  Total
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    color: C.text,
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(totalPerSF.low)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    color: C.accent,
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(totalPerSF.mid)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    color: C.text,
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(totalPerSF.high)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    color: C.accent,
                    borderBottom: "none",
                    fontSize: T.fontSize.md,
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmt(totals.mid)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Assumptions ── */}
      <div style={card(C, { padding: T.space[5], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Assumptions</div>
        <ul
          style={{
            margin: 0,
            paddingLeft: T.space[5],
            color: C.textMuted,
            fontFamily: "'DM Sans',sans-serif",
            fontSize: T.fontSize.sm,
            lineHeight: T.lineHeight.relaxed,
          }}
        >
          <li style={{ marginBottom: 4 }}>Building type: {BUILDING_TYPE_LABELS[jobType] || jobType}</li>
          <li style={{ marginBottom: 4 }}>Standard structural and envelope systems assumed</li>
          <li style={{ marginBottom: 4 }}>Typical MEP systems for building type</li>
          <li style={{ marginBottom: 4 }}>Mid-range finish levels</li>
          <li style={{ marginBottom: 4 }}>Normal site conditions and access</li>
          <li>Competitive market pricing in a metropolitan area</li>
        </ul>
      </div>

      {/* ── Exclusions ── */}
      <div style={card(C, { padding: T.space[5], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Exclusions</div>
        <ul
          style={{
            margin: 0,
            paddingLeft: T.space[5],
            color: C.textMuted,
            fontFamily: "'DM Sans',sans-serif",
            fontSize: T.fontSize.sm,
            lineHeight: T.lineHeight.relaxed,
          }}
        >
          <li style={{ marginBottom: 4 }}>Land acquisition costs</li>
          <li style={{ marginBottom: 4 }}>Soft costs (A/E fees, permits, inspections)</li>
          <li style={{ marginBottom: 4 }}>Owner contingency</li>
          <li style={{ marginBottom: 4 }}>FF&E (furniture, fixtures, and equipment)</li>
          <li style={{ marginBottom: 4 }}>Unusual site conditions or hazardous material abatement</li>
          <li>Escalation beyond current market conditions</li>
        </ul>
      </div>

      {/* ── Footer disclaimer ── */}
      <div
        style={{
          textAlign: "center",
          padding: `${T.space[4]}px 0`,
          fontSize: T.fontSize.xs,
          color: C.textDim,
          fontFamily: "'DM Sans',sans-serif",
          lineHeight: T.lineHeight.relaxed,
          letterSpacing: 0.3,
        }}
      >
        This ROM is a preliminary estimate based on industry benchmarks.
        <br />
        Powered by NOVA Estimating Intelligence
      </div>
    </div>
  );
}
