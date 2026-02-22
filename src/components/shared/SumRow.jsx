import { useTheme } from '@/hooks/useTheme';

export default function SumRow({ label, value, bold, border, color }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: T.fontSize.base, padding: `${T.space[1]}px 0`,
      color: color || C.textMuted,
      ...(bold ? { fontWeight: T.fontWeight.semibold, color: color || C.text } : {}),
      ...(border ? { borderTop: `1px solid ${C.border}`, paddingTop: T.space[3], marginTop: T.space[2] } : {}),
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: "'DM Mono',monospace" }}>{value}</span>
    </div>
  );
}
