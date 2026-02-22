// Default color scheme — Sunrise/Sunset dark-first design (base for dark themes)
export const C_DEFAULT = {
  // Surfaces — deep layered darks
  bg: "#0B0D11",       // deepest canvas
  bg1: "#12151C",      // card surfaces
  bg2: "#191D27",      // raised surfaces, headers
  bg3: "#222836",      // elevated elements, hover
  // Borders
  border: "rgba(255,255,255,0.07)",
  borderLight: "rgba(255,255,255,0.04)",
  borderAccent: "rgba(255,122,61,0.15)",
  // Text hierarchy
  text: "#E8ECF4",
  textMuted: "#8893A7",
  textDim: "#4E5669",
  // Accent — warm orange-to-purple gradient endpoints
  accent: "#FF7A3D",
  accentDim: "#E06020",
  accentBg: "rgba(255,122,61,0.08)",
  accentAlt: "#C084FC",    // soft purple secondary
  // Gradient CSS value (for backgrounds/borders)
  gradient: "linear-gradient(135deg, #FF7A3D, #C084FC)",
  gradientSubtle: "linear-gradient(135deg, rgba(255,122,61,0.15), rgba(192,132,252,0.15))",
  gradientText: "linear-gradient(135deg, #FF7A3D, #C084FC)",
  // Semantic colors
  green: "#00E676",
  red: "#FF4757",
  blue: "#60A5FA",
  purple: "#C084FC",
  orange: "#FF7A3D",
  cyan: "#64D2FF",
  yellow: "#FFE66D",
  // Sidebar
  sidebarBg: "rgba(11,13,17,0.85)",
  // Glass
  glassBg: "rgba(18,21,28,0.55)",
  glassBorder: "rgba(255,255,255,0.08)",
  glassBgDark: "rgba(18,21,28,0.75)",
  // Background gradient
  bgGradient: `radial-gradient(ellipse at 20% 20%, rgba(255,122,61,0.18) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(192,132,252,0.14) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(96,165,250,0.10) 0%, transparent 50%), #0B0D11`,
};

// Shared light-mode base
const LB = {
  border: "#D1D1D6", borderLight: "#E5E5EA",
  green: "#30D158", red: "#FF3B30", blue: "#0A84FF", purple: "#BF5AF2",
  orange: "#FF9500", cyan: "#64D2FF", yellow: "#FFD60A",
  glassBg: "rgba(255,255,255,0.55)", glassBorder: "rgba(0,0,0,0.08)",
  glassBgDark: "rgba(255,255,255,0.72)",
};

