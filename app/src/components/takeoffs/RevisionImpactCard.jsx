import { useTheme } from "@/hooks/useTheme";

/**
 * Floating card showing revision impact when new drawing revisions are detected.
 * Displays affected sheets, takeoff items, and divisions with review/dismiss actions.
 */
export default function RevisionImpactCard({ revisionImpact, onDismiss, onReviewSheet }) {
  const C = useTheme();
  const T = C.T;

  if (!revisionImpact || revisionImpact.summary.totalRevisedSheets <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        width: "min(480px, 90%)",
        background: C.isDark ? "rgba(20,20,25,0.97)" : "rgba(255,255,255,0.97)",
        border: "1.5px solid #F59E0B60",
        borderRadius: 12,
        padding: "16px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(245,158,11,0.1)",
        fontFamily: T.font.sans,
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>&#x26A0;&#xFE0F;</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F59E0B" }}>Revision Detected</span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.textDim,
            fontSize: 16,
            padding: 4,
          }}
        >
          &#x2715;
        </button>
      </div>

      {/* Summary line */}
      <div
        style={{
          fontSize: 11,
          color: C.text,
          lineHeight: 1.6,
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 8,
          background: C.isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.06)",
          border: `1px solid ${C.isDark ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.12)"}`,
        }}
      >
        <strong>{revisionImpact.summary.totalRevisedSheets}</strong> sheet
        {revisionImpact.summary.totalRevisedSheets > 1 ? "s" : ""} revised
        {revisionImpact.summary.totalAffectedItems > 0 ? (
          <>
            {" \u2192 "}
            <strong style={{ color: "#F59E0B" }}>{revisionImpact.summary.totalAffectedItems}</strong> takeoff item
            {revisionImpact.summary.totalAffectedItems > 1 ? "s" : ""} affected
            {revisionImpact.summary.affectedDivisions.length > 0 && (
              <>
                {" "}
                {" \u2192 "}Div {revisionImpact.summary.affectedDivisions.join(", ")}
              </>
            )}
          </>
        ) : (
          <> &mdash; no takeoff items affected yet</>
        )}
      </div>

      {/* Sheet details */}
      {revisionImpact.sheets.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 12 }}>
          {revisionImpact.sheets.map((sheet, i) => (
            <div
              key={i}
              style={{
                padding: "6px 0",
                borderBottom:
                  i < revisionImpact.sheets.length - 1
                    ? `1px solid ${C.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`
                    : "none",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: 3 }}>
                {sheet.sheetNumber} &mdash; {sheet.sheetTitle}
                <span style={{ fontWeight: 400, color: C.textDim, marginLeft: 6 }}>
                  Rev {sheet.oldRevision} &rarr; {sheet.newRevision}
                </span>
              </div>
              {sheet.affectedTakeoffs.map(t => (
                <div
                  key={t.id}
                  style={{
                    fontSize: 9,
                    color: C.textDim,
                    paddingLeft: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    lineHeight: 1.8,
                  }}
                >
                  <span style={{ color: C.text }}>{t.description}</span>
                  <span style={{ color: "#F59E0B", fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8 }}>
                    {t.measurementCount} meas. ({t.exposurePercent}% exposure)
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {revisionImpact.sheets.length > 0 && revisionImpact.sheets[0]?.newDrawingId && (
          <button
            onClick={() => onReviewSheet(revisionImpact.sheets[0].newDrawingId)}
            style={{
              flex: 1,
              padding: "7px 12px",
              borderRadius: 6,
              background: "#F59E0B",
              color: "#000",
              border: "none",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: T.font.sans,
            }}
          >
            Review Revised Sheets
          </button>
        )}
        <button
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: "7px 12px",
            borderRadius: 6,
            background: "transparent",
            color: C.textDim,
            border: `1px solid ${C.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
