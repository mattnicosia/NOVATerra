/**
 * Cloud Storage Download Library — server-side only
 * Downloads files from Dropbox, Google Drive, Box, OneDrive/SharePoint, WeTransfer.
 * Each provider: { canHandle(url), resolveFiles(url, opts), downloadFile(fileInfo) }
 *
 * Key design decisions (from Marcus Webb + Priya Nair review):
 * - Dropbox: Use API for ALL downloads (dl=1 hack unreliable for >20MB files)
 * - Google Drive: Handle virus-scan confirm token for large files (>100MB)
 * - Magic byte validation on every download (rejects HTML interstitials)
 * - Classify files by parent folder name (Drawings → drawing, Specs → spec, Addenda → addendum)
 */

// ── Allowed file extensions for construction documents ───────────────
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "tif",
  "tiff",
  "dwg",
  "dxf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
]);

export function isAllowedFile(filename) {
  if (!filename) return false;
  const ext = filename.split(".").pop().toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

// ── Content type mapping ─────────────────────────────────────────────
const CONTENT_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tif: "image/tiff",
  tiff: "image/tiff",
  gif: "image/gif",
  dwg: "application/acad",
  dxf: "application/dxf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export function getContentType(filename) {
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop().toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

// ── Magic byte validation ────────────────────────────────────────────
// Rejects HTML interstitial pages disguised as files (Dropbox throttle, Google virus scan)
const MAGIC_BYTES = [
  { ext: ["pdf"], bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: ["png"], bytes: [0x89, 0x50, 0x4e, 0x47] }, // .PNG
  { ext: ["jpg", "jpeg"], bytes: [0xff, 0xd8, 0xff] }, // JPEG SOI
  { ext: ["tif", "tiff"], bytes: [0x49, 0x49, 0x2a, 0x00] }, // TIFF LE
  { ext: ["tif", "tiff"], bytes: [0x4d, 0x4d, 0x00, 0x2a] }, // TIFF BE
  { ext: ["dwg"], bytes: [0x41, 0x43, 0x31, 0x30] }, // AC10 (DWG)
  { ext: ["xlsx", "docx"], bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK (ZIP/Office)
  { ext: ["xls", "doc"], bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE compound
];

/**
 * Validate that a buffer's content matches expected file type.
 * Returns true if valid, false if it looks like an HTML interstitial page.
 */
export function validateMagicBytes(buffer, filename) {
  if (!buffer || buffer.length < 4) return false;
  const bytes = new Uint8Array(buffer.slice(0, 8));

  // If it starts with <!DOCTYPE or <html or <HTML → it's an HTML page, not a file
  const textStart = String.fromCharCode(...bytes.slice(0, 5));
  if (textStart.startsWith("<!DOC") || textStart.startsWith("<html") || textStart.startsWith("<HTML")) {
    return false;
  }

  // If we know the expected extension, check magic bytes
  if (filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const expected = MAGIC_BYTES.filter(m => m.ext.includes(ext));
    if (expected.length > 0) {
      return expected.some(m => m.bytes.every((b, i) => bytes[i] === b));
    }
  }

  // For unknown extensions (csv, dxf), just verify it's not HTML
  return true;
}

// ── Parent folder classification ─────────────────────────────────────
// Priya Nair: "A PDF in a Drawings folder is a drawing. A PDF in Specifications is a spec."
const FOLDER_CATEGORIES = [
  {
    pattern: /^(drawings?|plans?|architectural|structural|mep|mechanical|electrical|plumbing|civil|landscape|sheet)/i,
    category: "drawing",
  },
  { pattern: /^(specifications?|specs?|project\s*manual|divisions?)/i, category: "spec" },
  { pattern: /^(addend(a|um))/i, category: "addendum" },
  { pattern: /^(bid\s*(form|package|document)|proposal|itb|rfp)/i, category: "bid_form" },
  { pattern: /^(geotech|report|survey|environmental)/i, category: "report" },
];

/**
 * Classify a file by its parent folder name.
 * @param {string} relativePath - e.g. "Drawings/Architectural/A-100.pdf"
 * @returns {string} category: "drawing"|"spec"|"addendum"|"bid_form"|"report"|"general"
 */
export function classifyByParentFolder(relativePath) {
  if (!relativePath) return "general";
  const parts = relativePath.split("/").filter(Boolean);
  // Check each folder in the path (parent folders first)
  for (const part of parts.slice(0, -1)) {
    for (const { pattern, category } of FOLDER_CATEGORIES) {
      if (pattern.test(part.trim())) return category;
    }
  }
  return "general";
}

/**
 * Extract addendum number from path or filename.
 * e.g. "Addendum 2/revised-plans.pdf" → 2
 */
export function extractAddendumNumber(relativePath) {
  if (!relativePath) return null;
  const match = relativePath.match(/addend(?:a|um)\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ── Helper: extract filename from URL ────────────────────────────────
function extractFilenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last.includes(".")) return decodeURIComponent(last);
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: DROPBOX
// Uses Dropbox API exclusively (dl=1 hack unreliable for >20MB files)
// ═══════════════════════════════════════════════════════════════════════
export const dropbox = {
  canHandle: url => /dropbox\.com/i.test(url),

  isFolder(url) {
    return /\/(sh|scl\/fo)\//i.test(url);
  },

  /**
   * Resolve a Dropbox shared link to downloadable file descriptors.
   * For files: returns single-item array with download info.
   * For folders: lists folder contents, returns all allowed files.
   */
  async resolveFiles(url, { apiKey } = {}) {
    if (!apiKey) {
      // Without API key, attempt direct download (may fail for large files)
      return this._resolveWithoutApi(url);
    }

    if (this.isFolder(url)) {
      return this._listFolder(url, apiKey);
    }

    // Single file — download via API
    const filename = extractFilenameFromUrl(url) || "download.pdf";
    return [
      {
        downloadUrl: url,
        filename,
        provider: "dropbox",
        relativePath: filename,
        _useApi: true,
        _apiKey: apiKey,
      },
    ];
  },

  async _resolveWithoutApi(url) {
    // Fallback: try dl=1 URL transform (works for small public files)
    const directUrl = url.replace(/[?&]dl=0/i, "").replace(/\?$/, "") + (url.includes("?") ? "&dl=1" : "?dl=1");
    const filename = extractFilenameFromUrl(url) || "download.pdf";
    return [
      {
        downloadUrl: directUrl,
        filename,
        provider: "dropbox",
        relativePath: filename,
      },
    ];
  },

  async _listFolder(url, apiKey) {
    try {
      const resp = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "",
          shared_link: { url: url.split("?")[0] },
          recursive: true,
          limit: 100,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Dropbox list_folder error:", resp.status, errText);
        return { error: "dropbox_folder_error", message: `API ${resp.status}` };
      }

      const data = await resp.json();
      const files = (data.entries || [])
        .filter(e => e[".tag"] === "file" && isAllowedFile(e.name))
        .map(e => ({
          downloadUrl: url.split("?")[0],
          filename: e.name,
          provider: "dropbox",
          relativePath: e.path_display ? e.path_display.replace(/^\//, "") : e.name,
          size: e.size,
          _useApi: true,
          _apiKey: apiKey,
          _path: e.path_lower,
        }));

      return files;
    } catch (err) {
      return { error: "dropbox_folder_error", message: err.message };
    }
  },

  async downloadFile(fileInfo) {
    if (fileInfo._useApi) {
      // Use Dropbox shared link download API
      const headers = {
        Authorization: `Bearer ${fileInfo._apiKey}`,
        "Dropbox-API-Arg": JSON.stringify({
          url: fileInfo.downloadUrl,
          path: fileInfo._path || "",
        }),
      };

      const resp = await fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", {
        method: "POST",
        headers,
      });

      if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    }

    // Fallback: direct download
    const resp = await fetch(fileInfo.downloadUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  },
};

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: GOOGLE DRIVE
// Handles virus scan interstitial for large files (>100MB)
// ═══════════════════════════════════════════════════════════════════════
export const googleDrive = {
  canHandle: url => /drive\.google\.com|docs\.google\.com/i.test(url),

  extractFileId(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match?.[1] || null;
  },

  extractFolderId(url) {
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || null;
  },

  isFolder(url) {
    return !!this.extractFolderId(url);
  },

  async resolveFiles(url, { apiKey } = {}) {
    const fileId = this.extractFileId(url);
    const folderId = this.extractFolderId(url);

    if (fileId) {
      // Single file
      let filename = extractFilenameFromUrl(url) || "download.pdf";

      // If we have an API key, get proper filename from metadata
      if (apiKey) {
        try {
          const metaResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=name,mimeType,size`,
          );
          if (metaResp.ok) {
            const meta = await metaResp.json();
            filename = meta.name || filename;
          }
        } catch {
          /* use fallback filename */
        }
      }

      return [
        {
          downloadUrl: apiKey
            ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
            : `https://drive.google.com/uc?export=download&id=${fileId}`,
          filename,
          provider: "google_drive",
          relativePath: filename,
          _fileId: fileId,
          _apiKey: apiKey,
        },
      ];
    }

    if (folderId) {
      if (!apiKey) return { error: "folder_needs_api_key", provider: "google_drive" };
      return this._listFolder(folderId, apiKey, "");
    }

    return { error: "invalid_url", message: "Could not extract file or folder ID" };
  },

  async _listFolder(folderId, apiKey, parentPath) {
    try {
      const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const fields = encodeURIComponent("files(id,name,mimeType,size),nextPageToken");
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&key=${apiKey}&fields=${fields}&pageSize=100`,
      );

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Google Drive list error:", resp.status, errText);
        return { error: "gdrive_folder_error", message: `API ${resp.status}` };
      }

      const data = await resp.json();
      const results = [];

      for (const file of data.files || []) {
        const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;

        if (file.mimeType === "application/vnd.google-apps.folder") {
          // Recurse into subfolder (1 level deep from here)
          if (parentPath.split("/").length < 3) {
            const subFiles = await this._listFolder(file.id, apiKey, relativePath);
            if (Array.isArray(subFiles)) results.push(...subFiles);
          }
          continue;
        }

        if (!isAllowedFile(file.name)) continue;

        results.push({
          downloadUrl: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`,
          filename: file.name,
          provider: "google_drive",
          relativePath,
          size: file.size ? parseInt(file.size) : undefined,
          _fileId: file.id,
          _apiKey: apiKey,
        });
      }

      return results;
    } catch (err) {
      return { error: "gdrive_folder_error", message: err.message };
    }
  },

  async downloadFile(fileInfo) {
    let resp = await fetch(fileInfo.downloadUrl, { redirect: "follow" });

    // Handle Google Drive virus scan confirmation for large files
    if (resp.ok) {
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await resp.text();
        const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch) {
          // Re-request with confirmation token
          const confirmUrl = fileInfo._apiKey
            ? `${fileInfo.downloadUrl}&confirm=${confirmMatch[1]}`
            : `https://drive.google.com/uc?export=download&id=${fileInfo._fileId}&confirm=${confirmMatch[1]}`;
          resp = await fetch(confirmUrl, { redirect: "follow" });
          if (!resp.ok) throw new Error(`Google Drive confirm download failed: ${resp.status}`);
        } else {
          throw new Error("Google Drive returned HTML (possibly auth required)");
        }
      }
    } else {
      throw new Error(`Google Drive download failed: ${resp.status}`);
    }

    return Buffer.from(await resp.arrayBuffer());
  },
};

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: BOX
// Uses shared item API with BoxApi header
// ═══════════════════════════════════════════════════════════════════════
export const box = {
  canHandle: url => /box\.com/i.test(url),

  isFolder(url) {
    // Box doesn't distinguish folder/file URLs well — need API to determine
    return false;
  },

  async resolveFiles(url, { apiKey } = {}) {
    if (!apiKey) {
      return { error: "needs_api_key", provider: "box" };
    }

    try {
      // Get shared item metadata
      const resp = await fetch("https://api.box.com/2.0/shared_items", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          BoxApi: `shared_link=${url}`,
        },
      });

      if (!resp.ok) return { error: "box_api_error", message: `API ${resp.status}` };
      const item = await resp.json();

      if (item.type === "file") {
        if (!isAllowedFile(item.name)) return [];
        return [
          {
            downloadUrl: `https://api.box.com/2.0/files/${item.id}/content`,
            filename: item.name,
            provider: "box",
            relativePath: item.name,
            size: item.size,
            _apiKey: apiKey,
          },
        ];
      }

      if (item.type === "folder") {
        return this._listFolder(item.id, apiKey, "");
      }

      return [];
    } catch (err) {
      return { error: "box_api_error", message: err.message };
    }
  },

  async _listFolder(folderId, apiKey, parentPath) {
    try {
      const resp = await fetch(`https://api.box.com/2.0/folders/${folderId}/items?limit=100&fields=id,type,name,size`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return { error: "box_folder_error", message: `API ${resp.status}` };
      const data = await resp.json();
      const results = [];

      for (const entry of data.entries || []) {
        const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

        if (entry.type === "folder" && parentPath.split("/").length < 3) {
          const subFiles = await this._listFolder(entry.id, apiKey, relativePath);
          if (Array.isArray(subFiles)) results.push(...subFiles);
          continue;
        }

        if (entry.type !== "file" || !isAllowedFile(entry.name)) continue;
        results.push({
          downloadUrl: `https://api.box.com/2.0/files/${entry.id}/content`,
          filename: entry.name,
          provider: "box",
          relativePath,
          size: entry.size,
          _apiKey: apiKey,
        });
      }
      return results;
    } catch (err) {
      return { error: "box_folder_error", message: err.message };
    }
  },

  async downloadFile(fileInfo) {
    const resp = await fetch(fileInfo.downloadUrl, {
      headers: { Authorization: `Bearer ${fileInfo._apiKey}` },
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`Box download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  },
};

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: ONEDRIVE / SHAREPOINT
// Uses Microsoft Graph sharing API (encodes URL as sharing token)
// ═══════════════════════════════════════════════════════════════════════
export const onedrive = {
  canHandle: url => /1drv\.ms|onedrive\.live\.com|sharepoint\.com/i.test(url),

  _encodeShareUrl(url) {
    // Microsoft Graph: encode shared URL → u!{base64url}
    const b64 = Buffer.from(url).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    return `u!${b64}`;
  },

  isFolder(url) {
    return /\/folder\//i.test(url) || /Forms\/AllItems/i.test(url);
  },

  async resolveFiles(url, { apiKey } = {}) {
    if (!apiKey) {
      return { error: "needs_api_key", provider: "onedrive" };
    }

    const encoded = this._encodeShareUrl(url);
    try {
      // Get shared item
      const resp = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!resp.ok) return { error: "onedrive_api_error", message: `API ${resp.status}` };
      const item = await resp.json();

      if (item.folder) {
        return this._listChildren(encoded, apiKey, "");
      }

      if (item.name && isAllowedFile(item.name)) {
        return [
          {
            downloadUrl: `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/content`,
            filename: item.name,
            provider: "onedrive",
            relativePath: item.name,
            size: item.size,
            _apiKey: apiKey,
          },
        ];
      }

      return [];
    } catch (err) {
      return { error: "onedrive_api_error", message: err.message };
    }
  },

  async _listChildren(encoded, apiKey, parentPath) {
    try {
      const resp = await fetch(`https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/children?$top=100`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) return { error: "onedrive_folder_error", message: `API ${resp.status}` };
      const data = await resp.json();
      const results = [];

      for (const item of data.value || []) {
        const relativePath = parentPath ? `${parentPath}/${item.name}` : item.name;

        if (item.folder && parentPath.split("/").length < 3) {
          // Need to encode the child folder's webUrl for further listing
          if (item.webUrl) {
            const childEncoded = this._encodeShareUrl(item.webUrl);
            const subFiles = await this._listChildren(childEncoded, apiKey, relativePath);
            if (Array.isArray(subFiles)) results.push(...subFiles);
          }
          continue;
        }

        if (!item.file || !isAllowedFile(item.name)) continue;
        results.push({
          downloadUrl: item["@microsoft.graph.downloadUrl"] || item["@content.downloadUrl"],
          filename: item.name,
          provider: "onedrive",
          relativePath,
          size: item.size,
          _apiKey: apiKey,
        });
      }
      return results;
    } catch (err) {
      return { error: "onedrive_folder_error", message: err.message };
    }
  },

  async downloadFile(fileInfo) {
    const headers = fileInfo._apiKey ? { Authorization: `Bearer ${fileInfo._apiKey}` } : {};
    const resp = await fetch(fileInfo.downloadUrl, { headers, redirect: "follow" });
    if (!resp.ok) throw new Error(`OneDrive download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  },
};

// ═══════════════════════════════════════════════════════════════════════
// PROVIDER: WETRANSFER
// Attempts internal API; graceful fallback to manual link
// ═══════════════════════════════════════════════════════════════════════
export const wetransfer = {
  canHandle: url => /we\.tl|wetransfer\.com/i.test(url),

  async resolveFiles(url) {
    // WeTransfer's download API is undocumented/fragile — graceful fallback
    return {
      error: "wetransfer_not_supported",
      message: "WeTransfer auto-download not available — please download manually",
    };
  },

  async downloadFile() {
    throw new Error("WeTransfer auto-download not supported");
  },
};

// ═══════════════════════════════════════════════════════════════════════
// GENERIC FALLBACK
// Direct fetch with redirect following; validates with magic bytes
// ═══════════════════════════════════════════════════════════════════════
export const generic = {
  canHandle: () => true,

  async resolveFiles(url) {
    const filename = extractFilenameFromUrl(url) || "download";
    if (!isAllowedFile(filename)) {
      return { error: "unsupported_file_type", message: `File type not supported: ${filename}` };
    }
    return [
      {
        downloadUrl: url,
        filename,
        provider: "generic",
        relativePath: filename,
      },
    ];
  },

  async downloadFile(fileInfo) {
    const resp = await fetch(fileInfo.downloadUrl, { redirect: "follow" });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  },
};

// ── Provider registry ────────────────────────────────────────────────
const PROVIDERS = [dropbox, googleDrive, box, onedrive, wetransfer];

export function getProvider(url) {
  return PROVIDERS.find(p => p.canHandle(url)) || generic;
}
