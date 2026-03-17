// ═══════════════════════════════════════════════════════════════════════════════
// Upload Pipeline — standalone upload processing utilities
// Extracted from DocumentsPage so they can be used from the combined Discovery page.
// All store access uses .getState() so these work as plain functions.
// ═══════════════════════════════════════════════════════════════════════════════
import { useDocumentsStore } from "@/stores/documentsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useNovaStore } from "@/stores/novaStore";
import { useModelStore } from "@/stores/modelStore";
import { useUiStore } from "@/stores/uiStore";
import { useGroupsStore } from "@/stores/groupsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { uid, nowStr } from "@/utils/format";
import { callAnthropic, optimizeImageForAI, imageBlock } from "@/utils/ai";
import { loadPdfJs } from "@/utils/pdf";
import { matchScaleKey, renderPdfPage, classifyFile, isDuplicateFile } from "@/utils/drawingUtils";
import { detectBuildingOutline, outlineToFeet, computePolygonArea } from "@/utils/outlineDetector";
import { runFullScan } from "@/utils/scanRunner";

// Cache raw PDF arrayBuffers for vector/text extraction (keyed by fileName)
// Lives for the session — PDFs from previous sessions won't be cached.
export const pdfRawCache = new Map();

// ─── Persist raw PDF to separate IDB key (one copy per PDF, not per page) ────
// This avoids the N×M duplication problem where pdfRawBase64 was on every drawing page.
const PDF_RAW_DB = "bldg-pdf-raw";
const PDF_RAW_STORE = "pdfs";

function openPdfRawDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PDF_RAW_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PDF_RAW_STORE)) {
        req.result.createObjectStore(PDF_RAW_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfRawToIDB(fileName, arrayBuffer) {
  try {
    const db = await openPdfRawDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_RAW_STORE, "readwrite");
      tx.objectStore(PDF_RAW_STORE).put(arrayBuffer, fileName);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[savePdfRawToIDB] Failed:", err.message);
  }
}

export async function loadPdfRawFromIDB(fileName) {
  try {
    const db = await openPdfRawDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_RAW_STORE, "readonly");
      const req = tx.objectStore(PDF_RAW_STORE).get(fileName);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ─── Infer drawing view type from sheet title ──────────────────────────────
export function inferViewType(title) {
  const t = title || "";
  if (/\belevation\b/i.test(t)) return "elevation";
  if (/\bsection\b/i.test(t)) return "section";
  if (/\bdetail\b/i.test(t)) return "detail";
  const isPlan = /\b(plan|floor|level|layout)\b/i.test(t);
  const exclude = /\b(roof\s*plan|site\s*plan|foundation|reflected|ceiling|framing)\b/i.test(t);
  if (isPlan && !exclude) return "plan";
  return null;
}

// ─── Compress large image during import ─────────────────────────────────────
function compressImportImage(dataUrl, maxDim = 4096, quality = 0.85) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let w = img.width,
        h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      try {
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── Extract drawing pages from a file (PDF or image) ──────────────────────
// PDF pages are rendered to JPEG at import time (scale 1.5 = ~108 DPI).
// This eliminates the N×M problem where raw PDF base64 was duplicated per page,
// reducing a 50MB PDF × 20 pages from ~1.34GB of JSON to ~8MB of JPEGs.
export async function extractDrawingPages(file, options = {}) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    let data = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    // Compress large images (>5MB data URL) during import
    if (data.length > 5_000_000) {
      data = await compressImportImage(data, 4096, 0.85);
    }
    const d = {
      id: uid(),
      label: file.name.replace(/\.[^.]+$/, ""),
      sheetNumber: "",
      sheetTitle: "",
      revision: "0",
      type: "image",
      data,
      fileName: file.name,
      uploadDate: nowStr(),
      pdfPage: null,
      totalPdfPages: null,
      isRendering: !!options.isRendering,
      renderingScale: "",
      renderingNotes: "",
    };
    const cur = useDrawingsStore.getState().drawings;
    useDrawingsStore.getState().setDrawings([...cur, d]);
    return [d.id];
  }

  // ── PDF: render each page to JPEG instead of storing raw PDF base64 ──
  const arrayBuffer = await file.arrayBuffer();
  // CRITICAL: store copies — IDB put() can detach the original ArrayBuffer
  pdfRawCache.set(file.name, arrayBuffer.slice(0));
  // Persist to separate IDB key (one copy per PDF, not duplicated per page)
  savePdfRawToIDB(file.name, arrayBuffer.slice(0)).catch(err =>
    console.warn("[extractDrawingPages] Failed to persist raw PDF to IDB:", err.message)
  );
  await loadPdfJs();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const numPages = pdf.numPages;
  const newIds = [];

  for (let p = 1; p <= numPages; p++) {
    try {
      // Render page to canvas → JPEG at scale 1.5 (matches PDF_RENDER_DPI = 108)
      const pg = await pdf.getPage(p);
      const scale = 1.5;
      const vp = pg.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);

      const drawing = {
        id: uid(),
        label: `${file.name.replace(/\.pdf$/i, "")}-Pg${p}`,
        sheetNumber: "",
        sheetTitle: "",
        revision: "0",
        type: "pdf",
        pdfPreRendered: true,
        data: jpegDataUrl,
        // pdfRawBase64 no longer stored per-page — raw PDF persisted in separate IDB (bldg-pdf-raw)
        fileName: file.name,
        uploadDate: nowStr(),
        pdfPage: p,
        totalPdfPages: numPages,
        isRendering: !!options.isRendering,
        renderingScale: "",
        renderingNotes: "",
      };

      // Progressive: add each page to store immediately so UI shows pages appearing
      const cur = useDrawingsStore.getState().drawings;
      useDrawingsStore.getState().setDrawings([...cur, drawing]);

      // Cache in pdfCanvases for immediate display (renderPdfPage will use this)
      useDrawingsStore.setState(s => ({
        pdfCanvases: { ...s.pdfCanvases, [drawing.id]: jpegDataUrl },
      }));

      newIds.push(drawing.id);
    } catch (err) {
      console.warn(`[extractDrawingPages] Failed to render page ${p}/${numPages}:`, err.message);
    }
  }

  return newIds;
}

