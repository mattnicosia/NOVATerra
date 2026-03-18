import { useTheme } from "@/hooks/useTheme";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";

export default function ReadOnlyBanner() {
  const C = useTheme();
  const currentLock = useCollaborationStore(s => s.currentLock);
  const forceReleaseLock = useCollaborationStore(s => s.forceReleaseLock);
  const isManager = useOrgStore(selectIsManager);

  if (!currentLock) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "rgba(255,149,0,0.12)",
        borderBottom: "1px solid rgba(255,149,0,0.25)",
        fontSize: 12,
        color: C.text,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: currentLock.lockedByColor || "#60A5FA",
            flexShrink: 0,
          }}
        />
        <span>
          <strong>{currentLock.lockedByName}</strong> is editing this estimate
          <span style={{ color: C.textMuted, marginLeft: 6 }}>· Read-only mode</span>
        </span>
      </div>
      {isManager && (
        <button
          onClick={() => forceReleaseLock(currentLock.estimateId)}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#FF9500",
            background: "rgba(255,149,0,0.15)",
            border: "1px solid rgba(255,149,0,0.3)",
            borderRadius: 4,
            padding: "3px 10px",
            cursor: "pointer",
          }}
        >
          Force Unlock
        </button>
      )}
    </div>
  );
}
