// SpatialScene.jsx — The 3D building model that IS the interface
// Renders the building from real takeoff data via geometryBuilder
// Rooms are interactive: hover to highlight, click to select
// Room color = status (teal=estimated, amber=partial, dark=untouched, red=issue)

import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { generateElementsFromTakeoffs, getPxPerFoot } from "@/utils/geometryBuilder";
import { buildFloorMap, inferFloorFromSheet } from "@/utils/floorAssignment";
// Pascal room detection — will be wired when pipeline is integrated
// import { detectRoomsFromWalls } from "@/utils/pascalIntegration";
const detectRoomsFromWalls = null; // placeholder

// ── Scene colors ──
const COLORS = {
  sceneBackground: "#1E2228",
  floorBase: "#252A32",
  wallColor: "#3A4150",
  wallEdge: "#4A5568",
  roomEstimated: "#00D4AA",
  roomPartial: "#FFB020",
  roomUntouched: "#2A2E35",
  roomAlert: "#FF4757",
  roomHover: "#3BDFCF",
  roomSelected: "#00D4AA",
  gridColor: "#2A2E35",
  gridCenterColor: "#333A45",
  elementWall: "#4A5E78",
  elementSlab: "#3D4D5E",
  elementCount: "#FFB020",
};

/* ═══════════════════════════════════════════════════════════
   ROOM MESH — interactive room polygon with status glow
   ═══════════════════════════════════════════════════════════ */
