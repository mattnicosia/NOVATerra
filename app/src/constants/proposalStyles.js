/**
 * Proposal Design System
 *
 * Single source of truth for all proposal section styling.
 * Takes user preferences (font, orientation, accent) and returns
 * a complete style object for consistent rendering.
 */

// Available font families for proposal output
export const PROPOSAL_FONTS = [
  { id: "inter", label: "Inter", family: "'Inter', -apple-system, sans-serif", category: "Modern Sans", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" },
  { id: "dm-sans", label: "DM Sans", family: "'DM Sans', -apple-system, sans-serif", category: "Geometric Sans", googleFontsUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" },
  { id: "plus-jakarta", label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', -apple-system, sans-serif", category: "Humanist Sans", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" },
  { id: "source-serif", label: "Source Serif 4", family: "'Source Serif 4', Georgia, serif", category: "Editorial Serif", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@300;400;500;600;700;800&display=swap" },
  { id: "libre-baskerville", label: "Libre Baskerville", family: "'Libre Baskerville', Georgia, serif", category: "Classic Serif", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&display=swap" },
  { id: "cormorant", label: "Cormorant Garamond", family: "'Cormorant Garamond', Garamond, serif", category: "Elegant Serif", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&display=swap" },
  { id: "roboto", label: "Roboto", family: "'Roboto', Arial, sans-serif", category: "Universal Sans", googleFontsUrl: "https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" },
  { id: "eb-garamond", label: "EB Garamond", family: "'EB Garamond', 'Times New Roman', serif", category: "Traditional Serif", googleFontsUrl: "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700;800&display=swap" },
];

/**
 * Dynamically load a Google Font by injecting a <link> tag.
 * Idempotent — won't add duplicate links for the same font.
 */
export function loadProposalFont(fontId) {
  const fontDef = PROPOSAL_FONTS.find(f => f.id === fontId);
  if (!fontDef?.googleFontsUrl) return;

  const linkId = `proposal-font-${fontId}`;
  if (document.getElementById(linkId)) return; // Already loaded

  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = fontDef.googleFontsUrl;
  document.head.appendChild(link);
}

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

// Proposal layout modes
export const PROPOSAL_LAYOUTS = [
  { id: "default", label: "Standard", description: "Traditional construction proposal" },
  { id: "monograph", label: "Monograph", description: "Architectural book layout" },
];

// Monograph section ordering
export const MONOGRAPH_SECTION_ORDER = [
  "heroImage", "coverLetter", "projectVision", "siteContext", "scope",
  "costVisualization3D", "baseBid", "sov", "designNarrative",
  "alternates", "exclusions", "allowances", "clarifications",
  "qualifications", "closing", "signature", "acceptance", "costGraph",
];

/**
 * Build complete proposal style system from user preferences
 * @param {object} config - { fontId, accentId, customAccent, orientation, layout }
 * @returns {object} Complete style system
 */
export function buildProposalStyles(config = {}) {
  const fontDef = PROPOSAL_FONTS.find(f => f.id === config.fontId) || PROPOSAL_FONTS[0];
  const accentDef = PROPOSAL_ACCENTS.find(a => a.id === config.accentId) || PROPOSAL_ACCENTS[0];
  const accent = accentDef.color || config.customAccent || "#1a1a2e";
  const isLandscape = config.orientation === "landscape";
  const isMonograph = config.layout === "monograph";

  // Mono font for dollar amounts
  const monoFont = "'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace";

  // Monograph uses serif for headings, body font for body
  const serifFont = "'Source Serif 4', Georgia, serif";
  const headingFamily = isMonograph ? serifFont : fontDef.family;

  return {
    layout: config.layout || "default",
    isMonograph,

    // -- Font families --
    font: {
      body: fontDef.family,
      heading: headingFamily,
      mono: monoFont,
      label: fontDef.family,
    },

    // -- Type scale (monograph uses larger, more editorial sizing) --
    type: isMonograph ? {
      title:    { fontSize: 28, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.2, fontFamily: headingFamily },
      h1:       { fontSize: 20, fontWeight: 600, letterSpacing: -0.1, lineHeight: 1.3, fontFamily: headingFamily },
      h2:       { fontSize: 14, fontWeight: 600, letterSpacing: 0.3, lineHeight: 1.4, textTransform: "uppercase", fontFamily: fontDef.family },
      body:     { fontSize: 12, fontWeight: 400, letterSpacing: 0, lineHeight: 1.8 },
      bodyBold: { fontSize: 12, fontWeight: 600, letterSpacing: 0, lineHeight: 1.8 },
      caption:  { fontSize: 10, fontWeight: 500, letterSpacing: 0.3, lineHeight: 1.5 },
      label:    { fontSize: 9, fontWeight: 600, letterSpacing: 1.0, lineHeight: 1.4, textTransform: "uppercase" },
      legal:    { fontSize: 8, fontWeight: 400, letterSpacing: 0.2, lineHeight: 1.5 },
      money:    { fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: monoFont },
      moneyLg:  { fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: monoFont },
      pullQuote:{ fontSize: 16, fontWeight: 400, letterSpacing: 0, lineHeight: 1.6, fontStyle: "italic", fontFamily: headingFamily },
    } : {
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

    // -- Spacing (monograph gets more generous whitespace) --
    space: isMonograph ? {
      xs: 6,
      sm: 12,
      md: 24,
      lg: 36,
      xl: 48,
      xxl: 64,
      section: 44,
      subsection: 24,
    } : {
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
    section: isMonograph ? {
      header: {
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: accent,
        borderBottom: `1px solid ${accent}`,
        paddingBottom: 10,
        marginBottom: 24,
        fontFamily: fontDef.family,
      },
      subheader: {
        fontSize: 12,
        fontWeight: 600,
        color: "#333333",
        marginBottom: 12,
        fontFamily: headingFamily,
      },
      divider: {
        borderTop: `1px solid #eeeeee`,
        margin: "28px 0",
      },
      accentBar: {
        height: 2,
        background: accent,
        marginBottom: 32,
      },
    } : {
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

    // -- Page layout (monograph has wider margins) --
    page: {
      orientation: isLandscape ? "landscape" : "portrait",
      width: isLandscape ? "11in" : "8.5in",
      height: isLandscape ? "8.5in" : "11in",
      padding: isMonograph
        ? (isLandscape ? "40px 60px" : "52px 60px")
        : (isLandscape ? "32px 48px" : "40px 48px"),
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
        fontSize: isMonograph ? 12 : 11,
        padding: isMonograph ? "8px 6px" : "6px 6px",
        borderBottom: "1px solid #eeeeee",
      },
      rowAlt: {
        background: "#f8f9fa",
      },
      total: {
        fontSize: isMonograph ? 14 : 13,
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

// Default styles (Inter, Navy, Portrait, Standard)
export const DEFAULT_PROPOSAL_STYLES = buildProposalStyles({
  fontId: "inter",
  accentId: "navy",
  orientation: "portrait",
  layout: "default",
});

/**
 * Ensure Source Serif 4 is loaded for monograph heading font.
 * Called when monograph layout is selected.
 */
export function loadMonographFonts() {
  loadProposalFont("source-serif");
}
