import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, truncate } from "@/utils/styles";
import { uid, nn, fmt, fmt2 } from "@/utils/format";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import FormulaExpressionRow from "@/components/takeoffs/FormulaExpressionRow";
import TakeoffDimensionEngine from "@/components/takeoffs/TakeoffDimensionEngine";
import CodePicker from "@/components/takeoffs/CodePicker";
import { TO_COLORS } from "@/utils/takeoffHelpers";
import { hasAllowance } from "@/utils/allowances";

export default function TakeoffRow({
  to,
  C,
  T,
  tkActiveTakeoffId,
  tkSelectedTakeoffId,
  setTkSelectedTakeoffId,
  tkMeasureState,
  setTkMeasureState,
  tkShowVars,
  setTkShowVars,
  tkPanelTier,
  costEditId,
  setCostEditId,
  actionMenuId,
  setActionMenuId,
  actionConfirm,
  setActionConfirm,
  actionMenuPos,
  setActionMenuPos,
  actionMenuRef,
  measureFlashId,
  itemById,
  revisionAffectedIds,
  selectedDrawing,
  selectedDrawingId,
  // Callbacks
  updateTakeoff,
  removeTakeoff,
  engageMeasuring,
  stopMeasuring,
  pauseMeasuring,
  removeMeasurement,
  computeMeasurementValue,
  getMeasuredQty,
  getComputedQty,
  startAutoCount,
  getItemTotal,
  // Drag
  tkDragTakeoff,
  tkDragOverTakeoff,
  tkDragReorder,
  // Data
  takeoffs,
  setTakeoffs,
  setTkTool,
  setTkActivePoints,
}) {
  const rowRef = useRef(null);
  const colorBtnRef = useRef(null);
  const codeBtnRef = useRef(null);
  const [colorPopup, setColorPopup] = useState(false);
  const [codePicker, setCodePicker] = useState(false);
  const isActive = tkActiveTakeoffId === to.id;
  const isSelected = tkSelectedTakeoffId === to.id || isActive;

  // Scroll row into view when selected from canvas click
  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected]);
  const isMeasuring =
    isActive && (tkMeasureState === "measuring" || tkMeasureState === "paused");
  const isPaused = isActive && tkMeasureState === "paused";
  const isRevisionAffected = revisionAffectedIds.has(to.id);
  const isHidden = useDrawingPipelineStore(s => s.hiddenTakeoffIds.has(to.id));
  const computedQty = getComputedQty(to);
  const measuredQty = getMeasuredQty(to);
  const hasMeasurements = (to.measurements || []).length > 0;
  const noScale =
    hasMeasurements && measuredQty === null && unitToTool(to.unit) !== "count";
  const hasFormula = !!(to.formula && to.formula.trim());
  const displayQty = hasMeasurements
    ? hasFormula && computedQty !== null
      ? computedQty
      : measuredQty !== null
        ? measuredQty
        : null
    : nn(to.quantity) || null;
  const ctrlBtnS = {
    width: 20,
    height: 20,
    border: "none",
    background: "transparent",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
  return (
    <div data-takeoff-id={to.id} ref={rowRef}>
      <div
        className={`row${to._aiCosts ? " nova-priced" : ""}${isSelected ? " row-selected" : ""}${isMeasuring ? " row-measuring" : ""}`}
        onDragEnter={() => {
          tkDragOverTakeoff.current = to.id;
        }}
        onDragOver={e => e.preventDefault()}
        onClick={() => {
          setTkSelectedTakeoffId(to.id);
        }}
        style={{
          "--rc": to.color,
          position: "relative",
          zIndex: isSelected && !isMeasuring ? 2 : undefined,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: `${T.space[1]}px ${T.space[2]}px`,
          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
          cursor: "default",
          background: isMeasuring
            ? `${to.color}18`
            : isSelected
              ? `${to.color}18`
              : isRevisionAffected
                ? "rgba(245,158,11,0.06)"
                : "transparent",
          borderLeft: isMeasuring
            ? `3px solid ${to.color}`
            : isRevisionAffected && !isSelected
              ? "3px solid #F59E0B"
              : isSelected
                ? `3px solid ${to.color}`
                : "3px solid transparent",
          boxShadow: isMeasuring
            ? `inset 0 0 0 1px ${to.color}30`
            : isSelected
              ? `inset 0 0 0 1px ${to.color}20`
              : "none",
          transition: "background 100ms ease-out",
          opacity: isHidden ? 0.4 : 1,
        }}
      >
        {/* Play / Pause / Stop — also drag handle for reordering */}
        <div
          draggable
          onDragStart={() => { tkDragTakeoff.current = to.id; }}
          onDragEnd={tkDragReorder}
          style={{
            width: isMeasuring || isPaused ? 38 : 20,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            cursor: "grab",
          }}
          onClick={e => e.stopPropagation()}
        >
          {isActive && tkMeasureState === "measuring" ? (
            <button
              className="icon-btn"
              onClick={() => pauseMeasuring()}
              title="Pause"
              style={ctrlBtnS}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                <rect x="1" y="1" width="3" height="8" rx="0.5" />
                <rect x="6" y="1" width="3" height="8" rx="0.5" />
              </svg>
            </button>
          ) : isPaused ? (
            <button
              className="icon-btn"
              onClick={() => setTkMeasureState("measuring")}
              title="Resume"
              style={ctrlBtnS}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                <polygon points="2,1 9,5 2,9" />
              </svg>
            </button>
          ) : (
            <button
              className="icon-btn"
              onClick={() => engageMeasuring(to.id)}
              title="Start measuring"
              style={{ ...ctrlBtnS, opacity: selectedDrawing?.data ? 1 : 0.3 }}
              disabled={!selectedDrawing?.data}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill={selectedDrawing?.data ? to.color : C.textDim}
              >
                <polygon points="2,1 9,5 2,9" />
              </svg>
            </button>
          )}
          {(isMeasuring || isPaused) && (
            <button
              className="icon-btn"
              onClick={() => stopMeasuring()}
              title="Stop"
              style={ctrlBtnS}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}>
                <rect width="8" height="8" rx="1" />
              </svg>
            </button>
          )}
        </div>
        <button
          ref={colorBtnRef}
          type="button"
          style={{
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 4,
            background: "transparent",
            border: "none",
            flexShrink: 0,
            cursor: "pointer",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={e => {
            e.stopPropagation();
            setColorPopup(p => !p);
          }}
        >
          <div style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: to.color,
            border: colorPopup ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
            boxShadow: colorPopup ? `0 0 6px ${to.color}60` : "none",
            pointerEvents: "none",
          }} />
          {isMeasuring && (
            <div
              style={{
                position: "absolute",
                inset: -2,
                borderRadius: 3,
                border: `2px solid ${to.color}`,
                animation: "pulse 1.5s infinite",
                pointerEvents: "none",
              }}
            />
          )}
        </button>
        {/* Visibility toggle */}
        <button
          type="button"
          title={isHidden ? "Show on canvas" : "Hide on canvas"}
          onClick={e => {
            e.stopPropagation();
            useDrawingPipelineStore.getState().toggleTakeoffVisibility(to.id);
          }}
          style={{
            width: 18, height: 18, padding: 0, border: "none",
            background: "transparent", flexShrink: 0, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: isHidden ? 0.35 : 0.6,
          }}
        >
          {isHidden ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        {/* Description */}
        <div
          style={{ flex: 2, minWidth: 80, minHeight: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <input
            value={to.description}
            onChange={e => updateTakeoff(to.id, "description", e.target.value)}
            placeholder="Description..."
            style={inp(C, {
              background: "transparent",
              border: "1px solid transparent",
              padding: "2px 4px",
              fontSize: 10,
              fontWeight: T.fontWeight.medium,
            })}
          />
          <div
            ref={codeBtnRef}
            style={{
              fontSize: 8,
              color: to.code ? `${C.purple}B0` : C.textDim,
              fontFamily: T.font.mono,
              paddingLeft: 4,
              display: "flex",
              alignItems: "center",
              gap: 3,
              lineHeight: 1.2,
              cursor: "pointer",
              ...truncate(),
            }}
            onClick={e => { e.stopPropagation(); setCodePicker(p => !p); }}
            title="Click to assign division/code"
          >
            {to.code || (
              <span style={{ fontSize: 7, color: C.textDim, opacity: 0.6 }}>+ code</span>
            )}
              {to._aiCosts && (
                <span
                  className="nova-priced"
                  style={{
                    "--rc": "#7C5CFC",
                    color: "#fff",
                    fontSize: 7,
                    fontWeight: T.fontWeight.bold,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    background: "linear-gradient(135deg, #7C5CFC, #6D28D9)",
                    padding: "1px 5px",
                    borderRadius: 3,
                    letterSpacing: "0.5px",
                    boxShadow: "0 0 6px #7C5CFC40",
                  }}
                  title={`NOVA: M $${fmt2(to._aiCosts.material)} · L $${fmt2(to._aiCosts.labor)} · E $${fmt2(to._aiCosts.equipment)}`}
                >
                  NOVA
                </span>
              )}
              {to.assemblyElements && (
                <span
                  style={{
                    color: C.purple,
                    fontSize: 7,
                    fontWeight: T.fontWeight.bold,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    background: `${C.purple}0A`,
                    padding: "0 3px",
                    borderRadius: 2,
                  }}
                  title={`Assembly: ${to.assemblyElements.length} elements`}
                >
                  ASM ({to.assemblyElements.length})
                </span>
              )}
          </div>
          {codePicker && (
            <CodePicker
              to={to}
              C={C}
              T={T}
              anchorRef={codeBtnRef}
              onClose={() => setCodePicker(false)}
              updateTakeoff={updateTakeoff}
            />
          )}
          {/* Estimator attribution badge */}
          {to.createdByName && (
            <div style={{ display: "flex", alignItems: "center", gap: 3, paddingLeft: 4, marginTop: 1 }}>
              <div
                title={`Created by ${to.createdByName}${to.lastModifiedByName && to.lastModifiedByName !== to.createdByName ? ` · Last modified by ${to.lastModifiedByName}` : ""}`}
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: to.createdByColor || C.textDim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 6, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}
              >
                {(to.createdByName || "?")[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 7, color: C.textDim, fontFamily: T.font.sans }}>
                {to.createdByName}
              </span>
            </div>
          )}
        </div>
        {/* Qty */}
        <div style={{ width: 55 }} onClick={e => e.stopPropagation()}>
          {hasMeasurements ? (
            noScale ? (
              <div
                style={{
                  fontSize: 8,
                  color: C.orange,
                  fontWeight: T.fontWeight.semibold,
                  padding: "2px 4px",
                  cursor: "help",
                }}
                title="Set a scale to see quantities"
              >
                Scale
              </div>
            ) : (
              <div
                className={measureFlashId === to.id ? "measure-complete" : ""}
                style={{
                  "--rc": to.color,
                  fontSize: 10,
                  fontWeight: 700,
                  color: measureFlashId === to.id ? to.color : C.text,
                  padding: "2px 4px",
                  fontFamily: T.font.mono,
                  fontFeatureSettings: "'tnum'",
                  borderRadius: 3,
                  transition: "color 300ms ease",
                }}
                title={(() => {
                  const ms = to.measurements || [];
                  const locs = {};
                  const deducts = ms.filter(m => m.mode === "deduct").length;
                  ms.forEach(m => {
                    const loc = m.location || "Unassigned";
                    locs[loc] = (locs[loc] || 0) + 1;
                  });
                  const parts = [];
                  if (deducts > 0) parts.push(`${deducts} deduct(s)`);
                  const locKeys = Object.keys(locs);
                  if (locKeys.length > 1) {
                    locKeys.forEach(k => parts.push(`${k}: ${locs[k]}`));
                  }
                  return parts.length ? `${ms.length} measurements\n${parts.join("\n")}` : `${ms.length} measurement(s)`;
                })()}
              >
                {displayQty}
              </div>
            )
          ) : (
            <input
              type="number"
              value={to.quantity}
              onChange={e => updateTakeoff(to.id, "quantity", e.target.value)}
              placeholder="0"
              style={nInp(C, {
                background: "transparent",
                border: "1px solid transparent",
                padding: "2px 4px",
                fontSize: 10,
                fontWeight: 700,
              })}
            />
          )}
        </div>
        {/* Unit */}
        <div style={{ width: 36 }} onClick={e => e.stopPropagation()}>
          <select
            value={to.unit}
            onChange={e => {
              updateTakeoff(to.id, "unit", e.target.value);
              if (tkActiveTakeoffId === to.id) {
                setTkTool(unitToTool(e.target.value));
                setTkActivePoints([]);
              }
            }}
            style={inp(C, {
              background: "transparent",
              border: "1px solid transparent",
              padding: "2px 1px",
              fontSize: 9,
              color: C.textDim,
            })}
          >
            {["EA", "LF", "SF", "SY", "CY", "CF", "LS", "HR"].map(u => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        {/* Cost columns */}
        {tkPanelTier !== "compact" &&
          (() => {
            const linkedItem = itemById[to.linkedItemId];
            if (!linkedItem || getItemTotal(linkedItem) <= 0) {
              return (
                <>
                  <div style={{ width: 55 }} />
                  <div style={{ width: 65 }} />
                </>
              );
            }
            const itemTotal = getItemTotal(linkedItem);
            const itemQty = nn(linkedItem.quantity);
            const unitCost = itemQty > 0 ? itemTotal / itemQty : 0;
            return (
              <>
                <div
                  style={{
                    width: 55,
                    textAlign: "right",
                    fontSize: 9,
                    fontFeatureSettings: "'tnum'",
                    color: C.textDim,
                    padding: "2px 2px",
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setCostEditId(costEditId === to.id ? null : to.id);
                  }}
                  title={`M: $${fmt2(nn(linkedItem.material))} · L: $${fmt2(nn(linkedItem.labor))} · E: $${fmt2(nn(linkedItem.equipment))} · S: $${fmt2(nn(linkedItem.subcontractor))}`}
                >
                  ${fmt2(unitCost)}
                </div>
                <div
                  style={{
                    width: 65,
                    textAlign: "right",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFeatureSettings: "'tnum'",
                    color: C.green,
                    padding: "2px 2px",
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setCostEditId(costEditId === to.id ? null : to.id);
                  }}
                >
                  {fmt(itemTotal)}
                </div>
              </>
            );
          })()}
        {/* Actions column */}
        <div
          style={{
            width: 44,
            display: "flex",
            gap: 2,
            alignItems: "center",
            position: "relative",
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="tk-row-actions"
            style={{
              display: "flex",
              gap: 2,
              alignItems: "center",
            }}
          >
            <button
              className="icon-btn"
              onClick={e => { e.stopPropagation(); setTkShowVars(tkShowVars === to.id ? null : to.id); }}
              title="Variables & Formula"
              style={{
                minWidth: 24,
                height: 22,
                padding: hasFormula ? "0 5px" : "0 4px",
                border: hasFormula
                  ? `1px solid ${C.accent}40`
                  : `1px solid ${C.border}`,
                background: hasFormula ? `${C.accent}15` : C.bg2,
                color: hasFormula ? C.accent : C.textMuted,
                borderRadius: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: hasFormula ? 9 : 11,
                fontWeight: 700,
                gap: 1,
                transition: T.transition.fast,
                boxShadow: hasFormula ? T.shadow.glowAccent || "none" : "none",
              }}
            >
              {(() => {
                if (!hasFormula) return "\u0192";
                const vars = to.variables || [];
                const hVar = vars.find(
                  v => (v.key || "").toLowerCase() === "height",
                );
                if (hVar) return `\u00D7${hVar.value}'`;
                const fVar = vars.find(
                  v => (v.key || "").toLowerCase() === "factor",
                );
                if (fVar) return `\u00D7${fVar.value}`;
                if (vars.length > 0) return `\u0192=`;
                return "\u0192";
              })()}
            </button>
            <button
              className="icon-btn"
              onClick={e => {
                e.stopPropagation();
                if (actionMenuId === to.id) {
                  setActionMenuId(null);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActionMenuPos({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right,
                  });
                  setActionMenuId(to.id);
                }
                setActionConfirm(null);
              }}
              data-action-toggle="true"
              title="More actions"
              style={{
                width: 24,
                height: 24,
                border: actionMenuId === to.id ? `1px solid ${C.accent}40` : `1px solid ${C.border}`,
                background:
                  actionMenuId === to.id ? `${C.accent}18` : C.bg2,
                color: actionMenuId === to.id ? C.accent : C.textMuted,
                borderRadius: 5,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
                transition: "all 0.15s ease",
                cursor: "pointer",
                flexShrink: 0,
                position: "relative",
                zIndex: 2,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "60"; e.currentTarget.style.color = C.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = actionMenuId === to.id ? C.accent + "40" : C.border; e.currentTarget.style.color = actionMenuId === to.id ? C.accent : C.textMuted; }}
            >
              ···
            </button>
          </div>
          {/* Floating action menu — portal to body to escape transform clipping */}
          {actionMenuId === to.id && createPortal(
            <div
              ref={actionMenuRef}
              style={{
                position: "fixed",
                top: actionMenuPos?.top || 0,
                right: actionMenuPos?.right || 0,
                zIndex: 9999,
                minWidth: 170,
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                boxShadow: T.shadow.lg,
                padding: "4px 0",
                overflow: "hidden",
              }}
              onClick={e => e.stopPropagation()}
            >
              {unitToTool(to.unit) === "count" && selectedDrawing?.data && (
                <button
                  onClick={() => {
                    startAutoCount(to.id);
                    setActionMenuId(null);
                    setActionConfirm(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    border: "none",
                    background: "transparent",
                    color: C.text,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: T.transition.fast,
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = `${C.accent}10`)
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.purple}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20V10 M18 20v-4 M6 20v-6" />
                  </svg>
                  <span style={{ color: C.purple }}>Auto Count</span>
                </button>
              )}
              {(to.measurements || []).length > 0 && (
                <button
                  onClick={() => {
                    const ms = to.measurements || [];
                    const removed = ms[ms.length - 1];
                    setTakeoffs(
                      takeoffs.map(t =>
                        t.id === to.id ? { ...t, measurements: ms.slice(0, -1) } : t
                      )
                    );
                    setActionMenuId(null);
                    setActionConfirm(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    border: "none",
                    background: "transparent",
                    color: C.text,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: T.transition.fast,
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.background = `${C.accent}10`)
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10h6L5 6" /><path d="M3 10a9 9 0 1 1 2.6 6.4" />
                  </svg>
                  <span>Undo Last Measurement</span>
                </button>
              )}
              {(to.measurements || []).length > 1 && (
                <>
                  <div style={{ padding: "4px 12px 2px", fontSize: 8, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Measurements ({(to.measurements || []).length})
                  </div>
                  <div style={{ maxHeight: 120, overflow: "auto" }}>
                    {(to.measurements || []).map((m, idx) => {
                      const label = m.type === "count" ? "Point" : m.type === "linear" ? `Line (${(m.points || []).length} pts)` : `Area (${(m.points || []).length} pts)`;
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "3px 12px 3px 20px", fontSize: 10,
                            color: C.text, cursor: "default",
                          }}
                        >
                          <span style={{ fontSize: 8, color: C.textDim, fontFamily: "monospace", minWidth: 16 }}>#{idx + 1}</span>
                          <span style={{ flex: 1, fontSize: 9 }}>{label}</span>
                          {m.location && (
                            <span style={{ fontSize: 7, color: C.accent, fontWeight: 500 }}>{m.location}</span>
                          )}
                          {m.mode === "deduct" && (
                            <span style={{ fontSize: 7, color: C.red, fontWeight: 700 }}>DED</span>
                          )}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              // Toggle add/deduct mode on this measurement
                              const newMode = m.mode === "deduct" ? "add" : "deduct";
                              setTakeoffs(takeoffs.map(t =>
                                t.id === to.id
                                  ? { ...t, measurements: t.measurements.map(mm => mm.id === m.id ? { ...mm, mode: newMode } : mm) }
                                  : t
                              ));
                            }}
                            style={{
                              background: "none", border: "none",
                              color: m.mode === "deduct" ? C.green : C.orange,
                              fontSize: 8, cursor: "pointer", padding: "2px 3px",
                              opacity: 0.7, borderRadius: 3,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                            title={m.mode === "deduct" ? "Switch to Add" : "Switch to Deduct"}
                          >
                            {m.mode === "deduct" ? "+" : "−"}
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              removeMeasurement(to.id, m.id);
                            }}
                            style={{
                              background: "none", border: "none", color: C.red,
                              fontSize: 10, cursor: "pointer", padding: "2px 4px",
                              opacity: 0.7, borderRadius: 3,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                            title={`Remove measurement #${idx + 1}`}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                </>
              )}
              <button
                onClick={() => {
                  const nt = {
                    ...takeoffs.find(t => t.id === to.id),
                    id: uid(),
                    linkedItemId: "",
                    measurements: [],
                  };
                  setTakeoffs([...takeoffs, nt]);
                  setActionMenuId(null);
                  setActionConfirm(null);
                }}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  border: "none",
                  background: "transparent",
                  color: C.text,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  transition: T.transition.fast,
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = `${C.accent}10`)
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Ic d={I.copy} size={11} color={C.textDim} />
                <span>Duplicate</span>
              </button>
              {(to.measurements || []).length > 0 && (
                <button
                  onClick={() => {
                    if (actionConfirm === "clear") {
                      const cnt = (to.measurements || []).length;
                      useDrawingPipelineStore.getState().clearMeasurements(to.id);
                      useUiStore
                        .getState()
                        .showToast(`Cleared ${cnt} measurements`);
                      setActionMenuId(null);
                      setActionConfirm(null);
                    } else {
                      setActionConfirm("clear");
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    border: "none",
                    background:
                      actionConfirm === "clear" ? `${C.orange}15` : "transparent",
                    color: C.orange,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    transition: T.transition.fast,
                  }}
                  onMouseEnter={e => {
                    if (actionConfirm !== "clear")
                      e.currentTarget.style.background = `${C.orange}10`;
                  }}
                  onMouseLeave={e => {
                    if (actionConfirm !== "clear")
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6" />
                  </svg>
                  <span>
                    {actionConfirm === "clear"
                      ? `Clear ${(to.measurements || []).length} measurements?`
                      : `Clear (${(to.measurements || []).length})`}
                  </span>
                </button>
              )}
              {/* ── Estimate Actions ── */}
              {(() => {
                const li = itemById[to.linkedItemId];
                if (!li) return (
                  <>
                    <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                    <div style={{ padding: "5px 12px", fontSize: 10, color: C.textDim, fontStyle: "italic" }}>
                      No linked estimate item
                    </div>
                  </>
                );
                const isExcluded = !!li.excluded;
                const isAllowance = hasAllowance(li);
                const subCount = (li.subItems || []).length;
                const setPricingModal = useUiStore.getState().setPricingModal;
                const updateItem = useItemsStore.getState().updateItem;
                const removeItem = useItemsStore.getState().removeItem;
                const btnStyle = {
                  width: "100%", padding: "7px 12px", border: "none",
                  background: "transparent", color: C.text,
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 12, cursor: "pointer", transition: T.transition.fast,
                };
                return (
                  <>
                    <div style={{ height: 1, background: C.border, margin: "4px 8px" }} />
                    <div style={{ padding: "4px 12px 2px", fontSize: 8, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Estimate
                    </div>
                    {/* Allowance toggle */}
                    <button
                      onClick={() => {
                        updateItem(li.id, "allowanceOf", isAllowance ? "" : "all");
                        setActionMenuId(null); setActionConfirm(null);
                      }}
                      style={{ ...btnStyle, color: isAllowance ? C.orange : C.text }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                      </svg>
                      <span>{isAllowance ? "Remove Allowance" : "Flag as Allowance"}</span>
                      {isAllowance && <span style={{ marginLeft: "auto", fontSize: 9, color: C.orange, fontWeight: 700 }}>ALLOW</span>}
                    </button>
                    {/* AI Price */}
                    <button
                      onClick={() => {
                        setPricingModal(li);
                        setActionMenuId(null); setActionConfirm(null);
                      }}
                      style={btnStyle}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <Ic d={I.ai} size={11} color={C.accent} />
                      <span style={{ color: C.accent }}>AI Price</span>
                    </button>
                    {/* Exclude toggle */}
                    <button
                      onClick={() => {
                        updateItem(li.id, "excluded", !isExcluded);
                        setActionMenuId(null); setActionConfirm(null);
                      }}
                      style={{ ...btnStyle, color: isExcluded ? C.orange : C.text }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}10`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      <span>{isExcluded ? "Include in Estimate" : "Exclude from Estimate"}</span>
                    </button>
                    {/* Sub-items indicator */}
                    {subCount > 0 && (
                      <div style={{ padding: "5px 12px", fontSize: 11, color: C.textDim, display: "flex", alignItems: "center", gap: 6 }}>
                        <Ic d={I.layers} size={11} color={C.textDim} />
                        <span>{subCount} sub-item{subCount !== 1 ? "s" : ""} — expand panel for details</span>
                      </div>
                    )}
                    {/* Delete from estimate */}
                    <button
                      onClick={() => {
                        if (actionConfirm === "deleteItem") {
                          removeItem(li.id);
                          setActionMenuId(null); setActionConfirm(null);
                        } else {
                          setActionConfirm("deleteItem");
                        }
                      }}
                      style={{ ...btnStyle, background: actionConfirm === "deleteItem" ? `${C.red}15` : "transparent", color: C.red }}
                      onMouseEnter={e => { if (actionConfirm !== "deleteItem") e.currentTarget.style.background = `${C.red}10`; }}
                      onMouseLeave={e => { if (actionConfirm !== "deleteItem") e.currentTarget.style.background = "transparent"; }}
                    >
                      <Ic d={I.trash} size={11} color={C.red} />
                      <span>{actionConfirm === "deleteItem" ? "Delete estimate item — confirm?" : "Delete from Estimate"}</span>
                    </button>
                  </>
                );
              })()}
              <div
                style={{ height: 1, background: C.border, margin: "4px 8px" }}
              />
              <button
                onClick={() => {
                  if (actionConfirm === "delete") {
                    removeTakeoff(to.id);
                    setActionMenuId(null);
                    setActionConfirm(null);
                  } else {
                    setActionConfirm("delete");
                  }
                }}
                style={{
                  width: "100%",
                  padding: "7px 12px",
                  border: "none",
                  background:
                    actionConfirm === "delete" ? `${C.red}15` : "transparent",
                  color: C.red,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  transition: T.transition.fast,
                }}
                onMouseEnter={e => {
                  if (actionConfirm !== "delete")
                    e.currentTarget.style.background = `${C.red}10`;
                }}
                onMouseLeave={e => {
                  if (actionConfirm !== "delete")
                    e.currentTarget.style.background = "transparent";
                }}
              >
                <Ic d={I.trash} size={11} color={C.red} />
                <span>
                  {actionConfirm === "delete"
                    ? "Delete -- are you sure?"
                    : "Delete"}
                </span>
              </button>
            </div>,
            document.body,
          )}
        </div>
        {/* Color/stroke/fill popup — triggered by color dot button */}
        {colorPopup && (() => {
          const btnRect = colorBtnRef.current?.getBoundingClientRect();
          if (!btnRect) return null;
          return createPortal(
            <div
              style={{
                position: "fixed",
                top: btnRect.bottom + 6,
                left: Math.min(btnRect.left, window.innerWidth - 210),
                zIndex: 9999,
                width: 200,
                padding: "10px 12px",
                background: C.bg1,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.3)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Style</span>
                <button onClick={() => setColorPopup(false)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                {TO_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => updateTakeoff(to.id, "color", c)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: c,
                      cursor: "pointer",
                      border: to.color === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.1)",
                      boxShadow: to.color === c ? `0 0 0 1px ${c}, 0 0 8px ${c}50` : "none",
                      transition: "all 100ms",
                    }}
                  />
                ))}
                <div
                  style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)`,
                    cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  onClick={e => { e.stopPropagation(); e.currentTarget.querySelector("input")?.click(); }}
                >
                  <input type="color" value={to.color} onChange={e => updateTakeoff(to.id, "color", e.target.value)} onClick={e => e.stopPropagation()} style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, minWidth: 32 }}>Stroke</span>
                <input type="range" min="1" max="10" step="1" value={to.strokeWidth ?? 3} onChange={e => updateTakeoff(to.id, "strokeWidth", Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: to.color, cursor: "pointer" }} />
                <span style={{ fontSize: 9, color: C.text, fontFamily: T.font.mono || T.font.sans, minWidth: 22, textAlign: "right" }}>{to.strokeWidth ?? 3}px</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, minWidth: 32 }}>Fill</span>
                <input type="range" min="5" max="100" step="5" value={to.fillOpacity ?? 20} onChange={e => updateTakeoff(to.id, "fillOpacity", Number(e.target.value))} style={{ flex: 1, height: 3, accentColor: to.color, cursor: "pointer" }} />
                <span style={{ fontSize: 9, color: C.text, fontFamily: T.font.mono || T.font.sans, minWidth: 22, textAlign: "right" }}>{to.fillOpacity ?? 20}%</span>
              </div>
            </div>,
            document.body,
          );
        })()}
        {/* Inline cost edit popover */}
        {costEditId === to.id &&
          tkPanelTier !== "compact" &&
          (() => {
            const li = itemById[to.linkedItemId];
            if (!li)
              return (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: T.z.dropdown + 1,
                    padding: "8px 12px",
                    background: C.bg1,
                    border: `1px solid ${C.border}`,
                    borderRadius: "0 0 8px 8px",
                    boxShadow: T.shadow.md,
                    fontSize: 9,
                    color: C.textDim,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  No linked estimate item yet
                </div>
              );
            const upd = (field, val) =>
              useItemsStore.getState().updateItem(li.id, field, Number(val) || 0);
            const costFields = [
              { key: "material", label: "Material", short: "M" },
              { key: "labor", label: "Labor", short: "L" },
              { key: "equipment", label: "Equipment", short: "E" },
              { key: "subcontractor", label: "Sub", short: "S" },
            ];
            return (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: T.z.dropdown + 1,
                  padding: "8px 10px",
                  background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`,
                  border: `1px solid ${C.accent}30`,
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  boxShadow: T.shadow.md,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: 8, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                  Unit Costs
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {costFields.map(f => (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, width: 12 }}>{f.short}</span>
                      <input
                        type="number"
                        value={nn(li[f.key]) || ""}
                        onChange={e => upd(f.key, e.target.value)}
                        placeholder="0"
                        style={nInp(C, { background: C.bg2, border: `1px solid ${C.border}`, padding: "3px 5px", fontSize: 10, fontWeight: 600, borderRadius: 4, width: "100%", fontFeatureSettings: "'tnum'" })}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 8, color: C.textDim }}>
                    Total: <strong style={{ color: C.green }}>{fmt(getItemTotal(li))}</strong>
                  </span>
                  <button onClick={() => setCostEditId(null)} style={{ fontSize: 8, color: C.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    Done
                  </button>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Inline measurement list — expands when row is selected */}
      {isSelected && (
        <div
          style={{
            background: `${to.color}08`,
            borderLeft: `3px solid ${to.color}40`,
            borderBottom: `1px solid ${C.border}`,
            padding: "4px 8px 6px 8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {hasMeasurements ? `${(to.measurements || []).length} Measurement${(to.measurements || []).length !== 1 ? "s" : ""}` : "No measurements yet"}
            </span>
            {hasMeasurements && <span style={{ fontSize: 8, color: C.textDim }}>⌫ undo last · ⇧⌦ delete item</span>}
          </div>
          {!hasMeasurements && (
            <div style={{ fontSize: 9, color: C.textDim, padding: "2px 4px" }}>
              Press ▶ to start measuring — each click will appear here
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(to.measurements || []).map((m, idx) => {
              const isLast = idx === (to.measurements || []).length - 1;
              const label = m.type === "count"
                ? "Click"
                : m.type === "linear"
                  ? `Line (${(m.points || []).length} pts)`
                  : m.type === "area"
                    ? `Area (${(m.points || []).length} pts)`
                    : m.type;
              const val = computeMeasurementValue ? computeMeasurementValue(m) : null;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 4px",
                    borderRadius: 3,
                    background: isLast ? `${to.color}12` : "transparent",
                    border: isLast ? `1px solid ${to.color}20` : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 8, color: C.textDim, fontFamily: "monospace", minWidth: 18, textAlign: "right" }}>
                    #{idx + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 9, color: C.text }}>{label}</span>
                  {val !== null && val !== undefined && (
                    <span style={{ fontSize: 8, color: C.accent, fontFamily: "monospace" }}>
                      {m.type === "count" ? "×1" : fmt2(val)}
                    </span>
                  )}
                  {m.location && (
                    <span style={{ fontSize: 7, color: C.accent, fontWeight: 500 }}>{m.location}</span>
                  )}
                  {m.mode === "deduct" && (
                    <span style={{ fontSize: 7, color: C.red, fontWeight: 700, padding: "0 3px", background: `${C.red}15`, borderRadius: 2 }}>DED</span>
                  )}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const newMode = m.mode === "deduct" ? "add" : "deduct";
                      setTakeoffs(takeoffs.map(t =>
                        t.id === to.id
                          ? { ...t, measurements: t.measurements.map(mm => mm.id === m.id ? { ...mm, mode: newMode } : mm) }
                          : t
                      ));
                    }}
                    title={m.mode === "deduct" ? "Switch to Add" : "Switch to Deduct"}
                    style={{ background: "none", border: "none", color: m.mode === "deduct" ? C.green : C.textDim, fontSize: 9, cursor: "pointer", padding: "2px 3px", opacity: 0.6, borderRadius: 3, lineHeight: 1 }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                  >
                    {m.mode === "deduct" ? "+" : "−"}
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      removeMeasurement(to.id, m.id);
                    }}
                    title={`Remove measurement #${idx + 1}`}
                    style={{ background: "none", border: "none", color: C.red, fontSize: 10, cursor: "pointer", padding: "2px 3px", opacity: 0.5, borderRadius: 3, lineHeight: 1 }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline formula expression */}
      {hasFormula &&
        computedQty !== null &&
        displayQty !== null &&
        tkShowVars !== to.id && (
          <FormulaExpressionRow
            takeoff={to}
            measuredQty={displayQty}
            computedQty={computedQty}
            updateTakeoff={updateTakeoff}
            C={C}
            T={T}
          />
        )}

      {/* Dimension Engine */}
      {tkShowVars === to.id && (
        <TakeoffDimensionEngine
          takeoff={to}
          updateTakeoff={updateTakeoff}
          measuredQty={measuredQty}
          computedQty={computedQty}
          measurements={to.measurements || []}
          computeMeasurementValue={computeMeasurementValue}
          selectedDrawingId={selectedDrawingId}
          removeMeasurement={removeMeasurement}
          drawingViewType={selectedDrawing?.viewType || null}
        />
      )}
    </div>
  );
}
