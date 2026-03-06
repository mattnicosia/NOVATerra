import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { sectionLabel } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { BT_BRAND, BT_TEASERS } from "@/constants/btBrand";
import LockedFeatureModal from "./LockedFeatureModal";

// Lock icon path (not in global icons — inline SVG path)
const LOCK_PATH = "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z M7 11V7a5 5 0 0110 0v4";

// Brain icon path for assessment
const BRAIN_PATH =
  "M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z M9 21h6";

// Chart/bar icon for results
const CHART_PATH = "M18 20V10 M12 20V4 M6 20v-6";

// Active assessment nav items
const ASSESSMENT_NAV = [
  { key: "assessment", path: "/assessment", icon: BRAIN_PATH, label: "Assessment" },
  { key: "profile", path: "/bt/profile", icon: I.user, label: "My Profile" },
  { key: "results", path: "/bt/results", icon: CHART_PATH, label: "Results" },
];

// Locked NOVATerra nav items (mapped from BT_TEASERS)
const LOCKED_NAV = [
  { key: "dashboard", teaser: BT_TEASERS.dashboard },
  { key: "inbox", teaser: BT_TEASERS.inbox },
  { key: "core", teaser: BT_TEASERS.core },
  { key: "intelligence", teaser: BT_TEASERS.intelligence },
  { key: "contacts", teaser: BT_TEASERS.contacts },
  { key: "settings", teaser: BT_TEASERS.settings },
];

// Map teaser icon keys to icon path data
const TEASER_ICON_MAP = {
  dashboard: I.dashboard,
  inbox: I.inbox,
  database: I.database,
  insights: I.insights,
  people: I.user,
  settings: I.settings,
};

export default function CandidateSidebar({ activePath }) {
  const C = useTheme();
  const P = C.panel || C; // Use dark panel theme like main sidebar
  const T = C.T;
  const navigate = useNavigate();
  const [lockedModal, setLockedModal] = useState(null);

  const isActive = path => {
    if (path === "/assessment") return activePath === "/assessment" || activePath?.startsWith("/assessment");
    return activePath === path;
  };

  const navItemStyle = active => ({
    display: "flex",
    alignItems: "center",
    gap: T.space[3],
    padding: "10px 14px",
    borderRadius: T.radius.sm,
    cursor: "pointer",
    textDecoration: "none",
    fontSize: T.fontSize.base,
    fontWeight: T.fontWeight.medium,
    fontFamily: "'DM Sans', sans-serif",
    color: active ? P.accent : P.textMuted,
    background: active ? P.accentBg : "transparent",
    transition: "background 180ms ease-out, color 180ms ease-out",
    position: "relative",
  });

  const lockedItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: T.space[3],
    padding: "10px 14px",
    borderRadius: T.radius.sm,
    cursor: "pointer",
    fontSize: T.fontSize.base,
    fontWeight: T.fontWeight.medium,
    fontFamily: "'DM Sans', sans-serif",
    color: P.textMuted,
    opacity: 0.4,
    transition: "opacity 180ms ease-out",
  };

  const activeIndicator = {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 3,
    background: P.gradient || `linear-gradient(180deg, ${P.accent}, ${P.accentAlt || P.accent})`,
    borderRadius: "0 3px 3px 0",
    boxShadow: `0 0 10px ${P.accent}50`,
  };

  const divider = {
    height: 1,
    background: P.border,
    margin: `${T.space[3]}px ${T.space[4]}px`,
  };

  return (
    <>
      <div
        style={{
          width: 240,
          minWidth: 240,
          height: "100%",
          background: C.neroMode ? `${C.carbonTexture || ""}, ${P.bg}`.replace(/^, /, "") : P.bg,
          borderRight: `1px solid ${C.neroMode ? "rgba(255,255,255,0.06)" : P.border}`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Logo area */}
        <div
          style={{
            padding: `${T.space[5]}px ${T.space[5]}px ${T.space[3]}px`,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: T.fontSize.lg,
              fontWeight: T.fontWeight.bold,
              fontFamily: "'DM Sans', sans-serif",
              color: P.text,
              letterSpacing: T.tracking.wide,
            }}
          >
            {BT_BRAND.name}
          </div>
          <div
            style={{
              fontSize: T.fontSize.xs,
              fontFamily: "'DM Sans', sans-serif",
              color: P.textDim,
              letterSpacing: T.tracking.wider,
            }}
          >
            {BT_BRAND.poweredBy}
          </div>
        </div>

        <div style={divider} />

        {/* Assessment section */}
        <div style={{ padding: `0 ${T.space[3]}px` }}>
          <div
            style={{
              ...sectionLabel(P),
              padding: `${T.space[1]}px ${T.space[2]}px ${T.space[3]}px`,
            }}
          >
            Assessment
          </div>
          {ASSESSMENT_NAV.map((item, i) => {
            const active = isActive(item.path);
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.path)}
                style={{
                  ...navItemStyle(active),
                  animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${i * 35}ms both`,
                }}
              >
                {active && <div style={activeIndicator} />}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    filter: active ? `drop-shadow(0 0 4px ${P.accent}50)` : "none",
                    transition: "filter 200ms ease-out",
                  }}
                >
                  <Ic d={item.icon} size={18} color={active ? P.accent : P.textMuted} />
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        <div style={divider} />

        {/* NOVATerra locked section */}
        <div style={{ padding: `0 ${T.space[3]}px` }}>
          <div
            style={{
              ...sectionLabel(P),
              padding: `${T.space[1]}px ${T.space[2]}px ${T.space[3]}px`,
            }}
          >
            NOVATerra
          </div>
          {LOCKED_NAV.map((item, i) => (
            <div
              key={item.key}
              onClick={() => setLockedModal(item.teaser)}
              style={{
                ...lockedItemStyle,
                animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${(i + 3) * 35}ms both`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = "0.6";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = "0.4";
              }}
            >
              <Ic d={TEASER_ICON_MAP[item.teaser.icon] || I.eye} size={18} color={P.textMuted} />
              <span style={{ flex: 1 }}>{item.teaser.title}</span>
              <Ic d={LOCK_PATH} size={12} color={P.textDim} sw={2} />
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />
      </div>

      {/* Locked feature modal */}
      <LockedFeatureModal isOpen={!!lockedModal} onClose={() => setLockedModal(null)} feature={lockedModal} />
    </>
  );
}
