// Auto-Response Banner — shows when there are pending drafts awaiting approval
// Renders between NovaHeader and ProjectTabBar in App.jsx
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useCollaborationStore } from "@/stores/collaborationStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function AutoResponseBanner({ onReviewClick }) {
  const C = useTheme();
  const T = C.T;
  const pendingCount = useCollaborationStore(s => s.getPendingCount());
  const [snoozed, setSnoozed] = useState(false);

  if (pendingCount === 0 || snoozed) return null;

  const dk = C.isDark !== false;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 28px",
        background: dk
          ? "linear-gradient(135deg, rgba(124,92,252,0.08) 0%, rgba(191,90,242,0.04) 100%)"
          : "linear-gradient(135deg, rgba(124,92,252,0.06) 0%, rgba(191,90,242,0.03) 100%)",
        borderBottom: `1px solid ${dk ? "rgba(124,92,252,0.15)" : "rgba(124,92,252,0.12)"}`,
        fontFamily: T.font.sans,
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>N</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
          {pendingCount} auto-response{pendingCount !== 1 ? "s" : ""} ready for review
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={onReviewClick}
          style={{
            padding: "4px 12px",
            fontSize: 10,
            fontWeight: 700,
            border: "none",
            borderRadius: 5,
            background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
            color: "#fff",
            cursor: "pointer",
            fontFamily: T.font.sans,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          Review All
        </button>
        <button
          onClick={() => setSnoozed(true)}
          title="Dismiss for this session"
          style={{
            width: 20,
            height: 20,
            border: "none",
            borderRadius: 4,
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            opacity: 0.5,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
        >
          <Ic d={I.x} size={10} color={C.textDim} sw={2} />
        </button>
      </div>
    </div>
  );
}
