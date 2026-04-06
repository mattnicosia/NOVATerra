import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RfpCard({ rfp, isUnread, onView, onImport, onDismiss, onRetry, onToggleRead }) {
  const C = useTheme();
  const T = C.T;
  const [hovered, setHovered] = useState(false);
  const pd = rfp.parsed_data || {};
  const attachments = rfp.attachments || [];
  const rawConf = pd.confidence;
  // Normalize: API may return 0-1 (0.85), 0-10 (8.5), or 0-100 (85)
  const confidence =
    rawConf != null ? Math.round((rawConf > 10 ? rawConf / 100 : rawConf > 1 ? rawConf / 10 : rawConf) * 100) : null;

  const isError = rfp.status === "error";
  const isImported = rfp.status === "imported";
  const isDismissed = rfp.status === "dismissed";
  const isPending = rfp.status === "pending";
  const isQueued = rfp.status === "queued";
  const isProcessing = rfp.status === "processing";
  const isAddendum = rfp.type === "addendum";
  const isRelated = rfp.type === "related"; // Non-addendum follow-up email
  const classification = rfp.classification || (isAddendum ? "addendum" : "initial_rfp");

  // Classification colors
  const classColors = {
    addendum: C.orange,
    date_change: C.orange,
    scope_clarification: C.blue,
    substitution: C.purple,
    pre_bid_notes: C.green,
    plan_room_notification: C.textMuted,
  };

  // Left accent bar color — immediate visual signal
  const accentColor =
    (isAddendum || isRelated) && isUnread
      ? classColors[classification] || "#FF9500"
      : isUnread
        ? C.accent
        : isError
          ? "#ef4444"
          : isImported
            ? "#22c55e"
            : isPending || isQueued
              ? "#f59e0b"
              : isProcessing
                ? C.accent
                : null;

  // Classification labels for display
  const classLabels = {
    date_change: "Date Change",
    scope_clarification: "Scope Clarification",
    substitution: "Substitution",
    pre_bid_notes: "Pre-Bid Notes",
    plan_room_notification: "Plan Room",
    other: "Related",
  };

  // Status badge
  let badgeLabel, badgeBg, badgeColor;
  if (isAddendum && !isImported && !isDismissed && !isError) {
    // Addendum-specific badge
    badgeLabel = `Addendum #${rfp.addendum_number || "?"}`;
    badgeBg = "#FF950020";
    badgeColor = "#FF9500";
  } else if (isRelated && !isImported && !isDismissed && !isError && classLabels[classification]) {
    // Related email with classification
    const clsColor = classColors[classification] || "#94A3B8";
    badgeLabel = classLabels[classification];
    badgeBg = `${clsColor}20`;
    badgeColor = clsColor;
  } else if (isProcessing) {
    const step = rfp.processing_step;
    const stepLabels = { parsing: "Parsing", matching: "Matching", creating_draft: "Creating Draft", uploading: "Uploading" };
    badgeLabel = stepLabels[step] || "Processing";
    badgeBg = `${C.accent}20`;
    badgeColor = C.accent;
  } else if (isQueued) {
    badgeLabel = "Queued";
    badgeBg = "#f59e0b20";
    badgeColor = "#f59e0b";
  } else if (isUnread) {
    badgeLabel = isPending ? "Processing" : "New";
    badgeBg = isPending ? "#f59e0b20" : `${C.accent}20`;
    badgeColor = isPending ? "#f59e0b" : C.accent;
  } else if (isError) {
    badgeLabel = "Error";
    badgeBg = "#ef444420";
    badgeColor = "#ef4444";
  } else if (isImported) {
    badgeLabel = isAddendum ? `Add. #${rfp.addendum_number || "?"} Imported` : "Imported";
    badgeBg = "#22c55e20";
    badgeColor = "#22c55e";
  } else if (isDismissed) {
    badgeLabel = "Dismissed";
    badgeBg = "#64748b20";
    badgeColor = "#64748b";
  } else if (isPending) {
    badgeLabel = "Processing";
    badgeBg = "#f59e0b20";
    badgeColor = "#f59e0b";
  } else {
    badgeLabel = "Ready";
    badgeBg = "#22c55e20";
    badgeColor = "#22c55e";
  }

  return (
    <div
      style={{
        ...card(C),
        padding: 0,
        marginBottom: T.space[3],
        transition: T.transition.fast,
        cursor: "pointer",
        opacity: isDismissed ? 0.5 : 1,
        overflow: "hidden",
      }}
      onClick={() => onView(rfp)}
      onMouseEnter={e => {
        setHovered(true);
        if (!isDismissed) e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accent}40`;
      }}
      onMouseLeave={e => {
        setHovered(false);
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex" }}>
        {/* Left accent bar */}
        {accentColor && (
          <div
            style={{
              width: 4,
              flexShrink: 0,
              background: accentColor,
              borderRadius: `${T.radius.md}px 0 0 ${T.radius.md}px`,
            }}
          />
        )}

        {/* Card content */}
        <div style={{ flex: 1, padding: T.space[5] }}>
          {/* Top row: unread dot + badge + time */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: T.space[3],
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
              {isUnread && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: C.accent,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: T.fontWeight.semibold,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: badgeBg,
                  color: badgeColor,
                }}
              >
                {badgeLabel}
              </span>
              {confidence !== null && rfp.status === "parsed" && (
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    color: confidence > 70 ? "#22c55e" : confidence > 40 ? "#f59e0b" : "#ef4444",
                    fontWeight: T.fontWeight.medium,
                  }}
                >
                  {confidence}% confidence
                </span>
              )}
              {isProcessing && rfp.processing_progress > 0 && (
                <div style={{ flex: 1, maxWidth: 120, height: 3, borderRadius: 2, background: `${C.textDim}15`, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, background: C.accent,
                    width: `${rfp.processing_progress}%`, transition: "width 0.3s ease",
                  }} />
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
              {hovered && onToggleRead && ["queued", "processing", "parsed", "pending"].includes(rfp.status) && (
                <button
                  title={isUnread ? "Mark as read" : "Mark as unread"}
                  onClick={e => {
                    e.stopPropagation();
                    onToggleRead(rfp.id);
                  }}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.sm,
                    cursor: "pointer",
                    padding: "2px 8px",
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s, border-color 0.12s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = C.accent;
                    e.currentTarget.style.borderColor = C.accent + "60";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = C.textMuted;
                    e.currentTarget.style.borderColor = C.border;
                  }}
                >
                  {isUnread ? "Mark Read" : "Mark Unread"}
                </button>
              )}
              <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{timeAgo(rfp.received_at)}</span>
            </div>
          </div>

          {/* Subject — bold when unread */}
          <div
            style={{
              fontSize: T.fontSize.base,
              fontWeight: isUnread ? T.fontWeight.bold : T.fontWeight.medium,
              color: isDismissed ? C.textMuted : C.text,
              marginBottom: T.space[1],
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {rfp.subject || "(no subject)"}
          </div>

          {/* Sender */}
          <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[3] }}>
            from {rfp.sender_name || rfp.sender_email}
          </div>

          {/* Error message */}
          {isError && rfp.parse_error && (
            <div
              style={{
                fontSize: T.fontSize.xs,
                color: "#ef4444",
                marginBottom: T.space[3],
                padding: "4px 8px",
                borderRadius: T.radius.sm,
                background: "#ef444410",
              }}
            >
              Parse error: {rfp.parse_error}
            </div>
          )}

          {/* Parsed highlights */}
          {pd.projectName && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[2], marginBottom: T.space[3] }}>
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  padding: "2px 6px",
                  borderRadius: T.radius.sm,
                  background: C.accentBg,
                  color: C.accent,
                  fontWeight: T.fontWeight.medium,
                }}
              >
                {pd.projectName}
              </span>
              {pd.bidDue && (
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    padding: "2px 6px",
                    borderRadius: T.radius.sm,
                    background: "#f59e0b18",
                    color: "#f59e0b",
                    fontWeight: T.fontWeight.medium,
                  }}
                >
                  Due: {pd.bidDue}
                </span>
              )}
              {pd.jobType && (
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    padding: "2px 6px",
                    borderRadius: T.radius.sm,
                    background: "#8b5cf618",
                    color: "#8b5cf6",
                    fontWeight: T.fontWeight.medium,
                  }}
                >
                  {pd.jobType}
                </span>
              )}
            </div>
          )}

          {/* Bottom row: attachments + actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[1],
                color: C.textDim,
                fontSize: T.fontSize.xs,
              }}
            >
              {attachments.length > 0 && (
                <>
                  <Ic d={I.plans} size={12} color={C.textDim} />
                  <span>
                    {attachments.length} attachment{attachments.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
              {pd.planLinks?.length > 0 && (
                <>
                  <Ic d={I.externalLink} size={12} color={C.textDim} />
                  <span>
                    {pd.planLinks.length} plan link{pd.planLinks.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: T.space[2] }} onClick={e => e.stopPropagation()}>
              {(rfp.status === "parsed" || rfp.status === "pending") && (
                <>
                  <button
                    style={bt(C, {
                      padding: "4px 12px",
                      background: C.accent,
                      color: "#fff",
                      fontSize: T.fontSize.xs,
                    })}
                    onClick={() => onImport(rfp)}
                  >
                    Import
                  </button>
                  <button
                    style={bt(C, {
                      padding: "4px 12px",
                      background: "transparent",
                      color: C.textMuted,
                      border: `1px solid ${C.border}`,
                      fontSize: T.fontSize.xs,
                    })}
                    onClick={() => onDismiss(rfp.id)}
                  >
                    Dismiss
                  </button>
                </>
              )}
              {isError && onRetry && (
                <>
                  <button
                    style={bt(C, {
                      padding: "4px 12px",
                      background: "#f59e0b",
                      color: "#fff",
                      fontSize: T.fontSize.xs,
                    })}
                    onClick={() => onRetry(rfp.id)}
                  >
                    Retry
                  </button>
                  <button
                    style={bt(C, {
                      padding: "4px 12px",
                      background: "transparent",
                      color: C.textMuted,
                      border: `1px solid ${C.border}`,
                      fontSize: T.fontSize.xs,
                    })}
                    onClick={() => onDismiss(rfp.id)}
                  >
                    Dismiss
                  </button>
                </>
              )}
              {isImported && (
                <>
                  <button
                    style={bt(C, {
                      padding: "4px 12px",
                      background: "transparent",
                      color: C.accent,
                      border: `1px solid ${C.accent}40`,
                      fontSize: T.fontSize.xs,
                    })}
                    onClick={() => onImport(rfp)}
                  >
                    Re-Import
                  </button>
                  <span style={{ fontSize: T.fontSize.xs, color: "#22c55e", fontWeight: T.fontWeight.medium }}>
                    ✓ Imported
                  </span>
                </>
              )}
              {isDismissed && (
                <button
                  style={bt(C, {
                    padding: "4px 12px",
                    background: "transparent",
                    color: C.accent,
                    border: `1px solid ${C.accent}40`,
                    fontSize: T.fontSize.xs,
                  })}
                  onClick={() => onImport(rfp)}
                >
                  Import
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
