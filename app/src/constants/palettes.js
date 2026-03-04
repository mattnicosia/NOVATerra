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
      glassBg: "rgba(18,16,28,0.75)",
      glassBorder: "rgba(255,255,255,0.06)",
      glassBgDark: "rgba(8,8,16,0.75)",
      bgGradient: "#06060C",
      forceDark: true,
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
        border: "#D4D0DE",
        borderLight: "#E2DFEA",
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
        bgGradient: `radial-gradient(ellipse at 18% 12%, ${hR("#7C3AED", 0.12)} 0%, transparent 50%), radial-gradient(ellipse at 82% 22%, ${hR("#3B82F6", 0.1)} 0%, transparent 50%), radial-gradient(ellipse at 50% 78%, ${hR("#C084FC", 0.08)} 0%, transparent 50%), #F8F7FC`,
      },
      {
        // 4 — Stardust — barely blue neutral
        bg: "#F6F7FB",
        bg1: "#FFFFFF",
        bg2: "#EDEEF5",
        bg3: "#E4E5ED",
        border: "#CDD0DC",
        borderLight: "#DDDFE8",
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
        bgGradient: `radial-gradient(ellipse at 18% 12%, ${hR("#3B82F6", 0.12)} 0%, transparent 50%), radial-gradient(ellipse at 82% 22%, ${hR("#7C3AED", 0.1)} 0%, transparent 50%), radial-gradient(ellipse at 50% 72%, ${hR("#60A5FA", 0.08)} 0%, transparent 50%), #F6F7FB`,
      },
    ],
  },

  // ━━━ 2. GREYSCALE — Pure monochrome minimal ━━━
  {
    id: "grey",
    name: "Greyscale",
    desc: "Pure monochrome minimal",
    preview: ["#0A0A0A", "#404040", "#808080", "#C0C0C0", "#F0F0F0"],
    variantLabels: ["Charcoal", "Midnight", "Silver", "Paper", "Fog"],
    overrides: {
      bg: "#0A0A0A",
      bg1: "#141414",
      bg2: "#1E1E1E",
      bg3: "#282828",
      border: "rgba(255,255,255,0.08)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(224,224,224,0.12)",
      text: "#F0F0F0",
      textMuted: "#8A8A8A",
      textDim: "#505050",
      accent: "#E0E0E0",
      accentDim: "#C0C0C0",
      accentBg: "rgba(224,224,224,0.06)",
      accentAlt: "#808080",
      gradient: "linear-gradient(135deg, #E0E0E0, #808080)",
      gradientSubtle: "linear-gradient(135deg, rgba(224,224,224,0.08), rgba(128,128,128,0.08))",
      gradientText: "linear-gradient(135deg, #E0E0E0, #808080)",
      sidebarBg: "rgba(10,10,10,0.90)",
      glassBg: "rgba(20,20,20,0.55)",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(10,10,10,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, rgba(224,224,224,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(128,128,128,0.10) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(192,192,192,0.08) 0%, transparent 50%), #0A0A0A`,
      forceDark: false,
    },
    variants: [
      null, // 0 — Charcoal
      {
        // 1 — Midnight
        bg: "#000000",
        bg1: "#0A0A0A",
        bg2: "#141414",
        bg3: "#1E1E1E",
        accent: "#808080",
        accentDim: "#606060",
        accentBg: "rgba(128,128,128,0.06)",
        accentAlt: "#C0C0C0",
        gradient: "linear-gradient(135deg, #808080, #C0C0C0)",
        gradientSubtle: "linear-gradient(135deg, rgba(128,128,128,0.08), rgba(192,192,192,0.08))",
        gradientText: "linear-gradient(135deg, #808080, #C0C0C0)",
        text: "#E0E0E0",
        sidebarBg: "rgba(0,0,0,0.92)",
      },
      {
        // 2 — Silver
        bg: "#0E0E0E",
        bg1: "#181818",
        bg2: "#222222",
        bg3: "#2E2E2E",
        accent: "#C0C0C0",
        accentDim: "#A0A0A0",
        accentBg: "rgba(192,192,192,0.06)",
        accentAlt: "#E0E0E0",
        gradient: "linear-gradient(135deg, #C0C0C0, #E0E0E0)",
        gradientSubtle: "linear-gradient(135deg, rgba(192,192,192,0.08), rgba(224,224,224,0.08))",
        gradientText: "linear-gradient(135deg, #C0C0C0, #E0E0E0)",
      },
      {
        // 3 — Paper
        bg: "#F5F5F5",
        bg1: "#FFFFFF",
        bg2: "#EEEEEE",
        bg3: "#E0E0E0",
        border: "#D0D0D0",
        borderLight: "#E0E0E0",
        borderAccent: "rgba(64,64,64,0.12)",
        text: "#1A1A1A",
        textMuted: "#606060",
        textDim: "#A0A0A0",
        accent: "#404040",
        accentDim: "#2A2A2A",
        accentBg: "rgba(64,64,64,0.06)",
        accentAlt: "#808080",
        gradient: "linear-gradient(135deg, #404040, #808080)",
        gradientSubtle: "linear-gradient(135deg, rgba(64,64,64,0.06), rgba(128,128,128,0.06))",
        gradientText: "linear-gradient(135deg, #404040, #808080)",
        ...LB,
        border: "#D0D0D0",
        borderLight: "#E0E0E0",
        sidebarBg: "rgba(245,245,245,0.85)",
        bgGradient: `radial-gradient(ellipse at 12% 12%, rgba(64,64,64,0.11) 0%, transparent 45%), radial-gradient(ellipse at 88% 22%, rgba(128,128,128,0.09) 0%, transparent 45%), radial-gradient(ellipse at 50% 72%, rgba(80,80,80,0.07) 0%, transparent 50%), #F5F5F5`,
      },
      {
        // 4 — Fog
        bg: "#F2F2F2",
        bg1: "#FAFAFA",
        bg2: "#EAEAEA",
        bg3: "#DCDCDC",
        border: "#CACACA",
        borderLight: "#DCDCDC",
        borderAccent: "rgba(128,128,128,0.12)",
        text: "#1A1A1A",
        textMuted: "#606060",
        textDim: "#A0A0A0",
        accent: "#808080",
        accentDim: "#606060",
        accentBg: "rgba(128,128,128,0.06)",
        accentAlt: "#404040",
        gradient: "linear-gradient(135deg, #808080, #404040)",
        gradientSubtle: "linear-gradient(135deg, rgba(128,128,128,0.06), rgba(64,64,64,0.06))",
        gradientText: "linear-gradient(135deg, #808080, #404040)",
        ...LB,
        border: "#CACACA",
        borderLight: "#DCDCDC",
        sidebarBg: "rgba(242,242,242,0.88)",
        bgGradient: `radial-gradient(ellipse at 12% 12%, rgba(128,128,128,0.11) 0%, transparent 45%), radial-gradient(ellipse at 88% 22%, rgba(64,64,64,0.09) 0%, transparent 45%), radial-gradient(ellipse at 50% 68%, rgba(100,100,100,0.07) 0%, transparent 50%), #F2F2F2`,
      },
    ],
  },

  // ━━━ 3. CLARITY — Apple-grade clean light ━━━
  {
    id: "clarity",
    name: "Clarity",
    desc: "Clean light — Apple-grade minimal",
    preview: ["#FFFFFF", "#007AFF", "#F2F2F7", "#5AC8FA", "#1C1C1E"],
    variantLabels: ["Graphite", "Clean", "Warm", "Cool"],
    overrides: {
      bg: "#1C1C1E",
      bg1: "#2C2C2E",
      bg2: "#3A3A3C",
      bg3: "#48484A",
      border: "rgba(255,255,255,0.08)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: hR("#007AFF", 0.15),
      text: "#F5F5F7",
      textMuted: "rgba(245,245,247,0.55)",
      textDim: "rgba(245,245,247,0.30)",
      accent: "#007AFF",
      accentDim: "#0055D4",
      accentBg: hR("#007AFF", 0.08),
      accentAlt: "#5AC8FA",
      gradient: "linear-gradient(135deg, #007AFF, #5AC8FA)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#007AFF", 0.1)}, ${hR("#5AC8FA", 0.1)})`,
      gradientText: "linear-gradient(135deg, #007AFF, #5AC8FA)",
      green: "#30D158",
      red: "#FF453A",
      blue: "#0A84FF",
      purple: "#BF5AF2",
      orange: "#FF9F0A",
      cyan: "#5AC8FA",
      yellow: "#FFD60A",
      sidebarBg: "rgba(28,28,30,0.96)",
      glassBg: "rgba(44,44,46,0.72)",
      glassBorder: "rgba(255,255,255,0.06)",
      glassBgDark: "rgba(28,28,30,0.80)",
      bgGradient: "#1C1C1E",
      forceDark: false,
    },
    variants: [
      null, // 0 — Graphite (dark base, system forces light for main)
      {
        // 1 — Clean: neutral near-white so vivid mesh bleeds through glass
        bg: "#F5F6FA",
        bg1: "#FFFFFF",
        bg2: "#ECEEF4",
        bg3: "#E3E5ED",
        border: "#CCCFD8",
        borderLight: "#DDDFE6",
        borderAccent: hR("#007AFF", 0.15),
        text: "#1D1D1F",
        textMuted: "#8E8E93",
        textDim: "#AEAEB2",
        ...LB,
        border: "#CCCFD8",
        borderLight: "#DDDFE6",
        sidebarBg: "rgba(245,246,250,0.92)",
        bgGradient: `radial-gradient(ellipse at 8% 6%, ${hR("#007AFF", 0.14)} 0%, transparent 55%), radial-gradient(ellipse at 92% 85%, ${hR("#5AC8FA", 0.12)} 0%, transparent 55%), radial-gradient(ellipse at 50% 42%, ${hR("#BF5AF2", 0.1)} 0%, transparent 50%), radial-gradient(ellipse at 78% 55%, ${hR("#30D158", 0.08)} 0%, transparent 45%), #F5F6FA`,
      },
      {
        // 2 — Warm: barely warm neutral → translucent glass cards
        bg: "#F9F8F5",
        bg1: "#FFFFFF",
        bg2: "#F0EEEA",
        bg3: "#E6E4DF",
        border: "#D5D2CC",
        borderLight: "#E0DDD7",
        borderAccent: hR("#007AFF", 0.15),
        text: "#1D1D1F",
        textMuted: "#8A877E",
        textDim: "#AEABA3",
        ...LB,
        border: "#D5D2CC",
        borderLight: "#E0DDD7",
        sidebarBg: "rgba(249,248,245,0.92)",
        bgGradient: `radial-gradient(ellipse at 12% 10%, ${hR("#007AFF", 0.1)} 0%, transparent 50%), radial-gradient(ellipse at 88% 82%, ${hR("#FF9500", 0.08)} 0%, transparent 50%), radial-gradient(ellipse at 50% 48%, ${hR("#FF6B6B", 0.06)} 0%, transparent 50%), #F9F8F5`,
      },
      {
        // 3 — Cool: barely cool neutral → translucent glass cards
        bg: "#F5F6FA",
        bg1: "#FFFFFF",
        bg2: "#ECEEF3",
        bg3: "#E2E5EC",
        border: "#CDD1DA",
        borderLight: "#DDDFE8",
        borderAccent: hR("#0A84FF", 0.15),
        text: "#1D1D1F",
        textMuted: "#6B7280",
        textDim: "#9CA3AF",
        accent: "#0A84FF",
        accentDim: "#0066CC",
        accentBg: hR("#0A84FF", 0.08),
        accentAlt: "#64D2FF",
        gradient: "linear-gradient(135deg, #0A84FF, #64D2FF)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#0A84FF", 0.08)}, ${hR("#64D2FF", 0.08)})`,
        gradientText: "linear-gradient(135deg, #0A84FF, #64D2FF)",
        ...LB,
        border: "#CDD1DA",
        borderLight: "#DDDFE8",
        sidebarBg: "rgba(245,246,250,0.92)",
        bgGradient: `radial-gradient(ellipse at 8% 8%, ${hR("#0A84FF", 0.12)} 0%, transparent 50%), radial-gradient(ellipse at 92% 22%, ${hR("#64D2FF", 0.1)} 0%, transparent 50%), radial-gradient(ellipse at 42% 72%, ${hR("#5E5CE6", 0.08)} 0%, transparent 50%), #F5F6FA`,
      },
    ],
  },

  // ━━━ 4. MATTE — True matte black, refined finish ━━━
  {
    id: "matte",
    name: "Matte",
    desc: "True black — refined matte finish",
    preview: ["#000000", "#0A84FF", "#141414", "#F5F5F7", "#1C1C1C"],
    variantLabels: ["Black", "Void", "Ember", "Frost"],
    overrides: {
      bg: "#000000",
      bg1: "#0A0A0A",
      bg2: "#141414",
      bg3: "#1C1C1C",
      border: "rgba(255,255,255,0.06)",
      borderLight: "rgba(255,255,255,0.03)",
      borderAccent: hR("#0A84FF", 0.12),
      text: "#F5F5F7",
      textMuted: "rgba(245,245,247,0.50)",
      textDim: "rgba(245,245,247,0.25)",
      accent: "#0A84FF",
      accentDim: "#0066CC",
      accentBg: hR("#0A84FF", 0.06),
      accentAlt: "#64D2FF",
      gradient: "linear-gradient(135deg, #0A84FF, #64D2FF)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#0A84FF", 0.08)}, ${hR("#64D2FF", 0.08)})`,
      gradientText: "linear-gradient(135deg, #0A84FF, #64D2FF)",
      green: "#30D158",
      red: "#FF453A",
      blue: "#0A84FF",
      purple: "#BF5AF2",
      orange: "#FF9F0A",
      cyan: "#64D2FF",
      yellow: "#FFD60A",
      sidebarBg: "rgba(0,0,0,0.96)",
      glassBg: "rgba(10,10,10,0.65)",
      glassBorder: "rgba(255,255,255,0.04)",
      glassBgDark: "rgba(0,0,0,0.85)",
      bgGradient: "#000000",
      forceDark: true,
    },
    variants: [
      null, // 0 — Black (true matte default)
      {
        // 1 — Void: ultra-minimal gray accent
        accent: "#86868B",
        accentDim: "#636366",
        accentBg: hR("#86868B", 0.06),
        accentAlt: "#AEAEB2",
        borderAccent: hR("#86868B", 0.1),
        gradient: "linear-gradient(135deg, #86868B, #AEAEB2)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#86868B", 0.08)}, ${hR("#AEAEB2", 0.08)})`,
        gradientText: "linear-gradient(135deg, #86868B, #AEAEB2)",
      },
      {
        // 2 — Ember: warm amber accent
        bg: "#050403",
        bg1: "#0E0D0A",
        bg2: "#181610",
        bg3: "#211F18",
        accent: "#FF9F0A",
        accentDim: "#CC7F08",
        accentBg: hR("#FF9F0A", 0.06),
        accentAlt: "#FFD60A",
        borderAccent: hR("#FF9F0A", 0.1),
        gradient: "linear-gradient(135deg, #FF9F0A, #FFD60A)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#FF9F0A", 0.08)}, ${hR("#FFD60A", 0.08)})`,
        gradientText: "linear-gradient(135deg, #FF9F0A, #FFD60A)",
        sidebarBg: "rgba(5,4,3,0.96)",
      },
      {
        // 3 — Frost: ice-white accent
        accent: "#E5E5EA",
        accentDim: "#C7C7CC",
        accentBg: hR("#E5E5EA", 0.06),
        accentAlt: "#8E8E93",
        borderAccent: hR("#E5E5EA", 0.08),
        gradient: "linear-gradient(135deg, #E5E5EA, #8E8E93)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#E5E5EA", 0.06)}, ${hR("#8E8E93", 0.06)})`,
        gradientText: "linear-gradient(135deg, #E5E5EA, #8E8E93)",
      },
    ],
  },

  // ━━━ 5. NERO NEMESIS — Lamborghini Terzo Millennio, blacked out ━━━
  // Carbon fiber textures. Futuristic glass. Glowing lights.
  // Not a color theme — a material system. Surfaces have WEAVE.
  // Glass refracts accent light. Borders are emission lines.
  // Colors don't just exist — they EMIT against the void.
  {
    id: "nero",
    name: "Nero Nemesis",
    desc: "Terzo Millennio — carbon fiber, glass, glow",
    preview: ["#000000", "#8B5CF6", "#00E5FF", "#FF9100", "#0A0A12"],
    variantLabels: ["Void", "Carbon", "Forged", "Signal"],
    overrides: {
      // ── NERO MODE FLAG — enables carbon/glass/glow in style helpers ──
      neroMode: true,
      // Foundation Blacks — VOID base, absolute darkness
      bg: "#000000", // VOID — true black
      bg1: "#06060E", // ABYSS — card surfaces (slight blue-violet cast)
      bg2: "#0C0C18", // OBSIDIAN — raised surfaces
      bg3: "#131320", // CARBON — elevated elements, hovers
      // Borders — EMISSION LINES (not drawn, they glow)
      border: "rgba(255,255,255,0.07)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(139,92,246,0.40)", // STRONG glow line
      // Text — crisp white on void
      text: "#F5F5FA",
      textMuted: "rgba(245,245,250,0.58)",
      textDim: "rgba(245,245,250,0.28)",
      // Accent — NOVA CORE violet, cranked for emission
      accent: "#8B5CF6",
      accentDim: "#7C3AED",
      accentBg: "rgba(139,92,246,0.14)",
      accentAlt: "#C084FC",
      // Gradients — vivid NOVA spectrum
      gradient: "linear-gradient(135deg, #8B5CF6, #C084FC)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#8B5CF6", 0.14)}, ${hR("#C084FC", 0.14)})`,
      gradientText: "linear-gradient(135deg, #A78BFA, #C084FC)",
      // Signal colors — ELECTRIC NEON on void
      green: "#00E676",
      red: "#FF1744",
      blue: "#2979FF",
      purple: "#D4A5FF",
      orange: "#FF9100",
      cyan: "#00E5FF",
      yellow: "#FFD600",
      // Sidebar — void
      sidebarBg: "rgba(4,4,10,0.97)",
      // Glass — visible translucency against void (for glass surfaces, NOT carbon)
      glassBg: "rgba(255,255,255,0.08)",
      glassBorder: "rgba(255,255,255,0.12)",
      glassBgDark: "rgba(6,6,14,0.92)",
      // Background — carbon fiber weave + subtle ambient glow
      // Twill weave: grid (H+V) + diagonal cross-hatch = visible carbon fiber
      bgGradient: [
        // Primary weave grid — VISIBLE
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
        // Diagonal twill — gives the "woven" character
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
        "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
        // Ambient floor glow — very dim, just enough to see surfaces aren't flat
        `radial-gradient(ellipse at 50% 100%, rgba(120,120,140,0.06) 0%, transparent 50%)`,
        "#000000",
      ].join(", "),
      forceDark: true,
      // ── Carbon fiber CSS (reusable by style helpers) ──
      // Grid weave + diagonal cross = real carbon fiber texture
      carbonTexture: [
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
        "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
        "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
      ].join(", "),
    },
    variants: [
      null, // 0 — Void (default — carbon fiber + NOVA violet glow)
      {
        // 1 — Carbon — elevated matte carbon
        bg: "#050510",
        bg1: "#0A0A18",
        bg2: "#111120",
        bg3: "#1A1A2A",
        sidebarBg: "rgba(5,5,16,0.97)",
        bgGradient: [
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          "#050510",
        ].join(", "),
      },
      {
        // 2 — Forged — cold black, ELECTRIC CYAN glow
        bg: "#000008",
        bg1: "#040412",
        bg2: "#0A0A1C",
        bg3: "#121224",
        accent: "#00E5FF",
        accentDim: "#00B8D4",
        accentBg: hR("#00E5FF", 0.14),
        accentAlt: "#18FFFF",
        borderAccent: hR("#00E5FF", 0.4),
        gradient: "linear-gradient(135deg, #00E5FF, #18FFFF)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#00E5FF", 0.14)}, ${hR("#18FFFF", 0.14)})`,
        gradientText: "linear-gradient(135deg, #00E5FF, #18FFFF)",
        glassBg: "rgba(0,229,255,0.03)",
        glassBorder: "rgba(0,229,255,0.10)",
        sidebarBg: "rgba(0,0,8,0.97)",
        bgGradient: [
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          "#000008",
        ].join(", "),
      },
      {
        // 3 — Signal — AMBER GLOW (Lambo headlights, construction heat)
        bg: "#030200",
        bg1: "#0A0906",
        bg2: "#14120C",
        bg3: "#1E1A12",
        accent: "#FF9100",
        accentDim: "#E67C00",
        accentBg: hR("#FF9100", 0.14),
        accentAlt: "#FFAB40",
        borderAccent: hR("#FF9100", 0.4),
        gradient: "linear-gradient(135deg, #FF9100, #FFAB40)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#FF9100", 0.14)}, ${hR("#FFAB40", 0.14)})`,
        gradientText: "linear-gradient(135deg, #FF9100, #FFAB40)",
        glassBg: "rgba(255,145,0,0.03)",
        glassBorder: "rgba(255,145,0,0.10)",
        sidebarBg: "rgba(3,2,0,0.97)",
        bgGradient: [
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 3px)",
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          "repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 8px)",
          `radial-gradient(ellipse at 50% 100%, ${hR("#FF9100", 0.06)} 0%, transparent 50%)`,
          "#030200",
        ].join(", "),
        carbonTexture:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 4px)",
      },
    ],
  },
];

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
