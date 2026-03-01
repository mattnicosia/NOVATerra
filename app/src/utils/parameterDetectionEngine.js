// ═══════════════════════════════════════════════════════════════════════════════
// Parameter Detection Engine — Multi-signal building parameter detection
// Wires together geometry engine, schedule parsing, door schedule inference,
// AI vision, and targeted AI room verification into a unified evidence system.
//
// Phase A: Geometry Engine (0 API calls) — detects rooms from PDF vectors
// Phase B: Door Schedule Inference (0 API calls) — infers rooms from door widths
// Phase C: Schedule Extraction (0 API calls) — wraps existing schedule evidence
// Phase D: Expanded AI Vision (1-2 API calls) — all floor plans at 2000px
// Phase E: Targeted AI Verification (0-3 API calls) — cropped 600px room views
// ═══════════════════════════════════════════════════════════════════════════════

import { useDrawingsStore } from '@/stores/drawingsStore';
import { useProjectStore } from '@/stores/projectStore';
import { analyzeDrawingGeometry } from '@/utils/geometryEngine';
import { callAnthropic, optimizeImageForAI, imageBlock, cropImageRegion } from '@/utils/ai';
import { renderPdfPage } from '@/utils/drawingUtils';
import { ensureDrawingImage } from '@/utils/outlineDetector';

// ── Source weights — reliability of each detection source ──
const SOURCE_WEIGHTS = {
  geometry:       1.00,  // Rooms are physically enclosed — geometry can't hallucinate walls
  schedule:       0.95,  // Finish/plumbing schedules are architect-authored data
  'ai-targeted':  0.85,  // Zoomed 600px crops of individual rooms — fixture symbols visible
  'ai-vision':    0.70,  // Full-sheet 2000px analysis — decent but misses small fixtures
  'door-inference': 0.50, // Heuristic from door widths — supplementary signal
};

