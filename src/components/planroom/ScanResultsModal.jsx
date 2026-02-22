import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';
import { SCHEDULE_TYPES } from '@/utils/scheduleParsers';

const fmt = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};
const fmtSF = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
};

export default function ScanResultsModal({ scanResults, onClose, onApplyToEstimate, onSaveOnly }) {
  const C = useTheme();
  const T = C.T;
  const [tab, setTab] = useState("schedules");
  const [selectedItems, setSelectedItems] = useState(() => {
    // Pre-select all line items
    if (scanResults?.lineItems) {
      return new Set(scanResults.lineItems.map((_, i) => i));
    }
    return new Set();
  });

  if (!scanResults) return null;

  const { schedules = [], rom, lineItems = [] } = scanResults;

  // Group schedules by type
  const grouped = {};
  schedules.forEach(s => {
    if (!grouped[s.type]) grouped[s.type] = [];
    grouped[s.type].push(s);
  });

  const totalScheduleEntries = schedules.reduce((sum, s) => sum + (s.entries?.length || 0), 0);

  const toggleItem = (idx) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedItems.size === lineItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(lineItems.map((_, i) => i)));
    }
  };

  const handleApply = () => {
    const items = lineItems.filter((_, i) => selectedItems.has(i));
    onApplyToEstimate(items);
  };

  return (
    <Modal extraWide onClose={onClose}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[4] }}>
        <div>
          <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
            <Ic d={I.ai} size={18} color={C.accent} /> Project Scan Results
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {totalScheduleEntries} items across {schedules.length} schedule{schedules.length !== 1 ? "s" : ""} on {new Set(schedules.map(s => s.sheetId)).size} sheet{new Set(schedules.map(s => s.sheetId)).size !== 1 ? "s" : ""}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer", padding: 4 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "inline-flex", gap: 0, marginBottom: T.space[4], background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
        {[
          { k: "schedules", l: "Schedules", count: totalScheduleEntries },
          { k: "rom", l: "ROM Overview", count: null },
          { k: "items", l: "Line Items", count: lineItems.length },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={bt(C, {
              background: tab === t.k ? C.accent : "transparent",
              color: tab === t.k ? "#fff" : C.textMuted,
              padding: "6px 16px", fontSize: 11, border: "none", borderRadius: T.radius.sm,
            })}>
            {t.l}{t.count != null ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: Schedules ═══ */}
      {tab === "schedules" && (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {Object.keys(grouped).length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
              No schedules detected on the uploaded drawings.
            </div>
          )}
          {Object.entries(grouped).map(([type, schedulesOfType]) => {
            const typeConfig = SCHEDULE_TYPES.find(t => t.id === type);
            const totalEntries = schedulesOfType.reduce((sum, s) => sum + (s.entries?.length || 0), 0);

            return (
              <ScheduleGroup key={type} C={C} T={T}
                label={typeConfig?.label || type}
                count={totalEntries}
                schedules={schedulesOfType}
                outputFields={typeConfig?.outputFields || []}
              />
            );
          })}
        </div>
      )}

      {/* ═══ TAB 2: ROM Overview ═══ */}
      {tab === "rom" && rom && (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {/* SF Missing / Estimated Warning */}
          {rom.sfMissing && (
            <div style={{ padding: "8px 12px", background: "rgba(234,88,12,0.08)", borderRadius: 6, border: "1px solid rgba(234,88,12,0.25)", marginBottom: 12, fontSize: 11, color: C.orange }}>
              <strong>Project SF not set.</strong> Enter project square footage in Project Info for accurate ROM totals. Currently showing $/SF rates only.
            </div>
          )}
          {rom.sfEstimated && rom.sfEstimateDetails && (
            <div style={{ padding: "8px 12px", background: `${C.blue}08`, borderRadius: 6, border: `1px solid ${C.blue}20`, marginBottom: 12, fontSize: 11, color: C.blue }}>
              <strong>AI-Estimated SF:</strong> {Math.round(rom.projectSF).toLocaleString()} SF
              <span style={{ color: C.textDim, marginLeft: 6 }}>({rom.sfEstimateDetails.confidence} confidence — {rom.sfEstimateDetails.reasoning})</span>
            </div>
          )}
          {/* Project summary card */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", background: `${C.accent}08`, borderRadius: 8, border: `1px solid ${C.accent}20` }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Project Size{rom.sfEstimated ? " (AI Est.)" : ""}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{rom.projectSF ? Math.round(rom.projectSF).toLocaleString() : "—"} SF</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", background: `${C.green}08`, borderRadius: 8, border: `1px solid ${C.green}20` }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>ROM Range</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{fmt(rom.totals?.low)} – {fmt(rom.totals?.high)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, padding: "12px 16px", background: `${C.purple}08`, borderRadius: 8, border: `1px solid ${C.purple}20` }}>
              <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Midpoint Estimate</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.purple }}>{fmt(rom.totals?.mid)}</div>
            </div>
          </div>

          {/* AI notes */}
          {rom.aiNotes && (
            <div style={{ padding: "8px 12px", background: `${C.blue}08`, borderRadius: 6, border: `1px solid ${C.blue}20`, marginBottom: 12, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
              <strong style={{ color: C.blue }}>AI Assessment:</strong> {rom.aiNotes}
            </div>
          )}

          {/* Calibration indicator */}
          {rom.calibrated ? (
            <div style={{ padding: "6px 12px", background: `${C.green}08`, borderRadius: 6, border: `1px solid ${C.green}20`, marginBottom: 12, fontSize: 10, color: C.green, fontWeight: 500 }}>
              ✓ Calibrated using data from {rom.calibrationCount} previous estimate{rom.calibrationCount !== 1 ? "s" : ""}
            </div>
          ) : (
            <div style={{ padding: "6px 12px", background: `${C.accent}08`, borderRadius: 6, border: `1px solid ${C.accent}20`, marginBottom: 12, fontSize: 10, color: C.accent, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Improve accuracy by importing past proposals in <strong>Settings &rarr; Cost History</strong></span>
            </div>
          )}

          {/* Division table */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 80px 80px 80px 70px", padding: "6px 10px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <div>Div</div><div>Description</div><div style={{ textAlign: "right" }}>Low</div><div style={{ textAlign: "right" }}>Mid</div><div style={{ textAlign: "right" }}>High</div><div style={{ textAlign: "right" }}>$/SF</div>
            </div>
            {Object.entries(rom.divisions || {}).sort(([a], [b]) => a.localeCompare(b)).map(([div, data]) => (
              <div key={div} style={{ display: "grid", gridTemplateColumns: "44px 1fr 80px 80px 80px 70px", padding: "5px 10px", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", background: data.aiReason ? `${C.blue}04` : "transparent" }}>
                <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: C.accent }}>{div}</div>
                <div style={{ fontSize: 10, color: C.text }}>
                  {data.label}
                  {data.aiReason && <span style={{ display: "block", fontSize: 8, color: C.blue, fontStyle: "italic" }}>{data.aiReason}</span>}
                </div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{fmt(data.total?.low)}</div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{fmt(data.total?.mid)}</div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{fmt(data.total?.high)}</div>
                <div style={{ fontSize: 9, textAlign: "right", color: C.textDim, fontFamily: "'DM Mono',monospace" }}>{fmtSF(data.perSF?.mid)}</div>
              </div>
            ))}
            {/* Totals row */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 80px 80px 80px 70px", padding: "8px 10px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>TOTAL</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{fmt(rom.totals?.low)}</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "'DM Mono',monospace" }}>{fmt(rom.totals?.mid)}</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{fmt(rom.totals?.high)}</div>
              <div style={{ fontSize: 10, textAlign: "right", fontWeight: 700, color: C.textDim, fontFamily: "'DM Mono',monospace" }}>
                {rom.projectSF > 0 ? fmtSF(rom.totals?.mid / rom.projectSF) : "—"}
              </div>
            </div>
          </div>

          {/* Simple bar chart */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Division Cost Distribution (Mid)</div>
            {Object.entries(rom.divisions || {}).sort(([, a], [, b]) => (b.total?.mid || 0) - (a.total?.mid || 0)).slice(0, 10).map(([div, data]) => {
              const maxMid = Math.max(...Object.values(rom.divisions).map(d => d.total?.mid || 0));
              const pct = maxMid > 0 ? ((data.total?.mid || 0) / maxMid) * 100 : 0;
              return (
                <div key={div} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 30, fontSize: 9, fontWeight: 600, color: C.textDim, fontFamily: "'DM Mono',monospace" }}>{div}</div>
                  <div style={{ flex: 1, height: 14, background: C.bg2, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.blue})`, borderRadius: 3, transition: "width 0.3s ease" }} />
                  </div>
                  <div style={{ width: 60, fontSize: 9, textAlign: "right", color: C.textMuted, fontFamily: "'DM Mono',monospace" }}>{fmt(data.total?.mid)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ TAB 3: Line Items ═══ */}
      {tab === "items" && (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {lineItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
              No line items generated from schedules. Try uploading drawings with more schedule data.
            </div>
          ) : (<>
            {/* Select all header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 10, color: C.textMuted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={selectedItems.size === lineItems.length} onChange={toggleAll} />
                Select All ({selectedItems.size}/{lineItems.length})
              </label>
              <div style={{ fontSize: 9, color: C.textDim }}>
                <span style={{ color: C.green, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "high").length} high</span>
                {" · "}
                <span style={{ color: C.orange, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "medium").length} med</span>
                {" · "}
                <span style={{ color: C.red, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "low").length} low</span>
                {" confidence"}
              </div>
            </div>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px", padding: "5px 8px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <div></div><div>Code</div><div>Description</div><div>Unit</div><div style={{ textAlign: "right" }}>Matl</div><div style={{ textAlign: "right" }}>Labor</div><div style={{ textAlign: "right" }}>Total</div>
              </div>
              {lineItems.map((li, idx) => (
                <div key={idx} onClick={() => toggleItem(idx)}
                  style={{ display: "grid", gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px", padding: "4px 8px", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", cursor: "pointer", background: selectedItems.has(idx) ? `${C.accent}06` : "transparent", opacity: selectedItems.has(idx) ? 1 : 0.6 }}>
                  <div><input type="checkbox" checked={selectedItems.has(idx)} onChange={() => toggleItem(idx)} onClick={e => e.stopPropagation()} /></div>
                  <div style={{ fontSize: 9, fontFamily: "'DM Mono',monospace", color: C.accent }}>{li.code}</div>
                  <div style={{ fontSize: 10, color: C.text, paddingRight: 8 }}>
                    {li.description}
                    <ConfidenceBadge confidence={li.confidence} C={C} />
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>{li.unit}</div>
                  <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Mono',monospace", color: li.m > 0 ? C.text : C.textDim }}>{li.m > 0 ? `$${li.m.toFixed(2)}` : "—"}</div>
                  <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Mono',monospace", color: li.l > 0 ? C.text : C.textDim }}>{li.l > 0 ? `$${li.l.toFixed(2)}` : "—"}</div>
                  <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Mono',monospace", color: (li.m + li.l + li.e) > 0 ? C.green : C.textDim }}>
                    {(li.m + li.l + li.e) > 0 ? `$${(li.m + li.l + li.e).toFixed(2)}` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: T.space[5], paddingTop: T.space[3], borderTop: `1px solid ${C.border}` }}>
        <button onClick={onClose} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "8px 16px", fontSize: 11 })}>Cancel</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSaveOnly} style={bt(C, { background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, padding: "8px 16px", fontSize: 11 })}>
            Save Scan Only
          </button>
          <button onClick={handleApply} disabled={selectedItems.size === 0}
            style={bt(C, {
              background: selectedItems.size > 0 ? `linear-gradient(135deg, ${C.accent}, ${C.green})` : C.bg3,
              color: selectedItems.size > 0 ? "#fff" : C.textDim,
              padding: "8px 20px", fontSize: 11, fontWeight: 600,
              boxShadow: selectedItems.size > 0 ? `0 2px 8px ${C.accent}30` : "none",
            })}>
            Apply {selectedItems.size} Items to Estimate
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function ScheduleGroup({ C, T, label, count, schedules, outputFields }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.bg, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: expanded ? C.textDim : C.textDim, transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{label}</span>
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>{count} item{count !== 1 ? "s" : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {schedules.map((s, i) => (
            <span key={i} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, fontWeight: 600,
              background: s.confidence === "high" ? `${C.green}15` : s.confidence === "medium" ? `${C.orange}15` : `${C.red}15`,
              color: s.confidence === "high" ? C.green : s.confidence === "medium" ? C.orange : C.red }}>
              {s.confidence}
            </span>
          ))}
        </div>
      </div>
      {expanded && schedules.map((schedule, si) => (
        <div key={si}>
          {schedule.sheetLabel && (
            <div style={{ padding: "3px 12px", fontSize: 9, color: C.textDim, background: `${C.bg2}80` }}>
              Sheet: {schedule.sheetLabel}
            </div>
          )}
          {schedule.entries && schedule.entries.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ background: `${C.bg2}60` }}>
                    {outputFields.slice(0, 6).map(field => (
                      <th key={field} style={{ padding: "4px 8px", textAlign: "left", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                        {field.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.entries.map((entry, ei) => (
                    <tr key={ei} style={{ borderBottom: `1px solid ${C.bg2}` }}>
                      {outputFields.slice(0, 6).map(field => (
                        <td key={field} style={{ padding: "3px 8px", color: entry[field] ? C.text : C.textDim, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry[field] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence, C }) {
  const color = confidence === "high" ? C.green : confidence === "medium" ? C.orange : C.red;
  return (
    <span style={{ marginLeft: 6, fontSize: 7, padding: "1px 4px", borderRadius: 2, fontWeight: 700, background: `${color}15`, color }}>
      {confidence || "low"}
    </span>
  );
}
