import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient, STRIPE_PRICE_ID } from '../../../src/lib/nova-core/stripe'

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.cookies?.nova_admin_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const { org_id, seat_count: rawSeats } = req.body ?? {}
    if (!org_id) return res.status(400).json({ error: 'org_id is required' })

    const seatCount = Math.max(1, Math.min(100, rawSeats ?? 1))

    const supabase = getServiceClient()
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, billing_email, stripe_customer_id')
      .eq('id', org_id)
      .single()

    if (orgErr || !org) return res.status(404).json({ error: 'Organization not found' })

    const stripe = getStripeClient()
    let stripeCustomerId = org.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: org.billing_email || '',
        name: org.name,
        metadata: { org_id },
      })
      stripeCustomerId = customer.id

      await supabase
        .from('organizations')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', org_id)
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: seatCount }],
      metadata: { org_id, seat_count: String(seatCount) },
      success_url: `${baseUrl}/admin/billing?success=true`,
      cancel_url: `${baseUrl}/admin/billing?canceled=true`,
      allow_promotion_codes: true,
    })

    return res.status(200).json({ checkoutUrl: session.url })
  } catch (err) {
    console.error('[NOVA Billing] Checkout error:', err)
    return res.status(500).json({ error: 'Billing unavailable' })
  }
}
