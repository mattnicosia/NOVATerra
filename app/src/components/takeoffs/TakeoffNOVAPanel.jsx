// TakeoffNOVAPanel — NOVA tab with approval queue for estimate presets.
// Chat-first layout, 2×2/2×3 preset grid, proposal cards with accept/reject.
import { useState, useRef, useEffect, useMemo } from "react";
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
import { MessageBubble, ActionCards } from "@/components/ai/AIChatPanel";
import { NOVA_TOOLS, executeNovaTool, previewNovaTool } from "@/utils/novaTools";
import { callAnthropic, buildProjectContext } from "@/utils/ai";
import { scanAllSheets, recordPredictionFeedback } from "@/utils/predictiveEngine";
import { nn, formatCurrency } from "@/utils/format";

// ── Tiny helper: uid for proposals ──
let _puid = 0;
const puid = () => `np_${++_puid}_${Date.now()}`;

export default function TakeoffNOVAPanel({
  aiDrawingAnalysis,
  pdfSchedules,
  runDrawingAnalysis,
  runPdfScheduleScan,
  crossSheetScan,
  setCrossSheetScan,
  context = "takeoff",
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
  const tkTool = useTakeoffsStore(s => s.tkTool);
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
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // ── Proposal queue state ──
  // Each proposal: { id, toolName, toolInput, previews[], status: "pending"|"accepted"|"rejected", acceptedIds: Set, rejectedIds: Set }
  const [proposals, setProposals] = useState([]);

  const pendingProposals = useMemo(() => proposals.filter(p => p.status === "pending"), [proposals]);

  // ── Derived (takeoff predictions) ──
  const novaPreds = tkPredictions?.predictions || [];
  const novaPending = novaPreds.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id));
  const novaAccepted = novaPreds.filter(p => tkPredAccepted.includes(p.id));
  const novaActiveTo = takeoffs.find(t => t.id === tkActiveTakeoffId);
  const novaPredColor = novaActiveTo?.color || C.accent;
  const novaAvgConf =
    novaPreds.length > 0
      ? Math.round((novaPreds.reduce((s, p) => s + (p.confidence || 0), 0) / novaPreds.length) * 100)
      : 0;

  // Auto-scroll on new messages / proposals
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [novaChatMessages, novaChatLoading, proposals]);

  // ── Prediction handlers (takeoff context) ──
  const novaAcceptOne = pred => {
    acceptPrediction(pred.id);
    recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true);
    if (tkActiveTakeoffId) {
      const color = novaActiveTo?.color || "#5b8def";
      if (pred.type === "count" || pred.type === "wall-tag") {
        addMeasurement(tkActiveTakeoffId, {
          type: "count",
          points: [pred.point],
          value: 1,
          sheetId: selectedDrawingId,
          color,
          predicted: true,
          tag: tkPredictions.tag,
        });
      } else if (pred.type === "wall" && pred.points?.length >= 2) {
        addMeasurement(tkActiveTakeoffId, {
          type: "linear",
          points: pred.points,
          value: 0,
          sheetId: selectedDrawingId,
          color,
          predicted: true,
          tag: tkPredictions.tag,
        });
      } else if (pred.type === "area" && pred.points?.length >= 3) {
        addMeasurement(tkActiveTakeoffId, {
          type: "area",
          points: pred.points,
          value: 0,
          sheetId: selectedDrawingId,
          color,
          predicted: true,
          tag: pred.tag || tkPredictions.tag,
        });
      }
    }
  };

  const novaAcceptAll = () => {
    const toAdd = novaPreds.filter(p => !tkPredRejected.includes(p.id) && !tkPredAccepted.includes(p.id));
    if (tkActiveTakeoffId && toAdd.length > 0) {
      const color = novaActiveTo?.color || "#5b8def";
      toAdd.forEach(() => recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true));
      toAdd.forEach(pred => {
        if (pred.type === "count" || pred.type === "wall-tag")
          addMeasurement(tkActiveTakeoffId, {
            type: "count",
            points: [pred.point],
            value: 1,
            sheetId: selectedDrawingId,
            color,
            predicted: true,
            tag: tkPredictions.tag,
          });
        else if (pred.type === "wall" && pred.points?.length >= 2)
          addMeasurement(tkActiveTakeoffId, {
            type: "linear",
            points: pred.points,
            value: 0,
            sheetId: selectedDrawingId,
            color,
            predicted: true,
            tag: tkPredictions.tag,
          });
        else if (pred.type === "area" && pred.points?.length >= 3)
          addMeasurement(tkActiveTakeoffId, {
            type: "area",
            points: pred.points,
            value: 0,
            sheetId: selectedDrawingId,
            color,
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

  // ── Proposal handlers ──
  const acceptProposalItem = (proposalId, previewIdx) => {
    setProposals(prev =>
      prev.map(p => {
        if (p.id !== proposalId) return p;
        const accepted = new Set(p.acceptedIds);
        accepted.add(previewIdx);
        // Execute this single item
        const preview = p.previews[previewIdx];
        if (preview) _executeOneProposal(p.toolName, preview);
        // Check if all items handled
        const rejected = p.rejectedIds;
        const allHandled = p.previews.every((_, i) => accepted.has(i) || rejected.has(i));
        return { ...p, acceptedIds: accepted, status: allHandled ? "resolved" : "pending" };
      }),
    );
  };

  const rejectProposalItem = (proposalId, previewIdx) => {
    setProposals(prev =>
      prev.map(p => {
        if (p.id !== proposalId) return p;
        const rejected = new Set(p.rejectedIds);
        rejected.add(previewIdx);
        const accepted = p.acceptedIds;
        const allHandled = p.previews.every((_, i) => accepted.has(i) || rejected.has(i));
        return { ...p, rejectedIds: rejected, status: allHandled ? "resolved" : "pending" };
      }),
    );
  };

  const acceptAllInProposal = proposalId => {
    setProposals(prev =>
      prev.map(p => {
        if (p.id !== proposalId) return p;
        // Execute all unhandled items
        p.previews.forEach((preview, i) => {
          if (!p.acceptedIds.has(i) && !p.rejectedIds.has(i)) {
            _executeOneProposal(p.toolName, preview);
          }
        });
        return { ...p, acceptedIds: new Set(p.previews.map((_, i) => i)), status: "resolved" };
      }),
    );
    showToast("All proposals accepted");
  };

  const rejectAllInProposal = proposalId => {
    setProposals(prev =>
      prev.map(p => {
        if (p.id !== proposalId) return p;
        return { ...p, rejectedIds: new Set(p.previews.map((_, i) => i)), status: "resolved" };
      }),
    );
  };

  const _dismissResolvedProposals = () => {
    setProposals(prev => prev.filter(p => p.status === "pending"));
  };

  // Execute a single proposal preview item
  const _executeOneProposal = (toolName, preview) => {
    const store = useItemsStore.getState();
    if (toolName === "add_line_items") {
      const ni = preview._raw;
      const projectStore = useProjectStore.getState();
      const division = ni.division || projectStore.divFromCode(ni.code) || "";
      store.addElement(
        division,
        {
          code: ni.code || "",
          name: ni.description,
          unit: ni.unit || "EA",
          material: nn(ni.material) || 0,
          labor: nn(ni.labor) || 0,
          equipment: nn(ni.equipment) || 0,
          subcontractor: nn(ni.subcontractor) || 0,
          quantity: nn(ni.quantity) || 1,
          trade: ni.trade || "",
          notes: ni.notes || "",
          specSection: ni.specSection || "",
          source: { category: "nova", label: "NOVA" },
          novaProposed: true,
        },
        ni.bidContext || "base",
      );
    } else if (toolName === "update_line_items") {
      const upd = preview._raw;
      const changes = {};
      Object.entries(preview.changes || {}).forEach(([field, { after }]) => {
        changes[field] = after;
      });
      changes.novaProposed = true;
      changes.source = { category: "nova", label: "NOVA" };
      store.batchUpdateItem(upd.item_id, changes);
    } else if (toolName === "remove_line_items") {
      store.removeItem(preview.itemId);
    }
  };

  // ── NOVA Chat handler ──
  const isEstimate = context === "estimate";

  // Parse tool calls and text from API response content blocks
  const _parseResponse = content => {
    const textParts = [];
    const toolCalls = [];
    for (const b of content) {
      if (b.type === "text") textParts.push(b.text);
      else if (b.type === "tool_use") toolCalls.push(b);
    }
    return { textParts, toolCalls };
  };

  // Collect proposals from tool calls, return { newProposals, totalItems }
  const _collectProposals = toolCalls => {
    const newProposals = [];
    for (const tc of toolCalls) {
      const previews = previewNovaTool(tc.name, tc.input);
      if (previews.length > 0) {
        newProposals.push({
          id: puid(),
          toolName: tc.name,
          toolInput: tc.input,
          previews,
          status: "pending",
          acceptedIds: new Set(),
          rejectedIds: new Set(),
        });
      }
    }
    const totalItems = newProposals.reduce((s, p) => s + p.previews.length, 0);
    return { newProposals, totalItems };
  };

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
      const CHAT_SYS = `You are NOVA, an expert construction estimating AI. Be concise and direct. Reference CSI codes when relevant. You have tools to modify the estimate. IMPORTANT: When modifying many items, work in batches of up to 25 items per tool call. If there are more items to process, make multiple tool calls or tell the user you will continue in the next message.`;

      // ── Multi-pass loop: auto-continue when response is truncated ──
      let allTextParts = [];
      let allToolCalls = [];
      let conversationMsgs = [...apiMsgs];
      const MAX_PASSES = 5; // safety cap

      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const resp = await callAnthropic({
          system: CHAT_SYS,
          max_tokens: 4096,
          messages: conversationMsgs,
          tools: NOVA_TOOLS,
        });

        if (typeof resp === "string") {
          allTextParts.push(resp);
          break; // plain text response — done
        }

        if (!resp?.content) break;

        const { textParts, toolCalls } = _parseResponse(resp.content);
        allTextParts.push(...textParts);
        allToolCalls.push(...toolCalls);

        // If response was NOT truncated, we're done
        if (resp.stop_reason !== "max_tokens") break;

        // Response was truncated — auto-continue
        // Build continuation: append assistant's partial response + user's "continue" prompt
        // Reconstruct assistant content as a text block for the conversation
        const partialText = textParts.join("\n");
        const toolSummary = toolCalls.length > 0 ? `\n[Applied ${toolCalls.length} tool call(s) so far]` : "";
        conversationMsgs = [
          ...conversationMsgs,
          { role: "assistant", content: partialText + toolSummary || "Processing..." },
          {
            role: "user",
            content: "Continue where you left off. Process the remaining items that haven't been handled yet.",
          },
        ];
      }

      // ── Process collected results ──
      if (allToolCalls.length === 0 && allTextParts.length > 0) {
        // Text-only response
        setNovaChatMessages([...updated, { role: "assistant", text: allTextParts.join("\n") }]);
      } else if (allToolCalls.length > 0) {
        if (isEstimate) {
          // Estimate context → queue proposals for approval
          const { newProposals, totalItems } = _collectProposals(allToolCalls);
          if (newProposals.length > 0) {
            setProposals(prev => [...prev, ...newProposals]);
            const assistantText =
              allTextParts.join("\n") ||
              `I have ${totalItems} proposed change${totalItems !== 1 ? "s" : ""} ready for your review.`;
            setNovaChatMessages([...updated, { role: "assistant", text: assistantText }]);
          } else {
            setNovaChatMessages([
              ...updated,
              { role: "assistant", text: allTextParts.join("\n") || "No changes to propose." },
            ]);
          }
        } else {
          // Takeoff context → execute immediately
          const toolResults = allToolCalls.map(tc => {
            try {
              return { tool_use_id: tc.id, ...executeNovaTool(tc.name, tc.input) };
            } catch (err) {
              return { tool_use_id: tc.id, success: false, message: err.message };
            }
          });
          setNovaChatMessages([
            ...updated,
            { role: "assistant", text: allTextParts.join("\n") || "", actions: toolResults },
          ]);
        }
      } else {
        setNovaChatMessages([...updated, { role: "assistant", text: "No response from NOVA." }]);
      }
    } catch (err) {
      setNovaChatMessages([...updated, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setNovaChatLoading(false);
    }
  };

  // ── Preset grid config ──
  const takeoffPresets = [
    {
      key: "detect",
      label: "Detect Elements",
      icon: I.eye,
      color: C.accent,
      loading: aiDrawingAnalysis?.loading,
      badge: aiDrawingAnalysis?.results?.length > 0 ? `${aiDrawingAnalysis.results.length}` : null,
      action: () => runDrawingAnalysis?.(),
    },
    {
      key: "schedules",
      label: "Find Schedules",
      icon: I.schedule,
      color: "#10B981",
      loading: pdfSchedules?.loading,
      badge: pdfSchedules?.results?.length > 0 ? `${pdfSchedules.results.length}` : null,
      action: () => runPdfScheduleScan?.(),
    },
    {
      key: "scanAll",
      label: "Scan All Pages",
      icon: I.plans,
      color: "#3B82F6",
      loading: crossSheetScan?.scanning,
      badge: crossSheetScan?.results?.length > 0 ? `${crossSheetScan.results.length}` : null,
      action: () => {
        if (!tkPredictions?.tag) {
          showToast("Run a detection first");
          return;
        }
        setCrossSheetScan?.({ tag: tkPredictions.tag, results: [], scanning: true });
        const pdfDrawings = drawings.filter(d => d.data && d.type === "pdf" && d.id !== selectedDrawingId);
        scanAllSheets(pdfDrawings, tkPredictions.tag, tkTool === "count" ? "count" : "linear")
          .then(results => {
            setCrossSheetScan?.({ tag: tkPredictions.tag, results, scanning: false });
            const total = results.reduce((s, r) => s + r.instanceCount, 0);
            showToast(total > 0 ? `Found on ${results.length} sheet(s)` : "Not found on other sheets");
          })
          .catch(() => setCrossSheetScan?.(null));
      },
    },
    {
      key: "categorize",
      label: "Categorize Items",
      icon: I.hash,
      color: "#F59E0B",
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Review estimate items and categorize unallocated scope items into appropriate CSI divisions. Process up to 25 items per tool call. Use the update_line_items tool to assign codes and divisions. Flag items that need attention.",
        ),
    },
  ];

  const estimatePresets = [
    {
      key: "suggest",
      label: "Suggest Items",
      icon: I.plusCircle,
      color: C.accent,
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Based on the project type, scanned documents, extracted schedules, and existing estimate items, suggest line items that are likely missing. For each suggestion include a description, CSI code, suggested quantity, and unit. Focus on items that typically accompany what's already in the estimate. Use the add_line_items tool to propose them. Limit to 20 suggestions per tool call.",
        ),
    },
    {
      key: "specs",
      label: "Assign Specs",
      icon: I.file,
      color: "#10B981",
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Review estimate items and match them to extracted specification sections. Process up to 25 items per tool call. For each item, assign the most relevant spec section using the update_line_items tool. Note any spec requirements that affect pricing or scope.",
        ),
    },
    {
      key: "price",
      label: "Price Items",
      icon: I.dollar,
      color: "#3B82F6",
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Review estimate items that have $0 or missing pricing. Process up to 25 items per tool call. For each unpriced item, suggest material, labor, equipment, and/or subcontractor unit costs based on the item description, quantity, unit, and project context. Use the update_line_items tool to propose prices. Reference your source for each price.",
        ),
    },
    {
      key: "categorize",
      label: "Categorize Items",
      icon: I.hash,
      color: "#F59E0B",
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Review estimate items and categorize unallocated scope items into appropriate CSI divisions. Process up to 25 items per tool call — you can make multiple calls. Use the update_line_items tool to assign proper codes and divisions. Flag items that need attention.",
        ),
    },
    {
      key: "hideZero",
      label: "Hide $0 Items",
      icon: I.eyeOff,
      color: C.textDim,
      loading: false,
      badge: null,
      isToggle: true,
      action: () => {
        const uiStore = useUiStore.getState();
        const current = uiStore.estSearch || "";
        if (current === "__hide_zero__") {
          uiStore.setEstSearch("");
          showToast("Showing all items");
        } else {
          uiStore.setEstSearch("__hide_zero__");
          showToast("Hiding $0 items");
        }
      },
    },
    {
      key: "organize",
      label: "Organize",
      icon: I.layers,
      color: C.accent,
      loading: false,
      badge: null,
      action: () =>
        handleNovaChat(
          "Review and organize the estimate: clean up descriptions to be consistent and professional, ensure CSI codes are correct and complete. Process up to 25 items per tool call. Use the update_line_items tool to apply changes.",
        ),
    },
  ];

  const presets = isEstimate ? estimatePresets : takeoffPresets;

  // ── Render ──
  return (
    <div
      style={{
        width: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: C.bg1,
        overflow: "hidden",
      }}
    >
      {/* ── Minimal Header ── */}
      <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: 0.3, fontFamily: T.font.sans }}>
            NOVA
          </span>
          {pendingProposals.length > 0 && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 800,
                color: "#fff",
                background: C.accent,
                borderRadius: 6,
                padding: "1px 6px",
                lineHeight: 1.4,
              }}
            >
              {pendingProposals.reduce((s, p) => s + p.previews.length - p.acceptedIds.size - p.rejectedIds.size, 0)}{" "}
              pending
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, fontWeight: 500, marginTop: 2, fontFamily: T.font.sans }}>
          {isEstimate ? "Review proposals before they're applied" : "Ask anything about this estimate"}
        </div>
      </div>

      {/* ═══ Scrollable Content ═══ */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* ── Takeoff Predictions (inline, when active) ── */}
        {novaPreds.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: `${novaPredColor}04`,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: novaPredColor, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: T.font.sans, flex: 1 }}>
                {tkPredictions?.tag || "Predictions"}
              </span>
              <span style={{ fontSize: 9, color: C.textDim, fontFamily: T.font.sans }}>
                {novaPending.length > 0 ? `${novaPending.length} pending` : `${novaAccepted.length} accepted`}
                {" \u00b7 "}
                {novaAvgConf}% avg
              </span>
            </div>
            {novaPending.length > 0 && (
              <div style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6 }}>
                <button
                  onClick={novaAcceptAll}
                  style={bt(C, {
                    flex: 1,
                    background: C.green,
                    color: "#fff",
                    padding: "6px 0",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  })}
                >
                  <Ic d={I.check} size={10} color="#fff" sw={2.5} /> Accept All ({novaPending.length})
                </button>
                <button
                  onClick={novaRejectAll}
                  style={bt(C, {
                    flex: 1,
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textDim,
                    padding: "6px 0",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 5,
                  })}
                >
                  Dismiss All
                </button>
              </div>
            )}
            <div style={{ padding: "4px 6px" }}>
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
                      margin: "2px 0",
                      padding: "6px 10px",
                      borderRadius: 6,
                      background: isAccepted ? `${C.green}06` : isRejected ? `${C.red}04` : C.bg,
                      border: `1px solid ${isAccepted ? C.green + "18" : isRejected ? C.red + "12" : C.border}`,
                      opacity: isRejected ? 0.45 : 1,
                      transition: T.transition.fast,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: isPending ? 5 : 0 }}>
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isAccepted ? C.green : isRejected ? C.red : novaPredColor,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: C.text,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontFamily: T.font.sans,
                        }}
                      >
                        {pred.tag || pred.type || "Prediction"}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: confColor, fontFamily: T.font.sans }}>
                        {predConf}%
                      </span>
                      {isAccepted && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Added</span>}
                      {isRejected && <span style={{ fontSize: 8, fontWeight: 700, color: C.red }}>Dismissed</span>}
                    </div>
                    {isPending && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => novaAcceptOne(pred)}
                          style={bt(C, {
                            flex: 1,
                            padding: "3px 0",
                            fontSize: 9,
                            fontWeight: 600,
                            borderRadius: 4,
                            background: `${C.green}12`,
                            color: C.green,
                            border: `1px solid ${C.green}20`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 3,
                          })}
                        >
                          <Ic d={I.check} size={8} color={C.green} sw={2.5} /> Accept
                        </button>
                        <button
                          onClick={() => {
                            rejectPrediction(pred.id);
                            recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, false);
                          }}
                          style={bt(C, {
                            flex: 1,
                            padding: "3px 0",
                            fontSize: 9,
                            fontWeight: 600,
                            borderRadius: 4,
                            background: "transparent",
                            color: C.textDim,
                            border: `1px solid ${C.border}`,
                          })}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {tkPredRefining && (
              <div
                style={{
                  padding: "6px 14px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: `${C.orange}04`,
                  fontSize: 9,
                  color: C.orange,
                  fontWeight: 600,
                }}
              >
                <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 11 }}>
                  &#x27F3;
                </span>
                Refining predictions...
              </div>
            )}
          </div>
        )}

        {/* ── Chat Messages ── */}
        <div style={{ flex: 1, padding: "0 10px" }}>
          {novaChatMessages.length === 0 && !novaChatLoading && novaPreds.length === 0 && proposals.length === 0 && (
            <div style={{ padding: "20px 4px 8px", textAlign: "center" }}>
              <div
                style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans, fontWeight: 500, lineHeight: 1.5 }}
              >
                Ask about scope, pricing, specs, or use a preset below
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
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    background: C.accent,
                    opacity: 0.4,
                    animation: `novaPulse 1.2s ${n * 0.2}s infinite`,
                  }}
                />
              ))}
              <span style={{ fontSize: 9, color: C.textMuted, marginLeft: 3, fontFamily: T.font.sans }}>
                Thinking...
              </span>
            </div>
          )}
        </div>

        {/* ═══ Proposal Cards (estimate context) ═══ */}
        {proposals.length > 0 && (
          <div style={{ padding: "6px 8px 2px", flexShrink: 0 }}>
            {proposals.map(proposal => {
              const remaining = proposal.previews.filter(
                (_, i) => !proposal.acceptedIds.has(i) && !proposal.rejectedIds.has(i),
              ).length;
              const isResolved = proposal.status === "resolved";
              const typeLabel =
                proposal.toolName === "add_line_items"
                  ? "Add Items"
                  : proposal.toolName === "update_line_items"
                    ? "Update Items"
                    : proposal.toolName === "remove_line_items"
                      ? "Remove Items"
                      : "Changes";
              const typeColor =
                proposal.toolName === "add_line_items"
                  ? C.green || "#10B981"
                  : proposal.toolName === "update_line_items"
                    ? C.blue || "#3B82F6"
                    : proposal.toolName === "remove_line_items"
                      ? C.red || "#EF4444"
                      : C.accent;

              return (
                <div
                  key={proposal.id}
                  style={{
                    marginBottom: 6,
                    border: `1px solid ${isResolved ? C.border : typeColor + "30"}`,
                    borderRadius: 8,
                    background: isResolved ? C.bg : `${typeColor}04`,
                    overflow: "hidden",
                    opacity: isResolved ? 0.6 : 1,
                    transition: "opacity 0.3s",
                  }}
                >
                  {/* Proposal header */}
                  <div
                    style={{
                      padding: "7px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      borderBottom: `1px solid ${C.border}`,
                      background: `${typeColor}08`,
                    }}
                  >
                    <Ic
                      d={
                        proposal.toolName === "add_line_items"
                          ? I.plusCircle
                          : proposal.toolName === "update_line_items"
                            ? I.edit
                            : I.trash
                      }
                      size={11}
                      color={typeColor}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: T.font.sans, flex: 1 }}>
                      {typeLabel}
                    </span>
                    <span style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.sans }}>
                      {isResolved
                        ? `${proposal.acceptedIds.size} accepted, ${proposal.rejectedIds.size} dismissed`
                        : `${remaining} of ${proposal.previews.length} pending`}
                    </span>
                  </div>

                  {/* Bulk actions (if not resolved) */}
                  {!isResolved && remaining > 1 && (
                    <div
                      style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 5 }}
                    >
                      <button
                        onClick={() => acceptAllInProposal(proposal.id)}
                        style={bt(C, {
                          flex: 1,
                          padding: "4px 0",
                          fontSize: 9,
                          fontWeight: 700,
                          borderRadius: 4,
                          background: C.green,
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                        })}
                      >
                        <Ic d={I.check} size={8} color="#fff" sw={2.5} /> Accept All ({remaining})
                      </button>
                      <button
                        onClick={() => rejectAllInProposal(proposal.id)}
                        style={bt(C, {
                          flex: 1,
                          padding: "4px 0",
                          fontSize: 9,
                          fontWeight: 600,
                          borderRadius: 4,
                          background: "transparent",
                          color: C.textDim,
                          border: `1px solid ${C.border}`,
                        })}
                      >
                        Dismiss All
                      </button>
                    </div>
                  )}

                  {/* Individual proposal items */}
                  <div style={{ padding: "2px 4px" }}>
                    {proposal.previews.map((preview, idx) => {
                      const isAccepted = proposal.acceptedIds.has(idx);
                      const isRejected = proposal.rejectedIds.has(idx);
                      const isPending = !isAccepted && !isRejected;

                      return (
                        <div
                          key={idx}
                          style={{
                            margin: "2px 0",
                            padding: "6px 8px",
                            borderRadius: 6,
                            background: isAccepted ? `${C.green}06` : isRejected ? `${C.red}04` : C.bg,
                            border: `1px solid ${isAccepted ? C.green + "18" : isRejected ? C.red + "12" : C.border}`,
                            opacity: isRejected ? 0.4 : 1,
                            transition: "all 0.15s",
                          }}
                        >
                          {/* Preview content */}
                          {preview.type === "add" && <ProposalAddCard preview={preview} C={C} T={T} />}
                          {preview.type === "update" && <ProposalUpdateCard preview={preview} C={C} T={T} />}
                          {preview.type === "remove" && <ProposalRemoveCard preview={preview} C={C} T={T} />}

                          {/* Status badge for handled items */}
                          {isAccepted && (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 8,
                                fontWeight: 700,
                                color: C.green,
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <Ic d={I.check} size={8} color={C.green} sw={2.5} /> Applied
                            </div>
                          )}
                          {isRejected && (
                            <div style={{ marginTop: 4, fontSize: 8, fontWeight: 700, color: C.textDim }}>
                              Dismissed
                            </div>
                          )}

                          {/* Accept/Reject buttons for pending items */}
                          {isPending && (
                            <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                              <button
                                onClick={() => acceptProposalItem(proposal.id, idx)}
                                style={bt(C, {
                                  flex: 1,
                                  padding: "3px 0",
                                  fontSize: 9,
                                  fontWeight: 600,
                                  borderRadius: 4,
                                  background: `${C.green}12`,
                                  color: C.green,
                                  border: `1px solid ${C.green}20`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 3,
                                })}
                              >
                                <Ic d={I.check} size={8} color={C.green} sw={2.5} /> Accept
                              </button>
                              <button
                                onClick={() => rejectProposalItem(proposal.id, idx)}
                                style={bt(C, {
                                  flex: 1,
                                  padding: "3px 0",
                                  fontSize: 9,
                                  fontWeight: 600,
                                  borderRadius: 4,
                                  background: "transparent",
                                  color: C.textDim,
                                  border: `1px solid ${C.border}`,
                                })}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Clear resolved proposals */}
                  {isResolved && (
                    <div
                      onClick={() => setProposals(prev => prev.filter(p => p.id !== proposal.id))}
                      style={{
                        padding: "4px 10px",
                        textAlign: "center",
                        fontSize: 8,
                        color: C.textDim,
                        cursor: "pointer",
                        borderTop: `1px solid ${C.border}`,
                      }}
                    >
                      Clear
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Bottom Section (pinned) ═══ */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
        {/* Preset Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, padding: "8px 10px 6px" }}>
          {presets.map(p => (
            <button
              key={p.key}
              onClick={p.action}
              disabled={p.loading}
              style={{
                padding: "7px 6px",
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                cursor: p.loading ? "wait" : "pointer",
                textAlign: "center",
                transition: "all 0.15s",
                position: "relative",
              }}
              onMouseEnter={e => {
                if (!p.loading) e.currentTarget.style.borderColor = p.color + "40";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = C.border;
              }}
            >
              {p.loading ? (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    margin: "0 auto 4px",
                    border: `2px solid ${p.color}25`,
                    borderTop: `2px solid ${p.color}`,
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 3 }}>
                  <Ic d={p.icon} size={13} color={p.color} />
                </div>
              )}
              <div style={{ fontSize: 9, fontWeight: 600, color: C.text, fontFamily: T.font.sans, lineHeight: 1.2 }}>
                {p.label}
              </div>
              {p.badge && (
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    fontSize: 7,
                    fontWeight: 800,
                    color: "#fff",
                    background: p.color,
                    borderRadius: 6,
                    padding: "1px 4px",
                    lineHeight: 1.3,
                  }}
                >
                  {p.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Chat Input */}
        <div style={{ padding: "4px 10px 10px" }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "flex-end",
              background: C.bg,
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              padding: "5px 8px",
            }}
          >
            <textarea
              ref={inputRef}
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
                fontSize: 11,
                fontFamily: T.font.sans,
                lineHeight: 1.4,
                maxHeight: 72,
                padding: 0,
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 72) + "px";
              }}
            />
            <button
              onClick={() => handleNovaChat()}
              disabled={!novaChatInput.trim() || novaChatLoading}
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                border: "none",
                background: novaChatInput.trim() && !novaChatLoading ? C.accent : `${C.text}10`,
                color: novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim,
                cursor: novaChatInput.trim() && !novaChatLoading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              <Ic d={I.send} size={11} color={novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Proposal Card Sub-Components
// ═══════════════════════════════════════════════════════════

function ProposalAddCard({ preview, C, T }) {
  const totalUnit = nn(preview.material) + nn(preview.labor) + nn(preview.equipment) + nn(preview.subcontractor);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
        {preview.code && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color: C.accent,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
            }}
          >
            {preview.code}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.text,
            fontFamily: T.font.sans,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {preview.description}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          fontSize: 8,
          color: C.textDim,
          fontFamily: T.font.sans,
          fontFeatureSettings: "'tnum'",
        }}
      >
        <span>
          {preview.quantity} {preview.unit}
        </span>
        {preview.division && <span style={{ color: C.textMuted }}>{preview.division}</span>}
        {totalUnit > 0 && <span style={{ color: C.green, fontWeight: 600 }}>{formatCurrency(totalUnit)}/unit</span>}
      </div>
      {/* Cost breakdown if any */}
      {totalUnit > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 7, color: C.textDim }}>
          {nn(preview.material) > 0 && <span>M: {formatCurrency(preview.material)}</span>}
          {nn(preview.labor) > 0 && <span>L: {formatCurrency(preview.labor)}</span>}
          {nn(preview.equipment) > 0 && <span>E: {formatCurrency(preview.equipment)}</span>}
          {nn(preview.subcontractor) > 0 && <span>S: {formatCurrency(preview.subcontractor)}</span>}
        </div>
      )}
    </div>
  );
}

