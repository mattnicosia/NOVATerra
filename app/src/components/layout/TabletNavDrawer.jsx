/**
 * TabletNavDrawer — Slide-in navigation drawer for tablet breakpoint.
 * Renders NAV_ITEMS vertically with 44px touch targets.
 */
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { slidePanelTransition } from "@/utils/motion";

export default function TabletNavDrawer({ isOpen, onClose, navItems, isManager, hasOrg }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim backdrop */}
          <motion.div
            key="drawer-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9998,
              background: "rgba(0,0,0,0.5)",
            }}
          />

          {/* Drawer panel */}
          <motion.nav
            key="drawer-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={slidePanelTransition}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: 240,
              zIndex: 9999,
              background: dk ? "rgba(15,15,25,0.95)" : "rgba(255,255,255,0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRight: `1px solid ${C.border}`,
              padding: `${T.space[4]}px 0`,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div style={{ padding: `0 ${T.space[4]}px ${T.space[3]}px`, borderBottom: `1px solid ${C.border}10` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Navigation
              </div>
            </div>

            {/* Nav items */}
            {navItems
              .filter(item => !item.managerOnly || isManager || !hasOrg)
              .map(item => (
                <NavLink
                  key={item.key}
                  to={item.path}
                  end={item.path === "/"}
                  onClick={onClose}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                    minHeight: 44,
                    textDecoration: "none",
                    color: isActive ? C.text : C.textMuted,
                    background: isActive ? (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
                    borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent",
                    transition: "all 150ms ease-out",
                  })}
                >
                  <span style={{ width: 18, height: 18, flexShrink: 0, color: "inherit" }}>
                    {item.icon}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.02em" }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: C.accent, marginLeft: "auto",
                    }} />
                  )}
                </NavLink>
              ))}
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
