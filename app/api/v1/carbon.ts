import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { authenticateApiKey, checkRateLimit } from '../../src/lib/nova-core/apiAuth'
import { logApiUsage } from '../../src/lib/nova-core/apiUsage'
import { getTrialStatus } from '../../src/lib/nova-core/trialGuard'

const CSI_CODE_REGEX = /^\d{2}\.\d{3}$/
const TREES_KG_CO2_PER_YEAR = 21.77

function getServiceClient() {
  const url = process.env.NOVA_CORE_SUPABASE_URL
  const key = process.env.NOVA_CORE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NOVA_CORE_SUPABASE_URL or NOVA_CORE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

function deriveCarbonTier(totalCo2e: number): string {
  if (totalCo2e <= 5) return 'low'
  if (totalCo2e <= 50) return 'moderate'
  if (totalCo2e <= 200) return 'high'
  return 'very_high'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const startMs = Date.now()

  const keyCtx = await authenticateApiKey(req.headers.authorization ?? null)
  if (!keyCtx) return res.status(401).json({ error: 'Invalid or missing API key' })

  const trial = await getTrialStatus(keyCtx.orgId)
  if (trial.expired) {
    return res.status(402).json({
      error: 'Trial expired',
      message: 'Your 21-day free trial has ended. Subscribe to continue.',
      upgrade_url: (process.env.VERCEL_URL || '') + '/admin/billing',
    })
  }

  // Enterprise plan gate — before rate limit
  if (keyCtx.plan !== 'enterprise') {
    return res.status(403).json({
      error: 'Carbon API requires Enterprise plan',
      upgrade_url: 'https://novaterra.ai/pricing',
    })
  }

  const rateCheck = await checkRateLimit(keyCtx.apiKeyId, keyCtx.rateLimitRpm, keyCtx.rateLimitRpd)
  if (!rateCheck.allowed) {
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId, endpoint: '/api/v1/carbon',
      method: 'GET', responseMs: Date.now() - startMs, statusCode: 429, cacheHit: false })
    return res.status(429).json({ error: 'Rate limit exceeded',
      retry_after: rateCheck.retryAfterSeconds, limit_type: rateCheck.limitType })
  }

  const { csi_code, quantity, unit } = req.query as Record<string, string>

  if (!csi_code) return res.status(400).json({ error: 'csi_code is required' })
  if (!CSI_CODE_REGEX.test(csi_code)) return res.status(400).json({
    error: 'Invalid csi_code format. Expected XX.XXX (e.g. "03.300")'
  })

  let parsedQuantity: number | null = null
  if (quantity != null) {
    parsedQuantity = parseFloat(quantity)
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a valid positive number' })
    }
  }

  try {
    const supabase = getServiceClient()

    const sectionPrefix = csi_code.substring(0, 5)

    const { data, error } = await supabase
      .from('carbon_data')
      .select(`
        id, material_name, canonical_unit, total_co2e,
        ice_co2e, a1_a3_co2e, a4_co2e, a5_co2e,
        active_co2e_source, data_vintage,
        csi_code_id
      `)
      .order('total_co2e', { ascending: false })
      .limit(50)

    if (error) throw error

    // Join manually: find matching csi_codes
    const { data: csiRows, error: csiError } = await supabase
      .from('csi_codes')
      .select('id, section, title')
      .or(`section.eq.${csi_code},section.like.${sectionPrefix}%`)

    if (csiError) throw csiError

    const csiMap = new Map<string, { section: string; title: string }>()
    for (const row of csiRows ?? []) {
      csiMap.set(row.id, { section: row.section, title: row.title })
    }

    // Find best match: exact section match first, then section-level fallback
    type CarbonRow = NonNullable<typeof data>[number]
    let bestMatch: CarbonRow | null = null
    let matchedCsi: { section: string; title: string } | null = null

    // Exact match first
    for (const row of data ?? []) {
      const csi = csiMap.get(row.csi_code_id)
      if (csi && csi.section === csi_code) {
        bestMatch = row
        matchedCsi = csi
        break
      }
    }

    // Section-level fallback
    if (!bestMatch) {
      for (const row of data ?? []) {
        const csi = csiMap.get(row.csi_code_id)
        if (csi && csi.section.substring(0, 5) === sectionPrefix) {
          bestMatch = row
          matchedCsi = csi
          break
        }
      }
    }

    const responseMs = Date.now() - startMs

    if (!bestMatch || !matchedCsi) {
      logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
        endpoint: '/api/v1/carbon', method: 'GET', csiCode: csi_code,
        responseMs, statusCode: 404, cacheHit: false })
      return res.status(404).json({ error: `No carbon data found for CSI code ${csi_code}` })
    }

    const carbonIntensity = Number(bestMatch.total_co2e)
    const absoluteKgCo2e = parsedQuantity != null
      ? Number((carbonIntensity * parsedQuantity).toFixed(2))
      : null
    const treeEquivalent = absoluteKgCo2e != null
      ? Number((absoluteKgCo2e / TREES_KG_CO2_PER_YEAR).toFixed(1))
      : null

    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/carbon', method: 'GET', csiCode: csi_code,
      responseMs, statusCode: 200, cacheHit: false })

    return res.status(200).json({
      csi_code: matchedCsi.section,
      material_name: bestMatch.material_name ?? matchedCsi.title,
      carbon_intensity_kgco2e_per_unit: carbonIntensity,
      unit: unit ?? bestMatch.canonical_unit,
      absolute_kgco2e: absoluteKgCo2e,
      tree_equivalent: treeEquivalent,
      quantity_used: parsedQuantity,
      carbon_tier: deriveCarbonTier(carbonIntensity),
      data_source: bestMatch.active_co2e_source,
      response_ms: responseMs,
    })
  } catch (err) {
    console.error('[/api/v1/carbon] Error:', err)
    const responseMs = Date.now() - startMs
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/carbon', method: 'GET', csiCode: csi_code,
      responseMs, statusCode: 500, cacheHit: false })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
