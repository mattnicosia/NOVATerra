import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient } from '../../../src/lib/nova-core/stripe'

function getServiceClient() {
  return createClient(
    process.env.NOVA_CORE_SUPABASE_URL!,
    process.env.NOVA_CORE_SERVICE_ROLE_KEY!
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.cookies?.nova_admin_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { org_id } = req.body ?? {}
  if (!org_id) return res.status(400).json({ error: 'org_id is required' })

  try {
    const supabase = getServiceClient()

    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id')
      .eq('id', org_id)
      .single()

    if (error || !org) return res.status(404).json({ error: 'Organization not found' })

    if (!org.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Complete checkout first.' })
    }

    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000') + '/admin/billing',
    })

    return res.status(200).json({ portalUrl: session.url })
  } catch (err: any) {
    console.error('[NOVA Billing] Portal session error:', err)
    return res.status(500).json({ error: 'Failed to create portal session' })
  }
}
