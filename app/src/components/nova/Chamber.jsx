// Chamber v3 — The Vault: cinematic architectural space containing the Artifact
//
// "Three zoom levels of the same world":
//   1. Sphere: close-up NOVACORE plasma
//   2. Artifact: sphere + obsidian housing shell
//   3. Chamber: artifact floating in a dark architectural vault
//
// v3 enhancements (Paul Franklin joins the Visual Board):
//   - Volumetric light shaft: visible atmospheric column from artifact to floor
//   - Vault pillars: 8 dark obsidian columns giving architectural scale
//   - Dynamic artifact light: point light at center, color-morphs with state
//   - Subtle ambient fill: architectural depth even when dormant
//
// Paul Franklin: "The chamber isn't set dressing — it's the third character
// in the scene. The artifact speaks through light, the chamber listens."
//
// Architecture:
//   - Obsidian floor (custom shader: caustics + light pool + Fresnel)
//   - Volumetric shaft (custom shader: noise-driven atmospheric density)
//   - Vault pillars (MeshStandardMaterial, lit by artifact point light)
//   - OrbitControls (interactive camera with auto-rotate)
//   - Dual particle layers (ambient + concentrated)
//   - Dynamic point light (color-morphs, intensity tracks awaken)

import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { chamberVertexShader } from "./shaders/chamber.vert";
import { chamberFragmentShader } from "./shaders/chamber.frag";
import { volumetricVertexShader } from "./shaders/volumetric.vert";
import { volumetricFragmentShader } from "./shaders/volumetric.frag";
import { fogVertexShader } from "./shaders/fog.vert";
import { fogFragmentShader } from "./shaders/fog.frag";
import { domeVertexShader } from "./shaders/dome.vert";
import { domeFragmentShader } from "./shaders/dome.frag";

// ── Camera Setup — initial position for chamber view ─────────────────
function CameraSetup() {
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      // Paul Franklin: "The establishing shot tells the audience
      // what kind of story they're walking into."
      // Higher + further back = shows artifact, shaft, pillars, and floor
      camera.position.set(0, 2.5, 6.5);
      camera.lookAt(0, -0.3, 0);
      initialized.current = true;
    }
  }, [camera]);

  return null;
}

