// Canonical Item Labels — standardized taxonomy for cost database matching
// Pattern: "{Scope Noun} - {Key Differentiator}"
// Generated from 1,812 real line items across 35 BLDG Estimating proposals
//
// How it works:
// 1. Parsed descriptions get matched to a canonical label via CSI code + keywords
// 2. If no match, NOVA proposes a new canonical label using the pattern
// 3. Matt reviews new labels before they're added to the taxonomy
//
// Each label has: id, csiCode, canonical (display name), keywords (matching triggers),
//   defaultUnit, category (grouping for UI), and variants (common spec differences)

export const CANONICAL_LABELS = [

  // ── 02 — EXISTING CONDITIONS / DEMOLITION ──
  { id: "02-demo-selective", csiCode: "02", canonical: "Selective Demo - Interior", keywords: ["demolition", "selective demo", "gut demo", "strip out", "remove existing"], defaultUnit: "SF", category: "demolition" },
  { id: "02-demo-partitions", csiCode: "02", canonical: "Selective Demo - Partitions", keywords: ["remove.*wall", "demo.*partition", "remove.*interior wall"], defaultUnit: "LF", category: "demolition" },
  { id: "02-demo-ceilings", csiCode: "02", canonical: "Selective Demo - Ceilings", keywords: ["remove.*ceiling", "demo.*ceiling", "drop ceiling"], defaultUnit: "SF", category: "demolition" },
  { id: "02-demo-flooring", csiCode: "02", canonical: "Selective Demo - Flooring", keywords: ["remove.*floor", "demo.*floor", "rip up"], defaultUnit: "SF", category: "demolition" },
  { id: "02-demo-doors", csiCode: "02", canonical: "Selective Demo - Doors", keywords: ["remove.*door", "demo.*door", "remove.*casing"], defaultUnit: "EA", category: "demolition" },
  { id: "02-demo-mep", csiCode: "02", canonical: "Selective Demo - MEP", keywords: ["remove.*hvac", "remove.*plumb", "remove.*electric", "remove.*panel"], defaultUnit: "EA", category: "demolition" },
  { id: "02-demo-exterior", csiCode: "02", canonical: "Selective Demo - Exterior", keywords: ["remove.*exterior", "remove.*facade", "remove.*signage"], defaultUnit: "SF", category: "demolition" },
  { id: "02-containers", csiCode: "02", canonical: "Waste Removal - Containers", keywords: ["container", "dumpster", "waste removal", "30-yard", "20-yard"], defaultUnit: "EA", category: "demolition" },
  { id: "02-protection", csiCode: "02", canonical: "Protection - Temporary", keywords: ["protection", "protect existing", "floor protection"], defaultUnit: "SF", category: "demolition" },

  // ── 03 — CONCRETE ──
  { id: "03-slab", csiCode: "03", canonical: "Concrete - Slab on Grade", keywords: ["slab on grade", "concrete slab", "slab.*pour", "form.*pour.*slab"], defaultUnit: "CY", category: "concrete" },
  { id: "03-footings", csiCode: "03", canonical: "Concrete - Footings", keywords: ["footing", "foundation", "form.*pour.*footing"], defaultUnit: "CY", category: "concrete" },
  { id: "03-topping", csiCode: "03", canonical: "Concrete - Topping/Self-Leveling", keywords: ["topping", "self-level", "leveling", "self leveling"], defaultUnit: "SF", category: "concrete" },
  { id: "03-cutting", csiCode: "03", canonical: "Concrete - Cutting", keywords: ["concrete cut", "saw cut", "core drill"], defaultUnit: "LF", category: "concrete" },
  { id: "03-core-drill", csiCode: "03", canonical: "Concrete - Core Drilling", keywords: ["core drill", "core bore"], defaultUnit: "EA", category: "concrete" },
  { id: "03-polish", csiCode: "03", canonical: "Concrete - Polish/Seal", keywords: ["polish", "sealed concrete", "concrete seal", "grind.*seal"], defaultUnit: "SF", category: "concrete" },
  { id: "03-testing", csiCode: "03", canonical: "Concrete - Testing", keywords: ["concrete test", "cylinder test"], defaultUnit: "LS", category: "concrete" },
  { id: "03-trenching", csiCode: "03", canonical: "Concrete - Trenching/Patching", keywords: ["trench", "patch.*concrete", "concrete.*patch"], defaultUnit: "LF", category: "concrete" },

  // ── 06 — WOOD / PLASTICS / COMPOSITES ──
  { id: "06-framing-material", csiCode: "06", canonical: "Wood Framing - Material", keywords: ["wood framing material", "framing material", "lumber"], defaultUnit: "SF", category: "carpentry" },
  { id: "06-framing-labor", csiCode: "06", canonical: "Wood Framing - Labor", keywords: ["wood framing labor", "framing labor", "frame.*labor"], defaultUnit: "SF", category: "carpentry" },
  { id: "06-millwork", csiCode: "06", canonical: "Millwork - General", keywords: ["millwork", "cabinetry", "cabinet", "custom wood"], defaultUnit: "LF", category: "carpentry" },
  { id: "06-millwork-kitchen", csiCode: "06", canonical: "Millwork - Kitchen Cabinets", keywords: ["kitchen.*cabinet", "lower cabinet", "upper cabinet", "island cabinet"], defaultUnit: "LF", category: "carpentry" },
  { id: "06-finish-carp", csiCode: "06", canonical: "Finish Carpentry - General", keywords: ["finish carpentry", "trim", "casing", "base molding", "crown"], defaultUnit: "LF", category: "carpentry" },
  { id: "06-closets", csiCode: "06", canonical: "Closet Interiors", keywords: ["closet interior", "closet system", "closet shelf"], defaultUnit: "EA", category: "carpentry" },
  { id: "06-decking", csiCode: "06", canonical: "Decking - Composite/Wood", keywords: ["decking", "trex", "deck board", "composite deck"], defaultUnit: "SF", category: "carpentry" },
  { id: "06-stairs-wood", csiCode: "06", canonical: "Stairs - Wood", keywords: ["wood stair", "stair.*railing", "stringer", "tread.*riser"], defaultUnit: "EA", category: "carpentry" },
  { id: "06-blocking", csiCode: "06", canonical: "Blocking - Wood", keywords: ["wood blocking", "plywood blocking", "backing"], defaultUnit: "LF", category: "carpentry" },
  { id: "06-panels", csiCode: "06", canonical: "Wall Panels - Wood/Slat", keywords: ["slat wall", "wood panel", "millwork panel", "wall panel"], defaultUnit: "SF", category: "carpentry" },

  // ── 08 — OPENINGS ──
  { id: "08-doors-hm", csiCode: "08", canonical: "Doors - Hollow Metal", keywords: ["hm door", "hollow metal", "hm frame"], defaultUnit: "EA", category: "openings" },
  { id: "08-doors-wood", csiCode: "08", canonical: "Doors - Wood", keywords: ["wood door", "pre-hung", "prehung", "flush wood"], defaultUnit: "EA", category: "openings" },
  { id: "08-doors-entry", csiCode: "08", canonical: "Doors - Entry/Exterior", keywords: ["entry door", "exterior door", "residential entry"], defaultUnit: "EA", category: "openings" },
  { id: "08-doors-garage", csiCode: "08", canonical: "Doors - Garage/Overhead", keywords: ["garage door", "overhead door", "roll-up"], defaultUnit: "EA", category: "openings" },
  { id: "08-doors-specialty", csiCode: "08", canonical: "Doors - Specialty", keywords: ["barn.*door", "sliding.*door", "pocket.*door", "specialty door"], defaultUnit: "EA", category: "openings" },
  { id: "08-hardware", csiCode: "08", canonical: "Door Hardware - General", keywords: ["hardware", "lockset", "closer", "hw"], defaultUnit: "EA", category: "openings" },
  { id: "08-windows", csiCode: "08", canonical: "Windows - General", keywords: ["window", "glazing"], defaultUnit: "EA", category: "openings" },
  { id: "08-skylights", csiCode: "08", canonical: "Skylights", keywords: ["skylight"], defaultUnit: "EA", category: "openings" },
  { id: "08-glass-metal", csiCode: "08", canonical: "Arch Metal & Glass - Storefront", keywords: ["arch.*metal", "storefront", "curtain wall", "glass.*metal"], defaultUnit: "SF", category: "openings" },
  { id: "08-glass-rail", csiCode: "08", canonical: "Glass Railings", keywords: ["glass rail", "glass guard"], defaultUnit: "LF", category: "openings" },
  { id: "08-shower-encl", csiCode: "08", canonical: "Shower Enclosures - Glass", keywords: ["shower enclosure", "shower glass", "shower door"], defaultUnit: "EA", category: "openings" },
  { id: "08-mirrors", csiCode: "08", canonical: "Mirrors", keywords: ["mirror"], defaultUnit: "EA", category: "openings" },

  // ── 09 — FINISHES ──
  { id: "09-drywall-std", csiCode: "09", canonical: "Drywall Partition - Standard", keywords: ["gwb wall", "drywall.*partition", "gypsum.*board.*wall", "5/8.*gwb", "drywall & carpentry"], defaultUnit: "SF", category: "finishes",
    variants: ["3-5/8\" studs", "6\" studs", "moisture resistant", "fire rated"] },
  { id: "09-drywall-ceiling", csiCode: "09", canonical: "Drywall Ceiling - Hung", keywords: ["gwb ceiling", "hung.*ceiling", "drywall.*ceiling", "gypsum.*ceiling"], defaultUnit: "SF", category: "finishes" },
  { id: "09-drywall-soffit", csiCode: "09", canonical: "Drywall - Soffit/Fascia", keywords: ["soffit", "fascia", "bulkhead", "furr"], defaultUnit: "SF", category: "finishes" },
  { id: "09-framing-metal", csiCode: "09", canonical: "Metal Stud Framing", keywords: ["metal stud", "steel stud", "metal framing", "stud framing"], defaultUnit: "SF", category: "finishes",
    variants: ["3-5/8\"", "6\"", "8\""] },
  { id: "09-insulation", csiCode: "09", canonical: "Insulation - Blanket/Batt", keywords: ["insulation", "blanket", "sound batt", "attenuation"], defaultUnit: "SF", category: "finishes" },
  { id: "09-act", csiCode: "09", canonical: "Acoustical Ceiling Tile", keywords: ["act", "acoustical ceil", "ceiling tile", "tegular", "suspended ceil"], defaultUnit: "SF", category: "finishes" },
  { id: "09-tile-floor", csiCode: "09", canonical: "Floor Tile - Porcelain/Ceramic", keywords: ["tile.*floor", "porcelain.*floor", "ceramic.*floor", "tile & stone"], defaultUnit: "SF", category: "finishes" },
  { id: "09-tile-wall", csiCode: "09", canonical: "Wall Tile - Ceramic/Porcelain", keywords: ["tile.*wall", "backsplash", "wall.*tile", "subway.*tile"], defaultUnit: "SF", category: "finishes" },
  { id: "09-tile-stone", csiCode: "09", canonical: "Stone Tile - Natural", keywords: ["stone.*tile", "marble", "granite", "natural stone", "travertine"], defaultUnit: "SF", category: "finishes" },
  { id: "09-flooring-lvt", csiCode: "09", canonical: "Flooring - LVT/Vinyl", keywords: ["lvt", "luxury vinyl", "vinyl.*tile", "vinyl.*plank", "sheet vinyl", "vct"], defaultUnit: "SF", category: "finishes" },
  { id: "09-flooring-carpet", csiCode: "09", canonical: "Flooring - Carpet Tile", keywords: ["carpet", "carpet tile", "broadloom"], defaultUnit: "SY", category: "finishes" },
  { id: "09-flooring-wood", csiCode: "09", canonical: "Flooring - Wood", keywords: ["wood floor", "hardwood", "oak floor", "engineered wood"], defaultUnit: "SF", category: "finishes" },
  { id: "09-flooring-epoxy", csiCode: "09", canonical: "Flooring - Epoxy/Resinous", keywords: ["epoxy", "resinous", "resin floor", "urethane floor"], defaultUnit: "SF", category: "finishes" },
  { id: "09-flooring-concrete", csiCode: "09", canonical: "Flooring - Sealed/Polished Concrete", keywords: ["sealed concrete", "polished concrete", "concrete seal.*floor"], defaultUnit: "SF", category: "finishes" },
  { id: "09-base", csiCode: "09", canonical: "Base - Vinyl/Rubber", keywords: ["vinyl base", "rubber base", "cove base", "base molding"], defaultUnit: "LF", category: "finishes" },
  { id: "09-paint-walls", csiCode: "09", canonical: "Paint - Walls", keywords: ["paint.*wall", "painting.*wall"], defaultUnit: "SF", category: "finishes" },
  { id: "09-paint-ceilings", csiCode: "09", canonical: "Paint - Ceilings", keywords: ["paint.*ceiling"], defaultUnit: "SF", category: "finishes" },
  { id: "09-paint-doors", csiCode: "09", canonical: "Paint - Doors/Frames", keywords: ["paint.*door", "paint.*frame", "paint.*hm"], defaultUnit: "EA", category: "finishes" },
  { id: "09-paint-specialty", csiCode: "09", canonical: "Paint - Specialty/Intumescent", keywords: ["intumescent", "fireproof.*paint", "exposed.*steel.*paint", "paint.*metal deck"], defaultUnit: "SF", category: "finishes" },
  { id: "09-wall-covering", csiCode: "09", canonical: "Wall Coverings", keywords: ["wall covering", "wallpaper", "wall fabric"], defaultUnit: "SF", category: "finishes" },

  // ── 10 — SPECIALTIES ──
  { id: "10-bath-access", csiCode: "10", canonical: "Bath Accessories", keywords: ["bath accessor", "grab bar", "towel bar", "soap dispenser", "paper holder"], defaultUnit: "EA", category: "specialties" },
  { id: "10-toilet-part", csiCode: "10", canonical: "Toilet Partitions", keywords: ["toilet partition", "bathroom partition", "stall"], defaultUnit: "EA", category: "specialties" },
  { id: "10-signage", csiCode: "10", canonical: "Signage", keywords: ["signage", "sign"], defaultUnit: "EA", category: "specialties" },
  { id: "10-fireplace", csiCode: "10", canonical: "Fireplaces", keywords: ["fireplace", "fire box", "chimney cap"], defaultUnit: "EA", category: "specialties" },
  { id: "10-fire-prot", csiCode: "10", canonical: "Fire Protection Specialties", keywords: ["fire extinguish", "fire protection special", "fire cabinet"], defaultUnit: "EA", category: "specialties" },
  { id: "10-lockers", csiCode: "10", canonical: "Lockers/Storage", keywords: ["locker", "storage locker", "package locker"], defaultUnit: "EA", category: "specialties" },
  { id: "10-wall-prot", csiCode: "10", canonical: "Wall/Door Protection", keywords: ["wall protection", "corner guard", "wall bumper", "frp panel", "whiterock"], defaultUnit: "LF", category: "specialties" },

  // ── 11 — EQUIPMENT ──
  { id: "11-appliances", csiCode: "11", canonical: "Appliances - Residential", keywords: ["appliance", "refrigerator", "dishwasher", "range", "oven", "washer.*dryer"], defaultUnit: "EA", category: "equipment" },
  { id: "11-food-equip", csiCode: "11", canonical: "Equipment - Food Service", keywords: ["food.*equip", "commercial kitchen", "hood", "exhaust.*kitchen"], defaultUnit: "EA", category: "equipment" },

  // ── 12 — FURNISHINGS ──
  { id: "12-countertops", csiCode: "12", canonical: "Countertops - Stone/Solid Surface", keywords: ["countertop", "counter top", "quartz", "solid surface", "granite counter"], defaultUnit: "LF", category: "furnishings" },
  { id: "12-window-treat", csiCode: "12", canonical: "Window Treatments", keywords: ["window treatment", "blind", "shade", "curtain", "drape"], defaultUnit: "EA", category: "furnishings" },

  // ── 21 — FIRE SUPPRESSION ──
  { id: "21-sprinkler", csiCode: "21", canonical: "Fire Sprinkler - Wet System", keywords: ["sprinkler", "fire suppression", "wet system", "fire sprinkler"], defaultUnit: "HD", category: "fire-suppression" },

  // ── 22 — PLUMBING ──
  { id: "22-plumbing", csiCode: "22", canonical: "Plumbing - General", keywords: ["plumbing"], defaultUnit: "LS", category: "plumbing" },
  { id: "22-fixtures", csiCode: "22", canonical: "Plumbing Fixtures", keywords: ["plumbing fixture", "fixture", "toilet", "lavatory", "sink", "urinal"], defaultUnit: "EA", category: "plumbing" },
  { id: "22-piping", csiCode: "22", canonical: "Plumbing - Piping", keywords: ["copper pipe", "pvc pipe", "drain line", "waste line", "supply line"], defaultUnit: "LF", category: "plumbing" },

  // ── 23 — HVAC ──
  { id: "23-hvac", csiCode: "23", canonical: "HVAC - General", keywords: ["hvac", "heating.*ventilat", "mechanical"], defaultUnit: "LS", category: "hvac" },
  { id: "23-ductwork", csiCode: "23", canonical: "HVAC - Ductwork", keywords: ["duct", "galvanized.*duct", "flex duct", "ductwork"], defaultUnit: "LB", category: "hvac" },
  { id: "23-diffuser", csiCode: "23", canonical: "HVAC - Diffusers/Grilles", keywords: ["diffuser", "grille", "register", "supply grille", "return grille", "exhaust grille"], defaultUnit: "EA", category: "hvac" },
  { id: "23-condenser", csiCode: "23", canonical: "HVAC - Condensing Unit", keywords: ["condenser", "condensing unit", "outdoor unit", "accu"], defaultUnit: "EA", category: "hvac" },
  { id: "23-ahu", csiCode: "23", canonical: "HVAC - Air Handler", keywords: ["air handler", "ahu", "fan coil", "indoor unit"], defaultUnit: "EA", category: "hvac" },
  { id: "23-heater", csiCode: "23", canonical: "HVAC - Electric Heater", keywords: ["electric heater", "baseboard heat", "unit heater"], defaultUnit: "EA", category: "hvac" },
  { id: "23-erv", csiCode: "23", canonical: "HVAC - ERV/HRV", keywords: ["erv", "hrv", "energy recovery", "heat recovery"], defaultUnit: "EA", category: "hvac" },
  { id: "23-controls", csiCode: "23", canonical: "HVAC - Controls/Thermostats", keywords: ["thermostat", "controller", "bms", "building management"], defaultUnit: "EA", category: "hvac" },
  { id: "23-testing", csiCode: "23", canonical: "HVAC - Testing/Balancing", keywords: ["testing", "balancing", "tab", "air balance", "commissioning"], defaultUnit: "LS", category: "hvac" },

  // ── 26 — ELECTRICAL ──
  { id: "26-electrical", csiCode: "26", canonical: "Electrical - General", keywords: ["electrical", "electric"], defaultUnit: "LS", category: "electrical" },
  { id: "26-lighting", csiCode: "26", canonical: "Lighting Fixtures", keywords: ["lighting fixture", "light fixture", "luminaire", "recessed light"], defaultUnit: "EA", category: "electrical" },
  { id: "26-controls-lt", csiCode: "26", canonical: "Lighting Controls", keywords: ["lighting control", "dimmer", "switch", "occupancy sensor"], defaultUnit: "EA", category: "electrical" },
  { id: "26-panel", csiCode: "26", canonical: "Electrical - Panel/Distribution", keywords: ["panel", "distribution", "breaker", "switchgear"], defaultUnit: "EA", category: "electrical" },
  { id: "26-wiring", csiCode: "26", canonical: "Electrical - Wiring/Conduit", keywords: ["wiring", "conduit", "wire", "mc cable", "bx"], defaultUnit: "LF", category: "electrical" },

  // ── 28 — ELECTRONIC SAFETY ──
  { id: "28-fire-alarm", csiCode: "28", canonical: "Fire Alarm System", keywords: ["fire alarm", "smoke detector", "pull station", "horn strobe"], defaultUnit: "LS", category: "electronic-safety" },

  // ── 31 — EARTHWORK ──
  { id: "31-excavation", csiCode: "31", canonical: "Excavation - General", keywords: ["excavat", "dig", "earthwork"], defaultUnit: "CY", category: "sitework" },
  { id: "31-grading", csiCode: "31", canonical: "Grading - Fine/Rough", keywords: ["grading", "grade", "rough grade", "fine grade"], defaultUnit: "SF", category: "sitework" },
  { id: "31-backfill", csiCode: "31", canonical: "Backfill/Fill", keywords: ["backfill", "fill", "compacted fill", "structural fill"], defaultUnit: "CY", category: "sitework" },
  { id: "31-utilities-site", csiCode: "31", canonical: "Site Utilities", keywords: ["site utility", "utility trench", "storm drain", "sanitary"], defaultUnit: "LF", category: "sitework" },

  // ── 32 — EXTERIOR IMPROVEMENTS ──
  { id: "32-paving-asphalt", csiCode: "32", canonical: "Paving - Asphalt", keywords: ["asphalt", "blacktop", "asphalt pav"], defaultUnit: "SF", category: "sitework" },
  { id: "32-paving-concrete", csiCode: "32", canonical: "Paving - Concrete", keywords: ["concrete.*pav", "sidewalk", "concrete walk"], defaultUnit: "SF", category: "sitework" },
  { id: "32-paving-pavers", csiCode: "32", canonical: "Paving - Pavers/Stone", keywords: ["paver", "cobblestone", "bluestone", "flagstone"], defaultUnit: "SF", category: "sitework" },
  { id: "32-curb", csiCode: "32", canonical: "Curbing", keywords: ["curb", "curbing"], defaultUnit: "LF", category: "sitework" },
  { id: "32-landscape", csiCode: "32", canonical: "Landscaping - General", keywords: ["landscap", "planting", "mulch", "topsoil", "sod", "seed"], defaultUnit: "SF", category: "sitework" },
  { id: "32-fence", csiCode: "32", canonical: "Fencing", keywords: ["fence", "fencing", "gate"], defaultUnit: "LF", category: "sitework" },
];

