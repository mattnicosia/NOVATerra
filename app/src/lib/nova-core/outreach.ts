// ============================================================
// NOVA Core — Sub Outreach Engine
// Automated email campaigns for sub reactivation & welcome.
// Uses POSTMARK_SERVER_TOKEN for Postmark API auth.
// Never throws — all functions catch internally, return 0.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN || '';

const DAILY_CAP = 50;

function getSb() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

function getPortalUrl(orgId: string): string {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'https://app-nova-42373ca7.vercel.app';
  return `${base}/portal?gc=${orgId}`;
}

async function sendPostmark(to: string, fromName: string, subject: string, textBody: string): Promise<string | null> {
  if (!POSTMARK_SERVER_TOKEN) return null;

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: 'bids@novaterra.ai',
      FromName: fromName,
      To: to,
      Subject: subject,
      TextBody: textBody,
      MessageStream: 'outbound',
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    console.error(`[outreach] Postmark send failed ${response.status}: ${errBody.slice(0, 200)}`);
    return null;
  }

  const result = await response.json();
  return result.MessageID || null;
}

async function getOrgName(sb: ReturnType<typeof createClient>, orgId: string): Promise<string | null> {
  const { data } = await sb.from('organizations').select('name').eq('id', orgId).single();
  return data?.name || null;
}

async function getDailySentCount(sb: ReturnType<typeof createClient>, orgId: string): Promise<number> {
  const { count } = await sb
    .from('sub_outreach_log')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return count || 0;
}

// ── FUNCTION 1: Reactivation Campaign ──