// ── Chamber Floor — obsidian surface with caustic light shader ───────
function ChamberFloor({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} renderOrder={-1}>
      <circleGeometry args={[12, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={chamberVertexShader}
        fragmentShader={chamberFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Volumetric Light Shaft — visible column of artifact light ────────
// Paul Franklin: "In Interstellar, the light from Gargantua's accretion
// disk lit up the dust around the ship. That's how you know the light
// is real — it interacts with the atmosphere."
function VolumetricShaft({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);
  const shaftTop = shellRadius;
  const shaftHeight = shaftTop - floorY;
  const centerY = (shaftTop + floorY) / 2;

  return (
    <mesh position={[0, centerY, 0]}>
      <cylinderGeometry
        args={[
          shellRadius * 0.6, // top radius — narrow near artifact
          shellRadius * 2.2, // bottom radius — light spreads at floor
          shaftHeight,
          32, // radial segments
          8,  // height segments
          true, // open ended
        ]}
      />
      <shaderMaterial
        ref={matRef}
        vertexShader={volumetricVertexShader}
        fragmentShader={volumetricFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Ground Fog — atmospheric haze at floor level ────────────────────
// Paul Franklin: "Fog is what separates a 3D scene from a movie set.
// It's how the eye knows the space has depth."
function GroundFog({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    [],
  );

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.08, 0]}>
      <circleGeometry args={[10, 64]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={fogVertexShader}
        fragmentShader={fogFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Vault Pillars — dark obsidian columns with architectural detail ──
// Paul Franklin: "Architecture gives scale. Without the pillars, you
// don't know if the artifact is the size of a basketball or a building."
// Jony: "Classical proportions — wider base, narrower shaft, capital at top.
// Even in darkness, the silhouette should communicate permanence."
const PILLAR_COUNT = 8;
const PILLAR_RING_RADIUS = 8;
const PILLAR_HEIGHT = 7;
const SHAFT_RADIUS = 0.18;
const BASE_RADIUS = 0.32;
const CAP_RADIUS = 0.28;
const BASE_HEIGHT = 0.35;
const CAP_HEIGHT = 0.25;

function VaultPillars({ size, awaken, morph, innerLight }) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  const positions = useMemo(() => {
    return Array.from({ length: PILLAR_COUNT }, (_, i) => {
      const angle = (i / PILLAR_COUNT) * Math.PI * 2;
      return {
        x: Math.cos(angle) * PILLAR_RING_RADIUS,
        z: Math.sin(angle) * PILLAR_RING_RADIUS,
      };
    });
  }, []);

  // Shared geometries
  const shaftGeo = useMemo(
    () => new THREE.CylinderGeometry(SHAFT_RADIUS * 0.92, SHAFT_RADIUS, PILLAR_HEIGHT - BASE_HEIGHT - CAP_HEIGHT, 8),
    [],
  );
  const baseGeo = useMemo(
    () => new THREE.CylinderGeometry(SHAFT_RADIUS * 1.05, BASE_RADIUS, BASE_HEIGHT, 8),
    [],
  );
  const capGeo = useMemo(
    () => new THREE.CylinderGeometry(CAP_RADIUS, SHAFT_RADIUS * 0.92, CAP_HEIGHT, 8),
    [],
  );
  // Plinth — wider square base for visual grounding
  const plinthGeo = useMemo(
    () => new THREE.BoxGeometry(BASE_RADIUS * 2.2, 0.12, BASE_RADIUS * 2.2),
    [],
  );
  // Glow disc — sits at the base of each pillar where light pool contacts
  const glowDiscGeo = useMemo(
    () => new THREE.CircleGeometry(BASE_RADIUS * 2.5, 16),
    [],
  );

  // Material: dark obsidian with slight metallic sheen
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#08080E"),
        roughness: 0.4,
        metalness: 0.4,
      }),
    [],
  );

  // Glow materials — per-pillar for spatial modulation (v14)
  // Each pillar gets its own brightness factor based on angle + time oscillation
  const novaGlow = useMemo(() => new THREE.Color("#2233AA"), []);
  const coreGlow = useMemo(() => new THREE.Color("#AA6611"), []);
  const glowMats = useMemo(
    () =>
      Array.from({ length: PILLAR_COUNT }, () =>
        new THREE.MeshBasicMaterial({
          color: novaGlow.clone(),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    [],
  );
  // Per-pillar brightness offsets (deterministic variation)
  const pillarPhases = useMemo(
    () => Array.from({ length: PILLAR_COUNT }, (_, i) => ({
      phase: (i / PILLAR_COUNT) * Math.PI * 2 + i * 1.7,  // unique phase per pillar
      speed: 0.08 + (i % 3) * 0.03,  // slightly different oscillation speeds
      base: 0.6 + 0.4 * Math.sin(i * 2.39),  // 0.2–1.0 base brightness
    })),
    [],
  );

  // Animate glow materials
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);
  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((state, delta) => {
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    const elapsed = state.clock.elapsedTime;
    const targetColor = novaGlow.clone().lerp(coreGlow, morphRef.current);

    for (let i = 0; i < PILLAR_COUNT; i++) {
      const mat = glowMats[i];
      const pp = pillarPhases[i];
      mat.color.lerp(targetColor, t);
      // v14: Per-pillar spatial modulation — slow oscillation creates migrating bright/dim pillars
      const pillarBright = pp.base * (0.75 + 0.25 * Math.sin(elapsed * pp.speed + pp.phase));
      const targetOpacity = awakenRef.current * innerLightRef.current * 0.18 * pillarBright;
      mat.opacity += (targetOpacity - mat.opacity) * t;
    }
  });

  const shaftHeight = PILLAR_HEIGHT - BASE_HEIGHT - CAP_HEIGHT;

  return (
    <group>
      {positions.map((p, i) => {
        const shaftY = floorY + BASE_HEIGHT + shaftHeight / 2;
        const baseY = floorY + BASE_HEIGHT / 2;
        const capY = floorY + BASE_HEIGHT + shaftHeight + CAP_HEIGHT / 2;
        const plinthY = floorY + 0.06;
        const glowY = floorY + 0.04;
        return (
          <group key={i} position={[p.x, 0, p.z]}>
            {/* Light spill disc — per-pillar brightness modulation (v14) */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, glowY, 0]}
              geometry={glowDiscGeo}
              material={glowMats[i]}
            />
            {/* Plinth — wide square base, barely visible */}
            <mesh position={[0, plinthY, 0]} geometry={plinthGeo} material={material} />
            {/* Base — flared transition from plinth to shaft */}
            <mesh position={[0, baseY, 0]} geometry={baseGeo} material={material} />
            {/* Shaft — main column body, slight taper */}
            <mesh position={[0, shaftY, 0]} geometry={shaftGeo} material={material} />
            {/* Capital — wider top, echoes the base form */}
            <mesh position={[0, capY, 0]} geometry={capGeo} material={material} />
          </group>
        );
      })}
    </group>
  );
}

// ── Vault Dome — subtle architectural ceiling for enclosure ──────────
// Paul Franklin: "In every Interstellar environment, there's a ceiling —
// even if you can barely see it. It tells the audience they're inside."
function VaultDome({ size, awaken, morph, innerLight }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  const uniforms = useMemo(
    () => ({
      uAwaken: { value: awaken },
      uMorph: { value: morph },
      uInnerLight: { value: innerLight },
    }),
    [],
  );

  useFrame((_, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[PILLAR_RING_RADIUS + 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={domeVertexShader}
        fragmentShader={domeFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── Artifact Point Light — dynamic illumination from sphere energy ───
// Color smoothly morphs between NOVA violet and CORE amber.
// Intensity tracks awaken × innerLight. Dormant = no light, alive = full.
function ArtifactLight({ awaken, morph, innerLight }) {
  const lightRef = useRef();
  const novaColor = useMemo(() => new THREE.Color("#6B4CE6"), []);
  const coreColor = useMemo(() => new THREE.Color("#E8920A"), []);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  awakenRef.current = awaken;
  morphRef.current = morph;
  innerLightRef.current = innerLight;

  useFrame((_, delta) => {
    if (!lightRef.current) return;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);

    // Smooth color morph
    targetColor.copy(novaColor).lerp(coreColor, morphRef.current);
    lightRef.current.color.lerp(targetColor, t);

    // Smooth intensity transition — strong enough to light distant pillars
    // Paul Franklin: "The light should reach every surface in the chamber,
    // even if it arrives as barely a whisper on the far columns."
    const targetIntensity = awakenRef.current * innerLightRef.current * 8.0;
    lightRef.current.intensity += (targetIntensity - lightRef.current.intensity) * t;
  });

  return (
    <pointLight
      ref={lightRef}
      position={[0, 0, 0]}
      intensity={0}
      distance={22}
      decay={1.6}
    />
  );
}

// ── Main Chamber Component ───────────────────────────────────────────
export default function Chamber({
  size = 1.6,
  awaken = 0.0,
  morph = 0.0,
  innerLight = 0.7,
}) {
  const shellRadius = size * 1.12;
  const floorY = -(shellRadius + 0.4);

  return (
    <group>
      {/* Dark vault background */}
      <color attach="background" args={["#020204"]} />

      {/* Very subtle ambient fill — pillars visible even when dormant */}
      {/* Paul Franklin: "Even in the darkest set, there's always ambient.
          Zero light means invisible geometry, not mood." */}
      <ambientLight intensity={0.008} color="#0a0a18" />

      {/* Dynamic artifact illumination — lights the pillars and environment */}
      <ArtifactLight awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Obsidian floor with caustic light patterns */}
      <ChamberFloor size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Volumetric light shaft — visible column of artifact light through dust */}
      <VolumetricShaft size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Ground fog — atmospheric haze at floor level */}
      <GroundFog size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Dark obsidian columns — architectural depth and scale */}
      <VaultPillars size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* Vault ceiling dome — subtle architectural enclosure */}
      <VaultDome size={size} awaken={awaken} morph={morph} innerLight={innerLight} />

      {/* ── Particle Layer 1: Ambient dust — sparse, slow, fills the vault ── */}
      <Sparkles
        count={40}
        size={1.2}
        scale={[10, 6, 10]}
        position={[0, 0.5, 0]}
        speed={0.08}
        opacity={0.10 + awaken * 0.12}
        color={morph > 0.5 ? "#C4782A" : "#3355AA"}
      />

      {/* ── Particle Layer 2: Energy motes — concentrated near artifact ── */}
      <Sparkles
        count={30}
        size={1.8}
        scale={[3, 3.5, 3]}
        position={[0, 0.3, 0]}
        speed={0.2}
        opacity={awaken * 0.4}
        color={morph > 0.5 ? "#FFB84D" : "#6688FF"}
      />

      {/* ── Particle Layer 3: Floor-level dust — ground atmosphere ── */}
      <Sparkles
        count={25}
        size={0.8}
        scale={[8, 1.0, 8]}
        position={[0, floorY + 0.5, 0]}
        speed={0.05}
        opacity={0.06 + awaken * 0.08}
        color={morph > 0.5 ? "#E8920A" : "#4466FF"}
      />

      {/* Camera setup + interactive orbit controls */}
      <CameraSetup />
      <OrbitControls
        makeDefault
        target={[0, -0.2, 0]}
        minDistance={3.5}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.05}
        minPolarAngle={0.2}
        enableDamping
        dampingFactor={0.04}
        autoRotate
        autoRotateSpeed={0.25}
        rotateSpeed={0.5}
      />
    </group>
  );
}
