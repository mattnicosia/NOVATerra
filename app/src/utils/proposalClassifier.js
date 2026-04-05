// Document Classifier — Haiku-powered classification of construction documents
import { callAnthropic, SCAN_MODEL } from "@/utils/ai";

const CLASSIFICATION_PROMPT = `You are a construction document classifier. Given the first portion of a document converted to markdown, classify it as exactly ONE of:

- gc-proposal: A general contractor's proposal or budget estimate with multiple CSI divisions, total project cost, and typically includes markup (OH&P, contingency, insurance). Contains division-level breakdowns.
- sub-proposal: A subcontractor's proposal for a specific trade scope (drywall, electrical, plumbing, etc.). Contains line items for one trade, may include material/labor splits.
- vendor-quote: A material supplier quote with itemized products, unit prices, quantities. No labor included.
- other: Permit applications, expediting services, insurance certificates, bonds, contracts, or anything that is not a cost proposal.

Respond with ONLY a JSON object:
{
  "type": "gc-proposal" | "sub-proposal" | "vendor-quote" | "other",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence why"
}`;

/**
 * Classify a document from its markdown content.
 * Uses first 2500 chars to minimize token cost (~$0.001 via Haiku).
 * @param {string} markdown - Full markdown from Datalab
 * @returns {Promise<{type: string, confidence: number, reasoning: string}>}
 */
export async function classifyDocument(markdown) {
  const snippet = markdown.slice(0, 2500);

  const response = await callAnthropic({
    model: SCAN_MODEL,
    messages: [
      { role: "user", content: `${CLASSIFICATION_PROMPT}\n\n---\nDOCUMENT:\n${snippet}` },
    ],
    max_tokens: 200,
    temperature: 0,
  });

  try {
    const text = response?.content?.[0]?.text || response;
    const jsonMatch = typeof text === "string"
      ? text.match(/\{[\s\S]*\}/)
      : null;
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[classifier] Parse error:", e);
  }

  return { type: "other", confidence: 0, reasoning: "Failed to classify" };
}
