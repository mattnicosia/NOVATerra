// ─── BLDG Talent — AssessmentShell ──────────────────────────────────────
// Timer + progress wrapper around module content
// Fixed top bar with countdown timer, progress indicator, and progress bar

import { useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useBTAssessmentStore } from "@/stores/btAssessmentStore";
import { BT_MODULES } from "@/constants/btBrand";

export default function AssessmentShell({ moduleKey, totalQuestions, children }) {
  const C = useTheme();
  const T = C.T;
  const mod = BT_MODULES[moduleKey];

  const timerRemaining = useBTAssessmentStore(s => s.timerRemaining);
  const currentQuestionIndex = useBTAssessmentStore(s => s.currentQuestionIndex);
  const tickTimer = useBTAssessmentStore(s => s.tickTimer);

  const intervalRef = useRef(null);

  // Timer countdown effect
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tickTimer]);

  // Format seconds to MM:SS
  const seconds = timerRemaining ?? 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const isLowTime = seconds < 60 && seconds > 0;
  const isExpired = seconds <= 0;

  // Progress percentage
  const progressPct = totalQuestions > 0 ? Math.min(((currentQuestionIndex + 1) / totalQuestions) * 100, 100) : 0;

  const dangerColor = "#E53E3E";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: T.font.sans,
      }}
    >
      {/* Fixed top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: T.z?.sticky || 100,
          background: C.isDark ? "rgba(15,15,25,0.92)" : "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        }}
      >
        {/* Main info row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${T.space[3]}px ${T.space[6]}px`,
            maxWidth: 900,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {/* Module label */}
          <div
            style={{
              fontSize: T.fontSize.md,
              fontWeight: T.fontWeight.semibold,
              color: C.text,
              letterSpacing: T.tracking.tight,
            }}
          >
            {mod?.label || moduleKey}
          </div>

          {/* Timer pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              borderRadius: T.radius.full,
              padding: "5px 14px",
              transition: "all 300ms ease",
              ...(isLowTime && {
                background: `${dangerColor}18`,
                animation: "timerFlash 1s ease-in-out infinite",
              }),
            }}
          >
            {/* Clock icon */}
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isLowTime || isExpired ? dangerColor : C.accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span
              style={{
                fontSize: T.fontSize.md,
                fontWeight: T.fontWeight.bold,
                color: isLowTime || isExpired ? dangerColor : C.accent,
                fontFeatureSettings: "'tnum'",
                minWidth: 48,
                textAlign: "center",
                fontFamily: T.font.sans,
              }}
            >
              {mm}:{ss}
            </span>
          </div>

          {/* Progress indicator */}
          <div
            style={{
              fontSize: T.fontSize.sm,
              color: C.textDim,
              fontWeight: T.fontWeight.medium,
            }}
          >
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            width: "100%",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: isLowTime ? dangerColor : C.gradient || C.accent,
              borderRadius: "0 2px 2px 0",
              transition: "width 300ms ease-out",
            }}
          />
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: `${T.space[6]}px ${T.space[4]}px`,
        }}
      >
        {children}
      </div>

      {/* Inject keyframe animation for low-time flash */}
      <style>{`
        @keyframes timerFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
