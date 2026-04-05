/**
 * Cloud Sync — Pull operations (pullData, pullEstimate, pullAllEstimates, etc.).
 * Extracted from cloudSync.js.
 */

import { supabase } from "./supabase";
import { getUserId, getScope, isReady } from "./cloudSync-auth";

// ---------- pull operations ----------

/**
 * Pull a key-value pair from the user_data table.
 * Returns the data object or null if not found.
 */
export const pullData = async key => {
  if (!isReady()) return null;
  try {
    const scope = key === "settings" ? null : getScope();

    if (scope?.org_id && key === "index") {
      // ── Special case: estimate index in org mode ──
      // Multiple users may each have their own index row. Fetch ALL rows
      // for this org+key and merge into a deduplicated master index.
      const { data: rows, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("key", "index")
        .eq("org_id", scope.org_id);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;
      // Merge all index arrays, deduplicate by estimate id, keep newest
      const merged = new Map();
      for (const row of rows) {
        const arr = Array.isArray(row.data) ? row.data : [];
        for (const entry of arr) {
          if (!entry?.id) continue;
          const existing = merged.get(entry.id);
          if (!existing || (entry.lastModified || "") > (existing.lastModified || "")) {
            merged.set(entry.id, entry);
          }
        }
      }
      return [...merged.values()];
    }

    if (scope?.org_id) {
      // Org mode for non-index keys: pick the row with the most data
      // (handles shared master data, cost library, etc.)
      const { data: rows, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("key", key)
        .eq("org_id", scope.org_id);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;
      // Return the largest row (most data = most complete)
      let best = null;
      let bestSize = 0;
      for (const row of rows) {
        const d = row.data;
        const size = Array.isArray(d) ? d.length : typeof d === "object" && d ? Object.keys(d).length : 0;
        if (size > bestSize) { best = d; bestSize = size; }
      }
      return best || rows[0]?.data || null;
    }

    // Solo mode
    const { data, error } = await supabase
      .from("user_data")
      .select("data")
      .eq("user_id", getUserId())
      .eq("key", key)
      .is("org_id", null)
      .maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn(`[cloudSync] pullData("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull data with an explicit org_id override (for recovery when org fetch failed).
 * Bypasses getScope() and directly queries the given org.
 */
export const pullDataWithOrgId = async (key, orgId) => {
  if (!isReady()) return null;
  try {
    let query = supabase.from("user_data").select("data").eq("user_id", getUserId()).eq("key", key);
    query = orgId ? query.eq("org_id", orgId) : query.is("org_id", null);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn(`[cloudSync] pullDataWithOrgId("${key}", "${orgId}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull all estimates with an explicit org_id override (for recovery).
 */
export const pullAllEstimatesWithOrgId = async orgId => {
  if (!isReady()) return [];
  try {
    let query = supabase.from("user_estimates").select("estimate_id, data, user_id").is("deleted_at", null);
    if (orgId) {
      query = query.eq("org_id", orgId);
    } else {
      query = query.eq("user_id", getUserId()).is("org_id", null);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimatesWithOrgId() failed:", err.message || err);
    return [];
  }
};

/**
 * EMERGENCY RECOVERY: Pull data ignoring org scope entirely.
 * Queries ALL rows for this user+key (both solo and any org), returns the one
 * with the most data. Used when org context is lost and normal pulls fail.
 */
export const pullDataAnyScope = async key => {
  if (!isReady()) return null;
  try {
    // Query WITHOUT org_id filter — get ALL rows for this user+key
    const { data, error } = await supabase
      .from("user_data")
      .select("data, org_id")
      .eq("user_id", getUserId())
      .eq("key", key);
    if (error) throw error;
    if (!data || data.length === 0) return null;

    // Find the row with the most data (largest array or most keys)
    let best = null;
    let bestOrgId = null;
    for (const row of data) {
      const d = row.data;
      const size = Array.isArray(d) ? d.length : typeof d === "object" && d ? Object.keys(d).length : 0;
      const bestSize = Array.isArray(best)
        ? best.length
        : typeof best === "object" && best
          ? Object.keys(best).length
          : 0;
      if (!best || size > bestSize) {
        best = d;
        bestOrgId = row.org_id;
      }
    }
    console.log(`[cloudSync] pullDataAnyScope("${key}"): found ${data.length} rows, best has org_id=${bestOrgId}`);
    // Side-effect: save discovered org_id for future recovery
    if (bestOrgId) {
      try {
        localStorage.setItem("bldg-last-org-id", bestOrgId);
      } catch {
        /* non-critical */
      }
    }
    return best;
  } catch (err) {
    console.warn(`[cloudSync] pullDataAnyScope("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * EMERGENCY RECOVERY: Pull all estimates ignoring org scope.
 * Returns all non-deleted estimates for this user across all orgs.
 */
export const pullAllEstimatesAnyScope = async () => {
  if (!isReady()) return [];
  try {
    const { data, error } = await supabase
      .from("user_estimates")
      .select("estimate_id, data, user_id, org_id")
      .eq("user_id", getUserId())
      .is("deleted_at", null);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimatesAnyScope() failed:", err.message || err);
    return [];
  }
};

/**
 * Pull a key-value pair AND its updated_at timestamp.
 * Returns { data, updated_at } or null if not found.
 */
export const pullDataWithMeta = async key => {
  if (!isReady()) return null;
  try {
    const scope = key === "settings" ? null : getScope();

    if (scope?.org_id && key === "index") {
      // Org mode index: merge all user rows, return merged data + latest timestamp
      const { data: rows, error } = await supabase
        .from("user_data")
        .select("data, updated_at")
        .eq("key", "index")
        .eq("org_id", scope.org_id);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;
      const merged = new Map();
      let latestUpdated = "";
      for (const row of rows) {
        if (row.updated_at > latestUpdated) latestUpdated = row.updated_at;
        const arr = Array.isArray(row.data) ? row.data : [];
        for (const entry of arr) {
          if (!entry?.id) continue;
          const existing = merged.get(entry.id);
          if (!existing || (entry.lastModified || "") > (existing.lastModified || "")) {
            merged.set(entry.id, entry);
          }
        }
      }
      return { data: [...merged.values()], updated_at: latestUpdated };
    }

    let query = supabase.from("user_data").select("data, updated_at").eq("key", key);
    if (scope?.org_id) {
      // Non-index org keys: get all rows, pick largest
      const { data: rows, error } = await query.eq("org_id", scope.org_id);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;
      let best = null;
      for (const row of rows) {
        const size = Array.isArray(row.data) ? row.data.length : typeof row.data === "object" && row.data ? Object.keys(row.data).length : 0;
        const bestSize = best ? (Array.isArray(best.data) ? best.data.length : typeof best.data === "object" && best.data ? Object.keys(best.data).length : 0) : 0;
        if (!best || size > bestSize) best = row;
      }
      return best ? { data: best.data, updated_at: best.updated_at } : null;
    } else {
      query = query.eq("user_id", getUserId()).is("org_id", null);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? { data: data.data, updated_at: data.updated_at } : null;
  } catch (err) {
    console.warn(`[cloudSync] pullDataWithMeta("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull a key from the solo-mode (org_id IS NULL) scope.
 * Used as a fallback when org-mode pull returns nothing — migrates
 * pre-org data forward so company profiles, contacts, etc. aren't lost.
 */
export const pullSoloFallback = async key => {
  if (!isReady()) return null;
  const scope = getScope();
  if (!scope?.org_id) return null; // Already in solo mode, no fallback needed
  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("data, updated_at")
      .eq("user_id", getUserId())
      .eq("key", key)
      .is("org_id", null)
      .maybeSingle();
    if (error) throw error;
    return data ? { data: data.data, updated_at: data.updated_at } : null;
  } catch (err) {
    console.warn(`[cloudSync] pullSoloFallback("${key}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull all estimates with their metadata (estimate_id, data, updated_at).
 */
export const pullAllEstimatesWithMeta = async () => {
  if (!isReady()) return [];
  try {
    const scope = getScope();
    // Lightweight query: only metadata, NOT the full data column (avoids statement timeout on large orgs)
    let query = supabase.from("user_estimates").select("estimate_id, updated_at, user_id").is("deleted_at", null);

    if (scope?.org_id) {
      query = query.eq("org_id", scope.org_id);
    } else {
      // Solo mode: scope by BOTH user_id AND org_id IS NULL to prevent
      // org-scoped rows from leaking into solo mode (they can't be deleted
      // from solo mode since deleteEstimate only touches org_id IS NULL rows)
      query = query.eq("user_id", getUserId()).is("org_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimatesWithMeta() failed:", err.message || err);
    return [];
  }
};

/**
 * Solo fallback for estimates — pulls from org_id IS NULL scope.
 * Used when org-mode pull returns empty to migrate pre-org estimates.
 */
export const pullAllEstimatesSoloFallback = async () => {
  if (!isReady()) return [];
  const scope = getScope();
  if (!scope?.org_id) return []; // Already in solo mode
  try {
    const { data, error } = await supabase
      .from("user_estimates")
      .select("estimate_id, updated_at, user_id")
      .is("deleted_at", null)
      .eq("user_id", getUserId())
      .is("org_id", null);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimatesSoloFallback() failed:", err.message || err);
    return [];
  }
};

/**
 * Pull a single estimate from the cloud.
 * Returns the estimate data object or null if not found.
 * Note: drawings/documents will have _cloudBlobStripped markers (no binary data).
 */
export const pullEstimate = async estimateId => {
  if (!isReady()) return null;
  try {
    const scope = getScope();
    const userId = getUserId();
    let query = supabase.from("user_estimates").select("data").eq("estimate_id", estimateId).is("deleted_at", null);

    if (scope?.org_id) {
      // In org mode: don't filter by user_id — RLS allows all org members to read
      // org-scoped estimates with visibility='org'. This lets Steve see Matt's estimates.
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", userId).is("org_id", null);
    }

    // Use .limit(1).single() pattern to handle potential duplicates gracefully
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    if (data?.data) return data.data;

    // Fallback: if in org mode, also check solo-mode rows (pre-org-migration estimates)
    if (scope?.org_id) {
      console.log(`[cloudSync] pullEstimate: org query missed — trying solo fallback for ${estimateId}`);
      const { data: soloData, error: soloErr } = await supabase
        .from("user_estimates")
        .select("data")
        .eq("estimate_id", estimateId)
        .eq("user_id", userId)
        .is("org_id", null)
        .is("deleted_at", null)
        .maybeSingle();
      if (!soloErr && soloData?.data) {
        console.log(`[cloudSync] pullEstimate: found ${estimateId} in solo mode — migrating to org`);
        // Migrate: push to org scope so future lookups work
        try {
          await supabase
            .from("user_estimates")
            .update({ org_id: scope.org_id })
            .eq("estimate_id", estimateId)
            .eq("user_id", userId)
            .is("org_id", null);
        } catch {
          /* non-critical */
        }
        return soloData.data;
      }
    }

    return null;
  } catch (err) {
    console.warn(`[cloudSync] pullEstimate("${estimateId}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull all estimates for the current user (used for initial sync on new device).
 * Returns array of { estimate_id, data } objects.
 */
export const pullAllEstimates = async () => {
  if (!isReady()) return [];
  try {
    const scope = getScope();
    let query = supabase.from("user_estimates").select("estimate_id, data, user_id").is("deleted_at", null);

    if (scope?.org_id) {
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", getUserId()).is("org_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimates() failed:", err.message || err);
    return [];
  }
};

/**
 * Pull the estimates index from normalized columns on user_estimates.
 * Returns an array shaped like the legacy index entries but sourced
 * from the authoritative table, not the JSONB blob.
 * This replaces pullData("index") as the primary index source.
 */
export const pullEstimatesIndex = async () => {
  if (!isReady()) return null;
  try {
    const scope = getScope();
    let query = supabase
      .from("user_estimates")
      .select("estimate_id, user_id, org_id, project_name, status, client, bid_due, grand_total, building_type, work_type, project_sf, estimate_number, visibility, assigned_to, last_modified, deleted_at")
      .is("deleted_at", null);

    if (scope?.org_id) {
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", getUserId()).is("org_id", null);
    }

    query = query.order("last_modified", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) return null;

    // Map DB columns back to the index entry shape expected by 49+ consumers
    return data.map(row => ({
      id: row.estimate_id,
      name: row.project_name || "",
      status: row.status || "Bidding",
      client: row.client || "",
      bidDue: row.bid_due || "",
      grandTotal: row.grand_total || 0,
      buildingType: row.building_type || "",
      workType: row.work_type || "",
      projectSF: row.project_sf || "",
      estimateNumber: row.estimate_number || "",
      visibility: row.visibility || "private",
      assignedTo: row.assigned_to || [],
      lastModified: row.last_modified || new Date().toISOString(),
      // Fields not in normalized columns get populated later from JSONB blob during estimate load
      estimator: "", coEstimators: [], jobType: "", architect: "", zipCode: "",
      divisionTotals: {}, outcomeMetadata: {}, startDate: "", estimatedHours: 0,
      elementCount: 0, companyProfileId: "", ownerId: row.user_id, orgId: row.org_id,
      correspondenceCount: 0, correspondencePendingCount: 0,
    }));
  } catch (err) {
    console.warn("[cloudSync] pullEstimatesIndex() failed:", err.message || err);
    return null;
  }
};
