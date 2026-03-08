import { create } from "zustand";

/**
 * Review Store — Manages estimate review requests and NOVA briefings.
 *
 * Phase 1: In-memory state (not persisted — reviews are ephemeral).
 * Phase 2: Persist to Supabase + IndexedDB.
 *
 * Review flow:
 *   1. Estimator requests review → selects manager
 *   2. Manager sets up review → selects estimator + estimates
 *   3. NOVA generates briefing for reviewer
 *   4. Reviewer approves / requests changes / provides feedback
 */
export const useReviewStore = create((set, get) => ({
  reviews: [],
  // Shape: { id, type: "request"|"setup", estimatorName, managerName,
  //          estimateIds, status: "pending"|"in_progress"|"completed",
  //          createdAt, briefing: null|string, notes: "" }

  createReview: review => {
    const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      type: review.type || "request",
      estimatorName: review.estimatorName || "",
      managerName: review.managerName || "",
      estimateIds: review.estimateIds || [],
      estimateNames: review.estimateNames || [],
      status: "pending",
      createdAt: new Date().toISOString(),
      briefing: null,
      notes: "",
      feedback: "",
    };
    set(s => ({ reviews: [entry, ...s.reviews] }));
    return id;
  },

  setBriefing: (reviewId, briefing) => {
    set(s => ({
      reviews: s.reviews.map(r => (r.id === reviewId ? { ...r, briefing } : r)),
    }));
  },

  updateStatus: (reviewId, status, feedback) => {
    set(s => ({
      reviews: s.reviews.map(r =>
        r.id === reviewId ? { ...r, status, ...(feedback !== undefined ? { feedback } : {}) } : r,
      ),
    }));
  },

  setNotes: (reviewId, notes) => {
    set(s => ({
      reviews: s.reviews.map(r => (r.id === reviewId ? { ...r, notes } : r)),
    }));
  },

  deleteReview: reviewId => {
    set(s => ({ reviews: s.reviews.filter(r => r.id !== reviewId) }));
  },

  getReviewsForEstimator: name => get().reviews.filter(r => r.estimatorName === name),
  getReviewsForManager: name => get().reviews.filter(r => r.managerName === name),
  getPendingReviews: () => get().reviews.filter(r => r.status === "pending" || r.status === "in_progress"),
}));
