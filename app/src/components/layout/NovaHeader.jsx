import { useRef, useEffect, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import NovaOrb from "@/components/dashboard/NovaOrb";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";
import { useNovaStore } from "@/stores/novaStore";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import NotificationCenter from "@/components/shared/NotificationCenter";
import LogoPill from "@/components/shared/LogoPill";

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
};

const NAV_ITEMS = [
  { key: "dashboard", path: "/", icon: NAV_ICONS.dashboard, label: "Dashboard" },
  { key: "projects", path: "/projects", icon: NAV_ICONS.projects, label: "Projects" },
  { key: "inbox", path: "/inbox", icon: NAV_ICONS.inbox, label: "Inbox", badge: true },
  { key: "core", path: "/core", icon: NAV_ICONS.core, label: "Core" },
  { key: "intelligence", path: "/intelligence", icon: NAV_ICONS.intelligence, label: "Intel" },
  { key: "people", path: "/contacts", icon: NAV_ICONS.people, label: "People" },
  { key: "settings", path: "/settings", icon: NAV_ICONS.settings, label: "Settings" },
];

/* ── Logo Portal — 28px NovaOrb with glow ring ── */
function LogoPortal({ isNova, accent }) {
  const novaStatus = useNovaStore(s => s.status);
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: isNova
          ? "0 0 12px rgba(139,92,246,0.3), 0 0 24px rgba(109,40,217,0.15)"
          : `0 0 8px ${accent}30, 0 0 16px ${accent}14`,
      }}
    >
      <NovaOrb size={28} scheme="nova" />
    </div>
  );
}

