// Rate validation — statistical bounds checking for cost database items
// Prevents bad data from degrading pricing quality.
// Applied at manual entry, sub proposal import, and send-to-db flows.
// Never auto-rejects — always warns the user and lets them decide.

/**
 * Plausible rate ranges by CSI division (national average, per-unit).
 * min/max represent the typical observed range across all unit types.
 * Rates outside these ranges trigger warnings.
 */
const RATE_BOUNDS = {
  "03": { material: { min: 0.05, max: 250 }, labor: { min: 0.10, max: 60 }, equipment: { min: 0, max: 50 }, label: "Concrete" },
  "04": { material: { min: 0.30, max: 200 }, labor: { min: 0.20, max: 25 }, equipment: { min: 0, max: 10 }, label: "Masonry" },
  "05": { material: { min: 0.15, max: 5000 }, labor: { min: 0.20, max: 3500 }, equipment: { min: 0, max: 1200 }, label: "Metals" },
  "06": { material: { min: 0.10, max: 700 }, labor: { min: 0.20, max: 130 }, equipment: { min: 0, max: 10 }, label: "Wood / Composites" },
  "07": { material: { min: 0.05, max: 150 }, labor: { min: 0.10, max: 50 }, equipment: { min: 0, max: 15 }, label: "Thermal / Moisture" },
  "08": { material: { min: 0.50, max: 2500 }, labor: { min: 0.50, max: 1500 }, equipment: { min: 0, max: 200 }, label: "Openings" },
  "09": { material: { min: 0.10, max: 100 }, labor: { min: 0.10, max: 50 }, equipment: { min: 0, max: 5 }, label: "Finishes" },
  "22": { material: { min: 0.40, max: 2500 }, labor: { min: 0.50, max: 1500 }, equipment: { min: 0, max: 200 }, label: "Plumbing" },
  "23": { material: { min: 0.50, max: 15000 }, labor: { min: 0.50, max: 5000 }, equipment: { min: 0, max: 1500 }, label: "HVAC" },
  "26": { material: { min: 0.10, max: 2000 }, labor: { min: 0.50, max: 1000 }, equipment: { min: 0, max: 100 }, label: "Electrical" },
  "31": { material: { min: 0, max: 200 }, labor: { min: 0.20, max: 1500 }, equipment: { min: 0, max: 3000 }, label: "Earthwork" },
  "32": { material: { min: 0.10, max: 300 }, labor: { min: 0.20, max: 200 }, equipment: { min: 0, max: 50 }, label: "Exterior Improvements" },
};

/** Fallback bounds when division is not in RATE_BOUNDS */
const DEFAULT_BOUNDS = {
  material: { min: 0, max: 50000 },
  labor: { min: 0, max: 25000 },
  equipment: { min: 0, max: 15000 },
  label: "General",
};

/**
 * Validate a rate element against statistical bounds.
 * @param {Object} element - { code, name, material, labor, equipment, unit, ... }
 * @returns {{ valid: boolean, warnings: string[], severity: "ok"|"warning"|"reject" }}
 */
export function validateRate(element) {
  const warnings = [];
  const div = (element.code || "").split(".")[0];
  const bounds = RATE_BOUNDS[div] || DEFAULT_BOUNDS;

  const mat = Number(element.material) || 0;
  const lab = Number(element.labor) || 0;
  const equip = Number(element.equipment) || 0;
  const total = mat + lab + equip;

  // Check each cost component against bounds
  if (mat > 0 && mat > bounds.material.max * 2) {
    warnings.push(`Material rate $${mat.toFixed(2)}/${element.unit || "EA"} is very high for ${bounds.label} (typical max ~$${bounds.material.max})`);
  } else if (mat > 0 && mat > bounds.material.max) {
    warnings.push(`Material rate $${mat.toFixed(2)}/${element.unit || "EA"} exceeds typical range for ${bounds.label}`);
  }

  if (lab > 0 && lab > bounds.labor.max * 2) {
    warnings.push(`Labor rate $${lab.toFixed(2)}/${element.unit || "EA"} is very high for ${bounds.label} (typical max ~$${bounds.labor.max})`);
  } else if (lab > 0 && lab > bounds.labor.max) {
    warnings.push(`Labor rate $${lab.toFixed(2)}/${element.unit || "EA"} exceeds typical range for ${bounds.label}`);
  }

  if (equip > 0 && equip > bounds.equipment.max * 2) {
    warnings.push(`Equipment rate $${equip.toFixed(2)}/${element.unit || "EA"} is very high for ${bounds.label} (typical max ~$${bounds.equipment.max})`);
  } else if (equip > 0 && equip > bounds.equipment.max) {
    warnings.push(`Equipment rate $${equip.toFixed(2)}/${element.unit || "EA"} exceeds typical range for ${bounds.label}`);
  }

  // Zero-rate check (user probably forgot to enter data)
  if (total === 0 && !element.subcontractor) {
    warnings.push("All rates are $0 — is this intentional?");
  }

  // Severity classification
  const highCount = warnings.filter(w => w.includes("very high")).length;
  let severity = "ok";
  if (highCount > 0) severity = "reject";
  else if (warnings.length > 0) severity = "warning";

  return {
    valid: warnings.length === 0,
    warnings,
    severity,
  };
}

/**
 * Check if a rate element is stale (not updated in > 18 months).
 * @param {Object} element - { updatedAt, createdAt, ... }
 * @returns {boolean}
 */
export function isStale(element) {
  const dateStr = element.updatedAt || element.createdAt;
  if (!dateStr) return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const eighteenMonthsAgo = new Date();
  eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
  return date < eighteenMonthsAgo;
}

/**
 * Compare a user rate to the master rate and return variance info.
 * @param {Object} userEl - user override element
 * @param {Object} masterEl - master element
 * @returns {{ materialDelta, laborDelta, equipDelta, totalDelta, pctChange }}
 */
export function rateVariance(userEl, masterEl) {
  if (!userEl || !masterEl) return null;
  const uMat = Number(userEl.material) || 0;
  const uLab = Number(userEl.labor) || 0;
  const uEquip = Number(userEl.equipment) || 0;
  const mMat = Number(masterEl.material) || 0;
  const mLab = Number(masterEl.labor) || 0;
  const mEquip = Number(masterEl.equipment) || 0;

  const uTotal = uMat + uLab + uEquip;
  const mTotal = mMat + mLab + mEquip;

  return {
    materialDelta: uMat - mMat,
    laborDelta: uLab - mLab,
    equipDelta: uEquip - mEquip,
    totalDelta: uTotal - mTotal,
    pctChange: mTotal > 0 ? ((uTotal - mTotal) / mTotal * 100) : 0,
  };
}
