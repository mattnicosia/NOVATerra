// BuildingScene.jsx — R3F Canvas + scene setup with lighting, fog, particles, camera

import { useRef, useMemo, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, MeshReflectorMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import BuildingCubes from "./BuildingCubes";
import { generateBuildingCubes, computeMetrics } from "@/lib/building-generator";
import { MODULE_SIZE_FT } from "@/lib/building-types";

// ── Floating particles — teal motes rising near the building ──
function Particles({ count = 120 }) {
  const meshRef = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 25;
      arr[i * 3 + 1] = Math.random() * 20 - 2;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 25;
    }
    return arr;
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      // Slow rise with gentle horizontal drift
      pos.array[i * 3] += Math.sin(state.clock.elapsedTime + i) * delta * 0.05;
      pos.array[i * 3 + 1] += delta * 0.2;
      pos.array[i * 3 + 2] += Math.cos(state.clock.elapsedTime + i * 0.7) * delta * 0.05;
      if (pos.array[i * 3 + 1] > 22) {
        pos.array[i * 3 + 1] = -2;
        pos.array[i * 3] = (Math.random() - 0.5) * 20;
        pos.array[i * 3 + 2] = (Math.random() - 0.5) * 20;
      }
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
      <pointsMaterial color="#00D4AA" size={0.035} transparent opacity={0.3} sizeAttenuation />
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

// ── Continuous brushed gunmetal surface — Epichust factory floor ──
function Ground({ buildingSize = 10 }) {
  const padY = -0.6;

  return (
    <group>
      {/* Reflective gunmetal surface — buildings reflect in the ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, padY, 0]} receiveShadow>
        <planeGeometry args={[500, 500]} />
        <MeshReflectorMaterial
          blur={[400, 100]}
          resolution={1024}
          mixBlur={1}
          mixStrength={0.35}
          roughness={0.75}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#1C2028"
          metalness={0.7}
          mirror={0.15}
        />
      </mesh>

      {/* Subtle seam lines — like welded steel panels, every 20 units */}
      {Array.from({ length: 25 }, (_, i) => {
        const pos = (i - 12) * 20;
        return (
          <group key={`seam-${i}`}>
            {/* Horizontal seam */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, padY + 0.002, pos]}>
              <planeGeometry args={[500, 0.02]} />
              <meshBasicMaterial color="#35393F" transparent opacity={0.25} />
            </mesh>
            {/* Vertical seam */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos, padY + 0.002, 0]}>
              <planeGeometry args={[0.02, 500]} />
              <meshBasicMaterial color="#35393F" transparent opacity={0.25} />
            </mesh>
          </group>
        );
      })}

      {/* Building pad — slightly raised, darker than ground, subtle */}
      <mesh position={[0, padY + 0.04, 0]} receiveShadow castShadow>
        <boxGeometry args={[buildingSize * 2, 0.08, buildingSize * 2]} />
        <meshStandardMaterial
          color="#1E2128"
          metalness={0.2}
          roughness={0.75}
        />
      </mesh>

      {/* Pad edge glow — thin teal accent line around the building pad */}
      {(() => {
        const s = buildingSize;
        const y = padY + 0.09;
        return [
          [0, y, -s, s * 2, 0.015],
          [0, y, s, s * 2, 0.015],
          [-s, y, 0, 0.015, s * 2],
          [s, y, 0, 0.015, s * 2],
        ].map(([x, py, z, w, d], i) => (
          <mesh key={`edge-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, py, z]}>
            <planeGeometry args={[w, d]} />
            <meshBasicMaterial color="#00D4AA" transparent opacity={0.2} />
          </mesh>
        ));
      })()}

      {/* No rogue point lights — building emissives provide the glow */}
    </group>
  );
}

// (Platform accents now built into Ground component)

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
      {/* Lighting — Epichust inspired: warm key + cool fill + teal rim */}
      <ambientLight intensity={0.5} color="#D8D4D0" />

      {/* Key light — warm, upper-left, casts shadows */}
      <directionalLight
        position={[18, 25, 12]}
        intensity={1.0}
        color="#FFE4CC"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0005}
      />

      {/* Rim light — subtle teal, only catches edges. NOT a flood light */}
      <directionalLight position={[-12, 3, -15]} intensity={0.08} color="#00D4AA" />

      {/* Fill light — neutral cool from right side, keeps shadows from going black */}
      <directionalLight position={[10, 8, 18]} intensity={0.25} color="#B0C4D8" />

      {/* Accent spot — warm on entry side, very subtle */}
      <pointLight position={[0, 2, -8]} intensity={0.15} color="#FF8C00" distance={15} decay={2} />

      {/* Fog — matches gunmetal surface, fades buildings at distance */}
      <fogExp2 attach="fog" color="#1E2128" density={0.006} />

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

      {/* Ground — brushed steel platform on dark void */}
      <Ground buildingSize={buildingSize} />

      {/* Particles — teal/cyan instead of orange, cluster near building */}
      <Particles count={120} />

      {/* HDRI environment — gives glass/metal surfaces real reflections */}
      <Environment files="/hdri/night_bridge_1k.hdr" background={false} />

      {/* Building cubes */}
      <BuildingCubes cubes={cubes} onProgress={onProgress} onComplete={onComplete} />

      {/* Postprocessing — bloom makes emissive materials glow cinematically */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          intensity={1.0}
          mipmapBlur
        />
      </EffectComposer>
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
      style={{ background: "#1E2128", ...style }}
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
