// BuildingScene.jsx — R3F Canvas + scene setup with lighting, fog, particles, camera

import { useRef, useMemo, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import BuildingCubes from "./BuildingCubes";
import { generateBuildingCubes, computeMetrics } from "@/lib/building-generator";
import { MODULE_SIZE_FT } from "@/lib/building-types";

// ── Floating particles ──
function Particles({ count = 150 }) {
  const meshRef = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 1] = Math.random() * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      pos.array[i * 3 + 1] += delta * 0.3; // slow rise
      if (pos.array[i * 3 + 1] > 30) pos.array[i * 3 + 1] = -2;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#e85c30" size={0.04} transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

// ── Auto-rotating camera with mouse offset ──
function CameraController({ buildingSize }) {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    // Slow auto-rotate
    const time = state.clock.elapsedTime;
    const radius = buildingSize * 1.3;
    const autoAngle = time * 0.05;

    // Mouse offset (subtle)
    const mx = (state.mouse.x || 0) * 0.5;
    const my = (state.mouse.y || 0) * 0.3;

    camera.position.x = Math.sin(autoAngle + mx) * radius;
    camera.position.z = Math.cos(autoAngle + mx) * radius;
    camera.position.y = radius * 0.5 + my * 5;
    camera.lookAt(0, buildingSize * 0.2, 0);
  });

  return null;
}

// ── Ground plane ──
function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.1} roughness={0.95} />
      </mesh>
      <gridHelper args={[100, 100, "#1a1a1a", "#111111"]} position={[0, -0.59, 0]} />
    </group>
  );
}

// ── Corner accent marks ──
function CornerMarks() {
  const size = 20;
  const len = 1.5;
  const positions = [
    [-size, -size], [size, -size], [-size, size], [size, size],
  ];

  return (
    <group>
      {positions.map(([x, z], i) => {
        const dx = x > 0 ? -1 : 1;
        const dz = z > 0 ? -1 : 1;
        return (
          <group key={i} position={[x, 0.01, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[len, 0.02]} />
              <meshBasicMaterial color="#e85c30" transparent opacity={0.5} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
              <planeGeometry args={[len, 0.02]} />
              <meshBasicMaterial color="#e85c30" transparent opacity={0.5} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Main scene content ──
function SceneContent({ config, onProgress, onComplete, interactive }) {
  const cubes = useMemo(() => generateBuildingCubes(config), [config]);
  const buildingSize = useMemo(() => {
    const w = config.widthFt / MODULE_SIZE_FT;
    const d = config.depthFt / MODULE_SIZE_FT;
    const h = config.numFloors * (config.floorHeightFt / MODULE_SIZE_FT);
    return Math.max(w, d, h);
  }, [config]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[15, 20, 10]}
        intensity={1.2}
        color="#ffe8d0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      {/* Rim light (orange) */}
      <directionalLight position={[-10, 5, -10]} intensity={0.4} color="#e85c30" />
      {/* Fill light (blue) */}
      <directionalLight position={[5, 3, 15]} intensity={0.2} color="#4a9eff" />

      {/* Fog — subtle, don't hide the ground */}
      <fogExp2 attach="fog" color="#08080a" density={0.006} />

      {/* Camera */}
      {interactive ? (
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={buildingSize * 3}
          target={[0, buildingSize * 0.2, 0]}
        />
      ) : (
        <CameraController buildingSize={buildingSize} />
      )}

      {/* Ground + grid */}
      <Ground />
      <CornerMarks />

      {/* Particles */}
      <Particles count={150} />

      {/* Building cubes */}
      <BuildingCubes cubes={cubes} onProgress={onProgress} onComplete={onComplete} />
    </>
  );
}

// ── Exported Canvas wrapper ──
export default function BuildingScene({
  config = { widthFt: 60, depthFt: 40, numFloors: 4, floorHeightFt: 12, buildingType: "commercial" },
  onProgress,
  onComplete,
  interactive = true,
  style,
}) {
  return (
    <Canvas
      shadows
      dpr={Math.min(window.devicePixelRatio, 2)}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      camera={{
        fov: 45,
        near: 0.1,
        far: 200,
        position: [20, 15, 20],
      }}
      style={{ background: "#08080a", ...style }}
    >
      <Suspense fallback={null}>
        <SceneContent
          config={config}
          onProgress={onProgress}
          onComplete={onComplete}
          interactive={interactive}
        />
      </Suspense>
    </Canvas>
  );
}
