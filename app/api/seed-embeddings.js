// Vercel Serverless Function — Admin: Seed Embedding Migration
//
// One-time endpoint to generate and store embeddings for all SEED_ELEMENTS
// and SEED_ASSEMBLIES. Protected by ADMIN_SECRET.
//
// POST { action: "seed" }
// Headers: { Authorization: "Bearer <ADMIN_SECRET>" }

import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Admin auth only
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized — admin secret required" });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OpenAI API key not configured" });

  const { action, elements, assemblies } = req.body || {};
  if (action !== "seed") return res.status(400).json({ error: 'Expected action: "seed"' });
  if (!elements || !Array.isArray(elements)) {
    return res.status(400).json({ error: "Missing elements array — pass SEED_ELEMENTS in request body" });
  }

  try {
    let totalEmbedded = 0;
    const errors = [];

    // ── Embed seed elements in batches ──
    for (let i = 0; i < elements.length; i += BATCH_SIZE) {
      const batch = elements.slice(i, i + BATCH_SIZE);
      const texts = batch.map(el => `${el.code} ${el.name} (${el.unit}) — Trade: ${el.trade || "general"}`);

      // Generate embeddings
      const embedResp = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: MODEL, input: texts }),
      });

      if (!embedResp.ok) {
        const errText = await embedResp.text();
        errors.push(`Batch ${i}: OpenAI error ${embedResp.status} — ${errText}`);
        continue;
      }

      const embedData = await embedResp.json();
      const embeddings = embedData.data.sort((a, b) => a.index - b.index).map(d => d.embedding);

      // Upsert into database
      const records = batch.map((el, j) => ({
        kind: "seed_element",
        source_id: el.id,
        user_id: null, // Shared data
        content: texts[j],
        metadata: {
          code: el.code,
          name: el.name,
          unit: el.unit,
          trade: el.trade,
          material: el.material,
          labor: el.labor,
          equipment: el.equipment,
          subcontractor: el.subcontractor || 0,
        },
        embedding: `[${embeddings[j].join(",")}]`, // pgvector expects string format
      }));

      // Use raw SQL for upsert since supabase-js doesn't handle vector type well
      for (const record of records) {
        const { error } = await supabaseAdmin
          .from("embeddings")
          .upsert(record, { onConflict: "kind,source_id" })
          .select();

        if (error) {
          // If onConflict doesn't work due to unique index definition, try delete+insert
          if (error.code === "23505" || error.message?.includes("unique")) {
            await supabaseAdmin
              .from("embeddings")
              .delete()
              .eq("kind", record.kind)
              .eq("source_id", record.source_id)
              .is("user_id", null);
            const { error: insertError } = await supabaseAdmin.from("embeddings").insert(record);
            if (insertError) {
              errors.push(`Element ${record.source_id}: ${insertError.message}`);
              continue;
            }
          } else {
            errors.push(`Element ${record.source_id}: ${error.message}`);
            continue;
          }
        }
        totalEmbedded++;
      }

      console.log(`[seed-embeddings] Batch ${i}-${i + batch.length}: ${batch.length} elements embedded`);
    }

    // ── Embed seed assemblies ──
    if (assemblies && Array.isArray(assemblies)) {
      for (const asm of assemblies) {
        const elemList = (asm.elements || []).map(e => e.desc).join(", ");
        const text = `${asm.code} ${asm.name} — ${asm.description || ""} — Components: ${elemList}`;

        const embedResp = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: MODEL, input: [text] }),
        });

        if (!embedResp.ok) {
          errors.push(`Assembly ${asm.id}: OpenAI error ${embedResp.status}`);
          continue;
        }

        const embedData = await embedResp.json();
        const embedding = embedData.data[0].embedding;

        const record = {
          kind: "seed_assembly",
          source_id: asm.id,
          user_id: null,
          content: text,
          metadata: {
            code: asm.code,
            name: asm.name,
            description: asm.description,
            elementCount: (asm.elements || []).length,
          },
          embedding: `[${embedding.join(",")}]`,
        };

        // Delete existing + insert (safe upsert for vector data)
        await supabaseAdmin
          .from("embeddings")
          .delete()
          .eq("kind", record.kind)
          .eq("source_id", record.source_id)
          .is("user_id", null);

        const { error } = await supabaseAdmin.from("embeddings").insert(record);
        if (error) {
          errors.push(`Assembly ${asm.id}: ${error.message}`);
        } else {
          totalEmbedded++;
        }
      }
    }

    return res.status(200).json({
      ok: true,
      totalEmbedded,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("[seed-embeddings] Failed:", err.message);
    return res.status(500).json({ error: "Seed embedding failed", detail: err.message });
  }
}
