import { createContext, useContext, useMemo } from 'react';
import { C_DEFAULT, PALETTES } from '@/constants/palettes';
import { useUiStore } from '@/stores/uiStore';
import { T, buildTokens } from '@/utils/designTokens';

const ThemeContext = createContext({ ...C_DEFAULT, T, isDark: false });

export function ThemeProvider({ children }) {
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const density = useUiStore(s => s.appSettings?.density || "comfortable");

  const value = useMemo(() => {
    const tokens = buildTokens(density);

    // Simple dark/light toggle — Clarity palette is the base
    const isDarkMode = selectedPalette === 'dark';
    const palette = PALETTES.find(p => p.id === 'clarity') || PALETTES[0];
    const darkBase = { ...C_DEFAULT, ...(palette.overrides || {}) };

    if (isDarkMode) {
      // Dark Liquid Glass: Clarity dark base + dark glass tokens (with specular/lensing)
      // Override glass values to be translucent for dark Liquid Glass effect
      const colors = {
        ...darkBase,
        glassBg: 'rgba(255,255,255,0.04)',
        glassBorder: 'rgba(255,255,255,0.10)',
        glassBgDark: 'rgba(10,10,22,0.40)',
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

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
