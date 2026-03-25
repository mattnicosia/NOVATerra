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
    const palette = PALETTES[0];
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
      const _text = value.text || "#1D1D1F";
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

  // ── Stitch mode: animated conic-gradient borders on cards + widgets ──
  useEffect(() => {
    const STITCH_STYLE_ID = "stitch-gradient-borders";
    if (value.stitchMode) {
      document.documentElement.setAttribute("data-stitch", "");
      const existing = document.getElementById(STITCH_STYLE_ID);
      if (existing) existing.remove();

      const style = document.createElement("style");
      style.id = STITCH_STYLE_ID;
      style.textContent = `
        /* ═══ STITCH — Click-to-Activate Gradient Borders ═══
           Gradient borders activate on click only (not always-on).
           Original Stitch palette: cyan → violet → blue. */

        @property --stitch-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes stitch-rotate {
          to { --stitch-angle: 360deg; }
        }

        /* ── Global radius bump ── */
        html[data-stitch] .widget-card,
        html[data-stitch] .kpi-card {
          border-radius: 16px !important;
        }

        /* ── Default state: quiet 1px border, no animation ── */
        html[data-stitch] .widget-card {
          position: relative;
          border: 1px solid rgba(255,255,255,0.06) !important;
          background: ${value.bg1 || "#1E1F25"} !important;
          overflow: visible;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        /* ::before exists but invisible by default */
        html[data-stitch] .widget-card::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: conic-gradient(
            from var(--stitch-angle),
            #00E5FF,
            #7C4DFF,
            #2979FF,
            #00E5FF
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        /* ── Active state: gradient border rotates, then fades out ── */
        html[data-stitch] .widget-card.stitch-active {
          border-color: transparent !important;
          box-shadow:
            0 0 15px rgba(0,229,255,0.08),
            0 0 30px rgba(124,77,255,0.05),
            0 4px 16px rgba(0,0,0,0.3) !important;
        }

        html[data-stitch] .widget-card.stitch-active::before {
          opacity: 1;
          animation: stitch-rotate 4s linear 1;
        }

        /* KPI cards — same pattern */
        html[data-stitch] .kpi-card {
          position: relative;
          border: 1px solid rgba(255,255,255,0.06) !important;
          background: ${value.bg1 || "#1E1F25"} !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        html[data-stitch] .kpi-card::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--stitch-angle),
            rgba(0,229,255,0.5),
            rgba(124,77,255,0.5),
            rgba(41,121,255,0.5),
            rgba(0,229,255,0.5)
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        html[data-stitch] .kpi-card.stitch-active {
          border-color: transparent !important;
        }

        html[data-stitch] .kpi-card.stitch-active::before {
          opacity: 1;
          animation: stitch-rotate 4s linear 1;
        }

        /* Input fields — rounded containers */
        html[data-stitch] input,
        html[data-stitch] select,
        html[data-stitch] textarea {
          border-radius: 12px !important;
        }

        /* Nav active state — cyan underline */
        html[data-stitch] .nav-link-active {
          border-bottom-color: #00E5FF !important;
        }

        /* Hovered cards — subtle lift */
        html[data-stitch] .widget-card:hover {
          border-color: rgba(255,255,255,0.10) !important;
          box-shadow:
            0 4px 16px rgba(0,0,0,0.3),
            0 0 8px rgba(0,229,255,0.04) !important;
        }

        /* ── Estimate division groups — same click-to-activate pattern ── */
        html[data-stitch] .est-division-group {
          position: relative;
          border: 1px solid rgba(255,255,255,0.06) !important;
          border-radius: 12px !important;
          background: ${value.bg1 || "#1E1F25"} !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        html[data-stitch] .est-division-group::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--stitch-angle),
            #00E5FF,
            #7C4DFF,
            #2979FF,
            #00E5FF
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        html[data-stitch] .est-division-group.stitch-active {
          border-color: transparent !important;
        }

        html[data-stitch] .est-division-group.stitch-active::before {
          opacity: 1;
          animation: stitch-rotate 4s linear 1;
        }

        /* Estimate rows — subtle cyan tint on hover */
        html[data-stitch] .est-row:hover {
          background: rgba(0,229,255,0.03) !important;
        }

        /* ── Noise grain — boosted film grain texture for Stitch theme ── */
        html[data-stitch] .noise-grain-overlay {
          opacity: 0.65 !important;
        }

        /* ── Header — match card surface, not void ── */
        html[data-stitch] header {
          background: #1E1F25 !important;
          border-bottom-color: rgba(255,255,255,0.06) !important;
        }
      `;
      document.head.appendChild(style);

      // ── Click-to-activate: toggle stitch-active on cards ──
      const STITCH_TARGETS = ".widget-card, .kpi-card, .est-division-group";
      const onClick = (e) => {
        const card = e.target.closest(STITCH_TARGETS);
        if (!card || card.classList.contains("stitch-active")) return;
        card.classList.add("stitch-active");
        // Remove after one full rotation via animationend on ::before
        const pseudo = card.querySelector(":scope > *") || card;
        const onEnd = () => {
          card.classList.remove("stitch-active");
          card.removeEventListener("animationend", onEnd);
        };
        card.addEventListener("animationend", onEnd);
        // Fallback timeout in case animationend doesn't fire (::before)
        setTimeout(() => card.classList.remove("stitch-active"), 5500);
      };
      document.addEventListener("click", onClick, true);

      // Store ref for cleanup
      style._stitchClickHandler = onClick;
    } else {
      document.documentElement.removeAttribute("data-stitch");
      const oldStyle = document.getElementById(STITCH_STYLE_ID);
      if (oldStyle?._stitchClickHandler) {
        document.removeEventListener("click", oldStyle._stitchClickHandler, true);
      }
      oldStyle?.remove();
    }
    return () => {
      document.documentElement.removeAttribute("data-stitch");
      const oldStyle = document.getElementById(STITCH_STYLE_ID);
      if (oldStyle?._stitchClickHandler) {
        document.removeEventListener("click", oldStyle._stitchClickHandler, true);
      }
      oldStyle?.remove();
    };
  }, [value.stitchMode, value.bg1]);

  // ── Aurora mode: animated conic-gradient borders (emerald → teal → purple) ──
  useEffect(() => {
    const AURORA_STYLE_ID = "aurora-gradient-borders";
    if (value.auroraMode) {
      document.documentElement.setAttribute("data-aurora", "");
      const existing = document.getElementById(AURORA_STYLE_ID);
      if (existing) existing.remove();

      const style = document.createElement("style");
      style.id = AURORA_STYLE_ID;
      style.textContent = `
        /* ═══ AURORA — Click-to-Activate Gradient Borders ═══
           Northern Lights: purple → violet → teal. 6s rotation.
           Purple-dominant, enterprise-forward. */

        @property --aurora-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes aurora-rotate {
          to { --aurora-angle: 360deg; }
        }

        /* ── Global radius bump ── */
        html[data-aurora] .widget-card,
        html[data-aurora] .kpi-card {
          border-radius: 16px !important;
        }

        /* ── Widgets: deep black, subtle grey border, above grain layer ── */
        html[data-aurora] .widget-card {
          position: relative;
          z-index: 12;
          border: 1px solid rgba(255,255,255,0.12) !important;
          background: #0A0A0F !important;
          overflow: visible;
          box-shadow: none !important;
          transition: border-color 0.3s, box-shadow 0.3s;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* ::before exists but invisible by default */
        html[data-aurora] .widget-card::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: conic-gradient(
            from var(--aurora-angle),
            #A855F7,
            #7C3AED,
            #06B6D4,
            #7C3AED,
            #A855F7
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        /* ── Active state: gradient border rotates, then fades out ── */
        html[data-aurora] .widget-card.aurora-active {
          border-color: transparent !important;
          box-shadow:
            0 0 15px rgba(168,85,247,0.10),
            0 0 30px rgba(124,58,237,0.06),
            0 4px 16px rgba(0,0,0,0.3) !important;
        }

        html[data-aurora] .widget-card.aurora-active::before {
          opacity: 1;
          animation: aurora-rotate 6s linear 1;
        }

        /* KPI cards — deep black, subtle grey border, above grain */
        html[data-aurora] .kpi-card {
          position: relative;
          z-index: 12;
          border: 1px solid rgba(255,255,255,0.12) !important;
          background: #0A0A0F !important;
          box-shadow: none !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        html[data-aurora] .kpi-card::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--aurora-angle),
            rgba(168,85,247,0.5),
            rgba(6,182,212,0.5),
            rgba(139,92,246,0.5),
            rgba(6,182,212,0.5),
            rgba(168,85,247,0.5)
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        html[data-aurora] .kpi-card.aurora-active {
          border-color: transparent !important;
        }

        html[data-aurora] .kpi-card.aurora-active::before {
          opacity: 1;
          animation: aurora-rotate 6s linear 1;
        }

        /* Input fields — rounded containers */
        html[data-aurora] input,
        html[data-aurora] select,
        html[data-aurora] textarea {
          border-radius: 12px !important;
        }

        /* Nav active state — emerald underline */
        html[data-aurora] .nav-link-active {
          border-bottom-color: #10B981 !important;
        }

        /* Hovered cards — subtle lift */
        html[data-aurora] .widget-card:hover {
          border-color: rgba(255,255,255,0.10) !important;
          box-shadow:
            0 4px 16px rgba(0,0,0,0.3),
            0 0 8px rgba(168,85,247,0.04) !important;
        }

        /* ── Estimate division groups ── */
        html[data-aurora] .est-division-group {
          position: relative;
          border: 1px solid rgba(255,255,255,0.06) !important;
          border-radius: 12px !important;
          background: ${value.bg1 || "#1E1F25"} !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        html[data-aurora] .est-division-group::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--aurora-angle),
            #A855F7,
            #7C3AED,
            #06B6D4,
            #7C3AED,
            #A855F7
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0;
          animation: none;
          pointer-events: none;
          z-index: 0;
          transition: opacity 1.2s ease-out;
        }

        html[data-aurora] .est-division-group.aurora-active {
          border-color: transparent !important;
        }

        html[data-aurora] .est-division-group.aurora-active::before {
          opacity: 1;
          animation: aurora-rotate 6s linear 1;
        }

        /* Estimate rows — subtle emerald tint on hover */
        html[data-aurora] .est-row:hover {
          background: rgba(168,85,247,0.03) !important;
        }

        /* ── Carbon fiber texture on background ── */
        html[data-aurora] .noise-grain-overlay {
          opacity: 0.55 !important;
          z-index: 10 !important;
          mix-blend-mode: normal !important;
        }

        /* ── Header — deep black like widgets ── */
        html[data-aurora] header {
          background: #0A0A0F !important;
          border-bottom-color: rgba(255,255,255,0.10) !important;
        }
      `;
      document.head.appendChild(style);

      // ── Click-to-activate: toggle aurora-active on cards ──
      const AURORA_TARGETS = ".widget-card, .kpi-card, .est-division-group";
      const onClick = (e) => {
        const card = e.target.closest(AURORA_TARGETS);
        if (!card || card.classList.contains("aurora-active")) return;
        card.classList.add("aurora-active");
        const onEnd = () => {
          card.classList.remove("aurora-active");
          card.removeEventListener("animationend", onEnd);
        };
        card.addEventListener("animationend", onEnd);
        // Fallback: 6s rotation + 1.2s fade + buffer
        setTimeout(() => card.classList.remove("aurora-active"), 7500);
      };
      document.addEventListener("click", onClick, true);
      style._auroraClickHandler = onClick;
    } else {
      document.documentElement.removeAttribute("data-aurora");
      const oldStyle = document.getElementById(AURORA_STYLE_ID);
      if (oldStyle?._auroraClickHandler) {
        document.removeEventListener("click", oldStyle._auroraClickHandler, true);
      }
      oldStyle?.remove();
    }
    return () => {
      document.documentElement.removeAttribute("data-aurora");
      const oldStyle = document.getElementById(AURORA_STYLE_ID);
      if (oldStyle?._auroraClickHandler) {
        document.removeEventListener("click", oldStyle._auroraClickHandler, true);
      }
      oldStyle?.remove();
    };
  }, [value.auroraMode, value.bg1]);

  // ── Command mode: Epichust-inspired dark steel command center ──
  useEffect(() => {
    const COMMAND_STYLE_ID = "command-theme-styles";
    if (value.commandMode) {
      document.documentElement.setAttribute("data-command", "");
      const existing = document.getElementById(COMMAND_STYLE_ID);
      if (existing) return;
      const style = document.createElement("style");
      style.id = COMMAND_STYLE_ID;
      style.textContent = `
        /* ═══ COMMAND — Dark Steel Command Center ═══ */

        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800&family=Barlow:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

        /* ── Global typography ── */
        html[data-command] body,
        html[data-command] input,
        html[data-command] select,
        html[data-command] textarea,
        html[data-command] button {
          font-family: 'Barlow', -apple-system, sans-serif !important;
        }

        /* ── Section headers — Barlow Condensed, accent-colored ── */
        html[data-command] .widget-card [style*="letterSpacing"],
        html[data-command] .widget-card [style*="textTransform"] {
          font-family: 'Barlow Condensed', 'Barlow', sans-serif !important;
          color: rgba(0,212,170,0.6) !important;
          font-weight: 600 !important;
          font-size: 10px !important;
          letter-spacing: 0.12em !important;
        }

        /* ── Numbers and metrics — IBM Plex Mono ── */
        html[data-command] .widget-card [style*="fontSize: 2"],
        html[data-command] .widget-card [style*="fontSize: 3"],
        html[data-command] .widget-card [style*="fontWeight: 700"],
        html[data-command] .widget-card [style*="fontWeight: 800"] {
          font-family: 'IBM Plex Mono', monospace !important;
          font-variant-numeric: tabular-nums !important;
        }

        /* ── Widget cards — sharp, accent-topped ── */
        html[data-command] .widget-card {
          border-radius: 4px !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
          background: #1A1D25 !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          border-top: 2px solid #00D4AA !important;
          transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1) !important;
        }

        /* ── Category accent lines ── */
        html[data-command] .widget-card:nth-child(6n+1) { border-top-color: #00D4AA !important; }
        html[data-command] .widget-card:nth-child(6n+2) { border-top-color: #4DA6FF !important; }
        html[data-command] .widget-card:nth-child(6n+3) { border-top-color: #FF8C00 !important; }
        html[data-command] .widget-card:nth-child(6n+4) { border-top-color: #A855F7 !important; }
        html[data-command] .widget-card:nth-child(6n+5) { border-top-color: #FFB020 !important; }
        html[data-command] .widget-card:nth-child(6n+6) { border-top-color: #00BCD4 !important; }

        /* ── Hover — physical lift ── */
        html[data-command] .widget-card:hover {
          transform: translateY(-2px) !important;
          border-color: rgba(255,255,255,0.12) !important;
          border-top-width: 2px !important;
        }

        /* ── Staggered entrance animation ── */
        @keyframes commandEnter {
          from { opacity: 0; transform: translateY(12px); filter: blur(3px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0px); }
        }
        html[data-command] .widget-card {
          animation: commandEnter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        html[data-command] .widget-card:nth-child(1) { animation-delay: 0.04s; }
        html[data-command] .widget-card:nth-child(2) { animation-delay: 0.08s; }
        html[data-command] .widget-card:nth-child(3) { animation-delay: 0.12s; }
        html[data-command] .widget-card:nth-child(4) { animation-delay: 0.16s; }
        html[data-command] .widget-card:nth-child(5) { animation-delay: 0.20s; }
        html[data-command] .widget-card:nth-child(6) { animation-delay: 0.24s; }
        html[data-command] .widget-card:nth-child(7) { animation-delay: 0.28s; }
        html[data-command] .widget-card:nth-child(8) { animation-delay: 0.32s; }
        html[data-command] .widget-card:nth-child(9) { animation-delay: 0.36s; }
        html[data-command] .widget-card:nth-child(10) { animation-delay: 0.40s; }

        /* ── Nav bar — condensed industrial ── */
        html[data-command] nav a,
        html[data-command] [data-interactive] {
          font-family: 'Barlow Condensed', sans-serif !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.08em !important;
        }

        /* ── Inputs — sharp, precise ── */
        html[data-command] input,
        html[data-command] select,
        html[data-command] textarea {
          border-radius: 2px !important;
        }
        html[data-command] input:focus,
        html[data-command] select:focus,
        html[data-command] textarea:focus {
          border-color: #00D4AA !important;
          box-shadow: 0 0 0 2px rgba(0,212,170,0.12) !important;
        }

        /* ── Scrollbar — minimal ── */
        html[data-command] ::-webkit-scrollbar { width: 5px; }
        html[data-command] ::-webkit-scrollbar-track { background: transparent; }
        html[data-command] ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        html[data-command] ::-webkit-scrollbar-thumb:hover { background: #00D4AA; }

        /* ── Status badge colors ── */
        html[data-command] [style*="background"][style*="rgb(16, 185, 129)"],
        html[data-command] [style*="background-color"][style*="#10B981"] {
          background: #00D4AA !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      document.documentElement.removeAttribute("data-command");
      document.getElementById(COMMAND_STYLE_ID)?.remove();
    }
    return () => {
      document.documentElement.removeAttribute("data-command");
      document.getElementById(COMMAND_STYLE_ID)?.remove();
    };
  }, [value.commandMode]);

  // ── Signal mode: gradient depth cards, bold metrics, mixed styles ──
  useEffect(() => {
    const SIGNAL_STYLE_ID = "signal-theme-styles";
    if (value.signalMode) {
      document.documentElement.setAttribute("data-signal", "");
      const existing = document.getElementById(SIGNAL_STYLE_ID);
      if (existing) return;
      const style = document.createElement("style");
      style.id = SIGNAL_STYLE_ID;
      style.textContent = `
        /* ═══ SIGNAL — Figma Year Wrapped Depth Cards ═══ */

        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        /* ── Global font ── */
        html[data-signal] * {
          font-family: 'Inter', -apple-system, sans-serif !important;
          -webkit-font-smoothing: antialiased;
        }

        /* ── Page background — deep dark, not pure black ── */
        html[data-signal] body {
          background: #0C0C10 !important;
        }

        /* ── Widget cards — the core transformation ── */
        html[data-signal] .widget-card {
          border-radius: 24px !important;
          background: linear-gradient(180deg, #1A1A20 0%, #141418 100%) !important;
          border: 1px solid rgba(255,255,255,0.04) !important;
          box-shadow: 0 2px 16px rgba(0,0,0,0.3) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          padding: 32px !important;
          transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1) !important;
          overflow: hidden !important;
        }

        /* ── Hover — border catches light + lifts off page ── */
        html[data-signal] .widget-card:hover {
          border-color: rgba(255,255,255,0.15) !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) !important;
          transform: translateY(-2px) !important;
        }

        /* ── HEADER BAR — dark steel, clean ── */
        html[data-signal] header,
        html[data-signal] [class*="NovaHeader"],
        html[data-signal] [class*="header"] {
          background: #0C0C10 !important;
          border-bottom: 1px solid rgba(255,255,255,0.04) !important;
        }

        /* ── Widget inner wrappers — remove any inner padding conflicts ── */
        html[data-signal] .widget-card > div:first-child {
          padding: 0 !important;
        }

        /* ── Section labels (PROJECTS, INBOX, BENCHMARKS etc) ── */
        html[data-signal] .widget-card [style*="letterSpacing"],
        html[data-signal] .widget-card [style*="letter-spacing"] {
          color: rgba(255,255,255,0.35) !important;
          font-weight: 600 !important;
          font-size: 11px !important;
          letter-spacing: 0.14em !important;
        }

        /* ── Primary accent color — magenta/purple for hero numbers ── */
        html[data-signal] .widget-card [style*="gradient"] {
          background: linear-gradient(135deg, #D946EF, #A855F7) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
        }

        /* ── Trend badges — dark pill, green text ── */
        html[data-signal] .widget-card [style*="background"][style*="border-radius"] > span,
        html[data-signal] .widget-card [style*="background"][style*="borderRadius"] > span {
          font-family: 'Inter', sans-serif !important;
          font-size: 12px !important;
          font-weight: 600 !important;
        }

        /* ── Status badges (BIDDING, WON, etc) — pill shape ── */
        html[data-signal] .widget-card [style*="borderRadius: 99"],
        html[data-signal] .widget-card [style*="border-radius: 99"],
        html[data-signal] .widget-card [style*="borderRadius: 12"],
        html[data-signal] .widget-card [style*="border-radius: 12"] {
          border-radius: 20px !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          letter-spacing: 0.06em !important;
          padding: 3px 10px !important;
        }

        /* ── Inputs — deeply rounded, dark fill ── */
        html[data-signal] input,
        html[data-signal] select,
        html[data-signal] textarea {
          border-radius: 14px !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          background: #111114 !important;
          padding: 10px 16px !important;
        }
        html[data-signal] input:focus,
        html[data-signal] select:focus,
        html[data-signal] textarea:focus {
          border-color: #D946EF !important;
          box-shadow: 0 0 0 3px rgba(217,70,239,0.1) !important;
        }

        /* ── Buttons — pill shape ── */
        html[data-signal] button[style*="background"] {
          border-radius: 14px !important;
          font-weight: 600 !important;
          letter-spacing: 0.02em !important;
        }

        /* ── Scrollbar — invisible until hover ── */
        html[data-signal] ::-webkit-scrollbar { width: 3px; }
        html[data-signal] ::-webkit-scrollbar-track { background: transparent; }
        html[data-signal] ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); border-radius: 3px; }
        html[data-signal] ::-webkit-scrollbar-thumb:hover { background: rgba(217,70,239,0.2); }

        /* ── Staggered entrance — blur dissolve + lift ── */
        @keyframes signalEnter {
          from { opacity: 0; transform: translateY(20px) scale(0.96); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
        }
        html[data-signal] .widget-card {
          animation: signalEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        html[data-signal] .widget-card:nth-child(1) { animation-delay: 0.04s; }
        html[data-signal] .widget-card:nth-child(2) { animation-delay: 0.08s; }
        html[data-signal] .widget-card:nth-child(3) { animation-delay: 0.12s; }
        html[data-signal] .widget-card:nth-child(4) { animation-delay: 0.16s; }
        html[data-signal] .widget-card:nth-child(5) { animation-delay: 0.20s; }
        html[data-signal] .widget-card:nth-child(6) { animation-delay: 0.24s; }
        html[data-signal] .widget-card:nth-child(7) { animation-delay: 0.28s; }
        html[data-signal] .widget-card:nth-child(8) { animation-delay: 0.32s; }
        html[data-signal] .widget-card:nth-child(9) { animation-delay: 0.36s; }
        html[data-signal] .widget-card:nth-child(10) { animation-delay: 0.40s; }

        /* ── Nav items ── */
        html[data-signal] nav a {
          font-weight: 500 !important;
          font-size: 12px !important;
          letter-spacing: 0.01em !important;
        }

        /* ── Remove glass/blur from EVERYTHING ── */
        html[data-signal] [style*="backdrop-filter"],
        html[data-signal] [style*="backdropFilter"] {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* ── Sidebar — match depth ── */
        html[data-signal] aside,
        html[data-signal] [class*="sidebar"],
        html[data-signal] [class*="Sidebar"] {
          background: #0A0A0E !important;
          border-right: 1px solid rgba(255,255,255,0.04) !important;
        }

        /* ── Tables/lists — clean row separation ── */
        html[data-signal] .est-row:hover {
          background: rgba(217,70,239,0.04) !important;
        }

        /* ── Active nav indicator ── */
        html[data-signal] .active,
        html[data-signal] [class*="active"] {
          background: rgba(217,70,239,0.08) !important;
        }
      `;
      document.head.appendChild(style);
    } else {
      document.documentElement.removeAttribute("data-signal");
      document.getElementById(SIGNAL_STYLE_ID)?.remove();
    }
    return () => {
      document.documentElement.removeAttribute("data-signal");
      document.getElementById(SIGNAL_STYLE_ID)?.remove();
    };
  }, [value.signalMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
