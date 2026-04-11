// Canonical source enum for scope items.
// Every scope item's `source` field MUST use one of these values.
// Do not use raw strings — import this enum.

export const SCOPE_SOURCE = {
  SCHEDULE: "schedule",        // From parsed schedule table (highest confidence)
  AI_GAP: "ai-gap",           // AI-generated for divisions with no schedule data
  DRAWING: "drawing",         // Extracted from non-schedule drawing pages
  GEOMETRY: "geometry",       // Measured from vector geometry (room areas, wall lengths)
  TEMPLATE: "template",       // From building-type scope template (lowest confidence)
  NOVA_CHAT: "nova-chat",     // Added via NOVA chat interaction
};

// Display metadata per source — used by ScopeItemRow, RomScopePreview
export const SCOPE_SOURCE_META = {
  [SCOPE_SOURCE.SCHEDULE]: { label: "From Schedules", badge: "FROM SCHEDULES", color: "#22c55e", icon: "table" },
  [SCOPE_SOURCE.AI_GAP]: { label: "AI Suggestion", badge: "AI", color: "#f59e0b", icon: "sparkle" },
  [SCOPE_SOURCE.DRAWING]: { label: "From Plans", badge: "FROM PLANS", color: "#3b82f6", icon: "plans" },
  [SCOPE_SOURCE.GEOMETRY]: { label: "Measured", badge: "MEASURED", color: "#06b6d4", icon: "ruler" },
  [SCOPE_SOURCE.TEMPLATE]: { label: "Template", badge: null, color: "#6b7280", icon: null },
  [SCOPE_SOURCE.NOVA_CHAT]: { label: "NOVA Chat", badge: "NOVA", color: "#8b5cf6", icon: "sparkle" },
};

// Default confidence per source
export const SCOPE_SOURCE_CONFIDENCE = {
  [SCOPE_SOURCE.SCHEDULE]: 0.9,
  [SCOPE_SOURCE.GEOMETRY]: 0.85,
  [SCOPE_SOURCE.DRAWING]: 0.75,
  [SCOPE_SOURCE.AI_GAP]: 0.6,
  [SCOPE_SOURCE.NOVA_CHAT]: 0.5,
  [SCOPE_SOURCE.TEMPLATE]: 0.7,
};
