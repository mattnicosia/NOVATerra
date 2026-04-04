/**
 * Proposal Design System
 *
 * Single source of truth for all proposal section styling.
 * Takes user preferences (font, orientation, accent) and returns
 * a complete style object for consistent rendering.
 */

// Available font families for proposal output
export const PROPOSAL_FONTS = [
  { id: "switzer", label: "Switzer", family: "'Switzer', -apple-system, sans-serif", category: "Modern Sans" },
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif", category: "Classic Serif" },
  { id: "garamond", label: "Garamond", family: "'EB Garamond', Garamond, 'Times New Roman', serif", category: "Elegant Serif" },
  { id: "palatino", label: "Palatino", family: "'Palatino Linotype', Palatino, 'Book Antiqua', serif", category: "Professional Serif" },
  { id: "helvetica", label: "Helvetica", family: "'Helvetica Neue', Helvetica, Arial, sans-serif", category: "Clean Sans" },
  { id: "inter", label: "Inter", family: "'Inter', -apple-system, sans-serif", category: "Technical Sans" },
  { id: "times", label: "Times New Roman", family: "'Times New Roman', Times, serif", category: "Traditional Serif" },
  { id: "cambria", label: "Cambria", family: "Cambria, Georgia, serif", category: "Modern Serif" },
];

export const PROPOSAL_ORIENTATIONS = [
  { id: "portrait", label: "Portrait", icon: "P" },
  { id: "landscape", label: "Landscape", icon: "L" },
];

// Accent color presets
export const PROPOSAL_ACCENTS = [
  { id: "navy", label: "Navy", color: "#1a1a2e" },
  { id: "slate", label: "Slate", color: "#334155" },
  { id: "charcoal", label: "Charcoal", color: "#1f2937" },
  { id: "blue", label: "Corporate Blue", color: "#1e40af" },
  { id: "green", label: "Forest Green", color: "#166534" },
  { id: "red", label: "Classic Red", color: "#991b1b" },
  { id: "black", label: "Black", color: "#111111" },
  { id: "custom", label: "Custom", color: null },
];

/**
 * Build complete proposal style system from user preferences
 * @param {object} config - { fontId, accentId, customAccent, orientation }
 * @returns {object} Complete style system
 */
export function buildProposalStyles(config = {}) {
  const fontDef = PROPOSAL_FONTS.find(f => f.id === config.fontId) || PROPOSAL_FONTS[0];
  const accentDef = PROPOSAL_ACCENTS.find(a => a.id === config.accentId) || PROPOSAL_ACCENTS[0];
  const accent = accentDef.color || config.customAccent || "#1a1a2e";
  const isLandscape = config.orientation === "landscape";

  // Mono font for dollar amounts
  const monoFont = "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace";

  return {
    // -- Font families --
    font: {
      body: fontDef.family,
      heading: fontDef.family,
      mono: monoFont,
      label: fontDef.family,
    },

    // -- Type scale (8px base, 1.25 ratio) --
    type: {
      title:    { fontSize: 22, fontWeight: 800, letterSpacing: 0.3, lineHeight: 1.3 },
      h1:       { fontSize: 16, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.4 },
      h2:       { fontSize: 13, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.4, textTransform: "uppercase" },
      body:     { fontSize: 11, fontWeight: 400, letterSpacing: 0, lineHeight: 1.7 },
      bodyBold: { fontSize: 11, fontWeight: 600, letterSpacing: 0, lineHeight: 1.7 },
      caption:  { fontSize: 10, fontWeight: 500, letterSpacing: 0.3, lineHeight: 1.5 },
      label:    { fontSize: 9, fontWeight: 600, letterSpacing: 0.8, lineHeight: 1.4, textTransform: "uppercase" },
      legal:    { fontSize: 8, fontWeight: 400, letterSpacing: 0.2, lineHeight: 1.5 },
      money:    { fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: monoFont },
      moneyLg:  { fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", fontFamily: monoFont },
    },

    // -- Colors --
    color: {
      text: "#1a1a2e",
      textMed: "#444444",
      textDim: "#666666",
      textMuted: "#999999",
      accent,
      accentLight: accent + "15",
      accentMed: accent + "30",
      border: "#dddddd",
      borderLight: "#eeeeee",
      bgSubtle: "#f8f9fa",
      bgAccent: accent + "08",
      white: "#ffffff",
    },

    // -- Spacing (8px base grid) --
    space: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
      section: 28,
      subsection: 16,
    },

    // -- Section styles --
    section: {
      header: {
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: accent,
        borderBottom: `2px solid ${accent}`,
        paddingBottom: 6,
        marginBottom: 16,
      },
      subheader: {
        fontSize: 11,
        fontWeight: 600,
        color: "#333333",
        marginBottom: 8,
      },
      divider: {
        borderTop: `1px solid #eeeeee`,
        margin: "16px 0",
      },
      accentBar: {
        height: 3,
        background: accent,
        marginBottom: 24,
      },
    },

    // -- Page layout --
    page: {
      orientation: isLandscape ? "landscape" : "portrait",
      width: isLandscape ? "11in" : "8.5in",
      height: isLandscape ? "8.5in" : "11in",
      padding: isLandscape ? "32px 48px" : "40px 48px",
      maxWidth: isLandscape ? 960 : 720,
    },

    // -- Table styles --
    table: {
      header: {
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: accent,
        borderBottom: `2px solid ${accent}`,
        padding: "8px 6px",
      },
      row: {
        fontSize: 11,
        padding: "6px 6px",
        borderBottom: "1px solid #eeeeee",
      },
      rowAlt: {
        background: "#f8f9fa",
      },
      total: {
        fontSize: 13,
        fontWeight: 700,
        borderTop: `2px solid ${accent}`,
        padding: "10px 6px",
      },
    },

    // -- Special elements --
    signature: {
      lineHeight: 28,
      lineColor: "#999999",
      labelSize: 9,
    },

    // -- Footer --
    footer: {
      fontSize: 8,
      color: "#999999",
      borderTop: `1px solid #dddddd`,
      paddingTop: 8,
    },

    // Helper: apply font family to a style object
    withFont: (style) => ({ ...style, fontFamily: fontDef.family }),
    withMono: (style) => ({ ...style, fontFamily: monoFont }),
  };
}

// Default styles (Switzer, Navy, Portrait)
export const DEFAULT_PROPOSAL_STYLES = buildProposalStyles({
  fontId: "switzer",
  accentId: "navy",
  orientation: "portrait",
});
