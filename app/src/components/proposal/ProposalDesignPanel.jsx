import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useReportsStore } from "@/stores/reportsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { supabase } from "@/utils/supabase";
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
  const heroImage = useReportsStore(s => s.heroImage);
  const setHeroImage = useReportsStore(s => s.setHeroImage);
  const drawings = useDrawingsStore(s => s.drawings);
  const project = useProjectStore(s => s.project);

  const [customHex, setCustomHex] = useState(design.customAccent || "");
  const [selectedDrawingId, setSelectedDrawingId] = useState("");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderStep, setRenderStep] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const uploadRef = useRef(null);

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

  // Convert drawing to base64 for API
  const getDrawingBase64 = async (drawingId) => {
    const drawing = drawings.find(d => d.id === drawingId);
    if (!drawing) return null;

    // Check all possible data fields
    const raw = drawing.data || drawing.imageData || drawing.thumbnail;
    if (raw && typeof raw === "string" && raw.startsWith("data:")) return raw;

    // Try PDF canvas
    const canvases = useDrawingsStore.getState().pdfCanvases;
    const canvas = canvases?.[drawingId];
    if (canvas?.toDataURL) return canvas.toDataURL("image/jpeg", 0.85);

    // Try to render from the DOM (the drawing viewer canvas)
    const canvasEl = document.querySelector(`canvas[data-drawing-id="${drawingId}"]`)
      || document.querySelector("#drawing-canvas")
      || document.querySelector("canvas.pdf-canvas");
    if (canvasEl?.toDataURL) return canvasEl.toDataURL("image/jpeg", 0.85);

    // Last resort: if raw is a blob URL, fetch it
    if (raw && typeof raw === "string" && raw.startsWith("blob:")) {
      try {
        const resp = await fetch(raw);
        const blob = await resp.blob();
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    }

    return null;
  };

  const RENDER_STEPS = [
    "Analyzing drawing...",
    "Identifying materials & geometry...",
    "Generating photorealistic render...",
    "Applying lighting & landscaping...",
    "Finalizing visualization...",
  ];

  const handleGenerateRendering = async () => {
    if (!selectedDrawingId) return;
    setRenderLoading(true);
    setRenderStep(0);
    setRenderError(null);
    // Cycle through progress steps
    const stepInterval = setInterval(() => {
      setRenderStep(s => Math.min(s + 1, RENDER_STEPS.length - 1));
    }, 5000);
    try {
      const imageBase64 = await getDrawingBase64(selectedDrawingId);
      if (!imageBase64) throw new Error("Could not read drawing image");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/generate-rendering", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageBase64,
          buildingType: project?.buildingType || "",
          projectName: project?.projectName || project?.name || "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Rendering failed");
      setHeroImage(json.image);
    } catch (err) {
      setRenderError(err.message);
    } finally {
      clearInterval(stepInterval);
      setRenderLoading(false);
      setRenderStep(0);
    }
  };

  const handleUploadCustom = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setHeroImage(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: `${T.space[3]}px ${T.space[4]}px`, display: "flex", flexDirection: "column", gap: 2 }}>

      {/* ── Hero Image ── */}
      <div style={sectionLabel}>Hero Image</div>
      {heroImage ? (
        <div style={{ position: "relative", borderRadius: T.radius.sm, overflow: "hidden", marginBottom: 4 }}>
          <img src={heroImage} alt="Hero rendering" style={{ width: "100%", height: 120, objectFit: "cover", display: "block", borderRadius: T.radius.sm }} />
          <button
            onClick={() => setHeroImage(null)}
            style={{
              position: "absolute", top: 4, right: 4,
              width: 20, height: 20, borderRadius: 10,
              background: "rgba(0,0,0,0.6)", border: "none",
              color: "#fff", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
          {/* Drawing thumbnail grid */}
          {drawings.length > 0 && (
            <>
              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 2 }}>Select an elevation or exterior drawing:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {drawings.filter(d => !d.superseded).map(d => {
                  const isSelected = selectedDrawingId === d.id;
                  const thumbSrc = d.data || d.thumbnail;
                  return (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDrawingId(d.id)}
                      style={{
                        border: `2px solid ${isSelected ? C.accent : C.border}`,
                        borderRadius: T.radius.sm,
                        overflow: "hidden",
                        cursor: "pointer",
                        background: isSelected ? `${C.accent}08` : C.bg2,
                        transition: "border-color 0.15s",
                      }}
                    >
                      {thumbSrc ? (
                        <img
                          src={thumbSrc}
                          alt={d.label || d.sheetNumber || ""}
                          style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: 60, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: C.textDim }}>
                          No preview
                        </div>
                      )}
                      <div style={{
                        padding: "3px 5px", fontSize: 8, fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? C.accent : C.textDim,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {d.sheetNumber || d.label || "Page"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleGenerateRendering}
                disabled={!selectedDrawingId || renderLoading}
                style={bt(C, {
                  width: "100%", padding: "6px 10px", fontSize: 10, fontWeight: 700,
                  background: (!selectedDrawingId || renderLoading) ? C.bg2 : (C.gradient || C.accent),
                  color: (!selectedDrawingId || renderLoading) ? C.textDim : "#fff",
                  cursor: (!selectedDrawingId || renderLoading) ? "not-allowed" : "pointer",
                })}
              >
                {renderLoading ? RENDER_STEPS[renderStep] : "Generate AI Rendering"}
              </button>
            </>
          )}
          {renderError && (
            <div style={{ fontSize: 9, color: C.red, padding: "2px 0" }}>{renderError}</div>
          )}
          {/* Upload custom */}
          <input ref={uploadRef} type="file" accept="image/*" onChange={handleUploadCustom} style={{ display: "none" }} />
          <button
            onClick={() => uploadRef.current?.click()}
            style={bt(C, {
              width: "100%", padding: "5px 10px", fontSize: 10,
              background: "transparent", border: `1px solid ${C.border}`,
              color: C.textMuted, cursor: "pointer",
            })}
          >
            Upload Custom Image
          </button>
        </div>
      )}

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
