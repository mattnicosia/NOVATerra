// ── Re-export shim: autoResponseStore → collaborationStore ──
// All state + actions now live in the consolidated collaborationStore.
// This file kept for backward compatibility — import from here or from collaborationStore directly.
export { useCollaborationStore as useAutoResponseStore, TRIGGER_TYPES } from "@/stores/collaborationStore";
