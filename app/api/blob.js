// Vercel Serverless Function — Supabase Storage signed-URL broker
//
// Instead of proxying file data through Vercel (which has a 4.5MB body limit),
// this function creates signed upload/download URLs so the client can transfer
// files directly to/from Supabase Storage (no size limit).
//
// POST  { path }         → creates signed upload URL (client PUTs file directly)
// GET   ?path=xxx        → creates signed download URL (client GETs file directly)
// DELETE { path }        → deletes the blob

import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';

const BUCKET = 'blobs';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseAdmin) return res.status(500).json({ error: 'Storage not configured' });

  // Verify user
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── SIGN UPLOAD URL (POST) ──
  if (req.method === 'POST') {
    const { path } = req.body || {};
    if (!path) return res.status(400).json({ error: 'Missing path' });

    // Scope path to user's folder
    const fullPath = `${user.id}/${path}`;

    try {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUploadUrl(fullPath, { upsert: true });

      if (error) throw error;

      return res.status(200).json({
        signedUrl: data.signedUrl,
        token: data.token,
        storagePath: fullPath,
      });
    } catch (err) {
      console.error('[blob] Signed upload URL failed:', err.message);
      return res.status(500).json({ error: 'Failed to create upload URL' });
    }
  }

  // ── SIGN DOWNLOAD URL (GET) ──
  // Optional query params for Supabase Image Transformations (served via CDN):
  //   ?w=1200   — resize width in px
  //   ?h=800    — resize height in px
  //   ?q=80     — quality 20-100 (default 80)
  //   ?fmt=webp — output format (webp/png/jpg/origin)
  //   ?fit=contain|cover|fill
  // When any transform param is present we get a CDN-cached rendered URL.
  if (req.method === 'GET') {
    const { path, w, h, q, fmt, fit } = req.query || {};
    if (!path) return res.status(400).json({ error: 'Missing path' });

    // Verify the path belongs to this user
    if (!path.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build transform options — skip entirely if no params (saves a transform hit)
    const hasTransform = !!(w || h || q || fmt || fit);
    let transform;
    if (hasTransform) {
      transform = {};
      if (w) transform.width = Math.min(4096, Math.max(1, parseInt(w, 10) || 0));
      if (h) transform.height = Math.min(4096, Math.max(1, parseInt(h, 10) || 0));
      if (q) transform.quality = Math.min(100, Math.max(20, parseInt(q, 10) || 80));
      if (fmt && ["webp", "png", "jpg", "origin"].includes(String(fmt))) transform.format = String(fmt);
      if (fit && ["contain", "cover", "fill"].includes(String(fit))) transform.resize = String(fit);
    }

    // 24h expiry — longer TTL = more CDN cache hits on the same URL
    const EXPIRY_SEC = 86400;

    try {
      const opts = transform ? { transform } : undefined;
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, EXPIRY_SEC, opts);

      if (error) throw error;

      // Hint the client/browser to cache the URL response itself briefly so
      // rapid reloads don't re-hit this function.
      res.setHeader("Cache-Control", "private, max-age=300");
      return res.status(200).json({ signedUrl: data.signedUrl, cached: !!transform, expiresIn: EXPIRY_SEC });
    } catch (err) {
      console.error('[blob] Signed download URL failed:', err.message);
      return res.status(404).json({ error: 'Not found' });
    }
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { path } = req.body || {};
    if (!path) return res.status(400).json({ error: 'Missing path' });

    if (!path.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove([path]);

      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[blob] Delete failed:', err.message);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
