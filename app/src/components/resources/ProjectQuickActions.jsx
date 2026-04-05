import React, { useState, useRef, useEffect } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { getStatusColors, SCHEDULE_COLORS, hexAlpha } from "@/utils/resourceColors";
import { parseDateStr } from "@/utils/dateHelpers";

export default function ProjectQuickActions({ data, onClose, estimatorRows, C, T, navigate }) {
  const STATUS_COLORS = getStatusColors(C);
  const ref = useRef(null);
  const {
    id,
    name,
    client,
    status,
    bidDue,
    daysRemaining,
    hoursLogged,
    estimatedHours,
    percentComplete,
    estimator,
    manualPercentComplete,
    manualHoursLogged,
    delegatedBy,
    scheduleStatus,
  } = data;

  const [pctVal, setPctVal] = useState(manualPercentComplete != null ? manualPercentComplete : percentComplete);
  const [hoursVal, setHoursVal] = useState(manualHoursLogged != null ? String(manualHoursLogged) : "");
  const [assignVal, setAssignVal] = useState(estimator || "");
  const [showDelegate, setShowDelegate] = useState(false);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Position clamping (keep popover in viewport)
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let x = data.x,
      y = data.y;
    if (x + rect.width > window.innerWidth - 16) x = window.innerWidth - rect.width - 16;
    if (y + rect.height > window.innerHeight - 16) y = window.innerHeight - rect.height - 16;
    if (x < 16) x = 16;
    if (y < 16) y = 16;
    setPos({ x, y });
  }, [data.x, data.y]);

  const save = (field, value) => {
    useEstimatesStore.getState().updateIndexEntry(id, { [field]: value });
  };

  const handlePctChange = val => {
    const v = Math.max(0, Math.min(100, Number(val) || 0));
    setPctVal(v);
    save("manualPercentComplete", v);
  };

  const handleHoursChange = val => {
    setHoursVal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      save("manualHoursLogged", Math.round(num * 10) / 10);
    }
  };

  const handleClearHours = () => {
    setHoursVal("");
    save("manualHoursLogged", null);
  };

  const handleClearPct = () => {
    setPctVal(percentComplete);
    save("manualPercentComplete", null);
  };

  const handleAssign = newEstimator => {
    setAssignVal(newEstimator);
    save("estimator", newEstimator);
    useUiStore.getState().showToast(`Assigned "${name}" to ${newEstimator || "Unassigned"}`);
  };

  const handleDelegate = newEstimator => {
    if (!newEstimator || newEstimator === estimator) return;
    useEstimatesStore.getState().updateIndexEntry(id, {
      estimator: newEstimator,
      delegatedBy: estimator || "",
    });
    setAssignVal(newEstimator);
    setShowDelegate(false);
    useUiStore.getState().showToast(`Delegated "${name}" from ${estimator} → ${newEstimator}`);
  };

  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const statusColor = SCHEDULE_COLORS[scheduleStatus] || STATUS_COLORS[status] || C.purple;
  const pctColor = pctVal >= 100 ? "#30D158" : pctVal >= 50 ? "#FF9500" : statusColor;

  const sectionTitle = {
    fontSize: 9,
    fontWeight: 700,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
    marginTop: 12,
  };
  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: T.fontSize.xs,
    background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: T.radius.sm,
    color: C.text,
    fontFamily: T.font.display,
    outline: "none",
  };
  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
    paddingRight: 24,
  };
  const linkBtn = {
    background: "none",
    border: "none",
    fontSize: 9,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    fontFamily: T.font.display,
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width: 320,
        zIndex: 9999,
        background: C.bg1,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: dk ? "0 16px 48px rgba(0,0,0,0.6)" : "0 16px 48px rgba(0,0,0,0.18)",
        padding: 16,
        fontFamily: T.font.display,
        animation: "modalEnter 0.15s ease-out both",
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: T.fontSize.sm,
              fontWeight: T.fontWeight.bold,
              color: C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          {client && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{client}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: hexAlpha(statusColor, 0.12),
              color: statusColor,
            }}
          >
            {status}
          </span>
          <button
            onClick={onClose}
            style={{ ...linkBtn, color: C.textDim, fontSize: 14, lineHeight: 1, padding: "0 2px" }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Due date */}
      {bidDue && (
        <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>
          Due {parseDateStr(bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {daysRemaining > 0 ? ` · ${daysRemaining}d left` : daysRemaining === 0 ? " · Today" : " · Overdue"}
        </div>
      )}

      {/* Delegated By label */}
      {delegatedBy && (
        <div style={{ fontSize: 9, color: "#FF9500", fontWeight: 600, marginTop: 4 }}>Delegated by {delegatedBy}</div>
      )}

      {/* % Complete */}
      <div style={sectionTitle}>% Complete</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={0}
          max={100}
          value={pctVal}
          onChange={e => handlePctChange(e.target.value)}
          style={{ flex: 1, accentColor: pctColor, cursor: "pointer", height: 4 }}
        />
        <input
          type="number"
          min={0}
          max={100}
          value={pctVal}
          onChange={e => handlePctChange(e.target.value)}
          style={{ ...inputStyle, width: 50, textAlign: "center", padding: "4px 4px" }}
        />
        <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>%</span>
      </div>
      {manualPercentComplete != null && (
        <button onClick={handleClearPct} style={{ ...linkBtn, color: C.textDim, marginTop: 4, fontSize: 8 }}>
          Reset to auto ({percentComplete}%)
        </button>
      )}

      {/* Hours */}
      <div style={sectionTitle}>Hours</div>
      <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Estimated</div>
          <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>{estimatedHours}h</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Logged</div>
          <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>{hoursLogged}h</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Remaining</div>
          <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: estimatedHours - hoursLogged <= 0 ? "#30D158" : C.text }}>{Math.max(0, estimatedHours - hoursLogged)}h</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          min={0}
          step={0.5}
          placeholder={`${hoursLogged}h (auto)`}
          value={hoursVal}
          onChange={e => handleHoursChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, whiteSpace: "nowrap" }}>
          override
        </span>
      </div>
      {manualHoursLogged != null && (
        <button onClick={handleClearHours} style={{ ...linkBtn, color: C.textDim, marginTop: 4, fontSize: 8 }}>
          Reset to timer-based
        </button>
      )}

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: ov(0.06), marginTop: 8, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, pctVal)}%`,
            background: pctColor,
            borderRadius: 2,
            transition: "width 200ms",
          }}
        />
      </div>

      {/* Assign / Reassign */}
      <div style={sectionTitle}>{estimator ? "Reassign" : "Assign"}</div>
      <select value={assignVal} onChange={e => handleAssign(e.target.value)} style={selectStyle}>
        <option value="">Unassigned</option>
        {estimatorRows.map(r => (
          <option key={r.name} value={r.name}>
            {r.name}
          </option>
        ))}
      </select>

      {/* Delegate */}
      {estimator && (
        <>
          <div style={sectionTitle}>Delegate</div>
          {!showDelegate ? (
            <button
              onClick={() => setShowDelegate(true)}
              style={{
                ...inputStyle,
                cursor: "pointer",
                color: C.textMuted,
                textAlign: "left",
                background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              }}
            >
              Delegate to another estimator…
            </button>
          ) : (
            <select
              autoFocus
              value=""
              onChange={e => handleDelegate(e.target.value)}
              onBlur={() => setShowDelegate(false)}
              style={selectStyle}
            >
              <option value="" disabled>
                Select estimator…
              </option>
              {estimatorRows
                .filter(r => r.name !== estimator)
                .map(r => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
        </>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          paddingTop: 10,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={() => {
            onClose();
            navigate(`/estimate/${id}/info`);
          }}
          style={{ ...linkBtn, color: C.accent, fontSize: 10 }}
        >
          Open Full Details →
        </button>
        <button onClick={onClose} style={{ ...linkBtn, color: C.textDim, fontSize: 10 }}>
          Close
        </button>
      </div>
    </div>
  );
}
