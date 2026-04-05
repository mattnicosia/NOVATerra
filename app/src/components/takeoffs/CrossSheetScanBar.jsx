import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";

export default function CrossSheetScanBar({ crossSheetScan, setCrossSheetScan, selectedDrawingId, setSelectedDrawingId, drawings, renderPdfPage }) {
  const C = useTheme();

  if (!crossSheetScan || crossSheetScan.results.length === 0) return null;

  return (
    <div
      style={{
        padding: "6px 14px",
        borderTop: `1px solid ${C.blue}20`,
        background: `${C.blue}06`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        fontSize: 9,
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={C.blue}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M4 4h6v6H4z" />
        <path d="M14 4h6v6h-6z" />
        <path d="M4 14h6v6H4z" />
        <path d="M14 14h6v6h-6z" />
      </svg>
      <span style={{ color: C.text, fontWeight: 600 }}>
        "{crossSheetScan.tag}" found on {crossSheetScan.results.length} other sheet
        {crossSheetScan.results.length !== 1 ? "s" : ""}:
      </span>
      <div style={{ display: "flex", gap: 4, flex: 1, overflow: "hidden" }}>
        {crossSheetScan.results.map((r, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedDrawingId(r.drawingId);
              const d = drawings.find(d => d.id === r.drawingId);
              if (d?.type === "pdf" && d.data) renderPdfPage(d);
            }}
            style={bt(C, {
              padding: "2px 8px",
              fontSize: 8,
              fontWeight: 600,
              borderRadius: 3,
              cursor: "pointer",
              background: r.drawingId === selectedDrawingId ? `${C.blue}20` : C.bg2,
              color: r.drawingId === selectedDrawingId ? C.blue : C.text,
              border: `1px solid ${r.drawingId === selectedDrawingId ? C.blue + "40" : C.border}`,
            })}
          >
            {r.sheetNumber} ({r.instanceCount})
          </button>
        ))}
      </div>
      <button
        onClick={() => setCrossSheetScan(null)}
        style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}
      >
        ✕
      </button>
    </div>
  );
}
