// ============================================================
// NOVA Core — Parser Email Acknowledgement
// Sends an auto-reply to the sub's email address after a
// successful parse via Postmark.
//
// Email content is branded as NOVATerra — never mentions AI.
// Failure must never cause the parse job to fail.
// Uses POSTMARK_SERVER_TOKEN for Postmark API auth.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';

/**
 * Send an auto-acknowledgement email to the sub after successful parse.
 * Wrapped in try/catch — email failure must NEVER throw, always returns false.
 * On success: updates parser_audit_log.acknowledgement_sent = true.
 * On failure: logs error, returns false, does not update audit log.
 */
export async function sendAcknowledgement(
  toEmail: string,
  originalSubject: string,
  parseJobId: string,
): Promise<boolean> {
  try {
    if (!toEmail || !POSTMARK_SERVER_TOKEN) {
      return false;
    }

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: 'bids@novaterra.ai',
        FromName: 'NOVATerra Bid Management',
        To: toEmail,
        Subject: 'Re: ' + originalSubject,
        TextBody: 'Thank you for submitting your proposal. We have received it and will be in touch shortly. If you have any questions, please reply to this email.',
        MessageStream: 'outbound',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[parserEmail] Postmark send failed ${response.status}: ${errBody.slice(0, 200)}`);
      return false;
    }

    // Success — update audit log
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await sb.from('parser_audit_log').update({
      acknowledgement_sent: true,
    }).eq('id', parseJobId);

    return true;
  } catch (err) {
    console.error(`[parserEmail] Email send error:`, err instanceof Error ? err.message : err);
    return false;
  }
}
