import { useTheme } from '@/hooks/useTheme';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt, card } from '@/utils/styles';

const STATUS_COLORS = {
  pending: { bg: "#f59e0b18", color: "#f59e0b", label: "Pending" },
  parsed: { bg: "#22c55e18", color: "#22c55e", label: "Ready" },
  imported: { bg: "#6366f118", color: "#6366f1", label: "Imported" },
  dismissed: { bg: "#64748b18", color: "#64748b", label: "Dismissed" },
  error: { bg: "#ef444418", color: "#ef4444", label: "Error" },
};

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

export default function RfpCard({ rfp, onView, onImport, onDismiss }) {
  const C = useTheme();
  const T = C.T;
  const st = STATUS_COLORS[rfp.status] || STATUS_COLORS.pending;
  const pd = rfp.parsed_data || {};
  const attachments = rfp.attachments || [];
  const confidence = pd.confidence != null ? Math.round(pd.confidence * 100) : null;

  return (
    <div style={{
      ...card(C),
      padding: T.space[5],
      marginBottom: T.space[3],
      transition: T.transition.fast,
      cursor: "pointer",
    }}
    onClick={() => onView(rfp)}
    onMouseOver={e => { e.currentTarget.style.borderColor = C.accent + "40"; }}
    onMouseOut={e => { e.currentTarget.style.borderColor = C.border; }}
    >
      {/* Top row: status badge + time */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <span style={{
            fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold,
            padding: "2px 8px", borderRadius: T.radius.full,
            background: st.bg, color: st.color,
          }}>{st.label}</span>
          {confidence !== null && rfp.status === "parsed" && (
            <span style={{
              fontSize: T.fontSize.xs, color: confidence > 70 ? C.green : confidence > 40 ? "#f59e0b" : C.red,
              fontWeight: T.fontWeight.medium,
            }}>
              {confidence}% confidence
            </span>
          )}
        </div>
        <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
          {timeAgo(rfp.received_at)}
        </span>
      </div>

      {/* Subject */}
      <div style={{
        fontSize: T.fontSize.base, fontWeight: T.fontWeight.semibold, color: C.text,
        marginBottom: T.space[1], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {rfp.subject || "(no subject)"}
      </div>

      {/* Sender */}
      <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, marginBottom: T.space[3] }}>
        from {rfp.sender_name || rfp.sender_email}
      </div>

      {/* Parsed highlights (if available) */}
      {pd.projectName && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: T.space[2], marginBottom: T.space[3],
        }}>
          {pd.projectName && (
            <span style={{
              fontSize: T.fontSize.xs, padding: "2px 6px", borderRadius: T.radius.sm,
              background: C.accentBg, color: C.accent, fontWeight: T.fontWeight.medium,
            }}>
              {pd.projectName}
            </span>
          )}
          {pd.bidDue && (
            <span style={{
              fontSize: T.fontSize.xs, padding: "2px 6px", borderRadius: T.radius.sm,
              background: "#f59e0b18", color: "#f59e0b", fontWeight: T.fontWeight.medium,
            }}>
              Due: {pd.bidDue}
            </span>
          )}
          {pd.jobType && (
            <span style={{
              fontSize: T.fontSize.xs, padding: "2px 6px", borderRadius: T.radius.sm,
              background: `${C.purple}18`, color: C.purple, fontWeight: T.fontWeight.medium,
            }}>
              {pd.jobType}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: attachment count + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[1], color: C.textDim, fontSize: T.fontSize.xs }}>
          {attachments.length > 0 && (
            <>
              <Ic d={I.plans} size={12} color={C.textDim} />
              <span>{attachments.length} attachment{attachments.length !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: T.space[2] }} onClick={e => e.stopPropagation()}>
          {(rfp.status === "parsed" || rfp.status === "pending") && (
            <>
              <button style={bt(C, {
                padding: "4px 12px", background: C.accent, color: "#fff", fontSize: T.fontSize.xs,
              })} onClick={() => onImport(rfp)}>
                Import
              </button>
              <button style={bt(C, {
                padding: "4px 12px", background: "transparent", color: C.textMuted,
                border: `1px solid ${C.border}`, fontSize: T.fontSize.xs,
              })} onClick={() => onDismiss(rfp.id)}>
                Dismiss
              </button>
            </>
          )}
          {rfp.status === "imported" && (
            <span style={{ fontSize: T.fontSize.xs, color: C.textDim, fontStyle: "italic" }}>Imported</span>
          )}
        </div>
      </div>
    </div>
  );
}
