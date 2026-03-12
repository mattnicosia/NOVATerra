import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const KPI_DEFS = [
  { key: "totalUsers", label: "Total Users", icon: I.user, color: "#8B5CF6" },
  { key: "totalEstimates", label: "Estimates", icon: I.estimate, color: "#3B82F6" },
  { key: "totalEmbeddings", label: "Embeddings", icon: I.intelligence, color: "#10B981" },
  { key: "totalRfps", label: "Pending RFPs", icon: I.inbox, color: "#F59E0B" },
  { key: "totalUserDataRows", label: "Data Rows", icon: I.database, color: "#EC4899" },
];

function KpiCard({ label, value, icon, color, C }) {
  const T = C.T;
  return (
    <div
      style={{
        ...card(C),
        flex: "1 1 180px",
        minWidth: 180,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={icon} size={15} color={color} />
        </div>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: C.text,
          fontFamily: T.font.sans,
          lineHeight: 1,
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
      </span>
    </div>
  );
}

export default function AdminDashboard() {
  const C = useTheme();
  const T = C.T;
  const { data, loading, error } = useAdminFetch("stats");

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: C.textMuted,
          fontSize: 13,
        }}
      >
        Loading platform stats...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          ...card(C),
          padding: 24,
          textAlign: "center",
          color: "#F87171",
          fontSize: 13,
        }}
      >
        Failed to load stats: {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Platform Overview</h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>ARTIFACT Admin Dashboard</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {KPI_DEFS.map(kpi => (
          <KpiCard key={kpi.key} label={kpi.label} value={data?.[kpi.key]} icon={kpi.icon} color={kpi.color} C={C} />
        ))}
      </div>

      {/* Embeddings by Kind */}
      {data?.embeddingsByKind && Object.keys(data.embeddingsByKind).length > 0 && (
        <div style={{ ...card(C), padding: "20px 24px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>Embeddings by Kind</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(data.embeddingsByKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => (
                <div
                  key={kind}
                  style={{
                    padding: "8px 16px",
                    borderRadius: T.radius.sm,
                    background: C.bg2 || "rgba(255,255,255,0.04)",
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{kind}</span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.text,
                      fontFamily: T.font.sans,
                    }}
                  >
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Users */}
      {data?.recentUsers?.length > 0 && (
        <div style={{ ...card(C), padding: "20px 24px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>Recent Users</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.recentUsers.map(u => (
              <div
                key={u.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: T.radius.sm,
                  background: C.bg2 || "rgba(255,255,255,0.03)",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: `${C.accent}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ic d={I.user} size={12} color={C.accent} />
                </div>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500, flex: 1 }}>{u.email}</span>
                <span style={{ fontSize: 10, color: C.textDim, fontFamily: T.font.sans }}>
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "never"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Estimates */}
      {data?.recentEstimates?.length > 0 && (
        <div style={{ ...card(C), padding: "20px 24px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>Recent Estimates</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.recentEstimates.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: T.radius.sm,
                  background: C.bg2 || "rgba(255,255,255,0.03)",
                  border: `1px solid ${C.border}`,
                }}
              >
                <Ic d={I.estimate} size={13} color="#3B82F6" />
                <span
                  style={{
                    fontSize: 12,
                    color: C.text,
                    fontWeight: 500,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.projectName || "Untitled"}
                </span>
                <span style={{ fontSize: 10, color: C.textDim }}>
                  {e.updated_at ? new Date(e.updated_at).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
