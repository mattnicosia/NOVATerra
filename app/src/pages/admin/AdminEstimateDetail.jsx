import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAdminFetch } from "@/hooks/useAdminFetch";
import { card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function AdminEstimateDetail() {
  const { userId, estimateId } = useParams();
  const navigate = useNavigate();
  const C = useTheme();
  const T = C.T;
  const [showRaw, setShowRaw] = useState(false);

  const { data, loading, error } = useAdminFetch("estimate-detail", {
    params: { userId, estimateId },
    skip: !userId || !estimateId,
  });

  if (loading) {
    return (
      <div style={{ color: C.textMuted, fontSize: 13, padding: 40, textAlign: "center" }}>Loading estimate...</div>
    );
  }
  if (error) {
    return <div style={{ ...card(C), padding: 24, color: "#F87171", fontSize: 13 }}>Error: {error}</div>;
  }
  if (!data) {
    return <div style={{ ...card(C), padding: 24, color: C.textMuted, fontSize: 13 }}>Estimate not found</div>;
  }

  const est = data.data || {};
  const pi = est.projectInfo || {};
  const lineItems = est.lineItems || [];
  const drawings = est.drawings || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
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
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            {pi.projectName || pi.name || "Untitled Estimate"}
          </h1>
          <p style={{ fontSize: 11, color: C.textDim, margin: "2px 0 0" }}>
            {data.userEmail} · Updated {data.updated_at ? new Date(data.updated_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {/* Project Info Card */}
      <div style={{ ...card(C), padding: "18px 22px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 12px" }}>Project Info</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
          {[
            ["Client", pi.client || pi.clientName],
            ["Location", pi.location || pi.address],
            ["Square Feet", pi.squareFeet || pi.sf ? `${(pi.squareFeet || pi.sf).toLocaleString()} SF` : null],
            ["Status", pi.status],
            ["Project Type", pi.projectType || pi.type],
            ["Due Date", pi.dueDate ? new Date(pi.dueDate).toLocaleDateString() : null],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: `1px solid ${C.border}30`,
              }}
            >
              <span style={{ fontSize: 11, color: C.textMuted }}>{label}</span>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{value || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Summary */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[
          {
            label: "Total Cost",
            value: est.totalCost ? `$${Math.round(est.totalCost).toLocaleString()}` : "—",
            color: "#10B981",
          },
          { label: "Line Items", value: lineItems.length, color: "#3B82F6" },
          { label: "Drawings", value: drawings.length, color: "#8B5CF6" },
        ].map(s => (
          <div
            key={s.label}
            style={{
              ...card(C),
              padding: "16px 20px",
              flex: "1 1 150px",
              minWidth: 150,
            }}
          >
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: T.font.sans }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Line Items Summary */}
      {lineItems.length > 0 && (
        <div style={{ ...card(C), padding: "18px 22px" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: "0 0 12px" }}>
            Line Items ({lineItems.length})
          </h3>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 0.8fr 1fr",
                padding: "6px 10px",
                fontSize: 10,
                fontWeight: 600,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <span>Description</span>
              <span>Trade</span>
              <span style={{ textAlign: "right" }}>Qty</span>
              <span style={{ textAlign: "right" }}>Total</span>
            </div>
            {lineItems.slice(0, 100).map((item, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 0.8fr 1fr",
                  padding: "6px 10px",
                  borderBottom: `1px solid ${C.border}30`,
                  fontSize: 11,
                }}
              >
                <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.description || item.name || "—"}
                </span>
                <span style={{ color: C.textMuted }}>{item.trade || item.division || "—"}</span>
                <span style={{ textAlign: "right", color: C.textDim, fontFamily: T.font.sans }}>
                  {item.quantity ?? "—"}
                </span>
                <span
                  style={{ textAlign: "right", color: C.text, fontFamily: T.font.sans, fontWeight: 500 }}
                >
                  {item.total ? `$${Math.round(item.total).toLocaleString()}` : "—"}
                </span>
              </div>
            ))}
            {lineItems.length > 100 && (
              <div style={{ padding: 10, textAlign: "center", fontSize: 11, color: C.textDim }}>
                + {lineItems.length - 100} more items
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw JSON Toggle */}
      <div style={{ ...card(C), padding: "14px 22px" }}>
        <button
          onClick={() => setShowRaw(!showRaw)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.accent,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: T.font.sans,
            padding: 0,
          }}
        >
          {showRaw ? "Hide" : "Show"} Raw JSON
        </button>
        {showRaw && (
          <pre
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: T.radius.sm,
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${C.border}`,
              fontSize: 10,
              color: C.textMuted,
              fontFamily: T.font.sans,
              overflow: "auto",
              maxHeight: 500,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(est, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
