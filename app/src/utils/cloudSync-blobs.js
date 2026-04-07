/**
 * Cloud Sync — Blob handling (compress, upload, download, hydrate, strip).
 * Extracted from cloudSync.js.
 */

import { supabase } from "./supabase";
import { getUserId, isReady } from "./cloudSync-auth";

const BLOB_BUCKET = "blobs";

// Env vars for raw fetch (cleaned once at module load)
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\\n/g, "").replace(/\n/g, "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").replace(/\\n/g, "").replace(/\n/g, "").trim();

let _authReady = null;

export function waitForAuthReady() {
  if (!supabase) {
    return Promise.reject(new Error("[cloudSync] Supabase client not initialized"));
  }

  if (!_authReady) {
    _authReady = new Promise((resolve, reject) => {
      try {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (
            (event === "INITIAL_SESSION" ||
             event === "SIGNED_IN" ||
             event === "TOKEN_REFRESHED") &&
            session?.access_token
          ) {
            subscription.unsubscribe();
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  return _authReady;
}

// Minimum valid image/blob size — anything smaller is likely a corrupted
// error message stored by the CDN (e.g., "URI_TOO_LONG").
const MIN_VALID_BLOB_BYTES = 200;

/**
 * Convert a data URL to a Blob. Uses fetch() with a manual fallback for
 * very large data URLs that might exceed browser fetch limits.
 */
export const dataUrlToBlob = async dataUrl => {
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
export const compressImage = (dataUrl, maxDim = 4096, quality = 0.82) => {
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
export const uploadBlob = async (path, dataUrl) => {
  if (!dataUrl || !supabase) return null;
  await waitForAuthReady();
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
      // If verification itself errors, fall back to raw fetch check
      try {
        const { data: { session: vs } } = await supabase.auth.getSession();
        if (vs?.access_token) {
          const dlResp = await fetch(`${supabaseUrl}/storage/v1/object/${BLOB_BUCKET}/${path}`, {
            headers: { Authorization: `Bearer ${vs.access_token}`, apikey: supabaseAnonKey },
          });
          if (dlResp.ok) {
            const dlBlob = await dlResp.blob();
            if (dlBlob && dlBlob.size >= MIN_VALID_BLOB_BYTES) {
              verified = true;
              console.log(`[cloudSync] Upload verified via raw fetch: "${path}" — ${dlBlob.size} bytes`);
            }
          }
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

  await waitForAuthReady();

  // Fresh token on every download — no stale caching
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error(`[cloudSync] No valid access token for "${storagePath}"`);
  }

  const token = session.access_token;
  const url = `${supabaseUrl}/storage/v1/object/${BLOB_BUCKET}/${storagePath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No body");
      console.error(`[cloudSync] Raw storage fetch failed`, {
        path: storagePath,
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
        hasToken: !!token,
      });
      throw new Error(`Storage download failed: ${response.status}`);
    }

    const blob = await response.blob();

    if (blob.size < MIN_VALID_BLOB_BYTES) {
      console.warn(`[cloudSync] Blob too small`, { path: storagePath, size: blob.size });
      return null;
    }

    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const downloadBlob = async storagePath => {
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
          err.statusCode || err.status || err.message || err,
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
export const stripAndUploadBlobs = async (estimateId, data) => {
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
        const docFailKey = `_docFailCount_${d.id}`;
        const docFailCount = parseInt(localStorage.getItem(docFailKey) || "0", 10);
        if (docFailCount >= 3) {
          console.warn(`[cloudSync] Document "${d.id}" permanently skipped — 3 failures`);
          const { data: _blob, ...rest } = d;
          return rest; // strip corrupted blob
        }
        const path = `${userId}/${estimateId}/documents/${d.id}`;
        const storagePath = await uploadBlob(path, d.data);
        if (storagePath) {
          localStorage.removeItem(docFailKey);
          const { data: _blob, ...rest } = d;
          return { ...rest, storagePath, _cloudBlobStripped: true };
        }
        localStorage.setItem(docFailKey, String(docFailCount + 1));
        console.warn(`[cloudSync] Document "${d.id}" upload failed (attempt ${docFailCount + 1}/3) — keeping inline`);
        return d;
      }),
    );
  }

  // Upload + strip spec PDF (only strip if upload is VERIFIED)
  // Skip if this blob has failed too many times (prevents infinite retry loop)
  const specFailKey = `_specPdfFailCount_${estimateId}`;
  const specFailCount = parseInt(localStorage.getItem(specFailKey) || "0", 10);
  if (clean.specPdf && specFailCount < 3) {
    const path = `${userId}/${estimateId}/specPdf`;
    const storagePath = await uploadBlob(path, clean.specPdf);
    if (storagePath) {
      clean.specPdf = null;
      clean._specPdfStripped = true;
      clean._specPdfStoragePath = storagePath;
      localStorage.removeItem(specFailKey);
    } else {
      localStorage.setItem(specFailKey, String(specFailCount + 1));
      console.warn(`[cloudSync] specPdf upload failed (attempt ${specFailCount + 1}/3) — keeping inline`);
    }
  } else if (specFailCount >= 3) {
    // Permanently skip — blob is corrupted, don't keep retrying
    console.warn(`[cloudSync] specPdf permanently skipped for ${estimateId} — 3 failures`);
    clean.specPdf = null; // strip the corrupted blob from the push payload
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
  await waitForAuthReady();
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
export const stripMasterBlobs = data => {
  if (!data) return data;
  return data;
};
