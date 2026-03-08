// Cloud storage provider detection from URLs

const PROVIDER_MAP = [
  { match: "dropbox.com", label: "Dropbox", key: "dropbox", canAutoDownload: true },
  { match: "drive.google.com", label: "Google Drive", key: "google_drive", canAutoDownload: true },
  { match: "docs.google.com", label: "Google Drive", key: "google_drive", canAutoDownload: true },
  { match: "box.com", label: "Box", key: "box", canAutoDownload: true },
  { match: "onedrive.live.com", label: "OneDrive", key: "onedrive", canAutoDownload: true },
  { match: "1drv.ms", label: "OneDrive", key: "onedrive", canAutoDownload: true },
  { match: "sharepoint.com", label: "SharePoint", key: "sharepoint", canAutoDownload: true },
  { match: "wetransfer.com", label: "WeTransfer", key: "wetransfer", canAutoDownload: true },
  { match: "we.tl", label: "WeTransfer", key: "wetransfer", canAutoDownload: true },
];

/**
 * Detect cloud provider from a URL.
 * Returns { label, key, canAutoDownload } or fallback.
 */
export function getProviderInfo(url) {
  if (!url) return { label: "Link", key: "other", canAutoDownload: false };
  const lower = url.toLowerCase();
  for (const p of PROVIDER_MAP) {
    if (lower.includes(p.match)) return { label: p.label, key: p.key, canAutoDownload: p.canAutoDownload };
  }
  return { label: "Link", key: "other", canAutoDownload: false };
}

/**
 * Detect if a URL is a folder link (may contain multiple files).
 */
export function isFolderLink(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Dropbox folders: /sh/ or /scl/fo/
  if (/dropbox\.com\/(sh|scl\/fo)\//i.test(lower)) return true;
  // Google Drive folders
  if (/drive\.google\.com\/drive\/folders\//i.test(lower)) return true;
  // SharePoint folders
  if (/sharepoint\.com.*\/Forms\/AllItems/i.test(lower)) return true;
  // OneDrive folders
  if (/onedrive.*\/folder\//i.test(lower)) return true;
  return false;
}
