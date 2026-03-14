// Scope Narrative Generator — Produces trade-specific scope of work narratives
// from scan results (schedules, ROM, line items) + project context.
// Used by the Upload-to-RFP pipeline to auto-generate professional scope
// documents for bid packages before sending RFPs to subcontractors.

import { callAnthropic } from "./ai";
import { TRADE_MAP } from "@/constants/tradeGroupings";

// ─── Division → Trade Key Mapping ───────────────────────────────────
const DIV_TO_TRADE = {
  "01": "general",
  "02": "demo",
  "03": "concrete",
  "04": "masonry",
  "05": "steel",
  "06": "finishCarp",
  "07": "roofing",
  "08": "doors",
  "09": "drywall",
  "10": "specialties",
  "11": "equipment",
  "12": "specialties",
  "13": "specialties",
  "14": "elevator",
  "21": "fireSuppression",
  "22": "plumbing",
  "23": "hvac",
  "25": "hvac",
  "26": "electrical",
  "27": "electrical",
  "28": "electrical",
  "31": "sitework",
  "32": "sitework",
  "33": "sitework",
};

// ─── Group Line Items & Schedules by Trade ──────────────────────────
function groupByTrade(scanResults) {
  const trades = {};

  // Group line items by trade
  for (const item of scanResults.lineItems || []) {
    const div = (item.code || "").slice(0, 2);
    const trade = DIV_TO_TRADE[div] || "general";
    if (!trades[trade]) trades[trade] = { items: [], schedules: [], romDiv: null };
    trades[trade].items.push(item);
  }

  // Group schedules by trade
  for (const sched of scanResults.schedules || []) {
    const trade = scheduleTypeToTrade(sched.type);
    if (!trades[trade]) trades[trade] = { items: [], schedules: [], romDiv: null };
    trades[trade].schedules.push(sched);
  }

  // Attach ROM division data
  if (scanResults.rom?.divisions) {
    for (const [div, data] of Object.entries(scanResults.rom.divisions)) {
      const trade = DIV_TO_TRADE[div];
      if (trade && trades[trade]) {
        trades[trade].romDiv = { division: div, ...data };
      }
    }
  }

  return trades;
}

function scheduleTypeToTrade(type) {
  const map = {
    "wall-types": "drywall",
    "door": "doors",
    "window": "windows",
    "finish": "flooring",
    "plumbing-fixture": "plumbing",
    "equipment": "equipment",
    "lighting-fixture": "electrical",
    "mechanical-equipment": "hvac",
    "finish-detail": "painting",
  };
  return map[type] || "general";
}

// ─── Build Context Summary for AI ───────────────────────────────────
function buildTradeContext(tradeKey, tradeData) {
  const parts = [];

  // Schedule data
  if (tradeData.schedules.length > 0) {
    for (const sched of tradeData.schedules) {
      const entryCount = (sched.entries || []).length;
      parts.push(`Schedule: ${sched.title || sched.type} (${entryCount} entries from sheet ${sched.sheetLabel || "unknown"})`);

      // Include sample entries (first 10)
      const samples = (sched.entries || []).slice(0, 10);
      if (samples.length > 0) {
        parts.push("Sample entries:");
        for (const entry of samples) {
          const desc = Object.entries(entry)
            .filter(([k, v]) => v && !k.startsWith("_") && k !== "notes")
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
          parts.push(`  - ${desc}`);
        }
      }
    }
  }

  // Line items
  if (tradeData.items.length > 0) {
    parts.push(`\nLine Items (${tradeData.items.length}):`);
    for (const item of tradeData.items.slice(0, 15)) {
      const qty = item.qty ? ` — ${item.qty} ${item.unit || "EA"}` : "";
      parts.push(`  - ${item.code || ""} ${item.description || ""}${qty}`);
    }
  }

  // ROM data
  if (tradeData.romDiv) {
    parts.push(`\nROM Estimate: $${(tradeData.romDiv.total?.mid || 0).toLocaleString()} (mid range)`);
    if (tradeData.romDiv.aiReason) {
      parts.push(`AI Note: ${tradeData.romDiv.aiReason}`);
    }
  }

  return parts.join("\n");
}

