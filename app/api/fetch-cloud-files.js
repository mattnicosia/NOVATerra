import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { checkRateLimit } from "./lib/rateLimiter.js";
import {
  getProvider,
  isAllowedFile,
  getContentType,
  validateMagicBytes,
  classifyByParentFolder,
  extractAddendumNumber,
} from "./lib/cloudDownloaders.js";

/* ────────────────────────────────────────────────────────
   POST /api/fetch-cloud-files
   Downloads files from cloud storage links (Dropbox, Google Drive, Box, etc.)
   and uploads them to Supabase Storage for frontend retrieval.

   Body: { planLinks: [{ url, provider, label }], rfpId, existingFilenames: [] }
   Returns: { files: [...], errors: [...] }
   ──────────────────────────────────────────────────────── */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
const MAX_FILES = 50; // 50 files max

/**
 * Read API keys — first try cloud_provider_configs table (future: per-org),
 * fall back to Vercel env vars.
 */
async function getApiKeys(orgId) {
  const envKeys = {
    dropbox: (process.env.DROPBOX_APP_KEY || "").trim(),
    google_drive: (process.env.GOOGLE_DRIVE_API_KEY || "").trim(),
    box: (process.env.BOX_DEVELOPER_TOKEN || "").trim(),
    onedrive: (process.env.MICROSOFT_GRAPH_KEY || "").trim(),
  };

  // Try Supabase config table if available
  if (supabaseAdmin) {
    try {
      let query = supabaseAdmin.from("cloud_provider_configs").select("provider, api_key, org_id");

      // Get platform keys (org_id is null) and org-specific keys
      if (orgId) {
        query = query.or(`org_id.is.null,org_id.eq.${orgId}`);
      } else {
        query = query.is("org_id", null);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        for (const row of data) {
          // Org-specific keys override platform keys
          if (row.org_id || !envKeys[row.provider]) {
            envKeys[row.provider] = row.api_key;
          }
        }
      }
    } catch {
      // Table may not exist yet — fall back to env vars
    }
  }

  return envKeys;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { planLinks = [], rfpId, existingFilenames = [] } = req.body || {};
  if (!planLinks.length) return res.status(200).json({ files: [], errors: [] });
  if (!rfpId) return res.status(400).json({ error: "rfpId required" });

  const apiKeys = await getApiKeys(null);
  const results = { files: [], errors: [] };
  const existingSet = new Set((existingFilenames || []).map(f => f.toLowerCase()));
  const downloadedNames = new Set();
  let totalSize = 0;

  for (const link of planLinks) {
    if (results.files.length >= MAX_FILES) {
      results.errors.push({ url: link.url, error: "max_files_exceeded", label: link.label });
      continue;
    }

    try {
      const provider = getProvider(link.url);

      // Determine which API key to use
      const providerKey = link.provider || "generic";
      const apiKey = apiKeys[providerKey] || apiKeys.dropbox || apiKeys.google_drive || "";

      // Resolve URL to downloadable file descriptors
      const resolved = await provider.resolveFiles(link.url, { apiKey });

      // Handle resolution errors
      if (resolved && !Array.isArray(resolved) && resolved.error) {
        results.errors.push({
          url: link.url,
          error: resolved.error,
          label: link.label,
          message: resolved.message || "",
        });
        continue;
      }

      const fileList = Array.isArray(resolved) ? resolved : [resolved];

      for (const fileInfo of fileList) {
        // Guards
        if (results.files.length >= MAX_FILES) break;
        if (!fileInfo || !fileInfo.filename) continue;
        if (!isAllowedFile(fileInfo.filename)) continue;

        const nameLower = fileInfo.filename.toLowerCase();
        if (existingSet.has(nameLower)) continue;
        if (downloadedNames.has(nameLower)) continue;

        try {
          // Rate limit check before downloading
          const rateCheck = checkRateLimit(providerKey);
          if (!rateCheck.allowed) {
            results.errors.push({
              url: link.url,
              error: "rate_limited",
              filename: fileInfo.filename,
              label: link.label,
              message: `Rate limit reached for ${providerKey}. Retry in ${rateCheck.retryAfter}s`,
            });
            continue;
          }

          // Download the file
          const buffer = await provider.downloadFile(fileInfo);

          // Validate magic bytes — reject HTML interstitials
          if (!validateMagicBytes(buffer, fileInfo.filename)) {
            results.errors.push({
              url: link.url,
              error: "invalid_content",
              filename: fileInfo.filename,
              label: link.label,
              message: "Downloaded content doesn't match expected file type (possibly a login page)",
            });
            continue;
          }

          // Size guards
          if (buffer.length > MAX_FILE_SIZE) {
            results.errors.push({
              url: link.url,
              error: "file_too_large",
              filename: fileInfo.filename,
              label: link.label,
              message: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
            });
            continue;
          }

          totalSize += buffer.length;
          if (totalSize > MAX_TOTAL_SIZE) {
            results.errors.push({
              url: link.url,
              error: "total_size_exceeded",
              label: link.label,
              message: "Total download budget exceeded",
            });
            break;
          }

          // Classify by parent folder
          const docCategory = classifyByParentFolder(fileInfo.relativePath);
          const isAddendum = docCategory === "addendum";
          const addendumNumber = isAddendum ? extractAddendumNumber(fileInfo.relativePath) : null;

          // Upload to Supabase Storage (same bucket as email attachments)
          const storagePath = `${user.id}/${rfpId}/cloud/${fileInfo.filename}`;
          const contentType = getContentType(fileInfo.filename);

          const { error: uploadErr } = await supabaseAdmin.storage
            .from("rfp-attachments")
            .upload(storagePath, buffer, { contentType, upsert: true });

          if (uploadErr) {
            console.error("Supabase upload error:", uploadErr.message);
            results.errors.push({
              url: link.url,
              error: "upload_failed",
              filename: fileInfo.filename,
              label: link.label,
              message: uploadErr.message,
            });
            continue;
          }

          downloadedNames.add(nameLower);
          results.files.push({
            filename: fileInfo.filename,
            contentType,
            size: buffer.length,
            storagePath,
            provider: fileInfo.provider || link.provider,
            label: link.label,
            sourceUrl: link.url,
            relativePath: fileInfo.relativePath || fileInfo.filename,
            docCategory,
            isAddendum,
            addendumNumber,
          });
        } catch (dlErr) {
          console.error(`Download failed [${fileInfo.filename}]:`, dlErr.message);
          results.errors.push({
            url: link.url,
            error: "download_failed",
            filename: fileInfo.filename,
            label: link.label,
            message: dlErr.message,
          });
        }
      }
    } catch (err) {
      console.error(`Provider error [${link.url}]:`, err.message);
      results.errors.push({
        url: link.url,
        error: "provider_error",
        label: link.label,
        message: err.message,
      });
    }
  }

  return res.status(200).json(results);
}
