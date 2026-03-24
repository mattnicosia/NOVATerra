// CommandTable.jsx — Multi-building 3D command center
// Renders all projects as glass buildings on a liquid metal surface.
// Buildings sized by SF, colored by status, connected by data streams.

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import BuildingCubes from "./BuildingCubes";
import { generateBuildingCubes } from "@/lib/building-generator";
import { MODULE_SIZE_FT } from "@/lib/building-types";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ── Status colors for glow pools ──
const STATUS_GLOW = {
  Bidding:    "#00BFFF",  // cyan — active
  Won:        "#00D4AA",  // teal — secured
  Lost:       "#2A2D35",  // dim — gone
  "On Hold":  "#FFB020",  // amber — paused
  Submitted:  "#4DA6FF",  // blue — waiting
  Qualifying: "#FFB020",  // amber
  Draft:      "#353840",  // neutral
  default:    "#00BFFF",
};

// ── Convert estimate to building config ──
function estimateToConfig(est) {
  const sf = est.grandTotal > 100000 ? 8000 : est.grandTotal > 50000 ? 4000 : 2000;
  const floors = Math.max(1, Math.min(12, Math.round(sf / 2000)));
  const width = Math.max(20, Math.min(80, Math.sqrt(sf / floors) * 1.5));
  const depth = Math.max(15, Math.min(60, (sf / floors) / (width * 0.8)));
  const type = est.buildingType === "residential" ? "residential"
    : est.buildingType === "mixed-use" ? "mixed-use"
    : "commercial";

  return {
    widthFt: Math.round(width),
    depthFt: Math.round(depth),
    numFloors: floors,
    floorHeightFt: type === "residential" ? 10 : 12,
    buildingType: type,
    projectName: est.name || "Untitled",
  };
}

// ── Arrange buildings in a grid/cluster layout ──
function layoutBuildings(estimates) {
  const spacing = 18; // units between buildings
  const cols = Math.ceil(Math.sqrt(estimates.length));
  return estimates.map((est, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * spacing;
    const z = (row - Math.floor(estimates.length / cols) / 2) * spacing;
    return { ...est, worldX: x, worldZ: z };
  });
}

// ── Liquid metal surface with embedded grid ──
function CommandSurface() {
  return (
    <group>
      {/* Reflective liquid metal ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <planeGeometry args={[300, 300]} />
        <MeshReflectorMaterial
          blur={[300, 100]}
          resolution={1024}
          mixBlur={1}
          mixStrength={0.4}
          roughness={0.85}
          depthScale={0.8}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#1E2128"
          metalness={0.6}
          mirror={0.15}
        />
      </mesh>

      {/* Embedded grid lines — subtle, like etched into the metal */}
      {Array.from({ length: 31 }, (_, i) => {
        const pos = (i - 15) * 10;
        return (
          <group key={`grid-${i}`}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.595, pos]}>
              <planeGeometry args={[300, 0.03]} />
              <meshBasicMaterial color="#2A3040" transparent opacity={0.15} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos, -0.595, 0]}>
              <planeGeometry args={[0.03, 300]} />
              <meshBasicMaterial color="#2A3040" transparent opacity={0.15} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Glow pool beneath a building ──
function GlowPool({ position, size, color, intensity = 0.6 }) {
  const meshRef = useRef();

  useFrame((state) => {
    if (!meshRef.current) return;
    // Subtle pulse
    const t = Math.sin(state.clock.elapsedTime * 1.5) * 0.15 + 0.85;
    meshRef.current.material.opacity = intensity * t;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[position[0], -0.58, position[2]]}>
      <circleGeometry args={[size, 32]} />
      <meshBasicMaterial color={color} transparent opacity={intensity} />
    </mesh>
  );
}

// ── Data stream connection between two buildings ──
function DataStream({ from, to, color = "#00BFFF", opacity = 0.15 }) {
  const ref = useRef();

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.material.dashOffset -= 0.01;
  });

  const points = useMemo(() => {
    const mid = [(from[0] + to[0]) / 2, -0.55, (from[2] + to[2]) / 2];
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(from[0], -0.55, from[2]),
      new THREE.Vector3(mid[0], -0.5, mid[2]),
      new THREE.Vector3(to[0], -0.55, to[2]),
    ]).getPoints(30);
  }, [from, to]);

  return (
    <line ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineDashedMaterial color={color} transparent opacity={opacity} dashSize={0.3} gapSize={0.2} linewidth={1} />
    </line>
  );
}

