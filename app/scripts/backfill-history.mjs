// Server-side backfill for cross-estimate memory.
//
// Equivalent to running `window.__novaBackfillHistory()` in the browser, but
// uses the Supabase service role + direct OpenAI call so it can be run by an
// operator without needing to sign in.
//
// Usage (from app/):
//   node scripts/backfill-history.mjs --user=<uuid>         # backfill one user
//   node scripts/backfill-history.mjs --all                 # backfill everyone
//   node scripts/backfill-history.mjs --user=<uuid> --dry   # preview only
//
// NOTE: keep the text/metadata shape IN SYNC with app/src/utils/historyIndexer.js
// so server-side backfills produce embeddings identical to client-side saves.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load env from .env.vercel-prod ──────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.vercel-prod");
  if (!fs.existsSync(envPath)) {
    console.error(`[backfill] .env.vercel-prod not found at ${envPath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

// ─── Parse args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const userArg = args.find(a => a.startsWith("--user="))?.slice(7);
const allFlag = args.includes("--all");
const dry = args.includes("--dry");

if (!userArg && !allFlag) {
  console.error("Usage: node scripts/backfill-history.mjs --user=<uuid> | --all  [--dry]");
  process.exit(1);
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY })) {
  if (!v) { console.error(`[backfill] Missing env var: ${k}`); process.exit(1); }
}

// ─── Supabase client ─────────────────────────────────────────────
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Text builders (KEEP IN SYNC with app/src/utils/historyIndexer.js) ──
function summarizeCosts(item) {
  const m = Number(item.material || 0);
  const l = Number(item.labor || 0);
  const e = Number(item.equipment || 0);
  const s = Number(item.subcontractor || 0);
  const qty = Number(item.quantity || 1);
  const unit = (m + l + e + s) || 0;
  const total = unit * qty;
  return { unit, total, m, l, e, s, qty };
}

function itemToText(item) {
  const parts = [];
  if (item.description) parts.push(item.description);
  if (item.code) parts.push(`CSI ${item.code}`);
  if (item.division) parts.push(item.division);
  if (item.trade) parts.push(`trade: ${item.trade}`);
  if (item.unit) parts.push(`unit: ${item.unit}`);
  const costs = summarizeCosts(item);
  if (costs.unit > 0) parts.push(`$${costs.unit.toFixed(2)}/${item.unit || "EA"}`);
  if (item.notes) parts.push(item.notes);
  return parts.join(" · ").slice(0, 500);
}

function itemMetadata(item, project) {
  const costs = summarizeCosts(item);
  return {
    estimateId: project?.estimateId || null,
    projectName: project?.name || null,
    buildingType: project?.jobType || project?.buildingType || null,
    projectSF: project?.projectSF || null,
    division: item.division || null,
    trade: item.trade || null,
    code: item.code || null,
    description: item.description || null,
    unit: item.unit || null,
    quantity: costs.qty,
    unitCost: costs.unit,
    lineTotal: costs.total,
    material: costs.m,
    labor: costs.l,
    equipment: costs.e,
    subcontractor: costs.s,
    updatedAt: new Date().toISOString(),
  };
}

function estimateToText(project, items) {
  const parts = [];
  if (project?.name) parts.push(project.name);
  if (project?.jobType) parts.push(project.jobType);
  if (project?.projectSF) parts.push(`${project.projectSF} SF`);
  if (project?.address) parts.push(project.address);
  const byDivision = new Map();
  let total = 0;
  for (const it of items || []) {
    const { total: lineTotal } = summarizeCosts(it);
    total += lineTotal;
    const div = it.division || "Unassigned";
    byDivision.set(div, (byDivision.get(div) || 0) + lineTotal);
  }
  const topDivs = [...byDivision.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topDivs.length) parts.push("top divisions: " + topDivs.map(([d, c]) => `${d} $${Math.round(c).toLocaleString()}`).join(", "));
  if (total > 0) parts.push(`total $${Math.round(total).toLocaleString()}`);
  if (project?.projectSF > 0 && total > 0) parts.push(`$${(total / project.projectSF).toFixed(2)}/SF`);
  parts.push(`${(items || []).length} line items`);
  return parts.join(" · ").slice(0, 500);
}

function estimateMetadata(project, items, estimateId) {
  let total = 0;
  for (const it of items || []) total += summarizeCosts(it).total;
  return {
    estimateId,
    projectName: project?.name || null,
    buildingType: project?.jobType || project?.buildingType || null,
    projectSF: project?.projectSF || null,
    client: project?.client || null,
    architect: project?.architect || null,
    address: project?.address || null,
    totalCost: Math.round(total),
    perSF: project?.projectSF > 0 ? Math.round((total / project.projectSF) * 100) / 100 : null,
    itemCount: (items || []).length,
    updatedAt: new Date().toISOString(),
  };
}

// ─── OpenAI embeddings (batches of up to 100) ────────────────────
async function embedBatch(texts) {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embed ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ─── Core: backfill one estimate ─────────────────────────────────
async function backfillOneEstimate(row, userId) {
  const estimateId = row.estimate_id;
  const data = row.data || {};
  const project = data.project || {};
  const items = (data.items || []).filter(i => i && i.id && i.description);
  if (items.length === 0 && !project?.name) {
    return { estimateId, skipped: "empty estimate", itemsIndexed: 0 };
  }

  const projectForMeta = { ...project, estimateId };
  const itemTexts = items.map(itemToText);
  const itemMetas = items.map(it => itemMetadata(it, projectForMeta));
  const itemSourceIds = items.map(it => `${estimateId}:${it.id}`);

  const estText = estimateToText(project, items);
  const estMeta = estimateMetadata(project, items, estimateId);

  const allTexts = [...itemTexts, estText];
  const embeddings = [];
  for (let i = 0; i < allTexts.length; i += 100) {
    const batch = allTexts.slice(i, i + 100);
    const vecs = await embedBatch(batch);
    embeddings.push(...vecs);
  }

  const records = items.map((it, i) => ({
    kind: "estimate_item",
    source_id: itemSourceIds[i],
    user_id: userId,
    content: itemTexts[i],
    metadata: itemMetas[i],
    embedding: `[${embeddings[i].join(",")}]`,
  }));
  records.push({
    kind: "user_estimate",
    source_id: estimateId,
    user_id: userId,
    content: estText,
    metadata: estMeta,
    embedding: `[${embeddings[embeddings.length - 1].join(",")}]`,
  });

  if (dry) {
    return { estimateId, itemsIndexed: items.length, willInsert: records.length, dry: true };
  }

  // Delete existing embeddings for this estimate, then insert fresh
  await sb.from("embeddings").delete()
    .eq("user_id", userId)
    .in("kind", ["estimate_item", "user_estimate"])
    .like("source_id", `${estimateId}%`);

  // Insert in batches of 200 (Supabase insert limit safe)
  for (let i = 0; i < records.length; i += 200) {
    const { error } = await sb.from("embeddings").insert(records.slice(i, i + 200));
    if (error) throw new Error(`insert failed: ${error.message}`);
  }

  return { estimateId, itemsIndexed: items.length, chunkCount: records.length };
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`[backfill] Target: ${userArg ? `user=${userArg}` : "ALL users"}${dry ? " (DRY RUN)" : ""}`);

  let query = sb.from("user_estimates").select("id, user_id, estimate_id, data, updated_at").is("deleted_at", null);
  if (userArg) query = query.eq("user_id", userArg);

  const { data: rows, error } = await query;
  if (error) { console.error("[backfill] query failed:", error.message); process.exit(1); }

  console.log(`[backfill] Found ${rows.length} estimates`);

  let done = 0, failed = 0, totalItems = 0;
  for (const row of rows) {
    try {
      const result = await backfillOneEstimate(row, row.user_id);
      done++;
      totalItems += result.itemsIndexed || 0;
      console.log(`[${done}/${rows.length}] ${row.estimate_id} — ${result.itemsIndexed ?? 0} items${result.skipped ? ` (${result.skipped})` : ""}`);
    } catch (err) {
      failed++;
      console.error(`[${done + failed}/${rows.length}] ${row.estimate_id} FAILED:`, err.message);
    }
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[backfill] Done in ${seconds}s: ${done} indexed, ${failed} failed, ${totalItems} items total`);
}

main().catch(err => { console.error("[backfill] Fatal:", err); process.exit(1); });
