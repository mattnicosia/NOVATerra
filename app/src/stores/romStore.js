// ─── ROM Funnel Store ────────────────────────────────────────────────────
// State for the public /rom page — email capture, project input, ROM result

import { create } from "zustand";

export const useRomStore = create(set => ({
  // ── Input state ──
  email: "",
  buildingType: "commercial-office",
  projectSF: "",
  location: "",

  // ── Processing state ──
  processing: false,
  error: null,

  // ── Result ──
  romResult: null, // Output from generateBaselineROM()

  // ── Lead captured ──
  leadCaptured: false,

  // ── Branding / cover page ──
  companyName: "",
  clientName: "",
  projectName: "",
  logoDataUrl: null, // base64 data URL from file upload

  // ── Actions ──
  setEmail: email => set({ email }),
  setBuildingType: buildingType => set({ buildingType }),
  setProjectSF: projectSF => set({ projectSF }),
  setLocation: location => set({ location }),
  setProcessing: processing => set({ processing }),
  setError: error => set({ error }),
  setRomResult: romResult => set({ romResult }),
  setLeadCaptured: leadCaptured => set({ leadCaptured }),
  setCompanyName: companyName => set({ companyName }),
  setClientName: clientName => set({ clientName }),
  setProjectName: projectName => set({ projectName }),
  setLogoDataUrl: logoDataUrl => set({ logoDataUrl }),

  reset: () =>
    set({
      email: "",
      buildingType: "commercial-office",
      projectSF: "",
      location: "",
      processing: false,
      error: null,
      romResult: null,
      leadCaptured: false,
    }),
}));
