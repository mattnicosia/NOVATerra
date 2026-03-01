import { useTheme } from '@/hooks/useTheme';

export default function Sec({ title, children, compact }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={{
      marginBottom: compact ? T.space[3] : T.space[7],
      padding: compact ? T.space[4] : T.space[5],
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur,
      WebkitBackdropFilter: T.glass.blur,
      borderRadius: T.radius.md,
      border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`,
      boxShadow: T.shadow.sm,
    }}>
      <h3 style={{
        fontSize: T.fontSize.xs,
        fontWeight: T.fontWeight.semibold,
        textTransform: "uppercase",
        letterSpacing: T.tracking.caps,
        marginBottom: T.space[3],
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
