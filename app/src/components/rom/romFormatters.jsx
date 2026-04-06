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

import { useState } from "react";

export function ConfidenceBadge({ sampleCount, confidence, sources, C }) {
  const [hover, setHover] = useState(false);
  const colors = {
    strong:   { bg: `${C.green}15`, text: C.green },
    moderate: { bg: `${C.accent}12`, text: C.accent },
    baseline: { bg: `${C.textDim}10`, text: C.textDim },
  };
  const c = colors[confidence] || colors.baseline;
  const label = sampleCount > 0 ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}` : "baseline";

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{
        fontSize: 7, fontWeight: 600, padding: "1px 4px", borderRadius: 3,
        marginLeft: 6, background: c.bg, color: c.text, cursor: "default",
      }}>
        {label}
      </span>
      {hover && sources && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
          padding: "8px 12px", borderRadius: 6,
          background: C.bg2 || C.bg1, border: `1px solid ${C.border}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          whiteSpace: "nowrap", fontSize: 10, color: C.text,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: c.text }}>{confidence}</div>
          {(sources.benchmark || 0) > 0 && <div>Benchmark: {sources.benchmark} proposals</div>}
          {(sources.tpi || 0) > 0 && <div>Trade Pricing Index: {sources.tpi} data points</div>}
          {(sources.calibration || 0) > 0 && <div>Calibration: {sources.calibration} projects</div>}
          {sampleCount === 0 && <div style={{ color: C.textDim }}>No project-specific data</div>}
        </div>
      )}
    </span>
  );
}
