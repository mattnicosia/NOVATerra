export const uid = () => crypto.randomUUID();

export const fmt = (v) => {
  const n = v || 0;
  if (n !== 0 && Math.abs(n) < 1) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
};

export const fmt2 = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v || 0);

export const pct = (v) => `${(v || 0).toFixed(1)}%`;

export const nn = (v) => parseFloat(v) || 0;

export const today = () => new Date().toISOString().split("T")[0];

export const nowStr = () =>
  new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Format currency for display (on blur) — strips to raw number on focus
// Usage: onBlur → formatCurrency(value), onFocus → parseCurrency(formatted)
export const formatCurrency = (v) => {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

export const parseCurrency = (v) => {
  if (!v || typeof v !== "string") return v;
  return v.replace(/[$,]/g, "");
};

// Capitalize the first letter of each word, preserving the rest
// e.g. "joint compound" → "Joint Compound", "CMU wall" stays "CMU Wall"
// Skips words that are already all-uppercase (abbreviations like CMU, PSI, LVL)
export const titleCase = (s) => {
  if (!s || typeof s !== "string") return s || "";
  return s.replace(/\b[a-zA-Z]\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
};
