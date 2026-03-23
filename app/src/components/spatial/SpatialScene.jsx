// SpatialScene.jsx — The 3D building model that IS the interface
// Renders the building from vector pipeline data + Pascal room detection
// Rooms are interactive: hover to highlight, click to select
// Room color = status (teal=estimated, amber=partial, dark=untouched, red=issue)

import { useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ── Scene colors matching the spatial shell ──
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
  ambient: "#4A5568",
};

/* ═══════════════════════════════════════════════════════════
   ROOM MESH — interactive room polygon with status glow
   ═══════════════════════════════════════════════════════════ */
function RoomMesh({ polygon, elevation = 0, status = "untouched", name, area, isSelected, isHovered, onClick, onHover }) {
  const meshRef = useRef();
  const glowRef = useRef();

  // Status → color mapping
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

  // Emissive intensity based on status
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

  // Build shape from polygon points
  const shape = useMemo(() => {
    if (!polygon || polygon.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(polygon[0].x, polygon[0].z || polygon[0].y || 0);
    for (let i = 1; i < polygon.length; i++) {
      s.lineTo(polygon[i].x, polygon[i].z || polygon[i].y || 0);
    }
    s.closePath();
    return s;
  }, [polygon]);

  // Smooth color transition
  useFrame((_, delta) => {
    if (meshRef.current) {
      const target = new THREE.Color(baseColor);
      meshRef.current.material.color.lerp(target, delta * 8);
      meshRef.current.material.emissive.lerp(target, delta * 8);
      meshRef.current.material.emissiveIntensity = THREE.MathUtils.lerp(
        meshRef.current.material.emissiveIntensity,
        emissiveIntensity,
        delta * 8
      );
    }
  });

  if (!shape) return null;

  return (
    <group position={[0, elevation, 0]}>
      {/* Room floor polygon */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        onPointerEnter={(e) => { e.stopPropagation(); onHover?.(true); document.body.style.cursor = "pointer"; }}
        onPointerLeave={(e) => { e.stopPropagation(); onHover?.(false); document.body.style.cursor = "default"; }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={isSelected ? 0.6 : isHovered ? 0.45 : 0.25}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Room outline */}
      <lineLoop rotation={[-Math.PI / 2, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={polygon.length}
            array={new Float32Array(polygon.flatMap(p => [p.x, p.z || p.y || 0, 0.01]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={baseColor} transparent opacity={0.6} />
      </lineLoop>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   WALL MESH — extruded wall segment
   ═══════════════════════════════════════════════════════════ */
function WallMesh({ start, end, height = 10, thickness = 0.5, elevation = 0 }) {
  const geometry = useMemo(() => {
    const dx = end.x - start.x;
    const dz = (end.z || end.y || 0) - (start.z || start.y || 0);
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length < 0.1) return null;

    const angle = Math.atan2(dz, dx);
    const geo = new THREE.BoxGeometry(length, height, thickness);
    const cx = (start.x + end.x) / 2;
    const cz = ((start.z || start.y || 0) + (end.z || end.y || 0)) / 2;

    geo.translate(0, height / 2, 0);
    geo.rotateY(-angle);
    geo.translate(cx, 0, cz);

    return geo;
  }, [start, end, height, thickness]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, elevation, 0]}>
      <meshStandardMaterial
        color={COLORS.wallColor}
        transparent
        opacity={0.7}
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   DEMO BUILDING — placeholder until vector pipeline wires in
   ═══════════════════════════════════════════════════════════ */
function DemoBuilding({ onRoomSelect, selectedRoom }) {
  const [hoveredRoom, setHoveredRoom] = useState(null);

  // Demo rooms — will be replaced by vector pipeline output
  const rooms = useMemo(() => [
    { id: "r1", name: "Lobby", status: "estimated", area: 450, polygon: [
      { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 15 }, { x: 0, z: 15 }
    ]},
    { id: "r2", name: "Conference Room", status: "partial", area: 320, polygon: [
      { x: 22, z: 0 }, { x: 38, z: 0 }, { x: 38, z: 12 }, { x: 22, z: 12 }
    ]},
    { id: "r3", name: "Open Office", status: "estimated", area: 780, polygon: [
      { x: 0, z: 17 }, { x: 30, z: 17 }, { x: 30, z: 35 }, { x: 0, z: 35 }
    ]},
    { id: "r4", name: "Kitchen", status: "untouched", area: 180, polygon: [
      { x: 32, z: 17 }, { x: 42, z: 17 }, { x: 42, z: 27 }, { x: 32, z: 27 }
    ]},
    { id: "r5", name: "Server Room", status: "alert", area: 120, polygon: [
      { x: 32, z: 29 }, { x: 42, z: 29 }, { x: 42, z: 38 }, { x: 32, z: 38 }
    ]},
    { id: "r6", name: "Restroom", status: "estimated", area: 95, polygon: [
      { x: 22, z: 14 }, { x: 30, z: 14 }, { x: 30, z: 22 }, { x: 22, z: 22 }
    ]},
  ], []);

  // Demo walls
  const walls = useMemo(() => [
    // Exterior
    { start: { x: -1, z: -1 }, end: { x: 43, z: -1 } },
    { start: { x: 43, z: -1 }, end: { x: 43, z: 39 } },
    { start: { x: 43, z: 39 }, end: { x: -1, z: 39 } },
    { start: { x: -1, z: 39 }, end: { x: -1, z: -1 } },
    // Interior
    { start: { x: 20, z: -1 }, end: { x: 20, z: 15 } },
    { start: { x: 0, z: 15 }, end: { x: 42, z: 15 } },
    { start: { x: 30, z: 15 }, end: { x: 30, z: 39 } },
    { start: { x: 32, z: 27 }, end: { x: 42, z: 27 } },
  ], []);

  return (
    <group position={[-21, 0, -19]}>
      {/* Floor slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[21, -0.1, 19]}>
        <planeGeometry args={[46, 42]} />
        <meshStandardMaterial color={COLORS.floorBase} />
      </mesh>

      {/* Rooms */}
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

      {/* Walls */}
      {walls.map((w, i) => (
        <WallMesh key={i} start={w.start} end={w.end} height={10} thickness={0.5} />
      ))}
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════
   CAMERA CONTROLLER — smooth camera positioning
   ═══════════════════════════════════════════════════════════ */
function CameraSetup() {
  const { camera } = useThree();

  // Set initial camera position (isometric-ish)
  useMemo(() => {
    camera.position.set(35, 30, 35);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
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
      <CameraSetup />

      {/* Lighting — architectural studio */}
      <ambientLight intensity={0.4} color="#8899AA" />
      <directionalLight position={[30, 50, 20]} intensity={0.6} color="#FFFFFF" castShadow={false} />
      <directionalLight position={[-20, 30, -10]} intensity={0.2} color="#6688AA" />

      {/* Ground grid */}
      <gridHelper
        args={[100, 50, COLORS.gridCenterColor, COLORS.gridColor]}
        position={[0, -0.15, 0]}
      />

      {/* The building */}
      <DemoBuilding onRoomSelect={onRoomSelect} selectedRoom={selectedRoom} />

      {/* Controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={15}
        maxDistance={120}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
