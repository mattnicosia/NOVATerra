// RomResult — Full ROM result display with division breakdown table
// Features: Low/Mid/High range selector, editable markups, subdivision drill-down
import React, { useState, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/utils/designTokens";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { generateSubdivisionROM } from "@/utils/romEngine";
import { CONFIDENCE_TIERS, getConfidenceTier } from "@/utils/confidenceEngine";

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

const DEFAULT_MARKUPS = [
  { id: 1, label: "GC Overhead & Profit", pct: 10, enabled: true },
  { id: 2, label: "Contingency", pct: 5, enabled: true },
  { id: 3, label: "Bond", pct: 1.5, enabled: true },
];

const DEFAULT_SOFT_COSTS = [
  { id: 1, label: "A/E Design Fees", pct: 8, enabled: false, note: "Architectural & engineering design" },
  { id: 2, label: "Permits & Fees", pct: 2, enabled: false, note: "Building permits, plan review, impact fees" },
  {
    id: 3,
    label: "Testing & Inspections",
    pct: 1.5,
    enabled: false,
    note: "Geotech, special inspections, materials testing",
  },
  { id: 4, label: "Project Management", pct: 3, enabled: false, note: "Owner's rep, PM fees" },
  { id: 5, label: "Legal & Accounting", pct: 0.5, enabled: false, note: "Contract review, project accounting" },
  { id: 6, label: "Builder's Risk Insurance", pct: 0.75, enabled: false, note: "Construction period insurance" },
];

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
    <span
      title={tier.label}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: tier.color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}

