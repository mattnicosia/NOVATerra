// ═══════════════════════════════════════════════════════════════════════════════
// Upload Pipeline — standalone upload processing utilities
// Extracted from DocumentsPage so they can be used from the combined Discovery page.
// All store access uses .getState() so these work as plain functions.
// ═══════════════════════════════════════════════════════════════════════════════
import { useDocumentsStore } from '@/stores/documentsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useNovaStore } from '@/stores/novaStore';
import { useModelStore } from '@/stores/modelStore';
import { useUiStore } from '@/stores/uiStore';
import { uid, nowStr } from '@/utils/format';
import { callAnthropic, optimizeImageForAI, imageBlock } from '@/utils/ai';
import { loadPdfJs } from '@/utils/pdf';
import { arrayBufferToBase64, matchScaleKey, renderPdfPage, classifyFile, isDuplicateFile } from '@/utils/drawingUtils';
import { detectBuildingOutline, outlineToFeet, computePolygonArea } from '@/utils/outlineDetector';
import { runFullScan } from '@/utils/scanRunner';

// ─── Extract drawing pages from a file (PDF or image) ──────────────────────
export async function extractDrawingPages(file) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    const data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    const d = {
      id: uid(), label: file.name.replace(/\.[^.]+$/, ""),
      sheetNumber: "", sheetTitle: "", revision: "0", type: "image",
      data, fileName: file.name, uploadDate: nowStr(),
      pdfPage: null, totalPdfPages: null,
    };
    const cur = useDrawingsStore.getState().drawings;
    useDrawingsStore.getState().setDrawings([...cur, d]);
    return [d.id];
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  await loadPdfJs();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const newDrawings = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    newDrawings.push({
      id: uid(), label: `${file.name.replace(/\.pdf$/i, "")}-Pg${p}`,
      sheetNumber: "", sheetTitle: "", revision: "0", type: "pdf",
      data: base64, fileName: file.name, uploadDate: nowStr(),
      pdfPage: p, totalPdfPages: pdf.numPages,
    });
  }
  const cur = useDrawingsStore.getState().drawings;
  useDrawingsStore.getState().setDrawings([...cur, ...newDrawings]);
  newDrawings.forEach(d => renderPdfPage(d));
  return newDrawings.map(d => d.id);
}

