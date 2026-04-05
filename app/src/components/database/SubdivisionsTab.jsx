import { useState } from "react";
import { useSubdivisionStore } from "@/stores/subdivisionStore";
import { SUBDIVISION_BENCHMARKS } from "@/constants/subdivisionBenchmarks";
import { getConfidenceTier } from "@/utils/confidenceEngine";
import { generateSubdivisionBreakdown } from "@/utils/subdivisionAI";
import { CSI } from "@/constants/csi";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const BUILDING_TYPE_OPTIONS = [
  { key: "commercial-office", label: "Commercial Office" },
  { key: "retail", label: "Retail" },
  { key: "healthcare", label: "Healthcare" },
  { key: "education", label: "Education" },
  { key: "industrial", label: "Industrial" },
  { key: "residential-multi", label: "Residential - Multi-Family" },
  { key: "hospitality", label: "Hospitality" },
  { key: "residential-single", label: "Residential - Single Family" },
  { key: "mixed-use", label: "Mixed-Use" },
  { key: "government", label: "Government" },
  { key: "religious", label: "Religious" },
  { key: "restaurant", label: "Restaurant" },
  { key: "parking", label: "Parking" },
];

export default function SubdivisionsTab({ C, T }) {
  const [selectedBuildingType, setSelectedBuildingType] = useState("commercial-office");
  const [expandedDivs, setExpandedDivs] = useState(new Set());
  const [editingSub, setEditingSub] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [generatingDiv, setGeneratingDiv] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });

  const userOverrides = useSubdivisionStore(s => s.userOverrides);
  const setUserOverride = useSubdivisionStore(s => s.setUserOverride);
  const removeUserOverride = useSubdivisionStore(s => s.removeUserOverride);
  const llmRefinements = useSubdivisionStore(s => s.llmRefinements);
  const setLlmRefinement = useSubdivisionStore(s => s.setLlmRefinement);

  const benchmarkSubs = SUBDIVISION_BENCHMARKS[selectedBuildingType] || {};
  const divCodes = Object.keys(benchmarkSubs).sort();

  const toggleDiv = dc => {
    setExpandedDivs(prev => {
      const next = new Set(prev);
      if (next.has(dc)) next.delete(dc);
      else next.add(dc);
      return next;
    });
  };

  const commitEdit = subCode => {
    const val = parseFloat(editingValue);
    if (!isNaN(val) && val > 0 && val <= 100) {
      setUserOverride(subCode, { pctOfDiv: val / 100 });
    }
    setEditingSub(null);
    setEditingValue("");
  };

  const handleGenerateDiv = async dc => {
    if (generatingDiv || generatingAll) return;
    setGeneratingDiv(dc);
    try {
      const divLabel = CSI[dc]?.name || `Division ${dc}`;
      const result = await generateSubdivisionBreakdown({
        buildingType: selectedBuildingType.replace(/-/g, " "),
        divisionCode: dc,
        divisionLabel: divLabel,
        divisionPerSF: 10,
        projectSF: 10000,
        existingSeedItems: [],
      });
      if (result) {
        result.forEach(sub => {
          setLlmRefinement(sub.code, { ...sub, validated: false });
        });
      }
    } catch (err) {
      console.error("[SubdivisionsTab] Generate failed:", err);
    } finally {
      setGeneratingDiv(null);
    }
  };

  const handleGenerateAll = async () => {
    if (generatingDiv || generatingAll) return;
    setGeneratingAll(true);
    setGenProgress({ current: 0, total: divCodes.length });
    for (let i = 0; i < divCodes.length; i++) {
      const dc = divCodes[i];
      setGenProgress({ current: i + 1, total: divCodes.length });
      setGeneratingDiv(dc);
      try {
        const divLabel = CSI[dc]?.name || `Division ${dc}`;
        const result = await generateSubdivisionBreakdown({
          buildingType: selectedBuildingType.replace(/-/g, " "),
          divisionCode: dc,
          divisionLabel: divLabel,
          divisionPerSF: 10,
          projectSF: 10000,
          existingSeedItems: [],
        });
        if (result) {
          result.forEach(sub => {
            setLlmRefinement(sub.code, { ...sub, validated: false });
          });
        }
      } catch (err) {
        console.error(`[SubdivisionsTab] Generate div ${dc} failed:`, err);
      }
    }
    setGeneratingDiv(null);
    setGeneratingAll(false);
    setGenProgress({ current: 0, total: 0 });
  };

  const getSubSource = sub => {
    const override = userOverrides[sub.code];
    if (override) return { pct: override.pctOfDiv, source: "user", tier: getConfidenceTier("user") };
    const llm = llmRefinements[sub.code];
    if (llm)
      return {
        pct: llm.pctOfDiv,
        source: llm.validated ? "llm-validated" : "llm",
        tier: getConfidenceTier(llm.validated ? "medium" : "low"),
      };
    return { pct: sub.pctOfDiv, source: "baseline", tier: getConfidenceTier("baseline") };
  };

  const sourceBadge = source => {
    const map = {
      user: { bg: "rgba(34,197,94,0.12)", color: "#22C55E", label: "User" },
      llm: { bg: C.accentBg, color: C.accent, label: "LLM" },
      "llm-validated": { bg: C.accentBg, color: C.accent, label: "LLM \u2713" },
      baseline: { bg: "rgba(107,114,128,0.12)", color: "#6B7280", label: "Baseline" },
    };
    const s = map[source] || map.baseline;
    return (
      <span
        style={{ fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: s.bg, color: s.color }}
      >
        {s.label}
      </span>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        background: C.bg1,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: "nowrap" }}>Building Type:</span>
        <select
          value={selectedBuildingType}
          onChange={e => {
            setSelectedBuildingType(e.target.value);
            setExpandedDivs(new Set());
          }}
          style={{
            fontSize: 12,
            padding: "5px 8px",
            background: C.bg2,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {BUILDING_TYPE_OPTIONS.map(bt => (
            <option key={bt.key} value={bt.key}>
              {bt.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleGenerateAll}
          disabled={generatingAll || !!generatingDiv}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 14px",
            borderRadius: 6,
            background: generatingAll ? C.accentBg : C.gradient,
            border: "none",
            cursor: generatingAll ? "default" : "pointer",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            opacity: generatingAll ? 0.7 : 1,
          }}
        >
          <Ic
            d={I.sparkle || "M12 2l1.09 3.26L16 6l-2.91.74L12 10l-1.09-3.26L8 6l2.91-.74L12 2z"}
            size={12}
            color="#fff"
          />
          {generatingAll ? `Generating... (${genProgress.current}/${genProgress.total})` : "Generate All with NOVA"}
        </button>
        <span style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>{divCodes.length} divisions</span>
      </div>

      {/* Division Accordion */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {divCodes.map((dc, idx) => {
          const subs = benchmarkSubs[dc] || [];
          const isExpanded = expandedDivs.has(dc);
          const isDivGenerating = generatingDiv === dc;
          return (
            <div key={dc}>
              {/* Division header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: idx % 2 === 0 ? "transparent" : C.isDark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.01)",
                  borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                }}
              >
                <div
                  onClick={() => toggleDiv(dc)}
                  style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke={isExpanded ? C.accent : C.textDim}
                    strokeWidth="1.5"
                    style={{
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 200ms",
                      flexShrink: 0,
                    }}
                  >
                    <path d="M2 0.5l3.5 3.5L2 7.5" />
                  </svg>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: T.font.sans,
                      color: C.textDim,
                      fontWeight: 600,
                      width: 28,
                    }}
                  >
                    {dc}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>
                    {CSI[dc]?.name || `Division ${dc}`}
                  </span>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleGenerateDiv(dc);
                  }}
                  disabled={!!generatingDiv || generatingAll}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    borderRadius: 5,
                    background: isDivGenerating ? C.accentBg : C.accentBg,
                    border: `1px solid ${C.borderAccent}`,
                    cursor: !!generatingDiv || generatingAll ? "default" : "pointer",
                    color: C.accent,
                    fontSize: 9,
                    fontWeight: 600,
                    opacity: (!!generatingDiv || generatingAll) && !isDivGenerating ? 0.4 : 1,
                    transition: "all 0.15s",
                    flexShrink: 0,
                  }}
                >
                  {isDivGenerating ? (
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        border: `2px solid ${C.borderAccent}`,
                        borderTop: `2px solid ${C.accent}`,
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    <Ic
                      d={I.sparkle || "M12 2l1.09 3.26L16 6l-2.91.74L12 10l-1.09-3.26L8 6l2.91-.74L12 2z"}
                      size={9}
                      color={C.accent}
                    />
                  )}
                  {isDivGenerating ? "Generating..." : "NOVA"}
                </button>
                <span style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>
                  {subs.length} sub{subs.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Subdivision rows */}
              {isExpanded && subs.length > 0 && (
                <div
                  style={{
                    background: C.accentBg,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {/* Sub-header */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 1fr 80px 80px 24px",
                      gap: 4,
                      padding: "4px 14px 4px 44px",
                      fontSize: 8,
                      fontWeight: 600,
                      color: C.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                    }}
                  >
                    <div>Code</div>
                    <div>Subdivision</div>
                    <div style={{ textAlign: "right" }}>% of Div</div>
                    <div style={{ textAlign: "center" }}>Source</div>
                    <div />
                  </div>
                  {subs.map(sub => {
                    const { pct, source, tier } = getSubSource(sub);
                    const isEditing = editingSub === sub.code;
                    const hasOverride = !!userOverrides[sub.code];
                    return (
                      <div
                        key={sub.code}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px 1fr 80px 80px 24px",
                          gap: 4,
                          padding: "6px 14px 6px 44px",
                          fontSize: 11,
                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"}`,
                          alignItems: "center",
                          background: isEditing ? C.accentBg : "transparent",
                        }}
                      >
                        <div style={{ fontFamily: T.font.sans, fontSize: 10, color: C.purple }}>
                          <span
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
                          {sub.code}
                        </div>
                        <div
                          style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {sub.label}
                        </div>
                        {/* % of Div -- click to edit */}
                        <div
                          style={{
                            textAlign: "right",
                            fontFamily: T.font.sans,
                            fontSize: 11,
                            color: C.text,
                            fontWeight: 500,
                            cursor: "pointer",
                            position: "relative",
                          }}
                          onClick={() => {
                            if (!isEditing) {
                              setEditingSub(sub.code);
                              setEditingValue((pct * 100).toFixed(1));
                            }
                          }}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              autoFocus
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => commitEdit(sub.code)}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitEdit(sub.code);
                                if (e.key === "Escape") {
                                  setEditingSub(null);
                                  setEditingValue("");
                                }
                              }}
                              style={{
                                width: 54,
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
                                borderBottom: `1px dashed ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                              }}
                            >
                              {(pct * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: "center" }}>{sourceBadge(source)}</div>
                        {/* Remove override button */}
                        <div style={{ textAlign: "center" }}>
                          {hasOverride && (
                            <button
                              onClick={() => removeUserOverride(sub.code)}
                              title="Remove override"
                              style={{
                                width: 16,
                                height: 16,
                                padding: 0,
                                border: "none",
                                borderRadius: 4,
                                background: "rgba(239,68,68,0.1)",
                                color: "#EF4444",
                                cursor: "pointer",
                                fontSize: 10,
                                lineHeight: "16px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              &times;
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 9,
          color: C.textDim,
          lineHeight: 1.6,
        }}
      >
        Click any <strong>% value</strong> to override. <strong>NOVA</strong> generates AI-refined allocations per
        division. Baseline (60%) + User overrides (30%) + LLM (10%) blended via confidence engine.
      </div>

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
