// markupTaxonomy.js — GC Markup Classification System
// Single source of truth for how below-the-line costs are categorized and analyzed.
//
// Domain context:
//   Fee = profit only.  O&P = overhead + profit.  Some GCs separate overhead from profit.
//   General Conditions (duration-dependent) ≠ General Requirements (flat-fee).
//   Div 01 in the ROM model IS "General Requirements" — overlap is common.
//   Bonds, permits, contingency are project-specific — cannot average across all projects.
//   Insurance is nearly universal in commercial (1.5-3.5%), last line before total.
//   Delivery method shapes markup structure (Hard Bid vs CM vs Design-Build).

// ── Categories ──────────────────────────────────────────────────────────────
// Each category groups related markup types for analytics views.

export const MARKUP_CATEGORIES = [
  { key: "margin",       label: "Margin",           color: "accent",  description: "Profit, overhead, and combined O&P" },
  { key: "general",      label: "General Costs",    color: "blue",    description: "General Requirements & General Conditions" },
  { key: "project-cost", label: "Project-Specific", color: "orange",  description: "Bonds, permits, insurance, contingency, preconstruction" },
  { key: "tax",          label: "Tax",              color: "red",     description: "Sales tax and similar" },
  { key: "custom",       label: "Custom",           color: "purple",  description: "User-defined line items" },
];

// ── Taxonomy ────────────────────────────────────────────────────────────────
// Every known markup type with metadata controlling analytics behavior.
//
// comparable:      true = safe to average across projects
// projectSpecific: true = only on select projects (bonds on bonded, permits where required)
// overlapsDiv01:   true = may overlap with Division 01 in the direct cost model

export const MARKUP_TAXONOMY = [
  // ── Margin (the GC's take) ──
  { key: "fee",         label: "Fee (Profit)",             category: "margin",       comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 1 },
  { key: "op",          label: "Overhead & Profit",        category: "margin",       comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 2 },
  { key: "overhead",    label: "Overhead",                 category: "margin",       comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 3 },
  { key: "profit",      label: "Profit",                   category: "margin",       comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 4 },

  // ── General Costs (site/project management) ──
  { key: "gc",          label: "General Conditions",       category: "general",      comparable: true,  projectSpecific: false, overlapsDiv01: true,  sortOrder: 10 },
  { key: "gr",          label: "General Requirements",     category: "general",      comparable: true,  projectSpecific: false, overlapsDiv01: true,  sortOrder: 11 },

  // ── Project-Specific Costs ──
  { key: "bond",        label: "Bond",                     category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 20 },
  { key: "permit",      label: "Permit Fees",              category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 21 },
  { key: "insurance",   label: "Insurance",                category: "project-cost", comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 22 },
  { key: "contingency", label: "Contingency",              category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 23 },
  { key: "precon",      label: "Preconstruction Services", category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 24 },
  { key: "escalation",  label: "Escalation",               category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 25 },
  { key: "design",      label: "Design Services",          category: "project-cost", comparable: false, projectSpecific: true,  overlapsDiv01: false, sortOrder: 26 },

  // ── Tax ──
  { key: "tax",         label: "Sales Tax",                category: "tax",          comparable: true,  projectSpecific: false, overlapsDiv01: false, sortOrder: 30 },
];

// ── Lookup maps ─────────────────────────────────────────────────────────────

export const MARKUP_TAXONOMY_MAP = Object.fromEntries(
  MARKUP_TAXONOMY.map(m => [m.key, m])
);

export const MARKUP_CATEGORY_MAP = Object.fromEntries(
  MARKUP_CATEGORIES.map(c => [c.key, c])
);

// ── Classification helpers ──────────────────────────────────────────────────

/** Classify a markup item by key. Returns taxonomy entry or a custom fallback. */
export function classifyMarkup(key) {
  return MARKUP_TAXONOMY_MAP[key] || {
    key, label: key, category: "custom",
    comparable: false, projectSpecific: false, overlapsDiv01: false, sortOrder: 99,
  };
}

/** Get category info (label, color, description) for a markup key. */
export function getMarkupCategory(key) {
  const tax = classifyMarkup(key);
  return MARKUP_CATEGORY_MAP[tax.category] || MARKUP_CATEGORY_MAP["custom"];
}

/** Group an array of markup items by category.
 *  Returns { margin: [...], general: [...], "project-cost": [...], tax: [...], custom: [...] }
 */
export function groupMarkupsByCategory(markups) {
  const groups = {};
  MARKUP_CATEGORIES.forEach(c => { groups[c.key] = []; });
  (markups || []).forEach(m => {
    const tax = classifyMarkup(m.key);
    if (!groups[tax.category]) groups[tax.category] = [];
    groups[tax.category].push({ ...m, _taxonomy: tax });
  });
  return groups;
}

/** Filter to only comparable (averageable) markups — excludes bonds, permits, contingency, etc. */
export function getComparableMarkups(markups) {
  return (markups || []).filter(m => {
    const tax = classifyMarkup(m.key);
    return tax.comparable && !tax.projectSpecific;
  });
}

// ── Smart detection helpers ─────────────────────────────────────────────────

/** Detect how a proposal structures its margin:
 *  "combined"      — has O&P as one line
 *  "split"         — has both fee/profit AND overhead as separate lines
 *  "fee-only"      — only fee/profit (overhead may be in GR/GC rates)
 *  "overhead-only" — only overhead shown
 *  "none"          — no margin items
 */
export function detectMarginGrouping(markups) {
  const keys = new Set((markups || []).map(m => m.key));
  if (keys.has("op")) return "combined";
  const hasFeeOrProfit = keys.has("fee") || keys.has("profit");
  const hasOverhead = keys.has("overhead");
  if (hasFeeOrProfit && hasOverhead) return "split";
  if (hasFeeOrProfit) return "fee-only";
  if (hasOverhead) return "overhead-only";
  return "none";
}

/** Detect if insurance is NOT broken out (assumed included in O&P or Overhead). */
export function isInsuranceAssumedInOP(markups) {
  return !(markups || []).some(m => m.key === "insurance");
}

/** Detect how a proposal structures its general costs relative to Division 01.
 *  "in-divisions"  — Div 01 has costs, no GC/GR markups
 *  "gc-markup"     — GC is a below-the-line markup
 *  "gr-markup"     — GR is a below-the-line markup
 *  "split-markup"  — Both GC and GR are separate markups
 *  "both-overlap"  — Div 01 AND GC/GR markups both present (potential double-count)
 *  "none"          — No general costs found anywhere
 */
export function detectGeneralCostGrouping(markups, divisions) {
  const markupKeys = new Set((markups || []).map(m => m.key));
  const hasDiv01 = divisions && parseFloat(divisions["01"]) > 0;
  const hasGCMarkup = markupKeys.has("gc");
  const hasGRMarkup = markupKeys.has("gr");
  const hasAnyMarkup = hasGCMarkup || hasGRMarkup;

  if (hasDiv01 && hasAnyMarkup) return "both-overlap";
  if (hasDiv01 && !hasAnyMarkup) return "in-divisions";
  if (hasGCMarkup && hasGRMarkup) return "split-markup";
  if (hasGCMarkup) return "gc-markup";
  if (hasGRMarkup) return "gr-markup";
  return "none";
}

// ── Backwards-compatible MARKUP_PRESETS ──────────────────────────────────────
// Derived from taxonomy. Used by CostHistoryEntryForm preset buttons.

export const MARKUP_PRESETS = MARKUP_TAXONOMY.map(t => ({
  key: t.key,
  label: t.label,
  category: t.category,
}));
