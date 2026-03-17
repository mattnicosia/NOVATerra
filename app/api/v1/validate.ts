import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateApiKey, checkRateLimit } from '../../src/lib/nova-core/apiAuth.js'
import { logApiUsage } from '../../src/lib/nova-core/apiUsage.js'
import { getTrialStatus } from '../../src/lib/nova-core/trialGuard.js'
import { fetchBenchmark } from '../../src/lib/nova-core/benchmarkHelper.js'

const CSI_CODE_REGEX = /^\d{2}\.\d{3}$/

type PercentileBand = 'very_low' | 'low' | 'market' | 'high' | 'very_high'

const RECOMMENDATIONS: Record<PercentileBand, string> = {
  very_low: 'Verify scope is complete — cost is below P10 market range',
  low: 'Cost is below median — verify all scope items are included',
  market: 'Cost is within normal market range',
  high: 'Cost is above median — verify no duplicate items',
  very_high: 'Verify no duplicate items — cost exceeds P90 market range',
}

function getPercentileBand(cost: number, p10: number, p50: number, p90: number): PercentileBand {
  // Special case: single-sample data where p10 === p50
  if (p10 === p50) {
    const within20 = Math.abs(cost - p50) / p50 <= 0.2
    if (within20) return 'market'
  }

  if (cost < p10) return 'very_low'
  if (cost < p50) return 'low'
  if (cost <= p90) return 'market'
  return 'very_high'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

  const rateCheck = await checkRateLimit(keyCtx.apiKeyId, keyCtx.rateLimitRpm, keyCtx.rateLimitRpd)
  if (!rateCheck.allowed) {
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId, endpoint: '/api/v1/validate',
      method: 'POST', responseMs: Date.now() - startMs, statusCode: 429, cacheHit: false })
    return res.status(429).json({ error: 'Rate limit exceeded',
      retry_after: rateCheck.retryAfterSeconds, limit_type: rateCheck.limitType })
  }

  const { csi_code, unit_cost, unit, metro, building_type } = req.body ?? {}

  if (!csi_code) return res.status(400).json({ error: 'csi_code is required' })
  if (!CSI_CODE_REGEX.test(csi_code)) return res.status(400).json({
    error: 'Invalid csi_code format. Expected XX.XXX (e.g. "03.300")'
  })
  if (unit_cost == null || typeof unit_cost !== 'number' || unit_cost <= 0) {
    return res.status(400).json({ error: 'unit_cost is required and must be a positive number' })
  }

  try {
    const result = await fetchBenchmark({
      csiCode: csi_code, metro, buildingType: building_type,
      unit, plan: keyCtx.plan,
    })

    const responseMs = Date.now() - startMs

    if (!result) {
      logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
        endpoint: '/api/v1/validate', method: 'POST', csiCode: csi_code,
        responseMs, statusCode: 404, cacheHit: false })
      return res.status(404).json({ error: `CSI code ${csi_code} not found in NOVA Core library` })
    }

    const { p10, p50, p90 } = result
    const percentile_band = getPercentileBand(unit_cost, p10, p50, p90)
    const variance_from_p50_pct = Number(((unit_cost - p50) / p50 * 100).toFixed(1))
    const is_outlier = unit_cost < p10 || unit_cost > p90
    const outlier_direction = is_outlier ? (unit_cost < p10 ? 'low' : 'high') : null
    const recommendation = RECOMMENDATIONS[percentile_band]

    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/validate', method: 'POST', csiCode: csi_code,
      metroArea: metro, responseMs, statusCode: 200, cacheHit: false })

    return res.status(200).json({
      csi_code: result.csi_code,
      csi_title: result.csi_title,
      unit: result.unit,
      submitted_cost: unit_cost,
      p10, p50, p90,
      sample_count: result.sample_count,
      percentile_band,
      variance_from_p50_pct,
      is_outlier,
      outlier_direction,
      recommendation,
      display_flag: result.display_flag,
      response_ms: responseMs,
    })
  } catch (err) {
    console.error('[/api/v1/validate] Error:', err)
    const responseMs = Date.now() - startMs
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/validate', method: 'POST', csiCode: csi_code,
      responseMs, statusCode: 500, cacheHit: false })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
