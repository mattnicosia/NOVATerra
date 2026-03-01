import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { card, inp } from '@/utils/styles';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function AdminUsersPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(window._adminSearchTimer);
    window._adminSearchTimer = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const { data, loading, error } = useAdminFetch("users", {
    params: debouncedSearch ? { search: debouncedSearch } : {},
  });

  const users = data?.users || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Users</h1>
          <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
            {data?.total ?? "—"} registered users
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ maxWidth: 360 }}>
        <div style={{ position: "relative" }}>
          <Ic d={I.search} size={14} color={C.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by email or name..."
            style={{
              ...inp(C),
              paddingLeft: 34,
            }}
          />
        </div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div style={{ color: C.textMuted, fontSize: 13, padding: 20, textAlign: "center" }}>Loading users...</div>
      )}
      {error && (
        <div style={{ ...card(C), padding: 16, color: "#F87171", fontSize: 13 }}>Error: {error}</div>
      )}

      {/* Users Table */}
      {!loading && !error && (
        <div style={{ ...card(C), overflow: "hidden" }}>
          {/* Table Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.5fr 1fr 1fr 0.7fr 0.7fr",
            padding: "10px 16px",
            background: C.bg2 || "rgba(255,255,255,0.03)",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 10, fontWeight: 600, color: C.textDim,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>Email</span>
            <span>Name</span>
            <span>Created</span>
            <span>Last Sign In</span>
            <span style={{ textAlign: "right" }}>Estimates</span>
            <span style={{ textAlign: "right" }}>Embeddings</span>
          </div>

          {/* Rows */}
          {users.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
              No users found
            </div>
          ) : (
            users.map(u => (
              <div
                key={u.id}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.5fr 1fr 1fr 0.7fr 0.7fr",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: "pointer",
                  transition: "background 0.1s",
                  fontSize: 12,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}08`; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color: C.accent, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email}
                </span>
                <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.name || "—"}
                </span>
                <span style={{ color: C.textDim, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </span>
                <span style={{ color: C.textDim, fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "never"}
                </span>
                <span style={{ textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                  {u.estimateCount}
                </span>
                <span style={{ textAlign: "right", color: C.text, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                  {u.embeddingCount}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
