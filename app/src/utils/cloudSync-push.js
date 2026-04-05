/**
 * Cloud Sync — Push operations (pushData, pushEstimate, deleteEstimate).
 * Extracted from cloudSync.js.
 */

import { supabase } from "./supabase";
import { getUserId, getScope, applyScope, isReady, markSynced, markError, markSyncing } from "./cloudSync-auth";
import { withRetry } from "./cloudSync-retry";
import { stripAndUploadBlobs, stripMasterBlobs } from "./cloudSync-blobs";

// ---------- push operations ----------

/**
 * Upsert a key-value pair to the user_data table.
 * Used for: settings, master, assemblies, index
 */
export const pushData = async (key, data) => {
  if (!isReady()) return;

  // ─── DATA LOSS PREVENTION: Never push empty index to cloud ───
  if (key === "index" && Array.isArray(data) && data.length === 0) {
    console.error("[cloudSync] DATA LOSS PREVENTION: Refusing to push empty index to cloud.");
    return;
  }

  // ─── DATA LOSS PREVENTION: High-water-mark guard ───
  // Never push an index that is SHORTER than what's already in the cloud,
  // unless the difference is exactly 1 (a single delete). This prevents
  // stale/partial local state from overwriting a complete cloud index.
  if (key === "index" && Array.isArray(data)) {
    try {
      const userId = getUserId();
      const scope = getScope();
      let cloudQuery = supabase.from("user_data").select("data").eq("user_id", userId).eq("key", "index");
      cloudQuery = scope?.org_id ? cloudQuery.eq("org_id", scope.org_id) : cloudQuery.is("org_id", null);
      const { data: existing } = await cloudQuery.maybeSingle();
      const cloudLen = Array.isArray(existing?.data) ? existing.data.length : 0;
      // Allow shrinkage up to 50% (orphan cleanup can remove many entries at once).
      // Only block if local is less than half of cloud — that's genuine data loss.
      if (cloudLen > 2 && data.length < Math.ceil(cloudLen / 2)) {
        console.error(
          `[cloudSync] DATA LOSS PREVENTION: Refusing to push index with ${data.length} entries ` +
            `(cloud has ${cloudLen}). This looks like data loss. Aborting push.`,
        );
        return;
      }
      // Also merge: if cloud has entries not in our local index, adopt them
      // (but skip entries that were explicitly deleted by the user)
      if (cloudLen > 0 && existing?.data) {
        const localIds = new Set(data.map(e => e.id));
        // Read deleted-IDs from localStorage to avoid resurrecting deleted estimates
        let deletedIds = new Set();
        try {
          const userId2 = getUserId();
          const lsRaw = localStorage.getItem(`bldg-deleted-ids-${userId2}`);
          if (lsRaw) deletedIds = new Set(JSON.parse(lsRaw));
        } catch {
          /* ignore */
        }
        const cloudOnly = existing.data.filter(e => !localIds.has(e.id) && !deletedIds.has(e.id));
        if (cloudOnly.length > 0) {
          console.log(`[cloudSync] INDEX MERGE: adopting ${cloudOnly.length} cloud-only entries before push`);
          data = [...data, ...cloudOnly];
        }
      }
    } catch (hwmErr) {
      // If we can't check, log but allow the push (don't block on guard failure)
      console.warn("[cloudSync] High-water-mark check failed:", hwmErr.message);
    }
  }

  markSyncing();
  try {
    await withRetry(`pushData("${key}")`, async () => {
      const cleanData = key === "master" ? stripMasterBlobs(data) : data;
      // Settings are always user-scoped (never org-scoped)
      const scope = key === "settings" ? null : getScope();
      const userId = getUserId();
      const row = { user_id: userId, key, data: cleanData, updated_at: new Date().toISOString(), ...(scope || {}) };

      // Simple UPSERT — global unique index on (user_id, key)
      const { error } = await supabase
        .from("user_data")
        .upsert(row, { onConflict: "user_id,key" });
      if (error) throw error;
    });
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] pushData("${key}") failed:`, err.message || err);
    markError(err.message);
  }
};

/**
 * Upsert an estimate to the user_estimates table.
 * Uploads blobs to Supabase Storage, strips base64 from DB payload.
 */
export const pushEstimate = async (estimateId, data) => {
  if (!isReady()) {
    console.warn(`[cloudSync] pushEstimate("${estimateId}") SKIPPED — not ready (supabase: ${!!supabase}, userId: ${getUserId()?.slice(0,8) || 'null'})`);
    return;
  }
  console.log(`[cloudSync] pushEstimate("${estimateId}") — pushing to cloud...`);
  markSyncing();
  try {
    await withRetry(`pushEstimate("${estimateId}")`, async () => {
      const cleanData = await stripAndUploadBlobs(estimateId, data);
      const userId = getUserId();
      const scope = getScope();
      // Extract assignedTo from the estimate data to store as a column (for queries)
      const assignedTo = cleanData?.project?.assignedTo || null;
      // Extract visibility for RLS-based access control
      // Default to 'org' when inside an organization so all members can see the estimate.
      // Solo-mode estimates (no org) default to 'private'.
      const visibility = cleanData?.project?.visibility
        || (scope?.org_id ? 'org' : 'private');
      // CRITICAL: Do NOT include deleted_at here. Setting deleted_at: null on every
      // push was the root cause of zombie resurrection — an in-flight auto-save
      // would un-delete rows that deleteEstimate() had just soft-deleted.
      // Only deleteEstimate() should touch the deleted_at column.
      const row = {
        user_id: userId,
        estimate_id: estimateId,
        data: cleanData,
        updated_at: new Date().toISOString(),
        ...(scope || {}),
        ...(assignedTo ? { assigned_to: assignedTo } : {}),
        visibility,
      };

      // Simple UPSERT — global unique index on (user_id, estimate_id)
      const { error } = await supabase
        .from("user_estimates")
        .upsert(row, { onConflict: "user_id,estimate_id" });
      if (error) throw error;
    });
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] pushEstimate("${estimateId}") failed:`, err.message || err);
    markError(err.message);
  }
};

/**
 * Soft-delete an estimate in the cloud (sets deleted_at timestamp).
 * The row stays in the DB but all pull queries filter it out.
 * This prevents resurrection even if the client's IndexedDB is wiped.
 */
export const deleteEstimate = async estimateId => {
  if (!isReady()) return;
  markSyncing();
  try {
    // Soft-delete: SET deleted_at instead of DELETE
    let query = supabase
      .from("user_estimates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("estimate_id", estimateId)
      .eq("user_id", getUserId());

    const scope = getScope();
    query = applyScope(query, scope);

    const { error } = await query;
    if (error) throw error;
    markSynced();
  } catch (err) {
    console.warn(`[cloudSync] deleteEstimate("${estimateId}") failed:`, err.message || err);
    markError();
  }
};