// ─── Repair raw PDF data for existing pdfPreRendered drawings ────────────────
// When drawings were uploaded before pdfRawBase64 persistence was added,
// this function accepts a PDF File and attaches raw base64 to all matching drawings.
// This enables predictive takeoffs (text extraction) on legacy drawings.
export async function repairRawPdf(file) {
  try {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return 0;
    const arrayBuffer = await file.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error("[repairRawPdf] File read returned empty buffer!");
      return 0;
    }
    console.log(`[repairRawPdf] File "${file.name}" read: ${arrayBuffer.byteLength} bytes`);

    // CRITICAL: store COPIES — IDB put() can detach the original ArrayBuffer
    const cacheCopy = arrayBuffer.slice(0);
    const idbCopy = arrayBuffer.slice(0);
    pdfRawCache.set(file.name, cacheCopy);
    console.log(`[repairRawPdf] Cache set, verify: byteLength=${pdfRawCache.get(file.name)?.byteLength}`);

    // Persist to IDB (cross session) — AWAIT to ensure it completes
    try {
      await savePdfRawToIDB(file.name, idbCopy);
      console.log(`[repairRawPdf] IDB save succeeded`);
    } catch (err) {
      console.warn("[repairRawPdf] IDB persist failed (non-critical):", err.message);
    }

    // Find all matching pdfPreRendered drawings and invalidate their extraction cache
    // Match flexibly: exact match, or base name match (ignoring path differences)
    const drawings = useDrawingsStore.getState().drawings;
    const selectedBase = file.name.replace(/\.pdf$/i, "").toLowerCase();
    let repaired = 0;
    console.log(`[repairRawPdf] Looking for drawings matching "${file.name}" (base: "${selectedBase}")`);
    console.log(`[repairRawPdf] All pdfPreRendered drawings:`, drawings.filter(d => d.pdfPreRendered).map(d => d.fileName));
    try {
      const { invalidateCache } = await import("@/utils/pdfExtractor");
      for (const d of drawings) {
        if (!d.pdfPreRendered) continue;
        const drawingBase = (d.fileName || "").replace(/\.pdf$/i, "").toLowerCase();
        // Match: exact, base name match, or no fileName on drawing
        const matches = d.fileName === file.name
          || drawingBase === selectedBase
          || selectedBase.includes(drawingBase)
          || drawingBase.includes(selectedBase)
          || !d.fileName;
        if (matches) {
          repaired++;
          invalidateCache(d.id);
          // Also cache under the drawing's fileName if different from file.name
          if (d.fileName && d.fileName !== file.name) {
            pdfRawCache.set(d.fileName, cacheCopy.slice(0));
            savePdfRawToIDB(d.fileName, cacheCopy.slice(0)).catch(() => {});
          }
        }
      }
    } catch (importErr) {
      repaired = drawings.filter(d => d.pdfPreRendered).length;
      console.warn("[repairRawPdf] Cache invalidation skipped:", importErr.message);
    }

    console.log(`[repairRawPdf] Cached raw PDF and repaired ${repaired} drawings from "${file.name}"`);
    return repaired;
  } catch (err) {
    console.error("[repairRawPdf] Failed:", err);
    return 0;
  }
}

// ─── Revision Detection ─────────────────────────────────────────────────────
// After autoLabel completes, check if any newly labeled drawings match existing
// sheets — indicating a revision/addendum upload.

function isHigherRevision(oldRev, newRev) {
  if (!newRev) return false;
  if (!oldRev) return true; // any revision > no revision
  const oNum = parseInt(oldRev, 10);
  const nNum = parseInt(newRev, 10);
  // Both numeric
  if (!isNaN(oNum) && !isNaN(nNum)) return nNum > oNum;
  // Both alpha
  if (isNaN(oNum) && isNaN(nNum)) return newRev.toUpperCase() > oldRev.toUpperCase();
  // Mixed: numeric old + alpha new (post-IFC transition) or vice versa
  return true;
}

export function detectRevisions(newDrawingIds) {
  const ds = useDrawingsStore.getState();
  const allDrawings = ds.drawings;

  // Build a local sheet index from NON-superseded, NON-new drawings
  const newIdSet = new Set(newDrawingIds);
  const sheetIdx = {};
  allDrawings.forEach(d => {
    if (d.sheetNumber && !d.superseded && !newIdSet.has(d.id)) {
      sheetIdx[d.sheetNumber] = d.id;
      const clean = d.sheetNumber.replace(/[-\s]/g, "");
      if (clean !== d.sheetNumber) sheetIdx[clean] = d.id;
    }
  });

  const report = [];
  for (const newId of newDrawingIds) {
    const newDwg = allDrawings.find(d => d.id === newId);
    if (!newDwg || !newDwg.sheetNumber) continue;

    const existingId = sheetIdx[newDwg.sheetNumber]
      || sheetIdx[newDwg.sheetNumber.replace(/[-\s]/g, "")];
    if (!existingId) continue;

    const existing = allDrawings.find(d => d.id === existingId);
    if (!existing || existing.superseded) continue;

    // Only flag as revision if revision number is higher (or old has none)
    if (!isHigherRevision(existing.revision, newDwg.revision)) continue;

    // Supersede the old drawing
    ds.supersedeDrawing(existing.id, newDwg.id, newDwg.addendumNumber || null);

    report.push({
      oldDrawingId: existing.id,
      newDrawingId: newDwg.id,
      sheetNumber: newDwg.sheetNumber,
      sheetTitle: newDwg.sheetTitle || newDwg.label || "",
      oldRevision: existing.revision || "0",
      newRevision: newDwg.revision || "?",
      revisionDate: newDwg.revisionDate || null,
      description: newDwg.revisionDescription || null,
    });
  }

  return report;
}

