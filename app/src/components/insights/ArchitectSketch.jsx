// ArchitectSketch.jsx — White wireframe lines on black canvas
// The aesthetic: architect's sketch — white glowing lines in the dark.
// Walls thick, rooms visible. The floor plan IS the 3D model.
//
// Data pipeline: PDF → detectWalls (CV) → calibration → feet → Three.js Line2
// Requires calibrated drawing (getPxPerFoot must return a value).
// v2: Fixed floor deduplication, removed teal/orange overlays, pure white only.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import { useDrawingsStore } from "@/stores/drawingsStore";
import { buildFloorMap, inferFloorFromSheet } from "@/utils/floorAssignment";
import { getPxPerFoot } from "@/utils/geometryBuilder";
import { canRenderArchitectSketch, pdfPointToFeet } from "@/utils/vectorCoordinates";
import { extractVectors, analyzePdf } from "@/utils/vectorExtractor";
import { bt } from "@/utils/styles";
import { useTheme } from "@/hooks/useTheme";

// Bloom disabled for v1 — clean anti-aliased lines without wash
// Can be re-enabled once wall rendering is confirmed correct

// ── Single wall rendered as 4 Line2 edges (bottom, top, 2 verticals) ──
function WallLine({ start, end, weight, elevation, wallHeight }) {
  const ref = useRef();
  const { size } = useThree();

  useEffect(() => {
    if (!ref.current) return;
    while (ref.current.children.length) {
      const c = ref.current.children[0];
      c.geometry?.dispose();
      c.material?.dispose();
      ref.current.remove(c);
    }

    const lineWidth = weight > 1.2 ? 2.5 : weight > 0.7 ? 1.5 : 0.8;
    const y0 = elevation;
    const y1 = elevation + wallHeight;
    const color = new THREE.Color("#FFFFFF");

    const makeLine = (positions) => {
      const geo = new LineGeometry();
      geo.setPositions(positions);
      const mat = new LineMaterial({
        color,
        linewidth: lineWidth,
        resolution: new THREE.Vector2(size.width, size.height),
        transparent: true,
        opacity: 0.85,
      });
      const line = new Line2(geo, mat);
      line.computeLineDistances();
      return line;
    };

    // Bottom edge
    ref.current.add(makeLine([start[0], y0, start[1], end[0], y0, end[1]]));
    // Top edge
    ref.current.add(makeLine([start[0], y1, start[1], end[0], y1, end[1]]));
    // Vertical at start
    ref.current.add(makeLine([start[0], y0, start[1], start[0], y1, start[1]]));
    // Vertical at end
    ref.current.add(makeLine([end[0], y0, end[1], end[0], y1, end[1]]));
  }, [start, end, weight, elevation, wallHeight, size]);

  return <group ref={ref} />;
}

