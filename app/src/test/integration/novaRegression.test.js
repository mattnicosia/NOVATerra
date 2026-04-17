// @vitest-environment node
//
// NOVA Chat regression suite.
//
// Exercises each capability shipped in the NOVA Chat upgrade (model, caching,
// thinking, streaming, PDFs, multi-agent, cross-estimate memory) by sending
// fixed queries through the exact same system prompt, tool schema, and thinking
// config the production UI uses.
//
// Uses @anthropic-ai/sdk directly (skips the /api/ai proxy so no auth needed).
// Set ANTHROPIC_API_KEY in env before running:
//   ANTHROPIC_API_KEY=sk-ant-... npx vitest run src/test/integration/novaRegression
//
// Scenarios are deterministic where possible. Borderline cases (e.g. "analytical
// question, could delegate or could answer directly") report the tool choice
// without asserting, and the /test-nova skill AI-judges them.

import { describe, it, expect, beforeAll } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { NOVA_PERSONA, getThinkingConfig } from "@/utils/novaPrompt";
import { NOVA_TOOLS } from "@/utils/novaTools";
import { buildProjectContext } from "@/utils/ai-core";

const MODEL = "claude-sonnet-4-6";
const TOKEN_CAP_ANALYTICAL = 12000;
const TOKEN_CAP_ACTION = 2000;

// ── Seed fixture: a realistic mid-sized office buildout estimate ────
const SEED_PROJECT = {
  name: "Midtown Office Buildout",
  jobType: "Office TI",
  projectSF: 12000,
  floorCount: 1,
  client: "Acme Holdings",
  architect: "Nolan Architects",
  address: "450 W 33rd St, NYC",
};

const SEED_ITEMS = [
  { id: "i001", code: "03.300", division: "03 - Concrete", trade: "Concrete", description: "CIP concrete slab topping 2\"", unit: "SF", quantity: 12000, material: 2.10, labor: 1.85, equipment: 0, subcontractor: 0 },
  { id: "i002", code: "05.120", division: "05 - Metals", trade: "Steel", description: "Structural steel beam reinforcement", unit: "LF", quantity: 200, material: 85, labor: 45, equipment: 0, subcontractor: 0 },
  { id: "i003", code: "09.210", division: "09 - Finishes", trade: "Drywall", description: "5/8\" Type X gypsum board on steel studs", unit: "SF", quantity: 14000, material: 0.90, labor: 2.40, equipment: 0, subcontractor: 0 },
  { id: "i004", code: "09.650", division: "09 - Finishes", trade: "Flooring", description: "Carpet tile, commercial Class A", unit: "SF", quantity: 10500, material: 4.25, labor: 1.10, equipment: 0, subcontractor: 0 },
  { id: "i005", code: "09.910", division: "09 - Finishes", trade: "Paint", description: "Interior paint, 2 coats eggshell", unit: "SF", quantity: 28000, material: 0.35, labor: 0.65, equipment: 0, subcontractor: 0 },
  { id: "i006", code: "22.400", division: "22 - Plumbing", trade: "Plumbing", description: "Domestic water piping rough-in", unit: "LF", quantity: 450, material: 0, labor: 0, equipment: 0, subcontractor: 48 },
  { id: "i007", code: "23.300", division: "23 - HVAC", trade: "HVAC", description: "VAV box, 6\" inlet with controls", unit: "EA", quantity: 18, material: 0, labor: 0, equipment: 0, subcontractor: 1850 },
  { id: "i008", code: "26.100", division: "26 - Electrical", trade: "Electrical", description: "Lighting + power rough-in", unit: "SF", quantity: 12000, material: 0, labor: 0, equipment: 0, subcontractor: 11.50 },
];

const SEED_DRAWINGS = [
  { id: "d001", sheetNumber: "A101", sheetTitle: "Floor Plan — Level 1", label: "A101" },
  { id: "d002", sheetNumber: "A201", sheetTitle: "Reflected Ceiling Plan", label: "A201" },
  { id: "d003", sheetNumber: "M101", sheetTitle: "HVAC Plan", label: "M101" },
];

function buildSystem() {
  const ctx = buildProjectContext({ project: SEED_PROJECT, items: SEED_ITEMS, drawings: SEED_DRAWINGS });
  return `${NOVA_PERSONA}\n\n${ctx}`;
}

async function runNovaQuery(client, query) {
  const thinking = getThinkingConfig(query);
  const system = buildSystem();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: thinking ? TOKEN_CAP_ANALYTICAL : TOKEN_CAP_ACTION,
    system,
    messages: [{ role: "user", content: query }],
    tools: NOVA_TOOLS,
    ...(thinking ? { thinking } : {}),
  });

  const toolUses = resp.content.filter(b => b.type === "tool_use");
  const thinkingBlocks = resp.content.filter(b => b.type === "thinking");
  const textParts = resp.content.filter(b => b.type === "text").map(b => b.text).join("").trim();

  return {
    query,
    thinkingEnabled: !!thinking,
    thinkingFired: thinkingBlocks.length > 0,
    thinkingChars: thinkingBlocks.reduce((n, b) => n + (b.thinking?.length || 0), 0),
    toolNames: toolUses.map(t => t.name),
    toolInputs: toolUses.map(t => ({ name: t.name, input: t.input })),
    text: textParts.slice(0, 800),
    stopReason: resp.stop_reason,
    usage: resp.usage,
  };
}

