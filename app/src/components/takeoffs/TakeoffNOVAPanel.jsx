// TakeoffNOVAPanel — Unified NOVA right panel for Vision / Tools / Chat
// Extracted from TakeoffsPage.jsx for maintainability.
// Reads most state from Zustand stores; only receives shared local state as props.
import { useState, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import NovaOrb from "@/components/dashboard/NovaOrb";
import { MessageBubble, ActionCards, QUICK_ACTIONS } from "@/components/ai/AIChatPanel";
import { NOVA_TOOLS, executeNovaTool } from "@/utils/novaTools";
import { callAnthropic, buildProjectContext } from "@/utils/ai";
import { scanAllSheets, recordPredictionFeedback } from "@/utils/predictiveEngine";

export default function TakeoffNOVAPanel({
  aiDrawingAnalysis,
  pdfSchedules,
  runDrawingAnalysis,
  runPdfScheduleScan,
  crossSheetScan,
  setCrossSheetScan,
}) {
  const C = useTheme();
  const T = C.T;

  // ── Store state ──
  const tkPredictions = useTakeoffsStore(s => s.tkPredictions);
  const tkPredAccepted = useTakeoffsStore(s => s.tkPredAccepted);
  const tkPredRejected = useTakeoffsStore(s => s.tkPredRejected);
  const tkPredRefining = useTakeoffsStore(s => s.tkPredRefining);
  const acceptPrediction = useTakeoffsStore(s => s.acceptPrediction);
  const rejectPrediction = useTakeoffsStore(s => s.rejectPrediction);
  const clearPredictions = useTakeoffsStore(s => s.clearPredictions);
  const tkActiveTakeoffId = useTakeoffsStore(s => s.tkActiveTakeoffId);
  const tkMeasureState = useTakeoffsStore(s => s.tkMeasureState);
  const tkTool = useTakeoffsStore(s => s.tkTool);
  const setTkNovaPanelOpen = useTakeoffsStore(s => s.setTkNovaPanelOpen);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const addMeasurement = useTakeoffsStore(s => s.addMeasurement);
  const drawings = useDrawingsStore(s => s.drawings);
  const selectedDrawingId = useDrawingsStore(s => s.selectedDrawingId);
  const project = useProjectStore(s => s.project);
  const showToast = useUiStore(s => s.showToast);
  const novaChatMessages = useUiStore(s => s.aiChatMessages);
  const setNovaChatMessages = useUiStore(s => s.setAiChatMessages);

  // ── Internal state ──
  const [novaChatInput, setNovaChatInput] = useState("");
  const [novaChatLoading, setNovaChatLoading] = useState(false);
  const novaChatScrollRef = useRef(null);
  const novaChatInputRef = useRef(null);

  // ── Derived ──
  const novaPreds = tkPredictions?.predictions || [];
  const novaPending = novaPreds.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id));
  const novaAccepted = novaPreds.filter(p => tkPredAccepted.includes(p.id));
  const novaActiveTo = takeoffs.find(t => t.id === tkActiveTakeoffId);
  const novaPredColor = novaActiveTo?.color || "#8B5CF6";
  const novaAvgConf =
    novaPreds.length > 0
      ? Math.round((novaPreds.reduce((s, p) => s + (p.confidence || 0), 0) / novaPreds.length) * 100)
      : 0;

  // ── Prediction handlers ──
  const novaAcceptOne = pred => {
    acceptPrediction(pred.id);
    recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true);
    if (tkActiveTakeoffId) {
      if (pred.type === "count" || pred.type === "wall-tag") {
        addMeasurement(tkActiveTakeoffId, {
          type: "count",
          points: [pred.point],
          value: 1,
          sheetId: selectedDrawingId,
          color: novaActiveTo?.color || "#5b8def",
          predicted: true,
          tag: tkPredictions.tag,
        });
      } else if (pred.type === "wall" && pred.points?.length >= 2) {
        addMeasurement(tkActiveTakeoffId, {
          type: "linear",
          points: pred.points,
          value: 0,
          sheetId: selectedDrawingId,
          color: novaActiveTo?.color || "#5b8def",
          predicted: true,
          tag: tkPredictions.tag,
        });
      } else if (pred.type === "area" && pred.points?.length >= 3) {
        addMeasurement(tkActiveTakeoffId, {
          type: "area",
          points: pred.points,
          value: 0,
          sheetId: selectedDrawingId,
          color: novaActiveTo?.color || "#5b8def",
          predicted: true,
          tag: pred.tag || tkPredictions.tag,
        });
      }
    }
  };

  const novaAcceptAll = () => {
    const toAdd = novaPreds.filter(p => !tkPredRejected.includes(p.id) && !tkPredAccepted.includes(p.id));
    if (tkActiveTakeoffId && toAdd.length > 0) {
      toAdd.forEach(() => recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true));
      toAdd.forEach(pred => {
        if (pred.type === "count" || pred.type === "wall-tag")
          addMeasurement(tkActiveTakeoffId, {
            type: "count",
            points: [pred.point],
            value: 1,
            sheetId: selectedDrawingId,
            color: novaActiveTo?.color || "#5b8def",
            predicted: true,
            tag: tkPredictions.tag,
          });
        else if (pred.type === "wall" && pred.points?.length >= 2)
          addMeasurement(tkActiveTakeoffId, {
            type: "linear",
            points: pred.points,
            value: 0,
            sheetId: selectedDrawingId,
            color: novaActiveTo?.color || "#5b8def",
            predicted: true,
            tag: tkPredictions.tag,
          });
        else if (pred.type === "area" && pred.points?.length >= 3)
          addMeasurement(tkActiveTakeoffId, {
            type: "area",
            points: pred.points,
            value: 0,
            sheetId: selectedDrawingId,
            color: novaActiveTo?.color || "#5b8def",
            predicted: true,
            tag: pred.tag || tkPredictions.tag,
          });
      });
      showToast(`Added ${toAdd.length} predicted measurements`);
    }
    clearPredictions();
  };

  const novaRejectAll = () => {
    novaPending.forEach(p => {
      rejectPrediction(p.id);
      recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, false);
    });
  };

  // ── NOVA Chat handler ──
  const handleNovaChat = async text => {
    const msg = (text || novaChatInput).trim();
    if (!msg || novaChatLoading) return;
    const userMsg = { role: "user", text: msg };
    const updated = [...novaChatMessages, userMsg];
    setNovaChatMessages(updated);
    setNovaChatInput("");
    setNovaChatLoading(true);
    try {
      const ctx = buildProjectContext({
        project,
        items: useItemsStore.getState().items,
        takeoffs,
        specs: useSpecsStore.getState().specs,
        drawings,
      });
      const apiMsgs = updated.map((m, i) => {
        if (m.actions) return { role: "assistant", content: m.text || "Done." };
        if (i === 0 && m.role === "user")
          return { role: "user", content: `[Project Context]\n${ctx}\n\n[Question]\n${m.text}` };
        return { role: m.role, content: m.text };
      });
      const CHAT_SYS = `You are NOVA, an expert construction estimating AI. Be concise and direct. Reference CSI codes when relevant. You have tools to modify the estimate.`;
      const resp = await callAnthropic({
        system: CHAT_SYS,
        max_tokens: 2000,
        messages: apiMsgs,
        tools: NOVA_TOOLS,
      });
      if (typeof resp === "string") {
        setNovaChatMessages([...updated, { role: "assistant", text: resp }]);
      } else if (resp?.content) {
        const textParts = [];
        const toolCalls = [];
        for (const b of resp.content) {
          if (b.type === "text") textParts.push(b.text);
          else if (b.type === "tool_use") toolCalls.push(b);
        }
        const toolResults = toolCalls.map(tc => {
          try {
            return { tool_use_id: tc.id, ...executeNovaTool(tc.name, tc.input) };
          } catch (err) {
            return { tool_use_id: tc.id, success: false, message: err.message };
          }
        });
        const actionMsg = { role: "assistant", text: textParts.join("\n") || "", actions: toolResults };
        setNovaChatMessages([...updated, actionMsg]);
      }
    } catch (err) {
      setNovaChatMessages([...updated, { role: "assistant", text: `⚠️ ${err.message}` }]);
    } finally {
      setNovaChatLoading(false);
    }
  };

  // ── Render ──
  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: C.bg1,
        borderLeft: `1px solid ${C.border}`,
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        animation: "slideIn 0.2s ease-out",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      }}
    >
      {/* ── NOVA Header — Orb + Title ── */}
      <div
        style={{
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: `linear-gradient(135deg, ${C.accent}06, ${C.purple || C.accent}04)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
          >
            <div style={{ transform: "scale(0.22)", transformOrigin: "center" }}>
              <NovaOrb />
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.5,
                color: C.text,
                fontFamily: T.font.display,
              }}
            >
              NOVA
            </div>
            <div style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>Powered by AI</div>
          </div>
        </div>
        <button
          onClick={() => setTkNovaPanelOpen(false)}
          style={{
            width: 24,
            height: 24,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            background: C.bg2,
            color: C.textDim,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke={C.textDim}
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* ═══ Unified Scrollable Content ═══ */}
      <div ref={novaChatScrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {/* ── Predictions Section (when active) ── */}
        {novaPreds.length > 0 && (
          <>
            <div
              style={{
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: C.bg,
              }}
            >
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${novaPredColor}15`,
                  color: novaPredColor,
                  border: `1px solid ${novaPredColor}25`,
                  fontFamily: T.font.mono,
                }}
              >
                {tkPredictions?.tag || "—"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                  {novaPending.length > 0 ? `${novaPending.length} found` : `${novaAccepted.length} accepted`}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>avg {novaAvgConf}% confidence</div>
              </div>
            </div>
            {novaPending.length > 0 && (
              <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                <button
                  onClick={novaAcceptAll}
                  style={bt(C, {
                    flex: 1,
                    background: C.green,
                    color: "#fff",
                    padding: "7px 0",
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  })}
                >
                  <Ic d={I.check} size={11} color="#fff" sw={2.5} /> Accept All ({novaPending.length})
                </button>
                <button
                  onClick={novaRejectAll}
                  style={bt(C, {
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textDim,
                    padding: "7px 0",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                  })}
                >
                  Reject All
                </button>
              </div>
            )}
            <div style={{ padding: "4px 0" }}>
              {novaPreds.map(pred => {
                const isAccepted = tkPredAccepted.includes(pred.id);
                const isRejected = tkPredRejected.includes(pred.id);
                const isPending = !isAccepted && !isRejected;
                const predConf = Math.round((pred.confidence || 0) * 100);
                const confColor = predConf >= 80 ? C.green : predConf >= 50 ? C.blue : C.orange;
                return (
                  <div
                    key={pred.id}
                    style={{
                      margin: "2px 8px",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: isAccepted ? `${C.green}08` : isRejected ? `${C.red}05` : C.bg,
                      border: `1px solid ${isAccepted ? C.green + "20" : isRejected ? C.red + "15" : C.border}`,
                      opacity: isRejected ? 0.5 : 1,
                      transition: T.transition.fast,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isAccepted ? C.green : isRejected ? C.red : novaPredColor,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: C.text,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pred.tag || pred.type || "Prediction"}
                      </span>
                      {isAccepted && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Added</span>}
                      {isRejected && <span style={{ fontSize: 8, fontWeight: 700, color: C.red }}>Dismissed</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isPending ? 8 : 0 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: C.bg3 }}>
                        <div
                          style={{
                            width: `${predConf}%`,
                            height: "100%",
                            borderRadius: 2,
                            background: confColor,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: confColor,
                          fontFamily: T.font.mono,
                          minWidth: 28,
                          textAlign: "right",
                        }}
                      >
                        {predConf}%
                      </span>
                    </div>
                    {isPending && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => novaAcceptOne(pred)}
                          style={bt(C, {
                            flex: 1,
                            padding: "4px 0",
                            fontSize: 10,
                            fontWeight: 600,
                            borderRadius: 5,
                            background: `${C.green}15`,
                            color: C.green,
                            border: `1px solid ${C.green}25`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          })}
                        >
                          <Ic d={I.check} size={9} color={C.green} sw={2.5} /> Accept
                        </button>
                        <button
                          onClick={() => {
                            rejectPrediction(pred.id);
                            recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, false);
                          }}
                          style={bt(C, {
                            flex: 1,
                            padding: "4px 0",
                            fontSize: 10,
                            fontWeight: 600,
                            borderRadius: 5,
                            background: "transparent",
                            color: C.textDim,
                            border: `1px solid ${C.border}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          })}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke={C.textDim}
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M2 2l6 6M8 2l-6 6" />
                          </svg>{" "}
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {drawings.filter(d => d.data && d.type === "pdf").length > 1 && (
              <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
                {crossSheetScan?.scanning ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "6px 0",
                      fontSize: 10,
                      color: C.blue,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        border: "2px solid #3B82F640",
                        borderTop: "2px solid #3B82F6",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />{" "}
                    Scanning other sheets...
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      setCrossSheetScan({ tag: tkPredictions.tag, results: [], scanning: true });
                      try {
                        const pdfDrawings = drawings.filter(
                          d => d.data && d.type === "pdf" && d.id !== selectedDrawingId,
                        );
                        const results = await scanAllSheets(
                          pdfDrawings,
                          tkPredictions.tag,
                          tkTool === "count" ? "count" : "linear",
                        );
                        setCrossSheetScan({ tag: tkPredictions.tag, results, scanning: false });
                        const total = results.reduce((s, r) => s + r.instanceCount, 0);
                        if (total > 0) showToast(`Found "${tkPredictions.tag}" on ${results.length} other sheet(s)`);
                        else showToast(`Not found on other sheets`);
                      } catch (err) {
                        setCrossSheetScan(null);
                      }
                    }}
                    style={bt(C, {
                      width: "100%",
                      padding: "8px 0",
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 6,
                      background: `${C.blue}10`,
                      color: C.blue,
                      border: `1px solid ${C.blue}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    })}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.blue}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M4 4h6v6H4z" />
                      <path d="M14 4h6v6h-6z" />
                      <path d="M4 14h6v6H4z" />
                      <path d="M14 14h6v6h-6z" />
                    </svg>{" "}
                    Scan All Pages
                  </button>
                )}
              </div>
            )}
            {tkPredRefining && (
              <div
                style={{
                  padding: "8px 16px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: `${C.orange}06`,
                  fontSize: 10,
                  color: C.orange,
                  fontWeight: 600,
                }}
              >
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>⟳</span>{" "}
                Refining...
              </div>
            )}
          </>
        )}

        {/* ── NOVA Features ── */}
        <div style={{ padding: 12 }}>
          {[
            {
              label: "NOVA Vision",
              desc:
                novaPreds.length > 0
                  ? `${novaPending.length} predictions pending`
                  : !tkActiveTakeoffId
                    ? "Select a takeoff to start"
                    : tkMeasureState === "idle"
                      ? "Start measuring — NOVA predicts matches"
                      : "Measure near a tag to generate predictions",
              icon: I.ai,
              action: null,
              color: C.accent,
              status: novaPreds.length > 0 ? "active" : "info",
            },
            {
              label: "Auto-Detect",
              desc: "Scan drawing for all measurable elements",
              icon: I.ai,
              loading: aiDrawingAnalysis?.loading,
              hasResults: aiDrawingAnalysis?.results?.length > 0,
              resultLabel: aiDrawingAnalysis?.results ? `${aiDrawingAnalysis.results.length} found` : null,
              action: () => runDrawingAnalysis(),
              color: C.accent,
            },
            {
              label: "Scan Schedules",
              desc: "Find schedules in PDFs",
              icon: I.insights,
              loading: pdfSchedules.loading,
              hasResults: pdfSchedules.results?.length > 0,
              resultLabel: pdfSchedules.results ? `${pdfSchedules.results.length} schedules` : null,
              action: () => runPdfScheduleScan(),
              color: "#10B981",
            },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              disabled={item.loading || !item.action}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: item.status === "active" ? `${item.color}06` : C.bg,
                border: `1px solid ${item.status === "active" ? item.color + "25" : C.border}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: item.action ? (item.loading ? "wait" : "pointer") : "default",
                textAlign: "left",
                transition: "all 0.15s",
                marginBottom: 6,
                opacity: item.action ? 1 : 0.8,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${item.color}12`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {item.loading ? (
                  <span
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      border: `2px solid ${item.color}30`,
                      borderTop: `2px solid ${item.color}`,
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <Ic d={item.icon} size={14} color={item.color} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{item.desc}</div>
              </div>
              {item.hasResults && item.resultLabel && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: item.color,
                    background: `${item.color}15`,
                    padding: "2px 6px",
                    borderRadius: 10,
                    flexShrink: 0,
                  }}
                >
                  {item.resultLabel}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Chat Section ── */}
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}` }}>
          {novaChatMessages.length === 0 && !novaChatLoading && (
            <div style={{ padding: "12px 0 4px" }}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>Chat with NOVA</div>
                <div style={{ fontSize: 9, color: C.textDim }}>Ask about scope, pricing, or specs</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {QUICK_ACTIONS.slice(0, 3).map((qa, i) => (
                  <button
                    key={i}
                    onClick={() => handleNovaChat(qa.label)}
                    style={{
                      background: `${C.accent}06`,
                      border: `1px solid ${C.accent}15`,
                      borderRadius: 6,
                      padding: "7px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 10,
                      color: C.text,
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: 11 }}>{qa.icon}</span> {qa.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {novaChatMessages.map((msg, i) => (
            <div key={i} style={{ paddingTop: i === 0 ? 8 : 0 }}>
              <MessageBubble msg={msg} C={C} />
              {msg.actions && <ActionCards actions={msg.actions} C={C} />}
            </div>
          ))}
          {novaChatLoading && (
            <div style={{ display: "flex", gap: 4, padding: "8px 0", alignItems: "center" }}>
              {[0, 1, 2].map(n => (
                <div
                  key={n}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    background: C.accent,
                    opacity: 0.4,
                    animation: `novaPulse 1.2s ${n * 0.2}s infinite`,
                  }}
                />
              ))}
              <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 4 }}>Thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat Input (pinned at bottom) ── */}
      <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "flex-end",
            background: C.bg,
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            padding: "6px 10px",
          }}
        >
          <textarea
            ref={novaChatInputRef}
            value={novaChatInput}
            onChange={e => setNovaChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleNovaChat();
              }
            }}
            placeholder="Ask NOVA..."
            rows={1}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: C.text,
              fontSize: 12,
              fontFamily: "inherit",
              lineHeight: 1.4,
              maxHeight: 80,
              padding: 0,
            }}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
            }}
          />
          <button
            onClick={() => handleNovaChat()}
            disabled={!novaChatInput.trim() || novaChatLoading}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "none",
              background: novaChatInput.trim() && !novaChatLoading ? C.accent : `${C.text}10`,
              color: novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim,
              cursor: novaChatInput.trim() && !novaChatLoading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Ic d={I.send} size={12} color={novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim} />
          </button>
        </div>
      </div>
    </div>
  );
}