// Helper: hex to rgba
const hR = (hex, a) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)},${a})`;
};
// Helper: darken a hex color
const dk = (hex, amt = 0.15) => {
  const h = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(h.substring(0,2),16) * (1 - amt)));
  const g = Math.max(0, Math.round(parseInt(h.substring(2,4),16) * (1 - amt)));
  const b = Math.max(0, Math.round(parseInt(h.substring(4,6),16) * (1 - amt)));
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
};

// Helper: check if a hex color is "dark"
const checkDark = (hex) => {
  const h = (hex || "#000").replace("#", "");
  const r = parseInt(h.substring(0,2),16) || 0;
  const g = parseInt(h.substring(2,4),16) || 0;
  const b = parseInt(h.substring(4,6),16) || 0;
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
};
// Helper: get luminance value for comparing darkness
const lum = (hex) => {
  const h = (hex || "#000").replace("#", "");
  const r = parseInt(h.substring(0,2),16) || 0;
  const g = parseInt(h.substring(2,4),16) || 0;
  const b = parseInt(h.substring(4,6),16) || 0;
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
      if (vLum < minLum) { minLum = vLum; best = v; }
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
    accent: accentSource.accent, accentDim: accentSource.accentDim,
    accentBg: accentSource.accentBg, accentAlt: accentSource.accentAlt,
    gradient: accentSource.gradient, gradientSubtle: accentSource.gradientSubtle,
    gradientText: accentSource.gradientText,
    green: accentSource.green, red: accentSource.red, blue: accentSource.blue,
    purple: accentSource.purple, orange: accentSource.orange,
    cyan: accentSource.cyan, yellow: accentSource.yellow,
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

// ─── 7 PALETTES — each with 5 sub-themes (click card to cycle) ───────────
export const PALETTES = [

  // ━━━ 1. MOCHA MOUSSE — Pantone 2025 Color of the Year ━━━
  {
    id: "mocha", name: "Mocha Mousse", desc: "Pantone 2025 — warm sophistication",
    preview: ["#9B8B7E", "#6B5D4F", "#D4C4B0", "#F5F1ED", "#3A3A3A"],
    variantLabels: ["Mocha Dark", "Taupe Dark", "Espresso", "Mocha Light", "Cream Light"],
    overrides: {
      bg: "#1A1614", bg1: "#201C18", bg2: "#2A2420", bg3: "#34302A",
      border: "rgba(155,139,126,0.12)", borderLight: "rgba(155,139,126,0.06)", borderAccent: "rgba(155,139,126,0.20)",
      text: "#F5F1ED", textMuted: "#B0A498", textDim: "#6B5D4F",
      accent: "#9B8B7E", accentDim: dk("#9B8B7E"), accentBg: hR("#9B8B7E", 0.10), accentAlt: "#D4C4B0",
      gradient: "linear-gradient(135deg, #9B8B7E, #D4C4B0)", gradientSubtle: `linear-gradient(135deg, ${hR("#9B8B7E", 0.12)}, ${hR("#D4C4B0", 0.12)})`, gradientText: "linear-gradient(135deg, #9B8B7E, #D4C4B0)",
      green: "#66BB6A", red: "#EF5350", blue: "#64B5F6", purple: "#AB8FC0", orange: "#C89060",
      sidebarBg: "rgba(26,22,20,0.90)", glassBg: "rgba(32,28,24,0.55)", glassBorder: "rgba(155,139,126,0.10)",
      glassBgDark: "rgba(26,22,20,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#9B8B7E",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#D4C4B0",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#6B5D4F",0.10)} 0%, transparent 50%), #1A1614`,
    },
    variants: [
      null, // 0 — Mocha Dark (default)
      { // 1 — Taupe Dark
        accent: "#D4C4B0", accentDim: dk("#D4C4B0"), accentBg: hR("#D4C4B0", 0.10), accentAlt: "#9B8B7E",
        borderAccent: hR("#D4C4B0", 0.20),
        gradient: "linear-gradient(135deg, #D4C4B0, #9B8B7E)", gradientSubtle: `linear-gradient(135deg, ${hR("#D4C4B0", 0.12)}, ${hR("#9B8B7E", 0.12)})`, gradientText: "linear-gradient(135deg, #D4C4B0, #9B8B7E)",
      },
      { // 2 — Espresso
        bg: "#0E0C0A", bg1: "#16120E", bg2: "#1E1A16", bg3: "#282420",
        accent: "#6B5D4F", accentDim: dk("#6B5D4F"), accentBg: hR("#6B5D4F", 0.10), accentAlt: "#9B8B7E",
        borderAccent: hR("#6B5D4F", 0.20),
        gradient: "linear-gradient(135deg, #6B5D4F, #9B8B7E)", gradientSubtle: `linear-gradient(135deg, ${hR("#6B5D4F", 0.12)}, ${hR("#9B8B7E", 0.12)})`, gradientText: "linear-gradient(135deg, #6B5D4F, #9B8B7E)",
        sidebarBg: "rgba(14,12,10,0.90)",
      },
      { // 3 — Mocha Light
        bg: "#F5F1ED", bg1: "#FFFFFF", bg2: "#EDE7E0", bg3: "#E0D8CE",
        border: "#D4C4B0", borderLight: "#E0D8CE", borderAccent: hR("#9B8B7E", 0.15),
        text: "#2C2016", textMuted: "#7A6B5A", textDim: "#B5A898",
        accent: "#9B8B7E", accentDim: dk("#9B8B7E"), accentBg: hR("#9B8B7E", 0.08), accentAlt: "#6B5D4F",
        gradient: "linear-gradient(135deg, #9B8B7E, #6B5D4F)", gradientSubtle: `linear-gradient(135deg, ${hR("#9B8B7E", 0.08)}, ${hR("#6B5D4F", 0.08)})`, gradientText: "linear-gradient(135deg, #9B8B7E, #6B5D4F)",
        ...LB, border: "#D4C4B0", borderLight: "#E0D8CE",
        sidebarBg: "rgba(245,241,237,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#9B8B7E",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#6B5D4F",0.06)} 0%, transparent 50%), #F5F1ED`,
      },
      { // 4 — Cream Light
        bg: "#FAF8F5", bg1: "#FFFFFF", bg2: "#F3EDE6", bg3: "#E8DFD4",
        border: "#D6CCBE", borderLight: "#E8DFD4", borderAccent: hR("#6B5D4F", 0.15),
        text: "#2C2016", textMuted: "#7A6B5A", textDim: "#B5A898",
        accent: "#6B5D4F", accentDim: dk("#6B5D4F"), accentBg: hR("#6B5D4F", 0.08), accentAlt: "#9B8B7E",
        gradient: "linear-gradient(135deg, #6B5D4F, #9B8B7E)", gradientSubtle: `linear-gradient(135deg, ${hR("#6B5D4F", 0.08)}, ${hR("#9B8B7E", 0.08)})`, gradientText: "linear-gradient(135deg, #6B5D4F, #9B8B7E)",
        ...LB, border: "#D6CCBE", borderLight: "#E8DFD4",
        sidebarBg: "rgba(250,248,245,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#6B5D4F",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#9B8B7E",0.06)} 0%, transparent 50%), #FAF8F5`,
      },
    ],
  },

  // ━━━ 2. NEON TECH — Cutting-edge, developer-focused ━━━
  {
    id: "neon", name: "Neon Tech", desc: "High-contrast neon on dark",
    preview: ["#22C55E", "#3A82FF", "#E0E0E0", "#1A1A2E", "#0E0E0E"],
    variantLabels: ["Neon Green", "Electric Blue", "Dual Neon", "Neon Light", "Blue Light"],
    overrides: {
      bg: "#0E0E0E", bg1: "#151520", bg2: "#1A1A2E", bg3: "#24243A",
      border: "rgba(34,197,94,0.10)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(34,197,94,0.20)",
      text: "#E0E0E0", textMuted: "#8888AA", textDim: "#505070",
      accent: "#22C55E", accentDim: dk("#22C55E"), accentBg: hR("#22C55E", 0.08), accentAlt: "#3A82FF",
      gradient: "linear-gradient(135deg, #22C55E, #3A82FF)", gradientSubtle: `linear-gradient(135deg, ${hR("#22C55E", 0.12)}, ${hR("#3A82FF", 0.12)})`, gradientText: "linear-gradient(135deg, #22C55E, #3A82FF)",
      green: "#22C55E", blue: "#3A82FF", purple: "#8B5CF6", orange: "#F59E0B",
      sidebarBg: "rgba(14,14,14,0.90)",
      glassBg: "rgba(21,21,32,0.55)", glassBorder: "rgba(34,197,94,0.10)",
      glassBgDark: "rgba(14,14,14,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#22C55E",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#3A82FF",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#8B5CF6",0.10)} 0%, transparent 50%), #0E0E0E`,
    },
    variants: [
      null, // 0 — Neon Green
      { // 1 — Electric Blue
        accent: "#3A82FF", accentDim: dk("#3A82FF"), accentBg: hR("#3A82FF", 0.08), accentAlt: "#22C55E",
        borderAccent: hR("#3A82FF", 0.20),
        gradient: "linear-gradient(135deg, #3A82FF, #22C55E)", gradientSubtle: `linear-gradient(135deg, ${hR("#3A82FF", 0.12)}, ${hR("#22C55E", 0.12)})`, gradientText: "linear-gradient(135deg, #3A82FF, #22C55E)",
      },
      { // 2 — Dual Neon
        bg: "#0A0A14", bg1: "#101020", bg2: "#16162A", bg3: "#202038",
        accent: "#22C55E", accentDim: dk("#22C55E"), accentBg: hR("#22C55E", 0.08), accentAlt: "#8B5CF6",
        borderAccent: hR("#8B5CF6", 0.18),
        gradient: "linear-gradient(135deg, #22C55E, #8B5CF6)", gradientSubtle: `linear-gradient(135deg, ${hR("#22C55E", 0.12)}, ${hR("#8B5CF6", 0.12)})`, gradientText: "linear-gradient(135deg, #22C55E, #8B5CF6)",
        sidebarBg: "rgba(10,10,20,0.90)",
      },
      { // 3 — Neon Light
        bg: "#F5F5F7", bg1: "#FFFFFF", bg2: "#F0F0F2", bg3: "#E5E5EA",
        border: "#D1D1D6", borderLight: "#E5E5EA", borderAccent: hR("#22C55E", 0.15),
        text: "#1A1A2E", textMuted: "#505070", textDim: "#A0A0BC",
        accent: "#16A34A", accentDim: dk("#16A34A"), accentBg: hR("#16A34A", 0.08), accentAlt: "#3A82FF",
        gradient: "linear-gradient(135deg, #16A34A, #3A82FF)", gradientSubtle: `linear-gradient(135deg, ${hR("#16A34A", 0.08)}, ${hR("#3A82FF", 0.08)})`, gradientText: "linear-gradient(135deg, #16A34A, #3A82FF)",
        ...LB, sidebarBg: "rgba(245,245,247,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#16A34A",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#3A82FF",0.06)} 0%, transparent 50%), #F5F5F7`,
      },
      { // 4 — Blue Light
        bg: "#F3F4F8", bg1: "#FFFFFF", bg2: "#EAECF2", bg3: "#DDDFE8",
        border: "#C8CCD8", borderLight: "#DDDFE8", borderAccent: hR("#3A82FF", 0.15),
        text: "#1A1A2E", textMuted: "#505070", textDim: "#A0A0BC",
        accent: "#2563EB", accentDim: dk("#2563EB"), accentBg: hR("#2563EB", 0.08), accentAlt: "#16A34A",
        gradient: "linear-gradient(135deg, #2563EB, #16A34A)", gradientSubtle: `linear-gradient(135deg, ${hR("#2563EB", 0.08)}, ${hR("#16A34A", 0.08)})`, gradientText: "linear-gradient(135deg, #2563EB, #16A34A)",
        ...LB, border: "#C8CCD8", borderLight: "#DDDFE8",
        sidebarBg: "rgba(243,244,248,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#2563EB",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#16A34A",0.06)} 0%, transparent 50%), #F3F4F8`,
      },
    ],
  },

  // ━━━ 3. JEWEL LUXE — Premium, dramatic jewel tones ━━━
  {
    id: "jewel", name: "Jewel Luxe", desc: "Premium jewel tones & gold",
    preview: ["#8B5CF6", "#3B82F6", "#FFD700", "#059669", "#F5F5F5"],
    variantLabels: ["Amethyst", "Sapphire", "Gold Crown", "Jewel Light", "Emerald Light"],
    overrides: {
      bg: "#0E0A18", bg1: "#141020", bg2: "#1C1430", bg3: "#261E3E",
      border: "rgba(139,92,246,0.10)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(139,92,246,0.20)",
      text: "#F0ECF8", textMuted: "#9088A8", textDim: "#5A5070",
      accent: "#8B5CF6", accentDim: dk("#8B5CF6"), accentBg: hR("#8B5CF6", 0.10), accentAlt: "#FFD700",
      gradient: "linear-gradient(135deg, #8B5CF6, #FFD700)", gradientSubtle: `linear-gradient(135deg, ${hR("#8B5CF6", 0.12)}, ${hR("#FFD700", 0.12)})`, gradientText: "linear-gradient(135deg, #8B5CF6, #FFD700)",
      green: "#34D399", blue: "#60A5FA", purple: "#8B5CF6", orange: "#FBBF24",
      sidebarBg: "rgba(14,10,24,0.90)", glassBg: "rgba(20,16,32,0.55)", glassBorder: "rgba(139,92,246,0.10)",
      glassBgDark: "rgba(14,10,24,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#8B5CF6",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#FFD700",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#3B82F6",0.10)} 0%, transparent 50%), #0E0A18`,
    },
    variants: [
      null, // 0 — Amethyst
      { // 1 — Sapphire
        bg: "#0A1020", bg1: "#101830", bg2: "#142238", bg3: "#1C2E48",
        accent: "#3B82F6", accentDim: dk("#3B82F6"), accentBg: hR("#3B82F6", 0.10), accentAlt: "#8B5CF6",
        borderAccent: hR("#3B82F6", 0.20), border: "rgba(59,130,246,0.10)",
        text: "#E8F0FA", textMuted: "#7898C0", textDim: "#4A6080",
        gradient: "linear-gradient(135deg, #3B82F6, #8B5CF6)", gradientSubtle: `linear-gradient(135deg, ${hR("#3B82F6", 0.12)}, ${hR("#8B5CF6", 0.12)})`, gradientText: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
        sidebarBg: "rgba(10,16,32,0.90)",
      },
      { // 2 — Gold Crown
        accent: "#FFD700", accentDim: dk("#FFD700"), accentBg: hR("#FFD700", 0.10), accentAlt: "#8B5CF6",
        borderAccent: hR("#FFD700", 0.20),
        gradient: "linear-gradient(135deg, #FFD700, #8B5CF6)", gradientSubtle: `linear-gradient(135deg, ${hR("#FFD700", 0.12)}, ${hR("#8B5CF6", 0.12)})`, gradientText: "linear-gradient(135deg, #FFD700, #8B5CF6)",
      },
      { // 3 — Jewel Light
        bg: "#F8F5FF", bg1: "#FFFFFF", bg2: "#F0ECFA", bg3: "#E4DCF2",
        border: "#D0C4E8", borderLight: "#E4DCF2", borderAccent: hR("#6D28D9", 0.15),
        text: "#1C1030", textMuted: "#5E4E80", textDim: "#A098BC",
        accent: "#6D28D9", accentDim: dk("#6D28D9"), accentBg: hR("#6D28D9", 0.08), accentAlt: "#FFD700",
        gradient: "linear-gradient(135deg, #6D28D9, #FFD700)", gradientSubtle: `linear-gradient(135deg, ${hR("#6D28D9", 0.08)}, ${hR("#FFD700", 0.08)})`, gradientText: "linear-gradient(135deg, #6D28D9, #FFD700)",
        ...LB, border: "#D0C4E8", borderLight: "#E4DCF2",
        sidebarBg: "rgba(248,245,255,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#6D28D9",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#FFD700",0.06)} 0%, transparent 50%), #F8F5FF`,
      },
      { // 4 — Emerald Light
        bg: "#F5FAF7", bg1: "#FFFFFF", bg2: "#ECF5EF", bg3: "#DCE8E0",
        border: "#C0D8CA", borderLight: "#DCE8E0", borderAccent: hR("#059669", 0.15),
        text: "#0A2E1C", textMuted: "#4A7A60", textDim: "#90B8A0",
        accent: "#059669", accentDim: dk("#059669"), accentBg: hR("#059669", 0.08), accentAlt: "#6D28D9",
        gradient: "linear-gradient(135deg, #059669, #6D28D9)", gradientSubtle: `linear-gradient(135deg, ${hR("#059669", 0.08)}, ${hR("#6D28D9", 0.08)})`, gradientText: "linear-gradient(135deg, #059669, #6D28D9)",
        ...LB, border: "#C0D8CA", borderLight: "#DCE8E0",
        sidebarBg: "rgba(245,250,247,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#059669",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#6D28D9",0.06)} 0%, transparent 50%), #F5FAF7`,
      },
    ],
  },

  // ━━━ 4. EARTHY TERRAIN — Natural, grounded, sustainable ━━━
  {
    id: "earth", name: "Earthy Terrain", desc: "Natural tones & organic feel",
    preview: ["#4CAF50", "#8B7355", "#4A90A4", "#E8E4D8", "#5A4A3A"],
    variantLabels: ["Forest", "Clay", "Ocean Stone", "Terra Light", "Sand Light"],
    overrides: {
      bg: "#0C1008", bg1: "#12180E", bg2: "#1A2214", bg3: "#222E1E",
      border: "rgba(76,175,80,0.10)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(76,175,80,0.18)",
      text: "#E8E4D8", textMuted: "#98A088", textDim: "#5A6850",
      accent: "#4CAF50", accentDim: dk("#4CAF50"), accentBg: hR("#4CAF50", 0.10), accentAlt: "#8B7355",
      gradient: "linear-gradient(135deg, #4CAF50, #8B7355)", gradientSubtle: `linear-gradient(135deg, ${hR("#4CAF50", 0.12)}, ${hR("#8B7355", 0.12)})`, gradientText: "linear-gradient(135deg, #4CAF50, #8B7355)",
      green: "#4CAF50", blue: "#4A90A4", orange: "#C08040", red: "#D4573A",
      sidebarBg: "rgba(12,16,8,0.90)", glassBg: "rgba(18,24,14,0.55)", glassBorder: "rgba(76,175,80,0.10)",
      glassBgDark: "rgba(12,16,8,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#4CAF50",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#8B7355",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#4A90A4",0.10)} 0%, transparent 50%), #0C1008`,
    },
    variants: [
      null, // 0 — Forest
      { // 1 — Clay
        bg: "#100E0A", bg1: "#181410", bg2: "#201C14", bg3: "#2C261C",
        accent: "#8B7355", accentDim: dk("#8B7355"), accentBg: hR("#8B7355", 0.10), accentAlt: "#4CAF50",
        border: "rgba(139,115,85,0.10)", borderAccent: hR("#8B7355", 0.18),
        textMuted: "#A0906A", textDim: "#605840",
        gradient: "linear-gradient(135deg, #8B7355, #4CAF50)", gradientSubtle: `linear-gradient(135deg, ${hR("#8B7355", 0.12)}, ${hR("#4CAF50", 0.12)})`, gradientText: "linear-gradient(135deg, #8B7355, #4CAF50)",
        sidebarBg: "rgba(16,14,10,0.90)",
      },
      { // 2 — Ocean Stone
        bg: "#0A1014", bg1: "#10181E", bg2: "#141E24", bg3: "#1E2C34",
        accent: "#4A90A4", accentDim: dk("#4A90A4"), accentBg: hR("#4A90A4", 0.10), accentAlt: "#8B7355",
        border: "rgba(74,144,164,0.10)", borderAccent: hR("#4A90A4", 0.18),
        textMuted: "#7898A0", textDim: "#4A6068",
        gradient: "linear-gradient(135deg, #4A90A4, #8B7355)", gradientSubtle: `linear-gradient(135deg, ${hR("#4A90A4", 0.12)}, ${hR("#8B7355", 0.12)})`, gradientText: "linear-gradient(135deg, #4A90A4, #8B7355)",
        sidebarBg: "rgba(10,16,20,0.90)",
      },
      { // 3 — Terra Light
        bg: "#F5F3EE", bg1: "#FFFFFF", bg2: "#EDE9E0", bg3: "#E0DAD0",
        border: "#CCC4B4", borderLight: "#E0DAD0", borderAccent: hR("#2D5016", 0.15),
        text: "#2A2418", textMuted: "#6A6050", textDim: "#A8A090",
        accent: "#2D5016", accentDim: dk("#2D5016"), accentBg: hR("#2D5016", 0.08), accentAlt: "#8B7355",
        gradient: "linear-gradient(135deg, #2D5016, #8B7355)", gradientSubtle: `linear-gradient(135deg, ${hR("#2D5016", 0.08)}, ${hR("#8B7355", 0.08)})`, gradientText: "linear-gradient(135deg, #2D5016, #8B7355)",
        ...LB, border: "#CCC4B4", borderLight: "#E0DAD0",
        sidebarBg: "rgba(245,243,238,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#2D5016",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#8B7355",0.06)} 0%, transparent 50%), #F5F3EE`,
      },
      { // 4 — Sand Light
        bg: "#FAF8F4", bg1: "#FFFFFF", bg2: "#F2EDE4", bg3: "#E6DED0",
        border: "#D4CCBC", borderLight: "#E6DED0", borderAccent: hR("#8B7355", 0.15),
        text: "#2A2418", textMuted: "#6A6050", textDim: "#A8A090",
        accent: "#8B7355", accentDim: dk("#8B7355"), accentBg: hR("#8B7355", 0.08), accentAlt: "#4A90A4",
        gradient: "linear-gradient(135deg, #8B7355, #4A90A4)", gradientSubtle: `linear-gradient(135deg, ${hR("#8B7355", 0.08)}, ${hR("#4A90A4", 0.08)})`, gradientText: "linear-gradient(135deg, #8B7355, #4A90A4)",
        ...LB, border: "#D4CCBC", borderLight: "#E6DED0",
        sidebarBg: "rgba(250,248,244,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#8B7355",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#4A90A4",0.06)} 0%, transparent 50%), #FAF8F4`,
      },
    ],
  },

  // ━━━ 5. VIVID ENERGY — Bold, modern, eye-catching ━━━
  {
    id: "vivid", name: "Vivid Energy", desc: "Bold marigold & fuchsia pop",
    preview: ["#FF6B35", "#F71735", "#1B9AAA", "#FFFFFF", "#F5E6D3"],
    variantLabels: ["Marigold", "Fuchsia", "Deep Teal", "Vivid Light", "Rose Light"],
    overrides: {
      bg: "#0E0C0A", bg1: "#161210", bg2: "#1C1814", bg3: "#282220",
      border: "rgba(255,107,53,0.10)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(255,107,53,0.20)",
      text: "#F5E6D3", textMuted: "#A89880", textDim: "#6A5C4A",
      accent: "#FF6B35", accentDim: dk("#FF6B35"), accentBg: hR("#FF6B35", 0.10), accentAlt: "#F71735",
      gradient: "linear-gradient(135deg, #FF6B35, #F71735)", gradientSubtle: `linear-gradient(135deg, ${hR("#FF6B35", 0.12)}, ${hR("#F71735", 0.12)})`, gradientText: "linear-gradient(135deg, #FF6B35, #F71735)",
      green: "#22C55E", blue: "#1B9AAA", orange: "#FF6B35", red: "#F71735",
      sidebarBg: "rgba(14,12,10,0.90)",
      glassBg: "rgba(22,18,16,0.55)", glassBorder: "rgba(255,107,53,0.10)",
      glassBgDark: "rgba(14,12,10,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#FF6B35",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#F71735",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#1B9AAA",0.10)} 0%, transparent 50%), #0E0C0A`,
    },
    variants: [
      null, // 0 — Marigold
      { // 1 — Fuchsia
        accent: "#F71735", accentDim: dk("#F71735"), accentBg: hR("#F71735", 0.10), accentAlt: "#FF6B35",
        borderAccent: hR("#F71735", 0.20),
        gradient: "linear-gradient(135deg, #F71735, #FF6B35)", gradientSubtle: `linear-gradient(135deg, ${hR("#F71735", 0.12)}, ${hR("#FF6B35", 0.12)})`, gradientText: "linear-gradient(135deg, #F71735, #FF6B35)",
      },
      { // 2 — Deep Teal
        bg: "#0A1214", bg1: "#101A1E", bg2: "#142024", bg3: "#1E2E34",
        accent: "#1B9AAA", accentDim: dk("#1B9AAA"), accentBg: hR("#1B9AAA", 0.10), accentAlt: "#FF6B35",
        border: "rgba(27,154,170,0.10)", borderAccent: hR("#1B9AAA", 0.20),
        text: "#F5F5F5", textMuted: "#7898A0", textDim: "#4A6068",
        gradient: "linear-gradient(135deg, #1B9AAA, #FF6B35)", gradientSubtle: `linear-gradient(135deg, ${hR("#1B9AAA", 0.12)}, ${hR("#FF6B35", 0.12)})`, gradientText: "linear-gradient(135deg, #1B9AAA, #FF6B35)",
        sidebarBg: "rgba(10,18,20,0.90)",
      },
      { // 3 — Vivid Light
        bg: "#FFF8F4", bg1: "#FFFFFF", bg2: "#FFF0E8", bg3: "#FFE4D6",
        border: "#E8D0C0", borderLight: "#FFE4D6", borderAccent: hR("#FF6B35", 0.15),
        text: "#1A1210", textMuted: "#6A5A48", textDim: "#A89888",
        accent: "#E85D2C", accentDim: dk("#E85D2C"), accentBg: hR("#E85D2C", 0.08), accentAlt: "#F71735",
        gradient: "linear-gradient(135deg, #E85D2C, #F71735)", gradientSubtle: `linear-gradient(135deg, ${hR("#E85D2C", 0.08)}, ${hR("#F71735", 0.08)})`, gradientText: "linear-gradient(135deg, #E85D2C, #F71735)",
        ...LB, border: "#E8D0C0", borderLight: "#FFE4D6",
        sidebarBg: "rgba(255,248,244,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#E85D2C",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#F71735",0.06)} 0%, transparent 50%), #FFF8F4`,
      },
      { // 4 — Rose Light
        bg: "#FFF5F7", bg1: "#FFFFFF", bg2: "#FFEAEE", bg3: "#FFDCE2",
        border: "#E8C8D0", borderLight: "#FFDCE2", borderAccent: hR("#E11D48", 0.15),
        text: "#1A1016", textMuted: "#6A4858", textDim: "#A88898",
        accent: "#E11D48", accentDim: dk("#E11D48"), accentBg: hR("#E11D48", 0.08), accentAlt: "#FF6B35",
        gradient: "linear-gradient(135deg, #E11D48, #FF6B35)", gradientSubtle: `linear-gradient(135deg, ${hR("#E11D48", 0.08)}, ${hR("#FF6B35", 0.08)})`, gradientText: "linear-gradient(135deg, #E11D48, #FF6B35)",
        ...LB, border: "#E8C8D0", borderLight: "#FFDCE2",
        sidebarBg: "rgba(255,245,247,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#E11D48",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#FF6B35",0.06)} 0%, transparent 50%), #FFF5F7`,
      },
    ],
  },

  // ━━━ 6. MARS — Rust oxide & Martian terrain (flagship) ━━━
  {
    id: "mars", name: "Mars", desc: "Rust oxide & Martian terrain",
    preview: ["#C1440E", "#D4872A", "#E8A84C", "#8B4513", "#E8D5C4"],
    variantLabels: ["Oxide", "Amber Dust", "Golden Sand", "Mars Light", "Sandstorm"],
    overrides: {
      bg: "#0E0806", bg1: "#140B08", bg2: "#1E120D", bg3: "#2A1A12",
      border: "rgba(193,68,14,0.12)", borderLight: "rgba(193,68,14,0.06)", borderAccent: "rgba(193,68,14,0.22)",
      text: "#E8D5C4", textMuted: "#9A7E6A", textDim: "#5C4535",
      accent: "#C1440E", accentDim: "#A33A0C", accentBg: hR("#C1440E", 0.10), accentAlt: "#D4872A",
      gradient: "linear-gradient(135deg, #C1440E, #D4872A)", gradientSubtle: `linear-gradient(135deg, ${hR("#C1440E", 0.12)}, ${hR("#D4872A", 0.12)})`, gradientText: "linear-gradient(135deg, #C1440E, #D4872A)",
      orange: "#D4872A", red: "#C1440E", yellow: "#E8A84C", green: "#4CAF50", blue: "#5B8DB8",
      sidebarBg: "rgba(14,8,6,0.90)", glassBg: "rgba(20,11,8,0.55)", glassBorder: "rgba(193,68,14,0.10)",
      glassBgDark: "rgba(14,8,6,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#C1440E",0.18)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#D4872A",0.14)} 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, ${hR("#E8A84C",0.10)} 0%, transparent 50%), #0E0806`,
    },
    variants: [
      null, // 0 — Oxide
      { // 1 — Amber Dust
        accent: "#D4872A", accentDim: dk("#D4872A"), accentBg: hR("#D4872A", 0.10), accentAlt: "#C1440E",
        borderAccent: hR("#D4872A", 0.22),
        gradient: "linear-gradient(135deg, #D4872A, #C1440E)", gradientSubtle: `linear-gradient(135deg, ${hR("#D4872A", 0.12)}, ${hR("#C1440E", 0.12)})`, gradientText: "linear-gradient(135deg, #D4872A, #C1440E)",
      },
      { // 2 — Golden Sand
        bg: "#100A06", bg1: "#180E08", bg2: "#241810", bg3: "#30221A",
        accent: "#E8A84C", accentDim: dk("#E8A84C"), accentBg: hR("#E8A84C", 0.10), accentAlt: "#D4872A",
        borderAccent: hR("#E8A84C", 0.22),
        gradient: "linear-gradient(135deg, #E8A84C, #D4872A)", gradientSubtle: `linear-gradient(135deg, ${hR("#E8A84C", 0.12)}, ${hR("#D4872A", 0.12)})`, gradientText: "linear-gradient(135deg, #E8A84C, #D4872A)",
        sidebarBg: "rgba(16,10,6,0.90)",
      },
      { // 3 — Mars Light
        bg: "#FAF5F0", bg1: "#FFFFFF", bg2: "#F2E8DE", bg3: "#E8DCD0",
        border: "#D8C8B8", borderLight: "#E8DCD0", borderAccent: hR("#C1440E", 0.15),
        text: "#2A1810", textMuted: "#7A5840", textDim: "#B09880",
        accent: "#C1440E", accentDim: dk("#C1440E"), accentBg: hR("#C1440E", 0.08), accentAlt: "#D4872A",
        gradient: "linear-gradient(135deg, #C1440E, #D4872A)", gradientSubtle: `linear-gradient(135deg, ${hR("#C1440E", 0.08)}, ${hR("#D4872A", 0.08)})`, gradientText: "linear-gradient(135deg, #C1440E, #D4872A)",
        ...LB, border: "#D8C8B8", borderLight: "#E8DCD0",
        green: "#4CAF50", blue: "#5B8DB8", orange: "#D4872A", red: "#C1440E",
        sidebarBg: "rgba(250,245,240,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#C1440E",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#D4872A",0.06)} 0%, transparent 50%), #FAF5F0`,
      },
      { // 4 — Sandstorm
        bg: "#FBF7F0", bg1: "#FFFFFF", bg2: "#F4EDE2", bg3: "#EAE0D2",
        border: "#DCD0C0", borderLight: "#EAE0D2", borderAccent: hR("#D4872A", 0.15),
        text: "#2A1810", textMuted: "#7A5840", textDim: "#B09880",
        accent: "#D4872A", accentDim: dk("#D4872A"), accentBg: hR("#D4872A", 0.08), accentAlt: "#C1440E",
        gradient: "linear-gradient(135deg, #D4872A, #C1440E)", gradientSubtle: `linear-gradient(135deg, ${hR("#D4872A", 0.08)}, ${hR("#C1440E", 0.08)})`, gradientText: "linear-gradient(135deg, #D4872A, #C1440E)",
        ...LB, border: "#DCD0C0", borderLight: "#EAE0D2",
        green: "#4CAF50", blue: "#5B8DB8", orange: "#D4872A", red: "#C1440E",
        sidebarBg: "rgba(251,247,240,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, ${hR("#D4872A",0.08)} 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, ${hR("#C1440E",0.06)} 0%, transparent 50%), #FBF7F0`,
      },
    ],
  },

  // ━━━ 7. GREYSCALE — Pure monochrome minimal ━━━
  {
    id: "grey", name: "Greyscale", desc: "Pure monochrome minimal",
    preview: ["#0A0A0A", "#404040", "#808080", "#C0C0C0", "#F0F0F0"],
    variantLabels: ["Charcoal", "Midnight", "Silver", "Paper", "Fog"],
    overrides: {
      bg: "#0A0A0A", bg1: "#141414", bg2: "#1E1E1E", bg3: "#282828",
      border: "rgba(255,255,255,0.08)", borderLight: "rgba(255,255,255,0.04)", borderAccent: "rgba(224,224,224,0.12)",
      text: "#F0F0F0", textMuted: "#8A8A8A", textDim: "#505050",
      accent: "#E0E0E0", accentDim: "#C0C0C0", accentBg: "rgba(224,224,224,0.06)", accentAlt: "#808080",
      gradient: "linear-gradient(135deg, #E0E0E0, #808080)", gradientSubtle: "linear-gradient(135deg, rgba(224,224,224,0.08), rgba(128,128,128,0.08))", gradientText: "linear-gradient(135deg, #E0E0E0, #808080)",
      sidebarBg: "rgba(10,10,10,0.90)",
      glassBg: "rgba(20,20,20,0.55)", glassBorder: "rgba(255,255,255,0.08)",
      glassBgDark: "rgba(10,10,10,0.75)",
      bgGradient: `radial-gradient(ellipse at 20% 20%, rgba(224,224,224,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(128,128,128,0.10) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(192,192,192,0.08) 0%, transparent 50%), #0A0A0A`,
    },
    variants: [
      null, // 0 — Charcoal
      { // 1 — Midnight
        bg: "#000000", bg1: "#0A0A0A", bg2: "#141414", bg3: "#1E1E1E",
        accent: "#808080", accentDim: "#606060", accentBg: "rgba(128,128,128,0.06)", accentAlt: "#C0C0C0",
        gradient: "linear-gradient(135deg, #808080, #C0C0C0)", gradientSubtle: "linear-gradient(135deg, rgba(128,128,128,0.08), rgba(192,192,192,0.08))", gradientText: "linear-gradient(135deg, #808080, #C0C0C0)",
        text: "#E0E0E0",
        sidebarBg: "rgba(0,0,0,0.92)",
      },
      { // 2 — Silver
        bg: "#0E0E0E", bg1: "#181818", bg2: "#222222", bg3: "#2E2E2E",
        accent: "#C0C0C0", accentDim: "#A0A0A0", accentBg: "rgba(192,192,192,0.06)", accentAlt: "#E0E0E0",
        gradient: "linear-gradient(135deg, #C0C0C0, #E0E0E0)", gradientSubtle: "linear-gradient(135deg, rgba(192,192,192,0.08), rgba(224,224,224,0.08))", gradientText: "linear-gradient(135deg, #C0C0C0, #E0E0E0)",
      },
      { // 3 — Paper
        bg: "#F5F5F5", bg1: "#FFFFFF", bg2: "#EEEEEE", bg3: "#E0E0E0",
        border: "#D0D0D0", borderLight: "#E0E0E0", borderAccent: "rgba(64,64,64,0.12)",
        text: "#1A1A1A", textMuted: "#606060", textDim: "#A0A0A0",
        accent: "#404040", accentDim: "#2A2A2A", accentBg: "rgba(64,64,64,0.06)", accentAlt: "#808080",
        gradient: "linear-gradient(135deg, #404040, #808080)", gradientSubtle: "linear-gradient(135deg, rgba(64,64,64,0.06), rgba(128,128,128,0.06))", gradientText: "linear-gradient(135deg, #404040, #808080)",
        ...LB, border: "#D0D0D0", borderLight: "#E0E0E0",
        sidebarBg: "rgba(245,245,245,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, rgba(64,64,64,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(128,128,128,0.05) 0%, transparent 50%), #F5F5F5`,
      },
      { // 4 — Fog
        bg: "#F0F0F0", bg1: "#FAFAFA", bg2: "#E8E8E8", bg3: "#DADADA",
        border: "#C8C8C8", borderLight: "#DADADA", borderAccent: "rgba(128,128,128,0.12)",
        text: "#1A1A1A", textMuted: "#606060", textDim: "#A0A0A0",
        accent: "#808080", accentDim: "#606060", accentBg: "rgba(128,128,128,0.06)", accentAlt: "#404040",
        gradient: "linear-gradient(135deg, #808080, #404040)", gradientSubtle: "linear-gradient(135deg, rgba(128,128,128,0.06), rgba(64,64,64,0.06))", gradientText: "linear-gradient(135deg, #808080, #404040)",
        ...LB, border: "#C8C8C8", borderLight: "#DADADA",
        sidebarBg: "rgba(240,240,240,0.85)",
        bgGradient: `radial-gradient(ellipse at 20% 20%, rgba(128,128,128,0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(64,64,64,0.05) 0%, transparent 50%), #F0F0F0`,
      },
    ],
  },
];

// Chart colors
export const PIE_COLORS = ["#0A84FF", "#30D158", "#5E5CE6", "#FF9500", "#FF3B30", "#06B6D4", "#FFD60A", "#BF5AF2", "#E07C24", "#3A8F6E"];
