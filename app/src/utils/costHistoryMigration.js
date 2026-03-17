// Cost History Migration — converts old flat jobType to two-axis taxonomy
// Run once on load for estimatesIndex and historicalProposals

/**
 * Map an old flat jobType string to the two-axis { buildingType, workType } pair.
 * Handles both the display labels (e.g., "Commercial") and the
 * old romEngine keys (e.g., "commercial-office").
 * Returns empty strings for unrecognized values — user can set them manually.
 */
export function migrateJobType(oldJobType) {
  if (!oldJobType) return { buildingType: "", workType: "" };

  // Display-label → buildingType key
  const buildingMap = {
    "Commercial":                "commercial-office",
    "Retail":                    "retail",
    "Industrial / Warehouse":    "industrial",
    "Healthcare / Medical":      "healthcare",
    "Education":                 "education",
    "Hospitality":               "hospitality",
    "Multi-Family Residential":  "residential-multi",
    "Residential":               "residential-single",
    "Mixed-Use":                 "mixed-use",
    "Government / Municipal":    "government",
    "Religious / House of Worship": "religious",
    "Restaurant / Food Service": "restaurant",
    "Parking Structure":         "parking",
    // Old romEngine 6-key format
    "commercial-office":  "commercial-office",
    "retail":             "retail",
    "healthcare":         "healthcare",
    "education":          "education",
    "industrial":         "industrial",
    "residential-multi":  "residential-multi",
  };

  // Display-label → workType key
  const workMap = {
    "New Construction":     "new-construction",
    "Renovation":           "renovation",
    "Gut Renovation":       "gut-renovation",
    "Tenant Fit-Out":       "tenant-fit-out",
    "Interior Fit-Out":     "interior-fit-out",
    "Addition":             "addition",
    "Adaptive Reuse":       "adaptive-reuse",
    "Historic Restoration": "historic-restoration",
    "Shell & Core":         "shell-core",
    "Capital Improvement":  "capital-improvement",
    "Demolition":           "capital-improvement",
  };

  return {
    buildingType: buildingMap[oldJobType] || "",
    workType: workMap[oldJobType] || "",
  };
}

/**
 * Map a project.status value to an outcome key for Cost History.
 * The project status tracks workflow (Active → Bidding → Pending → Won/Lost).
 * The outcome tracks the bid result for analytics.
 */
export function mapStatusToOutcome(status) {
  const map = {
    "Active":    "pending",
    "Bidding":   "pending",
    "Pending":   "pending",
    "Won":       "won",
    "Lost":      "lost",
    "On Hold":   "pending",
    "Cancelled": "withdrawn",
  };
  return map[status] || "pending";
}

/**
 * Migrate an estimates index entry from old format (flat jobType) to new format (two-axis).
 * Idempotent — already-migrated entries pass through unchanged.
 */
export function migrateIndexEntry(entry) {
  if (entry.buildingType !== undefined) return entry;
  const { buildingType, workType } = migrateJobType(entry.jobType);
  return {
    ...entry,
    buildingType,
    workType,
    architect: entry.architect || "",
    projectSF: entry.projectSF || 0,
    zipCode: entry.zipCode || "",
    laborType: entry.laborType || "",
    stories: entry.stories || 0,
    structuralSystem: entry.structuralSystem || "",
    deliveryMethod: entry.deliveryMethod || "",
    divisionTotals: entry.divisionTotals || {},
    outcomeMetadata: entry.outcomeMetadata || {},
  };
}

/**
 * Migrate a historical proposal from old format (flat jobType) to new format (two-axis).
 * Idempotent — already-migrated entries pass through unchanged.
 */
export function migrateProposal(proposal) {
  if (proposal.buildingType !== undefined) return proposal;
  const { buildingType, workType } = migrateJobType(proposal.jobType);
  return {
    ...proposal,
    buildingType,
    workType,
    architect: proposal.architect || "",
    laborType: proposal.laborType || "",
    zipCode: proposal.zipCode || "",
    stories: proposal.stories || 0,
    structuralSystem: proposal.structuralSystem || "",
    deliveryMethod: proposal.deliveryMethod || "",
    outcome: proposal.outcome || "pending",
    outcomeMetadata: proposal.outcomeMetadata || {},
  };
}
