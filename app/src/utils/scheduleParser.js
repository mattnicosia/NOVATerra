// ══════════════════════════════════════════════════════════════════════
// Schedule Parser — extracts structured data from PDF schedules
// Works from native PDF text extraction (no API calls needed)
// Handles: Wall Type Schedules, Door Schedules, Window Schedules,
//          Finish Schedules, Fixture Schedules, Equipment Schedules
// ══════════════════════════════════════════════════════════════════════

import { extractPageData, detectScheduleRegions } from './pdfExtractor';

// ══════════════════════════════════════════════════════════════════════
// TABLE STRUCTURE DETECTION
// Identifies rows and columns from extracted text positions
// ══════════════════════════════════════════════════════════════════════

/**
 * Group text items into table rows by Y-coordinate proximity
 * @param {Array} textItems - Extracted text items with x, y positions
 * @param {number} rowTolerance - Max Y-distance to be considered same row (px)
 * @returns {Array} Array of rows, each row is array of text items sorted by X
 */
function groupIntoRows(textItems, rowTolerance = 10) {
  if (!textItems || textItems.length === 0) return [];

  const sorted = [...textItems].sort((a, b) => a.y - b.y);
  const rows = [];
  let currentRow = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const rowY = currentRow.reduce((s, t) => s + t.y, 0) / currentRow.length;
    if (Math.abs(item.y - rowY) < rowTolerance) {
      currentRow.push(item);
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [item];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.x - b.x));

  return rows;
}

/**
 * Detect column boundaries from rows of text
 * Looks for consistent X-position clusters across multiple rows
 */
function detectColumns(rows, tolerance = 15) {
  // Collect all X positions
  const xPositions = [];
  rows.forEach(row => row.forEach(item => xPositions.push(item.x)));
  xPositions.sort((a, b) => a - b);

  // Cluster X positions
  const clusters = [];
  let clusterStart = xPositions[0];
  let clusterItems = [xPositions[0]];

  for (let i = 1; i < xPositions.length; i++) {
    const avg = clusterItems.reduce((s, v) => s + v, 0) / clusterItems.length;
    if (Math.abs(xPositions[i] - avg) < tolerance) {
      clusterItems.push(xPositions[i]);
    } else {
      clusters.push({
        x: clusterItems.reduce((s, v) => s + v, 0) / clusterItems.length,
        count: clusterItems.length,
      });
      clusterItems = [xPositions[i]];
    }
  }
  if (clusterItems.length > 0) {
    clusters.push({
      x: clusterItems.reduce((s, v) => s + v, 0) / clusterItems.length,
      count: clusterItems.length,
    });
  }

  // Filter to columns that appear in at least 30% of rows
  const minOccurrences = Math.max(2, rows.length * 0.3);
  return clusters.filter(c => c.count >= minOccurrences).map(c => c.x);
}

/**
 * Assign text items to columns
 */
function assignToColumns(row, columnPositions, tolerance = 25) {
  const cells = new Array(columnPositions.length).fill(null).map(() => []);

  for (const item of row) {
    let bestCol = 0;
    let bestDist = Infinity;
    for (let c = 0; c < columnPositions.length; c++) {
      const dist = Math.abs(item.x - columnPositions[c]);
      if (dist < bestDist) { bestDist = dist; bestCol = c; }
    }
    if (bestDist < tolerance) {
      cells[bestCol].push(item.text);
    }
  }

  return cells.map(cell => cell.join(" ").trim());
}

// ══════════════════════════════════════════════════════════════════════
// SCHEDULE TYPE DETECTION
// Identifies what kind of schedule a table region contains
// ══════════════════════════════════════════════════════════════════════

