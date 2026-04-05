// SceneViewer.jsx — Interactive 3D building model viewer
// Renders IFC elements with hover highlighting, section plane,
// floor isolation, x-ray mode, and edge rendering.

import { useMemo, useCallback, createContext, useContext, createElement } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Edges } from "@react-three/drei";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { getMaterial } from "@/utils/materialEngine";
import { calculateLevelMiters } from "@/utils/pascalAlgorithms";

// ── Clip plane context (shared across all elements) ─────────────
const ClipContext = createContext([]);
const EMPTY_PLANES = [];

function ClipProvider({ sectionY, children }) {
  const planes = useMemo(() => {
    if (sectionY === null || sectionY === undefined) return EMPTY_PLANES;
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionY)];
  }, [sectionY]);
  return <ClipContext.Provider value={planes}>{children}</ClipContext.Provider>;
}

// ── Material wrapper with clipping + hover/select support ───────
function ClippedMaterial({ color, opacity, transparent, selected: _selected, hovered, xray, side, roughness, metalness }) {
  const clipPlanes = useContext(ClipContext);
  const emissive = hovered ? "#444466" : "#000000";
  const emissiveIntensity = hovered ? 0.6 : 0;
  const finalOpacity = xray ? Math.min(opacity, 0.15) : opacity;

  return (
    <meshStandardMaterial
      color={color}
      transparent={transparent || finalOpacity < 1 || xray}
      opacity={finalOpacity}
      roughness={roughness ?? 0.7}
      metalness={metalness ?? 0}
      side={side || THREE.DoubleSide}
      clippingPlanes={clipPlanes}
      clipShadows
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      depthWrite={!xray && finalOpacity >= 0.9}
    />
  );
}