// ─── Auto-label drawings via AI ─────────────────────────────────────────────
export async function autoLabelDrawings(drawingIds) {
  const allDrawings = useDrawingsStore.getState().drawings;
  const curScales = useDrawingsStore.getState().drawingScales;
  const targets = drawingIds
    ? allDrawings.filter(d => drawingIds.includes(d.id) && d.data)
    : allDrawings.filter(d => d.data && (!d.sheetNumber || !d.sheetTitle || !curScales[d.id]));

  if (targets.length === 0) return { count: 0, scaleCount: 0 };

  useDrawingsStore.getState().setAiLabelLoading(true);
  useDrawingsStore.getState().setAutoLabelProgress({ current: 0, total: targets.length });
  useNovaStore.getState().startTask('label', `Labeling ${targets.length} drawings...`);

  let count = 0, scaleCount = 0, failCount = 0, lastErr = '';
  let metadataExtracted = false;

  for (let i = 0; i < targets.length; i++) {
    const d = targets[i];
    useDrawingsStore.getState().setAutoLabelProgress({ current: i + 1, total: targets.length });
    useNovaStore.getState().updateProgress(Math.round((i + 1) / targets.length * 100), `Labeling sheet ${i + 1}/${targets.length}...`);

    try {
      let imgData;
      const curCanvases = useDrawingsStore.getState().pdfCanvases;
      if (d.type === "pdf") { imgData = curCanvases[d.id] || await renderPdfPage(d); } else { imgData = d.data; }
      if (!imgData) continue;

      const isFirstSheet = i === 0 && !metadataExtracted;
      const labelPrompt = isFirstSheet
        ? `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.\n\nFind and return:\n1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.\n3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).\n\nALSO extract project-level information from the title block:\n4. Project name — the full project name\n5. Architect — the architect or design firm name\n6. Client/Owner — the client or owner name\n7. Address — the project street address, city, state\n8. Project number — the project number or job number\n9. Engineer — the structural or MEP engineer firm name\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\"","projectName":"RIVERSIDE APARTMENTS","architect":"Smith & Associates Architects","client":"ABC Development Corp","address":"123 Main St, Portland, OR 97201","projectNumber":"2024-0156","engineer":"XYZ Engineering"}\nIf you can't read a field, use null for that field.`
        : `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.\n\nFind and return:\n1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.\n3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\""}\nIf you can't read a field, use null for that field.`;

      const optimized = await optimizeImageForAI(imgData, 1200);
      const text = await callAnthropic({
        max_tokens: isFirstSheet ? 600 : 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: optimized.base64 } },
          { type: "text", text: labelPrompt }
        ] }],
      });

      failCount = 0;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.number && !d.sheetNumber) { useDrawingsStore.getState().updateDrawing(d.id, "sheetNumber", parsed.number); count++; }
        if (parsed.title && !d.sheetTitle) { useDrawingsStore.getState().updateDrawing(d.id, "sheetTitle", parsed.title); count++; }
        if (parsed.scale) {
          const scaleKey = matchScaleKey(parsed.scale);
          const latestScales = useDrawingsStore.getState().drawingScales;
          if (scaleKey && !latestScales[d.id]) {
            useDrawingsStore.getState().setDrawingScales({ ...latestScales, [d.id]: scaleKey });
            scaleCount++;
          } else if (!scaleKey) {
            useDrawingsStore.getState().updateDrawing(d.id, "detectedScale", parsed.scale);
          }
        }

        // Extract project metadata from first sheet's title block
        if (isFirstSheet) {
          metadataExtracted = true;
          try {
            const proj = useProjectStore.getState().project;
            const updates = {};
            const detected = { ...(proj.autoDetected || {}) };
            let metaCount = 0;

            if (parsed.projectName && (!proj.name || proj.name === "New Estimate")) {
              updates.name = parsed.projectName; detected.name = true; metaCount++;
            }
            if (parsed.architect && !proj.architect) {
              updates.architect = parsed.architect; detected.architect = true; metaCount++;
            }
            if (parsed.client && !proj.client) {
              updates.client = parsed.client; detected.client = true; metaCount++;
            }
            if (parsed.address && !proj.address) {
              updates.address = parsed.address; detected.address = true; metaCount++;
            }
            if (parsed.projectNumber && !proj.projectNumber) {
              updates.projectNumber = parsed.projectNumber; detected.projectNumber = true; metaCount++;
            }
            if (parsed.engineer && !proj.engineer) {
              updates.engineer = parsed.engineer; detected.engineer = true; metaCount++;
            }

            if (metaCount > 0) {
              updates.autoDetected = detected;
              useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
              try {
                const estId = useEstimatesStore.getState().activeEstimateId;
                if (estId) {
                  const indexUpdates = {};
                  if (updates.name) indexUpdates.name = updates.name;
                  if (updates.client) indexUpdates.client = updates.client;
                  if (updates.architect) indexUpdates.architect = updates.architect;
                  useEstimatesStore.getState().updateIndexEntry(estId, indexUpdates);
                }
              } catch { /* non-critical */ }
            }
          } catch { /* metadata extraction non-critical */ }
        }
      } catch { /* parse failed */ }
    } catch (e) {
      failCount++;
      lastErr = e.message || 'Unknown error';
      if (failCount >= 3) break;
    }
  }

  if (failCount >= 3) {
    useNovaStore.getState().failTask(lastErr);
    useNovaStore.getState().notify(`Labeling failed: ${lastErr}`, 'warn');
  } else {
    const parts = [];
    if (count > 0) parts.push(`${count} labels`);
    if (scaleCount > 0) parts.push(`${scaleCount} scales`);
    const resultMsg = parts.length > 0 ? `Detected ${parts.join(" & ")}` : `Processed ${targets.length} sheets`;
    useNovaStore.getState().completeTask(resultMsg);
    useNovaStore.getState().notify(resultMsg, 'success');
  }

  // Post-label: infer building params from sheet titles
  try {
    const labeledDrawings = useDrawingsStore.getState().drawings;
    const proj = useProjectStore.getState().project;

    if (!proj.floorCount || parseInt(proj.floorCount) === 0) {
      const floorPlanTitles = [];
      let hasBasement = false, hasLoft = false, hasMezzanine = false;

      labeledDrawings.forEach(d => {
        const title = (d.sheetTitle || "").toLowerCase();
        const isPlan = /\bplan\b/i.test(title) || /\bfloor\b/i.test(title) || /\blevel\b/i.test(title) || /\blayout\b/i.test(title);
        const isExcluded = /\b(elevation|section|detail|schedule|note|diagram|spec|roof\s*plan|site\s*plan|framing|foundation|reflected|ceiling)\b/i.test(title);
        if (!isPlan || isExcluded) return;

        if (/\b(first|1st|ground|main)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 1, title });
        else if (/\b(second|2nd|upper)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 2, title });
        else if (/\b(third|3rd)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 3, title });
        else if (/\b(fourth|4th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 4, title });
        else if (/\b(fifth|5th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 5, title });
        else {
          const numMatch = title.match(/(?:floor|level|fl)\s*(\d+)/i);
          if (numMatch) floorPlanTitles.push({ floor: parseInt(numMatch[1]), title });
        }

        if (/\b(basement|lower\s*level|sub\s*grade|below\s*grade)\b/i.test(title) && /\bplan\b/i.test(title)) hasBasement = true;
        if (/\bloft\b/i.test(title)) hasLoft = true;
        if (/\bmezzanine\b/i.test(title)) hasMezzanine = true;
      });

      const uniqueFloors = [...new Set(floorPlanTitles.map(f => f.floor))].sort((a, b) => a - b);
      const maxFloor = uniqueFloors.length > 0 ? Math.max(...uniqueFloors) : 0;

      if (maxFloor > 0) {
        const floors = [];
        if (hasBasement) floors.push({ label: "Basement", height: 10 });
        for (let i = 1; i <= maxFloor; i++) floors.push({ label: `Floor ${i}`, height: 10 });
        if (hasLoft) floors.push({ label: "Loft", height: 8 });
        if (hasMezzanine) floors.push({ label: "Mezzanine", height: 10 });
        const updates = {
          floorCount: String(maxFloor + (hasLoft ? 0.5 : 0) + (hasMezzanine ? 0.5 : 0)),
          basementCount: hasBasement ? "1" : "",
          floors,
          autoDetected: { ...(proj.autoDetected || {}), floorCount: true },
        };
        useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
      }
    }

    // Auto-extract zip from detected address
    if (proj.address && (!proj.zipCode || proj.zipCode.length < 5)) {
      const zipMatch = proj.address.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (zipMatch) {
        useProjectStore.getState().setProject({
          ...useProjectStore.getState().project,
          zipCode: zipMatch[1],
          autoDetected: { ...(useProjectStore.getState().project.autoDetected || {}), zipCode: true },
        });
      }
    }
  } catch { /* inference non-critical */ }

  useDrawingsStore.getState().setAiLabelLoading(false);
  useDrawingsStore.getState().setAutoLabelProgress(null);
  return { count, scaleCount };
}

