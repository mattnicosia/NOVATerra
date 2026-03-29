// ArchitectSketch.jsx — White wireframe lines on black canvas
// Projects actual building geometry from vector-extracted wall data.
// The aesthetic: architect's sketch projected as hologram — white glowing lines in the dark.
// Walls thick, dimensions thin, rooms visible. The floor plan IS the 3D model.
//
// Data pipeline: PDF → PyMuPDF vectors → vectorCoordinates.js conversion → Three.js Line2
// Requires calibrated drawing (getPxPerFoot must return a value).

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Effects } from "@react-three/drei";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { buildFloorMap, inferFloorFromSheet } from "@/utils/floorAssignment";
import { generateElementsFromTakeoffs, getPxPerFoot } from "@/utils/geometryBuilder";
import { convertFloorToFeet, canRenderArchitectSketch } from "@/utils/vectorCoordinates";
import { detectWalls } from "@/utils/wallDetector";
import { detectSpacesForLevel } from "@/utils/pascalSpaceDetection";
import { bt } from "@/utils/styles";
import { useTheme } from "@/hooks/useTheme";

// ── Floor colors for multi-floor differentiation ──
const FLOOR_TINTS = [
  "#FFFFFF",  // Floor 1 — pure white
  "#CCE5FF",  // Floor 2 — faint blue
  "#CCFFE5",  // Floor 3 — faint green
  "#FFE5CC",  // Floor 4 — faint amber
  "#E5CCFF",  // Floor 5 — faint purple
  "#FFCCCC",  // Basement — faint red
];

// ── Bloom postprocessing ──
function BloomEffect() {
  const { size } = useThree();
  return (
    <Effects disableGamma>
      <unrealBloomPass
        args={[new THREE.Vector2(size.width, size.height), 0.4, 0.1, 0.85]}
        threshold={0.1}
        strength={0.4}
        radius={0.1}
      />
    </Effects>
  );
}

// ── Single wall line rendered as Line2 with variable width ──
function WallLine({ start, end, weight, color, elevation, wallHeight }) {
  const ref = useRef();
  const { size } = useThree();

  useEffect(() => {
    if (!ref.current) return;

    // Map line weight to visual width (in pixels)
    // Heavy walls (exterior) = thick lines, light walls (interior) = thin
    const lineWidth = weight > 1.2 ? 2.5 : weight > 0.7 ? 1.5 : 0.8;

    const geo = new LineGeometry();
    // Extrude the wall vertically: draw the line at both floor and ceiling
    // This creates a visible wall "plane" as two horizontal lines + two verticals
    const y0 = elevation;
    const y1 = elevation + wallHeight;

    // Bottom edge
    geo.setPositions([
      start[0], y0, start[1],
      end[0], y0, end[1],
    ]);

    const mat = new LineMaterial({
      color: new THREE.Color(color),
      linewidth: lineWidth,
      resolution: new THREE.Vector2(size.width, size.height),
      transparent: true,
      opacity: 0.9,
    });

    const line = new Line2(geo, mat);
    line.computeLineDistances();

    // Clear previous
    while (ref.current.children.length) ref.current.remove(ref.current.children[0]);
    ref.current.add(line);

    // Add vertical edges at start and end
    const vertGeo1 = new LineGeometry();
    vertGeo1.setPositions([start[0], y0, start[1], start[0], y1, start[1]]);
    const vertLine1 = new Line2(vertGeo1, mat.clone());
    vertLine1.computeLineDistances();
    ref.current.add(vertLine1);

    const vertGeo2 = new LineGeometry();
    vertGeo2.setPositions([end[0], y0, end[1], end[0], y1, end[1]]);
    const vertLine2 = new Line2(vertGeo2, mat.clone());
    vertLine2.computeLineDistances();
    ref.current.add(vertLine2);

    // Top edge
    const topGeo = new LineGeometry();
    topGeo.setPositions([start[0], y1, start[1], end[0], y1, end[1]]);
    const topLine = new Line2(topGeo, mat.clone());
    topLine.computeLineDistances();
    ref.current.add(topLine);

    return () => {
      geo.dispose();
      mat.dispose();
      vertGeo1.dispose();
      vertGeo2.dispose();
      topGeo.dispose();
    };
  }, [start, end, weight, color, elevation, wallHeight, size]);

  return <group ref={ref} />;
}

