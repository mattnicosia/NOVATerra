import { useTheme } from '@/hooks/useTheme';

export default function Modal({ children, onClose, wide, extraWide }) {
  const C = useTheme();
  const T = C.T;
  const width = extraWide ? 960 : wide ? 580 : 480;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.60)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: T.z.modal }} onClick={onClose}>
      <div style={{ background: C.glassBgDark || C.glassBg || 'rgba(18,21,28,0.75)', backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur, border: `1px solid ${C.glassBorder || 'rgba(255,255,255,0.06)'}`, borderRadius: T.radius.lg, padding: T.space[7], width, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto", boxShadow: T.shadow.xl, animation: "scaleIn 0.2s ease-out", transition: "width 200ms ease-out" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
