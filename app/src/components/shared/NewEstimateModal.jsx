import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Modal from "./Modal";
import { bt, inp } from "@/utils/styles";
import { ESTIMATE_TEMPLATES } from "@/constants/seedTemplates";

export default function NewEstimateModal({ onCreated, onClose, companyProfileId }) {
  const C = useTheme();
  const T = C.T;

  // Step 1: template selection (null = not chosen yet, "blank" = blank estimate)
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  // Step 2: estimate number entry
  const [estNum, setEstNum] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const showTemplateStep = selectedTemplate === null;

  const handleCreate = async () => {
    const trimmed = estNum.trim();
    if (!trimmed) {
      setError("Estimate number is required");
      return;
    }

    // Check uniqueness against existing estimates
    const existing = useEstimatesStore.getState().estimatesIndex;
    const duplicate = existing.find(e => e.estimateNumber === trimmed);
    if (duplicate) {
      setError(`Estimate #${trimmed} already exists ("${duplicate.name}")`);
      return;
    }

    setCreating(true);
    const templateId = selectedTemplate === "blank" ? null : selectedTemplate;
    const id = await useEstimatesStore.getState().createEstimate(
      companyProfileId || "",
      trimmed,
      templateId,
    );
    onCreated(id);
  };

  // ── Step 1: Template Selection ──────────────────────────────────────
  if (showTemplateStep) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: T.space[5], maxWidth: 520 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
            New Estimate
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: T.space[4] }}>
            Start from a template or begin with a blank estimate
          </div>

          {/* Blank option */}
          <button
            onClick={() => setSelectedTemplate("blank")}
            style={{
              ...bt(C, {
                width: "100%",
                padding: "10px 12px",
                fontSize: 12,
                background: "transparent",
                border: `1px solid ${C.border}`,
                textAlign: "left",
                marginBottom: T.space[3],
              }),
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: 8,
              background: C.surfaceAlt || C.surface,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
            }}>
              +
            </span>
            <div>
              <div style={{ fontWeight: 600, color: C.text }}>Blank Estimate</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                Empty estimate — add items manually
              </div>
            </div>
          </button>

          {/* Divider */}
          <div style={{
            fontSize: 10, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: 0.5,
            marginBottom: 8, marginTop: 4,
          }}>
            Templates
          </div>

          {/* Template grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            maxHeight: 320,
            overflowY: "auto",
          }}>
            {ESTIMATE_TEMPLATES.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                style={{
                  ...bt(C, {
                    padding: "10px 10px",
                    fontSize: 12,
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    textAlign: "left",
                  }),
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: tmpl.color + "18",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>
                  {tmpl.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 12 }}>
                    {tmpl.name}
                  </div>
                  <div style={{
                    fontSize: 10, color: C.textMuted, marginTop: 1,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}>
                    {tmpl.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Cancel */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: T.space[3] }}>
            <button
              onClick={onClose}
              style={bt(C, {
                padding: "8px 16px",
                fontSize: 12,
                background: "transparent",
                color: C.textMuted,
                border: `1px solid ${C.border}`,
              })}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Step 2: Estimate Number Entry ───────────────────────────────────
  const activeTemplate = selectedTemplate !== "blank"
    ? ESTIMATE_TEMPLATES.find(t => t.id === selectedTemplate)
    : null;

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: T.space[5] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: T.space[4] }}>
          <button
            onClick={() => setSelectedTemplate(null)}
            style={bt(C, {
              padding: "4px 8px",
              fontSize: 11,
              background: "transparent",
              color: C.textMuted,
              border: `1px solid ${C.border}`,
            })}
          >
            &larr;
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {activeTemplate ? activeTemplate.name : "Blank Estimate"}
            </div>
            {activeTemplate && (
              <div style={{ fontSize: 10, color: C.textMuted }}>
                {activeTemplate.description}
              </div>
            )}
          </div>
        </div>

        {activeTemplate && (
          <div style={{
            fontSize: 10, color: C.textDim,
            padding: "6px 10px",
            background: activeTemplate.color + "10",
            border: `1px solid ${activeTemplate.color}30`,
            borderRadius: 6,
            marginBottom: T.space[3],
          }}>
            <span style={{ fontWeight: 600 }}>
              {(activeTemplate.seedIds?.length || 0) + (activeTemplate.customItems?.length || 0)}
            </span>
            {" "}pre-loaded items across Divisions{" "}
            {activeTemplate.divisions.join(", ")}
          </div>
        )}

        <label
          style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Estimate Number
        </label>
        <input
          autoFocus
          value={estNum}
          onChange={e => {
            setEstNum(e.target.value);
            setError("");
          }}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder="e.g. EST-2026-001"
          style={inp(C, { width: "100%", marginTop: 4, marginBottom: error ? 4 : T.space[4], fontSize: 13 })}
        />
        {error && <div style={{ fontSize: 11, color: C.red || "#f44", marginBottom: T.space[3] }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: "transparent",
              color: C.textMuted,
              border: `1px solid ${C.border}`,
            })}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: C.accent,
              color: "#fff",
              opacity: creating ? 0.6 : 1,
            })}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
