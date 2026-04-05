// ── Re-export shim: correspondenceStore → collaborationStore ──
// All state + actions now live in the consolidated collaborationStore.
// This file kept for backward compatibility — import from here or from collaborationStore directly.
export { useCollaborationStore as useCorrespondenceStore } from "@/stores/collaborationStore";
