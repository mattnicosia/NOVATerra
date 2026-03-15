import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: I.dashboard, end: true },
  { to: "/admin/users", label: "Users", icon: I.user },
  { to: "/admin/estimates", label: "Estimates", icon: I.estimate },
  { to: "/admin/embeddings", label: "Embeddings", icon: I.intelligence },
  { to: "/admin/health", label: "Health", icon: I.shield },
  { to: "/admin/queue", label: "Queue", icon: I.inbox },
  { to: "/admin/pipeline", label: "Pipeline", icon: I.layers },
  { to: "/admin/log", label: "Log", icon: I.clock },
  { to: "/admin/bid-leveling", label: "Bid Leveling", icon: I.bid },
  { to: "/admin/upload", label: "Upload", icon: I.upload },
  { to: "/admin/orgs", label: "Orgs", icon: I.assembly },
  { to: "/admin/billing", label: "Billing", icon: I.dollar },
  { to: "/admin/parser", label: "Parser", icon: I.ai },
  { to: "/admin/intelligence", label: "Intelligence", icon: I.insights },
  { to: "/admin/carbon", label: "Carbon", icon: I.change },
  { to: "/admin/analytics", label: "Analytics", icon: I.insights },
];

export default function AdminLayout() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        fontFamily: T.font.sans,
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 220,
          minWidth: 220,
          display: "flex",
          flexDirection: "column",
          background: C.glassBg || "rgba(18,21,28,0.55)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: `1px solid ${C.glassBorder || C.border}`,
          padding: "20px 12px",
          gap: 4,
        }}
      >
        {/* Logo / Title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>Admin</div>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>NOVA Platform</div>
          </div>
        </div>

        {/* Nav Links */}
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 14px",
              borderRadius: T.radius.sm,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? C.accent : C.textMuted,
              background: isActive ? `${C.accent}15` : "transparent",
              transition: "all 0.15s",
              cursor: "pointer",
            })}
          >
            <Ic d={item.icon} size={15} />
            {item.label}
          </NavLink>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Back to App */}
        <button
          onClick={() => navigate("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            borderRadius: T.radius.sm,
            border: "none",
            cursor: "pointer",
            background: "transparent",
            color: C.textDim,
            fontSize: 12,
            fontWeight: 500,
            fontFamily: T.font.sans,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = `${C.accent}10`;
            e.currentTarget.style.color = C.text;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = C.textDim;
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5 M12 19l-7-7 7-7" />
          </svg>
          Back to App
        </button>
      </aside>

      {/* ── Content Area ── */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: 32,
          scrollBehavior: "smooth",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
