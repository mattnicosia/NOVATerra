// BLDG Omni wordmark logo — matches the bldg brand family style
// "bldg" in heavy weight, "omni" in lighter weight, clean sans-serif

import { useTheme } from '@/hooks/useTheme';

export default function BldgOmniLogo({ size = 16, color, showOmni = true }) {
  const C = useTheme();
  const textColor = color || C.text;
  const accentColor = C.accent;

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: size * 0.25,
      userSelect: "none",
      lineHeight: 1,
    }}>
      <span style={{
        fontSize: size,
        fontWeight: 900,
        letterSpacing: "0.06em",
        color: textColor,
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
        textTransform: "lowercase",
      }}>
        bldg
      </span>
      {showOmni && (
        <span style={{
          fontSize: size * 0.85,
          fontWeight: 400,
          letterSpacing: "0.12em",
          color: accentColor,
          fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
          textTransform: "lowercase",
        }}>
          omni
        </span>
      )}
    </span>
  );
}
