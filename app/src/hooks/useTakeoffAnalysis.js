import { useState, useCallback } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useModuleStore } from "@/stores/moduleStore";
import { useUiStore } from "@/stores/uiStore";
import { callAnthropic, optimizeImageForAI, imageBlock } from "@/utils/ai";
import { scanAllDrawingsForSchedules } from "@/utils/scheduleParser";
import { analyzeDrawingGeometry } from "@/utils/geometryEngine";
import { MODULES } from "@/constants/modules";
import { TO_COLORS } from "@/utils/takeoffHelpers";

// ─── useTakeoffAnalysis ─────────────────────────────────────────────
// Owns AI analysis state and functions extracted from TakeoffsPage:
//   - Drawing analysis (AI auto-detect)
//   - Wall schedule detection (2-pass AI)
//   - PDF schedule scan (text + AI fallback)
//   - Geometry analysis (vector wall/room detection)
//
// Accepts CRUD callbacks (addTakeoff, updateTakeoff, addMeasurement)
// from the parent because they depend on useTakeoffCRUD / triggerMeasureFlash
// which live in TakeoffsPage.

export default function useTakeoffAnalysis({ addTakeoff, updateTakeoff, addMeasurement, canvasRef }) {
  // ─── State ───────────────────────────────────────────────────────
  const [aiDrawingAnalysis, setAiDrawingAnalysis] = useState(null); // { loading, results: [] }
  const [wallSchedule, setWallSchedule] = useState({ loading: false, results: null, error: null });
  const [pdfSchedules, setPdfSchedules] = useState({ loading: false, results: null });
  const [geoAnalysis, setGeoAnalysis] = useState({ loading: false, results: null });

  // ─── Helpers (pure, no state deps) ───────────────────────────────

  const mapWallTypeToModuleSpecs = wallType => {
    const catId = wallType.category === "exterior" ? "ext-walls" : "int-walls";
    const catDef = MODULES.walls?.categories?.find(c => c.id === catId);
    if (!catDef) return null;

    const mappedSpecs = {};
    const warnings = [];

    // Map Material
    if (wallType.material) {
      const materialSpec = catDef.specs.find(s => s.id === "Material");
      if (materialSpec?.options?.includes(wallType.material)) {
        mappedSpecs.Material = wallType.material;
      } else if (materialSpec?.options) {
        const fuzzy = materialSpec.options.find(o => o.toLowerCase() === String(wallType.material).toLowerCase());
        if (fuzzy) mappedSpecs.Material = fuzzy;
        else warnings.push(`Material "${wallType.material}" not recognized`);
      }
    }

    // Map WallHeight
    if (wallType.wallHeight) {
      mappedSpecs.WallHeight = Number(wallType.wallHeight);
    }

    // Map each AI-detected spec
    if (wallType.specs) {
      for (const [specId, value] of Object.entries(wallType.specs)) {
        const specDef = catDef.specs.find(s => s.id === specId);
        if (!specDef) {
          warnings.push(`Unknown spec: ${specId} = "${value}"`);
          continue;
        }
        if (specDef.options) {
          if (specDef.options.includes(value)) {
            mappedSpecs[specId] = value;
          } else {
            const norm = v =>
              String(v)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
            const match = specDef.options.find(o => norm(o) === norm(value));
            if (match) mappedSpecs[specId] = match;
            else warnings.push(`${specDef.label || specId}: "${value}" not in options`);
          }
        } else {
          mappedSpecs[specId] = value;
        }
      }
    }

    return {
      catId,
      label: `Type ${wallType.typeLabel}`,
      specs: mappedSpecs,
      warnings,
      wallType,
    };
  };

  // Crop a region of an image at high resolution for AI reading
  const cropDrawingRegion = (imgSrc, bbox) => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const srcX = Math.max(0, Math.floor(bbox.x * img.width));
        const srcY = Math.max(0, Math.floor(bbox.y * img.height));
        const srcW = Math.min(img.width - srcX, Math.ceil(bbox.width * img.width));
        const srcH = Math.min(img.height - srcY, Math.ceil(bbox.height * img.height));
        if (srcW <= 0 || srcH <= 0) {
          resolve(null);
          return;
        }

        const maxDim = 2000;
        const scale = Math.min(maxDim / srcW, maxDim / srcH, 3);
        const outW = Math.round(srcW * scale);
        const outH = Math.round(srcH * scale);

        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        canvas.getContext("2d").drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = () => resolve(null);
      img.src = imgSrc;
    });
  };

  // AI vision fallback for schedule detection on scanned/raster PDFs
  const aiScheduleScan = async imgSrc => {
    const { base64 } = await optimizeImageForAI(imgSrc, 1400);
    const result = await callAnthropic({
      max_tokens: 4000,
      system:
        "You analyze construction drawings to find and extract schedule tables (door schedules, window schedules, wall type schedules, finish schedules, equipment schedules, etc.). Return structured JSON.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Find all schedule tables on this drawing. For each schedule found, return:
- title: schedule title (e.g., "Door Schedule", "Window Schedule", "Wall Type Schedule")
- type: "door" | "window" | "wall" | "finish" | "equipment" | "other"
- columns: array of column header names
- rows: array of objects, each representing one row with column values
- itemCount: number of rows/items in the schedule

If no schedules are visible, return an empty array.
Return ONLY a JSON array of schedule objects.`,
            },
            imageBlock(base64),
          ],
        },
      ],
    });
    let parsed;
    try {
      parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
    } catch {
      parsed = null;
    }
    return Array.isArray(parsed) ? parsed : [];
  };

  // ─── Convert AI pixel coords to canvas pixel coords ──────────────
  const aiToCanvasCoords = locations => {
    if (!locations?.length || !aiDrawingAnalysis?.aiW || !canvasRef?.current) return [];
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const scaleX = cw / aiDrawingAnalysis.aiW;
    const scaleY = ch / aiDrawingAnalysis.aiH;
    return locations.map(p => ({ x: Math.round(p.x * scaleX), y: Math.round(p.y * scaleY) }));
  };

  // ─── 1. AI Drawing Analysis ──────────────────────────────────────
  const runDrawingAnalysis = async () => {
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const drawings = useDrawingPipelineStore.getState().drawings;
    const pdfCanvases = useDrawingPipelineStore.getState().pdfCanvases;
    const showToast = useUiStore.getState().showToast;

    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) {
      showToast("Drawing image not available — re-upload in Documents", "error");
      return;
    }

    setAiDrawingAnalysis({ loading: true, results: [] });
    try {
      const { base64 } = await optimizeImageForAI(imgSrc, 1400);
      const sheetInfo = `${drawing.sheetNumber || "Unknown"} — ${drawing.sheetTitle || drawing.label || "Untitled"}`;

      const result = await callAnthropic({
        max_tokens: 4000,
        system:
          "You are a construction drawing analysis AI. You analyze architectural, structural, and MEP drawings to identify measurable elements for quantity takeoff. Focus on accurate identification and counting — do NOT attempt to provide pixel coordinates.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this construction drawing sheet: "${sheetInfo}"

Identify all measurable elements visible on this drawing. For each element type, provide:
- name: specific element name (e.g., "Interior Door 3'-0\\"", "GWB Partition Wall", "Vinyl Floor Tile")
- type: "count" | "linear" | "area"
- quantity: ONLY for count items — provide the exact number of instances visible (doors, windows, fixtures, equipment). For linear and area items, set quantity to 0.
- unit: EA for count, LF for linear, SF for area
- code: CSI code if identifiable (e.g., "08 11 13")
- confidence: "high" | "medium" | "low"
- notes: any relevant detail (dimensions, specs, callouts visible on the drawing)

FOCUS ON CLEARLY IDENTIFIABLE ITEMS:
- Count items: doors (look for swing arcs/door marks), windows, plumbing fixtures, electrical panels, HVAC units, light fixtures, fire devices, columns
- Linear items: walls (partition types), baseboards, casework runs, railings — do NOT guess at LF quantities
- Area items: floor finishes, ceiling types, roofing — do NOT guess at SF quantities
- Do NOT count walls (use linear), do NOT count rooms (use area)
- Skip anything ambiguous or unclear

Return ONLY a JSON array of objects.`,
              },
              imageBlock(base64),
            ],
          },
        ],
      });

      let parsed;
      try {
        parsed = JSON.parse(result.replace(/```json|```/g, "").trim());
      } catch {
        parsed = null;
      }
      if (parsed && Array.isArray(parsed)) {
        const filtered = parsed.filter(item => item.confidence !== "low");
        if (filtered.length === 0) {
          setAiDrawingAnalysis({ loading: false, results: [] });
          showToast("No high-confidence elements detected on this sheet", "info");
          return;
        }

        const group = drawing.sheetNumber || "";
        let countItems = 0,
          measureItems = 0;
        filtered.forEach(item => {
          addTakeoff(group, item.name, item.unit || "EA", item.code || "", { noMeasure: true, aiDetected: true });
          const newTo = useDrawingPipelineStore.getState().takeoffs;
          const last = newTo[newTo.length - 1];
          if (!last) return;
          if (item.type === "count" && item.quantity) {
            updateTakeoff(last.id, "quantity", item.quantity);
            countItems++;
          } else {
            measureItems++;
          }
        });

        setAiDrawingAnalysis({ loading: false, results: filtered });
        const msg = `AI detected ${filtered.length} elements — ${countItems} counted, ${measureItems} need measuring`;
        showToast(msg);
      } else {
        setAiDrawingAnalysis({ loading: false, results: [] });
        showToast("Failed to parse drawing analysis", "error");
      }
    } catch (err) {
      setAiDrawingAnalysis({ loading: false, results: [] });
      showToast(`Analysis error: ${err.message}`, "error");
    }
  };

  // ─── Accept single / all drawing items ───────────────────────────
  const acceptDrawingItem = item => {
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const drawings = useDrawingPipelineStore.getState().drawings;
    const showToast = useUiStore.getState().showToast;

    const group = drawings.find(d => d.id === selectedDrawingId)?.sheetNumber || "";
    const colorIdx = useDrawingPipelineStore.getState().takeoffs.length;
    const color = TO_COLORS[colorIdx % TO_COLORS.length];
    addTakeoff(group, item.name, item.unit, item.code);
    const newTo = useDrawingPipelineStore.getState().takeoffs;
    const last = newTo[newTo.length - 1];
    if (!last) return;

    if (item.type === "count" && item.quantity) {
      updateTakeoff(last.id, "quantity", item.quantity);
    }

    const pts = aiToCanvasCoords(item.locations || []);
    if (pts.length > 0 && selectedDrawingId) {
      if (item.type === "count") {
        pts.forEach(p => {
          addMeasurement(last.id, {
            type: "count",
            sheetId: selectedDrawingId,
            points: [p],
            value: 1,
            color,
          });
        });
      } else if (item.type === "linear" && pts.length >= 2) {
        addMeasurement(last.id, {
          type: "linear",
          sheetId: selectedDrawingId,
          points: pts.slice(0, 2),
          value: null,
          color,
        });
      } else if (item.type === "area" && pts.length >= 3) {
        addMeasurement(last.id, {
          type: "area",
          sheetId: selectedDrawingId,
          points: pts,
          value: null,
          color,
        });
      } else if (pts.length === 1) {
        addMeasurement(last.id, {
          type: "count",
          sheetId: selectedDrawingId,
          points: [pts[0]],
          value: item.type === "count" ? item.quantity || 1 : 1,
          color,
        });
      }
      useDrawingPipelineStore.getState().setTkSelectedTakeoffId(last.id);
    }

    const hint = item.type !== "count" ? " — measure for accurate qty" : "";
    showToast(`Added: ${item.name}${hint}`);
    setAiDrawingAnalysis(prev => (prev ? { ...prev, results: prev.results.filter(r => r !== item) } : null));
  };

  const acceptAllDrawingItems = () => {
    if (!aiDrawingAnalysis?.results) return;
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const drawings = useDrawingPipelineStore.getState().drawings;
    const showToast = useUiStore.getState().showToast;

    const group = drawings.find(d => d.id === selectedDrawingId)?.sheetNumber || "";
    let _countItems = 0,
      measureItems = 0;
    aiDrawingAnalysis.results.forEach(item => {
      const colorIdx = useDrawingPipelineStore.getState().takeoffs.length;
      const color = TO_COLORS[colorIdx % TO_COLORS.length];
      addTakeoff(group, item.name, item.unit, item.code);
      const newTo = useDrawingPipelineStore.getState().takeoffs;
      const last = newTo[newTo.length - 1];
      if (!last) return;

      if (item.type === "count" && item.quantity) {
        updateTakeoff(last.id, "quantity", item.quantity);
        _countItems++;
      } else {
        measureItems++;
      }

      const pts = aiToCanvasCoords(item.locations || []);
      if (pts.length > 0 && selectedDrawingId) {
        if (item.type === "count") {
          pts.forEach(p => {
            addMeasurement(last.id, {
              type: "count",
              sheetId: selectedDrawingId,
              points: [p],
              value: 1,
              color,
            });
          });
        } else if (item.type === "linear" && pts.length >= 2) {
          addMeasurement(last.id, {
            type: "linear",
            sheetId: selectedDrawingId,
            points: pts.slice(0, 2),
            value: null,
            color,
          });
        } else if (item.type === "area" && pts.length >= 3) {
          addMeasurement(last.id, {
            type: "area",
            sheetId: selectedDrawingId,
            points: pts,
            value: null,
            color,
          });
        } else if (pts.length === 1) {
          addMeasurement(last.id, {
            type: "count",
            sheetId: selectedDrawingId,
            points: [pts[0]],
            value: item.type === "count" ? item.quantity || 1 : 1,
            color,
          });
        }
      }
    });
    const msg =
      `Added ${aiDrawingAnalysis.results.length} items` + (measureItems > 0 ? ` — ${measureItems} need measuring` : "");
    showToast(msg);
    setAiDrawingAnalysis(null);
  };

  // ─── 2. Wall Schedule Detection ──────────────────────────────────
  const runWallScheduleDetection = async () => {
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const drawings = useDrawingPipelineStore.getState().drawings;
    const pdfCanvases = useDrawingPipelineStore.getState().pdfCanvases;
    const showToast = useUiStore.getState().showToast;

    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) {
      showToast("Drawing image not available", "error");
      return;
    }

    setWallSchedule({ loading: true, results: null, error: null });
    try {
      // PASS 1: Locate the schedule on the full page
      const { base64: fullBase64 } = await optimizeImageForAI(imgSrc, 1400);

      const locateResult = await callAnthropic({
        max_tokens: 500,
        system: "You locate schedule tables on architectural drawings. Return only JSON.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Find the WALL TYPE SCHEDULE on this architectural drawing sheet.

Return a JSON object with:
- "found": true/false
- "bbox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0}
  (bounding box as fractions of image width/height)
- "title": The exact title of the schedule as printed

If no wall schedule is found, return: {"found": false}
Return ONLY the JSON object, nothing else.`,
              },
              imageBlock(fullBase64),
            ],
          },
        ],
      });

      let locateData;
      try {
        locateData = JSON.parse(locateResult.replace(/```json|```/g, "").trim());
      } catch {
        const m = locateResult.match(/\{[\s\S]*\}/);
        if (m)
          try {
            locateData = JSON.parse(m[0]);
          } catch {
            locateData = null;
          }
      }

      if (!locateData?.found || !locateData?.bbox) {
        setWallSchedule({ loading: false, results: null, error: "No wall type schedule found on this sheet." });
        showToast("No wall type schedule found on this sheet", "error");
        return;
      }

      // PASS 2: Crop and parse at high resolution
      const pad = 0.02;
      const bbox = {
        x: Math.max(0, locateData.bbox.x - pad),
        y: Math.max(0, locateData.bbox.y - pad),
        width: Math.min(1 - Math.max(0, locateData.bbox.x - pad), locateData.bbox.width + pad * 2),
        height: Math.min(1 - Math.max(0, locateData.bbox.y - pad), locateData.bbox.height + pad * 2),
      };

      const croppedBase64 = await cropDrawingRegion(imgSrc, bbox);
      if (!croppedBase64) {
        setWallSchedule({ loading: false, results: null, error: "Failed to crop schedule region" });
        showToast("Failed to crop schedule region", "error");
        return;
      }

      showToast("Schedule located — reading details...");

      const result = await callAnthropic({
        max_tokens: 4096,
        system:
          "You are a construction estimating AI that reads wall type schedules from architectural drawings. You extract precise, structured data. You are meticulous about reading EXACT type designators and spec values as printed.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This is a cropped, high-resolution view of a wall type schedule from an architectural drawing.

Read EVERY wall type in this schedule and extract the following for each:

- "typeLabel": The EXACT type designator/identifier as printed (e.g., "A", "W1", "WT-1", "P2", "1A").
  Read this EXACTLY from the drawing — do not rename or reformat.
- "description": Full written description from the schedule
- "category": "interior" or "exterior"
- "material": One of: "Wood", "Metal Stud", "CMU", "Concrete", "ICF", "Tilt-Up", "Precast", "SIP", "3D Printed"
- "wallHeight": Height in feet as a number (only if specified)
- "specs": Object with applicable keys:

  For Metal Stud walls (most common in commercial):
    "MSStudSize": EXACT stud depth — "1-5/8\\"", "2-1/2\\"", "3-5/8\\"", "4\\"", "6\\"", "8\\"", or "10\\""
    "MSGauge": "25 ga", "22 ga", "20 ga", "18 ga", "16 ga", "14 ga", or "12 ga"
    "MSSpacing": "12\\" OC", "16\\" OC", or "24\\" OC"

  For Wood walls:
    "StudSize": "2x4", "2x6", "2x8", etc.
    "PlanSpacing": "12\\" OC", "16\\" OC", or "24\\" OC"
    "TopPlates": "Single", "Double", or "Triple"
    "BotPlates": "Single" or "Double"

  For CMU walls:
    "CMUWidth": "6\\"", "8\\"", "10\\"", or "12\\""
    "CMUGrout": "Rebar Cells Only" or "Solid Grouted"

  For Concrete walls:
    "ConcThickness": "6\\"", "8\\"", "10\\"", or "12\\""

  Drywall (applies to ALL material types):
    "DwType": "None", "1/2\\" Standard", "5/8\\" Standard", "5/8\\" Type X", "5/8\\" Type C", "1/2\\" Moisture Resistant", "5/8\\" Moisture Resistant", or "5/8\\" Abuse Resistant"
    "DwLayers": "1", "2", or "3"
    "DwHeight": Height in feet as a number (only if different from wall height, otherwise omit)

- "finishes": {"interior": "...", "exterior": "...", "insulation": "..."}
- "confidence": "high", "medium", or "low"
- "notes": Fire rating, STC, UL assembly, any other data from the schedule

IMPORTANT:
- Metal studs use sizes like 1-5/8", 2-1/2", 3-5/8", 6" — NOT lumber sizes like 2x4.
- Read typeLabel EXACTLY as printed — common formats: circled letters, column headers, bold labels.
- Return ONLY a valid JSON array: [{...}, {...}, ...]`,
              },
              imageBlock(croppedBase64),
            ],
          },
        ],
      });

      // Robust JSON parsing
      let parsed = null;
      const cleaned = result
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch)
          try {
            parsed = JSON.parse(arrMatch[0]);
          } catch {
            /* fall through */
          }
        if (!parsed) {
          const objMatch = cleaned.match(/\{[\s\S]*\}/);
          if (objMatch)
            try {
              parsed = JSON.parse(objMatch[0]);
            } catch {
              /* fall through */
            }
        }
      }

      if (parsed && parsed.error) {
        setWallSchedule({ loading: false, results: null, error: parsed.error });
        showToast(parsed.error, "error");
        return;
      }

      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed.map(wt => mapWallTypeToModuleSpecs(wt)).filter(Boolean);
        setWallSchedule({ loading: false, results: mapped, error: null });
        showToast(`Found ${mapped.length} wall types on this sheet`);
      } else {
        setWallSchedule({ loading: false, results: null, error: "Could not parse wall schedule data" });
        showToast("Failed to parse wall schedule", "error");
      }
    } catch (err) {
      setWallSchedule({ loading: false, results: null, error: err.message });
      showToast(`Wall schedule error: ${err.message}`, "error");
    }
  };

  // ─── Create wall instances in module store ────────────────────────
  const createWallInstances = selectedItems => {
    const showToast = useUiStore.getState().showToast;
    const store = useModuleStore.getState();
    if (store.activeModule !== "walls") {
      useModuleStore.getState().setActiveModule("walls");
    }

    let created = 0;
    selectedItems.forEach(mapped => {
      const existing = store.moduleInstances?.walls?.categoryInstances?.[mapped.catId] || [];
      if (existing.some(inst => inst.label === mapped.label)) return;

      useModuleStore.getState().addCategoryInstance("walls", mapped.catId);

      const updatedState = useModuleStore.getState();
      const catInstances = updatedState.moduleInstances?.walls?.categoryInstances?.[mapped.catId] || [];
      const newInstance = catInstances[catInstances.length - 1];
      if (!newInstance) return;

      useModuleStore.getState().renameCategoryInstance("walls", mapped.catId, newInstance.id, mapped.label);

      for (const [specId, value] of Object.entries(mapped.specs)) {
        useModuleStore.getState().setCatInstanceSpec("walls", mapped.catId, newInstance.id, specId, value);
      }
      created++;
    });

    showToast(`Created ${created} wall type instance${created !== 1 ? "s" : ""}`);
    setWallSchedule({ loading: false, results: null, error: null });
  };

  // ─── 3. PDF Schedule Scan ────────────────────────────────────────
  const runPdfScheduleScan = useCallback(async () => {
    const drawings = useDrawingPipelineStore.getState().drawings;
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const pdfCanvases = useDrawingPipelineStore.getState().pdfCanvases;
    const showToast = useUiStore.getState().showToast;

    setPdfSchedules({ loading: true, results: null });
    try {
      const schedules = await scanAllDrawingsForSchedules(drawings.filter(d => d.data && d.type === "pdf"));
      if (schedules.length > 0) {
        setPdfSchedules({ loading: false, results: schedules });
        const totalItems = schedules.reduce((s, sc) => s + sc.itemCount, 0);
        showToast(`Found ${schedules.length} schedule(s) with ${totalItems} items`);
      } else {
        // Native scan found nothing — fall back to AI vision on current drawing
        const drawing = selectedDrawingId && drawings.find(d => d.id === selectedDrawingId);
        const imgSrc = drawing && (drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId]);
        if (imgSrc) {
          showToast("No text-based schedules found — trying AI vision...", "info");
          try {
            const aiResults = await aiScheduleScan(imgSrc);
            if (aiResults.length > 0) {
              setPdfSchedules({ loading: false, results: aiResults });
              const totalItems = aiResults.reduce((s, sc) => s + (sc.itemCount || sc.rows?.length || 0), 0);
              showToast(`AI found ${aiResults.length} schedule(s) with ${totalItems} items`);
            } else {
              setPdfSchedules({ loading: false, results: [] });
              showToast("No schedules found on this sheet");
            }
          } catch (aiErr) {
            console.warn("AI schedule scan failed:", aiErr);
            setPdfSchedules({ loading: false, results: [] });
            showToast("No schedules found in PDF text or via AI");
          }
        } else {
          setPdfSchedules({ loading: false, results: [] });
          showToast("No schedules found. Select a drawing to try AI detection.");
        }
      }
    } catch (err) {
      console.error("Schedule scan error:", err);
      setPdfSchedules({ loading: false, results: null });
      showToast("Schedule scan failed: " + (err.message || "unknown error"), "error");
    }
  }, []);

  // ─── 4. Geometry Analysis ────────────────────────────────────────
  const runGeometryAnalysis = useCallback(async () => {
    const selectedDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    const drawings = useDrawingPipelineStore.getState().drawings;
    const showToast = useUiStore.getState().showToast;

    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing || drawing.type !== "pdf" || !drawing.data) {
      showToast("Select a PDF drawing to analyze geometry", "error");
      return;
    }
    setGeoAnalysis({ loading: true, results: null });
    try {
      const t0 = performance.now();
      const result = await analyzeDrawingGeometry(drawing);
      result._runtime = (performance.now() - t0) / 1000;
      setGeoAnalysis({ loading: false, results: result });
      const s = result.stats;
      const mode = result.drawingMode?.mode || "unknown";
      if (mode === "framing") {
        showToast("Framing plan detected — wall detection not supported on this sheet", "warning");
      } else {
        showToast(`${mode === "residential" ? "\u{1F3E0}" : "\u{1F3E2}"} ${s.totalWalls} walls, ${s.totalRooms} rooms, ${s.totalOpenings} openings (${result._runtime.toFixed(2)}s)`);
      }
    } catch (err) {
      console.error("Geometry analysis error:", err);
      setGeoAnalysis({ loading: false, results: null });
      showToast("Geometry analysis failed: " + (err.message || "unknown error"), "error");
    }
  }, []);

  return {
    // State
    aiDrawingAnalysis,
    setAiDrawingAnalysis,
    wallSchedule,
    setWallSchedule,
    pdfSchedules,
    setPdfSchedules,
    geoAnalysis,
    setGeoAnalysis,
    // Actions
    runDrawingAnalysis,
    acceptDrawingItem,
    acceptAllDrawingItems,
    aiToCanvasCoords,
    runWallScheduleDetection,
    createWallInstances,
    runPdfScheduleScan,
    runGeometryAnalysis,
  };
}
