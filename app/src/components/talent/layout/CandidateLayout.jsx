import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { bt } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { BT_BRAND } from "@/constants/btBrand";
import CandidateSidebar from "./CandidateSidebar";

// Lazy-loaded BLDG Talent pages
const BTAssessmentPage = lazy(() => import("@/pages/talent/BTAssessmentPage"));

// Loading fallback
function LoadingFallback() {
  const C = useTheme();
  const T = C.T;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: C.textDim,
        fontSize: T.fontSize.base,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      Loading...
    </div>
  );
}

// Placeholder pages for P1 features
function PlaceholderPage({ title }) {
  const C = useTheme();
  const T = C.T;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        flexDirection: "column",
        gap: T.space[3],
      }}
    >
      <div
        style={{
          fontSize: T.fontSize.lg,
          fontWeight: T.fontWeight.semibold,
          fontFamily: "'DM Sans', sans-serif",
          color: C.text,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: T.fontSize.base,
          fontFamily: "'DM Sans', sans-serif",
          color: C.textDim,
        }}
      >
        Coming soon
      </div>
    </div>
  );
}

export default function CandidateLayout() {
  const C = useTheme();
  const P = C.panel || C;
  const T = C.T;
  const location = useLocation();
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);

  const userInitial = (user?.user_metadata?.full_name || user?.email || "?")[0].toUpperCase();

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Candidate";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: C.bg,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          height: 52,
          minHeight: 52,
          background: C.neroMode ? `${C.carbonTexture || ""}, ${P.bg}`.replace(/^, /, "") : P.bg,
          borderBottom: `1px solid ${C.neroMode ? "rgba(255,255,255,0.06)" : P.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${T.space[5]}px`,
          zIndex: T.z.sticky,
        }}
      >
        {/* Left: Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[2],
          }}
        >
          <span
            style={{
              fontSize: T.fontSize.md,
              fontWeight: T.fontWeight.bold,
              color: P.text,
              letterSpacing: T.tracking.wide,
            }}
          >
            {BT_BRAND.name}
          </span>
          <span
            style={{
              fontSize: T.fontSize.xs,
              color: P.textDim,
              fontWeight: T.fontWeight.medium,
              letterSpacing: T.tracking.wider,
            }}
          >
            {BT_BRAND.poweredBy}
          </span>
        </div>

        {/* Right: User + sign out */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
          }}
        >
          {/* User avatar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
            }}
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
            <span
              style={{
                fontSize: T.fontSize.sm,
                color: P.textMuted,
                fontWeight: T.fontWeight.medium,
              }}
            >
              {userName}
            </span>
          </div>

          {/* Sign out */}
          <button
            onClick={signOut}
            style={bt(C, {
              background: "none",
              color: P.textDim,
              fontSize: T.fontSize.sm,
              padding: "4px 10px",
              fontFamily: "'DM Sans', sans-serif",
            })}
          >
            <Ic d={I.externalLink} size={14} color={P.textDim} sw={2} />
            Sign out
          </button>
        </div>
      </div>

      {/* Body: Sidebar + Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <CandidateSidebar activePath={location.pathname} />

        {/* Main content area */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: C.bg,
          }}
        >
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/assessment/*" element={<BTAssessmentPage />} />
              <Route path="/bt/profile" element={<PlaceholderPage title="Profile" />} />
              <Route path="/bt/results" element={<PlaceholderPage title="Results" />} />
              <Route path="*" element={<Navigate to="/assessment" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
