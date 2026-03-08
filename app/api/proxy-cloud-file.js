import { verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import { getProvider, getContentType, validateMagicBytes } from "./lib/cloudDownloaders.js";
import { decryptProxyToken } from "./fetch-cloud-files.js";

/* ────────────────────────────────────────────────────────
   GET /api/proxy-cloud-file?token=<encrypted>
   Streams a cloud file directly to the client, bypassing
   Supabase Storage. Used for files >50MB that exceed the
   Supabase upload limit.

   The token is AES-256-CBC encrypted and contains:
   - downloadUrl, filename, provider, API keys
   - ts: creation timestamp (1-hour expiry)
   ──────────────────────────────────────────────────────── */

const TOKEN_MAX_AGE = 60 * 60 * 1000; // 1 hour
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB — same as fetch-cloud-files

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token required" });

  const info = decryptProxyToken(decodeURIComponent(token));
  if (!info) return res.status(400).json({ error: "Invalid or corrupted token" });

  // Check expiry
  if (Date.now() - info.ts > TOKEN_MAX_AGE) {
    return res.status(410).json({ error: "Token expired — please retry the import" });
  }

  if (!info.downloadUrl || !info.filename) {
    return res.status(400).json({ error: "Incomplete download info in token" });
  }

  try {
    // Re-download from cloud provider using the same provider logic
    const provider = getProvider(info.downloadUrl);
    const buffer = await provider.downloadFile({
      downloadUrl: info.downloadUrl,
      filename: info.filename,
      provider: info.provider,
      _useApi: info._useApi,
      _apiKey: info._apiKey,
      _path: info._path,
      _fileId: info._fileId,
    });

    // Validate magic bytes — same safety check as fetch-cloud-files
    if (!validateMagicBytes(buffer, info.filename)) {
      return res.status(422).json({
        error: "Invalid file content — downloaded content doesn't match expected type",
      });
    }

    // Size guard
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({
        error: `File too large (${(buffer.length / 1024 / 1024).toFixed(0)}MB)`,
      });
    }

    const contentType = getContentType(info.filename);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(info.filename)}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error(`Proxy download error [${info.filename}]:`, err.message);
    return res.status(502).json({
      error: "Cloud download failed",
      message: err.message,
    });
  }
}