const SCHEDULE_PATTERNS = {
  wall: {
    titlePatterns: [/wall.*type/i, /wall.*schedule/i, /partition.*type/i, /partition.*schedule/i],
    headerPatterns: [/type/i, /description/i, /stud/i, /gauge/i, /height/i, /material/i, /finish/i, /gypsum/i, /drywall/i, /sheathing/i, /insulation/i],
    minHeaderMatches: 3,
  },
  door: {
    titlePatterns: [/door.*schedule/i, /door.*type/i],
    headerPatterns: [/mark/i, /type/i, /size/i, /width/i, /height/i, /material/i, /hardware/i, /frame/i, /fire.*rat/i, /finish/i],
    minHeaderMatches: 3,
  },
  window: {
    titlePatterns: [/window.*schedule/i, /window.*type/i, /glazing.*schedule/i],
    headerPatterns: [/mark/i, /type/i, /size/i, /width/i, /height/i, /glass/i, /glazing/i, /frame/i, /operation/i, /u-value/i],
    minHeaderMatches: 3,
  },
  finish: {
    titlePatterns: [/finish.*schedule/i, /room.*finish/i, /interior.*finish/i],
    headerPatterns: [/room/i, /floor/i, /wall/i, /ceiling/i, /base/i, /finish/i, /wainscot/i, /north/i, /south/i, /east/i, /west/i],
    minHeaderMatches: 3,
  },
  fixture: {
    titlePatterns: [/fixture.*schedule/i, /plumbing.*fixture/i, /lighting.*fixture/i, /light.*fixture/i],
    headerPatterns: [/type/i, /mark/i, /manufacturer/i, /model/i, /description/i, /quantity/i, /watts/i, /lamp/i, /voltage/i, /mounting/i],
    minHeaderMatches: 3,
  },
  equipment: {
    titlePatterns: [/equipment.*schedule/i, /mechanical.*equipment/i, /hvac.*schedule/i],
    headerPatterns: [/tag/i, /type/i, /manufacturer/i, /model/i, /capacity/i, /voltage/i, /hp/i, /cfm/i, /btu/i, /tonnage/i],
    minHeaderMatches: 3,
  },
};

/**
 * Detect schedule type from header row text
 */
function detectScheduleType(headerTexts, titleText = "") {
  // Check title first
  for (const [type, patterns] of Object.entries(SCHEDULE_PATTERNS)) {
    for (const pat of patterns.titlePatterns) {
      if (pat.test(titleText)) return type;
    }
  }

  // Check header row
  const combined = headerTexts.join(" ");
  let bestType = null;
  let bestScore = 0;

  for (const [type, patterns] of Object.entries(SCHEDULE_PATTERNS)) {
    let matches = 0;
    for (const pat of patterns.headerPatterns) {
      if (pat.test(combined)) matches++;
    }
    if (matches >= patterns.minHeaderMatches && matches > bestScore) {
      bestScore = matches;
      bestType = type;
    }
  }

  return bestType;
}

// ══════════════════════════════════════════════════════════════════════
// WALL SCHEDULE PARSER
// Extracts wall type specifications from detected wall schedules
// ══════════════════════════════════════════════════════════════════════

const STUD_SIZES = ["1-5/8", "2-1/2", "3-5/8", "4", "6", "8", "10"];
const GAUGES = ["25", "22", "20", "18", "16", "14", "12"];
const WOOD_SIZES = ["2x4", "2x6", "2x8", "2x10", "2x12"];
const SPACINGS = ["12", "16", "24"];

