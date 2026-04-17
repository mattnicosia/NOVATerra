// historyIndexer — Cross-estimate memory via pgvector.
//
// Indexes estimate line items and project-level rollups to the embeddings
// table so NOVA can answer "what did I pay for framing on the last 5 projects?"
// across the user's entire history, not just the currently-open estimate.
//
// Two kinds added to the embeddings table:
//   - estimate_item — one row per line item with description + code + costs
//   - user_estimate — one row per estimate with project-level summary
//
// Source IDs use composite keys to allow per-estimate cleanup:
//   estimate_item: `${estimateId}:${itemId}`
//   user_estimate: `${estimateId}`

import { supabase } from "@/utils/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

const EMBED_BATCH = 100;
const INDEX_DEBOUNCE_MS = 30_000;

const pendingTimers = new Map(); // estimateId → setTimeout handle

// ─── Helpers ─────────────────────────────────────────────────────

function getToken() {
  return supabase?.auth?.getSession?.().then(r => r?.data?.session?.access_token) || Promise.resolve(null);
}

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
  return parts.join(" · ").slice(0, 500); // cap to keep tokens tight
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

  // Summarize top 5 divisions by cost
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

// ─── Core indexing ──────────────────────────────────────────────

async function embedTexts(texts) {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const resp = await fetch("/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ texts }),
  });
  if (!resp.ok) throw new Error(`Embed failed: ${resp.status}`);
  const data = await resp.json();
  return data.embeddings;
}

async function upsertBatch(records) {
  if (!records.length) return { ok: 0, failed: 0 };
  // Delete-then-insert pattern matches existing embedAndStore.
  // We batch deletes by composite keys to minimize roundtrips.
  const kinds = [...new Set(records.map(r => r.kind))];
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error("No authenticated user");

  for (const kind of kinds) {
    const ids = records.filter(r => r.kind === kind).map(r => r.source_id);
    if (!ids.length) continue;
    await supabase.from("embeddings").delete().eq("kind", kind).eq("user_id", userId).in("source_id", ids);
  }

  const { error } = await supabase.from("embeddings").insert(records);
  if (error) {
    console.warn("[historyIndexer] insert failed:", error.message);
    return { ok: 0, failed: records.length };
  }
  return { ok: records.length, failed: 0 };
}

// Index one estimate: all its items + the estimate rollup.
// Returns { items: N, estimate: 1, skipped }.
export async function indexEstimate(estimateId, project, items) {
  if (!estimateId) return { skipped: "no estimateId" };
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return { skipped: "not signed in" };

  const list = Array.isArray(items) ? items.filter(i => i && i.id && i.description) : [];
  const projectForMeta = { ...project, estimateId };

  // Build texts + metadata
  const itemTexts = list.map(itemToText);
  const itemMetas = list.map(it => itemMetadata(it, projectForMeta));
  const itemSourceIds = list.map(it => `${estimateId}:${it.id}`);

  const estText = estimateToText(project, list);
  const estMeta = estimateMetadata(project, list, estimateId);

  // Embed in batches of 100 (OpenAI limit)
  const allTexts = [...itemTexts, estText];
  const embeddings = [];
  for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
    const batch = allTexts.slice(i, i + EMBED_BATCH);
    try {
      const vecs = await embedTexts(batch);
      embeddings.push(...vecs);
    } catch (err) {
      console.warn("[historyIndexer] embed batch failed:", err.message);
      return { skipped: err.message };
    }
  }

  const records = [];
  for (let i = 0; i < list.length; i++) {
    records.push({
      kind: "estimate_item",
      source_id: itemSourceIds[i],
      user_id: userId,
      content: itemTexts[i],
      metadata: itemMetas[i],
      embedding: `[${embeddings[i].join(",")}]`,
    });
  }
  records.push({
    kind: "user_estimate",
    source_id: estimateId,
    user_id: userId,
    content: estText,
    metadata: estMeta,
    embedding: `[${embeddings[embeddings.length - 1].join(",")}]`,
  });

  const { ok, failed } = await upsertBatch(records);
  return { items: list.length, estimate: 1, ok, failed };
}

// Debounced indexing — call after each save, coalesces rapid edits.
export function scheduleIndexEstimate(estimateId, project, items) {
  if (!estimateId) return;
  if (pendingTimers.has(estimateId)) clearTimeout(pendingTimers.get(estimateId));
  const handle = setTimeout(() => {
    pendingTimers.delete(estimateId);
    indexEstimate(estimateId, project, items).catch(err => {
      console.warn("[historyIndexer] background index failed:", err?.message || err);
    });
  }, INDEX_DEBOUNCE_MS);
  pendingTimers.set(estimateId, handle);
}

// Remove embeddings for a deleted estimate.
export async function removeEstimateEmbeddings(estimateId) {
  if (!estimateId) return;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  try {
    await supabase
      .from("embeddings")
      .delete()
      .eq("user_id", userId)
      .in("kind", ["estimate_item", "user_estimate"])
      .like("source_id", `${estimateId}%`);
  } catch (err) {
    console.warn("[historyIndexer] remove failed:", err?.message || err);
  }
}

// One-time backfill: iterate all estimates in the index and index each.
// Call from browser console: `window.__novaBackfillHistory()`
export async function backfillAll(onProgress) {
  const { loadEstimate } = await import("@/hooks/persistenceEstimate");
  const index = useEstimatesStore.getState().estimatesIndex || [];
  const total = index.length;
  const results = [];
  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    onProgress?.(i + 1, total, entry.name || entry.id);
    try {
      const loaded = await loadEstimate(entry.id);
      if (!loaded) continue;
      const project = loaded.project || loaded.projectData || loaded.proj || null;
      const items = loaded.items || [];
      const r = await indexEstimate(entry.id, project, items);
      results.push({ estimateId: entry.id, ...r });
    } catch (err) {
      results.push({ estimateId: entry.id, error: err?.message || String(err) });
    }
  }
  return { total, results };
}

// Expose to console for manual backfill. Safe — requires authenticated user.
if (typeof window !== "undefined") {
  window.__novaBackfillHistory = (onProgress) => backfillAll(onProgress || ((i, n, name) => console.log(`[backfill] ${i}/${n} ${name}`)));
}
