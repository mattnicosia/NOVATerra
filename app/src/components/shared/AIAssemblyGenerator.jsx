import { useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useUiStore } from "@/stores/uiStore";
import { useNovaStore } from "@/stores/novaStore";
import { callAnthropicStream } from "@/utils/ai";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";
import { bt, inp, nInp } from "@/utils/styles";
import { nn, fmt2, titleCase } from "@/utils/format";

const EXAMPLE_PROMPTS = [
  "Standard 2x4 interior partition with drywall, insulation, and paint",
  '8" CMU exterior wall with insulation, waterproofing, and stucco finish',
  "Residential bathroom rough-in with all fixtures and tile",
  '4" concrete slab on grade with vapor barrier, rebar, and finish',
  "Complete standing seam metal roof assembly with underlayment and insulation",
  "Commercial storefront entrance with aluminum frame and hardware",
];

const SYSTEM_PROMPT = `You are NOVA, the AI construction intelligence inside NOVATerra. You are a senior estimator and assembly builder.

When given a plain-English description of a construction assembly, generate a complete, detailed, priced assembly with all component elements.

RULES:
- Each element must have: code (CSI format like "03.310"), desc (clear item name), unit (EA, SF, LF, CY, etc.), m (material cost per unit as a number), l (labor cost per unit as a number), e (equipment cost per unit as a number), factor (multiplier — usually 1, but can represent conversion factors like 8 SF per LF of wall height)
- Use realistic 2025-2026 US construction pricing
- Include ALL necessary components — don't skip anything a real estimator would include
- Use proper CSI division codes
- Assembly should be self-contained and complete
- IMPORTANT: Capitalize the first letter of every word in names and descriptions (e.g. "Joint Compound" not "joint compound", "Metal Stud Framing" not "metal stud framing"). Preserve abbreviations in uppercase (CMU, LVL, OSB, PSI, etc.)

RESPOND WITH ONLY valid JSON in this exact format (no markdown, no backticks, no explanation):
{
  "code": "XX.XXX.AXX",
  "name": "Assembly Name (descriptive)",
  "description": "Brief one-line description with per-unit context",
  "elements": [
    {"code":"XX.XXX","desc":"Item Name","unit":"UNIT","m":0.00,"l":0.00,"e":0.00,"factor":1}
  ]
}`;

