import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { sectionLabel, bt, card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { BT_BRAND } from "@/constants/btBrand";

// Admin nav items (P1 placeholders)
const ADMIN_NAV = [
  { key: "dashboard", label: "Dashboard", icon: I.dashboard },
  { key: "candidates", label: "Candidates", icon: I.user },
  { key: "assessments", label: "Assessments", icon: I.estimate },
  { key: "reports", label: "Reports", icon: I.report },
  { key: "settings", label: "Settings", icon: I.settings },
];

export default function BTAdminLayout() {
  const C = useTheme();
  const P = C.panel || C;
  const T = C.T;
  const signOut = useAuthStore(s => s.signOut);
  const user = useAuthStore(s => s.user);

  const userInitial = (user?.user_metadata?.full_name || user?.email || "?")[0].toUpperCase();

  const divider = {
    height: 1,
    background: P.border,
    margin: `${T.space[3]}px ${T.space[4]}px`,
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Sidebar */}
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
              color: P.text,
              letterSpacing: T.tracking.wide,
            }}
          >
            {BT_BRAND.name} Admin
          </div>
          <div
            style={{
              fontSize: T.fontSize.xs,
              color: P.textDim,
              fontWeight: T.fontWeight.medium,
              letterSpacing: T.tracking.wider,
            }}
          >
            {BT_BRAND.poweredBy}
          </div>
        </div>

        <div style={divider} />

        {/* Nav items */}
        <div style={{ padding: `0 ${T.space[3]}px` }}>
          <div
            style={{
              ...sectionLabel(P),
              padding: `${T.space[1]}px ${T.space[2]}px ${T.space[3]}px`,
            }}
          >
            Management
          </div>
          {ADMIN_NAV.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[3],
                padding: "10px 14px",
                borderRadius: T.radius.sm,
                cursor: "default",
                fontSize: T.fontSize.base,
                fontWeight: T.fontWeight.medium,
                color: i === 0 ? P.accent : P.textMuted,
                background: i === 0 ? P.accentBg : "transparent",
                opacity: i === 0 ? 1 : 0.5,
                transition: "background 180ms ease-out",
                animation: `staggerFadeRight 280ms cubic-bezier(0.16,1,0.3,1) ${i * 35}ms both`,
              }}
            >
              <Ic d={item.icon} size={18} color={i === 0 ? P.accent : P.textMuted} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* User / Sign Out */}
        <div
          style={{
            padding: `${T.space[3]}px`,
            borderTop: `1px solid ${P.border}`,
          }}
        >
          <div
            onClick={signOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              padding: "8px 10px",
              borderRadius: T.radius.sm,
              cursor: "pointer",
              transition: "background 180ms ease-out",
            }}
            className="nav-item"
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: T.radius.full,
                background: P.accentBg,
                border: `1px solid ${P.borderAccent || P.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: T.fontSize.sm,
                fontWeight: T.fontWeight.bold,
                color: P.accent,
              }}
            >
              {userInitial}
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: T.fontWeight.medium,
                  color: P.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Admin"}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.xs,
                  color: P.textDim,
                }}
              >
                Sign out
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: T.space[8],
        }}
      >
        <div
          style={{
            ...card(C),
            padding: T.space[8],
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: T.space[5],
            textAlign: "center",
            maxWidth: 480,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: T.radius.lg,
              background: `${C.accent}12`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={I.shield} size={32} color={`${C.accent}80`} sw={1.5} />
          </div>

          <div
            style={{
              fontSize: T.fontSize.xl,
              fontWeight: T.fontWeight.bold,
              color: C.text,
            }}
          >
            {BT_BRAND.name} Admin Portal
          </div>

          <div
            style={{
              fontSize: T.fontSize.base,
              color: C.textMuted,
              lineHeight: T.lineHeight.normal,
              maxWidth: 320,
            }}
          >
            Recruiter dashboard and candidate management tools are coming soon.
          </div>

          <div
            style={{
              fontSize: T.fontSize.xs,
              color: C.textDim,
              marginTop: T.space[2],
            }}
          >
            {BT_BRAND.poweredBy}
          </div>
        </div>
      </div>
    </div>
  );
}
