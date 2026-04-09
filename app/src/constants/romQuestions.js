// Per-building-type ROM questions — each question refines the estimate
// multipliers: { _global: X } applies to all divisions, { "09": X } applies to specific division

export const ROM_TYPE_QUESTIONS = {
  "residential-single": [
    {
      key: "qualityTier",
      label: "Quality Level",
      type: "select",
      options: [
        { value: "spec", label: "Spec / Production", multipliers: { _global: 0.65 } },
        { value: "semi-custom", label: "Semi-Custom", multipliers: { _global: 0.85 } },
        { value: "custom", label: "Full Custom", multipliers: { _global: 1.15 } },
        { value: "modern", label: "Modern / Architectural", multipliers: { _global: 1.25 } },
        { value: "estate", label: "Estate / Luxury", multipliers: { _global: 1.60 } },
      ],
      default: "semi-custom",
    },
    {
      key: "site",
      label: "Site Conditions",
      type: "select",
      options: [
        { value: "flat", label: "Flat", multipliers: {} },
        { value: "moderate", label: "Moderate Slope", multipliers: { "02": 1.08, "03": 1.06, "31": 1.10 } },
        { value: "steep", label: "Steep / Complex", multipliers: { "02": 1.18, "03": 1.12, "31": 1.25 } },
      ],
      default: "flat",
    },
    {
      key: "garage",
      label: "Garage",
      type: "select",
      options: [
        { value: "none", label: "None", multipliers: {} },
        { value: "attached-2", label: "Attached 2-Car", multipliers: { "03": 1.04, "06": 1.06 } },
        { value: "attached-3", label: "Attached 3-Car", multipliers: { "03": 1.06, "06": 1.08 } },
        { value: "detached", label: "Detached", multipliers: { "03": 1.08, "06": 1.10, "26": 1.03 } },
      ],
      default: "attached-2",
    },
    {
      key: "basement",
      label: "Basement",
      type: "select",
      options: [
        { value: "none", label: "None (Slab)", multipliers: {} },
        { value: "crawl", label: "Crawl Space", multipliers: { "03": 1.04, "07": 1.03 } },
        { value: "partial", label: "Partial Basement", multipliers: { "03": 1.08, "07": 1.05, "31": 1.10 } },
        { value: "full", label: "Full Basement", multipliers: { "03": 1.12, "07": 1.08, "31": 1.15, "22": 1.04 } },
        { value: "walkout", label: "Walkout Basement", multipliers: { "03": 1.15, "07": 1.10, "31": 1.20, "08": 1.06, "22": 1.04 } },
      ],
      default: "none",
    },
  ],

  "residential-multi": [
    {
      key: "productType",
      label: "Product Type",
      type: "select",
      options: [
        { value: "garden", label: "Garden-Style (1-3 stories)", multipliers: { _global: 0.85 } },
        { value: "midrise", label: "Mid-Rise (4-6 stories)", multipliers: { _global: 1.0, "03": 1.08, "05": 1.06, "14": 1.15 } },
        { value: "highrise", label: "High-Rise (7+ stories)", multipliers: { _global: 1.30, "03": 1.20, "05": 1.15, "14": 1.35, "21": 1.12 } },
      ],
      default: "midrise",
    },
    {
      key: "finishLevel",
      label: "Finish Level",
      type: "select",
      options: [
        { value: "builder", label: "Builder-Grade", multipliers: { "06": 0.80, "08": 0.80, "09": 0.75, "15": 0.70 } },
        { value: "market", label: "Market-Rate", multipliers: {} },
        { value: "luxury", label: "Luxury", multipliers: { "06": 1.15, "08": 1.25, "09": 1.35, "15": 1.40 } },
      ],
      default: "market",
    },
    {
      key: "unitCount",
      label: "Unit Count",
      type: "number",
      placeholder: "e.g. 24",
      paramKey: "roomCounts.residentialUnits",
    },
    {
      key: "parking",
      label: "Parking Type",
      type: "select",
      options: [
        { value: "surface", label: "Surface Lot", multipliers: {} },
        { value: "structured", label: "Structured / Podium", multipliers: { "03": 1.12, "05": 1.08 } },
        { value: "underground", label: "Underground", multipliers: { "03": 1.25, "05": 1.12, "31": 1.20, "07": 1.10 } },
      ],
      default: "surface",
    },
  ],

  "commercial-office": [
    {
      key: "officeClass",
      label: "Office Class",
      type: "select",
      options: [
        { value: "A", label: "Class A (High-End / Institutional)", multipliers: { _global: 1.15 } },
        { value: "B", label: "Class B (Mid-Tier / Professional)", multipliers: {} },
        { value: "C", label: "Class C (Basic / Value / Turnover)", multipliers: { _global: 0.85 } },
      ],
      default: "B",
    },
    {
      key: "mepIntensity",
      label: "MEP Intensity",
      type: "select",
      options: [
        { value: "standard", label: "Standard", multipliers: {} },
        { value: "high", label: "High (Data / Trading Floor)", multipliers: { "23": 1.20, "26": 1.25, "27": 1.15 } },
      ],
      default: "standard",
    },
  ],

  "healthcare": [
    {
      key: "facilityType",
      label: "Facility Type",
      type: "select",
      options: [
        { value: "clinic", label: "Clinic / Urgent Care", multipliers: { _global: 0.80 } },
        { value: "outpatient", label: "Outpatient Surgery Center", multipliers: {} },
        { value: "hospital", label: "Hospital", multipliers: { _global: 1.35, "23": 1.20, "26": 1.15, "14": 1.25 } },
        { value: "specialty", label: "Specialty (Imaging / Lab)", multipliers: { _global: 1.20, "11": 1.30, "23": 1.15 } },
      ],
      default: "outpatient",
    },
    {
      key: "bedCount",
      label: "Bed Count",
      type: "number",
      placeholder: "e.g. 50",
      paramKey: "bedCount",
    },
  ],

  "education": [
    {
      key: "eduType",
      label: "Education Type",
      type: "select",
      options: [
        { value: "k12", label: "K-12", multipliers: {} },
        { value: "higher-ed", label: "Higher Education", multipliers: { _global: 1.15 } },
      ],
      default: "k12",
    },
    {
      key: "specialSpaces",
      label: "Special Spaces",
      type: "select",
      options: [
        { value: "none", label: "Standard Classrooms Only", multipliers: {} },
        { value: "gym", label: "+ Gymnasium", multipliers: { "03": 1.06, "05": 1.08, "23": 1.05 } },
        { value: "auditorium", label: "+ Auditorium", multipliers: { "09": 1.08, "26": 1.06, "23": 1.04 } },
        { value: "lab", label: "+ Science Labs", multipliers: { "22": 1.10, "23": 1.08, "26": 1.06, "11": 1.12 } },
      ],
      default: "none",
    },
  ],

  "restaurant": [
    {
      key: "restaurantType",
      label: "Restaurant Type",
      type: "select",
      options: [
        { value: "fast-casual", label: "Fast-Casual / QSR", multipliers: { _global: 0.75 } },
        { value: "full-service", label: "Full-Service", multipliers: {} },
        { value: "fine-dining", label: "Fine Dining", multipliers: { _global: 1.30, "09": 1.20, "08": 1.15 } },
      ],
      default: "full-service",
    },
    {
      key: "kitchenPct",
      label: "Kitchen % of Space",
      type: "select",
      options: [
        { value: "30", label: "30% (Standard)", multipliers: {} },
        { value: "40", label: "40% (Heavy Kitchen)", multipliers: { "11": 1.15, "22": 1.08, "23": 1.10 } },
        { value: "50", label: "50% (Production Kitchen)", multipliers: { "11": 1.30, "22": 1.15, "23": 1.20, "26": 1.08 } },
      ],
      default: "30",
    },
  ],

  "hospitality": [
    {
      key: "hotelClass",
      label: "Hotel Class",
      type: "select",
      options: [
        { value: "select", label: "Select-Service / Economy", multipliers: { _global: 0.80 } },
        { value: "full", label: "Full-Service", multipliers: {} },
        { value: "luxury", label: "Luxury / Boutique", multipliers: { _global: 1.30, "09": 1.25, "08": 1.15 } },
      ],
      default: "full",
    },
    {
      key: "roomCount",
      label: "Room Count",
      type: "number",
      placeholder: "e.g. 120",
      paramKey: "roomCounts.hotelRooms",
    },
  ],

  "industrial": [
    {
      key: "industrialType",
      label: "Industrial Type",
      type: "select",
      options: [
        { value: "warehouse", label: "Warehouse / Distribution", multipliers: { _global: 0.70 } },
        { value: "light-mfg", label: "Light Manufacturing", multipliers: {} },
        { value: "heavy-mfg", label: "Heavy Manufacturing", multipliers: { _global: 1.25, "05": 1.15, "23": 1.20, "26": 1.15 } },
        { value: "cold-storage", label: "Cold Storage", multipliers: { _global: 1.20, "07": 1.30, "23": 1.40 } },
      ],
      default: "light-mfg",
    },
  ],

  "retail": [
    {
      key: "retailType",
      label: "Retail Type",
      type: "select",
      options: [
        { value: "shell", label: "Shell / White Box", multipliers: { _global: 0.65 } },
        { value: "standard", label: "Standard Fit-Out", multipliers: {} },
        { value: "high-end", label: "High-End / Flagship", multipliers: { _global: 1.25, "09": 1.20, "08": 1.15, "26": 1.10 } },
      ],
      default: "standard",
    },
  ],
};

// Compute combined division multipliers from selected question answers
export function computeTypeMultipliers(buildingType, answers) {
  const questions = ROM_TYPE_QUESTIONS[buildingType];
  if (!questions) return { divisionMults: {}, globalMult: 1.0, labels: [] };

  let globalMult = 1.0;
  const divisionMults = {};
  const labels = [];

  questions.forEach(q => {
    if (q.type === "number") return; // number inputs don't have multipliers
    const val = answers[q.key] || q.default;
    const opt = q.options?.find(o => o.value === val);
    if (!opt?.multipliers) return;

    const m = opt.multipliers;
    if (m._global) {
      globalMult *= m._global;
      labels.push(`${q.label}: ${opt.label} (${m._global > 1 ? "+" : ""}${Math.round((m._global - 1) * 100)}%)`);
    }

    Object.entries(m).forEach(([div, factor]) => {
      if (div === "_global") return;
      divisionMults[div] = (divisionMults[div] || 1) * factor;
    });

    // Add non-global labels for significant adjustments
    const divEntries = Object.entries(m).filter(([k]) => k !== "_global");
    if (divEntries.length > 0 && !m._global) {
      labels.push(`${q.label}: ${opt.label}`);
    }
  });

  return { divisionMults, globalMult, labels };
}
