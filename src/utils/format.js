export const uid = () => Math.random().toString(36).substr(2, 9);

export const fmt = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

export const fmt2 = (v) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v || 0);

export const pct = (v) => `${(v || 0).toFixed(1)}%`;

export const nn = (v) => parseFloat(v) || 0;

export const today = () => new Date().toISOString().split("T")[0];

export const nowStr = () =>
  new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Capitalize the first letter of each word, preserving the rest
// e.g. "joint compound" → "Joint Compound", "CMU wall" stays "CMU Wall"
// Skips words that are already all-uppercase (abbreviations like CMU, PSI, LVL)
export const titleCase = (s) => {
  if (!s || typeof s !== "string") return s || "";
  return s.replace(/\b[a-zA-Z]\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
};
