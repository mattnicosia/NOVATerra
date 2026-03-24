// CommandTable.jsx — Multi-building command center
// Clean wireframe buildings + HDRI reflections + bloom
// Simple geometry at map zoom, cube detail only on single-building zoom

import { useRef, useMemo, Suspense } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { OrbitControls, Environment, MeshReflectorMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ── Status colors ──
const STATUS = {
  Bidding:    { color: "#00BFFF", emissive: "#00BFFF", intensity: 0.4 },
  Won:        { color: "#00D4AA", emissive: "#00D4AA", intensity: 0.5 },
  Lost:       { color: "#2A2E35", emissive: "#1A1E25", intensity: 0.05 },
  "On Hold":  { color: "#FFB020", emissive: "#FFB020", intensity: 0.3 },
  Submitted:  { color: "#4DA6FF", emissive: "#4DA6FF", intensity: 0.35 },
  Qualifying: { color: "#FFB020", emissive: "#FFB020", intensity: 0.25 },
  Draft:      { color: "#444A55", emissive: "#2A2E35", intensity: 0.1 },
};
const getStatus = (s) => STATUS[s] || STATUS.Bidding;

// ── Simple wireframe building (not cubes) ──
function WireframeBuilding({ width, depth, floors, floorHeight, status, position }) {
  const st = getStatus(status);
  const totalH = floors * floorHeight;
  const ref = useRef();

  useFrame((state) => {
    if (!ref.current) return;
    // Subtle breathing
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8 + position[0]) * 0.03;
  });

  return (
    <group ref={ref} position={position}>
      {/* Solid glass body */}
      <mesh castShadow>
        <boxGeometry args={[width, totalH, depth]} />
        <meshPhysicalMaterial
          color={st.color}
          metalness={0.7}
          roughness={0.15}
          transmission={0.3}
          thickness={0.5}
          emissive={st.emissive}
          emissiveIntensity={st.intensity}
          transparent
          opacity={0.6}
          envMapIntensity={1.5}
        />
      </mesh>

      {/* Wireframe edges */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, totalH, depth)]} />
        <lineBasicMaterial color={st.color} transparent opacity={0.8} />
      </lineSegments>

      {/* Floor lines */}
      {Array.from({ length: floors - 1 }, (_, i) => {
        const y = -totalH / 2 + (i + 1) * floorHeight;
        return (
          <lineSegments key={i} position={[0, y, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(width, depth)]} />
            <lineBasicMaterial color={st.color} transparent opacity={0.2} />
          </lineSegments>
        );
      })}

      {/* Base glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -totalH / 2 + 0.05, 0]}>
        <ringGeometry args={[Math.max(width, depth) * 0.6, Math.max(width, depth) * 0.75, 32]} />
        <meshBasicMaterial color={st.emissive} transparent opacity={st.intensity * 0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Top cap glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, totalH / 2 + 0.02, 0]}>
        <planeGeometry args={[width * 0.8, depth * 0.8]} />
        <meshBasicMaterial color={st.emissive} transparent opacity={st.intensity * 0.3} />
      </mesh>
    </group>
  );
}

// ── Project label (HTML overlay rendered via CSS) ──
function ProjectLabels({ buildings, camera }) {
  // Labels handled by HUD overlay, not 3D text
  return null;
}

// ── Ground surface ──
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
      <planeGeometry args={[500, 500]} />
      <MeshReflectorMaterial
        blur={[512, 128]}
        resolution={1024}
        mixBlur={1}
        mixStrength={0.5}
        roughness={0.75}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#141820"
        metalness={0.8}
        mirror={0.2}
      />
    </mesh>
  );
}

// ── Grid lines on surface ──
function SurfaceGrid() {
  return (
    <group>
      {Array.from({ length: 41 }, (_, i) => {
        const pos = (i - 20) * 8;
        const opacity = i % 5 === 0 ? 0.06 : 0.025;
        return (
          <group key={i}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.49, pos]}>
              <planeGeometry args={[320, 0.015]} />
              <meshBasicMaterial color="#00D4AA" transparent opacity={opacity} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos, -0.49, 0]}>
              <planeGeometry args={[0.015, 320]} />
              <meshBasicMaterial color="#00D4AA" transparent opacity={opacity} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ── Data stream between buildings ──
function DataStream({ from, to }) {
  const curve = useMemo(() => {
    const mid = new THREE.Vector3(
      (from[0] + to[0]) / 2,
      1.5,
      (from[2] + to[2]) / 2
    );
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(from[0], 0.5, from[2]),
      mid,
      new THREE.Vector3(to[0], 0.5, to[2]),
    ]);
  }, [from, to]);

  const geo = useMemo(() => new THREE.TubeGeometry(curve, 24, 0.02, 4, false), [curve]);

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color="#00BFFF" transparent opacity={0.15} />
    </mesh>
  );
}

// ── Particles ──
function Particles({ bounds = 80 }) {
  const count = 50;
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * bounds * 2;
      arr[i * 3 + 1] = Math.random() * 15;
      arr[i * 3 + 2] = (Math.random() - 0.5) * bounds * 2;
    }
    return arr;
  }, [bounds]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      pos.array[i * 3 + 1] += delta * 0.1;
      if (pos.array[i * 3 + 1] > 15) pos.array[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#00D4AA" size={0.05} transparent opacity={0.2} sizeAttenuation />
    </points>
  );
}

// ── Layout ──
function layoutBuildings(estimates) {
  const spacing = 28;
  const cols = Math.max(3, Math.ceil(Math.sqrt(estimates.length)));
  return estimates.map((est, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const xOff = row % 2 === 1 ? spacing * 0.5 : 0;
    return {
      ...est,
      worldX: (col - (cols - 1) / 2) * spacing + xOff,
      worldZ: (row - Math.floor(estimates.length / cols) / 2) * spacing,
    };
  });
}

function estimateToBuilding(est) {
  const total = est.grandTotal || 0;
  const floors = Math.max(1, Math.min(12, Math.round(total / 100000) || 1));
  const scale = total > 200000 ? 1.3 : total > 50000 ? 1.0 : 0.7;
  return {
    width: 3 * scale,
    depth: 2.2 * scale,
    floors,
    floorHeight: 1.2,
  };
}

// ── Scene ──
function Scene({ buildings }) {
  return (
    <>
      <Environment files="/hdri/night_bridge_1k.hdr" background={false} />

      <ambientLight intensity={0.25} color="#C0C8D0" />
      <directionalLight position={[30, 35, 20]} intensity={0.6} color="#FFE8D4" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-far={150} shadow-camera-left={-80} shadow-camera-right={80}
        shadow-camera-top={80} shadow-camera-bottom={-80}
      />
      <directionalLight position={[15, 10, 30]} intensity={0.15} color="#B0C4D8" />

      <fogExp2 attach="fog" color="#0C0F14" density={0.008} />

      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={10} maxDistance={150}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 3, 0]}
      />

      <Ground />
      <SurfaceGrid />
      <Particles />

      {buildings.map((b, i) => {
        const dims = estimateToBuilding(b);
        return (
          <WireframeBuilding
            key={b.id || i}
            width={dims.width}
            depth={dims.depth}
            floors={dims.floors}
            floorHeight={dims.floorHeight}
            status={b.status}
            position={[b.worldX, dims.floors * dims.floorHeight / 2, b.worldZ]}
          />
        );
      })}

      {buildings.map((b, i) =>
        buildings.slice(i + 1)
          .filter(o => o.client && b.client && o.client === b.client)
          .map((o, j) => (
            <DataStream key={`s-${i}-${j}`} from={[b.worldX, 0, b.worldZ]} to={[o.worldX, 0, o.worldZ]} />
          ))
      )}

      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.2} mipmapBlur />
      </EffectComposer>
    </>
  );
}

// ── HUD ──
function HUD({ buildings }) {
  const total = buildings.reduce((s, b) => s + (b.grandTotal || 0), 0);
  const bidding = buildings.filter(b => b.status === "Bidding").length;
  const won = buildings.filter(b => b.status === "Won").length;
  const font = "'Barlow Condensed', 'Barlow', sans-serif";
  const mono = "'IBM Plex Mono', monospace";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: font }}>
      <div style={{ position: "absolute", top: 20, left: 24 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#00D4AA", textTransform: "uppercase" }}>NOVATERRA</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#E8E4E0", marginTop: 2 }}>Command Center</div>
      </div>
      <div style={{ position: "absolute", top: 20, right: 24, textAlign: "right" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#666", textTransform: "uppercase" }}>Portfolio</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#00D4AA", fontFamily: mono }}>
          ${total > 1e6 ? (total / 1e6).toFixed(1) + "M" : total > 1e3 ? (total / 1e3).toFixed(0) + "K" : total}
        </div>
      </div>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 50,
        background: "rgba(10,13,18,0.9)", backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(0,212,170,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 40,
        fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        <div><span style={{ color: "#E8E4E0", fontSize: 16, fontWeight: 700, fontFamily: mono }}>{buildings.length}</span> Projects</div>
        <div><span style={{ color: "#00BFFF", fontSize: 16, fontWeight: 700, fontFamily: mono }}>{bidding}</span> Bidding</div>
        <div><span style={{ color: "#00D4AA", fontSize: 16, fontWeight: 700, fontFamily: mono }}>{won}</span> Won</div>
      </div>
    </div>
  );
}

// ── Export ──
export default function CommandTable({ style }) {
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  const buildings = useMemo(() => {
    const ests = Object.values(estimatesIndex || {})
      .filter(e => e.status !== "Trash")
      .slice(0, 20);
    return layoutBuildings(ests.map(e => ({
      id: e.id, name: e.name, status: e.status || "Bidding",
      client: e.client || "", grandTotal: e.grandTotal || 0,
      buildingType: e.buildingType || "commercial",
    })));
  }, [estimatesIndex]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0C0F14", ...style }}>
      <Canvas
        shadows
        dpr={Math.min(window.devicePixelRatio, 2)}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
        camera={{ fov: 35, near: 0.1, far: 500, position: [50, 35, 50] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <Scene buildings={buildings} />
        </Suspense>
      </Canvas>
      <HUD buildings={buildings} />
    </div>
  );
}