export default function AIAssemblyGenerator({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const addAssembly = useDatabaseStore(s => s.addAssembly);
  const showToast = useUiStore(s => s.showToast);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const abortRef = useRef(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setStream("");
    abortRef.current = new AbortController();

    try {
      const fullText = await callAnthropicStream({
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Generate a complete construction assembly for:\n\n"${prompt.trim()}"` }],
        onText: t => setStream(t),
        signal: abortRef.current.signal,
      });

      // Parse JSON from response — handle markdown-wrapped JSON
      let json = fullText.trim();
      if (json.startsWith("```")) {
        json = json.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(json);
      if (!parsed.name || !parsed.elements?.length) throw new Error("Invalid assembly format");
      setResult(parsed);
      setStream("");
    } catch (err) {
      if (err.name === "AbortError") {
        setStream("");
        setLoading(false);
        return;
      }
      setError(err.message || "Failed to generate assembly");
      setStream("");
    }
    setLoading(false);
  };

  const stopGeneration = () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
  };

  const addToDatabase = () => {
    if (!result) return;
    addAssembly({
      code: result.code || "",
      name: titleCase(result.name),
      description: result.description || "",
      elements: result.elements.map(el => ({
        code: el.code,
        desc: titleCase(el.desc),
        unit: el.unit,
        m: nn(el.m),
        l: nn(el.l),
        e: nn(el.e),
        factor: nn(el.factor) || 1,
      })),
    });
    showToast(`Assembly "${titleCase(result.name)}" added to database`);
    onClose();
  };

  const updateElement = (idx, field, value) => {
    if (!result) return;
    const updated = { ...result };
    updated.elements = [...updated.elements];
    updated.elements[idx] = { ...updated.elements[idx], [field]: value };
    setResult(updated);
  };

  const removeElement = idx => {
    if (!result) return;
    const updated = { ...result };
    updated.elements = updated.elements.filter((_, i) => i !== idx);
    setResult(updated);
  };

  const totalPer = result
    ? result.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor || 1), 0)
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: 720,
          maxHeight: "85vh",
          background: C.bg,
          borderRadius: T.radius.lg,
          border: `1px solid ${C.border}`,
          boxShadow: T.shadow.lg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <NovaSceneLazy width={36} height={36} size={0.8} intensity={0.6} lightweight />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>NOVA Assembly Builder</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>
              Describe what you need — NOVA builds a complete priced assembly
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: T.radius.full,
              border: "none",
              background: C.bg2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Ic d={I.close} size={14} color={C.textDim} sw={2} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* Prompt input */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
                display: "block",
              }}
            >
              Describe your assembly
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Standard 2x4 interior partition with drywall, insulation, and paint..."
                rows={2}
                style={{
                  ...inp(C),
                  flex: 1,
                  resize: "vertical",
                  fontSize: 13,
                  padding: "10px 14px",
                  fontFamily: T.font.sans,
                  lineHeight: 1.5,
                  minHeight: 48,
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    generate();
                  }
                }}
              />
              {loading ? (
                <button
                  onClick={stopGeneration}
                  style={{
                    ...bt(C),
                    background: C.red,
                    color: "#fff",
                    padding: "10px 18px",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: T.radius.sm,
                    alignSelf: "flex-end",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Ic d={I.close} size={12} color="#fff" sw={2.5} /> Stop
                </button>
              ) : (
                <button
                  onClick={generate}
                  disabled={!prompt.trim()}
                  style={{
                    ...bt(C),
                    background: prompt.trim()
                      ? `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple})`
                      : C.bg2,
                    color: prompt.trim() ? "#fff" : C.textDim,
                    padding: "10px 18px",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: T.radius.sm,
                    alignSelf: "flex-end",
                    border: "none",
                    cursor: prompt.trim() ? "pointer" : "not-allowed",
                    opacity: prompt.trim() ? 1 : 0.5,
                  }}
                >
                  <Ic d={I.ai} size={14} color={prompt.trim() ? "#fff" : C.textDim} /> Build with NOVA
                </button>
              )}
            </div>
          </div>

          {/* Quick prompts */}
          {!result && !loading && !stream && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, marginBottom: 8 }}>Try an example:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {EXAMPLE_PROMPTS.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(ex)}
                    style={{
                      ...bt(C),
                      background: C.bg2,
                      color: C.textMuted,
                      border: `1px solid ${C.border}`,
                      padding: "5px 10px",
                      fontSize: 10,
                      borderRadius: 20,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {ex.length > 55 ? ex.slice(0, 55) + "..." : ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: `${C.red}15`,
                border: `1px solid ${C.red}30`,
                borderRadius: 6,
                marginBottom: 14,
                fontSize: 12,
                color: C.red,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Streaming preview */}
          {loading && stream && !result && (
            <div
              style={{
                padding: 14,
                background: C.bg2,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                marginBottom: 14,
                fontSize: 11,
                color: C.textMuted,
                fontFamily: T.font.sans,
                whiteSpace: "pre-wrap",
                maxHeight: 200,
                overflowY: "auto",
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.accent,
                    animation: "pulse 1s infinite",
                  }}
                />
                <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>
                  NOVA is building your assembly...
                </span>
              </div>
              {stream.slice(0, 500)}
              {stream.length > 500 ? "..." : ""}
            </div>
          )}

          {/* Loading spinner if no stream yet */}
          {loading && !stream && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <div
                style={{
                  margin: "0 auto 12px",
                  width: 56,
                  height: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <NovaSceneLazy width={56} height={56} size={0.8} intensity={0.6} lightweight />
              </div>
              <div style={{ fontSize: 12, color: C.textMuted }}>NOVA is building your assembly...</div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              style={{
                border: `1px solid ${C.borderAccent || C.accent}40`,
                borderRadius: T.radius.md,
                overflow: "hidden",
              }}
            >
              {/* Assembly header */}
              <div
                style={{
                  padding: "12px 16px",
                  background: `linear-gradient(135deg, ${C.accent}08, ${C.accentAlt || C.purple}08)`,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <input
                    value={result.name}
                    onChange={e => setResult({ ...result, name: e.target.value })}
                    style={{
                      ...inp(C),
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 700,
                      padding: "4px 8px",
                      background: "transparent",
                      border: `1px solid transparent`,
                    }}
                    onFocus={e => (e.target.style.borderColor = C.accent)}
                    onBlur={e => (e.target.style.borderColor = "transparent")}
                  />
                  <input
                    value={result.code || ""}
                    onChange={e => setResult({ ...result, code: e.target.value })}
                    style={{
                      ...inp(C),
                      width: 100,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "4px 8px",
                      fontFamily: T.font.sans,
                      color: C.purple,
                      textAlign: "center",
                      background: "transparent",
                      border: `1px solid transparent`,
                    }}
                    onFocus={e => (e.target.style.borderColor = C.accent)}
                    onBlur={e => (e.target.style.borderColor = "transparent")}
                    placeholder="Code"
                  />
                </div>
                <input
                  value={result.description || ""}
                  onChange={e => setResult({ ...result, description: e.target.value })}
                  style={{
                    ...inp(C),
                    width: "100%",
                    fontSize: 11,
                    color: C.textMuted,
                    padding: "3px 8px",
                    background: "transparent",
                    border: `1px solid transparent`,
                  }}
                  onFocus={e => (e.target.style.borderColor = C.accent)}
                  onBlur={e => (e.target.style.borderColor = "transparent")}
                  placeholder="Description"
                />
              </div>

              {/* Elements table */}
              <div style={{ padding: "0 0 8px" }}>
                {/* Column headers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px 2fr 44px 72px 72px 72px 50px 80px 28px",
                    gap: 4,
                    padding: "8px 12px",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 8,
                    fontWeight: 600,
                    color: C.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  <span>Code</span>
                  <span>Description</span>
                  <span>Unit</span>
                  <span style={{ textAlign: "right" }}>Material</span>
                  <span style={{ textAlign: "right" }}>Labor</span>
                  <span style={{ textAlign: "right" }}>Equip</span>
                  <span style={{ textAlign: "center" }}>Factor</span>
                  <span style={{ textAlign: "right" }}>Total</span>
                  <span></span>
                </div>

                {result.elements.map((el, idx) => {
                  const elTotal = (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor || 1);
                  const isEditing = editingIdx === idx;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "70px 2fr 44px 72px 72px 72px 50px 80px 28px",
                        gap: 4,
                        padding: "5px 12px",
                        borderBottom: `1px solid ${C.bg}`,
                        alignItems: "center",
                        fontSize: 11,
                        background: isEditing ? C.accentBg : idx % 2 === 1 ? `${C.bg2}40` : "transparent",
                      }}
                    >
                      {isEditing ? (
                        <>
                          <input
                            value={el.code}
                            onChange={e => updateElement(idx, "code", e.target.value)}
                            style={inp(C, { fontFamily: T.font.sans, fontSize: 9, padding: "2px 4px" })}
                          />
                          <input
                            value={el.desc}
                            onChange={e => updateElement(idx, "desc", e.target.value)}
                            autoFocus
                            style={inp(C, { fontSize: 11, padding: "2px 6px" })}
                          />
                          <input
                            value={el.unit}
                            onChange={e => updateElement(idx, "unit", e.target.value)}
                            style={inp(C, { fontSize: 9, padding: "2px 4px", textAlign: "center" })}
                          />
                          <input
                            type="number"
                            value={el.m}
                            onChange={e => updateElement(idx, "m", parseFloat(e.target.value) || 0)}
                            style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.green })}
                          />
                          <input
                            type="number"
                            value={el.l}
                            onChange={e => updateElement(idx, "l", parseFloat(e.target.value) || 0)}
                            style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.blue })}
                          />
                          <input
                            type="number"
                            value={el.e}
                            onChange={e => updateElement(idx, "e", parseFloat(e.target.value) || 0)}
                            style={nInp(C, { fontSize: 10, padding: "2px 4px", color: C.orange })}
                          />
                          <input
                            type="number"
                            value={el.factor || 1}
                            onChange={e => updateElement(idx, "factor", parseFloat(e.target.value) || 1)}
                            style={nInp(C, { fontSize: 10, padding: "2px 4px", textAlign: "center" })}
                          />
                          <div style={{ textAlign: "right", fontFamily: T.font.sans, fontWeight: 600 }}>
                            {fmt2(elTotal)}
                          </div>
                          <button
                            onClick={() => setEditingIdx(null)}
                            style={{
                              width: 22,
                              height: 22,
                              border: "none",
                              background: "transparent",
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                            }}
                          >
                            <Ic d={I.check} size={11} color={C.green} sw={2.5} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            style={{
                              fontFamily: T.font.sans,
                              fontSize: 9,
                              color: C.purple,
                              fontWeight: 600,
                            }}
                          >
                            {el.code}
                          </span>
                          <span
                            style={{
                              color: C.text,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {el.desc}
                          </span>
                          <span style={{ fontSize: 10, color: C.textDim, textAlign: "center" }}>{el.unit}</span>
                          <span
                            style={{
                              textAlign: "right",
                              fontFamily: T.font.sans,
                              fontSize: 10,
                              color: C.green,
                            }}
                          >
                            {fmt2(nn(el.m) * nn(el.factor || 1))}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              fontFamily: T.font.sans,
                              fontSize: 10,
                              color: C.blue,
                            }}
                          >
                            {fmt2(nn(el.l) * nn(el.factor || 1))}
                          </span>
                          <span
                            style={{
                              textAlign: "right",
                              fontFamily: T.font.sans,
                              fontSize: 10,
                              color: C.orange,
                            }}
                          >
                            {fmt2(nn(el.e) * nn(el.factor || 1))}
                          </span>
                          <span
                            style={{
                              textAlign: "center",
                              fontFamily: T.font.sans,
                              fontSize: 9,
                              color: C.textDim,
                            }}
                          >
                            {nn(el.factor || 1) !== 1 ? `×${el.factor}` : ""}
                          </span>
                          <span style={{ textAlign: "right", fontFamily: T.font.sans, fontWeight: 600 }}>
                            {fmt2(elTotal)}
                          </span>
                          <div style={{ display: "flex", gap: 1 }}>
                            <button
                              onClick={() => setEditingIdx(idx)}
                              title="Edit"
                              style={{
                                width: 18,
                                height: 18,
                                border: "none",
                                background: "transparent",
                                borderRadius: 3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                opacity: 0.5,
                              }}
                            >
                              <Ic d={I.edit} size={9} color={C.textDim} />
                            </button>
                            <button
                              onClick={() => removeElement(idx)}
                              title="Remove"
                              style={{
                                width: 18,
                                height: 18,
                                border: "none",
                                background: "transparent",
                                borderRadius: 3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                opacity: 0.4,
                              }}
                            >
                              <Ic d={I.close} size={9} color={C.red} sw={2} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total bar */}
              <div
                style={{
                  padding: "10px 16px",
                  borderTop: `1px solid ${C.border}`,
                  background: C.bg2,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {result.elements.length} elements &bull;{" "}
                  <span style={{ color: C.green }}>
                    M: {fmt2(result.elements.reduce((s, el) => s + nn(el.m) * nn(el.factor || 1), 0))}
                  </span>{" "}
                  <span style={{ color: C.blue }}>
                    L: {fmt2(result.elements.reduce((s, el) => s + nn(el.l) * nn(el.factor || 1), 0))}
                  </span>{" "}
                  <span style={{ color: C.orange }}>
                    E: {fmt2(result.elements.reduce((s, el) => s + nn(el.e) * nn(el.factor || 1), 0))}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: T.font.sans,
                    ...(C.isDark && C.gradient
                      ? {
                          background: C.gradient,
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }
                      : { color: C.accent }),
                  }}
                >
                  {fmt2(totalPer)}
                  <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>/unit</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => {
                setResult(null);
                setStream("");
              }}
              style={{
                ...bt(C),
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                padding: "8px 16px",
                fontSize: 11,
                borderRadius: T.radius.sm,
                cursor: "pointer",
              }}
            >
              Regenerate
            </button>
            <button
              onClick={addToDatabase}
              style={{
                ...bt(C),
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple})`,
                color: "#fff",
                padding: "8px 20px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: T.radius.sm,
                border: "none",
                cursor: "pointer",
                boxShadow: `0 2px 8px ${C.accent}40`,
              }}
            >
              <Ic d={I.plus} size={12} color="#fff" sw={2.5} /> Add to Database
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
