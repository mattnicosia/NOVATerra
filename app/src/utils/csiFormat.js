/**
 * CSI MasterFormat code normalization and sorting.
 *
 * Standard format: DD.SSS.SS (dots, zero-padded segments)
 *   Division:    2 digits  → "03", "06", "09"
 *   Subdivision: 3 digits  → "100", "200", "300"
 *   Sub-sub:     2 digits  → "10", "23" (optional)
 *
 * Examples:
 *   "6"       → "06"
 *   "6.1"     → "06.100"
 *   "06.11"   → "06.110"
 *   "06.110"  → "06.110"  (no change)
 *   "3.300.1" → "03.300.10"
 *   ""        → ""
 */

// ── Legacy code migration map ──────────────────────────────
// Codes that were invalid or parent-level before the CSI expansion.
// Applied automatically during normalization so existing estimate
// items migrate to the correct MasterFormat codes on load.
const CODE_MIGRATIONS = {
  "05.110": "05.120",  // → Structural Steel Framing
  "06.190": "06.170",  // → Shop-Fabricated Structural Wood
  "07.780": "07.710",  // → Roof Specialties
  "09.920": "09.910",  // → Painting
  "22.440": "22.410",  // → Residential Plumbing Fixtures
  "23.900": "23.090",  // → Instrumentation & Control For HVAC
  "23.000": "23.050",  // → Common Work Results For HVAC
  "26.000": "26.050",  // → Common Work Results For Electrical
  "32.121": "32.120",  // → Flexible Paving
  "33.110": "33.140",  // → Water Utility Transmission & Distribution
  "05.400": "05.410",  // → Structural Metal Stud Framing
};

export function normalizeCode(raw) {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Split on dots
  const parts = trimmed.split(".");
  if (parts.length === 0) return "";

  // Division: pad to 2 digits
  const div = parts[0].padStart(2, "0");

  if (parts.length === 1) return div;

  // Subdivision: pad to 3 digits
  const sub = parts[1].padStart(3, "0");

  // Build the base code (DD.SSS) for migration lookup
  const base = `${div}.${sub}`;

  // Apply legacy code migrations
  const migrated = CODE_MIGRATIONS[base] || base;

  if (parts.length === 2) return migrated;

  // Sub-subdivision: pad to 2 digits, attached to migrated base
  const subsub = parts[2].padStart(2, "0");
  return `${migrated}.${subsub}`;
}

/**
 * Extract the division (first segment) from a code.
 * "06.110.23" → "06"
 * "06 - Wood" → "06"
 */
export function divisionFromCode(code) {
  if (!code) return "";
  // Handle "06 - Wood" display format
  if (code.includes(" - ")) return code.split(" - ")[0].trim().padStart(2, "0");
  return (code.split(".")[0] || "").padStart(2, "0");
}

/**
 * Extract the subdivision key (first two segments) from a code.
 * "06.110.23" → "06.110"
 * "06"        → "06.000"
 */
export function subdivisionFromCode(code) {
  if (!code) return "";
  const parts = normalizeCode(code).split(".");
  if (parts.length < 2) return `${parts[0]}.000`;
  return `${parts[0]}.${parts[1]}`;
}

/**
 * Numeric-aware sort comparator for CSI codes.
 * Sorts "02" before "06" before "09", and "06.100" before "06.200".
 * Handles display format "06 - Wood" by extracting the code portion.
 */
export function sortCodes(a, b) {
  const na = normalizeCode(divisionFromCode(a) === a ? a : divisionFromCode(a));
  const nb = normalizeCode(divisionFromCode(b) === b ? b : divisionFromCode(b));
  // Pad to fixed width for natural string comparison
  const pa = na.split(".").map(s => s.padStart(4, "0")).join(".");
  const pb = nb.split(".").map(s => s.padStart(4, "0")).join(".");
  return pa.localeCompare(pb);
}

/**
 * Sort display-format division names like "06 - Wood" numerically.
 */
export function sortDivisionNames(a, b) {
  const codeA = (a.split(" - ")[0] || "").padStart(2, "0");
  const codeB = (b.split(" - ")[0] || "").padStart(2, "0");
  return codeA.localeCompare(codeB);
}
