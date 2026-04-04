import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useReportsStore } from "@/stores/reportsStore";
import { PROPOSAL_FONTS, PROPOSAL_ACCENTS, PROPOSAL_ORIENTATIONS, loadProposalFont } from "@/constants/proposalStyles";
import { bt, inp } from "@/utils/styles";

const TOGGLE_OPTIONS = [
  { key: "showSectionNumbers", label: "Section numbers" },
  { key: "showPageNumbers", label: "Page numbers" },
  { key: "showAccentBar", label: "Accent bar" },
  { key: "showProjectSummary", label: "Project summary card" },
  { key: "showDraftWatermark", label: "DRAFT watermark" },
];

export default function ProposalDesignPanel() {
  const C = useTheme();
  const T = C.T;

  const design = useReportsStore(s => s.proposalDesign);
  const setDesign = useReportsStore(s => s.setProposalDesign);
  const resetDesign = useReportsStore(s => s.resetProposalDesign);

  const [customHex, setCustomHex] = useState(design.customAccent || "");

  // Load all proposal fonts so previews render in their actual typeface
  useEffect(() => {
    PROPOSAL_FONTS.forEach(f => loadProposalFont(f.id));
  }, []);

  const sectionLabel = {
    fontSize: 9,
    fontWeight: 700,
    color: C.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  };

  return (
    <div style={{ padding: `${T.space[3]}px ${T.space[4]}px`, display: "flex", flexDirection: "column", gap: 2 }}>

      {/* ── Font ── */}
      <div style={sectionLabel}>Font</div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 2,
        maxHeight: 160, overflowY: "auto",
        border: `1px solid ${C.border}`, borderRadius: T.radius.sm,
        background: C.bg2,
      }}>
        {PROPOSAL_FONTS.map(f => {
          const active = design.fontId === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setDesign("fontId", f.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", border: "none", cursor: "pointer",
                background: active ? `${C.accent}15` : "transparent",
                borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
                transition: "background 100ms",
              }}
            >
              <span style={{
                fontFamily: f.family,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? C.accent : C.text,
              }}>
                {f.label}
              </span>
              <span style={{ fontSize: 9, color: C.textMuted }}>{f.category}</span>
            </button>
          );
        })}
      </div>

      {/* ── Orientation ── */}
      <div style={sectionLabel}>Orientation</div>
      <div style={{ display: "flex", gap: T.space[2] }}>
        {PROPOSAL_ORIENTATIONS.map(o => {
          const active = design.orientation === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setDesign("orientation", o.id)}
              style={bt(C, {
                flex: 1,
                padding: "6px 0",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                background: active ? `${C.accent}15` : C.bg2,
                border: `1px solid ${active ? C.accent : C.border}`,
                color: active ? C.accent : C.text,
                justifyContent: "center",
              })}
            >
              <span style={{
                display: "inline-block",
                width: o.id === "portrait" ? 10 : 14,
                height: o.id === "portrait" ? 14 : 10,
                border: `1.5px solid ${active ? C.accent : C.textDim}`,
                borderRadius: 2,
                marginRight: 6,
                verticalAlign: "middle",
              }} />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* ── Accent Color ── */}
      <div style={sectionLabel}>Accent Color</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PROPOSAL_ACCENTS.map(a => {
          const active = design.accentId === a.id;
          const swatchColor = a.color || customHex || "#888";
          return (
            <button
              key={a.id}
              onClick={() => setDesign("accentId", a.id)}
              title={a.label}
              style={{
                width: 24, height: 24, borderRadius: 6, border: "none", cursor: "pointer",
                background: a.id === "custom"
                  ? "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)"
                  : swatchColor,
                outline: active ? `2px solid ${C.accent}` : "2px solid transparent",
                outlineOffset: 2,
                position: "relative",
                transition: "outline 100ms",
              }}
            />
          );
        })}
      </div>
      {/* Active accent label */}
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
        {PROPOSAL_ACCENTS.find(a => a.id === design.accentId)?.label || "Custom"}
      </div>

      {/* Custom hex input (only when custom selected) */}
      {design.accentId === "custom" && (
        <div style={{ display: "flex", gap: T.space[2], alignItems: "center", marginTop: 4 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: customHex || "#888",
            border: `1px solid ${C.border}`, flexShrink: 0,
          }} />
          <input
            value={customHex}
            onChange={e => {
              const v = e.target.value;
              setCustomHex(v);
              if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                setDesign("customAccent", v);
              }
            }}
            placeholder="#1a1a2e"
            maxLength={7}
            style={inp(C, {
              padding: "4px 8px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              width: "100%",
            })}
          />
        </div>
      )}

      {/* ── Toggles ── */}
      <div style={sectionLabel}>Options</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {TOGGLE_OPTIONS.map(opt => {
          const on = design[opt.key];
          return (
            <div
              key={opt.key}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "3px 0",
              }}
            >
              <span style={{ fontSize: 11, color: C.text }}>{opt.label}</span>
              <button
                onClick={() => setDesign(opt.key, !on)}
                style={{
                  width: 32, height: 18, borderRadius: 9, border: "none",
                  background: on ? C.accent : C.bg2,
                  position: "relative", cursor: "pointer",
                  transition: "background 150ms ease", flexShrink: 0,
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 7, background: "#fff",
                  position: "absolute", top: 2,
                  left: on ? 16 : 2,
                  transition: "left 150ms ease",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Reset ── */}
      <button
        onClick={resetDesign}
        style={{
          background: "none", border: "none", fontSize: 10, color: C.textMuted,
          cursor: "pointer", textAlign: "center", padding: 4, marginTop: 8,
        }}
      >
        Reset Design Defaults
      </button>
    </div>
  );
}
