import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";

const RAIL_W = 36;

/**
 * Vertical control rail on the left side of the takeoff canvas.
 * Contains view mode cycling (Drawings/Standard/Split/Estimate) and tool buttons.
 */
export default function TakeoffControlRail({
  checkDimMode,
  setCheckDimMode,
  snapAngleOn,
  setSnapAngleOn,
  showMeasureLabels,
  setShowMeasureLabels,
}) {
  const C = useTheme();
  const T = C.T;

  const tkPanelTier = useDrawingPipelineStore(s => s.tkPanelTier);
  const tkPanelOpen = useDrawingPipelineStore(s => s.tkPanelOpen);
  const tkMeasureState = useDrawingPipelineStore(s => s.tkMeasureState);
  const tkTool = useDrawingPipelineStore(s => s.tkTool);
  const setTkTool = useDrawingPipelineStore(s => s.setTkTool);
  const setTkMeasureState = useDrawingPipelineStore(s => s.setTkMeasureState);
  const setTkActivePoints = useDrawingPipelineStore(s => s.setTkActivePoints);
  const setTkActiveTakeoffId = useDrawingPipelineStore(s => s.setTkActiveTakeoffId);
  const tkAutoCount = useDrawingPipelineStore(s => s.tkAutoCount);
  const setTkAutoCount = useDrawingPipelineStore(s => s.setTkAutoCount);

  const modes = [
    { id: "closed", bars: 0, label: "Drawings" },
    { id: "standard", bars: 2, label: "Standard" },
    { id: "full", bars: 3, label: "Split" },
    { id: "estimate", bars: 4, label: "Estimate" },
  ];

  let curId;
  if (tkPanelTier === "estimate") curId = "estimate";
  else if (!tkPanelOpen) curId = "closed";
  else if (tkPanelTier === "full") curId = "full";
  else curId = "standard";

  const idx = modes.findIndex(m => m.id === curId);
  const current = modes[idx >= 0 ? idx : 0];
  const nextMode = modes[(idx + 1) % modes.length];

  const cycleTier = () => {
    const store = useDrawingPipelineStore.getState();
    if (nextMode.id === "closed") {
      store.setTkPanelOpen(false);
      store.setTkPanelTier("standard");
      sessionStorage.setItem("bldg-tkPanelTier", "standard");
      sessionStorage.setItem("bldg-tkPanelWidth", "550");
    } else if (nextMode.id === "estimate") {
      store.setTkPanelOpen(false);
      store.setTkPanelTier("estimate");
      sessionStorage.setItem("bldg-tkPanelTier", "estimate");
      sessionStorage.setItem("bldg-tkPanelWidth", "0");
    } else {
      store.setTkPanelOpen(true);
      store.setTkPanelWidth(nextMode.id === "full" ? 900 : 550);
      store.setTkPanelTier(nextMode.id);
      sessionStorage.setItem("bldg-tkPanelTier", nextMode.id);
      sessionStorage.setItem("bldg-tkPanelWidth", nextMode.id === "full" ? "900" : "550");
    }
  };

  const railLabelStyle = {
    position: "absolute",
    left: RAIL_W + 6,
    top: "50%",
    transform: "translateY(-50%)",
    whiteSpace: "nowrap",
    fontSize: 10,
    fontWeight: 600,
    fontFamily: T.font.sans,
    color: C.text,
    background: C.sidebarBg || C.bg1,
    border: `1px solid ${C.isDark ? "rgba(255,255,255,0.12)" : C.border}`,
    borderRadius: 6,
    padding: "5px 12px",
    boxShadow: [T.shadow.lg || "0 8px 24px rgba(0,0,0,0.35)", T.glass.specularSm, T.glass.edge]
      .filter(Boolean)
      .join(", "),
    backdropFilter: T.glass.blurLight || "blur(12px)",
    WebkitBackdropFilter: T.glass.blurLight || "blur(12px)",
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity 0.15s ease",
    zIndex: 50,
  };

  const isSelecting = tkMeasureState === "idle" && !checkDimMode && tkTool !== "calibrate";

  const railBtn = active => ({
    width: 28,
    height: 28,
    border: `1px solid ${active ? C.accent + "50" : C.isDark ? "rgba(255,255,255,0.12)" : C.border}`,
    background: active ? C.accent + "18" : C.isDark ? "rgba(255,255,255,0.06)" : C.bg2,
    borderRadius: 6,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
    boxShadow: [T.shadow.sm, T.glass.specularSm, active ? `0 0 8px ${C.accent}20` : null].filter(Boolean).join(", "),
  });

  const ico = active => ({
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: active ? C.accent : C.textMuted,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  });

  const sepStyle = {
    width: 20,
    height: 1,
    background: C.isDark ? "rgba(255,255,255,0.08)" : C.border,
    flexShrink: 0,
    boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
  };

  /* ── MODE GROUP: Select + Undo ── */
  const undoPastLen = useUndoStore(s => s.past.length);
  const canUndo = undoPastLen > 0;
  const isMeasuring = tkMeasureState === "measuring";
  const activePoints = useDrawingPipelineStore(s => s.tkActivePoints);
  const hasActivePoints = isMeasuring && activePoints.length > 0;
  const undoAvailable = hasActivePoints || canUndo;
  const modeTools = [
    {
      id: "select",
      label: "Select",
      active: isSelecting,
      action: () => {
        setCheckDimMode(false);
        setTkTool("select");
        setTkMeasureState("idle");
        setTkActivePoints([]);
      },
      icon: (
        <svg {...ico(isSelecting)}>
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          <path d="M13 13l6 6" />
        </svg>
      ),
    },
    {
      id: "undo",
      label: hasActivePoints ? "Undo Last Point" : canUndo ? "Undo" : "Nothing to undo",
      active: false,
      action: () => {
        // During active measurement: undo last click point first
        if (hasActivePoints) {
          const pts = useDrawingPipelineStore.getState().tkActivePoints;
          useDrawingPipelineStore.getState().setTkActivePoints(pts.slice(0, -1));
          useUiStore.getState().showToast("Undone: last point", "info");
          return;
        }
        // Undo last store action (measurement, edit, etc.)
        // Works across closed takeoffs — keeps going back through history
        const freshCanUndo = useUndoStore.getState().canUndo();
        if (!freshCanUndo) return;
        const actionName = useUndoStore.getState().undo();
        if (actionName) {
          useUiStore.getState().showToast(`Undone: ${actionName}`, "info");
        }
      },
      disabled: !undoAvailable,
      icon: (
        <svg {...ico(false)} style={{ opacity: undoAvailable ? 1 : 0.35 }}>
          <path d="M1 4v6h6" />
          <path d="M3.51 15a9 9 0 105.64-12.36L1 10" />
        </svg>
      ),
    },
  ];

  const isRectTool = tkTool === "rect" && tkMeasureState === "measuring";
  const rectTool = {
    id: "rect",
    label: isRectTool ? "Rect Mode ON" : "Rectangle (2-click)",
    active: isRectTool,
    action: () => {
      if (isRectTool) {
        // Toggle off — revert to area
        const s = useDrawingPipelineStore.getState();
        if (s.tkActiveTakeoffId) {
          s.setTkTool("area");
        } else {
          s.setTkTool("select");
          s.setTkMeasureState("idle");
        }
        s.setTkActivePoints([]);
      } else {
        // Toggle on — need an active takeoff
        const s = useDrawingPipelineStore.getState();
        if (s.tkActiveTakeoffId) {
          s.setTkTool("rect");
          s.setTkActivePoints([]);
        } else if (s.tkSelectedTakeoffId) {
          // Auto-engage measuring with rect tool
          s.setTkActiveTakeoffId(s.tkSelectedTakeoffId);
          s.setTkTool("rect");
          s.setTkMeasureState("measuring");
          s.setTkActivePoints([]);
        } else {
          useUiStore.getState().showToast("Select a takeoff first", "warning");
        }
      }
    },
    icon: (
      <svg {...ico(isRectTool)}>
        <rect x="3" y="3" width="18" height="18" rx="1" fill="none" />
        <circle cx="3" cy="3" r="2" fill="currentColor" />
        <circle cx="21" cy="21" r="2" fill="currentColor" />
      </svg>
    ),
  };

  const isCircleTool = tkTool === "circle" && tkMeasureState === "measuring";
  const circleTool = {
    id: "circle",
    label: isCircleTool ? "Circle Mode ON" : "Circle (2-click)",
    active: isCircleTool,
    action: () => {
      if (isCircleTool) {
        const s = useDrawingPipelineStore.getState();
        s.setTkTool(s.tkActiveTakeoffId ? "area" : "select");
        s.setTkActivePoints([]);
      } else {
        const s = useDrawingPipelineStore.getState();
        if (s.tkActiveTakeoffId) {
          s.setTkTool("circle");
          s.setTkActivePoints([]);
        } else if (s.tkSelectedTakeoffId) {
          s.setTkActiveTakeoffId(s.tkSelectedTakeoffId);
          s.setTkTool("circle");
          s.setTkMeasureState("measuring");
          s.setTkActivePoints([]);
        } else {
          useUiStore.getState().showToast("Select a takeoff first", "warning");
        }
      }
    },
    icon: (
      <svg {...ico(isCircleTool)}>
        <circle cx="12" cy="12" r="9" fill="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <line x1="12" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
      </svg>
    ),
  };

  const tkDeductMode = useDrawingPipelineStore(s => s.tkDeductMode);

  /* ── ACTIVE TOOLS: Snap, Labels, Check Dim, Deduct ── */
  const activeTools = [
    {
      id: "deduct",
      label: tkDeductMode ? "Deduct ON" : "Deduct Mode",
      active: tkDeductMode,
      action: () => useDrawingPipelineStore.getState().setTkDeductMode(!tkDeductMode),
      icon: (
        <svg {...ico(tkDeductMode)} style={{ color: tkDeductMode ? "#EF4444" : undefined }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
    },
    {
      id: "snap",
      label: snapAngleOn ? "Snap ON" : "Snap Angle",
      active: snapAngleOn,
      action: () => setSnapAngleOn(v => !v),
      icon: (
        <svg {...ico(snapAngleOn)}>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      id: "labels",
      label: showMeasureLabels ? "Labels ON" : "Labels OFF",
      active: showMeasureLabels,
      action: () => setShowMeasureLabels(v => !v),
      icon: (
        <svg {...ico(showMeasureLabels)}>
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      ),
    },
    {
      id: "checkdim",
      label: checkDimMode ? "Check Dim ON" : "Check Dim",
      active: checkDimMode,
      action: () => {
        setCheckDimMode(v => !v);
        if (!checkDimMode) {
          setTkTool("linear");
          setTkMeasureState("idle");
          setTkActivePoints([]);
          setTkActiveTakeoffId(null);
        } else {
          setTkTool("select");
        }
      },
      icon: (
        <svg {...ico(checkDimMode)}>
          <path d="M2 20h20 M2 20V4 M6 16V8 M10 16V6 M14 16v-4 M18 16V8" />
        </svg>
      ),
    },
  ];

  /* ── AI/SMART TOOLS: AutoCount, Compare, Cut ── */
  const aiTools = [
    {
      id: "autocount",
      label: tkAutoCount ? "Counting..." : "AutoCount",
      active: !!tkAutoCount,
      action: () => {
        if (tkAutoCount) {
          setTkAutoCount(null);
        } else {
          const selId = useDrawingPipelineStore.getState().tkSelectedTakeoffId;
          if (selId) setTkAutoCount({ phase: "select", takeoffId: selId });
          else {
            const toast = useUiStore.getState().showToast;
            toast("Select a takeoff first", "warning");
          }
        }
      },
      icon: (
        <svg {...ico(!!tkAutoCount)}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8 M8 12h8" />
        </svg>
      ),
    },
    {
      id: "compare",
      label: "Compare",
      soon: true,
      icon: (
        <svg {...ico(false)}>
          <rect x="2" y="3" width="8" height="8" rx="1" />
          <rect x="14" y="13" width="8" height="8" rx="1" />
          <path d="M7 11v2a2 2 0 002 2h2 M17 13v-2a2 2 0 00-2-2h-2" />
        </svg>
      ),
    },
    {
      id: "cut",
      label: "Cut / Subtract",
      soon: true,
      icon: (
        <svg {...ico(false)}>
          <circle cx="8" cy="12" r="6" />
          <circle cx="16" cy="12" r="6" />
          <path d="M12 8v8" />
        </svg>
      ),
    },
  ];

  const renderBtn = t => (
    <div key={t.id} className="rail-btn-wrap" style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        className="icon-btn rail-btn"
        title={t.label}
        onClick={t.action || undefined}
        disabled={t.disabled}
        style={{
          ...railBtn(t.active),
          opacity: (t.soon && !t.action) || t.disabled ? 0.45 : 1,
          cursor: (t.soon && !t.action) || t.disabled ? "default" : "pointer",
        }}
      >
        {t.icon}
      </button>
      <span className="rail-label" style={railLabelStyle}>
        {t.label}
      </span>
    </div>
  );

  return (
    <div style={{ width: RAIL_W, flexShrink: 0, position: "relative", zIndex: 40 }}>
      {/* Floating rail pill */}
      <div
        style={{
          position: "absolute",
          top: 78,
          left: 2,
          width: RAIL_W - 4,
          bottom: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 10,
          paddingBottom: 10,
          gap: 8,
          background: C.sidebarBg || C.bg1,
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 25%, transparent 85%, rgba(0,0,0,0.06) 100%)",
          border: `1px solid ${C.isDark ? "rgba(255,255,255,0.10)" : C.border}`,
          borderRadius: 14,
          boxShadow: [
            "0 4px 24px rgba(0,0,0,0.45)",
            "0 2px 8px rgba(0,0,0,0.30)",
            T.glass.specular,
            T.glass.innerDepth,
            T.glass.specularBottom,
            T.glass.edge,
          ]
            .filter(Boolean)
            .join(", "),
          backdropFilter: T.glass.blurLight || "blur(12px)",
          WebkitBackdropFilter: T.glass.blurLight || "blur(12px)",
          transition: "top 0.2s ease-out",
        }}
      >
        {/* View cycle button */}
        <div className="rail-btn-wrap" style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <button
            className="icon-btn rail-btn"
            title={`${current.label} \u2192 ${nextMode.label}`}
            onClick={cycleTier}
            style={{
              width: 28,
              height: 28,
              border: `1px solid ${current.bars > 0 ? C.accent + "50" : C.isDark ? "rgba(255,255,255,0.12)" : C.border}`,
              background: current.bars > 0 ? C.accent + "18" : C.isDark ? "rgba(255,255,255,0.06)" : C.bg2,
              borderRadius: 6,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              padding: 0,
              flexShrink: 0,
              boxShadow: [T.shadow.sm, T.glass.specularSm, current.bars > 0 ? `0 0 8px ${C.accent}20` : null]
                .filter(Boolean)
                .join(", "),
            }}
          >
            {current.bars === 0 ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.textMuted}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="18" rx="1" />
                <path d="M14 3h7M14 9h7M14 15h5" />
              </svg>
            ) : (
              Array.from({ length: current.bars }).map((_, i) => (
                <div key={i} style={{ width: 2.5, height: 10, borderRadius: 1, background: C.accent }} />
              ))
            )}
          </button>
          <span className="rail-label" style={railLabelStyle}>
            {current.label}
          </span>
        </div>

        {/* ── Tools — organized by Jony's 4-group layout ── */}
        {tkPanelTier !== "estimate" && (
          <>
            {modeTools.map(renderBtn)}
            {renderBtn(rectTool)}
            {renderBtn(circleTool)}
            <div style={sepStyle} />
            {activeTools.map(renderBtn)}
            <div style={sepStyle} />
            {aiTools.map(renderBtn)}
          </>
        )}
      </div>
    </div>
  );
}