function parseWallScheduleRow(cells, headers) {
  const wallType = {};

  // Map header names to cell indices
  const headerMap = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (/type|mark|designat/i.test(hl)) headerMap.type = i;
    if (/desc/i.test(hl)) headerMap.description = i;
    if (/stud.*size|depth/i.test(hl)) headerMap.studSize = i;
    if (/gauge|ga\b/i.test(hl)) headerMap.gauge = i;
    if (/height|ht\b/i.test(hl)) headerMap.height = i;
    if (/material/i.test(hl)) headerMap.material = i;
    if (/spac/i.test(hl)) headerMap.spacing = i;
    if (/finish.*1|int.*finish|gypsum.*1|one.*side|side.*1/i.test(hl)) headerMap.finishInt = i;
    if (/finish.*2|ext.*finish|gypsum.*2|other.*side|side.*2/i.test(hl)) headerMap.finishExt = i;
    if (/insul/i.test(hl)) headerMap.insulation = i;
    if (/sheath/i.test(hl)) headerMap.sheathing = i;
    if (/fire|rat/i.test(hl)) headerMap.fireRating = i;
    if (/stc|sound/i.test(hl)) headerMap.stc = i;
  });

  // Extract type label (required)
  const typeCell = cells[headerMap.type ?? 0] || "";
  if (!typeCell.trim()) return null;
  wallType.typeLabel = typeCell.trim();

  // Description
  wallType.description = (cells[headerMap.description] || "").trim();

  // Determine material from description or material column
  const materialText = (cells[headerMap.material] || wallType.description || "").toLowerCase();
  if (/metal.*stud|mtl.*stud|light.*gauge|cold.*form/i.test(materialText)) {
    wallType.material = "Metal Stud";
  } else if (/wood|timber|lumber/i.test(materialText)) {
    wallType.material = "Wood";
  } else if (/cmu|block|masonry/i.test(materialText)) {
    wallType.material = "CMU";
  } else if (/concrete|cast.*in.*place|cip/i.test(materialText)) {
    wallType.material = "Concrete";
  } else if (/icf/i.test(materialText)) {
    wallType.material = "ICF";
  } else if (/sip/i.test(materialText)) {
    wallType.material = "SIP";
  } else {
    wallType.material = "Metal Stud"; // Default for commercial
  }

  // Category (interior vs exterior)
  const fullText = cells.join(" ").toLowerCase();
  wallType.category = /ext|extr|outside|perimeter/i.test(fullText) ? "exterior" : "interior";

  // Stud size
  const studText = cells[headerMap.studSize] || fullText;
  for (const size of STUD_SIZES) {
    if (studText.includes(size) || studText.includes(size.replace("-", " "))) {
      if (wallType.material === "Metal Stud") wallType.MSStudSize = `${size}"`;
      else wallType.studSize = size;
      break;
    }
  }
  for (const size of WOOD_SIZES) {
    if (studText.includes(size)) { wallType.studSize = size; wallType.material = "Wood"; break; }
  }

  // Gauge
  const gaugeText = cells[headerMap.gauge] || fullText;
  for (const ga of GAUGES) {
    if (new RegExp(`\\b${ga}\\s*ga`, "i").test(gaugeText)) {
      wallType.MSGauge = `${ga} ga`;
      break;
    }
  }

  // Spacing
  const spacingText = cells[headerMap.spacing] || fullText;
  for (const sp of SPACINGS) {
    if (new RegExp(`\\b${sp}"?\\s*o\\.?c\\.?`, "i").test(spacingText) || new RegExp(`\\b${sp}"?\\s*oc\\b`, "i").test(spacingText)) {
      wallType.spacing = `${sp}" O.C.`;
      break;
    }
  }

  // Height
  const heightText = cells[headerMap.height] || "";
  const htMatch = heightText.match(/(\d+)['']?\s*[-–]?\s*(\d+)?/);
  if (htMatch) wallType.wallHeight = parseInt(htMatch[1]);

  // Fire rating
  const fireText = cells[headerMap.fireRating] || "";
  if (/\d.*hr/i.test(fireText)) wallType.fireRating = fireText.trim();

  // STC rating
  const stcText = cells[headerMap.stc] || "";
  const stcMatch = stcText.match(/(\d+)/);
  if (stcMatch) wallType.stcRating = parseInt(stcMatch[1]);

  // Insulation
  const insulText = cells[headerMap.insulation] || "";
  if (insulText.trim()) wallType.insulation = insulText.trim();

  // Confidence based on how much data we extracted
  const specCount = Object.keys(wallType).filter(k => !["typeLabel", "description", "category", "material"].includes(k)).length;
  wallType.confidence = specCount >= 4 ? "high" : specCount >= 2 ? "medium" : "low";

  return wallType;
}

