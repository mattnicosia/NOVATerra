import { useRef, useEffect, useState, useCallback, memo } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useResponsive } from "@/hooks/useResponsive";
import TabletNavDrawer from "@/components/layout/TabletNavDrawer";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";
import { useNovaStore } from "@/stores/novaStore";
import NotificationCenter from "@/components/shared/NotificationCenter";
import LogoPill from "@/components/shared/LogoPill";
import { useAutoResponseStore } from "@/stores/autoResponseStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { COLORS, SPACING, MOTION } from "@/constants/designTokens";

/* ── Nav icon SVGs ── */
const NAV_ICONS = {
  dashboard: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  ),
  inbox: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 10l2.5-6.5a1 1 0 01.93-.5h7.14a1 1 0 01.93.5L15 10v3a1 1 0 01-1 1H2a1 1 0 01-1-1v-3z" />
      <path d="M1 10h3.5l1 2h5l1-2H15" />
    </svg>
  ),
  core: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="1" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
    </svg>
  ),
  database: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="8" cy="4" rx="6" ry="2" />
      <path d="M2 4v4c0 1.1 2.7 2 6 2s6-.9 6-2V4" />
      <path d="M2 8v4c0 1.1 2.7 2 6 2s6-.9 6-2V8" />
    </svg>
  ),
  people: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 8.5c1.7.2 3 1.5 3 3.5" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  ),
  projects: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M5.5 3V2a1 1 0 011-1h3a1 1 0 011 1v1" />
      <path d="M1.5 7h13" />
    </svg>
  ),
  intelligence: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12l3-4 3 2 3-5 3 4" />
      <path d="M2 14h12" />
      <path d="M14 2v10" />
    </svg>
  ),
  business: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 14V6l6-4 6 4v8" />
      <rect x="5.5" y="9" width="5" height="5" rx="0.5" />
      <path d="M8 9v5" />
      <path d="M5.5 11.5h5" />
    </svg>
  ),
  resources: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="3" x2="10" y2="3" />
      <line x1="1" y1="6.5" x2="14" y2="6.5" />
      <line x1="4" y1="10" x2="12" y2="10" />
      <line x1="1" y1="13" x2="8" y2="13" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { key: "dashboard", path: "/", icon: NAV_ICONS.dashboard, label: "Dashboard" },
  { key: "projects", path: "/projects", icon: NAV_ICONS.projects, label: "Projects" },
  { key: "inbox", path: "/inbox", icon: NAV_ICONS.inbox, label: "Inbox", badge: true },
  { key: "core", path: "/core", icon: NAV_ICONS.core, label: "Core" },
  // { key: "intelligence", path: "/intelligence", icon: NAV_ICONS.intelligence, label: "Intel" }, // temporarily removed
  { key: "resources", path: "/resources", icon: NAV_ICONS.resources, label: "Resources" },
  // { key: "business", path: "/business", icon: NAV_ICONS.business, label: "Business", managerOnly: true }, // Hidden for MVP
  { key: "people", path: "/contacts", icon: NAV_ICONS.people, label: "People" },
  { key: "settings", path: "/settings", icon: NAV_ICONS.settings, label: "Settings" },
];

/* ── Logo Portal — 28px video orb with glow ring ── */
function _LogoPortal({ isNova, accent }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: isNova
          ? "0 0 12px rgba(200,50,50,0.3), 0 0 24px rgba(92,26,26,0.15)"
          : `0 0 8px ${accent}30, 0 0 16px ${accent}14`,
      }}
    >
      <video
        src="/nova-orb.mp4"
        poster="/nova-orb-poster.png"
        autoPlay
        loop
        muted
        playsInline
        style={{
          width: "130%",
          height: "130%",
          objectFit: "cover",
          display: "block",
          marginLeft: "-15%",
          marginTop: "-15%",
        }}
      />
    </div>
  );
}

