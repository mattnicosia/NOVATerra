import { useTheme } from '@/hooks/useTheme';

/**
 * LogoPill — renders a logo image with theme-aware background treatment.
 *
 * Dark mode:  semi-transparent white bg + subtle border (logo pops)
 * Light mode: barely-visible gray bg (neutral, non-distracting)
 *
 * Props:
 *   src        - data URL or image URL
 *   maxHeight  - max height in px (default 28)
 *   maxWidth   - max width in px (default 44)
 *   fallback   - React node to render when src is falsy (optional)
 *   style      - additional style overrides for the outer container
 */
export default function LogoPill({ src, maxHeight = 28, maxWidth = 44, fallback, style }) {
  const C = useTheme();
  const dk = C.isDark;

  if (!src) return fallback || null;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: dk ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
      border: dk ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.04)',
      borderRadius: 6,
      padding: 4,
      flexShrink: 0,
      ...style,
    }}>
      <img
        src={src}
        alt=""
        style={{
          maxHeight,
          maxWidth,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}
