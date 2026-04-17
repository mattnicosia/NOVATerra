// Vercel Serverless Function — AI Scope Gap Narrative
// POST { gapReport, projectName, packageName, subName }
// Returns { narrative, riskLevel }

import Anthropic from "@anthropic-ai/sdk";
import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { checkRateLimit } from "./lib/rateLimiter.js";

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { allowed, retryAfter } = checkRateLimit(`scope_gap_${user.id}`);
  if (!allowed) {
    return res.status(429).json({ error: "Rate limited — too many requests", retryAfter });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: "AI service not configured" });

  const { gapReport, projectName, packageName, subName } = req.body || {};
  if (!gapReport) return res.status(400).json({ error: "Missing gapReport" });

  try {
    const client = new Anthropic({ apiKey: anthropicKey });

    const systemPrompt = `You are a construction bid analyst working for a general contractor. Given a scope gap analysis comparing a subcontractor's proposal against the GC's estimate, write a concise risk summary.

Rules:
- Be direct and actionable. Flag the 2-3 biggest risks.
- Reference specific CSI divisions and dollar exposures.
- If exclusion conflicts exist, emphasize them — these are scope items the sub explicitly excludes that the GC's estimate includes, meaning the GC will need to cover them separately.
- If quantity mismatches exceed 30%, flag them as pricing risks.
- End with a one-sentence recommendation (negotiate, request clarification, or accept as-is).
- Keep response under 200 words.
- Do NOT use markdown headers or bullet points. Write in plain paragraphs.`;

    const userContent = `Project: ${projectName || "Unknown"}
Bid Package: ${packageName || "Unknown"}
Subcontractor: ${subName || "Unknown"}

Coverage Score: ${gapReport.coverageScore}%
Total Estimated Exposure: $${(gapReport.totalExposure || 0).toLocaleString()}

Missing Scope (divisions in estimate but not in proposal):
${
  (gapReport.missingFromProposal || [])
    .map(
      m =>
        `- Div ${m.division} ${m.divisionName}: ${m.estimateItems?.length || 0} items, ~$${(m.estimatedExposure || 0).toLocaleString()} exposure`,
    )
    .join("\n") || "None"
}

Exclusion Conflicts (sub excludes scope that estimate includes):
${
  (gapReport.exclusionConflicts || [])
    .map(
      c =>
        `- "${c.exclusionText}" → affects Div ${c.affectedDivision} ${c.affectedDivisionName}, ~$${(c.estimatedExposure || 0).toLocaleString()} exposure`,
    )
    .join("\n") || "None"
}

Quantity Mismatches (>20% difference):
${
  (gapReport.quantityMismatches || [])
    .map(
      q =>
        `- ${q.estimateItem}: Est ${q.estQty} ${q.unit} vs Prop ${q.propQty} ${q.unit} (${q.pctDiff > 0 ? "+" : ""}${q.pctDiff}%)`,
    )
    .join("\n") || "None"
}

Matched Divisions: ${(gapReport.matched || []).map(m => `Div ${m.division}`).join(", ") || "None"}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const narrative = response.content?.[0]?.text || "Unable to generate analysis.";

    // Determine risk level from report data
    let riskLevel = "low";
    if (gapReport.coverageScore < 60 || gapReport.totalExposure > 50000) {
      riskLevel = "high";
    } else if (
      gapReport.coverageScore < 80 ||
      gapReport.exclusionConflicts?.length > 2 ||
      gapReport.totalExposure > 10000
    ) {
      riskLevel = "medium";
    }

    return res.status(200).json({ narrative, riskLevel });
  } catch (err) {
    console.error("Scope gap narrative error:", err);
    return res.status(500).json({ error: "Failed to generate narrative" });
  }
}
