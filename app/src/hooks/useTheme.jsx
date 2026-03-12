import { createContext, useContext, useMemo, useEffect } from "react";
import { C_DEFAULT, PALETTES } from "@/constants/palettes";
import { useUiStore } from "@/stores/uiStore";
import { T, buildTokens } from "@/utils/designTokens";

const ThemeContext = createContext({ ...C_DEFAULT, T, isDark: false });

// Flat glass tokens — zero blur, zero specular, zero transparency
// Used when a palette has noGlass: true (clean flat themes)
// IMPORTANT: Shadow-related values use "" (empty string) NOT "none", because
// "none" is invalid inside comma-separated box-shadow lists and causes the
// browser to reject the ENTIRE box-shadow property.
// Border values also use "" so they fall through to component-level fallbacks
// (which should use C.border — an opaque value for clean themes).
// Build accent glow tokens from hex color — Output VST-inspired luminous halos
// Called per-palette at theme build time so glow matches the active accent color.
const buildGlow = accent => {
  const h = (accent || "#8B5CF6").replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return {
    sm: `0 0 12px rgba(${r},${g},${b},0.20)`,
    md: `0 0 20px rgba(${r},${g},${b},0.30)`,
    lg: `0 0 30px rgba(${r},${g},${b},0.40), 0 0 60px rgba(${r},${g},${b},0.15)`,
    ring: `0 0 0 1px rgba(${r},${g},${b},0.45), 0 0 15px rgba(${r},${g},${b},0.25)`,
  };
};

