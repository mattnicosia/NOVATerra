/**
 * useSpotlightTour — Hook for managing guided spotlight tours.
 * Tracks active tour, step index, and completion state in localStorage.
 */
import { create } from "zustand";
import { TOURS } from "@/constants/tourDefinitions";

const STORAGE_KEY = "nova_tours_completed";

function getCompletedTours() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function markCompleted(tourId) {
  const completed = getCompletedTours();
  if (!completed.includes(tourId)) {
    completed.push(tourId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  }
}

export const useSpotlightTour = create((set, get) => ({
  tourId: null,
  currentStep: 0,
  isActive: false,

  startTour: (tourId) => {
    const tour = TOURS[tourId];
    if (!tour || getCompletedTours().includes(tourId)) return;
    set({ tourId, currentStep: 0, isActive: true });
  },

  nextStep: () => {
    const { tourId, currentStep } = get();
    const tour = TOURS[tourId];
    if (!tour) return;
    if (currentStep + 1 >= tour.steps.length) {
      get().completeTour();
    } else {
      set({ currentStep: currentStep + 1 });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  skipTour: () => {
    const { tourId } = get();
    if (tourId) markCompleted(tourId);
    set({ tourId: null, currentStep: 0, isActive: false });
  },

  completeTour: () => {
    const { tourId } = get();
    if (tourId) markCompleted(tourId);
    set({ tourId: null, currentStep: 0, isActive: false });
  },

  isCompleted: (tourId) => getCompletedTours().includes(tourId),

  resetTour: (tourId) => {
    const completed = getCompletedTours().filter(id => id !== tourId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  },

  // Computed getters
  getStep: () => {
    const { tourId, currentStep } = get();
    const tour = TOURS[tourId];
    return tour?.steps?.[currentStep] || null;
  },

  getTotalSteps: () => {
    const { tourId } = get();
    return TOURS[tourId]?.steps?.length || 0;
  },
}));
