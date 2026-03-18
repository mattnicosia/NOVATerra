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
  if (req.method === 'GET') {
    const { path } = req.query || {};
    if (!path) return res.status(400).json({ error: 'Missing path' });

    // Verify the path belongs to this user
    if (!path.startsWith(`${user.id}/`)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600); // 1-hour expiry

      if (error) throw error;

      return res.status(200).json({ signedUrl: data.signedUrl });
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
