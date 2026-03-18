// ─── BLDG Talent — Brand Constants ──────────────────────────────────────
// Certification levels, module definitions, teasers, grading scale

export const BT_BRAND = {
  name: "BLDG Talent",
  tagline: "Verified Estimator Intelligence",
  poweredBy: "Powered by NOVA",
  parent: "NOVA",
  novaTerraName: "NOVA",
  novaTerraUrl: "https://app-nova-42373ca7.vercel.app",
  novaTerraTagline: "Construction Intelligence",
};

export const BT_CERT_LEVELS = {
  certified: { label: "Certified Estimator", min: 70, max: 79, color: "#CD7F32", badge: "Bronze" },
  advanced: { label: "Advanced Estimator", min: 80, max: 89, color: "#C0C0C0", badge: "Silver" },
  expert: { label: "Expert Estimator", min: 90, max: 95, color: "#FFD700", badge: "Gold" },
  master: { label: "Master Estimator", min: 96, max: 100, color: "#E5E4E2", badge: "Platinum" },
};

// Module definitions — weights must sum to 1.0
// P0: cognitive + behavioral are fully built
// P1: bid_leveling, communication, plan_reading, software
export const BT_MODULES = {
  bid_leveling: {
    key: "bid_leveling",
    label: "Bid Leveling",
    weight: 0.3,
    timeLimit: 1500,
    icon: "scale",
    maxPoints: 300,
    order: 1,
    p0: false,
  },
  communication: {
    key: "communication",
    label: "Communication & Judgment",
    weight: 0.2,
    timeLimit: 900,
    icon: "message",
    maxPoints: 200,
    order: 2,
    p0: false,
  },
  plan_reading: {
    key: "plan_reading",
    label: "Plan Reading & Takeoff",
    weight: 0.15,
    timeLimit: 900,
    icon: "ruler",
    maxPoints: 150,
    order: 3,
    p0: false,
  },
  cognitive: {
    key: "cognitive",
    label: "Cognitive Reasoning",
    weight: 0.2,
    timeLimit: 900,
    icon: "brain",
    maxPoints: 200,
    order: 4,
    p0: true,
  },
  software: {
    key: "software",
    label: "Software Proficiency",
    weight: 0.05,
    timeLimit: 300,
    icon: "monitor",
    maxPoints: 50,
    order: 5,
    p0: false,
  },
  behavioral: {
    key: "behavioral",
    label: "Behavioral & Work Style",
    weight: 0.1,
    timeLimit: 600,
    icon: "user",
    maxPoints: 100,
    order: 6,
    p0: true,
  },
};

// P0 modules only (for assessment shell)
export const BT_P0_MODULE_KEYS = ["cognitive", "behavioral"];

// Total assessment time (P0 only: 15 + 10 = 25 min)
export const BT_TOTAL_TIME_P0 = 25 * 60; // seconds

// Teaser descriptions for locked NOVATerra sections (shown in CandidateSidebar)
export const BT_TEASERS = {
  dashboard: {
    title: "Project Dashboard",
    desc: "AI-powered project overview with real-time cost tracking",
    icon: "dashboard",
  },
  inbox: { title: "Inbox & RFP Management", desc: "Automated RFP processing and bid communication", icon: "inbox" },
  core: { title: "NOVA Core", desc: "Cost database, assemblies, and historical intelligence", icon: "database" },
  intelligence: {
    title: "Intelligence",
    desc: "AI-driven project insights and predictive analytics",
    icon: "insights",
  },
  contacts: { title: "People", desc: "Subcontractor network with trade tracking and ratings", icon: "people" },
  settings: { title: "Settings", desc: "Customizable themes, palettes, and preferences", icon: "settings" },
};

// Grade scale (percentage → letter grade)
export const BT_GRADE_SCALE = [
  { min: 97, grade: "A+" },
  { min: 93, grade: "A" },
  { min: 90, grade: "A-" },
  { min: 87, grade: "B+" },
  { min: 83, grade: "B" },
  { min: 80, grade: "B-" },
  { min: 77, grade: "C+" },
  { min: 73, grade: "C" },
  { min: 70, grade: "C-" },
  { min: 67, grade: "D+" },
  { min: 60, grade: "D" },
  { min: 0, grade: "F" },
];

// Accent colors for BLDG Talent UI
export const BT_COLORS = {
  primary: "#7C5CFC", // Purple (matches NOVATerra accent)
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  success: "#38A169",
  warning: "#DD6B20",
  danger: "#E53E3E",
};
