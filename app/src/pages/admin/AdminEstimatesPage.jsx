import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { card } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function AdminEstimatesPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, loading, error } = useAdminFetch("estimates", {
    params: { page: String(page), perPage: "50" },
  });

  const estimates = data?.estimates || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>All Estimates</h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
          {total.toLocaleString()} estimates across all users
        </p>
      </div>

      {/* Loading / Error */}
      {loading && <div style={{ color: C.textMuted, fontSize: 13, padding: 20, textAlign: "center" }}>Loading estimates...</div>}
      {error && <div style={{ ...card(C), padding: 16, color: "#F87171", fontSize: 13 }}>Error: {error}</div>}

      {/* Table */}
      {!loading && !error && (
        <div style={{ ...card(C), overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 0.8fr 1fr",
            padding: "10px 16px",
            background: C.bg2 || "rgba(255,255,255,0.03)",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 10, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>Project Name</span>
            <span>Client</span>
            <span>User</span>
            <span style={{ textAlign: "right" }}>Total Cost</span>
            <span style={{ textAlign: "right" }}>Items</span>
            <span style={{ textAlign: "right" }}>Updated</span>
          </div>

          {/* Rows */}
          {estimates.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 12 }}>No estimates found</div>
          ) : (
            estimates.map(e => (
              <div
                key={e.id}
                onClick={() => navigate(`/admin/estimates/${e.user_id}/${e.estimate_id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 0.8fr 1fr",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer",
                  transition: "background 0.1s",
                  fontSize: 12,
                }}
                onMouseEnter={ev => { ev.currentTarget.style.background = `${C.accent}08`; }}
                onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.projectName}
                </span>
                <span style={{ color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.client || "—"}
                </span>
                <span style={{ color: C.accent, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.userEmail}
                </span>
                <span style={{ textAlign: "right", color: C.text, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
                  {e.totalCost ? `$${Math.round(e.totalCost).toLocaleString()}` : "—"}
                </span>
                <span style={{ textAlign: "right", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
                  {e.lineItemCount}
                </span>
                <span style={{ textAlign: "right", color: C.textDim, fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                  {e.updated_at ? new Date(e.updated_at).toLocaleDateString() : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              padding: "6px 14px", borderRadius: T.radius.sm,
              background: C.bg2, border: `1px solid ${C.border}`,
              color: page <= 1 ? C.textDim : C.text,
              fontSize: 12, fontWeight: 500, cursor: page <= 1 ? "default" : "pointer",
              opacity: page <= 1 ? 0.5 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: C.textMuted, fontFamily: "'DM Sans', sans-serif" }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{
              padding: "6px 14px", borderRadius: T.radius.sm,
              background: C.bg2, border: `1px solid ${C.border}`,
              color: page >= totalPages ? C.textDim : C.text,
              fontSize: 12, fontWeight: 500, cursor: page >= totalPages ? "default" : "pointer",
              opacity: page >= totalPages ? 0.5 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
