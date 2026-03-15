// ============================================================
// NOVA Core — Sub Proposal Parser
// Sends PDF to Claude Sonnet for structured extraction.
// Routes lines by confidence score:
//   ≥ threshold → auto-write to proposal_line_items
//   0.60–threshold → bid_leveling_queue (pending review)
//   < 0.60 → bid_leveling_queue (manual review)
// Lump sum lines always queue regardless of confidence.
//
// Uses NOVA_CORE_SERVICE_ROLE_KEY for all Supabase writes.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { sendAcknowledgement } from './parserEmail';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AUTO_WRITE_THRESHOLD = parseFloat(process.env.NOVA_PARSER_AUTO_WRITE_THRESHOLD || '0.80');

const SYSTEM_PROMPT = process.env.NOVA_PARSER_SYSTEM_PROMPT || `You are a construction cost estimating expert. Extract all line items from the attached sub-contractor proposal PDF.

Return ONLY valid JSON matching this exact schema — no preamble, no markdown:

{
  "proposal_meta": {
    "sub_company_name": string,
    "sub_email": string | null,
    "bid_date": string | null,
    "project_name": string | null,
    "project_address": string | null,
    "total_bid_amount": number | null,
    "is_lump_sum": boolean,
    "inclusions": string | null,
    "exclusions": string | null
  },
  "line_items": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unit_cost": number | null,
      "total_cost": number,
      "csi_code": string | null,
      "csi_confidence": number,
      "notes": string | null
    }
  ],
  "pdc_lines": {
    "general_requirements_pct": number | null,
    "general_conditions_pct": number | null,
    "insurance_pct": number | null,
    "bond_pct": number | null,
    "overhead_pct": number | null,
    "fee_profit_pct": number | null
  }
}

CSI code assignment rules:
- Map each line item to the most specific XX.XXX code from the NOVA Core library
- csi_confidence 0.90-1.00: exact match (concrete ready-mix = 03.310)
- csi_confidence 0.70-0.89: strong match with minor ambiguity
- csi_confidence 0.50-0.69: plausible match, verify before accepting
- csi_confidence below 0.50: uncertain — use best guess but flag it
- If a line is clearly overhead/fee/insurance/bond, put it in pdc_lines not line_items
- Never invent quantities — use null if not stated
- Never invent unit costs — calculate from total/quantity or use null`;

// ── Types ──

interface ParsedLineItem {
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number;
  csi_code: string | null;
  csi_confidence: number;
  notes: string | null;
}

interface PdcLines {
  general_requirements_pct: number | null;
  general_conditions_pct: number | null;
  insurance_pct: number | null;
  bond_pct: number | null;
  overhead_pct: number | null;
  fee_profit_pct: number | null;
}

interface ProposalMeta {
  sub_company_name: string;
  sub_email: string | null;
  bid_date: string | null;
  project_name: string | null;
  project_address: string | null;
  total_bid_amount: number | null;
  is_lump_sum: boolean;
  inclusions: string | null;
  exclusions: string | null;
}

interface ParsedProposal {
  proposal_meta: ProposalMeta;
  line_items: ParsedLineItem[];
  pdc_lines: PdcLines;
}

// ── Main parse function ──

