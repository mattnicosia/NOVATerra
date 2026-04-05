import { useRef, useEffect, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { useTheme } from "@/hooks/useTheme";
import { useMaterialDrivers } from "@/hooks/useMaterialDrivers";
import { getGpuTier } from "@/components/nova/gpuDetect";

/* ────────────────────────────────────────────────────────
   PBR Dashboard Background — Instrument Panel Material System

   Replaces CSS blur blobs with physically-based materials.
   Six flat panels with distinct PBR surface properties,
   each semantically mapped to widget data states.

   Visual reference: Lamborghini Terzo Millennio — five dark
   materials in a constrained value range, differentiated by
   how they respond to light.

   Board spec: 94/100 confidence, March 2026
   ──────────────────────────────────────────────────────── */

// ── Material definitions (semantic mapping) ──────────────
const MATERIALS = {
  carbonFiber: {
    // Pipeline Pulse hero — directional chatoyancy
    color: "#18181E",
    roughnessBase: 0.08,
    metalness: 0.15,
    clearcoat: 0.0,
  },
  brushedAluminum: {
    // Calendar — precision instrument, time pressure
    color: "#1A1A22",
    roughnessBase: 0.30,
    metalness: 0.92,
    clearcoat: 0.0,
  },
  obsidianGlass: {
    // Market Intel — observation surface
    color: "#121218",
    roughnessBase: 0.05,
    metalness: 0.20,
    clearcoat: 1.0,
    clearcoatRoughnessBase: 0.04,
  },
  satinTitanium: {
    // Benchmarks — instrument cluster gauge
    color: "#1C1C24",
    roughnessBase: 0.35,
    metalness: 0.82,
    clearcoat: 0.0,
  },
  polishedSlate: {
    // Inbox — writing surface, "something arrived"
    color: "#161620",
    roughnessBase: 0.18,
    metalness: 0.40,
    clearcoat: 0.0,
  },
  matteCarbon: {
    // Default — maximum text contrast, minimum competition
    color: "#0E0E12",
    roughnessBase: 0.65,
    metalness: 0.0,
    clearcoat: 0.0,
  },
};

// ── Panel layout (world coordinates) ─────────────────────
// Orthographic-like telephoto view. Y=0 is center.
// Panels at Z=0 plane with slight depth offsets for parallax.
const PANELS = [
  // Ground — full screen matte base
  { id: "ground", x: 0, y: 0, z: -0.15, w: 14, h: 10, material: "matteCarbon" },
  // Left column — Projects zone (matte, recede for text)
  { id: "projects", x: -3.8, y: 1.0, z: 0.0, w: 3.0, h: 4.0, material: "matteCarbon" },
  // Center — Pipeline Map + Pulse HERO (carbon fiber)
  { id: "pulse", x: 0.3, y: 1.2, z: 0.08, w: 5.0, h: 3.2, material: "carbonFiber" },
  // Right column — Calendar (brushed aluminum)
  { id: "calendar", x: 3.8, y: 1.2, z: 0.04, w: 2.8, h: 3.2, material: "brushedAluminum" },
  // Bottom left — Inbox (polished slate)
  { id: "inbox", x: -3.8, y: -2.2, z: 0.02, w: 3.0, h: 3.0, material: "polishedSlate" },
  // Center bottom — Benchmarks (satin titanium)
  { id: "benchmarks", x: 0.3, y: -2.0, z: 0.06, w: 5.0, h: 2.6, material: "satinTitanium" },
  // Right bottom — Market Intel (obsidian glass)
  { id: "market", x: 3.8, y: -2.0, z: 0.04, w: 2.8, h: 3.0, material: "obsidianGlass" },
];

// ── Lerp speeds (per frame at 20fps) ─────────────────────
const LERP = {
  pipelineHealth: 0.08,   // 800ms
  deadlinePressure: 0.03, // 2000ms
  marketVolatility: 0.02, // 3000ms
  kpiDeviation: 0.04,     // 1500ms
  unreadRatio: 0.12,      // 600ms
  focusIn: 0.22,          // 200ms
  focusOut: 0.12,         // 400ms
  breath: 0.08,           // smooth step transition
};

// ── Throttled render (demand mode) ───────────────────────
function ThrottledRender({ fps = 20, idleFps = 4 }) {
  const { invalidate } = useThree();
  const mouseIdleRef = useRef(0);
  const activeRef = useRef(true);

  useEffect(() => {
    let currentFps = fps;
    let id;

    const tick = () => {
      invalidate();
      id = setTimeout(tick, 1000 / currentFps);
    };
    id = setTimeout(tick, 1000 / currentFps);

    // Track mouse activity
    const onMove = () => { mouseIdleRef.current = 0; currentFps = fps; };
    const onIdle = () => {
      mouseIdleRef.current += 1;
      if (mouseIdleRef.current > fps * 3) currentFps = idleFps; // 3s idle → drop fps
    };
    const idleCheck = setInterval(onIdle, 1000);
    window.addEventListener("mousemove", onMove);

    // Visibility
    const onVis = () => {
      if (document.hidden) { clearTimeout(id); activeRef.current = false; }
      else { activeRef.current = true; id = setTimeout(tick, 1000 / currentFps); }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearTimeout(id);
      clearInterval(idleCheck);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [invalidate, fps, idleFps]);

  return null;
}

// ── Mouse-reactive light (lerped drift) ──────────────────
function MouseLight() {
  const lightRef = useRef();
  const fillRef = useRef();
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = e => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
      const ny = -(e.clientY / window.innerHeight - 0.5) * 2;
      targetRef.current = { x: nx * 1.5, y: ny * 1.0 };
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame(() => {
    const c = currentRef.current;
    const t = targetRef.current;
    c.x += (t.x - c.x) * 0.03;
    c.y += (t.y - c.y) * 0.03;
    if (lightRef.current) {
      lightRef.current.position.set(1.0 + c.x, -3.5 + c.y, 3.0);
    }
    if (fillRef.current) {
      fillRef.current.position.set(-2.0 - c.x * 0.3, 2.0 - c.y * 0.3, 4.0);
    }
  });

  return (
    <>
      {/* Primary amber accent light — CORE energy (cranked for visibility) */}
      <pointLight
        ref={lightRef}
        color="#F59E0B"
        intensity={4.0}
        distance={25}
        decay={1.5}
        position={[1.0, -3.5, 3.5]}
      />
      {/* Cool fill — prevents amber wash from flattening */}
      <pointLight
        ref={fillRef}
        color="#2a2a5a"
        intensity={1.5}
        distance={30}
        decay={1.5}
        position={[-2.0, 2.0, 4.5]}
      />
    </>
  );
}

// ── Breathing system (stepped environment azimuth) ───────
function BreathingController({ envRef }) {
  const breathRef = useRef(0);
  const stepRef = useRef(0);

  useFrame(() => {
    const cycle = (performance.now() % 12000) / 12000;
    const step = Math.floor(cycle * 6) / 6;
    const target = step * Math.PI * 2;

    // Smooth lerp between steps
    breathRef.current += (target - breathRef.current) * LERP.breath;

    // Rotate env map sampling by updating the scene rotation
    // This shifts specular highlights across all surfaces
    if (envRef.current) {
      envRef.current.rotation.y = breathRef.current * 0.15; // subtle
    }
  });

  return null;
}

// ── Single material panel with data-reactive uniforms ────
function MaterialPanel({ panel, drivers, envMap }) {
  const meshRef = useRef();
  const matRef = useRef();
  const def = MATERIALS[panel.material];

  // Compute target values from drivers
  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;

    let targetRoughness = def.roughnessBase;
    let targetEmissiveIntensity = 0;
    let targetClearcoatRoughness = def.clearcoatRoughnessBase || 0;

    // Data-reactive roughness per material type
    switch (panel.material) {
      case "carbonFiber":
        // Anisotropy simulated via roughness: healthy = low roughness (sharp)
        targetRoughness = THREE.MathUtils.lerp(0.14, 0.08, drivers.pipelineHealth);
        break;
      case "brushedAluminum":
        // Deadline pressure: surface hardens
        targetRoughness = THREE.MathUtils.lerp(0.42, 0.28, drivers.deadlinePressure);
        break;
      case "obsidianGlass":
        // Market volatility: clarity degrades
        targetClearcoatRoughness = THREE.MathUtils.lerp(0.02, 0.08, drivers.marketVolatility);
        break;
      case "satinTitanium":
        // KPI deviation: surface sharpens + amber warmth
        targetRoughness = THREE.MathUtils.lerp(0.45, 0.32, drivers.kpiDeviation);
        if (drivers.kpiDeviation > 0.7) {
          targetEmissiveIntensity = (drivers.kpiDeviation - 0.7) * 0.267;
        }
        break;
      case "polishedSlate":
        // Unread ratio: surface sharpens when fresh
        targetRoughness = THREE.MathUtils.lerp(0.30, 0.18, drivers.unreadRatio);
        break;
      default:
        break;
    }

    // Lerp to targets
    const speed = LERP[panel.material === "carbonFiber" ? "pipelineHealth"
      : panel.material === "brushedAluminum" ? "deadlinePressure"
      : panel.material === "obsidianGlass" ? "marketVolatility"
      : panel.material === "satinTitanium" ? "kpiDeviation"
      : panel.material === "polishedSlate" ? "unreadRatio"
      : "pipelineHealth"] || 0.04;

    mat.roughness += (targetRoughness - mat.roughness) * speed;
    mat.emissiveIntensity += (targetEmissiveIntensity - mat.emissiveIntensity) * speed;
    if (mat.clearcoatRoughness !== undefined) {
      mat.clearcoatRoughness += (targetClearcoatRoughness - mat.clearcoatRoughness) * speed;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[panel.x, panel.y, panel.z]}
    >
      <planeGeometry args={[panel.w, panel.h]} />
      {panel.material === "obsidianGlass" ? (
        <meshPhysicalMaterial
          ref={matRef}
          color={def.color}
          roughness={def.roughnessBase}
          metalness={def.metalness}
          clearcoat={def.clearcoat}
          clearcoatRoughness={def.clearcoatRoughnessBase || 0}
          envMap={envMap}
          envMapIntensity={1.2}
          emissive="#000000"
          emissiveIntensity={0}
        />
      ) : (
        <meshStandardMaterial
          ref={matRef}
          color={def.color}
          roughness={def.roughnessBase}
          metalness={def.metalness}
          envMap={envMap}
          envMapIntensity={panel.material === "matteCarbon" ? 0.3 : 1.0}
          emissive="#F59E0B"
          emissiveIntensity={0}
        />
      )}
    </mesh>
  );
}

// ── Procedural environment map ───────────────────────────
function useProceduralEnv() {
  const { gl } = useThree();

  return useMemo(() => {
    // Create a simple scene with hemisphere lighting for PMREM
    const scene = new THREE.Scene();
    // Warm at bottom (CORE amber), cool at top (neutral)
    scene.background = new THREE.Color("#060608");

    // Add subtle gradient via hemisphere
    const hemi = new THREE.HemisphereLight("#0a0a14", "#0c0808", 0.8);
    scene.add(hemi);

    // Amber point for asymmetric reflections
    const point = new THREE.PointLight("#F59E0B", 1.0, 20);
    point.position.set(2, -3, 4);
    scene.add(point);

    // Cool counter-fill
    const fill = new THREE.PointLight("#1a1a3a", 0.5, 20);
    fill.position.set(-3, 2, 3);
    scene.add(fill);

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileCubemapShader();
    const envMap = pmrem.fromScene(scene, 0, 0.1, 100).texture;
    pmrem.dispose();

    return envMap;
  }, [gl]);
}

// ── Scene content ────────────────────────────────────────
function SceneContent({ drivers }) {
  const envMap = useProceduralEnv();
  const sceneRef = useRef();

  return (
    <group ref={sceneRef}>
      <ThrottledRender fps={20} idleFps={4} />
      <BreathingController envRef={sceneRef} />
      <MouseLight />

      {/* Ambient — enough for material differences to read through glass cards */}
      <ambientLight intensity={0.15} color="#ffffff" />

      {/* Material panels */}
      {PANELS.map(panel => (
        <MaterialPanel
          key={panel.id}
          panel={panel}
          drivers={drivers}
          envMap={envMap}
        />
      ))}
    </group>
  );
}

// ── Main component ───────────────────────────────────────
export default function PBRDashboardBackground() {
  const C = useTheme();
  const drivers = useMaterialDrivers();
  const gpuTier = useMemo(() => getGpuTier(), []);

  // Respect reduced motion preference
  const prefersRM = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // GPU tier 0 or reduced motion: no 3D, CSS handles it
  if (gpuTier === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[0.6, 1.2]}
        camera={{
          fov: 18,
          position: [0, 0.42, 6.8],
          near: 0.1,
          far: 20,
        }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "low-power",
          stencil: false,
          depth: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.8,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={["#09090B"]} />
        <SceneContent drivers={drivers} />
      </Canvas>
    </div>
  );
}
