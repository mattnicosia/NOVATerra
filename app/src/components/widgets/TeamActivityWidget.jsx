/**
 * TeamActivityWidget — Real-time org activity feed
 * Shows who's doing what across the team.
 */
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore } from "@/stores/orgStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function TeamActivityWidget() {
  const C = useTheme();
  const T = C.T;
  const [activities, setActivities] = useState([]);
  const prevIndexRef = useRef(null);

  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const members = useOrgStore(s => s.members);
  const viewers = useCollaborationStore(s => s.viewers);

  // Build activity from estimate index changes + presence
  useEffect(() => {
    const feed = [];

    // Active viewers from collaboration
    viewers.forEach(v => {
      feed.push({
        id: `viewer-${v.user_id}`,
        name: v.user_name || "Someone",
        color: v.user_color || C.accent,
        action: v.activity?.type === "editing" ? `editing ${v.activity?.label || "an item"}` : "viewing an estimate",
        time: v.last_seen,
        icon: v.activity?.type === "editing" ? I.edit : I.eye,
      });
    });

    // Recent estimate updates (from index metadata)
    const sorted = [...estimatesIndex]
      .filter(e => e.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 10);

    sorted.forEach(est => {
      // Find member who last modified (if we tracked it)
      feed.push({
        id: `est-${est.id}`,
        name: est._lastModifiedBy || "Team",
        color: C.accent,
        action: `updated "${est.name || "Untitled"}"`,
        time: est.updated_at,
        icon: I.save,
      });
    });

    // Sort by time, keep last 20
    feed.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    setActivities(feed.slice(0, 20));
    prevIndexRef.current = estimatesIndex;
  }, [estimatesIndex, viewers, members, C.accent]);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: `${T.space[2]}px 0` }}>
      {activities.length === 0 ? (
        <div style={{ padding: T.space[4], textAlign: "center", color: C.textDim, fontSize: 10 }}>
          No team activity yet
        </div>
      ) : (
        activities.map(a => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: `3px ${T.space[3]}px`,
              fontSize: 9,
            }}
          >
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: a.color }}>{(a.name || "").split(" ")[0]}</span>
            <span style={{ color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {a.action}
            </span>
            <span style={{ color: C.textDim, fontSize: 8, flexShrink: 0 }}>{timeAgo(a.time)}</span>
          </div>
        ))
      )}
    </div>
  );
}
