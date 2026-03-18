import { create } from "zustand";
import { storage } from "@/utils/storage";
import { uid, nowStr } from "@/utils/format";
import { idbKey } from "@/utils/idbKey";

const RFI_KEY_PREFIX = "bldg-rfis-";

/**
 * RFI Store — Persistent Request for Information tracking.
 *
 * RFI shape:
 * {
 *   id, number, subject, reference, question, impact,
 *   status: "open" | "answered" | "closed",
 *   dateCreated, dateDue, dateAnswered,
 *   responsibleParty, answer, costImpact,
 *   linkedItemIds: [], specSection,
 *   source: "ai" | "manual"
 * }
 */
export const useRfiStore = create((set, get) => ({
  rfis: [],
  loaded: false,

  // ── Load ──────────────────────────────────────────────────
  loadRFIs: async estimateId => {
    try {
      const raw = await storage.get(idbKey(`${RFI_KEY_PREFIX}${estimateId}`));
      if (raw) {
        set({ rfis: JSON.parse(raw.value), loaded: true });
      } else {
        set({ rfis: [], loaded: true });
      }
    } catch (e) {
      console.error("Failed to load RFIs:", e);
      set({ loaded: true });
    }
  },

  // ── Save ──────────────────────────────────────────────────
  _persist: async estimateId => {
    const list = get().rfis;
    await storage.set(idbKey(`${RFI_KEY_PREFIX}${estimateId}`), JSON.stringify(list));
  },

  // ── Add ───────────────────────────────────────────────────
  addRFI: (estimateId, rfi) => {
    const nextNumber = get().rfis.length + 1;
    const newRfi = {
      id: uid(),
      number: rfi.number || nextNumber,
      subject: rfi.subject || "",
      reference: rfi.reference || "",
      question: rfi.question || "",
      impact: rfi.impact || "",
      status: "open",
      dateCreated: nowStr(),
      dateDue: rfi.dateDue || "",
      dateAnswered: "",
      responsibleParty: rfi.responsibleParty || "",
      answer: "",
      costImpact: "",
      linkedItemIds: rfi.linkedItemIds || [],
      specSection: rfi.specSection || "",
      source: rfi.source || "manual",
    };
    set(s => ({ rfis: [...s.rfis, newRfi] }));
    get()._persist(estimateId);
    return newRfi;
  },

  // ── Bulk add (from AI generation) ─────────────────────────
  addBulkRFIs: (estimateId, rfis) => {
    const startNum = get().rfis.length + 1;
    const newRfis = rfis.map((rfi, i) => ({
      id: uid(),
      number: startNum + i,
      subject: rfi.subject || "",
      reference: rfi.reference || "",
      question: rfi.question || "",
      impact: rfi.impact || "",
      status: "open",
      dateCreated: nowStr(),
      dateDue: "",
      dateAnswered: "",
      responsibleParty: "",
      answer: "",
      costImpact: "",
      linkedItemIds: [],
      specSection: "",
      source: "ai",
    }));
    set(s => ({ rfis: [...s.rfis, ...newRfis] }));
    get()._persist(estimateId);
  },

  // ── Update ────────────────────────────────────────────────
  updateRFI: (estimateId, rfiId, field, value) => {
    set(s => ({
      rfis: s.rfis.map(r => (r.id === rfiId ? { ...r, [field]: value } : r)),
    }));
    get()._persist(estimateId);
  },

  // ── Set status ────────────────────────────────────────────
  setRFIStatus: (estimateId, rfiId, status) => {
    set(s => ({
      rfis: s.rfis.map(r =>
        r.id === rfiId
          ? { ...r, status, ...(status === "answered" ? { dateAnswered: nowStr() } : {}) }
          : r,
      ),
    }));
    get()._persist(estimateId);
  },

  // ── Remove ────────────────────────────────────────────────
  removeRFI: (estimateId, rfiId) => {
    set(s => ({ rfis: s.rfis.filter(r => r.id !== rfiId) }));
    get()._persist(estimateId);
  },

  // ── Selectors ─────────────────────────────────────────────
  getRFIsByStatus: status => get().rfis.filter(r => r.status === status),
  getOverdueRFIs: () => {
    const now = Date.now();
    return get().rfis.filter(r => r.status === "open" && r.dateDue && new Date(r.dateDue).getTime() < now);
  },
}));
