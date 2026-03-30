import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Modal from "./Modal";
import { bt, inp } from "@/utils/styles";
// Templates hidden — always creates blank estimates

/**
 * Suggest the next estimate number based on existing patterns.
 * Detects prefix + numeric suffix, increments the number, preserves zero-padding.
 * e.g. "EST-2026-003" → "EST-2026-004", "24-017" → "24-018", "1042" → "1043"
 */
function suggestNextEstimateNumber(existingNumbers) {
  if (!existingNumbers.length) return "";

  // Parse each number into { prefix, num, padLength, original }
  const parsed = existingNumbers
    .filter(Boolean)
    .map(s => {
      const match = s.match(/^(.*?)(\d+)$/);
      if (!match) return null;
      const prefix = match[1];
      const numStr = match[2];
      return { prefix, num: parseInt(numStr, 10), padLength: numStr.length, original: s };
    })
    .filter(Boolean);

  if (!parsed.length) return "";

  // Group by prefix to find the most common pattern
  const groups = {};
  for (const p of parsed) {
    const key = p.prefix;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  // Use the prefix group with the most entries (most common pattern)
  const bestPrefix = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)[0];
  const group = bestPrefix[1];

  // Find the highest number in that group
  const maxEntry = group.reduce((best, cur) => (cur.num > best.num ? cur : best), group[0]);

  // Increment and preserve padding
  const nextNum = maxEntry.num + 1;
  const nextStr = String(nextNum).padStart(maxEntry.padLength, "0");

  return maxEntry.prefix + nextStr;
}

export default function NewEstimateModal({ onCreated, onClose, companyProfileId }) {
  const C = useTheme();
  const T = C.T;

  // Always blank — template selection removed
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  // Step 2: estimate number entry
  const [estNum, setEstNum] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-suggest next estimate number from existing pattern
  const suggestedNumber = useMemo(() => {
    const existing = useEstimatesStore.getState().estimatesIndex;
    const numbers = existing.map(e => e.estimateNumber).filter(Boolean);
    return suggestNextEstimateNumber(numbers);
  }, []);

  const showTemplateStep = selectedTemplate === null;

  const handleCreate = async () => {
    const trimmed = estNum.trim() || suggestedNumber;
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
    const id = await useEstimatesStore.getState().createEstimate(companyProfileId || "", trimmed, templateId);
    onCreated(id);
  };

  // ── Step 1: Template Selection ──────────────────────────────────────
  if (showTemplateStep) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: T.space[5], maxWidth: 520 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>New Estimate</div>
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
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: C.surfaceAlt || C.surface,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              +
            </span>
            <div>
              <div style={{ fontWeight: 600, color: C.text }}>Blank Estimate</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>Empty estimate — add items manually</div>
            </div>
          </button>

          {/* Divider */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
              marginTop: 4,
            }}
          >
            Templates
          </div>

          {/* Template grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
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
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    flexShrink: 0,
                    background: tmpl.color + "18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                  }}
                >
                  {tmpl.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 12 }}>{tmpl.name}</div>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.textMuted,
                      marginTop: 1,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
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

  // ── Estimate Number Entry ────────────────────────────────────────────

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: T.space[5] }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: T.space[4] }}>
          New Estimate
        </div>

        <label
          style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Estimate Number
        </label>
        <div style={{ position: "relative", marginTop: 4, marginBottom: error ? 4 : T.space[4] }}>
          <input
            autoFocus
            value={estNum}
            onChange={e => {
              setEstNum(e.target.value);
              setError("");
            }}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder={suggestedNumber || "e.g. EST-2026-001"}
            style={inp(C, { width: "100%", fontSize: 13, paddingRight: suggestedNumber && !estNum ? 60 : undefined })}
          />
          {suggestedNumber && !estNum && (
            <button
              onClick={() => {
                setEstNum(suggestedNumber);
                setError("");
              }}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 10,
                fontWeight: 600,
                color: C.accent,
                background: `${C.accent}15`,
                border: `1px solid ${C.accent}30`,
                borderRadius: 4,
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: "16px",
              }}
            >
              Use
            </button>
          )}
        </div>
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