/* ── Profile Dropdown — user account menu ── */
function ProfileDropdown({ onClose }) {
  const C = useTheme();
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
    fontFamily: "'DM Sans', sans-serif",
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
          fontFamily: "'DM Sans', sans-serif",
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
  const ddDivider = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
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
    fontFamily: "'DM Sans', sans-serif",
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
          fontFamily: "'DM Sans', sans-serif",
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
export default function NovaHeader() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const location = useLocation();
  const inEstimate = location.pathname.startsWith("/estimate/");
  const user = useAuthStore(s => s.user);
  const setAiChatOpen = useUiStore(s => s.setAiChatOpen);
  const aiChatOpen = useUiStore(s => s.aiChatOpen);
  const toggleCmdPalette = useCommandPaletteStore(s => s.toggle);
  const notifications = useNovaStore(s => s.notifications);
  const unreadCount = notifications.filter(n => !n.read).length;
  const novaStatus = useNovaStore(s => s.status);
  const novaActivity = useNovaStore(s => s.activity);
  const novaTask = useNovaStore(s => s.activeTask);
  const selectedPalette = useUiStore(s => s.appSettings.selectedPalette);
  const updateSetting = useUiStore(s => s.updateSetting);
  const activeTheme = selectedPalette === "nero" ? "nero" : selectedPalette === "dark" ? "dark" : "light";
  const isNova = false; // NOVA theme temporarily removed
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);

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

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : "MC";

  /* ── Header-specific derived colors ── */

  // Header — Apple Liquid Glass: nearly transparent bar, thin specular, no heavy shadow
  // Nero Nemesis: carbon fiber weave + neutral glass + thin bottom edge
  const isNero = C.neroMode;
  const hBg = isNero
    ? `${C.carbonTexture || ""}, linear-gradient(180deg, rgba(6,6,14,0.90) 0%, rgba(6,6,14,0.80) 100%)`.replace(
        /^, /,
        "",
      )
    : dk
      ? `linear-gradient(180deg, rgba(15,15,30,0.40) 0%, rgba(15,15,30,0.20) 100%)`
      : `linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)`;
  const hShadow = isNero
    ? ["inset 0 -1px 0 rgba(255,255,255,0.06)", "0 1px 12px rgba(0,0,0,0.40)"].join(", ")
    : [T.glass.specularLg, T.glass.edge, dk ? "0 1px 12px rgba(0,0,0,0.15)" : "0 1px 8px rgba(20,30,80,0.03)"].join(
        ", ",
      );
  const hBorderB = isNero ? "rgba(255,255,255,0.06)" : T.glass.borderLight;

  // Overlays — white-alpha on dark, black-alpha on light
  const ov = (darkA, lightA) => (dk ? `rgba(255,255,255,${darkA})` : `rgba(0,0,0,${lightA})`);

  // Nav colors
  const navActive = dk ? "#FFFFFF" : C.text;
  const navInactive = C.textMuted;
  const navHover = dk ? "rgba(238,237,245,0.85)" : C.text;

  // Button colors (search pill, AI chat, notifications)
  const btnDim = C.textDim;
  const btnHover = dk ? "rgba(238,237,245,0.82)" : C.text;

  // Accent
  const accent = C.accent;
  const accentDim = C.accentDim;

  // Logo
  const logoText = dk ? "rgba(238,237,245,0.9)" : C.text;
  const logoV = isNova ? "#A78BFA" : accent;

  // Toggle
  const tglActive = dk ? "#FFFFFF" : C.text;
  const tglInactive = dk ? "rgba(238,237,245,0.28)" : "rgba(0,0,0,0.25)";
  const tglHover = dk ? "rgba(238,237,245,0.60)" : "rgba(0,0,0,0.55)";

  return (
    <header
      style={{
        height: T.dashboard.headerHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        background: hBg,
        boxShadow: hShadow,
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        borderBottom: `1px solid ${hBorderB}`,
        fontFamily: T.font.display,
        zIndex: 100,
        flexShrink: 0,
        animation: "fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.25s both",
      }}
    >
      {/* Left — Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <NovaTerraLogo size={68} />
      </div>

      {/* Center — Navigation: active tab = Liquid Glass pill */}
      <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/"}
            data-interactive
            style={({ isActive }) => ({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 20px",
              borderRadius: 12,
              cursor: "pointer",
              position: "relative",
              transition: "all 0.25s ease",
              textDecoration: "none",
              color: isActive ? navActive : navInactive,
              // Active = Apple Liquid Glass pill — subtle, ghost-like
              background: isActive ? (dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)") : "transparent",
              border: `0.5px solid ${
                isActive ? (dk ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.30)") : "transparent"
              }`,
              boxShadow: isActive ? [T.glass.specularSm, T.glass.edge].join(", ") : "none",
              backdropFilter: isActive
                ? dk
                  ? "blur(12px) saturate(150%)"
                  : "blur(12px) saturate(170%) brightness(1.04)"
                : "none",
              WebkitBackdropFilter: isActive
                ? dk
                  ? "blur(12px) saturate(150%)"
                  : "blur(12px) saturate(170%) brightness(1.04)"
                : "none",
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.classList.contains("active")) {
                e.currentTarget.style.background = dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)";
                e.currentTarget.style.borderColor = dk ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.18)";
              }
            }}
            onMouseLeave={e => {
              if (!e.currentTarget.classList.contains("active")) {
                e.currentTarget.style.background = "";
                e.currentTarget.style.borderColor = "";
              }
            }}
          >
            {({ isActive }) => (
              <>
                <div style={{ width: 17, height: 17, flexShrink: 0 }}>{item.icon}</div>
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
                {item.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 12,
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: accent,
                      boxShadow: `0 0 6px ${accent}CC`,
                    }}
                  />
                )}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 24,
                      height: 1.5,
                      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                      boxShadow: `0 0 10px ${accent}`,
                    }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Right — Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
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
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {novaActivity}
            </span>
            {novaTask?.progress > 0 && (
              <span style={{ fontSize: 9, color: `${accent}80`, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
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
            fontFamily: "'Outfit', 'DM Sans', sans-serif",
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
              fontFamily: "'DM Sans', sans-serif",
              marginLeft: 2,
            }}
          >
            {"\u2318"}K
          </kbd>
        </button>

        {/* AI Chat */}
        <button
          data-interactive
          onClick={() => setAiChatOpen(!aiChatOpen)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: aiChatOpen ? `${accent}18` : "transparent",
            border: aiChatOpen ? `1px solid ${accent}33` : "1px solid transparent",
            cursor: "pointer",
            color: aiChatOpen ? accent : btnDim,
            transition: "all 0.18s ease",
          }}
          onMouseEnter={e => {
            if (!aiChatOpen) {
              e.currentTarget.style.color = btnHover;
              e.currentTarget.style.background = ov(0.05, 0.03);
              e.currentTarget.style.borderColor = ov(0.07, 0.04);
            }
          }}
          onMouseLeave={e => {
            if (!aiChatOpen) {
              e.currentTarget.style.color = btnDim;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }
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
            <path d="M12 2l2.09 6.26L20 10l-4.69 3.98L16.91 20 12 16.27 7.09 20l1.6-6.02L4 10l5.91-1.74L12 2z" />
          </svg>
        </button>

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
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </div>
          )}
        </button>

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
                fontFamily: "'DM Sans', sans-serif",
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

        {/* Theme Toggle — Light / Dark / Nero */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            padding: 2,
            marginLeft: 2,
            borderRadius: 7,
            background: ov(0.03, 0.03),
            border: `1px solid ${ov(0.04, 0.04)}`,
          }}
        >
          {[
            {
              key: "light",
              palette: "light",
              title: "Light",
              icon: (
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <circle cx="8" cy="8" r="2.8" />
                  <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M4 4l1 1M11 11l1 1M4 12l1-1M11 5l1-1" />
                </svg>
              ),
            },
            {
              key: "dark",
              palette: "dark",
              title: "Dark",
              icon: (
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.6 9.8A6 6 0 116.2 2.4a4.5 4.5 0 007.4 7.4z" />
                </svg>
              ),
            },
            {
              key: "nero",
              palette: "nero",
              title: "Nero Nemesis",
              icon: (
                <svg
                  width={11}
                  height={11}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7L8 1z" />
                </svg>
              ),
            },
          ].map(t => (
            <button
              key={t.key}
              data-interactive
              title={t.title}
              onClick={() => updateSetting("selectedPalette", t.palette)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  activeTheme === t.key ? (t.key === "nero" ? "rgba(124,58,237,0.20)" : ov(0.1, 0.08)) : "transparent",
                color: activeTheme === t.key ? (t.key === "nero" ? "#B366FF" : tglActive) : tglInactive,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                if (activeTheme !== t.key) {
                  e.currentTarget.style.color = t.key === "nero" ? "#B366FF" : tglHover;
                  e.currentTarget.style.background = t.key === "nero" ? "rgba(124,58,237,0.10)" : ov(0.05, 0.04);
                }
              }}
              onMouseLeave={e => {
                if (activeTheme !== t.key) {
                  e.currentTarget.style.color = tglInactive;
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {t.icon}
            </button>
          ))}
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
