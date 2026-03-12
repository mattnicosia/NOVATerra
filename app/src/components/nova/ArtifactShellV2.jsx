// ArtifactShellV2 — BlueYard-inspired geometric obsidian shell
//
// Architecture pivot: Fragment-shader Voronoi cracks (V1) → GEOMETRY-based cracks (V2)
//
// Key insight: At small sizes (28-180px), fragment shader crack detail is subpixel
// and invisible. But geometric edges (LineSegments) are crisp at ANY size because
// the GPU rasterizes them as primitives. Bloom post-processing creates multi-pixel
// glow halos even from 1px lines.
//
// Layer 1: IcosahedronGeometry faces → flat-shaded obsidian plates
// Layer 2: EdgesGeometry → LineSegments crack network (glows via bloom)
//
// Inspired by BlueYard Capital section 4 crypto sphere:
//   Their geodesic wireframe + glass shell + inner particles
//   → Our obsidian plates + glowing crack edges + inner energy particles
//
// Usage:
//   <ArtifactShellV2 size={1.6} awaken={0.0} morph={0.0} innerLight={0.7} />

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ═══════════════════════════════════════════════════════════════════
// OBSIDIAN FACE SHADER
// Flat-shaded dark plates with Fresnel rim glow + awaken-driven opacity.
// Uses screen-space derivatives for per-face normals (true flat shading
// in a custom ShaderMaterial without needing toNonIndexed()).
// ═══════════════════════════════════════════════════════════════════

const faceVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const faceFragmentShader = /* glsl */ `
  uniform float uAwaken;
  uniform float uTime;

  varying vec3 vWorldPosition;

  void main() {
    // ── Flat face normal via screen-space derivatives ──────────
    vec3 fdx = dFdx(vWorldPosition);
    vec3 fdy = dFdy(vWorldPosition);
    vec3 N = normalize(cross(fdx, fdy));

    // ── View direction (cameraPosition is Three.js built-in) ──
    vec3 V = normalize(cameraPosition - vWorldPosition);

    // ── Fresnel ───────────────────────────────────────────────
    float NdotV = abs(dot(N, V));
    float fresnel = 1.0 - NdotV;

    // ── Obsidian base — dark but visible against void background ──
    // Slightly raised from pure black so faceted structure reads in dark scenes
    vec3 obsidian = vec3(0.025, 0.022, 0.04);
    // Hash face normal to get per-face shade variation (breaks uniformity)
    float faceHash = fract(sin(dot(N, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    obsidian *= 0.7 + 0.6 * faceHash;

    // ── Subtle top-light for 3D depth readability ─────────────
    vec3 lightDir = normalize(vec3(0.0, 1.0, 0.3));
    float lambert = max(0.0, dot(N, lightDir)) * 0.12;
    vec3 lighting = vec3(0.03, 0.02, 0.06) * lambert;

    // ── Fresnel rim glow — purple dormant → blue alive ────────
    float fresnelPow = mix(4.0, 2.0, uAwaken);
    float fresnelMask = pow(fresnel, fresnelPow);
    vec3 rimColor = mix(
      vec3(0.10, 0.06, 0.25),   // Dormant: subtle deep purple
      vec3(0.25, 0.40, 1.40)    // Alive: bright blue (HDR for bloom)
    , uAwaken);
    float rimStr = mix(0.3, 3.0, uAwaken);

    vec3 color = obsidian + lighting + rimColor * fresnelMask * rimStr;

    // ── Opacity — near-opaque dormant monolith, transparent alive ──
    // Steeper smoothstep range [0.15, 0.85] keeps shell opaque longer
    // during early awakening, then dissolves faster mid-range.
    // Dormant (0.28): ~0.95 opacity → dark monolith, only faint glow leaks
    // Dissolving (0.55): ~0.50 → shell becoming translucent
    // Alive (0.70): ~0.18 → mostly transparent, inner sphere visible
    float opacity = mix(0.98, 0.04, smoothstep(0.15, 0.85, uAwaken));
    // Edges slightly more transparent (light leaks through thin plates)
    opacity -= fresnelMask * mix(0.04, 0.35, uAwaken);

    gl_FragColor = vec4(color, clamp(opacity, 0.0, 1.0));
  }
`;

// ═══════════════════════════════════════════════════════════════════
// CRACK EDGE SHADER
// Emissive line material. Bloom picks up edges above luminance threshold.
// The crack network BREATHES when dormant (Hodgin: "alive, not frozen").
// ═══════════════════════════════════════════════════════════════════

const edgeVertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const edgeFragmentShader = /* glsl */ `
  uniform float uAwaken;
  uniform float uTime;

  void main() {
    // ── Color: deep purple dormant → bright blue-white alive ──
    // Dormant needs enough luminance to exceed bloom threshold (standard
    // luminance weights R=0.21, G=0.72, B=0.07 mean blue needs to be VERY
    // bright to bloom). Green channel raised for better bloom pickup.
    vec3 dormantColor = vec3(0.20, 0.18, 0.60);
    vec3 aliveColor = vec3(0.40, 0.55, 1.80);
    vec3 color = mix(dormantColor, aliveColor, uAwaken);

    // ── Dormant breathing — the crack network pulses slowly ───
    // 0.8 Hz base + secondary at 0.37 Hz (multi-freq = organic, Hodgin)
    float breathe = 1.0 + 0.15 * sin(uTime * 0.8) + 0.08 * sin(uTime * 2.3);
    // Breathing fades out as awakening increases (edges become steady-state bright)
    float breatheScale = mix(breathe, 1.0, smoothstep(0.2, 0.6, uAwaken));
    color *= breatheScale;

    // ── Overall intensity scales with awakening ───────────────
    // Dormant starts at 1.8 (was 0.5) so edges have enough emission to bloom
    float intensity = mix(1.8, 3.5, uAwaken);

    gl_FragColor = vec4(color * intensity, 1.0);
  }
`;

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ArtifactShellV2({
  size = 1.6,
  awaken = 0.0,
  morph = 0.0,
  innerLight = 0.7,
  detail = 1, // Icosahedron subdivision: 1 = 80 faces / 120 edges (sweet spot)
}) {
  const groupRef = useRef();
  const faceMatRef = useRef();
  const edgeMatRef = useRef();
  const awakenRef = useRef(awaken);

  // Track prop changes via ref (avoids useFrame closure stale)
  awakenRef.current = awaken;

  // ── Geometry: icosahedron faces + extracted edges ────────────
  const { faceGeo, edgeGeo } = useMemo(() => {
    const shellRadius = size * 1.12; // Shell is 12% larger than inner NOVACORE sphere
    const ico = new THREE.IcosahedronGeometry(shellRadius, detail);
    // thresholdAngle=1° catches all edges of the icosahedron
    const edges = new THREE.EdgesGeometry(ico, 1);
    return { faceGeo: ico, edgeGeo: edges };
  }, [size, detail]);

  // Cleanup geometry on unmount or re-creation
  useEffect(() => {
    return () => {
      faceGeo.dispose();
      edgeGeo.dispose();
    };
  }, [faceGeo, edgeGeo]);

  // ── Uniforms ────────────────────────────────────────────────
  const faceUniforms = useMemo(
    () => ({
      uAwaken: { value: awaken },
      uTime: { value: 0.0 },
    }),
    [],
  );

  const edgeUniforms = useMemo(
    () => ({
      uAwaken: { value: awaken },
      uTime: { value: 0.0 },
    }),
    [],
  );

  // ── Animation loop — smooth interpolation toward target ─────
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);

    if (faceMatRef.current) {
      const u = faceMatRef.current.uniforms;
      u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
      u.uTime.value = time;
    }

    if (edgeMatRef.current) {
      const u = edgeMatRef.current.uniforms;
      u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
      u.uTime.value = time;
    }
  });

  // Shell draws AFTER inner sphere + atmosphere (renderOrder=10)
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.renderOrder = 10;
    }
  }, []);

  return (
    <group ref={groupRef}>
      {/* Layer 1: Obsidian plates — flat-shaded faces of the icosahedron */}
      <mesh geometry={faceGeo}>
        <shaderMaterial
          ref={faceMatRef}
          vertexShader={faceVertexShader}
          fragmentShader={faceFragmentShader}
          uniforms={faceUniforms}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>

      {/* Layer 2: Crack network — geometric edges that glow through bloom */}
      {/* LineSegments = crisp at ANY size. 1px GPU lines + bloom = visible glow halos. */}
      <lineSegments geometry={edgeGeo}>
        <shaderMaterial
          ref={edgeMatRef}
          vertexShader={edgeVertexShader}
          fragmentShader={edgeFragmentShader}
          uniforms={edgeUniforms}
          transparent={false}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  );
}