// ── Setup ────────────────────────────────────────────────────────
let client;
beforeAll(() => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY env var required for NOVA regression tests. Skip by: npx vitest run --exclude src/test/integration/novaRegression");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
});

// ── Deterministic scenarios ──────────────────────────────────────
describe("NOVA Chat regression — deterministic", () => {
  it("S1. simple action — add_line_items", async () => {
    const r = await runNovaQuery(client, "add 2000 SF of vapor barrier to Division 07 at $0.45/SF material, no labor");
    expect(r.toolNames).toContain("add_line_items");
    expect(r.thinkingEnabled).toBe(false);
    const add = r.toolInputs.find(t => t.name === "add_line_items");
    const items = add?.input?.items || [];
    expect(items.length).toBeGreaterThan(0);
    expect(JSON.stringify(items).toLowerCase()).toMatch(/vapor/);
  }, 60_000);

  it("S2. remove — remove_line_items (user pre-confirmed)", async () => {
    // Tool description tells NOVA to confirm before deleting, so a simple
    // "remove X" may produce a confirmation question instead of a tool call.
    // Test with explicit pre-confirmation to assert the tool CAN fire.
    const r = await runNovaQuery(client, "Yes, I confirm: remove line item i004 now. No further confirmation needed.");
    const removed = r.toolNames.includes("remove_line_items");
    if (!removed) {
      console.log("[S2] NOVA responded without tool. text:", r.text.slice(0, 200));
    }
    expect(removed).toBe(true);
    const rem = r.toolInputs.find(t => t.name === "remove_line_items");
    expect(rem?.input?.item_ids).toContain("i004");
  }, 60_000);

  it("S3. calculation — calculate_totals", async () => {
    const r = await runNovaQuery(client, "show me $/SF by division");
    expect(r.toolNames).toContain("calculate_totals");
    const calc = r.toolInputs.find(t => t.name === "calculate_totals");
    expect(calc?.input?.group_by).toMatch(/division/);
  }, 60_000);
});

// ── Semi-deterministic — assertions on intent, not exact tool ────
describe("NOVA Chat regression — semi-deterministic", () => {
  it("S4. analytical scope query enables thinking", async () => {
    const r = await runNovaQuery(client, "what scope am I missing for a typical office buildout like this?");
    expect(r.thinkingEnabled).toBe(true);
    // Either delegates to scope specialist OR answers directly after thinking
    const delegated = r.toolNames.includes("consult_specialist");
    if (delegated) {
      const c = r.toolInputs.find(t => t.name === "consult_specialist");
      expect(c?.input?.specialist).toBe("scope");
    } else {
      // If answering directly, thinking should have meaningfully fired
      expect(r.thinkingFired).toBe(true);
    }
  }, 120_000);

  it("S5. cross-domain query → parallel specialists", async () => {
    const r = await runNovaQuery(client, "is my concrete pricing reasonable and what scope am I missing?");
    expect(r.thinkingEnabled).toBe(true);
    const consults = r.toolInputs.filter(t => t.name === "consult_specialist");
    // Strong: should call at least two specialists in parallel
    // Lenient: at minimum delegates to one
    expect(consults.length).toBeGreaterThanOrEqual(1);
    const specialists = consults.map(c => c.input?.specialist);
    // If it only called one, log a warning — judge will flag
    console.log("[S5] specialists dispatched:", specialists);
  }, 120_000);

  it("S6. cross-estimate memory query uses search_my_history", async () => {
    const r = await runNovaQuery(client, "what have I paid for steel stud framing on past projects?");
    // Should prefer search_my_history over search_cost_database (user's own work)
    expect(r.toolNames.some(n => n === "search_my_history" || n === "search_proposals")).toBe(true);
    console.log("[S6] tools used:", r.toolNames);
  }, 120_000);

  it("S7. drawing reference triggers plans context", async () => {
    const r = await runNovaQuery(client, "what's shown on sheet A101?");
    // Depending on whether PDFs were attached in the UI layer, NOVA may answer
    // from context alone OR delegate to plans specialist. Both acceptable.
    const validTools = ["consult_specialist", "query_project_info"];
    const hadValid = r.toolNames.some(n => validTools.includes(n)) || r.text.length > 50;
    expect(hadValid).toBe(true);
    console.log("[S7] tools used:", r.toolNames, "textLen:", r.text.length);
  }, 120_000);
});