export async function parseProposalAsync(
  pdfBase64: string,
  sourceEmail: string,
  orgId: string,
  parseJobId: string,
  subject?: string,
): Promise<void> {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startTime = Date.now();

  let parsed: ParsedProposal | null = null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let modelUsed = 'claude-sonnet-4-20250514';

  try {
    // ── 1. Call Anthropic API — Claude Sonnet with PDF as document block ──
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelUsed,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: 'Extract all line items from this sub-contractor proposal. Return only valid JSON matching the schema.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody.slice(0, 500)}`);
    }

    const result = await response.json();
    tokensInput = result.usage?.input_tokens || 0;
    tokensOutput = result.usage?.output_tokens || 0;
    modelUsed = result.model || modelUsed;

    // Extract text content from response
    const textBlock = result.content?.find((c: any) => c.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text content in Anthropic response');
    }

    // ── 2. Parse JSON response ──
    let jsonText = textBlock.text.trim();
    // Strip markdown code fences if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      parsed = JSON.parse(jsonText) as ParsedProposal;
    } catch (parseErr) {
      // Update audit log with error
      await sb.from('parser_audit_log').update({
        error_message: `JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        model_used: modelUsed,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        parse_duration_ms: Date.now() - startTime,
      }).eq('id', parseJobId);
      return;
    }

    if (!parsed || !parsed.line_items) {
      await sb.from('parser_audit_log').update({
        error_message: 'Parsed JSON missing line_items array',
        model_used: modelUsed,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        parse_duration_ms: Date.now() - startTime,
      }).eq('id', parseJobId);
      return;
    }

    // ── 3. Route each line item by csi_confidence ──
    const isLumpSum = parsed.proposal_meta?.is_lump_sum || false;
    let highConfidence = 0;
    let midConfidence = 0;
    let lowConfidence = 0;
    let autoWritten = 0;

    for (const line of parsed.line_items) {
      const confidence = line.csi_confidence ?? 0;

      if (confidence >= AUTO_WRITE_THRESHOLD && !isLumpSum) {
        // ≥ threshold: auto-write to proposal_line_items + queue entry marked approved
        highConfidence++;

        // Insert into bid_leveling_queue with auto_routed=true, review_status='approved'
        await sb.from('bid_leveling_queue').insert({
          org_id: orgId,
          parse_job_id: parseJobId,
          raw_description: line.description,
          suggested_csi_code: line.csi_code,
          csi_confidence: confidence,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unit_cost,
          total_cost: line.total_cost,
          review_status: 'approved',
          auto_routed: true,
        });

        // Write to proposal_line_items
        await writeProposalLineItem(sb, orgId, parseJobId, line);
        autoWritten++;

      } else if (confidence >= 0.60 || isLumpSum) {
        // 0.60–threshold or lump sum: bid leveling queue (pending review)
        if (confidence >= 0.60) midConfidence++;
        else lowConfidence++;

        await sb.from('bid_leveling_queue').insert({
          org_id: orgId,
          parse_job_id: parseJobId,
          raw_description: line.description,
          suggested_csi_code: line.csi_code,
          csi_confidence: confidence,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unit_cost,
          total_cost: line.total_cost,
          review_status: 'pending',
          auto_routed: false,
        });

      } else {
        // < 0.60: manual review
        lowConfidence++;

        await sb.from('bid_leveling_queue').insert({
          org_id: orgId,
          parse_job_id: parseJobId,
          raw_description: line.description,
          suggested_csi_code: line.csi_code,
          csi_confidence: confidence,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unit_cost,
          total_cost: line.total_cost,
          review_status: 'pending',
          auto_routed: false,
        });
      }
    }

    // ── 4. Write PDC lines if extracted ──
    if (parsed.pdc_lines) {
      await writePdcLines(sb, orgId, parseJobId, parsed.pdc_lines);
    }

    // ── 5. Update parser_audit_log with final counts ──
    await sb.from('parser_audit_log').update({
      sub_company_name: parsed.proposal_meta?.sub_company_name || null,
      total_lines_parsed: parsed.line_items.length,
      high_confidence: highConfidence,
      mid_confidence: midConfidence,
      low_confidence: lowConfidence,
      auto_written: autoWritten,
      total_bid_amount: parsed.proposal_meta?.total_bid_amount || null,
      is_lump_sum: isLumpSum,
      model_used: modelUsed,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      parse_duration_ms: Date.now() - startTime,
    }).eq('id', parseJobId);

    // ── 6. Send auto-acknowledgement email (fire-and-forget) ──
    sendAcknowledgement(sourceEmail, subject || '', parseJobId).catch((emailErr) => {
      console.error(`[parser] Acknowledgement email failed:`, emailErr);
    });

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[parser] Parse job ${parseJobId} failed:`, errorMsg);

    await sb.from('parser_audit_log').update({
      error_message: errorMsg.slice(0, 2000),
      model_used: modelUsed,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      parse_duration_ms: Date.now() - startTime,
    }).eq('id', parseJobId);
  }
}

// ── Write a single auto-approved line to proposal_line_items ──

async function writeProposalLineItem(
  sb: ReturnType<typeof createClient>,
  orgId: string,
  parseJobId: string,
  line: ParsedLineItem,
): Promise<void> {
  const { error } = await sb.from('proposal_line_items').insert({
    org_id: orgId,
    csi_code_id: line.csi_code,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unit_cost: line.unit_cost,
    total_cost: line.total_cost,
    source_type: 'sub_proposal',
    is_active: true,
    is_current_revision: true,
  });

  if (error) {
    console.error(`[parser] Failed to write proposal_line_item: ${error.message}`);
  }

  // Trigger normalize-data-point Edge Function for this auto-written line
  try {
    const normalizeUrl = `${SUPABASE_URL}/functions/v1/normalize-data-point`;
    await fetch(normalizeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id: orgId,
        csi_code_id: line.csi_code,
        unit_cost: line.unit_cost,
        total_cost: line.total_cost,
        quantity: line.quantity,
        unit: line.unit,
        source_type: 'sub_proposal',
      }),
    });
  } catch (normErr) {
    console.error(`[parser] normalize-data-point call failed:`, normErr);
  }
}

// ── Write PDC lines from parser output ──

async function writePdcLines(
  sb: ReturnType<typeof createClient>,
  orgId: string,
  parseJobId: string,
  pdc: PdcLines,
): Promise<void> {
  // Map field names to pdc_lines bucket types
  const bucketMap: Record<string, string> = {
    general_requirements_pct: 'general_requirements',
    general_conditions_pct: 'general_conditions',
    insurance_pct: 'insurance',
    bond_pct: 'bond',
    overhead_pct: 'overhead',
    fee_profit_pct: 'fee_profit',
  };

  for (const [field, bucket] of Object.entries(bucketMap)) {
    const rawPct = (pdc as any)[field];
    if (rawPct == null) continue;

    // PDC percentages: parsed as whole numbers (e.g. 5.0%), stored as decimals (0.050)
    const normalizedPct = rawPct > 1 ? rawPct / 100 : rawPct;

    const { error } = await sb.from('pdc_lines').insert({
      org_id: orgId,
      line_type: bucket,
      normalized_pct: parseFloat(normalizedPct.toFixed(4)),
      is_active: true,
    });

    if (error) {
      console.error(`[parser] Failed to write pdc_line ${bucket}: ${error.message}`);
    }
  }
}
