// NovaScene v3 — R3F canvas + HDR post-processing + Chamber environment
// Three zoom levels: sphere → artifact → chamber
// Tuned for domain-warped volumetric sphere with selective bloom

import { Suspense, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Environment } from "@react-three/drei";
import NovacoreSphere from "./NovacoreSphere";
import PBRShell from "./PBRShell";
import InnerParticles from "./InnerParticles";
import EnergyWisps from "./EnergyWisps";
import Chamber from "./Chamber";
import { getGpuTier } from "./gpuDetect";

// ── Post-processing — HDR selective bloom ───────────────────────────
function Effects({ morphValue = 0, artifact = false, awaken = 1.0 }) {
  let bloomIntensity = 1.2 + morphValue * 0.4;
  let bloomThreshold = 0.72 - morphValue * 0.08;

  // Bloom geometry defaults (non-artifact)
  let bloomRadius = 0.88;
  let bloomLevels = 7;

  if (artifact) {
    // PBR v1: Gentler bloom — PBR materials look great on their own.
    // Bloom COMPLEMENTS the real reflections/clearcoat rather than overwhelming them.
    // Dormant–fracture: no bloom (pure PBR obsidian with HDRI reflections).
    // Alive–ascending: bloom enhances the emissive inner glow that transmits through.
    //   Fracture (0.35): intensity≈0.04, threshold≈0.76 → barely visible
    //   Dissolving (0.55): intensity≈0.17, threshold≈0.68 → subtle halo
    //   Alive (0.72): intensity≈0.56, threshold≈0.61 → warm glow
    //   Ascending (1.0): intensity≈1.50, threshold≈0.50 → bright but sphere still reads
    const a3 = awaken * awaken * awaken;
    bloomIntensity = a3 * 1.5;
    bloomThreshold = 0.90 - awaken * 0.40;
    bloomRadius = 0.25 + awaken * 0.45;
    bloomLevels = Math.round(4 + awaken * 2);
  }

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.1}
        mipmapBlur
        radius={bloomRadius}
        levels={bloomLevels}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={[0.0003 + morphValue * 0.0017, 0.0002 + morphValue * 0.0014]}
        radialModulation
        modulationOffset={0.12}
      />
    </EffectComposer>
  );
}

// ── PERF FIX: Throttled rendering via demand mode ─────────────────
// Instead of frameloop="always" (60fps continuous), we use "demand" and
// invalidate at a controlled rate. Full-quality spheres get 20fps,
// lightweight icons get 10fps. Saves 67-83% GPU time.
function ThrottledRender({ fps = 20 }) {
  const { invalidate } = useThree();
  useEffect(() => {
    const ms = 1000 / fps;
    const id = setInterval(invalidate, ms);
    return () => clearInterval(id);
  }, [invalidate, fps]);
  return null;
}