function RoomMesh({ polygon, elevation = 0, status = "untouched", name, area, isSelected, isHovered, onClick, onHover }) {
  const meshRef = useRef();

  const baseColor = useMemo(() => {
    if (isSelected) return COLORS.roomSelected;
    if (isHovered) return COLORS.roomHover;
    switch (status) {
      case "estimated": return COLORS.roomEstimated;
      case "partial": return COLORS.roomPartial;
      case "alert": return COLORS.roomAlert;
      default: return COLORS.roomUntouched;
    }
  }, [status, isSelected, isHovered]);

  const emissiveIntensity = useMemo(() => {
    if (isSelected) return 0.4;
    if (isHovered) return 0.3;
    switch (status) {
      case "estimated": return 0.15;
      case "partial": return 0.1;
      case "alert": return 0.2;
      default: return 0;
    }
  }, [status, isSelected, isHovered]);

  const shape = useMemo(() => {
    if (!polygon || polygon.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(polygon[0].x, polygon[0].z ?? polygon[0].y ?? 0);
    for (let i = 1; i < polygon.length; i++) {
      s.lineTo(polygon[i].x, polygon[i].z ?? polygon[i].y ?? 0);
    }
    s.closePath();
    return s;
  }, [polygon]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      const target = new THREE.Color(baseColor);
      meshRef.current.material.color.lerp(target, delta * 8);
      meshRef.current.material.emissive.lerp(target, delta * 8);
      meshRef.current.material.emissiveIntensity = THREE.MathUtils.lerp(
        meshRef.current.material.emissiveIntensity, emissiveIntensity, delta * 8
      );
    }
  });

  if (!shape) return null;

  return (
    <group position={[0, elevation, 0]}>
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerEnter={(e) => { e.stopPropagation(); onHover?.(true); document.body.style.cursor = "pointer"; }}
        onPointerLeave={(e) => { e.stopPropagation(); onHover?.(false); document.body.style.cursor = "default"; }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={baseColor} emissive={baseColor} emissiveIntensity={emissiveIntensity}
          transparent opacity={isSelected ? 0.6 : isHovered ? 0.45 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   ELEMENT RENDERER — renders takeoff elements from stores
   ═══════════════════════════════════════════════════════════ */
function TakeoffElement({ element }) {
  const g = element.geometry;
  if (!g) return null;

  // Wall (extruded path)
  if (g.kind === "extrudedPath" && g.path?.length >= 2) {
    const pts = g.path;
    return (
      <group>
        {pts.slice(0, -1).map((p, i) => {
          const next = pts[i + 1];
          const dx = next.x - p.x;
          const dz = next.z - p.z;
          const length = Math.sqrt(dx * dx + dz * dz);
          if (length < 0.1) return null;
          const angle = Math.atan2(dz, dx);
          const cx = (p.x + next.x) / 2;
          const cz = (p.z + next.z) / 2;
          const height = g.height || 10;
          const elev = g.elevation || 0;
          return (
            <mesh key={i} position={[cx, elev + height / 2, cz]} rotation={[0, -angle, 0]}>
              <boxGeometry args={[length, height, g.thickness || 0.5]} />
              <meshStandardMaterial color={COLORS.elementWall} transparent opacity={0.7} roughness={0.8} />
            </mesh>
          );
        })}
      </group>
    );
  }

  // Slab (polygon)
  if (g.kind === "polygon" && g.points?.length >= 3) {
    const shape = new THREE.Shape();
    shape.moveTo(g.points[0].x, g.points[0].z);
    for (let i = 1; i < g.points.length; i++) shape.lineTo(g.points[i].x, g.points[i].z);
    shape.closePath();
    const elev = g.elevation || 0;
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elev + 0.05, 0]}>
        <extrudeGeometry args={[shape, { depth: 0.3, bevelEnabled: false }]} />
        <meshStandardMaterial color={COLORS.elementSlab} transparent opacity={0.5} />
      </mesh>
    );
  }

  // Count item (box)
  if (g.kind === "box" && g.position) {
    const size = g.width || 2;
    const elev = g.elevation || 0;
    return (
      <mesh position={[g.position.x, elev + size / 2, g.position.z]}>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color={COLORS.elementCount} transparent opacity={0.8} />
      </mesh>
    );
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════
   REAL BUILDING — from actual takeoff/drawing data
   ═══════════════════════════════════════════════════════════ */
function RealBuilding({ onRoomSelect, selectedRoom }) {
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const drawings = useDrawingsStore(s => s.drawings);

  // Generate 3D elements from takeoffs
  const elements = useMemo(() => {
    if (!takeoffs?.length || !drawings?.length) return [];
    try {
      const floorAssignments = {};
      drawings.forEach(d => {
        const floor = inferFloorFromSheet(d);
        floorAssignments[d.id] = { floor: floor?.floor || 1, elevation: 0, height: 12 };
      });
      return generateElementsFromTakeoffs(floorAssignments, null) || [];
    } catch (err) {
      console.warn("[SpatialScene] Element generation failed:", err);
      return [];
    }
  }, [takeoffs, drawings]);

  // Try to detect rooms from wall elements using Pascal
  const rooms = useMemo(() => {
    const wallElements = elements.filter(e => e.type === "wall" && e.geometry?.kind === "extrudedPath");
    if (wallElements.length < 3) return [];

    try {
      // Extract wall segments for room detection
      const wallSegments = [];
      wallElements.forEach(e => {
        const path = e.geometry.path;
        if (!path || path.length < 2) return;
        for (let i = 0; i < path.length - 1; i++) {
          wallSegments.push({
            start: { x: path[i].x, y: path[i].z },
            end: { x: path[i + 1].x, y: path[i + 1].z },
            thickness: e.geometry.thickness || 0.5,
          });
        }
      });

      if (typeof detectRoomsFromWalls === "function" && wallSegments.length >= 3) {
        const detected = detectRoomsFromWalls(wallSegments);
        return detected.map((r, i) => ({
          id: `room-${i}`,
          name: r.label || `Room ${i + 1}`,
          area: r.area_sf || 0,
          status: "estimated",
          polygon: r.polygon?.map(p => ({ x: p.x, z: p.y || p.z })) || [],
        }));
      }
    } catch (err) {
      console.warn("[SpatialScene] Room detection failed:", err);
    }
    return [];
  }, [elements]);

  // Compute bounding box for centering
  const bounds = useMemo(() => {
    if (!elements.length) return { cx: 0, cz: 0, width: 40, depth: 40 };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    elements.forEach(e => {
      const g = e.geometry;
      if (g?.kind === "extrudedPath" && g.path) {
        g.path.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
      } else if (g?.kind === "polygon" && g.points) {
        g.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
      } else if (g?.kind === "box" && g.position) {
        minX = Math.min(minX, g.position.x); maxX = Math.max(maxX, g.position.x);
        minZ = Math.min(minZ, g.position.z); maxZ = Math.max(maxZ, g.position.z);
      }
    });
    if (!isFinite(minX)) return { cx: 0, cz: 0, width: 40, depth: 40 };
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
  }, [elements]);

  const hasData = elements.length > 0;

  return (
    <group position={[-bounds.cx, 0, -bounds.cz]}>
      {/* Floor slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.1, bounds.cz]}>
        <planeGeometry args={[bounds.width + 10, bounds.depth + 10]} />
        <meshStandardMaterial color={COLORS.floorBase} />
      </mesh>

      {/* Real takeoff elements */}
      {elements.map((el, i) => (
        <TakeoffElement key={el.id || i} element={el} />
      ))}

      {/* Detected rooms */}
      {rooms.map(r => (
        <RoomMesh
          key={r.id}
          polygon={r.polygon}
          status={r.status}
          name={r.name}
          area={r.area}
          isSelected={selectedRoom?.id === r.id}
          isHovered={hoveredRoom === r.id}
          onClick={() => onRoomSelect(r)}
          onHover={(h) => setHoveredRoom(h ? r.id : null)}
        />
      ))}

      {/* No data message */}
      {!hasData && (
        <Text
          position={[0, 5, 0]}
          fontSize={1.5}
          color={COLORS.roomUntouched}
          anchorX="center"
          anchorY="middle"
          font="/fonts/barlow-condensed-v12-latin-600.woff"
        >
          Upload drawings and create takeoffs to see your building
        </Text>
      )}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   SPATIAL SCENE — the main 3D canvas
   ═══════════════════════════════════════════════════════════ */
export default function SpatialScene({ activeFloor, selectedRoom, onRoomSelect, mode }) {
  return (
    <Canvas
      camera={{ fov: 45, near: 0.1, far: 1000, position: [35, 30, 35] }}
      style={{ background: COLORS.sceneBackground }}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onRoomSelect?.(null)}
    >
      {/* Lighting — architectural studio */}
      <ambientLight intensity={0.4} color="#8899AA" />
      <directionalLight position={[30, 50, 20]} intensity={0.6} color="#FFFFFF" />
      <directionalLight position={[-20, 30, -10]} intensity={0.2} color="#6688AA" />

      {/* Ground grid */}
      <gridHelper args={[200, 100, COLORS.gridCenterColor, COLORS.gridColor]} position={[0, -0.15, 0]} />

      {/* The building — from real data */}
      <RealBuilding onRoomSelect={onRoomSelect} selectedRoom={selectedRoom} />

      {/* Controls */}
      <OrbitControls
        makeDefault enableDamping dampingFactor={0.08}
        minDistance={10} maxDistance={200}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
