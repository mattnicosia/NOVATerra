import Stripe from 'stripe'

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' })
}

export const SEAT_PRICE_CENTS = 29900

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? ''

export function getMrrCents(seatCount: number): number {
  return seatCount * SEAT_PRICE_CENTS
}

export const RATE_LIMITS = { rpm: 300, rpd: 10000 }
