import { TOPO_TEXTURE, DOT_TEXTURE, NOISE_GRAIN, CARBON_FIBER } from "./textures";

// Default color scheme — NOVA galaxy: deep indigo with purple/blue accents
// Matches the NovaOrb renderer's color palette (violet → blue → white core)
export const C_DEFAULT = {
  // Surfaces — NOVA 2.0: warm near-black, no blue/violet cast
  bg: "#09090B", // ground — warm near-black
  bg1: "#0F0F12", // card surfaces
  bg2: "#161619", // raised surfaces, headers
  bg3: "#1C1C20", // elevated elements, hover
  // Borders
  border: "rgba(255,255,255,0.06)",
  borderLight: "rgba(255,255,255,0.03)",
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
  sidebarBg: "rgba(9,9,11,0.96)",
  // Glass
  glassBg: "rgba(15,15,18,0.80)",
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
    desc: "Warm dark — quiet confidence, Apple-grade clarity",
    preview: ["#09090B", "#8B5CF6", "#60A5FA", "#C084FC", "#F5F3FF"],
    variantLabels: ["Nebula", "Cosmos", "Aurora", "NOVA Light", "Stardust"],
    overrides: {
      // NOVA 2.0 — warm near-black, not blue-black
      usePBR: false, // PBR material dashboard background (disabled — materials live on cards now)
      cardMaterials: true, // Per-widget CSS material surfaces (Terzo Millennio concept)
      bg: "#09090B",
      bg1: "#0F0F12",
      bg2: "#161619",
      bg3: "#1C1C20",
      border: "rgba(255,255,255,0.06)",
      borderLight: "rgba(255,255,255,0.03)",
      borderAccent: "rgba(139,92,246,0.15)",
      text: "#EEEDF5",
      textMuted: "rgba(238,237,245,0.55)",
      textDim: "rgba(238,237,245,0.28)",
      accent: "#8B5CF6",
      accentDim: "#6D28D9",
      accentBg: "rgba(139,92,246,0.06)",
      accentAlt: "#A78BFA",
      gradient: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#8B5CF6", 0.08)}, ${hR("#A78BFA", 0.08)})`,
      gradientText: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      green: "#34D399",
      red: "#FB7185",
      blue: "#60A5FA",
      purple: "#C4B5FD",
      orange: "#F59E0B",
      cyan: "#64D2FF",
      sidebarBg: "rgba(9,9,11,0.96)",
      glassBg: "rgba(15,15,18,0.80)",
      glassBorder: "rgba(255,255,255,0.05)",
      glassBgDark: "rgba(9,9,11,0.80)",
      bgGradient: "#09090B",
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

  // Ultra-clean: thin borders, tight letter-spacing, Inter font.
  // The gold standard of dark SaaS UI.
  {
    id: "linear",
    name: "Linear",
    desc: "Precision dark, clean typography, quiet confidence",
    preview: ["#08090A", "#5E6AD2", "#141417", "#F7F8F8", "#8A8F98"],
    variantLabels: ["Linear"],
    overrides: {
      linearMode: true,
      bg: "#08090A",
      bg1: "#141417",
      bg2: "#1A1A1F",
      bg3: "#222228",
      border: "rgba(255,255,255,0.08)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(94,106,210,0.25)",
      text: "#F7F8F8",
      textMuted: "rgba(138,143,152,0.9)",
      textDim: "rgba(138,143,152,0.45)",
      accent: "#5E6AD2",
      accentDim: "#4B55A8",
      accentBg: "rgba(94,106,210,0.08)",
      accentAlt: "#7C85E0",
      gradient: "linear-gradient(135deg, #5E6AD2, #7C85E0)",
      gradientSubtle: "linear-gradient(135deg, rgba(94,106,210,0.10), rgba(124,133,224,0.10))",
      gradientText: "linear-gradient(135deg, #5E6AD2, #7C85E0)",
      green: "#4ADE80",
      red: "#F87171",
      blue: "#60A5FA",
      purple: "#C4B5FD",
      orange: "#FBBF24",
      cyan: "#22D3EE",
      yellow: "#D4F50C",
      sidebarBg: "#0C0D0F",
      bgGradient: "#08090A",
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [null],
  },
  // ━━━ SHIFT5 — Extracted from shift5.io via website cloner ━━━
  // Defense-grade: signature orange (#FF5841) on charcoal (#202020).
  // Monospace labels, zero radius, harsh borders. Military data aesthetic.
  // Inspired by shift5.io — operational intelligence for defense & transport.
  // Two variants: Dark (charcoal base, orange accent) and Light (orange base, dark text).
  {
    id: "shift5",
    name: "Shift5",
    desc: "Defense-grade — signal orange, charcoal steel, zero radius",
    preview: ["#202020", "#FF5841", "#2A2A2A", "#B9B9B9", "#E6E6E6"],
    variantLabels: ["Ops Dark", "Signal Light"],
    overrides: {
      shift5Mode: true,
      // ── Surfaces — charcoal steel ──
      bg: "#181818",          // base — deep charcoal
      bg1: "#202020",         // cards — Shift5 primary dark
      bg2: "#2A2A2A",         // raised surfaces
      bg3: "#333333",         // hover states
      // ── Borders — harsh, no softness ──
      border: "#3A3A3A",
      borderLight: "rgba(255,255,255,0.06)",
      borderAccent: "rgba(255,88,65,0.35)",
      // ── Text — high contrast ──
      text: "#E6E6E6",             // primary — light gray
      textMuted: "#B9B9B9",        // secondary — Shift5 mid gray
      textDim: "#666666",          // tertiary
      // ── Accent — signal orange ──
      accent: "#FF5841",           // Shift5 signature orange
      accentDim: "#CC4634",        // darkened
      accentBg: "rgba(255,88,65,0.10)",
      accentAlt: "#FF7A68",        // hover — lighter orange
      // ── Gradients — orange to warm ──
      gradient: "linear-gradient(135deg, #FF5841, #FF7A68)",
      gradientSubtle: "linear-gradient(135deg, rgba(255,88,65,0.12), rgba(255,122,104,0.12))",
      gradientText: "linear-gradient(135deg, #FF5841, #FF7A68)",
      // ── Semantic colors — desaturated military palette ──
      green:  "#4ADE80",
      red:    "#FF5841",     // red IS the accent
      blue:   "#60A5FA",
      purple: "#A78BFA",
      orange: "#FF5841",
      cyan:   "#22D3EE",
      yellow: "#FBBF24",
      // ── Sidebar ──
      sidebarBg: "rgba(24,24,24,0.97)",
      // ── Glass (disabled — flat hard surfaces) ──
      glassBg: "#202020",
      glassBorder: "#3A3A3A",
      glassBgDark: "#181818",
      bgGradient: "#181818",
      // ── Flags ──
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [
      null, // Ops Dark
      // Signal Light — orange hero background, dark text (the shift5.io homepage look)
      {
        bg: "#F0EFEB",            // warm off-white
        bg1: "#FFFFFF",           // cards
        bg2: "#F5F4F0",          // raised
        bg3: "#E8E7E3",          // hover
        border: "#D4D3CF",
        borderLight: "rgba(0,0,0,0.06)",
        borderAccent: "rgba(255,88,65,0.30)",
        text: "#202020",          // Shift5 charcoal
        textMuted: "#666666",
        textDim: "#999999",
        accent: "#FF5841",
        accentDim: "#CC4634",
        accentBg: "rgba(255,88,65,0.08)",
        accentAlt: "#FF7A68",
        gradient: "linear-gradient(135deg, #FF5841, #FF7A68)",
        gradientSubtle: "linear-gradient(135deg, rgba(255,88,65,0.10), rgba(255,122,104,0.10))",
        gradientText: "linear-gradient(135deg, #FF5841, #FF7A68)",
        green: "#16A34A",
        red: "#DC2626",
        blue: "#2563EB",
        purple: "#7C3AED",
        orange: "#EA580C",
        cyan: "#0891B2",
        yellow: "#CA8A04",
        sidebarBg: "#202020",        // dark sidebar contrast
        glassBg: "#FFFFFF",
        glassBorder: "#D4D3CF",
        bgGradient: "#F0EFEB",
        noGlass: true,
        materialMode: "concrete",
      },
    ],
  },
  // ━━━ SHIFT5 OPS — Burnt orange field, dark ops cards, left sidebar ━━━
  // Inspired by shift5.io footer: burnt coral background, dark charcoal cards,
  // monospace military typography. Replaces top header with collapsible left sidebar.
  {
    id: "shift5-ops",
    name: "Shift5 Ops",
    desc: "Burnt orange field, dark ops cards, monospace military aesthetic",
    preview: ["#E8614D", "#1E1E1E", "#252525", "#E8614D", "#F0F0F0"],
    variantLabels: ["Ops Orange", "Signal Grey", "Dark Ops"],
    overrides: {
      shift5OpsMode: true,
      // ── Surfaces — burnt orange field with dark cards ──
      bg: "#E8614D",           // page background — the orange field
      bg1: "#1E1E1E",          // cards — dark charcoal
      bg2: "#252525",          // raised surfaces
      bg3: "#2E2E2E",          // hover states
      // ── Borders — harsh, no softness ──
      border: "#3A3A3A",
      borderLight: "rgba(255,255,255,0.06)",
      borderAccent: "rgba(232,97,77,0.40)",
      // ── Text — high contrast on dark cards ──
      text: "#F0F0F0",
      textMuted: "#B0B0B0",
      textDim: "#666666",
      // ── Accent — burnt coral ──
      accent: "#E8614D",
      accentDim: "#C04E3D",
      accentBg: "rgba(232,97,77,0.12)",
      accentAlt: "#FF7A68",
      // ── Gradients ──
      gradient: "linear-gradient(135deg, #E8614D, #FF7A68)",
      gradientSubtle: "linear-gradient(135deg, rgba(232,97,77,0.12), rgba(255,122,104,0.12))",
      gradientText: "linear-gradient(135deg, #E8614D, #FF7A68)",
      // ── Semantic colors ──
      green: "#4ADE80",
      red: "#E8614D",
      blue: "#60A5FA",
      purple: "#A78BFA",
      orange: "#E8614D",
      cyan: "#22D3EE",
      yellow: "#FBBF24",
      // ── Sidebar ──
      sidebarBg: "rgba(24,24,24,0.98)",
      // ── Glass disabled — flat military surfaces ──
      glassBg: "#1E1E1E",
      glassBorder: "#3A3A3A",
      glassBgDark: "#181818",
      bgGradient: "#E8614D",
      // ── Flags ──
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [
      null, // 0 — Ops Orange: burnt orange field, dark cards
      // 1 — Signal Grey: warm grey field, dark cards (Shift5.io homepage look)
      {
        bg: "#C4C4C4",
        bgGradient: "#C4C4C4",
        glassBg: "#1E1E1E",
        glassBgDark: "#181818",
      },
      // 2 — Dark Ops: dark-on-dark monochromatic (System Status card look)
      {
        bg: "#252525",
        bgGradient: "#252525",
        bg2: "#2A2A2A",
        bg3: "#333333",
        text: "#B0B0B0",
        textMuted: "#808080",
        textDim: "#555555",
        glassBg: "#1E1E1E",
        glassBgDark: "#181818",
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
