import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateApiKey, checkRateLimit } from '../../src/lib/nova-core/apiAuth.js'
import { logApiUsage } from '../../src/lib/nova-core/apiUsage.js'
import { getTrialStatus } from '../../src/lib/nova-core/trialGuard.js'
import { fetchBenchmark } from '../../src/lib/nova-core/benchmarkHelper.js'

const CSI_CODE_REGEX = /^\d{2}\.\d{3}$/
const VALID_BUILDING_TYPES = ['office','residential','retail','industrial','healthcare','education','hospitality']

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

  const rateCheck = await checkRateLimit(keyCtx.apiKeyId, keyCtx.rateLimitRpm, keyCtx.rateLimitRpd)
  if (!rateCheck.allowed) {
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId, endpoint: '/api/v1/benchmark',
      method: 'GET', responseMs: Date.now() - startMs, statusCode: 429, cacheHit: false })
    return res.status(429).json({ error: 'Rate limit exceeded',
      retry_after: rateCheck.retryAfterSeconds, limit_type: rateCheck.limitType })
  }

  const { csi_code, metro, state, building_type, unit } = req.query as Record<string, string>

  if (!csi_code) return res.status(400).json({ error: 'csi_code is required' })
  if (!CSI_CODE_REGEX.test(csi_code)) return res.status(400).json({
    error: 'Invalid csi_code format. Expected XX.XXX (e.g. "03.300")'
  })
  if (building_type && !VALID_BUILDING_TYPES.includes(building_type)) return res.status(400).json({
    error: `Invalid building_type. Valid values: ${VALID_BUILDING_TYPES.join(', ')}`
  })

  try {
    const result = await fetchBenchmark({
      csiCode: csi_code, metro, state, buildingType: building_type,
      unit, plan: keyCtx.plan,
    })

    const responseMs = Date.now() - startMs

    if (!result) {
      logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
        endpoint: '/api/v1/benchmark', method: 'GET', csiCode: csi_code,
        responseMs, statusCode: 404, cacheHit: false })
      return res.status(404).json({ error: `CSI code ${csi_code} not found in NOVA Core library` })
    }

    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/benchmark', method: 'GET', csiCode: csi_code,
      metroArea: metro, responseMs, statusCode: 200, cacheHit: false })

    res.setHeader('X-Nova-Plan', keyCtx.plan)
    res.setHeader('X-Nova-Response-Ms', String(responseMs))
    res.setHeader('Cache-Control', 'public, max-age=300')

    return res.status(200).json({ ...result, response_ms: responseMs })
  } catch (err) {
    console.error('[/api/v1/benchmark] Error:', err)
    const responseMs = Date.now() - startMs
    logApiUsage({ apiKeyId: keyCtx.apiKeyId, orgId: keyCtx.orgId,
      endpoint: '/api/v1/benchmark', method: 'GET', csiCode: csi_code,
      responseMs, statusCode: 500, cacheHit: false })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
