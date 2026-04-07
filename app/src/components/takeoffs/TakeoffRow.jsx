import { useEffect, useRef, useState } from "react";
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
import { TO_COLORS } from "@/utils/takeoffHelpers";

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
  const [colorPopup, setColorPopup] = useState(false);
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
              ? `${to.color}0A`
              : isRevisionAffected
                ? "rgba(245,158,11,0.06)"
                : "transparent",
          borderLeft: isMeasuring
            ? `3px solid ${to.color}`
            : isRevisionAffected && !isSelected
              ? "3px solid #F59E0B"
              : isSelected
                ? `3px solid ${to.color}80`
                : "3px solid transparent",
          boxShadow: isMeasuring ? `inset 0 0 0 1px ${to.color}30` : "none",
          transition: "background 100ms ease-out",
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
          onPointerDown={e => {
            e.stopPropagation();
            console.log("[TakeoffRow] color dot clicked", to.id, "colorPopup was:", colorPopup);
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
          {(to.code || to._aiCosts) && (
            <div
              style={{
                fontSize: 8,
                color: `${C.purple}B0`,
                fontFamily: T.font.mono,
                paddingLeft: 4,
                display: "flex",
                alignItems: "center",
                gap: 3,
                lineHeight: 1.2,
                ...truncate(),
              }}
            >
              {to.code || ""}
              {to._aiCosts && (
                <span
                  style={{
                    color: C.accent,
                    fontSize: 7,
                    fontWeight: T.fontWeight.bold,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    background: `${C.accent}0A`,
                    padding: "0 3px",
                    borderRadius: 2,
                  }}
                  title={`NOVA: M $${fmt2(to._aiCosts.material)} · L $${fmt2(to._aiCosts.labor)} · E $${fmt2(to._aiCosts.equipment)}`}
                >
                  NOVA
                </span>
              )}
            </div>
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
              onPointerDown={e => {
                e.stopPropagation();
                console.log("[TakeoffRow] ··· clicked", to.id);
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
          {/* Floating action menu */}
          {actionMenuId === to.id && (
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
            </div>
          )}
        </div>
        {/* Color/stroke/fill popup — triggered by color dot button */}
        {colorPopup && (() => {
          const btnRect = colorBtnRef.current?.getBoundingClientRect();
          if (!btnRect) return null;
          return (
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
            </div>
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