// ══════════════════════════════════════════════════════════════════════
// DOOR SCHEDULE PARSER
// ══════════════════════════════════════════════════════════════════════

function parseDoorScheduleRow(cells, headers) {
  const door = {};

  const headerMap = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (/mark|no\.|number/i.test(hl)) headerMap.mark = i;
    if (/type/i.test(hl)) headerMap.type = i;
    if (/width|wd\b/i.test(hl)) headerMap.width = i;
    if (/height|ht\b/i.test(hl)) headerMap.height = i;
    if (/size/i.test(hl)) headerMap.size = i;
    if (/material/i.test(hl)) headerMap.material = i;
    if (/hardware|hdw|hw\b/i.test(hl)) headerMap.hardware = i;
    if (/frame/i.test(hl)) headerMap.frame = i;
    if (/fire|rat/i.test(hl)) headerMap.fire = i;
    if (/finish/i.test(hl)) headerMap.finish = i;
    if (/room|loc/i.test(hl)) headerMap.room = i;
    if (/remarks|notes/i.test(hl)) headerMap.notes = i;
  });

  door.mark = (cells[headerMap.mark ?? 0] || "").trim();
  if (!door.mark) return null;

  door.type = (cells[headerMap.type] || "").trim();
  door.material = (cells[headerMap.material] || "").trim();

  // Parse size
  const sizeText = cells[headerMap.size] || "";
  const sizeMatch = sizeText.match(/(\d+)['-]\s*(\d+)?['""]?\s*[xX×]\s*(\d+)['-]\s*(\d+)?/);
  if (sizeMatch) {
    door.width = `${sizeMatch[1]}'${sizeMatch[2] ? `-${sizeMatch[2]}"` : ""}`;
    door.height = `${sizeMatch[3]}'${sizeMatch[4] ? `-${sizeMatch[4]}"` : ""}`;
  } else {
    door.width = (cells[headerMap.width] || "").trim();
    door.height = (cells[headerMap.height] || "").trim();
  }

  door.hardware = (cells[headerMap.hardware] || "").trim();
  door.frame = (cells[headerMap.frame] || "").trim();
  door.fireRating = (cells[headerMap.fire] || "").trim();
  door.finish = (cells[headerMap.finish] || "").trim();
  door.room = (cells[headerMap.room] || "").trim();
  door.notes = (cells[headerMap.notes] || "").trim();

  return door;
}

// ══════════════════════════════════════════════════════════════════════
// WINDOW SCHEDULE PARSER
// ══════════════════════════════════════════════════════════════════════

function parseWindowScheduleRow(cells, headers) {
  const win = {};

  const headerMap = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (/mark|no\.|number/i.test(hl)) headerMap.mark = i;
    if (/type/i.test(hl)) headerMap.type = i;
    if (/width|wd\b/i.test(hl)) headerMap.width = i;
    if (/height|ht\b/i.test(hl)) headerMap.height = i;
    if (/size/i.test(hl)) headerMap.size = i;
    if (/glass|glazing/i.test(hl)) headerMap.glass = i;
    if (/frame/i.test(hl)) headerMap.frame = i;
    if (/oper/i.test(hl)) headerMap.operation = i;
    if (/u.val/i.test(hl)) headerMap.uValue = i;
    if (/remarks|notes/i.test(hl)) headerMap.notes = i;
  });

  win.mark = (cells[headerMap.mark ?? 0] || "").trim();
  if (!win.mark) return null;

  win.type = (cells[headerMap.type] || "").trim();
  win.width = (cells[headerMap.width] || "").trim();
  win.height = (cells[headerMap.height] || "").trim();
  win.glass = (cells[headerMap.glass] || "").trim();
  win.frame = (cells[headerMap.frame] || "").trim();
  win.operation = (cells[headerMap.operation] || "").trim();
  win.uValue = (cells[headerMap.uValue] || "").trim();
  win.notes = (cells[headerMap.notes] || "").trim();

  return win;
}

