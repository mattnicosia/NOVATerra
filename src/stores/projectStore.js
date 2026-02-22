import { create } from 'zustand';
import { CODE_SYSTEMS } from '@/constants/codeSystems';
import { today } from '@/utils/format';

const blankProject = () => ({
  name: "New Estimate", client: "", architect: "", engineer: "", estimator: "",
  address: "", date: today(), bidDue: "", bidDueTime: "", walkthroughDate: "",
  rfiDueDate: "", otherDueDate: "", otherDueLabel: "", description: "",
  projectSF: "", jobType: "", bidType: "", bidDelivery: "", bidRequirements: {},
  status: "Bidding", referredByType: "", referredByName: "",
  laborType: "open_shop",
  zipCode: "", locationMetroId: "",
  companyProfileId: "",
});

export const useProjectStore = create((set, get) => ({
  project: blankProject(),
  codeSystem: "csi-commercial",

  // Custom codes per system: { "csi-commercial": { "99": { name: "Custom Div", subs: { "99.100": "Custom Sub" } } }, ... }
  customCodes: {},

  // Hidden standard codes per system: { "csi-commercial": { divisions: ["05", "14"], subdivisions: ["03.200", "09.300"] } }
  hiddenCodes: {},

  setProject: (v) => set({ project: v }),
  setCodeSystem: (v) => set({ codeSystem: v }),
  setCustomCodes: (v) => set({ customCodes: v }),
  setHiddenCodes: (v) => set({ hiddenCodes: v }),

  updateProject: (field, value) => set(s => ({
    project: { ...s.project, [field]: value },
  })),

  resetProject: () => set({ project: blankProject(), codeSystem: "csi-commercial", customCodes: {}, hiddenCodes: {} }),

  // ── Custom code CRUD ──────────────────────────────────────────
  addDivision: (divCode, divName) => set(s => {
    const sys = s.codeSystem;
    const prev = s.customCodes[sys] || {};
    if (prev[divCode]) return s; // already exists
    return { customCodes: { ...s.customCodes, [sys]: { ...prev, [divCode]: { name: divName, subs: {} } } } };
  }),

  renameDivision: (divCode, newName) => set(s => {
    const sys = s.codeSystem;
    const prev = s.customCodes[sys] || {};
    if (!prev[divCode]) return s;
    return { customCodes: { ...s.customCodes, [sys]: { ...prev, [divCode]: { ...prev[divCode], name: newName } } } };
  }),

  removeDivision: (divCode) => set(s => {
    const sys = s.codeSystem;
    const prev = { ...(s.customCodes[sys] || {}) };
    delete prev[divCode];
    return { customCodes: { ...s.customCodes, [sys]: prev } };
  }),

  addSubdivision: (divCode, subCode, subName) => set(s => {
    const sys = s.codeSystem;
    const prev = s.customCodes[sys] || {};
    // Allow adding subs to standard divisions by creating a custom overlay
    const baseSys = CODE_SYSTEMS[sys];
    const baseCodes = baseSys ? baseSys.codes : {};
    const merged = get().getActiveCodes();
    if (!merged[divCode]) return s; // division doesn't exist at all
    if (merged[divCode]?.subs?.[subCode]) return s; // sub already exists in merged
    const existing = prev[divCode] || { name: baseCodes[divCode]?.name || merged[divCode].name, subs: {} };
    return {
      customCodes: { ...s.customCodes, [sys]: {
        ...prev, [divCode]: { ...existing, subs: { ...existing.subs, [subCode]: subName } },
      }},
    };
  }),

  renameSubdivision: (divCode, subCode, newName) => set(s => {
    const sys = s.codeSystem;
    const prev = s.customCodes[sys] || {};
    const div = prev[divCode];
    if (!div || !div.subs[subCode]) return s;
    return {
      customCodes: { ...s.customCodes, [sys]: {
        ...prev, [divCode]: { ...div, subs: { ...div.subs, [subCode]: newName } },
      }},
    };
  }),

  removeSubdivision: (divCode, subCode) => set(s => {
    const sys = s.codeSystem;
    const prev = s.customCodes[sys] || {};
    const div = prev[divCode];
    if (!div) return s;
    const nextSubs = { ...div.subs };
    delete nextSubs[subCode];
    return {
      customCodes: { ...s.customCodes, [sys]: {
        ...prev, [divCode]: { ...div, subs: nextSubs },
      }},
    };
  }),

  // ── Hide/show standard codes ─────────────────────────────────
  toggleHideDivision: (divCode) => set(s => {
    const sys = s.codeSystem;
    const prev = s.hiddenCodes[sys] || { divisions: [], subdivisions: [] };
    const divs = prev.divisions.includes(divCode)
      ? prev.divisions.filter(d => d !== divCode)
      : [...prev.divisions, divCode];
    return { hiddenCodes: { ...s.hiddenCodes, [sys]: { ...prev, divisions: divs } } };
  }),

  toggleHideSubdivision: (subCode) => set(s => {
    const sys = s.codeSystem;
    const prev = s.hiddenCodes[sys] || { divisions: [], subdivisions: [] };
    const subs = prev.subdivisions.includes(subCode)
      ? prev.subdivisions.filter(sc => sc !== subCode)
      : [...prev.subdivisions, subCode];
    return { hiddenCodes: { ...s.hiddenCodes, [sys]: { ...prev, subdivisions: subs } } };
  }),

  isDivisionHidden: (divCode) => {
    const sys = get().codeSystem;
    const hidden = get().hiddenCodes[sys] || { divisions: [], subdivisions: [] };
    return hidden.divisions.includes(divCode);
  },

  isSubdivisionHidden: (subCode) => {
    const sys = get().codeSystem;
    const hidden = get().hiddenCodes[sys] || { divisions: [], subdivisions: [] };
    return hidden.subdivisions.includes(subCode);
  },

  // ── Merged code accessors ─────────────────────────────────────
  getActiveCodes: () => {
    const sysKey = get().codeSystem;
    const sys = CODE_SYSTEMS[sysKey];
    const base = sys ? sys.codes : CODE_SYSTEMS["csi-commercial"].codes;
    const custom = get().customCodes[sysKey] || {};
    const hidden = get().hiddenCodes[sysKey] || { divisions: [], subdivisions: [] };
    // Deep merge: custom divisions overlay base, custom subs append to base subs
    const merged = {};
    const allKeys = new Set([...Object.keys(base), ...Object.keys(custom)]);
    allKeys.forEach(dc => {
      // Skip hidden divisions
      if (hidden.divisions.includes(dc)) return;
      const b = base[dc];
      const c = custom[dc];
      let entry;
      if (b && c) {
        entry = { name: b.name, subs: { ...(b.subs || {}), ...(c.subs || {}) } };
      } else if (b) {
        entry = { ...b, subs: { ...(b.subs || {}) } };
      } else {
        entry = { ...c, subs: { ...(c.subs || {}) } };
      }
      // Filter out hidden subdivisions
      if (hidden.subdivisions.length > 0) {
        const filteredSubs = {};
        Object.entries(entry.subs).forEach(([sk, sn]) => {
          if (!hidden.subdivisions.includes(sk)) filteredSubs[sk] = sn;
        });
        entry.subs = filteredSubs;
      }
      merged[dc] = entry;
    });
    return merged;
  },

  getDivisions: () => {
    const codes = get().getActiveCodes();
    return Object.entries(codes).map(([k, v]) => `${k} - ${v.name}`);
  },

  divFromCode: (code) => {
    if (!code) return "";
    const dc = code.split(".")[0];
    const codes = get().getActiveCodes();
    return codes[dc] ? `${dc} - ${codes[dc].name}` : dc;
  },

  subFromCode: (code) => {
    if (!code) return "";
    const parts = code.split(".");
    const dc = parts[0], sk = `${parts[0]}.${parts[1]}`;
    const codes = get().getActiveCodes();
    return codes[dc]?.subs?.[sk] || sk;
  },

  // Check if a division code belongs to custom codes (for delete/edit permissions)
  isCustomDivision: (divCode) => {
    const sys = get().codeSystem;
    return !!(get().customCodes[sys] || {})[divCode];
  },

  // Check if a subdivision code belongs to custom codes
  isCustomSubdivision: (divCode, subCode) => {
    const sys = get().codeSystem;
    const custom = get().customCodes[sys] || {};
    return !!(custom[divCode]?.subs?.[subCode]);
  },
}));
