import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function DrawingEmptyState({ drawings, pdfCanvases, setSelectedDrawingId, renderPdfPage }) {
  const C = useTheme();
  const T = C.T;

  if (drawings.length === 0) {
    return (
      <div
        style={{
          color: C.textDim,
          textAlign: "center",
          padding: 40,
          maxWidth: 400,
          animation: "fadeIn 0.3s ease-out",
        }}
      >
        {/* Workflow stepper empty state */}
        <div style={{ position: "relative", display: "inline-block", marginBottom: 20 }}>
          <div
            style={{
              position: "absolute",
              inset: -16,
              borderRadius: "50%",
              border: `1px solid ${C.accent}10`,
              animation: "breathe 4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              border: `1px solid ${C.accent}15`,
              animation: "breathe 4s ease-in-out infinite 0.4s",
            }}
          />
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}06)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 32px ${C.accent}15`,
              position: "relative",
            }}
          >
            <Ic d={I.plans} size={26} color={C.accent} sw={1.5} />
          </div>
        </div>
        <div
          style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: -0.3 }}
        >
          Start your takeoff
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 24 }}>
          Upload drawings in the <strong style={{ color: C.text }}>Discovery</strong> tab to begin.
        </div>
        <div
          style={{
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {[
            {
              step: 1,
              label: "Upload drawings",
              desc: "Go to Discovery tab to add PDFs or images",
              icon: I.upload,
            },
            { step: 2, label: "Set scale", desc: "Calibrate or select a preset scale", icon: I.ruler },
            {
              step: 3,
              label: "Create takeoffs",
              desc: "Add items to measure from the left panel",
              icon: I.plus,
            },
            {
              step: 4,
              label: "Measure",
              desc: "Click on drawings to record quantities",
              icon: I.polygon,
            },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  background: `${C.accent}15`,
                  color: C.accent,
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.step}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{s.label}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div
          style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 9, color: C.textDim }}
        >
          <span>
            <kbd
              style={{
                padding: "1px 4px",
                borderRadius: 3,
                background: C.bg2,
                border: `1px solid ${C.border}`,
                fontSize: 9,
                fontFamily: T.font.sans,
              }}
            >
              ⌘K
            </kbd>{" "}
            Command palette
          </span>
          <span>
            <kbd
              style={{
                padding: "1px 4px",
                borderRadius: 3,
                background: C.bg2,
                border: `1px solid ${C.border}`,
                fontSize: 9,
                fontFamily: T.font.sans,
              }}
            >
              Esc
            </kbd>{" "}
            Stop measuring
          </span>
        </div>
      </div>
    );
  }

  // Has drawings but none selected
  return (
    <div
      style={{
        color: C.textDim,
        textAlign: "center",
        padding: 40,
        maxWidth: 400,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50%",
            border: `1px solid ${C.accent}10`,
            animation: "breathe 3s ease-in-out infinite",
          }}
        />
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${C.accent}12, ${C.accent}06)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Ic d={I.plans} size={22} color={C.accent} sw={1.5} />
        </div>
      </div>
      <div
        style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4, letterSpacing: -0.2 }}
      >
        Choose a drawing
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
        {drawings.length} drawing{drawings.length !== 1 ? "s" : ""} ready to measure
      </div>
      <div
        style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, marginBottom: 12 }}
      >
        {drawings
          .filter(d => d.data)
          .slice(0, 3)
          .map(d => {
            const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
            return (
              <div
                key={d.id}
                onClick={() => {
                  setSelectedDrawingId(d.id);
                  if (d.type === "pdf" && d.data) renderPdfPage(d);
                }}
                style={{
                  width: 80,
                  height: 60,
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  transition: "all 0.15s",
                  position: "relative",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                {thumb ? (
                  <img src={thumb} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      color: C.textDim,
                    }}
                  >
                    ...
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "1px 3px",
                    background: "rgba(0,0,0,0.7)",
                    fontSize: 7,
                    fontWeight: 600,
                    color: "#fff",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {d.sheetNumber || d.pageNumber || "?"}
                </div>
              </div>
            );
          })}
      </div>
      <div style={{ fontSize: 10, color: C.textDim }}>Use ◀ ▶ arrows or click thumbnails above</div>
    </div>
  );
}
