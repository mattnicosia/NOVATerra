// Bid Package Auto-Generator — One-click AI-powered bid package creation
// Groups scope items by trade, matches drawings by sheet prefix,
// matches subs by trade overlap, generates AI cover messages.
// User reviews and approves — all deterministic except cover messages.

import { callAnthropic } from "./ai";
import { autoTradeFromCode, TRADE_MAP } from "@/constants/tradeGroupings";
import { uid } from "@/utils/format";

// ─── Sheet Prefix → Trade Discipline Mapping ─────────────────────
export const SHEET_DISCIPLINE_MAP = {
  A: [
    "general",
    "demo",
    "doors",
    "windows",
    "drywall",
    "tile",
    "act",
    "flooring",
    "painting",
    "specialties",
    "finishCarp",
    "framing",
    "insulation",
    "roofing",
  ],
  S: ["concrete", "masonry", "steel"],
  M: ["hvac"],
  E: ["electrical"],
  P: ["plumbing", "fireSuppression"],
  C: ["sitework"],
  L: ["sitework"],
  FP: ["fireSuppression"],
};

// ─── Default Merge Map for Small Trades ───────────────────────────
const DEFAULT_MERGE_MAP = {
  insulation: "roofing",
  act: "drywall",
  tile: "flooring",
  windows: "doors",
  framing: "finishCarp",
};

// ─── Group Items by Trade Key ─────────────────────────────────────
function groupItemsByTrade(items) {
  const groups = {};
  const unassigned = [];
  for (const item of items) {
    // Skip non-base bid context items
    if (item.bidContext && item.bidContext !== "base") continue;
    const trade = item.trade || autoTradeFromCode(item.code);
    if (!trade) {
      unassigned.push(item);
      continue;
    }
    if (!groups[trade]) groups[trade] = [];
    groups[trade].push(item);
  }
  return { groups, unassigned };
}

// ─── Merge Small Trades into Related Larger Ones ──────────────────
function mergeSmallTrades(groups, threshold = 3, mergeMap = DEFAULT_MERGE_MAP) {
  const merged = {};
  const mergedFrom = {}; // track which trades were merged into which

  // Copy groups
  for (const [key, items] of Object.entries(groups)) {
    merged[key] = [...items];
  }

  for (const [smallKey, targetKey] of Object.entries(mergeMap)) {
    if (!merged[smallKey] || merged[smallKey].length >= threshold) continue;
    if (!merged[targetKey]) continue;
    // Merge small into target
    merged[targetKey] = [...merged[targetKey], ...merged[smallKey]];
    if (!mergedFrom[targetKey]) mergedFrom[targetKey] = [];
    mergedFrom[targetKey].push(smallKey);
    // Also carry forward any previous merges
    if (mergedFrom[smallKey]) {
      mergedFrom[targetKey].push(...mergedFrom[smallKey]);
      delete mergedFrom[smallKey];
    }
    delete merged[smallKey];
  }

  return { merged, mergedFrom };
}

// ─── Extract Sheet Prefix from Drawing Label ──────────────────────
function getSheetPrefix(drawing) {
  const label = (drawing.label || drawing.sheetNumber || drawing.name || "").toUpperCase();
  // Match: "FP1.01" → "FP", "A1.01" → "A", "E2.01" → "E", "S-101" → "S"
  const m = label.match(/^([A-Z]{1,2})[\d\-.]/);
  return m ? m[1] : null;
}

// ─── Match Drawings to a Trade Package ────────────────────────────
function matchDrawingsToTrades(drawings, tradeKeys) {
  const keySet = new Set(tradeKeys);
  const matched = [];
  for (const drawing of drawings) {
    if (drawing.superseded) continue;
    const prefix = getSheetPrefix(drawing);
    if (!prefix) continue;
    const disciplines = SHEET_DISCIPLINE_MAP[prefix];
    if (disciplines && disciplines.some(d => keySet.has(d))) {
      matched.push(drawing);
    }
  }
  return matched;
}

// ─── Match Subcontractors by Trade ────────────────────────────────
function matchSubsToTrades(subs, tradeKeys) {
  const keySet = new Set(tradeKeys);
  return (subs || []).filter(s => (s.trades || []).some(tk => keySet.has(tk)));
}

// ─── Build Package Name from Trade Keys ───────────────────────────
function buildPackageName(primaryKey, mergedKeys = []) {
  if (mergedKeys.length === 0) {
    return TRADE_MAP[primaryKey]?.label || primaryKey;
  }
  const labels = [primaryKey, ...mergedKeys]
    .map(k => TRADE_MAP[k]?.label || k)
    .sort((a, b) => {
      const sa = TRADE_MAP[Object.keys(TRADE_MAP).find(k => TRADE_MAP[k]?.label === a)]?.sort || 99;
      const sb = TRADE_MAP[Object.keys(TRADE_MAP).find(k => TRADE_MAP[k]?.label === b)]?.sort || 99;
      return sa - sb;
    });
  // Use first label + " & " + other labels abbreviated
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return labels.join(", ");
}

