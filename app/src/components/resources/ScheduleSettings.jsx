import React, { useState, useRef, useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import { bt, inp } from "@/utils/styles";

export default function ScheduleSettings({ C, T }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const productionHours = useUiStore(s => s.appSettings?.productionHoursPerDay) || 7;
  const bufferHours = useUiStore(s => s.appSettings?.bufferHours) || 0;
  const overheadPercent = useUiStore(s => s.appSettings?.overheadPercent) ?? 15;
  const behindThreshold = useUiStore(s => s.appSettings?.behindThreshold) ?? 20;
  const aheadThreshold = useUiStore(s => s.appSettings?.aheadThreshold) ?? 15;
  const updateSetting = useUiStore(s => s.updateSetting);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...bt(C),
          padding: "6px 10px",
          fontSize: T.fontSize.xs,
          color: C.textMuted,
          background: open ? `${C.accent}12` : C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          border: `1px solid ${open ? C.accent + "30" : C.border}`,
          borderRadius: T.radius.sm,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Settings"
      >
        <span style={{ fontSize: 13 }}>⚙</span>
        <span style={{ fontWeight: 600 }}>Settings</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: C.bg1,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.md,
            padding: T.space[4],
            boxShadow: T.shadow?.md || "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 50,
            minWidth: 240,
          }}
        >
          <div
            style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[3] }}
          >
            Settings
          </div>

          {/* Production Hours/Day */}
          <div style={{ marginBottom: T.space[3] }}>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              Production Hours / Day
            </label>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={productionHours}
              onChange={e => updateSetting("productionHoursPerDay", Number(e.target.value) || 7)}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Expected productive hours per estimator per day
            </div>
          </div>

          {/* Buffer Hours */}
          <div>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              Buffer Between Estimates (hrs)
            </label>
            <input
              type="number"
              min={0}
              max={24}
              step={1}
              value={bufferHours}
              onChange={e => updateSetting("bufferHours", Number(e.target.value) || 0)}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Gap between consecutive estimate blocks (0 = no gap)
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${C.border}40`, margin: `${T.space[3]}px 0` }} />

          {/* Overhead % */}
          <div style={{ marginBottom: T.space[3] }}>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              Overhead %
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step={5}
              value={overheadPercent}
              onChange={e => updateSetting("overheadPercent", Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Non-production time: admin, meetings, walkthroughs
            </div>
          </div>

          {/* Behind Threshold */}
          <div style={{ marginBottom: T.space[3] }}>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              Behind Threshold %
            </label>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={behindThreshold}
              onChange={e => updateSetting("behindThreshold", Math.min(50, Math.max(5, Number(e.target.value) || 20)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Flag "behind" when progress lags day progress by this %
            </div>
          </div>

          {/* Ahead Threshold */}
          <div>
            <label
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 4,
              }}
            >
              Ahead Threshold %
            </label>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={aheadThreshold}
              onChange={e => updateSetting("aheadThreshold", Math.min(50, Math.max(5, Number(e.target.value) || 15)))}
              style={{
                ...inp(C),
                width: "100%",
                padding: "6px 10px",
                fontSize: T.fontSize.xs,
              }}
            />
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
              Flag "ahead" when progress exceeds day progress by this %
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
