import { useTheme } from '@/hooks/useTheme';

export default function Sec({ title, children, compact, noPad }) {
  const C = useTheme();
  const T = C.T;

  // Liquid Glass: both modes use translucent glass with specular highlights
  const glassBg = C.glassBg || (C.isDark ? 'rgba(15,15,30,0.38)' : 'rgba(255,255,255,0.32)');

  const lightShadow = [
    T.glass.specularLg || 'inset 0 2px 0 rgba(255,255,255,1), inset 0 0 20px rgba(255,255,255,0.45)',
    T.shadow.md,
    T.glass.edge || '0 0 0 1px rgba(255,255,255,0.30)',
  ].join(', ');

  const darkShadow = [
    T.glass.specularLg || 'inset 0 2px 0 rgba(255,255,255,0.20), inset 0 0 20px rgba(255,255,255,0.06)',
    T.shadow.md,
    T.glass.edge || '0 0 0 1px rgba(255,255,255,0.08)',
  ].join(', ');

  return (
    <div style={{
      marginBottom: compact ? T.space[3] : T.space[6],
      padding: noPad ? 0 : (compact ? T.space[3] : T.space[4]),
      background: C.isDark
        ? glassBg
        : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${glassBg}`,
      backdropFilter: T.glass.blur,
      WebkitBackdropFilter: T.glass.blur,
      borderRadius: T.radius.md,
      border: `1px solid ${T.glass.border || (C.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)')}`,
      boxShadow: C.isDark ? darkShadow : lightShadow,
    }}>
      <h3 style={{
        fontSize: T.fontSize.xs,
        fontWeight: T.fontWeight.bold,
        textTransform: "uppercase",
        letterSpacing: T.tracking.caps,
        marginBottom: T.space[3],
        padding: noPad ? `0 ${T.space[4]}px` : 0,
        paddingTop: noPad ? T.space[3] : 0,
        ...(C.isDark && C.gradient
          ? {
              background: C.gradient,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }
          : { color: C.accent }),
      }}>{title}</h3>
      {children}
    </div>
  );
}
