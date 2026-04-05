// ── Resource Color Utilities ────────────────────────────
// Shared color constants and helpers for resource management views

// Theme-aware status colors — call with C from useTheme()
export const getStatusColors = (C) => ({
  Qualifying: C.orange,
  Bidding: C.purple,
  Submitted: C.blue,
  Won: C.green,
  Lost: C.red,
  "On Hold": C.yellow,
  Draft: C.textDim,
});

export const SCHEDULE_COLORS = {
  ahead: "#30D158",
  "on-track": "#60A5FA",
  behind: "#FF9500",
  overdue: "#FF3B30",
  conflict: "#FF3B30",
};

export function utilizationColor(hours, capacity = 7) {
  const pct = hours / capacity;
  if (pct <= 0) return "transparent";
  if (pct <= 0.5) return "#30D158";
  if (pct <= 0.875) return "#FF9500";
  if (pct <= 1.0) return "#FBBF24";
  return "#FF3B30";
}

export const hexAlpha = (hex, alpha) => {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + a;
};
