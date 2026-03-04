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
      glassBg: "rgba(20,20,20,0.68)",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(10,10,10,0.80)",
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
      glassBg: "rgba(44,44,46,0.78)",
      glassBorder: "rgba(255,255,255,0.06)",
      glassBgDark: "rgba(28,28,30,0.85)",
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
      glassBg: "rgba(10,10,10,0.75)",
      glassBorder: "rgba(255,255,255,0.04)",
      glassBgDark: "rgba(0,0,0,0.90)",
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
      textureMode: true,
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
        // Violet NOVA core glow — deep, barely visible identity pulse
        "radial-gradient(ellipse at 50% 60%, rgba(139,92,246,0.04) 0%, transparent 45%)",
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  CAR COLLECTION — 8 automotive-inspired themes
  //  Each palette is a complete design language extracted from the car's DNA:
  //  body color → surfaces, interior → backgrounds, accent lighting → accent,
  //  trim material → borders, gauge typography → type feel, geometry → radii
  // ═══════════════════════════════════════════════════════════════════════════

  // ━━━ 6. TERZO MILLENNIO — Lamborghini concept, angular stealth ━━━
  // Matte olive-black faceted body, amber glowing wheel cores, hexagonal taillights.
  // Every surface is a flat plane meeting at aggressive angles. Military precision.
  // Carbon fiber + dark olive + amber emission = stealth fighter, not showroom.
  {
    id: "car-terzo",
    name: "Terzo Millennio",
    desc: "Lamborghini — angular stealth, amber glow",
    preview: ["#0A0B08", "#E8920A", "#1A1D14", "#2A2D22", "#F5F0E0"],
    variantLabels: ["Stealth"],
    overrides: {
      bg: "#070805", // dark olive void
      bg1: "#0D0E0A", // carbon surface with green cast
      bg2: "#161812", // raised olive-charcoal
      bg3: "#20221A", // elevated, visible green undertone
      border: "rgba(232,146,10,0.10)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(232,146,10,0.35)",
      text: "#F0ECE0", // warm parchment white (interior leather)
      textMuted: "rgba(240,236,224,0.52)",
      textDim: "rgba(240,236,224,0.25)",
      accent: "#E8920A", // amber wheel glow
      accentDim: "#C47A08",
      accentBg: hR("#E8920A", 0.1),
      accentAlt: "#FFB740",
      gradient: "linear-gradient(135deg, #E8920A, #FFB740)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#E8920A", 0.12)}, ${hR("#FFB740", 0.12)})`,
      gradientText: "linear-gradient(135deg, #E8920A, #FFB740)",
      green: "#6ABF4B", // military status green
      red: "#E53935", // hexagonal taillight
      blue: "#42A5F5",
      purple: "#AB47BC",
      orange: "#FFB300",
      cyan: "#26C6DA",
      yellow: "#FFD740",
      sidebarBg: "rgba(7,8,5,0.97)",
      glassBg: "rgba(26,29,20,0.78)",
      glassBorder: "rgba(232,146,10,0.08)",
      glassBgDark: "rgba(7,8,5,0.92)",
      textureMode: true,
      bgGradient: [
        // Hex grid — Lamborghini's hexagonal design language
        "repeating-linear-gradient(60deg, rgba(232,146,10,0.025) 0 1px, transparent 1px 6px)",
        "repeating-linear-gradient(-60deg, rgba(232,146,10,0.025) 0 1px, transparent 1px 6px)",
        "repeating-linear-gradient(0deg, rgba(232,146,10,0.02) 0 1px, transparent 1px 6px)",
        // Amber headlight glow — concentrated upper-center (like DRL strip)
        "radial-gradient(ellipse at 40% 8%, rgba(232,146,10,0.12) 0%, rgba(232,146,10,0.03) 25%, transparent 50%)",
        // Secondary warm glow — lower right (tail light bleed)
        "radial-gradient(ellipse at 75% 85%, rgba(232,146,10,0.06) 0%, transparent 40%)",
        // Ambient floor glow
        "radial-gradient(ellipse at 50% 100%, rgba(232,146,10,0.04) 0%, transparent 45%)",
        "#070805",
      ].join(", "),
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 7. GT3 RS — Porsche 992, Python Green, surgical precision ━━━
  // Acid green on dark gray. Functional aero. No decoration, only purpose.
  // Every element exists for a reason. Swiss watch precision in a race car.
  // Gauge cluster = monospace tabular, weight = medium-bold, tight tracking.
  {
    id: "car-gt3rs",
    name: "GT3 RS",
    desc: "Porsche — acid precision, Python Green",
    preview: ["#0C0C0E", "#A6FF00", "#1A1A1E", "#2A2A30", "#F5F5F7"],
    variantLabels: ["Python"],
    overrides: {
      bg: "#0A0A0C", // clean dark, no color cast
      bg1: "#111114", // pure dark card
      bg2: "#1A1A1E", // raised surface
      bg3: "#242428", // hover state
      border: "rgba(166,255,0,0.08)",
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(166,255,0,0.30)",
      text: "#F5F5F7", // crisp white
      textMuted: "rgba(245,245,247,0.55)",
      textDim: "rgba(245,245,247,0.28)",
      accent: "#A6FF00", // Python Green
      accentDim: "#7ACC00",
      accentBg: hR("#A6FF00", 0.08),
      accentAlt: "#CCFF66",
      gradient: "linear-gradient(135deg, #A6FF00, #CCFF66)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#A6FF00", 0.1)}, ${hR("#CCFF66", 0.1)})`,
      gradientText: "linear-gradient(135deg, #A6FF00, #CCFF66)",
      green: "#A6FF00",
      red: "#FF3B30",
      blue: "#0A84FF",
      purple: "#BF5AF2",
      orange: "#FF9500",
      cyan: "#5AC8FA",
      yellow: "#FFD60A",
      sidebarBg: "rgba(10,10,12,0.97)",
      glassBg: "rgba(26,26,30,0.78)",
      glassBorder: "rgba(166,255,0,0.06)",
      glassBgDark: "rgba(10,10,12,0.92)",
      mesh: {
        base: "linear-gradient(135deg, #0C0C0E 0%, #0A0A10 40%, #080810 70%, #0C0C0E 100%)",
        blobs: [
          { color: "#A6FF00", x: "30%", y: "55%", size: "42vw", alpha: 0.35, blur: 50 },
          { color: "#3388FF", x: "72%", y: "18%", size: "28vw", alpha: 0.1, blur: 60 },
        ],
        caustics: [{ color: "#A6FF00", x: "18%", y: "40%", size: "14vw", alpha: 0.4, blur: 22 }],
      },
      bgGradient: `radial-gradient(ellipse at 50% 90%, ${hR("#A6FF00", 0.04)} 0%, transparent 50%), #0A0A0C`,
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 8. SPECTRE — Rolls-Royce, midnight sapphire + champagne ━━━
  // Starlight headliner. Spirit of Ecstasy. Whisper-quiet luxury.
  // Deep midnight blue surfaces, champagne gold accents, cream leather text.
  // Generous spacing, soft edges, everything breathes. No urgency.
  {
    id: "car-spectre",
    name: "Spectre",
    desc: "Rolls-Royce — sapphire night, champagne gold",
    preview: ["#060A18", "#C9A96E", "#0E1530", "#1A2448", "#F5F0E6"],
    variantLabels: ["Midnight"],
    overrides: {
      bg: "#040814", // midnight sapphire void
      bg1: "#0A1024", // deep blue card
      bg2: "#101832", // raised navy
      bg3: "#182040", // elevated sapphire
      border: "rgba(201,169,110,0.10)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(201,169,110,0.30)",
      text: "#F5F0E6", // cream leather
      textMuted: "rgba(245,240,230,0.52)",
      textDim: "rgba(245,240,230,0.26)",
      accent: "#C9A96E", // champagne gold
      accentDim: "#A8894E",
      accentBg: hR("#C9A96E", 0.08),
      accentAlt: "#E0C88A",
      gradient: "linear-gradient(135deg, #C9A96E, #E0C88A)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#C9A96E", 0.1)}, ${hR("#E0C88A", 0.1)})`,
      gradientText: "linear-gradient(135deg, #C9A96E, #E0C88A)",
      green: "#50C878", // British racing green tint
      red: "#E8475A",
      blue: "#5B8DEF",
      purple: "#9B7ADA",
      orange: "#D4A040",
      cyan: "#62B8D4",
      yellow: "#E8D060",
      sidebarBg: "rgba(4,8,20,0.97)",
      glassBg: "rgba(16,24,50,0.78)",
      glassBorder: "rgba(201,169,110,0.08)",
      glassBgDark: "rgba(4,8,20,0.92)",
      mesh: {
        base: "linear-gradient(135deg, #060A18 0%, #0A1028 35%, #0E1430 60%, #060A18 100%)",
        blobs: [
          { color: "#1A2858", x: "40%", y: "35%", size: "55vw", alpha: 0.35, blur: 65 },
          { color: "#C9A96E", x: "70%", y: "65%", size: "25vw", alpha: 0.14, blur: 55 },
        ],
        caustics: [{ color: "#C9A96E", x: "45%", y: "10%", size: "12vw", alpha: 0.25, blur: 28 }],
      },
      bgGradient: `radial-gradient(ellipse at 30% 20%, ${hR("#C9A96E", 0.04)} 0%, transparent 40%), radial-gradient(ellipse at 70% 80%, ${hR("#1A2448", 0.3)} 0%, transparent 50%), #040814`,
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 9. SF90 — Ferrari Stradale, Rosso Corsa passion ━━━
  // Italian red intensity. Flowing curves. Prancing horse heritage.
  // Warm dark surfaces with red undertone. Accent is LIVING red.
  // Typography has flair — slightly wider tracking, confident weight.
  {
    id: "car-sf90",
    name: "SF90 Stradale",
    desc: "Ferrari — Rosso Corsa, Italian fire",
    preview: ["#0C0808", "#DC2626", "#1C1414", "#2C2020", "#F5EDED"],
    variantLabels: ["Rosso"],
    overrides: {
      bg: "#0A0606", // near-black with warm red undertone
      bg1: "#120E0E", // dark warm surface
      bg2: "#1C1616", // raised surface, slight warmth
      bg3: "#262020", // elevated, visible warmth
      border: "rgba(220,38,38,0.10)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(220,38,38,0.35)",
      text: "#F8F0F0", // warm white
      textMuted: "rgba(248,240,240,0.55)",
      textDim: "rgba(248,240,240,0.28)",
      accent: "#DC2626", // Rosso Corsa
      accentDim: "#B91C1C",
      accentBg: hR("#DC2626", 0.1),
      accentAlt: "#EF4444",
      gradient: "linear-gradient(135deg, #DC2626, #EF4444)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#DC2626", 0.12)}, ${hR("#EF4444", 0.12)})`,
      gradientText: "linear-gradient(135deg, #DC2626, #EF4444)",
      green: "#22C55E",
      red: "#DC2626",
      blue: "#3B82F6",
      purple: "#A855F7",
      orange: "#F59E0B",
      cyan: "#06B6D4",
      yellow: "#FCD34D",
      sidebarBg: "rgba(10,6,6,0.97)",
      glassBg: "rgba(28,22,22,0.78)",
      glassBorder: "rgba(220,38,38,0.06)",
      glassBgDark: "rgba(10,6,6,0.92)",
      mesh: {
        base: "linear-gradient(135deg, #0C0808 0%, #120A0A 35%, #140C0C 55%, #0C0808 100%)",
        blobs: [
          { color: "#DC2626", x: "35%", y: "50%", size: "48vw", alpha: 0.32, blur: 55 },
          { color: "#1A2040", x: "70%", y: "15%", size: "25vw", alpha: 0.08, blur: 60 },
        ],
        caustics: [{ color: "#DC2626", x: "42%", y: "38%", size: "15vw", alpha: 0.38, blur: 22 }],
      },
      bgGradient: `radial-gradient(ellipse at 50% 100%, ${hR("#DC2626", 0.05)} 0%, transparent 50%), #0A0606`,
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 10. 720S — McLaren, Papaya Orange, surgical British ━━━
  // Heritage papaya orange on cool gray architecture. Teardrop cabin.
  // British engineering: precise, cool, technical. Orange is controlled fire.
  // Clean separation between surface layers, like the car's monocoque.
  {
    id: "car-720s",
    name: "720S",
    desc: "McLaren — Papaya Orange, British precision",
    preview: ["#0A0C10", "#FF6B00", "#141820", "#1E222C", "#FFF5EB"],
    variantLabels: ["Papaya"],
    overrides: {
      bg: "#08090E", // cool dark (British gray undertone)
      bg1: "#0E1018", // cool dark surface
      bg2: "#161A22", // raised cool gray
      bg3: "#1E222C", // elevated
      border: "rgba(255,107,0,0.08)",
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(255,107,0,0.30)",
      text: "#F5F5F8", // cool white
      textMuted: "rgba(245,245,248,0.55)",
      textDim: "rgba(245,245,248,0.28)",
      accent: "#FF6B00", // Papaya Orange
      accentDim: "#CC5500",
      accentBg: hR("#FF6B00", 0.08),
      accentAlt: "#FF9640",
      gradient: "linear-gradient(135deg, #FF6B00, #FF9640)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#FF6B00", 0.1)}, ${hR("#FF9640", 0.1)})`,
      gradientText: "linear-gradient(135deg, #FF6B00, #FF9640)",
      green: "#30D158",
      red: "#FF453A",
      blue: "#0A84FF",
      purple: "#BF5AF2",
      orange: "#FF6B00",
      cyan: "#5AC8FA",
      yellow: "#FFD60A",
      sidebarBg: "rgba(8,9,14,0.97)",
      glassBg: "rgba(22,26,34,0.78)",
      glassBorder: "rgba(255,107,0,0.06)",
      glassBgDark: "rgba(8,9,14,0.92)",
      textureMode: true,
      bgGradient: [
        // Fine engineering grid — technical drawing precision
        "repeating-linear-gradient(0deg, rgba(255,107,0,0.018) 0 1px, transparent 1px 8px)",
        "repeating-linear-gradient(90deg, rgba(255,107,0,0.018) 0 1px, transparent 1px 8px)",
        // Major grid lines — structural monocoque (every 40px)
        "repeating-linear-gradient(0deg, rgba(255,107,0,0.03) 0 1px, transparent 1px 40px)",
        "repeating-linear-gradient(90deg, rgba(255,107,0,0.03) 0 1px, transparent 1px 40px)",
        // Papaya accent — dihedral door light catch (upper right)
        "radial-gradient(ellipse at 70% 15%, rgba(255,107,0,0.10) 0%, rgba(255,107,0,0.02) 30%, transparent 50%)",
        // Secondary papaya glow — lower center (under-body aero glow)
        "radial-gradient(ellipse at 45% 90%, rgba(255,107,0,0.06) 0%, transparent 40%)",
        "#08090E",
      ].join(", "),
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 11. i VISION DEE — BMW concept, white futuristic ━━━
  // All-white body. E-Ink panels. Shy-tech. Digital Soul.
  // Ultra-minimal LIGHT theme. Clean whites, whisper-thin borders.
  // BMW blue accent. Maximum breathing room. Future is quiet.
  {
    id: "car-visiondee",
    name: "i Vision Dee",
    desc: "BMW — white futuristic, shy-tech minimal",
    preview: ["#F8F9FC", "#0066FF", "#FFFFFF", "#E8EAF0", "#1A1A2E"],
    variantLabels: ["Blanc", "Night"],
    overrides: {
      // Dark base (for panel)
      bg: "#0E0E1A",
      bg1: "#161624",
      bg2: "#1E1E2E",
      bg3: "#282838",
      border: "rgba(0,102,255,0.10)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: hR("#0066FF", 0.2),
      text: "#F0F0FA",
      textMuted: "rgba(240,240,250,0.55)",
      textDim: "rgba(240,240,250,0.28)",
      accent: "#0066FF", // BMW blue
      accentDim: "#0052CC",
      accentBg: hR("#0066FF", 0.08),
      accentAlt: "#3388FF",
      gradient: "linear-gradient(135deg, #0066FF, #3388FF)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#0066FF", 0.08)}, ${hR("#3388FF", 0.08)})`,
      gradientText: "linear-gradient(135deg, #0066FF, #3388FF)",
      green: "#30D158",
      red: "#FF3B30",
      blue: "#0066FF",
      purple: "#AF52DE",
      orange: "#FF9500",
      cyan: "#5AC8FA",
      yellow: "#FFD60A",
      sidebarBg: "rgba(14,14,26,0.97)",
      glassBg: "rgba(30,30,46,0.78)",
      glassBorder: "rgba(0,102,255,0.06)",
      glassBgDark: "rgba(14,14,26,0.92)",
      textureMode: true,
      bgGradient: [
        // E-Ink dot matrix — BMW digital soul pixels
        "repeating-linear-gradient(0deg, rgba(0,102,255,0.015) 0 1px, transparent 1px 5px)",
        "repeating-linear-gradient(90deg, rgba(0,102,255,0.015) 0 1px, transparent 1px 5px)",
        // Shy-tech blue pulse — center glow (Digital Soul heartbeat)
        "radial-gradient(ellipse at 50% 45%, rgba(0,102,255,0.08) 0%, transparent 40%)",
        // Secondary blue whisper — upper left
        "radial-gradient(ellipse at 15% 10%, rgba(51,136,255,0.04) 0%, transparent 35%)",
        "#0E0E1A",
      ].join(", "),
      forceDark: false,
    },
    variants: [
      null, // 0 — Night (dark base)
      {
        // 1 — Blanc: all-white futuristic
        bg: "#F8F9FC",
        bg1: "#FFFFFF",
        bg2: "#EFF0F6",
        bg3: "#E5E7EF",
        border: "#D0D4E0",
        borderLight: "#E2E4EC",
        borderAccent: hR("#0066FF", 0.15),
        text: "#101028",
        textMuted: "#6068A0",
        textDim: "#A0A4C0",
        ...LB,
        border: "#D0D4E0",
        borderLight: "#E2E4EC",
        sidebarBg: "rgba(248,249,252,0.92)",
        bgGradient: [
          // E-Ink dot matrix — ultra-subtle on white
          "repeating-linear-gradient(0deg, rgba(0,102,255,0.012) 0 1px, transparent 1px 5px)",
          "repeating-linear-gradient(90deg, rgba(0,102,255,0.012) 0 1px, transparent 1px 5px)",
          // Crystal blue breathe — upper left
          `radial-gradient(ellipse at 15% 10%, ${hR("#0066FF", 0.08)} 0%, transparent 50%)`,
          // Second blue whisper — lower right
          `radial-gradient(ellipse at 85% 85%, ${hR("#3388FF", 0.06)} 0%, transparent 50%)`,
          "#F8F9FC",
        ].join(", "),
      },
    ],
  },

  // ━━━ 12. AMG ONE — Mercedes F1-derived, Silver Arrow + Petronas teal ━━━
  // Silver Arrows heritage. F1 telemetry data density. Petronas teal glow.
  // Metallic silver-dark surfaces, technical precision, high information density.
  // Accent comes from Petronas sponsorship cyan-teal.
  {
    id: "car-amgone",
    name: "AMG ONE",
    desc: "Mercedes — Silver Arrow, Petronas teal",
    preview: ["#0A0C12", "#00D2BE", "#161A22", "#222830", "#F5F8FA"],
    variantLabels: ["Petronas"],
    overrides: {
      bg: "#080A10", // metallic dark (slight cool steel)
      bg1: "#0E1118", // steel surface
      bg2: "#161A24", // raised metallic
      bg3: "#1E232E", // elevated
      border: "rgba(0,210,190,0.08)",
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(0,210,190,0.30)",
      text: "#F0F4F8", // cool bright white (telemetry screens)
      textMuted: "rgba(240,244,248,0.55)",
      textDim: "rgba(240,244,248,0.28)",
      accent: "#00D2BE", // Petronas teal
      accentDim: "#00A896",
      accentBg: hR("#00D2BE", 0.08),
      accentAlt: "#40E8D8",
      gradient: "linear-gradient(135deg, #00D2BE, #40E8D8)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#00D2BE", 0.1)}, ${hR("#40E8D8", 0.1)})`,
      gradientText: "linear-gradient(135deg, #00D2BE, #40E8D8)",
      green: "#00E676",
      red: "#FF1744",
      blue: "#448AFF",
      purple: "#B388FF",
      orange: "#FFAB40",
      cyan: "#00D2BE",
      yellow: "#FFD740",
      sidebarBg: "rgba(8,10,16,0.97)",
      glassBg: "rgba(22,26,36,0.78)",
      glassBorder: "rgba(0,210,190,0.06)",
      glassBgDark: "rgba(8,10,16,0.92)",
      mesh: {
        base: "linear-gradient(135deg, #0A0C12 0%, #101418 35%, #141820 60%, #0A0C12 100%)",
        blobs: [
          { color: "#00D2BE", x: "30%", y: "45%", size: "42vw", alpha: 0.32, blur: 52 },
          { color: "#888E98", x: "68%", y: "25%", size: "28vw", alpha: 0.08, blur: 58 },
        ],
        caustics: [{ color: "#00D2BE", x: "35%", y: "62%", size: "14vw", alpha: 0.35, blur: 22 }],
      },
      bgGradient: `radial-gradient(ellipse at 50% 95%, ${hR("#00D2BE", 0.04)} 0%, transparent 45%), #080A10`,
      forceDark: true,
    },
    variants: [null],
  },

  // ━━━ 13. HUAYRA — Pagani, artisanal titanium + bronze ━━━
  // Hand-crafted. Exposed titanium bolts. Smoked glass. Analog gauges.
  // Warm bronze/titanium accent on rich dark brown leather surfaces.
  // Every detail is bespoke. Craftsmanship over technology.
  {
    id: "car-huayra",
    name: "Huayra",
    desc: "Pagani — artisanal titanium, analog warmth",
    preview: ["#0C0A08", "#B8860B", "#1A1614", "#2A2420", "#F5EDE0"],
    variantLabels: ["Titanium"],
    overrides: {
      bg: "#0A0806", // deep espresso void
      bg1: "#121010", // dark leather
      bg2: "#1C1816", // raised brown-black
      bg3: "#262220", // elevated warm surface
      border: "rgba(184,134,11,0.10)",
      borderLight: "rgba(255,255,255,0.04)",
      borderAccent: "rgba(184,134,11,0.30)",
      text: "#F5EDE0", // warm parchment (aged leather)
      textMuted: "rgba(245,237,224,0.52)",
      textDim: "rgba(245,237,224,0.25)",
      accent: "#B8860B", // titanium bronze
      accentDim: "#966D09",
      accentBg: hR("#B8860B", 0.08),
      accentAlt: "#D4A028",
      gradient: "linear-gradient(135deg, #B8860B, #D4A028)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#B8860B", 0.1)}, ${hR("#D4A028", 0.1)})`,
      gradientText: "linear-gradient(135deg, #B8860B, #D4A028)",
      green: "#6ABF4B",
      red: "#D44040",
      blue: "#5480B0",
      purple: "#8A6AB0",
      orange: "#D49030",
      cyan: "#508090",
      yellow: "#D4B840",
      sidebarBg: "rgba(10,8,6,0.97)",
      glassBg: "rgba(28,24,22,0.78)",
      glassBorder: "rgba(184,134,11,0.08)",
      glassBgDark: "rgba(10,8,6,0.92)",
      mesh: {
        base: "linear-gradient(135deg, #0C0A08 0%, #141210 35%, #181510 60%, #0C0A08 100%)",
        blobs: [
          { color: "#B8860B", x: "40%", y: "40%", size: "40vw", alpha: 0.28, blur: 55 },
          { color: "#8A6AB0", x: "10%", y: "60%", size: "25vw", alpha: 0.08, blur: 60 },
        ],
        caustics: [{ color: "#D4A028", x: "45%", y: "15%", size: "13vw", alpha: 0.25, blur: 25 }],
      },
      bgGradient: `radial-gradient(ellipse at 40% 80%, ${hR("#B8860B", 0.04)} 0%, transparent 45%), #0A0806`,
      forceDark: true,
    },
    variants: [null],
  },
];

// Car palette IDs for cycling
export const CAR_PALETTE_IDS = [
  "car-terzo",
  "car-gt3rs",
  "car-spectre",
  "car-sf90",
  "car-720s",
  "car-visiondee",
  "car-amgone",
  "car-huayra",
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