// ── Room outline — faint white polygon on the floor ──
function RoomOutline({ polygon, elevation }) {
  const ref = useRef();
  const { size } = useThree();

  const points = useMemo(() => {
    if (!polygon || polygon.length < 3) return null;
    const pts = [];
    for (let i = 0; i < polygon.length; i++) {
      const [x1, z1] = polygon[i];
      const [x2, z2] = polygon[(i + 1) % polygon.length];
      pts.push(x1, elevation + 0.05, z1, x2, elevation + 0.05, z2);
    }
    return pts;
  }, [polygon, elevation]);

  useEffect(() => {
    if (!ref.current || !points) return;
    while (ref.current.children.length) {
      const c = ref.current.children[0];
      c.geometry?.dispose();
      c.material?.dispose();
      ref.current.remove(c);
    }
    const geo = new LineGeometry();
    geo.setPositions(points);
    const mat = new LineMaterial({
      color: new THREE.Color("#FFFFFF"),
      linewidth: 0.4,
      resolution: new THREE.Vector2(size.width, size.height),
      transparent: true,
      opacity: 0.15,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    ref.current.add(line);
  }, [points, size]);

  if (!points) return null;
  return <group ref={ref} />;
}

// ── Check if a drawing looks like a floor plan ──
function isFloorPlanDrawing(drawing) {
  const title = (drawing.title || drawing.name || drawing.sheetTitle || "").toLowerCase();
  const sheet = (drawing.sheetNumber || "").toLowerCase();
  // Positive signals: contains "floor plan", "plan", sheet starts with a1/a2
  if (/\bfloor\s*plan\b/.test(title)) return true;
  if (/\bplan\b/i.test(title) && !/detail|section|elevation|framing|foundation|roof|reflected|ceiling|demo/i.test(title)) return true;
  if (/^a[0-9]/.test(sheet)) return true;
  // If nothing detected, include it (better to include than miss)
  return true;
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function ArchitectSketch() {
  const C = useTheme();
  const T = C.T;
  const drawings = useDrawingsStore(s => s.drawings);

  const [sketchData, setSketchData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState(""); // "analyzing", "extracting", "building"
  const [scanDetail, setScanDetail] = useState(""); // e.g. "Page 3 of 12"
  const [scanProgress, setScanProgress] = useState(0); // 0-100
  const [error, setError] = useState(null);
  const [exploded, setExploded] = useState(false);
  const [floorHeight, setFloorHeight] = useState(10);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [cameraDistance, setCameraDistance] = useState(60);
  const pdfInputRef = useRef(null);

  // Direct PDF upload — bypasses storage, sends straight to Render API
  // Step 1: /analyze classifies all pages → only extract floor plans
  // Step 2: /extract on each floor plan page → walls + rooms
  const handleDirectPdfUpload = useCallback(async (file) => {
    if (!file || !file.name.endsWith(".pdf")) return;
    setScanning(true);
    setError(null);
    setScanPhase("analyzing");
    setScanDetail("Reading PDF...");
    setScanProgress(5);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const chunks = [];
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
      }
      const pdfBase64 = "data:application/pdf;base64," + btoa(chunks.join(""));

      console.log(`[ArchitectSketch] Direct upload: ${file.name} (${(arrayBuffer.byteLength / 1024).toFixed(0)}KB)`);

      const VECTOR_API = "https://novaterra-vector-api.onrender.com";
      const floorGroups = {};
      const PDF_TO_CANVAS = 1.5;
      const defaultPpf = 24;

      // Step 1: Classify all pages
      setScanPhase("analyzing");
      setScanDetail("Classifying pages...");
      setScanProgress(15);

      let floorPlanPages = [];
      try {
        const analyzeResp = await fetch(`${VECTOR_API}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: pdfBase64 }),
        });
        if (analyzeResp.ok) {
          const analysis = await analyzeResp.json();
          floorPlanPages = analysis.floor_plans || [];
          setScanDetail(`${analysis.total_pages} pages found · ${floorPlanPages.length} floor plans`);
          setScanProgress(25);
          console.log(`[ArchitectSketch] Analysis: ${analysis.total_pages} pages → ${floorPlanPages.length} floor plans`);
        }
      } catch (analyzeErr) {
        console.warn(`[ArchitectSketch] /analyze failed, falling back to brute-force:`, analyzeErr.message);
      }

      // Fallback
      if (floorPlanPages.length === 0) {
        for (let i = 0; i < 10; i++) {
          floorPlanPages.push({ page_num: i, floor_label: null, floor_num: null });
        }
      }

      // Step 2: Extract walls from each floor plan page
      setScanPhase("extracting");
      let floorIndex = 0;
      const total = floorPlanPages.length;
      for (let fpIdx = 0; fpIdx < total; fpIdx++) {
        const fp = floorPlanPages[fpIdx];
        const pageNum = fp.page_num;
        const pct = 25 + Math.round((fpIdx / total) * 60);
        setScanProgress(pct);
        setScanDetail(`Extracting walls · page ${fpIdx + 1} of ${total}`);

        const resp = await fetch(`${VECTOR_API}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: pdfBase64, page_num: pageNum }),
        });

        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.error || !data.walls?.length) continue;

        const floorLabel = fp.floor_label || `Floor ${floorIndex + 1}`;
        const elevation = (fp.floor_num != null && fp.floor_num !== 99)
          ? (fp.floor_num - 1) * floorHeight
          : floorIndex * floorHeight;
        const scale = PDF_TO_CANVAS / defaultPpf;

        const wallsFeet = data.walls.map(w => ({
          start: [w.start[0] * scale, w.start[1] * scale],
          end: [w.end[0] * scale, w.end[1] * scale],
          weight: w.weight || 1,
          orientation: w.orientation,
          length: w.length * scale,
        }));

        const roomsFeet = (data.rooms || []).map(r => ({
          polygon: r.polygon?.map(([x, y]) => [x * scale, y * scale]),
          area: r.area_sq_pts ? r.area_sq_pts * scale * scale : 0,
        }));

        if (!floorGroups[floorLabel]) {
          floorGroups[floorLabel] = { floorLabel, elevation, height: floorHeight, walls: [], rooms: [] };
          floorIndex++;
        }
        floorGroups[floorLabel].walls.push(...wallsFeet);
        floorGroups[floorLabel].rooms.push(...roomsFeet);

        console.log(`[ArchitectSketch] Page ${pageNum + 1} → ${floorLabel}: ${data.stats?.merged_walls || 0} walls, ${data.stats?.rooms_detected || 0} rooms`);
      }

      const floors = Object.values(floorGroups);
      if (floors.length === 0) {
        setError("No walls detected in this PDF. The file may be scanned (raster) or contain no architectural drawings.");
      } else {
        setScanPhase("building");
        setScanDetail(`Assembling ${floors.length} floor${floors.length > 1 ? "s" : ""}...`);
        setScanProgress(90);

        // Auto-center building at origin
        const allX = [], allZ = [];
        floors.forEach(f => f.walls.forEach(w => {
          allX.push(w.start[0], w.end[0]);
          allZ.push(w.start[1], w.end[1]);
        }));
        if (allX.length > 0) {
          const minX = Math.min(...allX), maxX = Math.max(...allX);
          const minZ = Math.min(...allZ), maxZ = Math.max(...allZ);
          const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
          floors.forEach(f => {
            f.walls.forEach(w => { w.start = [w.start[0] - cx, w.start[1] - cz]; w.end = [w.end[0] - cx, w.end[1] - cz]; });
            f.rooms.forEach(r => { if (r.polygon) r.polygon = r.polygon.map(([x, y]) => [x - cx, y - cz]); });
          });
          const maxDim = Math.max(maxX - minX, maxZ - minZ, 20);
          setCameraDistance(maxDim * 1.3);
          console.log(`[ArchitectSketch] Building: ${(maxX-minX).toFixed(0)}ft × ${(maxZ-minZ).toFixed(0)}ft`);
        }
        setScanProgress(100);
        setSketchData({ floors });
      }
    } catch (err) {
      console.error("[ArchitectSketch] Direct upload failed:", err);
      setError(err.message || "Failed to process PDF");
    } finally {
      setScanning(false);
      setScanPhase("");
      setScanDetail("");
      setScanProgress(0);
    }
  }, [floorHeight]);

  // Extract vectors from PDF via server-side PyMuPDF
  // Uses /analyze to classify pages → only extracts floor plans
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setScanPhase("analyzing");
    setScanDetail("Loading drawings...");
    setScanProgress(5);

    try {
      const floorMap = buildFloorMap(drawings, floorHeight);
      const floorGroups = {};
      const PDF_TO_CANVAS = 1.5;

      const skipPages = new Set();
      const analyzeFloorLabels = {};

      // Step 1: Analyze source PDFs
      setScanDetail("Classifying pages...");
      setScanProgress(10);
      const analyzedPdfs = new Set();
      for (const drawing of drawings) {
        const fileName = drawing.fileName || drawing.sourceFileName;
        if (!fileName || analyzedPdfs.has(fileName)) continue;
        analyzedPdfs.add(fileName);

        try {
          const { loadPdfRawFromIDB } = await import("@/utils/uploadPipeline");
          const arrayBuffer = await loadPdfRawFromIDB(fileName);
          if (arrayBuffer && arrayBuffer.byteLength > 100) {
            const bytes = new Uint8Array(arrayBuffer);
            const chunks = [];
            const chunkSize = 32768;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
            }
            const pdfBase64 = "data:application/pdf;base64," + btoa(chunks.join(""));
            const analysis = await analyzePdf(pdfBase64);

            for (const p of analysis.pages) {
              if (p.page_type !== "floor_plan") {
                skipPages.add(`${fileName}:${p.page_num}`);
              }
              if (p.floor_label) {
                analyzeFloorLabels[`${fileName}:${p.page_num}`] = p.floor_label;
              }
            }
            setScanDetail(`${fileName.slice(0,30)}... · ${analysis.floor_plan_count} floor plans`);
            console.log(`[ArchitectSketch] Analyzed ${fileName}: ${analysis.floor_plan_count}/${analysis.total_pages} floor plans`);
          }
        } catch (err) {
          console.warn(`[ArchitectSketch] /analyze failed for ${fileName}, proceeding without filter:`, err.message);
        }
      }

      // Step 2: Extract walls from each drawing
      setScanPhase("extracting");
      setScanProgress(25);
      const eligibleDrawings = drawings.filter(drawing => {
        const fileName = drawing.fileName || drawing.sourceFileName;
        const pageNum = (drawing.pdfPage || drawing.pageNumber || 1) - 1;
        const pageKey = `${fileName}:${pageNum}`;
        if (skipPages.has(pageKey)) return false;
        if (!analyzedPdfs.has(fileName) && !isFloorPlanDrawing(drawing)) return false;
        const { canRender } = canRenderArchitectSketch(drawing.id);
        if (!canRender) return false;
        const ppf = getPxPerFoot(drawing.id);
        return !!ppf;
      });

      for (let di = 0; di < eligibleDrawings.length; di++) {
        const drawing = eligibleDrawings[di];
        const fileName = drawing.fileName || drawing.sourceFileName;
        const pageNum = (drawing.pdfPage || drawing.pageNumber || 1) - 1;
        const pageKey = `${fileName}:${pageNum}`;
        const pct = 25 + Math.round((di / eligibleDrawings.length) * 60);
        setScanProgress(pct);
        setScanDetail(`Extracting walls · drawing ${di + 1} of ${eligibleDrawings.length}`);

        const ppf = getPxPerFoot(drawing.id);

        let vectorData;
        try {
          vectorData = await extractVectors(drawing.id);
        } catch (err) {
          console.warn(`[ArchitectSketch] Vector extraction failed for ${drawing.id.slice(0,8)}: ${err.message}`);
          continue;
        }

        if (!vectorData?.walls?.length) continue;

        const fa = floorMap[drawing.id];
        const elevation = fa?.elevation ?? 0;
        // Prefer /analyze floor label, fallback to sheet-based inference
        const floorLabel = analyzeFloorLabels[pageKey] || fa?.label || inferFloorFromSheet(drawing) || "Floor 1";

        // Convert from PDF points to feet: pts * 1.5 / ppf
        const scale = PDF_TO_CANVAS / ppf;

        console.log(`[ArchitectSketch] ${drawing.id.slice(0,8)}: ${vectorData.walls.length} walls, ppf=${ppf.toFixed(1)}, scale=${scale.toFixed(4)} pts/ft`);

        const wallsFeet = vectorData.walls.map(w => ({
          start: [w.start[0] * scale, w.start[1] * scale],
          end: [w.end[0] * scale, w.end[1] * scale],
          weight: w.weight || 1,
          orientation: w.orientation,
          length: w.length * scale,
        }));

        const roomsFeet = (vectorData.rooms || []).map(r => ({
          polygon: r.polygon?.map(([x, y]) => [x * scale, y * scale]),
          area: r.area_sq_pts ? r.area_sq_pts * scale * scale : 0,
          centroid: r.centroid ? [r.centroid[0] * scale, r.centroid[1] * scale] : null,
        }));

        // Log diagnostic
        if (wallsFeet.length > 0) {
          const xs = wallsFeet.flatMap(w => [w.start[0], w.end[0]]);
          const ys = wallsFeet.flatMap(w => [w.start[1], w.end[1]]);
          console.log(`[ArchitectSketch] Feet bounds: X=[${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}] Y=[${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}]`);
          console.log(`[ArchitectSketch] Building size: ${(Math.max(...xs)-Math.min(...xs)).toFixed(1)}ft × ${(Math.max(...ys)-Math.min(...ys)).toFixed(1)}ft`);
        }

        if (!floorGroups[floorLabel]) {
          floorGroups[floorLabel] = { floorLabel, elevation, height: fa?.height || floorHeight, walls: [], rooms: [] };
        }
        floorGroups[floorLabel].walls.push(...wallsFeet);
        floorGroups[floorLabel].rooms.push(...roomsFeet);
      }

      const floors = Object.values(floorGroups);

      if (floors.length === 0) {
        setError("No calibrated floor plan drawings found. Calibrate at least one drawing on the Takeoffs page.");
      } else {
        setScanPhase("building");
        setScanDetail(`Assembling ${floors.length} floor${floors.length > 1 ? "s" : ""}...`);
        setScanProgress(90);

        const allX = [], allZ = [];
        floors.forEach(f => f.walls.forEach(w => {
          allX.push(w.start[0], w.end[0]);
          allZ.push(w.start[1], w.end[1]);
        }));

        if (allX.length > 0) {
          const minX = Math.min(...allX), maxX = Math.max(...allX);
          const minZ = Math.min(...allZ), maxZ = Math.max(...allZ);
          const cx = (minX + maxX) / 2;
          const cz = (minZ + maxZ) / 2;

          floors.forEach(f => {
            f.walls.forEach(w => {
              w.start = [w.start[0] - cx, w.start[1] - cz];
              w.end = [w.end[0] - cx, w.end[1] - cz];
            });
            f.rooms.forEach(r => {
              if (r.polygon) r.polygon = r.polygon.map(([x, y]) => [x - cx, y - cz]);
            });
          });

          const maxDim = Math.max(maxX - minX, maxZ - minZ, 20);
          setCameraDistance(maxDim * 1.3);
        }

        setScanProgress(100);
        setSketchData({ floors });
        const totalWalls = floors.reduce((s, f) => s + f.walls.length, 0);
        const totalRooms = floors.reduce((s, f) => s + f.rooms.length, 0);
        console.log(`[ArchitectSketch] ${floors.length} floor(s), ${totalWalls} walls, ${totalRooms} rooms`);
      }
    } catch (err) {
      console.error("[ArchitectSketch] Scan failed:", err);
      setError(err.message || "Failed to generate sketch");
    } finally {
      setScanning(false);
      setScanPhase("");
      setScanDetail("");
      setScanProgress(0);
    }
  }, [drawings, floorHeight]);

  const totalWalls = sketchData?.floors?.reduce((s, f) => s + f.walls.length, 0) || 0;
  const totalRooms = sketchData?.floors?.reduce((s, f) => s + f.rooms.length, 0) || 0;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
      {/* Toolbar */}
      <div style={{
        position: "absolute", top: 12, left: 12, zIndex: 10,
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <button
          onClick={handleScan}
          disabled={scanning || !drawings?.length}
          style={{
            ...bt(C), padding: "6px 12px", fontSize: 11, fontWeight: 600,
            background: scanning ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)",
            color: "#fff", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6, cursor: scanning ? "wait" : "pointer",
          }}
        >
          {scanning ? "Scanning..." : "⚡ Generate Sketch"}
        </button>

        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) handleDirectPdfUpload(e.target.files[0]); e.target.value = ""; }}
        />
        <button
          onClick={() => pdfInputRef.current?.click()}
          disabled={scanning}
          style={{
            ...bt(C), padding: "6px 12px", fontSize: 11,
            background: "rgba(255,255,255,0.05)",
            color: "#888", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          📄 Upload PDF
        </button>

        {sketchData && (
          <>
            <button
              onClick={() => setExploded(e => !e)}
              style={{
                ...bt(C), padding: "6px 10px", fontSize: 11,
                background: exploded ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
                color: "#999", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, cursor: "pointer",
              }}
            >
              {exploded ? "Collapse" : "Explode"}
            </button>

            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#555" }}>
              Height:
              <input
                type="number" value={floorHeight} min={8} max={20} step={0.5}
                onChange={e => setFloorHeight(parseFloat(e.target.value) || 10)}
                onBlur={e => setFloorHeight(parseFloat(e.target.value) || 10)}
                style={{
                  width: 44, padding: "3px 4px", fontSize: 10, background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#ccc",
                  textAlign: "center",
                }}
              />
              ft
            </label>

            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", padding: "4px 8px" }}>
              {sketchData.floors.length} floor{sketchData.floors.length !== 1 ? "s" : ""} · {totalWalls} walls · {totalRooms} rooms
            </span>
          </>
        )}
      </div>

      {/* Floor selector */}
      {sketchData && sketchData.floors.length > 1 && (
        <div style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          zIndex: 10, display: "flex", flexDirection: "column", gap: 4,
        }}>
          <button
            onClick={() => setSelectedFloor(null)}
            style={{
              padding: "4px 8px", fontSize: 9, borderRadius: 4, cursor: "pointer",
              background: selectedFloor === null ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${selectedFloor === null ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
              color: selectedFloor === null ? "#fff" : "#555",
            }}
          >ALL</button>
          {sketchData.floors.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedFloor(i)}
              style={{
                padding: "4px 8px", fontSize: 9, borderRadius: 4, cursor: "pointer",
                background: selectedFloor === i ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedFloor === i ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.08)"}`,
                color: selectedFloor === i ? "#fff" : "#555",
              }}
            >{f.floorLabel}</button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 10, padding: "8px 16px", borderRadius: 8,
          background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)",
          color: "#FF4757", fontSize: 12, maxWidth: 400, textAlign: "center",
        }}>
          {error}
        </div>
      )}

      {/* ── SCANNING OVERLAY ── */}
      {scanning && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column",
          background: "#000",
        }}>
          {/* Blueprint grid background */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.06,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }} />

          {/* Sweeping scan line — horizontal band moving top to bottom */}
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 20%, #fff 50%, rgba(255,255,255,0.6) 80%, transparent 100%)",
            boxShadow: "0 0 30px 8px rgba(255,255,255,0.15), 0 0 80px 20px rgba(255,255,255,0.05)",
            animation: "scanSweep 2.4s ease-in-out infinite",
          }} />

          {/* Faint vertical scan lines — data streams */}
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden", opacity: 0.04,
          }}>
            {[15, 30, 50, 65, 80].map((left, i) => (
              <div key={i} style={{
                position: "absolute", left: `${left}%`, top: 0, width: 1, height: "100%",
                background: "linear-gradient(180deg, transparent, #fff 40%, #fff 60%, transparent)",
                animation: `scanVertical ${1.8 + i * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>

          {/* Center content */}
          <div style={{
            position: "relative", zIndex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 20,
          }}>
            {/* Phase icon */}
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "scanPulse 2s ease-in-out infinite",
            }}>
              <span style={{ fontSize: 20, filter: "grayscale(1) brightness(2)" }}>
                {scanPhase === "analyzing" ? "🔍" : scanPhase === "extracting" ? "📐" : "🏗"}
              </span>
            </div>

            {/* Phase label */}
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
            }}>
              {scanPhase === "analyzing" ? "Analyzing Pages" :
               scanPhase === "extracting" ? "Extracting Geometry" :
               scanPhase === "building" ? "Building Model" : "Scanning"}
            </div>

            {/* Detail text */}
            <div style={{
              fontSize: 12, color: "rgba(255,255,255,0.25)",
              fontFamily: "'JetBrains Mono', monospace",
              minHeight: 18,
            }}>
              {scanDetail}
            </div>

            {/* Progress bar */}
            <div style={{
              width: 200, height: 2, background: "rgba(255,255,255,0.06)",
              borderRadius: 1, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", background: "#fff",
                width: `${scanProgress}%`,
                transition: "width 0.4s ease-out",
                boxShadow: "0 0 8px rgba(255,255,255,0.3)",
              }} />
            </div>

            {/* Percentage */}
            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.15)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {scanProgress}%
            </div>
          </div>

          {/* CSS animations injected inline */}
          <style>{`
            @keyframes scanSweep {
              0% { top: -2px; opacity: 0; }
              5% { opacity: 1; }
              95% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
            @keyframes scanVertical {
              0%, 100% { opacity: 0; }
              50% { opacity: 1; }
            }
            @keyframes scanPulse {
              0%, 100% { transform: scale(1); opacity: 0.6; }
              50% { transform: scale(1.08); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {/* Empty state */}
      {!sketchData && !scanning && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.15)" }}>
            Click <span style={{ color: "#fff" }}>Generate Sketch</span> to create a wireframe from your drawings
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.08)" }}>
            Requires at least one calibrated floor plan
          </div>
        </div>
      )}

      {/* 3D Canvas — pure black, white lines only */}
      <Canvas
        camera={{ position: [cameraDistance, cameraDistance * 0.7, cameraDistance], fov: 50, near: 0.1, far: 2000 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        style={{ background: "#000000" }}
      >
        <ambientLight intensity={0.02} />
        <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={200} maxPolarAngle={Math.PI * 0.85} />

        {/* Very faint ground reference */}
        <gridHelper args={[100, 50, "#0A0A0A", "#050505"]} position={[0, -0.01, 0]} />

        {/* White wireframe walls + room outlines — NOTHING ELSE */}
        {sketchData?.floors.map((floor, fi) => {
          if (selectedFloor !== null && selectedFloor !== fi) return null;
          const explodeOffset = exploded ? fi * (floor.height + 5) : 0;

          return (
            <group key={fi} position={[0, explodeOffset, 0]}>
              {floor.walls.map((w, wi) => (
                <WallLine
                  key={`w-${fi}-${wi}`}
                  start={[w.start[0], w.start[1]]}
                  end={[w.end[0], w.end[1]]}
                  weight={w.weight || 1}
                  elevation={floor.elevation}
                  wallHeight={floor.height}
                />
              ))}
              {floor.rooms.map((r, ri) => (
                <RoomOutline
                  key={`r-${fi}-${ri}`}
                  polygon={r.polygon}
                  elevation={floor.elevation}
                />
              ))}
            </group>
          );
        })}
      </Canvas>
    </div>
  );
}
