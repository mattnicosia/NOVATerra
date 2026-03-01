// Cloud storage provider detection from URLs

const PROVIDER_MAP = [
  { match: "dropbox.com", label: "Dropbox", key: "dropbox" },
  { match: "drive.google.com", label: "Google Drive", key: "google_drive" },
  { match: "docs.google.com", label: "Google Drive", key: "google_drive" },
  { match: "box.com", label: "Box", key: "box" },
  { match: "onedrive.live.com", label: "OneDrive", key: "onedrive" },
  { match: "1drv.ms", label: "OneDrive", key: "onedrive" },
  { match: "sharepoint.com", label: "SharePoint", key: "sharepoint" },
  { match: "wetransfer.com", label: "WeTransfer", key: "wetransfer" },
];

/**
 * Detect cloud provider from a URL.
 * Returns { label: "Dropbox", key: "dropbox" } etc.
 * Falls back to { label: "Link", key: "other" }.
 */
export function getProviderInfo(url) {
  if (!url) return { label: "Link", key: "other" };
  const lower = url.toLowerCase();
  for (const p of PROVIDER_MAP) {
    if (lower.includes(p.match)) return { label: p.label, key: p.key };
  }
  return { label: "Link", key: "other" };
}
