import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useInboxStore } from "@/stores/inboxStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

/* ────────────────────────────────────────────────────────
   InboxWidget — RFPs and bid invitations with state
   differentiation: unread, read, processed, rejected
   ──────────────────────────────────────────────────────── */

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function rfpState(rfp, readIds) {
  if (rfp.status === "imported") return "processed";
  if (rfp.status === "dismissed") return "rejected";
  if (rfp.status === "error") return "error";
  if (rfp.status === "pending") return "processing";
  // parsed — check read
  if (readIds.includes(rfp.id)) return "read";
  return "unread";
}

// colorKey resolves to theme tokens inside the component so colors follow the active palette
const STATE_CONFIG = {
  unread: { colorKey: null, badge: null, bold: true, muted: false },
  read: { colorKey: null, badge: null, bold: false, muted: false },
  processing: { colorKey: "orange", badge: "Processing", bold: false, muted: false },
  processed: { colorKey: "green", badge: "Imported", bold: false, muted: true },
  rejected: { colorKey: "dim", badge: "Dismissed", bold: false, muted: true },
  error: { colorKey: "red", badge: "Error", bold: false, muted: false },
};

// Sort priority: unread first, then processing, read, processed, rejected, error
const STATE_PRIORITY = { unread: 0, processing: 1, read: 2, processed: 3, rejected: 4, error: 5 };

export default function InboxWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const font = T.font.display;
  const navigate = useNavigate();
  const resolveStateColor = colorKey => {
    if (!colorKey) return null;
    const map = { orange: C.orange, green: C.green, red: C.red, dim: C.textDim };
    return map[colorKey] || C.textDim;
  };

  const rfps = useInboxStore(s => s.rfps);
  const loading = useInboxStore(s => s.loading);
  const fetchRfps = useInboxStore(s => s.fetchRfps);
  const loadReadIds = useInboxStore(s => s.loadReadIds);
  const readIds = useInboxStore(s => s.readIds);
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  // Fetch on mount
  useEffect(() => {
    loadReadIds();
    fetchRfps();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions are stable
  }, []);

  // Filter by company, sort by state priority then recency
  const displayRfps = useMemo(() => {
    let filtered = rfps;
    if (activeCompanyId !== "__all__") {
      filtered = filtered.filter(r => (r.company_profile_id || "") === (activeCompanyId || ""));
    }
    return [...filtered]
      .map(r => ({ ...r, _state: rfpState(r, readIds) }))
      .sort((a, b) => {
        const pa = STATE_PRIORITY[a._state] ?? 9;
        const pb = STATE_PRIORITY[b._state] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [rfps, readIds, activeCompanyId]);

  const unreadCount = useMemo(() => displayRfps.filter(r => r._state === "unread").length, [displayRfps]);

  const hasItems = displayRfps.length > 0;

  return (
    <div style={{ fontFamily: font, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.textDim,
            fontFamily: font,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          INBOX
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                background: C.accent,
                borderRadius: 10,
                padding: "1px 6px",
                minWidth: 16,
                textAlign: "center",
                letterSpacing: 0,
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 4 }}>
        {loading && rfps.length === 0 && (
          <div style={{ fontSize: 10, color: C.textDim, padding: "8px 0" }}>Loading...</div>
        )}

        {!loading && !hasItems && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 0",
            }}
          >
            <Ic d={I.email || I.folder} size={20} color={C.textDim} />
            <div style={{ fontSize: 10, color: C.textDim, textAlign: "center", lineHeight: 1.5 }}>No emails yet</div>
            <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", opacity: 0.6 }}>
              Forward bid invitations to
              <br />
              <span style={{ color: C.accent, fontWeight: 600 }}>bids@novabuild.app</span>
            </div>
          </div>
        )}

        {displayRfps.slice(0, 6).map(rfp => {
          const st = STATE_CONFIG[rfp._state] || STATE_CONFIG.read;
          return (
            <div
              key={rfp.id}
              onClick={() => navigate("/inbox")}
              style={{
                padding: "5px 8px",
                borderRadius: 6,
                cursor: "pointer",
                background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                borderLeft: resolveStateColor(st.colorKey)
                  ? `3px solid ${resolveStateColor(st.colorKey)}`
                  : `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                transition: "background 0.15s",
                opacity: st.muted ? 0.6 : 1,
              }}
              onMouseEnter={e =>
                (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")
              }
              onMouseLeave={e =>
                (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {/* Unread dot */}
                {rfp._state === "unread" && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: C.accent,
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: st.bold ? 700 : 500,
                    color: st.muted ? C.textDim : C.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {rfp.subject || "Untitled RFP"}
                </span>
                {st.badge && (
                  <span
                    style={{
                      fontSize: 7,
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: resolveStateColor(st.colorKey) ? `${resolveStateColor(st.colorKey)}20` : undefined,
                      color: resolveStateColor(st.colorKey),
                      flexShrink: 0,
                      letterSpacing: "0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {st.badge}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 1,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: C.textDim,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "60%",
                  }}
                >
                  {rfp.sender_name || rfp.sender_email || "Unknown"}
                </span>
                <span style={{ fontSize: 8, color: C.textDim, opacity: 0.7, flexShrink: 0 }}>
                  {timeAgo(rfp.created_at)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — View Inbox button */}
      <button
        onClick={() => navigate("/inbox")}
        style={bt(C, {
          marginTop: 8,
          width: "100%",
          padding: "6px 12px",
          background:
            unreadCount > 0 ? `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.accent})` : "transparent",
          color: unreadCount > 0 ? "#fff" : C.textMuted,
          border: unreadCount > 0 ? "none" : `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: font,
        })}
      >
        {unreadCount > 0 ? `View ${unreadCount} Pending RFP${unreadCount !== 1 ? "s" : ""} →` : "Open Inbox →"}
      </button>
    </div>
  );
}
