import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useReportsStore } from '@/stores/reportsStore';
import { PROPOSAL_SECTIONS, getSpecialSectionMeta } from '@/constants/proposalSections';
import { useDragReorder } from '@/hooks/useDragReorder';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import Modal from '@/components/shared/Modal';
import { bt, inp } from '@/utils/styles';
import ProposalDesignPanel from './ProposalDesignPanel';

export default function ProposalBuilder({ conditionalEmpty }) {
  const C = useTheme();
  const T = C.T;

  const sectionOrder = useReportsStore(s => s.sectionOrder);
  const sectionVisibility = useReportsStore(s => s.sectionVisibility);
  const builderOpen = useReportsStore(s => s.builderOpen);
  const proposalTemplates = useReportsStore(s => s.proposalTemplates);
  const reorderSection = useReportsStore(s => s.reorderSection);
  const toggleSectionVisibility = useReportsStore(s => s.toggleSectionVisibility);
  const toggleBuilder = useReportsStore(s => s.toggleBuilder);
  const resetLayout = useReportsStore(s => s.resetLayout);
  const saveTemplate = useReportsStore(s => s.saveTemplate);
  const loadTemplate = useReportsStore(s => s.loadTemplate);
  const deleteTemplate = useReportsStore(s => s.deleteTemplate);
  const addSpecialSection = useReportsStore(s => s.addSpecialSection);
  const removeSpecialSection = useReportsStore(s => s.removeSpecialSection);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [activeTab, setActiveTab] = useState("sections"); // "sections" | "design"

  const { listRef, onPointerDown, onPointerMove, onPointerUp } = useDragReorder(reorderSection);

  const standardMeta = Object.fromEntries(PROPOSAL_SECTIONS.map(s => [s.id, s]));
  const getMeta = (id) => standardMeta[id] || getSpecialSectionMeta(id);

  const handleSave = () => {
    if (!templateName.trim()) return;
    saveTemplate(templateName.trim());
    setTemplateName("");
    setSaveModalOpen(false);
  };

  // Collapsed rail
  if (!builderOpen) {
    return (
      <div
        className="no-print"
        onClick={toggleBuilder}
        style={{
          width: 40, flexShrink: 0, background: C.bg1, borderLeft: `1px solid ${C.border}`,
          borderRadius: `0 ${T.radius.md}px ${T.radius.md}px 0`, cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: T.space[2], padding: "12px 0", userSelect: "none",
        }}
      >
        <Ic d={I.chevron} size={14} color={C.textDim} style={{ transform: "rotate(180deg)" }} />
        <span style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 10, fontWeight: 600, color: C.textDim, letterSpacing: 1 }}>
          Sections
        </span>
      </div>
    );
  }

  return (
    <div className="no-print" style={{
      width: 280, flexShrink: 0, background: C.bg1, borderLeft: `1px solid ${C.border}`,
      borderRadius: `0 ${T.radius.md}px ${T.radius.md}px 0`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header + tabs */}
      <div style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: `${T.space[3]}px ${T.space[4]}px`,
        }}>
          <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>Proposal Builder</span>
          <button className="icon-btn" onClick={toggleBuilder} style={{
            width: 24, height: 24, border: "none", background: "transparent", borderRadius: T.radius.sm,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <Ic d={I.chevron} size={14} color={C.textDim} />
          </button>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", padding: `0 ${T.space[4]}px`, gap: T.space[1] }}>
          {[
            { id: "sections", label: "Sections" },
            { id: "design", label: "Design" },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: "6px 0", border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? C.accent : C.textDim,
                  background: "transparent",
                  borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                  transition: "color 100ms, border-color 100ms",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Design tab ── */}
      {activeTab === "design" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ProposalDesignPanel />
        </div>
      )}

      {/* ── Sections tab ── */}
      {activeTab === "sections" && <>
      {/* Tip: hover between sections to insert page breaks */}
      <div style={{ padding: `6px ${T.space[4]}px`, borderBottom: `1px solid ${C.border}`, fontSize: 9, color: C.textDim }}>
        Hover between sections to insert page breaks
      </div>

      {/* Draggable section list */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: `${T.space[2]}px 0` }}>
        {sectionOrder.map((id, idx) => {
          const meta = getMeta(id);
          if (!meta) return null;
          const visible = sectionVisibility[id];
          const isEmpty = conditionalEmpty?.[id];
          const isConditionalAndEmpty = meta.conditional && isEmpty;
          const isSpecial = meta.special;
          return (
            <div key={id} style={{ position: "relative" }}>
            {/* Insert zone — hover to reveal page break / spacer buttons */}
            <div
              className="insert-zone"
              style={{
                height: 0, overflow: "visible", position: "relative", zIndex: 2,
                display: "flex", justifyContent: "center",
              }}
            >
              <div
                className="insert-buttons"
                style={{
                  display: "none", position: "absolute", top: -8,
                  gap: 4, background: C.bg1, padding: "2px 6px",
                  borderRadius: 12, border: `1px solid ${C.accent}30`,
                  boxShadow: `0 2px 6px rgba(0,0,0,0.1)`,
                }}
              >
                <button
                  onClick={e => { e.stopPropagation(); addSpecialSection("pagebreak", idx - 1); }}
                  style={{ border: "none", background: "transparent", fontSize: 9, color: C.accent, cursor: "pointer", fontWeight: 600, padding: "2px 6px", whiteSpace: "nowrap" }}
                  title="Insert page break here"
                >
                  ┄ Page Break
                </button>
                <button
                  onClick={e => { e.stopPropagation(); addSpecialSection("spacer", idx - 1); }}
                  style={{ border: "none", background: "transparent", fontSize: 9, color: C.textDim, cursor: "pointer", fontWeight: 600, padding: "2px 6px", whiteSpace: "nowrap" }}
                  title="Insert spacer here"
                >
                  ↕ Spacer
                </button>
              </div>
            </div>
            <div
              onPointerDown={e => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{
                display: "flex", alignItems: "center", gap: T.space[2],
                padding: `${T.space[2]}px ${T.space[3]}px`, margin: `0 ${T.space[2]}px`,
                borderRadius: T.radius.sm, cursor: "grab", userSelect: "none",
                opacity: isSpecial ? 0.6 : (visible && !isConditionalAndEmpty ? 1 : 0.4),
                transition: "opacity 100ms, background 100ms",
              }}
              className="row"
            >
              {/* Drag handle */}
              <Ic d={I.move} size={12} color={C.textDim} />

              {/* Section icon */}
              <Ic d={meta.icon} size={13} color={isSpecial ? C.textDim : (visible ? C.accent : C.textDim)} />

              {/* Label */}
              <span style={{
                flex: 1, fontSize: 11, fontWeight: 500,
                color: isSpecial ? C.textDim : C.text,
                fontStyle: isSpecial ? "italic" : "normal",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {meta.label}
                {isConditionalAndEmpty && <span style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>(empty)</span>}
              </span>

              {/* Special sections: trash button. Standard sections: toggle switch */}
              {isSpecial ? (
                <button
                  className="icon-btn"
                  onClick={e => { e.stopPropagation(); removeSpecialSection(id); }}
                  style={{ width: 24, height: 24, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <Ic d={I.trash} size={11} color={C.red} />
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); if (!meta.required) toggleSectionVisibility(id); }}
                  disabled={meta.required}
                  style={{
                    width: 32, height: 18, borderRadius: 9, border: "none",
                    background: visible ? C.accent : C.bg2,
                    position: "relative", cursor: meta.required ? "not-allowed" : "pointer",
                    transition: "background 150ms ease", flexShrink: 0,
                    opacity: meta.required ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: 14, height: 14, borderRadius: 7, background: "#fff",
                    position: "absolute", top: 2,
                    left: visible ? 16 : 2,
                    transition: "left 150ms ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              )}
            </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: `${T.space[3]}px ${T.space[4]}px`, borderTop: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: T.space[2],
      }}>
        {/* Save / Load */}
        <div style={{ display: "flex", gap: T.space[2] }}>
          <button
            className="accent-btn"
            onClick={() => { setTemplateName(""); setSaveModalOpen(true); }}
            style={bt(C, { background: C.accent, color: "#fff", padding: "5px 10px", fontSize: 10, flex: 1 })}
          >
            <Ic d={I.save} size={11} color="#fff" /> Save
          </button>
          <button
            className="ghost-btn"
            onClick={() => setLoadModalOpen(true)}
            style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.text, padding: "5px 10px", fontSize: 10, flex: 1 })}
          >
            <Ic d={I.folder} size={11} color={C.textDim} /> Load
          </button>
        </div>
        <button
          onClick={resetLayout}
          style={{ background: "none", border: "none", fontSize: 10, color: C.textMuted, cursor: "pointer", textAlign: "center", padding: 2 }}
        >
          Reset Default
        </button>
      </div>
      </>}

      {/* Save template modal */}
      {saveModalOpen && (
        <Modal onClose={() => setSaveModalOpen(false)}>
          <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[4] }}>Save Template</div>
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            placeholder="Template name..."
            autoFocus
            style={inp(C, { padding: "8px 12px", fontSize: 13, width: "100%", marginBottom: T.space[4] })}
          />
          <div style={{ display: "flex", gap: T.space[2], justifyContent: "flex-end" }}>
            <button className="ghost-btn" onClick={() => setSaveModalOpen(false)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 14px", fontSize: 11 })}>Cancel</button>
            <button className="accent-btn" onClick={handleSave} style={bt(C, { background: C.accent, color: "#fff", padding: "6px 14px", fontSize: 11 })}>Save</button>
          </div>
        </Modal>
      )}

      {/* Load template modal */}
      {loadModalOpen && (
        <Modal onClose={() => setLoadModalOpen(false)}>
          <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[4] }}>Load Template</div>
          {proposalTemplates.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: T.space[6] }}>No saved templates yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: T.space[2], maxHeight: 300, overflowY: "auto" }}>
              {proposalTemplates.map(t => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: `${T.space[3]}px ${T.space[4]}px`, background: C.bg2,
                  borderRadius: T.radius.sm, border: `1px solid ${C.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{new Date(t.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: T.space[2] }}>
                    <button
                      className="accent-btn"
                      onClick={() => { loadTemplate(t.id); setLoadModalOpen(false); }}
                      style={bt(C, { background: C.accent, color: "#fff", padding: "4px 10px", fontSize: 10 })}
                    >Load</button>
                    <button
                      className="icon-btn"
                      onClick={() => deleteTemplate(t.id)}
                      style={{ width: 24, height: 24, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", color: C.red, cursor: "pointer" }}
                    >
                      <Ic d={I.trash} size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: T.space[4] }}>
            <button className="ghost-btn" onClick={() => setLoadModalOpen(false)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 14px", fontSize: 11 })}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