// ── Scene wrapper ──────────────────────────────────────────────────
const NovaScene = forwardRef(function NovaScene(
  {
    morphTarget = null,
    intensity = 0.7,
    size = 1.6,
    width = 200,
    height = 200,
    className = "",
    style = {},
    onClick,
    artifact = false,
    awaken = 1.0,
    chamber = false,
    crystallize = null,
    crystalLayers = null,
    lightweight = false, // v15: Stripped-down mode for small instances
  },
  ref,
) {
  const sphereRef = useRef();

  useImperativeHandle(ref, () => ({
    exhale: () => sphereRef.current?.exhale(),
    pulse: () => sphereRef.current?.pulse(),
    setMorph: v => sphereRef.current?.setMorph(v),
    setIntensity: v => sphereRef.current?.setIntensity(v),
    setVoice: v => sphereRef.current?.setVoice(v),
    getMorph: () => sphereRef.current?.getMorph() ?? 0,
  }));

  const gpuTier = getGpuTier();
  if (gpuTier === 0) return null;

  // Lightweight mode: minimal DPR, no postprocessing, lower segments
  // For small instances (header logo, floating orbs, sidebar indicators)
  const isLight = lightweight || gpuTier < 2;
  const dpr = isLight ? [1, 1] : [1, 2];
  const segments = isLight ? 32 : gpuTier >= 2 ? 128 : 64;
  const showEffects = !isLight && gpuTier >= 2;
  const showArtifact = artifact && !lightweight;
  const showChamber = chamber && !lightweight;
  // PERF FIX: All instances use demand mode — rendering only when invalidated
  // by our throttled timer (20fps full / 10fps lightweight) instead of 60fps always.
  const frameloop = "demand";
  const targetFps = lightweight ? 10 : 20;

  // BLOOM HEADROOM: When post-processing is active, the bloom glow extends
  // beyond the sphere body. If the canvas matches the container exactly, the
  // glow hard-clips at the canvas edge creating a visible rectangle.
  // Fix: Expand the canvas 30% beyond the container and add a soft radial mask
  // so the bloom fades smoothly instead of clipping.
  // Canvas bleed: expand canvas + radial mask for soft glow falloff.
  // PBR mode uses a wider mask (sphere body at ~38% of 130% canvas).
  // Non-artifact mode uses tighter mask for bloom containment.
  const hasBleed = showEffects && !lightweight;
  const canvasInset = hasBleed ? "-15%" : "0";
  const canvasSize = hasBleed ? "130%" : "100%";

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: "relative",
        overflow: "visible",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      <Canvas
        dpr={dpr}
        frameloop={frameloop}
        camera={{ position: [0, 0, 4.0], fov: 45 }}
        gl={{
          antialias: !isLight,
          alpha: true,
          powerPreference: lightweight ? "default" : "high-performance",
          stencil: false,
          depth: true,
        }}
        style={{
          position: "absolute",
          top: canvasInset,
          left: canvasInset,
          width: canvasSize,
          height: canvasSize,
          background: "transparent",
          // Soft radial mask: sphere body fully visible, glow fades at edges.
          // PBR: wider mask (48%→60%) preserves clearcoat/reflection edges.
          // Non-PBR: tighter mask (42%→50%) contains bloom bleed.
          ...(hasBleed ? {
            WebkitMaskImage: showArtifact
              ? "radial-gradient(circle at 50% 50%, black 48%, rgba(0,0,0,0.4) 55%, transparent 62%)"
              : "radial-gradient(circle at 50% 50%, black 42%, rgba(0,0,0,0.5) 46%, transparent 50%)",
            maskImage: showArtifact
              ? "radial-gradient(circle at 50% 50%, black 48%, rgba(0,0,0,0.4) 55%, transparent 62%)"
              : "radial-gradient(circle at 50% 50%, black 42%, rgba(0,0,0,0.5) 46%, transparent 50%)",
          } : {}),
        }}
      >
        <Suspense fallback={null}>
          <ThrottledRender fps={targetFps} />

          {/* PBR LIGHTING: Environment map + directional lights for physical sphere */}
          {showArtifact && (
            <>
              <Environment preset="studio" background={false} />
              <ambientLight intensity={0.12} />
              {/* Key light: upper-right, creates specular highlight on obsidian */}
              <directionalLight position={[5, 5, 5]} intensity={0.6} color="#ffffff" />
              {/* Fill light: cool violet from left-below for depth */}
              <directionalLight position={[-4, -2, 3]} intensity={0.25} color="#a78bfa" />
              {/* Rim light: back light for edge definition */}
              <directionalLight position={[0, 2, -5]} intensity={0.15} color="#c4b5fd" />
            </>
          )}
          {/* Original dim lights for non-artifact shader instances */}
          {!showArtifact && (
            <>
              <pointLight position={[5, 5, 5]} intensity={0.08} color="#8B5CF6" />
              {!lightweight && <pointLight position={[-5, -3, 3]} intensity={0.06} color="#E8920A" />}
            </>
          )}

          <NovacoreSphere
            ref={sphereRef}
            morphTarget={morphTarget}
            intensity={intensity}
            size={size}
            segments={segments}
            gpuTier={gpuTier}
            onClick={onClick}
            crystallize={crystallize}
            crystalLayers={crystalLayers}
          />

          {/* PBR Shell — MeshPhysicalMaterial obsidian with HDRI reflections */}
          {showArtifact && (
            <>
              <InnerParticles size={size} awaken={awaken} />
              <PBRShell size={size} awaken={awaken} morph={morphTarget ?? 0} />
              <EnergyWisps size={size} awaken={awaken} morph={morphTarget ?? 0} />
            </>
          )}

          {/* The Chamber — environmental vault with caustic floor + particles */}
          {showChamber && <Chamber size={size} awaken={awaken} morph={morphTarget ?? 0} innerLight={intensity} />}

          {/* Effects skip at low awaken — PBR obsidian looks best without bloom.
              Pure HDRI reflections + clearcoat shine at dormant/early awakening.
              Effects mount at dissolving phase when emissive glow needs bloom. */}
          {showEffects && (!artifact || awaken > 0.40) && (
            <Effects morphValue={morphTarget ?? 0} artifact={artifact} awaken={awaken} />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
});

export default NovaScene;
