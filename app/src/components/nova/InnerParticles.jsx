// InnerParticles — Energy particles trapped inside the obsidian shell
//
// Inspired by BlueYard's crypto-inner-sphere-points.glb:
//   Their approach: pre-baked Houdini particle positions loaded as GLB
//   Our approach: procedurally generated random positions inside sphere
//
// Particles become visible as the shell awakens and plates become translucent.
// Gentle orbital drift gives the sense of contained energy — "powers inside."
//
// Usage:
//   <InnerParticles size={1.6} awaken={0.0} count={300} />
//   Place inside the same <group> as NovacoreSphere, before ArtifactShellV2

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const particleVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;

  uniform float uTime;
  uniform float uAwaken;
  uniform float uSize;

  varying float vAlpha;
  varying float vPhase;

  void main() {
    vPhase = aPhase;

    // ── Gentle orbital drift — particles slowly circulate ─────
    vec3 pos = position;
    float angle = uTime * (0.03 + aPhase * 0.05);
    float r = length(pos.xz);
    float theta = atan(pos.z, pos.x) + angle;
    pos.x = r * cos(theta);
    pos.z = r * sin(theta);
    // Vertical bob — each particle at its own phase
    pos.y += sin(uTime * 0.25 + aPhase * 6.2831) * 0.04;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // ── Size with distance attenuation ────────────────────────
    float sizeScale = mix(0.4, 1.6, uAwaken);
    gl_PointSize = aSize * uSize * sizeScale * (300.0 / -mvPosition.z);

    // ── Alpha: invisible when dormant, visible during awakening ─
    // Particles emerge gradually starting around awaken=0.25
    float awakenVisibility = smoothstep(0.20, 0.55, uAwaken);
    // Particles near center are brighter (energy core)
    float distFromCenter = length(position) / (uSize * 1.0);
    float depthFade = 1.0 - distFromCenter * 0.4;
    vAlpha = awakenVisibility * depthFade * 0.85;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragmentShader = /* glsl */ `
  uniform float uAwaken;
  uniform float uTime;

  varying float vAlpha;
  varying float vPhase;

  void main() {
    // ── Soft circle — discard outside radius 0.5 ─────────────
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float softEdge = smoothstep(0.5, 0.15, d);

    // ── Temporal twinkle — each particle fades in/out at its own rate
    float twinkle = 0.7 + 0.3 * sin(uTime * (1.5 + vPhase * 2.0) + vPhase * 6.28);

    float alpha = softEdge * vAlpha * twinkle;

    // ── NOVA blue color with per-particle variation ───────────
    vec3 color = mix(
      vec3(0.20, 0.30, 0.95),   // Deep blue
      vec3(0.45, 0.55, 1.50)    // Bright blue-white (HDR for bloom)
    , vPhase);

    // Slight warm shift at high awakening (energy intensifying)
    color = mix(color, vec3(0.55, 0.50, 1.40), uAwaken * 0.25);

    gl_FragColor = vec4(color, alpha);
  }
`;

export default function InnerParticles({ size = 1.6, awaken = 0.0, count = 300 }) {
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  awakenRef.current = awaken;

  // ── Generate random particle positions inside sphere ────────
  const { positions, sizes, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    const ph = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Uniform distribution inside a sphere (cube-root for volume uniformity)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 1 / 3) * size * 0.92;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      sz[i] = 1.5 + Math.random() * 4.0; // Point size variation
      ph[i] = Math.random(); // Phase for color/animation variation
    }

    return { positions: pos, sizes: sz, phases: ph };
  }, [count, size]);

  // ── Uniforms ────────────────────────────────────────────────
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uAwaken: { value: awaken },
      uSize: { value: size },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Animation loop ──────────────────────────────────────────
  useFrame((state, delta) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    // Smooth interpolation toward awaken target
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}
