// ============================================================
// NOVA Core — Admin Auth Endpoint
// POST /api/admin/auth
//
// Receives { secret }, compares to NOVA_ADMIN_SECRET.
// On match: sets httpOnly cookie nova_admin_token, returns 200.
// On mismatch: returns 401 with generic error.
//
// NOVA_CORE_SERVICE_ROLE_KEY is server-side only.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;

  if (!ADMIN_SECRET) {
    console.error('NOVA_ADMIN_SECRET not configured.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { secret } = req.body || {};

  if (!secret || secret !== ADMIN_SECRET) {
    // Generic error — do not confirm what was wrong
    return res.status(401).json({ error: 'Authentication failed' });
  }

  // Set httpOnly cookie
  const cookieValue = ADMIN_SECRET; // In production, use a signed JWT or hash
  const isProduction = process.env.NODE_ENV === 'production';

  res.setHeader('Set-Cookie', [
    `nova_admin_token=${cookieValue}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400${isProduction ? '; Secure' : ''}`,
  ]);

  return res.status(200).json({ success: true });
}
