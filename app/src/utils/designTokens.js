// Design Tokens — Command Center design system
// Single source of truth for spacing, typography, radii, shadows, transitions

export const T = {
  // Spacing scale (4px base)
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    10: 64,
  },

  // Type scale — 10 sizes with clear contrast between steps
  // UI sizes: xs/sm/base/md (tight cluster for interface text)
  // Display sizes: lg/xl/2xl/3xl/4xl/5xl (dramatic jumps for headlines)
  fontSize: {
    xs: 10,
    sm: 11,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    "2xl": 28,
    "3xl": 36,
    "4xl": 48,
    "5xl": 60,
  },

  // Font weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    heavy: 800,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.6,
  },

  // Letter spacing
  tracking: {
    tight: -0.3,
    normal: 0,
    wide: 0.5,
    wider: 1.0,
    caps: 1.5,
  },

  // Font families
  font: {
    sans: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "'Outfit', 'DM Sans', sans-serif",
  },

  // Border radii — Apple Liquid Glass: larger, softer corners
  radius: {
    sm: 8,
    md: 12,
    lg: 20,
    xl: 26,
    full: 9999,
  },

  // Elevation shadows — boosted for dark surfaces
  shadow: {
    none: "none",
    sm: "0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.18)",
    md: "0 3px 12px rgba(0,0,0,0.30), 0 2px 4px rgba(0,0,0,0.22)",
    lg: "0 8px 24px rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.25)",
    xl: "0 16px 48px rgba(0,0,0,0.45), 0 8px 16px rgba(0,0,0,0.30)",
    glow: "0 0 20px rgba(0,212,255,0.15), 0 0 40px rgba(0,212,255,0.05)",
    glowAccent: "0 0 12px rgba(0,212,255,0.20)",
    glowPurple: "0 0 12px rgba(123,97,255,0.20)",
  },

  // Elevation shadows — Liquid Glass LIGHT: Apple-exact, barely-there depth
  // Apple clear look: widgets have virtually NO drop shadow — glass just floats.
  // Only modals/dropdowns get noticeable shadow.
  shadowLight: {
    none: "none",
    sm: "0 1px 2px rgba(20,30,80,0.04), 0 2px 6px rgba(20,30,80,0.03)",
    md: "0 2px 4px rgba(20,30,80,0.06), 0 4px 12px rgba(20,30,80,0.04)",
    lg: "0 4px 8px rgba(20,30,80,0.08), 0 8px 24px rgba(20,30,80,0.06)",
    xl: "0 8px 16px rgba(20,30,80,0.10), 0 16px 40px rgba(20,30,80,0.08)",
    glow: "0 0 20px rgba(0,122,255,0.18), 0 0 40px rgba(0,122,255,0.08)",
    glowAccent: "0 0 16px rgba(0,122,255,0.22)",
    glowPurple: "0 0 16px rgba(123,97,255,0.22)",
  },

  // Transitions
  transition: {
    fast: "all 100ms ease-out",
    base: "all 150ms ease-out",
    slow: "all 250ms ease-out",
    spring: "all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },

  // Z-index scale
  z: {
    dropdown: 50,
    sticky: 100,
    overlay: 150,
    modal: 200,
    toast: 300,
    tooltip: 400,
  },

  // Layout dimensions
  sidebar: {
    expanded: 240,
    collapsed: 60,
  },

  header: {
    height: 60,
  },

  // Nova dashboard layout
  dashboard: {
    leftPanel: 256,
    rightPanel: 280,
    headerHeight: 60,
    footerHeight: 52,
  },

  // Component sizes (sm/md/lg)
  size: {
    sm: { height: 28, padding: "4px 10px", fontSize: 11, iconSize: 12 },
    md: { height: 34, padding: "7px 14px", fontSize: 13, iconSize: 14 },
    lg: { height: 40, padding: "10px 20px", fontSize: 14, iconSize: 16 },
  },

  // Semantic typography presets — compose from existing scale values
  type: {
    heading: { fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
    subheading: { fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
    body: { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
    caption: { fontSize: 10, fontWeight: 400, lineHeight: 1.4 },
    label: { fontSize: 10, fontWeight: 600, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: 1.5 },
    mono: { fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" },
    monoBig: { fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" },
    // Numeric readout — large tabular numbers (Output VST "XY CONTROL 70 / 30" style)
    numeric: { fontSize: 28, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", lineHeight: 1.0 },
    numericSm: { fontSize: 20, fontWeight: 700, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums", lineHeight: 1.0 },
    // Display presets — Outfit for geometric precision at large sizes
    display: { fontSize: 48, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.5, fontFamily: "'Outfit', 'DM Sans', sans-serif" },
    displaySm: { fontSize: 36, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.0, fontFamily: "'Outfit', 'DM Sans', sans-serif" },
    displayLg: { fontSize: 60, fontWeight: 700, lineHeight: 1.0, letterSpacing: -2.0, fontFamily: "'Outfit', 'DM Sans', sans-serif" },
    hero: { fontSize: 56, fontWeight: 300, lineHeight: 1.05, letterSpacing: -1.5, fontFamily: "'Outfit', 'DM Sans', sans-serif" },
  },

  // ── Accent Glow — Output VST-inspired luminous halos ──
  // Used on interactive elements: buttons (hover), inputs (focus),
  // cards (hover), active indicators (persistent).
  // Values are templates — accent color injected at theme build time.
  // Callers use C.T.glow.md etc. (populated in useTheme with real accent hex).
  glow: {
    sm: "0 0 12px rgba(139,92,246,0.20)",
    md: "0 0 20px rgba(139,92,246,0.30)",
    lg: "0 0 30px rgba(139,92,246,0.40), 0 0 60px rgba(139,92,246,0.15)",
    ring: "0 0 0 1px rgba(139,92,246,0.45), 0 0 15px rgba(139,92,246,0.25)",
  },

  // Liquid Glass DARK — Apple-inspired prominent surface layer.
  // Surface tint raised to 12%+ so panels read as distinct surfaces, not transparent.
  // Specular highlights bright enough to define glass edges. No brightness() amplification.
  glass: {
    blur: "blur(24px) saturate(180%)",
    blurLight: "blur(16px) saturate(160%)",
    blurHover: "blur(28px) saturate(200%)",
    bg: "rgba(255,255,255,0.12)",
    bgDark: "rgba(10,10,22,0.55)",
    border: "rgba(255,255,255,0.16)",
    borderHover: "rgba(255,255,255,0.25)",
    borderLight: "rgba(255,255,255,0.08)",
    // Specular — prominent top-edge highlight defining the glass surface
    specularSm: "inset 0 0.5px 0 rgba(255,255,255,0.28)",
    specular: "inset 0 1px 0 rgba(255,255,255,0.35)",
    specularLg: "inset 0 1px 0 rgba(255,255,255,0.42)",
    specularHover: "inset 0 1px 0 rgba(255,255,255,0.50)",
    // Hairline edge — subtle but visible
    edge: "0 0 0 0.5px rgba(255,255,255,0.10)",
    edgeHover: "0 0 0 0.5px rgba(255,255,255,0.18)",
    // Bottom-edge specular — grounding the glass surface
    specularBottom: "inset 0 -0.5px 0 rgba(255,255,255,0.10)",
    specularBottomLg: "inset 0 -1px 0 rgba(255,255,255,0.16)",
    // Inner depth shadow — gives glass physical thickness
    innerDepth: "inset 0 2px 6px rgba(0,0,0,0.12)",
    innerDepthLg: "inset 0 3px 10px rgba(0,0,0,0.18)",
    // Refraction glow — subtle light spread at glass edges
    refraction: "0 0 6px rgba(255,255,255,0.05)",
    refractionHover: "0 0 10px rgba(255,255,255,0.08)",
    // Lens gradient — brightness variance within glass (CSS string for overlay)
    lens: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 35%, transparent 75%, rgba(0,0,0,0.04) 100%)",
    lensHover:
      "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 35%, transparent 75%, rgba(0,0,0,0.06) 100%)",
  },

  // ── NERO GLASS — "Black Glass From Another Planet" ──
  // Apple Liquid Glass 5-layer stack adapted for void-black backgrounds.
  // Size-dependent weight: small = thin/light, large = thick/deep.
  // Used by neroGlassStyle() in styles.js for floating surfaces.
  // Matte carbon surfaces do NOT use these tokens.
  neroGlass: {
    // ── TIER SM (buttons, badges, small controls) ──
    sm: {
      blur: "blur(8px) saturate(120%)",
      bg: "rgba(255,255,255,0.08)",
      border: "rgba(255,255,255,0.14)",
      specular: "inset 0 0.5px 0 rgba(255,255,255,0.20)",
      specularBottom: "inset 0 -0.5px 0 rgba(255,255,255,0.06)",
      innerDepth: "inset 0 0 8px -3px rgba(255,255,255,0.10)",
      shadow: "0 2px 8px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.30)",
      edge: "0 0 0 0.5px rgba(255,255,255,0.08)",
      hoverGlow: "inset 0 0 12px -4px rgba(255,255,255,0.18)",
    },
    // ── TIER MD (cards, KPIs, dropdowns) ──
    md: {
      blur: "blur(16px) saturate(150%)",
      bg: "rgba(255,255,255,0.12)",
      border: "rgba(255,255,255,0.18)",
      specular: "inset 0 1px 0 rgba(255,255,255,0.28)",
      specularBottom: "inset 0 -0.5px 0 rgba(255,255,255,0.10)",
      innerDepth: "inset 0 0 16px -5px rgba(255,255,255,0.15)",
      shadow: "0 4px 16px rgba(0,0,0,0.50), 0 2px 6px rgba(0,0,0,0.35)",
      edge: "0 0 0 0.5px rgba(255,255,255,0.12)",
      hoverGlow: "inset 0 0 20px -5px rgba(255,255,255,0.24)",
    },
    // ── TIER LG (modals, panels, large cards) ──
    lg: {
      blur: "blur(24px) saturate(160%)",
      bg: "rgba(255,255,255,0.15)",
      border: "rgba(255,255,255,0.20)",
      specular: "inset 1px 1px 0 rgba(255,255,255,0.35)",
      specularBottom: "inset 0 -1px 0 rgba(255,255,255,0.12)",
      innerDepth: "inset 0 0 20px -5px rgba(255,255,255,0.22)",
      shadow: "0 8px 32px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.40)",
      edge: "0 0 0 0.5px rgba(255,255,255,0.14)",
      hoverGlow: "inset 0 0 30px -6px rgba(255,255,255,0.30)",
    },
    // ── TIER XL (full-screen overlays) ──
    xl: {
      blur: "blur(32px) saturate(170%)",
      bg: "rgba(255,255,255,0.18)",
      border: "rgba(255,255,255,0.22)",
      specular: "inset 1px 1px 0 rgba(255,255,255,0.40), inset 0 0 5px rgba(255,255,255,0.14)",
      specularBottom: "inset 0 -1px 0 rgba(255,255,255,0.14)",
      innerDepth: "inset 0 0 24px -5px rgba(255,255,255,0.26)",
      shadow: "0 16px 48px rgba(0,0,0,0.60), 0 8px 20px rgba(0,0,0,0.45)",
      edge: "0 0 0 0.5px rgba(255,255,255,0.16)",
      hoverGlow: "inset 0 0 40px -8px rgba(255,255,255,0.35)",
    },
    // ── Shared spring transition curve ──
    spring: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Liquid Glass LIGHT — Apple-exact: "Clear Look" from macOS Tahoe 26.
  //
  // Apple's widgets are GHOST-LIKE: the wallpaper (our gradient mesh) bleeds
  // through almost completely. The glass surface is defined ONLY by:
  //   1. A razor-thin specular highlight along the top edge
  //   2. A whisper-thin 0.5px hairline border
  //   3. A subtle backdrop-filter blur that softens what's behind it
  //   4. NO drop shadow — glass floats seamlessly on the background
  //
  // Apple: "Light is bent, shaped, and concentrated—not obscured."
  glassLight: {
    blur: "blur(24px) saturate(200%)",
    blurLight: "blur(16px) saturate(170%)",
    blurHover: "blur(28px) saturate(220%)",
    // Raised surface tint — glass reads as a distinct layer, not invisible
    bg: "rgba(255,255,255,0.15)",
    bgDark: "rgba(255,255,255,0.25)",
    // Whisper-thin borders — barely perceptible luminous edge
    border: "rgba(255,255,255,0.25)",
    borderHover: "rgba(255,255,255,0.40)",
    borderLight: "rgba(255,255,255,0.12)",
    // Specular — thin, restrained top-edge highlight (NOT full white)
    specularSm: "inset 0 0.5px 0 rgba(255,255,255,0.45)",
    specular: "inset 0 0.5px 0 rgba(255,255,255,0.55)",
    specularLg: "inset 0 1px 0 rgba(255,255,255,0.65)",
    specularHover: "inset 0 1px 0 rgba(255,255,255,0.75)",
    // Hairline edge — 0.5px, ghost-like
    edge: "0 0 0 0.5px rgba(255,255,255,0.15)",
    edgeHover: "0 0 0 0.5px rgba(255,255,255,0.30)",
    // Bottom-edge specular — light catching underside of glass
    specularBottom: "inset 0 -0.5px 0 rgba(255,255,255,0.35)",
    specularBottomLg: "inset 0 -1px 0 rgba(255,255,255,0.50)",
    // Inner depth shadow — gives glass thickness
    innerDepth: "inset 0 1px 3px rgba(20,30,80,0.04)",
    innerDepthLg: "inset 0 2px 6px rgba(20,30,80,0.06)",
    // Refraction glow — subtle light spread at glass edges
    refraction: "0 0 8px rgba(255,255,255,0.15)",
    refractionHover: "0 0 14px rgba(255,255,255,0.25)",
    // Lens gradient — brightness variance within glass (CSS string for overlay)
    lens: "linear-gradient(180deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 35%, transparent 75%, rgba(0,0,0,0.02) 100%)",
    lensHover:
      "linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.10) 35%, transparent 75%, rgba(0,0,0,0.03) 100%)",
  },
};

// Density-aware token builder — compact mode: font -1px, spacing ×0.75, tighter line-height
export function buildTokens(density = "comfortable") {
  if (density !== "compact") return T;
  return {
    ...T,
    space: Object.fromEntries(Object.entries(T.space).map(([k, v]) => [k, Math.round(v * 0.75)])),
    fontSize: Object.fromEntries(Object.entries(T.fontSize).map(([k, v]) => [k, Math.max(v - 1, 7)])),
    lineHeight: {
      tight: 1.1,
      normal: 1.3,
      relaxed: 1.4,
    },
    size: {
      sm: { height: 24, padding: "3px 8px", fontSize: 10, iconSize: 11 },
      md: { height: 28, padding: "5px 10px", fontSize: 12, iconSize: 13 },
      lg: { height: 34, padding: "8px 16px", fontSize: 13, iconSize: 14 },
    },
    type: {
      heading: { fontSize: 18, fontWeight: 700, lineHeight: 1.15 },
      subheading: { fontSize: 13, fontWeight: 600, lineHeight: 1.25 },
      body: { fontSize: 12, fontWeight: 400, lineHeight: 1.4 },
      caption: { fontSize: 9, fontWeight: 400, lineHeight: 1.3 },
      label: { fontSize: 9, fontWeight: 600, lineHeight: 1.2, textTransform: "uppercase", letterSpacing: 1.2 },
      mono: { fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" },
      monoBig: {
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      numeric: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", lineHeight: 1.0 },
      numericSm: { fontSize: 18, fontWeight: 700, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums", lineHeight: 1.0 },
    },
  };
}