// ── Room outline rendered as thin floor polygon ──
function RoomOutline({ polygon, elevation, color }) {
  if (!polygon || polygon.length < 3) return null;

  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i < polygon.length; i++) {
      const [x1, z1] = polygon[i];
      const [x2, z2] = polygon[(i + 1) % polygon.length];
      pts.push(x1, elevation + 0.05, z1, x2, elevation + 0.05, z2);
    }
    return pts;
  }, [polygon, elevation]);

  const ref = useRef();
  const { size } = useThree();

  useEffect(() => {
    if (!ref.current) return;
    const geo = new LineGeometry();
    geo.setPositions(points);
    const mat = new LineMaterial({
      color: new THREE.Color(color),
      linewidth: 0.5,
      resolution: new THREE.Vector2(size.width, size.height),
      transparent: true,
      opacity: 0.3,
    });
    const line = new Line2(geo, mat);
    line.computeLineDistances();
    while (ref.current.children.length) ref.current.remove(ref.current.children[0]);
    ref.current.add(line);
    return () => { geo.dispose(); mat.dispose(); };
  }, [points, color, size]);

  return <group ref={ref} />;
}

// ── Takeoff element overlay (colored accent on the white sketch) ──
function TakeoffElement({ element }) {
  const g = element.geometry;
  if (!g) return null;

  if (g.kind === "extrudedPath" && g.path?.length >= 2) {
    const pts = g.path;
    return pts.slice(0, -1).map((p, i) => {
      const next = pts[i + 1];
      return (
        <mesh key={`to-${element.id}-${i}`}
          position={[(p.x + next.x) / 2, (g.elevation || 0) + (g.height || 10) / 2, (p.z + next.z) / 2]}
          rotation={[0, Math.atan2(next.x - p.x, next.z - p.z), 0]}>
          <boxGeometry args={[g.width || 0.5, g.height || 10, Math.sqrt((next.x - p.x) ** 2 + (next.z - p.z) ** 2)]} />
          <meshBasicMaterial color="#00D4AA" transparent opacity={0.25} />
        </mesh>
      );
    });
  }

  if (g.kind === "box" && g.position) {
    return (
      <mesh position={[g.position.x, (g.elevation || 0) + (g.height || 2) / 2, g.position.z]}>
        <boxGeometry args={[g.width || 2, g.height || 2, g.depth || 2]} />
        <meshBasicMaterial color="#FFB020" transparent opacity={0.4} />
      </mesh>
    );
  }

  return null;
}

