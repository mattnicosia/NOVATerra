import { useTheme } from '@/hooks/useTheme';

export default function Modal({ children, onClose, wide, extraWide, width: customWidth }) {
  const C = useTheme();
  const T = C.T;
  const width = customWidth || (extraWide ? 960 : wide ? 580 : 480);

  // Liquid Glass v2: large element → specularLg, slightly more opaque for readability
  const modalShadow = [
    T.glass.specularLg,
    T.shadow.xl,
    C.isDark ? '0 0 80px rgba(0,0,0,0.40)' : '0 0 80px rgba(20,30,80,0.18)',
    T.glass.edge,
  ].join(', ');

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.18)",
      backdropFilter: C.isDark ? "blur(16px) saturate(150%)" : "blur(20px) saturate(150%)",
      WebkitBackdropFilter: C.isDark ? "blur(16px) saturate(150%)" : "blur(20px) saturate(150%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: T.z.modal,
      animation: "backdropFadeIn 250ms ease-out both",
    }} onClick={onClose}>
      <div style={{
        background: C.isDark
          ? (C.glassBgDark || 'rgba(10,10,22,0.58)')
          : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${C.glassBgDark || 'rgba(255,255,255,0.52)'}`,
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${T.glass.border || (C.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)')}`,
        borderRadius: T.radius.lg,
        padding: T.space[7],
        width, maxWidth: "95vw", maxHeight: "88vh",
        overflowY: "auto",
        boxShadow: modalShadow,
        animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        transition: "width 200ms ease-out",
      }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
