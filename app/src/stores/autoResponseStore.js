import { create } from "zustand";
import { uid } from "@/utils/format";

/* ─── Trigger type definitions ─── */
export const TRIGGER_TYPES = {
  portalOpened: { label: "Portal Opened", description: "Sub viewed the bid portal", color: "#7C5CFC" },
  proposalSubmitted: { label: "Proposal Submitted", description: "Sub uploaded their bid", color: "#34C759" },
  bidDue48h: { label: "48h Reminder", description: "Bid due in 48 hours", color: "#FF9F0A" },
  bidDue24h: { label: "24h Reminder", description: "Bid due in 24 hours", color: "#FF453A" },
  postAwardWinner: { label: "Award (Winner)", description: "Sub was awarded the bid", color: "#30D158" },
  postAwardLoser: { label: "Award (Result)", description: "Sub was not awarded", color: "#8E8E93" },
  noResponse72h: {
    label: "No Response (72h)",
    description: "Sub hasn't opened invitation in 72 hours",
    color: "#FF9F0A",
  },
};

const DEFAULT_CONFIG = {
  portalOpened: { enabled: true },
  proposalSubmitted: { enabled: true },
  bidDue48h: { enabled: true },
  bidDue24h: { enabled: true },
  postAwardWinner: { enabled: true },
  postAwardLoser: { enabled: true },
  noResponse72h: { enabled: true },
};

export const useAutoResponseStore = create((set, get) => ({
  // ── Trigger configuration (persisted to IDB) ──
  triggerConfig: { ...DEFAULT_CONFIG },

  // ── Draft queue (persisted to IDB) ──
  drafts: [],

  // ── Setters for persistence hydration ──
  setTriggerConfig: v => set({ triggerConfig: v }),
  setDrafts: v => set({ drafts: v }),

  // ── Trigger config actions ──
  updateTrigger: (type, updates) =>
    set(s => ({
      triggerConfig: {
        ...s.triggerConfig,
        [type]: { ...(s.triggerConfig[type] || {}), ...updates },
      },
    })),

  // ── Draft queue actions ──
  addDraft: draft =>
    set(s => ({
      drafts: [
        ...s.drafts,
        {
          id: uid(),
          status: "pending",
          createdAt: new Date().toISOString(),
          ...draft,
        },
      ],
    })),

  updateDraft: (id, updates) =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, ...updates } : d)),
    })),

  approveDraft: id =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, status: "approved" } : d)),
    })),

  dismissDraft: id =>
    set(s => ({
      drafts: s.drafts.map(d => (d.id === id ? { ...d, status: "dismissed" } : d)),
    })),

  markSent: (id, emailId) =>
    set(s => ({
      drafts: s.drafts.map(d =>
        d.id === id ? { ...d, status: "sent", sentAt: new Date().toISOString(), emailId } : d,
      ),
    })),

  removeDraft: id => set(s => ({ drafts: s.drafts.filter(d => d.id !== id) })),

  // ── Derived helpers ──
  getPendingDrafts: () => get().drafts.filter(d => d.status === "pending"),
  getPendingCount: () => get().drafts.filter(d => d.status === "pending").length,

  // ── Duplicate guard ──
  hasDraft: (triggerType, invitationId) =>
    get().drafts.some(
      d =>
        d.triggerType === triggerType &&
        d.invitationId === invitationId &&
        (d.status === "pending" || d.status === "sent"),
    ),
}));