export async function runReactivationCampaign(orgId: string): Promise<number> {
  try {
    const sb = getSb();

    const orgName = await getOrgName(sb, orgId);
    if (!orgName) return 0;

    const dailySent = await getDailySentCount(sb, orgId);
    if (dailySent >= DAILY_CAP) return 0;

    // Eligible subs: submitted 30+ days ago, no recent activity
    const { data: eligible, error: eligErr } = await sb.rpc('run_sql', {
      query: `
        SELECT DISTINCT source_email, sub_company_name, MAX(created_at) as last_submission
        FROM parser_audit_log
        WHERE org_id = '${orgId}'
          AND source_email IS NOT NULL
          AND source_email NOT LIKE '%(upload)%'
          AND error_message IS NULL
        GROUP BY source_email, sub_company_name
        HAVING MAX(created_at) < NOW() - INTERVAL '30 days'
        ORDER BY last_submission ASC
        LIMIT 50
      `,
    });

    // If rpc doesn't exist, fall back to a simpler query approach
    let subs: Array<{ source_email: string; sub_company_name: string | null }> = [];

    if (eligErr || !eligible) {
      // Fallback: use standard supabase query
      const { data: auditRows } = await sb
        .from('parser_audit_log')
        .select('source_email, sub_company_name, created_at')
        .eq('org_id', orgId)
        .not('source_email', 'is', null)
        .is('error_message', null)
        .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true })
        .limit(200);

      // Deduplicate by email
      const seen = new Set<string>();
      for (const row of auditRows || []) {
        const email = (row.source_email || '').toLowerCase();
        if (!email || email.includes('(upload)') || seen.has(email)) continue;
        seen.add(email);
        subs.push({ source_email: email, sub_company_name: row.sub_company_name });
        if (subs.length >= 50) break;
      }
    } else {
      subs = (eligible as Array<{ source_email: string; sub_company_name: string | null }>);
    }

    const portalUrl = getPortalUrl(orgId);
    let sentCount = 0;
    const remaining = DAILY_CAP - dailySent;

    for (const sub of subs) {
      if (sentCount >= remaining) break;

      const email = sub.source_email;

      // Skip if already sent reactivation in last 30 days
      const { count: recentCount } = await sb
        .from('sub_outreach_log')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('sub_email', email)
        .eq('campaign_type', 'reactivation_30d')
        .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if ((recentCount || 0) > 0) continue;

      // Skip if unsubscribed
      const { data: unsubRow } = await sb
        .from('sub_outreach_log')
        .select('unsubscribed')
        .eq('org_id', orgId)
        .eq('sub_email', email)
        .eq('unsubscribed', true)
        .limit(1)
        .maybeSingle();

      if (unsubRow) continue;

      const name = sub.sub_company_name || 'there';
      const subject = "We haven't heard from you — submit your latest pricing";
      const textBody = `Hi ${name},\n\nWe're actively reviewing bids and would love to include your pricing.\n\nSubmit your latest proposal here:\n${portalUrl}\n\nThis takes less than 2 minutes.\n\nTo stop receiving these emails, reply with 'unsubscribe'.\n\n${orgName} via NOVA Core`;

      const messageId = await sendPostmark(email, orgName, subject, textBody);
      if (!messageId) continue;

      await sb.from('sub_outreach_log').insert({
        org_id: orgId,
        sub_email: email,
        sub_company_name: sub.sub_company_name,
        campaign_type: 'reactivation_30d',
        email_subject: subject,
        postmark_message_id: messageId,
      });

      sentCount++;
    }

    return sentCount;
  } catch (err) {
    console.error('[outreach] runReactivationCampaign error:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── FUNCTION 2: Welcome Campaign ──

export async function runWelcomeCampaign(orgId: string): Promise<number> {
  try {
    const sb = getSb();

    const orgName = await getOrgName(sb, orgId);
    if (!orgName) return 0;

    const dailySent = await getDailySentCount(sb, orgId);
    if (dailySent >= DAILY_CAP) return 0;

    // First-time submitters from yesterday (24-48 hours ago)
    const now = Date.now();
    const h24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const h48 = new Date(now - 48 * 60 * 60 * 1000).toISOString();

    const { data: auditRows } = await sb
      .from('parser_audit_log')
      .select('source_email, sub_company_name, created_at')
      .eq('org_id', orgId)
      .not('source_email', 'is', null)
      .is('error_message', null)
      .gte('created_at', h48)
      .lte('created_at', h24)
      .order('created_at', { ascending: true })
      .limit(200);

    // Deduplicate by email, only keep first-time submitters
    const seen = new Set<string>();
    const firstTimers: Array<{ source_email: string; sub_company_name: string | null }> = [];

    for (const row of auditRows || []) {
      const email = (row.source_email || '').toLowerCase();
      if (!email || email.includes('(upload)') || seen.has(email)) continue;
      seen.add(email);

      // Check if this is truly their first submission (no earlier records)
      const { count: priorCount } = await sb
        .from('parser_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('source_email', email)
        .lt('created_at', h48);

      if ((priorCount || 0) > 0) continue; // Not first time
      firstTimers.push({ source_email: email, sub_company_name: row.sub_company_name });
    }

    const portalUrl = getPortalUrl(orgId);
    let sentCount = 0;
    const remaining = DAILY_CAP - dailySent;

    for (const sub of firstTimers) {
      if (sentCount >= remaining) break;

      const email = sub.source_email;

      // Skip if already sent welcome
      const { count: welcomeCount } = await sb
        .from('sub_outreach_log')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('sub_email', email)
        .eq('campaign_type', 'welcome');

      if ((welcomeCount || 0) > 0) continue;

      // Skip if unsubscribed
      const { data: unsubRow } = await sb
        .from('sub_outreach_log')
        .select('unsubscribed')
        .eq('org_id', orgId)
        .eq('sub_email', email)
        .eq('unsubscribed', true)
        .limit(1)
        .maybeSingle();

      if (unsubRow) continue;

      const name = sub.sub_company_name || 'there';
      const subject = "Thanks for submitting — here's how to be first next time";
      const textBody = `Hi ${name},\n\nThanks for submitting your proposal. We received it and will be in touch.\n\nFor faster responses next time, submit directly here:\n${portalUrl}\n\nTo stop receiving these emails, reply with 'unsubscribe'.\n\n${orgName}`;

      const messageId = await sendPostmark(email, orgName, subject, textBody);
      if (!messageId) continue;

      await sb.from('sub_outreach_log').insert({
        org_id: orgId,
        sub_email: email,
        sub_company_name: sub.sub_company_name,
        campaign_type: 'welcome',
        email_subject: subject,
        postmark_message_id: messageId,
      });

      sentCount++;
    }

    return sentCount;
  } catch (err) {
    console.error('[outreach] runWelcomeCampaign error:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// ── FUNCTION 3: Handle Unsubscribe ──

export async function handleUnsubscribe(subEmail: string, orgId: string): Promise<void> {
  try {
    const sb = getSb();
    await sb
      .from('sub_outreach_log')
      .update({ unsubscribed: true })
      .eq('sub_email', subEmail.toLowerCase())
      .eq('org_id', orgId);
  } catch (err) {
    console.error('[outreach] handleUnsubscribe error:', err instanceof Error ? err.message : err);
  }
}