// ── Category labels for UI grouping ──
export const CANONICAL_CATEGORIES = {
  demolition: { label: "Demolition", csiPrefix: "02", icon: "🔨" },
  concrete: { label: "Concrete", csiPrefix: "03", icon: "🏗️" },
  carpentry: { label: "Carpentry & Millwork", csiPrefix: "06", icon: "🪵" },
  openings: { label: "Openings", csiPrefix: "08", icon: "🚪" },
  finishes: { label: "Finishes", csiPrefix: "09", icon: "🎨" },
  specialties: { label: "Specialties", csiPrefix: "10", icon: "🔧" },
  equipment: { label: "Equipment", csiPrefix: "11", icon: "⚙️" },
  furnishings: { label: "Furnishings", csiPrefix: "12", icon: "🪑" },
  "fire-suppression": { label: "Fire Suppression", csiPrefix: "21", icon: "🔥" },
  plumbing: { label: "Plumbing", csiPrefix: "22", icon: "🚰" },
  hvac: { label: "HVAC", csiPrefix: "23", icon: "❄️" },
  electrical: { label: "Electrical", csiPrefix: "26", icon: "⚡" },
  "electronic-safety": { label: "Electronic Safety", csiPrefix: "28", icon: "🚨" },
  sitework: { label: "Sitework", csiPrefix: "31-32", icon: "🌍" },
};

