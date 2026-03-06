/**
 * Cloud Sync — Supabase push/pull layer for cross-device persistence
 *
 * IndexedDB stays the primary store (offline-first). This module pushes data
 * to Supabase in the background and pulls from cloud when local is empty.
 *
 * All operations are fire-and-forget — cloud errors never block the UI.
 */

import { supabase } from "./supabase";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import { useOrgStore } from "@/stores/orgStore";

// ---------- helpers ----------

const getUserId = () => useAuthStore.getState().user?.id;

// Returns { org_id } for org mode or null for solo mode.
// Solo mode: do NOT reference org_id at all (column may not exist yet).
const getScope = () => {
  const org = useOrgStore.getState().org;
  return org ? { org_id: org.id } : null;
};

// Apply org scope to a query — noop in solo mode
const applyScope = (query, scope) => {
  if (scope) return query.eq("org_id", scope.org_id);
  return query; // solo mode: no org_id filter (just user_id)
};

const isReady = () => {
  if (!supabase) return false;
  if (!getUserId()) return false;
  return true;
};

const markSynced = () => {
  useUiStore.getState().setCloudSyncStatus("synced");
  useUiStore
    .getState()
    .setCloudSyncLastAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
};

const markError = msg => {
  useUiStore.getState().setCloudSyncStatus("error");
  useUiStore.getState().setCloudSyncError(msg || "Connection failed");
};

const markSyncing = () => {
  useUiStore.getState().setCloudSyncStatus("syncing");
};

// ---------- Blob sync via Supabase client ----------

const BLOB_BUCKET = "blobs";

/**
 * Upload a blob directly to Supabase Storage via the JS client.
 * Uses the authenticated user's session — no server proxy needed.
 * Returns storagePath on success, null on failure.
 */
const uploadBlob = async (path, dataUrl) => {
  if (!dataUrl || !supabase) return null;
  try {
    // Convert data URL to Blob
    const dataResp = await fetch(dataUrl);
    const blob = await dataResp.blob();

    // Upload directly via Supabase client (handles CORS + auth)
    const { error } = await supabase.storage
      .from(BLOB_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });

    if (error) throw error;
    return path;
  } catch (err) {
    console.warn(`[cloudSync] uploadBlob("${path}") failed:`, err.message);
    return null;
  }
};

/**
 * Download a blob from Supabase Storage via the JS client.
 * Returns base64 data URL or null.
 */
const downloadBlob = async storagePath => {
  if (!storagePath || !supabase) return null;
  try {
    const { data, error } = await supabase.storage.from(BLOB_BUCKET).download(storagePath);

    if (error) throw error;
    if (!data) return null;

    // Convert Blob to data URL
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(data);
    });
  } catch (err) {
    console.warn(`[cloudSync] downloadBlob("${storagePath}") failed:`, err.message);
    return null;
  }
};

/**
 * Strip base64 blobs from estimate data AND upload them to Supabase Storage.
 * Metadata is preserved with storagePath for later hydration.
 */
const stripAndUploadBlobs = async (estimateId, data) => {
  if (!data) return data;
  const userId = getUserId();
  const clean = { ...data };

  // Upload + strip drawing data (only strip if upload succeeds)
  if (Array.isArray(clean.drawings)) {
    clean.drawings = await Promise.all(
      clean.drawings.map(async d => {
        if (!d.data) return d;
        const path = `${userId}/${estimateId}/drawings/${d.id}`;
        const storagePath = await uploadBlob(path, d.data);
        if (storagePath) {
          const { data: _blob, ...rest } = d;
          return { ...rest, storagePath, _cloudBlobStripped: true };
        }
        // Upload failed — keep original data intact
        return d;
      }),
    );
  }

  // Upload + strip document data (only strip if upload succeeds)
  if (Array.isArray(clean.documents)) {
    clean.documents = await Promise.all(
      clean.documents.map(async d => {
        if (!d.data) return d;
        const path = `${userId}/${estimateId}/documents/${d.id}`;
        const storagePath = await uploadBlob(path, d.data);
        if (storagePath) {
          const { data: _blob, ...rest } = d;
          return { ...rest, storagePath, _cloudBlobStripped: true };
        }
        return d;
      }),
    );
  }

  // Upload + strip spec PDF (only strip if upload succeeds)
  if (clean.specPdf) {
    const path = `${userId}/${estimateId}/specPdf`;
    const storagePath = await uploadBlob(path, clean.specPdf);
    if (storagePath) {
      clean.specPdf = null;
      clean._specPdfStripped = true;
      clean._specPdfStoragePath = storagePath;
    }
  }

  return clean;
};

/**
 * Hydrate stripped blobs — download from Supabase Storage and inject back.
 * Called when loading an estimate that has _cloudBlobStripped markers.
 */
export const hydrateBlobs = async data => {
  if (!data || !isReady()) return data;
  const hydrated = { ...data };
  let anyHydrated = false;

  // Download drawing blobs
  if (Array.isArray(hydrated.drawings)) {
    hydrated.drawings = await Promise.all(
      hydrated.drawings.map(async d => {
        if (!d._cloudBlobStripped || !d.storagePath || d.data) return d;
        const dataUrl = await downloadBlob(d.storagePath);
        if (!dataUrl) return d;
        anyHydrated = true;
        return { ...d, data: dataUrl };
      }),
    );
  }

  // Download document blobs
  if (Array.isArray(hydrated.documents)) {
    hydrated.documents = await Promise.all(
      hydrated.documents.map(async d => {
        if (!d._cloudBlobStripped || !d.storagePath || d.data) return d;
        const dataUrl = await downloadBlob(d.storagePath);
        if (!dataUrl) return d;
        anyHydrated = true;
        return { ...d, data: dataUrl };
      }),
    );
  }

  // Download spec PDF
  if (hydrated._specPdfStripped && hydrated._specPdfStoragePath && !hydrated.specPdf) {
    const dataUrl = await downloadBlob(hydrated._specPdfStoragePath);
    if (dataUrl) {
      hydrated.specPdf = dataUrl;
      anyHydrated = true;
    }
  }

  return hydrated;
};

