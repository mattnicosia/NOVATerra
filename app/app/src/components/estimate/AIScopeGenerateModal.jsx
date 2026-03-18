import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";
import { callAnthropic } from "@/utils/ai";
import { autoTradeFromCode } from "@/constants/tradeGroupings";

export default function AIScopeGenerateModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const project = useProjectStore(s => s.project);
  const addElement = useItemsStore(s => s.addElement);
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const divFromCode = useProjectStore(s => s.divFromCode);

  const addAssembly = useDatabaseStore(s => s.addAssembly);
  const addProjectAssembly = useItemsStore(s => s.addProjectAssembly);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [showSaveAssembly, setShowSaveAssembly] = useState(false);
  const [assemblyName, setAssemblyName] = useState("");

  const contextLines = [
    project.name && project.name !== "New Estimate" && `Project: ${project.name}`,
    project.client && `Client: ${project.client}`,
    project.buildingType && `Building Type: ${project.buildingType}`,
    project.workType && `Work Type: ${project.workType}`,
    project.projectSF && `Project SF: ${nn(project.projectSF).toLocaleString()}`,
    project.floorCount && `Floors: ${project.floorCount}`,
    project.jobType && `Job Type: ${project.jobType}`,
    project.address && `Location: ${project.address}`,
    project.zipCode && `Zip: ${project.zipCode}`,
  ].filter(Boolean);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResults([]);
    setSelected(new Set());
    setError(null);

    const system = `You are a construction cost estimator. Generate scope line items for an estimate based on the user's description. For each item, provide a CSI MasterFormat division code, description, unit, quantity, and unit pricing (material, labor, equipment, subcontractor per unit).

Return ONLY a valid JSON array (no markdown fences, no explanation). Each object:
{ "code": "03.30.10", "description": "Cast-in-Place Concrete Foundation", "division": "03 - Concrete", "unit": "CY", "quantity": 1, "material": 150, "labor": 85, "equipment": 25, "subcontractor": 0 }

Rules:
- Use standard CSI 2-digit division codes (e.g. "03" for Concrete, "05" for Metals)
- Include the division name in "division" field as "XX - Name" format
- Be specific in descriptions (not just "Concrete" but "4000 PSI Concrete Foundation Wall")
- Provide realistic quantities based on the scope description and project size
- Base pricing on current US market rates
- Set subcontractor cost for trades typically subcontracted (electrical, plumbing, HVAC, fire protection)
- Generate 5-20 items depending on scope complexity
- Return ONLY the JSON array, nothing else`;

    const userMsg = prompt.trim() + (contextLines.length > 0 ? "\n\nProject context:\n" + contextLines.join("\n") : "");

    try {
      const text = await callAnthropic({
        max_tokens: 4000,
        messages: [{ role: "user", content: userMsg }],
        system,
        temperature: 0.3,
      });
      const clean = text.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setResults(parsed);
        setSelected(new Set(parsed.map((_, i) => i)));
      } else {
        setError("AI returned no items. Try a more specific description.");
      }
    } catch (err) {
      console.error("[AIScopeGenerate] Error:", err);
      setError(err.message || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = idx => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((_, i) => i)));
    }
  };

  const handleAdd = () => {
    let added = 0;
    results.forEach((item, i) => {
      if (!selected.has(i)) return;
      const division = item.division || divFromCode(item.code) || "";
      addElement(
        division,
        {
          code: item.code || "",
          name: item.description || "",
          unit: item.unit || "EA",
          quantity: item.quantity || 1,
          material: item.material || 0,
          labor: item.labor || 0,
          equipment: item.equipment || 0,
          subcontractor: item.subcontractor || 0,
          trade: autoTradeFromCode(item.code) || "",
        },
        activeGroupId,
      );
      added++;
    });
    showToast(`Added ${added} scope item${added !== 1 ? "s" : ""} to estimate`);
    onClose();
  };

  const handleSaveAssembly = destination => {
    const selectedItems = results.filter((_, i) => selected.has(i));
    if (selectedItems.length === 0) return;
    const name = assemblyName.trim() || "AI Generated Assembly";
    const firstCode = selectedItems[0].code || "00.000";
    const divCode = firstCode.substring(0, 5);
    const asm = {
      code: `${divCode}.A00`,
      name,
      description: prompt.trim().substring(0, 120),
      elements: selectedItems.map(item => ({
        code: item.code || "",
        desc: item.description || "",
        unit: item.unit || "EA",
        m: nn(item.material),
        l: nn(item.labor),
        e: nn(item.equipment),
        factor: nn(item.quantity) || 1,
      })),
    };
    if (destination === "database") {
      addAssembly(asm);
      showToast(`Saved "${name}" to cost database (${selectedItems.length} elements)`);
    } else {
      addProjectAssembly(asm);
      showToast(`Saved "${name}" to project (${selectedItems.length} elements)`);
    }
    setShowSaveAssembly(false);
    setAssemblyName("");
  };

  const selectedTotal = results.reduce((sum, item, i) => {
    if (!selected.has(i)) return sum;
    const q = nn(item.quantity);
    return sum + q * (nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor));
  }, 0);

  return (
    <Modal onClose={onClose} extraWide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            <Ic d={I.ai} size={16} color={C.accent} /> AI Scope Generator
          </h3>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            Describe the scope of work and AI will generate line items with pricing
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
        >
          <Ic d={I.x} size={16} />
        </button>
      </div>

      {/* Project context badges */}
      {contextLines.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {contextLines.map((line, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                background: `${C.accent}10`,
                color: C.textDim,
                fontWeight: 500,
              }}
            >
              {line}
            </span>
          ))}
        </div>
      )}

      {/* Prompt input */}
      <div style={{ marginBottom: 12 }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder='Describe the scope of work...\n\nExamples:\n• Complete concrete package for a 5,000 SF warehouse with 6" slab on grade\n• Interior renovation of a 3-story office building - drywall, flooring, paint\n• Site work including excavation, grading, utilities, and paving for 2-acre lot'
          onKeyDown={e => {
            if (e.key === "Enter" && e.metaKey) handleGenerate();
          }}
          style={{
            width: "100%",
            minHeight: 90,
            padding: 10,
            fontSize: 13,
            background: C.bg2,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            resize: "vertical",
            outline: "none",
            fontFamily: T.font.sans,
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 10, color: C.textDimmer }}>{"\u2318"}+Enter to generate</span>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            style={bt(C, {
              background: loading ? C.bg2 : C.gradient || C.accent,
              color: loading ? C.textDim : "#fff",
              padding: "7px 18px",
              fontSize: 12,
              fontWeight: 700,
              opacity: !prompt.trim() ? 0.5 : 1,
            })}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: `2px solid ${C.border}`,
                    borderTopColor: C.accent,
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    display: "inline-block",
                  }}
                />
                Generating...
              </span>
            ) : (
              <>
                <Ic d={I.ai} size={12} color="#fff" /> Generate Scope
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 10,
            background: `rgba(231,76,60,0.1)`,
            border: `1px solid rgba(231,76,60,0.3)`,
            borderRadius: T.radius.md,
            fontSize: 12,
            color: "#E74C3C",
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
              padding: "0 2px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={toggleAll}
                style={{
                  fontSize: 11,
                  color: C.accent,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                {selected.size === results.length ? "Deselect All" : "Select All"}
              </button>
              <span style={{ fontSize: 11, color: C.textDim }}>
                {selected.size} of {results.length} selected
              </span>
            </div>
          </div>

          {/* Items list */}
          <div
            style={{
              maxHeight: 340,
              overflowY: "auto",
              borderRadius: T.radius.md,
              border: `1px solid ${C.border}`,
            }}
          >
            {results.map((item, i) => {
              const isSelected = selected.has(i);
              const unitTotal = nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor);
              const lineTotal = unitTotal * nn(item.quantity);
              return (
                <div
                  key={i}
                  onClick={() => toggleItem(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: isSelected ? `${C.accent}08` : "transparent",
                    borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : "none",
                    transition: "background 0.1s",
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      flexShrink: 0,
                      border: `2px solid ${isSelected ? C.accent : C.border}`,
                      background: isSelected ? C.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                  >
                    {isSelected && <Ic d={I.check} size={10} color="#fff" sw={3} />}
                  </div>

                  {/* Code */}
                  <span
                    style={{
                      fontFamily: T.font.sans,
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.purple,
                      minWidth: 54,
                      flexShrink: 0,
                    }}
                  >
                    {item.code || "—"}
                  </span>

                  {/* Description */}
                  <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 500, minWidth: 0 }}>
                    {item.description}
                  </span>

                  {/* Qty + Unit */}
                  <span
                    style={{
                      fontSize: 10,
                      color: C.textDim,
                      fontWeight: 500,
                      flexShrink: 0,
                      fontFeatureSettings: "'tnum'",
                    }}
                  >
                    {nn(item.quantity)} {item.unit}
                  </span>

                  {/* Unit cost breakdown */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, fontSize: 10, fontFeatureSettings: "'tnum'" }}>
                    {nn(item.material) > 0 && <span style={{ color: C.green }}>M:{fmt2(item.material)}</span>}
                    {nn(item.labor) > 0 && <span style={{ color: C.blue }}>L:{fmt2(item.labor)}</span>}
                    {nn(item.equipment) > 0 && <span style={{ color: C.orange }}>E:{fmt2(item.equipment)}</span>}
                    {nn(item.subcontractor) > 0 && (
                      <span style={{ color: C.purple }}>S:{fmt2(item.subcontractor)}</span>
                    )}
                  </div>

                  {/* Line total */}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.text,
                      fontFeatureSettings: "'tnum'",
                      fontFamily: T.font.sans,
                      minWidth: 70,
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {fmt2(lineTotal)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Save as Assembly */}
          {showSaveAssembly && selected.size > 0 && (
            <div
              style={{
                padding: "10px 12px",
                marginTop: 8,
                borderRadius: T.radius.md,
                background: `${C.accent}08`,
                border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Ic d={I.layers} size={14} color={C.accent} />
                <input
                  autoFocus
                  value={assemblyName}
                  onChange={e => setAssemblyName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") setShowSaveAssembly(false);
                  }}
                  placeholder="Assembly name..."
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    fontSize: 12,
                    background: C.bg2,
                    color: C.text,
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.sm,
                    outline: "none",
                    fontFamily: T.font.sans,
                  }}
                />
                <button
                  onClick={() => setShowSaveAssembly(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.textDim,
                    cursor: "pointer",
                    fontSize: 11,
                    padding: "4px",
                  }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleSaveAssembly("project")}
                  style={bt(C, {
                    background: C.green || C.accent,
                    color: "#fff",
                    padding: "5px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    flex: 1,
                  })}
                >
                  <Ic d={I.estimate} size={10} color="#fff" /> Save to Project
                </button>
                <button
                  onClick={() => handleSaveAssembly("database")}
                  style={bt(C, {
                    background: C.accent,
                    color: "#fff",
                    padding: "5px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    flex: 1,
                  })}
                >
                  <Ic d={I.assembly} size={10} color="#fff" /> Save to Database
                </button>
              </div>
              <div style={{ fontSize: 10, color: C.textDimmer, marginTop: 6, lineHeight: 1.4 }}>
                <strong>Project</strong> = saved with this estimate only. <strong>Database</strong> = available across
                all estimates.
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 2px",
              marginTop: showSaveAssembly ? 4 : 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 12, color: C.textDim }}>
                Selected Total:{" "}
                <strong
                  style={{
                    color: C.accent,
                    fontSize: 15,
                    fontWeight: 700,
                    fontFeatureSettings: "'tnum'",
                    fontFamily: T.font.sans,
                  }}
                >
                  {fmt2(selectedTotal)}
                </strong>
              </div>
              {!showSaveAssembly && selected.size > 1 && (
                <button
                  onClick={() => setShowSaveAssembly(true)}
                  style={{
                    fontSize: 11,
                    color: C.accent,
                    background: "transparent",
                    border: `1px solid ${C.accent}40`,
                    borderRadius: T.radius.sm,
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: "3px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Ic d={I.layers} size={10} color={C.accent} /> Save as Assembly
                </button>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              style={bt(C, {
                background: selected.size > 0 ? C.gradient || C.accent : C.bg2,
                color: selected.size > 0 ? "#fff" : C.textDim,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 700,
              })}
            >
              <Ic d={I.plus} size={12} color={selected.size > 0 ? "#fff" : C.textDim} /> Add {selected.size} Item
              {selected.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* Empty state when no results yet and not loading */}
      {results.length === 0 && !loading && (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.textDimmer, lineHeight: 1.6 }}>
            Describe the work scope above and AI will generate
            <br />
            line items with CSI codes, quantities, and pricing.
          </div>
        </div>
      )}
    </Modal>
  );
}
