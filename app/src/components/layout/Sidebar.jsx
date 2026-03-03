import { NavLink } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import { useInboxStore } from '@/stores/inboxStore';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { supabase } from '@/utils/supabase';
import Ic from '@/components/shared/Ic';
import NovaTerraLogo from '@/components/shared/NovaTerraLogo';
import { I } from '@/constants/icons';
import { retryCloudSync } from '@/hooks/useCloudSync';

const globalNav = [
  { key: "dashboard", path: "/", icon: I.dashboard, label: "Dashboard" },
  { key: "inbox", path: "/inbox", icon: I.inbox, label: "Inbox" },
  { key: "core", path: "/core", icon: I.database, label: "NOVA Core" },
  { key: "intelligence", path: "/intelligence", icon: I.intelligence, label: "Intelligence" },
  { key: "contacts", path: "/contacts", icon: I.user, label: "People" },
  { key: "settings", path: "/settings", icon: I.settings, label: "Settings" },
];




export default function Sidebar() {
  const C = useTheme();
  const P = C.panel; // Dark panel theme for sidebar
  const T = C.T;
  const open = useUiStore(s => s.sidebarOpen);
  const toggle = useUiStore(s => s.toggleSidebar);
  const inboxCount = useInboxStore(s => s.unreadCount);
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const membership = useOrgStore(s => s.membership);
  const org = useOrgStore(s => s.org);
  // Hooks must be at top level — not inside conditionals or IIFEs
  const syncStatus = useUiStore(s => s.cloudSyncStatus);
  const syncLastAt = useUiStore(s => s.cloudSyncLastAt);
  const w = open ? T.sidebar.expanded : T.sidebar.collapsed;

  const linkStyle = (isActive) => ({
    display: "flex", alignItems: "center", gap: T.space[3],
    padding: open ? "12px 14px" : "12px 0",
    justifyContent: open ? "flex-start" : "center",
    borderRadius: T.radius.sm, cursor: "pointer",
    textDecoration: "none",
    fontSize: T.fontSize.base, fontWeight: T.fontWeight.medium,
    color: isActive ? P.accent : P.textMuted,
    background: isActive ? P.accentBg : "transparent",
    transition: "background 180ms ease-out, color 180ms ease-out",
    whiteSpace: "nowrap",
    overflow: "hidden",
    position: "relative",
  });

  // Gradient glow indicator for active links — animated entrance
  const activeIndicator = {
    position: "absolute",
    left: 0, top: 4, bottom: 4,
    width: 3,
    background: P.gradient || `linear-gradient(180deg, ${P.accent}, ${P.accentAlt || P.accent})`,
    borderRadius: "0 3px 3px 0",
    boxShadow: `0 0 10px ${P.accent}50`,
    animation: "sidebarIndicator 250ms cubic-bezier(0.16, 1, 0.3, 1) both",
  };

  // Cloud sync status (computed from hooks at top level)
  const statusColor = syncStatus === "synced" ? P.accent : syncStatus === "syncing" ? P.accent : syncStatus === "error" ? P.orange : P.textDim;
  const statusLabel = syncStatus === "synced" ? `Synced${syncLastAt ? ` ${syncLastAt}` : ""}` : syncStatus === "syncing" ? "Syncing..." : syncStatus === "error" ? "Tap to retry" : "Cloud sync";
  const isClickable = syncStatus === "error";

  return (
    <div data-tour="projects" style={{
      width: w, minWidth: w, height: "100vh",
      background: P.bg,
      borderRight: `1px solid ${P.border}`,
      display: "flex", flexDirection: "column",
      transition: T.transition.slow, overflow: "hidden",
    }}>
      {/* Logo + collapse toggle */}
      <div style={{
        padding: open ? `${T.space[5]}px ${T.space[5]}px ${T.space[3]}px` : `${T.space[5]}px 0 ${T.space[3]}px`,
        display: "flex", alignItems: "center", justifyContent: open ? "space-between" : "center",
        gap: T.space[2],
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: T.space[2],
          cursor: "pointer",
        }} onClick={!open ? toggle : undefined}>
          <NovaTerraLogo size={open ? 22 : 16} />
        </div>
        {open && (
          <button onClick={toggle} style={{
            background: "none", border: "none", cursor: "pointer", padding: T.space[1],
            display: "flex", alignItems: "center",
          }}>
            <Ic d={I.chevron} size={16} color={P.textDim} sw={2} />
          </button>
        )}
      </div>

      {/* Global Nav */}
      <div style={{ padding: `${T.space[3]}px ${T.space[3]}px` }}>
        {open && (
          <div style={{
            fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: P.textDim,
            textTransform: "uppercase", letterSpacing: T.tracking.caps,
            padding: `${T.space[1]}px ${T.space[2]}px ${T.space[3]}px`,
          }}>
            Global
          </div>
        )}
        {globalNav.map((item, gi) => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/"}
            className="nav-item"
            style={({ isActive }) => ({
              ...linkStyle(isActive),
              animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${gi * 35}ms both`,
            })}
          >
            {({ isActive }) => (
              <>
                {isActive && <div style={activeIndicator} />}
                <div style={{
                  position: "relative", display: "flex", alignItems: "center",
                  filter: isActive ? `drop-shadow(0 0 4px ${P.accent}50)` : "none",
                  transition: "filter 200ms ease-out",
                }}>
                  <Ic d={item.icon} size={18} color={isActive ? P.accent : P.textMuted} />
                  {item.key === "inbox" && inboxCount > 0 && (
                    <div style={{
                      position: "absolute", top: -4, right: -6,
                      width: 8, height: 8, borderRadius: "50%",
                      background: P.accent, boxShadow: `0 0 6px ${P.accent}60`,
                      animation: "pulse 2s ease-in-out infinite",
                    }} />
                  )}
                </div>
                {open && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {item.label}
                    {item.key === "inbox" && inboxCount > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 5px",
                        borderRadius: 8, background: P.accent, color: "#fff",
                        lineHeight: "14px",
                        boxShadow: `0 0 6px ${P.accent}40`,
                      }}>{inboxCount}</span>
                    )}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Cloud Sync Status */}
      {user && (
        <div style={{ padding: `0 ${T.space[3]}px`, marginBottom: T.space[2] }}>
          <div style={{ borderTop: `1px solid ${P.border}`, marginBottom: T.space[2] }} />
          <div
            onClick={isClickable ? retryCloudSync : undefined}
            style={{ display: "flex", alignItems: "center", justifyContent: open ? "flex-start" : "center", gap: 6, cursor: isClickable ? "pointer" : "default", padding: `${T.space[1]}px ${open ? T.space[2] : 0}px` }}
            title={isClickable ? "Click to retry cloud sync" : undefined}
          >
            <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, flexShrink: 0, boxShadow: syncStatus === "syncing" ? `0 0 6px ${P.accent}80` : "none", animation: syncStatus === "syncing" ? "pulse 1.5s ease-in-out infinite" : "none" }} />
            {open && <span style={{ fontSize: 9, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>}
          </div>
        </div>
      )}

      {/* User / Sign Out */}
      {user && (
        <div style={{
          padding: `${T.space[3]}px ${T.space[3]}px`,
          borderTop: `1px solid ${P.border}`,
        }}>
          <div
            onClick={signOut}
            style={{
              display: "flex", alignItems: "center", gap: T.space[2],
              padding: open ? "8px 10px" : "8px 0",
              justifyContent: open ? "flex-start" : "center",
              borderRadius: T.radius.sm, cursor: "pointer",
              transition: T.transition.fast,
            }}
            className="nav-item"
            title={open ? undefined : (user.email || "Sign out")}
          >
            <div style={{
              width: 28, height: 28, borderRadius: T.radius.full,
              background: membership?.color || P.accentBg,
              border: membership?.color ? `1px solid ${membership.color}40` : `1px solid ${P.borderAccent || P.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold,
              color: membership?.color ? '#fff' : P.accent,
            }}>
              {(membership?.display_name || user.user_metadata?.full_name || user.email || "?")[0].toUpperCase()}
            </div>
            {open && (
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{
                  fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium, color: P.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {membership?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
                </div>
                <div style={{
                  fontSize: T.fontSize.xs, color: P.textDim,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {org ? org.name : 'Sign out'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
