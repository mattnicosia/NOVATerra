import { createClient } from '@supabase/supabase-js'
import { checkAndFlagOverage } from './billingHelper'

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export interface UsageLogParams {
  apiKeyId: string
  orgId: string
  endpoint: string
  method: string
  csiCode?: string
  metroArea?: string
  responseMs: number
  statusCode: number
  cacheHit: boolean
}

export function logApiUsage(params: UsageLogParams): void {
  ;(async () => {
    try {
      const supabase = getServiceClient()

      await supabase.from('api_usage_log').insert({
        api_key_id: params.apiKeyId,
        org_id: params.orgId,
        endpoint: params.endpoint,
        method: params.method,
        csi_code: params.csiCode ?? null,
        metro_area: params.metroArea ?? null,
        response_ms: params.responseMs,
        status_code: params.statusCode,
        cache_hit: params.cacheHit,
      })

      await supabase.rpc('increment_api_usage', {
        p_key_id: params.apiKeyId,
        p_org_id: params.orgId,
      })

      checkAndFlagOverage(params.orgId, params.apiKeyId)
    } catch (err) {
      console.error('[NOVA API Usage] Logging failed (non-fatal):', err)
    }
  })()
}