// ─── Revision Impact Analysis ───────────────────────────────────────────────
// Given a revision report, find all takeoffs with measurements on superseded drawings.

export function analyzeRevisionImpact(revisionReport) {
  const { takeoffs } = useTakeoffsStore.getState();
  const groups = useGroupsStore.getState().groups;
  const impact = [];

  for (const rev of revisionReport) {
    const affectedTakeoffs = takeoffs.filter(t =>
      (t.measurements || []).some(m => m.sheetId === rev.oldDrawingId),
    );

    if (affectedTakeoffs.length > 0) {
      impact.push({
        ...rev,
        affectedTakeoffs: affectedTakeoffs.map(t => {
          const onSheet = (t.measurements || []).filter(m => m.sheetId === rev.oldDrawingId).length;
          const total = (t.measurements || []).length;
          return {
            id: t.id,
            description: t.description,
            unit: t.unit,
            group: t.group,
            groupName: groups.find(g => g.id === t.group)?.name || "Base Bid",
            divisionCode: (t.code || "").split(" ")[0] || null,
            measurementCount: onSheet,
            totalMeasurements: total,
            exposurePercent: Math.round((onSheet / Math.max(total, 1)) * 100),
          };
        }),
      });
    }
  }

  const totalAffectedItems = new Set(impact.flatMap(i => i.affectedTakeoffs.map(t => t.id))).size;
  const affectedDivisions = [...new Set(
    impact.flatMap(i => i.affectedTakeoffs.map(t => t.divisionCode).filter(Boolean)),
  )].sort();
  const affectedGroups = [...new Set(
    impact.flatMap(i => i.affectedTakeoffs.map(t => t.groupName).filter(Boolean)),
  )];

  return {
    sheets: impact,
    summary: {
      totalRevisedSheets: revisionReport.length,
      sheetsWithImpact: impact.length,
      totalAffectedItems,
      affectedDivisions,
      affectedGroups,
    },
  };
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
  useNovaStore.getState().startTask("label", `Labeling ${targets.length} drawings...`);

  let count = 0,
    scaleCount = 0,
    failCount = 0,
    lastErr = "";
  let metadataExtracted = false;
  let metadataComplete = false; // true once architect + projectName found

  for (let i = 0; i < targets.length; i++) {
    const d = targets[i];
    useDrawingsStore.getState().setAutoLabelProgress({ current: i + 1, total: targets.length });
    useNovaStore
      .getState()
      .updateProgress(Math.round(((i + 1) / targets.length) * 100), `Labeling sheet ${i + 1}/${targets.length}...`);

    try {
      let imgData;
      const curCanvases = useDrawingsStore.getState().pdfCanvases;
      if (d.type === "pdf") {
        imgData = curCanvases[d.id] || (await renderPdfPage(d));
      } else {
        imgData = d.data;
      }
      if (!imgData) continue;

      // Extract metadata from first 3 sheets until we have architect + projectName
      const needsMetadata = !metadataComplete && i < 3;
      const labelPrompt = needsMetadata
        ? `This is a construction blueprint/drawing. Carefully examine the ENTIRE drawing, especially:\n- The TITLE BLOCK (bottom-right corner) — this contains the architect/design firm name, project name, sheet info\n- The COVER SHEET info (if this is a cover/title page) — look for a project directory listing consultants\n- Any STAMPS, SEALS, or LOGOS — architect firms typically have their logo/name prominently displayed\n\nThe architect/design firm is usually the MOST PROMINENT firm name in the title block. It often includes words like "Architects", "Architecture", "Design", "Planning", "A/E", "Associates", or "Group". Their name, address, and license number typically appear together. Do NOT confuse the architect with the structural engineer, MEP engineer, or owner/client.\n\nOn cover sheets, look for a "Project Directory", "Project Team", or "Consultants" section that lists Architect, Structural Engineer, MEP Engineer, etc.\n\nFind and return:\n1. Sheet number — formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — e.g. "FIRST FLOOR PLAN", "COVER SHEET", etc.\n3. Scale — exactly as shown (e.g. 1/4" = 1'-0"). Use the primary/plan scale if multiple shown.\n4. Project name — the full project name\n5. Architect — the architect or design firm name (the PRIMARY design firm, not engineers)\n6. Client/Owner — the client or building owner name\n7. Address — the project street address, city, state\n8. Project number — the project/job number\n9. Engineer — the structural or MEP engineer firm name\n\nAlso check the REVISION BLOCK (usually a small table in the title block area) for:\n10. Revision number — the LATEST/highest revision entry (e.g. "0", "A", "3", "C", "Rev 2")\n11. Revision date — the date of the latest revision\n12. Revision description — brief description (e.g. "Electrical revisions per addendum #2")\n13. Issued for — the drawing issue status if shown (e.g. "IFC", "IFB", "Permit", "Construction", "Bid", "Review")\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\"","projectName":"RIVERSIDE APARTMENTS","architect":"Smith & Associates Architects","client":"ABC Development Corp","address":"123 Main St, Portland, OR 97201","projectNumber":"2024-0156","engineer":"XYZ Engineering","revision":"2","revisionDate":"2026-03-10","revisionDescription":"Addendum #2 — revised electrical","issuedFor":"IFC"}\nIf you can't read a field, use null for that field.`
        : `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.\n\nFind and return:\n1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.\n3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).\n4. Revision — the latest/highest revision number from the revision block table (e.g. "0", "A", "3"). Return null if no revision block visible.\n5. Issued for — the drawing issue status if shown (e.g. "IFC", "IFB", "Permit", "Construction"). Return null if not shown.\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\"","revision":"2","issuedFor":"IFC"}\nIf you can't read a field, use null for that field.`;

      const optimized = await optimizeImageForAI(imgData, needsMetadata ? 1600 : 1200);
      const text = await callAnthropic({
        max_tokens: needsMetadata ? 700 : 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: optimized.base64 } },
              { type: "text", text: labelPrompt },
            ],
          },
        ],
      });

      failCount = 0;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.number && !d.sheetNumber) {
          useDrawingsStore.getState().updateDrawing(d.id, "sheetNumber", parsed.number);
          count++;
        }
        if (parsed.title && !d.sheetTitle) {
          useDrawingsStore.getState().updateDrawing(d.id, "sheetTitle", parsed.title);
          count++;
          // Infer and persist view type from title
          const vt = inferViewType(parsed.title);
          if (vt) useDrawingsStore.getState().updateDrawing(d.id, "viewType", vt);
        }
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

        // Extract revision metadata from title block
        if (parsed.revision != null) {
          useDrawingsStore.getState().updateDrawing(d.id, "revision", String(parsed.revision));
        }
        if (parsed.revisionDate) {
          useDrawingsStore.getState().updateDrawing(d.id, "revisionDate", parsed.revisionDate);
        }
        if (parsed.revisionDescription) {
          useDrawingsStore.getState().updateDrawing(d.id, "revisionDescription", parsed.revisionDescription);
        }
        if (parsed.issuedFor) {
          useDrawingsStore.getState().updateDrawing(d.id, "issuedFor", parsed.issuedFor);
        }

        // Extract project metadata from title block (tries up to 3 sheets)
        if (needsMetadata) {
          metadataExtracted = true;
          try {
            const proj = useProjectStore.getState().project;
            const updates = {};
            const detected = { ...(proj.autoDetected || {}) };
            let metaCount = 0;

            if (parsed.projectName && (!proj.name || proj.name === "New Estimate")) {
              updates.name = parsed.projectName;
              detected.name = true;
              metaCount++;
            }
            if (parsed.architect && !proj.architect) {
              updates.architect = parsed.architect;
              detected.architect = true;
              metaCount++;
            }
            if (parsed.client && !proj.client) {
              updates.client = parsed.client;
              detected.client = true;
              metaCount++;
            }
            if (parsed.address && !proj.address) {
              updates.address = parsed.address;
              detected.address = true;
              metaCount++;
            }
            if (parsed.projectNumber && !proj.projectNumber) {
              updates.projectNumber = parsed.projectNumber;
              detected.projectNumber = true;
              metaCount++;
            }
            if (parsed.engineer && !proj.engineer) {
              updates.engineer = parsed.engineer;
              detected.engineer = true;
              metaCount++;
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
              } catch {
                /* non-critical */
              }
            }

            // Stop retrying once we have the key fields
            const latestProj = useProjectStore.getState().project;
            if (latestProj.architect && latestProj.address && latestProj.name && latestProj.name !== "New Estimate") {
              metadataComplete = true;
            }
          } catch {
            /* metadata extraction non-critical */
          }
        }
      } catch {
        /* parse failed */
      }
    } catch (e) {
      failCount++;
      lastErr = e.message || "Unknown error";
      if (failCount >= 3) break;
    }
  }

  if (failCount >= 3) {
    useNovaStore.getState().failTask(lastErr);
    useNovaStore.getState().notify(`Labeling failed: ${lastErr}`, "warn");
  } else {
    const parts = [];
    if (count > 0) parts.push(`${count} labels`);
    if (scaleCount > 0) parts.push(`${scaleCount} scales`);
    const resultMsg = parts.length > 0 ? `Detected ${parts.join(" & ")}` : `Processed ${targets.length} sheets`;
    useNovaStore.getState().completeTask(resultMsg);
    useNovaStore.getState().notify(resultMsg, "success");
  }

  // Post-label: infer building params from sheet titles
  try {
    const labeledDrawings = useDrawingsStore.getState().drawings;
    const proj = useProjectStore.getState().project;

    if (!proj.floorCount || parseInt(proj.floorCount) === 0) {
      const floorPlanTitles = [];
      let hasBasement = false,
        hasLoft = false,
        hasMezzanine = false;

      labeledDrawings.forEach(d => {
        const title = (d.sheetTitle || "").toLowerCase();
        const isPlan =
          /\bplan\b/i.test(title) || /\bfloor\b/i.test(title) || /\blevel\b/i.test(title) || /\blayout\b/i.test(title);
        const isExcluded =
          /\b(elevation|section|detail|schedule|note|diagram|spec|roof\s*plan|site\s*plan|framing|foundation|reflected|ceiling)\b/i.test(
            title,
          );
        if (!isPlan || isExcluded) return;

        if (/\b(first|1st|ground|main)\s*(fl|floor|level|plan)\b/i.test(title))
          floorPlanTitles.push({ floor: 1, title });
        else if (/\b(second|2nd|upper)\s*(fl|floor|level|plan)\b/i.test(title))
          floorPlanTitles.push({ floor: 2, title });
        else if (/\b(third|3rd)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 3, title });
        else if (/\b(fourth|4th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 4, title });
        else if (/\b(fifth|5th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 5, title });
        else {
          const numMatch = title.match(/(?:floor|level|fl)\s*(\d+)/i);
          if (numMatch) floorPlanTitles.push({ floor: parseInt(numMatch[1]), title });
        }

        if (/\b(basement|lower\s*level|sub\s*grade|below\s*grade)\b/i.test(title) && /\bplan\b/i.test(title))
          hasBasement = true;
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
  } catch {
    /* inference non-critical */
  }

  // ── Revision Detection (post-label) ──────────────────────────────
  // Check if any newly labeled drawings match existing sheets by sheet number,
  // indicating this is an addendum/revision upload.
  let revisionReport = [];
  try {
    if (drawingIds && drawingIds.length > 0) {
      revisionReport = detectRevisions(drawingIds);
      if (revisionReport.length > 0) {
        // Analyze impact on existing takeoffs
        const impact = analyzeRevisionImpact(revisionReport);
        useUiStore.getState().setRevisionReport(revisionReport);
        useUiStore.getState().setRevisionImpact(impact);

        // Auto-create a revision scenario group
        const addNum = revisionReport[0]?.description?.match(/addendum\s*#?(\d+)/i)?.[1]
          || revisionReport[0]?.newRevision || "?";
        const revGroupId = useGroupsStore.getState().addGroup(
          `Addendum ${addNum}`,
          "revision",
        );
        // Store revision metadata on the group
        useGroupsStore.getState().updateGroup(revGroupId, "description",
          `${revisionReport.length} sheet${revisionReport.length > 1 ? "s" : ""} revised — ${impact.summary.totalAffectedItems} takeoff items affected`,
        );
        useGroupsStore.getState().updateGroup(revGroupId, "revisionReport", revisionReport);
        useGroupsStore.getState().updateGroup(revGroupId, "addendumNumber", addNum);

        // Notify user
        const msg = impact.summary.totalAffectedItems > 0
          ? `Revision detected: ${revisionReport.length} sheet${revisionReport.length > 1 ? "s" : ""} revised → ${impact.summary.totalAffectedItems} takeoff items affected`
          : `Revision detected: ${revisionReport.length} sheet${revisionReport.length > 1 ? "s" : ""} revised (no takeoff items affected yet)`;
        useUiStore.getState().showToast(msg, "info");
        useNovaStore.getState().notify(msg, "info");
      }
    }
  } catch {
    /* revision detection non-critical */
  }

  useDrawingsStore.getState().setAiLabelLoading(false);
  useDrawingsStore.getState().setAutoLabelProgress(null);
  return { count, scaleCount, revisionReport };
}

// ─── Auto-detect building outlines ──────────────────────────────────────────
export async function autoDetectOutlines() {
  const allDrawings = useDrawingsStore.getState().drawings;
  const existingOutlines = useModelStore.getState().outlines;

  const floorPlanPatterns = [
    /floor\s*plan/i,
    /site\s*plan/i,
    /ground\s*floor/i,
    /first\s*floor/i,
    /second\s*floor/i,
    /third\s*floor/i,
    /main\s*level/i,
    /level\s*\d/i,
    /basement/i,
    /lower\s*level/i,
    /upper\s*level/i,
    /mezzanine/i,
    /penthouse/i,
    /^A-?\d/i,
    /^A\d{2,3}/i,
    /^L\d/i,
    /plan\s*view/i,
  ];
  let candidates = allDrawings.filter(d => {
    if (existingOutlines[d.id]) return false;
    if (!d.data) return false;
    const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
    return floorPlanPatterns.some(p => p.test(label));
  });

  if (candidates.length === 0) {
    const excludePatterns = [
      /elevation/i,
      /section/i,
      /detail/i,
      /schedule/i,
      /legend/i,
      /diagram/i,
      /riser/i,
      /note/i,
    ];
    candidates = allDrawings.filter(d => {
      if (existingOutlines[d.id]) return false;
      if (!d.data) return false;
      const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
      return !excludePatterns.some(p => p.test(label));
    });
  }

  const targets = candidates.slice(0, 3);
  if (targets.length === 0) return 0;

  useNovaStore.getState().startTask("outline", `Detecting building outlines (${targets.length} plans)...`);
  let detected = 0;

  for (let i = 0; i < targets.length; i++) {
    const d = targets[i];
    useNovaStore
      .getState()
      .updateProgress(Math.round(((i + 1) / targets.length) * 100), `Tracing outline ${i + 1}/${targets.length}...`);
    try {
      const result = await detectBuildingOutline(d.id);
      if (result.polygon && result.polygon.length >= 3) {
        const feetPolygon = outlineToFeet(result.polygon, d.id);
        useModelStore.getState().setOutline(d.id, feetPolygon, "ai", result.polygon);
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
    useNovaStore.getState().completeTask(`Detected ${detected} building outline${detected > 1 ? "s" : ""}`);
  } else {
    useNovaStore.getState().completeTask("No outlines detected");
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
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          {
            type: "text",
            text: `You are a construction specification parser. Analyze this spec book and extract ALL CSI specification sections you can find.\n\nFor each section provide:\n- section: The CSI section number (format: "XX XX XX" e.g. "09 30 00")\n- title: Section title\n- summary: 1-2 sentence summary of key requirements, products, manufacturers\n- page: Approximate page number in the document\n\nCRITICAL: Respond with ONLY a JSON array. No markdown fences, no backticks, no explanation text. Just the raw JSON array.\n\nFocus on sections with actual specification content (Part 1/2/3), not the table of contents or front matter. Extract every section you find.`,
          },
        ],
      },
    ],
  });

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      const newSpecs = parsed.map(s => ({
        id: uid(),
        section: s.section || "",
        title: s.title || "",
        summary: s.summary || "",
        page: s.page || null,
        requirements: [],
        allocated: false,
      }));
      const curSpecs = useSpecsStore.getState().specs;
      useSpecsStore.getState().setSpecs([...curSpecs, ...newSpecs]);
      return newSpecs.length;
    }
  } catch {
    /* parse failed */
  }
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
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } },
            {
              type: "text",
              text: `Classify this construction document page. Is it:\n1. "rfp" — a Request for Proposal, Invitation to Bid, bid package, notice to bidders, or instructions to bidders containing bid requirements\n2. "drawing" — a construction blueprint, plan, elevation, section, or detail drawing\n3. "specification" — a written specification document, project manual, or technical spec\n4. "general" — any other document type\n\nRespond with ONLY one word: rfp, drawing, specification, or general`,
            },
          ],
        },
      ],
    });

    const result = text.trim().toLowerCase();
    if (result.includes("rfp") || result.includes("invitation") || result.includes("bid")) return "rfp";
    if (result.includes("drawing")) return "drawing";
    if (result.includes("specification") || result.includes("spec")) return "specification";
    return "general";
  } catch {
    return "general";
  }
}