// ── Project label floating above building ──
function ProjectLabel({ position, name, status, total }) {
  // Simple HTML overlay would be better but for now skip text in 3D
  // This will be handled by the HUD overlay
  return null;
}

// ── Single building on the command table ──
function TableBuilding({ config, position, status, glowColor }) {
  const cubes = useMemo(() => generateBuildingCubes(config), [config]);

  return (
    <group position={position}>
      {/* Glow pool */}
      <GlowPool
        position={[0, 0, 0]}
        size={Math.max(config.widthFt, config.depthFt) / MODULE_SIZE_FT * 0.7}
        color={glowColor}
        intensity={status === "Lost" ? 0.1 : 0.4}
      />

      {/* Building cubes */}
      <BuildingCubes cubes={cubes} />
    </group>
  );
}

// ── Floating particles ──
function Particles({ count = 80, bounds = 60 }) {
  const meshRef = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * bounds * 2;
      arr[i * 3 + 1] = Math.random() * 15 - 1;
      arr[i * 3 + 2] = (Math.random() - 0.5) * bounds * 2;
    }
    return arr;
  }, [count, bounds]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      pos.array[i * 3 + 1] += delta * 0.15;
      if (pos.array[i * 3 + 1] > 15) pos.array[i * 3 + 1] = -1;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#00D4AA" size={0.03} transparent opacity={0.25} sizeAttenuation />
    </points>
  );
}

// ── Scene content ──
function CommandTableScene({ buildings }) {
  const maxExtent = useMemo(() => {
    if (!buildings.length) return 30;
    const xs = buildings.map(b => Math.abs(b.worldX));
    const zs = buildings.map(b => Math.abs(b.worldZ));
    return Math.max(...xs, ...zs, 20) + 15;
  }, [buildings]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#D0CCC8" />
      <directionalLight
        position={[25, 30, 15]}
        intensity={0.8}
        color="#FFE8D4"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <directionalLight position={[-15, 5, -20]} intensity={0.06} color="#00D4AA" />
      <directionalLight position={[15, 10, 25]} intensity={0.2} color="#B0C4D8" />

      {/* Fog */}
      <fogExp2 attach="fog" color="#1A1D22" density={0.004} />

      {/* Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={10}
        maxDistance={maxExtent * 4}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 0, 0]}
      />

      {/* Command table surface */}
      <CommandSurface />

      {/* Particles */}
      <Particles count={100} bounds={maxExtent} />

      {/* Buildings */}
      {buildings.map((b, i) => (
        <TableBuilding
          key={b.id || i}
          config={b.config}
          position={[b.worldX, 0, b.worldZ]}
          status={b.status}
          glowColor={STATUS_GLOW[b.status] || STATUS_GLOW.default}
        />
      ))}

      {/* Data streams between buildings sharing a GC */}
      {buildings.map((b, i) =>
        buildings.slice(i + 1).filter(other =>
          other.client && b.client && other.client === b.client
        ).map((other, j) => (
          <DataStream
            key={`stream-${i}-${j}`}
            from={[b.worldX, 0, b.worldZ]}
            to={[other.worldX, 0, other.worldZ]}
            color="#00BFFF"
            opacity={0.12}
          />
        ))
      )}
    </>
  );
}

// ── Main export ──
export default function CommandTable({ style }) {
  // Pull real estimates from store
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  const buildings = useMemo(() => {
    const estimates = Object.values(estimatesIndex || {})
      .filter(e => e.status !== "Trash")
      .slice(0, 20); // cap at 20 for performance

    const withConfigs = estimates.map(est => ({
      id: est.id,
      name: est.name,
      status: est.status || "Bidding",
      client: est.client || "",
      grandTotal: est.grandTotal || 0,
      buildingType: est.buildingType || "commercial",
      config: estimateToConfig(est),
    }));

    return layoutBuildings(withConfigs);
  }, [estimatesIndex]);

  return (
    <Canvas
      shadows
      dpr={Math.min(window.devicePixelRatio, 2)}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      camera={{
        fov: 45,
        near: 0.1,
        far: 500,
        position: [40, 30, 40],
      }}
      style={{ background: "#141720", ...style }}
    >
      <Suspense fallback={null}>
        <CommandTableScene buildings={buildings} />
      </Suspense>
    </Canvas>
  );
}
