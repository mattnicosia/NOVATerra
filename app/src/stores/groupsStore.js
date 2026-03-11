import { create } from "zustand";
import { uid } from "@/utils/format";
import { useUndoStore } from "@/stores/undoStore";

export const DEFAULT_GROUPS = [{ id: "base", name: "Base Bid", type: "base", accepted: true, description: "" }];

export const useGroupsStore = create((set, get) => ({
  groups: [...DEFAULT_GROUPS],

  setGroups: v => set({ groups: v }),

  addGroup: (name, type, parentId = null) => {
    const newGroup = { id: uid(), name, type: type || "add", accepted: false, description: "", parentId };
    const prev = get().groups;
    set({ groups: [...prev, newGroup] });
    useUndoStore.getState().push({
      action: `Add group "${name}"`,
      undo: () => set({ groups: prev }),
      redo: () => set({ groups: [...prev, newGroup] }),
      timestamp: Date.now(),
    });
    return newGroup.id;
  },

  updateGroup: (id, field, value) => {
    if (id === "base" && (field === "id" || field === "type")) return;
    const prev = get().groups;
    const next = prev.map(g => (g.id === id ? { ...g, [field]: value } : g));
    set({ groups: next });
    useUndoStore.getState().push({
      action: `Update group`,
      undo: () => set({ groups: prev }),
      redo: () => set({ groups: next }),
      timestamp: Date.now(),
    });
  },

  removeGroup: id => {
    if (id === "base") return;
    const prev = get().groups;
    const next = prev.filter(g => g.id !== id);
    set({ groups: next });
    useUndoStore.getState().push({
      action: `Delete group`,
      undo: () => set({ groups: prev }),
      redo: () => set({ groups: next }),
      timestamp: Date.now(),
    });
  },

  reorderGroups: newGroups => {
    // Ensure Base Bid stays at index 0
    const base = newGroups.find(g => g.id === "base");
    const rest = newGroups.filter(g => g.id !== "base");
    const ordered = base ? [base, ...rest] : newGroups;
    const prev = get().groups;
    set({ groups: ordered });
    useUndoStore.getState().push({
      action: `Reorder groups`,
      undo: () => set({ groups: prev }),
      redo: () => set({ groups: ordered }),
      timestamp: Date.now(),
    });
  },
}));