// ══════════════════════════════════════════════════════════════════════
// FINISH SCHEDULE PARSER
// ══════════════════════════════════════════════════════════════════════

function parseFinishScheduleRow(cells, headers) {
  const finish = {};

  const headerMap = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase();
    if (/room.*no|room.*#|no\./i.test(hl)) headerMap.roomNo = i;
    if (/room.*name|room\b/i.test(hl) && !/no|#/.test(hl)) headerMap.roomName = i;
    if (/floor.*finish|floor\b/i.test(hl) && !/base/.test(hl)) headerMap.floor = i;
    if (/base/i.test(hl)) headerMap.base = i;
    if (/wall.*finish|wall\b/i.test(hl) && !/wainscot/.test(hl)) headerMap.wall = i;
    if (/wainscot/i.test(hl)) headerMap.wainscot = i;
    if (/ceil.*finish|ceil/i.test(hl)) headerMap.ceiling = i;
    if (/remarks|notes/i.test(hl)) headerMap.notes = i;
  });

  finish.roomNo = (cells[headerMap.roomNo ?? 0] || "").trim();
  finish.roomName = (cells[headerMap.roomName] || "").trim();
  if (!finish.roomNo && !finish.roomName) return null;

  finish.floor = (cells[headerMap.floor] || "").trim();
  finish.base = (cells[headerMap.base] || "").trim();
  finish.wall = (cells[headerMap.wall] || "").trim();
  finish.wainscot = (cells[headerMap.wainscot] || "").trim();
  finish.ceiling = (cells[headerMap.ceiling] || "").trim();
  finish.notes = (cells[headerMap.notes] || "").trim();

  return finish;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN SCHEDULE EXTRACTION
// ══════════════════════════════════════════════════════════════════════

/**
 * Extract all schedules from a drawing's PDF data
 * @param {Object} drawing - Drawing object with PDF data
 * @returns {Array} Array of detected schedules with parsed data
 */
export async function extractSchedules(drawing) {
  if (!drawing || drawing.type !== "pdf") return [];
  if (!drawing.data && !drawing.pdfRawBase64) return [];

  const pageData = await extractPageData(drawing);
  if (!pageData?.text || pageData.text.length === 0) return [];

  const scheduleRegions = detectScheduleRegions(pageData);
  if (scheduleRegions.length === 0) return [];

  const schedules = [];

  for (const region of scheduleRegions) {
    // Get text items within this region
    const regionItems = pageData.text.filter(t =>
      t.x >= region.minX && t.x <= region.maxX &&
      t.y >= region.minY && t.y <= region.maxY
    );

    if (regionItems.length < 6) continue; // Too few items for a schedule

    // Group into rows
    const rows = groupIntoRows(regionItems, 10);
    if (rows.length < 3) continue; // Need at least header + 2 data rows

    // Find the title row (usually first row or a row with large/bold text)
    let titleRow = 0;
    let titleText = "";
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const rowText = rows[i].map(t => t.text).join(" ");
      if (/schedule|legend|types/i.test(rowText)) {
        titleRow = i;
        titleText = rowText;
        break;
      }
    }

    // Header row is usually right after title
    let headerRowIdx = titleRow + 1;
    if (headerRowIdx >= rows.length) continue;

    // Detect columns from header + data rows
    const dataRows = rows.slice(headerRowIdx);
    const columnPositions = detectColumns(dataRows);
    if (columnPositions.length < 2) continue;

    // Extract header texts
    const headerCells = assignToColumns(dataRows[0], columnPositions);

    // Detect schedule type
    const schedType = detectScheduleType(headerCells, titleText);
    if (!schedType) continue; // Unknown schedule type

    // Parse data rows (skip header)
    const parsedRows = [];
    for (let i = 1; i < dataRows.length; i++) {
      const cells = assignToColumns(dataRows[i], columnPositions);
      if (cells.every(c => !c.trim())) continue; // Skip empty rows

      let parsed = null;
      switch (schedType) {
        case "wall":
          parsed = parseWallScheduleRow(cells, headerCells);
          break;
        case "door":
          parsed = parseDoorScheduleRow(cells, headerCells);
          break;
        case "window":
          parsed = parseWindowScheduleRow(cells, headerCells);
          break;
        case "finish":
          parsed = parseFinishScheduleRow(cells, headerCells);
          break;
        default:
          // Generic: just store cells with header keys
          parsed = {};
          headerCells.forEach((h, idx) => {
            if (h && cells[idx]) parsed[h.toLowerCase().replace(/\s+/g, "_")] = cells[idx];
          });
          if (Object.keys(parsed).length === 0) parsed = null;
      }

      if (parsed) parsedRows.push(parsed);
    }

    if (parsedRows.length > 0) {
      schedules.push({
        type: schedType,
        title: titleText || `${schedType.charAt(0).toUpperCase() + schedType.slice(1)} Schedule`,
        region,
        headers: headerCells,
        data: parsedRows,
        itemCount: parsedRows.length,
      });
    }
  }

  return schedules;
}

