import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useInboxStore } from "@/stores/inboxStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

/* ────────────────────────────────────────────────────────
   InboxWidget — Pending RFPs and bid invitations
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

export default function InboxWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const font = T.font.display;
  const navigate = useNavigate();

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
  }, []);

  // Filter by status, then by company profile — exact match
  const pendingRfps = useMemo(() => {
    const pending = rfps.filter(r => r.status === "parsed" || r.status === "pending");
    if (activeCompanyId === "__all__") return pending;
    return pending.filter(r => (r.company_profile_id || "") === (activeCompanyId || ""));
  }, [rfps, activeCompanyId]);

  // Profile-filtered unread count
  const unreadCount = useMemo(() => pendingRfps.filter(r => !readIds.includes(r.id)).length, [pendingRfps, readIds]);

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
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading && rfps.length === 0 && (
          <div style={{ fontSize: 10, color: C.textDim, padding: "8px 0" }}>Loading...</div>
        )}

        {!loading && pendingRfps.length === 0 && (
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
            <div style={{ fontSize: 10, color: C.textDim, textAlign: "center", lineHeight: 1.5 }}>No pending RFPs</div>
            <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", opacity: 0.6 }}>
              Forward bid invitations to
              <br />
              <span style={{ color: C.accent, fontWeight: 600 }}>bids@novabuild.app</span>
            </div>
          </div>
        )}

        {pendingRfps.slice(0, 4).map(rfp => (
          <div
            key={rfp.id}
            onClick={() => navigate("/inbox")}
            style={{
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
            onMouseLeave={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)")}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {rfp.subject || "Untitled RFP"}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 2,
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
        ))}
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
