/**
 * Vector Search — Client-side utility for semantic similarity search
 *
 * Uses the /api/vector-search endpoint to find semantically similar
 * assemblies, elements, proposals, etc. via pgvector embeddings.
 *
 * Also provides embedAndStore() for generating and storing embeddings
 * when users create new database items or proposals.
 */

import { supabase } from './supabase';

// ── Helpers ──

const getAccessToken = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
};

// ── Search ──

/**
 * Search for semantically similar items in the embeddings database.
 *
 * @param {string} query — Natural language search text
 * @param {Object} options
 * @param {string[]} options.kinds — Filter by kind: 'seed_element', 'user_element', 'assembly', 'proposal', 'spec'
 * @param {number} options.limit — Max results (default 10)
 * @param {number} options.threshold — Min similarity score 0-1 (default 0.3)
 * @returns {Promise<{ results: Array<{ id, kind, source_id, content, metadata, similarity }> }>}
 */
export async function searchSimilar(query, options = {}) {
  const { kinds, limit = 10, threshold = 0.3 } = options;
  const token = await getAccessToken();
  if (!token) return { results: [] };

  try {
    const resp = await fetch('/api/vector-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, kinds, limit, threshold }),
    });

    if (!resp.ok) {
      console.warn('[vectorSearch] Search failed:', resp.status);
      return { results: [] };
    }

    return resp.json();
  } catch (err) {
    console.warn('[vectorSearch] Search error:', err.message);
    return { results: [] };
  }
}

// ── Embed & Store ──

/**
 * Generate embeddings for texts and store them in the database.
 * Used when users create new elements, assemblies, or proposals.
 *
 * @param {string[]} texts — Texts to embed
 * @param {Object[]} metadata — Metadata for each text (must include sourceId)
 * @param {string} kind — Embedding kind: 'user_element', 'assembly', 'proposal', 'spec'
 * @param {string} userId — User ID for scoping
 */
export async function embedAndStore(texts, metadata, kind, userId) {
  const token = await getAccessToken();
  if (!token || !texts.length) return;

  try {
    // Step 1: Generate embeddings via API
    const embedResp = await fetch('/api/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ texts }),
    });

    if (!embedResp.ok) {
      console.warn('[vectorSearch] Embed failed:', embedResp.status);
      return;
    }

    const { embeddings } = await embedResp.json();

    // Step 2: Store in Supabase via client SDK
    // Process one at a time to handle upsert properly
    for (let i = 0; i < texts.length; i++) {
      const record = {
        kind,
        source_id: metadata[i].sourceId,
        user_id: userId,
        content: texts[i],
        metadata: metadata[i],
        embedding: `[${embeddings[i].join(',')}]`,
      };

      // Delete existing embedding for this source, then insert
      await supabase
        .from('embeddings')
        .delete()
        .eq('kind', kind)
        .eq('source_id', metadata[i].sourceId)
        .eq('user_id', userId);

      const { error } = await supabase
        .from('embeddings')
        .insert(record);

      if (error) {
        console.warn(`[vectorSearch] Store failed for ${metadata[i].sourceId}:`, error.message);
      }
    }
  } catch (err) {
    console.warn('[vectorSearch] embedAndStore error:', err.message);
  }
}

/**
 * Delete embeddings for a source item (e.g., when user deletes an element).
 *
 * @param {string} sourceId — The source record ID
 * @param {string} kind — The embedding kind
 */
export async function deleteEmbedding(sourceId, kind) {
  if (!supabase) return;
  try {
    await supabase
      .from('embeddings')
      .delete()
      .eq('kind', kind)
      .eq('source_id', sourceId);
  } catch (err) {
    console.warn('[vectorSearch] Delete error:', err.message);
  }
}
