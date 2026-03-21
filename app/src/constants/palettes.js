import { TOPO_TEXTURE, DOT_TEXTURE, NOISE_GRAIN, CARBON_FIBER } from "./textures";

// Default color scheme — NOVA galaxy: deep indigo with purple/blue accents
// Matches the NovaOrb renderer's color palette (violet → blue → white core)
export const C_DEFAULT = {
  // Surfaces — Nova void: near-black with subtle violet cast
  bg: "#06060C", // void — near-black
  bg1: "#0C0B14", // card surfaces
  bg2: "#12101C", // raised surfaces, headers
  bg3: "#1A1828", // elevated elements, hover
  // Borders
  border: "rgba(255,255,255,0.07)",
  borderLight: "rgba(255,255,255,0.04)",
  borderAccent: "rgba(139,92,246,0.18)",
  // Text hierarchy
  text: "#EEEDF5",
  textMuted: "rgba(238,237,245,0.55)",
  textDim: "rgba(238,237,245,0.28)",
  // Accent — NOVA violet
  accent: "#8B5CF6",
  accentDim: "#6D28D9",
  accentBg: "rgba(139,92,246,0.07)",
  accentAlt: "#A78BFA", // violet-bright
  // Gradient CSS value
  gradient: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
  gradientSubtle: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(167,139,250,0.15))",
  gradientText: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
  // Semantic colors
  green: "#34D399",
  red: "#FB7185",
  blue: "#60A5FA",
  purple: "#C4B5FD",
  orange: "#F59E0B",
  cyan: "#64D2FF",
  yellow: "#FFE66D",
  // Sidebar
  sidebarBg: "rgba(6,6,12,0.96)",
  // Glass
  glassBg: "rgba(18,16,28,0.75)",
  glassBorder: "rgba(255,255,255,0.06)",
  glassBgDark: "rgba(8,8,16,0.75)",
  // Background
  bgGradient: "#06060C",
  // Force dark — skip light-variant override in ThemeProvider
  forceDark: true,
};

// Shared light-mode base — Liquid Glass v2: ultra-transparent glass over vivid backgrounds
// Apple WWDC25: "Light is bent, shaped, and concentrated — not obscured."
// Glass must be transparent enough that the colorful mesh background bleeds through clearly.
const LB = {
  border: "#D1D1D6",
  borderLight: "#E5E5EA",
  green: "#30D158",
  red: "#FF3B30",
  blue: "#0A84FF",
  purple: "#BF5AF2",
  orange: "#FF9500",
  cyan: "#64D2FF",
  yellow: "#FFD60A",
  glassBg: "rgba(255,255,255,0.38)",
  glassBorder: "rgba(255,255,255,0.50)",
  glassBgDark: "rgba(255,255,255,0.52)",
};