/* ── Profile Dropdown — user account menu ── */
function ProfileDropdown({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const isNeroDd = C.neroMode;
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const dropdownRef = useRef(null);

  // ── Nero: MD-tier black glass dropdown — NO carbon texture ──
  const ngMd = C.T?.neroGlass?.md || {};
  const ddBg = isNeroDd
    ? ngMd.bg || "rgba(255,255,255,0.08)"
    : dk
      ? `linear-gradient(145deg, ${C.bg2}F2 0%, ${C.bg1}EB 100%)`
      : "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(250,250,252,0.96) 100%)";
  const ddBorder = isNeroDd
    ? ngMd.border || "rgba(255,255,255,0.12)"
    : dk
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.08)";
  const ddShadow = isNeroDd
    ? [ngMd.specular, ngMd.specularBottom, ngMd.innerDepth, ngMd.shadow, ngMd.edge].filter(Boolean).join(", ")
    : dk
      ? "0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)"
      : "0 8px 32px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.06)";
  const ddBlur = isNeroDd ? ngMd.blur || "blur(16px) saturate(150%)" : "blur(32px)";
  const ddDivider = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const ddHover = isNeroDd ? "rgba(255,255,255,0.06)" : dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const ddTextDim = dk ? "rgba(238,237,245,0.45)" : "rgba(0,0,0,0.40)";
  const ddTextMuted = dk ? "rgba(238,237,245,0.65)" : "rgba(0,0,0,0.55)";
  const ddIconMuted = dk ? "rgba(238,237,245,0.5)" : "rgba(0,0,0,0.40)";

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const itemStyle = () => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.15s",
    background: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: T.font.sans,
  });

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 8,
        width: 200,
        padding: "8px 6px",
        background: ddBg,
        backdropFilter: ddBlur,
        WebkitBackdropFilter: ddBlur,
        border: `1px solid ${ddBorder}`,
        borderRadius: 12,
        boxShadow: ddShadow,
        zIndex: 200,
        animation: "fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both",
        transition: isNeroDd ? C.T?.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
      }}
    >
      {/* User email */}
      <div
        style={{
          padding: "6px 12px 10px",
          fontSize: 10,
          fontWeight: 400,
          color: ddTextDim,
          letterSpacing: "0.03em",
          fontFamily: T.font.sans,
          borderBottom: `1px solid ${ddDivider}`,
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {user?.email || "user@example.com"}
      </div>

      {/* Settings */}
      <div
        onClick={() => {
          navigate("/settings");
          onClose();
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = ddHover;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
        }}
        style={itemStyle()}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 16 16"
          fill="none"
          stroke={ddIconMuted}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 400, color: ddTextMuted }}>Settings</span>
      </div>

      {/* Sign Out */}
      <div
        onClick={() => {
          signOut();
          onClose();
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = `${C.red}0F`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
        }}
        style={itemStyle()}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 16 16"
          fill="none"
          stroke={`${C.red}B3`}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3" />
          <path d="M10 11l3-3-3-3" />
          <path d="M13 8H6" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 400, color: `${C.red}CC` }}>Sign Out</span>
      </div>
    </div>
  );
}