// ─── Generate Scope Narrative for a Single Trade ────────────────────
async function generateTradeNarrative(tradeKey, tradeData, project, isRendering = false) {
  const tradeName = TRADE_MAP[tradeKey]?.label || tradeKey;
  const context = buildTradeContext(tradeKey, tradeData);

  if (!context.trim()) {
    return {
      tradeKey,
      tradeName,
      narrative: "",
      confidence: "none",
      source: "empty",
    };
  }

  // Determine confidence based on data quality
  const hasSchedules = tradeData.schedules.length > 0;
  const hasItems = tradeData.items.length > 0;
  const confidence = hasSchedules && hasItems ? "high" : hasSchedules || hasItems ? "medium" : "low";

  try {
    const text = await callAnthropic({
      max_tokens: 800,
      system: `You are NOVA, an AI assistant writing scope of work narratives for a general contractor's bid packages. Write a professional scope narrative for a specific trade.

The narrative should:
- Be 1-2 paragraphs (4-8 sentences)
- Start with a clear scope statement: "This scope includes..."
- Reference specific items detected from the drawings (door types, fixture counts, wall types, etc.)
- Include quantities where available
- Note any assumptions or items that may need clarification
- End with standard exclusions for this trade
- Use professional construction language (CSI-aligned)
- Be suitable for inclusion in an RFP to subcontractors
${isRendering ? "\n- IMPORTANT: These are from RENDERINGS, not construction documents. Flag all quantities as PRELIMINARY and note that final scope is subject to receipt of construction documents." : ""}

Do NOT include greetings, sign-offs, or generic boilerplate. Be specific to what was detected.`,
      messages: [{
        role: "user",
        content: `Project: ${project.name || "Untitled Project"}
Building Type: ${project.buildingType || project.jobType || "Commercial"}
Work Type: ${project.workType || "New Construction"}
SF: ${project.projectSF || "Not specified"}
Location: ${project.address || "Not specified"}

Trade: ${tradeName}
${context}

Write a professional scope of work narrative for this trade package.`,
      }],
      temperature: 0.3,
    });

    return {
      tradeKey,
      tradeName,
      narrative: (text || "").trim(),
      confidence,
      source: "ai",
      hasScheduleData: hasSchedules,
      itemCount: tradeData.items.length,
      scheduleCount: tradeData.schedules.length,
    };
  } catch (err) {
    console.error(`[ScopeNarrative] Failed for ${tradeName}:`, err);
    return {
      tradeKey,
      tradeName,
      narrative: buildFallbackNarrative(tradeKey, tradeData, project, isRendering),
      confidence,
      source: "fallback",
      hasScheduleData: hasSchedules,
      itemCount: tradeData.items.length,
      scheduleCount: tradeData.schedules.length,
    };
  }
}

// ─── Fallback Deterministic Narrative ───────────────────────────────
function buildFallbackNarrative(tradeKey, tradeData, project, isRendering) {
  const tradeName = TRADE_MAP[tradeKey]?.label || tradeKey;
  const parts = [];

  const preliminary = isRendering ? " (PRELIMINARY — based on renderings, subject to construction documents)" : "";

  parts.push(`This scope includes all ${tradeName.toLowerCase()} work${preliminary} for ${project.name || "this project"}.`);

  if (tradeData.items.length > 0) {
    const topItems = tradeData.items.slice(0, 5).map(i => i.description || i.code).filter(Boolean);
    if (topItems.length > 0) {
      parts.push(`Key items include: ${topItems.join("; ")}.`);
    }
  }

  if (tradeData.schedules.length > 0) {
    const totalEntries = tradeData.schedules.reduce((s, sch) => s + (sch.entries || []).length, 0);
    parts.push(`${totalEntries} item${totalEntries !== 1 ? "s" : ""} detected from drawing schedules.`);
  }

  parts.push("Refer to drawings and specifications for complete scope. Subcontractor to include all labor, materials, equipment, and incidentals required for a complete installation.");

  return parts.join(" ");
}