// ─── Main: Generate Bid Package Proposals ─────────────────────────
/**
 * Deterministically split estimate items into bid package proposals.
 *
 * @param {{ items, drawings, subs, project }} opts
 * @returns {{ proposals: Array, unassignedCount: number }}
 */
export function generateBidPackageProposals({ items, drawings, subs, project }) {
  // 1. Group by trade
  const { groups, unassigned } = groupItemsByTrade(items);

  // 2. Merge small trades
  const { merged, mergedFrom } = mergeSmallTrades(groups);

  // 3. Build proposals
  const proposals = [];

  for (const [tradeKey, tradeItems] of Object.entries(merged)) {
    const mergedKeys = mergedFrom[tradeKey] || [];
    const allTradeKeys = [tradeKey, ...mergedKeys];

    // Match drawings
    const matchedDrawings = matchDrawingsToTrades(drawings, allTradeKeys);

    // Match subs
    const matchedSubs = matchSubsToTrades(subs, allTradeKeys);

    proposals.push({
      id: uid(),
      tradeKey,
      mergedTradeKeys: mergedKeys,
      name: buildPackageName(tradeKey, mergedKeys),
      items: tradeItems,
      itemIds: tradeItems.map(i => i.id),
      drawingIds: matchedDrawings.map(d => d.id),
      drawingLabels: matchedDrawings.map(d => d.label || d.sheetNumber || d.name || "Sheet"),
      subIds: matchedSubs.map(s => s.id),
      subNames: matchedSubs.map(s => s.company || s.contact || "Unknown"),
      subEmails: matchedSubs.map(s => s.email || ""),
      coverMessage: "",
      dueDate: project.bidDue || "",
      enabled: true,
      itemCount: tradeItems.length,
    });
  }

  // Sort by canonical trade order
  proposals.sort((a, b) => {
    const sa = TRADE_MAP[a.tradeKey]?.sort ?? 99;
    const sb = TRADE_MAP[b.tradeKey]?.sort ?? 99;
    return sa - sb;
  });

  return { proposals, unassignedCount: unassigned.length };
}

// ─── AI Cover Message Generation (single batched call) ────────────
/**
 * Generate professional cover messages for all packages in one AI call.
 *
 * @param {Array} proposals — from generateBidPackageProposals
 * @param {Object} project — project store snapshot
 * @returns {Promise<string[]>} — cover messages in proposal order
 */
export async function generateCoverMessages(proposals, project) {
  if (proposals.length === 0) return [];

  const packageSummaries = proposals.map((p, i) => ({
    index: i,
    name: p.name,
    itemCount: p.itemCount,
    sampleItems: p.items
      .slice(0, 5)
      .map(it => it.description || it.code)
      .join(", "),
    subCount: p.subIds.length,
  }));

  try {
    const text = await callAnthropic({
      max_tokens: 3000,
      system: `You are NOVA, an AI assistant for a general contractor sending bid invitations to subcontractors. Generate brief, professional cover messages for bid packages.

Each message should:
- Be 2-3 sentences
- Reference the project name and the specific trade scope
- Mention the due date if provided
- Be direct and professional (GC-to-sub tone)
- Do NOT include greetings ("Dear...") or sign-offs ("Sincerely...") — those are in the email template

Return ONLY a valid JSON array of ${proposals.length} strings, one per package in the same order. No markdown fences.`,
      messages: [
        {
          role: "user",
          content: `Project: ${project.name || "Untitled Project"}
Due Date: ${project.bidDue || "TBD"}
Job Type: ${project.jobType || "Commercial Construction"}
Location: ${project.address || "Not specified"}
SF: ${project.projectSF || "Not specified"}

Generate cover messages for these ${proposals.length} bid packages:
${JSON.stringify(packageSummaries, null, 2)}`,
        },
      ],
      temperature: 0.4,
    });

    // Parse JSON array from response
    const clean = (text || "").replace(/```json\n?|```/g, "").trim();
    const arrStart = clean.indexOf("[");
    const arrEnd = clean.lastIndexOf("]");
    if (arrStart === -1 || arrEnd <= arrStart) throw new Error("No JSON array");

    const messages = JSON.parse(clean.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(messages)) throw new Error("Not an array");

    // Pad or trim to match proposal count
    while (messages.length < proposals.length) {
      messages.push(fallbackMessage(proposals[messages.length], project));
    }

    return messages.slice(0, proposals.length);
  } catch (err) {
    console.warn("[AutoBid] AI cover message generation failed:", err.message);
    // Deterministic fallback
    return proposals.map(p => fallbackMessage(p, project));
  }
}

function fallbackMessage(proposal, project) {
  const due = project.bidDue ? ` Please submit your proposal by ${project.bidDue}.` : "";
  return `We are requesting pricing for ${proposal.name} scope on ${project.name || "this project"}. Please review the attached scope items and drawings and submit your competitive proposal.${due}`;
}
