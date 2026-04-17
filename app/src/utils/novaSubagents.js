// novaSubagents — Specialist sub-agents for NOVA Chat.
//
// Each specialist is a focused Claude call with:
//   - a domain-specific system prompt
//   - its own model + thinking budget
//   - a tailored context builder (only what it needs, not the full estimate)
//   - an ALLOWLISTED set of tools it can call in its own agentic loop
//   - optional cached document attachments (drawings for NOVA-Plans)
//
// Tool allowlist prevents recursion: no specialist can call consult_specialist
// so we can't fan out infinitely. Each specialist's loop is capped at 3
// iterations so a misbehaving prompt can't burn unlimited tokens.
//
// The main NOVA agent dispatches via the `consult_specialist` tool. Multiple
// specialists can be invoked in parallel (Promise.all in the tool executor)
// which gives real multi-agent fan-out: NOVA-Cost + NOVA-Scope + NOVA-Plans
// all thinking at the same time, each running its own tool loop, results
// synthesized by the main agent.

import { callAnthropic, buildProjectContext, buildCachedSystem, INTERPRET_MODEL } from "@/utils/ai-core";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

// Per-specialist tool allowlist. Names must exist in NOVA_TOOLS (novaTools.js).
// consult_specialist is deliberately NOT on any allowlist — prevents recursion.
const SPECIALIST_TOOLS = {
  cost: ["search_cost_database", "search_my_history", "calculate_totals"],
  scope: ["search_my_history", "search_proposals", "calculate_totals"],
  plans: [], // vision-only — no tool calls, just reads attached PDFs
};

const MAX_SUBAGENT_ITERS = 3;

// ── Specialist registry ──────────────────────────────────────────

export const SPECIALISTS = {
  cost: {
    label: "NOVA-Cost",
    blurb: "Unit pricing + $/SF benchmarks + historical proposal data",
    systemPrompt: `You are NOVA-Cost, a senior construction cost estimator specialized in benchmarking and pricing analysis.

You have tools. USE THEM before answering — a grounded number beats a confident guess.
- search_my_history — the user's OWN past estimates. First stop for "is this priced right?" — what did THEY actually pay for similar scope?
- search_cost_database — generic cost DB for similar materials/assemblies. Use when user's own history doesn't cover the trade.
- calculate_totals — current estimate totals by division/trade with $/SF.

When asked about costs, $/SF, or pricing reasonableness:
- Call search_my_history FIRST. Grounded > generic.
- Compare against historical proposal data if relevant.
- Cite specific items from the estimate by ID.
- Flag outliers (items priced > 2x or < 0.5x typical).
- Name the assumption behind every number — don't just assert.

Keep responses under 200 words. Lead with the answer, follow with evidence.`,
    model: INTERPRET_MODEL,
    thinking: { type: "enabled", budget_tokens: 6000 },
    maxTokens: 10000,
    needsEstimateContext: true,
    needsDrawings: false,
  },
  scope: {
    label: "NOVA-Scope",
    blurb: "CSI division coverage + scope gaps + completeness audit",
    systemPrompt: `You are NOVA-Scope, an expert in construction scope completeness and coordination.

You have tools. USE THEM when they'd sharpen the answer.
- search_my_history — the user's past estimates. Use to see what scope items typically appear on THIS user's projects of similar type.
- search_proposals — historical proposals library. Use to benchmark scope against similar building types.
- calculate_totals — see current coverage by division/trade.

When asked about what's missing, scope gaps, or completeness:
- Walk the 50 CSI divisions systematically — note which are covered, which are thin, which are absent.
- For each identified gap, state why it's a gap (building type suggests it, adjacent scope needs it, drawing references it).
- Distinguish "missing entirely" from "under-quantified" from "allowance only".
- Reference specific items by ID when pointing at coverage.

Keep responses structured: a short headline, then a prioritized list of gaps with one line of reasoning each.`,
    model: INTERPRET_MODEL,
    thinking: { type: "enabled", budget_tokens: 8000 },
    maxTokens: 12000,
    needsEstimateContext: true,
    needsDrawings: false,
  },
  plans: {
    label: "NOVA-Plans",
    blurb: "Drawing interpretation — dimensions, callouts, schedules, symbols",
    systemPrompt: `You are NOVA-Plans, an expert in reading construction drawings.

You read the drawing(s) provided as PDF documents — not summaries. Dimensions, callouts, schedule tables, symbols, revision clouds, notes.

When asked about drawings:
- Cite the exact sheet and location (grid reference or north/south/east/west if no grid).
- Read schedules verbatim — don't paraphrase door schedules or room finish schedules.
- Identify symbols precisely (e.g. "GFCI receptacle at 18\" AFF" not just "outlet").
- Count visible elements if asked (say "X visible on this sheet" — acknowledge you can't see other sheets).

Keep responses concrete. No speculation about what isn't shown.`,
    model: INTERPRET_MODEL,
    thinking: { type: "enabled", budget_tokens: 6000 },
    maxTokens: 10000,
    needsEstimateContext: false,
    needsDrawings: true,
  },
};

