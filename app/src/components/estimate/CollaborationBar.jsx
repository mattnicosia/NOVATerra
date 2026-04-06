/**
 * CollaborationBar — Real-time presence & lock status for estimates
 *
 * Sprint 4.1: Shows who's viewing/editing, lock state, and team activity.
 * Integrates with collaborationStore for Supabase Realtime presence + locks.
 *
 * Displays:
 *   - Avatar stack of active viewers
 *   - Lock status badge ("You're editing" / "Locked by Jane" / "Available")
 *   - Edit / Release / Force Release buttons
 */

import { useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

export default function CollaborationBar() {
  const C = useTheme();
  const T = C.T;

  const user = useAuthStore(s => s.user);
  const isManager = selectIsManager(useOrgStore.getState());
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);

  const currentLock = useCollaborationStore(s => s.currentLock);
  const isLockHolder = useCollaborationStore(s => s.isLockHolder);
  const viewers = useCollaborationStore(s => s.viewers);
  const acquireLock = useCollaborationStore(s => s.acquireLock);
  const releaseLock = useCollaborationStore(s => s.releaseLock);
  const forceReleaseLock = useCollaborationStore(s => s.forceReleaseLock);
  const joinEstimate = useCollaborationStore(s => s.joinEstimate);
  const _leaveEstimate = useCollaborationStore(s => s.leaveEstimate);
  const subscribeLockChanges = useCollaborationStore(s => s.subscribeLockChanges);
  const subscribePresence = useCollaborationStore(s => s.subscribePresence);
  const cleanup = useCollaborationStore(s => s.cleanup);

  // Join estimate presence + subscribe to changes on mount
  useEffect(() => {
    if (!activeEstimateId || !user?.id) return;

    joinEstimate(activeEstimateId);
    subscribeLockChanges(activeEstimateId);
    subscribePresence(activeEstimateId);

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEstimateId, user?.id]); // Zustand actions are stable

  const handleStartEditing = useCallback(() => {
    if (activeEstimateId) acquireLock(activeEstimateId);
  }, [activeEstimateId, acquireLock]);

  const handleStopEditing = useCallback(() => {
    if (activeEstimateId) releaseLock(activeEstimateId);
  }, [activeEstimateId, releaseLock]);

  const handleForceRelease = useCallback(() => {
    if (activeEstimateId) forceReleaseLock(activeEstimateId);
  }, [activeEstimateId, forceReleaseLock]);

  // Filter out self from viewers for display
  const totalViewers = viewers.length;

  // Lock status
  const isLocked = !!currentLock;
  const isLockedByOther = isLocked && !isLockHolder;

  if (!activeEstimateId) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[3],
        padding: `${T.space[1]}px ${T.space[4]}px`,
        borderBottom: `1px solid ${C.border}06`,
        background: isLockedByOther ? `${C.orange}06` : isLockHolder ? `${C.green}04` : "transparent",
        minHeight: 32,
        flexShrink: 0,
      }}
    >
      {/* Viewer avatars */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", marginRight: 6 }}>
          {viewers.slice(0, 5).map((v, i) => (
            <div
              key={v.user_id}
              title={v.user_name}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: v.user_color || C.accent,
                border: `2px solid ${C.bg}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                color: "#fff",
                marginLeft: i > 0 ? -6 : 0,
                zIndex: 5 - i,
                position: "relative",
              }}
            >
              {(v.user_name || "?")[0].toUpperCase()}
            </div>
          ))}
          {viewers.length > 5 && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: C.bg3,
                border: `2px solid ${C.bg}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 7,
                fontWeight: 700,
                color: C.textDim,
                marginLeft: -6,
              }}
            >
              +{viewers.length - 5}
            </div>
          )}
        </div>
        <span style={{ fontSize: 9, color: C.textDim }}>
          {totalViewers === 0
            ? ""
            : totalViewers === 1
              ? "Just you"
              : `${totalViewers} viewer${totalViewers !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Activity indicators */}
      {viewers.filter(v => v.user_id !== user?.id && v.activity).slice(0, 3).map(v => {
        const act = v.activity;
        const actLabel = act?.type === "takeoff" ? `on ${act.label || "takeoff"}`
          : act?.type === "drawing" ? `on ${act.label || "sheet"}`
          : act?.type === "item" ? `editing ${act.label || "item"}`
          : act?.type === "editing" ? `editing ${act.label || "an item"}`
          : null;
        if (!actLabel) return null;
        return (
          <div key={v.user_id} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: C.textDim }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: v.user_color || C.accent,
              boxShadow: `0 0 0 2px ${(v.user_color || C.accent)}40`,
              animation: "pulse 2s infinite",
            }} />
            <span style={{ fontWeight: 600, color: v.user_color || C.accent }}>{(v.user_name || "?").split(" ")[0]}</span>
            <span>— {actLabel}</span>
          </div>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Lock status */}
      {isLockHolder && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9,
              fontWeight: 600,
              color: C.green,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: C.green,
                animation: "pulse 2s infinite",
              }}
            />
            You're editing
          </div>
          <button
            onClick={handleStopEditing}
            style={bt(C, {
              padding: "3px 8px",
              fontSize: 8,
              fontWeight: 600,
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
            })}
          >
            Release Lock
          </button>
        </>
      )}

      {isLockedByOther && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 9,
              color: C.orange,
              fontWeight: 600,
            }}
          >
            <Ic d={I.lock || I.settings} size={10} color={C.orange} />
            <span>
              Locked by{" "}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: currentLock.lockedByColor || C.accent,
                    display: "inline-block",
                  }}
                />
                {currentLock.lockedByName || "Someone"}
              </span>
            </span>
          </div>
          <span style={{ fontSize: 8, color: C.textDim }}>View-only mode</span>
          {isManager && (
            <button
              onClick={handleForceRelease}
              title="Force release lock (manager)"
              style={bt(C, {
                padding: "3px 8px",
                fontSize: 8,
                fontWeight: 600,
                background: "transparent",
                border: `1px solid ${C.orange}40`,
                color: C.orange,
              })}
            >
              Force Release
            </button>
          )}
        </>
      )}

      {!isLocked && (
        <button
          onClick={handleStartEditing}
          style={bt(C, {
            padding: "3px 10px",
            fontSize: 9,
            fontWeight: 600,
            background: C.accent,
            color: "#fff",
          })}
        >
          <Ic d={I.edit || I.settings} size={9} color="#fff" /> Start Editing
        </button>
      )}
    </div>
  );
}
