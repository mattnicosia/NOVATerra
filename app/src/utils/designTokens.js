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

  // Type scale (7 sizes)
  fontSize: {
    xs: 10,
    sm: 11,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    '2xl': 28,
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
    mono: "'DM Mono', 'SF Mono', 'Menlo', monospace",
    display: "'Outfit', 'DM Sans', sans-serif",
  },

  // Border radii (3 tiers + full)
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 9999,
  },

  // Elevation shadows — boosted for dark surfaces
  shadow: {
    none: 'none',
    sm: '0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.18)',
    md: '0 3px 12px rgba(0,0,0,0.30), 0 2px 4px rgba(0,0,0,0.22)',
    lg: '0 8px 24px rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.25)',
    xl: '0 16px 48px rgba(0,0,0,0.45), 0 8px 16px rgba(0,0,0,0.30)',
    glow: '0 0 20px rgba(0,212,255,0.15), 0 0 40px rgba(0,212,255,0.05)',
    glowAccent: '0 0 12px rgba(0,212,255,0.20)',
    glowPurple: '0 0 12px rgba(123,97,255,0.20)',
  },

  // Transitions
  transition: {
    fast: 'all 100ms ease-out',
    base: 'all 150ms ease-out',
    slow: 'all 250ms ease-out',
    spring: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
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
    sm: { height: 28, padding: '4px 10px', fontSize: 11, iconSize: 12 },
    md: { height: 34, padding: '7px 14px', fontSize: 13, iconSize: 14 },
    lg: { height: 40, padding: '10px 20px', fontSize: 14, iconSize: 16 },
  },

  // Semantic typography presets — compose from existing scale values
  type: {
    heading:    { fontSize: 20, fontWeight: 700, lineHeight: 1.2 },
    subheading: { fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
    body:       { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
    caption:    { fontSize: 10, fontWeight: 400, lineHeight: 1.4 },
    label:      { fontSize: 10, fontWeight: 600, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: 0.8 },
    mono:       { fontSize: 12, fontWeight: 500, fontFamily: "'DM Mono','SF Mono','Menlo',monospace" },
    monoBig:    { fontSize: 14, fontWeight: 600, fontFamily: "'DM Mono','SF Mono','Menlo',monospace" },
  },

  // Frosted glass — tuned for dark surfaces
  glass: {
    blur: 'blur(24px)',
    blurLight: 'blur(16px)',
    bg: 'rgba(18,21,28,0.55)',
    bgDark: 'rgba(11,13,17,0.75)',
    border: 'rgba(255,255,255,0.06)',
    borderHover: 'rgba(255,255,255,0.10)',
    borderLight: 'rgba(255,255,255,0.03)',
  },
};