export function specialistIds() {
  return Object.keys(SPECIALISTS);
}

export function specialistDescription(id) {
  const s = SPECIALISTS[id];
  return s ? `${s.label} — ${s.blurb}` : `(unknown specialist: ${id})`;
}

// ── Runner ───────────────────────────────────────────────────────
// Fires an independent Claude call scoped to one specialist. Runs its own
// agentic tool loop — specialist emits tool_use blocks, we execute them via
// executeNovaTool, feed results back, repeat until specialist emits text only.
//
// Returns: { label, text, toolCalls, error }
export async function runSubagent(specialistId, query, attachedPdfs = []) {
  const spec = SPECIALISTS[specialistId];
  if (!spec) {
    return { label: specialistId, text: "", toolCalls: [], error: `Unknown specialist: ${specialistId}` };
  }
  if (!query || typeof query !== "string" || !query.trim()) {
    return { label: spec.label, text: "", toolCalls: [], error: "Empty query" };
  }

  // Build focused context for this specialist only
  let contextText = "";
  if (spec.needsEstimateContext) {
    contextText = buildProjectContext({
      project: useProjectStore.getState().project,
      items: useItemsStore.getState().items,
      drawings: useDrawingPipelineStore.getState().drawings,
    });
  }

  const systemText = contextText
    ? `${spec.systemPrompt}\n\n[PROJECT CONTEXT]\n${contextText}`
    : spec.systemPrompt;

  // Dynamic import to break the circular dep with novaTools.js (which imports runSubagent).
  const { NOVA_TOOLS, executeNovaTool } = await import("@/utils/novaTools");
  const allowedNames = SPECIALIST_TOOLS[specialistId] || [];
  const specialistTools = NOVA_TOOLS.filter(t => allowedNames.includes(t.name));

  // Build initial user message
  const initialUserContent = [];
  if (spec.needsDrawings && attachedPdfs.length > 0) {
    for (const { drawing, pdf } of attachedPdfs) {
      initialUserContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
        title: `Sheet ${drawing.sheetNumber || drawing.label || drawing.id.slice(0, 6)}`,
        cache_control: { type: "ephemeral" },
      });
    }
  }
  initialUserContent.push({ type: "text", text: query });

  const initialUser = {
    role: "user",
    content:
      initialUserContent.length === 1 && initialUserContent[0].type === "text"
        ? query
        : initialUserContent,
  };

  let messages = [initialUser];
  const toolCalls = [];
  let finalText = "";

  try {
    for (let iter = 0; iter < MAX_SUBAGENT_ITERS; iter++) {
      const response = await callAnthropic({
        model: spec.model,
        max_tokens: spec.maxTokens,
        system: buildCachedSystem(systemText),
        messages,
        thinking: spec.thinking,
        tools: specialistTools.length > 0 ? specialistTools : undefined,
      });

      // Text-only response — we're done.
      if (typeof response === "string") {
        finalText = response;
        break;
      }

      // Tool-use response: { content: [...blocks], stop_reason }
      const { content } = response;
      const toolUses = content.filter(c => c.type === "tool_use");
      const textParts = content.filter(c => c.type === "text").map(c => c.text).join("").trim();

      messages = [...messages, { role: "assistant", content }];

      if (toolUses.length === 0) {
        finalText = textParts;
        break;
      }

      // Execute each tool call (parallel — same as main agent)
      const toolResults = await Promise.all(
        toolUses.map(async tu => {
          try {
            const result = await executeNovaTool(tu.name, tu.input);
            toolCalls.push({ name: tu.name, input: tu.input, result });
            return {
              type: "tool_result",
              tool_use_id: tu.id,
              content: typeof result === "string" ? result : JSON.stringify(result),
            };
          } catch (err) {
            toolCalls.push({ name: tu.name, input: tu.input, error: err?.message || String(err) });
            return {
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify({ error: err?.message || String(err) }),
              is_error: true,
            };
          }
        }),
      );

      messages = [...messages, { role: "user", content: toolResults }];

      if (iter === MAX_SUBAGENT_ITERS - 1) {
        finalText = textParts || "[reached tool-call limit before final answer]";
      }
    }

    return { label: spec.label, text: finalText, toolCalls, error: null };
  } catch (err) {
    return { label: spec.label, text: "", toolCalls, error: err?.message || String(err) };
  }
}
