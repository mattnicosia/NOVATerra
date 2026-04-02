/**
 * PredictiveTakeoffPanel — AI-suggested takeoff items from scan results
 *
 * After NOVA scans drawings and detects schedules, this panel proposes
 * takeoff items the estimator should measure. Users review, accept, or reject.
 *
 * Sprint 3.1: THE star feature — "NOVA suggests what to measure"
 */

import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card, inp } from "@/utils/styles";

/**
 * @param {{ suggestions: Array, onAccept: fn, onReject: fn, onAcceptAll: fn, onClose: fn }} props
 *
 * suggestion shape:
 * {
 *   id, description, code, division, unit, quantity,
 *   confidence: "high"|"medium"|"low",
 *   source: { type: "schedule"|"notes"|"inference", scheduleType?, entry?, note? },
 *   reasoning: string,
 *   estimatedCost?: { material, labor, equipment, sub },
 * }
 */
export default function PredictiveTakeoffPanel({ suggestions = [], onAccept, onReject, onAcceptAll, onClose }) {
  const C = useTheme();
  const T = C.T;
  const [accepted, setAccepted] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [filterConf, setFilterConf] = useState("all"); // "all" | "high" | "medium" | "low"
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const pending = useMemo(
    () =>
      suggestions.filter(s => {
        if (accepted.has(s.id) || rejected.has(s.id)) return false;
        if (filterConf !== "all" && s.confidence !== filterConf) return false;
        return true;
      }),
    [suggestions, accepted, rejected, filterConf],
  );

  const stats = useMemo(() => {
    const high = suggestions.filter(s => s.confidence === "high").length;
    const med = suggestions.filter(s => s.confidence === "medium").length;
    const low = suggestions.filter(s => s.confidence === "low").length;
    return { high, med, low, total: suggestions.length, accepted: accepted.size, rejected: rejected.size };
  }, [suggestions, accepted, rejected]);

  const handleAccept = s => {
    setAccepted(prev => new Set([...prev, s.id]));
    onAccept?.(s);
  };

  const handleReject = s => {
    setRejected(prev => new Set([...prev, s.id]));
    onReject?.(s);
  };

  const handleAcceptAllPending = () => {
    const ids = new Set([...accepted, ...pending.map(s => s.id)]);
    setAccepted(ids);
    onAcceptAll?.(pending);
  };

  if (suggestions.length === 0) return null;

  return (
    <div
      style={{
        ...card(C),
        padding: 0,
        overflow: "hidden",
        border: `1px solid ${C.accent}25`,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: `${T.space[3]}px ${T.space[4]}px`,
          background: `linear-gradient(135deg, ${C.accent}08, ${C.purple || C.accent}08)`,
          borderBottom: `1px solid ${C.accent}15`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.ai} size={16} color={C.accent} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>NOVA Predictive Takeoffs</div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
              {stats.total} suggestions · {stats.accepted} accepted · {stats.rejected} dismissed
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {pending.length > 0 && (
            <button
              onClick={handleAcceptAllPending}
              style={bt(C, {
                padding: "4px 10px",
                fontSize: 9,
                fontWeight: 600,
                background: C.green,
                color: "#fff",
              })}
            >
              Accept All ({pending.length})
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={bt(C, {
                padding: "4px 8px",
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
              })}
            >
              <Ic d={I.close} size={10} color={C.textDim} />
            </button>
          )}
        </div>
      </div>

      {/* Confidence filter */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: `${T.space[2]}px ${T.space[4]}px`,
          borderBottom: `1px solid ${C.border}08`,
        }}
      >
        {[
          { k: "all", l: `All (${stats.total})` },
          { k: "high", l: `High (${stats.high})`, c: C.green },
          { k: "medium", l: `Med (${stats.med})`, c: C.orange },
          { k: "low", l: `Low (${stats.low})`, c: C.textDim },
        ].map(f => (
          <button
            key={f.k}
            onClick={() => setFilterConf(f.k)}
            style={bt(C, {
              padding: "2px 8px",
              fontSize: 8,
              fontWeight: 600,
              background: filterConf === f.k ? `${f.c || C.accent}15` : "transparent",
              color: filterConf === f.k ? f.c || C.accent : C.textDim,
              border: `1px solid ${filterConf === f.k ? (f.c || C.accent) + "30" : C.border}`,
              borderRadius: T.radius.full,
            })}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* Suggestions list */}
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {pending.length === 0 ? (
          <div style={{ padding: T.space[5], textAlign: "center", color: C.textDim, fontSize: 11 }}>
            {accepted.size + rejected.size === suggestions.length
              ? "All suggestions reviewed!"
              : "No suggestions match this filter."}
          </div>
        ) : (
          pending.map(s => {
            const confColor = s.confidence === "high" ? C.green : s.confidence === "medium" ? C.orange : C.textDim;
            const isExpanded = expandedId === s.id;

            return (
              <div
                key={s.id}
                style={{
                  borderBottom: `1px solid ${C.border}06`,
                  transition: T.transition.fast,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[2],
                    padding: `${T.space[2]}px ${T.space[4]}px`,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  {/* Confidence dot */}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: confColor,
                      flexShrink: 0,
                    }}
                  />

                  {/* Item info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{s.description}</span>
                      {s.code && (
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: `${C.accent}10`,
                            color: C.accent,
                            fontWeight: 600,
                          }}
                        >
                          {s.code}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                      {s.quantity || "?"} {s.unit || ""} · {s.division || ""}
                      {s.source?.type && (
                        <span style={{ marginLeft: 6, fontStyle: "italic" }}>
                          from {s.source.type}
                          {s.source.scheduleType ? ` (${s.source.scheduleType})` : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Confidence badge */}
                  <span
                    style={{
                      fontSize: 7,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: T.radius.full,
                      background: `${confColor}15`,
                      color: confColor,
                      textTransform: "uppercase",
                    }}
                  >
                    {s.confidence}
                  </span>

                  {/* Accept / Reject */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleAccept(s);
                      }}
                      title="Accept"
                      style={bt(C, {
                        padding: "4px 8px",
                        fontSize: 9,
                        fontWeight: 600,
                        background: `${C.green}12`,
                        color: C.green,
                        border: `1px solid ${C.green}30`,
                      })}
                    >
                      <Ic d={I.check} size={10} color={C.green} />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleReject(s);
                      }}
                      title="Dismiss"
                      style={bt(C, {
                        padding: "4px 8px",
                        fontSize: 9,
                        background: "transparent",
                        color: C.textDim,
                        border: `1px solid ${C.border}`,
                      })}
                    >
                      <Ic d={I.close} size={10} color={C.textDim} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail + inline edit */}
                {isExpanded && (
                  <div
                    style={{
                      padding: `${T.space[2]}px ${T.space[4]}px ${T.space[3]}px`,
                      paddingLeft: T.space[6],
                      background: C.bg2,
                      fontSize: 10,
                      lineHeight: 1.6,
                    }}
                  >
                    {s.reasoning && (
                      <div style={{ color: C.textDim, marginBottom: 4 }}>
                        <strong style={{ color: C.text }}>Why:</strong> {s.reasoning}
                      </div>
                    )}

                    {/* ── Inline Edit Mode ── */}
                    {editingId === s.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Qty</label>
                          <input
                            type="number"
                            value={editValues.quantity ?? s.quantity ?? 1}
                            onChange={e => setEditValues(v => ({ ...v, quantity: Number(e.target.value) }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 60, borderRadius: 4 }) }}
                          />
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Unit</label>
                          <input
                            value={editValues.unit ?? s.unit ?? ""}
                            onChange={e => setEditValues(v => ({ ...v, unit: e.target.value }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 50, borderRadius: 4 }) }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Mat</label>
                          <input
                            type="number"
                            value={editValues.material ?? s.estimatedCost?.material ?? 0}
                            onChange={e => setEditValues(v => ({ ...v, material: Number(e.target.value) }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 70, borderRadius: 4 }) }}
                          />
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Lab</label>
                          <input
                            type="number"
                            value={editValues.labor ?? s.estimatedCost?.labor ?? 0}
                            onChange={e => setEditValues(v => ({ ...v, labor: Number(e.target.value) }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 70, borderRadius: 4 }) }}
                          />
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Eqp</label>
                          <input
                            type="number"
                            value={editValues.equipment ?? s.estimatedCost?.equipment ?? 0}
                            onChange={e => setEditValues(v => ({ ...v, equipment: Number(e.target.value) }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 70, borderRadius: 4 }) }}
                          />
                          <label style={{ color: C.textDim, fontSize: 9, minWidth: 30 }}>Sub</label>
                          <input
                            type="number"
                            value={editValues.sub ?? s.estimatedCost?.sub ?? 0}
                            onChange={e => setEditValues(v => ({ ...v, sub: Number(e.target.value) }))}
                            style={{ ...inp(C, { padding: "3px 6px", fontSize: 10, width: 70, borderRadius: 4 }) }}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const edited = {
                                ...s,
                                quantity: editValues.quantity ?? s.quantity,
                                unit: editValues.unit ?? s.unit,
                                estimatedCost: {
                                  material: editValues.material ?? s.estimatedCost?.material ?? 0,
                                  labor: editValues.labor ?? s.estimatedCost?.labor ?? 0,
                                  equipment: editValues.equipment ?? s.estimatedCost?.equipment ?? 0,
                                  sub: editValues.sub ?? s.estimatedCost?.sub ?? 0,
                                },
                              };
                              handleAccept(edited);
                              setEditingId(null);
                              setEditValues({});
                            }}
                            style={bt(C, { padding: "3px 10px", fontSize: 9, fontWeight: 600, background: C.green, color: "#fff" })}
                          >
                            Accept Edited
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(null); setEditValues({}); }}
                            style={bt(C, { padding: "3px 10px", fontSize: 9, color: C.textDim })}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {s.estimatedCost && (
                          <div style={{ display: "flex", gap: T.space[3], color: C.textDim }}>
                            {s.estimatedCost.material > 0 && <span>Mat: ${Math.round(s.estimatedCost.material).toLocaleString()}</span>}
                            {s.estimatedCost.labor > 0 && <span>Lab: ${Math.round(s.estimatedCost.labor).toLocaleString()}</span>}
                            {s.estimatedCost.equipment > 0 && <span>Equip: ${Math.round(s.estimatedCost.equipment).toLocaleString()}</span>}
                            {s.estimatedCost.sub > 0 && <span>Sub: ${Math.round(s.estimatedCost.sub).toLocaleString()}</span>}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setEditingId(s.id);
                              setEditValues({
                                quantity: s.quantity,
                                unit: s.unit,
                                material: s.estimatedCost?.material || 0,
                                labor: s.estimatedCost?.labor || 0,
                                equipment: s.estimatedCost?.equipment || 0,
                                sub: s.estimatedCost?.sub || 0,
                              });
                            }}
                            style={bt(C, { padding: "2px 8px", fontSize: 8, color: C.accent, background: `${C.accent}10`, border: `1px solid ${C.accent}25` })}
                          >
                            <Ic d={I.edit} size={8} color={C.accent} /> Edit before accepting
                          </button>
                        </div>
                      </>
                    )}

                    {s.source?.entry && (
                      <div style={{ color: C.textDim, marginTop: 2 }}>
                        <strong style={{ color: C.text }}>Source:</strong>{" "}
                        {typeof s.source.entry === "string"
                          ? s.source.entry
                          : `${s.source.entry.mark || ""} ${s.source.entry.type || ""} — ${s.source.entry.description || ""}`.trim()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
