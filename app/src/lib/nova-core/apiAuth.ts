import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export interface ApiKeyContext {
  apiKeyId: string
  orgId: string
  plan: 'free' | 'professional' | 'enterprise'
  rateLimitRpm: number
  rateLimitRpd: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
  limitType?: 'rpm' | 'rpd'
}

export async function authenticateApiKey(
  authHeader: string | null | undefined
): Promise<ApiKeyContext | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const key = authHeader.slice(7).trim()
  if (!key) return null

  const keyHash = crypto.createHash('sha256').update(key).digest('hex')
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, org_id, plan, rate_limit_rpm, rate_limit_rpd')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (error || !data) return null

  return {
    apiKeyId: data.id,
    orgId: data.org_id,
    plan: data.plan as 'free' | 'professional' | 'enterprise',
    rateLimitRpm: data.rate_limit_rpm,
    rateLimitRpd: data.rate_limit_rpd,
  }
}

export async function checkRateLimit(
  apiKeyId: string,
  limitRpm: number,
  limitRpd: number
): Promise<RateLimitResult> {
  const supabase = getServiceClient()

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 86400 * 1000).toISOString()

  const [rpmResult, rpdResult] = await Promise.all([
    supabase
      .from('api_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneMinuteAgo),
    supabase
      .from('api_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneDayAgo),
  ])

  const rpmCount = rpmResult.count ?? 0
  const rpdCount = rpdResult.count ?? 0

  if (rpmCount >= limitRpm) return { allowed: false, retryAfterSeconds: 60, limitType: 'rpm' }
  if (rpdCount >= limitRpd) return { allowed: false, retryAfterSeconds: 86400, limitType: 'rpd' }

  return { allowed: true }
}
