import { create } from "zustand";
import { uid } from "@/utils/format";

export const useBidLevelingStore = create((set, _get) => ({
  subBidSubs: {},
  bidTotals: {},
  bidCells: {},
  bidSelections: {},
  linkedSubs: [],
  subKeyLabels: {},
  cellMenu: null,
  carryModal: null,
  showBidPanel: false,
  dragItemId: null,
  dragOverSk: null,

  // Editable leveling — GC overrides & cherry-pick selections
  overrides: {}, // { "divKey-subIdx": number }
  selections: {}, // { divKey: subIdx | null } — which sub is selected per division
  editingCell: null, // { divKey, subIdx } — currently editing cell

  setSubBidSubs: v => set({ subBidSubs: v }),
  setBidTotals: v => set({ bidTotals: v }),
  setBidCells: v => set({ bidCells: v }),
  setBidSelections: v => set({ bidSelections: v }),
  setLinkedSubs: v => set({ linkedSubs: v }),
  setSubKeyLabels: v => set({ subKeyLabels: v }),
  setCellMenu: v => set({ cellMenu: v }),
  setCarryModal: v => set({ carryModal: v }),
  setShowBidPanel: v => set({ showBidPanel: v }),
  setDragItemId: v => set({ dragItemId: v }),
  setDragOverSk: v => set({ dragOverSk: v }),

  // Override actions
  setOverride: (divKey, subIdx, amount) =>
    set(s => ({ overrides: { ...s.overrides, [`${divKey}-${subIdx}`]: amount } })),
  clearOverride: (divKey, subIdx) =>
    set(s => {
      const next = { ...s.overrides };
      delete next[`${divKey}-${subIdx}`];
      return { overrides: next };
    }),

  // Selection actions (cherry-pick per division)
  setDivisionSelection: (divKey, subIdx) => set(s => ({ selections: { ...s.selections, [divKey]: subIdx } })),
  clearDivisionSelection: divKey =>
    set(s => {
      const next = { ...s.selections };
      delete next[divKey];
      return { selections: next };
    }),
  toggleDivisionSelection: (divKey, subIdx) =>
    set(s => {
      const current = s.selections[divKey];
      return { selections: { ...s.selections, [divKey]: current === subIdx ? null : subIdx } };
    }),
  initSelectionsFromBest: divBest => set({ selections: { ...divBest } }),

  // Editing cell
  setEditingCell: cell => set({ editingCell: cell }),
  clearEditingCell: () => set({ editingCell: null }),

  addLinkedSub: () =>
    set(s => ({
      linkedSubs: [...s.linkedSubs, { id: uid(), name: "", subKeys: [], totalBid: 0, source: "" }],
    })),

  updateLinkedSub: (id, field, value) =>
    set(s => ({
      linkedSubs: s.linkedSubs.map(ls => (ls.id === id ? { ...ls, [field]: value } : ls)),
    })),

  removeLinkedSub: id =>
    set(s => ({
      linkedSubs: s.linkedSubs.filter(ls => ls.id !== id),
    })),

  setSkLabel: (sk, label) =>
    set(s => ({
      subKeyLabels: { ...s.subKeyLabels, [sk]: label },
    })),

  // Import parsed proposals from bid management into leveling grid
  importParsedProposals: levelingData =>
    set(s => {
      const { linkedSubs: newSubs, bidCells: newCells, bidTotals: newTotals, subBidSubs: newSubBidSubs } = levelingData;

      // Merge subBidSubs — append new subs to each subdivision
      const mergedSubBidSubs = { ...s.subBidSubs };
      if (newSubBidSubs) {
        for (const [sk, subs] of Object.entries(newSubBidSubs)) {
          mergedSubBidSubs[sk] = [...(mergedSubBidSubs[sk] || []), ...subs];
        }
      }

      return {
        linkedSubs: [...s.linkedSubs, ...newSubs],
        bidCells: { ...s.bidCells, ...newCells },
        bidTotals: { ...s.bidTotals, ...newTotals },
        subBidSubs: mergedSubBidSubs,
      };
    }),
}));