/**
 * Extract wall type schedules specifically
 * Convenience method for wall-focused workflows
 */
export async function extractWallSchedule(drawing) {
  const schedules = await extractSchedules(drawing);
  return schedules.filter(s => s.type === "wall");
}

/**
 * Map parsed wall types to module spec format
 * Returns objects ready to populate wall module instances
 */
export function mapWallTypesToModuleSpecs(wallTypes) {
  return wallTypes.map(wt => {
    const specs = {};
    const label = wt.typeLabel || "?";

    // Material
    if (wt.material) specs.Material = wt.material;

    // Metal Stud specifics
    if (wt.material === "Metal Stud") {
      if (wt.MSStudSize) specs.MSStudSize = wt.MSStudSize;
      if (wt.MSGauge) specs.MSGauge = wt.MSGauge;
      if (wt.spacing) specs.MSSpacing = wt.spacing;
    }

    // Wood specifics
    if (wt.material === "Wood") {
      if (wt.studSize) specs.StudSize = wt.studSize;
      if (wt.spacing) specs.PlanSpacing = wt.spacing;
    }

    // CMU specifics
    if (wt.material === "CMU") {
      // Default to 8" if not specified
      specs.CMUWidth = '8"';
    }

    // Height
    if (wt.wallHeight) specs.WallHeight = String(wt.wallHeight);

    // Insulation
    if (wt.insulation) specs.Insulation = wt.insulation;

    return {
      label: `${label}${wt.description ? ` — ${wt.description}` : ""}`,
      wallType: wt,
      specs,
      confidence: wt.confidence || "medium",
      warnings: [],
    };
  });
}

/**
 * Scan all project drawings for schedules
 * Returns a comprehensive schedule summary
 */
export async function scanAllDrawingsForSchedules(drawings) {
  const allSchedules = [];

  for (const drawing of drawings) {
    if (drawing.type !== "pdf") continue;
    if (!drawing.data && !drawing.pdfRawBase64) continue;

    try {
      const schedules = await extractSchedules(drawing);
      schedules.forEach(sched => {
        allSchedules.push({
          ...sched,
          drawingId: drawing.id,
          sheetNumber: drawing.sheetNumber || drawing.pageNumber || "?",
          sheetTitle: drawing.sheetTitle || drawing.label || "Untitled",
        });
      });
    } catch (err) {
      console.warn(`Schedule scan failed for ${drawing.id}:`, err);
    }
  }

  return allSchedules;
}
