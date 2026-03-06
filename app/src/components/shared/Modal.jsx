import { useTheme } from "@/hooks/useTheme";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, backdropTransition, modalVariants, modalTransition } from "@/utils/motion";

/**
 * Glass modal with Framer Motion entrance + exit animations.
 *
 * Usage (full exit animation — preferred):
 *   <Modal open={showModal} onClose={...}> ... </Modal>
 *
 * Legacy usage (entrance animation only — exit still instant):
 *   {showModal && <Modal onClose={...}> ... </Modal>}
 */
export default function Modal({ children, onClose, wide, extraWide, width: customWidth, open = true }) {
  const C = useTheme();
  const T = C.T;
  const width = customWidth || (extraWide ? 960 : wide ? 580 : 480);
  const isNero = C.neroMode;

  // Nero: LG-tier black glass panel
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
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={backdropVariants}
          transition={backdropTransition}
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
          }}
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            transition={modalTransition}
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
              transition: isNero ? T.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)" : "width 200ms ease-out",
            }}
            onClick={e => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
