// ═══════════════════════════════════════════════════════════════════════════════
// Discovery Scan Engine — Proactive element detection across all drawing sheets
//
// After upload, this scans every sheet to build a discovery index of all
// detectable construction elements. Unlike predictive takeoffs (which activate
// on click), this runs automatically and presents a dashboard of everything
// NOVA found — letting the user create takeoffs with one click.
//
// Pipeline:  Extract all pages → Per-sheet tag census → Classify & score →
//            Cross-sheet aggregation → Store results
// ═══════════════════════════════════════════════════════════════════════════════
import { extractPageData } from "@/utils/pdfExtractor";
import { useDiscoveryStore } from "@/stores/discoveryStore";
import { useNovaStore } from "@/stores/novaStore";
import { DISCOVERY_CATEGORIES } from "@/stores/discoveryStore";
import { uid } from "@/utils/format";

// ── Tag detection patterns (reused from predictiveEngine concepts) ───────────
const TAG_PATTERN = /^[A-Z0-9]{1,3}[-.]?[A-Z0-9]{0,4}$/i;
const DIMENSION_PATTERN = /^\d+['-]\s*\d*"?$/;
const NUMBER_PATTERN = /^\d{3,}$/;
const SHEET_NUM_PATTERN = /^[A-Z]-?\d{2,3}$/i;

// Minimum instances to consider a tag worth reporting
const MIN_INSTANCES_THRESHOLD = 1;
// Minimum confidence to include in results
const MIN_CONFIDENCE_THRESHOLD = 0.3;

// ── Abbreviation map for tag → description inference ────────────────────────
const TAG_DESCRIPTIONS = {
  // Doors
  D: "Door", DR: "Door", DW: "Door/Window", HM: "Hollow Metal Door",
  WD: "Wood Door", SD: "Sliding Door", FD: "Fire Door", OHD: "Overhead Door",
  AD: "Access Door", RD: "Roll-Up Door",
  // Windows
  W: "Window", WN: "Window", SW: "Storefront Window", CW: "Curtain Wall",
  AW: "Awning Window", FW: "Fixed Window",
  // Wall types
  WT: "Wall Type", IW: "Interior Wall", EW: "Exterior Wall",
  FW2: "Fire Wall", PW: "Partition Wall", GW: "Glass Wall", CMU: "CMU Wall",
  // Finishes
  PT: "Paint", GYP: "Gypsum Board", CT: "Ceramic Tile", VCT: "VCT Flooring",
  CPT: "Carpet", ACT: "Acoustic Ceiling Tile", GWB: "Gypsum Wall Board",
  FT: "Floor Tile", WC: "Wall Covering", EP: "Epoxy", RB: "Rubber Base",
  // Plumbing
  WC2: "Water Closet", LAV: "Lavatory", UR: "Urinal", SK: "Sink",
  DF: "Drinking Fountain", FD2: "Floor Drain", CU: "Clean-Out",
  SS: "Service Sink", HB: "Hose Bib",
  // Lighting
  LT: "Light Fixture", LF: "Light Fixture", EM: "Emergency Light",
  EX: "Exit Sign",
  // Mechanical
  RTU: "Rooftop Unit", AHU: "Air Handler", VAV: "VAV Box",
  FCU: "Fan Coil Unit", EF: "Exhaust Fan", DPR: "Damper",
  // Equipment
  FE: "Fire Extinguisher", AED: "AED Cabinet",
  // Structural
  FTG: "Footing", COL: "Column", BM: "Beam", JT: "Joist",
};

// ── Category classification based on tag prefix/description ─────────────────
const CATEGORY_RULES = [
  // Structural must check BEFORE openings so fire walls (FW2) aren't caught by FW (Fixed Window)
  // Note: classifyTag strips trailing digits, so FW2 → FW. We test the raw tag in inferMeasurementType.
  { match: /^(WT|IW|EW|PW|GW|CMU|FTG|COL|BM|JT)\d*/i, category: DISCOVERY_CATEGORIES.STRUCTURAL },
  { match: /^(D|DR|DW|HM|WD|SD|FD|OHD|AD|RD|W|WN|SW|CW|AW|FW)\d*/i, category: DISCOVERY_CATEGORIES.OPENING },
  { match: /^(PT|GYP|CT|VCT|CPT|ACT|GWB|FT|WC|EP|RB)\d*/i, category: DISCOVERY_CATEGORIES.FINISH },
  { match: /^(WC2?|LAV|UR|SK|DF|FD2|CU|SS|HB|LT|LF|EM|EX)\d*/i, category: DISCOVERY_CATEGORIES.FIXTURE },
  { match: /^(RTU|AHU|VAV|FCU|EF|DPR)\d*/i, category: DISCOVERY_CATEGORIES.EQUIPMENT },
  { match: /^(FE|AED)\d*/i, category: DISCOVERY_CATEGORIES.EQUIPMENT },
];

// ── Measurement type inference ──────────────────────────────────────────────
function inferMeasurementType(tag, category) {
  // Openings and fixtures are always counted
  if (category === DISCOVERY_CATEGORIES.OPENING) return "count";
  if (category === DISCOVERY_CATEGORIES.FIXTURE) return "count";
  if (category === DISCOVERY_CATEGORIES.EQUIPMENT) return "count";
  // Finishes are typically area
  if (category === DISCOVERY_CATEGORIES.FINISH) return "area";
  // Walls and structural can be linear or area
  if (category === DISCOVERY_CATEGORIES.STRUCTURAL) {
    if (/^(WT|IW|EW|PW|GW|CMU|FW)/i.test(tag)) return "linear";
    return "count"; // columns, footings, beams = count
  }
  if (category === DISCOVERY_CATEGORIES.EXTERIOR) return "area";
  return "count";
}

// ── Classify a tag into a category ──────────────────────────────────────────
function classifyTag(tag) {
  const upper = tag.toUpperCase().replace(/[-.]?\d+$/, ""); // strip trailing numbers
  for (const rule of CATEGORY_RULES) {
    if (rule.match.test(upper)) return rule.category;
  }
  return DISCOVERY_CATEGORIES.OTHER;
}

// ── Infer a human-readable description from a tag ───────────────────────────
function inferDescription(tag) {
  const upper = tag.toUpperCase().replace(/[-.]?\d+$/, "");
  // Direct match
  if (TAG_DESCRIPTIONS[upper]) {
    const suffix = tag.replace(/^[A-Z]+[-.]?/i, "");
    return suffix ? `${TAG_DESCRIPTIONS[upper]} ${tag}` : TAG_DESCRIPTIONS[upper];
  }
  // Try without trailing digits
  const base = upper.replace(/\d+$/, "");
  if (TAG_DESCRIPTIONS[base]) {
    return `${TAG_DESCRIPTIONS[base]} ${tag}`;
  }
  return `Tag ${tag}`;
}

// ── Filter: is this text likely a meaningful construction tag? ───────────────
function isLikelyTag(text) {
  const t = text.trim();
  if (t.length < 1 || t.length > 8) return false;
  if (DIMENSION_PATTERN.test(t)) return false;
  if (NUMBER_PATTERN.test(t)) return false;
  if (SHEET_NUM_PATTERN.test(t)) return false;
  if (!TAG_PATTERN.test(t)) return false;
  // Filter common non-tag text (compass, directions, abbreviations, construction shorthand)
  const lower = t.toLowerCase();
  if ([
    "n", "s", "e", "w", "ne", "nw", "se", "sw", "dn", "up", "eq", "or", "no", "yes", "na", "typ",
    "nts", "sim", "ref", "max", "min", "el", "oc", "do", "if", "at", "to", "by", "as", "in", "on",
    "an", "it", "is", "us", "of", "ea", "pc", "sf", "lf", "cf", "ga", "lb", "ft",
    "see", "per", "new", "all", "for", "and", "the", "not", "use", "top", "bot",
    "a", "b", "c", "i",
  ].includes(lower)) return false;
  return true;
}

// ── Compute confidence for a tag based on instance quality ──────────────────
function computeTagConfidence(instances) {
  if (instances.length === 0) return 0;

  let totalConf = 0;
  for (const inst of instances) {
    let conf = 0.6; // base
    // Boost for good font size (likely intentional label, not fine print)
    if (inst.fontSize >= 8 && inst.fontSize <= 24) conf += 0.15;
    // Use pre-computed inSchedule boolean from Phase 2 tag census
    if (!inst.inSchedule) conf += 0.2;
    else conf -= 0.3; // Penalize schedule-region tags
    // Boost for uppercase (construction tags are typically uppercase)
    if (inst.text === inst.text.toUpperCase()) conf += 0.05;
    totalConf += Math.max(0, Math.min(1, conf));
  }
  return totalConf / instances.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Discovery Scan Pipeline
// ═══════════════════════════════════════════════════════════════════════════════
let _scanAbortToken = 0; // incremented on each scan to cancel previous in-flight scans

export async function runDiscoveryScan(drawings) {
  if (!drawings || drawings.length === 0) return;

  const store = useDiscoveryStore.getState();
  const nova = useNovaStore.getState();

  // Abort any in-flight scan by bumping the token
  const myToken = ++_scanAbortToken;

  store.startScan();
  nova.startTask("scan", "NOVA is scanning your drawings...");

  // Collect all tags across all sheets
  // tagMap: tag → { instances: [], sheets: Map<drawingId, { count, sheetNumber, sheetTitle }> }
  const tagMap = new Map();
  const totalSheets = drawings.length;

  try {
    // ── Phase 1: Extract page data from all sheets (0-50%) ──────────────
    for (let i = 0; i < drawings.length; i++) {
      const drawing = drawings[i];
      const pct = Math.round((i / totalSheets) * 50);
      const sheetLabel = drawing.sheetNumber || drawing.label || `Sheet ${i + 1}`;

      // Check if this scan was superseded by a newer one
      if (_scanAbortToken !== myToken) {
        console.log("[discoveryScan] Aborted — superseded by newer scan");
        return;
      }

      store.updateScanProgress(pct, `Extracting ${sheetLabel}...`);
      nova.updateProgress(pct, `Extracting ${sheetLabel}...`);

      let pageData;
      try {
        pageData = await extractPageData(drawing);
      } catch (err) {
        console.warn(`[discoveryScan] Failed to extract ${sheetLabel}:`, err.message);
        continue;
      }

      if (!pageData || !pageData.text || pageData.text.length === 0) continue;

      const scheduleRegions = pageData.scheduleRegions || [];

      // ── Phase 2: Per-sheet tag census (50-80%) ──────────────────────
      const sheetPct = 50 + Math.round((i / totalSheets) * 30);
      store.updateScanProgress(sheetPct, `Analyzing tags on ${sheetLabel}...`);
      nova.updateProgress(sheetPct, `Analyzing tags on ${sheetLabel}...`);

      for (const textItem of pageData.text) {
        const tag = textItem.text.trim();
        if (!isLikelyTag(tag)) continue;

        // Check if this tag instance is inside a schedule region
        const inSchedule = scheduleRegions.some(
          sr => textItem.x >= sr.minX && textItem.x <= sr.maxX &&
                textItem.y >= sr.minY && textItem.y <= sr.maxY,
        );

        if (!tagMap.has(tag)) {
          tagMap.set(tag, { instances: [], sheets: new Map() });
        }

        const entry = tagMap.get(tag);
        entry.instances.push({
          ...textItem,
          drawingId: drawing.id,
          inSchedule,
        });

        // Track per-sheet counts (only non-schedule instances)
        if (!inSchedule) {
          if (!entry.sheets.has(drawing.id)) {
            entry.sheets.set(drawing.id, {
              drawingId: drawing.id,
              sheetNumber: drawing.sheetNumber || "",
              sheetTitle: drawing.sheetTitle || drawing.label || "",
              count: 0,
            });
          }
          entry.sheets.get(drawing.id).count++;
        }
      }
    }

    // ── Phase 3: Cross-sheet aggregation & scoring (80-95%) ─────────────
    store.updateScanProgress(85, "Aggregating discoveries across sheets...");
    nova.updateProgress(85, "Aggregating discoveries across sheets...");

    const discoveryIndex = [];

    for (const [tag, data] of tagMap) {
      // Only count non-schedule instances
      const planInstances = data.instances.filter(i => !i.inSchedule);
      if (planInstances.length < MIN_INSTANCES_THRESHOLD) continue;

      const category = classifyTag(tag);
      // Pass ALL instances (including schedule ones) so confidence scoring can penalize schedule entries
      const confidence = computeTagConfidence(data.instances);

      if (confidence < MIN_CONFIDENCE_THRESHOLD) continue;

      const sheets = Array.from(data.sheets.values()).filter(s => s.count > 0);
      if (sheets.length === 0) continue;

      const totalInstances = sheets.reduce((sum, s) => sum + s.count, 0);
      const measurementType = inferMeasurementType(tag, category);
      const description = inferDescription(tag);

      // Infer strategy from category
      let strategy = "tag-based";
      if (category === DISCOVERY_CATEGORIES.EXTERIOR) strategy = "exterior-surface";
      else if (category === DISCOVERY_CATEGORIES.FINISH) strategy = "interior-surface";
      else if (category === DISCOVERY_CATEGORIES.STRUCTURAL) strategy = "structural";

      discoveryIndex.push({
        id: uid(),
        tag,
        description,
        category,
        instanceCount: totalInstances,
        sheets,
        confidence: Math.round(confidence * 100) / 100,
        measurementType,
        strategy,
        createdTakeoffId: null,
        dismissed: false,
      });
    }

    // Sort: highest confidence first, then by instance count
    discoveryIndex.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.instanceCount - a.instanceCount;
    });

    // ── Phase 4: Store results (95-100%) ────────────────────────────────
    // Final abort check before persisting results
    if (_scanAbortToken !== myToken) {
      console.log("[discoveryScan] Aborted before storing — superseded by newer scan");
      return;
    }

    store.updateScanProgress(95, "Finalizing discovery index...");
    nova.updateProgress(95, "Finalizing discovery index...");

    store.completeScan(discoveryIndex);
    nova.completeTask(`Found ${discoveryIndex.length} elements across ${totalSheets} sheets`);

    console.log(
      `[discoveryScan] Complete: ${discoveryIndex.length} elements found across ${totalSheets} sheets`,
    );

    return discoveryIndex;
  } catch (err) {
    console.error("[discoveryScan] Scan failed:", err);
    store.failScan(err.message);
    nova.failTask(err.message);
    return [];
  }
}

// ── Quick rescan (called when new drawings are added) ───────────────────────
export async function rescanDrawings(drawings) {
  // Abort any in-flight scan, reset, and re-run
  _scanAbortToken++;
  useDiscoveryStore.getState().reset();
  return runDiscoveryScan(drawings);
}
