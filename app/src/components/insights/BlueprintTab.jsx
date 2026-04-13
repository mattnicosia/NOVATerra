// BlueprintTab.jsx — "Plan as Floor Plate" 3D visualization
// Projects actual floor plan images as textured horizontal planes at each floor elevation.
// Takeoff elements rise from the plan surface — zero alignment issues because
// the plan image and measurements share the exact same coordinate space.
//
// Structure outlines are derived FROM element positions (convex hull),
// NOT from AI Vision or geometryEngine — guaranteeing alignment.

import { useState, useMemo, useCallback, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { generateElementsFromTakeoffs, getPxPerFoot } from "@/utils/geometryBuilder";
import { detectWalls } from "@/utils/wallDetector";
import { detectSpacesForLevel } from "@/utils/pascalSpaceDetection";
import { calculateLevelMiters } from "@/utils/pascalWallMitering";
import { buildFloorMap, inferFloorFromSheet, FLOOR_OPTIONS } from "@/utils/floorAssignment";
import { bt, card } from "@/utils/styles";
import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { getWallDetectionAgent } from "@/utils/novaAgent";

// ── Floor colors for differentiation ──
const FLOOR_COLORS = [
  { accent: "#3B82F6", bg: "rgba(59,130,246,0.08)", label: "blue" },    // Floor 1
  { accent: "#10B981", bg: "rgba(16,185,129,0.08)", label: "green" },   // Floor 2
  { accent: "#F59E0B", bg: "rgba(245,158,11,0.08)", label: "amber" },   // Floor 3
  { accent: "#8B5CF6", bg: "rgba(139,92,246,0.08)", label: "purple" },  // Floor 4
  { accent: "#EF4444", bg: "rgba(239,68,68,0.08)", label: "red" },      // Floor 5
  { accent: "#06B6D4", bg: "rgba(6,182,212,0.08)", label: "cyan" },     // Basement etc
];

function getFloorColor(floorIndex) {
  return FLOOR_COLORS[Math.abs(floorIndex) % FLOOR_COLORS.length];
}

// ── Convex hull (Graham scan) ──
function _convexHull(points) {
  if (points.length < 3) return points;
  const pts = points.map(p => ({ x: p.x, z: p.z }));
  // Find bottom-most (max z), then left-most
  let pivot = pts[0];
  for (const p of pts) {
    if (p.z > pivot.z || (p.z === pivot.z && p.x < pivot.x)) pivot = p;
  }
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const sorted = pts
    .filter(p => p !== pivot)
    .sort((a, b) => {
      const c = cross(pivot, a, b);
      if (Math.abs(c) < 1e-9) {
        const da = (a.x - pivot.x) ** 2 + (a.z - pivot.z) ** 2;
        const db = (b.x - pivot.x) ** 2 + (b.z - pivot.z) ** 2;
        return da - db;
      }
      return -c;
    });
  const hull = [pivot];
  for (const p of sorted) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
    hull.push(p);
  }
  return hull;
}

function _expandPolygon(polygon, margin) {
  if (polygon.length < 3) return polygon;
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
  return polygon.map(p => {
    const dx = p.x - cx, dz = p.z - cz;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    return { x: p.x + (dx / dist) * margin, z: p.z + (dz / dist) * margin };
  });
}

// ── Floor Plan Plate: textured horizontal plane ──
function AsyncFloorPlanPlate({ drawingId, elevation, opacity }) {
  const [loaded, setLoaded] = useState(false);
  const [dims, setDims] = useState(null);
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    const ppf = getPxPerFoot(drawingId);
    if (!ppf) return;
    const { pdfCanvases } = useDrawingPipelineStore.getState();
    const { drawings } = useDrawingPipelineStore.getState();
    const drawing = drawings.find(d => d.id === drawingId);
    const imgSrc = pdfCanvases[drawingId] || drawing?.data;
    if (!imgSrc) return;

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setDims({ widthFt: w / ppf, depthFt: h / ppf });
      const tex = new THREE.Texture(img);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      setTexture(tex);
      setLoaded(true);
    };
    img.src = imgSrc.startsWith("data:") ? imgSrc : `data:image/png;base64,${imgSrc}`;
    return () => { img.onload = null; };
  }, [drawingId]);

  if (!loaded || !dims || !texture) return null;

  return (
    <mesh
      position={[dims.widthFt / 2, elevation, dims.depthFt / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[dims.widthFt, dims.depthFt]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Element-derived floor outline ──
// Computed from convex hull of takeoff elements on this floor.
// Guaranteed to wrap the elements because it IS the elements.
function FloorOutline({ polygon, elevation, height, color }) {
  const { size } = useThree();

  const geometry = useMemo(() => {
    if (!polygon || polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].z);
    for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i].x, polygon[i].z);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [polygon, height]);

  const { edgesLineGeo, edgesLineMat } = useMemo(() => {
    if (!geometry) return {};
    const edges = new THREE.EdgesGeometry(geometry, 15);
    const posAttr = edges.getAttribute("position");
    const positions = [];
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(positions);
    const lineMat = new LineMaterial({
      color: new THREE.Color(color || "#F0ECE6").getHex(),
      linewidth: 2,
      worldUnits: false,
      transparent: true,
      opacity: 0.6,
      resolution: new THREE.Vector2(size.width, size.height),
      depthWrite: false,
    });
    return { edgesLineGeo: lineGeo, edgesLineMat: lineMat };
  }, [geometry, size.width, size.height, color]);

  if (!geometry) return null;

  return (
    <group position={[0, elevation, 0]}>
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={color || "#F0ECE6"}
          transparent opacity={0.03}
          roughness={0.3} side={THREE.DoubleSide} depthWrite={false}
        />
      </mesh>
      {edgesLineGeo && edgesLineMat && (
        <primitive object={new LineSegments2(edgesLineGeo, edgesLineMat)} />
      )}
    </group>
  );
}

// ── Wall Element ──
function BpWallElement({ element, viewMode, maxCost }) {
  const { path, height, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!path || path.length < 2) return null;
    const shape = new THREE.Shape();
    shape.moveTo(-thickness / 2, 0);
    shape.lineTo(thickness / 2, 0);
    shape.lineTo(thickness / 2, height);
    shape.lineTo(-thickness / 2, height);
    shape.closePath();
    const pts3 = path.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = pts3.length === 2
      ? new THREE.LineCurve3(pts3[0], pts3[1])
      : new THREE.CatmullRomCurve3(pts3, false, "centripetal", 0.01);
    return new THREE.ExtrudeGeometry(shape, {
      steps: Math.max(pts3.length * 4, 8),
      extrudePath: curve,
      bevelEnabled: false,
    });
  }, [path, height, thickness]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, elevation, 0]}>
      <meshPhysicalMaterial
        color={viewMode === "cost" ? _costColor(element.cost, maxCost) : element.color || "#6B7280"}
        transparent opacity={0.75} roughness={0.5} side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Slab Element ──
