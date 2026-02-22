import { useTheme } from '@/hooks/useTheme';

export default function Pill({ label, value, accent }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: T.space[2],
      padding: "5px 12px", borderRadius: T.radius.full,
      background: accent ? (C.gradient || C.accent) : (C.glassBg || C.bg2),
      backdropFilter: accent ? undefined : T.glass.blurLight,
      WebkitBackdropFilter: accent ? undefined : T.glass.blurLight,
      border: accent ? "none" : `1px solid ${C.glassBorder || C.border}`,
      transition: T.transition.fast,
      boxShadow: accent ? `0 0 12px ${C.accent}25` : "none",
    }}>
      <span style={{
        color: accent ? "rgba(255,255,255,0.8)" : C.textDim,
        fontSize: T.fontSize.xs,
      }}>{label}</span>
      <span style={{
        fontFamily: "'DM Mono',monospace",
        fontWeight: T.fontWeight.semibold,
        fontSize: T.fontSize.sm,
        color: accent ? "#fff" : C.text,
      }}>{value}</span>
    </div>
  );
}
