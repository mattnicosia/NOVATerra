/**
 * POST /api/nova-core/admin/custom-key-prefix
 *
 * Allows enterprise orgs to set a custom prefix for API keys
 * instead of the default 'nova_sk_'.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NOVA_CORE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.cookies?.nova_admin_token;
  if (!token || token !== process.env.NOVA_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { org_id, prefix } = req.body || {};
  if (!org_id || !prefix) {
    return res.status(400).json({ error: 'org_id and prefix are required' });
  }

  // (1) Validate prefix format: 3-12 chars, starts with letter, ends with underscore
  const prefixPattern = /^[a-z][a-z0-9_]{2,11}_$/i;
  if (!prefixPattern.test(prefix)) {
    return res.status(400).json({ error: 'Invalid prefix format. Must be 3-12 characters, start with a letter, and end with an underscore.' });
  }

  // Check reserved prefixes
  const lower = prefix.toLowerCase();
  if (lower === 'nova_sk_' || lower.startsWith('nova_')) {
    return res.status(400).json({ error: 'Prefix is reserved and cannot be used' });
  }

  // (2) Validate org is_demo or is_paying
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, is_demo, is_paying')
    .eq('id', org_id)
    .single();

  if (orgErr || !org) {
    return res.status(404).json({ error: 'Organization not found' });
  }
  if (!org.is_demo && !org.is_paying) {
    return res.status(403).json({ error: 'Custom key prefix requires an active subscription' });
  }

  // (3) Update active API keys with custom prefix
  const { error: updateErr } = await supabase
    .from('api_keys')
    .update({ key_prefix_custom: prefix })
    .eq('org_id', org_id)
    .eq('is_active', true);

  if (updateErr) {
    return res.status(500).json({ error: 'Failed to update key prefix' });
  }

  // (4) Return success
  return res.status(200).json({
    success: true,
    prefix,
    note: 'New API keys generated for this org will use the custom prefix'
  });
}
