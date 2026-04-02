/**
 * Feature Hints — Contextual "Have you tried?" banners.
 * Each hint shows once (or up to maxImpressions times) then auto-dismisses.
 */

export const FEATURE_HINTS = {
  "widget-edit-mode": {
    message: "You can drag and resize widgets. Click the pencil icon to enter edit mode.",
    page: "dashboard",
    maxImpressions: 3,
  },
  "ai-chat": {
    message: "Have you tried NOVA? Click the AI orb to ask questions about your estimate.",
    page: "estimate",
    maxImpressions: 2,
  },
  "keyboard-shortcuts": {
    message: "Press Cmd+K to open the command palette for quick navigation.",
    page: "any",
    maxImpressions: 2,
  },
  "planroom-upload": {
    message: "Drag and drop PDFs directly onto the plan room to upload. NOVA works best with A-series sheets.",
    page: "planroom",
    maxImpressions: 2,
  },
  "scan-results": {
    message: "After scanning, click any category or relevance badge on notes to correct them. NOVA learns from your feedback.",
    page: "planroom",
    maxImpressions: 2,
  },
};
