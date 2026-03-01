// Vercel Serverless Function — Semantic Vector Search
//
// Embeds a query string, then searches the pgvector embeddings table
// via the match_embeddings RPC function.
//
// POST { query, kinds?, limit?, threshold? }
// Returns: { results: [{ id, kind, source_id, content, metadata, similarity }] }

import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' });

  // Verify user
  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const { query, kinds, limit = 10, threshold = 0.3 } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query string' });
  }

  try {
    // Step 1: Embed the query
    const embedResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: [query] }),
    });

    if (!embedResponse.ok) {
      const err = await embedResponse.text();
      console.error('[vector-search] OpenAI embed error:', embedResponse.status, err);
      return res.status(502).json({ error: 'Failed to embed query' });
    }

    const embedData = await embedResponse.json();
    const queryEmbedding = embedData.data[0].embedding;

    // Step 2: Search via Supabase RPC
    const { data, error } = await supabaseAdmin.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      match_kinds: kinds || null,
      match_user_id: user.id,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('[vector-search] RPC error:', error.message);
      return res.status(500).json({ error: 'Search query failed' });
    }

    return res.status(200).json({ results: data || [] });
  } catch (err) {
    console.error('[vector-search] Failed:', err.message);
    return res.status(500).json({ error: 'Vector search failed' });
  }
}
