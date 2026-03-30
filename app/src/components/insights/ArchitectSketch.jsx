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
import { extractVectors } from "@/utils/vectorExtractor";
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
  const [error, setError] = useState(null);
  const [exploded, setExploded] = useState(false);
  const [floorHeight, setFloorHeight] = useState(10);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [cameraDistance, setCameraDistance] = useState(60);
  const pdfInputRef = useRef(null);

  // Direct PDF upload — bypasses storage, sends straight to Render API
  const handleDirectPdfUpload = useCallback(async (file) => {
    if (!file || !file.name.endsWith(".pdf")) return;
    setScanning(true);
    setError(null);

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

      // Get page count by trying page 0
      const VECTOR_API = "https://novaterra-vector-api.onrender.com";
      const floorGroups = {};
      const PDF_TO_CANVAS = 1.5;

      // Try first 10 pages
      for (let pageNum = 0; pageNum < 10; pageNum++) {
        const resp = await fetch(`${VECTOR_API}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: pdfBase64, page_num: pageNum }),
        });

        if (!resp.ok) break; // no more pages

        const data = await resp.json();
        if (data.error) break;
        if (!data.walls?.length) continue;

        const floorLabel = `Page ${pageNum + 1}`;
        // Use a default scale since we don't have calibration for direct uploads
        // Assume 1/4" = 1'-0" on 24x36 sheet: ppf ≈ 24
        const defaultPpf = 24;
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
          floorGroups[floorLabel] = { floorLabel, elevation: pageNum * floorHeight, height: floorHeight, walls: [], rooms: [] };
        }
        floorGroups[floorLabel].walls.push(...wallsFeet);
        floorGroups[floorLabel].rooms.push(...roomsFeet);

        console.log(`[ArchitectSketch] Page ${pageNum + 1}: ${data.stats?.merged_walls || 0} walls, ${data.stats?.rooms_detected || 0} rooms`);
      }

      const floors = Object.values(floorGroups);
      if (floors.length === 0) {
        setError("No walls detected in this PDF. The file may be scanned (raster) or contain no architectural drawings.");
      } else {
        // Auto-center
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
        setSketchData({ floors });
      }
    } catch (err) {
      console.error("[ArchitectSketch] Direct upload failed:", err);
      setError(err.message || "Failed to process PDF");
    } finally {
      setScanning(false);
    }
  }, [floorHeight]);

  // Extract vectors from PDF via server-side PyMuPDF
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);

    try {
      const floorMap = buildFloorMap(drawings, floorHeight);
      const floorGroups = {};
      const PDF_TO_CANVAS = 1.5; // PDF points (72 DPI) → canvas pixels (108 DPI)

      for (const drawing of drawings) {
        if (!isFloorPlanDrawing(drawing)) continue;

        const { canRender, reason } = canRenderArchitectSketch(drawing.id);
        if (!canRender) {
          console.warn(`[ArchitectSketch] Skipping ${drawing.id.slice(0,8)}: ${reason}`);
          continue;
        }

        const ppf = getPxPerFoot(drawing.id);
        if (!ppf) continue;

        // Call server-side PyMuPDF extraction
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
        const floorLabel = fa?.label || inferFloorFromSheet(drawing) || "Floor 1";

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
        // ── AUTO-CENTER: compute bounding box of all walls, center at origin ──
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
          const buildingWidth = maxX - minX;
          const buildingDepth = maxZ - minZ;

          console.log(`[ArchitectSketch] Bounds: ${buildingWidth.toFixed(1)}ft × ${buildingDepth.toFixed(1)}ft, center (${cx.toFixed(1)}, ${cz.toFixed(1)})`);

          // Subtract center from all coordinates
          floors.forEach(f => {
            f.walls.forEach(w => {
              w.start = [w.start[0] - cx, w.start[1] - cz];
              w.end = [w.end[0] - cx, w.end[1] - cz];
            });
            f.rooms.forEach(r => {
              if (r.polygon) r.polygon = r.polygon.map(([x, y]) => [x - cx, y - cz]);
            });
          });

          // Auto-fit camera distance based on building size
          const maxDim = Math.max(buildingWidth, buildingDepth, 20); // minimum 20ft
          const camDist = maxDim * 1.3;
          setCameraDistance(camDist);
        }

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