// ── Room classification regex — shared patterns ──
const ROOM_PATTERNS = {
  bathrooms:  /\b(bath|bathroom|restroom|toilet|lavatory|wc|washroom|powder|ensuite|en-suite|half\s*bath)\b/i,
  kitchens:   /\b(kitchen|kitchenette|pantry|kit)\b/i,
  staircases: /\b(stair|stairs|staircase|stairwell|stairway)\b/i,
  offices:    /\b(office|exec\b|director|manager|workspace|study|den)\b/i,
  storageRooms: /\b(storage|utility|janitor|mechanical|electrical\s*room|mech|closet|laundry|mud\s*room|garage)\b/i,
  conferenceRooms: /\b(conference|meeting|board\s*room|huddle)\b/i,
  breakRooms: /\b(break\s*room|lounge|lunchroom|cafeteria)\b/i,
  lobbies:    /\b(lobby|reception|entry|foyer|vestibule|atrium)\b/i,
  serverRooms: /\b(server|it\s*room|data|telecom|mdf|idf)\b/i,
  elevators:  /\b(elevator|elev|lift)\b/i,
  residentialUnits: /\b(unit|apt|apartment|suite|bedroom)\b/i,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full multi-signal parameter detection pipeline.
 * Called from scanRunner after schedule parsing.
 *
 * @param {Object} options
 * @param {Array} options.parsedSchedules — Validated schedules from Phase 2
 * @param {Object} options.scheduleEvidence — Output of extractBuildingParamsFromSchedules()
 * @param {Function} options.onProgress — Progress callback (phase, message)
 * @returns {{ parameters: Object, evidence: Array, confidence: Object, timing: Object }}
 */
export async function runParameterDetection({ parsedSchedules = [], scheduleEvidence = null, onProgress } = {}) {
  const timing = { start: Date.now() };
  const allEvidence = [];

  // Find all floor plan drawings
  const allDrawings = useDrawingsStore.getState().drawings.filter(d => d.data);
  const planPatterns = [/floor\s*plan/i, /main\s*(level|floor)/i, /first\s*floor/i, /1st\s*floor/i, /ground\s*(floor|plan)/i, /plan\s*view/i, /\b[Aa]\d{3}\b/];
  const floorPlans = allDrawings.filter(d => {
    const label = `${d.sheetTitle || ""} ${d.label || ""} ${d.sheetNumber || ""}`;
    return planPatterns.some(p => p.test(label));
  });
  // Fallback: sheets with "plan" that aren't site/roof/framing etc.
  if (floorPlans.length === 0) {
    const fallback = allDrawings.filter(d => d.data && /\bplan\b/i.test(d.sheetTitle || "")
      && !/\b(site|roof|framing|foundation|reflected|ceiling|demolition)\b/i.test(d.sheetTitle || ""));
    floorPlans.push(...fallback);
  }

  // Track unclassified rooms for Phase E
  let unclassifiedRooms = [];
  const drawingDataMap = new Map(); // drawingId → { imgData, width, height }

  // ── Phase A: Geometry Engine ──
  timing.phaseA = Date.now();
  onProgress?.('geometry', 'Detecting rooms from drawing vectors...');
  try {
    const geoEvidence = await detectRoomsFromGeometry(floorPlans);
    allEvidence.push(...geoEvidence.evidence);
    unclassifiedRooms = geoEvidence.unclassifiedRooms;
  } catch (err) {
    console.warn('[DetectionEngine] Phase A (geometry) failed:', err.message);
  }
  timing.phaseA = Date.now() - timing.phaseA;

  // ── Phase B: Door Schedule Inference ──
  timing.phaseB = Date.now();
  onProgress?.('door-inference', 'Inferring rooms from door schedules...');
  try {
    const doorSchedules = parsedSchedules.filter(s => s.type === 'door');
    if (doorSchedules.length > 0) {
      const doorEvidence = inferRoomsFromDoorSchedule(doorSchedules);
      allEvidence.push(...doorEvidence);
    }
  } catch (err) {
    console.warn('[DetectionEngine] Phase B (door inference) failed:', err.message);
  }
  timing.phaseB = Date.now() - timing.phaseB;

  // ── Phase C: Schedule Extraction Evidence ──
  timing.phaseC = Date.now();
  onProgress?.('schedules', 'Processing schedule data...');
  try {
    if (scheduleEvidence) {
      const schedEvidence = wrapScheduleEvidence(scheduleEvidence);
      allEvidence.push(...schedEvidence);
    }
  } catch (err) {
    console.warn('[DetectionEngine] Phase C (schedule wrap) failed:', err.message);
  }
  timing.phaseC = Date.now() - timing.phaseC;

  // ── Phase D: Expanded AI Vision ──
  timing.phaseD = Date.now();
  if (floorPlans.length > 0) {
    onProgress?.('ai-vision', `Analyzing ${floorPlans.length} floor plans with AI...`);
    try {
      const { evidence, imageMap } = await expandedAIAnalysis(floorPlans, allEvidence);
      allEvidence.push(...evidence);
      // Store image data for Phase E
      for (const [id, data] of imageMap.entries()) {
        drawingDataMap.set(id, data);
      }
    } catch (err) {
      console.warn('[DetectionEngine] Phase D (AI vision) failed:', err.message);
    }
  }
  timing.phaseD = Date.now() - timing.phaseD;

  // ── Phase E: Targeted AI Verification ──
  timing.phaseE = Date.now();
  if (unclassifiedRooms.length > 0 && drawingDataMap.size > 0) {
    onProgress?.('ai-targeted', `Verifying ${unclassifiedRooms.length} unclassified rooms...`);
    try {
      const targetedEvidence = await targetedAIVerification(unclassifiedRooms, drawingDataMap);
      allEvidence.push(...targetedEvidence);
    } catch (err) {
      console.warn('[DetectionEngine] Phase E (targeted AI) failed:', err.message);
    }
  }
  timing.phaseE = Date.now() - timing.phaseE;

  // ── Merge all evidence ──
  onProgress?.('merge', 'Merging detection results...');
  const correctionFactors = {}; // Will be populated from scanStore if available
  const { parameters, confidence } = mergeEvidence(allEvidence, correctionFactors);

  timing.total = Date.now() - timing.start;

  console.log(`[DetectionEngine] Complete in ${timing.total}ms — ${allEvidence.length} evidence items, ${Object.keys(parameters).length} parameters detected`);

  return { parameters, evidence: allEvidence, confidence, timing };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE A: Geometry Engine — detect rooms from PDF vector data
// ═══════════════════════════════════════════════════════════════════════════════

async function detectRoomsFromGeometry(floorPlanDrawings) {
  const evidence = [];
  const unclassifiedRooms = [];

  for (const drawing of floorPlanDrawings) {
    // Only vector PDFs can be analyzed by geometry engine
    if (drawing.type !== 'pdf') continue;

    try {
      const geoResult = await analyzeDrawingGeometry(drawing);
      if (!geoResult?.rooms?.length) continue;

      console.log(`[DetectionEngine:GeoA] ${drawing.sheetTitle || drawing.id}: found ${geoResult.rooms.length} rooms, ${geoResult.roomLabels?.length || 0} labels`);

      // Classify each room using labels
      const roomCounts = {};
      for (const room of geoResult.rooms) {
        // Find the label associated with this room
        const labelAssoc = geoResult.roomLabels?.find(rl => rl.roomId === room.id);
        const label = labelAssoc?.label || '';

        let classified = false;
        for (const [roomType, pattern] of Object.entries(ROOM_PATTERNS)) {
          if (pattern.test(label)) {
            roomCounts[roomType] = (roomCounts[roomType] || 0) + 1;
            classified = true;
            break;
          }
        }

        if (!classified && label) {
          // Room has a label but didn't match any pattern
          unclassifiedRooms.push({
            roomId: room.id,
            drawingId: drawing.id,
            label,
            polygon: room.polygon,
            centroid: room.centroid,
            area: room.area,
          });
        } else if (!classified && !label) {
          // Room detected by geometry but has no label at all
          unclassifiedRooms.push({
            roomId: room.id,
            drawingId: drawing.id,
            label: '',
            polygon: room.polygon,
            centroid: room.centroid,
            area: room.area,
          });
        }
      }

      // Add evidence for each detected room type
      for (const [roomType, count] of Object.entries(roomCounts)) {
        evidence.push({
          source: 'geometry',
          paramPath: `roomCounts.${roomType}`,
          value: count,
          confidence: 0.90,
          drawingId: drawing.id,
          detail: `Geometry engine detected ${count} ${roomType} from enclosed room polygons + labels`,
        });
      }

      // Total room count evidence (useful for validation)
      evidence.push({
        source: 'geometry',
        paramPath: '_totalRooms',
        value: geoResult.rooms.length,
        confidence: 0.85,
        drawingId: drawing.id,
        detail: `${geoResult.rooms.length} enclosed rooms detected from wall graph`,
      });
    } catch (err) {
      console.warn(`[DetectionEngine:GeoA] Failed for ${drawing.id}:`, err.message);
    }
  }

  return { evidence, unclassifiedRooms };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE B: Door Schedule Inference — infer rooms from door widths
// ═══════════════════════════════════════════════════════════════════════════════

function inferRoomsFromDoorSchedule(doorSchedules) {
  const evidence = [];
  const roomCounts = {};

  for (const schedule of doorSchedules) {
    if (!schedule.entries) continue;

    for (const entry of schedule.entries) {
      // First check if door schedule includes room names
      const room = (entry.room || entry.notes || '').toLowerCase();
      if (room) {
        for (const [roomType, pattern] of Object.entries(ROOM_PATTERNS)) {
          if (pattern.test(room)) {
            roomCounts[roomType] = (roomCounts[roomType] || 0) + 1;
            break; // each door contributes to one room type
          }
        }
      }

      // Width-based inference
      const widthInches = parseDoorWidth(entry.width);
      if (widthInches > 0 && !room) {
        // 2'0"-2'4" (24-28") → closets/storage
        if (widthInches >= 24 && widthInches <= 28) {
          roomCounts.storageRooms = (roomCounts.storageRooms || 0) + 1;
        }
        // 2'6"-2'8" (30-32") → bathrooms (standard bathroom door)
        else if (widthInches >= 30 && widthInches <= 32) {
          roomCounts.bathrooms = (roomCounts.bathrooms || 0) + 1;
        }
      }

      // Fire-rated doors → stairwells
      const fireRating = (entry.fire_rating || entry.notes || '').toLowerCase();
      if (/90\s*min|1\.?5\s*hr|2\s*hr|120\s*min/i.test(fireRating)) {
        roomCounts.staircases = (roomCounts.staircases || 0) + 1;
      }
    }
  }

  // Deduplicate: bathroom doors of the same width likely lead to different bathrooms,
  // but fire-rated doors might lead to the same stairwell from different floors
  if (roomCounts.staircases > 2) {
    // More than 2 fire-rated doors likely serve the same stairwell(s)
    roomCounts.staircases = Math.ceil(roomCounts.staircases / 2);
  }

  for (const [roomType, count] of Object.entries(roomCounts)) {
    evidence.push({
      source: 'door-inference',
      paramPath: `roomCounts.${roomType}`,
      value: count,
      confidence: 0.55,
      detail: `Door schedule width/fire-rating inference: ${count} ${roomType}`,
    });
  }

  return evidence;
}

/**
 * Parse door width string to inches.
 * Handles: "3'-0\"", "36\"", "2'8\"", "3'-0", "2'-8\"", "30"
 */
function parseDoorWidth(widthStr) {
  if (!widthStr) return 0;
  const str = String(widthStr).trim();

  // Feet and inches: 3'-0", 2'8", 2'-8"
  const ftInMatch = str.match(/(\d+)\s*['']\s*-?\s*(\d+)/);
  if (ftInMatch) return parseInt(ftInMatch[1]) * 12 + parseInt(ftInMatch[2]);

  // Just inches: 36", 30
  const inMatch = str.match(/^(\d+)\s*"?\s*$/);
  if (inMatch) {
    const val = parseInt(inMatch[1]);
    return val > 12 ? val : val * 12; // if < 12, assume feet
  }

  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE C: Schedule Evidence — wrap existing schedule extraction
// ═══════════════════════════════════════════════════════════════════════════════

function wrapScheduleEvidence(scheduleResult) {
  const evidence = [];

  if (scheduleResult.roomCounts) {
    for (const [roomType, count] of Object.entries(scheduleResult.roomCounts)) {
      if (count > 0) {
        evidence.push({
          source: 'schedule',
          paramPath: `roomCounts.${roomType}`,
          value: count,
          confidence: 0.90,
          detail: `Schedule extraction (finish/plumbing): ${count} ${roomType}`,
        });
      }
    }
  }

  if (scheduleResult.floorCount > 0) {
    evidence.push({
      source: 'schedule',
      paramPath: 'floorCount',
      value: scheduleResult.floorCount,
      confidence: 0.85,
      detail: `Floor count from schedule room names: ${scheduleResult.floorCount}`,
    });
  }

  return evidence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE D: Expanded AI Vision — analyze ALL floor plans at 2000px
// ═══════════════════════════════════════════════════════════════════════════════

async function expandedAIAnalysis(floorPlanDrawings, existingEvidence) {
  const evidence = [];
  const imageMap = new Map();

  // Prepare images — render all floor plans
  const imageContents = [];
  for (const d of floorPlanDrawings) {
    try {
      let imgData;
      const curCanvases = useDrawingsStore.getState().pdfCanvases;
      if (d.type === "pdf") {
        imgData = curCanvases[d.id] || await renderPdfPage(d);
      } else {
        imgData = d.data;
      }
      if (!imgData) continue;

      const optimized = await optimizeImageForAI(imgData, 2000);
      imageContents.push({
        drawingId: d.id,
        label: d.sheetTitle || d.label || d.sheetNumber || 'Floor Plan',
        base64: optimized.base64,
        width: optimized.width,
        height: optimized.height,
      });

      // Store for Phase E cropping
      imageMap.set(d.id, {
        imgData,
        base64: optimized.base64,
        width: optimized.width,
        height: optimized.height,
      });
    } catch (err) {
      console.warn(`[DetectionEngine:AID] Image prep failed for ${d.id}:`, err.message);
    }
  }

  if (imageContents.length === 0) return { evidence, imageMap };

  // Build context from existing evidence
  const existingSummary = summarizeEvidence(existingEvidence);

  // Batch: 4 images per API call
  const BATCH_SIZE = 4;
  for (let i = 0; i < imageContents.length; i += BATCH_SIZE) {
    const batch = imageContents.slice(i, i + BATCH_SIZE);

    const content = [];
    for (const img of batch) {
      content.push(imageBlock(img.base64));
      content.push({ type: 'text', text: `(Sheet: ${img.label})` });
    }

    const prompt = buildAIVisionPrompt(existingSummary);
    content.push({ type: 'text', text: prompt });

    try {
      const result = await callAnthropic({
        max_tokens: 1200,
        messages: [{ role: 'user', content }],
        temperature: 0,
      });

      const parsed = parseAIVisionResponse(result);
      if (parsed) {
        // Add evidence for floor count
        if (parsed.floors) {
          evidence.push({
            source: 'ai-vision',
            paramPath: 'floorCount',
            value: Math.floor(parsed.floors),
            confidence: 0.70,
            detail: `AI vision: ${parsed.floors} floors detected`,
          });
        }

        // Basement
        if (parsed.hasBasement) {
          evidence.push({
            source: 'ai-vision',
            paramPath: 'basementCount',
            value: 1,
            confidence: 0.65,
            detail: 'AI vision: basement level detected',
          });
        }

        // Has loft
        if (parsed.hasLoft) {
          evidence.push({
            source: 'ai-vision',
            paramPath: '_hasLoft',
            value: true,
            confidence: 0.70,
            detail: 'AI vision: loft detected',
          });
        }

        // Room counts
        if (parsed.rooms) {
          const roomMap = {
            bathrooms: 'bathrooms', kitchens: 'kitchens', staircases: 'staircases',
            offices: 'offices', storageRooms: 'storageRooms', elevators: 'elevators',
            lobbies: 'lobbies', serverRooms: 'serverRooms', conferenceRooms: 'conferenceRooms',
            breakRooms: 'breakRooms', residentialUnits: 'residentialUnits',
            parkingSpaces: 'parkingSpaces', garageSpaces: 'parkingSpaces',
            laundryRooms: 'storageRooms',
          };
          for (const [aiKey, count] of Object.entries(parsed.rooms)) {
            if (!count || count <= 0) continue;
            const storeKey = roomMap[aiKey] || aiKey;
            evidence.push({
              source: 'ai-vision',
              paramPath: `roomCounts.${storeKey}`,
              value: count,
              confidence: parsed.roomConfidence?.[aiKey] || 0.70,
              detail: `AI vision: ${count} ${aiKey} detected from floor plan imagery`,
            });
          }
        }

        // Building type
        if (parsed.buildingType) {
          evidence.push({
            source: 'ai-vision',
            paramPath: 'buildingType',
            value: parsed.buildingType,
            confidence: 0.75,
            detail: `AI vision: building type = ${parsed.buildingType}`,
          });
        }

        // Features
        if (parsed.features?.length) {
          evidence.push({
            source: 'ai-vision',
            paramPath: '_features',
            value: parsed.features,
            confidence: 0.65,
            detail: `AI vision: features = ${parsed.features.join(', ')}`,
          });
        }
      }
    } catch (err) {
      console.warn(`[DetectionEngine:AID] AI vision batch ${i / BATCH_SIZE + 1} failed:`, err.message);
    }
  }

  return { evidence, imageMap };
}

function buildAIVisionPrompt(existingSummary) {
  let contextNote = '';
  if (existingSummary) {
    contextNote = `\nCONTEXT FROM OTHER DETECTION METHODS:\n${existingSummary}\nFocus on what these methods may have MISSED. If you agree with existing counts, confirm them. If you see more, report the higher number.\n`;
  }

  return `You are analyzing construction floor plan drawings. Identify rooms by their ARCHITECTURAL SYMBOLS AND FIXTURES, not just labels.
${contextNote}
1. **Floor count**: How many above-grade floors? Count ONLY actual living/occupiable floors. A loft = 0.5. Do NOT count roof, attic, crawl space, section views, or elevation views.
2. **Basement**: Is there a below-grade habitable/utility level shown as its own floor plan? (true/false). Foundation plans and crawl spaces are NOT basements.
3. **Room counts**: Identify rooms by their fixture symbols and spatial patterns:

   BATHROOMS — look for ANY of these fixture symbols:
   • Toilet/WC (oval or rounded rectangle against wall)
   • Bathtub (5' rectangle, usually against wall)
   • Shower (square/rectangle with diagonal lines, drain dot, or shower head symbol)
   • Lavatory/sink (small oval or rectangle on countertop or pedestal)
   → Any enclosed or semi-enclosed space with a toilet = 1 bathroom. Count EACH separately.
   → A half bath/powder room has only toilet + sink (no tub/shower). Still counts as 1 bathroom.

   KITCHENS — look for ANY of these patterns:
   • Counter/cabinet runs (L-shaped or U-shaped lines along walls with sink symbol)
   • Appliance symbols: range/oven (rectangle with burner circles), refrigerator (rectangle), dishwasher (rectangle next to sink)
   • Kitchen sink (typically larger than lavatory, set in counter run)
   → In open floor plans, the kitchen area shares space with living/dining — still count 1 kitchen if appliance/cabinet symbols exist.

   STAIRCASES — look for:
   • Parallel lines (treads/risers) in a narrow rectangular zone
   • Arrow indicating "UP" or "DN" direction
   • Break line (diagonal or zigzag) indicating continuation to another floor
   → A staircase may appear on multiple floor plans — count the PHYSICAL staircase once, not per floor.

   LAUNDRY — look for:
   • Washer/dryer symbols (two circles or two squares side by side)
   • Utility sink (rectangle in small room near washer symbols)

   Also count: Bedrooms, Living/family rooms, Offices/studies, Closets (walk-in only), Garage spaces, Storage/utility rooms, Dining rooms.

4. **Building type**: residential, commercial, industrial, mixed-use, etc.
5. **Notable features**: loft, open floor plan, vaulted/cathedral ceiling, etc.

CRITICAL RULES:
- A split-level with a loft is 1.5-2 floors, NOT more.
- Cathedral/vaulted ceilings are double-height spaces, NOT separate floors.
- Only mark hasBasement=true for actual below-grade levels with their own floor plan.
- When in doubt about a fixture, count it — overcounting is better than undercounting.

Return ONLY a JSON object with confidence for each room type:
{"floors":2,"hasBasement":false,"hasLoft":true,"rooms":{"bathrooms":3,"kitchens":1,"staircases":1,"offices":1},"roomConfidence":{"bathrooms":0.9,"kitchens":0.8,"staircases":0.7,"offices":0.6},"buildingType":"residential","features":["loft","open floor plan"]}`;
}

function parseAIVisionResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function summarizeEvidence(evidence) {
  if (!evidence.length) return '';
  const parts = [];
  const byParam = {};
  for (const e of evidence) {
    if (e.paramPath.startsWith('_')) continue;
    if (!byParam[e.paramPath]) byParam[e.paramPath] = [];
    byParam[e.paramPath].push(e);
  }
  for (const [param, items] of Object.entries(byParam)) {
    const best = items.reduce((a, b) => (a.confidence * (SOURCE_WEIGHTS[a.source] || 0.5)) > (b.confidence * (SOURCE_WEIGHTS[b.source] || 0.5)) ? a : b);
    parts.push(`- ${param}: ${best.value} (from ${best.source}, confidence ${Math.round(best.confidence * 100)}%)`);
  }
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE E: Targeted AI Verification — crop and analyze unclassified rooms
// ═══════════════════════════════════════════════════════════════════════════════

async function targetedAIVerification(unclassifiedRooms, drawingDataMap) {
  const evidence = [];

  // Cap at 15 rooms (3 API calls max)
  const roomsToVerify = unclassifiedRooms.slice(0, 15);
  if (roomsToVerify.length === 0) return evidence;

  // Batch: 5 rooms per API call
  const BATCH_SIZE = 5;
  for (let i = 0; i < roomsToVerify.length; i += BATCH_SIZE) {
    const batch = roomsToVerify.slice(i, i + BATCH_SIZE);

    const content = [];
    const roomLabels = [];

    for (let j = 0; j < batch.length; j++) {
      const room = batch[j];
      const drawingData = drawingDataMap.get(room.drawingId);
      if (!drawingData) continue;

      // Compute bounding box from polygon or centroid+area
      let { x, y, w, h } = computeRoomBBox(room, drawingData.width, drawingData.height);

      // Crop the room at 600px
      try {
        const dataUrl = drawingData.imgData?.startsWith?.('data:')
          ? drawingData.imgData
          : `data:image/jpeg;base64,${drawingData.base64}`;
        const cropped = await cropImageRegion(dataUrl, x, y, w, h, 600);
        if (cropped) {
          content.push(imageBlock(cropped));
          const roomNum = j + 1;
          const labelInfo = room.label ? ` (labeled "${room.label}")` : '';
          content.push({ type: 'text', text: `Room ${roomNum}${labelInfo}:` });
          roomLabels.push({ index: roomNum, room });
        }
      } catch (err) {
        console.warn(`[DetectionEngine:AIE] Crop failed for room ${room.roomId}:`, err.message);
      }
    }

    if (content.length === 0) continue;

    content.push({
      type: 'text',
      text: `For each room image above, identify what type of room it is based on the fixtures and symbols you see.

Look for:
- Toilet/sink/tub/shower → bathroom
- Cabinets/range/oven/refrigerator → kitchen
- Stair treads/risers/UP-DN arrows → staircase
- Desk/chair/shelving → office
- Washer/dryer symbols → laundry
- Shelving/mechanical equipment → storage/utility
- If unclear → unknown

Return a JSON array with one entry per room:
[{"room":1,"type":"bathroom","confidence":0.9},{"room":2,"type":"kitchen","confidence":0.8}]

Valid types: bathroom, kitchen, staircase, office, storage, laundry, closet, corridor, unknown`,
    });

    try {
      const result = await callAnthropic({
        max_tokens: 600,
        messages: [{ role: 'user', content }],
        temperature: 0,
      });

      const parsed = parseTargetedResponse(result);
      if (parsed) {
        for (const item of parsed) {
          const roomInfo = roomLabels.find(r => r.index === item.room);
          if (!roomInfo) continue;

          const typeMap = {
            bathroom: 'bathrooms',
            kitchen: 'kitchens',
            staircase: 'staircases',
            office: 'offices',
            storage: 'storageRooms',
            laundry: 'storageRooms',
            closet: 'storageRooms',
          };
          const storeKey = typeMap[item.type];
          if (!storeKey) continue; // skip unknown/corridor

          evidence.push({
            source: 'ai-targeted',
            paramPath: `roomCounts.${storeKey}`,
            value: 1, // Each room contributes 1
            confidence: item.confidence || 0.80,
            detail: `Targeted AI crop: room "${roomInfo.room.label || roomInfo.room.roomId}" identified as ${item.type}`,
            roomId: roomInfo.room.roomId,
            drawingId: roomInfo.room.drawingId,
          });
        }
      }
    } catch (err) {
      console.warn(`[DetectionEngine:AIE] Targeted batch ${i / BATCH_SIZE + 1} failed:`, err.message);
    }
  }

  return evidence;
}

function computeRoomBBox(room, imgWidth, imgHeight) {
  let x, y, w, h;

  if (room.polygon && room.polygon.length >= 3) {
    const xs = room.polygon.map(p => p.x);
    const ys = room.polygon.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Add 15% padding
    const padX = (maxX - minX) * 0.15;
    const padY = (maxY - minY) * 0.15;
    x = Math.max(0, minX - padX);
    y = Math.max(0, minY - padY);
    w = Math.min(imgWidth - x, (maxX - minX) + 2 * padX);
    h = Math.min(imgHeight - y, (maxY - minY) + 2 * padY);
  } else if (room.centroid && room.area) {
    // Estimate box from centroid and area
    const side = Math.sqrt(room.area) * 1.3;
    x = Math.max(0, room.centroid.x - side / 2);
    y = Math.max(0, room.centroid.y - side / 2);
    w = Math.min(imgWidth - x, side);
    h = Math.min(imgHeight - y, side);
  } else {
    // Fallback: center quarter of image
    x = imgWidth * 0.25;
    y = imgHeight * 0.25;
    w = imgWidth * 0.5;
    h = imgHeight * 0.5;
  }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function parseTargetedResponse(text) {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE MERGE — weighted consensus across all sources
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Merge evidence from all detection phases into final parameter values.
 * Uses weighted voting where each source contributes sourceWeight × confidence.
 *
 * For numeric values (room counts, floor count): highest weighted value wins.
 * For boolean/string values: most confident source wins.
 * Confidence is boosted when sources agree, penalized when they disagree.
 *
 * @param {Array} allEvidence — All evidence entries
 * @param {Object} correctionFactors — { paramPath: multiplier } from user history
 * @returns {{ parameters: Object, confidence: Object }}
 */
export function mergeEvidence(allEvidence, correctionFactors = {}) {
  const parameters = {};
  const confidence = {};

  // Group by parameter path
  const byParam = {};
  for (const e of allEvidence) {
    // Skip internal params that start with _
    if (e.paramPath.startsWith('_')) continue;
    if (!byParam[e.paramPath]) byParam[e.paramPath] = [];
    byParam[e.paramPath].push(e);
  }

  for (const [paramPath, items] of Object.entries(byParam)) {
    // For targeted AI evidence (each item = 1 room), aggregate by summing
    const isTargetedRoomCount = paramPath.startsWith('roomCounts.') &&
      items.some(e => e.source === 'ai-targeted');

    if (isTargetedRoomCount) {
      // Sum targeted counts, then compare with other sources
      const targetedSum = items
        .filter(e => e.source === 'ai-targeted')
        .reduce((s, e) => s + e.value, 0);
      const otherItems = items.filter(e => e.source !== 'ai-targeted');

      // Create a synthetic evidence entry for aggregated targeted count
      if (targetedSum > 0) {
        const avgConf = items
          .filter(e => e.source === 'ai-targeted')
          .reduce((s, e) => s + e.confidence, 0) / items.filter(e => e.source === 'ai-targeted').length;
        otherItems.push({
          source: 'ai-targeted',
          paramPath,
          value: targetedSum,
          confidence: avgConf,
          detail: `Aggregated from ${items.filter(e => e.source === 'ai-targeted').length} targeted room crops`,
        });
      }

      // Now merge with standard logic
      const merged = mergeParamValues(paramPath, otherItems, correctionFactors);
      parameters[paramPath] = merged.value;
      confidence[paramPath] = merged.confidence;
    } else {
      const merged = mergeParamValues(paramPath, items, correctionFactors);
      parameters[paramPath] = merged.value;
      confidence[paramPath] = merged.confidence;
    }
  }

  return { parameters, confidence };
}

function mergeParamValues(paramPath, items, correctionFactors) {
  if (items.length === 0) return { value: 0, confidence: 0 };
  if (items.length === 1) {
    const e = items[0];
    const weight = (SOURCE_WEIGHTS[e.source] || 0.5) * e.confidence;
    let value = e.value;
    if (correctionFactors[paramPath] && typeof value === 'number') {
      value = Math.round(value * correctionFactors[paramPath]);
    }
    return { value, confidence: Math.min(weight, 0.95) };
  }

  // Multiple sources — weighted voting
  const isNumeric = items.every(e => typeof e.value === 'number');

  if (isNumeric) {
    // For numeric (room counts, floor count): pick the value with highest weighted support
    const valueWeights = {};
    for (const e of items) {
      const w = (SOURCE_WEIGHTS[e.source] || 0.5) * e.confidence;
      if (!valueWeights[e.value]) valueWeights[e.value] = 0;
      valueWeights[e.value] += w;
    }

    // Find the value with highest total weight
    let bestValue = 0, bestWeight = 0;
    for (const [val, weight] of Object.entries(valueWeights)) {
      if (weight > bestWeight) {
        bestWeight = weight;
        bestValue = parseInt(val);
      }
    }

    // Boost confidence when sources agree
    const distinctValues = Object.keys(valueWeights).length;
    const agreementBoost = distinctValues === 1 ? 0.10 : -0.05 * (distinctValues - 1);

    // Normalize confidence to 0-1
    const maxPossibleWeight = items.length * 1.0; // max source weight × max confidence
    let conf = Math.min((bestWeight / maxPossibleWeight) + agreementBoost, 0.98);
    conf = Math.max(conf, 0.10);

    // Apply correction factor
    let finalValue = bestValue;
    if (correctionFactors[paramPath]) {
      finalValue = Math.round(bestValue * correctionFactors[paramPath]);
      finalValue = Math.max(finalValue, Math.round(bestValue * 0.5));
      finalValue = Math.min(finalValue, Math.round(bestValue * 2.0));
    }

    return { value: finalValue, confidence: conf };
  } else {
    // Non-numeric (string/boolean): highest weighted source wins
    let best = items[0];
    let bestW = 0;
    for (const e of items) {
      const w = (SOURCE_WEIGHTS[e.source] || 0.5) * e.confidence;
      if (w > bestW) { bestW = w; best = e; }
    }
    return { value: best.value, confidence: Math.min(bestW, 0.95) };
  }
}
