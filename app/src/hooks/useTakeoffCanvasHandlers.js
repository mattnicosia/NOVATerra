import { useCallback } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import {
  callAnthropic,
  optimizeImageForAI,
  imageBlock,
  cropImageRegion,
} from "@/utils/ai";
import {
  runSmartPredictions,
  scanAllSheets,
  findNearbyPrediction,
  recordPredictionFeedback,
} from "@/utils/predictiveEngine";
import { smartCountFromClick } from "@/utils/templateMatcher";

/**
 * useTakeoffCanvasHandlers — extracts handleCanvasClick, handleDrawingWheel,
 * handleDrawingMouseDown from TakeoffsPage.
 *
 * All Zustand store data is read via getState() inside callbacks to avoid
 * stale closures. Only refs, CRUD fns, and local state setters are passed in.
 */
export default function useTakeoffCanvasHandlers({
  canvasRef,
  drawingContainerRef,
  drawingImgRef,
  cursorCanvasRef,
  predictionCanvasRef,
  tkTransformRef,
  tkLastWheelX,
  tkPanning,
  tkPanStart,
  snapAngleOnRef,
  addMeasurement,
  updateTakeoff,
  pauseMeasuring,
  setCrossSheetScan,
  snapAngle,
  hasScale,
  calcPolylineLength,
  calcPolygonArea,
  getDisplayUnit,
}) {
  // ─── Sync canvas dimensions with image (prevents cursor misalignment) ──
  const syncCanvasDims = () => {
    const img = drawingImgRef?.current;
    if (!img || !img.naturalWidth) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    for (const ref of [canvasRef, cursorCanvasRef, predictionCanvasRef]) {
      const c = ref?.current;
      if (c && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
      }
    }
  };

  // ─── CANVAS CLICK HANDLER ──────────
  const handleCanvasClick = useCallback(
    e => {
      if (!canvasRef.current) return;
      syncCanvasDims(); // Ensure canvas resolution matches image before converting coords

      // Read ALL store state fresh inside callback
      const tkStore = useDrawingPipelineStore.getState();
      const dwgStore = useDrawingPipelineStore.getState();
      const showToast = useUiStore.getState().showToast;

      const {
        tkTool: currentTool,
        tkActivePoints,
        tkActiveTakeoffId: currentActiveTakeoffId,
        tkMeasureState: currentMeasureState,
        tkAutoCount,
        tkPanelOpen,
        tkPanelMode,
        tkSelectedTakeoffId: _selectedTkId,
        takeoffs,
        setTkContextMenu,
        setTkActivePoints,
        setTkMeasureState,
        setTkSelectedTakeoffId,
        setTkAutoCount,
        setTkPanelOpen,
        setTkPredictions,
        acceptPrediction,
        recordPredictionMiss,
        clearPredictions,
        initPredContext,
      } = tkStore;

      const { selectedDrawingId, drawings, pdfCanvases } = dwgStore;

      if (!selectedDrawingId) return;
      setTkContextMenu(null);

      // Auto-close/collapse panel on canvas click (only in "auto" mode — "open" keeps it pinned)
      if (tkPanelOpen && tkPanelMode === "auto") {
        const currentTier = tkStore.tkPanelTier;
        if (currentTier !== "compact") {
          // In Standard/Full tier, auto-collapse to compact instead of closing entirely
          tkStore.setTkPanelTier("compact");
          tkStore.setTkPanelWidth(350);
        } else {
          setTkPanelOpen(false);
        }
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
      const cy = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
      const pt = { x: cx, y: cy };

      // ── Count prediction helpers (shared by paused handler and main count path) ──
      const handleCountPredictions = (clickPt, to) => {
        const s = useDrawingPipelineStore.getState();
        const currentActiveId = s.tkActiveTakeoffId;
        const { tkPredictions: preds, tkPredAccepted: accepted, tkPredRejected: rejected } = s;
        if (preds && preds.predictions.length > 0) {
          const nearbyPred = findNearbyPrediction(preds.predictions, clickPt, accepted, rejected, 30);
          if (nearbyPred) {
            acceptPrediction(nearbyPred.id);
            const captureDrawing = useDrawingPipelineStore.getState().drawings.find(
              d => d.id === useDrawingPipelineStore.getState().selectedDrawingId,
            );
            recordPredictionFeedback(preds.tag, preds.strategy || preds.source, true, {
              takeoffId: currentActiveId,
              description: to.description || "",
              drawing: captureDrawing,
              point: nearbyPred.point || clickPt,
              totalPredictions: preds.predictions?.length || 0,
              _refireCallback: (drw, tkId) => {
                // Re-fire Vision with first-click example on same sheet
                const tkState = useDrawingPipelineStore.getState();
                const tkOff = tkState.takeoffs.find(t => t.id === tkId);
                if (drw && tkOff) {
                  runSmartPredictions(drw, tkOff, "count", clickPt).then(result => {
                    if (result?.predictions?.length > 0) {
                      setTkPredictions({
                        tag: result.tag, predictions: result.predictions, scanning: false,
                        totalInstances: result.totalInstances, source: result.source, strategy: result.strategy,
                      });
                      initPredContext(result.tag, result.source, result.confidence);
                    }
                  }).catch(() => {});
                }
              },
            });
            addMeasurement(currentActiveId, {
              type: "count",
              points: [nearbyPred.point || clickPt],
              value: 1,
              sheetId: useDrawingPipelineStore.getState().selectedDrawingId,
              color: to.color,
              predicted: true,
              tag: preds.tag,
            });
            return true;
          }
          recordPredictionMiss();
          const ctx = useDrawingPipelineStore.getState().tkPredContext;
          if (ctx && ctx.consecutiveMisses >= 3) {
            clearPredictions();
            const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
            const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === drawingId);
            if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
              runSmartPredictions(drawing, to, "count", clickPt)
                .then(result => {
                  if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveId) return;
                  if (result.predictions.length > 0) {
                    setTkPredictions({
                      tag: result.tag,
                      predictions: result.predictions,
                      scanning: false,
                      totalInstances: result.totalInstances,
                      source: result.source,
                      strategy: result.strategy,
                    });
                    initPredContext(result.tag, result.source, result.confidence);
                  }
                })
                .catch(err => console.warn("Prediction re-scan failed:", err));
            }
          }
        }
        return false;
      };

      const triggerCountPredictions = (clickPt, to) => {
        const { tkPredictions: preds } = useDrawingPipelineStore.getState();
        const hasPreds = preds && preds.predictions && preds.predictions.length > 0;
        if (hasPreds) return;

        const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
        const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
        if (!drawing || drawing.type !== "pdf") return;

        // Get the rendered image source for template matching
        const imgSrc = useDrawingPipelineStore.getState().pdfCanvases[currentDrawingId] || drawing.data;

        // ── Strategy 1: Template Matching (instant, offline, high accuracy) ──
        if (imgSrc) {
          const existingPts = (to.measurements || [])
            .filter(m => m.sheetId === currentDrawingId && m.type === "count")
            .flatMap(m => m.points || []);

          smartCountFromClick(imgSrc, clickPt, existingPts, {
            templateSize: 64,
            threshold: 0.88,
            step: 2,
            minSeparation: 30,
            excludeRadius: 25,
            tag: to.description,
            drawingId: currentDrawingId,
          })
            .then(result => {
              if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
              if (result.predictions.length > 0) {
                setTkPredictions({
                  tag: to.description,
                  predictions: result.predictions,
                  scanning: false,
                  totalInstances: result.predictions.length,
                  source: "template",
                  strategy: "template",
                });
                initPredContext(to.description, "template", 0.9);
                showToast(`Found ${result.predictions.length} more "${to.description}" — click to confirm`);
              } else {
                // ── Strategy 2: Fall back to AI pipeline (text/vision) ──
                if (drawing.data || drawing.pdfRawBase64) {
                  runSmartPredictions(drawing, to, "count", clickPt)
                    .then(aiResult => {
                      if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
                      if (aiResult.predictions.length > 0) {
                        setTkPredictions({
                          tag: aiResult.tag,
                          predictions: aiResult.predictions,
                          scanning: false,
                          totalInstances: aiResult.totalInstances,
                          source: aiResult.source,
                          strategy: aiResult.strategy,
                        });
                        initPredContext(aiResult.tag, aiResult.source, aiResult.confidence);
                        showToast(
                          `Found ${aiResult.predictions.length} more "${aiResult.tag || "items"}" — review predictions`,
                        );
                      }
                    })
                    .catch(err => console.warn("AI prediction fallback failed:", err));
                }
              }
            })
            .catch(err => {
              console.warn("Template matching failed:", err);
              // Fall back to AI pipeline on template matcher failure
              if (drawing.data || drawing.pdfRawBase64) {
                runSmartPredictions(drawing, to, "count", clickPt)
                  .then(aiResult => {
                    if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
                    if (aiResult.predictions.length > 0) {
                      setTkPredictions({
                        tag: aiResult.tag,
                        predictions: aiResult.predictions,
                        scanning: false,
                        totalInstances: aiResult.totalInstances,
                        source: aiResult.source,
                        strategy: aiResult.strategy,
                      });
                      initPredContext(aiResult.tag, aiResult.source, aiResult.confidence);
                    }
                  })
                  .catch(() => {});
              }
            });
        }
      };

      // Auto-count sample selection — capture sample, then run AI vision
      if (tkAutoCount?.phase === "select") {
        setTkAutoCount({ ...tkAutoCount, phase: "scanning", samplePt: pt });
        // Get the drawing image for AI analysis
        const drawing = drawings.find(d => d.id === selectedDrawingId);
        if (!drawing) {
          setTkAutoCount(null);
          return;
        }
        const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
        if (!imgSrc) {
          showToast("Drawing image not available", "error");
          setTkAutoCount(null);
          return;
        }
        // Run AI vision in background
        (async () => {
          try {
            const to = takeoffs.find(t => t.id === tkAutoCount.takeoffId);
            const { base64: fullImg } = await optimizeImageForAI(imgSrc, 1400);
            // Crop a sample region around the click point (200x200 px region)
            const cropSize = 120;
            const cropX = Math.max(0, pt.x - cropSize / 2);
            const cropY = Math.max(0, pt.y - cropSize / 2);
            const sampleImg = await cropImageRegion(imgSrc, cropX, cropY, cropSize, cropSize, 300);

            const result = await callAnthropic({
              max_tokens: 1500,
              system:
                "You are a construction drawing symbol detection AI. You analyze architectural/engineering drawings to find and count repeated symbols.",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `I've selected a sample symbol on this construction drawing. The sample is from the area I clicked. The takeoff item is: "${to?.description || "Symbol"}".

TASK: Look at the SAMPLE IMAGE to understand what symbol/element I selected. Then look at the FULL DRAWING and count ALL instances of that same symbol or very similar symbols across the entire sheet.

Return ONLY a JSON object like: {"count": 12, "description": "door swing symbols", "confidence": "high"}
Where confidence is "high", "medium", or "low".`,
                    },
                    { type: "text", text: "SAMPLE (the symbol I clicked on):" },
                    imageBlock(sampleImg),
                    { type: "text", text: "FULL DRAWING (count all similar symbols):" },
                    imageBlock(fullImg),
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
            if (parsed?.count) {
              setTkAutoCount(prev => ({
                ...prev,
                phase: "done",
                results: Array.from({ length: parsed.count }, (_, i) => ({ id: i })),
              }));
              // Update the takeoff quantity
              const nn = v => (typeof v === "number" ? v : parseFloat(v) || 0);
              const existingQty = nn(to?.quantity || 0);
              const _currentMeasurements = (to?.measurements || []).filter(m => m.sheetId === selectedDrawingId);
              const newCount = parsed.count;
              updateTakeoff(tkAutoCount.takeoffId, "quantity", existingQty + newCount);
              showToast(
                `AI detected ${newCount} ${parsed.description || "symbols"} (${parsed.confidence || "medium"} confidence)`,
              );
            } else {
              setTkAutoCount(prev => ({ ...prev, phase: "done", results: [] }));
              showToast("AI couldn't reliably detect symbols — try a clearer sample", "error");
            }
          } catch (err) {
            setTkAutoCount(prev => (prev ? { ...prev, phase: "done", results: [] } : null));
            showToast(`Auto-count error: ${err.message}`, "error");
          }
        })();
        return;
      }

      // Calibrate mode
      if (currentTool === "calibrate") {
        if (tkActivePoints.length === 0) {
          setTkActivePoints([pt]);
        } else {
          setTkActivePoints([tkActivePoints[0], pt]);
        }
        return;
      }

      // Paused — re-engage
      if (currentMeasureState === "paused" && currentActiveTakeoffId) {
        setTkMeasureState("measuring");
        if (currentTool === "count") {
          const to = takeoffs.find(t => t.id === currentActiveTakeoffId);
          if (to) {
            if (handleCountPredictions(pt, to)) {
              if (e.detail === 2) pauseMeasuring();
              return;
            }
            addMeasurement(currentActiveTakeoffId, {
              type: "count",
              points: [pt],
              value: 1,
              sheetId: selectedDrawingId,
              color: to.color,
            });
            triggerCountPredictions(pt, to);
            if (e.detail === 2) pauseMeasuring();
          }
          return;
        }
        setTkActivePoints([pt]);
        return;
      }

      if (currentMeasureState !== "measuring" || !currentActiveTakeoffId) {
        // In select mode, clicking on canvas only hit-tests existing measurements.
        // User must explicitly arm/engage measuring via the Play button — no auto-engage.

        // Hit-test: click on existing measurement → select that takeoff
        // Scale thresholds by inverse zoom so they stay consistent in screen pixels
        const zoomScale = Math.max(
          1,
          (canvasRef.current?.width || 1) / (canvasRef.current?.getBoundingClientRect().width || 1),
        );
        const countRadius = Math.max(30, 30 * zoomScale);
        const lineRadius = Math.max(12, 15 * zoomScale);
        for (const hitTo of takeoffs) {
          for (const m of hitTo.measurements || []) {
            if (m.sheetId !== selectedDrawingId) continue;
            if (m.type === "count") {
              const d = Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2);
              if (d < countRadius) {
                setTkSelectedTakeoffId(hitTo.id);
                return;
              }
            } else if (m.type === "linear" && m.points.length >= 2) {
              for (let i = 0; i < m.points.length - 1; i++) {
                const a = m.points[i],
                  b = m.points[i + 1];
                const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                if (len < 1) continue;
                const t = Math.max(
                  0,
                  Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)),
                );
                const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
                const dist = Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2);
                if (dist < lineRadius) {
                  setTkSelectedTakeoffId(hitTo.id);
                  return;
                }
              }
            } else if (m.type === "area" && m.points.length >= 3) {
              // Point-in-polygon test (ray casting) — no threshold needed
              let inside = false;
              const pts = m.points;
              for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x,
                  yi = pts[i].y,
                  xj = pts[j].x,
                  yj = pts[j].y;
                if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
              }
              if (inside) {
                setTkSelectedTakeoffId(hitTo.id);
                return;
              }
            }
          }
        }
        // Clicked empty canvas — deselect
        if (tkStore.tkSelectedTakeoffId) {
          setTkSelectedTakeoffId(null);
        }
        return;
      }
      const to = takeoffs.find(t => t.id === currentActiveTakeoffId);
      if (!to) return;

      // Apply snap angle when Shift is held or snap toggle is on (not for count tool or first point)
      const snappedPt =
        (e.shiftKey || snapAngleOnRef.current) && tkActivePoints.length >= 1
          ? snapAngle(tkActivePoints[tkActivePoints.length - 1], pt)
          : pt;

      // COUNT
      if (currentTool === "count") {
        // ── Proximity auto-accept: if clicking near a ghost prediction, accept it instead ──
        if (handleCountPredictions(pt, to)) {
          if (e.detail === 2) {
            pauseMeasuring();
          }
          return;
        }

        addMeasurement(currentActiveTakeoffId, {
          type: "count",
          points: [pt],
          value: 1,
          sheetId: selectedDrawingId,
          color: to.color,
        });

        // Predictive takeoff: run smart predictions whenever none exist
        triggerCountPredictions(pt, to);
        if (e.detail === 2) {
          pauseMeasuring();
        }
        return;
      }

      // LINEAR
      if (currentTool === "linear") {
        if (e.detail === 2 && tkActivePoints.length >= 2) {
          addMeasurement(currentActiveTakeoffId, {
            type: "linear",
            points: [...tkActivePoints],
            value: 0,
            sheetId: selectedDrawingId,
            color: to.color,
          });
          if (hasScale(selectedDrawingId)) {
            const len = calcPolylineLength(tkActivePoints, selectedDrawingId);
            showToast(`Linear: ${Math.round(len * 100) / 100} ${getDisplayUnit(selectedDrawingId)}`);
          } else {
            showToast("Linear measurement saved — set scale to see value");
          }
          // Track prediction match/miss for linear measurements
          const {
            tkPredictions: linPreds,
            tkPredAccepted: linAccepted,
            tkPredRejected: linRejected,
          } = useDrawingPipelineStore.getState();
          if (linPreds && linPreds.predictions.length > 0) {
            const nearbyPred = findNearbyPrediction(
              linPreds.predictions,
              tkActivePoints[0],
              linAccepted,
              linRejected,
              50,
            );
            if (nearbyPred) {
              acceptPrediction(nearbyPred.id);
              const capDrwLin = useDrawingPipelineStore.getState().drawings.find(
                d => d.id === useDrawingPipelineStore.getState().selectedDrawingId,
              );
              recordPredictionFeedback(linPreds.tag, linPreds.strategy || linPreds.source, true, {
                takeoffId: useDrawingPipelineStore.getState().tkActiveTakeoffId,
                description: to?.description || "",
                drawing: capDrwLin,
                point: nearbyPred.point || tkActivePoints[0],
              });
            } else {
              recordPredictionMiss();
              const ctx = useDrawingPipelineStore.getState().tkPredContext;
              if (ctx && ctx.consecutiveMisses >= 3) {
                clearPredictions();
                // Re-scan immediately after clearing (can't rely on !linPreds — it's a stale local)
                const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
                const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
                if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
                  runSmartPredictions(drawing, to, "linear", tkActivePoints[0])
                    .then(result => {
                      if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
                      if (result.predictions.length > 0) {
                        setTkPredictions({
                          tag: result.tag,
                          predictions: result.predictions,
                          scanning: false,
                          totalInstances: result.totalInstances,
                          source: result.source,
                          strategy: result.strategy,
                        });
                        initPredContext(result.tag, result.source, result.confidence);
                      }
                    })
                    .catch(err => console.warn("Linear prediction re-scan failed:", err));
                }
              }
            }
          }

          // Predictive takeoff: run smart predictions whenever none exist
          if (!linPreds) {
            const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
            const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
            if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
              (async () => {
                try {
                  const result = await runSmartPredictions(drawing, to, "linear", tkActivePoints[0]);
                  if (result.predictions.length > 0) {
                    setTkPredictions({
                      tag: result.tag,
                      predictions: result.predictions,
                      scanning: false,
                      totalInstances: result.totalInstances,
                      source: result.source,
                      strategy: result.strategy,
                    });
                    initPredContext(result.tag, result.source, result.confidence);
                    showToast(
                      `Found ${result.predictions.length} more "${result.tag || "walls"}" — review predictions`,
                    );
                    // Cross-sheet scan: find same tag on other sheets
                    if (result.tag) {
                      const allDwgs = useDrawingPipelineStore.getState().drawings;
                      scanAllSheets(allDwgs, result.tag, "linear")
                        .then(sheetResults => {
                          const otherSheets = sheetResults.filter(r => r.drawingId !== currentDrawingId);
                          if (otherSheets.length > 0) {
                            setCrossSheetScan({ tag: result.tag, results: otherSheets, scanning: false });
                          }
                        })
                        .catch(() => {});
                    }
                  } else if (result.message && result.strategy !== "general" && result.strategy !== "tag-based") {
                    showToast(result.message, "info");
                  }
                } catch (err) {
                  console.warn("Prediction scan failed:", err);
                }
              })();
            }
          }
          pauseMeasuring();
          return;
        }
        setTkActivePoints([...tkActivePoints, snappedPt]);
        return;
      }

      // AREA
      if (currentTool === "area") {
        if (tkActivePoints.length >= 3) {
          const first = tkActivePoints[0];
          const dist = Math.sqrt((cx - first.x) ** 2 + (cy - first.y) ** 2);
          if (dist < 15) {
            addMeasurement(currentActiveTakeoffId, {
              type: "area",
              points: [...tkActivePoints],
              value: 0,
              sheetId: selectedDrawingId,
              color: to.color,
            });
            if (hasScale(selectedDrawingId)) {
              const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
              showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
            } else {
              showToast("Area measurement saved — set scale to see value");
            }
            // Track prediction match/miss for area measurements
            const {
              tkPredictions: areaPreds,
              tkPredAccepted: areaAccepted,
              tkPredRejected: areaRejected,
            } = useDrawingPipelineStore.getState();
            if (areaPreds && areaPreds.predictions.length > 0) {
              const nearbyPred = findNearbyPrediction(
                areaPreds.predictions,
                tkActivePoints[0],
                areaAccepted,
                areaRejected,
                50,
              );
              if (nearbyPred) {
                acceptPrediction(nearbyPred.id);
                const capDrwArea = useDrawingPipelineStore.getState().drawings.find(
                  d => d.id === useDrawingPipelineStore.getState().selectedDrawingId,
                );
                recordPredictionFeedback(areaPreds.tag, areaPreds.strategy || areaPreds.source, true, {
                  takeoffId: useDrawingPipelineStore.getState().tkActiveTakeoffId,
                  description: to?.description || "",
                  drawing: capDrwArea,
                  point: nearbyPred.point || tkActivePoints[0],
                });
              } else {
                recordPredictionMiss();
                const ctx = useDrawingPipelineStore.getState().tkPredContext;
                if (ctx && ctx.consecutiveMisses >= 3) {
                  clearPredictions();
                  // Re-scan immediately after clearing (can't rely on !areaPreds — it's a stale local)
                  const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
                  const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
                  if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
                    runSmartPredictions(drawing, to, "area", tkActivePoints[0])
                      .then(result => {
                        if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
                        if (result.predictions.length > 0) {
                          setTkPredictions({
                            tag: result.tag,
                            predictions: result.predictions,
                            scanning: false,
                            totalInstances: result.totalInstances,
                            source: result.source,
                            strategy: result.strategy,
                          });
                          initPredContext(result.tag, result.source, result.confidence);
                        }
                      })
                      .catch(err => console.warn("Area prediction re-scan failed:", err));
                  }
                }
              }
            }
            // Area predictions: run smart predictions whenever none exist
            if (!areaPreds) {
              const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
              const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
              if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
                (async () => {
                  try {
                    const result = await runSmartPredictions(drawing, to, "area", tkActivePoints[0]);
                    if (result.predictions.length > 0) {
                      setTkPredictions({
                        tag: result.tag,
                        predictions: result.predictions,
                        scanning: false,
                        totalInstances: result.totalInstances,
                        source: result.source,
                        strategy: result.strategy,
                      });
                      initPredContext(result.tag, result.source, result.confidence);
                      showToast(`Found ${result.predictions.length} room predictions — review`);
                      // Cross-sheet scan: find same tag on other sheets
                      if (result.tag) {
                        const allDwgs = useDrawingPipelineStore.getState().drawings;
                        scanAllSheets(allDwgs, result.tag, "area")
                          .then(sheetResults => {
                            const otherSheets = sheetResults.filter(r => r.drawingId !== currentDrawingId);
                            if (otherSheets.length > 0) {
                              setCrossSheetScan({ tag: result.tag, results: otherSheets, scanning: false });
                            }
                          })
                          .catch(() => {});
                      }
                    } else if (result.message && result.strategy !== "general" && result.strategy !== "tag-based") {
                      showToast(result.message, "info");
                    }
                  } catch (err) {
                    console.warn("Area prediction scan failed:", err);
                  }
                })();
              }
            }
            pauseMeasuring();
            return;
          }
        }
        if (e.detail === 2 && tkActivePoints.length >= 3) {
          addMeasurement(currentActiveTakeoffId, {
            type: "area",
            points: [...tkActivePoints],
            value: 0,
            sheetId: selectedDrawingId,
            color: to.color,
          });
          if (hasScale(selectedDrawingId)) {
            const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
            showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
          } else {
            showToast("Area measurement saved — set scale to see value");
          }
          // Track prediction match/miss for area measurements (double-click close)
          const {
            tkPredictions: areaPredsDbl,
            tkPredAccepted: areaAccDbl,
            tkPredRejected: areaRejDbl,
          } = useDrawingPipelineStore.getState();
          if (areaPredsDbl && areaPredsDbl.predictions.length > 0) {
            const nearbyPred = findNearbyPrediction(
              areaPredsDbl.predictions,
              tkActivePoints[0],
              areaAccDbl,
              areaRejDbl,
              50,
            );
            if (nearbyPred) {
              acceptPrediction(nearbyPred.id);
              const capDrwDbl = useDrawingPipelineStore.getState().drawings.find(
                d => d.id === useDrawingPipelineStore.getState().selectedDrawingId,
              );
              recordPredictionFeedback(areaPredsDbl.tag, areaPredsDbl.strategy || areaPredsDbl.source, true, {
                takeoffId: useDrawingPipelineStore.getState().tkActiveTakeoffId,
                description: to?.description || "",
                drawing: capDrwDbl,
                point: nearbyPred.point || tkActivePoints[0],
              });
            } else {
              recordPredictionMiss();
              const ctx = useDrawingPipelineStore.getState().tkPredContext;
              if (ctx && ctx.consecutiveMisses >= 3) {
                clearPredictions();
                // Re-scan immediately after clearing (can't rely on !areaPredsDbl — it's a stale local)
                const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
                const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
                if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
                  runSmartPredictions(drawing, to, "area", tkActivePoints[0])
                    .then(result => {
                      if (useDrawingPipelineStore.getState().tkActiveTakeoffId !== currentActiveTakeoffId) return;
                      if (result.predictions.length > 0) {
                        setTkPredictions({
                          tag: result.tag,
                          predictions: result.predictions,
                          scanning: false,
                          totalInstances: result.totalInstances,
                          source: result.source,
                          strategy: result.strategy,
                        });
                        initPredContext(result.tag, result.source, result.confidence);
                      }
                    })
                    .catch(err => console.warn("Area prediction re-scan failed:", err));
                }
              }
            }
          }
          // Area predictions: run smart predictions whenever none exist
          if (!areaPredsDbl) {
            const currentDrawingId = useDrawingPipelineStore.getState().selectedDrawingId;
            const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === currentDrawingId);
            if (drawing && drawing.type === "pdf" && (drawing.data || drawing.pdfRawBase64)) {
              (async () => {
                try {
                  const result = await runSmartPredictions(drawing, to, "area", tkActivePoints[0]);
                  if (result.predictions.length > 0) {
                    setTkPredictions({
                      tag: result.tag,
                      predictions: result.predictions,
                      scanning: false,
                      totalInstances: result.totalInstances,
                      source: result.source,
                      strategy: result.strategy,
                    });
                    initPredContext(result.tag, result.source, result.confidence);
                    showToast(`Found ${result.predictions.length} room predictions — review`);
                    // Cross-sheet scan: find same tag on other sheets
                    if (result.tag) {
                      const allDwgs = useDrawingPipelineStore.getState().drawings;
                      scanAllSheets(allDwgs, result.tag, "area")
                        .then(sheetResults => {
                          const otherSheets = sheetResults.filter(r => r.drawingId !== currentDrawingId);
                          if (otherSheets.length > 0) {
                            setCrossSheetScan({ tag: result.tag, results: otherSheets, scanning: false });
                          }
                        })
                        .catch(() => {});
                    }
                  }
                } catch (err) {
                  console.warn("Area prediction scan failed:", err);
                }
              })();
            }
          }
          pauseMeasuring();
          return;
        }
        setTkActivePoints([...tkActivePoints, snappedPt]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all state read via getState()
    [],
  );

  // ─── ZOOM / PAN ─────────────────────
  // Pinch (ctrlKey) = zoom, trackpad two-finger = pan, mouse wheel = zoom
  // Heuristic: trackpad produces deltaX (finger imprecision); mouse wheel = deltaX:0 only
  const handleDrawingWheel = useCallback(
    e => {
      e.preventDefault();
      const container = drawingContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Track deltaX: trackpads almost always produce some lateral movement
      if (Math.abs(e.deltaX) > 0.5) tkLastWheelX.current = Date.now();

      // Determine zoom vs pan:
      // 1) Pinch gesture (trackpad sends ctrlKey=true) → zoom
      // 2) Line-mode scroll (deltaMode=1, e.g. old mouse wheels) → zoom
      // 3) Has lateral movement (deltaX) or had recent lateral → trackpad → pan
      // 4) Pure vertical pixel scroll with no recent lateral → mouse wheel → zoom
      const isPinch = e.ctrlKey || e.metaKey;
      const isLineMode = e.deltaMode === 1;
      const hadRecentLateral = Date.now() - tkLastWheelX.current < 500;
      const hasLateral = Math.abs(e.deltaX) > 0.5;
      const isTrackpadPan = !isPinch && !isLineMode && (hasLateral || hadRecentLateral);
      const isZoom = isPinch || isLineMode || (!isTrackpadPan && !hasLateral);

      const { setTkZoom, setTkPan } = useDrawingPipelineStore.getState();

      if (isZoom) {
        // ZOOM at cursor position — read state directly (Zustand setters don't support functional updaters)
        const sensitivity = isPinch ? 0.006 : 0.003;
        const zoomFactor = Math.pow(2, -e.deltaY * sensitivity);
        const { tkZoom: prevZoom, tkPan: prevPan } = useDrawingPipelineStore.getState();
        const newZoom = Math.max(10, Math.min(800, Math.round(prevZoom * zoomFactor)));
        if (newZoom !== prevZoom) {
          const scaleChange = newZoom / prevZoom;
          // Account for flex centering offset — the transform div is centered by the
          // flex container, so mouse coords must be relative to the div's layout origin
          const flexX = tkTransformRef.current?.offsetLeft || 0;
          const flexY = tkTransformRef.current?.offsetTop || 0;
          const lx = mx - flexX;
          const ly = my - flexY;
          setTkPan({ x: lx - scaleChange * (lx - prevPan.x), y: ly - scaleChange * (ly - prevPan.y) });
          setTkZoom(newZoom);
        }
      } else {
        // PAN: trackpad two-finger scroll
        const { tkPan: prevPan } = useDrawingPipelineStore.getState();
        setTkPan({ x: prevPan.x - e.deltaX, y: prevPan.y - e.deltaY });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all state read via getState()
    [],
  );

  const handleDrawingMouseDown = useCallback(
    e => {
      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        const { setTkContextMenu, tkPan } = useDrawingPipelineStore.getState();
        setTkContextMenu(null);
        tkPanning.current = true;
        tkPanStart.current = { x: e.clientX, y: e.clientY, panX: tkPan.x, panY: tkPan.y, moved: false };
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all state read via getState()
    [],
  );

  return { handleCanvasClick, handleDrawingWheel, handleDrawingMouseDown };
}
