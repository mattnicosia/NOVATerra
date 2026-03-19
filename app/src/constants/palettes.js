import { TOPO_TEXTURE, DOT_TEXTURE } from "./textures";

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

  // ━━━ CLEAN LIGHT — Flat solid light, zero glass/blobs/swirls ━━━
  {
    id: "clean-light",
    name: "Light",
    desc: "Clean light — flat solid surfaces, no glass effects",
    preview: ["#F5F5F7", "#007AFF", "#FFFFFF", "#E5E5EA", "#1C1C1E"],
    variantLabels: ["Light"],
    overrides: {
      // Dark base (for side panel / dark regions)
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
      glassBg: "#2C2C2E",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "#1C1C1E",
      bgGradient: "#1C1C1E",
      forceDark: false,
      textureMode: true,
      noGlass: true,
    },
    variants: [
      null, // 0 — base dark (panel)
      {
        // 1 — Light: clean flat white surfaces — zero glass, zero blur
        bg: "#F5F5F7",
        bg1: "#FFFFFF",
        bg2: "#EAEAEF",
        bg3: "#E0E0E5",
        border: "#D1D1D6",
        borderLight: "#E5E5EA",
        borderAccent: hR("#007AFF", 0.15),
        text: "#1D1D1F",
        textMuted: "#8E8E93",
        textDim: "#AEAEB2",
        glassBg: "#FFFFFF",
        glassBorder: "#D1D1D6",
        glassBgDark: "#FFFFFF",
        sidebarBg: "#F5F5F7",
        bgGradient: "#F5F5F7",
        green: "#30D158",
        red: "#FF3B30",
        blue: "#0A84FF",
        purple: "#BF5AF2",
        orange: "#FF9500",
        cyan: "#64D2FF",
        yellow: "#FFD60A",
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  PREMIUM LIGHT COLLECTION — 6 material-driven light themes
  //  Each is a distinct surface material, not a color swap.
  //  Texture differentiation: grid, grain, weave, woodgrain, swept, crystalline.
  //  Every color is hand-tuned. Nothing procedural. Nothing AI-generic.
  // ═══════════════════════════════════════════════════════════════════════════

  // ━━━ BLUEPRINT — Architectural Drawing Sheet ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Warm ivory stock. Engineering blue ink. Visible grid ruling.
  // The surface IS the blueprint — thin blue lines every 8px on cream paper.
  // Functional, precise, architectural. Feels like unrolling a 30x42 sheet.
  {
    id: "blueprint",
    name: "Blueprint",
    desc: "Architectural drawing — engineering blue on ivory stock",
    preview: ["#F4F1E8", "#2962FF", "#FFFFFF", "#DED9C8", "#1C2340"],
    variantLabels: ["Drawing"],
    overrides: {
      // Dark panel: deep navy (like blueprint negative)
      bg: "#0C1224",
      bg1: "#121A30",
      bg2: "#1A223C",
      bg3: "#222C4A",
      border: "rgba(41,98,255,0.12)",
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: hR("#2962FF", 0.25),
      text: "#E8EAF0",
      textMuted: "rgba(232,234,240,0.55)",
      textDim: "rgba(232,234,240,0.28)",
      accent: "#2962FF",
      accentDim: "#1548D4",
      accentBg: hR("#2962FF", 0.08),
      accentAlt: "#448AFF",
      gradient: "linear-gradient(135deg, #2962FF, #448AFF)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#2962FF", 0.1)}, ${hR("#448AFF", 0.1)})`,
      gradientText: "linear-gradient(135deg, #2962FF, #448AFF)",
      green: "#00C853",
      red: "#FF1744",
      blue: "#2979FF",
      purple: "#AA00FF",
      orange: "#FF9100",
      cyan: "#00B8D4",
      yellow: "#FFD600",
      sidebarBg: "rgba(12,18,36,0.97)",
      glassBg: "rgba(26,34,60,0.78)",
      glassBorder: "rgba(41,98,255,0.08)",
      glassBgDark: "rgba(12,18,36,0.92)",
      bgGradient: "#0C1224",
      forceDark: false,
      textureMode: true,
    },
    variants: [
      null,
      {
        // Drawing: ivory stock with engineering grid
        bg: "#F4F1E8",
        bg1: "#FFFEFB",
        bg2: "#EBE8DE",
        bg3: "#E2DED2",
        borderAccent: hR("#2962FF", 0.14),
        text: "#1C2340",
        textMuted: "#5A6278",
        textDim: "#9298AC",
        accent: "#2962FF",
        accentDim: "#1548D4",
        accentBg: hR("#2962FF", 0.06),
        accentAlt: "#448AFF",
        gradient: "linear-gradient(135deg, #2962FF, #448AFF)",
        gradientSubtle: `linear-gradient(135deg, ${hR("#2962FF", 0.06)}, ${hR("#448AFF", 0.06)})`,
        gradientText: "linear-gradient(135deg, #2962FF, #448AFF)",
        ...LB,
        green: "#2E7D32",
        red: "#C62828",
        blue: "#1565C0",
        purple: "#6A1B9A",
        orange: "#E65100",
        cyan: "#00838F",
        yellow: "#F9A825",
        border: "#C8C2B0",
        borderLight: "#D8D4C6",
        glassBg: "rgba(255,254,251,0.85)",
        glassBorder: "#C8C2B0",
        glassBgDark: "rgba(255,254,251,0.92)",
        sidebarBg: "rgba(244,241,232,0.97)",
        bgGradient: [
          // Engineering grid — visible blue ruling on ivory
          "repeating-linear-gradient(0deg, rgba(41,98,255,0.04) 0 1px, transparent 1px 8px)",
          "repeating-linear-gradient(90deg, rgba(41,98,255,0.04) 0 1px, transparent 1px 8px)",
          // Major grid lines — heavier, every 40px (section breaks)
          "repeating-linear-gradient(0deg, rgba(41,98,255,0.07) 0 1px, transparent 1px 40px)",
          "repeating-linear-gradient(90deg, rgba(41,98,255,0.07) 0 1px, transparent 1px 40px)",
          // Warm paper glow — slight yellowing from center
          "radial-gradient(ellipse at 50% 50%, rgba(255,248,225,0.30) 0%, transparent 70%)",
          "#F4F1E8",
        ].join(", "),
      },
    ],
  },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Arancio — Shift5 brutalist chassis with Lamborghini Arancio Borealis accent
  // Same flat concrete surfaces, monochromatic grey semantics, zero-radius cards.
  // Coral swapped for #FF8700 warm amber-orange throughout.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "arancio",
    name: "Arancio",
    desc: "Military-tech brutalist — Arancio Borealis accent on dark grey",
    preview: ["#0C0C0E", "#FF8700", "#1A1A1E", "#666670", "#E8E8EC"],
    variantLabels: ["Tactical"],
    overrides: {
      // ── Surfaces — same Shift5 dark card system ──
      bg: "#141418",
      bg1: "#18181E",
      bg2: "#1E1E24",
      bg3: "#28282E",
      // ── Borders ──
      border: "rgba(255,255,255,0.12)",
      borderLight: "rgba(255,255,255,0.07)",
      borderAccent: "rgba(255,135,0,0.25)",
      // ── Text ──
      text: "#E8E8EC",
      textMuted: "rgba(232,232,236,0.50)",
      textDim: "rgba(232,232,236,0.28)",
      // ── Accent — Arancio Borealis ──
      accent: "#FF8700",
      accentDim: "#CC6C00",
      accentBg: "rgba(255,135,0,0.08)",
      accentAlt: "#FFA033",
      // ── Gradients ──
      gradient: "linear-gradient(135deg, #FF8700, #FFA033)",
      gradientSubtle: "linear-gradient(135deg, rgba(255,135,0,0.12), rgba(255,160,51,0.12))",
      gradientText: "linear-gradient(135deg, #FF8700, #FFA033)",
      // ── Semantic colors — monochromatic grey, brutalist ──
      green:  "#9A9AA0",
      red:    "#FF8700",   // danger → stays accent (brand unity)
      blue:   "#7A7A82",
      purple: "#6A6A72",
      orange: "#8A8A92",
      cyan:   "#7A7A82",
      yellow: "#8A8A92",
      // ── Sidebar ──
      sidebarBg: "#101014",
      // ── Glass (disabled — flat surfaces) ──
      glassBg: "#18181E",
      glassBorder: "rgba(255,255,255,0.12)",
      glassBgDark: "#141418",
      // ── Background — THE GREY FIELD ──
      bgGradient: "#2C2C32",
      // ── Flags ──
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [null], // single dark variant
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOVA Dark — Monumental concrete, stone architecture, muted warmth
  // Inspired by brutalist galleries and ancient chambers.
  // Neutral grays with warm stone accent. No neon. No violet. Just material.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "artifact-dark",
    name: "NOVA Dark",
    desc: "Monumental concrete — stone, shadow, warmth",
    preview: ["#111110", "#B0A698", "#1A1918", "#E4E0DB", "#242220"],
    variantLabels: ["Concrete"],
    overrides: {
      bg: "#111110",
      bg1: "#1A1918",
      bg2: "#242220",
      bg3: "#2E2B28",
      border: "rgba(255,255,255,0.06)",
      borderLight: "rgba(255,255,255,0.03)",
      borderAccent: "rgba(176,166,152,0.15)",
      text: "#E4E0DB",
      textMuted: "rgba(228,224,219,0.55)",
      textDim: "rgba(228,224,219,0.25)",
      accent: "#B0A698",
      accentDim: "#8A7E70",
      accentBg: "rgba(176,166,152,0.08)",
      accentAlt: "#C8BEB2",
      gradient: "linear-gradient(135deg, #B0A698, #C8BEB2)",
      gradientSubtle: "linear-gradient(135deg, rgba(176,166,152,0.12), rgba(200,190,178,0.12))",
      gradientText: "linear-gradient(135deg, #B0A698, #C8BEB2)",
      green: "#7BA88A",
      red: "#C47B78",
      blue: "#7B9AB5",
      purple: "#A08CB5",
      orange: "#C49A6C",
      cyan: "#6BAAB5",
      yellow: "#C4B56C",
      sidebarBg: "#111110",
      bgGradient: [
        "radial-gradient(ellipse at 50% 0%, rgba(176,166,152,0.03) 0%, transparent 50%)",
        "radial-gradient(ellipse at 50% 100%, rgba(100,95,88,0.04) 0%, transparent 40%)",
        "#111110",
      ].join(", "),
      forceDark: true,
      noGlass: true,
      materialMode: "concrete",
    },
    variants: [null],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Shift7 — "Warm Depth": Dark theme engineered for 8-hour estimating sessions
  // Vision Board prescription: luminance zoning, real row alternation,
  // warm inset hover glow, sustained active warmth, surface-based tabs.
  // Same NOVA violet accent, dramatically easier to work in.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "shift7",
    name: "Shift7",
    desc: "Warm Depth — dark theme built for all-day estimating",
    preview: ["#0E0D16", "#8B5CF6", "#1E1C2A", "#2A2838", "#EEEDF5"],
    variantLabels: ["Warm Depth"],
    overrides: {
      // ── Surfaces — lifted luminance zone for work areas ──
      // bg stays dark (chrome/nav), bg1 lifted for cards,
      // bg2/bg3 provide real separation within the work area
      bg: "#0A0918",       // nav/chrome — darkest anchor
      bg1: "#15131F",      // card surfaces — 6pt luminance lift (the key move)
      bg2: "#1E1C2A",      // raised surfaces, column headers
      bg3: "#2A2838",      // hover states, elevated elements
      // ── Borders — more visible for structure ──
      border: "rgba(255,255,255,0.09)",       // +2% over NOVA default
      borderLight: "rgba(255,255,255,0.05)",
      borderAccent: "rgba(139,92,246,0.22)",
      // ── Text — slightly warmer, higher contrast ──
      text: "#F0EFF7",                        // primary — warmer white
      textMuted: "rgba(240,239,247,0.58)",    // secondary — lifted 3%
      textDim: "rgba(240,239,247,0.32)",      // tertiary — lifted 4%
      // ── Accent — same NOVA violet ──
      accent: "#8B5CF6",
      accentDim: "#6D28D9",
      accentBg: "rgba(139,92,246,0.08)",
      accentAlt: "#A78BFA",
      // ── Gradients ──
      gradient: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      gradientSubtle: `linear-gradient(135deg, ${hR("#8B5CF6", 0.12)}, ${hR("#A78BFA", 0.12)})`,
      gradientText: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
      // ── Semantic colors — full color (not monochrome) ──
      green: "#34D399",
      red: "#FB7185",
      blue: "#60A5FA",
      purple: "#C4B5FD",
      orange: "#F59E0B",
      cyan: "#64D2FF",
      yellow: "#FFE66D",
      // ── Sidebar ──
      sidebarBg: "rgba(10,9,24,0.96)",
      // ── Glass ──
      glassBg: "rgba(21,19,31,0.82)",
      glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(10,9,24,0.82)",
      // ── Background ──
      bgGradient: "#0A0918",
      // ── Flags ──
      forceDark: true,
      // ── Warm Depth: estimate grid tokens ──
      // These are consumed by EstimatePage for the 5 visual moves.
      // Themes without these fall back to default behavior.
      estRowOddBg: "rgba(255,255,255,0.05)",        // Move 2: real row alternation (5% vs 2.5%)
      estRowHoverShadow: "inset 2px 0 0 #8B5CF6, inset 0 0 12px rgba(255,255,255,0.03)", // Move 3: warm inset glow
      estRowSelectedBg: "rgba(255,255,255,0.05)",    // Move 4: sustained warmth bg
      estRowSelectedShadow: "inset 2px 0 0 #8B5CF6", // Move 4: sustained accent bar
      estTabActiveBg: "rgba(255,255,255,0.08)",      // Move 5: surface tab (not underline)
      estTabActiveRadius: 4,                          // Move 5: rounded surface tab
      estTabActiveBorder: "none",                     // Move 5: kill underline
      estGridBg: "#15131F",                           // Move 1: luminance-zoned grid area
    },
    variants: [null], // single dark variant
  },
];

// Car palette IDs for cycling
export const CAR_PALETTE_IDS = ["car-terzo", "car-visiondee"];

// Premium light palette IDs
export const LIGHT_PALETTE_IDS = ["blueprint"];

// NOVA palette IDs
export const ARTIFACT_PALETTE_IDS = ["artifact-dark"];

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
