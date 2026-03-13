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
  return query.is("org_id", null); // solo mode: explicitly filter NULL org_id
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
  useUiStore.setState({ cloudSyncLastFullAt: new Date().toISOString() });
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

// Minimum valid image/blob size — anything smaller is likely a corrupted
// error message stored by the CDN (e.g., "URI_TOO_LONG").
const MIN_VALID_BLOB_BYTES = 200;

/**
 * Convert a data URL to a Blob. Uses fetch() with a manual fallback for
 * very large data URLs that might exceed browser fetch limits.
 */
const dataUrlToBlob = async dataUrl => {
  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    // Sanity: fetch(dataUrl) should return the decoded binary, not an error page
    if (blob.size < MIN_VALID_BLOB_BYTES && dataUrl.length > 1000) {
      throw new Error("fetch(dataUrl) returned suspiciously small blob");
    }
    return blob;
  } catch {
    // Manual fallback: decode base64 directly (slower but no size limits)
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) return null;
    const meta = dataUrl.substring(0, commaIdx);
    const base64 = dataUrl.substring(commaIdx + 1);
    const mime = meta.match(/:(.*?);/)?.[1] || "application/octet-stream";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
};

/**
 * Compress an image data URL via Canvas to reduce upload size.
 * Scales images > maxDim px on longest side and converts to JPEG.
 * Non-image data URLs are returned unchanged.
 */