const flatGlass = {
  blur: "none",
  blurLight: "none",
  blurHover: "none",
  bg: "",
  bgDark: "",
  border: "",
  borderHover: "",
  borderLight: "",
  specularSm: "",
  specular: "",
  specularLg: "",
  specularHover: "",
  edge: "",
  edgeHover: "",
  specularBottom: "",
  specularBottomLg: "",
  innerDepth: "",
  innerDepthLg: "",
  refraction: "",
  refractionHover: "",
  lens: "",
  lensHover: "",
};

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

      // noGlass: replace glass tokens with flat versions (zero blur/specular)
      const isNoGlass = !!colors.noGlass;
      const accentGlow = buildGlow(colors.accent);
      const resolvedTokens = isNoGlass
        ? { ...finalTokens, glass: flatGlass, glassLight: flatGlass, neroGlass: undefined, glow: accentGlow }
        : { ...finalTokens, glow: accentGlow };

      // Concrete material mode: diffused ambient occlusion shadows (no sharp specular)
      if (isNoGlass && colors.materialMode === "concrete") {
        resolvedTokens.shadow = {
          sm: "0 1px 4px rgba(0,0,0,0.25)",
          md: "0 2px 10px rgba(0,0,0,0.30)",
          lg: "0 4px 20px rgba(0,0,0,0.35)",
          xl: "0 8px 40px rgba(0,0,0,0.40)",
          glow: "0 2px 12px rgba(0,0,0,0.25)",
          glowAccent: `0 0 8px ${colors.accent || "#B0A698"}18`,
          glowPurple: `0 0 8px ${colors.accent || "#B0A698"}18`,
        };
      }

      return { ...colors, T: resolvedTokens, isDark: true, panel: { ...colors, T: resolvedTokens, isDark: true } };
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

      // noGlass: replace glass tokens with flat versions for both panel and main
      const isNoGlass = !!darkBase.noGlass;
      const panelGlow = buildGlow(darkBase.accent);
      const mainGlow = buildGlow(mainColors.accent || darkBase.accent);
      const panelTokens = isNoGlass
        ? { ...tokens, glass: flatGlass, neroGlass: undefined, glow: panelGlow }
        : { ...tokens, glow: panelGlow };

      // Concrete shadows for panel (dark side)
      if (isNoGlass && darkBase.materialMode === "concrete") {
        panelTokens.shadow = {
          sm: "0 1px 4px rgba(0,0,0,0.25)",
          md: "0 2px 10px rgba(0,0,0,0.30)",
          lg: "0 4px 20px rgba(0,0,0,0.35)",
          xl: "0 8px 40px rgba(0,0,0,0.40)",
          glow: "0 2px 12px rgba(0,0,0,0.25)",
          glowAccent: `0 0 8px ${darkBase.accent || "#8A7E70"}18`,
          glowPurple: `0 0 8px ${darkBase.accent || "#8A7E70"}18`,
        };
      }

      const panel = { ...darkBase, T: panelTokens, isDark: true };
      const lightT = isNoGlass
        ? {
            ...tokens,
            shadow: tokens.shadowLight || tokens.shadow,
            glass: flatGlass,
            glassLight: flatGlass,
            glow: mainGlow,
          }
        : {
            ...tokens,
            shadow: tokens.shadowLight || tokens.shadow,
            glass: tokens.glassLight || tokens.glass,
            glow: mainGlow,
          };

      // Concrete shadows for light side — softer, diffused
      if (isNoGlass && darkBase.materialMode === "concrete") {
        lightT.shadow = {
          sm: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)",
          md: "0 2px 8px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)",
          lg: "0 4px 16px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)",
          xl: "0 8px 32px rgba(0,0,0,0.14), 0 0 0 0.5px rgba(0,0,0,0.04)",
          glow: "0 2px 8px rgba(0,0,0,0.08)",
          glowAccent: `0 0 6px ${darkBase.accent || "#8A7E70"}10`,
          glowPurple: `0 0 6px ${darkBase.accent || "#8A7E70"}10`,
        };
      }

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
        glassBg: "rgba(255,255,255,0.12)",
        glassBorder: "rgba(255,255,255,0.16)",
        glassBgDark: "rgba(10,10,22,0.55)",
      };
      const darkGlow = buildGlow(colors.accent);
      const darkTokens = { ...tokens, glow: darkGlow };
      return { ...colors, T: darkTokens, isDark: true, panel: { ...colors, T: darkTokens, isDark: true } };
    }

    // Light Liquid Glass: Clarity Clean (variant 1) + light glass/shadow tokens
    const lightVariant = palette.variants?.[1] || {};
    const mainColors = { ...darkBase, ...lightVariant };

    // Panel uses dark base
    const panelGlowLegacy = buildGlow(darkBase.accent);
    const panel = { ...darkBase, T: { ...tokens, glow: panelGlowLegacy }, isDark: true };

    // Swap to light glass/shadow tokens
    const mainGlowLegacy = buildGlow(mainColors.accent || darkBase.accent);
    const lightT = {
      ...tokens,
      shadow: tokens.shadowLight || tokens.shadow,
      glass: tokens.glassLight || tokens.glass,
      glow: mainGlowLegacy,
    };

    return { ...mainColors, T: lightT, isDark: false, panel };
  }, [selectedPalette, density]);

  // ── noGlass: comprehensive clean-theme stylesheet injected into document.head ──
  // Instead of patching 72+ components individually, this stylesheet overrides ALL
  // glass-related inline styles at once using !important. It's a complete visual
  // replacement: no blur, no translucency, no specular shadows — just solid flat surfaces.
  useEffect(() => {
    const STYLE_ID = "no-glass-override";
    if (value.noGlass) {
      document.documentElement.setAttribute("data-no-glass", "");
      // Determine colors from theme context
      const bg = value.bg || "#F5F5F7";
      const shellBg = value.bgGradient || bg; // app shell uses bgGradient (grey field) if set
      const bg1 = value.bg1 || "#FFFFFF";
      const border = value.border || "#D1D1D6";
      const text = value.text || "#1D1D1F";
      const isDark = value.isDark;

      const existing = document.getElementById(STYLE_ID);
      if (existing) existing.remove(); // Always recreate (colors may change)

      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        /* ═══ CLEAN THEME — built from scratch, not patched ═══ */

        /* 1. Kill ALL blur/glass effects globally */
        html[data-no-glass] *,
        html[data-no-glass] *::before,
        html[data-no-glass] *::after {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* 2. App shell — solid flat background (uses bgGradient for themes with grey field) */
        html[data-no-glass] .app-shell {
          background: ${shellBg} !important;
        }

        /* 3. Cards/panels — solid opaque surfaces with clean borders */
        html[data-no-glass] .kpi-card,
        html[data-no-glass] .widget-card {
          background: ${bg1} !important;
          border: 1px solid ${border} !important;
          box-shadow: 0 1px 3px ${isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)"} !important;
        }

        /* 4. Light mode: force all translucent white backgrounds to opaque */
        ${
          !isDark
            ? `
        html[data-no-glass].theme-light .scroll-edge-soft {
          background: ${bg1} !important;
          border-bottom-color: ${border} !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important;
        }
        `
            : ""
        }

        /* 5. Dark mode noGlass: darken translucent surfaces */
        ${
          isDark
            ? `
        html[data-no-glass].theme-dark .scroll-edge-soft {
          background: ${bg1} !important;
          border-bottom-color: ${border} !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
        }
        `
            : ""
        }

        /* 6. Remove glass refraction SVG filter effects */
        html[data-no-glass] .glass-refract {
          filter: none !important;
        }

        /* 7. Widget grid placeholder — solid instead of glass */
        html[data-no-glass] .react-grid-placeholder {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          background: ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"} !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      document.documentElement.removeAttribute("data-no-glass");
      document.getElementById(STYLE_ID)?.remove();
    }
    return () => {
      document.documentElement.removeAttribute("data-no-glass");
      document.getElementById(STYLE_ID)?.remove();
    };
  }, [value.noGlass, value.bg, value.bgGradient, value.bg1, value.border, value.text, value.isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
