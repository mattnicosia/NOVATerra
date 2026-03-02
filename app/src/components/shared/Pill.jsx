import { useTheme } from '@/hooks/useTheme';

export default function Pill({ label, value, accent }) {
  const C = useTheme();
  const T = C.T;
  // Apple Liquid Glass: small element → specularSm + hairline edge only (no drop shadow)
  const pillShadow = accent
    ? `inset 0 0.5px 0 rgba(255,255,255,0.20), 0 0 10px ${C.accent}25`
    : [
        T.glass.specularSm,
        T.glass.edge,
      ].join(', ');
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: T.space[2],
      padding: "5px 12px", borderRadius: T.radius.full,
      background: accent ? (C.gradient || C.accent) : (C.glassBg || (C.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)')),
      backdropFilter: accent ? undefined : T.glass.blurLight,
      WebkitBackdropFilter: accent ? undefined : T.glass.blurLight,
      border: accent ? "none" : `0.5px solid ${T.glass.border || (C.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.25)')}`,
      transition: T.transition.fast,
      boxShadow: pillShadow,
    }}>
      <span style={{
        color: accent ? "rgba(255,255,255,0.8)" : C.textDim,
        fontSize: T.fontSize.xs,
      }}>{label}</span>
      <span style={{
        fontFamily: "'DM Sans',sans-serif",
        fontWeight: T.fontWeight.semibold,
        fontSize: T.fontSize.sm,
        color: accent ? "#fff" : C.text,
      }}>{value}</span>
    </div>
  );
}