const compressImage = (dataUrl, maxDim = 4096, quality = 0.82) => {
  if (!dataUrl?.startsWith("data:image/")) return Promise.resolve(dataUrl);

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;

      // Skip compression for small images (< 2MB base64)
      if (width <= maxDim && height <= maxDim && dataUrl.length < 2_000_000) {
        resolve(dataUrl);
        return;
      }

      // Scale down if oversized
      let newW = width,
        newH = height;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        newW = Math.round(width * scale);
        newH = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, newW, newH);

      try {
        const compressed = canvas.toDataURL("image/jpeg", quality);
        const saved = dataUrl.length - compressed.length;
        if (saved > 0) {
          console.log(
            `[cloudSync] Compressed image: ${(dataUrl.length / 1024 / 1024).toFixed(1)}MB → ${(compressed.length / 1024 / 1024).toFixed(1)}MB (${newW}x${newH})`,
          );
          resolve(compressed);
        } else {
          resolve(dataUrl); // compression didn't help
        }
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

/**
 * Upload a blob to Supabase Storage with compression + verification.
 *
 * SAFETY: After upload, verifies stored file size via signed-URL HEAD request.
 * If the stored file is too small (< MIN_VALID_BLOB_BYTES), the upload is
 * treated as failed and the corrupted file is cleaned up. This prevents the
 * silent-corruption bug where Supabase CDN stores a ~40-byte error message
 * ("URI_TOO_LONG") instead of the actual image, causing permanent data loss
 * when the stripped estimate is later recovered from cloud.
 *
 * Returns storagePath on verified success, null on failure.
 */
const uploadBlob = async (path, dataUrl) => {
  if (!dataUrl || !supabase) return null;
  try {
    let blob;

    // Handle non-string values (Blob, ArrayBuffer, Uint8Array) — skip compression
    if (dataUrl instanceof Blob) {
      blob = dataUrl;
    } else if (dataUrl instanceof ArrayBuffer || dataUrl instanceof Uint8Array) {
      blob = new Blob([dataUrl], { type: "application/octet-stream" });
    } else if (typeof dataUrl !== "string") {
      console.warn(`[cloudSync] uploadBlob("${path}") — unexpected type: ${typeof dataUrl}`);
      return null;
    } else {
      // 1. Compress large images before upload
      const compressed = await compressImage(dataUrl);

      // 2. Convert to Blob
      blob = await dataUrlToBlob(compressed);
    }
    if (!blob || blob.size < MIN_VALID_BLOB_BYTES) {
      console.warn(`[cloudSync] Blob conversion produced invalid result (${blob?.size || 0} bytes)`);
      return null;
    }

    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    console.log(`[cloudSync] Uploading blob "${path}" (${sizeMB} MB)...`);

    // 3. Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(BLOB_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });

    if (error) throw error;

    // 4. VERIFY: check stored file is real, not a CDN error page
    let verified = false;
    try {
      const { data: signedData } = await supabase.storage.from(BLOB_BUCKET).createSignedUrl(path, 60);
      if (signedData?.signedUrl) {
        const headResp = await fetch(signedData.signedUrl, { method: "HEAD" });
        const contentLength = parseInt(headResp.headers.get("content-length") || "0", 10);
        if (contentLength >= MIN_VALID_BLOB_BYTES) {
          verified = true;
          console.log(`[cloudSync] Upload verified: "${path}" — ${contentLength} bytes stored`);
        } else {
          console.warn(
            `[cloudSync] Upload verification FAILED: "${path}" — stored ${contentLength} bytes, expected ~${blob.size}`,
          );
        }
      }
    } catch (verifyErr) {
      console.warn(`[cloudSync] Upload verification check error:`, verifyErr.message);
      // If verification itself errors, fall back to download check
      try {
        const { data: dlCheck } = await supabase.storage.from(BLOB_BUCKET).download(path);
        if (dlCheck && dlCheck.size >= MIN_VALID_BLOB_BYTES) {
          verified = true;
          console.log(`[cloudSync] Upload verified via download: "${path}" — ${dlCheck.size} bytes`);
        }
      } catch {
        // Can't verify at all — treat as failed to be safe
      }
    }

    if (!verified) {
      console.warn(`[cloudSync] Cleaning up corrupted upload: "${path}"`);
      await supabase.storage
        .from(BLOB_BUCKET)
        .remove([path])
        .catch(() => {});
      return null;
    }

    return path;
  } catch (err) {
    console.warn(`[cloudSync] uploadBlob("${path}") failed:`, err.message);
    return null;
  }
};

/**
 * Download a blob from Supabase Storage via the JS client.
 * Returns base64 data URL or null.
 *
 * SAFETY: Validates downloaded blob size — rejects files smaller than
 * MIN_VALID_BLOB_BYTES (likely corrupted CDN error pages).
 */
const BLOB_DOWNLOAD_TIMEOUT = 20000; // 20s timeout for individual blob downloads
const BLOB_DOWNLOAD_RETRIES = 3; // retry up to 3 times with exponential backoff

const downloadBlobOnce = async storagePath => {
  if (!storagePath || !supabase) return null;
  const downloadPromise = supabase.storage.from(BLOB_BUCKET).download(storagePath);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Blob download timed out after ${BLOB_DOWNLOAD_TIMEOUT / 1000}s`)),
      BLOB_DOWNLOAD_TIMEOUT,
    ),
  );
  const { data, error } = await Promise.race([downloadPromise, timeoutPromise]);

  if (error) throw error;
  if (!data) return null;

  // Reject corrupted blobs (CDN error pages are ~40 bytes)
  if (data.size < MIN_VALID_BLOB_BYTES) {
    console.warn(
      `[cloudSync] Downloaded blob "${storagePath}" is only ${data.size} bytes — likely corrupted, skipping`,
    );
    return null;
  }

  // Convert Blob to data URL
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(data);
  });
};

const downloadBlob = async storagePath => {
  for (let attempt = 0; attempt < BLOB_DOWNLOAD_RETRIES; attempt++) {
    try {
      const result = await downloadBlobOnce(storagePath);
      if (result) return result;
      // null result (corrupted blob) — don't retry, the file itself is bad
      return null;
    } catch (err) {
      const isLastAttempt = attempt === BLOB_DOWNLOAD_RETRIES - 1;
      if (isLastAttempt) {
        console.warn(
          `[cloudSync] downloadBlob("${storagePath}") failed after ${BLOB_DOWNLOAD_RETRIES} attempts:`,
          err.message,
        );
        return null;
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      console.log(`[cloudSync] downloadBlob("${storagePath}") attempt ${attempt + 1} failed, retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
};

/**
 * Strip base64 blobs from estimate data AND upload them to Supabase Storage.
 * Metadata is preserved with storagePath for later hydration.
 *
 * SAFETY: Only strips blob data when uploadBlob returns a verified storagePath.
 * If upload fails or verification fails, original data is kept inline so the
 * estimate in the DB still has the drawing data (even if it makes the row larger).
 */
const stripAndUploadBlobs = async (estimateId, data) => {
  if (!data) return data;
  const userId = getUserId();
  const clean = { ...data };

  // Upload + strip drawing data (only strip if upload is VERIFIED)
  if (Array.isArray(clean.drawings)) {
    let uploaded = 0,
      kept = 0,
      skipped = 0;
    clean.drawings = await Promise.all(
      clean.drawings.map(async d => {
        if (!d.data) return d;
        // Skip re-uploading if blob is already verified in Storage
        if (d.storagePath && d._cloudBlobStripped) {
          skipped++;
          const { data: _blob, ...rest } = d;
          return rest; // strip inline blob — already in Storage
        }
        const path = `${userId}/${estimateId}/drawings/${d.id}`;
        const storagePath = await uploadBlob(path, d.data);
        if (storagePath) {
          uploaded++;
          const { data: _blob, ...rest } = d;
          return { ...rest, storagePath, _cloudBlobStripped: true };
        }
        // Upload failed — keep original data inline (safe fallback)
        kept++;
        console.warn(
          `[cloudSync] Drawing "${d.id}" upload failed — keeping ${(d.data.length / 1024).toFixed(0)}KB inline`,
        );
        return d;
      }),
    );
    if (uploaded + kept + skipped > 0) {
      console.log(`[cloudSync] Drawings: ${uploaded} uploaded, ${skipped} already in Storage, ${kept} kept inline`);
    }
  }

  // Upload + strip document data (only strip if upload is VERIFIED)
  if (Array.isArray(clean.documents)) {
    clean.documents = await Promise.all(
      clean.documents.map(async d => {
        if (!d.data) return d;
        // Skip re-uploading if blob is already verified in Storage
        if (d.storagePath && d._cloudBlobStripped) {
          const { data: _blob, ...rest } = d;
          return rest; // strip inline blob — already in Storage
        }
        const path = `${userId}/${estimateId}/documents/${d.id}`;
        const storagePath = await uploadBlob(path, d.data);
        if (storagePath) {
          const { data: _blob, ...rest } = d;
          return { ...rest, storagePath, _cloudBlobStripped: true };
        }
        console.warn(`[cloudSync] Document "${d.id}" upload failed — keeping inline`);
        return d;
      }),
    );
  }

  // Upload + strip spec PDF (only strip if upload is VERIFIED)
  if (clean.specPdf) {
    const path = `${userId}/${estimateId}/specPdf`;
    const storagePath = await uploadBlob(path, clean.specPdf);
    if (storagePath) {
      clean.specPdf = null;
      clean._specPdfStripped = true;
      clean._specPdfStoragePath = storagePath;
    } else {
      console.warn(`[cloudSync] specPdf upload failed — keeping inline`);
    }
  }

  return clean;
};

/**
 * Hydrate stripped blobs — download from Supabase Storage and inject back.
 * Called when loading an estimate that has _cloudBlobStripped markers.
 *
 * SAFETY: downloadBlob now rejects files < MIN_VALID_BLOB_BYTES, so
 * corrupted CDN error files won't be injected as drawing data.
 */
export const hydrateBlobs = async data => {
  if (!data || !isReady()) return data;
  const hydrated = { ...data };
  let hydrated_count = 0;
  let failed_count = 0;

  // Concurrency-limited mapper — runs at most `limit` tasks at a time
  const mapWithLimit = async (arr, limit, fn) => {
    const results = new Array(arr.length);
    let idx = 0;
    const run = async () => {
      while (idx < arr.length) {
        const i = idx++;
        results[i] = await fn(arr[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, () => run()));
    return results;
  };

  // Download drawing blobs (max 2 concurrent to avoid network saturation)
  if (Array.isArray(hydrated.drawings)) {
    hydrated.drawings = await mapWithLimit(hydrated.drawings, 2, async d => {
      if (!d._cloudBlobStripped || !d.storagePath || d.data) return d;
      const dataUrl = await downloadBlob(d.storagePath);
      if (!dataUrl) {
        failed_count++;
        console.warn(
          `[cloudSync] Failed to hydrate drawing "${d.id}" from "${d.storagePath}" — KEEPING markers for retry`,
        );
        // KEEP _cloudBlobStripped + storagePath so we can retry later.
        // Previous code stripped them, permanently losing the recovery path.
        return d;
      }
      hydrated_count++;
      return { ...d, data: dataUrl };
    });
  }

  // Download document blobs (max 2 concurrent)
  if (Array.isArray(hydrated.documents)) {
    hydrated.documents = await mapWithLimit(hydrated.documents, 2, async d => {
      if (!d._cloudBlobStripped || !d.storagePath || d.data) return d;
      const dataUrl = await downloadBlob(d.storagePath);
      if (!dataUrl) {
        failed_count++;
        // KEEP markers for retry — don't destroy the recovery path
        return d;
      }
      hydrated_count++;
      return { ...d, data: dataUrl };
    });
  }

  // Download spec PDF
  if (hydrated._specPdfStripped && hydrated._specPdfStoragePath && !hydrated.specPdf) {
    const dataUrl = await downloadBlob(hydrated._specPdfStoragePath);
    if (dataUrl) {
      hydrated.specPdf = dataUrl;
      hydrated_count++;
    } else {
      failed_count++;
      // KEEP markers for retry — don't delete _specPdfStripped / _specPdfStoragePath
    }
  }

  if (hydrated_count + failed_count > 0) {
    console.log(`[cloudSync] Blob hydration: ${hydrated_count} restored, ${failed_count} failed`);
  }

  // Attach hydration stats so callers can decide whether to persist
  hydrated._hydrationStats = { hydrated: hydrated_count, failed: failed_count };

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

// Per-operation cooldown: each operation (e.g. pushData("settings"), pushEstimate("abc"))
// tracks its own cooldown independently. A failure in one operation no longer blocks others.
const _syncErrors = new Map(); // key → timestamp of last exhausted-retry failure
const SYNC_COOLDOWN = 30000; // 30s cooldown after all retries exhausted
let _activeSyncs = 0;
const MAX_CONCURRENT_SYNCS = 3; // limit parallel uploads

// Classify errors: permanent (don't retry) vs transient (do retry)
const isPermanentError = err => {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  // Auth failures, forbidden, not found, conflict — don't retry
  if (status === 401 || status === 403 || status === 404 || status === 409) return true;
  // Supabase-specific permanent errors
  if (msg.includes("jwt expired") || msg.includes("invalid jwt")) return true;
  if (msg.includes("row-level security") || msg.includes("rls")) return true;
  if (msg.includes("violates unique constraint")) return true;
  if (msg.includes("violates foreign key")) return true;
  return false;
};

const withRetry = async (label, fn, retries = 2) => {
  // Per-operation cooldown: only skip THIS operation if it recently failed
  const lastError = _syncErrors.get(label) || 0;
  if (Date.now() - lastError < SYNC_COOLDOWN) {
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
        const result = await fn();
        // Success — clear any previous cooldown for this operation
        _syncErrors.delete(label);
        return result;
      } catch (err) {
        // Don't retry permanent errors (auth, RLS, constraint violations)
        if (isPermanentError(err)) {
          console.error(`[cloudSync] ${label} permanent error — not retrying:`, err.message);
          _syncErrors.set(label, Date.now());
          throw err;
        }
        if (attempt < retries) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 16000); // 2s → 4s → 8s (max 16s)
          console.warn(`[cloudSync] ${label} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          _syncErrors.set(label, Date.now());
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

      if (scope?.org_id) {
        // Org mode: check for existing org-scoped row first
        const { data: existing } = await supabase
          .from("user_data")
          .select("id")
          .eq("user_id", userId)
          .eq("key", key)
          .eq("org_id", scope.org_id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_data")
            .update({ data: cleanData, updated_at: row.updated_at })
            .eq("user_id", userId)
            .eq("key", key)
            .eq("org_id", scope.org_id);
          if (error) throw error;
        } else {
          // Try insert; if blocked by legacy UNIQUE(user_id,key) constraint,
          // update the existing solo-mode row to claim it for this org.
          const { error } = await supabase.from("user_data").insert(row);
          if (error?.code === "23505") {
            console.log(`[cloudSync] pushData("${key}"): migrating solo row to org ${scope.org_id}`);
            const { error: upErr } = await supabase
              .from("user_data")
              .update({ org_id: scope.org_id, data: cleanData, updated_at: row.updated_at })
              .eq("user_id", userId)
              .eq("key", key)
              .is("org_id", null);
            if (upErr) throw upErr;
          } else if (error) {
            throw error;
          }
        }
      } else {
        // Solo/settings mode: explicitly filter org_id IS NULL to avoid
        // collisions with org-mode rows for the same user+key.
        const { data: existing } = await supabase
          .from("user_data")
          .select("id")
          .eq("user_id", userId)
          .eq("key", key)
          .is("org_id", null)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_data")
            .update({ data: cleanData, updated_at: row.updated_at })
            .eq("user_id", userId)
            .eq("key", key)
            .is("org_id", null);
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
      // Extract assignedTo from the estimate data to store as a column (for queries)
      const assignedTo = cleanData?.project?.assignedTo || null;
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
      };

      if (scope?.org_id) {
        // Org mode: check for existing org-scoped row first
        const { data: existing } = await supabase
          .from("user_estimates")
          .select("id")
          .eq("user_id", userId)
          .eq("estimate_id", estimateId)
          .eq("org_id", scope.org_id)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_estimates")
            .update({ data: cleanData, updated_at: row.updated_at, ...(assignedTo ? { assigned_to: assignedTo } : {}) })
            .eq("user_id", userId)
            .eq("estimate_id", estimateId)
            .eq("org_id", scope.org_id);
          if (error) throw error;
        } else {
          // Try insert; if blocked by legacy UNIQUE(user_id,estimate_id) constraint,
          // update the existing solo-mode row to claim it for this org.
          const { error } = await supabase.from("user_estimates").insert(row);
          if (error?.code === "23505") {
            console.log(`[cloudSync] pushEstimate("${estimateId}"): migrating solo row to org ${scope.org_id}`);
            const { error: upErr } = await supabase
              .from("user_estimates")
              .update({
                org_id: scope.org_id,
                data: cleanData,
                updated_at: row.updated_at,
                ...(assignedTo ? { assigned_to: assignedTo } : {}),
              })
              .eq("user_id", userId)
              .eq("estimate_id", estimateId)
              .is("org_id", null);
            if (upErr) throw upErr;
          } else if (error) {
            throw error;
          }
        }
      } else {
        // Solo mode: explicitly filter org_id IS NULL to avoid collisions with org-mode rows.
        const { data: existing } = await supabase
          .from("user_estimates")
          .select("id")
          .eq("user_id", userId)
          .eq("estimate_id", estimateId)
          .is("org_id", null)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_estimates")
            .update({ data: cleanData, updated_at: row.updated_at })
            .eq("user_id", userId)
            .eq("estimate_id", estimateId)
            .is("org_id", null);
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
      } catch {}
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
      query = query.eq("org_id", scope.org_id);
    } else {
      query = query.eq("user_id", userId).is("org_id", null);
    }

    const { data, error } = await query.maybeSingle();
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
        } catch {}
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

// ---------- Realtime sync helpers ----------
// These are used by useRealtimeSync to apply incoming changes from other devices.

/**
 * Pull a single estimate from cloud, hydrate blobs, write to IDB, and
 * optionally reload into Zustand stores if it's the active estimate.
 * Returns the hydrated data or null on failure.
 */
export const pullAndApplyEstimate = async estimateId => {
  if (!isReady()) return null;
  try {
    let cloudData = await pullEstimate(estimateId);
    if (!cloudData) return null;

    // Hydrate blobs (drawings, documents, specPdf)
    cloudData = await hydrateBlobs(cloudData);
    delete cloudData._hydrationStats;

    // Write to IDB
    const { storage } = await import("@/utils/storage");
    const { idbKey } = await import("@/utils/idbKey");
    await storage.set(idbKey(`bldg-est-${estimateId}`), JSON.stringify(cloudData));

    // If this is the active estimate, reload into stores
    const { useEstimatesStore } = await import("@/stores/estimatesStore");
    const activeId = useEstimatesStore.getState().activeEstimateId;
    if (activeId === estimateId) {
      await _reloadActiveEstimate(cloudData);
    }

    return cloudData;
  } catch (err) {
    console.warn(`[cloudSync] pullAndApplyEstimate("${estimateId}") failed:`, err.message || err);
    return null;
  }
};

/**
 * Pull a data key from cloud and apply to the correct Zustand store + IDB.
 * Handles: master, settings, assemblies, index, calendar, user-elements, etc.
 */
export const pullAndApplyData = async key => {
  if (!isReady()) return null;
  try {
    const result = await pullData(key);
    if (!result) return null;

    const { storage } = await import("@/utils/storage");
    const { idbKey } = await import("@/utils/idbKey");

    // Write to IDB
    await storage.set(idbKey(`bldg-${key}`), JSON.stringify(result));

    // Apply to the appropriate Zustand store
    await _applyDataToStore(key, result);

    return result;
  } catch (err) {
    console.warn(`[cloudSync] pullAndApplyData("${key}") failed:`, err.message || err);
    return null;
  }
};

/** Reload the currently active estimate's stores from fresh data */
async function _reloadActiveEstimate(data) {
  try {
    const { useProjectStore } = await import("@/stores/projectStore");
    const { useItemsStore } = await import("@/stores/itemsStore");
    const { useDrawingsStore } = await import("@/stores/drawingsStore");
    const { useTakeoffsStore } = await import("@/stores/takeoffsStore");
    const { useSpecsStore } = await import("@/stores/specsStore");
    const { useGroupsStore } = await import("@/stores/groupsStore");
    const { useBidLevelingStore } = await import("@/stores/bidLevelingStore");
    const { useAlternatesStore } = await import("@/stores/alternatesStore");
    const { useCorrespondenceStore } = await import("@/stores/correspondenceStore");
    const { useModuleStore } = await import("@/stores/moduleStore");
    const { useBidPackagesStore } = await import("@/stores/bidPackagesStore");

    if (data.project) useProjectStore.getState().setProject(data.project);
    if (data.items !== undefined) useItemsStore.getState().setItems(data.items || []);
    if (data.markup !== undefined) useItemsStore.getState().setMarkup(data.markup);
    if (data.markupOrder) useItemsStore.getState().setMarkupOrder(data.markupOrder);
    if (data.drawings) useDrawingsStore.getState().setDrawings(data.drawings);
    if (data.takeoffs) useTakeoffsStore.getState().setTakeoffs(data.takeoffs);
    if (data.specs) useSpecsStore.getState().setSpecs(data.specs);
    if (data.exclusions) useSpecsStore.getState().setExclusions(data.exclusions);
    if (data.clarifications) useSpecsStore.getState().setClarifications(data.clarifications);
    if (data.groups) useGroupsStore.getState().setGroups(data.groups);
    if (data.bidLeveling) useBidLevelingStore.getState().setBidLeveling(data.bidLeveling);
    if (data.alternates) useAlternatesStore.getState().setAlternates(data.alternates);
    if (data.correspondence) useCorrespondenceStore.getState().setCorrespondence(data.correspondence);
    if (data.modules) useModuleStore.getState().setModules(data.modules);
    if (data.bidPackages) useBidPackagesStore.getState().setBidPackages(data.bidPackages);

    console.log("[cloudSync] Active estimate reloaded from Realtime update");
    useUiStore.getState().showToast("Estimate updated from another device", "info");
  } catch (err) {
    console.warn("[cloudSync] _reloadActiveEstimate failed:", err.message);
  }
}

/** Apply pulled data to the correct Zustand store by key name */
async function _applyDataToStore(key, data) {
  try {
    if (key === "master") {
      const { useMasterDataStore } = await import("@/stores/masterDataStore");
      if (data.companyProfiles) useMasterDataStore.getState().setCompanyProfiles(data.companyProfiles);
      if (data.contacts) useMasterDataStore.getState().setContacts(data.contacts);
      if (data.companyInfo) useMasterDataStore.getState().setCompanyInfo(data.companyInfo);
    } else if (key === "settings") {
      useUiStore.getState().setAppSettings(data);
    } else if (key === "assemblies") {
      const { useDatabaseStore } = await import("@/stores/databaseStore");
      useDatabaseStore.getState().setAssemblies(data);
    } else if (key === "calendar") {
      const { useCalendarStore } = await import("@/stores/calendarStore");
      useCalendarStore.getState().setTasks(data);
    } else if (key === "user-elements") {
      const { useDatabaseStore } = await import("@/stores/databaseStore");
      useDatabaseStore.getState().loadUserElements(data);
    } else if (key === "index") {
      // Merge into estimates index additively (never replace)
      const { useEstimatesStore } = await import("@/stores/estimatesStore");
      const currentIndex = useEstimatesStore.getState().estimatesIndex;
      const currentIds = new Set(currentIndex.map(e => e.id));
      const newEntries = (Array.isArray(data) ? data : []).filter(e => !currentIds.has(e.id));
      if (newEntries.length > 0) {
        useEstimatesStore.setState(s => ({
          estimatesIndex: [...s.estimatesIndex, ...newEntries],
        }));
      }
    }
    console.log(`[cloudSync] Applied Realtime data for key "${key}"`);
  } catch (err) {
    console.warn(`[cloudSync] _applyDataToStore("${key}") failed:`, err.message);
  }
}
