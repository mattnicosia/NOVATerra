// TakeoffSearchBar — Search input, DB results dropdown, NOVA AI lookup results
// Extracted from TakeoffLeftPanel.jsx
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useProjectStore } from "@/stores/projectStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";
import { callAnthropic } from "@/utils/ai";
import {
  _novaCache,
  _novaCacheEvict,
  NOVA_SYSTEM_PROMPT,
  buildNovaUserMsg,
  parseNovaResponse,
} from "@/utils/takeoffHelpers";

export default function TakeoffSearchBar({
  addTakeoffFreeform,
  addTakeoffFromDb,
  addTakeoffFromAI,
  insertAssemblyIntoTakeoffs,
  insertAIGroupIntoTakeoffs,
  addTakeoffFromAIAsSingle,
}) {
  const C = useTheme();
  const T = C.T;

  const tkNewInput = useDrawingPipelineStore(s => s.tkNewInput);
  const setTkNewInput = useDrawingPipelineStore(s => s.setTkNewInput);
  const tkNewUnit = useDrawingPipelineStore(s => s.tkNewUnit);
  const setTkNewUnit = useDrawingPipelineStore(s => s.setTkNewUnit);
  const tkDbResults = useDrawingPipelineStore(s => s.tkDbResults);

  const project = useProjectStore(s => s.project);

  const [aiLookup, setAiLookup] = useState(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef(null);

  // Clear AI lookup when input changes
  useEffect(() => {
    setAiLookup(null);
  }, [tkNewInput]);

  // Close plus menu on outside click
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = e => {
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setPlusMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [plusMenuOpen]);

  // AI item lookup (NOVA)
  const lookupItemWithNova = async inputText => {
    if (!inputText?.trim()) return;
    const key = inputText.toLowerCase().trim().replace(/\s+/g, " ");
    const cached = _novaCache.get(key);
    if (cached?.result) {
      setAiLookup({ result: cached.result });
      return;
    }
    setAiLookup("loading");
    const userMsg = buildNovaUserMsg(inputText, project);
    try {
      const text = await callAnthropic({
        max_tokens: 1200,
        messages: [{ role: "user", content: userMsg }],
        system: NOVA_SYSTEM_PROMPT,
        temperature: 0.3,
      });
      const { result, error } = parseNovaResponse(text);
      if (result) {
        _novaCache.set(key, { result, timestamp: Date.now() });
        _novaCacheEvict();
        setAiLookup({ result });
      } else {
        setAiLookup({ error: error || "NOVA couldn't identify this item" });
      }
    } catch (err) {
      console.error("[NOVA Lookup] Error:", err);
      setAiLookup({ error: err.message || "AI lookup failed" });
    }
  };

  return (
    <div
      style={{
        padding: "6px 10px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        gap: 6,
        alignItems: "center",
        position: "relative",
      }}
    >
      <div style={{ position: "relative", flex: 1 }}>
        <input
          value={tkNewInput}
          onChange={e => setTkNewInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && tkNewInput.trim()) {
              if (aiLookup?.result?.type === "single") {
                addTakeoffFromAI(aiLookup.result);
              } else if (aiLookup?.result?.type === "multi") {
                insertAIGroupIntoTakeoffs(aiLookup.result);
              } else if (tkDbResults.length > 0 && tkDbResults[0]._type === "item") {
                addTakeoffFromDb(tkDbResults[0]);
              } else if (tkDbResults.length > 0 && tkDbResults[0]._type === "assembly") {
                insertAssemblyIntoTakeoffs(tkDbResults[0]);
              } else {
                addTakeoffFreeform(tkNewInput);
              }
            }
          }}
          placeholder="Search or type item · Enter to add · Tab navigate"
          style={inp(C, { paddingLeft: 28, fontSize: 11, padding: "7px 10px 7px 28px" })}
        />
        <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
          <Ic d={I.search} size={12} color={C.textDim} />
        </div>
      </div>
      <select
        value={tkNewUnit}
        onChange={e => setTkNewUnit(e.target.value)}
        title="Measurement type"
        style={inp(C, {
          width: 56,
          padding: "5px 2px",
          fontSize: 9,
          fontWeight: 600,
          textAlign: "center",
          flexShrink: 0,
          color: ["EA", "SET", "PAIR"].includes(tkNewUnit)
            ? C.green
            : ["LF", "VLF"].includes(tkNewUnit)
              ? C.blue
              : C.accent,
          background: C.bg2,
        })}
      >
        <optgroup label="Count">
          <option value="EA">EA</option>
        </optgroup>
        <optgroup label="Linear">
          <option value="LF">LF</option>
        </optgroup>
        <optgroup label="Area">
          <option value="SF">SF</option>
          <option value="SY">SY</option>
        </optgroup>
        <optgroup label="Volume">
          <option value="CY">CY</option>
          <option value="CF">CF</option>
        </optgroup>
        <optgroup label="Other">
          <option value="LS">LS</option>
          <option value="HR">HR</option>
        </optgroup>
      </select>
      <div ref={plusMenuRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          className="accent-btn"
          onClick={() => {
            if (tkNewInput.trim()) setPlusMenuOpen(v => !v);
          }}
          disabled={!tkNewInput.trim()}
          title="Add item"
          style={bt(C, {
            background: tkNewInput.trim() ? C.accent : C.bg3,
            color: tkNewInput.trim() ? "#fff" : C.textDim,
            padding: "5px 8px",
          })}
        >
          <Ic d={I.plus} size={12} color={tkNewInput.trim() ? "#fff" : C.textDim} sw={2.5} />
        </button>
        {plusMenuOpen && tkNewInput.trim() && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              zIndex: 60,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.30)",
              minWidth: 210,
              overflow: "hidden",
            }}
          >
            <div
              className="nav-item"
              onClick={() => {
                addTakeoffFreeform(tkNewInput);
                setPlusMenuOpen(false);
              }}
              style={{
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <Ic d={I.plus} size={11} color={C.textDim} sw={2} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Add as freeform</div>
                <div style={{ fontSize: 9, color: C.textDim }}>No pricing -- measure only</div>
              </div>
            </div>
            <div
              className="nav-item"
              onClick={() => {
                lookupItemWithNova(tkNewInput);
                setPlusMenuOpen(false);
              }}
              style={{
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <Ic d={I.ai} size={11} color={C.accent} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>Ask NOVA to price</div>
                <div style={{ fontSize: 9, color: C.textDim }}>Get code, description & pricing</div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* DB + Assembly + NOVA search dropdown */}
      {tkNewInput.trim() && (
        <div
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            top: "100%",
            zIndex: 50,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: "0 0 6px 6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.30)",
            maxHeight: 380,
            overflowY: "auto",
          }}
        >
          {tkDbResults.some(r => r._type === "assembly") && (
            <>
              <div
                style={{
                  padding: "4px 8px",
                  fontSize: 8,
                  fontWeight: 600,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  borderBottom: `1px solid ${C.border}`,
                  background: C.bg2,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ic d={I.assembly} size={10} color={C.accent} /> Assemblies
              </div>
              {tkDbResults
                .filter(r => r._type === "assembly")
                .map(asm => {
                  const totalPer = asm.elements.reduce(
                    (s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor),
                    0,
                  );
                  return (
                    <div
                      key={asm.id}
                      className="nav-item"
                      onClick={() => insertAssemblyIntoTakeoffs(asm)}
                      style={{
                        padding: "6px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        borderBottom: `1px solid ${C.bg}`,
                        cursor: "pointer",
                      }}
                    >
                      <Ic d={I.assembly} size={12} color={C.accent} />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontWeight: 600,
                          color: C.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {asm.name}
                      </span>
                      <span
                        style={{
                          fontSize: 8,
                          color: C.textMuted,
                          background: C.bg2,
                          padding: "1px 6px",
                          borderRadius: 8,
                        }}
                      >
                        {asm.elements.length} items
                      </span>
                      <span
                        style={{
                          fontFamily: T.font.sans,
                          fontSize: 9,
                          color: C.accent,
                          fontWeight: 600,
                        }}
                      >
                        {fmt2(totalPer)}
                      </span>
                    </div>
                  );
                })}
            </>
          )}
          {tkDbResults.some(r => r._type === "item") && (
            <>
              <div
                style={{
                  padding: "4px 8px",
                  fontSize: 8,
                  fontWeight: 600,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  borderBottom: `1px solid ${C.border}`,
                  background: C.bg2,
                }}
              >
                Database Items
              </div>
              {tkDbResults
                .filter(r => r._type === "item")
                .map(el => (
                  <div
                    key={el.id}
                    className="nav-item"
                    onClick={() => addTakeoffFromDb(el)}
                    style={{
                      padding: "6px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: `1px solid ${C.bg}`,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: T.font.sans,
                        fontSize: 9,
                        color: C.purple,
                        fontWeight: 600,
                        minWidth: 60,
                      }}
                    >
                      {el.code}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        color: C.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {el.name}
                    </span>
                    <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                    <span
                      style={{
                        fontFamily: T.font.sans,
                        fontSize: 9,
                        color: C.accent,
                        fontWeight: 600,
                      }}
                    >
                      {fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}
                    </span>
                  </div>
                ))}
            </>
          )}
          {/* NOVA AI Results Section */}
          {aiLookup === "loading" && (
            <div
              style={{
                padding: "10px 10px",
                borderTop: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: `${C.accent}06`,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: `2px solid ${C.border}`,
                  borderTopColor: C.accent,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>NOVA is thinking...</span>
            </div>
          )}
          {aiLookup?.result?.type === "single" && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div
                style={{
                  padding: "4px 8px",
                  fontSize: 8,
                  fontWeight: 600,
                  color: C.accent,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  borderBottom: `1px solid ${C.border}`,
                  background: `${C.accent}08`,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ic d={I.ai} size={10} color={C.accent} /> NOVA Suggestion
              </div>
              <div
                className="nav-item"
                onClick={() => addTakeoffFromAI(aiLookup.result)}
                style={{
                  padding: "6px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: T.font.sans,
                    fontSize: 9,
                    color: C.purple,
                    fontWeight: 600,
                    minWidth: 60,
                  }}
                >
                  {aiLookup.result.code}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: C.text,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {aiLookup.result.description}
                </span>
                <span style={{ fontSize: 9, color: C.textDim }}>/{aiLookup.result.unit}</span>
                <span
                  style={{
                    fontFamily: T.font.sans,
                    fontSize: 9,
                    color: C.green,
                    fontWeight: 600,
                  }}
                >
                  {fmt2(
                    nn(aiLookup.result.material) +
                      nn(aiLookup.result.labor) +
                      nn(aiLookup.result.equipment) +
                      nn(aiLookup.result.subcontractor),
                  )}
                </span>
              </div>
            </div>
          )}
          {aiLookup?.result?.type === "multi" && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              <div
                style={{
                  padding: "4px 8px",
                  fontSize: 8,
                  fontWeight: 600,
                  color: C.accent,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  borderBottom: `1px solid ${C.border}`,
                  background: `${C.accent}08`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Ic d={I.ai} size={10} color={C.accent} /> NOVA: {aiLookup.result.groupName} (
                  {aiLookup.result.items.length} parts)
                </span>
              </div>
              {aiLookup.result.items.map((item, idx) => (
                <div
                  key={idx}
                  className="nav-item"
                  onClick={() => addTakeoffFromAI(item)}
                  style={{
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    borderBottom: idx < aiLookup.result.items.length - 1 ? `1px solid ${C.bg2}` : "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.font.sans,
                      fontSize: 8,
                      color: C.purple,
                      fontWeight: 600,
                      minWidth: 55,
                    }}
                  >
                    {item.code}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.description}
                  </span>
                  <span style={{ fontSize: 8, color: C.textDim }}>/{item.unit}</span>
                  <span
                    style={{
                      fontFamily: T.font.sans,
                      fontSize: 8,
                      color: C.green,
                      fontWeight: 600,
                    }}
                  >
                    {fmt2(nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor))}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: "4px 10px",
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <div
                  className="nav-item"
                  onClick={() => insertAIGroupIntoTakeoffs(aiLookup.result)}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#fff",
                    background: C.accent,
                    borderRadius: 4,
                  }}
                >
                  Add All as Group
                </div>
                <div
                  className="nav-item"
                  onClick={() => addTakeoffFromAIAsSingle(aiLookup.result)}
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 500,
                    color: C.textDim,
                    background: C.bg3,
                    borderRadius: 4,
                  }}
                >
                  Add as single line
                </div>
              </div>
            </div>
          )}
          {aiLookup?.error && (
            <div
              style={{
                padding: "6px 10px",
                borderTop: `1px solid ${C.border}`,
                background: `rgba(231,76,60,0.06)`,
              }}
            >
              <div style={{ fontSize: 10, color: "#E74C3C", marginBottom: 4 }}>{aiLookup.error}</div>
              <span
                className="nav-item"
                onClick={() => lookupItemWithNova(tkNewInput)}
                style={{ fontSize: 9, color: C.accent, cursor: "pointer", fontWeight: 600 }}
              >
                Retry
              </span>
            </div>
          )}
          {/* Footer: Freeform option */}
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <div
              className="nav-item"
              onClick={() => addTakeoffFreeform(tkNewInput)}
              style={{
                padding: "5px 10px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                color: C.textDim,
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              <Ic d={I.plus} size={10} color={C.textDim} sw={2} /> Add "{tkNewInput}" as freeform (no pricing)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
