import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient, STRIPE_PRICE_ID, SEAT_PRICE_CENTS } from '../../../src/lib/nova-core/stripe'

export const config = { api: { bodyParser: false } }

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[NOVA Billing] STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  // Read raw body
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  const rawBody = Buffer.concat(chunks)

  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'] as string,
      webhookSecret
    )
  } catch (err) {
    console.error('[NOVA Billing] Webhook signature verification failed:', err)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const supabase = getServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any
        const orgId = session.metadata?.org_id
        const seatCount = parseInt(session.metadata?.seat_count || '1', 10)
        const stripeCustomerId = session.customer as string
        const stripeSubscriptionId = session.subscription as string

        if (orgId) {
          await supabase
            .from('organizations')
            .update({
              is_paying: true,
              seat_count: seatCount,
              mrr_cents: seatCount * SEAT_PRICE_CENTS,
              stripe_customer_id: stripeCustomerId,
            })
            .eq('id', orgId)

          await supabase
            .from('stripe_subscriptions')
            .upsert({
              org_id: orgId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_price_id: STRIPE_PRICE_ID,
              seat_count: seatCount,
              status: 'active',
            }, { onConflict: 'stripe_subscription_id' })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as any
        const newQty = sub.items?.data?.[0]?.quantity ?? 1

        await supabase
          .from('organizations')
          .update({ seat_count: newQty, mrr_cents: newQty * SEAT_PRICE_CENTS })
          .eq('stripe_customer_id', sub.customer)

        await supabase
          .from('stripe_subscriptions')
          .update({
            status: sub.status,
            seat_count: newQty,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any

        await supabase
          .from('organizations')
          .update({ is_paying: false, mrr_cents: 0 })
          .eq('stripe_customer_id', sub.customer)

        await supabase
          .from('stripe_subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any
        console.error('[NOVA Billing] Payment failed for customer:', invoice.customer)

        await supabase
          .from('stripe_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', invoice.customer)

        try {
          const { data: org } = await supabase
            .from('organizations')
            .select('billing_email, name')
            .eq('stripe_customer_id', invoice.customer)
            .single()

          if (org?.billing_email) {
            await fetch('https://api.postmarkapp.com/email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN!,
              },
              body: JSON.stringify({
                From: 'billing@novaterra.ai',
                FromName: 'NOVATerra Billing',
                To: org.billing_email,
                Subject: 'Action required — payment failed for your NOVA Core subscription',
                TextBody: `Your recent payment failed. Please update your payment method:\n\n${process.env.VERCEL_URL || 'https://app-nova-42373ca7.vercel.app'}/admin/billing\n\nIf you need help, reply to this email.`,
              }),
            })
          }
        } catch (e) {
          console.error('[NOVA Billing] Failed to send payment failure email:', e)
        }
        break
      }
    }
  } catch (err) {
    console.error('[NOVA Billing] Webhook handler error:', err)
  }

  return res.status(200).json({ received: true })
}