export default function RomResult({ rom, email }) {
  const C = useTheme();
  const T = C.T;

  const [selectedRange, setSelectedRange] = useState("mid");
  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [generatingSubdivisions, setGeneratingSubdivisions] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, divCode: "" });

  const [editingSub, setEditingSub] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Markups
  const [markups, setMarkups] = useState(DEFAULT_MARKUPS);
  const [editingMarkup, setEditingMarkup] = useState(null); // { id, field } where field is "label" or "pct"
  const [editingMarkupValue, setEditingMarkupValue] = useState("");

  // Soft costs
  const [softCosts, setSoftCosts] = useState(DEFAULT_SOFT_COSTS);
  const [softCostsExpanded, setSoftCostsExpanded] = useState(false);
  const [editingSoftCost, setEditingSoftCost] = useState(null); // { id, field }
  const [editingSoftCostValue, setEditingSoftCostValue] = useState("");

  // Subdivision store
  const subdivisionData = useSubdivisionStore(s => s.subdivisionData);
  const setSubdivisionData = useSubdivisionStore(s => s.setSubdivisionData);
  const userOverrides = useSubdivisionStore(s => s.userOverrides);
  const setUserOverride = useSubdivisionStore(s => s.setUserOverride);
  const llmRefinements = useSubdivisionStore(s => s.llmRefinements);
  const setLlmRefinements = useSubdivisionStore(s => s.setLlmRefinements);
  const validateLlmRefinement = useSubdivisionStore(s => s.validateLlmRefinement);
  const engineConfig = useSubdivisionStore(s => s.engineConfig);
  const calibrationFactors = useSubdivisionStore(s => s.calibrationFactors);

  const toggleDiv = useCallback(divCode => {
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
        setLlmRefinements(result.subdivisions);
        setExpandedDivs(new Set(Object.keys(result.subdivisions)));
      }
    } catch (err) {
      console.error("[RomResult] Subdivision generation failed:", err);
    } finally {
      setGeneratingSubdivisions(false);
      setGenProgress({ current: 0, total: 0, divCode: "" });
    }
  }, [rom, generatingSubdivisions, userOverrides, llmRefinements, calibrationFactors, engineConfig]);

  if (!rom) return null;

  const { divisions, totals, projectSF, jobType } = rom;
  const divEntries = Object.entries(divisions).sort(([a], [b]) => a.localeCompare(b));
  const totalPerSF =
    projectSF > 0
      ? { low: totals.low / projectSF, mid: totals.mid / projectSF, high: totals.high / projectSF }
      : { low: 0, mid: 0, high: 0 };

  // Compute markups
  const totalMarkupPct = markups.filter(m => m.enabled).reduce((sum, m) => sum + (m.pct || 0), 0);
  const markupMultiplier = 1 + totalMarkupPct / 100;
  const grandTotals = {
    low: totals.low * markupMultiplier,
    mid: totals.mid * markupMultiplier,
    high: totals.high * markupMultiplier,
  };
  const grandPerSF = {
    low: totalPerSF.low * markupMultiplier,
    mid: totalPerSF.mid * markupMultiplier,
    high: totalPerSF.high * markupMultiplier,
  };

  // Compute soft costs (applied as % of construction hard cost = grandTotals)
  const totalSoftCostPct = softCosts.filter(sc => sc.enabled).reduce((sum, sc) => sum + (sc.pct || 0), 0);
  const softCostTotals = {
    low: grandTotals.low * (totalSoftCostPct / 100),
    mid: grandTotals.mid * (totalSoftCostPct / 100),
    high: grandTotals.high * (totalSoftCostPct / 100),
  };
  const totalProjectCost = {
    low: grandTotals.low + softCostTotals.low,
    mid: grandTotals.mid + softCostTotals.mid,
    high: grandTotals.high + softCostTotals.high,
  };
  const totalProjectPerSF = {
    low: projectSF > 0 ? totalProjectCost.low / projectSF : 0,
    mid: projectSF > 0 ? totalProjectCost.mid / projectSF : 0,
    high: projectSF > 0 ? totalProjectCost.high / projectSF : 0,
  };
  const hasSoftCosts = totalSoftCostPct > 0;

  const dimText = { color: C.textMuted, fontFamily: T.font.sans };
  const brightText = { color: C.text, fontFamily: T.font.sans };

  const cellBase = {
    padding: "10px 14px",
    fontFamily: T.font.sans,
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

  // Range selector styles
  const rangeOptions = ["low", "mid", "high"];
  const rangeLabels = { low: "Low", mid: "Mid", high: "High" };

  // Markup handlers
  const updateMarkup = (id, field, value) => {
    setMarkups(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)));
  };
  const addMarkup = () => {
    const nextId = Math.max(0, ...markups.map(m => m.id)) + 1;
    setMarkups(prev => [...prev, { id: nextId, label: "New Markup", pct: 0, enabled: true }]);
    setEditingMarkup({ id: nextId, field: "label" });
    setEditingMarkupValue("New Markup");
  };
  const removeMarkup = id => {
    setMarkups(prev => prev.filter(m => m.id !== id));
  };
  const commitMarkupEdit = () => {
    if (!editingMarkup) return;
    const { id, field } = editingMarkup;
    if (field === "pct") {
      const val = parseFloat(editingMarkupValue);
      if (!isNaN(val)) updateMarkup(id, "pct", val);
    } else {
      updateMarkup(id, "label", editingMarkupValue || "Markup");
    }
    setEditingMarkup(null);
    setEditingMarkupValue("");
  };

  // Soft cost handlers
  const updateSoftCost = (id, field, value) => {
    setSoftCosts(prev => prev.map(sc => (sc.id === id ? { ...sc, [field]: value } : sc)));
  };
  const addSoftCost = () => {
    const nextId = Math.max(0, ...softCosts.map(sc => sc.id)) + 1;
    setSoftCosts(prev => [...prev, { id: nextId, label: "New Soft Cost", pct: 0, enabled: true, note: "" }]);
    setEditingSoftCost({ id: nextId, field: "label" });
    setEditingSoftCostValue("New Soft Cost");
    setSoftCostsExpanded(true);
  };
  const removeSoftCost = id => {
    setSoftCosts(prev => prev.filter(sc => sc.id !== id));
  };
  const commitSoftCostEdit = () => {
    if (!editingSoftCost) return;
    const { id, field } = editingSoftCost;
    if (field === "pct") {
      const val = parseFloat(editingSoftCostValue);
      if (!isNaN(val)) updateSoftCost(id, "pct", val);
    } else {
      updateSoftCost(id, "label", editingSoftCostValue || "Soft Cost");
    }
    setEditingSoftCost(null);
    setEditingSoftCostValue("");
  };
  const toggleAllSoftCosts = enabled => {
    setSoftCosts(prev => prev.map(sc => ({ ...sc, enabled })));
  };

  // Column highlight for selected range
  const colHighlight = range =>
    range === selectedRange ? { color: C.accent, fontWeight: T.fontWeight.bold } : { color: C.textMuted };

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

      {/* ── Cost Summary Card with Range Selector ── */}
      <div style={card(C, { padding: T.space[6], marginBottom: T.space[5] })}>
        {/* Range selector */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: T.space[5] }}>
          <div
            style={{
              display: "inline-flex",
              borderRadius: 10,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              padding: 3,
              gap: 2,
            }}
          >
            {rangeOptions.map(r => (
              <button
                key={r}
                onClick={() => setSelectedRange(r)}
                style={{
                  padding: "7px 22px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.semibold,
                  fontFamily: T.font.sans,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background:
                    r === selectedRange
                      ? r === "mid"
                        ? `linear-gradient(135deg, ${C.accent}, #7C3AED)`
                        : C.isDark
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(0,0,0,0.08)"
                      : "transparent",
                  color: r === selectedRange ? "#fff" : C.textMuted,
                }}
              >
                {rangeLabels[r]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...sectionLabel(C), marginBottom: T.space[4], textAlign: "center" }}>
          {hasSoftCosts ? "Total Project Cost" : "Estimated Project Cost"}
        </div>

        {/* Big number — selected range */}
        <div style={{ textAlign: "center", marginBottom: T.space[4] }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: T.fontWeight.bold,
              fontFamily: T.font.sans,
              background: C.gradient || C.accent,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.1,
            }}
          >
            {fmt(hasSoftCosts ? totalProjectCost[selectedRange] : grandTotals[selectedRange])}
          </div>
          <div style={{ ...dimText, fontSize: T.fontSize.sm, marginTop: 6 }}>
            {fmtSF(hasSoftCosts ? totalProjectPerSF[selectedRange] : grandPerSF[selectedRange])}/SF &middot;{" "}
            {rangeLabels[selectedRange]} Range
            {totalMarkupPct > 0 && <span> &middot; incl. {totalMarkupPct.toFixed(1)}% markups</span>}
            {hasSoftCosts && <span> &middot; {totalSoftCostPct.toFixed(1)}% soft costs</span>}
          </div>
        </div>

        {/* All three ranges — compact */}
        <div
          style={{
            display: "flex",
            gap: T.space[4],
            justifyContent: "center",
            flexWrap: "wrap",
            paddingTop: T.space[4],
            borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          {rangeOptions.map(r => (
            <div
              key={r}
              onClick={() => setSelectedRange(r)}
              style={{
                textAlign: "center",
                cursor: "pointer",
                padding: "6px 16px",
                borderRadius: 8,
                background:
                  r === selectedRange ? (C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)") : "transparent",
                transition: "background 0.15s",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: r === selectedRange ? C.accent : C.textDim,
                  marginBottom: 2,
                }}
              >
                {rangeLabels[r]}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.md,
                  fontWeight: r === selectedRange ? T.fontWeight.bold : T.fontWeight.medium,
                  color: r === selectedRange ? C.text : C.textMuted,
                }}
              >
                {fmt(totals[r])}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>{fmtSF(totalPerSF[r])}/SF</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Generate Subdivisions Button ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 12px" }}>
        <button
          onClick={handleGenerateSubdivisions}
          disabled={generatingSubdivisions}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            background: generatingSubdivisions ? C.bg2 : `linear-gradient(135deg, #8B5CF6, #7C3AED)`,
            border: generatingSubdivisions ? `1px solid ${C.border}` : "none",
            cursor: generatingSubdivisions ? "default" : "pointer",
            color: generatingSubdivisions ? C.textMuted : "#fff",
            fontSize: 12,
            fontWeight: 600,
            transition: "all 0.15s",
          }}
        >
          {generatingSubdivisions ? (
            <>
              Generating... ({genProgress.current}/{genProgress.total})
            </>
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
              fontFamily: T.font.sans,
              minWidth: 600,
            }}
          >
            <thead>
              <tr>
                <th style={headerCell}>Div #</th>
                <th style={{ ...headerCell, width: "30%" }}>Division Name</th>
                <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "low" ? { color: C.accent } : {}) }}>
                  $/SF (Low)
                </th>
                <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "mid" ? { color: C.accent } : {}) }}>
                  $/SF (Mid)
                </th>
                <th style={{ ...headerCell, ...rightAlign, ...(selectedRange === "high" ? { color: C.accent } : {}) }}>
                  $/SF (High)
                </th>
                <th style={{ ...headerCell, ...rightAlign }}>Total ({rangeLabels[selectedRange]})</th>
              </tr>
            </thead>
            <tbody>
              {divEntries.map(([divNum, div], i) => (
                <React.Fragment key={divNum}>
                  <tr
                    onClick={() => toggleDiv(divNum)}
                    style={{
                      background:
                        i % 2 === 0 ? "transparent" : C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <td style={{ ...cellBase, color: C.textMuted, fontWeight: T.fontWeight.medium }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 14,
                          fontSize: 10,
                          color: C.textDim,
                          transition: "transform 0.15s",
                          transform: expandedDivs.has(divNum) ? "rotate(90deg)" : "none",
                        }}
                      >
                        &#9656;
                      </span>
                      {divNum}
                    </td>
                    <td style={{ ...cellBase, color: C.text, fontWeight: T.fontWeight.medium }}>{div.label}</td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("low"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.low)}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("mid"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.mid)}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("high"), fontFeatureSettings: "'tnum'" }}>
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
                      {fmt(div.total[selectedRange])}
                    </td>
                  </tr>
                  {expandedDivs.has(divNum) &&
                    subdivisionData[divNum] &&
                    subdivisionData[divNum].map((sub, si) => {
                      const isLlm = sub.source === "llm";
                      const isUser = sub.confidence === "user" || !!userOverrides[sub.code];
                      const llmData = llmRefinements[sub.code];
                      const isValidated = llmData?.validated;
                      const subSource = isUser ? "User" : isLlm ? (isValidated ? "LLM \u2713" : "LLM") : "Baseline";
                      const sourceColor = isUser ? "#22C55E" : isLlm ? "#8B5CF6" : "#6B7280";
                      const sourceBg = isUser
                        ? "rgba(34,197,94,0.12)"
                        : isLlm
                          ? "rgba(139,92,246,0.12)"
                          : "rgba(107,114,128,0.12)";
                      const isEditingThis = editingSub === `${divNum}-${sub.code}`;
                      const divMidPerSF = div.perSF?.mid || 0;

                      return (
                        <tr
                          key={`${divNum}-${sub.code}`}
                          style={{
                            background: isEditingThis
                              ? C.isDark
                                ? "rgba(139,92,246,0.08)"
                                : "rgba(139,92,246,0.04)"
                              : C.isDark
                                ? "rgba(139,92,246,0.04)"
                                : "rgba(139,92,246,0.02)",
                          }}
                        >
                          <td style={{ ...cellBase, paddingLeft: 36, color: C.textDim, fontSize: T.fontSize.xs }}>
                            <ConfidenceDot confidence={sub.confidence} C={C} />
                            {sub.code}
                            {isLlm && !isUser && (
                              <button
                                onClick={() => validateLlmRefinement(sub.code)}
                                title={isValidated ? "Validated" : "Validate this estimate"}
                                style={{
                                  marginLeft: 4,
                                  padding: 0,
                                  border: "none",
                                  background: "none",
                                  cursor: isValidated ? "default" : "pointer",
                                  fontSize: 11,
                                  color: isValidated ? "#22C55E" : C.textDim,
                                  opacity: isValidated ? 1 : 0.6,
                                }}
                              >
                                {isValidated ? "\u2714" : "\u2610"}
                              </button>
                            )}
                          </td>
                          <td style={{ ...cellBase, color: C.textMuted, fontSize: T.fontSize.xs }}>
                            <span style={{ marginRight: 6 }}>{sub.label}</span>
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 600,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: sourceBg,
                                color: sourceColor,
                                verticalAlign: "middle",
                              }}
                            >
                              {subSource}
                            </span>
                          </td>
                          <td
                            style={{
                              ...cellBase,
                              ...rightAlign,
                              ...colHighlight("low"),
                              fontSize: T.fontSize.xs,
                              fontFeatureSettings: "'tnum'",
                            }}
                          >
                            {sub.perSF ? fmtSF(sub.perSF.low) : "\u2014"}
                          </td>
                          <td
                            style={{
                              ...cellBase,
                              ...rightAlign,
                              ...colHighlight("mid"),
                              fontSize: T.fontSize.xs,
                              fontFeatureSettings: "'tnum'",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              if (!isEditingThis && sub.perSF) {
                                setEditingSub(`${divNum}-${sub.code}`);
                                setEditingValue(sub.perSF.mid.toFixed(2));
                              }
                            }}
                          >
                            {isEditingThis ? (
                              <input
                                type="number"
                                autoFocus
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => {
                                  const val = parseFloat(editingValue);
                                  if (!isNaN(val) && val > 0 && divMidPerSF > 0) {
                                    setUserOverride(sub.code, { pctOfDiv: val / divMidPerSF });
                                  }
                                  setEditingSub(null);
                                  setEditingValue("");
                                }}
                                onKeyDown={e => {
                                  if (e.key === "Enter") e.target.blur();
                                  if (e.key === "Escape") {
                                    setEditingSub(null);
                                    setEditingValue("");
                                  }
                                }}
                                style={{
                                  width: 60,
                                  padding: "2px 4px",
                                  fontSize: 11,
                                  fontFamily: T.font.sans,
                                  background: C.bg1,
                                  color: C.text,
                                  border: `1px solid ${C.accent}`,
                                  borderRadius: 4,
                                  textAlign: "right",
                                  outline: "none",
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  borderBottom: sub.perSF
                                    ? `1px dashed ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`
                                    : "none",
                                }}
                              >
                                {sub.perSF ? fmtSF(sub.perSF.mid) : "\u2014"}
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              ...cellBase,
                              ...rightAlign,
                              ...colHighlight("high"),
                              fontSize: T.fontSize.xs,
                              fontFeatureSettings: "'tnum'",
                            }}
                          >
                            {sub.perSF ? fmtSF(sub.perSF.high) : "\u2014"}
                          </td>
                          <td
                            style={{
                              ...cellBase,
                              ...rightAlign,
                              color: C.textMuted,
                              fontSize: T.fontSize.xs,
                              fontFeatureSettings: "'tnum'",
                            }}
                          >
                            {sub.total ? fmt(sub.total[selectedRange] || sub.total.mid) : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              ))}

              {/* ── Subtotal row ── */}
              <tr
                style={{
                  borderTop: `2px solid ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                  background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)",
                }}
              >
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text }} />
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text }}>Subtotal (Construction)</td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    ...colHighlight("low"),
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
                    ...colHighlight("mid"),
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
                    ...colHighlight("high"),
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
                    color: C.text,
                    fontSize: T.fontSize.md,
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmt(totals[selectedRange])}
                </td>
              </tr>

              {/* ── Markup rows ── */}
              {markups.map(m => {
                const markupAmt = totals[selectedRange] * (m.enabled ? m.pct / 100 : 0);
                const isEditLabel = editingMarkup?.id === m.id && editingMarkup?.field === "label";
                const isEditPct = editingMarkup?.id === m.id && editingMarkup?.field === "pct";

                return (
                  <tr key={m.id} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                    <td
                      style={{
                        ...cellBase,
                        color: C.textDim,
                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      }}
                    >
                      <button
                        onClick={() => updateMarkup(m.id, "enabled", !m.enabled)}
                        title={m.enabled ? "Disable" : "Enable"}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          border: `1px solid ${m.enabled ? C.accent : C.textDim}`,
                          background: m.enabled ? C.accent : "transparent",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          color: "#fff",
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        {m.enabled ? "\u2713" : ""}
                      </button>
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        color: m.enabled ? C.textMuted : C.textDim,
                        fontSize: T.fontSize.sm,
                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                        textDecoration: m.enabled ? "none" : "line-through",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isEditLabel ? (
                          <input
                            autoFocus
                            value={editingMarkupValue}
                            onChange={e => setEditingMarkupValue(e.target.value)}
                            onBlur={commitMarkupEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") {
                                setEditingMarkup(null);
                                setEditingMarkupValue("");
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: "2px 4px",
                              fontSize: 12,
                              fontFamily: T.font.sans,
                              background: C.bg1,
                              color: C.text,
                              border: `1px solid ${C.accent}`,
                              borderRadius: 4,
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingMarkup({ id: m.id, field: "label" });
                              setEditingMarkupValue(m.label);
                            }}
                            style={{
                              cursor: "pointer",
                              borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                            }}
                          >
                            {m.label}
                          </span>
                        )}
                        <button
                          onClick={() => removeMarkup(m.id)}
                          title="Remove markup"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: C.textDim,
                            fontSize: 12,
                            padding: 0,
                            opacity: 0.5,
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    </td>
                    <td
                      colSpan={3}
                      style={{
                        ...cellBase,
                        textAlign: "center",
                        color: m.enabled ? C.textMuted : C.textDim,
                        fontSize: T.fontSize.sm,
                        fontFeatureSettings: "'tnum'",
                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      }}
                    >
                      {isEditPct ? (
                        <input
                          type="number"
                          autoFocus
                          value={editingMarkupValue}
                          onChange={e => setEditingMarkupValue(e.target.value)}
                          onBlur={commitMarkupEdit}
                          onKeyDown={e => {
                            if (e.key === "Enter") e.target.blur();
                            if (e.key === "Escape") {
                              setEditingMarkup(null);
                              setEditingMarkupValue("");
                            }
                          }}
                          style={{
                            width: 50,
                            padding: "2px 4px",
                            fontSize: 12,
                            fontFamily: T.font.sans,
                            background: C.bg1,
                            color: C.text,
                            border: `1px solid ${C.accent}`,
                            borderRadius: 4,
                            textAlign: "center",
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingMarkup({ id: m.id, field: "pct" });
                            setEditingMarkupValue(String(m.pct));
                          }}
                          style={{
                            cursor: "pointer",
                            borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                          }}
                        >
                          {m.pct}%
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        color: m.enabled ? C.text : C.textDim,
                        fontWeight: T.fontWeight.medium,
                        fontFeatureSettings: "'tnum'",
                        fontSize: T.fontSize.sm,
                        borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                      }}
                    >
                      {m.enabled ? fmt(markupAmt) : "\u2014"}
                    </td>
                  </tr>
                );
              })}

              {/* Add markup button row */}
              <tr>
                <td style={{ ...cellBase, borderBottom: "none" }} />
                <td colSpan={4} style={{ ...cellBase, borderBottom: "none" }}>
                  <button
                    onClick={addMarkup}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: C.accent,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: T.font.sans,
                      padding: 0,
                    }}
                  >
                    + Add Markup
                  </button>
                </td>
                <td style={{ ...cellBase, borderBottom: "none" }} />
              </tr>

              {/* ── Grand Total row ── */}
              <tr
                style={{
                  borderTop: `2px solid ${C.accent}40`,
                  background: C.isDark ? "rgba(139,92,246,0.06)" : "rgba(139,92,246,0.03)",
                }}
              >
                <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }} />
                <td
                  style={{
                    ...cellBase,
                    fontWeight: T.fontWeight.bold,
                    color: C.text,
                    borderBottom: "none",
                    fontSize: T.fontSize.md,
                  }}
                >
                  Grand Total
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    ...colHighlight("low"),
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(grandPerSF.low)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    ...colHighlight("mid"),
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(grandPerSF.mid)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    ...colHighlight("high"),
                    borderBottom: "none",
                    fontFeatureSettings: "'tnum'",
                  }}
                >
                  {fmtSF(grandPerSF.high)}
                </td>
                <td
                  style={{
                    ...cellBase,
                    ...rightAlign,
                    fontWeight: T.fontWeight.bold,
                    borderBottom: "none",
                    fontSize: T.fontSize.lg,
                    fontFeatureSettings: "'tnum'",
                    background: C.gradient || C.accent,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {fmt(grandTotals[selectedRange])}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Soft Costs Module ── */}
      <div style={card(C, { padding: 0, marginBottom: T.space[5], overflow: "hidden" })}>
        {/* Header — click to expand/collapse */}
        <div
          onClick={() => setSoftCostsExpanded(!softCostsExpanded)}
          style={{
            padding: `${T.space[4]}px ${T.space[5]}px`,
            borderBottom: softCostsExpanded
              ? `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`
              : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 10,
                color: C.textDim,
                transition: "transform 0.15s",
                transform: softCostsExpanded ? "rotate(90deg)" : "none",
              }}
            >
              &#9656;
            </span>
            <div style={{ ...sectionLabel(C), margin: 0 }}>Soft Costs</div>
            {hasSoftCosts && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: T.font.sans,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: C.isDark ? "rgba(255,149,0,0.12)" : "rgba(255,149,0,0.08)",
                  color: "#FF9500",
                }}
              >
                {totalSoftCostPct.toFixed(1)}% &middot; {fmt(softCostTotals[selectedRange])}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!softCostsExpanded && !hasSoftCosts && (
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans }}>
                A/E fees, permits, inspections...
              </span>
            )}
            <button
              onClick={e => {
                e.stopPropagation();
                toggleAllSoftCosts(!hasSoftCosts);
                setSoftCostsExpanded(true);
              }}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: T.font.sans,
                cursor: "pointer",
                background: hasSoftCosts
                  ? C.isDark
                    ? "rgba(255,149,0,0.12)"
                    : "rgba(255,149,0,0.08)"
                  : C.isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                border: `1px solid ${hasSoftCosts ? "rgba(255,149,0,0.25)" : C.border}`,
                color: hasSoftCosts ? "#FF9500" : C.textMuted,
                transition: "all 0.15s",
              }}
            >
              {hasSoftCosts ? "Disable All" : "Enable All"}
            </button>
          </div>
        </div>

        {/* Soft cost rows */}
        {softCostsExpanded && (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font.sans, minWidth: 500 }}
            >
              <thead>
                <tr>
                  <th style={{ ...headerCell, width: 40 }} />
                  <th style={{ ...headerCell, width: "35%" }}>Category</th>
                  <th style={{ ...headerCell, textAlign: "center" }}>% of Hard Cost</th>
                  <th style={{ ...headerCell, ...rightAlign }}>$/SF ({rangeLabels[selectedRange]})</th>
                  <th style={{ ...headerCell, ...rightAlign }}>Amount ({rangeLabels[selectedRange]})</th>
                </tr>
              </thead>
              <tbody>
                {softCosts.map(sc => {
                  const scAmt = grandTotals[selectedRange] * (sc.enabled ? sc.pct / 100 : 0);
                  const scPerSF = projectSF > 0 ? scAmt / projectSF : 0;
                  const isEditLabel = editingSoftCost?.id === sc.id && editingSoftCost?.field === "label";
                  const isEditPct = editingSoftCost?.id === sc.id && editingSoftCost?.field === "pct";

                  return (
                    <tr key={sc.id} style={{ background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)" }}>
                      <td
                        style={{
                          ...cellBase,
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                        }}
                      >
                        <button
                          onClick={() => updateSoftCost(sc.id, "enabled", !sc.enabled)}
                          title={sc.enabled ? "Disable" : "Enable"}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: `1px solid ${sc.enabled ? "#FF9500" : C.textDim}`,
                            background: sc.enabled ? "#FF9500" : "transparent",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: "#fff",
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >
                          {sc.enabled ? "\u2713" : ""}
                        </button>
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          color: sc.enabled ? C.text : C.textDim,
                          fontSize: T.fontSize.sm,
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                          textDecoration: sc.enabled ? "none" : "line-through",
                          opacity: sc.enabled ? 1 : 0.6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isEditLabel ? (
                            <input
                              autoFocus
                              value={editingSoftCostValue}
                              onChange={e => setEditingSoftCostValue(e.target.value)}
                              onBlur={commitSoftCostEdit}
                              onKeyDown={e => {
                                if (e.key === "Enter") e.target.blur();
                                if (e.key === "Escape") {
                                  setEditingSoftCost(null);
                                  setEditingSoftCostValue("");
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: "2px 4px",
                                fontSize: 12,
                                fontFamily: T.font.sans,
                                background: C.bg1,
                                color: C.text,
                                border: `1px solid #FF9500`,
                                borderRadius: 4,
                                outline: "none",
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingSoftCost({ id: sc.id, field: "label" });
                                setEditingSoftCostValue(sc.label);
                              }}
                              style={{
                                cursor: "pointer",
                                borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                              }}
                            >
                              {sc.label}
                            </span>
                          )}
                          <button
                            onClick={() => removeSoftCost(sc.id)}
                            title="Remove"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: C.textDim,
                              fontSize: 12,
                              padding: 0,
                              opacity: 0.5,
                            }}
                          >
                            &times;
                          </button>
                        </div>
                        {sc.note && <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{sc.note}</div>}
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          textAlign: "center",
                          color: sc.enabled ? C.text : C.textDim,
                          fontSize: T.fontSize.sm,
                          fontFeatureSettings: "'tnum'",
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                        }}
                      >
                        {isEditPct ? (
                          <input
                            type="number"
                            autoFocus
                            value={editingSoftCostValue}
                            onChange={e => setEditingSoftCostValue(e.target.value)}
                            onBlur={commitSoftCostEdit}
                            onKeyDown={e => {
                              if (e.key === "Enter") e.target.blur();
                              if (e.key === "Escape") {
                                setEditingSoftCost(null);
                                setEditingSoftCostValue("");
                              }
                            }}
                            style={{
                              width: 50,
                              padding: "2px 4px",
                              fontSize: 12,
                              fontFamily: T.font.sans,
                              background: C.bg1,
                              color: C.text,
                              border: `1px solid #FF9500`,
                              borderRadius: 4,
                              textAlign: "center",
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditingSoftCost({ id: sc.id, field: "pct" });
                              setEditingSoftCostValue(String(sc.pct));
                            }}
                            style={{
                              cursor: "pointer",
                              borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"}`,
                            }}
                          >
                            {sc.pct}%
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          ...rightAlign,
                          color: sc.enabled ? C.textMuted : C.textDim,
                          fontFeatureSettings: "'tnum'",
                          fontSize: T.fontSize.sm,
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                        }}
                      >
                        {sc.enabled ? fmtSF(scPerSF) : "\u2014"}
                      </td>
                      <td
                        style={{
                          ...cellBase,
                          ...rightAlign,
                          color: sc.enabled ? C.text : C.textDim,
                          fontWeight: T.fontWeight.medium,
                          fontFeatureSettings: "'tnum'",
                          fontSize: T.fontSize.sm,
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                        }}
                      >
                        {sc.enabled ? fmt(scAmt) : "\u2014"}
                      </td>
                    </tr>
                  );
                })}

                {/* Add soft cost button row */}
                <tr>
                  <td style={{ ...cellBase, borderBottom: "none" }} />
                  <td colSpan={3} style={{ ...cellBase, borderBottom: "none" }}>
                    <button
                      onClick={addSoftCost}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#FF9500",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: T.font.sans,
                        padding: 0,
                      }}
                    >
                      + Add Soft Cost
                    </button>
                  </td>
                  <td style={{ ...cellBase, borderBottom: "none" }} />
                </tr>

                {/* Soft cost subtotal */}
                {hasSoftCosts && (
                  <tr
                    style={{
                      borderTop: `1px solid ${C.isDark ? "rgba(255,149,0,0.2)" : "rgba(255,149,0,0.15)"}`,
                      background: C.isDark ? "rgba(255,149,0,0.06)" : "rgba(255,149,0,0.03)",
                    }}
                  >
                    <td style={{ ...cellBase, borderBottom: "none" }} />
                    <td style={{ ...cellBase, fontWeight: T.fontWeight.bold, color: C.text, borderBottom: "none" }}>
                      Soft Cost Subtotal
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        textAlign: "center",
                        fontWeight: T.fontWeight.bold,
                        color: "#FF9500",
                        borderBottom: "none",
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {totalSoftCostPct.toFixed(1)}%
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        fontWeight: T.fontWeight.bold,
                        color: "#FF9500",
                        borderBottom: "none",
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {fmtSF(projectSF > 0 ? softCostTotals[selectedRange] / projectSF : 0)}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        fontWeight: T.fontWeight.bold,
                        color: "#FF9500",
                        borderBottom: "none",
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {fmt(softCostTotals[selectedRange])}
                    </td>
                  </tr>
                )}

                {/* Total Project Cost (hard + soft) */}
                {hasSoftCosts && (
                  <tr
                    style={{
                      borderTop: `2px solid ${C.accent}40`,
                      background: C.isDark ? "rgba(139,92,246,0.06)" : "rgba(139,92,246,0.03)",
                    }}
                  >
                    <td style={{ ...cellBase, borderBottom: "none" }} />
                    <td
                      style={{
                        ...cellBase,
                        fontWeight: T.fontWeight.bold,
                        color: C.text,
                        borderBottom: "none",
                        fontSize: T.fontSize.md,
                      }}
                    >
                      Total Project Cost
                    </td>
                    <td style={{ ...cellBase, borderBottom: "none" }} />
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        fontWeight: T.fontWeight.bold,
                        borderBottom: "none",
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {fmtSF(totalProjectPerSF[selectedRange])}
                    </td>
                    <td
                      style={{
                        ...cellBase,
                        ...rightAlign,
                        fontWeight: T.fontWeight.bold,
                        borderBottom: "none",
                        fontSize: T.fontSize.lg,
                        fontFeatureSettings: "'tnum'",
                        background: C.gradient || C.accent,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {fmt(totalProjectCost[selectedRange])}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Assumptions ── */}
      <div style={card(C, { padding: T.space[5], marginBottom: T.space[5] })}>
        <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Assumptions</div>
        <ul
          style={{
            margin: 0,
            paddingLeft: T.space[5],
            color: C.textMuted,
            fontFamily: T.font.sans,
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
            fontFamily: T.font.sans,
            fontSize: T.fontSize.sm,
            lineHeight: T.lineHeight.relaxed,
          }}
        >
          <li style={{ marginBottom: 4 }}>Land acquisition costs</li>
          {!hasSoftCosts && <li style={{ marginBottom: 4 }}>Soft costs (A/E fees, permits, inspections)</li>}
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
          fontFamily: T.font.sans,
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
