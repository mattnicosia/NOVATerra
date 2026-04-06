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
      // Allow shrinkage up to 30% (orphan cleanup can remove some entries at once).
      // Block if local is less than 70% of cloud — that's genuine data loss.
      if (cloudLen > 2 && data.length < Math.ceil(cloudLen * 0.7)) {
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
          const { useOrgStore } = await import("@/stores/orgStore");
          const orgId2 = useOrgStore.getState().org?.id || "solo";
          const lsRaw = localStorage.getItem(`bldg-deleted-ids-${userId2}-${orgId2}`);
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
      const project = cleanData?.project || {};

      // Atomic write: blob + normalized columns in a single Postgres transaction
      const { error } = await supabase.rpc("save_estimate", {
        p_user_id: userId,
        p_org_id: scope?.org_id || null,
        p_estimate_id: estimateId,
        p_data: cleanData,
        p_project_name: project.name || "",
        p_status: project.status || "Draft",
        p_client: project.client || "",
        p_bid_due: project.bidDue || null,
        p_grand_total: project.grandTotal ? parseFloat(project.grandTotal) || null : null,
        p_building_type: project.buildingType || "",
        p_work_type: project.workType || "",
        p_project_sf: project.projectSF || "",
        p_estimate_number: project.estimateNumber || "",
        p_visibility: visibility,
        p_assigned_to: assignedTo || null,
      });
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

/**
 * Sync an index entry's metadata to normalized columns on user_estimates.
 * Lightweight column-only update — does NOT touch the JSONB blob.
 * Called by updateIndexEntry() to keep normalized columns in sync.
 */
export const syncIndexColumns = async (estimateId, updates) => {
  if (!isReady()) return;
  // Map index field names to column names
  const columnMap = {
    name: "project_name",
    status: "status",
    client: "client",
    bidDue: "bid_due",
    grandTotal: "grand_total",
    buildingType: "building_type",
    workType: "work_type",
    projectSF: "project_sf",
    estimateNumber: "estimate_number",
    visibility: "visibility",
    assignedTo: "assigned_to",
  };
  const row = { last_modified: new Date().toISOString() };
  for (const [jsKey, colName] of Object.entries(columnMap)) {
    if (jsKey in updates) {
      let val = updates[jsKey];
      if (jsKey === "grandTotal" && val !== null && val !== undefined) val = parseFloat(val) || null;
      row[colName] = val ?? null;
    }
  }
  if (Object.keys(row).length <= 1) return; // only last_modified, no real changes

  try {
    const { error } = await supabase
      .from("user_estimates")
      .update(row)
      .eq("estimate_id", estimateId)
      .eq("user_id", getUserId());
    if (error) console.warn(`[cloudSync] syncIndexColumns("${estimateId}") failed:`, error.message);
  } catch (err) {
    console.warn(`[cloudSync] syncIndexColumns("${estimateId}") error:`, err.message);
  }
};