// ─── Main: Generate All Trade Narratives ────────────────────────────
/**
 * Generate scope of work narratives for all trades found in scan results.
 *
 * @param {Object} scanResults — from scanStore.scanResults
 * @param {Object} project — from projectStore
 * @param {Object} [options]
 * @param {boolean} [options.isRendering] — flag all scopes as preliminary
 * @param {Function} [options.onProgress] — callback(tradeKey, index, total)
 * @returns {Promise<Array<{ tradeKey, tradeName, narrative, confidence, source }>>}
 */
export async function generateScopeNarratives(scanResults, project, options = {}) {
  if (!scanResults) return [];

  const { isRendering = false, onProgress } = options;
  const tradeGroups = groupByTrade(scanResults);
  const tradeKeys = Object.keys(tradeGroups).sort((a, b) => {
    const sa = TRADE_MAP[a]?.sort ?? 99;
    const sb = TRADE_MAP[b]?.sort ?? 99;
    return sa - sb;
  });

  // Filter out trades with no meaningful data
  const activeTrades = tradeKeys.filter(tk => {
    const td = tradeGroups[tk];
    return td.items.length > 0 || td.schedules.length > 0;
  });

  if (activeTrades.length === 0) return [];

  // Generate narratives — batch in groups of 3 for parallelism
  const results = [];
  const batchSize = 3;

  for (let i = 0; i < activeTrades.length; i += batchSize) {
    const batch = activeTrades.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (tk, bIdx) => {
        if (onProgress) onProgress(tk, i + bIdx, activeTrades.length);
        return generateTradeNarrative(tk, tradeGroups[tk], project, isRendering);
      }),
    );
    results.push(...batchResults);
  }

  return results.filter(r => r.narrative);
}

/**
 * Generate a combined scope document from all trade narratives.
 *
 * @param {Array} narratives — from generateScopeNarratives
 * @param {Object} project — project metadata
 * @returns {{ plainText: string, html: string }}
 */
export function compileScopeDocument(narratives, project) {
  if (!narratives || narratives.length === 0) {
    return { plainText: "", html: "" };
  }

  const hasRenderings = narratives.some(n => n.narrative.includes("PRELIMINARY"));

  // Plain text version
  const textParts = [];
  textParts.push(`SCOPE OF WORK — ${(project.name || "Project").toUpperCase()}`);
  if (hasRenderings) {
    textParts.push("⚠ PRELIMINARY — Based on renderings/concept documents. Subject to revision upon receipt of construction documents.\n");
  }
  textParts.push("");

  for (const n of narratives) {
    const conf = n.confidence === "high" ? "●" : n.confidence === "medium" ? "◐" : "○";
    textParts.push(`${conf} ${n.tradeName}`);
    textParts.push(`${n.narrative}`);
    textParts.push("");
  }

  // HTML version
  const htmlParts = [];
  htmlParts.push(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">`);
  htmlParts.push(`<h2 style="margin:0 0 8px;font-size:16px;font-weight:600;">Scope of Work — ${escapeHtml(project.name || "Project")}</h2>`);

  if (hasRenderings) {
    htmlParts.push(`<div style="background:#f59e0b15;border-left:3px solid #f59e0b;padding:8px 12px;margin-bottom:16px;font-size:12px;color:#92400e;border-radius:4px;">⚠ PRELIMINARY — Based on renderings/concept documents. Subject to revision upon receipt of construction documents.</div>`);
  }

  for (const n of narratives) {
    const confColor = n.confidence === "high" ? "#22c55e" : n.confidence === "medium" ? "#f59e0b" : "#ef4444";
    htmlParts.push(`<div style="margin-bottom:16px;">`);
    htmlParts.push(`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">`);
    htmlParts.push(`<span style="width:8px;height:8px;border-radius:50%;background:${confColor};display:inline-block;"></span>`);
    htmlParts.push(`<strong style="font-size:13px;">${escapeHtml(n.tradeName)}</strong>`);
    htmlParts.push(`</div>`);
    htmlParts.push(`<p style="margin:0;font-size:12px;line-height:1.6;color:#374151;">${escapeHtml(n.narrative)}</p>`);
    htmlParts.push(`</div>`);
  }

  htmlParts.push(`</div>`);

  return {
    plainText: textParts.join("\n"),
    html: htmlParts.join("\n"),
  };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
