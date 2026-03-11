import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * ActivityTimerPill — Optional header display showing elapsed time on current estimate.
 *
 * - Green dot = running, grey dot = paused/idle
 * - Shows HH:MM:SS elapsed time
 * - Click toggles visibility on/off (persisted via showActivityTimer in uiStore)
 * - Only renders when an estimate is open
 */
export default function ActivityTimerPill() {
  const C = useTheme();
  const T = C.T;
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const isRunning = useActivityTimerStore(s => s.isRunning);
  const isPaused = useActivityTimerStore(s => s.isPaused);
  const showTimer = useUiStore(s => s.appSettings.showActivityTimer);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second when running
  useEffect(() => {
    if (!activeId || !showTimer) return;

    const tick = () => {
      setElapsed(useActivityTimerStore.getState().getElapsedMs());
    };

    tick(); // Initial
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeId, showTimer, isRunning]);

  // Don't render if no estimate or timer hidden
  if (!activeId || !showTimer) return null;

  const hours = Math.floor(elapsed / 3600000);
  const mins = Math.floor((elapsed % 3600000) / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);

  const timeStr =
    hours > 0
      ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${mins}:${String(secs).padStart(2, "0")}`;

  const dotColor = isRunning ? "#30D158" : isPaused ? "#8E8E93" : "#8E8E93";

  return (
    <button
      onClick={() => useUiStore.getState().updateSetting("showActivityTimer", false)}
      title="Hide timer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[2],
        padding: "5px 12px",
        borderRadius: T.radius.full,
        background: C.glassBg || (C.isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"),
        backdropFilter: T.glass.blurLight,
        WebkitBackdropFilter: T.glass.blurLight,
        border: `0.5px solid ${T.glass.border || (C.isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.25)")}`,
        transition: T.transition.fast,
        boxShadow: [T.glass.specularSm, T.glass.edge].filter(Boolean).join(", "),
        cursor: "pointer",
        outline: "none",
        fontFamily: T.font.sans,
      }}
    >
      {/* Status dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: isRunning ? `0 0 6px ${dotColor}80` : "none",
          flexShrink: 0,
        }}
      />
      {/* Time label */}
      <span
        style={{
          fontSize: T.fontSize.xs,
          color: C.textDim,
        }}
      >
        Time
      </span>
      {/* Time value */}
      <span
        style={{
          fontWeight: T.fontWeight.semibold,
          fontSize: T.fontSize.sm,
          color: C.text,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0.5,
        }}
      >
        {timeStr}
      </span>
    </button>
  );
}
