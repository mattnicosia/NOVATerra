import { create } from "zustand";
import { uid } from "@/utils/format";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useCalendarStore } from "@/stores/calendarStore";

/* ────────────────────────────────────────────────────────
   correspondenceStore — Post-submission Q&A tracking

   Correspondences are client questions/clarifications that
   arrive after a bid is submitted. They occur ~10-20% of
   the time but are critical for contract creation.

   Data lives in the estimate's IndexedDB blob (like specs/
   exclusions). Summary fields are mirrored to the index
   for dashboard/Resources display.
   ──────────────────────────────────────────────────────── */

function syncToIndex() {
  const { correspondences } = useCorrespondenceStore.getState();
  const id = useEstimatesStore.getState().activeEstimateId;
  if (!id) return;
  const pending = correspondences.filter(c => c.status === "pending" || c.status === "in_progress");
  const nextDue = pending
    .filter(c => c.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate || "";
  useEstimatesStore.getState().updateIndexEntry(id, {
    correspondenceCount: correspondences.length,
    correspondencePendingCount: pending.length,
    correspondenceNextDue: nextDue,
    correspondenceTotalHours: correspondences.reduce((s, c) => s + (c.estimatedHours || 0), 0),
  });
}

export const useCorrespondenceStore = create((set, get) => ({
  correspondences: [],

  setCorrespondences: (v) => set({ correspondences: v }),

  addCorrespondence: (fields = {}) => {
    const c = {
      id: uid(),
      title: "",
      question: "",
      response: "",
      respondent: "",
      category: "clarification",
      status: "pending",
      dueDate: "",
      estimatedHours: 0,
      hoursLogged: 0,
      createdAt: new Date().toISOString(),
      answeredAt: "",
      ...fields,
    };
    set(s => ({ correspondences: [...s.correspondences, c] }));
    syncToIndex();
    // Create linked calendar task if due date set
    if (c.dueDate) {
      const estimateId = useEstimatesStore.getState().activeEstimateId;
      useCalendarStore.getState().addTask({
        title: `Correspondence: ${c.title || "Untitled"}`,
        date: c.dueDate,
        description: c.question || "",
        color: "#60A5FA",
        estimateId: estimateId || "",
        correspondenceId: c.id,
      });
    }
    return c;
  },

  updateCorrespondence: (id, updates) => {
    const prev = get().correspondences.find(c => c.id === id);
    set(s => ({
      correspondences: s.correspondences.map(c =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
    syncToIndex();
    // If due date changed, update calendar task
    if (updates.dueDate !== undefined && prev) {
      const tasks = useCalendarStore.getState().tasks;
      const linked = tasks.find(t => t.correspondenceId === id);
      if (linked) {
        useCalendarStore.getState().updateTask(linked.id, { date: updates.dueDate });
      } else if (updates.dueDate) {
        const estimateId = useEstimatesStore.getState().activeEstimateId;
        useCalendarStore.getState().addTask({
          title: `Correspondence: ${updates.title || prev.title || "Untitled"}`,
          date: updates.dueDate,
          description: updates.question || prev.question || "",
          color: "#60A5FA",
          estimateId: estimateId || "",
          correspondenceId: id,
        });
      }
    }
    // If answered/closed, mark calendar task complete
    if (updates.status === "answered" || updates.status === "closed") {
      const tasks = useCalendarStore.getState().tasks;
      const linked = tasks.find(t => t.correspondenceId === id);
      if (linked) {
        useCalendarStore.getState().updateTask(linked.id, { completed: true });
      }
    }
  },

  removeCorrespondence: (id) => {
    set(s => ({
      correspondences: s.correspondences.filter(c => c.id !== id),
    }));
    syncToIndex();
    // Remove linked calendar task
    const tasks = useCalendarStore.getState().tasks;
    const linked = tasks.find(t => t.correspondenceId === id);
    if (linked) {
      useCalendarStore.getState().deleteTask(linked.id);
    }
  },
}));
