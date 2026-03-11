import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

function Section({ title, icon, color, children, C }) {
  const T = C.T;
  return (
    <div style={{ ...card(C), padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={icon} size={13} color={color} />
        </div>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value, C, mono }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "5px 0",
        borderBottom: `1px solid ${C.border}30`,
      }}
    >
      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          color: C.text,
          fontWeight: 500,
          fontFamily: mono ? "'Switzer', sans-serif" : "inherit",
          maxWidth: "60%",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default function AdminUserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const C = useTheme();
  const T = C.T;
  const [showRawKey, setShowRawKey] = useState(null);

  const { data, loading, error } = useAdminFetch("user-data", {
    params: { userId },
    skip: !userId,
  });

  if (loading) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>Loading user data...</div>
    );
  }
  if (error) {
    return <div style={{ ...card(C), padding: 24, color: "#F87171", fontSize: 13 }}>Error: {error}</div>;
  }
  if (!data?.user) {
    return <div style={{ ...card(C), padding: 24, color: C.textMuted, fontSize: 13 }}>User not found</div>;
  }

  const { user, dataByKey, estimates, embeddingsByKind, totalEmbeddings, rfps } = data;
  const master = dataByKey?.master?.data || {};
  const settings = dataByKey?.settings?.data || {};
  const company = master.companyProfiles?.[0] || settings.companyProfile || {};
  const contacts = master.contacts || [];
  const proposals = master.historicalProposals || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/admin/users")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: C.textMuted,
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5 M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{user.email}</h1>
          <p style={{ fontSize: 11, color: C.textDim, margin: "2px 0 0" }}>
            Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
            {" · "}Last sign in {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "never"}
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Estimates", value: estimates.length, color: "#3B82F6" },
          { label: "Proposals", value: proposals.length, color: "#8B5CF6" },
          { label: "Contacts", value: contacts.length, color: "#10B981" },
          { label: "Embeddings", value: totalEmbeddings, color: "#F59E0B" },
          { label: "RFPs", value: rfps.length, color: "#EC4899" },
        ].map(s => (
          <div
            key={s.label}
            style={{
              ...card(C),
              padding: "14px 18px",
              flex: "1 1 120px",
              minWidth: 120,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: T.font.sans }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Company Info */}
      <Section title="Company Info" icon={I.dashboard} color="#8B5CF6" C={C}>
        <DataRow label="Company Name" value={company.companyName || company.name} C={C} />
        <DataRow label="Address" value={company.address} C={C} />
        <DataRow label="Phone" value={company.phone} C={C} />
        <DataRow label="License" value={company.license || company.licenseNumber} C={C} />
      </Section>

      {/* Settings */}
      {settings && Object.keys(settings).length > 0 && (
        <Section title="Settings" icon={I.settings} color="#6366F1" C={C}>
          <DataRow label="Theme" value={settings.selectedPalette || settings.theme} C={C} />
          <DataRow
            label="Default Markup"
            value={
              settings.defaultMarkup && typeof settings.defaultMarkup !== "object" ? `${settings.defaultMarkup}%` : null
            }
            C={C}
          />
          <DataRow label="Currency" value={settings.currency} C={C} />
        </Section>
      )}

      {/* Estimates */}
      {estimates.length > 0 && (
        <Section title={`Estimates (${estimates.length})`} icon={I.estimate} color="#3B82F6" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {estimates.map(e => (
              <div
                key={e.estimate_id}
                onClick={() => navigate(`/admin/estimates/${userId}/${e.estimate_id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: T.radius.sm,
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={ev => {
                  ev.currentTarget.style.background = `${C.accent}08`;
                }}
                onMouseLeave={ev => {
                  ev.currentTarget.style.background = "transparent";
                }}
              >
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
                  {e.projectName}
                </span>
                <span style={{ fontSize: 10, color: C.textDim }}>{e.client || "—"}</span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: T.font.sans, fontWeight: 600 }}>
                  {e.totalCost ? `$${Math.round(e.totalCost).toLocaleString()}` : "—"}
                </span>
                <span style={{ fontSize: 10, color: C.textDim }}>
                  {e.updated_at ? new Date(e.updated_at).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Embeddings */}
      {totalEmbeddings > 0 && (
        <Section title={`Embeddings (${totalEmbeddings})`} icon={I.intelligence} color="#10B981" C={C}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(embeddingsByKind).map(([kind, count]) => (
              <div
                key={kind}
                style={{
                  padding: "6px 14px",
                  borderRadius: T.radius.sm,
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  fontSize: 11,
                  color: C.text,
                }}
              >
                <span style={{ color: C.textMuted }}>{kind}: </span>
                <strong style={{ fontFamily: T.font.sans }}>{count}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Raw Data Keys */}
      {dataByKey && Object.keys(dataByKey).length > 0 && (
        <Section title="Raw Data Keys" icon={I.database} color="#EC4899" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(dataByKey).map(([key, val]) => (
              <div key={key}>
                <div
                  onClick={() => setShowRawKey(showRawKey === key ? null : key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    borderRadius: T.radius.sm,
                    cursor: "pointer",
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>{key}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>
                    {val.updated_at ? new Date(val.updated_at).toLocaleDateString() : "—"}
                    {" · "}
                    {showRawKey === key ? "collapse" : "expand"}
                  </span>
                </div>
                {showRawKey === key && (
                  <pre
                    style={{
                      margin: "4px 0 0",
                      padding: 12,
                      borderRadius: T.radius.sm,
                      background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${C.border}`,
                      fontSize: 10,
                      color: C.textMuted,
                      fontFamily: T.font.sans,
                      overflow: "auto",
                      maxHeight: 300,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(val.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pending RFPs */}
      {rfps.length > 0 && (
        <Section title={`Inbox / RFPs (${rfps.length})`} icon={I.inbox} color="#F59E0B" C={C}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rfps.map(r => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "7px 10px",
                  borderRadius: T.radius.sm,
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: 4,
                    textTransform: "uppercase",
                    background: r.status === "parsed" ? "#10B98120" : "#F59E0B20",
                    color: r.status === "parsed" ? "#10B981" : "#F59E0B",
                  }}
                >
                  {r.status}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: C.text,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.subject || "No subject"}
                </span>
                <span style={{ fontSize: 10, color: C.textDim }}>{r.sender_email || "—"}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
