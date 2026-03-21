import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { card } from "@/utils/styles";

const getKindColors = (C) => ({
  seed_element: C.accent,
  user_element: C.blue,
  assembly: C.green,
  proposal: C.orange,
  drawing_note: "#EC4899",
});

export default function AdminEmbeddingsPage() {
  const C = useTheme();
  const T = C.T;
  const KIND_COLORS = getKindColors(C);

  const { data, loading, error } = useAdminFetch("embeddings", {
    params: { byUser: "true" },
  });

  if (loading) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>Loading embeddings...</div>
    );
  }
  if (error) {
    return <div style={{ ...card(C), padding: 24, color: "#F87171", fontSize: 13 }}>Error: {error}</div>;
  }

  const byKind = data?.byKind || {};
  const byUser = data?.byUser || [];
  const total = data?.total || 0;
  const kinds = Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Intelligence Embeddings</h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
          {total.toLocaleString()} total embeddings across the platform
        </p>
      </div>

      {/* Kind Cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {kinds.map(kind => {
          const count = byKind[kind];
          const color = KIND_COLORS[kind] || C.accent;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div
              key={kind}
              style={{
                ...card(C),
                padding: "18px 22px",
                flex: "1 1 180px",
                minWidth: 180,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{kind}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: C.text,
                    fontFamily: T.font.sans,
                    lineHeight: 1,
                  }}
                >
                  {count.toLocaleString()}
                </span>
                <span style={{ fontSize: 11, color: C.textDim }}>{pct}%</span>
              </div>
              {/* Mini bar */}
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: C.bg2 || "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 2,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-User Breakdown */}
      {byUser.length > 0 && (
        <div style={{ ...card(C), overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>Per-User Breakdown</h3>
          </div>

          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `2fr ${kinds.map(() => "1fr").join(" ")} 1fr`,
              padding: "8px 16px",
              background: C.bg2 || "rgba(255,255,255,0.03)",
              borderBottom: `1px solid ${C.border}`,
              fontSize: 10,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <span>User</span>
            {kinds.map(k => (
              <span key={k} style={{ textAlign: "right" }}>
                {k.replace("_", " ")}
              </span>
            ))}
            <span style={{ textAlign: "right" }}>Total</span>
          </div>

          {/* Rows */}
          {byUser
            .sort((a, b) => b.total - a.total)
            .map(row => (
              <div
                key={row.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: `2fr ${kinds.map(() => "1fr").join(" ")} 1fr`,
                  padding: "8px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    color: C.accent,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.email}
                </span>
                {kinds.map(k => (
                  <span
                    key={k}
                    style={{
                      textAlign: "right",
                      fontFamily: T.font.sans,
                      color: row.kinds[k] ? C.text : C.textDim,
                      fontWeight: row.kinds[k] ? 500 : 400,
                    }}
                  >
                    {row.kinds[k] || 0}
                  </span>
                ))}
                <span
                  style={{
                    textAlign: "right",
                    fontFamily: T.font.sans,
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  {row.total.toLocaleString()}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