// ── Auto-rotating camera ──
function CameraRig() {
  const { camera } = useThree();
  useFrame((_, delta) => {
    // Very slow auto-rotation for ambient movement
    camera.position.x = camera.position.x * Math.cos(delta * 0.02) - camera.position.z * Math.sin(delta * 0.02);
    camera.position.z = camera.position.x * Math.sin(delta * 0.02) + camera.position.z * Math.cos(delta * 0.02);
  });
  return null;
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function ArchitectSketch() {
  const C = useTheme();
  const T = C.T;
  const drawings = useDrawingsStore(s => s.drawings);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);

  const [sketchData, setSketchData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [exploded, setExploded] = useState(false);
  const [floorHeight, setFloorHeight] = useState(10);
  const [selectedFloor, setSelectedFloor] = useState(null);

  // Generate takeoff-based 3D elements for accent overlay
  const elements = useMemo(() => {
    if (!takeoffs?.length || !drawings?.length) return [];
    try {
      const floorMap = buildFloorMap(drawings, floorHeight);
      return generateElementsFromTakeoffs(floorMap, null);
    } catch { return []; }
  }, [takeoffs, drawings, floorHeight]);

  // Scan drawings for vector data
  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);

    try {
      const pdfCanvases = useDrawingsStore.getState().pdfCanvases;
      const floorMap = buildFloorMap(drawings, floorHeight);
      const floors = [];

      for (const drawing of drawings) {
        const { canRender, reason } = canRenderArchitectSketch(drawing.id);
        if (!canRender) {
          console.warn(`[ArchitectSketch] Skipping ${drawing.id}: ${reason}`);
          continue;
        }

        const imageData = pdfCanvases[drawing.id] || drawing?.data;
        if (!imageData) continue;

        // Detect walls using CV
        const { walls } = await detectWalls(imageData, drawing.id);
        if (!walls?.length) continue;

        // Detect rooms from walls
        const { spaces } = detectSpacesForLevel("sketch", walls, 0.5);
        const rooms = spaces.filter(s => !s.isExterior);

        // Convert to feet using calibration
        const fa = floorMap[drawing.id];
        const elevation = fa?.elevation ?? 0;
        const floorLabel = fa?.label || inferFloorFromSheet(drawing) || "Floor 1";

        // Convert wall coordinates from CV pixel space to feet
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

        floors.push({
          drawingId: drawing.id,
          floorLabel,
          elevation,
          height: fa?.height || floorHeight,
          walls: wallsFeet,
          rooms: roomsFeet,
        });
      }

      if (floors.length === 0) {
        setError("No calibrated floor plan drawings found. Calibrate at least one drawing on the Takeoffs page.");
      } else {
        setSketchData({ floors });
        console.log(`[ArchitectSketch] Rendered ${floors.length} floor(s) with ${floors.reduce((s, f) => s + f.walls.length, 0)} walls`);
      }
    } catch (err) {
      console.error("[ArchitectSketch] Scan failed:", err);
      setError(err.message || "Failed to generate sketch");
    } finally {
      setScanning(false);
    }
  }, [drawings, floorHeight]);

  // Stats
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
            background: scanning ? "rgba(0,212,170,0.4)" : "rgba(0,212,170,0.15)",
            color: "#00D4AA", border: "1px solid rgba(0,212,170,0.3)",
            borderRadius: 6, cursor: scanning ? "wait" : "pointer",
            fontFamily: T?.font?.sans,
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

            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#666" }}>
              Height:
              <input
                type="number" value={floorHeight} min={8} max={20} step={0.5}
                onChange={e => setFloorHeight(parseFloat(e.target.value) || 10)}
                style={{
                  width: 44, padding: "3px 4px", fontSize: 10, background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#ccc",
                  textAlign: "center",
                }}
              />
              ft
            </label>
          </>
        )}

        {/* Stats badge */}
        {sketchData && (
          <span style={{
            fontSize: 9, color: "rgba(255,255,255,0.3)", padding: "4px 8px",
            background: "rgba(255,255,255,0.03)", borderRadius: 4,
          }}>
            {sketchData.floors.length} floor{sketchData.floors.length !== 1 ? "s" : ""} · {totalWalls} walls · {totalRooms} rooms
          </span>
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
              background: selectedFloor === null ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${selectedFloor === null ? "rgba(0,212,170,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: selectedFloor === null ? "#00D4AA" : "#666",
            }}
          >ALL</button>
          {sketchData.floors.map((f, i) => (
            <button
              key={i}
              onClick={() => setSelectedFloor(i)}
              style={{
                padding: "4px 8px", fontSize: 9, borderRadius: 4, cursor: "pointer",
                background: selectedFloor === i ? "rgba(0,212,170,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${selectedFloor === i ? "rgba(0,212,170,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: selectedFloor === i ? "#00D4AA" : "#666",
              }}
            >{f.floorLabel}</button>
          ))}
        </div>
      )}

      {/* Error message */}
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
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.2)", fontFamily: T?.font?.sans }}>
            Click <span style={{ color: "#00D4AA" }}>Generate Sketch</span> to create an architect's wireframe from your drawings
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.1)" }}>
            Requires at least one calibrated floor plan drawing
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [30, 25, 30], fov: 50, near: 0.1, far: 500 }}
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        style={{ background: "#000000" }}
      >
        {/* Minimal lighting — the lines are emissive/self-lit */}
        <ambientLight intensity={0.05} />

        {/* Bloom for line glow */}
        <BloomEffect />

        {/* Camera controls */}
        <OrbitControls
          enableDamping dampingFactor={0.05}
          minDistance={5} maxDistance={200}
          maxPolarAngle={Math.PI * 0.85}
        />

        {/* Subtle ground reference — very faint grid */}
        <gridHelper args={[100, 50, "#111111", "#080808"]} position={[0, -0.01, 0]} />

        {/* Vector-extracted walls as white lines */}
        {sketchData?.floors.map((floor, fi) => {
          if (selectedFloor !== null && selectedFloor !== fi) return null;
          const explodeOffset = exploded ? fi * (floor.height + 5) : 0;
          const tint = FLOOR_TINTS[fi % FLOOR_TINTS.length];

          return (
            <group key={fi} position={[0, explodeOffset, 0]}>
              {/* Walls */}
              {floor.walls.map((w, wi) => (
                <WallLine
                  key={`w-${fi}-${wi}`}
                  start={[w.start[0], w.start[1]]}
                  end={[w.end[0], w.end[1]]}
                  weight={w.weight || 1}
                  color={tint}
                  elevation={floor.elevation}
                  wallHeight={floor.height}
                />
              ))}

              {/* Room outlines */}
              {floor.rooms.map((r, ri) => (
                <RoomOutline
                  key={`r-${fi}-${ri}`}
                  polygon={r.polygon}
                  elevation={floor.elevation}
                  color={tint}
                />
              ))}
            </group>
          );
        })}

        {/* Takeoff elements overlaid in accent colors */}
        {elements.map(el => (
          <TakeoffElement key={el.id} element={el} />
        ))}
      </Canvas>
    </div>
  );
}
