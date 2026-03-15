import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

const BUILDING_TYPE_MULTIPLIERS: Record<string, number> = {
  office: 1.00, residential: 0.92, retail: 0.95,
  industrial: 0.85, healthcare: 1.20, education: 1.05, hospitality: 1.10,
}

export interface BenchmarkResult {
  csi_code: string
  csi_title: string
  unit: string
  p10: number
  p50: number
  p90: number
  sample_count: number
  display_flag: 'market' | 'indicative' | 'insufficient_data' | 'national_fallback' | 'no_data'
  metro_area: string | null
  state: string
  building_type_applied: string | null
  spec_section: string | null
  spec_title: string | null
  last_updated: string | null
}

export interface BenchmarkQuery {
  csiCode: string
  metro?: string
  state?: string
  buildingType?: string
  unit?: string
  plan: 'free' | 'professional' | 'enterprise'
}

export async function fetchBenchmark(query: BenchmarkQuery): Promise<BenchmarkResult | null> {
  const supabase = getServiceClient()

  const effectiveMetro = query.plan === 'free' ? null : (query.metro ?? null)
  const effectiveState = query.plan === 'free' ? 'National' : (query.state ?? 'National')

  const { data, error } = await supabase.rpc('get_benchmark', {
    p_csi_code: query.csiCode,
    p_metro: effectiveMetro,
    p_state: effectiveState,
    p_unit: query.unit ?? null,
  })

  if (error || !data || data.length === 0) {
    const { data: fallback, error: fbError } = await supabase.rpc('get_benchmark', {
      p_csi_code: query.csiCode,
      p_metro: null,
      p_state: 'National',
      p_unit: query.unit ?? null,
    })
    if (fbError || !fallback || fallback.length === 0) return null
    return buildResult(fallback[0], query.buildingType ?? null, true)
  }

  return buildResult(data[0], query.buildingType ?? null, false)
}

function buildResult(
  row: {
    csi_code: string; csi_title: string; unit: string
    p10: number; p50: number; p90: number; sample_count: number
    metro_area: string | null; state: string
    spec_section: string | null; spec_title: string | null
    last_updated: string | null
  },
  buildingType: string | null,
  isNationalFallback: boolean
): BenchmarkResult {
  const multiplier = buildingType ? (BUILDING_TYPE_MULTIPLIERS[buildingType] ?? 1.0) : 1.0

  const display_flag: BenchmarkResult['display_flag'] = isNationalFallback
    ? 'national_fallback'
    : row.sample_count >= 30 ? 'market'
    : row.sample_count >= 5 ? 'indicative'
    : 'insufficient_data'

  return {
    csi_code: row.csi_code, csi_title: row.csi_title, unit: row.unit,
    p10: Number((row.p10 * multiplier).toFixed(2)),
    p50: Number((row.p50 * multiplier).toFixed(2)),
    p90: Number((row.p90 * multiplier).toFixed(2)),
    sample_count: row.sample_count, display_flag,
    metro_area: row.metro_area, state: row.state,
    building_type_applied: buildingType,
    spec_section: row.spec_section, spec_title: row.spec_title,
    last_updated: row.last_updated,
  }
}
