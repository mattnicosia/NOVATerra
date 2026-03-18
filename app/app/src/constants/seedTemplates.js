// ── Estimate Design Templates ─────────────────────────────────────────
// Pre-built starting points for common estimate types.
// Each template includes curated items from the seed database
// (by ID reference) plus custom fee items for non-construction templates.
//
// When a user creates an estimate from a template, the referenced seed
// items are copied into the estimate's items array at quantity = 0,
// ready for the estimator to fill in quantities during takeoff.

import { SEED_ELEMENTS } from "./seedAssemblies";

// ── Lookup helper ─────────────────────────────────────────────────────
const _seedMap = new Map(SEED_ELEMENTS.map(el => [el.id, el]));

/**
 * Convert a list of seed IDs into estimate-ready item presets.
 * Returns objects matching the shape expected by itemsStore.addElement().
 */
export function resolveTemplateItems(template) {
  const items = [];

  // Seed-referenced items
  if (template.seedIds) {
    for (const sid of template.seedIds) {
      const el = _seedMap.get(sid);
      if (!el) continue;
      items.push({
        code: el.code,
        name: el.name,
        unit: el.unit,
        material: el.material,
        labor: el.labor,
        equipment: el.equipment,
        subcontractor: el.subcontractor || 0,
        trade: el.trade,
        quantity: 0,
      });
    }
  }

  // Custom items (fee-based templates)
  if (template.customItems) {
    for (const ci of template.customItems) {
      items.push({
        code: ci.code || "",
        name: ci.name,
        unit: ci.unit || "LS",
        material: ci.material || 0,
        labor: ci.labor || 0,
        equipment: ci.equipment || 0,
        subcontractor: ci.subcontractor || 0,
        trade: ci.trade || "general",
        quantity: ci.quantity ?? 1,
      });
    }
  }

  return items;
}

// ── Template Definitions ──────────────────────────────────────────────

