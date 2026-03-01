// Vercel Serverless Function — Google Cloud Vision OCR Proxy
//
// Sends images to GCV DOCUMENT_TEXT_DETECTION for high-quality text extraction.
// Used as a preprocessing layer before Claude in the NOVA Scan pipeline.
//
// POST { image: <base64> }         → direct base64 mode (< ~3MB images)
// POST { storagePath: <string> }   → signed-URL mode (large images via Supabase Storage)
// Returns: { text: <full_text>, blocks: [{ text, confidence }] }

import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';

const GCV_URL = 'https://vision.googleapis.com/v1/images:annotate';
const BUCKET = 'blobs';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify user
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const gcvKey = process.env.GOOGLE_CLOUD_VISION_KEY;
  if (!gcvKey) return res.status(500).json({ error: 'GCV API key not configured' });

  const { image, storagePath } = req.body || {};
  if (!image && !storagePath) {
    return res.status(400).json({ error: 'Missing image or storagePath' });
  }

  try {
    // Build GCV request
    let imagePayload;

    if (storagePath) {
      // Large image mode: get a signed URL from Supabase Storage, pass to GCV as imageUri
      if (!storagePath.startsWith(`${user.id}/`)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 300); // 5 min expiry
      if (error || !data?.signedUrl) {
        return res.status(404).json({ error: 'Image not found in storage' });
      }
      imagePayload = { source: { imageUri: data.signedUrl } };
    } else {
      // Direct base64 mode — strip data URL prefix if present
      const base64Clean = image.replace(/^data:image\/\w+;base64,/, '');
      imagePayload = { content: base64Clean };
    }

    const gcvResponse = await fetch(`${GCV_URL}?key=${gcvKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: imagePayload,
          features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    });

    if (!gcvResponse.ok) {
      const errText = await gcvResponse.text();
      console.error('[ocr] GCV error:', gcvResponse.status, errText);
      return res.status(502).json({ error: `GCV API error: ${gcvResponse.status}` });
    }

    const gcvData = await gcvResponse.json();
    const annotation = gcvData.responses?.[0]?.fullTextAnnotation;

    if (!annotation) {
      // No text detected — valid result, not an error
      return res.status(200).json({ text: '', blocks: [] });
    }

    // Extract page-level blocks with text and confidence
    const blocks = [];
    if (annotation.pages) {
      for (const page of annotation.pages) {
        for (const block of (page.blocks || [])) {
          const blockText = (block.paragraphs || [])
            .flatMap(p => (p.words || []))
            .map(w => (w.symbols || []).map(s => s.text).join(''))
            .join(' ');
          if (blockText.trim()) {
            blocks.push({
              text: blockText.trim(),
              confidence: block.confidence || 0,
            });
          }
        }
      }
    }

    return res.status(200).json({
      text: annotation.text || '',
      blocks,
    });
  } catch (err) {
    console.error('[ocr] Failed:', err.message);
    return res.status(500).json({ error: 'OCR processing failed' });
  }
}
