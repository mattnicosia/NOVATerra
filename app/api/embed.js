// Vercel Serverless Function — OpenAI Embedding Proxy
//
// Generates text embeddings using OpenAI text-embedding-3-small (1536 dims).
// Used by vector search and when storing new assemblies/proposals.
//
// POST { texts: string[] }  →  { embeddings: number[][] }

import { verifyUser } from './lib/supabaseAdmin.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small'; // 1536 dimensions, $0.02/1M tokens

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth — either user JWT or admin secret
  const authHeader = req.headers.authorization || '';
  const isAdmin = authHeader === `Bearer ${process.env.ADMIN_SECRET}`;
  if (!isAdmin) {
    const user = await verifyUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const { texts } = req.body || {};
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return res.status(400).json({ error: 'Missing texts array' });
  }
  if (texts.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 texts per batch' });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[embed] OpenAI error:', response.status, err);
      return res.status(502).json({ error: `OpenAI API error: ${response.status}` });
    }

    const data = await response.json();
    // OpenAI returns data sorted by index — extract embedding vectors
    const embeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);

    return res.status(200).json({
      embeddings,
      model: MODEL,
      usage: data.usage,
    });
  } catch (err) {
    console.error('[embed] Failed:', err.message);
    return res.status(500).json({ error: 'Embedding generation failed' });
  }
}
