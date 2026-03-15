import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NOVA_CORE_SUPABASE_URL!,
    process.env.NOVA_CORE_SERVICE_ROLE_KEY!
  )
}

export function checkAndFlagOverage(orgId: string, apiKeyId: string): void {
  // Fire and forget — never blocks
  ;(async () => {
    try {
      const supabase = getServiceClient()

      const { data: org } = await supabase
        .from('organizations')
        .select('api_calls_today')
        .eq('id', orgId)
        .single()

      if (!org) return

      const DAILY_LIMIT = 10000

      if (org.api_calls_today > DAILY_LIMIT) {
        // Flag the most recent unflagged log entry for this key
        await supabase
          .from('api_usage_log')
          .update({ is_overage: true })
          .eq('api_key_id', apiKeyId)
          .eq('is_overage', false)
          .order('created_at', { ascending: false })
          .limit(1)
      }
    } catch (err) {
      console.error('[NOVA BillingHelper] checkAndFlagOverage failed (non-fatal):', err)
    }
  })()
}
