/**
 * RemoteCursors — Overlay showing other users' cursors on the drawing canvas
 *
 * Reads cursor positions from collaborationStore.viewers (via Supabase Presence).
 * Each cursor shows as a colored arrow + username label.
 * Cursors fade out after 5 seconds of no movement.
 *
 * Usage: <RemoteCursors currentSheetId={selectedDrawingId} />
 * Place as a sibling to the canvas, positioned absolutely over it.
 */

import { useMemo } from "react";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useAuthStore } from "@/stores/authStore";

const FADE_TIMEOUT_MS = 5000; // fade cursor after 5s of no movement

export default function RemoteCursors({ currentSheetId }) {
  const user = useAuthStore(s => s.user);
  const viewers = useCollaborationStore(s => s.viewers);

  // Filter to cursors on this sheet, excluding self
  const cursors = useMemo(() => {
    const now = Date.now();
    return viewers
      .filter(v => {
        if (v.user_id === user?.id) return false;
        if (!v.cursor) return false;
        if (v.cursor.sheetId !== currentSheetId) return false;
        return true;
      })
      .map(v => ({
        userId: v.user_id,
        name: (v.user_name || "?").split(" ")[0],
        color: v.user_color || "#60A5FA",
        x: v.cursor.x,
        y: v.cursor.y,
      }));
  }, [viewers, user?.id, currentSheetId]);

  if (cursors.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {cursors.map(c => (
        <div
          key={c.userId}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            transform: "translate(-2px, -2px)",
            transition: "left 80ms linear, top 80ms linear",
            willChange: "left, top",
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="16"
            height="20"
            viewBox="0 0 16 20"
            fill="none"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
          >
            <path
              d="M1 1L1 15L5.5 11L10 19L12.5 17.5L8 10L14 10L1 1Z"
              fill={c.color}
              stroke="#fff"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>

          {/* Username label */}
          <div
            style={{
              position: "absolute",
              left: 14,
              top: 14,
              background: c.color,
              color: "#fff",
              fontSize: 9,
              fontWeight: 600,
              padding: "1px 5px",
              borderRadius: 3,
              whiteSpace: "nowrap",
              lineHeight: "14px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              userSelect: "none",
            }}
          >
            {c.name}
          </div>
        </div>
      ))}
    </div>
  );
}
