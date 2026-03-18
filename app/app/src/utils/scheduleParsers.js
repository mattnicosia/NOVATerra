// Schedule Parsers — pluggable configs for 9 architectural/engineering schedule types
// Each type defines a detection label, AI parse prompt, and output schema

export const SCHEDULE_TYPES = [
  {
    id: "wall-types",
    label: "Wall Type Schedule",
    keywords: ["wall type", "partition type", "wall schedule", "partition schedule"],
    outputFields: ["typeLabel", "material", "height", "gauge", "studs", "insulation", "drywall", "finish"],
    csiDivisions: ["05", "09"],
  },
  {
    id: "door",
    label: "Door Schedule",
    keywords: ["door schedule", "door type"],
    outputFields: ["mark", "width", "height", "type", "material", "frame", "hardware", "fire_rating", "quantity"],
    csiDivisions: ["08"],
  },
  {
    id: "window",
    label: "Window Schedule",
    keywords: ["window schedule", "window type", "glazing schedule"],
    outputFields: ["mark", "width", "height", "type", "glazing", "frame", "operation", "quantity"],
    csiDivisions: ["08"],
  },
  {
    id: "finish",
    label: "Room Finish Schedule",
    keywords: ["finish schedule", "room finish", "interior finish"],
    outputFields: ["room", "floor", "base", "north_wall", "south_wall", "east_wall", "west_wall", "ceiling", "notes"],
    csiDivisions: ["09"],
  },
  {
    id: "plumbing-fixture",
    label: "Plumbing Fixture Schedule",
    keywords: ["plumbing fixture", "plumbing schedule", "fixture schedule"],
    outputFields: ["mark", "fixture_type", "manufacturer", "model", "supply", "waste", "quantity"],
    csiDivisions: ["22"],
  },
  {
    id: "equipment",
    label: "Equipment Schedule",
    keywords: ["equipment schedule", "kitchen equipment", "food service equipment"],
    outputFields: ["mark", "description", "size", "electrical", "plumbing", "mechanical", "quantity"],
    csiDivisions: ["11"],
  },
  {
    id: "lighting-fixture",
    label: "Lighting Fixture Schedule",
    keywords: ["lighting fixture", "lighting schedule", "luminaire schedule", "light fixture"],
    outputFields: [
      "mark",
      "description",
      "lamp_type",
      "wattage",
      "voltage",
      "mounting",
      "dimming",
      "emergency",
      "circuit",
      "quantity",
    ],
    csiDivisions: ["26"],
  },
  {
    id: "mechanical-equipment",
    label: "Mechanical Equipment Schedule",
    keywords: ["mechanical equipment", "HVAC schedule", "mechanical schedule", "AHU schedule", "RTU schedule"],
    outputFields: [
      "mark",
      "description",
      "type",
      "capacity_tons_cfm",
      "voltage",
      "phase",
      "refrigerant",
      "ductwork",
      "controls",
      "quantity",
    ],
    csiDivisions: ["23"],
  },
  {
    id: "finish-detail",
    label: "Finish Detail Schedule",
    keywords: ["finish detail", "material schedule", "finish material", "color schedule"],
    outputFields: [
      "material_type",
      "manufacturer",
      "product",
      "color",
      "pattern",
      "thickness",
      "application_area",
      "notes",
    ],
    csiDivisions: ["09"],
  },
];

