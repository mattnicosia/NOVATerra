import { useTheme } from "@/hooks/useTheme";

export default function Modal({ children, onClose, wide, extraWide, width: customWidth }) {
  const C = useTheme();
  const T = C.T;
  const width = customWidth || (extraWide ? 960 : wide ? 580 : 480);
  const isNero = C.neroMode;

  // ── Nero: LG-tier black glass panel, NO carbon texture ──
  const ng = T.neroGlass?.lg || {};

  const modalShadow = isNero
    ? [ng.specular, ng.specularBottom, ng.innerDepth, ng.shadow, ng.edge].filter(Boolean).join(", ")
    : [
        T.glass.specularLg,
        T.shadow.xl,
        C.isDark ? "0 0 80px rgba(0,0,0,0.40)" : "0 0 80px rgba(20,30,80,0.18)",
        T.glass.edge,
      ]
        .filter(Boolean)
        .join(", ");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: isNero ? "rgba(0,0,0,0.70)" : C.isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.18)",
        backdropFilter: isNero
          ? "blur(24px) saturate(160%)"
          : C.isDark
            ? "blur(16px) saturate(150%)"
            : "blur(20px) saturate(150%)",
        WebkitBackdropFilter: isNero
          ? "blur(24px) saturate(160%)"
          : C.isDark
            ? "blur(16px) saturate(150%)"
            : "blur(20px) saturate(150%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: T.z.modal,
        animation: "backdropFadeIn 250ms ease-out both",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isNero
            ? ng.bg || "rgba(255,255,255,0.10)"
            : C.isDark
              ? C.glassBgDark || "rgba(10,10,22,0.58)"
              : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${C.glassBgDark || "rgba(255,255,255,0.52)"}`,
          backdropFilter: isNero ? ng.blur || "blur(24px) saturate(160%)" : T.glass.blur,
          WebkitBackdropFilter: isNero ? ng.blur || "blur(24px) saturate(160%)" : T.glass.blur,
          border: `1px solid ${isNero ? ng.border || "rgba(255,255,255,0.14)" : T.glass.border || (C.isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.55)")}`,
          borderRadius: T.radius.lg,
          padding: T.space[7],
          width,
          maxWidth: "95vw",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: modalShadow,
          animation: "modalEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
          transition: isNero ? T.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)" : "width 200ms ease-out",
        }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