/* ── Company Profile Dropdown — shows all profiles for selection ── */
function CompanyDropdown({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const isNeroDd = C.neroMode;
  const ref = useRef(null);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const updateSetting = useUiStore(s => s.updateSetting);
  const masterData = useMasterDataStore(s => s.masterData);
  const companyInfo = masterData?.companyInfo || {};
  const companyProfiles = masterData?.companyProfiles || [];

  // ── Nero: MD-tier black glass dropdown — NO carbon texture ──
  const ngMd = C.T?.neroGlass?.md || {};
  const ddBg = isNeroDd
    ? ngMd.bg || "rgba(255,255,255,0.08)"
    : dk
      ? `linear-gradient(145deg, ${C.bg2}F2 0%, ${C.bg1}EB 100%)`
      : "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(250,250,252,0.96) 100%)";
  const ddBorder = isNeroDd
    ? ngMd.border || "rgba(255,255,255,0.12)"
    : dk
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.08)";
  const ddShadow = isNeroDd
    ? [ngMd.specular, ngMd.specularBottom, ngMd.innerDepth, ngMd.shadow, ngMd.edge].filter(Boolean).join(", ")
    : dk
      ? "0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)"
      : "0 8px 32px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.06)";
  const ddBlur = isNeroDd ? ngMd.blur || "blur(16px) saturate(150%)" : "blur(32px)";
  const ddHover = isNeroDd ? "rgba(255,255,255,0.06)" : dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  const ddText = dk ? "rgba(238,237,245,0.82)" : "rgba(0,0,0,0.78)";
  const ddTextDim = dk ? "rgba(238,237,245,0.45)" : "rgba(0,0,0,0.40)";

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function select(id) {
    updateSetting("activeCompanyId", id);
    onClose();
  }

  const itemStyle = isActive => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 0.15s",
    background: isActive ? `${C.accent}18` : "transparent",
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: T.font.sans,
  });

  const renderItem = (id, name, logo, isActive) => (
    <div
      key={id}
      onClick={() => select(id)}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = ddHover;
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
      style={itemStyle(isActive)}
    >
      {isActive && (
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: C.accent,
            boxShadow: `0 0 6px ${C.accent}99`,
            flexShrink: 0,
          }}
        />
      )}
      {logo ? (
        <LogoPill src={logo} maxHeight={20} maxWidth={28} style={{ padding: 2, borderRadius: 4 }} />
      ) : (
        <svg
          width={14}
          height={14}
          viewBox="0 0 16 16"
          fill="none"
          stroke={isActive ? C.accent : dk ? "rgba(238,237,245,0.4)" : "rgba(0,0,0,0.3)"}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 14V4a1 1 0 011-1h4a1 1 0 011 1v10" />
          <path d="M8 7h5a1 1 0 011 1v6" />
          <path d="M2 14h12" />
          <path d="M4.5 5.5h1M4.5 8h1M4.5 10.5h1M10 9.5h1M10 12h1" />
        </svg>
      )}
      <span
        style={{
          fontSize: 11,
          fontWeight: isActive ? 600 : 500,
          color: ddText,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 8,
        width: 220,
        padding: "8px 6px",
        background: ddBg,
        backdropFilter: ddBlur,
        WebkitBackdropFilter: ddBlur,
        border: `1px solid ${ddBorder}`,
        borderRadius: 12,
        boxShadow: ddShadow,
        zIndex: 200,
        animation: "fadeUp 0.2s cubic-bezier(0.16,1,0.3,1) both",
        transition: isNeroDd ? C.T?.neroGlass?.spring || "all 300ms cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
      }}
    >
      <div
        style={{
          padding: "4px 12px 8px",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: ddTextDim,
          fontFamily: T.font.sans,
        }}
      >
        Company Profile
      </div>

      {renderItem("__all__", "All Companies", null, activeCompanyId === "__all__")}
      {renderItem("", companyInfo.name || "Primary Company", companyInfo.logo, activeCompanyId === "")}
      {companyProfiles.map(p => renderItem(p.id, p.name || "Unnamed Profile", p.logo, activeCompanyId === p.id))}
    </div>
  );
}