// ── Matching function: find canonical label for a parsed description ──
export function matchCanonicalLabel(description, csiCode) {
  if (!description) return null;
  const desc = description.toLowerCase();
  const csi = csiCode || "";

  // Pass 1: Match by CSI code + keywords (most precise)
  const csiMatches = CANONICAL_LABELS.filter(l => l.csiCode === csi);
  for (const label of csiMatches) {
    for (const kw of label.keywords) {
      const regex = new RegExp(kw, "i");
      if (regex.test(desc)) return label;
    }
  }

  // Pass 2: Match by keywords only (cross-division fallback)
  for (const label of CANONICAL_LABELS) {
    for (const kw of label.keywords) {
      const regex = new RegExp(kw, "i");
      if (regex.test(desc)) return label;
    }
  }

  return null;
}

// ── Title Case: capitalize each word except minor words ──
const MINOR_WORDS = new Set(["a","an","and","as","at","but","by","for","from","if","in","into","is","it","no","nor","not","of","on","or","so","the","to","up","vs","via","with","yet"]);
export function titleCaseLabel(str) {
  if (!str) return "";
  return str.replace(/\w\S*/g, (word, i) => {
    if (i > 0 && MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// ── Propose a new canonical label from a parsed description ──
export function proposeCanonicalLabel(description, csiCode, unit) {
  // Strip common prefixes
  let clean = description
    .replace(/^(f\/i|f\/o|i\/o|furnish\s*(and|&)?\s*install|install\s*only)\s+/i, "")
    .replace(/^\d{2}\.\d{4}\s+[^-]*-\s*/i, "") // Strip "09.2110 Drywall -" prefixes
    .replace(/^\d{2}\.\d{4}\s+/i, "") // Strip bare CSI codes
    .replace(/\s*\[.*\]\s*$/, "") // Strip spec brackets [Armstrong #1942]
    .replace(/\s*\(.*\)\s*$/, "") // Strip parenthetical
    .trim();

  // Title case
  clean = titleCaseLabel(clean);

  // If short enough, use as-is
  if (clean.length <= 45) return clean;

  // Truncate at word boundary
  const words = clean.split(" ").slice(0, 6);
  return words.join(" ");
}
