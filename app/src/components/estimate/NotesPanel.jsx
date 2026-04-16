import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";
import { hasAllowance, hasExclusion, getAllowanceFields, getExcludedFields, getItemAllowanceTotal, getItemExcludedTotal, generateAllowanceNote, generateExclusionNote } from "@/utils/allowances";

export default function NotesPanel({ inline = false }) {
  const C = useTheme();
  const T = C.T;
  const exclusions = useDocumentManagementStore(s => s.exclusions);
  const setExclusions = useDocumentManagementStore(s => s.setExclusions);
  const addExclusion = useDocumentManagementStore(s => s.addExclusion);
  const removeExclusion = useDocumentManagementStore(s => s.removeExclusion);
  const clarifications = useDocumentManagementStore(s => s.clarifications);
  const addClarification = useDocumentManagementStore(s => s.addClarification);
  const updateClarification = useDocumentManagementStore(s => s.updateClarification);
  const removeClarification = useDocumentManagementStore(s => s.removeClarification);
  const aiExclusionLoading = useDocumentManagementStore(s => s.aiExclusionLoading);
  const items = useItemsStore(s => s.items);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const showToast = useUiStore(s => s.showToast);

  const [tab, setTab] = useState("exclusions");
  const notesTabHint = useUiStore(s => s.notesTabHint);
  useEffect(() => {
    if (notesTabHint) {
      setTab(notesTabHint);
      useUiStore.getState().setNotesTabHint(null);
    }
  }, [notesTabHint]);
  const allowanceItems = items.filter(hasAllowance);
  const excludedItems = items.filter(hasExclusion);
  const catColors = { note: C.green, clarification: C.blue, qualification: C.purple };


  const handleCopyAllowances = () => {
    const text = allowanceItems.map((it, i) => `${i + 1}. ${generateAllowanceNote(it)}`).join("\n");
    navigator.clipboard.writeText(text);
    showToast("Allowance notes copied");
  };

  return (
    <>
      {/* Backdrop overlay — skip in inline mode */}
      {!inline && (
        <div
          onClick={() => setShowNotesPanel(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: (T.z.overlay || 100) - 1,
            animation: "fadeIn 0.15s ease-out",
          }}
        />
      )}
      <div
        style={
          inline
            ? {
                position: "relative",
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "transparent",
              }
            : {
                position: "fixed",
                right: 0,
                top: 52,
                bottom: 0,
                width: 420,
                background: C.glassBg || C.bg1,
                backdropFilter: T.glass?.blur || "blur(16px)",
                WebkitBackdropFilter: T.glass?.blur || "blur(16px)",
                borderLeft: `1px solid ${C.glassBorder || C.border}`,
                boxShadow: "-8px 0 30px rgba(0,0,0,0.25), -2px 0 8px rgba(0,0,0,0.1)",
                zIndex: T.z.overlay || 100,
                display: "flex",
                flexDirection: "column",
                animation: "slideIn 0.2s ease-out",
              }
        }
      >
        {/* Header — hidden in inline mode (parent has its own toggle) */}
        {!inline && (
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${C.glassBorder || C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: `linear-gradient(180deg, ${C.accent}08 0%, transparent 100%)`,
            }}
          >
            <h3
              style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}
            >
              Notes & Exclusions
            </h3>
            <button
              onClick={() => setShowNotesPanel(false)}
              style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
            >
              <Ic d={I.x} size={16} />
            </button>
          </div>
        )}

        {/* Tabs — pill style, title case */}
        <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { key: "allowances", label: "Allowances", count: allowanceItems.length, color: C.orange },
            { key: "notes", label: "Notes", count: clarifications.length, color: C.blue },
            { key: "exclusions", label: "Exclusions", count: exclusions.length + excludedItems.length, color: C.red || "#e05252" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: "6px 4px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                fontFamily: T.font.sans,
                background: tab === t.key ? `${t.color}15` : "transparent",
                color: tab === t.key ? t.color : C.textDim,
                borderRadius: 6,
                transition: "all 0.15s",
              }}
            >
              {t.label}{" "}
              {t.count > 0 && (
                <span
                  style={{
                    background: `${t.color}25`,
                    padding: "1px 5px",
                    borderRadius: 8,
                    fontSize: 10,
                    marginLeft: 3,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {/* EXCLUSIONS TAB */}
          {tab === "exclusions" && (
            <div>
              {/* Auto-generated from item status */}
              {excludedItems.length > 0 && (
                <>
                  <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                    From Estimate ({excludedItems.length})
                  </div>
                  {excludedItems.map(item => {
                    const note = generateExclusionNote(item);
                    const total = getItemExcludedTotal(item);
                    const fields = getExcludedFields(item);
                    return (
                      <div key={item.id} style={{
                        marginBottom: 8, borderLeft: `3px solid ${C.red || "#e05252"}`,
                        padding: "6px 10px", background: `${C.red || "#e05252"}06`, borderRadius: 4,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                            {item.code && <span style={{ color: C.red || "#e05252", marginRight: 4 }}>{item.code}</span>}
                            {item.description || "Untitled"}
                          </div>
                          {total > 0 && (
                            <span style={{ fontSize: 10, color: C.red || "#e05252", fontWeight: 600, fontFeatureSettings: "'tnum'" }}>
                              ${fmt2(total).replace("$", "")}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4 }}>
                          {note}
                        </div>
                        {fields.length > 0 && fields.length < 4 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            {fields.map(f => (
                              <span key={f} style={{ fontSize: 8, fontWeight: 600, color: C.red || "#e05252", background: `${C.red || "#e05252"}12`, padding: "1px 5px", borderRadius: 3 }}>
                                {f.toUpperCase().slice(0, 4)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {exclusions.length > 0 && (
                    <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 }}>
                      Manual
                    </div>
                  )}
                </>
              )}
              {exclusions.map(ex => (
                <div
                  key={ex.id}
                  style={{
                    marginBottom: 8,
                    borderLeft: `3px solid ${C.purple}`,
                    padding: "6px 10px",
                    background: `${C.purple}06`,
                    borderRadius: 4,
                  }}
                >
                  {ex.description && (
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3 }}>
                      {ex.code && <span style={{ color: C.purple, fontWeight: 600 }}>{ex.code} </span>}
                      {ex.description}
                    </div>
                  )}
                  <textarea
                    value={ex.aiText || ex.text || ""}
                    onChange={e => {
                      const updated = exclusions.map(x => (x.id === ex.id ? { ...x, aiText: e.target.value } : x));
                      setExclusions(updated);
                    }}
                    placeholder="Exclusion text..."
                    rows={2}
                    style={inp(C, {
                      width: "100%",
                      fontSize: 12,
                      padding: "5px 8px",
                      resize: "vertical",
                      minHeight: 36,
                    })}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                    {ex.source && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.textDim,
                          background: C.bg2,
                          padding: "1px 6px",
                          borderRadius: 3,
                        }}
                      >
                        {ex.source}
                      </span>
                    )}
                    <button
                      onClick={() => removeExclusion(ex.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: C.textDim,
                        cursor: "pointer",
                        fontSize: 11,
                        opacity: 0.6,
                      }}
                    >
                      <Ic d={I.trash} size={10} /> Remove
                    </button>
                  </div>
                </div>
              ))}
              {aiExclusionLoading && (
                <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: C.accent }}>
                  AI generating exclusion text...
                </div>
              )}
              <button
                onClick={() => addExclusion({ text: "", source: "manual" })}
                style={bt(C, {
                  background: "transparent",
                  border: `1px dashed ${C.purple}40`,
                  color: C.purple,
                  padding: "5px 12px",
                  fontSize: 12,
                  width: "100%",
                  marginTop: 4,
                })}
              >
                <Ic d={I.plus} size={10} /> Add Exclusion
              </button>
            </div>
          )}

          {/* ALLOWANCES TAB */}
          {tab === "allowances" && (
            <div>
              {allowanceItems.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                  No allowance items. Flag cost cells with the "A" button on estimate items.
                </div>
              )}
              {allowanceItems.map(item => {
                const fields = getAllowanceFields(item);
                const total = getItemAllowanceTotal(item);
                return (
                  <div
                    key={item.id}
                    style={{
                      marginBottom: 8,
                      borderLeft: `3px solid ${C.orange}`,
                      padding: "6px 10px",
                      background: `${C.orange}06`,
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.description}</div>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                      {item.code && <span style={{ color: C.purple }}>{item.code} </span>}Flagged: {fields.join(", ")}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.orange,
                        fontWeight: 600,
                        marginTop: 3,
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      Total: {fmt2(total)}
                      {nn(item.allowanceSubMarkup) > 0 && ` (+${item.allowanceSubMarkup}% markup)`}
                    </div>
                    <div
                      style={{ fontSize: 11, color: C.textMuted, marginTop: 3, lineHeight: 1.4, fontStyle: "italic" }}
                    >
                      {generateAllowanceNote(item)}
                    </div>
                  </div>
                );
              })}
              {allowanceItems.length > 0 && (
                <button
                  onClick={handleCopyAllowances}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.orange}40`,
                    color: C.orange,
                    padding: "5px 12px",
                    fontSize: 12,
                    width: "100%",
                    marginTop: 4,
                  })}
                >
                  <Ic d={I.copy} size={10} /> Copy All Allowance Notes
                </button>
              )}
            </div>
          )}

          {/* NOTES & CLARIFICATIONS TAB */}
          {tab === "notes" && (
            <div>
              {clarifications.map(c => (
                <div
                  key={c.id}
                  style={{
                    marginBottom: 8,
                    borderLeft: `3px solid ${catColors[c.category] || C.blue}`,
                    padding: "6px 10px",
                    background: `${catColors[c.category] || C.blue}06`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <select
                      value={c.category || ""}
                      onChange={e => updateClarification(c.id, "category", e.target.value)}
                      style={inp(C, { padding: "2px 6px", fontSize: 11, fontWeight: 600, width: 100 })}
                    >
                      <option value="note">Note</option>
                      <option value="clarification">Clarification</option>
                      <option value="qualification">Qualification</option>
                    </select>
                    <button
                      onClick={() => removeClarification(c.id)}
                      style={{
                        marginLeft: "auto",
                        border: "none",
                        background: "transparent",
                        color: C.red,
                        cursor: "pointer",
                        opacity: 0.6,
                      }}
                    >
                      <Ic d={I.trash} size={10} />
                    </button>
                  </div>
                  <textarea
                    value={c.text}
                    onChange={e => updateClarification(c.id, "text", e.target.value)}
                    placeholder="Enter text..."
                    rows={2}
                    style={inp(C, {
                      width: "100%",
                      fontSize: 12,
                      padding: "5px 8px",
                      resize: "vertical",
                      minHeight: 36,
                    })}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {["note", "clarification", "qualification"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => addClarification(cat)}
                    style={bt(C, {
                      flex: 1,
                      background: "transparent",
                      border: `1px dashed ${catColors[cat]}40`,
                      color: catColors[cat],
                      padding: "5px 4px",
                      fontSize: 11,
                      textTransform: "capitalize",
                    })}
                  >
                    <Ic d={I.plus} size={9} /> {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      </div>
    </>
  );
}