/* ── NovaHeader ── */
function NovaHeader({ onDraftPanelToggle }) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const location = useLocation();
  const inEstimate = location.pathname.startsWith("/estimate/");
  const user = useAuthStore(s => s.user);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);
  const aiChatOpen = useUiStore(s => s.aiChatOpen);
  const toggleCmdPalette = useUiStore(s => s.cmdToggle);
  const notifications = useNovaStore(s => s.notifications);
  const unreadCount = notifications.filter(n => !n.read).length;
  const novaStatus = useNovaStore(s => s.status);
  const novaActivity = useNovaStore(s => s.activity);
  const novaTask = useNovaStore(s => s.activeTask);
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const activeTheme = ["aurora", "neutral", "linear"].includes(selectedPalette) ? selectedPalette : "nova";
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const isManager = useOrgStore(selectIsManager);
  const hasOrg = useOrgStore(s => !!s.org);
  const isNova = false; // NOVA theme temporarily removed
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const draftPendingCount = useAutoResponseStore(s => s.getPendingCount());
  const { isTablet } = useResponsive();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleDrawer = useCallback(() => setDrawerOpen(v => !v), []);

  // Company profile data
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const masterData = useMasterDataStore(s => s.masterData);
  const companyInfo = masterData?.companyInfo || {};
  const companyProfiles = masterData?.companyProfiles || [];
  const activeCompanyName =
    activeCompanyId === "__all__"
      ? "All Companies"
      : activeCompanyId
        ? companyProfiles.find(p => p.id === activeCompanyId)?.name || "Company"
        : companyInfo.name || "Primary";
  const activeCompanyLogo =
    activeCompanyId === "__all__"
      ? null
      : activeCompanyId
        ? companyProfiles.find(p => p.id === activeCompanyId)?.logo
        : companyInfo.logo;

  const initials = (() => {
    const name = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
    if (name) {
      const parts = name.trim().split(/\s+/);
      return (parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "");
    }
    return user?.email ? user.email.substring(0, 2).toUpperCase() : "MC";
  })();

  /* ── Header-specific derived colors ── */

  // Overlays — white-alpha on dark, black-alpha on light
  const ov = (darkA, lightA) => (dk ? `rgba(255,255,255,${darkA})` : `rgba(0,0,0,${lightA})`);

  // Button colors (search pill, AI chat, notifications)
  const btnDim = C.textDim;
  const btnHover = dk ? "rgba(238,237,245,0.82)" : C.text;

  // Accent
  const accent = C.accent;
  const accentDim = C.accentDim;

  // Toggle
  const tglActive = dk ? "#FFFFFF" : C.text;
  const tglInactive = dk ? "rgba(238,237,245,0.28)" : "rgba(0,0,0,0.25)";
  const tglHover = dk ? "rgba(238,237,245,0.60)" : "rgba(0,0,0,0.55)";

  return (
    <header
      style={{
        height: SPACING.header,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isTablet ? "0 14px" : "0 20px 0 12px",
        background: COLORS.bg.primary,
        boxShadow: "none",
        borderBottom: `1px solid ${COLORS.border.subtle}`,
        fontFamily: T.font.display,
        zIndex: 100,
        flexShrink: 0,
        animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.25s both",
      }}
    >
      {/* Left — NOVATerra wordmark */}
      <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
        <img
          src="/novaterra-wordmark.png"
          alt="NOVATerra"
          style={{ height: 66, width: "auto", opacity: 0.9, userSelect: "none" }}
          draggable={false}
        />
      </div>

      {/* Center — Navigation */}
      {isTablet && (
        <>
          <button
            onClick={toggleDrawer}
            data-tour="hamburger"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 44,
              minHeight: 44,
            }}
          >
            <svg viewBox="0 0 18 14" fill="none" stroke={C.text} strokeWidth="1.6" strokeLinecap="round" style={{ width: 18, height: 14 }}>
              <line x1="1" y1="2" x2="17" y2="2" />
              <line x1="1" y1="7" x2="17" y2="7" />
              <line x1="1" y1="12" x2="17" y2="12" />
            </svg>
          </button>
          <TabletNavDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            navItems={NAV_ITEMS}
            isManager={isManager}
            hasOrg={hasOrg}
          />
        </>
      )}
      {!isTablet && (
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
        {NAV_ITEMS.filter(item => !item.managerOnly || isManager || !hasOrg).map(item => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/"}
            data-interactive
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              padding: isTablet ? "6px 10px" : "6px 14px",
              borderRadius: 8,
              cursor: "pointer",
              position: "relative",
              transition: `color ${MOTION.normal} ease, background ${MOTION.normal} ease`,
              textDecoration: "none",
              color: isActive ? C.text : C.textMuted,
              background: isActive ? (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)") : "transparent",
              border: "none",
              boxShadow: "none",
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.classList.contains("active")) {
                e.currentTarget.style.color = C.text;
                e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
              }
            }}
            onMouseLeave={e => {
              if (!e.currentTarget.classList.contains("active")) {
                e.currentTarget.style.color = C.textMuted;
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {({ isActive }) => (
              <>
                {/* 2px left accent bar for active item */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "20%",
                      bottom: "20%",
                      width: 2,
                      borderRadius: 1,
                      background: C.text,
                      opacity: 0.5,
                    }}
                  />
                )}
                {!isTablet && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                    }}
                  >
                    {item.label}
                  </span>
                )}
                {item.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      right: isTablet ? 6 : 10,
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: C.accent,
                      boxShadow: `0 0 6px ${C.accent}44`,
                    }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      )}

      {/* Right — Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative", flex: 1, justifyContent: "flex-end" }}>
        {/* NOVA Processing Indicator — visible across all tabs when AI is working */}
        {novaStatus === "thinking" && novaActivity && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 8,
              background: `${accent}12`,
              border: `1px solid ${accent}25`,
              marginRight: 4,
              animation: "fadeIn 0.3s ease",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                border: `2px solid ${accent}40`,
                borderTop: `2px solid ${accent}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: accent,
                fontWeight: 500,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: T.font.sans,
              }}
            >
              {novaActivity}
            </span>
            {novaTask?.progress > 0 && (
              <span style={{ fontSize: 9, color: `${accent}80`, fontWeight: 600, fontFamily: T.font.sans }}>
                {novaTask.progress}%
              </span>
            )}
          </div>
        )}
        {/* Command Palette Pill */}
        <button
          data-interactive
          onClick={toggleCmdPalette}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px 5px 10px",
            borderRadius: 8,
            background: ov(0.04, 0.04),
            border: `1px solid ${ov(0.07, 0.06)}`,
            cursor: "pointer",
            color: btnDim,
            transition: "all 0.18s ease",
            fontFamily: T.font.sans,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = btnHover;
            e.currentTarget.style.background = ov(0.07, 0.06);
            e.currentTarget.style.borderColor = ov(0.12, 0.1);
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = btnDim;
            e.currentTarget.style.background = ov(0.04, 0.04);
            e.currentTarget.style.borderColor = ov(0.07, 0.06);
          }}
        >
          <svg
            width={13}
            height={13}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6.5" cy="6.5" r="4" />
            <path d="M10 10l3.5 3.5" />
          </svg>
          <span style={{ fontSize: 10.5, fontWeight: 400, letterSpacing: "0.02em" }}>Search</span>
          <kbd
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: dk ? "rgba(238,237,245,0.25)" : "rgba(0,0,0,0.30)",
              background: ov(0.06, 0.05),
              border: `1px solid ${ov(0.08, 0.08)}`,
              borderRadius: 4,
              padding: "1px 5px",
              fontFamily: T.font.sans,
              marginLeft: 2,
            }}
          >
            {"\u2318"}K
          </kbd>
        </button>

        {/* AI Chat button removed */}

        {/* Notifications */}
        <button
          data-interactive
          onClick={() => setNotificationsOpen(v => !v)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
            color: btnDim,
            transition: "all 0.18s ease",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = btnHover;
            e.currentTarget.style.background = ov(0.05, 0.03);
            e.currentTarget.style.borderColor = ov(0.07, 0.04);
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = btnDim;
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }}
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 1.5a4.5 4.5 0 014.5 4.5c0 2.5.5 4 1.5 5H2c1-1 1.5-2.5 1.5-5A4.5 4.5 0 018 1.5z" />
            <path d="M6.5 13.5a1.5 1.5 0 003 0" />
          </svg>
          {unreadCount > 0 && (
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: accent,
                boxShadow: `0 0 6px ${accent}CC`,
                border: `1.5px solid ${C.bg}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                color: "#fff",
                padding: "0 3px",
                fontFamily: T.font.sans,
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </button>

        {/* Auto-Response Drafts Badge */}
        {draftPendingCount > 0 && (
          <button
            data-interactive
            onClick={() => onDraftPanelToggle?.()}
            title={`${draftPendingCount} auto-response draft${draftPendingCount !== 1 ? "s" : ""} pending`}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid transparent",
              cursor: "pointer",
              color: btnDim,
              transition: "all 0.18s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = btnHover;
              e.currentTarget.style.background = ov(0.05, 0.03);
              e.currentTarget.style.borderColor = ov(0.07, 0.04);
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = btnDim;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <div
              style={{
                position: "absolute",
                top: 3,
                right: 2,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
                boxShadow: "0 0 6px rgba(124,92,252,0.7)",
                border: `1.5px solid ${C.bg}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                color: "#fff",
                padding: "0 3px",
                fontFamily: T.font.sans,
              }}
            >
              {draftPendingCount > 9 ? "9+" : draftPendingCount}
            </div>
          </button>
        )}

        {/* Company Profile Selector — hidden inside estimates (profile shown in sidebar) */}
        {!inEstimate && (
          <div style={{ position: "relative" }}>
            <button
              data-interactive
              onClick={() => setCompanyMenuOpen(v => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "4px 10px 4px 6px",
                borderRadius: 8,
                background: companyMenuOpen ? `${accent}18` : ov(0.04, 0.04),
                border: `1px solid ${companyMenuOpen ? `${accent}33` : ov(0.07, 0.06)}`,
                cursor: "pointer",
                color: companyMenuOpen ? accent : btnDim,
                transition: "all 0.18s ease",
                fontFamily: T.font.sans,
                maxWidth: 180,
              }}
              onMouseEnter={e => {
                if (!companyMenuOpen) {
                  e.currentTarget.style.color = btnHover;
                  e.currentTarget.style.background = ov(0.07, 0.06);
                  e.currentTarget.style.borderColor = ov(0.12, 0.1);
                }
              }}
              onMouseLeave={e => {
                if (!companyMenuOpen) {
                  e.currentTarget.style.color = btnDim;
                  e.currentTarget.style.background = ov(0.04, 0.04);
                  e.currentTarget.style.borderColor = ov(0.07, 0.06);
                }
              }}
            >
              {activeCompanyLogo ? (
                <LogoPill
                  src={activeCompanyLogo}
                  maxHeight={20}
                  maxWidth={28}
                  style={{ padding: 2, borderRadius: 4 }}
                />
              ) : (
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 14V4a1 1 0 011-1h4a1 1 0 011 1v10" />
                  <path d="M8 7h5a1 1 0 011 1v6" />
                  <path d="M2 14h12" />
                  <path d="M4.5 5.5h1M4.5 8h1M4.5 10.5h1M10 9.5h1M10 12h1" />
                </svg>
              )}
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeCompanyName}
              </span>
              <svg
                width={8}
                height={8}
                viewBox="0 0 8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, opacity: 0.6 }}
              >
                <path d="M2 3l2 2 2-2" />
              </svg>
            </button>

            {/* Company dropdown */}
            {companyMenuOpen && <CompanyDropdown onClose={() => setCompanyMenuOpen(false)} />}
          </div>
        )}

        {/* Sync status moved to bottom bar — see SyncStatusBar */}

        {/* Theme Switcher — Single button with dropdown */}
        <div style={{ position: "relative", marginLeft: 2 }}>
          <button
            data-interactive
            title="Switch Theme"
            onClick={() => setThemeMenuOpen(v => !v)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: `1px solid ${ov(0.06, 0.06)}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: themeMenuOpen ? ov(0.1, 0.08) : ov(0.03, 0.03),
              color: tglActive,
              transition: "all 0.15s",
            }}
          >
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 2a6 6 0 000 12" fill="currentColor" opacity="0.15" />
              <circle cx="8" cy="8" r="2" fill="currentColor" opacity="0.4" />
            </svg>
          </button>
          {themeMenuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={() => setThemeMenuOpen(false)} />
              <div style={{
                position: "absolute", top: 36, right: 0, zIndex: 1000,
                background: C.bg1 || "#0F0F12", border: `1px solid ${C.border}`,
                borderRadius: 10, padding: 6, minWidth: 130,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}>
                {[
                  { id: "nova", label: "NOVA" },
                  { id: "aurora", label: "Aurora" },
                  { id: "neutral", label: "Neutral" },
                  { id: "linear", label: "Linear" },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { updateSetting("selectedPalette", t.id); setThemeMenuOpen(false); }}
                    style={{
                      display: "block", width: "100%", padding: "7px 12px",
                      border: "none", borderRadius: 6, cursor: "pointer",
                      background: selectedPalette === t.id ? (accent + "20") : "transparent",
                      color: selectedPalette === t.id ? accent : (C.text || "#eee"),
                      fontSize: 12, fontWeight: selectedPalette === t.id ? 600 : 400,
                      textAlign: "left", transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { if (selectedPalette !== t.id) e.currentTarget.style.background = ov(0.05, 0.04); }}
                    onMouseLeave={e => { if (selectedPalette !== t.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 18, margin: "0 4px", background: ov(0.07, 0.07) }} />

        {/* Avatar + Dropdown */}
        <div style={{ position: "relative" }}>
          <div
            data-interactive
            onClick={() => setProfileMenuOpen(v => !v)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${accent} 0%, ${accentDim} 100%)`,
              border: `1px solid ${profileMenuOpen ? accent + "A6" : accent + "66"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "0.04em",
              cursor: "pointer",
              flexShrink: 0,
              boxShadow: profileMenuOpen ? `0 0 16px ${accentDim}66` : `0 0 10px ${accentDim}40`,
              transition: "all 0.18s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = accent + "A6";
              e.currentTarget.style.boxShadow = `0 0 16px ${accentDim}66`;
            }}
            onMouseLeave={e => {
              if (!profileMenuOpen) {
                e.currentTarget.style.borderColor = accent + "66";
                e.currentTarget.style.boxShadow = `0 0 10px ${accentDim}40`;
              }
            }}
          >
            {initials}
          </div>

          {profileMenuOpen && <ProfileDropdown onClose={() => setProfileMenuOpen(false)} />}
        </div>
      </div>
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </header>
  );
}

export default memo(NovaHeader);
