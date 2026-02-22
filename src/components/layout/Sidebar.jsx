import { NavLink, useParams } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useInboxStore } from '@/stores/inboxStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/utils/supabase';
import Ic from '@/components/shared/Ic';
import NovaLogo from '@/components/shared/NovaLogo';
import { I } from '@/constants/icons';

const globalNav = [
  { key: "dashboard", path: "/", icon: I.dashboard, label: "Dashboard" },
  { key: "inbox", path: "/inbox", icon: I.inbox, label: "Inbox" },
  { key: "database", path: "/database", icon: I.database, label: "Cost Database" },
  { key: "contacts", path: "/contacts", icon: I.user, label: "Contacts" },
  { key: "settings", path: "/settings", icon: I.settings, label: "Settings" },
  { key: "brainstorm", path: "/brainstorm", icon: I.ai, label: "Brainstorm" },
];

const estimateNav = [
  { key: "info", path: "info", icon: I.settings, label: "Project Info" },
  { key: "plans", path: "plans", icon: I.plans, label: "Plan Room" },
  { key: "takeoffs", path: "takeoffs", icon: I.takeoff, label: "Takeoffs" },
  { key: "estimate", path: "estimate", icon: I.estimate, label: "Estimate" },
  { key: "alternates", path: "alternates", icon: I.change, label: "Alternates" },
  { key: "sov", path: "sov", icon: I.dollar, label: "Schedule of Values" },
  { key: "reports", path: "reports", icon: I.report, label: "Reports" },
];

