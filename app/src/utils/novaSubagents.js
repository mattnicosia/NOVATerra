// novaSubagents — Specialist sub-agents for NOVA Chat.
//
// Each specialist is a focused Claude call with:
//   - a domain-specific system prompt
//   - its own model + thinking budget
//   - a tailored context builder (only what it needs, not the full estimate)
//   - optional cached document attachments (drawings for NOVA-Plans)
//
// The main NOVA agent dispatches via the `consult_specialist` tool. Multiple
// specialists can be invoked in parallel (Promise.all in the tool executor)
// which gives real multi-agent fan-out: NOVA-Cost + NOVA-Scope + NOVA-Plans
// all thinking at the same time, results synthesized by the main agent.

import { callAnthropic, buildProjectContext, buildCachedSystem, INTERPRET_MODEL } from "@/utils/ai-core";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

// ── Specialist registry ──────────────────────────────────────────
// Each entry defines a specialist's identity, prompt, and model config.
// To add a new specialist: drop in here, the tool surface auto-expands.

export const SPECIALISTS = {
  cost: {
    label: "NOVA-Cost",
    blurb: "Unit pricing + $/SF benchmarks + historical proposal data",
    systemPrompt: `You are NOVA-Cost, a senior construction cost estimator specialized in benchmarking and pricing analysis.

When asked about costs, $/SF, or pricing reasonableness:
- Compare against historical proposal data when possible
- Use $/SF benchmarks for the building type + region
- Cite specific items from the estimate by ID
- Flag outliers (items priced > 2x or < 0.5x typical)
- Name the assumption behind every number — don't just assert

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

When asked about what's missing, scope gaps, or completeness:
- Walk the 50 CSI divisions systematically — note which are covered, which are thin, which are absent
- For each identified gap, state why it's a gap (building type suggests it, adjacent scope needs it, drawing references it)
- Distinguish "missing entirely" from "under-quantified" from "allowance only"
- Reference specific items by ID when pointing at coverage

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
- Cite the exact sheet and location (grid reference or north/south/east/west if no grid)
- Read schedules verbatim — don't paraphrase door schedules or room finish schedules
- Identify symbols precisely (e.g. "GFCI receptacle at 18\" AFF" not just "outlet")
- Count visible elements if asked (say "X visible on this sheet" — acknowledge you can't see other sheets)

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
// runSubagent fires an independent Claude call scoped to one specialist.
// It builds its own context from the stores — does NOT reuse the main chat's
// message history, so responses are focused and cheap.
//
// Returns: { label, text, error? }
export async function runSubagent(specialistId, query, attachedPdfs = []) {
  const spec = SPECIALISTS[specialistId];
  if (!spec) {
    return { label: specialistId, text: "", error: `Unknown specialist: ${specialistId}` };
  }
  if (!query || typeof query !== "string" || !query.trim()) {
    return { label: spec.label, text: "", error: "Empty query" };
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

  // Build user message — attach PDFs (cached) if this specialist needs them
  const userContent = [];
  if (spec.needsDrawings && attachedPdfs.length > 0) {
    for (const { drawing, pdf } of attachedPdfs) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
        title: `Sheet ${drawing.sheetNumber || drawing.label || drawing.id.slice(0, 6)}`,
        cache_control: { type: "ephemeral" },
      });
    }
  }
  userContent.push({ type: "text", text: query });

  try {
    const response = await callAnthropic({
      model: spec.model,
      max_tokens: spec.maxTokens,
      system: buildCachedSystem(systemText),
      messages: [{ role: "user", content: userContent.length === 1 && userContent[0].type === "text" ? query : userContent }],
      thinking: spec.thinking,
    });

    // callAnthropic returns plain text string for text-only responses
    const text = typeof response === "string" ? response : "";
    return { label: spec.label, text, error: null };
  } catch (err) {
    return { label: spec.label, text: "", error: err?.message || String(err) };
  }
}