// Helper: hex to rgba
const hR = (hex, a) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${a})`;
};
// Helper: darken a hex color
const dk = (hex, amt = 0.15) => {
  const h = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * (1 - amt)));
  const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * (1 - amt)));
  const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * (1 - amt)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

// Helper: check if a hex color is "dark"
const checkDark = hex => {
  const h = (hex || "#000").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
};
// Helper: get luminance value for comparing darkness
const lum = hex => {
  const h = (hex || "#000").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
};

// Scan all dark variants to find the absolute darkest surface colors
function findDarkestSurface(palette) {
  if (!palette) return {};
  const baseLum = lum(palette.overrides?.bg || C_DEFAULT.bg);
  let minLum = baseLum;
  let best = null;
  if (palette.variants) {
    for (const v of palette.variants) {
      if (!v || !v.bg) continue;
      if (!checkDark(v.bg)) continue; // skip light variants
      const vLum = lum(v.bg);
      if (vLum < minLum) {
        minLum = vLum;
        best = v;
      }
    }
  }
  if (!best) return {}; // base overrides already darkest
  const s = {};
  if (best.bg) s.bg = best.bg;
  if (best.bg1) s.bg1 = best.bg1;
  if (best.bg2) s.bg2 = best.bg2;
  if (best.bg3) s.bg3 = best.bg3;
  if (best.sidebarBg) s.sidebarBg = best.sidebarBg;
  return s;
}

// Always returns dark panel colors using the palette's DARKEST variant surfaces
export function buildDarkPanel(accentSource, palette) {
  const darkestSurface = findDarkestSurface(palette);
  const darkBase = { ...C_DEFAULT, ...(palette?.overrides || {}), ...darkestSurface };
  return {
    ...darkBase,
    // Keep accent system consistent with main
    accent: accentSource.accent,
    accentDim: accentSource.accentDim,
    accentBg: accentSource.accentBg,
    accentAlt: accentSource.accentAlt,
    gradient: accentSource.gradient,
    gradientSubtle: accentSource.gradientSubtle,
    gradientText: accentSource.gradientText,
    green: accentSource.green,
    red: accentSource.red,
    blue: accentSource.blue,
    purple: accentSource.purple,
    orange: accentSource.orange,
    cyan: accentSource.cyan,
    yellow: accentSource.yellow,
  };
}

// Find the first light variant in a palette, or return null
export function findLightVariant(palette) {
  if (!palette?.variants) return null;
  for (let i = 0; i < palette.variants.length; i++) {
    const v = palette.variants[i];
    if (!v || !v.bg) continue;
    if (!checkDark(v.bg)) return v;
  }
  return null;
}

// ─── PALETTES ───────────────────────────────────────────────────────────────
export const PALETTES = [
  // ━━━ 1. NOVA — Galaxy nebula inspired by the NOVA AI portal ━━━
  {
    id: "nova",
    name: "NOVA",
    desc: "Galaxy nebula — purple, blue & white core",
    preview: ["#08091A", "#8B5CF6", "#60A5FA", "#C084FC", "#F5F3FF"],
    variantLabels: ["Nebula", "Cosmos", "Aurora", "NOVA Light", "Stardust"],
    overrides: {
      bg: "#06060C",
      bg1: "#0C0B14",
      bg2: "#12101C",
      bg3: "#1A1828",
      border: "rgba(255,255,255,0.07)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(139,92,246,0.18)",
      text: "#EEEDF5",
      textMuted: "rgba(238,237,245,0.55)",
      textDim: "rgba(238,237,245,0.28)",
      accent: "#8B5CF6",
      accentDim: "#6D28D9",
      accentBg: "rgba(139,92,246,0.07)",
      accentAlt: "#A78BFA",
      gradient: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#8B5CF6", 0.12)}, ${hR("#A78BFA", 0.12)})`,
      gradientText: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      green: "#34D399",
      red: "#FB7185",
      blue: "#60A5FA",
      purple: "#C4B5FD",
      orange: "#F59E0B",
      cyan: "#64D2FF",
      sidebarBg: "rgba(6,6,12,0.96)",
      glassBg: "rgba(18,16,28,0.78)",
      glassBorder: "rgba(255,255,255,0.06)",
      glassBgDark: "rgba(8,8,16,0.78)",
      bgGradient: "#06060C",
      forceDark: true,
      bgTexture: TOPO_TEXTURE,
    },
    variants: [
      null, // 0 — Nebula (default)
      {
        // 1 — Cosmos — deeper, blue-shifted
        bg: "#04051A",
        bg1: "#0A0C28",
        bg2: "#0E1238",
        bg3: "#141A48",
        accent: "#60A5FA",
        accentDim: dk("#60A5FA"),
        accentBg: hR("#60A5FA", 0.08),
        accentAlt: "#8B5CF6",
        borderAccent: hR("#60A5FA", 0.18),
        gradient: "linear-gradient(135deg, #60A5FA, #8B5CF6)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#60A5FA", 0.12)}, ${hR("#8B5CF6", 0.12)})`,
        gradientText: "linear-gradient(135deg, #60A5FA, #8B5CF6)",
        sidebarBg: "rgba(4,5,26,0.92)",
      },
      {
        // 2 — Aurora — cyan + purple
        bg: "#06091C",
        bg1: "#0C1028",
        bg2: "#121838",
        bg3: "#1A2248",
        accent: "#C084FC",
        accentDim: dk("#C084FC"),
        accentBg: hR("#C084FC", 0.08),
        accentAlt: "#64D2FF",
        borderAccent: hR("#C084FC", 0.18),
        gradient: "linear-gradient(135deg, #C084FC, #64D2FF)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#C084FC", 0.12)}, ${hR("#64D2FF", 0.12)})`,
        gradientText: "linear-gradient(135deg, #C084FC, #64D2FF)",
        sidebarBg: "rgba(6,9,28,0.90)",
      },
      {
        // 3 — NOVA Light: barely purple neutral
        bg: "#F8F7FC",
        bg1: "#FFFFFF",
        bg2: "#F0EEF6",
        bg3: "#E8E5EE",
        borderAccent: hR("#7C3AED", 0.15),
        text: "#1A1030",
        textMuted: "#5A4E80",
        textDim: "#9890BC",
        accent: "#7C3AED",
        accentDim: dk("#7C3AED"),
        accentBg: hR("#7C3AED", 0.08),
        accentAlt: "#3B82F6",
        gradient: "linear-gradient(135deg, #7C3AED, #3B82F6)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#7C3AED", 0.08)}, ${hR("#3B82F6", 0.08)})`,
        gradientText: "linear-gradient(135deg, #7C3AED, #3B82F6)",
        ...LB,
        border: "#D4D0DE",
        borderLight: "#E2DFEA",
        sidebarBg: "rgba(248,247,252,0.90)",
        bgGradient: `radial-gradient(ellipse at 18% 12%, ${hR("#7C3AED", 0.06)} 0%, transparent 50%), radial-gradient(ellipse at 82% 22%, ${hR("#3B82F6", 0.05)} 0%, transparent 50%), radial-gradient(ellipse at 50% 78%, ${hR("#C084FC", 0.04)} 0%, transparent 50%), #F8F7FC`,
      },
      {
        // 4 — Stardust — barely blue neutral
        bg: "#F6F7FB",
        bg1: "#FFFFFF",
        bg2: "#EDEEF5",
        bg3: "#E4E5ED",
        borderAccent: hR("#3B82F6", 0.15),
        text: "#101830",
        textMuted: "#4A5078",
        textDim: "#9098BC",
        accent: "#3B82F6",
        accentDim: dk("#3B82F6"),
        accentBg: hR("#3B82F6", 0.08),
        accentAlt: "#7C3AED",
        gradient: "linear-gradient(135deg, #3B82F6, #7C3AED)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#3B82F6", 0.08)}, ${hR("#7C3AED", 0.08)})`,
        gradientText: "linear-gradient(135deg, #3B82F6, #7C3AED)",
        ...LB,
        border: "#CDD0DC",
        borderLight: "#DDDFE8",
        sidebarBg: "rgba(246,247,251,0.90)",
        bgGradient: `radial-gradient(ellipse at 18% 12%, ${hR("#3B82F6", 0.06)} 0%, transparent 50%), radial-gradient(ellipse at 82% 22%, ${hR("#7C3AED", 0.05)} 0%, transparent 50%), radial-gradient(ellipse at 50% 72%, ${hR("#60A5FA", 0.04)} 0%, transparent 50%), #F6F7FB`,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAR COLLECTION — 8 automotive-inspired themes
  //  Each palette is a complete design language extracted from the car's DNA:
  //  body color → surfaces, interior → backgrounds, accent lighting → accent,
  //  trim material → borders, gauge typography → type feel, geometry → radii
  // ═══════════════════════════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════════════════════════
  //  PREMIUM LIGHT COLLECTION — 6 material-driven light themes
  //  Each is a distinct surface material, not a color swap.
  //  Texture differentiation: grid, grain, weave, woodgrain, swept, crystalline.
  //  Every color is hand-tuned. Nothing procedural. Nothing AI-generic.
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // Shift5B — Board-spec refined: blue-black void, luminous indigo accent
  // Deep cool surfaces with warm indigo accent. Full semantic color.
  // Designed for sustained estimating sessions with high contrast hierarchy.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "shift5b",
    name: "Shift5B",
    desc: "Board-spec — blue-black void, luminous indigo accent",
    preview: ["#08090E", "#7C6BF0", "#11111B", "#A1A1AA", "#FAFAFA"],
    variantLabels: ["Refined"],
    overrides: {
      // ── Surfaces — blue-black void with warm card lift ──
      bg: "#08090E",        // base — blue-black void
      bg1: "#11111B",       // cards — warm against cool base
      bg2: "#1A1A24",       // raised surfaces, input wells
      bg3: "#22222E",       // hover states, elevated elements
      // ── Borders — cool indigo-grey ──
      border: "#25253A",                         // subtle
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(124,107,240,0.28)",     // accent-tinted
      // ── Text — high contrast hierarchy ──
      text: "#FAFAFA",           // primary — near-white
      textMuted: "#A1A1AA",      // secondary — zinc-400
      textDim: "#52525B",        // tertiary — zinc-600
      // ── Accent — luminous indigo ──
      accent: "#7C6BF0",
      accentDim: dk("#7C6BF0"),
      accentBg: hR("#7C6BF0", 0.08),
      accentAlt: "#9B8AFB",      // hover state
      // ── Gradients ──
      gradient: "linear-gradient(135deg, #7C6BF0, #9B8AFB)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#7C6BF0", 0.12)}, ${hR("#9B8AFB", 0.12)})`,
      gradientText: "linear-gradient(135deg, #7C6BF0, #9B8AFB)",
      // ── Semantic colors — full color, board-spec ──
      green:  "#22C55E",
      red:    "#EF4444",
      blue:   "#60A5FA",
      purple: "#A78BFA",
      orange: "#F59E0B",
      cyan:   "#64D2FF",
      yellow: "#FFE66D",
      // ── Sidebar ──
      sidebarBg: "rgba(8,9,14,0.96)",
      // ── Glass (disabled — flat surfaces) ──
      glassBg: "#11111B",
      glassBorder: "#25253A",
      glassBgDark: "#08090E",
      // ── Background ──
      bgGradient: "#08090E",
      // ── Flags ──
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [null],
  },

  // ━━━ STITCH — Google Stitch-inspired: dark workshop, animated gradient borders ━━━
  // Warmer charcoal (#191A1F) base, cyan-violet-blue gradient accent system,
  // dot-grid texture, pill-shaped buttons. AI-native creative tool aesthetic.
  // The signature element: animated conic-gradient borders on active cards
  // (injected via useTheme stylesheet when this palette is active).
  {
    id: "stitch",
    name: "Stitch",
    desc: "Workshop — cyan-violet gradient, film grain texture",
    preview: ["#191A1F", "#00E5FF", "#7C4DFF", "#2979FF", "#E8EAED"],
    variantLabels: ["Workshop"],
    overrides: {
      bg: "#191A1F",           // warm charcoal (Stitch base)
      bg1: "#1E1F25",          // card surfaces — slightly elevated
      bg2: "#24252B",          // raised surfaces, headers
      bg3: "#2C2D34",          // elevated elements, hover
      border: "rgba(255,255,255,0.08)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(0,229,255,0.18)",
      text: "#E8EAED",         // Google-style warm off-white
      textMuted: "rgba(232,234,237,0.55)",
      textDim: "rgba(232,234,237,0.28)",
      // Accent — cyan (primary action color)
      accent: "#00E5FF",
      accentDim: "#00B8D4",
      accentBg: "rgba(0,229,255,0.07)",
      accentAlt: "#7C4DFF",     // violet as secondary
      // Gradient — the signature cyan→violet→blue sweep
      gradient: "linear-gradient(135deg, #00E5FF, #7C4DFF, #2979FF)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#00E5FF", 0.12)}, ${hR("#7C4DFF", 0.12)}, ${hR("#2979FF", 0.12)})`,
      gradientText: "linear-gradient(135deg, #00E5FF, #7C4DFF, #2979FF)",
      // Semantic colors
      green: "#00E676",
      red: "#FF5252",
      blue: "#448AFF",
      purple: "#B388FF",
      orange: "#FFAB40",
      cyan: "#00E5FF",
      yellow: "#FFD740",
      // Sidebar
      sidebarBg: "rgba(25,26,31,0.96)",
      // Glass — subtle, warm
      glassBg: "rgba(30,31,37,0.78)",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(25,26,31,0.92)",
      // Background
      textureMode: true,
      bgTexture: NOISE_GRAIN,
      bgGradient: [
        // Noise grain texture applied via global overlay (boosted in Stitch mode)
        // Ambient cyan glow — upper center
        "radial-gradient(ellipse at 50% 15%, rgba(0,229,255,0.06) 0%, transparent 45%)",
        // Secondary violet whisper — lower right
        "radial-gradient(ellipse at 80% 80%, rgba(124,77,255,0.04) 0%, transparent 40%)",
        "#191A1F",
      ].join(", "),
      forceDark: true,
      // Stitch-specific: flag for animated gradient borders
      stitchMode: true,
    },
    variants: [null], // single dark variant
  },

  // ━━━ AURORA — Purple-dominant Northern Lights with film grain ━━━
  // Deep purple primary, violet-teal secondary accents. Noise grain texture.
  // Stitch-style widget cards with animated gradient borders on click.
  // Colors: #A855F7 (purple) → #7C3AED (violet) → #06B6D4 (teal accent)
  {
    id: "aurora",
    name: "Aurora",
    desc: "Northern Lights — purple-violet gradient, film grain texture",
    preview: ["#191A1F", "#A855F7", "#7C3AED", "#06B6D4", "#E8EAED"],
    variantLabels: ["Aurora"],
    overrides: {
      bg: "#232430",             // dark charcoal background (grain sits here)
      bg1: "#0A0A0F",            // widget/card surfaces (deep black, above grain)
      bg2: "#24252B",
      bg3: "#2C2D34",
      border: "rgba(255,255,255,0.08)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(168,85,247,0.18)",
      text: "#E8EAED",
      textMuted: "rgba(232,234,237,0.55)",
      textDim: "rgba(232,234,237,0.28)",
      accent: "#A855F7",       // purple primary
      accentDim: "#7C3AED",
      accentBg: "rgba(168,85,247,0.07)",
      accentAlt: "#06B6D4",    // teal secondary
      gradient: "linear-gradient(135deg, #A855F7, #7C3AED, #06B6D4)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#A855F7", 0.12)}, ${hR("#7C3AED", 0.12)}, ${hR("#06B6D4", 0.12)})`,
      gradientText: "linear-gradient(135deg, #A855F7, #7C3AED, #06B6D4)",
      green: "#10B981",
      red: "#FB7185",
      blue: "#60A5FA",
      purple: "#A855F7",
      orange: "#F59E0B",
      cyan: "#06B6D4",
      yellow: "#FFD740",
      sidebarBg: "rgba(10,10,15,0.98)",
      glassBg: "rgba(30,31,37,0.78)",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(25,26,31,0.92)",
      textureMode: true,
      bgTexture: CARBON_FIBER,
      bgGradient: [
        "radial-gradient(ellipse at 40% 20%, rgba(168,85,247,0.06) 0%, transparent 45%)",
        "radial-gradient(ellipse at 70% 75%, rgba(124,58,237,0.05) 0%, transparent 40%)",
        "radial-gradient(ellipse at 90% 10%, rgba(6,182,212,0.03) 0%, transparent 35%)",
        "#232430",
      ].join(", "),
      forceDark: true,
      auroraMode: true,
    },
    variants: [null],
  },

  // ━━━ NEUTRAL — Clean grayscale light theme ━━━
  // Cool-toned neutral palette (#F1F5F9 base). No color accent — pure grayscale.
  // Enterprise-clean, zero distraction. Flat surfaces, no glass, no texture.
  // Accent is slate-900 (#0F172A) — actions defined by weight, not color.
  {
    id: "neutral",
    name: "Neutral",
    desc: "Clean grayscale — light, flat, zero distraction",
    preview: ["#F1F5F9", "#334155", "#64748B", "#CBD5E1", "#FFFFFF"],
    variantLabels: ["Neutral"],
    overrides: {
      // Dark panel (sidebar)
      bg: "#0F172A",           // slate-900
      bg1: "#1E293B",          // slate-800
      bg2: "#334155",          // slate-700
      bg3: "#475569",          // slate-600
      border: "rgba(255,255,255,0.10)",
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(148,163,184,0.25)",
      text: "#F1F5F9",         // slate-100
      textMuted: "rgba(241,245,249,0.55)",
      textDim: "rgba(241,245,249,0.30)",
      accent: "#64748B",       // slate-500 — neutral accent
      accentDim: "#475569",
      accentBg: "rgba(100,116,139,0.10)",
      accentAlt: "#94A3B8",    // slate-400
      gradient: "linear-gradient(135deg, #64748B, #94A3B8)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#64748B", 0.10)}, ${hR("#94A3B8", 0.10)})`,
      gradientText: "linear-gradient(135deg, #475569, #64748B)",
      green: "#34D399",
      red: "#FB7185",
      blue: "#60A5FA",
      purple: "#A78BFA",
      orange: "#FBBF24",
      cyan: "#67E8F9",
      yellow: "#FDE047",
      sidebarBg: "rgba(15,23,42,0.97)",
      glassBg: "#1E293B",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "#0F172A",
      bgGradient: "#0F172A",
      forceDark: false,
      noGlass: true,
    },
    variants: [
      null, // 0 — dark panel
      {
        // 1 — Light: cool gray flat surfaces
        bg: "#F1F5F9",         // slate-100 — primary bg
        bg1: "#FFFFFF",        // white — card surfaces
        bg2: "#E2E8F0",       // slate-200 — raised surfaces
        bg3: "#CBD5E1",       // slate-300 — elevated/hover
        border: "#CBD5E1",     // slate-300
        borderLight: "#E2E8F0", // slate-200
        borderAccent: hR("#475569", 0.15),
        text: "#0F172A",       // slate-900
        textMuted: "#64748B",  // slate-500
        textDim: "#94A3B8",    // slate-400
        accent: "#334155",     // slate-700 — dark accent for contrast
        accentDim: "#1E293B",
        accentBg: "rgba(51,65,85,0.06)",
        accentAlt: "#475569",
        gradient: "linear-gradient(135deg, #334155, #64748B)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#334155", 0.08)}, ${hR("#64748B", 0.08)})`,
        gradientText: "linear-gradient(135deg, #334155, #64748B)",
        glassBg: "#FFFFFF",
        glassBorder: "#CBD5E1",
        glassBgDark: "#FFFFFF",
        sidebarBg: "#F1F5F9",
        bgGradient: "#F1F5F9",
        green: "#059669",      // darker greens for light bg
        red: "#DC2626",
        blue: "#2563EB",
        purple: "#7C3AED",
        orange: "#D97706",
        cyan: "#0891B2",
        yellow: "#CA8A04",
      },
    ],
  },
];

// Car palette IDs for cycling
export const CAR_PALETTE_IDS = [];

// Premium light palette IDs
export const LIGHT_PALETTE_IDS = [];

// NOVA palette IDs
export const ARTIFACT_PALETTE_IDS = [];

// Chart colors
export const PIE_COLORS = [
  "#0A84FF",
  "#30D158",
  "#5E5CE6",
  "#FF9500",
  "#FF3B30",
  "#06B6D4",
  "#FFD60A",
  "#BF5AF2",
  "#E07C24",
  "#3A8F6E",
];
