import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";
import { SCHEDULE_TYPES } from "@/utils/scheduleParsers";
import { NOTE_CATEGORIES, groupNotesByTrade } from "@/utils/notesExtractor";
import PredictiveTakeoffPanel from "@/components/planroom/PredictiveTakeoffPanel";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { generateTakeoffSuggestions } from "@/nova/predictive/generateSuggestions";
import { useCorrectionStore } from "@/nova/learning/correctionStore";

const fmt = n => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};
const fmtSF = n => {
  if (!n && n !== 0) return "—";
  return "$" + (Math.round(n * 100) / 100).toFixed(2);
};

export default function ScanResultsModal({ scanResults, onClose, onApplyToEstimate, onApplyNotes, onSaveOnly }) {
  const C = useTheme();
  const T = C.T;
  // Smart default tab: show the most useful tab based on what the scan found
  // NOVA Takeoffs tab is the star — default to it when suggestions exist
  const [tab, setTab] = useState(() => {
    const hasSchedules = scanResults?.schedules?.length > 0 && scanResults.schedules.some(s => s.entries?.length > 0);
    const hasRom = scanResults?.rom?.totals;
    // Default to NOVA Takeoffs when we have schedule data or ROM (suggestions will be generated)
    if (hasSchedules || hasRom) return "suggestions";
    if (scanResults?.lineItems?.length > 0) return "items";
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
  const [notesViewMode, setNotesViewMode] = useState("grouped"); // "flat" | "grouped"
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [noteSearch, setNoteSearch] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState(null); // null = all
  const [activeDivisionFilter, setActiveDivisionFilter] = useState(null); // null = all
  // Note correction state — local edits keyed by _key
  const [noteEdits, setNoteEdits] = useState({}); // { [_key]: { category?, estimatingRelevance? } }
  const [editingNoteKey, setEditingNoteKey] = useState(null); // which note has dropdown open
  const [editingField, setEditingField] = useState(null); // "category" | "relevance"

  // NOVA Predictive Takeoffs
  const suggestions = useMemo(() => generateTakeoffSuggestions(scanResults), [scanResults]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState([]);
  const [_rejectedSuggestions, setRejectedSuggestions] = useState(new Set());

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

  const toggleItem = idx => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
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
              if (totalScheduleEntries > 0)
                parts.push(
                  `${totalScheduleEntries} items across ${schedules.length} schedule${schedules.length !== 1 ? "s" : ""}`,
                );
              if (totalNotes > 0) parts.push(`${totalNotes} note${totalNotes !== 1 ? "s" : ""} extracted`);
              if (rom?.totals)
                parts.push(`ROM $${Math.round(rom.totals.low / 1000)}K–$${Math.round(rom.totals.high / 1000)}K`);
              if (lineItems.length > 0 && totalScheduleEntries === 0) parts.push(`${lineItems.length} line items`);
              return parts.length > 0 ? parts.join(" · ") : "Drawings analyzed — see ROM Overview";
            })()}
          </div>
          {/* NOVA Intelligence banner — shows what memory was applied */}
          {scanResults.novaIntelligence && (scanResults.novaIntelligence.correctionsApplied > 0 || scanResults.novaIntelligence.firmPatternsUsed > 0) && (
            <div style={{
              marginTop: 6, padding: "4px 10px", borderRadius: 6,
              background: `${C.accent}08`, border: `1px solid ${C.accent}15`,
              display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: C.accent,
            }}>
              <Ic d={I.ai} size={10} color={C.accent} />
              <span style={{ fontWeight: 600 }}>NOVA applied learned intelligence:</span>
              {scanResults.novaIntelligence.correctionsApplied > 0 && (
                <span style={{ color: C.textDim }}>
                  {scanResults.novaIntelligence.correctionsApplied} corrections · {scanResults.novaIntelligence.patternsLearned} patterns
                </span>
              )}
              {scanResults.novaIntelligence.firmPatternsUsed > 0 && (
                <span style={{ color: C.textDim }}>
                  · {scanResults.novaIntelligence.firmPatternsUsed} firm-specific patterns{scanResults.novaIntelligence.firmName ? ` for ${scanResults.novaIntelligence.firmName}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: C.textDim,
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "inline-flex",
          gap: 0,
          marginBottom: T.space[4],
          background: C.bg2,
          borderRadius: T.radius.md,
          padding: 3,
        }}
      >
        {[
          { k: "suggestions", l: "✦ NOVA Takeoffs", count: suggestions.length, accent: true },
          { k: "schedules", l: "Schedules", count: totalScheduleEntries },
          { k: "notes", l: "Notes", count: totalNotes },
          { k: "rom", l: "ROM Overview", count: null },
          { k: "items", l: "Line Items", count: lineItems.length },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={bt(C, {
              background:
                tab === t.k
                  ? t.accent
                    ? `linear-gradient(135deg, ${C.accent}, ${C.purple || C.accent})`
                    : C.accent
                  : "transparent",
              color: tab === t.k ? "#fff" : t.accent ? C.accent : C.textMuted,
              padding: "6px 16px",
              fontSize: 11,
              fontWeight: t.accent ? 700 : 500,
              border: "none",
              borderRadius: T.radius.sm,
            })}
          >
            {t.l}
            {t.count != null ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {/* ═══ TAB: NOVA Predictive Takeoffs ═══ */}
      {tab === "suggestions" && (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {suggestions.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
              No predictive takeoff suggestions generated. Upload drawings with schedules for best results.
            </div>
          ) : (
            <PredictiveTakeoffPanel
              suggestions={suggestions}
              onAccept={s => {
                setAcceptedSuggestions(prev => [...prev, s]);
                useCorrectionStore.getState().logCorrection("suggestions:accept", {
                  context: `Accepted ${s.confidence} suggestion: ${s.description?.slice(0, 60)}`,
                  original: s,
                  corrected: s,
                  field: s.source?.type || "unknown",
                  scheduleType: s.source?.scheduleType,
                });
              }}
              onReject={s => {
                setRejectedSuggestions(prev => new Set([...prev, s.id]));
                useCorrectionStore.getState().logCorrection("suggestions:reject", {
                  context: `Rejected ${s.confidence} suggestion: ${s.description?.slice(0, 60)}`,
                  original: s,
                  corrected: null,
                  field: s.source?.type || "unknown",
                  scheduleType: s.source?.scheduleType,
                });
              }}
              onAcceptAll={pending => {
                setAcceptedSuggestions(prev => [...prev, ...pending]);
                pending.forEach(s => {
                  useCorrectionStore.getState().logCorrection("suggestions:accept", {
                    context: `Bulk-accepted ${s.confidence} suggestion: ${s.description?.slice(0, 60)}`,
                    original: s,
                    corrected: s,
                    field: s.source?.type || "unknown",
                  });
                });
              }}
            />
          )}
        </div>
      )}

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
              <ScheduleGroup
                key={type}
                C={C}
                T={T}
                scheduleType={type}
                label={typeConfig?.label || type}
                count={totalEntries}
                schedules={schedulesOfType}
                outputFields={typeConfig?.outputFields || []}
              />
            );
          })}
        </div>
      )}

      {/* ═══ TAB: Notes (grouped by trade or flat) ═══ */}
      {tab === "notes" &&
        (() => {
          // Flatten all notes with source sheet info
          const relevanceOrder = { high: 0, medium: 1, low: 2 };
          const allNotes = [];
          drawingNotes
            .filter(dn => dn.notes?.length > 0)
            .forEach((dn, di) => {
              dn.notes.forEach((note, ni) => {
                allNotes.push({ ...note, sheetLabel: dn.sheetLabel || `Sheet ${di + 1}`, _key: `${di}-${ni}` });
              });
            });
          allNotes.sort(
            (a, b) => (relevanceOrder[a.estimatingRelevance] || 2) - (relevanceOrder[b.estimatingRelevance] || 2),
          );

          // Grouped data
          const tradeGroups = groupNotesByTrade(drawingNotes);

          // Collect unique CSI divisions across all notes
          const allDivisions = [
            ...new Set(allNotes.flatMap(n => (n.csiDivisions || []).map(d => String(d).padStart(2, "0")))),
          ].sort();
          // Collect unique categories across all notes
          const allCats = [...new Set(allNotes.map(n => n.category).filter(Boolean))];

          const filteredNotes = allNotes.filter(n => {
            if (!noteRelevanceFilter[n.estimatingRelevance || "low"]) return false;
            if (noteSearch) {
              const q = noteSearch.toLowerCase();
              if (
                !(n.text || "").toLowerCase().includes(q) &&
                !(n.category || "").toLowerCase().includes(q) &&
                !(n.sheetLabel || "").toLowerCase().includes(q)
              )
                return false;
            }
            if (activeCategoryFilter && n.category !== activeCategoryFilter) return false;
            if (
              activeDivisionFilter &&
              !(n.csiDivisions || []).map(d => String(d).padStart(2, "0")).includes(activeDivisionFilter)
            )
              return false;
            return true;
          });

          const toggleNote = key => {
            setSelectedNotes(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          };

          const toggleGroup = group => {
            setCollapsedGroups(prev => {
              const next = new Set(prev);
              next.has(group) ? next.delete(group) : next.add(group);
              return next;
            });
          };

          const handleAddNotes = () => {
            const notes = allNotes.filter(n => selectedNotes.has(n._key));
            if (onApplyNotes) onApplyNotes(notes);
            setSelectedNotes(new Set());
          };

          // Render a single note row (shared between flat + grouped)
          const renderNote = note => {
            const edits = noteEdits[note._key] || {};
            const effectiveCategory = edits.category || note.category;
            const effectiveRelevance = edits.estimatingRelevance || note.estimatingRelevance;
            const catConfig = NOTE_CATEGORIES.find(c => c.id === effectiveCategory);
            const relColor =
              effectiveRelevance === "high"
                ? C.green
                : effectiveRelevance === "medium"
                  ? C.orange
                  : C.textDim;
            const isSelected = selectedNotes.has(note._key);
            const isEditingCat = editingNoteKey === note._key && editingField === "category";
            const isEditingRel = editingNoteKey === note._key && editingField === "relevance";

            const handleCategoryChange = (newCat) => {
              if (newCat === effectiveCategory) { setEditingNoteKey(null); return; }
              useCorrectionStore.getState().logCorrection("notes:category", {
                context: `Recategorized note on ${note.sheetLabel}`,
                original: note.category,
                corrected: newCat,
                field: "category",
              });
              setNoteEdits(prev => ({ ...prev, [note._key]: { ...prev[note._key], category: newCat } }));
              setEditingNoteKey(null);
            };
            const handleRelevanceChange = (newRel) => {
              if (newRel === effectiveRelevance) { setEditingNoteKey(null); return; }
              useCorrectionStore.getState().logCorrection("notes:relevance", {
                context: `Changed relevance on ${note.sheetLabel}`,
                original: note.estimatingRelevance,
                corrected: newRel,
                field: "relevance",
              });
              setNoteEdits(prev => ({ ...prev, [note._key]: { ...prev[note._key], estimatingRelevance: newRel } }));
              setEditingNoteKey(null);
            };

            return (
              <div
                key={note._key}
                onClick={() => toggleNote(note._key)}
                style={{
                  padding: "6px 12px",
                  borderBottom: `1px solid ${C.bg2}`,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  cursor: "pointer",
                  background: isSelected ? `${C.green}08` : "transparent",
                  borderLeft: `3px solid ${relColor}`,
                }}
              >
                <div style={{ paddingTop: 2 }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleNote(note._key)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    minWidth: 80,
                    paddingTop: 1,
                    position: "relative",
                  }}
                >
                  {/* ── Category chip (clickable → dropdown) ── */}
                  <span
                    onClick={e => { e.stopPropagation(); setEditingNoteKey(note._key); setEditingField("category"); }}
                    style={{
                      fontSize: 7,
                      padding: "2px 5px",
                      borderRadius: 3,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      background: `${catConfig?.color || C.accent}18`,
                      color: catConfig?.color || C.accent,
                      cursor: "pointer",
                      border: edits.category ? `1px solid ${catConfig?.color || C.accent}40` : "1px solid transparent",
                    }}
                    title="Click to change category — NOVA learns from corrections"
                  >
                    {catConfig?.label || effectiveCategory}
                  </span>
                  {isEditingCat && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: "absolute", top: 18, left: 0, zIndex: 100,
                        background: C.bg1 || "#1a1a2e", border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: 2, minWidth: 130,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {NOTE_CATEGORIES.map(cat => (
                        <div
                          key={cat.id}
                          onClick={() => handleCategoryChange(cat.id)}
                          style={{
                            padding: "3px 6px", fontSize: 8, cursor: "pointer",
                            color: cat.id === effectiveCategory ? cat.color : C.text,
                            fontWeight: cat.id === effectiveCategory ? 700 : 400,
                            borderRadius: 2,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${cat.color}15`)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: cat.color, marginRight: 4 }} />
                          {cat.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Relevance badge (clickable → dropdown) ── */}
                  <span
                    onClick={e => { e.stopPropagation(); setEditingNoteKey(note._key); setEditingField("relevance"); }}
                    style={{
                      fontSize: 7,
                      padding: "1px 4px",
                      borderRadius: 2,
                      fontWeight: 600,
                      background: `${relColor}12`,
                      color: relColor,
                      cursor: "pointer",
                      border: edits.estimatingRelevance ? `1px solid ${relColor}40` : "1px solid transparent",
                    }}
                    title="Click to change relevance — NOVA learns from corrections"
                  >
                    {effectiveRelevance}
                  </span>
                  {isEditingRel && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: "absolute", top: 36, left: 0, zIndex: 100,
                        background: C.bg1 || "#1a1a2e", border: `1px solid ${C.border}`,
                        borderRadius: 4, padding: 2, minWidth: 80,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}
                    >
                      {["high", "medium", "low"].map(rel => {
                        const rc = rel === "high" ? C.green : rel === "medium" ? C.orange : C.textDim;
                        return (
                          <div
                            key={rel}
                            onClick={() => handleRelevanceChange(rel)}
                            style={{
                              padding: "3px 6px", fontSize: 8, cursor: "pointer",
                              color: rel === effectiveRelevance ? rc : C.text,
                              fontWeight: rel === effectiveRelevance ? 700 : 400,
                              borderRadius: 2,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${rc}15`)}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            {rel}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <span style={{ fontSize: 7, color: C.textDim }}>{note.sheetLabel}</span>
                </div>
                <div style={{ flex: 1, fontSize: 10, color: C.text, lineHeight: 1.5 }}>
                  {noteSearch
                    ? (() => {
                        const q = noteSearch.toLowerCase();
                        const idx = (note.text || "").toLowerCase().indexOf(q);
                        if (idx < 0) return note.text;
                        return (
                          <>
                            {note.text.slice(0, idx)}
                            <mark
                              style={{ background: `${C.accent}30`, color: C.text, borderRadius: 2, padding: "0 1px" }}
                            >
                              {note.text.slice(idx, idx + noteSearch.length)}
                            </mark>
                            {note.text.slice(idx + noteSearch.length)}
                          </>
                        );
                      })()
                    : note.text}
                  {note.csiDivisions?.length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      {note.csiDivisions.map((div, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 7,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${C.accent}10`,
                            color: C.accent,
                            fontWeight: 600,
                            fontFamily: T.font.sans,
                            marginRight: 3,
                          }}
                        >
                          CSI {div}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div style={{ maxHeight: 480, overflowY: "auto" }}>
              {totalNotes === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                  No specification notes extracted from drawings.
                </div>
              ) : (
                <>
                  {/* Search bar */}
                  <div style={{ marginBottom: 8 }}>
                    <input
                      type="text"
                      placeholder="Search notes... (keyword, spec, material)"
                      value={noteSearch}
                      onChange={e => setNoteSearch(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: 10,
                        background: C.bg2,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        outline: "none",
                        fontFamily: T.font.sans,
                      }}
                    />
                  </div>

                  {/* Toolbar: view toggle + relevance filter + add button */}
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {/* View mode toggle */}
                      {["grouped", "flat"].map(mode => (
                        <button
                          key={mode}
                          onClick={() => setNotesViewMode(mode)}
                          style={bt(C, {
                            padding: "3px 10px",
                            fontSize: 9,
                            fontWeight: 600,
                            background: notesViewMode === mode ? `${C.accent}18` : "transparent",
                            color: notesViewMode === mode ? C.accent : C.textDim,
                            border: `1px solid ${notesViewMode === mode ? C.accent + "40" : C.border}`,
                            borderRadius: T.radius.full,
                          })}
                        >
                          {mode === "grouped" ? "By Trade" : "Flat"}
                        </button>
                      ))}
                      <span style={{ width: 1, height: 14, background: C.border, margin: "0 2px" }} />
                      {/* Relevance filters */}
                      {[
                        { k: "high", l: "High", c: C.green },
                        { k: "medium", l: "Medium", c: C.orange },
                        { k: "low", l: "Low", c: C.textDim },
                      ].map(f => (
                        <button
                          key={f.k}
                          onClick={() => setNoteRelevanceFilter(prev => ({ ...prev, [f.k]: !prev[f.k] }))}
                          style={bt(C, {
                            padding: "3px 10px",
                            fontSize: 9,
                            fontWeight: 600,
                            background: noteRelevanceFilter[f.k] ? `${f.c}18` : "transparent",
                            color: noteRelevanceFilter[f.k] ? f.c : C.textDim,
                            border: `1px solid ${noteRelevanceFilter[f.k] ? f.c + "40" : C.border}`,
                            borderRadius: T.radius.full,
                          })}
                        >
                          {f.l} ({allNotes.filter(n => (n.estimatingRelevance || "low") === f.k).length})
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {selectedNotes.size > 0 && (
                        <>
                          <button
                            onClick={() => {
                              const notes = allNotes.filter(n => selectedNotes.has(n._key));
                              const { addTakeoff } = useTakeoffsStore.getState();
                              notes.forEach(note => {
                                const div = note.csiDivisions?.[0] ? String(note.csiDivisions[0]).padStart(2, "0") : "";
                                const group = div ? `Div ${div}` : note.category || "Notes";
                                addTakeoff(
                                  group,
                                  note.text?.slice(0, 80) || "Note takeoff",
                                  "EA",
                                  div ? `${div}.000` : "",
                                );
                              });
                              setSelectedNotes(new Set());
                            }}
                            style={bt(C, {
                              background: C.accent,
                              color: "#fff",
                              padding: "4px 12px",
                              fontSize: 9,
                              fontWeight: 600,
                            })}
                          >
                            <Ic d={I.add} size={10} color="#fff" /> Create {selectedNotes.size} Takeoff
                            {selectedNotes.size !== 1 ? "s" : ""}
                          </button>
                          <button
                            onClick={handleAddNotes}
                            style={bt(C, {
                              background: C.green,
                              color: "#fff",
                              padding: "4px 12px",
                              fontSize: 9,
                              fontWeight: 600,
                            })}
                          >
                            Add to Estimate
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Category filter row */}
                  {allCats.length > 1 && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, marginRight: 2 }}>Category:</span>
                      <button
                        onClick={() => setActiveCategoryFilter(null)}
                        style={bt(C, {
                          padding: "2px 8px",
                          fontSize: 8,
                          fontWeight: 600,
                          background: !activeCategoryFilter ? `${C.accent}18` : "transparent",
                          color: !activeCategoryFilter ? C.accent : C.textDim,
                          border: `1px solid ${!activeCategoryFilter ? C.accent + "40" : C.border}`,
                          borderRadius: T.radius.full,
                        })}
                      >
                        All
                      </button>
                      {allCats.map(catId => {
                        const catCfg = NOTE_CATEGORIES.find(c => c.id === catId);
                        const count = allNotes.filter(n => n.category === catId).length;
                        const isActive = activeCategoryFilter === catId;
                        return (
                          <button
                            key={catId}
                            onClick={() => setActiveCategoryFilter(isActive ? null : catId)}
                            style={bt(C, {
                              padding: "2px 8px",
                              fontSize: 8,
                              fontWeight: 600,
                              background: isActive ? `${catCfg?.color || C.accent}18` : "transparent",
                              color: isActive ? catCfg?.color || C.accent : C.textDim,
                              border: `1px solid ${isActive ? (catCfg?.color || C.accent) + "40" : C.border}`,
                              borderRadius: T.radius.full,
                            })}
                          >
                            {catCfg?.label || catId} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* CSI Division filter row */}
                  {allDivisions.length > 0 && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600, marginRight: 2 }}>CSI Div:</span>
                      <button
                        onClick={() => setActiveDivisionFilter(null)}
                        style={bt(C, {
                          padding: "2px 8px",
                          fontSize: 8,
                          fontWeight: 600,
                          background: !activeDivisionFilter ? `${C.accent}18` : "transparent",
                          color: !activeDivisionFilter ? C.accent : C.textDim,
                          border: `1px solid ${!activeDivisionFilter ? C.accent + "40" : C.border}`,
                          borderRadius: T.radius.full,
                        })}
                      >
                        All
                      </button>
                      {allDivisions.map(div => {
                        const count = allNotes.filter(n =>
                          (n.csiDivisions || []).map(d => String(d).padStart(2, "0")).includes(div),
                        ).length;
                        const isActive = activeDivisionFilter === div;
                        return (
                          <button
                            key={div}
                            onClick={() => setActiveDivisionFilter(isActive ? null : div)}
                            style={bt(C, {
                              padding: "2px 8px",
                              fontSize: 8,
                              fontWeight: 600,
                              fontFamily: T.font.sans,
                              background: isActive ? `${C.accent}18` : "transparent",
                              color: isActive ? C.accent : C.textDim,
                              border: `1px solid ${isActive ? C.accent + "40" : C.border}`,
                              borderRadius: T.radius.full,
                            })}
                          >
                            Div {div} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: C.textDim, marginBottom: 6 }}>
                    {notesViewMode === "grouped"
                      ? `${tradeGroups.length} trade groups · ${filteredNotes.length} matching notes`
                      : `Showing ${filteredNotes.length} of ${allNotes.length} notes — sorted by relevance`}
                    {(noteSearch || activeCategoryFilter || activeDivisionFilter) && (
                      <button
                        onClick={() => {
                          setNoteSearch("");
                          setActiveCategoryFilter(null);
                          setActiveDivisionFilter(null);
                        }}
                        style={{
                          marginLeft: 8,
                          fontSize: 8,
                          color: C.accent,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                          fontFamily: T.font.sans,
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>

                  {/* ── NOVA learning indicator ── */}
                  {Object.keys(noteEdits).length > 0 && (
                    <div style={{ fontSize: 8, color: C.accent, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <Ic d={I.ai} size={9} color={C.accent} />
                      NOVA learns from your corrections — {Object.keys(noteEdits).length} correction{Object.keys(noteEdits).length !== 1 ? "s" : ""} applied
                    </div>
                  )}

                  {/* ── Grouped View ── */}
                  {notesViewMode === "grouped" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {tradeGroups.map(({ group, notes: groupNotes, highCount, medCount }) => {
                        // Use same filter set as filteredNotes (includes search, category, division)
                        const filteredGroupKeys = new Set(filteredNotes.map(n => n._key));
                        const visibleNotes = groupNotes.filter(n => filteredGroupKeys.has(n._key));
                        if (visibleNotes.length === 0) return null;
                        const isCollapsed = collapsedGroups.has(group);
                        return (
                          <div
                            key={group}
                            style={{
                              border: `1px solid ${C.border}`,
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                          >
                            {/* Group header */}
                            <div
                              onClick={() => toggleGroup(group)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 12px",
                                cursor: "pointer",
                                background: C.bg2,
                                userSelect: "none",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  color: C.textDim,
                                  transition: "transform 0.15s",
                                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                                }}
                              >
                                ▼
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.text, flex: 1 }}>{group}</span>
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                {highCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: 7,
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      fontWeight: 700,
                                      background: `${C.green}18`,
                                      color: C.green,
                                    }}
                                  >
                                    {highCount} high
                                  </span>
                                )}
                                {medCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: 7,
                                      padding: "1px 5px",
                                      borderRadius: 3,
                                      fontWeight: 700,
                                      background: `${C.orange}18`,
                                      color: C.orange,
                                    }}
                                  >
                                    {medCount} med
                                  </span>
                                )}
                                <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600 }}>
                                  {visibleNotes.length}
                                </span>
                              </div>
                            </div>
                            {/* Group notes */}
                            {!isCollapsed && visibleNotes.map(renderNote)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Flat View ── */}
                  {notesViewMode === "flat" && (
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                      {filteredNotes.map(renderNote)}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

      {/* ═══ TAB 2: ROM Overview ═══ */}
      {tab === "rom" && rom && (
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {/* SF Missing / Estimated Warning */}
          {rom.sfMissing && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(234,88,12,0.08)",
                borderRadius: 6,
                border: "1px solid rgba(234,88,12,0.25)",
                marginBottom: 12,
                fontSize: 11,
                color: C.orange,
              }}
            >
              <strong>Project SF not set.</strong> Enter project square footage in Project Info for accurate ROM totals.
              Currently showing $/SF rates only.
            </div>
          )}
          {rom.sfEstimated && rom.sfEstimateDetails && (
            <div
              style={{
                padding: "8px 12px",
                background: `${C.blue}08`,
                borderRadius: 6,
                border: `1px solid ${C.blue}20`,
                marginBottom: 12,
                fontSize: 11,
                color: C.blue,
              }}
            >
              <strong>AI-Estimated SF:</strong> {Math.round(rom.projectSF).toLocaleString()} SF
              <span style={{ color: C.textDim, marginLeft: 6 }}>
                ({rom.sfEstimateDetails.confidence} confidence — {rom.sfEstimateDetails.reasoning})
              </span>
            </div>
          )}
          {/* Project summary card */}
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <div
              style={{
                flex: 1,
                minWidth: 140,
                padding: "12px 16px",
                background: `${C.accent}08`,
                borderRadius: 8,
                border: `1px solid ${C.accent}20`,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Project Size{rom.sfEstimated ? " (AI Est.)" : ""}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                {rom.projectSF ? Math.round(rom.projectSF).toLocaleString() : "—"} SF
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 140,
                padding: "12px 16px",
                background: `${C.green}08`,
                borderRadius: 8,
                border: `1px solid ${C.green}20`,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                ROM Range
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
                {fmt(rom.totals?.low)} – {fmt(rom.totals?.high)}
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 140,
                padding: "12px 16px",
                background: `${C.purple}08`,
                borderRadius: 8,
                border: `1px solid ${C.purple}20`,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Midpoint Estimate
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.purple }}>{fmt(rom.totals?.mid)}</div>
            </div>
          </div>

          {/* AI notes */}
          {rom.aiNotes && (
            <div
              style={{
                padding: "8px 12px",
                background: `${C.blue}08`,
                borderRadius: 6,
                border: `1px solid ${C.blue}20`,
                marginBottom: 12,
                fontSize: 11,
                color: C.text,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: C.blue }}>AI Assessment:</strong> {rom.aiNotes}
            </div>
          )}

          {/* Calibration indicator */}
          {rom.calibrated ? (
            <div
              style={{
                padding: "6px 12px",
                background: `${C.green}08`,
                borderRadius: 6,
                border: `1px solid ${C.green}20`,
                marginBottom: 12,
                fontSize: 10,
                color: C.green,
                fontWeight: 500,
              }}
            >
              ✓ Calibrated using data from {rom.calibrationCount} previous estimate
              {rom.calibrationCount !== 1 ? "s" : ""}
            </div>
          ) : (
            <div
              style={{
                padding: "6px 12px",
                background: `${C.accent}08`,
                borderRadius: 6,
                border: `1px solid ${C.accent}20`,
                marginBottom: 12,
                fontSize: 10,
                color: C.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                Improve accuracy by importing past proposals in <strong>Settings &rarr; Cost History</strong>
              </span>
            </div>
          )}

          {/* Division table */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 80px 80px 80px 70px",
                padding: "6px 10px",
                fontSize: 8,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                background: C.bg,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div>Div</div>
              <div>Description</div>
              <div style={{ textAlign: "right" }}>Low</div>
              <div style={{ textAlign: "right" }}>Mid</div>
              <div style={{ textAlign: "right" }}>High</div>
              <div style={{ textAlign: "right" }}>$/SF</div>
            </div>
            {Object.entries(rom.divisions || {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([div, data]) => (
                <div
                  key={div}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 80px 80px 80px 70px",
                    padding: "5px 10px",
                    borderBottom: `1px solid ${C.bg2}`,
                    alignItems: "center",
                    background: data.aiReason ? `${C.blue}04` : "transparent",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, fontFamily: T.font.sans, color: C.accent }}>{div}</div>
                  <div style={{ fontSize: 10, color: C.text }}>
                    {data.label}
                    {data.aiReason && (
                      <span style={{ display: "block", fontSize: 8, color: C.blue, fontStyle: "italic" }}>
                        {data.aiReason}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      textAlign: "right",
                      color: C.textMuted,
                      fontFamily: T.font.sans,
                    }}
                  >
                    {fmt(data.total?.low)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      textAlign: "right",
                      color: C.text,
                      fontWeight: 600,
                      fontFamily: T.font.sans,
                    }}
                  >
                    {fmt(data.total?.mid)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      textAlign: "right",
                      color: C.textMuted,
                      fontFamily: T.font.sans,
                    }}
                  >
                    {fmt(data.total?.high)}
                  </div>
                  <div style={{ fontSize: 9, textAlign: "right", color: C.textDim, fontFamily: T.font.sans }}>
                    {fmtSF(data.perSF?.mid)}
                  </div>
                </div>
              ))}
            {/* Totals row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 80px 80px 80px 70px",
                padding: "8px 10px",
                background: C.bg,
                borderTop: `1px solid ${C.border}`,
              }}
            >
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>TOTAL</div>
              <div
                style={{
                  fontSize: 11,
                  textAlign: "right",
                  fontWeight: 700,
                  color: C.textMuted,
                  fontFamily: T.font.sans,
                }}
              >
                {fmt(rom.totals?.low)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  textAlign: "right",
                  fontWeight: 700,
                  color: C.green,
                  fontFamily: T.font.sans,
                }}
              >
                {fmt(rom.totals?.mid)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  textAlign: "right",
                  fontWeight: 700,
                  color: C.textMuted,
                  fontFamily: T.font.sans,
                }}
              >
                {fmt(rom.totals?.high)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  textAlign: "right",
                  fontWeight: 700,
                  color: C.textDim,
                  fontFamily: T.font.sans,
                }}
              >
                {rom.projectSF > 0 ? fmtSF(rom.totals?.mid / rom.projectSF) : "—"}
              </div>
            </div>
          </div>

          {/* Simple bar chart */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.textMuted,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Division Cost Distribution (Mid)
            </div>
            {Object.entries(rom.divisions || {})
              .sort(([, a], [, b]) => (b.total?.mid || 0) - (a.total?.mid || 0))
              .slice(0, 10)
              .map(([div, data]) => {
                const maxMid = Math.max(...Object.values(rom.divisions).map(d => d.total?.mid || 0));
                const pct = maxMid > 0 ? ((data.total?.mid || 0) / maxMid) * 100 : 0;
                return (
                  <div key={div} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div
                      style={{
                        width: 30,
                        fontSize: 9,
                        fontWeight: 600,
                        color: C.textDim,
                        fontFamily: T.font.sans,
                      }}
                    >
                      {div}
                    </div>
                    <div style={{ flex: 1, height: 14, background: C.bg2, borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: `linear-gradient(90deg, ${C.accent}, ${C.blue})`,
                          borderRadius: 3,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 60,
                        fontSize: 9,
                        textAlign: "right",
                        color: C.textMuted,
                        fontFamily: T.font.sans,
                      }}
                    >
                      {fmt(data.total?.mid)}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ═══ TAB 3: Line Items (grouped by section) ═══ */}
      {tab === "items" &&
        (() => {
          // Group line items by schedule type (section)
          const sectionGroups = {};
          lineItems.forEach((li, idx) => {
            const section = li.scheduleType || li.code?.split(".")[0] || "other";
            if (!sectionGroups[section]) sectionGroups[section] = [];
            sectionGroups[section].push({ ...li, _idx: idx });
          });
          const sectionKeys = Object.keys(sectionGroups).sort();

          const toggleSection = section => {
            const idxs = sectionGroups[section].map(li => li._idx);
            const allSelected = idxs.every(i => selectedItems.has(i));
            setSelectedItems(prev => {
              const next = new Set(prev);
              idxs.forEach(i => (allSelected ? next.delete(i) : next.add(i)));
              return next;
            });
          };

          const isSectionSelected = section => {
            const idxs = sectionGroups[section].map(li => li._idx);
            return idxs.length > 0 && idxs.every(i => selectedItems.has(i));
          };

          const isSectionPartial = section => {
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
              ) : (
                <>
                  {/* Top controls: Select All + Import All */}
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
                  >
                    <label
                      style={{
                        fontSize: 10,
                        color: C.textMuted,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        cursor: "pointer",
                      }}
                    >
                      <input type="checkbox" checked={selectedItems.size === lineItems.length} onChange={toggleAll} />
                      Select All ({selectedItems.size}/{lineItems.length})
                    </label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontSize: 9, color: C.textDim }}>
                        <span style={{ color: C.green, fontWeight: 600 }}>
                          {lineItems.filter(li => li.confidence === "high").length} high
                        </span>
                        {" · "}
                        <span style={{ color: C.orange, fontWeight: 600 }}>
                          {lineItems.filter(li => li.confidence === "medium").length} med
                        </span>
                        {" · "}
                        <span style={{ color: C.red, fontWeight: 600 }}>
                          {lineItems.filter(li => li.confidence === "low").length} low
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          onApplyToEstimate(lineItems);
                        }}
                        style={bt(C, {
                          background: C.green,
                          color: "#fff",
                          padding: "4px 12px",
                          fontSize: 9,
                          fontWeight: 600,
                        })}
                      >
                        Import All →
                      </button>
                    </div>
                  </div>

                  {/* Sections */}
                  {sectionKeys.map(section => {
                    const items = sectionGroups[section];
                    const typeConfig = SCHEDULE_TYPES.find(t => t.id === section);
                    const sectionLabel =
                      typeConfig?.label || (section === "other" ? "Other Items" : `Division ${section}`);
                    const allSel = isSectionSelected(section);
                    const partial = isSectionPartial(section);

                    return (
                      <div
                        key={section}
                        style={{
                          marginBottom: 8,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        {/* Section header with checkbox */}
                        <div
                          onClick={() => toggleSection(section)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            background: C.bg,
                            cursor: "pointer",
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allSel}
                            ref={el => {
                              if (el) el.indeterminate = partial;
                            }}
                            onChange={() => toggleSection(section)}
                            onClick={e => e.stopPropagation()}
                          />
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{sectionLabel}</span>
                          <span style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>
                            {items.filter(li => selectedItems.has(li._idx)).length}/{items.length} selected
                          </span>
                        </div>
                        {/* Item rows */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px",
                            padding: "4px 8px",
                            fontSize: 8,
                            fontWeight: 700,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: 0.7,
                            background: `${C.bg2}60`,
                            borderBottom: `1px solid ${C.bg2}`,
                          }}
                        >
                          <div></div>
                          <div>Code</div>
                          <div>Description</div>
                          <div>Unit</div>
                          <div style={{ textAlign: "right" }}>Matl</div>
                          <div style={{ textAlign: "right" }}>Labor</div>
                          <div style={{ textAlign: "right" }}>Total</div>
                        </div>
                        {items.map(li => (
                          <div
                            key={li._idx}
                            onClick={() => toggleItem(li._idx)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "28px 70px 1fr 40px 60px 60px 60px",
                              padding: "4px 8px",
                              borderBottom: `1px solid ${C.bg2}`,
                              alignItems: "center",
                              cursor: "pointer",
                              background: selectedItems.has(li._idx) ? `${C.accent}06` : "transparent",
                              opacity: selectedItems.has(li._idx) ? 1 : 0.6,
                            }}
                          >
                            <div>
                              <input
                                type="checkbox"
                                checked={selectedItems.has(li._idx)}
                                onChange={() => toggleItem(li._idx)}
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                            <div style={{ fontSize: 9, fontFamily: T.font.sans, color: C.accent }}>{li.code}</div>
                            <div style={{ fontSize: 10, color: C.text, paddingRight: 8 }}>
                              {li.description}
                              <ConfidenceBadge confidence={li.confidence} C={C} />
                            </div>
                            <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>{li.unit}</div>
                            <div
                              style={{
                                fontSize: 9,
                                textAlign: "right",
                                fontFamily: T.font.sans,
                                color: li.m > 0 ? C.text : C.textDim,
                              }}
                            >
                              {li.m > 0 ? `$${li.m.toFixed(2)}` : "—"}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                textAlign: "right",
                                fontFamily: T.font.sans,
                                color: li.l > 0 ? C.text : C.textDim,
                              }}
                            >
                              {li.l > 0 ? `$${li.l.toFixed(2)}` : "—"}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                textAlign: "right",
                                fontFamily: T.font.sans,
                                color: li.m + li.l + (li.e || 0) > 0 ? C.green : C.textDim,
                              }}
                            >
                              {li.m + li.l + (li.e || 0) > 0 ? `$${(li.m + li.l + (li.e || 0)).toFixed(2)}` : "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: T.space[5],
          paddingTop: T.space[3],
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={onClose}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            padding: "8px 16px",
            fontSize: 11,
          })}
        >
          Cancel
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onSaveOnly}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.accent}`,
              color: C.accent,
              padding: "8px 16px",
              fontSize: 11,
            })}
          >
            Save Scan Only
          </button>
          {acceptedSuggestions.length > 0 && (
            <button
              onClick={() => {
                // Convert accepted suggestions to line item format and apply
                const items = acceptedSuggestions.map(s => ({
                  code: s.code,
                  description: s.description,
                  unit: s.unit,
                  quantity: s.quantity || 1,
                  material: s.estimatedCost?.material || 0,
                  labor: s.estimatedCost?.labor || 0,
                  equipment: s.estimatedCost?.equipment || 0,
                  subcontractor: s.estimatedCost?.sub || 0,
                  m: s.estimatedCost?.material || 0,
                  l: s.estimatedCost?.labor || 0,
                  e: s.estimatedCost?.equipment || 0,
                  s: s.estimatedCost?.sub || 0,
                  source: "nova-predictive",
                  confidence: s.confidence,
                }));
                onApplyToEstimate(items);
              }}
              style={bt(C, {
                background: `linear-gradient(135deg, ${C.purple || C.accent}, ${C.accent})`,
                color: "#fff",
                padding: "8px 16px",
                fontSize: 11,
                fontWeight: 600,
                boxShadow: `0 2px 8px ${C.accent}30`,
              })}
            >
              Apply {acceptedSuggestions.length} NOVA Suggestion{acceptedSuggestions.length !== 1 ? "s" : ""}
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={selectedItems.size === 0}
            style={bt(C, {
              background: selectedItems.size > 0 ? `linear-gradient(135deg, ${C.accent}, ${C.green})` : C.bg3,
              color: selectedItems.size > 0 ? "#fff" : C.textDim,
              padding: "8px 20px",
              fontSize: 11,
              fontWeight: 600,
              boxShadow: selectedItems.size > 0 ? `0 2px 8px ${C.accent}30` : "none",
            })}
          >
            Apply {selectedItems.size} Items to Estimate
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function ScheduleGroup({ C, T: _T, scheduleType, label, count, schedules, outputFields }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(null); // "si::ei::field"
  const [editValue, setEditValue] = useState("");
  const [corrections, setCorrections] = useState(0);

  const handleStartEdit = (si, ei, field, currentValue) => {
    setEditing(`${si}::${ei}::${field}`);
    setEditValue(currentValue ?? "");
  };

  const handleCommitEdit = (si, ei, field, entry) => {
    const original = entry[field];
    const corrected = editValue.trim();
    if (corrected !== (original ?? "")) {
      // Apply the edit to the entry object (mutate in place — modal-local data)
      entry[field] = corrected || undefined;
      // Log correction for NOVA learning
      try {
        useCorrectionStore
          .getState()
          .logFieldCorrection(scheduleType, field, original ?? "", corrected, schedules[si]?.sheetLabel);
        setCorrections(c => c + 1);
      } catch {
        /* correction store not available */
      }
    }
    setEditing(null);
    setEditValue("");
  };

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          background: C.bg,
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: C.textDim,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              display: "inline-block",
            }}
          >
            ▶
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{label}</span>
          <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>
            {count} item{count !== 1 ? "s" : ""}
          </span>
          {corrections > 0 && (
            <span
              style={{
                fontSize: 8,
                padding: "1px 5px",
                borderRadius: 3,
                fontWeight: 700,
                background: `${C.green}15`,
                color: C.green,
              }}
            >
              ✓ {corrections} learned
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {schedules.map((s, i) => (
            <span
              key={i}
              style={{
                fontSize: 8,
                padding: "2px 6px",
                borderRadius: 3,
                fontWeight: 600,
                background:
                  s.confidence === "high" ? `${C.green}15` : s.confidence === "medium" ? `${C.orange}15` : `${C.red}15`,
                color: s.confidence === "high" ? C.green : s.confidence === "medium" ? C.orange : C.red,
              }}
            >
              {s.confidence}
            </span>
          ))}
        </div>
      </div>
      {expanded &&
        schedules.map((schedule, si) => (
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
                        <th
                          key={field}
                          style={{
                            padding: "4px 8px",
                            textAlign: "left",
                            fontSize: 8,
                            fontWeight: 600,
                            color: C.textDim,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {field.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.entries.map((entry, ei) => (
                      <tr key={ei} style={{ borderBottom: `1px solid ${C.bg2}` }}>
                        {outputFields.slice(0, 6).map(field => {
                          const cellKey = `${si}::${ei}::${field}`;
                          const isEditing = editing === cellKey;
                          return (
                            <td
                              key={field}
                              onDoubleClick={() => handleStartEdit(si, ei, field, entry[field])}
                              style={{
                                padding: "3px 8px",
                                color: entry[field] ? C.text : C.textDim,
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: isEditing ? "clip" : "ellipsis",
                                whiteSpace: "nowrap",
                                cursor: "text",
                              }}
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCommitEdit(si, ei, field, entry)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleCommitEdit(si, ei, field, entry);
                                    if (e.key === "Escape") {
                                      setEditing(null);
                                      setEditValue("");
                                    }
                                  }}
                                  style={{
                                    width: "100%",
                                    fontSize: 10,
                                    padding: "1px 4px",
                                    border: `1px solid ${C.accent}50`,
                                    borderRadius: 3,
                                    background: C.bg,
                                    color: C.text,
                                    outline: "none",
                                    fontFamily: "inherit",
                                  }}
                                />
                              ) : (
                                (entry[field] ?? "—")
                              )}
                            </td>
                          );
                        })}
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
    <span
      style={{
        marginLeft: 6,
        fontSize: 7,
        padding: "1px 4px",
        borderRadius: 2,
        fontWeight: 700,
        background: `${color}15`,
        color,
      }}
    >
      {confidence || "low"}
    </span>
  );
}
