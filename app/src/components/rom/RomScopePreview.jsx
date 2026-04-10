import { useMemo } from "react";

const confidenceColor = (conf) => {
  if (conf >= 0.8) return "#22c55e";
  if (conf >= 0.6) return "#f59e0b";
  return "#ef4444";
};

export default function RomScopePreview({ scopeItems = [], C, T, onSignUp }) {
  const PREVIEW_LIMIT = 10;

  const { previewItems, groupedPreview, totalCount, divisionCount } = useMemo(() => {
    if (!scopeItems.length) return { previewItems: [], groupedPreview: [], totalCount: 0, divisionCount: 0 };

    // Group by division, take top 2-3 divisions
    const groups = {};
    for (const si of scopeItems) {
      const div = si.division || "Unassigned";
      if (!groups[div]) groups[div] = [];
      groups[div].push(si);
    }
    const sorted = Object.entries(groups)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 3);

    const items = [];
    for (const [, divItems] of sorted) {
      for (const si of divItems) {
        if (items.length >= PREVIEW_LIMIT) break;
        items.push(si);
      }
    }

    return {
      previewItems: items,
      groupedPreview: sorted.map(([div, its]) => [div, its.slice(0, Math.ceil(PREVIEW_LIMIT / sorted.length))]),
      totalCount: scopeItems.length,
      divisionCount: Object.keys(groups).length,
    };
  }, [scopeItems]);

  if (!scopeItems.length) return null;

  return (
    <div
      style={{
        marginTop: 24,
        borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: C.bg2 || C.cardBg || C.bg,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          NOVA detected {totalCount} scope items from your drawings
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>
          across {divisionCount} divisions
        </span>
      </div>

      {/* Preview items */}
      <div style={{ padding: "8px 0" }}>
        {groupedPreview.map(([div, items]) => (
          <div key={div}>
            <div
              style={{
                padding: "6px 18px",
                fontSize: 11,
                fontWeight: 600,
                color: C.text,
                background: `${C.accent}06`,
              }}
            >
              {div}
            </div>
            {items.map(si => (
              <div
                key={si.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 18px",
                  borderBottom: `1px solid ${C.border}08`,
                }}
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: C.accent,
                    minWidth: 52,
                  }}
                >
                  {si.code || "—"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: C.text }}>
                  {si.description}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: `${confidenceColor(si.confidence)}18`,
                    color: confidenceColor(si.confidence),
                  }}
                >
                  {Math.round((si.confidence || 0) * 100)}%
                </span>
                <span style={{ fontSize: 11, color: C.textDim, minWidth: 40, textAlign: "right" }}>
                  {si.quantity > 0 ? `${si.quantity} ${si.unit || ""}` : "---"}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Blur gate */}
      {totalCount > PREVIEW_LIMIT && (
        <div
          style={{
            position: "relative",
            height: 100,
            overflow: "hidden",
          }}
        >
          {/* Fake blurred rows */}
          <div
            style={{
              filter: "blur(4px)",
              opacity: 0.3,
              padding: "0 18px",
            }}
          >
            {[1, 2, 3].map(i => (
              <div key={i} style={{ padding: "5px 0", display: "flex", gap: 8 }}>
                <span style={{ width: 52, height: 14, background: C.textDim + "20", borderRadius: 3 }} />
                <span style={{ flex: 1, height: 14, background: C.textDim + "15", borderRadius: 3 }} />
                <span style={{ width: 30, height: 14, background: C.textDim + "20", borderRadius: 3 }} />
              </div>
            ))}
          </div>

          {/* Overlay CTA */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(transparent 0%, ${C.bg || "#111"} 60%)`,
            }}
          >
            <span style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>
              Sign up to see all {totalCount} items
            </span>
            <button
              onClick={onSignUp}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                background: C.accent,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Get Full Scope →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
