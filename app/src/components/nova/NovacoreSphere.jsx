// NovacoreSphere v2 — Cinematic 3D morphing sphere
// Domain-warped FBM + IQ palette + volumetric raymarching + atmosphere glow
// uMorph 0.0 = NOVA (cool violet plasma) → 1.0 = CORE (amber fusion reactor)

import { useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useNovaStore } from "@/stores/novaStore";
import { novacoreVertexShader } from "./shaders/novacore.vert";
import { novacoreFragmentShader } from "./shaders/novacore.frag";
import { atmosphereVertexShader } from "./shaders/atmosphere.vert";
import { atmosphereFragmentShader } from "./shaders/atmosphere.frag";

// ── IQ Cosine Palette parameters ────────────────────────────────────
// palette(t) = a + b * cos(2π(c*t + d))
// Tuned for deep → bright → deep color cycling

// NOVA: cyan → deep blue → violet → lavender — wide diversity, R+B phased
// Wider amps for more visible hue zones. R+B peak together (max R/B ≈ 0.50)
const NOVA_PAL = {
  a: new THREE.Vector3(0.16, 0.17, 0.54), // strong blue base (B always present)
  b: new THREE.Vector3(0.16, 0.28, 0.24), // wider amps: R for violet, G for cyan, B swings
  c: new THREE.Vector3(1.0, 0.85, 0.70), // freq separation for organic drift
  d: new THREE.Vector3(0.50, 0.20, 0.50), // R+B SAME phase → peak together!
};

// CORE: amber-gold-white spectrum — deep darks with blazing hot peaks
const CORE_PAL = {
  a: new THREE.Vector3(0.05, 0.02, 0.01), // near-black base (darker foundation)
  b: new THREE.Vector3(0.85, 0.55, 0.18), // wide amplitude → extreme contrast
  c: new THREE.Vector3(1.0, 0.8, 0.55), // offset cycles → gold-to-white shifts
  d: new THREE.Vector3(0.0, 0.1, 0.22), // amber → gold → white-hot peaks
};

// ── Status → morph target mapping ──────────────────────────────────
const STATUS_MORPH = {
  idle: 0.0,
  thinking: 0.25,
  learning: 0.55,
  alert: 0.15,
  affirm: 0.1,
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const NovacoreSphere = forwardRef(function NovacoreSphere(
  { morphTarget = null, intensity = 0.7, size = 1.6, segments = 128, gpuTier = 2, onClick },
  ref,
) {
  const groupRef = useRef();
  const materialRef = useRef();
  const atmosphereMatRef = useRef();

  const stateRef = useRef({
    morph: 0.0,
    morphTarget: 0.0,
    pulse: 0.0,
    exhale: 0.0,
    intensity: intensity,
    voice: 0.0,
  });

  // ── Main sphere uniforms ──────────────────────────────────────
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uMorph: { value: 0.0 },
      uPulse: { value: 0.0 },
      uExhale: { value: 0.0 },
      uIntensity: { value: intensity },
      uVoice: { value: 0.0 },
      uNoiseScale: { value: 1.8 },
      uSize: { value: size },
      uTier: { value: gpuTier },
      // IQ palette: NOVA
      uNovaPalA: { value: NOVA_PAL.a },
      uNovaPalB: { value: NOVA_PAL.b },
      uNovaPalC: { value: NOVA_PAL.c },
      uNovaPalD: { value: NOVA_PAL.d },
      // IQ palette: CORE
      uCorePalA: { value: CORE_PAL.a },
      uCorePalB: { value: CORE_PAL.b },
      uCorePalC: { value: CORE_PAL.c },
      uCorePalD: { value: CORE_PAL.d },
    }),
    [],
  );

  // ── Atmosphere uniforms ───────────────────────────────────────
  const atmosphereUniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uMorph: { value: 0.0 },
      uIntensity: { value: intensity },
      uPulse: { value: 0.0 },
      uExhale: { value: 0.0 },
      uNovaGlow: { value: new THREE.Vector3(0.25, 0.28, 0.90) },
      uCoreGlow: { value: new THREE.Vector3(0.95, 0.6, 0.12) },
    }),
    [],
  );

  // ── Imperative API ────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exhale: () => {
      stateRef.current.exhale = 1.0;
    },
    pulse: () => {
      stateRef.current.pulse = 1.0;
    },
    setMorph: v => {
      stateRef.current.morphTarget = Math.max(0, Math.min(1, v));
    },
    setIntensity: v => {
      stateRef.current.intensity = Math.max(0.2, Math.min(1.0, v));
    },
    setVoice: v => {
      stateRef.current.voice = v;
    },
    getMorph: () => stateRef.current.morph,
  }));

  // ── Animation loop ────────────────────────────────────────────
  useFrame((state, delta) => {
    if (!materialRef.current) return;

    const s = stateRef.current;
    const u = materialRef.current.uniforms;
    const elapsedTime = state.clock.elapsedTime;

    // Time
    u.uTime.value = elapsedTime;

    // Morph target from novaStore status
    const status = useNovaStore.getState().status;
    const autoMorph = STATUS_MORPH[status] ?? 0.0;
    const targetMorph = morphTarget !== null ? morphTarget : autoMorph;
    s.morphTarget = targetMorph;

    // Smooth morph interpolation
    const morphSpeed = 1.5;
    s.morph = lerp(s.morph, s.morphTarget, 1.0 - Math.exp(-morphSpeed * delta));
    u.uMorph.value = s.morph;

    // Pulse decay
    s.pulse *= Math.exp(-4.0 * delta);
    if (s.pulse < 0.001) s.pulse = 0.0;
    u.uPulse.value = s.pulse;

    // Exhale decay
    s.exhale *= Math.exp(-2.5 * delta);
    if (s.exhale < 0.001) s.exhale = 0.0;
    u.uExhale.value = s.exhale;

    // Intensity interpolation
    u.uIntensity.value = lerp(u.uIntensity.value, s.intensity, 1.0 - Math.exp(-2.0 * delta));

    // Voice
    u.uVoice.value = lerp(u.uVoice.value, s.voice, 0.15);
    s.voice *= 0.92;

    // ── Sync atmosphere uniforms ──────────────────────────────
    if (atmosphereMatRef.current) {
      const au = atmosphereMatRef.current.uniforms;
      au.uTime.value = elapsedTime;
      au.uMorph.value = s.morph;
      au.uIntensity.value = u.uIntensity.value;
      au.uPulse.value = s.pulse;
      au.uExhale.value = s.exhale;
    }

    // ── Rotation ──────────────────────────────────────────────
    if (groupRef.current) {
      // v8: Slower rotation — graceful, not chaotic
      const rotSpeed = lerp(0.025, 0.06, s.morph);
      groupRef.current.rotation.y += rotSpeed * delta;
      groupRef.current.rotation.x = Math.sin(elapsedTime * 0.08) * 0.05;
    }
  });

  // v3: Higher detail — 6 for Tier 2 (20480 tris), 5 for Tier 1 (5120 tris)
  const geoDetail = segments > 64 ? 6 : 5;

  return (
    <group ref={groupRef} onClick={onClick}>
      {/* Main sphere — domain-warped volumetric plasma */}
      <mesh>
        <icosahedronGeometry args={[size, geoDetail]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={novacoreVertexShader}
          fragmentShader={novacoreFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={true}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>

      {/* Atmosphere glow — ethereal halo */}
      <mesh scale={[1.28, 1.28, 1.28]}>
        <icosahedronGeometry args={[size, 5]} />
        <shaderMaterial
          ref={atmosphereMatRef}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmosphereUniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

export default NovacoreSphere;