// ─── Pass 1: Detection Prompt ──────────────────────────────────────────
// Sent with full-page image to identify which schedules exist and where
export function buildDetectionPrompt(drawingLabel, ocrText = null) {
  const typeList = SCHEDULE_TYPES.map(t => `  - "${t.id}": ${t.label} (keywords: ${t.keywords.join(", ")})`).join("\n");

  const ocrSection = ocrText
    ? `\n\nOCR-EXTRACTED TEXT FROM THIS DRAWING:\n"""\n${ocrText.slice(0, 4000)}\n"""\n\nUse this extracted text to confirm schedule table locations, titles, and column headers. The OCR text is a reliable source for text that may be small or hard to read in the image.`
    : "";

  return `You are analyzing a construction drawing sheet${drawingLabel ? ` labeled "${drawingLabel}"` : ""}.

Look for SCHEDULE TABLES on this drawing. A schedule is a FORMAL TABLE with:
- A clear title/header (e.g., "DOOR SCHEDULE", "WALL TYPE SCHEDULE")
- Column headers defining data fields
- Multiple rows of structured data entries

IMPORTANT — do NOT report these as schedules:
- Fixture symbols or legends (circles with letters like "A", "B" on electrical plans are NOT a lighting fixture schedule — those are just symbols on the plan)
- General notes, keynotes, or abbreviation lists
- Title blocks or revision tables
- Drawing legends or symbol keys
- Dimension annotations or callouts
- Small reference tables with fewer than 3 data rows

A lighting fixture schedule specifically must be a TABLE listing fixture types with columns for description, wattage, voltage, mounting, etc. — not a legend showing what the fixture symbols mean on the plan.

Known schedule types:
${typeList}

For EACH real schedule table you find, return:
- "type": one of the schedule type IDs listed above, or "unknown" if it doesn't match
- "bbox": approximate bounding box as [x%, y%, width%, height%] (percentage of image dimensions)
- "confidence": "high", "medium", or "low"
- "title": the schedule title EXACTLY as shown on the drawing
- "rowCount": approximate number of data rows (not counting headers)

Return ONLY a JSON array. If no schedules found, return [].

Example: [{"type":"door","bbox":[55,10,40,35],"confidence":"high","title":"DOOR SCHEDULE","rowCount":15}]${ocrSection}`;
}

