// romFormatters.js — Shared constants and formatting functions for ROM result display

import { getConfidenceTier } from "@/utils/confidenceEngine";

export const BUILDING_TYPE_LABELS = {
  "commercial-office": "Commercial Office",
  retail: "Retail",
  healthcare: "Healthcare",
  education: "Education",
  industrial: "Industrial",
  "residential-multi": "Residential - Multi-Family",
  hospitality: "Hospitality",
  "residential-single": "Residential - Single Family",
  "mixed-use": "Mixed-Use",
  government: "Government",
  religious: "Religious",
  restaurant: "Restaurant",
  parking: "Parking",
};

export const GR_GC_OPTIONS = [
  { value: "requirements", label: "General Requirements", desc: "Division 01 — included in division benchmarks" },
  { value: "conditions", label: "General Conditions", desc: "Separate % markup on direct costs" },
  { value: "both", label: "Both (GR + GC)", desc: "Division 01 benchmarks + GC markup" },
];

export const DEFAULT_MARKUPS = [
  { id: 1, label: "Contingency", pct: 5, enabled: false },
  { id: 2, label: "GC Overhead & Profit", pct: 10, enabled: true },
  { id: 3, label: "General Conditions", pct: 8, enabled: false },
  { id: 4, label: "Insurance (GL/WC)", pct: 2, enabled: true },
  { id: 5, label: "Bond", pct: 3, enabled: false },
];

export const DEFAULT_SOFT_COSTS = [
  { id: 1, label: "A/E Design Fees", pct: 8, enabled: false, note: "Architectural & engineering design" },
  { id: 2, label: "Permits & Fees", pct: 2, enabled: false, note: "Building permits, plan review, impact fees" },
  {
    id: 3,
    label: "Testing & Inspections",
    pct: 1.5,
    enabled: false,
    note: "Geotech, special inspections, materials testing",
  },
  { id: 4, label: "Project Management", pct: 3, enabled: false, note: "Owner's rep, PM fees" },
  { id: 5, label: "Legal & Accounting", pct: 0.5, enabled: false, note: "Contract review, project accounting" },
  { id: 6, label: "Builder's Risk Insurance", pct: 0.75, enabled: false, note: "Construction period insurance" },
];

export function fmt(n) {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtSF(n) {
  if (n == null || isNaN(n)) return "$0.00";
  return "$" + n.toFixed(2);
}

export function fmtNum(n) {
  if (n == null || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

export function ConfidenceDot({ confidence }) {
  const tier = getConfidenceTier(confidence);
  return (
    <span
      title={tier.label}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: tier.color,
        marginRight: 6,
        verticalAlign: "middle",
      }}
    />
  );
}
