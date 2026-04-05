import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";

export default function PdfScheduleModal({ pdfSchedules, setPdfSchedules }) {
  const C = useTheme();
  const T = C.T;

  if (!pdfSchedules.results || pdfSchedules.results.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={e => {
        if (e.target === e.currentTarget) setPdfSchedules({ loading: false, results: null });
      }}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          width: 640,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10B981"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M3 12h4l3-9 4 18 3-9h4" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Schedules Detected</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#10B981",
                background: "#10B98115",
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {pdfSchedules.results.length} schedule{pdfSchedules.results.length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setPdfSchedules({ loading: false, results: null })}
            style={{
              width: 28,
              height: 28,
              border: "none",
              background: C.bg2,
              color: C.textDim,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        {/* Schedule List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {pdfSchedules.results.map((sched, i) => {
            const typeColors = {
              wall: C.accent,
              door: C.orange,
              window: C.blue,
              finish: C.purple || C.accent,
              fixture: C.green,
              equipment: C.textDim,
            };
            const typeColor = typeColors[sched.type] || C.textDim;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${C.bg2}` }}>
                {/* Schedule header */}
                <div
                  style={{
                    padding: "10px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: `${typeColor}08`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: `${typeColor}15`,
                      color: typeColor,
                      textTransform: "uppercase",
                    }}
                  >
                    {sched.type}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{sched.title}</span>
                  <span style={{ fontSize: 9, color: C.textDim }}>Sheet {sched.sheetNumber}</span>
                  <span style={{ fontSize: 9, color: C.textDim, fontFamily: T.font.sans }}>
                    {sched.itemCount} items
                  </span>
                </div>
                {/* Schedule rows */}
                {sched.data.slice(0, 8).map((row, j) => (
                  <div
                    key={j}
                    style={{
                      padding: "6px 20px 6px 36px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 10,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: typeColor,
                        minWidth: 40,
                        fontFamily: T.font.sans,
                      }}
                    >
                      {row.typeLabel || row.mark || row.roomNo || "—"}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: C.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.description || row.roomName || row.type || ""}
                    </span>
                    {row.material && (
                      <span
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: `${C.accent}10`,
                          color: C.text,
                        }}
                      >
                        {row.material}
                      </span>
                    )}
                    {row.MSStudSize && (
                      <span
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: `${C.accent}10`,
                          color: C.text,
                          fontFamily: T.font.sans,
                        }}
                      >
                        {row.MSStudSize}
                      </span>
                    )}
                    {row.MSGauge && (
                      <span
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: `${C.accent}10`,
                          color: C.text,
                          fontFamily: T.font.sans,
                        }}
                      >
                        {row.MSGauge}
                      </span>
                    )}
                    {row.confidence && (
                      <span
                        style={{
                          fontSize: 7,
                          fontWeight: 600,
                          color:
                            row.confidence === "high"
                              ? C.green
                              : row.confidence === "low"
                                ? C.orange
                                : C.textDim,
                        }}
                      >
                        {row.confidence}
                      </span>
                    )}
                  </div>
                ))}
                {sched.data.length > 8 && (
                  <div style={{ padding: "4px 36px", fontSize: 9, color: C.textDim }}>
                    + {sched.data.length - 8} more...
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, color: C.textDim }}>
            {pdfSchedules.results.reduce((s, sc) => s + sc.itemCount, 0)} total items across{" "}
            {pdfSchedules.results.length} schedule(s)
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setPdfSchedules({ loading: false, results: null })}
              style={bt(C, {
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                padding: "8px 16px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
              })}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
