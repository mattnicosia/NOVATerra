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
// Wider amps for VISIBLE hue zones. R+B peak together → lavender (not pink)
// Max R/B ≈ 0.46 (always reads as violet, never pink)
// v10.5: True violet-blue — R capped so it NEVER reads as pink
// (IQ: "R/B must stay < 0.40 after satBoost for true violet")
// R range: 0.06–0.26. At R peak with B≈0.70: R/B=0.37 → VIOLET, not magenta.
// B range: 0.26–0.82 (always dominant). G range: 0–0.18 (faint accent only).
// v11.6: TRUE BLUE STAR palette — blue is DOMINANT, never violet.
// R base 0.06 + swing 0.04 → max R ≈ 0.10, min R ≈ 0.02. Almost no red.
// Real blue stars (Rigel, Vega): overwhelmingly blue with slight cyan undertone.
// B base 0.56 + swing 0.32 → rich range from deep indigo (0.24) to bright blue (0.88).
// G base 0.14 + swing 0.10 → G range [0.04, 0.24]. Never zero → always reads blue, not violet.
const NOVA_PAL = {
  a: new THREE.Vector3(0.06, 0.14, 0.56), // very low R, raised G for true blue (not violet), dominant B
  b: new THREE.Vector3(0.04, 0.1, 0.32), // minimal R swing, tighter G swing (min 0.04), wide B
  c: new THREE.Vector3(1.0, 0.85, 0.7), // standard IQ frequency separation
  d: new THREE.Vector3(0.5, 0.78, 0.5), // R+B sync, G phase-shifted
};

// CORE: amber-gold-white spectrum — deep darks with blazing hot peaks
// b.z near-zero → no blue swing → eliminates purple at low-R palette values
const CORE_PAL = {
  a: new THREE.Vector3(0.05, 0.02, 0.01), // near-black base (darker foundation)
  b: new THREE.Vector3(0.85, 0.55, 0.04), // R+G wide, B near-zero → pure amber, no purple
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
  { morphTarget = null, intensity = 0.7, size = 1.6, segments = 128, gpuTier = 2, onClick, crystallize = null, crystalLayers = null },
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
    // Hodgin frost event — stochastic flash-freeze moments
    frostActive: 0.0,       // 0→1 frost intensity (decays after spike)
    frostNextTime: 15.0,    // seconds until next frost event (first one at ~15s)
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
      // Phase-transition crystallization (IQ + Patricio)
      uCrystallize: { value: 0.0 },    // 0 = fluid, 1 = fully crystalline
      uCrystalLayers: { value: 4.0 },  // facet density
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
      uNovaGlow: { value: new THREE.Vector3(0.1, 0.18, 0.9) }, // v11.5b: blue glow matching blue star body
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

    // ── Layer 5: Hodgin frost event — stochastic flash-freeze ──────
    // Brief moments (3-8s) where crystallization spikes to 0.8+, then slowly melts.
    // Random interval 45-90s. Creates genuine surprise — "did it just freeze?"
    // Only in auto mode — manual override bypasses all temporal layers.
    if (crystallize === null) {
      s.frostNextTime -= delta;
      if (s.frostNextTime <= 0) {
        // FROST! Spike to 0.8-1.0
        s.frostActive = 0.8 + Math.random() * 0.2;
        // Next frost in 45-90 seconds
        s.frostNextTime = 45 + Math.random() * 45;
      }
      // Slow melt — exp decay at -0.4 gives ~5s half-life (visible freeze then gradual thaw)
      s.frostActive *= Math.exp(-0.4 * delta);
      if (s.frostActive < 0.005) s.frostActive = 0.0;
    }

    // ── Phase-transition crystallization (Hodgin temporal layers) ──
    // Manual override: crystallize/crystalLayers props bypass auto when non-null
    if (crystallize !== null) {
      // Manual control — direct set with smooth interpolation
      u.uCrystallize.value = lerp(u.uCrystallize.value, crystallize, 1.0 - Math.exp(-3.0 * delta));
    } else {
      // Auto: Hodgin temporal layers
      // Layer 1: Geological crystallize drift — 2-3 min
      const geoPhase = Math.sin(elapsedTime * 0.0055 + 1.7) * 0.5 + 0.5;
      const geoPhase2 = Math.sin(elapsedTime * 0.0031 + 4.2) * 0.5 + 0.5;
      const geoCrystallize = 0.08 + 0.32 * (geoPhase * 0.6 + geoPhase2 * 0.4);

      // Layer 2: State-driven — morph adds crystallization
      const stateCrystallize = s.morph * 0.2;

      // Layer 3: Pulse/exhale spike — crystal shatter moment
      const eventCrystallize = s.pulse * 0.6 + s.exhale * 0.3;

      // Layer 5: Frost event — stochastic flash-freeze spike
      const frostCrystallize = s.frostActive;

      // Combine — clamp to 0→1
      const targetCrystallize = Math.min(1.0, geoCrystallize + stateCrystallize + eventCrystallize + frostCrystallize);
      u.uCrystallize.value = lerp(u.uCrystallize.value, targetCrystallize, 1.0 - Math.exp(-2.0 * delta));
    }

    if (crystalLayers !== null) {
      // Manual control
      u.uCrystalLayers.value = lerp(u.uCrystalLayers.value, crystalLayers, 1.0 - Math.exp(-2.0 * delta));
    } else {
      // Auto: Crystal grain drift — 40-60s, facet density evolves independently
      const layerPhase = Math.sin(elapsedTime * 0.018 + 2.9) * 0.5 + 0.5;
      const layerPhase2 = Math.sin(elapsedTime * 0.011 + 0.7) * 0.5 + 0.5;
      const targetLayers = 3.0 + 4.0 * (layerPhase * 0.65 + layerPhase2 * 0.35);
      u.uCrystalLayers.value = lerp(u.uCrystalLayers.value, targetLayers, 1.0 - Math.exp(-0.5 * delta));
    }

    // ── Sync atmosphere uniforms ──────────────────────────────
    if (atmosphereMatRef.current) {
      const au = atmosphereMatRef.current.uniforms;
      au.uTime.value = elapsedTime;
      au.uMorph.value = s.morph;
      au.uIntensity.value = u.uIntensity.value;
      au.uPulse.value = s.pulse;
      au.uExhale.value = s.exhale;
    }

    // ── Rotation — organic wobble, not mechanical ──────────────
    if (groupRef.current) {
      // Base speed + 2-freq wobble → living rotation (Hodgin)
      const baseRot = lerp(0.025, 0.06, s.morph);
      const rotWobble = 1.0 + 0.25 * Math.sin(elapsedTime * 0.15) + 0.1 * Math.sin(elapsedTime * 0.37);
      groupRef.current.rotation.y += baseRot * rotWobble * delta;
      // Multi-frequency tilt — subtle breathing axis
      groupRef.current.rotation.x = Math.sin(elapsedTime * 0.08) * 0.06 + Math.sin(elapsedTime * 0.13) * 0.03;
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

      {/* Atmosphere glow — v11.4b: tighter scale (1.04) eliminates visible seam */}
      <mesh scale={[1.04, 1.04, 1.04]}>
        <icosahedronGeometry args={[size, 6]} />
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