// ─── Extract bid info from RFP / ITB document ─────────────────────────────
// Sends the PDF to Claude and extracts project/bid fields.
// Returns number of fields populated.
export async function extractBidInfoFromDocument(file) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return 0;

  const data = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
  const base64 = data.split(",")[1];
  if (!base64 || base64.length < 100) return 0;

  useNovaStore.getState().startTask("rfp", `Reading bid requirements from ${file.name}...`);

  try {
    const text = await callAnthropic({
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            {
              type: "text",
              text: `You are reading a construction bid document (RFP, ITB, or bid package). Extract ALL bid-relevant information you can find.

Return ONLY a JSON object with these fields (use null for any field you cannot find):
{
  "projectName": "Full project name",
  "projectNumber": "Project or job number",
  "client": "Owner or client name",
  "architect": "Architect or design firm",
  "engineer": "Primary or general engineer firm name",
  "engineerStructural": "Structural engineering firm name",
  "engineerMEP": "MEP (mechanical/electrical/plumbing) engineering firm name",
  "engineerCivil": "Civil engineering firm name",
  "address": "Project street address, city, state, zip",
  "zipCode": "Project zip code (5-digit, e.g. 90210)",
  "bidDue": "Bid due date in YYYY-MM-DD format",
  "bidDueTime": "Bid due time in HH:MM format (24hr)",
  "walkthroughDate": "Pre-bid walkthrough date in YYYY-MM-DD format",
  "walkthroughTime": "Walkthrough time in HH:MM format (24hr)",
  "rfiDueDate": "RFI/question due date in YYYY-MM-DD format",
  "rfiDueTime": "RFI due time in HH:MM format (24hr)",
  "scopeSummary": "1-2 sentence summary of the project scope",
  "buildingType": "commercial-office, educational, healthcare, residential-multi, industrial, retail, hospitality, religious, recreation, or other",
  "estimatedSF": "Total square footage if mentioned (number only)",
  "bondRequired": true/false,
  "prevailingWage": true/false,
  "deliveryMethod": "GC, CM, Design-Build, or other"
}

CRITICAL: Respond with ONLY the JSON object. No markdown, no explanation.`,
            },
          ],
        },
      ],
    });

    const clean = text.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    // Apply extracted fields to project store
    const proj = useProjectStore.getState().project;
    const updates = {};
    const detected = { ...(proj.autoDetected || {}) };
    let fieldCount = 0;

    if (parsed.projectName && (!proj.name || proj.name === "New Estimate")) {
      updates.name = parsed.projectName;
      detected.name = true;
      fieldCount++;
    }
    if (parsed.projectNumber && !proj.projectNumber) {
      updates.projectNumber = parsed.projectNumber;
      detected.projectNumber = true;
      fieldCount++;
    }
    if (parsed.client && !proj.client) {
      updates.client = parsed.client;
      detected.client = true;
      fieldCount++;
    }
    if (parsed.architect && !proj.architect) {
      updates.architect = parsed.architect;
      detected.architect = true;
      fieldCount++;
    }
    if (parsed.engineer && !proj.engineer) {
      updates.engineer = parsed.engineer;
      detected.engineer = true;
      fieldCount++;
    }
    if (parsed.engineerStructural && !proj.engineerStructural) {
      updates.engineerStructural = parsed.engineerStructural;
      detected.engineerStructural = true;
      fieldCount++;
    }
    if (parsed.engineerMEP && !proj.engineerMEP) {
      updates.engineerMEP = parsed.engineerMEP;
      detected.engineerMEP = true;
      fieldCount++;
    }
    if (parsed.engineerCivil && !proj.engineerCivil) {
      updates.engineerCivil = parsed.engineerCivil;
      detected.engineerCivil = true;
      fieldCount++;
    }
    if (parsed.address && !proj.address) {
      updates.address = parsed.address;
      detected.address = true;
      fieldCount++;
      // Auto-extract zip from address
      const zipMatch = parsed.address.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (zipMatch && (!proj.zipCode || proj.zipCode.length < 5)) {
        updates.zipCode = zipMatch[1];
        detected.zipCode = true;
      }
    }
    // Explicit zipCode field (fallback if address parsing didn't capture it)
    if (parsed.zipCode && !updates.zipCode && (!proj.zipCode || proj.zipCode.length < 5)) {
      const zip = String(parsed.zipCode)
        .replace(/[^0-9]/g, "")
        .slice(0, 5);
      if (zip.length === 5) {
        updates.zipCode = zip;
        detected.zipCode = true;
        fieldCount++;
      }
    }
    if (parsed.bidDue && !proj.bidDue) {
      updates.bidDue = parsed.bidDue;
      detected.bidDue = true;
      fieldCount++;
    }
    if (parsed.bidDueTime && !proj.bidDueTime) {
      updates.bidDueTime = parsed.bidDueTime;
      detected.bidDueTime = true;
      fieldCount++;
    }
    if (parsed.walkthroughDate && !proj.walkthroughDate) {
      updates.walkthroughDate = parsed.walkthroughDate;
      detected.walkthroughDate = true;
      fieldCount++;
    }
    if (parsed.walkthroughTime && !proj.walkthroughTime) {
      updates.walkthroughTime = parsed.walkthroughTime;
      detected.walkthroughTime = true;
      fieldCount++;
    }
    if (parsed.rfiDueDate && !proj.rfiDueDate) {
      updates.rfiDueDate = parsed.rfiDueDate;
      detected.rfiDueDate = true;
      fieldCount++;
    }
    if (parsed.rfiDueTime && !proj.rfiDueTime) {
      updates.rfiDueTime = parsed.rfiDueTime;
      detected.rfiDueTime = true;
      fieldCount++;
    }
    if (parsed.buildingType && parsed.buildingType !== "other" && !proj.buildingType) {
      updates.buildingType = parsed.buildingType;
      detected.buildingType = true;
      fieldCount++;
    }
    if (parsed.estimatedSF && !proj.projectSF) {
      const sf = parseInt(String(parsed.estimatedSF).replace(/[^0-9]/g, ""));
      if (sf > 0) {
        updates.projectSF = sf;
        detected.projectSF = true;
        fieldCount++;
      }
    }
    if (parsed.scopeSummary) {
      updates.scopeSummary = parsed.scopeSummary;
      fieldCount++;
    }
    if (parsed.bondRequired != null) {
      updates.bondRequired = parsed.bondRequired;
      fieldCount++;
    }
    if (parsed.prevailingWage != null) {
      updates.prevailingWage = parsed.prevailingWage;
      fieldCount++;
    }
    if (parsed.deliveryMethod) {
      updates.deliveryMethod = parsed.deliveryMethod;
      fieldCount++;
    }

    if (fieldCount > 0) {
      updates.autoDetected = detected;
      useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });

      // Update estimate index
      try {
        const estId = useEstimatesStore.getState().activeEstimateId;
        if (estId) {
          const indexUpdates = {};
          if (updates.name) indexUpdates.name = updates.name;
          if (updates.client) indexUpdates.client = updates.client;
          if (updates.architect) indexUpdates.architect = updates.architect;
          useEstimatesStore.getState().updateIndexEntry(estId, indexUpdates);
        }
      } catch {
        /* non-critical */
      }
    }

    const msg = `Extracted ${fieldCount} fields from ${file.name}`;
    useNovaStore.getState().completeTask(msg);
    useNovaStore.getState().notify(msg, "success");
    return fieldCount;
  } catch (err) {
    console.warn("[uploadPipeline] RFP extraction failed:", err.message);
    useNovaStore.getState().failTask(err.message);
    return 0;
  }
}

