// RomResult — Full ROM result display with division breakdown table
// Features: Low/Mid/High range selector, editable markups, subdivision drill-down
import React, { useState, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card, sectionLabel, colHeader } from "@/utils/styles";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { generateSubdivisionROM } from "@/utils/romEngine";
import { getConfidenceTier } from "@/utils/confidenceEngine";
import { generateScopeTemplate } from "@/constants/scopeTemplates";
import { generateTradeScopes } from "@/utils/tradeScopeGenerator";
import { TRADE_COLORS } from "@/constants/tradeGroupings";
import { useCorrectionStore } from "@/nova/learning/correctionStore";

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

// GR/GC mode: "requirements" = General Requirements only, "conditions" = General Conditions only, "both" = both
const GR_GC_OPTIONS = [
  { value: "requirements", label: "General Requirements", desc: "Division 01 — included in division benchmarks" },
  { value: "conditions", label: "General Conditions", desc: "Separate % markup on direct costs" },
  { value: "both", label: "Both (GR + GC)", desc: "Division 01 benchmarks + GC markup" },
];

const DEFAULT_MARKUPS = [
  { id: 1, label: "Contingency", pct: 5, enabled: false },
  { id: 2, label: "GC Overhead & Profit", pct: 10, enabled: true },
  { id: 3, label: "General Conditions", pct: 8, enabled: false },
  { id: 4, label: "Insurance (GL/WC)", pct: 2, enabled: true },
  { id: 5, label: "Bond", pct: 3, enabled: false },
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

function ConfidenceDot({ confidence, C: _C }) {
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
  const [showSubdivisions, setShowSubdivisions] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);
  const [showScopeItems, setShowScopeItems] = useState(true);
  const [showTradeScopes, setShowTradeScopes] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState(null);
  // Line item toggle — excluded items by code (shared between scope detail + trade scopes)
  const [excludedItems, setExcludedItems] = useState(new Set());
  const toggleItem = (code) => setExcludedItems(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const [divisionAdjustments, setDivisionAdjustments] = useState({}); // { divCode: multiplier }

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
  }, [
    rom,
    generatingSubdivisions,
    userOverrides,
    llmRefinements,
    calibrationFactors,
    engineConfig,
    setLlmRefinements,
    setSubdivisionData,
  ]);

  if (!rom) return null;

  const { divisions, totals: rawTotals, projectSF, jobType } = rom;
  const divEntries = Object.entries(divisions).sort(([a], [b]) => a.localeCompare(b));

  // Must be defined before totals computation
  const getDivisionMultiplier = (divCode) => divisionAdjustments[divCode] || 1.0;

  // Compute adjusted totals (account for division-level +/- adjustments)
  const hasAdjustments = Object.keys(divisionAdjustments).length > 0;
  const totals = hasAdjustments ? {
    low: divEntries.reduce((sum, [code, d]) => sum + (d.total?.low || d.low || 0) * getDivisionMultiplier(code), 0),
    mid: divEntries.reduce((sum, [code, d]) => sum + (d.total?.mid || d.mid || 0) * getDivisionMultiplier(code), 0),
    high: divEntries.reduce((sum, [code, d]) => sum + (d.total?.high || d.high || 0) * getDivisionMultiplier(code), 0),
  } : { low: rawTotals.low, mid: rawTotals.mid, high: rawTotals.high };

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

  // Division adjustment handlers
  const adjustDivision = (divCode, delta) => {
    const oldMult = divisionAdjustments[divCode] || 1.0;
    const newMult = Math.max(0, Math.round((oldMult + delta) * 100) / 100);
    useCorrectionStore.getState().logRomAdjustment(divCode, oldMult, newMult);
    setDivisionAdjustments(prev => {
      const current = prev[divCode] || 1.0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...prev, [divCode]: next };
    });
  };
  const resetDivisionAdjustment = (divCode) => {
    setDivisionAdjustments(prev => {
      const next = { ...prev };
      delete next[divCode];
      return next;
    });
  };

  // Toggle all subdivisions
  const toggleAllSubdivisions = () => {
    if (expandedDivs.size > 0) {
      setExpandedDivs(new Set());
    } else {
      setExpandedDivs(new Set(divEntries.map(([code]) => code)));
    }
  };

  // Generate project narrative
  const generateNarrative = () => {
    const typeLabel = BUILDING_TYPE_LABELS[jobType] || jobType || "commercial";
    const sf = fmtNum(projectSF);
    const grandLow = fmt(grandTotals.low);
    const grandMid = fmt(grandTotals.mid);
    const grandHigh = fmt(grandTotals.high);
    const perSFMid = projectSF > 0 ? fmtSF(grandTotals.mid / projectSF) : "$0.00";

    // Top 5 divisions by mid cost (using total.mid, not perSF)
    const sortedDivs = divEntries
      .filter(([, d]) => (d.total?.mid || 0) > 0 && !d.excluded)
      .sort((a, b) => (b[1].total?.mid || 0) * getDivisionMultiplier(b[0]) - (a[1].total?.mid || 0) * getDivisionMultiplier(a[0]));

    const topDivisions = sortedDivs
      .slice(0, 5)
      .map(([code, d]) => `${d.label} (${fmt((d.total?.mid || 0) * getDivisionMultiplier(code))})`);

    const topFiveTotal = sortedDivs.slice(0, 5).reduce((s, [code, d]) => s + (d.total?.mid || 0) * getDivisionMultiplier(code), 0);
    const topFivePct = totals.mid > 0 ? Math.round((topFiveTotal / totals.mid) * 100) : 0;

    // Location + labor adjustments
    const adjNotes = [];
    if (rom.laborMultiplier && rom.laborMultiplier !== 1.0) adjNotes.push(`${rom.laborType === "prevailing" ? "Prevailing wage" : "Union"} labor (+${Math.round((rom.laborMultiplier - 1) * 100)}%)`);
    if (rom.marketMultiplier && rom.marketMultiplier !== 1.0) adjNotes.push(`${rom.marketRegion?.label || "Market"} location adjustment (${rom.marketMultiplier > 1 ? "+" : ""}${Math.round((rom.marketMultiplier - 1) * 100)}%)`);
    if (rom.workMultiplier && rom.workMultiplier !== 1.0) adjNotes.push(`${rom.workType || "Work type"} scope adjustment (${rom.workMultiplier > 1 ? "+" : ""}${Math.round((rom.workMultiplier - 1) * 100)}%)`);

    const adjustedDivs = Object.entries(divisionAdjustments).filter(([, m]) => m !== 1.0);
    const divAdjNote = adjustedDivs.length > 0
      ? `User adjustments have been applied to ${adjustedDivs.length} division(s).`
      : "";

    // Excluded scopes
    const excludedDivs = divEntries.filter(([, d]) => d.excluded);
    const excludeNote = excludedDivs.length > 0
      ? `${excludedDivs.map(([, d]) => d.label).join(", ")} ${excludedDivs.length === 1 ? "has" : "have"} been excluded as not required or owner-supplied.`
      : "";

    const lines = [
      `This conceptual budget estimate is for a ${sf} SF ${typeLabel.toLowerCase()} project. The estimated construction cost ranges from ${grandLow} to ${grandHigh}, with a midpoint estimate of ${grandMid} (${perSFMid}/SF).`,
      "",
      topDivisions.length > 0 ? `The largest cost drivers are ${topDivisions.join(", ")}. These ${topDivisions.length} divisions represent approximately ${topFivePct}% of the direct construction cost.` : "",
      "",
      markups.filter(m => m.enabled).length > 0 ? `Markups include ${markups.filter(m => m.enabled).map(m => `${m.label} (${m.pct}%)`).join(", ")}, totaling ${totalMarkupPct.toFixed(1)}% above direct costs.` : "",
      "",
      adjNotes.length > 0 ? `Market adjustments: ${adjNotes.join("; ")}.` : "",
      "",
      hasSoftCosts ? `Soft costs of ${totalSoftCostPct.toFixed(1)}% (${fmt(softCostTotals.mid)}) are included for ${softCosts.filter(sc => sc.enabled).map(sc => sc.label.toLowerCase()).join(", ")}.` : "",
      "",
      excludeNote,
      divAdjNote,
      "",
      "This estimate is based on historical project data and industry benchmarks calibrated from real construction proposals. All figures should be verified against project-specific conditions, local market rates, and current material pricing. This ROM is intended for conceptual budgeting purposes only and does not constitute a formal bid or guarantee of final construction cost.",
    ];

    return lines.filter(l => l !== "").join("\n\n");
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
                        ? C.gradient
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

      {/* ── Project Narrative ── */}
      {showNarrative && (
        <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ ...sectionLabel(C) }}>PROJECT NARRATIVE</div>
            <button onClick={() => setShowNarrative(false)} style={{
              background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11,
              fontFamily: T.font.sans,
            }}>Hide</button>
          </div>
          <div style={{
            fontSize: T.fontSize.sm, color: C.textMuted, lineHeight: 1.7,
            fontFamily: T.font.sans, whiteSpace: "pre-line",
          }}>
            {generateNarrative()}
          </div>
        </div>
      )}

      {/* ── Scope Detail Items (from template engine) ── */}
      {showScopeItems && (() => {
        let scopeResult;
        try {
          scopeResult = generateScopeTemplate(jobType, projectSF, {
            floors: rom.floors || 1,
            workType: rom.workType || "",
          });
        } catch (e) {
          console.error("[RomResult] Scope template generation failed:", e);
          return null;
        }
        if (!scopeResult || !scopeResult.items.length) return null;

        // Group items by division
        const byDiv = {};
        scopeResult.items.forEach(item => {
          if (!byDiv[item.division]) byDiv[item.division] = [];
          byDiv[item.division].push(item);
        });

        return (
          <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ ...sectionLabel(C) }}>DETAILED SCOPE ITEMS ({scopeResult.itemCount})</div>
              <button onClick={() => setShowScopeItems(false)} style={{
                background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11,
                fontFamily: T.font.sans,
              }}>Hide</button>
            </div>

            {Object.entries(byDiv).sort(([a], [b]) => a.localeCompare(b)).map(([divCode, items]) => {
              const divName = divisions?.[divCode]?.name || `Division ${divCode}`;
              const activeItems = items.filter(i => !excludedItems.has(i.code));
              const divTotal = activeItems.reduce((sum, i) => sum + (i.midCost || 0), 0);

              return (
                <div key={divCode} style={{ marginBottom: 16 }}>
                  {/* Division header */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "6px 0", borderBottom: `1px solid ${C.border}`,
                    marginBottom: 6,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: C.text,
                      fontFamily: T.font.sans, textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>{divCode} — {divName}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, fontFamily: T.font.sans }}>
                      {fmt(divTotal)}
                    </span>
                  </div>

                  {/* Line items with toggle */}
                  {items.map((item, idx) => {
                    const isExcluded = excludedItems.has(item.code);
                    return (
                    <div key={idx} style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr 70px 40px 80px 80px 80px",
                      gap: 8,
                      padding: "4px 0",
                      fontSize: 11,
                      fontFamily: T.font.sans,
                      color: C.textMuted,
                      borderBottom: idx < items.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      alignItems: "center",
                      opacity: isExcluded ? 0.35 : 1,
                      textDecoration: isExcluded ? "line-through" : "none",
                    }}>
                      <input type="checkbox" checked={!isExcluded} onChange={() => toggleItem(item.code)}
                        style={{ accentColor: C.accent, cursor: "pointer", width: 13, height: 13 }} />
                      <span style={{ color: C.text, fontSize: 11.5 }}>
                        <span style={{ color: C.textDim, marginRight: 6 }}>{item.code}</span>
                        {item.description}
                        {item.note && <span style={{ color: C.textDim, fontSize: 10, marginLeft: 6 }}>({item.note})</span>}
                      </span>
                      <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>
                        {item.qty?.toLocaleString()}
                      </span>
                      <span style={{ textAlign: "center", color: C.textDim }}>{item.unit}</span>
                      <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textDim }}>
                        {item.lowCost ? fmt(item.lowCost) : "—"}
                      </span>
                      <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, fontWeight: 500, color: C.text }}>
                        {item.midCost ? fmt(item.midCost) : "—"}
                      </span>
                      <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textDim }}>
                        {item.highCost ? fmt(item.highCost) : "—"}
                      </span>
                    </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Scope totals — recalculated excluding toggled items */}
            {(() => {
              const active = scopeResult.items.filter(i => !excludedItems.has(i.code));
              const adjTotal = {
                low: active.reduce((s, i) => s + (i.lowCost || 0), 0),
                mid: active.reduce((s, i) => s + (i.midCost || 0), 0),
                high: active.reduce((s, i) => s + (i.highCost || 0), 0),
              };
              const excluded = scopeResult.itemCount - active.length;
              return (
              <div style={{
                display: "grid", gridTemplateColumns: "20px 1fr 70px 40px 80px 80px 80px",
                gap: 8, padding: "8px 0", borderTop: `2px solid ${C.border}`, marginTop: 8,
                fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, color: C.text,
              }}>
                <span />
                <span>TOTAL ({active.length} items{excluded > 0 ? `, ${excluded} excluded` : ""})</span>
                <span />
                <span />
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>{fmt(adjTotal.low)}</span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.accent }}>{fmt(adjTotal.mid)}</span>
                <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>{fmt(adjTotal.high)}</span>
              </div>
              );
            })()}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 70px 40px 80px 80px 80px",
              gap: 8, padding: "4px 0", fontSize: 11, fontFamily: T.font.sans, color: C.textMuted,
            }}>
              <span>Per SF</span>
              <span />
              <span />
              <span style={{ textAlign: "right" }}>{fmt(scopeResult.perSF.low)}/SF</span>
              <span style={{ textAlign: "right", color: C.accent }}>{fmt(scopeResult.perSF.mid)}/SF</span>
              <span style={{ textAlign: "right" }}>{fmt(scopeResult.perSF.high)}/SF</span>
            </div>

            {/* Source attribution */}
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 6,
              background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
              fontSize: 10, color: C.textDim, lineHeight: 1.5, fontFamily: T.font.sans,
            }}>
              Source: NOVATerra scope template for {scopeResult.label}. Quantities are estimates based on project SF
              and building type. Actual quantities will vary based on design documents.
              {rom.calibrationNote && <span> {rom.calibrationNote}</span>}
            </div>
          </div>
        );
      })()}

      {/* ── Trade-Separated Scopes of Work ── */}
      {showTradeScopes && (() => {
        let tradeResult;
        try {
          tradeResult = generateTradeScopes(jobType, projectSF, {
            floors: rom.floors || 1,
            workType: rom.workType || "",
            romDivisions: divisions,
            scanLineItems: rom.scheduleLineItems || [],
          });
        } catch (e) {
          console.error("[RomResult] Trade scope generation failed:", e);
          return null;
        }
        if (!tradeResult?.trades?.length) return null;

        return (
          <div style={card(C, { padding: `${T.space[5]}px`, marginBottom: T.space[4] })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ ...sectionLabel(C) }}>SCOPE OF WORK BY TRADE ({tradeResult.trades.length} trades)</div>
              <button onClick={() => setShowTradeScopes(false)} style={{
                background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: T.font.sans,
              }}>Hide</button>
            </div>

            {/* Trade cards */}
            {tradeResult.trades.map(trade => {
              const isExpanded = expandedTrade === trade.key;
              const tradeColor = TRADE_COLORS?.[trade.key] || C.accent;

              return (
                <div key={trade.key} style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${tradeColor}15`, overflow: "hidden" }}>
                  {/* Trade header */}
                  <div
                    onClick={() => setExpandedTrade(isExpanded ? null : trade.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", cursor: "pointer",
                      background: isExpanded ? `${tradeColor}08` : "transparent",
                    }}
                  >
                    {/* Trade color dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: tradeColor, flexShrink: 0 }} />
                    {/* Trade name + item count */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
                        {trade.label}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                        {trade.itemCount} item{trade.itemCount !== 1 ? "s" : ""} · {trade.pctOfTotal}% of total
                      </div>
                    </div>
                    {/* Cost range */}
                    <div style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(trade.costMid)}</div>
                      <div style={{ fontSize: 9, color: C.textDim }}>{fmt(trade.costLow)} – {fmt(trade.costHigh)}</div>
                    </div>
                    {/* Expand chevron */}
                    <svg viewBox="0 0 10 6" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round"
                      style={{ width: 10, height: 6, transition: "transform 150ms", transform: isExpanded ? "rotate(180deg)" : "none" }}>
                      <path d="M1 1l4 4 4-4" />
                    </svg>
                  </div>

                  {/* Expanded: narrative + line items */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${tradeColor}10` }}>
                      {/* Narrative */}
                      {trade.narrative && (
                        <div style={{
                          padding: "10px 0 8px", fontSize: 11, color: C.textMuted,
                          lineHeight: 1.6, fontFamily: T.font.sans,
                          borderBottom: `1px solid ${C.border}08`, marginBottom: 8,
                        }}>
                          {trade.narrative}
                        </div>
                      )}

                      {/* Line items with toggle */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                        gap: 4, fontSize: 10, fontFamily: T.font.sans, color: C.textDim,
                        padding: "4px 0", borderBottom: `1px solid ${C.border}06`, fontWeight: 600,
                      }}>
                        <span />
                        <span>Description</span>
                        <span style={{ textAlign: "right" }}>Qty</span>
                        <span style={{ textAlign: "center" }}>Unit</span>
                        <span style={{ textAlign: "right" }}>Est. Cost</span>
                      </div>
                      {trade.items.map((item, idx) => {
                        const isExcluded = excludedItems.has(item.code);
                        return (
                        <div key={idx} style={{
                          display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                          gap: 4, padding: "3px 0", fontSize: 10.5, fontFamily: T.font.sans,
                          borderBottom: idx < trade.items.length - 1 ? `1px solid ${C.borderLight || C.border}06` : "none",
                          alignItems: "center",
                          opacity: isExcluded ? 0.35 : 1,
                        }}>
                          <input type="checkbox" checked={!isExcluded} onChange={() => toggleItem(item.code)}
                            style={{ accentColor: tradeColor, cursor: "pointer", width: 12, height: 12 }} />
                          <span style={{ color: C.text, textDecoration: isExcluded ? "line-through" : "none" }}>
                            <span style={{ color: C.textDim, marginRight: 4, fontSize: 9 }}>{item.code}</span>
                            {item.description}
                            {item._fromDrawings && (
                              <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, marginLeft: 4, background: `${C.green}18`, color: C.green }}>
                                FROM DRAWINGS
                              </span>
                            )}
                          </span>
                          <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.textMuted }}>
                            {item.qty?.toLocaleString()}
                          </span>
                          <span style={{ textAlign: "center", color: C.textDim }}>{item.unit}</span>
                          <span style={{ textAlign: "right", fontFamily: T.font.mono || T.font.sans, color: C.text, fontWeight: 500 }}>
                            {item.midCost ? fmt(item.midCost) : "—"}
                          </span>
                        </div>
                        );
                      })}

                      {/* Trade subtotal — recalculated excluding toggled items */}
                      {(() => {
                        const activeItems = trade.items.filter(i => !excludedItems.has(i.code));
                        const adjMid = activeItems.reduce((s, i) => s + (i.midCost || 0), 0);
                        return (
                      <div style={{
                        display: "grid", gridTemplateColumns: "18px 1fr 60px 35px 70px",
                        gap: 4, padding: "6px 0 0", borderTop: `1px solid ${tradeColor}20`, marginTop: 4,
                        fontSize: 11, fontWeight: 700, fontFamily: T.font.sans, color: tradeColor,
                      }}>
                        <span />
                        <span>Subtotal{activeItems.length < trade.items.length ? ` (${activeItems.length}/${trade.items.length})` : ""}</span>
                        <span />
                        <span />
                        <span style={{ textAlign: "right" }}>{fmt(adjMid)}</span>
                      </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Source */}
            <div style={{
              marginTop: 8, padding: "8px 12px", borderRadius: 6,
              background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
              fontSize: 10, color: C.textDim, lineHeight: 1.5, fontFamily: T.font.sans,
            }}>
              Trade scopes generated by NOVATerra from {tradeResult.buildingType} template.
              Scope narratives describe typical work for this building type. Upload drawings for project-specific scopes.
            </div>
          </div>
        );
      })()}

      {/* ── Controls Bar ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 0 12px", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Subdivisions toggle */}
          <button
            onClick={() => setShowSubdivisions(!showSubdivisions)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 6,
              background: showSubdivisions ? C.accentBg : "transparent",
              border: `1px solid ${showSubdivisions ? C.accent + "40" : C.border}`,
              cursor: "pointer", color: showSubdivisions ? C.accent : C.textMuted,
              fontSize: 11, fontWeight: 500, fontFamily: T.font.sans,
            }}
          >
            {showSubdivisions ? "☑" : "☐"} Subdivisions
          </button>

          {/* Expand/Collapse all */}
          {showSubdivisions && Object.keys(subdivisionData || {}).length > 0 && (
            <button
              onClick={toggleAllSubdivisions}
              style={{
                padding: "6px 12px", borderRadius: 6,
                background: "transparent", border: `1px solid ${C.border}`,
                cursor: "pointer", color: C.textMuted,
                fontSize: 11, fontWeight: 500, fontFamily: T.font.sans,
              }}
            >
              {expandedDivs.size > 0 ? "Collapse All" : "Expand All"}
            </button>
          )}

          {/* Narrative toggle */}
          {!showNarrative && (
            <button
              onClick={() => setShowNarrative(true)}
              style={{
                padding: "6px 12px", borderRadius: 6,
                background: "transparent", border: `1px solid ${C.border}`,
                cursor: "pointer", color: C.textMuted,
                fontSize: 11, fontWeight: 500, fontFamily: T.font.sans,
              }}
            >
              Show Narrative
            </button>
          )}
        </div>

        {/* Generate Subdivisions button */}
        <button
          onClick={handleGenerateSubdivisions}
          disabled={generatingSubdivisions}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            background: generatingSubdivisions ? C.bg2 : C.gradient,
            border: generatingSubdivisions ? `1px solid ${C.border}` : "none",
            cursor: generatingSubdivisions ? "default" : "pointer",
            color: generatingSubdivisions ? C.textMuted : "#fff",
            fontSize: 12,
            fontWeight: 600,
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
                <th style={{ ...headerCell, textAlign: "center", fontSize: 9, width: 80 }}>Adjust</th>
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
                    <td style={{ ...cellBase, color: C.text, fontWeight: T.fontWeight.medium }}>
                      {div.label}
                      {div.sampleCount > 0 && (
                        <span style={{
                          fontSize: 7, fontWeight: 600, padding: "1px 4px", borderRadius: 3, marginLeft: 6,
                          background: div.confidence === "strong" ? `${C.green}15` : div.confidence === "moderate" ? `${C.accent}12` : `${C.textDim}10`,
                          color: div.confidence === "strong" ? C.green : div.confidence === "moderate" ? C.accent : C.textDim,
                        }}>
                          {div.sampleCount} proposal{div.sampleCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("low"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.low * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("mid"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.mid * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, ...rightAlign, ...colHighlight("high"), fontFeatureSettings: "'tnum'" }}>
                      {fmtSF(div.perSF.high * getDivisionMultiplier(divNum))}
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
                      {fmt(div.total[selectedRange] * getDivisionMultiplier(divNum))}
                    </td>
                    <td style={{ ...cellBase, textAlign: "center", padding: "6px 8px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => adjustDivision(divNum, -0.05)} style={{
                          width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.textMuted, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                          lineHeight: 1, fontFamily: T.font.sans,
                        }}>−</button>
                        <span style={{
                          fontSize: 10, color: getDivisionMultiplier(divNum) !== 1.0 ? C.accent : C.textDim,
                          fontWeight: getDivisionMultiplier(divNum) !== 1.0 ? 600 : 400,
                          minWidth: 32, textAlign: "center", fontFamily: T.font.sans,
                          cursor: getDivisionMultiplier(divNum) !== 1.0 ? "pointer" : "default",
                        }} onClick={() => getDivisionMultiplier(divNum) !== 1.0 && resetDivisionAdjustment(divNum)}
                          title={getDivisionMultiplier(divNum) !== 1.0 ? "Click to reset" : ""}>
                          {Math.round(getDivisionMultiplier(divNum) * 100)}%
                        </span>
                        <button onClick={() => adjustDivision(divNum, 0.05)} style={{
                          width: 22, height: 22, borderRadius: 4, border: `1px solid ${C.border}`,
                          background: "transparent", color: C.textMuted, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                          lineHeight: 1, fontFamily: T.font.sans,
                        }}>+</button>
                      </div>
                    </td>
                  </tr>
                  {expandedDivs.has(divNum) &&
                    subdivisionData[divNum] &&
                    subdivisionData[divNum].map((sub, _si) => {
                      const isLlm = sub.source === "llm";
                      const isUser = sub.confidence === "user" || !!userOverrides[sub.code];
                      const llmData = llmRefinements[sub.code];
                      const isValidated = llmData?.validated;
                      const subSource = isUser ? "User" : isLlm ? (isValidated ? "LLM \u2713" : "LLM") : "Baseline";
                      const sourceColor = isUser ? C.green : isLlm ? C.accent : C.textDim;
                      const sourceBg = isUser
                        ? "rgba(34,197,94,0.12)"
                        : isLlm
                          ? C.accentBg
                          : "rgba(107,114,128,0.12)";
                      const isEditingThis = editingSub === `${divNum}-${sub.code}`;
                      const divMidPerSF = div.perSF?.mid || 0;

                      return (
                        <tr
                          key={`${divNum}-${sub.code}`}
                          style={{
                            background: isEditingThis ? C.accentBg : C.accentBg,
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
                  background: C.accentBg,
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.font.sans, minWidth: 500 }}>
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
                      background: C.accentBg,
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
