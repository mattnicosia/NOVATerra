import { createContext, useContext, useMemo } from 'react';
import { C_DEFAULT, PALETTES, buildDarkPanel, findLightVariant } from '@/constants/palettes';
import { useUiStore } from '@/stores/uiStore';
import { T } from '@/utils/designTokens';

const ThemeContext = createContext({ ...C_DEFAULT, T, isDark: false });

export function ThemeProvider({ children }) {
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const customPalettes = useUiStore(s => s.appSettings.customPalettes);

  const value = useMemo(() => {
    const allPalettes = [...PALETTES, ...(customPalettes || [])];

    // Support "paletteId:variantIndex" format  (e.g. "mars:2")
    let palId = selectedPalette;
    let variantIdx = 0;
    if (palId && palId.includes(":")) {
      const parts = palId.split(":");
      palId = parts[0];
      variantIdx = parseInt(parts[1], 10) || 0;
    }

    const palette = allPalettes.find(p => p.id === palId);
    let colors = palette ? { ...C_DEFAULT, ...(palette.overrides || {}) } : { ...C_DEFAULT };

    // Apply variant overrides on top
    if (palette && palette.variants && variantIdx > 0 && palette.variants[variantIdx]) {
      colors = { ...colors, ...palette.variants[variantIdx] };
    }

    // Detect if resolved colors are dark
    const hex = colors.bg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    const isDark = (r * 0.299 + g * 0.587 + b * 0.114) < 128;

    // If forceDark is set, skip light-variant override — everything stays dark
    if (colors.forceDark) {
      // If a light variant was selected on a forceDark palette, revert surfaces to dark base
      if (!isDark) {
        const darkBase = palette ? { ...C_DEFAULT, ...(palette.overrides || {}) } : { ...C_DEFAULT };
        colors = { ...colors,
          bg: darkBase.bg, bg1: darkBase.bg1, bg2: darkBase.bg2, bg3: darkBase.bg3,
          text: darkBase.text, textMuted: darkBase.textMuted, textDim: darkBase.textDim,
          border: darkBase.border, borderLight: darkBase.borderLight,
          sidebarBg: darkBase.sidebarBg, glassBg: darkBase.glassBg,
          glassBorder: darkBase.glassBorder, glassBgDark: darkBase.glassBgDark,
          bgGradient: darkBase.bgGradient,
        };
      }
      return { ...colors, T, isDark: true, panel: { ...colors, T, isDark: true } };
    }

    // Force main = light, panel = dark (regardless of selected variant)
    let mainColors = colors;
    if (isDark) {
      // User selected a dark variant — find the palette's light variant for main
      const lightVariant = findLightVariant(palette);
      if (lightVariant) {
        mainColors = { ...colors, ...lightVariant };
      }
    }

    // Panel always uses palette's dark base
    const panelColors = buildDarkPanel(mainColors, palette);
    const panel = { ...panelColors, T, isDark: true };

    return { ...mainColors, T, isDark: false, panel };
  }, [selectedPalette, customPalettes]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
