import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export interface TrialStatus {
  expired: boolean
  daysRemaining: number | null
  isDemo: boolean
  isPaying: boolean
}

export async function getTrialStatus(orgId: string): Promise<TrialStatus> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('organizations')
    .select('trial_ends_at, is_paying, is_demo')
    .eq('id', orgId)
    .single()

  if (!data) return { expired: true, daysRemaining: null, isDemo: false, isPaying: false }

  if (data.is_demo || data.is_paying) return {
    expired: false,
    daysRemaining: null,
    isDemo: data.is_demo,
    isPaying: data.is_paying,
  }

  const now = new Date()
  const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null
  const expired = !trialEnd || trialEnd <= now
  const daysRemaining = trialEnd && !expired
    ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return { expired, daysRemaining, isDemo: false, isPaying: false }
}