// ── Wall element: extruded path ──────────────────────────────────
function WallElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover, materialAssignments, miterData }) {
  const { path, height, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!path || path.length < 2) return null;

    // For each segment, build a proper wall geometry
    // If miter data exists, use mitered endpoints for clean junctions
    const elev = Math.round(elevation ?? 0);
    const floorMiters = miterData?.[elev];
    const group = new THREE.Group();
    const geometries = [];

    for (let i = 0; i < path.length - 1; i++) {
      const segId = `${element.id}-seg${i}`;
      const p0 = path[i], p1 = path[i + 1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.01) continue;

      // Wall direction and perpendicular
      const dirX = dx / len, dirZ = dz / len;
      const perpX = -dirZ, perpZ = dirX;
      const halfT = (thickness || 0.5) / 2;

      // Default corners (no mitering)
      let bl = { x: p0.x - perpX * halfT, z: p0.z - perpZ * halfT };
      let br = { x: p0.x + perpX * halfT, z: p0.z + perpZ * halfT };
      let tl = { x: p1.x - perpX * halfT, z: p1.z - perpZ * halfT };
      let tr = { x: p1.x + perpX * halfT, z: p1.z + perpZ * halfT };

      // Apply miter data if available
      if (floorMiters?.junctionData) {
        for (const [, wallIntersections] of floorMiters.junctionData) {
          const segMiter = wallIntersections.get(segId);
          if (segMiter) {
            // "left" miter → adjusts the left edge, "right" → right edge
            if (segMiter.left) {
              // Determine which end this junction is at
              const distToStart = Math.sqrt((segMiter.left.x - p0.x) ** 2 + (segMiter.left.y - p0.z) ** 2);
              const distToEnd = Math.sqrt((segMiter.left.x - p1.x) ** 2 + (segMiter.left.y - p1.z) ** 2);
              if (distToStart < distToEnd) {
                bl = { x: segMiter.left.x, z: segMiter.left.y };
              } else {
                tl = { x: segMiter.left.x, z: segMiter.left.y };
              }
            }
            if (segMiter.right) {
              const distToStart = Math.sqrt((segMiter.right.x - p0.x) ** 2 + (segMiter.right.y - p0.z) ** 2);
              const distToEnd = Math.sqrt((segMiter.right.x - p1.x) ** 2 + (segMiter.right.y - p1.z) ** 2);
              if (distToStart < distToEnd) {
                br = { x: segMiter.right.x, z: segMiter.right.y };
              } else {
                tr = { x: segMiter.right.x, z: segMiter.right.y };
              }
            }
          }
        }
      }

      // Build wall shape from 4 corners (plan view) then extrude up
      const wallShape = new THREE.Shape();
      wallShape.moveTo(bl.x, bl.z);
      wallShape.lineTo(br.x, br.z);
      wallShape.lineTo(tr.x, tr.z);
      wallShape.lineTo(tl.x, tl.z);
      wallShape.closePath();

      const segGeo = new THREE.ExtrudeGeometry(wallShape, {
        depth: height,
        bevelEnabled: false,
      });
      // Rotate from XZ plane extrusion to vertical (Y-up)
      segGeo.rotateX(-Math.PI / 2);
      geometries.push(segGeo);
    }

    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];

    // Merge multiple segments into one geometry
    try {
      return BufferGeometryUtils.mergeGeometries(geometries);
    } catch {
      return geometries[0];
    }
  }, [path, height, thickness, elevation, miterData, element.id]);

  if (!geometry) return null;

  const vis = getElementVisuals(element, viewMode, maxCost, materialAssignments);

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      onClick={e => {
        e.stopPropagation();
        onClick(element.id);
      }}
      onPointerOver={e => {
        e.stopPropagation();
        onHover(element.id);
      }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial
        color={vis.color}
        opacity={vis.opacity}
        transparent={vis.opacity < 1}
        selected={selected}
        hovered={hovered}
        xray={xray}
        roughness={vis.roughness}
        metalness={vis.metalness}
      />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Slab element: flat polygon ───────────────────────────────────
function SlabElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover, materialAssignments }) {
  const { points, thickness, elevation } = element.geometry;

  const geometry = useMemo(() => {
    if (!points || points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness || 0.5, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points, thickness]);

  if (!geometry) return null;

  const vis = getElementVisuals(element, viewMode, maxCost, materialAssignments);

  return (
    <mesh
      geometry={geometry}
      position={[0, elevation, 0]}
      onClick={e => {
        e.stopPropagation();
        onClick(element.id);
      }}
      onPointerOver={e => {
        e.stopPropagation();
        onHover(element.id);
      }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial
        color={vis.color}
        opacity={vis.opacity}
        transparent={vis.opacity < 1}
        selected={selected}
        hovered={hovered}
        xray={xray}
        roughness={vis.roughness}
        metalness={vis.metalness}
      />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Box element: placed object (footings, fixtures) ──────────────
function BoxElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover, materialAssignments }) {
  const { position, width, depth, height, elevation } = element.geometry;

  const vis = getElementVisuals(element, viewMode, maxCost, materialAssignments);

  return (
    <mesh
      position={[position.x, elevation + height / 2, position.z]}
      onClick={e => {
        e.stopPropagation();
        onClick(element.id);
      }}
      onPointerOver={e => {
        e.stopPropagation();
        onHover(element.id);
      }}
      onPointerOut={() => onHover(null)}
    >
      <boxGeometry args={[width, height, depth]} />
      <ClippedMaterial
        color={vis.color}
        opacity={vis.opacity}
        transparent={vis.opacity < 1}
        selected={selected}
        hovered={hovered}
        xray={xray}
        roughness={vis.roughness}
        metalness={vis.metalness}
      />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── IFC Mesh element ─────────────────────────────────────────────
function IFCMeshElement({ element, selected, hovered, viewMode, maxCost, xray, onClick, onHover, materialAssignments }) {
  const { vertices, indices, matrix } = element.geometry;

  const geometry = useMemo(() => {
    if (!vertices || !indices) return null;
    const geo = new THREE.BufferGeometry();
    // web-ifc vertices: [x,y,z,nx,ny,nz] per vertex
    const stride = 6;
    const vertCount = vertices.length / stride;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      positions[i * 3] = vertices[i * stride];
      positions[i * 3 + 1] = vertices[i * stride + 1];
      positions[i * 3 + 2] = vertices[i * stride + 2];
      normals[i * 3] = vertices[i * stride + 3];
      normals[i * 3 + 1] = vertices[i * stride + 4];
      normals[i * 3 + 2] = vertices[i * stride + 5];
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.computeBoundingSphere();
    return geo;
  }, [vertices, indices]);

  const matrixTransform = useMemo(() => {
    if (!matrix) return new THREE.Matrix4();
    const m = new THREE.Matrix4();
    m.fromArray(matrix);
    return m;
  }, [matrix]);

  if (!geometry) return null;

  const vis = getElementVisuals(element, viewMode, maxCost, materialAssignments);

  return (
    <mesh
      geometry={geometry}
      matrix={matrixTransform}
      matrixAutoUpdate={false}
      onClick={e => {
        e.stopPropagation();
        onClick(element.id);
      }}
      onPointerOver={e => {
        e.stopPropagation();
        onHover(element.id);
      }}
      onPointerOut={() => onHover(null)}
    >
      <ClippedMaterial
        color={vis.color}
        opacity={vis.opacity}
        transparent={vis.opacity < 1}
        selected={selected}
        hovered={hovered}
        xray={xray}
        roughness={vis.roughness}
        metalness={vis.metalness}
      />
      {selected && <Edges threshold={15} color="#ffffff" lineWidth={1} />}
    </mesh>
  );
}

// ── Floor Shell: warm-white architectural outline ─────────────────
// Board recommendation: pencil-on-vellum look — thick warm-white edges,
// barely-there fill. Uses Line2 for real pixel-width control.
const OUTLINE_COLOR = "#F0ECE6"; // warm paper-white
const OUTLINE_EDGE_OPACITY = 0.65;
const OUTLINE_FILL_OPACITY = 0.02;
const OUTLINE_EDGE_OPACITY_COVERAGE = 0.8;
const OUTLINE_FILL_OPACITY_COVERAGE = 0.04;
const OUTLINE_LINE_WIDTH = 2; // screen pixels

function FloorShell({ outline, elevation, height, viewMode }) {
  const clipPlanes = useContext(ClipContext);
  const { size } = useThree();

  const geometry = useMemo(() => {
    if (!outline || outline.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, outline[0].z);
    for (let i = 1; i < outline.length; i++) {
      shape.lineTo(outline[i].x, outline[i].z);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [outline, height]);

  // Thick edges via Line2 (LineSegments2 + LineMaterial)
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
      color: new THREE.Color(OUTLINE_COLOR).getHex(),
      linewidth: OUTLINE_LINE_WIDTH,
      worldUnits: false, // screen-pixel width
      transparent: true,
      opacity: viewMode === "coverage" ? OUTLINE_EDGE_OPACITY_COVERAGE : OUTLINE_EDGE_OPACITY,
      resolution: new THREE.Vector2(size.width, size.height),
      depthWrite: false,
    });
    return { edgesLineGeo: lineGeo, edgesLineMat: lineMat };
  }, [geometry, viewMode, size.width, size.height]);

  if (!geometry) return null;

  const isCoverage = viewMode === "coverage";

  return (
    <group position={[0, elevation, 0]}>
      {/* Barely-there fill — just enough to define the floor plate */}
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          color={OUTLINE_COLOR}
          transparent
          opacity={isCoverage ? OUTLINE_FILL_OPACITY_COVERAGE : OUTLINE_FILL_OPACITY}
          roughness={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      {/* Thick warm-white edges — the hero structural read */}
      {edgesLineGeo && edgesLineMat && (
        <primitive object={new LineSegments2(edgesLineGeo, edgesLineMat)} />
      )}
    </group>
  );
}

// ── Coverage Cell: colored grid tile on floor plane ──────────────
function CoverageCell({ cell, elevation }) {
  const color = cell.covered ? "#10B981" : "#EF4444";
  const opacity = cell.covered ? 0.2 : 0.35;

  return (
    <mesh position={[cell.cx, elevation + 0.05, cell.cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[cell.size * 0.92, cell.size * 0.92]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

// ── Room outline: subtle interior boundary lines ─────────────────
const ROOM_LINE_COLOR = "#C8C4BE"; // slightly dimmer than FloorShell
const ROOM_LINE_OPACITY = 0.4;
const ROOM_FILL_OPACITY = 0.015;
const ROOM_LINE_WIDTH = 1.5;

function RoomOutline({ element, viewMode }) {
  const clipPlanes = useContext(ClipContext);
  const { size } = useThree();
  const { points, elevation, centroid } = element.geometry;

  // Floor polygon fill (barely visible)
  const floorGeo = useMemo(() => {
    if (!points || points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [points]);

  // Room boundary edges via Line2
  const { edgesLineGeo, edgesLineMat } = useMemo(() => {
    if (!points || points.length < 3) return {};
    // Build line segments around the room perimeter
    const positions = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      positions.push(a.x, 0, a.z, b.x, 0, b.z);
    }
    const lineGeo = new LineSegmentsGeometry();
    lineGeo.setPositions(positions);
    const lineMat = new LineMaterial({
      color: new THREE.Color(ROOM_LINE_COLOR).getHex(),
      linewidth: ROOM_LINE_WIDTH,
      worldUnits: false,
      transparent: true,
      opacity: ROOM_LINE_OPACITY,
      resolution: new THREE.Vector2(size.width, size.height),
      depthWrite: false,
      dashed: true,
      dashSize: 1.5,
      gapSize: 0.8,
    });
    return { edgesLineGeo: lineGeo, edgesLineMat: lineMat };
  }, [points, size.width, size.height]);

  if (!floorGeo || viewMode === "presentation") return null;

  return (
    <group position={[0, elevation + 0.1, 0]}>
      {/* Barely-there fill to define the room area */}
      <mesh geometry={floorGeo}>
        <meshBasicMaterial
          color={ROOM_LINE_COLOR}
          transparent
          opacity={ROOM_FILL_OPACITY}
          side={THREE.DoubleSide}
          depthWrite={false}
          clippingPlanes={clipPlanes}
        />
      </mesh>
      {/* Dashed boundary lines */}
      {edgesLineGeo && edgesLineMat && (
        <primitive object={new LineSegments2(edgesLineGeo, edgesLineMat)} />
      )}
    </group>
  );
}

// ── Section plane indicator ──────────────────────────────────────
function SectionPlaneIndicator({ sectionY, span }) {
  if (sectionY === null || sectionY === undefined) return null;
  return (
    <group>
      <mesh position={[0, sectionY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[span * 2.5, span * 2.5]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, sectionY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[span * 1.2, span * 1.22, 64]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── Color/opacity/material helpers ───────────────────────────────
function getElementVisuals(element, viewMode, maxCost, materialAssignments) {
  let color = element.color;
  let opacity = 0.8;
  let roughness = 0.7;
  let metalness = 0;

  // Check material assignment first (applies in trade + presentation modes)
  const assignment = materialAssignments?.[element.id];
  const mat = assignment?.slug ? getMaterial(assignment.slug) : null;
  if (mat && (viewMode === "trade" || viewMode === "presentation" || viewMode === "material")) {
    color = mat.visual.color;
    roughness = mat.visual.roughness ?? 0.7;
    metalness = mat.visual.metalness ?? 0;
    opacity = mat.visual.opacity ?? 0.85;
  }

  // View mode overrides
  if (viewMode === "presentation" && !mat) {
    color = "#e0e0e0";
    opacity = 0.85;
  } else if (viewMode === "cost") {
    const intensity = maxCost > 0 ? Math.min(element.cost / maxCost, 1) : 0;
    const r = Math.round(255 * Math.min(intensity * 2, 1));
    const g = Math.round(255 * Math.min((1 - intensity) * 2, 1));
    color = `rgb(${r},${g},60)`;
    roughness = 0.7;
    metalness = 0;
  } else if (viewMode === "gaps") {
    color = element.linkedItemId ? element.color : "#ef4444";
    opacity = element.linkedItemId ? 0.25 : 0.8;
  } else if (viewMode === "coverage") {
    color = element.color;
    opacity = 0.15;
  }

  return { color, opacity, roughness, metalness };
}

// Legacy compat wrappers (used by element components)
function getElementColor(element, viewMode, maxCost, materialAssignments) {
  return getElementVisuals(element, viewMode, maxCost, materialAssignments).color;
}

function getElementOpacity(element, viewMode, _maxCost, materialAssignments) {
  return getElementVisuals(element, viewMode, 0, materialAssignments).opacity;
}

// ── Auto-fit camera to scene ─────────────────────────────────────
function CameraFit({ elements, outlines }) {
  const { camera } = useThree();

  useMemo(() => {
    if (elements.length === 0 && Object.keys(outlines).length === 0) return;

    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity,
      maxY = 0;

    elements.forEach(el => {
      const g = el.geometry;
      if (g.kind === "extrudedPath" && g.path) {
        g.path.forEach(p => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });
        maxY = Math.max(maxY, (g.elevation || 0) + (g.height || 10));
      } else if (g.kind === "polygon" && g.points) {
        g.points.forEach(p => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        });
      } else if (g.kind === "box" && g.position) {
        minX = Math.min(minX, g.position.x);
        maxX = Math.max(maxX, g.position.x);
        minZ = Math.min(minZ, g.position.z);
        maxZ = Math.max(maxZ, g.position.z);
      } else if (g.kind === "ifcMesh") {
        maxY = Math.max(maxY, 40);
      }
    });

    Object.values(outlines).forEach(({ polygon }) => {
      if (!polygon) return;
      polygon.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      });
    });

    if (!isFinite(minX)) return;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 20);
    const dist = span * 1.2;

    camera.position.set(cx + dist * 0.6, Math.max(maxY, 12) + dist * 0.4, cz + dist * 0.6);
    camera.lookAt(cx, Math.max(maxY, 12) / 3, cz);
    camera.updateProjectionMatrix();
  }, [elements, outlines, camera]);

  return null;
}

// ── Enable local clipping on the renderer ────────────────────────
function EnableClipping() {
  const { gl } = useThree();
  useMemo(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  return null;
}

// ── Floor Label: floating text marker at each floor elevation ────
function FloorLabel({ label, elevation, xOffset }) {
  const canvasTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const text = label;
    const fontSize = 28;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width + 20);
    const h = fontSize + 12;
    canvas.width = w;
    canvas.height = h;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = "rgba(240,236,230,0.6)";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 10, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return { tex, aspect: w / h, w, h };
  }, [label]);

  const planeW = 12;
  const planeH = planeW / canvasTexture.aspect;

  return (
    <mesh position={[xOffset - planeW / 2 - 2, elevation + 1, 0]} rotation={[0, 0, 0]}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial map={canvasTexture.tex} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Main Scene ───────────────────────────────────────────────────
export default function SceneViewer() {
  const elements = useDrawingPipelineStore(s => s.elements);
  const roomElements = useDrawingPipelineStore(s => s.roomElements || []);
  const selectedElementId = useDrawingPipelineStore(s => s.selectedElementId);
  const hoveredElementId = useDrawingPipelineStore(s => s.hoveredElementId);
  const viewMode = useDrawingPipelineStore(s => s.viewMode);
  const selectElement = useDrawingPipelineStore(s => s.selectElement);
  const setHoveredElement = useDrawingPipelineStore(s => s.setHoveredElement);
  const outlines = useDrawingPipelineStore(s => s.outlines);
  const floorAssignments = useDrawingPipelineStore(s => s.floorAssignments);
  const coverageCells = useDrawingPipelineStore(s => s.coverageCells);
  const floorHeight = useDrawingPipelineStore(s => s.floorHeight);
  const hiddenFloors = useDrawingPipelineStore(s => s.hiddenFloors);
  const sectionPlaneY = useDrawingPipelineStore(s => s.sectionPlaneY);
  const xrayMode = useDrawingPipelineStore(s => s.xrayMode);
  const materialAssignments = useDrawingPipelineStore(s => s.materialAssignments);

  const maxCost = useMemo(() => {
    const costs = elements.map(e => e.cost).filter(c => c > 0);
    return costs.length > 0 ? Math.max(...costs) : 1;
  }, [elements]);

  const handleClick = useCallback(
    id => {
      selectElement(id);
    },
    [selectElement],
  );

  const handleHover = useCallback(
    id => {
      setHoveredElement(id);
    },
    [setHoveredElement],
  );

  // Filter elements by floor visibility
  const visibleElements = useMemo(() => {
    if (hiddenFloors.length === 0) return elements;
    return elements.filter(el => !hiddenFloors.includes(el.level));
  }, [elements, hiddenFloors]);

  // Compute wall miters per floor for proper junction geometry
  const miterData = useMemo(() => {
    const wallsByFloor = {};
    elements.forEach(el => {
      if (el.type !== "wall" || !el.geometry?.path || el.geometry.path.length < 2) return;
      const elev = Math.round(el.geometry.elevation ?? 0);
      if (!wallsByFloor[elev]) wallsByFloor[elev] = [];
      const path = el.geometry.path;
      for (let i = 0; i < path.length - 1; i++) {
        wallsByFloor[elev].push({
          id: `${el.id}-seg${i}`,
          parentElementId: el.id,
          segIndex: i,
          start: [path[i].x, path[i].z],
          end: [path[i + 1].x, path[i + 1].z],
          thickness: el.geometry.thickness || 0.5,
        });
      }
    });
    const result = {};
    for (const [elev, walls] of Object.entries(wallsByFloor)) {
      if (walls.length < 2) continue;
      try {
        result[elev] = calculateLevelMiters(walls);
      } catch { /* non-critical */ }
    }
    return result;
  }, [elements]);

  // Compute scene span for section plane indicator
  const sceneSpan = useMemo(() => {
    let span = 40;
    elements.forEach(el => {
      const g = el.geometry;
      if (g.kind === "extrudedPath" && g.path) {
        g.path.forEach(p => {
          span = Math.max(span, Math.abs(p.x), Math.abs(p.z));
        });
      }
    });
    return span;
  }, [elements]);

  // Shell data from outlines + floor assignments
  const shells = useMemo(() => {
    const result = [];
    for (const [drawingId, { polygon }] of Object.entries(outlines)) {
      const fa = floorAssignments[drawingId];
      const elevation = fa?.elevation ?? 0;
      const height = fa?.height ?? floorHeight;
      result.push({ drawingId, polygon, elevation, height });
    }
    return result;
  }, [outlines, floorAssignments, floorHeight]);

  const defaultCoverageElevation = useMemo(() => {
    if (shells.length === 0) return 0;
    return Math.min(...shells.map(s => s.elevation));
  }, [shells]);

  // Compute unique floor levels for labels
  const floorLevels = useMemo(() => {
    const seen = new Map();
    for (const [_drawingId, fa] of Object.entries(floorAssignments)) {
      if (!seen.has(fa.label)) {
        seen.set(fa.label, { label: fa.label, elevation: fa.elevation, floor: fa.floor });
      }
    }
    return [...seen.values()].sort((a, b) => a.floor - b.floor);
  }, [floorAssignments]);

  // Min X of scene for label positioning
  const sceneBoundsMinX = useMemo(() => {
    let minX = 0;
    elements.forEach(el => {
      const g = el.geometry;
      const pts = g.kind === "extrudedPath" ? g.path : g.kind === "polygon" ? g.points : [];
      if (pts) pts.forEach(p => { minX = Math.min(minX, p.x); });
    });
    shells.forEach(s => {
      if (s.polygon) s.polygon.forEach(p => { minX = Math.min(minX, p.x); });
    });
    return minX;
  }, [elements, shells]);

  const hasShells = shells.length > 0;
  const showShells = hasShells && viewMode !== "presentation";
  const showCoverage = viewMode === "coverage" && coverageCells.length > 0;
  const bgColor = viewMode === "presentation" ? "#f8f9fa" : "#0d1117";

  return (
    <Canvas
      camera={{ position: [60, 40, 60], fov: 50, near: 0.1, far: 5000 }}
      style={{ width: "100%", height: "100%", borderRadius: 8, cursor: hoveredElementId ? "pointer" : "grab" }}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => {
        selectElement(null);
        setHoveredElement(null);
      }}
    >
      <EnableClipping />
      <color attach="background" args={[bgColor]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[100, 100, 50]} intensity={0.8} castShadow />
      <directionalLight position={[-50, 80, -50]} intensity={0.3} />

      <Grid
        infiniteGrid
        fadeDistance={300}
        fadeStrength={2}
        cellSize={1}
        sectionSize={10}
        cellColor={viewMode === "presentation" ? "#ddd" : "#1a2030"}
        sectionColor={viewMode === "presentation" ? "#bbb" : "#2a3a50"}
        cellThickness={0.5}
        sectionThickness={1}
      />

      <CameraFit elements={elements} outlines={outlines} />

      <ClipProvider sectionY={sectionPlaneY}>
        {/* Building elements */}
        {visibleElements.map(el => {
          const isSelected = el.id === selectedElementId;
          const isHovered = el.id === hoveredElementId;
          const Comp =
            el.geometry.kind === "extrudedPath"
              ? WallElement
              : el.geometry.kind === "polygon"
                ? SlabElement
                : el.geometry.kind === "box"
                  ? BoxElement
                  : el.geometry.kind === "ifcMesh"
                    ? IFCMeshElement
                    : null;
          if (!Comp) return null;
          return createElement(Comp, {
            key: el.id,
            element: el,
            selected: isSelected,
            hovered: isHovered,
            viewMode,
            maxCost,
            xray: xrayMode,
            onClick: handleClick,
            onHover: handleHover,
            materialAssignments,
            miterData,
          });
        })}

        {/* Room outlines (interior boundaries) */}
        {roomElements.length > 0 && viewMode !== "presentation" &&
          roomElements.map(re => (
            <RoomOutline key={re.id} element={re} viewMode={viewMode} />
          ))}

        {/* Floor shells */}
        {showShells &&
          shells.map(s => (
            <FloorShell
              key={s.drawingId}
              outline={s.polygon}
              elevation={s.elevation}
              height={s.height}
              viewMode={viewMode}
            />
          ))}
      </ClipProvider>

      {/* Floor level labels */}
      {floorLevels.length > 0 && viewMode !== "presentation" &&
        floorLevels.map(fl => (
          <FloorLabel
            key={fl.label}
            label={fl.label}
            elevation={fl.elevation}
            xOffset={sceneBoundsMinX}
          />
        ))}

      {/* Section plane indicator */}
      <SectionPlaneIndicator sectionY={sectionPlaneY} span={sceneSpan} />

      {/* Coverage grid cells */}
      {showCoverage &&
        coverageCells.map(cell => (
          <CoverageCell key={cell.id} cell={cell} elevation={cell.elevation ?? defaultCoverageElevation} />
        ))}

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </Canvas>
  );
}
