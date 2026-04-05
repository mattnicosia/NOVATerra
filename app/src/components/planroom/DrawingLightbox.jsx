// DrawingLightbox — Full-screen drawing preview with keyboard navigation
import { getScaleLabel } from "@/utils/drawingUtils";

export default function DrawingLightbox({ C, T, drawings, drawingScales, pdfCanvases, previewDrawingId, setPreviewDrawingId }) {
  if (!previewDrawingId) return null;

  const d = drawings.find(dr => dr.id === previewDrawingId);
  if (!d) return null;
  const imgSrc = pdfCanvases[d.id] || (d.type === "image" ? d.data : null);
  const idx = drawings.findIndex(dr => dr.id === previewDrawingId);

  return (
    <div
      onClick={() => setPreviewDrawingId(null)}
      onKeyDown={e => e.key === "Escape" && setPreviewDrawingId(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {/* Header with sheet info */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          marginBottom: 8,
          background: "rgba(255,255,255,0.06)",
          borderRadius: T.radius.md,
          backdropFilter: "blur(12px)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{d.sheetNumber || "\u2014"}</span>
        <span style={{ fontSize: 12, color: "#fff", opacity: 0.8 }}>{d.sheetTitle || d.label || "Untitled"}</span>
        {drawingScales[d.id] && (
          <span style={{ fontSize: 10, color: C.green, fontWeight: 500, marginLeft: 8 }}>
            {getScaleLabel(drawingScales[d.id])}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={e => {
            e.stopPropagation();
            if (idx > 0) setPreviewDrawingId(drawings[idx - 1].id);
          }}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 14,
            padding: "4px 10px",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          \u2039
        </button>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          {idx + 1} / {drawings.length}
        </span>
        <button
          onClick={e => {
            e.stopPropagation();
            if (idx < drawings.length - 1) setPreviewDrawingId(drawings[idx + 1].id);
          }}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 14,
            padding: "4px 10px",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          \u203A
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            setPreviewDrawingId(null);
          }}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 4,
            cursor: "pointer",
            marginLeft: 8,
          }}
        >
          \u2715
        </button>
      </div>

      {/* Drawing image */}
      {imgSrc ? (
        <img
          src={imgSrc}
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: "90vw",
            maxHeight: "80vh",
            objectFit: "contain",
            borderRadius: T.radius.md,
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            cursor: "default",
          }}
        />
      ) : (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 300,
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.06)",
            borderRadius: T.radius.md,
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
          }}
        >
          No preview available
        </div>
      )}
    </div>
  );
}
