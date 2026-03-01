import { useTheme } from '@/hooks/useTheme';

export default function Modal({ children, onClose, wide, extraWide }) {
  const C = useTheme();
  const T = C.T;
  const width = extraWide ? 960 : wide ? 580 : 480;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: T.z.modal,
      animation: "backdropFadeIn 250ms ease-out both",
    }} onClick={onClose}>
      <div style={{
        background: C.glassBgDark || C.glassBg || 'rgba(18,21,28,0.75)',
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.08)'}`,
        borderRadius: T.radius.lg,
        padding: T.space[7],
        width, maxWidth: "95vw", maxHeight: "88vh",
        overflowY: "auto",
        boxShadow: `${T.shadow.xl}, 0 0 40px rgba(0,0,0,0.25)`,
        animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        transition: "width 200ms ease-out",
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