function ProposalUpdateCard({ preview, C, T }) {
  const changeEntries = Object.entries(preview.changes || {});
  const costFields = ["material", "labor", "equipment", "subcontractor"];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
        {preview.code && (
          <span style={{ fontSize: 8, fontWeight: 700, color: C.blue || "#3B82F6", fontFamily: T.font.sans }}>
            {preview.code}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.text,
            fontFamily: T.font.sans,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {preview.description}
        </span>
      </div>
      {changeEntries.map(([field, { before, after }]) => {
        const isCost = costFields.includes(field) || field === "quantity";
        const fieldLabels = {
          material: "Material",
          labor: "Labor",
          equipment: "Equip",
          subcontractor: "Sub",
          quantity: "Qty",
          unit: "Unit",
          code: "Code",
          description: "Desc",
          division: "Division",
          trade: "Trade",
          specSection: "Spec",
          notes: "Notes",
        };
        return (
          <div
            key={field}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
              fontSize: 8,
              fontFamily: T.font.sans,
            }}
          >
            <span style={{ color: C.textDim, width: 46, flexShrink: 0, fontWeight: 600 }}>
              {fieldLabels[field] || field}
            </span>
            <span
              style={{
                color: C.red + "cc",
                textDecoration: "line-through",
                fontFeatureSettings: isCost ? "'tnum'" : undefined,
              }}
            >
              {isCost && field !== "quantity" ? formatCurrency(before) : before || "\u2014"}
            </span>
            <Ic d={I.chevron} size={7} color={C.textDim} />
            <span style={{ color: C.green, fontWeight: 600, fontFeatureSettings: isCost ? "'tnum'" : undefined }}>
              {isCost && field !== "quantity" ? formatCurrency(after) : after || "\u2014"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ProposalRemoveCard({ preview, C, T }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Ic d={I.trash} size={10} color={C.red || "#EF4444"} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.text,
          fontFamily: T.font.sans,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {preview.description || preview.itemId}
      </span>
      {preview.code && <span style={{ fontSize: 8, color: C.textDim, fontFamily: T.font.sans }}>{preview.code}</span>}
    </div>
  );
}
