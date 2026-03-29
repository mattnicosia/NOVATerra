// ArchitectSketch.jsx — White wireframe lines on black canvas
// The aesthetic: architect's sketch — white glowing lines in the dark.
// Walls thick, rooms visible. The floor plan IS the 3D model.
//
// Data pipeline: PDF → detectWalls (CV) → calibration → feet → Three.js Line2
// Requires calibrated drawing (getPxPerFoot must return a value).
// v2: Fixed floor deduplication, removed teal/orange overlays, pure white only.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Effects } from "@react-three/drei";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { extend } from "@react-three/fiber";

extend({ UnrealBloomPass });

import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { buildFloorMap, inferFloorFromSheet } from "@/utils/floorAssignment";
import { getPxPerFoot } from "@/utils/geometryBuilder";
import { canRenderArchitectSketch } from "@/utils/vectorCoordinates";
import { detectWalls } from "@/utils/wallDetector";
import { detectSpacesForLevel } from "@/utils/pascalSpaceDetection";
import { bt } from "@/utils/styles";
import { useTheme } from "@/hooks/useTheme";

// ── Bloom — subtle glow on white lines ──
function BloomEffect() {
  const { size } = useThree();
  return (
    <Effects disableGamma>
      <unrealBloomPass
        args={[new THREE.Vector2(size.width, size.height), 0.2, 0.5, 0.85]}
        threshold={0.5}
        strength={0.2}
        radius={0.3}
      />
    </Effects>
  );
}

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

  // Scan drawings for vector data
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);

    try {
      const pdfCanvases = useDrawingsStore.getState().pdfCanvases;
      const floorMap = buildFloorMap(drawings, floorHeight);

      // Collect walls per drawing, then GROUP by floor label
      const floorGroups = {}; // { "Floor 1": { walls: [], rooms: [], elevation, height } }

      for (const drawing of drawings) {
        if (!isFloorPlanDrawing(drawing)) {
          console.log(`[ArchitectSketch] Skipping non-floor-plan: ${drawing.title || drawing.id}`);
          continue;
        }

        const { canRender, reason } = canRenderArchitectSketch(drawing.id);
        if (!canRender) {
          console.warn(`[ArchitectSketch] Skipping ${drawing.id}: ${reason}`);
          continue;
        }

        const imageData = pdfCanvases[drawing.id] || drawing?.data;
        if (!imageData) continue;

        const { walls } = await detectWalls(imageData, drawing.id);
        if (!walls?.length) continue;

        const { spaces } = detectSpacesForLevel("sketch-" + drawing.id, walls, 0.5);
        const rooms = spaces.filter(s => !s.isExterior);

        const fa = floorMap[drawing.id];
        const elevation = fa?.elevation ?? 0;
        const floorLabel = fa?.label || inferFloorFromSheet(drawing) || "Floor 1";

        const ppf = getPxPerFoot(drawing.id);
        if (!ppf) continue;

        const wallsFeet = walls.map(w => ({
          ...w,
          start: [w.start[0] / ppf, w.start[1] / ppf],
          end: [w.end[0] / ppf, w.end[1] / ppf],
          thickness: (w.thickness || 4) / ppf,
        }));

        const roomsFeet = rooms.map(r => ({
          ...r,
          polygon: r.polygon?.map(([x, y]) => [x / ppf, y / ppf]),
        }));

        // GROUP by floor label — merge walls from multiple drawings on the same floor
        if (!floorGroups[floorLabel]) {
          floorGroups[floorLabel] = {
            floorLabel,
            elevation,
            height: fa?.height || floorHeight,
            walls: [],
            rooms: [],
          };
        }
        floorGroups[floorLabel].walls.push(...wallsFeet);
        floorGroups[floorLabel].rooms.push(...roomsFeet);
      }

      const floors = Object.values(floorGroups);

      if (floors.length === 0) {
        setError("No calibrated floor plan drawings found. Calibrate at least one drawing on the Takeoffs page.");
      } else {
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
        camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 500 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        style={{ background: "#000000" }}
      >
        <ambientLight intensity={0.02} />
        <BloomEffect />
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
