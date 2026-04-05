// RomResult — Full ROM result display with division breakdown table
// Orchestrator: delegates rendering to focused sub-components
import React, { useState, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { generateSubdivisionROM } from "@/utils/romEngine";
import { useCorrectionStore } from "@/nova/learning/correctionStore";

import { BUILDING_TYPE_LABELS, DEFAULT_MARKUPS, DEFAULT_SOFT_COSTS, fmt, fmtSF, fmtNum } from "./romFormatters";
import RomProjectSummary from "./RomProjectSummary";
import RomNarrative from "./RomNarrative";
import RomScopeDetail from "./RomScopeDetail";
import RomTradeScopes from "./RomTradeScopes";
import RomDivisionTable from "./RomDivisionTable";
import RomSoftCosts from "./RomSoftCosts";
import RomAssumptions from "./RomAssumptions";

export default function RomResult({ rom, email }) {
  const C = useTheme();
  const T = C.T;

  // ── State ──
  const [selectedRange, setSelectedRange] = useState("mid");
  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [generatingSubdivisions, setGeneratingSubdivisions] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0, divCode: "" });
  const [showSubdivisions, setShowSubdivisions] = useState(true);
  const [showNarrative, setShowNarrative] = useState(true);
  const [showScopeItems, setShowScopeItems] = useState(true);
  const [showTradeScopes, setShowTradeScopes] = useState(true);
  const [expandedTrade, setExpandedTrade] = useState(null);
  const [excludedItems, setExcludedItems] = useState(new Set());
  const toggleItem = (code) => setExcludedItems(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const [divisionAdjustments, setDivisionAdjustments] = useState({});
  const [editingSub, setEditingSub] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Markups
  const [markups, setMarkups] = useState(DEFAULT_MARKUPS);
  const [editingMarkup, setEditingMarkup] = useState(null);
  const [editingMarkupValue, setEditingMarkupValue] = useState("");

  // Soft costs
  const [softCosts, setSoftCosts] = useState(DEFAULT_SOFT_COSTS);
  const [softCostsExpanded, setSoftCostsExpanded] = useState(false);
  const [editingSoftCost, setEditingSoftCost] = useState(null);
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

  // ── Callbacks ──
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
  }, [rom, generatingSubdivisions, userOverrides, llmRefinements, calibrationFactors, engineConfig, setLlmRefinements, setSubdivisionData]);

  if (!rom) return null;

  // ── Derived data ──
  const { divisions, totals: rawTotals, projectSF, jobType } = rom;
  const divEntries = Object.entries(divisions).sort(([a], [b]) => a.localeCompare(b));

  const getDivisionMultiplier = (divCode) => divisionAdjustments[divCode] || 1.0;

  const hasAdjustments = Object.keys(divisionAdjustments).length > 0;
  const totals = hasAdjustments ? {
    low: divEntries.reduce((sum, [code, d]) => sum + (d.total?.low || d.low || 0) * getDivisionMultiplier(code), 0),
    mid: divEntries.reduce((sum, [code, d]) => sum + (d.total?.mid || d.mid || 0) * getDivisionMultiplier(code), 0),
    high: divEntries.reduce((sum, [code, d]) => sum + (d.total?.high || d.high || 0) * getDivisionMultiplier(code), 0),
  } : { low: rawTotals.low, mid: rawTotals.mid, high: rawTotals.high };

  const totalPerSF = projectSF > 0
    ? { low: totals.low / projectSF, mid: totals.mid / projectSF, high: totals.high / projectSF }
    : { low: 0, mid: 0, high: 0 };

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

  // ── Markup handlers ──
  const updateMarkup = (id, field, value) => {
    setMarkups(prev => prev.map(m => (m.id === id ? { ...m, [field]: value } : m)));
  };
  const addMarkup = () => {
    const nextId = Math.max(0, ...markups.map(m => m.id)) + 1;
    setMarkups(prev => [...prev, { id: nextId, label: "New Markup", pct: 0, enabled: true }]);
    setEditingMarkup({ id: nextId, field: "label" });
    setEditingMarkupValue("New Markup");
  };
  const removeMarkup = id => setMarkups(prev => prev.filter(m => m.id !== id));
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

  // ── Soft cost handlers ──
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
  const removeSoftCost = id => setSoftCosts(prev => prev.filter(sc => sc.id !== id));
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
  const toggleAllSoftCosts = enabled => setSoftCosts(prev => prev.map(sc => ({ ...sc, enabled })));

  // ── Division adjustment handlers ──
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
    setDivisionAdjustments(prev => { const next = { ...prev }; delete next[divCode]; return next; });
  };

  const toggleAllSubdivisions = () => {
    if (expandedDivs.size > 0) setExpandedDivs(new Set());
    else setExpandedDivs(new Set(divEntries.map(([code]) => code)));
  };

  // ── Narrative generator ──
  const generateNarrative = () => {
    const typeLabel = BUILDING_TYPE_LABELS[jobType] || jobType || "commercial";
    const sf = fmtNum(projectSF);
    const grandLow = fmt(grandTotals.low);
    const grandMid = fmt(grandTotals.mid);
    const grandHigh = fmt(grandTotals.high);
    const perSFMid = projectSF > 0 ? fmtSF(grandTotals.mid / projectSF) : "$0.00";

    const sortedDivs = divEntries
      .filter(([, d]) => (d.total?.mid || 0) > 0 && !d.excluded)
      .sort((a, b) => (b[1].total?.mid || 0) * getDivisionMultiplier(b[0]) - (a[1].total?.mid || 0) * getDivisionMultiplier(a[0]));

    const topDivisions = sortedDivs
      .slice(0, 5)
      .map(([code, d]) => `${d.label} (${fmt((d.total?.mid || 0) * getDivisionMultiplier(code))})`);

    const topFiveTotal = sortedDivs.slice(0, 5).reduce((s, [code, d]) => s + (d.total?.mid || 0) * getDivisionMultiplier(code), 0);
    const topFivePct = totals.mid > 0 ? Math.round((topFiveTotal / totals.mid) * 100) : 0;

    const adjNotes = [];
    if (rom.laborMultiplier && rom.laborMultiplier !== 1.0) adjNotes.push(`${rom.laborType === "prevailing" ? "Prevailing wage" : "Union"} labor (+${Math.round((rom.laborMultiplier - 1) * 100)}%)`);
    if (rom.marketMultiplier && rom.marketMultiplier !== 1.0) adjNotes.push(`${rom.marketRegion?.label || "Market"} location adjustment (${rom.marketMultiplier > 1 ? "+" : ""}${Math.round((rom.marketMultiplier - 1) * 100)}%)`);
    if (rom.workMultiplier && rom.workMultiplier !== 1.0) adjNotes.push(`${rom.workType || "Work type"} scope adjustment (${rom.workMultiplier > 1 ? "+" : ""}${Math.round((rom.workMultiplier - 1) * 100)}%)`);

    const adjustedDivs = Object.entries(divisionAdjustments).filter(([, m]) => m !== 1.0);
    const divAdjNote = adjustedDivs.length > 0 ? `User adjustments have been applied to ${adjustedDivs.length} division(s).` : "";

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

  // ── Render ──
  return (
    <div style={{ width: "100%", maxWidth: 800 }}>
      <RomProjectSummary
        C={C} T={T} email={email} jobType={jobType} projectSF={projectSF}
        selectedRange={selectedRange} setSelectedRange={setSelectedRange}
        totals={totals} totalPerSF={totalPerSF} grandTotals={grandTotals} grandPerSF={grandPerSF}
        totalProjectCost={totalProjectCost} totalProjectPerSF={totalProjectPerSF}
        totalMarkupPct={totalMarkupPct} totalSoftCostPct={totalSoftCostPct}
        hasSoftCosts={hasSoftCosts}
      />

      <RomNarrative
        C={C} T={T} showNarrative={showNarrative} setShowNarrative={setShowNarrative}
        narrative={generateNarrative()}
      />

      <RomScopeDetail
        C={C} T={T} showScopeItems={showScopeItems} setShowScopeItems={setShowScopeItems}
        jobType={jobType} projectSF={projectSF} rom={rom} divisions={divisions}
        excludedItems={excludedItems} toggleItem={toggleItem}
      />

      <RomTradeScopes
        C={C} T={T} showTradeScopes={showTradeScopes} setShowTradeScopes={setShowTradeScopes}
        expandedTrade={expandedTrade} setExpandedTrade={setExpandedTrade}
        jobType={jobType} projectSF={projectSF} rom={rom} divisions={divisions}
        excludedItems={excludedItems} toggleItem={toggleItem}
      />

      {/* Controls Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 0 12px", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
            {showSubdivisions ? "\u2611" : "\u2610"} Subdivisions
          </button>
          {showSubdivisions && Object.keys(subdivisionData || {}).length > 0 && (
            <button onClick={toggleAllSubdivisions} style={{
              padding: "6px 12px", borderRadius: 6, background: "transparent",
              border: `1px solid ${C.border}`, cursor: "pointer", color: C.textMuted,
              fontSize: 11, fontWeight: 500, fontFamily: T.font.sans,
            }}>
              {expandedDivs.size > 0 ? "Collapse All" : "Expand All"}
            </button>
          )}
          {!showNarrative && (
            <button onClick={() => setShowNarrative(true)} style={{
              padding: "6px 12px", borderRadius: 6, background: "transparent",
              border: `1px solid ${C.border}`, cursor: "pointer", color: C.textMuted,
              fontSize: 11, fontWeight: 500, fontFamily: T.font.sans,
            }}>Show Narrative</button>
          )}
        </div>
        <button
          onClick={handleGenerateSubdivisions}
          disabled={generatingSubdivisions}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 8,
            background: generatingSubdivisions ? C.bg2 : C.gradient,
            border: generatingSubdivisions ? `1px solid ${C.border}` : "none",
            cursor: generatingSubdivisions ? "default" : "pointer",
            color: generatingSubdivisions ? C.textMuted : "#fff",
            fontSize: 12, fontWeight: 600, transition: "all 0.15s",
          }}
        >
          {generatingSubdivisions ? (
            <>Generating... ({genProgress.current}/{genProgress.total})</>
          ) : (
            <>Generate Subdivisions</>
          )}
        </button>
      </div>

      <RomDivisionTable
        C={C} T={T}
        divEntries={divEntries} selectedRange={selectedRange}
        expandedDivs={expandedDivs} toggleDiv={toggleDiv}
        subdivisionData={subdivisionData || {}} showSubdivisions={showSubdivisions}
        userOverrides={userOverrides} llmRefinements={llmRefinements}
        validateLlmRefinement={validateLlmRefinement}
        editingSub={editingSub} setEditingSub={setEditingSub}
        editingValue={editingValue} setEditingValue={setEditingValue}
        setUserOverride={setUserOverride}
        getDivisionMultiplier={getDivisionMultiplier}
        adjustDivision={adjustDivision} resetDivisionAdjustment={resetDivisionAdjustment}
        totals={totals} totalPerSF={totalPerSF}
        grandTotals={grandTotals} grandPerSF={grandPerSF}
        markups={markups}
        editingMarkup={editingMarkup} setEditingMarkup={setEditingMarkup}
        editingMarkupValue={editingMarkupValue} setEditingMarkupValue={setEditingMarkupValue}
        updateMarkup={updateMarkup} addMarkup={addMarkup} removeMarkup={removeMarkup}
        commitMarkupEdit={commitMarkupEdit}
        totalMarkupPct={totalMarkupPct}
      />

      <RomSoftCosts
        C={C} T={T} selectedRange={selectedRange}
        softCosts={softCosts} softCostsExpanded={softCostsExpanded} setSoftCostsExpanded={setSoftCostsExpanded}
        editingSoftCost={editingSoftCost} setEditingSoftCost={setEditingSoftCost}
        editingSoftCostValue={editingSoftCostValue} setEditingSoftCostValue={setEditingSoftCostValue}
        updateSoftCost={updateSoftCost} addSoftCost={addSoftCost}
        removeSoftCost={removeSoftCost} commitSoftCostEdit={commitSoftCostEdit}
        toggleAllSoftCosts={toggleAllSoftCosts}
        totalSoftCostPct={totalSoftCostPct} hasSoftCosts={hasSoftCosts}
        softCostTotals={softCostTotals}
        grandTotals={grandTotals} projectSF={projectSF}
        totalProjectCost={totalProjectCost} totalProjectPerSF={totalProjectPerSF}
      />

      <RomAssumptions C={C} T={T} jobType={jobType} hasSoftCosts={hasSoftCosts} />
    </div>
  );
}
