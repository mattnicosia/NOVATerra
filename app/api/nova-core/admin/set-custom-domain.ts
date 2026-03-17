/**
 * POST /api/nova-core/admin/set-custom-domain
 *
 * Sets a custom API domain for an organization (white-label).
 * No Vercel middleware needed — custom domain routing is a DNS/CNAME
 * passthrough that works automatically once the CNAME is set.
 * The Vercel project already accepts traffic on the custom domain because
 * custom domains added to the Vercel project resolve to the same app.
 */

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NOVA_CORE_SERVICE_ROLE_KEY!
);

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.cookies?.nova_admin_token || '';
  if (!token || !process.env.NOVA_ADMIN_TOKEN || !safeCompare(token, process.env.NOVA_ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { org_id, domain } = req.body || {};
  if (!org_id || !domain) {
    return res.status(400).json({ error: 'org_id and domain are required' });
  }

  // (1) Validate domain format
  const domainPattern = /^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$/i;
  if (!domainPattern.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }

  // (2) Validate org exists and is_demo or is_paying
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, is_demo, is_paying')
    .eq('id', org_id)
    .single();

  if (orgErr || !org) {
    return res.status(404).json({ error: 'Organization not found' });
  }
  if (!org.is_demo && !org.is_paying) {
    return res.status(403).json({ error: 'Custom domain requires an active subscription' });
  }

  // (3) Check domain not already taken
  const { count } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('custom_api_domain', domain)
    .neq('id', org_id);

  if ((count ?? 0) > 0) {
    return res.status(409).json({ error: 'Domain is already in use by another organization' });
  }

  // (4) Update
  const { error: updateErr } = await supabase
    .from('organizations')
    .update({ custom_api_domain: domain })
    .eq('id', org_id);

  if (updateErr) {
    return res.status(500).json({ error: 'Failed to set custom domain' });
  }

  // (5) Return instructions
  return res.status(200).json({
    success: true,
    domain,
    instructions: {
      cname_host: domain,
      cname_value: 'app-nova-42373ca7.vercel.app',
      note: 'Add a CNAME record in your DNS provider pointing ' + domain + ' to app-nova-42373ca7.vercel.app. Changes take up to 48 hours to propagate.'
    }
  });
}
