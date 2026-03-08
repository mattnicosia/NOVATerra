// NovaScene v2 — R3F canvas + HDR post-processing
// Tuned for domain-warped volumetric sphere with selective bloom

import { Suspense, useRef, forwardRef, useImperativeHandle } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import NovacoreSphere from "./NovacoreSphere";
import { getGpuTier } from "./gpuDetect";

// ── Post-processing — HDR selective bloom ───────────────────────────
function Effects({ morphValue = 0 }) {
  // v11.5: Lower threshold + higher intensity → visible bloom halo from star core.
  // NOVA: threshold 0.72 catches the HDR center glow, creating visible stellar bloom.
  // CORE: threshold drops further for volcanic eruption bloom.
  const bloomIntensity = 1.2 + morphValue * 0.4;
  const bloomThreshold = 0.72 - morphValue * 0.08;

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={0.1}
        mipmapBlur
        radius={0.88}
        levels={7}
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

// ── Scene wrapper ──────────────────────────────────────────────────
const NovaScene = forwardRef(function NovaScene(
  { morphTarget = null, intensity = 0.7, size = 1.6, width = 200, height = 200, className = "", style = {}, onClick },
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

  const dpr = gpuTier >= 2 ? [1, 2] : [1, 1.5];

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: "relative",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      <Canvas
        dpr={dpr}
        frameloop="always"
        camera={{ position: [0, 0, 4.0], fov: 45 }}
        gl={{
          antialias: gpuTier >= 2,
          alpha: true,
          powerPreference: "high-performance",
          stencil: false,
          depth: true,
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      >
        <Suspense fallback={null}>
          {/* Minimal lighting — sphere is self-illuminating via shaders */}
          <pointLight position={[5, 5, 5]} intensity={0.08} color="#8B5CF6" />
          <pointLight position={[-5, -3, 3]} intensity={0.06} color="#E8920A" />

          <NovacoreSphere
            ref={sphereRef}
            morphTarget={morphTarget}
            intensity={intensity}
            size={size}
            segments={gpuTier >= 2 ? 128 : 64}
            gpuTier={gpuTier}
            onClick={onClick}
          />

          {gpuTier >= 2 && <Effects morphValue={morphTarget ?? 0} />}
        </Suspense>
      </Canvas>
    </div>
  );
});

export default NovaScene;
