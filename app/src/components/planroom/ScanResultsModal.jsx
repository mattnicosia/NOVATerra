import { useState, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';
import { SCHEDULE_TYPES } from '@/utils/scheduleParsers';
import { NOTE_CATEGORIES } from '@/utils/notesExtractor';

const fmt = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};
const fmtSF = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
};

export default function ScanResultsModal({ scanResults, onClose, onApplyToEstimate, onApplyNotes, onSaveOnly }) {
  const C = useTheme();
  const T = C.T;
  // Smart default tab: show the most useful tab based on what the scan found
  const [tab, setTab] = useState(() => {
    const hasSchedules = scanResults?.schedules?.length > 0 &&
      scanResults.schedules.some(s => s.entries?.length > 0);
    if (hasSchedules) return "schedules";
    if (scanResults?.lineItems?.length > 0) return "items";
    if (scanResults?.rom?.totals) return "rom";
    if (scanResults?.drawingNotes?.some(dn => dn.notes?.length > 0)) return "notes";
    return "rom"; // fallback to ROM — it always runs
  });
  const [selectedItems, setSelectedItems] = useState(() => {
    // Pre-select all line items
    if (scanResults?.lineItems) {
      return new Set(scanResults.lineItems.map((_, i) => i));
    }
    return new Set();
  });

  // Notes state
  const [noteRelevanceFilter, setNoteRelevanceFilter] = useState({ high: true, medium: true, low: false });
  const [selectedNotes, setSelectedNotes] = useState(new Set());

  if (!scanResults) return null;

  const { schedules = [], rom, lineItems = [], drawingNotes = [] } = scanResults;
  const totalNotes = drawingNotes.reduce((sum, dn) => sum + (dn.notes?.length || 0), 0);

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
            {(() => {
              const parts = [];
              if (totalScheduleEntries > 0) parts.push(`${totalScheduleEntries} items across ${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`);
              if (totalNotes > 0) parts.push(`${totalNotes} note${totalNotes !== 1 ? "s" : ""} extracted`);
              if (rom?.totals) parts.push(`ROM $${Math.round(rom.totals.low / 1000)}K–$${Math.round(rom.totals.high / 1000)}K`);
              if (lineItems.length > 0 && totalScheduleEntries === 0) parts.push(`${lineItems.length} line items`);
              return parts.length > 0 ? parts.join(" · ") : "Drawings analyzed — see ROM Overview";
            })()}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer", padding: 4 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "inline-flex", gap: 0, marginBottom: T.space[4], background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
        {[
          { k: "schedules", l: "Schedules", count: totalScheduleEntries },
          { k: "notes", l: "Notes", count: totalNotes },
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

      {/* ═══ TAB: Notes (sorted by relevance) ═══ */}
      {tab === "notes" && (() => {
        // Flatten all notes with source sheet info, sorted by relevance
        const relevanceOrder = { high: 0, medium: 1, low: 2 };
        const allNotes = [];
        drawingNotes.filter(dn => dn.notes?.length > 0).forEach((dn, di) => {
          dn.notes.forEach((note, ni) => {
            allNotes.push({ ...note, sheetLabel: dn.sheetLabel || `Sheet ${di + 1}`, _key: `${di}-${ni}` });
          });
        });
        allNotes.sort((a, b) => (relevanceOrder[a.estimatingRelevance] || 2) - (relevanceOrder[b.estimatingRelevance] || 2));

        const filteredNotes = allNotes.filter(n => noteRelevanceFilter[n.estimatingRelevance || 'low']);

        const toggleNote = (key) => {
          setSelectedNotes(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          });
        };

        const handleAddNotes = () => {
          const notes = allNotes.filter(n => selectedNotes.has(n._key));
          if (onApplyNotes) onApplyNotes(notes);
          setSelectedNotes(new Set());
        };

        return (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {totalNotes === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                No specification notes extracted from drawings.
              </div>
            ) : (<>
              {/* Relevance filter bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Filter:</span>
                  {[{ k: "high", l: "High", c: C.green }, { k: "medium", l: "Medium", c: C.orange }, { k: "low", l: "Low", c: C.textDim }].map(f => (
                    <button key={f.k} onClick={() => setNoteRelevanceFilter(prev => ({ ...prev, [f.k]: !prev[f.k] }))}
                      style={bt(C, {
                        padding: "3px 10px", fontSize: 9, fontWeight: 600,
                        background: noteRelevanceFilter[f.k] ? `${f.c}18` : "transparent",
                        color: noteRelevanceFilter[f.k] ? f.c : C.textDim,
                        border: `1px solid ${noteRelevanceFilter[f.k] ? f.c + '40' : C.border}`,
                        borderRadius: T.radius.full,
                      })}>{f.l} ({allNotes.filter(n => (n.estimatingRelevance || 'low') === f.k).length})</button>
                  ))}
                </div>
                {selectedNotes.size > 0 && (
                  <button onClick={handleAddNotes}
                    style={bt(C, { background: C.green, color: "#fff", padding: "4px 12px", fontSize: 9, fontWeight: 600 })}>
                    Add {selectedNotes.size} Note{selectedNotes.size !== 1 ? "s" : ""} to Estimate
                  </button>
                )}
              </div>

              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 6 }}>
                Showing {filteredNotes.length} of {allNotes.length} notes — sorted by estimating relevance
              </div>

              {/* Notes list */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                {filteredNotes.map(note => {
                  const catConfig = NOTE_CATEGORIES.find(c => c.id === note.category);
                  const relColor = note.estimatingRelevance === 'high' ? C.green : note.estimatingRelevance === 'medium' ? C.orange : C.textDim;
                  const isSelected = selectedNotes.has(note._key);
                  return (
                    <div key={note._key} onClick={() => toggleNote(note._key)}
                      style={{
                        padding: "6px 12px", borderBottom: `1px solid ${C.bg2}`, display: "flex", gap: 8, alignItems: "flex-start",
                        cursor: "pointer", background: isSelected ? `${C.green}08` : "transparent",
                        borderLeft: `3px solid ${relColor}`,
                      }}>
                      <div style={{ paddingTop: 2 }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleNote(note._key)} onClick={e => e.stopPropagation()} />
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 3, minWidth: 80, paddingTop: 1 }}>
                        <span style={{
                          fontSize: 7, padding: "2px 5px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap",
                          background: `${catConfig?.color || C.accent}18`,
                          color: catConfig?.color || C.accent,
                        }}>
                          {catConfig?.label || note.category}
                        </span>
                        <span style={{
                          fontSize: 7, padding: "1px 4px", borderRadius: 2, fontWeight: 600,
                          background: `${relColor}12`, color: relColor,
                        }}>
                          {note.estimatingRelevance}
                        </span>
                        <span style={{ fontSize: 7, color: C.textDim }}>{note.sheetLabel}</span>
                      </div>
                      <div style={{ flex: 1, fontSize: 10, color: C.text, lineHeight: 1.5 }}>
                        {note.text}
                        {note.csiDivisions?.length > 0 && (
                          <div style={{ marginTop: 2 }}>
                            {note.csiDivisions.map((div, i) => (
                              <span key={i} style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: `${C.accent}10`, color: C.accent, fontWeight: 600, fontFamily: "'DM Sans',sans-serif", marginRight: 3 }}>
                                CSI {div}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>
        );
      })()}

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
                <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", color: C.accent }}>{div}</div>
                <div style={{ fontSize: 10, color: C.text }}>
                  {data.label}
                  {data.aiReason && <span style={{ display: "block", fontSize: 8, color: C.blue, fontStyle: "italic" }}>{data.aiReason}</span>}
                </div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{fmt(data.total?.low)}</div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>{fmt(data.total?.mid)}</div>
                <div style={{ fontSize: 10, textAlign: "right", color: C.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{fmt(data.total?.high)}</div>
                <div style={{ fontSize: 9, textAlign: "right", color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>{fmtSF(data.perSF?.mid)}</div>
              </div>
            ))}
            {/* Totals row */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 80px 80px 80px 70px", padding: "8px 10px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>TOTAL</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{fmt(rom.totals?.low)}</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.green, fontFamily: "'DM Sans',sans-serif" }}>{fmt(rom.totals?.mid)}</div>
              <div style={{ fontSize: 11, textAlign: "right", fontWeight: 700, color: C.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{fmt(rom.totals?.high)}</div>
              <div style={{ fontSize: 10, textAlign: "right", fontWeight: 700, color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>
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
                  <div style={{ width: 30, fontSize: 9, fontWeight: 600, color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>{div}</div>
                  <div style={{ flex: 1, height: 14, background: C.bg2, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.blue})`, borderRadius: 3, transition: "width 0.3s ease" }} />
                  </div>
                  <div style={{ width: 60, fontSize: 9, textAlign: "right", color: C.textMuted, fontFamily: "'DM Sans',sans-serif" }}>{fmt(data.total?.mid)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ TAB 3: Line Items (grouped by section) ═══ */}
      {tab === "items" && (() => {
        // Group line items by schedule type (section)
        const sectionGroups = {};
        lineItems.forEach((li, idx) => {
          const section = li.scheduleType || li.code?.split('.')[0] || 'other';
          if (!sectionGroups[section]) sectionGroups[section] = [];
          sectionGroups[section].push({ ...li, _idx: idx });
        });
        const sectionKeys = Object.keys(sectionGroups).sort();

        const toggleSection = (section) => {
          const idxs = sectionGroups[section].map(li => li._idx);
          const allSelected = idxs.every(i => selectedItems.has(i));
          setSelectedItems(prev => {
            const next = new Set(prev);
            idxs.forEach(i => allSelected ? next.delete(i) : next.add(i));
            return next;
          });
        };

        const isSectionSelected = (section) => {
          const idxs = sectionGroups[section].map(li => li._idx);
          return idxs.length > 0 && idxs.every(i => selectedItems.has(i));
        };

        const isSectionPartial = (section) => {
          const idxs = sectionGroups[section].map(li => li._idx);
          const ct = idxs.filter(i => selectedItems.has(i)).length;
          return ct > 0 && ct < idxs.length;
        };

        return (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {lineItems.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                No line items generated from schedules. Try uploading drawings with more schedule data.
              </div>
            ) : (<>
              {/* Top controls: Select All + Import All */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: C.textMuted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedItems.size === lineItems.length} onChange={toggleAll} />
                  Select All ({selectedItems.size}/{lineItems.length})
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    <span style={{ color: C.green, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "high").length} high</span>
                    {" · "}
                    <span style={{ color: C.orange, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "medium").length} med</span>
                    {" · "}
                    <span style={{ color: C.red, fontWeight: 600 }}>{lineItems.filter(li => li.confidence === "low").length} low</span>
                  </div>
                  <button onClick={() => { onApplyToEstimate(lineItems); }}
                    style={bt(C, { background: C.green, color: "#fff", padding: "4px 12px", fontSize: 9, fontWeight: 600 })}>
                    Import All →
                  </button>
                </div>
              </div>

              {/* Sections */}
              {sectionKeys.map(section => {
                const items = sectionGroups[section];
                const typeConfig = SCHEDULE_TYPES.find(t => t.id === section);
                const sectionLabel = typeConfig?.label || (section === 'other' ? 'Other Items' : `Division ${section}`);
                const allSel = isSectionSelected(section);
                const partial = isSectionPartial(section);

                return (
                  <div key={section} style={{ marginBottom: 8, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                    {/* Section header with checkbox */}
                    <div onClick={() => toggleSection(section)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.bg, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = partial; }} onChange={() => toggleSection(section)} onClick={e => e.stopPropagation()} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{sectionLabel}</span>
                      <span style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>{items.filter(li => selectedItems.has(li._idx)).length}/{items.length} selected</span>
                    </div>
                    {/* Item rows */}
                    <div style={{ display: "grid", gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px", padding: "4px 8px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, background: `${C.bg2}60`, borderBottom: `1px solid ${C.bg2}` }}>
                      <div></div><div>Code</div><div>Description</div><div>Unit</div><div style={{ textAlign: "right" }}>Matl</div><div style={{ textAlign: "right" }}>Labor</div><div style={{ textAlign: "right" }}>Total</div>
                    </div>
                    {items.map(li => (
                      <div key={li._idx} onClick={() => toggleItem(li._idx)}
                        style={{ display: "grid", gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px", padding: "4px 8px", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", cursor: "pointer", background: selectedItems.has(li._idx) ? `${C.accent}06` : "transparent", opacity: selectedItems.has(li._idx) ? 1 : 0.6 }}>
                        <div><input type="checkbox" checked={selectedItems.has(li._idx)} onChange={() => toggleItem(li._idx)} onClick={e => e.stopPropagation()} /></div>
                        <div style={{ fontSize: 9, fontFamily: "'DM Sans',sans-serif", color: C.accent }}>{li.code}</div>
                        <div style={{ fontSize: 10, color: C.text, paddingRight: 8 }}>
                          {li.description}
                          <ConfidenceBadge confidence={li.confidence} C={C} />
                        </div>
                        <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>{li.unit}</div>
                        <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: li.m > 0 ? C.text : C.textDim }}>{li.m > 0 ? `$${li.m.toFixed(2)}` : "—"}</div>
                        <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: li.l > 0 ? C.text : C.textDim }}>{li.l > 0 ? `$${li.l.toFixed(2)}` : "—"}</div>
                        <div style={{ fontSize: 9, textAlign: "right", fontFamily: "'DM Sans',sans-serif", color: (li.m + li.l + (li.e || 0)) > 0 ? C.green : C.textDim }}>
                          {(li.m + li.l + (li.e || 0)) > 0 ? `$${(li.m + li.l + (li.e || 0)).toFixed(2)}` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>)}
          </div>
        );
      })()}

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
