import { useReportsStore } from "@/stores/reportsStore";

export default function UploadedDocumentSection({ sectionId, proposalStyles: PS }) {
  const doc = useReportsStore(s => (s.uploadedDocuments || []).find(d => d.id === sectionId));
  if (!doc) return null;

  const font = PS?.font?.body || "sans-serif";
  const color = PS?.color || {};

  if (doc.type === "image") {
    return (
      <div style={{ marginBottom: PS?.space?.section || 28, pageBreakInside: "avoid" }}>
        <img
          src={doc.data}
          alt={doc.name}
          style={{ maxWidth: "100%", height: "auto", display: "block" }}
        />
        <div style={{ fontSize: 8, color: color.textMuted || "#999", marginTop: 4, fontFamily: font }}>
          {doc.name}
        </div>
      </div>
    );
  }

  // PDF — rendered as image pages (converted during upload) or fallback placeholder
  return (
    <div style={{ marginBottom: PS?.space?.section || 28 }}>
      {doc.pages ? doc.pages.map((pageDataUrl, i) => (
        <div key={i} style={{ marginBottom: 8, pageBreakAfter: i < doc.pages.length - 1 ? "always" : "auto" }}>
          <img
            src={pageDataUrl}
            alt={`${doc.name} — Page ${i + 1}`}
            style={{ maxWidth: "100%", height: "auto", display: "block" }}
          />
        </div>
      )) : (
        <div style={{ padding: 20, textAlign: "center", border: `1px dashed ${color.border || "#ddd"}`, borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: color.textDim || "#666", fontFamily: font }}>{doc.name}</div>
          <div style={{ fontSize: 9, color: color.textMuted || "#999" }}>Document attached</div>
        </div>
      )}
    </div>
  );
}
