import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NOVA_CORE_SUPABASE_URL!,
    process.env.NOVA_CORE_SERVICE_ROLE_KEY!
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.cookies?.nova_admin_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const org_id = req.query.org_id as string
  if (!org_id) return res.status(400).json({ error: 'org_id query param is required' })

  try {
    const supabase = getServiceClient()

    // (1) Get org
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, seat_count, mrr_cents, trial_ends_at, is_paying, is_demo, api_calls_today, api_calls_month, stripe_customer_id')
      .eq('id', org_id)
      .single()

    if (orgErr || !org) return res.status(404).json({ error: 'Organization not found' })

    // (2) Get subscription
    const { data: subscription } = await supabase
      .from('stripe_subscriptions')
      .select('status, current_period_start, current_period_end, cancel_at_period_end, seat_count')
      .eq('org_id', org_id)
      .limit(1)
      .single()

    // (3) Get overage count
    const { count: overageCount } = await supabase
      .from('api_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('is_overage', true)
      .gt('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

    // (4) Calculate
    const plan_limit_rpd = 10000
    const usage_pct_today = Math.round((org.api_calls_today / plan_limit_rpd) * 100)
    const usage_pct_month = Math.round((org.api_calls_month / (plan_limit_rpd * 30)) * 100)

    let days_remaining_in_trial: number | null = null
    if (!org.is_paying && !org.is_demo) {
      days_remaining_in_trial = org.trial_ends_at
        ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)
        : 0
    }

    const trial_expired = !org.is_demo && !org.is_paying &&
      (!org.trial_ends_at || new Date(org.trial_ends_at) <= new Date())

    // (5) Return
    return res.status(200).json({
      org_id: org.id,
      org_name: org.name,
      seat_count: org.seat_count,
      mrr_cents: org.mrr_cents,
      mrr_dollars: org.mrr_cents / 100,
      is_paying: org.is_paying,
      is_demo: org.is_demo,
      trial_ends_at: org.trial_ends_at,
      days_remaining_in_trial,
      trial_expired,
      api_calls_today: org.api_calls_today,
      api_calls_month: org.api_calls_month,
      plan_limit_rpd,
      usage_pct_today: Math.min(100, usage_pct_today),
      usage_pct_month: Math.min(100, usage_pct_month),
      overage_calls_this_month: Number(overageCount ?? 0),
      subscription_status: subscription?.status ?? (org.is_paying ? 'active' : 'trialing'),
      current_period_end: subscription?.current_period_end ?? null,
      cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
    })
  } catch (err: any) {
    console.error('[NOVA Billing] Usage endpoint error:', err)
    return res.status(500).json({ error: 'Failed to fetch usage data' })
  }
}