// ─── Main upload orchestrator ───────────────────────────────────────────────
// Priority order: RFP/ITB → Specifications → Drawings
// Once bid info is extracted, auto-advances user while scanning continues.
//
// options.onScanComplete: called when scan finishes (e.g., to show results modal)
// options.onBidInfoReady: called when bid info is extracted and user can proceed
// options.showToast: toast notification function
export async function handleFileUpload(files, options = {}) {
  if (!files || files.length === 0) return;

  const showToast = options.showToast || useUiStore.getState().showToast;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Classify all files and register them as documents
  // ═══════════════════════════════════════════════════════════════════════════
  const classified = { rfp: [], specification: [], drawing: [], general: [] };

  for (const file of files) {
    const currentDocs = useDocumentsStore.getState().documents;
    if (isDuplicateFile(file.name, currentDocs)) {
      showToast(`${file.name} already uploaded — skipping`, "warn");
      continue;
    }

    let docType = classifyFile(file.name, file.type, file.size);
    console.log(
      `[uploadPipeline] ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) → classified as "${docType}"`,
    );

    // AI classification for ambiguous PDFs
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (docType === "general" && isPdf) {
      // For small unmatched PDFs, try AI classification.
      // Large PDFs should already be classified as "drawing" by classifyFile.
      try {
        const fallbackType = file.size > 1024 * 1024 ? "drawing" : "general"; // >1MB → drawing fallback
        const aiType = await Promise.race([
          aiClassifyDocument(file),
          new Promise(resolve => setTimeout(() => resolve(fallbackType), 15000)),
        ]);
        if (aiType !== "general") docType = aiType;
        else if (fallbackType === "drawing") docType = "drawing"; // AI said "general" but file is large → drawing
      } catch {
        // AI classification failed — default large PDFs to drawing
        if (file.size > 1024 * 1024) docType = "drawing";
      }
      console.log(`[uploadPipeline] AI reclassified ${file.name} → "${docType}"`);
    }

    const processingMsg =
      docType === "rfp"
        ? "Reading bid requirements..."
        : docType === "drawing"
          ? "Extracting pages..."
          : docType === "specification"
            ? "Parsing specifications..."
            : "Stored";

    const doc = useDocumentsStore.getState().addDocument({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      docType,
      processingStatus: docType === "general" ? "complete" : "processing",
      processingMessage: processingMsg,
    });

    // Store general docs data immediately
    if (docType === "general") {
      const data = await new Promise(res => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => res(null);
        r.readAsDataURL(file);
      });
      useDocumentsStore
        .getState()
        .updateDocument(doc.id, { data, processingStatus: "complete", processingMessage: "Stored" });
    }

    classified[docType] = classified[docType] || [];
    classified[docType].push({ file, docId: doc.id });
  }

  let bidInfoExtracted = false;
  console.log(
    `[uploadPipeline] Classification: ${classified.drawing.length} drawings, ${classified.rfp.length} RFPs, ${classified.specification.length} specs, ${classified.general.length} general`,
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Process RFP/ITB documents FIRST — these have all the bid info
  // ═══════════════════════════════════════════════════════════════════════════
  for (const { file, docId } of classified.rfp) {
    try {
      const fieldCount = await extractBidInfoFromDocument(file);
      useDocumentsStore.getState().updateDocument(docId, {
        processingStatus: "complete",
        processingMessage: fieldCount > 0 ? `${fieldCount} bid fields extracted` : "Analyzed — no bid fields found",
      });
      if (fieldCount >= 3) bidInfoExtracted = true;
      showToast(`${file.name}: ${fieldCount} bid fields extracted`);
    } catch (err) {
      useDocumentsStore.getState().updateDocument(docId, {
        processingStatus: "error",
        processingError: err.message,
        processingMessage: "RFP extraction failed",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Process Specifications — also contain bid info (Div 00/01)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const { file, docId } of classified.specification) {
    try {
      // If we haven't found bid info yet, try extracting from spec front matter
      if (!bidInfoExtracted) {
        const rfpFields = await extractBidInfoFromDocument(file);
        if (rfpFields >= 3) bidInfoExtracted = true;
      }
      const sectionCount = await processSpecBook(file);
      useDocumentsStore.getState().updateDocument(docId, {
        processingStatus: "complete",
        processingMessage: `${sectionCount} sections parsed`,
      });
      showToast(`${file.name}: ${sectionCount} spec sections parsed`);
    } catch (err) {
      useDocumentsStore.getState().updateDocument(docId, {
        processingStatus: "error",
        processingError: err.message,
        processingMessage: "Parse failed",
      });
      showToast(`${file.name}: spec parse failed — ${err.message}`, "error");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ADVANCE: If bid info was found, complete setup & let user proceed
  // while drawing processing continues in the background
  // ═══════════════════════════════════════════════════════════════════════════
  if (bidInfoExtracted && useProjectStore.getState().project.setupComplete === false) {
    useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
    showToast("Bid requirements found — project info populated");
    options.onBidInfoReady?.();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Process Drawings — extract pages, label, scan, outline
  // (continues in background after user advances)
  // ═══════════════════════════════════════════════════════════════════════════
  const drawingDocIds = [];
  for (const { file, docId } of classified.drawing) {
    try {
      const drawingIds = await extractDrawingPages(file, { isRendering: options.isRendering });
      useDocumentsStore.getState().updateDocument(docId, {
        processingMessage: `${drawingIds.length} pages extracted — labeling...`,
        pageCount: drawingIds.length,
        drawingIds,
      });
      drawingDocIds.push({ docId, drawingIds });
      showToast(`${file.name}: ${drawingIds.length} sheets extracted`);
    } catch (err) {
      useDocumentsStore.getState().updateDocument(docId, {
        processingStatus: "error",
        processingError: err.message,
        processingMessage: "Extraction failed",
      });
      showToast(`${file.name}: extraction failed — ${err.message}`, "error");
    }
  }

  if (drawingDocIds.length > 0) {
    const allNewDrawingIds = drawingDocIds.flatMap(d => d.drawingIds);
    console.log(`[uploadPipeline] Drawing pipeline: ${drawingDocIds.length} docs → ${allNewDrawingIds.length} pages`);

    // Step 4a: Auto-label (with 3-minute timeout so scan always runs even if labeling stalls)
    for (const { docId } of drawingDocIds) {
      useDocumentsStore.getState().updateDocument(docId, { processingMessage: "NOVA labeling sheets..." });
    }
    try {
      await Promise.race([
        autoLabelDrawings(allNewDrawingIds),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Labeling timed out")), 180_000)),
      ]);
      for (const { docId } of drawingDocIds) {
        useDocumentsStore
          .getState()
          .updateDocument(docId, { processingMessage: "Labeled — scanning for schedules..." });
      }

      // If no bid info from RFP/specs, check title blocks (first drawing label extracted metadata)
      if (!bidInfoExtracted) {
        const proj = useProjectStore.getState().project;
        const hasBidInfo = proj.name && proj.name !== "New Estimate" && (proj.bidDue || proj.architect || proj.client);
        if (hasBidInfo && proj.setupComplete === false) {
          useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
          showToast("Project info extracted from drawings");
          options.onBidInfoReady?.();
          bidInfoExtracted = true;
        }
      }
    } catch (err) {
      console.warn("[uploadPipeline] Labeling failed/timed out:", err.message);
      for (const { docId } of drawingDocIds) {
        useDocumentsStore
          .getState()
          .updateDocument(docId, { processingMessage: `Label incomplete — proceeding to scan...` });
      }
    }

    // Step 4b: Auto-scan (schedule detection + ROM)
    console.log("[uploadPipeline] Starting scan pipeline...");
    try {
      await runFullScan({
        onComplete: () => {
          if (bidInfoExtracted) {
            // User was auto-advanced — mark results as pending review
            import("@/stores/scanStore").then(m => {
              m.useScanStore.getState().setScanResultsPending(true);
            });
            showToast("NOVA scan complete — review schedule results in Plan Room");
          }
          if (options.onScanComplete) options.onScanComplete();
        },
      });
      for (const { docId, drawingIds } of drawingDocIds) {
        const count = drawingIds.length;
        const sr = (await import("@/stores/scanStore")).useScanStore.getState().scanResults;
        const schedCount = sr?.schedules?.length || 0;
        const romRange = sr?.rom?.totals
          ? `ROM $${Math.round(sr.rom.totals.low / 1000)}K–$${Math.round(sr.rom.totals.high / 1000)}K`
          : "";
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

    // Step 4c: Outline detection (non-blocking)
    try {
      await autoDetectOutlines();
    } catch {
      /* non-critical */
    }

    // Step 4d: Proactive Discovery Scan (non-blocking)
    // Scans all drawing sheets to build a discovery index of detectable elements.
    // Uses rescanDrawings to abort any in-flight scan from a previous batch upload
    // and re-scan with the complete drawing set.
    try {
      const { rescanDrawings } = await import("@/utils/discoveryScan");
      const allDrawings = useDrawingsStore.getState().drawings;
      if (allDrawings.length > 0) {
        rescanDrawings(allDrawings).catch(err => {
          console.warn("[uploadPipeline] Discovery scan failed (non-critical):", err.message);
        });
      }
    } catch {
      /* non-critical — discovery scan is additive, not blocking */
    }
  }

  // Complete setup mode if still pending (fallback — no bid info found but files processed)
  if (useProjectStore.getState().project.setupComplete === false) {
    useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
    if (classified.rfp.length > 0 || classified.specification.length > 0) {
      showToast("Couldn't extract bid info automatically — please fill in project details", "warn");
    }
  }
}