export default function Sidebar() {
  const C = useTheme();
  const P = C.panel; // Dark panel theme for sidebar
  const T = C.T;
  const open = useUiStore(s => s.sidebarOpen);
  const toggle = useUiStore(s => s.toggleSidebar);
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const inboxCount = useInboxStore(s => s.unreadCount);
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);

  const w = open ? T.sidebar.expanded : T.sidebar.collapsed;

  const linkStyle = (isActive) => ({
    display: "flex", alignItems: "center", gap: T.space[3],
    padding: open ? "10px 14px" : "10px 0",
    justifyContent: open ? "flex-start" : "center",
    borderRadius: T.radius.sm, cursor: "pointer",
    textDecoration: "none",
    fontSize: T.fontSize.base, fontWeight: T.fontWeight.medium,
    color: isActive ? P.accent : P.textMuted,
    background: isActive ? P.accentBg : "transparent",
    transition: T.transition.fast,
    whiteSpace: "nowrap",
    overflow: "hidden",
    position: "relative",
  });

  // Gradient glow indicator for active links
  const activeIndicator = {
    position: "absolute",
    left: 0, top: 4, bottom: 4,
    width: 3,
    background: P.gradient || `linear-gradient(180deg, ${P.accent}, ${P.accentAlt || P.accent})`,
    borderRadius: "0 3px 3px 0",
    boxShadow: `0 0 8px ${P.accent}40`,
  };

  return (
    <div style={{
      width: w, minWidth: w, height: "100vh",
      background: P.bg,
      borderRight: `1px solid ${P.border}`,
      display: "flex", flexDirection: "column",
      transition: T.transition.slow, overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{
        padding: open ? `${T.space[4]}px ${T.space[4]}px` : `${T.space[4]}px 0`,
        display: "flex", alignItems: "center", justifyContent: open ? "space-between" : "center",
        gap: T.space[2],
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: T.space[2],
          cursor: "pointer",
        }} onClick={!open ? toggle : undefined}>
          <NovaLogo size={28} />
          {open && (
            <span style={{
              fontSize: T.fontSize.xl, fontWeight: T.fontWeight.heavy, letterSpacing: "0.08em",
              color: P.text,
            }}>
              NOVA
            </span>
          )}
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
      <div style={{ padding: `${T.space[2]}px ${T.space[2]}px` }}>
        {open && (
          <div style={{
            fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: P.textDim,
            textTransform: "uppercase", letterSpacing: T.tracking.caps,
            padding: `${T.space[1]}px ${T.space[2]}px ${T.space[3]}px`,
          }}>
            Global
          </div>
        )}
        {globalNav.map(item => (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.path === "/"}
            style={({ isActive }) => linkStyle(isActive)}
          >
            {({ isActive }) => (
              <>
                {isActive && <div style={activeIndicator} />}
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Ic d={item.icon} size={18} color={isActive ? P.accent : P.textMuted} />
                  {item.key === "inbox" && inboxCount > 0 && (
                    <div style={{
                      position: "absolute", top: -4, right: -6,
                      width: 8, height: 8, borderRadius: "50%",
                      background: P.accent, boxShadow: `0 0 6px ${P.accent}60`,
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
                      }}>{inboxCount}</span>
                    )}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Active Estimate Nav */}
      {activeId && (
        <div style={{ padding: `${T.space[2]}px ${T.space[2]}px 0`, flex: 1, overflowY: "auto" }}>
          {open && (
            <div style={{
              margin: `0 ${T.space[2]}px ${T.space[3]}px`,
              padding: `${T.space[3]}px ${T.space[3]}px`,
              background: P.accentBg,
              border: `1px solid ${P.borderAccent || P.border}`,
              borderRadius: T.radius.sm,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: T.space[2],
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: T.radius.full,
                  background: P.accent,
                  boxShadow: `0 0 6px ${P.accent}60`,
                }} />
                <span style={{
                  fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: P.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {project.name || "Estimate"}
                </span>
              </div>
            </div>
          )}
          {open && (
            <div style={{
              fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: P.textDim,
              textTransform: "uppercase", letterSpacing: T.tracking.caps,
              padding: `${T.space[1]}px ${T.space[2]}px ${T.space[2]}px`,
              margin: `0 ${T.space[2]}px`,
            }}>
              Project
            </div>
          )}
          {estimateNav.map(item => (
            <NavLink
              key={item.key}
              to={`/estimate/${activeId}/${item.path}`}
              style={({ isActive }) => linkStyle(isActive)}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div style={activeIndicator} />}
                  <Ic d={item.icon} size={18} color={isActive ? P.accent : P.textMuted} />
                  {open && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          ))}
          <div style={{
            height: 1,
            background: P.border,
            margin: `${T.space[3]}px ${T.space[2]}px`,
          }} />
        </div>
      )}

      {/* Spacer when no active estimate */}
      {!activeId && <div style={{ flex: 1 }} />}

      {/* Cloud Sync Status */}
      {user && (() => {
        const syncStatus = useUiStore(s => s.cloudSyncStatus);
        const syncLastAt = useUiStore(s => s.cloudSyncLastAt);
        const statusColor = syncStatus === "synced" ? P.accent : syncStatus === "syncing" ? P.accent : syncStatus === "error" ? P.orange : P.textDim;
        const statusLabel = syncStatus === "synced" ? `Synced${syncLastAt ? ` ${syncLastAt}` : ""}` : syncStatus === "syncing" ? "Syncing..." : syncStatus === "error" ? "Sync error" : "Cloud sync";
        return (
          <div style={{ padding: `0 ${T.space[3]}px ${T.space[1]}px`, display: "flex", alignItems: "center", justifyContent: open ? "flex-start" : "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor, flexShrink: 0, boxShadow: syncStatus === "syncing" ? `0 0 6px ${P.accent}80` : "none", animation: syncStatus === "syncing" ? "pulse 1.5s ease-in-out infinite" : "none" }} />
            {open && <span style={{ fontSize: 9, color: statusColor, fontWeight: 500 }}>{statusLabel}</span>}
          </div>
        );
      })()}

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
              background: P.accentBg,
              border: `1px solid ${P.borderAccent || P.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold,
              color: P.accent,
            }}>
              {(user.user_metadata?.full_name || user.email || "?")[0].toUpperCase()}
            </div>
            {open && (
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{
                  fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium, color: P.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {user.user_metadata?.full_name || user.email?.split("@")[0] || "User"}
                </div>
                <div style={{
                  fontSize: T.fontSize.xs, color: P.textDim,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  Sign out
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