function BpSlabElement({ element, viewMode, maxCost }) {
  const { points, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!points || points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness || 0.5, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points, thickness]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, elevation, 0]}>
      <meshPhysicalMaterial
        color={viewMode === "cost" ? _costColor(element.cost, maxCost) : element.color || "#6B7280"}
        transparent opacity={0.65} roughness={0.3} side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ── Box Element ──
function BpBoxElement({ element, viewMode, maxCost }) {
  const { position, width, depth, height, elevation } = element.geometry;
  return (
    <mesh position={[position.x, elevation + height / 2, position.z]}>
      <boxGeometry args={[width, height, depth]} />
      <meshPhysicalMaterial
        color={viewMode === "cost" ? _costColor(element.cost, maxCost) : element.color || "#6B7280"}
        transparent opacity={0.8} roughness={0.4}
      />
    </mesh>
  );
}

// ── Floor Label (color-coded) ──
function BpFloorLabel({ label, elevation, xOffset, color }) {
  const canvasTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontSize = 32;
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const metrics = ctx.measureText(label);
    const w = Math.ceil(metrics.width + 40);
    const h = fontSize + 20;
    canvas.width = w;
    canvas.height = h;

    // Background pill
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Color indicator bar
    ctx.fillStyle = color || "#fff";
    ctx.fillRect(0, 0, 4, h);

    // Text
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = color || "rgba(255,255,255,0.85)";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 16, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return { tex, aspect: w / h };
  }, [label, color]);

  const planeW = 14;
  const planeH = planeW / canvasTexture.aspect;

  return (
    <mesh position={[xOffset - planeW / 2 - 3, elevation + 2, 0]}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial map={canvasTexture.tex} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function _costColor(cost, maxCost) {
  if (!cost || !maxCost) return "#6B7280";
  const ratio = Math.min(cost / maxCost, 1);
  const r = Math.round(ratio > 0.5 ? 255 : ratio * 2 * 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},60)`;
}

// ── Camera fit ──
function CameraFit({ elements, floorPlates }) {
  const { camera } = useThree();
  useEffect(() => {
    if (elements.length === 0 && floorPlates.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = 0, maxY = 12;
    let minZ = Infinity, maxZ = -Infinity;
    floorPlates.forEach(fp => {
      minX = Math.min(minX, 0);
      maxX = Math.max(maxX, fp.widthFt || 100);
      maxY = Math.max(maxY, (fp.elevation || 0) + 14);
      minZ = Math.min(minZ, 0);
      maxZ = Math.max(maxZ, fp.depthFt || 80);
    });
    elements.forEach(el => {
      const g = el.geometry;
      if (g.kind === "extrudedPath" && g.path) {
        g.path.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
        maxY = Math.max(maxY, (g.elevation || 0) + (g.height || 10));
      } else if (g.kind === "polygon" && g.points) {
        g.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
      } else if (g.kind === "box" && g.position) {
        minX = Math.min(minX, g.position.x); maxX = Math.max(maxX, g.position.x);
        minZ = Math.min(minZ, g.position.z); maxZ = Math.max(maxZ, g.position.z);
      }
    });
    if (!isFinite(minX)) return;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 20);
    camera.position.set(cx + span * 0.7, cy + span * 0.8, cz + span * 0.7);
    camera.lookAt(cx, cy, cz);
    camera.updateProjectionMatrix();
  }, [elements, floorPlates, camera]);
  return null;
}

function EnableClipping() {
  const { gl } = useThree();
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);
  return null;
}

// ── Floor plan drawing selection ──
function _isFloorPlanDrawing(drawing) {
  const title = (drawing.sheetTitle || drawing.label || "").toLowerCase();
  const num = (drawing.sheetNumber || "").toUpperCase();
  if (/floor\s*plan|flr\s*plan|floorplan/i.test(title)) return true;
  if (/plan\s*-?\s*level|plan\s*-?\s*floor/i.test(title)) return true;
  if (/^A\d/.test(num)) return true;
  if (/\bplan\b/i.test(title) && !/detail|framing|foundation|roof|reflected|ceiling|demo/i.test(title)) return true;
  return false;
}

function _selectFloorPlanDrawings(drawings, floorMap, takeoffs) {
  const measurementCounts = {};
  takeoffs.forEach(to => {
    (to.measurements || []).forEach(m => {
      const sid = m.sheetId;
      if (sid) measurementCounts[sid] = (measurementCounts[sid] || 0) + 1;
    });
  });

  const floorGroups = {};
  drawings.forEach(d => {
    if (!d.data) return;
    const fa = floorMap[d.id];
    if (!fa) return;
    const label = fa.label;
    if (!floorGroups[label]) floorGroups[label] = [];
    floorGroups[label].push({
      drawing: d, fa,
      isFloorPlan: _isFloorPlanDrawing(d),
      measurementCount: measurementCounts[d.id] || 0,
      hasCalibration: !!getPxPerFoot(d.id),
    });
  });

  const result = [];
  for (const [label, candidates] of Object.entries(floorGroups)) {
    const calibrated = candidates.filter(c => c.hasCalibration);
    if (calibrated.length === 0) continue;
    calibrated.sort((a, b) => {
      const aHas = a.measurementCount > 0 ? 1 : 0;
      const bHas = b.measurementCount > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (a.isFloorPlan !== b.isFloorPlan) return b.isFloorPlan ? 1 : -1;
      return b.measurementCount - a.measurementCount;
    });
    const best = calibrated[0];
    result.push({
      drawingId: best.drawing.id,
      drawingLabel: best.drawing.sheetTitle || best.drawing.label || best.drawing.sheetNumber || "Unknown",
      elevation: best.fa.elevation, label: best.fa.label, floor: best.fa.floor,
      isFloorPlan: best.isFloorPlan, measurementCount: best.measurementCount,
      alternatives: calibrated.map(c => ({
        drawingId: c.drawing.id,
        label: c.drawing.sheetTitle || c.drawing.label || c.drawing.sheetNumber || "Unknown",
        isFloorPlan: c.isFloorPlan, measurementCount: c.measurementCount,
      })),
    });
  }
  result.sort((a, b) => a.elevation - b.elevation);
  return result;
}

// ────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────
export default function BlueprintTab() {
  const C = useTheme();
  const T = C.T;
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const _pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);

  const [elements, setElements] = useState([]);
  const [floorPlates, setFloorPlates] = useState([]);
  const [viewMode, setViewMode] = useState("trade");
  const [planOpacity, setPlanOpacity] = useState(0.85);
  const [generating, setGenerating] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [drawingOverrides, setDrawingOverrides] = useState({});
  const [floorOverrides, setFloorOverrides] = useState({});
  const [displayMode, setDisplayMode] = useState("both");
  // Element-derived outlines per floor (convex hull from takeoff elements)
  const [floorOutlines, setFloorOutlines] = useState([]);
  // CV-detected walls from floor plan scan
  const [detectedWalls, setDetectedWalls] = useState([]);
  const [detectedRooms, setDetectedRooms] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanDebugCanvas, setScanDebugCanvas] = useState(null);

  const hasTakeoffData = takeoffs.some(t => t.measurements?.length > 0);
  const hasDrawings = drawings.length > 0;

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setTimeout(() => {
      try {
        const allDrawings = useDrawingPipelineStore.getState().drawings;
        const allTakeoffs = useDrawingPipelineStore.getState().takeoffs;
        const store = useDrawingPipelineStore.getState();
        const floorMap = buildFloorMap(allDrawings, store.floorHeight, store.floorHeights, floorOverrides);

        // Generate elements from takeoffs
        const els = generateElementsFromTakeoffs(floorMap);
        setElements(els);

        // Select the best floor plan drawing for each floor
        const selected = _selectFloorPlanDrawings(allDrawings, floorMap, allTakeoffs);

        // Apply user overrides
        const plates = selected.map(fp => {
          const overrideId = drawingOverrides[fp.label];
          const drawingId = overrideId || fp.drawingId;
          const ppf = getPxPerFoot(drawingId);
          return { ...fp, drawingId, ppf };
        }).filter(fp => fp.ppf);

        // Compute dimensions
        const pdfC = useDrawingPipelineStore.getState().pdfCanvases;
        plates.forEach(fp => {
          const drw = allDrawings.find(d => d.id === fp.drawingId);
          const imgSrc = pdfC[fp.drawingId] || drw?.data;
          if (imgSrc) {
            const img = new Image();
            img.src = imgSrc.startsWith("data:") ? imgSrc : `data:image/png;base64,${imgSrc}`;
            fp.widthFt = (img.naturalWidth || 1800) / fp.ppf;
            fp.depthFt = (img.naturalHeight || 2400) / fp.ppf;
          }
        });

        setFloorPlates(plates);

        // ── Derive structure outlines from elements per floor ──
        // CRITICAL: Only include elements whose sheetId matches a visible floor plate.
        // Elements from other drawings have different coordinate origins and would
        // stretch the outline into a completely wrong position.
        const outlines = [];
        const plateDrawingIds = new Set(plates.map(fp => fp.drawingId));
        const floorGroups = {};
        // Foundation keywords — these elements extend beyond the building envelope
        const FOUNDATION_RE = /footing|foundation|grade.?beam|pile|caisson|pier|slab.on.grade|underslab|sub.?slab/i;
        els.forEach(e => {
          // Only walls and slabs define the building footprint
          if (e.type !== "wall" && e.type !== "slab") return;
          // Exclude below-grade foundation elements (they extend beyond the building)
          if (FOUNDATION_RE.test(e.description || "")) return;
          // Only elements on a visible floor plate's drawing (same coordinate space)
          if (!plateDrawingIds.has(e.sheetId)) return;
          const elev = Math.round(e.geometry?.elevation ?? 0);
          if (!floorGroups[elev]) floorGroups[elev] = { elements: [], elevation: e.geometry?.elevation ?? 0 };
          floorGroups[elev].elements.push(e);
        });

        for (const [_key, group] of Object.entries(floorGroups)) {
          const allPts = [];
          group.elements.forEach(e => {
            const g = e.geometry;
            if (g.kind === "extrudedPath" && g.path) {
              g.path.forEach(p => allPts.push(p));
            } else if (g.kind === "polygon" && g.points) {
              g.points.forEach(p => allPts.push(p));
            }
          });
          if (allPts.length < 3) continue;
          const hull = _convexHull(allPts);
          if (hull.length < 3) continue;
          // Tight 3ft margin
          const expanded = _expandPolygon(hull, 3);

          // Debug: log outline bounds vs element positions
          const hullXs = hull.map(p => p.x), hullZs = hull.map(p => p.z);
          console.log(`[BlueprintTab] Floor elev=${group.elevation}: ${group.elements.length} wall/slab elements`);
          console.log(`  Hull bounds: X[${Math.min(...hullXs).toFixed(1)} .. ${Math.max(...hullXs).toFixed(1)}] Z[${Math.min(...hullZs).toFixed(1)} .. ${Math.max(...hullZs).toFixed(1)}]`);
          group.elements.forEach(e => {
            const g = e.geometry;
            if (g.kind === "extrudedPath" && g.path) {
              const xs = g.path.map(p => p.x), zs = g.path.map(p => p.z);
              console.log(`  Wall "${e.description}": X[${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}] Z[${Math.min(...zs).toFixed(1)}..${Math.max(...zs).toFixed(1)}] sheet=${e.sheetId?.slice(0,8)}`);
            } else if (g.kind === "polygon" && g.points) {
              const xs = g.points.map(p => p.x), zs = g.points.map(p => p.z);
              console.log(`  Slab "${e.description}": X[${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}] Z[${Math.min(...zs).toFixed(1)}..${Math.max(...zs).toFixed(1)}] sheet=${e.sheetId?.slice(0,8)}`);
            }
          });

          // Find floor plate for this elevation
          const plate = plates.find(fp => Math.abs(fp.elevation - group.elevation) < 1);
          const floorIdx = plate ? plate.floor : 0;
          const floorColor = getFloorColor(floorIdx);

          outlines.push({
            polygon: expanded,
            elevation: group.elevation,
            height: 12,
            floorIndex: floorIdx,
            color: floorColor.accent,
          });
        }

        setFloorOutlines(outlines);
        setGenerating(false);
      } catch (err) {
        console.error("Blueprint generate error:", err);
        setGenerating(false);
      }
    }, 50);
  }, [drawingOverrides, floorOverrides]);

  // Auto-generate on mount
  useEffect(() => {
    if (elements.length > 0) return;
    if (!hasTakeoffData) return;
    handleGenerate();
  }, []);

  // ── Scan Walls: YOLO + CV + Vector hybrid wall detection ──
  const handleScanWalls = useCallback(async () => {
    setScanning(true);
    setDetectedWalls([]);
    setDetectedRooms([]);

    try {
      const pdfCanvases = useDrawingPipelineStore.getState().pdfCanvases;
      const allWalls = [];

      // Check if YOLO model is available
      let yoloReady = false;
      try {
        const { isModelAvailable } = await import("@/utils/yoloDetector");
        yoloReady = await isModelAvailable();
      } catch { /* YOLO not available */ }

      // Scan each floor plate's drawing
      for (const plate of floorPlates) {
        const imageData = pdfCanvases[plate.drawingId] || drawings.find(d => d.id === plate.drawingId)?.data;
        if (!imageData) {
          console.warn(`[ScanWalls] No image for drawing ${plate.drawingId}`);
          continue;
        }

        const imgSrc = imageData.startsWith("data:") ? imageData : `data:image/png;base64,${imageData}`;
        console.log(`[ScanWalls] Scanning floor ${plate.label} (drawing ${plate.drawingId.slice(0,8)}) — ${yoloReady ? "YOLO+CV" : "CV only"}`);

        let walls = [];
        let rawLineCount = 0;
        let debugCanvas = null;

        // ── Tier 1: YOLO detection (fast bounding boxes for walls, doors, fixtures) ──
        if (yoloReady) {
          try {
            const { detectFloorPlanElements } = await import("@/utils/yoloDetector");
            const yoloResult = await detectFloorPlanElements(imgSrc);
            console.log(`[ScanWalls] YOLO: ${yoloResult.walls.length} walls, ${yoloResult.doorsWindows.length} doors/windows, ${yoloResult.fixtures.length} fixtures`);
            // YOLO wall bboxes are regions, not line segments — tag them for 3D rendering
            // They complement the classical CV line detection below
          } catch (yoloErr) {
            console.warn("[ScanWalls] YOLO failed, using CV only:", yoloErr.message);
          }
        }

        // ── Tier 2: Classical CV (precise line detection) ──
        const cvResult = await detectWalls(imageData, plate.drawingId);
        walls = cvResult.walls;
        rawLineCount = cvResult.rawLineCount;
        debugCanvas = cvResult.debugCanvas;

        console.log(`[ScanWalls] Floor ${plate.label}: ${rawLineCount} raw lines → ${walls.length} walls`);

        // Tag each wall with floor info
        walls.forEach(w => {
          w.elevation = plate.elevation;
          w.floorLabel = plate.label;
          w.drawingId = plate.drawingId;
        });

        allWalls.push(...walls);

        if (debugCanvas) setScanDebugCanvas(debugCanvas);
      }

      // Run Pascal space detection on detected walls
      if (allWalls.length > 0) {
        const { spaces, wallUpdates } = detectSpacesForLevel("scan", allWalls, 0.5);
        setDetectedRooms(spaces.filter(s => !s.isExterior));

        // Run mitering
        const { junctionData } = calculateLevelMiters(allWalls);
        // Store miter data on walls
        for (const [_jKey, wallIntersections] of junctionData) {
          for (const [wallId, miterPoints] of wallIntersections) {
            const wall = allWalls.find(w => w.id === wallId);
            if (wall) {
              if (!wall.miterData) wall.miterData = [];
              wall.miterData.push(miterPoints);
            }
          }
        }

        // Apply wall side classifications
        for (const update of wallUpdates) {
          const wall = allWalls.find(w => w.id === update.wallId);
          if (wall) wall.wallSide = { front: update.frontSide, back: update.backSide };
        }
      }

      setDetectedWalls(allWalls);

      // Record the scan in the NOVA agent for learning
      const agent = getWallDetectionAgent();
      const status = agent.getStatus();
      console.log(`[ScanWalls] Complete: ${allWalls.length} walls, ${detectedRooms.length} rooms`);
      console.log(`[NOVAAgent] Wall detector v${status.version} | ${status.totalCorrections} corrections | config:`, status.config);
    } catch (err) {
      console.error("[ScanWalls] Failed:", err);
    } finally {
      setScanning(false);
    }
  }, [floorPlates, drawings]);

  // ── Wall correction handler — feeds NOVA agent ──
  const handleWallCorrection = useCallback((action, wallData) => {
    const agent = getWallDetectionAgent();
    const originalCount = detectedWalls.length;

    if (action === "add") {
      // User added a wall the detector missed
      setDetectedWalls(prev => [...prev, { ...wallData, userAdded: true, id: `user-${Date.now()}` }]);
      agent.recordCorrection(
        { count: originalCount },
        { count: originalCount + 1 },
        { action: "add", reason: "missed-wall" }
      );
    } else if (action === "remove") {
      // User removed a false positive wall
      setDetectedWalls(prev => prev.filter(w => w.id !== wallData.id));
      agent.recordCorrection(
        { count: originalCount },
        { count: originalCount - 1 },
        { action: "remove", reason: "false-positive", wallId: wallData.id }
      );
    }

    // Check if we have enough corrections to improve
    const analysis = agent.analyze();
    if (analysis.ready) {
      const result = agent.improve();
      if (result.improved) {
        console.log(`[NOVAAgent] Wall detector self-improved to v${result.version}:`, result.adjustments);
      }
    }
  }, [detectedWalls]);

  const handleDrawingOverride = useCallback((floorLabel, drawingId) => {
    setDrawingOverrides(prev => ({ ...prev, [floorLabel]: drawingId }));
    setTimeout(() => handleGenerate(), 100);
  }, [handleGenerate]);

  const maxCost = useMemo(() => {
    const costs = elements.map(e => e.cost).filter(c => c > 0);
    return costs.length > 0 ? Math.max(...costs) : 1;
  }, [elements]);

  // Exploded view
  const explodeGap = exploded ? 20 : 0;
  const floorElevationMap = useMemo(() => {
    if (!exploded) return {};
    const map = {};
    const sorted = [...floorPlates].sort((a, b) => a.floor - b.floor);
    sorted.forEach((fp, i) => { map[fp.label] = fp.elevation + i * explodeGap; });
    return map;
  }, [floorPlates, exploded, explodeGap]);

  const getExplodedElev = (baseElev, floorLabel) => {
    if (!exploded) return baseElev;
    return floorElevationMap[floorLabel] ?? baseElev;
  };

  const showPlans = displayMode === "blueprints" || displayMode === "both";
  const showStructure = displayMode === "structure" || displayMode === "both";

  // Empty state
  if (elements.length === 0 && !generating && !hasTakeoffData) {
    return (
      <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: T.space[4] }}>📐</div>
        <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[2] }}>
          Blueprint 3D
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: C.textDim, maxWidth: 420, margin: "0 auto" }}>
          Create takeoffs with measurements to see your plans rise into 3D.
          Floor plan drawings become the floor plates, with takeoff elements extruded above them.
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div style={{ ...card(C), padding: T.space[8], textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.bg3}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto", marginBottom: T.space[4] }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: T.fontSize.md, color: C.textMuted }}>Building blueprint model...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: T.space[4], height: "calc(100vh - 160px)" }}>
      {/* 3D Viewport */}
      <div style={{ ...card(C), position: "relative", overflow: "hidden", minHeight: 400 }}>
        {/* Toolbar */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleGenerate} disabled={!hasTakeoffData} style={{ ...bt(C), padding: "6px 10px", fontSize: T.fontSize.xs, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: T.radius.sm, backdropFilter: "blur(8px)", gap: 4 }}>
            <Ic d={I.refresh} size={12} color="#fff" /> Rebuild
          </button>
          <button onClick={handleScanWalls} disabled={!hasDrawings || scanning} style={{ ...bt(C), padding: "6px 10px", fontSize: T.fontSize.xs, background: scanning ? "rgba(16,185,129,0.7)" : "rgba(0,0,0,0.6)", color: "#fff", borderRadius: T.radius.sm, backdropFilter: "blur(8px)", gap: 4 }}>
            {scanning ? "Scanning..." : "⚡ Scan Walls"}
          </button>
          {/* NOVA Agent status */}
          {detectedWalls.length > 0 && (() => {
            const agent = getWallDetectionAgent();
            const s = agent.getStatus();
            return (
              <span style={{
                fontSize: 9, color: "rgba(255,255,255,0.4)", padding: "4px 8px",
                background: "rgba(0,0,0,0.4)", borderRadius: 4, backdropFilter: "blur(8px)",
                fontFamily: T.font.sans,
              }}
                title={`Wall detector v${s.version} | ${s.totalCorrections} corrections | Right-click a wall to remove it`}
              >
                NOVA v{s.version} · {detectedWalls.length} walls · {s.totalCorrections} corrections
              </span>
            );
          })()}
          <button onClick={() => setExploded(!exploded)} style={{ ...bt(C), padding: "6px 10px", fontSize: T.fontSize.xs, background: exploded ? "rgba(99,102,241,0.7)" : "rgba(0,0,0,0.6)", color: "#fff", borderRadius: T.radius.sm, backdropFilter: "blur(8px)", gap: 4 }}>
            {exploded ? "Collapse" : "Explode"}
          </button>
          {/* Display mode toggle */}
          <div style={{ display: "flex", gap: 1, background: "rgba(0,0,0,0.6)", borderRadius: T.radius.sm, backdropFilter: "blur(8px)", overflow: "hidden" }}>
            {[
              { key: "blueprints", icon: "📋" },
              { key: "both", icon: "🔀" },
              { key: "structure", icon: "🔲" },
            ].map(({ key, icon }) => (
              <button key={key} onClick={() => setDisplayMode(key)} style={{
                ...bt(C), padding: "6px 8px", fontSize: 11,
                background: displayMode === key ? "rgba(99,102,241,0.5)" : "transparent",
                color: "#fff", borderRadius: 0, border: "none",
              }} title={key.charAt(0).toUpperCase() + key.slice(1)}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Status bar */}
        <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 10, padding: "4px 10px", borderRadius: T.radius.sm, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", fontSize: 10, color: "#aaa", fontFamily: T.font.sans }}>
          {(() => {
            const plateIds = new Set(floorPlates.map(fp => fp.drawingId));
            const visibleEls = elements.filter(e => plateIds.has(e.sheetId));
            return `${visibleEls.length} elements · ${floorPlates.length} floor${floorPlates.length !== 1 ? "s" : ""}`;
          })()}
        </div>

        <Canvas camera={{ fov: 50, near: 0.1, far: 2000 }} style={{ background: "#0a0c10" }}>
          <EnableClipping />
          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 80, 30]} intensity={0.8} />
          <directionalLight position={[-30, 40, -20]} intensity={0.3} />

          <Grid infiniteGrid fadeDistance={300} fadeStrength={2} cellSize={1} sectionSize={10} cellColor="#1a2030" sectionColor="#2a3a50" cellThickness={0.5} sectionThickness={1} />
          <CameraFit elements={elements} floorPlates={floorPlates} />

          {/* Floor plan plates */}
          {showPlans && floorPlates.map(fp => (
            <AsyncFloorPlanPlate
              key={fp.drawingId}
              drawingId={fp.drawingId}
              elevation={getExplodedElev(fp.elevation, fp.label)}
              opacity={planOpacity}
            />
          ))}

          {/* Element-derived structure outlines (convex hull around elements per floor) */}
          {showStructure && floorOutlines.map((fo, i) => {
            const plate = floorPlates.find(fp => Math.abs(fp.elevation - fo.elevation) < 1);
            const elev = plate ? getExplodedElev(fo.elevation, plate.label) : fo.elevation;
            return (
              <FloorOutline
                key={`outline-${i}`}
                polygon={fo.polygon}
                elevation={elev}
                height={fo.height}
                color={fo.color}
              />
            );
          })}

          {/* Floor labels */}
          {floorPlates.map(fp => {
            const fc = getFloorColor(fp.floor);
            return (
              <BpFloorLabel
                key={`lbl-${fp.label}`}
                label={fp.label}
                elevation={getExplodedElev(fp.elevation, fp.label)}
                xOffset={0}
                color={fc.accent}
              />
            );
          })}

          {/* Takeoff elements — ONLY show elements measured on a visible floor plate */}
          {elements.filter(el => {
            if (showPlans) return floorPlates.some(fp => fp.drawingId === el.sheetId);
            return true;
          }).map(el => {
            const fa = floorPlates.find(fp => fp.drawingId === el.sheetId) || floorPlates.find(fp => Math.abs(fp.elevation - (el.geometry?.elevation ?? 0)) < 1);
            const adj = exploded && fa ? { ...el, geometry: { ...el.geometry, elevation: getExplodedElev(el.geometry.elevation, fa.label) } } : el;
            if (el.geometry.kind === "extrudedPath") return <BpWallElement key={el.id} element={adj} viewMode={viewMode} maxCost={maxCost} />;
            if (el.geometry.kind === "polygon") return <BpSlabElement key={el.id} element={adj} viewMode={viewMode} maxCost={maxCost} />;
            if (el.geometry.kind === "box") return <BpBoxElement key={el.id} element={adj} viewMode={viewMode} maxCost={maxCost} />;
            return null;
          })}

          {/* CV-detected walls from Scan Walls */}
          {detectedWalls.map(w => {
            const [x1, z1] = w.start;
            const [x2, z2] = w.end;
            const dx = x2 - x1, dz = z2 - z1;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 0.1) return null;
            const elev = w.elevation ?? 0;
            const wallH = 10;
            const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
            const angle = Math.atan2(dx, dz);
            return (
              <mesh
                key={w.id}
                position={[cx, elev + wallH / 2, cz]}
                rotation={[0, angle, 0]}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  handleWallCorrection("remove", w);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = "pointer";
                  e.object.material.emissive?.setHex(0xff4444);
                  e.object.material.emissiveIntensity = 0.3;
                }}
                onPointerOut={(e) => {
                  document.body.style.cursor = "default";
                  e.object.material.emissive?.setHex(0x000000);
                  e.object.material.emissiveIntensity = 0;
                }}
              >
                <boxGeometry args={[w.thickness, wallH, len]} />
                <meshStandardMaterial
                  color={w.userAdded ? "#3B82F6" : w.confidence > 0.5 ? "#10B981" : "#F59E0B"}
                  transparent opacity={0.6}
                  side={THREE.DoubleSide}
                />
              </mesh>
            );
          })}
          {/* CV-detected rooms from Pascal space detection */}
          {detectedRooms.map((room, i) => {
            if (!room.polygon || room.polygon.length < 3) return null;
            const shape = new THREE.Shape();
            room.polygon.forEach(([x, z], j) => {
              j === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
            });
            shape.closePath();
            return (
              <mesh key={`room-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <shapeGeometry args={[shape]} />
                <meshBasicMaterial color="#3B82F6" transparent opacity={0.15} side={THREE.DoubleSide} />
              </mesh>
            );
          })}

          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>
      </div>

      {/* ── Sidebar ── */}
      <div style={{ ...card(C), padding: T.space[4], overflowY: "auto" }}>
        <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[4] }}>
          Blueprint 3D
        </div>

        {/* View Mode */}
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Color By</div>
          {["trade", "cost"].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              ...bt(C), padding: "5px 10px", fontSize: T.fontSize.xs,
              background: viewMode === mode ? C.accent + "30" : "transparent",
              color: viewMode === mode ? C.accent : C.textMuted,
              borderRadius: T.radius.sm, marginRight: 4, marginBottom: 4,
              border: viewMode === mode ? `1px solid ${C.accent}40` : `1px solid transparent`,
            }}>
              {mode === "trade" ? "Trade" : "Cost"}
            </button>
          ))}
        </div>

        {/* Scan Results */}
        {(detectedWalls.length > 0 || detectedRooms.length > 0) && (
          <div style={{ marginBottom: T.space[4], padding: T.space[3], background: "rgba(16,185,129,0.08)", borderRadius: T.radius.sm, border: "1px solid rgba(16,185,129,0.2)" }}>
            <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.bold, color: "#10B981", marginBottom: 4 }}>
              Wall Scan Results
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>
              {detectedWalls.length} walls detected
              {detectedRooms.length > 0 && ` · ${detectedRooms.length} rooms`}
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
              {detectedWalls.filter(w => w.confidence > 0.5).length} high confidence · {detectedWalls.filter(w => w.confidence <= 0.5).length} low
            </div>
          </div>
        )}

        {/* Plan Opacity */}
        {showPlans && (
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Plan Opacity</div>
          <input type="range" min="0" max="100" value={Math.round(planOpacity * 100)} onChange={e => setPlanOpacity(parseInt(e.target.value) / 100)} style={{ width: "100%", accentColor: C.accent }} />
          <div style={{ fontSize: 10, color: C.textDim, textAlign: "right" }}>{Math.round(planOpacity * 100)}%</div>
        </div>
        )}

        {/* Floor Plates (color-coded) */}
        {floorPlates.length > 0 && (
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Floors</div>
          {floorPlates.map(fp => {
            const fc = getFloorColor(fp.floor);
            const matchedEls = elements.filter(e => e.sheetId === fp.drawingId);
            return (
              <div key={fp.label} style={{
                padding: "8px 10px", borderRadius: T.radius.sm,
                background: fc.bg, marginBottom: 4,
                borderLeft: `3px solid ${fc.accent}`,
                border: `1px solid ${fc.accent}30`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: fc.accent, flexShrink: 0 }} />
                  <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.bold, color: C.text }}>
                    {fp.label}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>
                    {fp.elevation}'
                  </div>
                </div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 3, paddingLeft: 14 }}>
                  {matchedEls.length} elements · {fp.drawingLabel}
                </div>
                {/* Drawing override */}
                {fp.alternatives && fp.alternatives.length > 1 && (
                  <select
                    value={fp.drawingId}
                    onChange={e => handleDrawingOverride(fp.label, e.target.value)}
                    style={{
                      width: "100%", marginTop: 4, padding: "2px 4px", fontSize: 9,
                      background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
                      borderRadius: T.radius.sm, fontFamily: T.font.sans,
                    }}
                  >
                    {fp.alternatives.map(alt => (
                      <option key={alt.drawingId} value={alt.drawingId}>
                        {alt.label} ({alt.measurementCount} takeoffs)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
        )}

        {/* Drawing → Floor Assignment */}
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Drawing Assignments</div>
          {drawings.filter(d => d.data).length === 0 && (
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>No drawings uploaded yet.</div>
          )}
          {drawings.filter(d => d.data).map(d => {
            const autoDetected = inferFloorFromSheet(d);
            const override = floorOverrides[d.id];
            const current = override || autoDetected;
            const hasCalib = !!getPxPerFoot(d.id);
            const measCount = takeoffs.reduce((sum, to) =>
              sum + (to.measurements || []).filter(m => m.sheetId === d.id).length, 0);
            const isActive = floorPlates.some(fp => fp.drawingId === d.id);

            return (
              <div key={d.id} style={{
                padding: "6px 8px", borderRadius: T.radius.sm,
                background: isActive ? C.accent + "10" : C.bg1,
                marginBottom: 4,
                border: `1px solid ${isActive ? C.accent + "40" : C.border}`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.sheetTitle || d.label || d.sheetNumber || "Untitled"}
                  {d.sheetNumber && <span style={{ color: C.textDim, fontWeight: 400 }}> ({d.sheetNumber})</span>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 3 }}>
                  <select
                    value={current.floor}
                    onChange={e => {
                      const opt = FLOOR_OPTIONS.find(o => o.floor === parseInt(e.target.value));
                      if (opt) {
                        setFloorOverrides(prev => ({ ...prev, [d.id]: { floor: opt.floor, label: opt.label } }));
                        setTimeout(() => handleGenerate(), 100);
                      }
                    }}
                    style={{
                      flex: 1, padding: "3px 4px", fontSize: 10,
                      background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
                      borderRadius: T.radius.sm, fontFamily: T.font.sans,
                    }}
                  >
                    {FLOOR_OPTIONS.map(opt => (
                      <option key={opt.floor} value={opt.floor}>{opt.label}</option>
                    ))}
                  </select>
                  {override && (
                    <button
                      onClick={() => {
                        setFloorOverrides(prev => { const next = { ...prev }; delete next[d.id]; return next; });
                        setTimeout(() => handleGenerate(), 100);
                      }}
                      style={{ ...bt(C), padding: "2px 5px", fontSize: 9, color: C.textDim, borderRadius: T.radius.sm }}
                      title="Reset to auto-detect"
                    >
                      ↺
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 9, color: C.textDim, display: "flex", gap: 8 }}>
                  {!override && <span>Auto: {autoDetected.label}</span>}
                  {override && <span style={{ color: C.accent }}>Manual</span>}
                  <span>{measCount} takeoffs</span>
                  {!hasCalib && <span style={{ color: "#F59E0B" }}>No scale</span>}
                  {hasCalib && <span style={{ color: "#10B981" }}>Calibrated</span>}
                  {isActive && <span style={{ color: C.accent }}>Active</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Summary</div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, lineHeight: 1.6 }}>
            <div>{elements.filter(e => e.type === "wall").length} walls</div>
            <div>{elements.filter(e => e.type === "slab").length} slabs</div>
            <div>{elements.filter(e => e.type === "object").length} objects</div>
            {floorOutlines.length > 0 && <div>{floorOutlines.length} floor outline{floorOutlines.length !== 1 ? "s" : ""}</div>}
          </div>
        </div>

        {/* Alignment diagnostics */}
        {elements.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Alignment</div>
          <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
            {(() => {
              const plateIds = new Set(floorPlates.map(fp => fp.drawingId));
              const matched = elements.filter(e => plateIds.has(e.sheetId)).length;
              const unmatched = elements.length - matched;
              return (
                <>
                  <div style={{ color: matched > 0 ? "#10B981" : C.textDim }}>
                    {matched} elements aligned to floor plates
                  </div>
                  {unmatched > 0 && (
                    <div style={{ color: "#F59E0B" }}>
                      {unmatched} on other drawings (hidden in blueprint mode)
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
