import { createContext, useContext, useMemo } from "react";
import { C_DEFAULT, PALETTES } from "@/constants/palettes";
import { useUiStore } from "@/stores/uiStore";
import { T, buildTokens } from "@/utils/designTokens";

const ThemeContext = createContext({ ...C_DEFAULT, T, isDark: false });

export function ThemeProvider({ children }) {
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const density = useUiStore(s => s.appSettings?.density || "comfortable");

  const value = useMemo(() => {
    const tokens = buildTokens(density);

    // ── Direct palette selection ──
    // If selectedPalette matches a palette ID (e.g. "nero", "nova", "matte"),
    // use that palette directly instead of the legacy dark/light toggle.
    const directPalette = PALETTES.find(p => p.id === selectedPalette);

    if (directPalette && directPalette.overrides?.forceDark) {
      // Force-dark palette (Nero, Nova, Matte, etc.) — no light variant
      const colors = { ...C_DEFAULT, ...(directPalette.overrides || {}) };

      // Nero Nemesis: dual material system — Black Glass + Matte Carbon
      // Glass tokens upgraded for visible 5-layer stack on void-black backgrounds.
      // neroGlass tiers (sm/md/lg/xl) available at C.T.neroGlass for explicit sizing.
      const isNero = directPalette.id === "nero";
      const neroTokens = isNero
        ? {
            ...tokens,
            glass: {
              ...tokens.glass,
              // Upgraded specular — bright enough for visible glass on void
              specularSm: "inset 0 0.5px 0 rgba(255,255,255,0.15)",
              specular: "inset 0 1px 0 rgba(255,255,255,0.20)",
              specularLg: "inset 0 1px 0 rgba(255,255,255,0.25)",
              specularHover: "inset 0 1px 0 rgba(255,255,255,0.30)",
              // Bottom specular — light catching underside of glass
              specularBottom: "inset 0 -0.5px 0 rgba(255,255,255,0.06)",
              specularBottomLg: "inset 0 -1px 0 rgba(255,255,255,0.08)",
              // Inner depth — physical thickness illusion
              innerDepth: "inset 0 0 16px -5px rgba(255,255,255,0.12)",
              innerDepthLg: "inset 0 0 20px -5px rgba(255,255,255,0.18)",
              // Edges — thin white hairline
              edge: "0 0 0 0.5px rgba(255,255,255,0.08)",
              edgeHover: "0 0 0 0.5px rgba(255,255,255,0.14)",
              // Restored refraction — subtle white glow for glass surfaces
              refraction: "0 0 8px rgba(255,255,255,0.04)",
              refractionHover: "0 0 12px rgba(255,255,255,0.08)",
            },
            shadow: {
              ...tokens.shadow,
              // Deep void shadows — glass floats above pure black
              sm: "0 2px 8px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.30)",
              md: "0 4px 16px rgba(0,0,0,0.50), 0 2px 6px rgba(0,0,0,0.35)",
              lg: "0 8px 32px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.40)",
              xl: "0 16px 48px rgba(0,0,0,0.60), 0 8px 20px rgba(0,0,0,0.45)",
              glow: "0 4px 16px rgba(0,0,0,0.50), 0 8px 32px rgba(0,0,0,0.30)",
              glowAccent: `0 0 12px ${colors.accent}25`,
              glowPurple: `0 0 12px ${colors.accent}25`,
            },
          }
        : tokens;

      const finalTokens = isNero ? neroTokens : tokens;
      return { ...colors, T: finalTokens, isDark: true, panel: { ...colors, T: finalTokens, isDark: true } };
    }

    if (directPalette && !directPalette.overrides?.forceDark) {
      // Palette with light variants — use base (dark) overrides for panel,
      // first light variant for main content
      const darkBase = { ...C_DEFAULT, ...(directPalette.overrides || {}) };
      const lightVariant =
        directPalette.variants?.find(v => {
          if (!v || !v.bg) return false;
          const h = v.bg.replace("#", "");
          const r = parseInt(h.substring(0, 2), 16) || 0;
          const g = parseInt(h.substring(2, 4), 16) || 0;
          const b = parseInt(h.substring(4, 6), 16) || 0;
          return r * 0.299 + g * 0.587 + b * 0.114 >= 128;
        }) || {};
      const mainColors = { ...darkBase, ...lightVariant };
      const panel = { ...darkBase, T: tokens, isDark: true };
      const lightT = {
        ...tokens,
        shadow: tokens.shadowLight || tokens.shadow,
        glass: tokens.glassLight || tokens.glass,
      };
      return { ...mainColors, T: lightT, isDark: false, panel };
    }

    // ── Legacy: dark/light toggle — Clarity palette is the base ──
    const isDarkMode = selectedPalette === "dark";
    const palette = PALETTES.find(p => p.id === "clarity") || PALETTES[0];
    const darkBase = { ...C_DEFAULT, ...(palette.overrides || {}) };

    if (isDarkMode) {
      // Dark Liquid Glass: Clarity dark base + dark glass tokens (with specular/lensing)
      const colors = {
        ...darkBase,
        glassBg: "rgba(255,255,255,0.04)",
        glassBorder: "rgba(255,255,255,0.10)",
        glassBgDark: "rgba(10,10,22,0.40)",
      };
      return { ...colors, T: tokens, isDark: true, panel: { ...colors, T: tokens, isDark: true } };
    }

    // Light Liquid Glass: Clarity Clean (variant 1) + light glass/shadow tokens
    const lightVariant = palette.variants?.[1] || {};
    const mainColors = { ...darkBase, ...lightVariant };

    // Panel uses dark base
    const panel = { ...darkBase, T: tokens, isDark: true };

    // Swap to light glass/shadow tokens
    const lightT = {
      ...tokens,
      shadow: tokens.shadowLight || tokens.shadow,
      glass: tokens.glassLight || tokens.glass,
    };

    return { ...mainColors, T: lightT, isDark: false, panel };
  }, [selectedPalette, density]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