// ─── Auto-detect building outlines ──────────────────────────────────────────
export async function autoDetectOutlines() {
  const allDrawings = useDrawingsStore.getState().drawings;
  const existingOutlines = useModelStore.getState().outlines;

  const floorPlanPatterns = [/floor\s*plan/i, /site\s*plan/i, /ground\s*floor/i, /first\s*floor/i, /second\s*floor/i, /third\s*floor/i, /main\s*level/i, /level\s*\d/i, /basement/i, /lower\s*level/i, /upper\s*level/i, /mezzanine/i, /penthouse/i, /^A-?\d/i, /^A\d{2,3}/i, /^L\d/i, /plan\s*view/i];
  let candidates = allDrawings.filter(d => {
    if (existingOutlines[d.id]) return false;
    if (!d.data) return false;
    const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
    return floorPlanPatterns.some(p => p.test(label));
  });

  if (candidates.length === 0) {
    const excludePatterns = [/elevation/i, /section/i, /detail/i, /schedule/i, /legend/i, /diagram/i, /riser/i, /note/i];
    candidates = allDrawings.filter(d => {
      if (existingOutlines[d.id]) return false;
      if (!d.data) return false;
      const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
      return !excludePatterns.some(p => p.test(label));
    });
  }

  const targets = candidates.slice(0, 3);
  if (targets.length === 0) return 0;

  useNovaStore.getState().startTask('outline', `Detecting building outlines (${targets.length} plans)...`);
  let detected = 0;

  for (let i = 0; i < targets.length; i++) {
    const d = targets[i];
    useNovaStore.getState().updateProgress(Math.round((i + 1) / targets.length * 100), `Tracing outline ${i + 1}/${targets.length}...`);
    try {
      const result = await detectBuildingOutline(d.id);
      if (result.polygon && result.polygon.length >= 3) {
        const feetPolygon = outlineToFeet(result.polygon, d.id);
        useModelStore.getState().setOutline(d.id, feetPolygon, 'ai', result.polygon);
        detected++;
        const area = computePolygonArea(feetPolygon);
        if (area > 0 && detected === 1) {
          const curProj = useProjectStore.getState().project;
          if (!curProj.buildingFootprintSF || parseInt(curProj.buildingFootprintSF) === 0) {
            useProjectStore.getState().setProject({
              ...useProjectStore.getState().project,
              buildingFootprintSF: Math.round(area),
              autoDetected: { ...(useProjectStore.getState().project.autoDetected || {}), footprintSF: true },
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Outline detection failed for ${d.sheetNumber || d.id}:`, e.message);
    }
  }

  if (detected > 0) {
    useNovaStore.getState().completeTask(`Detected ${detected} building outline${detected > 1 ? 's' : ''}`);
  } else {
    useNovaStore.getState().completeTask('No outlines detected');
  }
  return detected;
}

// ─── Process spec book PDF ──────────────────────────────────────────────────
export async function processSpecBook(file) {
  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
  useSpecsStore.getState().setSpecPdf({ name: file.name, data });
  const base64 = data.split(",")[1];
  if (!base64 || base64.length < 100) return 0;

  const text = await callAnthropic({
    max_tokens: 8000,
    messages: [{ role: "user", content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: `You are a construction specification parser. Analyze this spec book and extract ALL CSI specification sections you can find.\n\nFor each section provide:\n- section: The CSI section number (format: "XX XX XX" e.g. "09 30 00")\n- title: Section title\n- summary: 1-2 sentence summary of key requirements, products, manufacturers\n- page: Approximate page number in the document\n\nCRITICAL: Respond with ONLY a JSON array. No markdown fences, no backticks, no explanation text. Just the raw JSON array.\n\nFocus on sections with actual specification content (Part 1/2/3), not the table of contents or front matter. Extract every section you find.` }
    ] }],
  });

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      const newSpecs = parsed.map(s => ({
        id: uid(), section: s.section || "", title: s.title || "",
        summary: s.summary || "", page: s.page || null,
        requirements: [], allocated: false,
      }));
      const curSpecs = useSpecsStore.getState().specs;
      useSpecsStore.getState().setSpecs([...curSpecs, ...newSpecs]);
      return newSpecs.length;
    }
  } catch { /* parse failed */ }
  return 0;
}

// ─── AI document classification ─────────────────────────────────────────────
export async function aiClassifyDocument(file) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "general";

  try {
    const arrayBuffer = await file.arrayBuffer();
    await loadPdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pg = await pdf.getPage(1);
    const vp = pg.getViewport({ scale: 0.75 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    const imgDataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const imgBase64 = imgDataUrl.split(",")[1];

    const text = await callAnthropic({
      max_tokens: 100,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } },
        { type: "text", text: `Classify this document page. Is it:\n1. "drawing" — a construction blueprint, plan, elevation, section, or detail drawing\n2. "specification" — a written specification document, project manual, or bid document\n3. "general" — any other document type\n\nRespond with ONLY one word: drawing, specification, or general` }
      ] }],
    });

    const result = text.trim().toLowerCase();
    if (result.includes("drawing")) return "drawing";
    if (result.includes("specification") || result.includes("spec")) return "specification";
    return "general";
  } catch {
    return "general";
  }
}

// ─── Main upload orchestrator ───────────────────────────────────────────────
// Processes files: classifies, extracts, labels, scans, detects outlines.
// options.onScanComplete: called when scan finishes (e.g., to show results modal)
// options.navigate: router navigate function (for setup mode redirect)
// options.showToast: toast notification function
export async function handleFileUpload(files, options = {}) {
  if (!files || files.length === 0) return;

  const showToast = options.showToast || useUiStore.getState().showToast;
  const drawingDocIds = [];
  const specDocIds = [];

  for (const file of files) {
    const currentDocs = useDocumentsStore.getState().documents;
    if (isDuplicateFile(file.name, currentDocs)) {
      showToast(`${file.name} already uploaded — skipping`, "warn");
      continue;
    }

    let docType = classifyFile(file.name, file.type, file.size);

    // AI classification for ambiguous PDFs
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (docType === "general" && isPdf) {
      try {
        const aiType = await Promise.race([
          aiClassifyDocument(file),
          new Promise(resolve => setTimeout(() => resolve("general"), 15000)),
        ]);
        if (aiType !== "general") docType = aiType;
      } catch { /* classification non-critical */ }
    }

    const doc = useDocumentsStore.getState().addDocument({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      docType,
      processingStatus: "processing",
      processingMessage: docType === "drawing" ? "Extracting pages..." : docType === "specification" ? "Parsing specifications..." : "Stored",
    });

    if (docType === "drawing") {
      try {
        const drawingIds = await extractDrawingPages(file);
        useDocumentsStore.getState().updateDocument(doc.id, {
          processingMessage: `${drawingIds.length} pages extracted — labeling...`,
          pageCount: drawingIds.length,
          drawingIds,
        });
        drawingDocIds.push({ docId: doc.id, drawingIds });
        showToast(`${file.name}: ${drawingIds.length} sheets extracted`);
      } catch (err) {
        useDocumentsStore.getState().updateDocument(doc.id, { processingStatus: "error", processingError: err.message, processingMessage: "Extraction failed" });
        showToast(`${file.name}: extraction failed — ${err.message}`, "error");
      }
    } else if (docType === "specification") {
      try {
        const sectionCount = await processSpecBook(file);
        useDocumentsStore.getState().updateDocument(doc.id, {
          processingStatus: "complete",
          processingMessage: `${sectionCount} sections parsed`,
        });
        specDocIds.push(doc.id);
        showToast(`${file.name}: ${sectionCount} spec sections parsed`);
      } catch (err) {
        useDocumentsStore.getState().updateDocument(doc.id, { processingStatus: "error", processingError: err.message, processingMessage: "Parse failed" });
        showToast(`${file.name}: spec parse failed — ${err.message}`, "error");
      }
    } else {
      const data = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => res(null);
        r.readAsDataURL(file);
      });
      useDocumentsStore.getState().updateDocument(doc.id, {
        data,
        processingStatus: "complete",
        processingMessage: "Stored",
      });
    }
  }

  // Auto-label + auto-scan + outline detection for drawings
  if (drawingDocIds.length > 0) {
    const allNewDrawingIds = drawingDocIds.flatMap(d => d.drawingIds);

    // Step 1: Auto-label
    for (const { docId } of drawingDocIds) {
      useDocumentsStore.getState().updateDocument(docId, { processingMessage: "NOVA labeling sheets..." });
    }
    try {
      await autoLabelDrawings(allNewDrawingIds);
      for (const { docId } of drawingDocIds) {
        useDocumentsStore.getState().updateDocument(docId, { processingMessage: "Labeled — scanning for schedules..." });
      }
    } catch (err) {
      for (const { docId } of drawingDocIds) {
        useDocumentsStore.getState().updateDocument(docId, { processingMessage: `Label failed: ${err.message}` });
      }
    }

    // Step 2: Auto-scan
    try {
      await runFullScan({
        onComplete: () => { if (options.onScanComplete) options.onScanComplete(); },
      });
      for (const { docId, drawingIds } of drawingDocIds) {
        const count = drawingIds.length;
        const sr = (await import('@/stores/scanStore')).useScanStore.getState().scanResults;
        const schedCount = sr?.schedules?.length || 0;
        const romRange = sr?.rom?.totals ? `ROM $${Math.round(sr.rom.totals.low / 1000)}K–$${Math.round(sr.rom.totals.high / 1000)}K` : "";
        useDocumentsStore.getState().updateDocument(docId, {
          processingStatus: "complete",
          processingMessage: `${count} sheets • ${schedCount} schedules${romRange ? ` • ${romRange}` : ""}`,
        });
      }
    } catch (err) {
      for (const { docId, drawingIds } of drawingDocIds) {
        useDocumentsStore.getState().updateDocument(docId, {
          processingStatus: "complete",
          processingMessage: `${drawingIds.length} sheets labeled (scan skipped)`,
        });
      }
    }

    // Step 3: Outline detection (non-blocking)
    try { await autoDetectOutlines(); } catch { /* non-critical */ }

    // Complete setup mode
    if (useProjectStore.getState().project.setupComplete === false) {
      useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
    }

    // Navigate to Discovery (only used in setup mode from DocumentsPage)
    if (options.navigate) {
      const estId = useEstimatesStore.getState().activeEstimateId;
      if (estId) options.navigate(`/estimate/${estId}/plans`);
    }
  }
}
