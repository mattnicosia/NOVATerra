import { useTheme } from '@/hooks/useTheme';

export default function Fld({ label, children, style }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: C.textDim, marginBottom: T.space[1], textTransform: "uppercase", letterSpacing: T.tracking.wide }}>{label}</label>
      {children}
    </div>
  );
}