export const ESTIMATE_TEMPLATES = [
  // ────────────────────────────────────────────────────────────────────
  // 1. ARCHITECTURAL
  // ────────────────────────────────────────────────────────────────────
  {
    id: "architectural",
    name: "Architectural",
    description: "Finishes, openings, specialties, insulation — Divisions 06–10",
    icon: "🏛️",
    color: "#8B5CF6",
    divisions: ["06", "07", "08", "09", "10"],
    seedIds: [
      // Div 06 — Wood framing
      "s030",
      "s031",
      "s033",
      "s036",
      // Div 07 — Insulation & weather barriers
      "s083",
      "s084",
      "s088",
      "s089",
      "s090",
      "s103",
      // Div 08 — Openings
      "s235",
      "s236",
      "s237",
      "s238",
      "s239",
      "s240",
      "s241",
      "s242",
      "s243",
      "s244",
      "s245",
      "s246",
      "s247",
      "s248",
      "s249",
      "s250",
      // Div 09 — Finishes
      "s104",
      "s105",
      "s106",
      "s107",
      "s108",
      "s109",
      "s110",
      "s111",
      "s112",
      "s113",
      "s114",
      "s115",
      "s116",
      "s117",
      "s118",
      "s119",
      "s120",
      "s121",
      "s122",
      // Div 10 — Specialties
      "s205",
      "s206",
      "s207",
      "s208",
      "s209",
      "s210",
      "s212",
    ],
    markup: {
      overhead: 10,
      profit: 10,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
    },
    project: {
      workType: "New Construction",
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 2. MEP ENGINEERING
  // ────────────────────────────────────────────────────────────────────
  {
    id: "mep",
    name: "MEP Engineering",
    description: "Plumbing, HVAC, electrical, fire protection, low-voltage — Divisions 21–28",
    icon: "⚡",
    color: "#F59E0B",
    divisions: ["21", "22", "23", "26", "27", "28"],
    seedIds: [
      // Div 21 — Fire suppression
      "s253",
      "s254",
      "s255",
      "s256",
      "s257",
      // Div 22 — Plumbing
      "s123",
      "s124",
      "s125",
      "s126",
      "s128",
      "s129",
      "s130",
      "s131",
      "s132",
      "s133",
      "s134",
      "s135",
      "s136",
      "s137",
      "s138",
      "s139",
      "s140",
      // Div 23 — HVAC
      "s141",
      "s142",
      "s143",
      "s144",
      "s145",
      "s146",
      "s147",
      "s148",
      "s149",
      "s150",
      "s151",
      "s152",
      "s153",
      "s154",
      // Div 26 — Electrical
      "s155",
      "s156",
      "s157",
      "s158",
      "s159",
      "s160",
      "s161",
      "s162",
      "s163",
      "s164",
      "s165",
      "s166",
      "s167",
      "s168",
      "s169",
      "s170",
      "s171",
      "s172",
      // Div 27 — Communications
      "s258",
      "s259",
      "s260",
      "s261",
      "s262",
      // Div 28 — Safety & security
      "s263",
      "s264",
      "s265",
      "s266",
      "s267",
      "s268",
      "s269",
    ],
    markup: {
      overhead: 10,
      profit: 10,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
    },
    project: {
      workType: "New Construction",
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 3. STRUCTURAL
  // ────────────────────────────────────────────────────────────────────
  {
    id: "structural",
    name: "Structural",
    description: "Concrete, steel, reinforcing, foundations — Divisions 03, 05, 31",
    icon: "🏗️",
    color: "#6366F1",
    divisions: ["03", "05", "31"],
    seedIds: [
      // Div 03 — Concrete
      "s001",
      "s002", // Formwork
      "s003",
      "s004",
      "s005", // Reinforcing
      "s006",
      "s007", // Ready mix
      "s008",
      "s009",
      "s010", // Finishing & curing
      "s011",
      "s012", // Embeds & precast
      "s270",
      "s271",
      "s273",
      "s274", // Foundation scope items
      "s483",
      "s484", // 3000 & 6000 PSI
      // Div 05 — Metals
      "s013",
      "s014",
      "s015", // Structural steel
      "s016",
      "s017",
      "s018", // Joists & deck
      "s019",
      "s020",
      "s021",
      "s022", // Fabrications, stairs, rails, grating
      "s278", // Embed plates
      // Div 31 — Earthwork (structural excavation)
      "s291",
      "s292",
      "s295",
      "s296", // Foundation excavation, backfill, stone, compaction
    ],
    markup: {
      overhead: 10,
      profit: 10,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
    },
    project: {
      workType: "New Construction",
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 4. CIVIL / SITEWORK
  // ────────────────────────────────────────────────────────────────────
  {
    id: "civil",
    name: "Civil / Sitework",
    description: "Earthwork, paving, utilities, landscaping — Divisions 31–33",
    icon: "🚧",
    color: "#10B981",
    divisions: ["31", "32", "33"],
    seedIds: [
      // Div 31 — Earthwork
      "s173",
      "s174",
      "s175",
      "s176",
      "s177",
      "s178",
      "s179",
      "s180",
      "s181",
      "s182",
      // Div 32 — Exterior improvements
      "s183",
      "s184",
      "s185",
      "s186",
      "s187",
      "s188",
      "s189",
      "s190",
      "s192",
      "s193",
      "s194",
      // Div 33 — Utilities
      "s227",
      "s228",
      "s229",
      "s230",
      "s231",
      "s232",
      "s233",
      "s234",
    ],
    markup: {
      overhead: 10,
      profit: 10,
      contingency: 5,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
    },
    project: {
      workType: "New Construction",
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 5. ROOFING CONSULTANT
  // ────────────────────────────────────────────────────────────────────
  {
    id: "roofing",
    name: "Roofing",
    description: "Roofing systems, waterproofing, flashing, sheet metal — Division 07",
    icon: "🏠",
    color: "#EF4444",
    divisions: ["07"],
    seedIds: [
      // Roofing systems
      "s092",
      "s093",
      "s094",
      "s095",
      // Flashing & sheet metal
      "s096",
      "s097",
      // Gutters & downspouts
      "s098",
      "s099",
      // Waterproofing & dampproofing
      "s100",
      "s101",
      // Insulation
      "s082",
      "s324",
      "s088",
      "s326",
      // Weather barriers
      "s089",
      "s090",
      "s091",
      // Sealants & firestopping
      "s102",
      "s103",
    ],
    markup: {
      overhead: 10,
      profit: 10,
      contingency: 3,
      generalConditions: 0,
      insurance: 2,
      tax: 0,
      bond: 0,
    },
    project: {
      workType: "New Construction",
    },
  },

  // ────────────────────────────────────────────────────────────────────
  // 6. PERMITTING
  // ────────────────────────────────────────────────────────────────────
  {
    id: "permitting",
    name: "Permitting",
    description: "Building permits, plan review, agency fees, inspections",
    icon: "📋",
    color: "#0EA5E9",
    divisions: ["01"],
    seedIds: [], // All custom items (fee-based)
    customItems: [
      { name: "Building Permit Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Plan Review Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Zoning / Land Use Review", code: "01.410", unit: "LS", trade: "general" },
      { name: "Fire Department Review", code: "01.410", unit: "LS", trade: "general" },
      { name: "Health Department Review", code: "01.410", unit: "LS", trade: "general" },
      { name: "Environmental / SEPA Review", code: "01.410", unit: "LS", trade: "general" },
      { name: "Demolition Permit", code: "01.410", unit: "LS", trade: "general" },
      { name: "Street / ROW Opening Permit", code: "01.410", unit: "LS", trade: "general" },
      { name: "Sidewalk / Curb Cut Permit", code: "01.410", unit: "LS", trade: "general" },
      { name: "Crane / Equipment Permit", code: "01.410", unit: "LS", trade: "general" },
      { name: "Utility Connection Fee — Water", code: "01.410", unit: "LS", trade: "general" },
      { name: "Utility Connection Fee — Sewer", code: "01.410", unit: "LS", trade: "general" },
      { name: "Utility Connection Fee — Gas", code: "01.410", unit: "LS", trade: "general" },
      { name: "Utility Connection Fee — Electric", code: "01.410", unit: "LS", trade: "general" },
      { name: "Temporary Certificate of Occupancy", code: "01.410", unit: "LS", trade: "general" },
      { name: "Final Certificate of Occupancy", code: "01.410", unit: "LS", trade: "general" },
    ],
    markup: {
      overhead: 0,
      profit: 0,
      contingency: 10,
      generalConditions: 0,
      insurance: 0,
      tax: 0,
      bond: 0,
    },
    project: {},
  },

  // ────────────────────────────────────────────────────────────────────
  // 7. BUILDING DEPARTMENT FEES
  // ────────────────────────────────────────────────────────────────────
  {
    id: "bldg-dept-fees",
    name: "Building Dept Fees",
    description: "Plan review, permits, impact fees, inspections by trade",
    icon: "🏢",
    color: "#F97316",
    divisions: ["01"],
    seedIds: [], // All custom items (fee-based)
    customItems: [
      { name: "Plan Review Fee — Architectural", code: "01.410", unit: "LS", trade: "general" },
      { name: "Plan Review Fee — Structural", code: "01.410", unit: "LS", trade: "general" },
      { name: "Plan Review Fee — MEP", code: "01.410", unit: "LS", trade: "general" },
      { name: "Plan Review Fee — Fire / Life Safety", code: "01.410", unit: "LS", trade: "general" },
      { name: "Building Permit Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Plumbing Permit", code: "01.410", unit: "LS", trade: "plumbing" },
      { name: "Electrical Permit", code: "01.410", unit: "LS", trade: "electrical" },
      { name: "Mechanical / HVAC Permit", code: "01.410", unit: "LS", trade: "hvac" },
      { name: "Fire Alarm Permit", code: "01.410", unit: "LS", trade: "electrical" },
      { name: "Fire Sprinkler Permit", code: "01.410", unit: "LS", trade: "fireSuppression" },
      { name: "Elevator Permit", code: "01.410", unit: "LS", trade: "elevator" },
      { name: "School Impact Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Park / Recreation Impact Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Transportation Impact Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Stormwater / Drainage Impact Fee", code: "01.410", unit: "LS", trade: "general" },
      { name: "Re-Inspection Fee", code: "01.410", unit: "EA", trade: "general" },
      { name: "Third-Party Inspections — Special", code: "01.450", unit: "LS", trade: "general" },
      { name: "Third-Party Inspections — Materials Testing", code: "01.450", unit: "LS", trade: "general" },
      { name: "Certificate of Occupancy Fee", code: "01.410", unit: "LS", trade: "general" },
    ],
    markup: {
      overhead: 0,
      profit: 0,
      contingency: 10,
      generalConditions: 0,
      insurance: 0,
      tax: 0,
      bond: 0,
    },
    project: {},
  },
];

// Quick lookup by template ID
export const TEMPLATE_MAP = new Map(ESTIMATE_TEMPLATES.map(t => [t.id, t]));