// ─── Pass 2: Parse Prompts (per schedule type) ────────────────────────
// Sent with cropped image of the specific schedule table
export function buildParsePrompt(scheduleType, ocrText = null, notesContext = null) {
  const typeConfig = SCHEDULE_TYPES.find(t => t.id === scheduleType);
  if (!typeConfig) return null;

  const fieldList = typeConfig.outputFields.map(f => `"${f}"`).join(", ");

  const typeSpecificInstructions = {
    "wall-types": `For each wall type row in this schedule, extract:
- typeLabel: Copy the EXACT type identifier as printed on the drawing — this is the wall type code/label shown in the first column or as a bold header for each type (e.g., "A", "B", "W1", "WP-1", "EW-1", "Type A", "P1"). Do NOT invent or modify this label — use EXACTLY what is shown.
- material: Primary framing material (e.g., "Metal Stud", "Wood Stud", "CMU", "Concrete")
- height: Wall height in feet (number only, e.g., 10, 12, 9.5). If shown as feet-inches like 10'-0", convert to decimal feet.
- gauge: Metal stud gauge if specified (e.g., "20 ga", "16 ga"). Use null if wood or masonry.
- studs: Stud size and spacing as shown (e.g., "3-5/8" @ 16" o.c.", "2x4 @ 16" o.c.")
- insulation: Insulation type and R-value (e.g., "R-13 Batt", "R-19 Rigid", "None")
- drywall: Drywall layers and type (e.g., "1 layer 5/8" Type X each side", "(2) layers 5/8" Type X")
- finish: Surface finish description (e.g., "Level 4 Paint", "Ceramic Tile to 48"", "FRP")

CRITICAL: The typeLabel must be the exact text shown on the drawing for the wall type identifier. If the schedule shows types as "A", "B", "C", use those exact letters. If it shows "WP-1", "WP-2", use those exact codes. Do NOT use generic labels like "Type 1" unless that is literally what the drawing shows.`,

    door: `For each door in the schedule, extract:
- mark: Door mark/number (e.g., "101", "A", "D-1")
- width: Door width (e.g., "3'-0"", "36"")
- height: Door height (e.g., "7'-0"", "84"")
- type: Door type (e.g., "Flush", "Panel", "Hollow Metal")
- material: Door material (e.g., "Wood", "Hollow Metal", "Aluminum/Glass")
- frame: Frame type (e.g., "HM", "Wood", "Aluminum")
- hardware: Hardware set or group (e.g., "Set A", "Group 1")
- fire_rating: Fire rating if shown (e.g., "20 min", "90 min", "None")
- quantity: Number of this door type if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    window: `For each window in the schedule, extract:
- mark: Window mark/type (e.g., "W-1", "A", "101")
- width: Window width
- height: Window height
- type: Window type (e.g., "Fixed", "Casement", "Sliding", "Curtain Wall")
- glazing: Glazing type (e.g., "Double IGU", "Tempered", "Low-E")
- frame: Frame material (e.g., "Aluminum", "Vinyl", "Wood")
- operation: Operation type (e.g., "Fixed", "Operable", "Awning")
- quantity: Number of this window type if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    finish: `For each room/area row, extract:
- room: Room name or number (e.g., "101 - Office", "Corridor")
- floor: Floor finish (e.g., "VCT", "Carpet", "Ceramic Tile")
- base: Base finish (e.g., "Rubber", "Wood", "Ceramic")
- north_wall/south_wall/east_wall/west_wall: Wall finish per direction, or "walls" if not directional (e.g., "GWB + Paint", "Ceramic Tile to 4'")
- ceiling: Ceiling finish (e.g., "ACT 2x4", "GWB + Paint", "Exposed")
- notes: Any additional notes`,

    "plumbing-fixture": `For each fixture, extract:
- mark: Fixture mark/symbol (e.g., "P-1", "WC", "LAV")
- fixture_type: Type of fixture (e.g., "Water Closet", "Lavatory", "Floor Drain")
- manufacturer: Manufacturer name if shown
- model: Model number if shown
- supply: Supply connection size and type (e.g., "1/2" CW", "3/4" HW+CW")
- waste: Waste connection size (e.g., "4" DWV", "2" P-trap")
- quantity: Number of this fixture if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    equipment: `For each equipment item, extract:
- mark: Equipment mark/number (e.g., "E-1", "KE-101")
- description: Equipment description (e.g., "Walk-in Cooler", "Range Hood")
- size: Physical dimensions if shown
- electrical: Electrical requirements (e.g., "208V/3Ph/60A")
- plumbing: Plumbing connections if any
- mechanical: Mechanical requirements (e.g., "Exhaust required")
- quantity: Number of this equipment item if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    "lighting-fixture": `For each lighting fixture type, extract:
- mark: Fixture type/mark (e.g., "A", "F1", "L-1")
- description: Fixture description (e.g., "2x4 Recessed Troffer", "6" LED Downlight")
- lamp_type: Lamp type (e.g., "LED", "Fluorescent T8", "HID")
- wattage: Wattage or power consumption
- voltage: Voltage (e.g., "120V", "277V")
- mounting: Mounting type (e.g., "Recessed", "Surface", "Pendant", "Wall")
- dimming: Dimming capability (e.g., "0-10V Dimming", "Non-dim")
- emergency: Emergency battery/circuit (e.g., "EM Battery", "Generator", "None")
- circuit: Circuit designation if shown
- quantity: Number of this fixture type if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    "mechanical-equipment": `For each mechanical equipment item, extract:
- mark: Equipment mark (e.g., "AHU-1", "RTU-1", "FCU-101")
- description: Equipment description (e.g., "Rooftop Unit", "Fan Coil Unit")
- type: Equipment category (e.g., "AHU", "RTU", "VAV", "Chiller", "Boiler")
- capacity_tons_cfm: Capacity (e.g., "15 Tons", "5000 CFM", "100 MBH")
- voltage: Electrical requirements (e.g., "480V/3Ph")
- phase: Electrical phase
- refrigerant: Refrigerant type if applicable (e.g., "R-410A")
- ductwork: Ductwork connection info if shown
- controls: Controls type (e.g., "DDC", "BACnet", "Standalone")
- quantity: Number of this equipment if shown in a "Qty", "Count", or "No." column. Use null if not shown.`,

    "finish-detail": `For each finish material entry, extract:
- material_type: Category (e.g., "Paint", "Flooring", "Wall Covering", "Countertop")
- manufacturer: Manufacturer name
- product: Product name or line
- color: Color or finish name
- pattern: Pattern if applicable
- thickness: Thickness or gauge
- application_area: Where it's applied (e.g., "All offices", "Lobby walls")
- notes: Additional notes or specifications`,
  };

  return `You are parsing a construction ${typeConfig.label} that has been cropped from an architectural drawing.

${typeSpecificInstructions[scheduleType] || `Extract all rows from this schedule with fields: ${fieldList}`}

IMPORTANT:
- Extract EVERY row in the table — do not skip any entries
- Use null for fields that are not present or not readable
- Preserve exact notation as shown (dimensions, ratings, etc.)
- If a cell spans multiple rows, apply the value to all applicable rows

Return ONLY a JSON array of objects with these fields: ${fieldList}
If you cannot parse the schedule, return [].${ocrText ? `\n\nOCR-EXTRACTED TEXT FROM THIS SCHEDULE TABLE:\n"""\n${ocrText.slice(0, 6000)}\n"""\n\nUse this OCR text as a reliable source for cell values, especially small text, abbreviations, and dimension values that may be hard to read from the image alone. Cross-reference what you see in the image with this OCR text for maximum accuracy.` : ""}${notesContext ? `\n\n${notesContext}\n\nUSE THESE DRAWING NOTES to fill in missing or incomplete schedule fields. For example:\n- If notes specify "All doors shall be HM unless noted", apply "Hollow Metal" as default door material\n- If notes specify insulation requirements, apply to wall types missing insulation info\n- If notes specify fire ratings for certain areas, apply to relevant entries\n- If notes mention specific manufacturers or standards, include that context` : ""}`;
}

// ─── Data Normalization ───────────────────────────────────────────────
export function normalizeScheduleData(type, rawData) {
  if (!Array.isArray(rawData)) return [];

  return rawData
    .map(entry => {
      const cleaned = {};
      const typeConfig = SCHEDULE_TYPES.find(t => t.id === type);
      if (!typeConfig) return entry;

      // Ensure all expected fields exist
      typeConfig.outputFields.forEach(field => {
        cleaned[field] = entry[field] ?? null;
      });

      // Type-specific normalization
      if (type === "wall-types") {
        // Normalize height to number
        if (cleaned.height && typeof cleaned.height === "string") {
          const match = cleaned.height.match(/(\d+(?:\.\d+)?)/);
          if (match) cleaned.height = parseFloat(match[1]);
        }
      }

      if (type === "door" || type === "window") {
        // Keep dimension strings as-is for display, they'll be parsed at cost-matching time
      }

      return cleaned;
    })
    .filter(entry => {
      // Remove completely empty entries
      const typeConfig = SCHEDULE_TYPES.find(t => t.id === type);
      return typeConfig.outputFields.some(f => entry[f] != null && entry[f] !== "");
    });
}

// ─── Pass 2.3: Floor Plan Counting Prompt ─────────────────────────────
// Sent with floor plan images to count how many of each mark appear
export function buildCountingPrompt(marksByType, ocrText = null) {
  const sections = Object.entries(marksByType)
    .map(([scheduleType, marks]) => {
      const typeConfig = SCHEDULE_TYPES.find(t => t.id === scheduleType);
      const label = typeConfig?.label || scheduleType;
      return `${label} marks: ${marks.map(m => `"${m}"`).join(", ")}`;
    })
    .join("\n");

  const ocrSection = ocrText
    ? `\n\nOCR-EXTRACTED TEXT FROM THIS FLOOR PLAN:\n"""\n${ocrText.slice(0, 4000)}\n"""\n\nUse this OCR text to help locate and confirm mark labels that may be small or hard to read in the image.`
    : "";

  return `You are analyzing an architectural FLOOR PLAN drawing. Count how many times each of the following schedule marks/symbols appear on this plan.

HOW TO IDENTIFY MARKS:
- DOOR marks appear as text inside circles, hexagons, or diamonds near door swings (arcs showing door opening direction). Each door swing should have a mark label nearby.
- WINDOW marks appear as text labels near window symbols on exterior walls (typically shown as parallel lines with glazing indication).
- LIGHTING FIXTURE marks appear as letters or codes inside or adjacent to fixture symbols on reflected ceiling plans (circles, rectangles, or specialty shapes representing light fixtures).
- PLUMBING FIXTURE marks appear as text labels near fixture locations (toilets, sinks, floor drains, etc.).
- EQUIPMENT marks appear as text labels inside or adjacent to equipment outlines.
- MECHANICAL EQUIPMENT marks appear near HVAC equipment symbols (rooftop units, air handlers, VAV boxes, etc.).

MARKS TO COUNT:
${sections}

INSTRUCTIONS:
- Count EVERY instance of each mark on the plan — look carefully across the entire drawing
- Each physical location with a mark counts as one instance
- If a mark appears multiple times on the plan, count each occurrence
- Return 0 for marks that do not appear on this plan
- Do NOT count marks that appear only in legends, schedules, or title blocks — only count marks placed on the actual floor plan

Return ONLY a JSON object grouped by schedule type:
{ "door": {"A": 5, "B": 3}, "window": {"W-1": 2}, "lighting-fixture": {"A": 12, "B": 8}, ... }

Include only the schedule types listed above. Use 0 for marks not found.${ocrSection}`;
}

// Helper: get CSI divisions relevant to a set of parsed schedules
export function getScheduleDivisions(scheduleTypes) {
  const divs = new Set();
  scheduleTypes.forEach(type => {
    const config = SCHEDULE_TYPES.find(t => t.id === type);
    if (config) config.csiDivisions.forEach(d => divs.add(d));
  });
  return [...divs].sort();
}