/**
 * Prepare master data for cloud push.
 * Logos are included so they sync across devices.
 */
const stripMasterBlobs = data => {
  if (!data) return data;
  return data;
};

// ---------- retry helper (exponential backoff + cooldown) ----------

let _lastSyncError = 0;
const SYNC_COOLDOWN = 30000; // 30s cooldown after all retries exhausted
let _activeSyncs = 0;
const MAX_CONCURRENT_SYNCS = 3; // limit parallel uploads

const withRetry = async (label, fn, retries = 2) => {
  // Cooldown: skip entirely if we just had a total failure
  if (Date.now() - _lastSyncError < SYNC_COOLDOWN) {
    console.warn(`[cloudSync] ${label} skipped — cooling down after recent failure`);
    return;
  }
  // Concurrency gate
  if (_activeSyncs >= MAX_CONCURRENT_SYNCS) {
    console.warn(`[cloudSync] ${label} skipped — ${_activeSyncs} syncs in flight`);
    return;
  }
  _activeSyncs++;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt < retries) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 16000); // 2s → 4s → 8s (max 16s)
          console.warn(`[cloudSync] ${label} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          _lastSyncError = Date.now();
          throw err;
        }
      }
    }
  } finally {
    _activeSyncs--;
  }
};

// ---------- push operations ----------

/**
 * Upsert a key-value pair to the user_data table.
 * Used for: settings, master, assemblies, index
 */
export const pushData = async (key, data) => {
  if (!isReady()) return;
  markSyncing();
  try {
    await withRetry(`pushData("${key}")`, async () => {
      const cleanData = key === "master" ? stripMasterBlobs(data) : data;
      // Settings are always user-scoped (never org-scoped)
      const scope = key === "settings" ? null : getScope();
      const userId = getUserId();
      const row = { user_id: userId, key, data: cleanData, updated_at: new Date().toISOString(), ...(scope || {}) };

      if (scope?.org_id) {
        // Org mode: onConflict works fine
        const { error } = await supabase.from("user_data").upsert(row, { onConflict: "user_id,key,org_id" });
        if (error) throw error;
      } else {
        // Solo/settings mode: no org_id column needed.
        // Check if row exists, then update or insert.
        const { data: existing } = await supabase
          .from("user_data")
          .select("id")
          .eq("user_id", userId)
          .eq("key", key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_data")
            .update({ data: cleanData, updated_at: row.updated_at })
            .eq("user_id", userId)
            .eq("key", key);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("user_data").insert(row);
          if (error) throw error;
        }
      }
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
  if (!isReady()) return;
  markSyncing();
  try {
    await withRetry(`pushEstimate("${estimateId}")`, async () => {
      const cleanData = await stripAndUploadBlobs(estimateId, data);
      const userId = getUserId();
      const scope = getScope();
      const row = {
        user_id: userId,
        estimate_id: estimateId,
        data: cleanData,
        updated_at: new Date().toISOString(),
        deleted_at: null,
        ...(scope || {}),
      };

      if (scope?.org_id) {
        // Org mode: onConflict works fine (org_id is non-null)
        const { error } = await supabase
          .from("user_estimates")
          .upsert(row, { onConflict: "user_id,estimate_id,org_id" });
        if (error) throw error;
      } else {
        // Solo mode: no org_id column needed.
        const { data: existing } = await supabase
          .from("user_estimates")
          .select("id")
          .eq("user_id", userId)
          .eq("estimate_id", estimateId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_estimates")
            .update({ data: cleanData, updated_at: row.updated_at, deleted_at: null })
            .eq("user_id", userId)
            .eq("estimate_id", estimateId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("user_estimates").insert(row);
          if (error) throw error;
        }
      }
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

// ---------- pull operations ----------

/**
 * Pull a key-value pair from the user_data table.
 * Returns the data object or null if not found.
 */
export const pullData = async key => {
  if (!isReady()) return null;
  try {
    const scope = key === "settings" ? null : getScope();
    let query = supabase.from("user_data").select("data").eq("user_id", getUserId()).eq("key", key);
    query = applyScope(query, scope);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn(`[cloudSync] pullData("${key}") failed:`, err.message || err);
    return null;
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
    let query = supabase.from("user_data").select("data, updated_at").eq("user_id", getUserId()).eq("key", key);
    query = applyScope(query, scope);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? { data: data.data, updated_at: data.updated_at } : null;
  } catch (err) {
    console.warn(`[cloudSync] pullDataWithMeta("${key}") failed:`, err.message || err);
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
    let query = supabase.from("user_estimates").select("estimate_id, data, updated_at, user_id").is("deleted_at", null);

    if (scope?.org_id) {
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", getUserId());
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
 * Pull a single estimate from the cloud.
 * Returns the estimate data object or null if not found.
 * Note: drawings/documents will have _cloudBlobStripped markers (no binary data).
 */
export const pullEstimate = async estimateId => {
  if (!isReady()) return null;
  try {
    const scope = getScope();
    let query = supabase.from("user_estimates").select("data").eq("estimate_id", estimateId).is("deleted_at", null);

    if (scope?.org_id) {
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", getUserId());
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data?.data || null;
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
      query = query.eq("user_id", getUserId());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("[cloudSync] pullAllEstimates() failed:", err.message || err);
    return [];
  }
};
