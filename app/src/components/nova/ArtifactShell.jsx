// ArtifactShell — The dark obsidian housing containing NOVA/CORE
// "An orb from another planet that has these powers inside of it.
//  When interacted with, it illuminates."
//
// Architecture:
//   Outer shell mesh (icosahedron, slightly larger than NOVACORE sphere)
//   Custom shader: obsidian material with Voronoi fracture network
//   uAwaken uniform drives dormant → awakening → alive transition
//   Inner light from NOVACORE bleeds through fractures and thin regions
//
// Usage:
//   <ArtifactShell size={1.6} awaken={0.0} morph={0.0} innerLight={0.7} />
//   Place in same <group> as NovacoreSphere, OUTSIDE the atmosphere mesh

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { artifactVertexShader } from "./shaders/artifact.vert";
import { artifactFragmentShader } from "./shaders/artifact.frag";

export default function ArtifactShell({ size = 1.6, awaken = 0.0, morph = 0.0, innerLight = 0.7 }) {
  const meshRef = useRef();
  const matRef = useRef();
  const awakenRef = useRef(awaken);
  const morphRef = useRef(morph);
  const innerLightRef = useRef(innerLight);

  // Track prop changes
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

    // Smooth interpolation toward targets
    const speed = 2.0;
    const t = 1.0 - Math.exp(-speed * delta);
    u.uAwaken.value += (awakenRef.current - u.uAwaken.value) * t;
    u.uMorph.value += (morphRef.current - u.uMorph.value) * t;
    u.uInnerLight.value += (innerLightRef.current - u.uInnerLight.value) * t;
  });

  // Shell is 12% larger than the inner sphere
  // This sits OUTSIDE the atmosphere (1.04×) with breathing room
  const shellScale = 1.12;

  // renderOrder=10 ensures shell draws AFTER inner sphere + atmosphere.
  // When dormant (alpha≈1), shell occludes everything → dark monolith.
  // When alive (alpha≈0.28), shell composites over visible inner sphere → translucent.
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.renderOrder = 10;
    }
  }, []);

  return (
    <mesh ref={meshRef} scale={[shellScale, shellScale, shellScale]}>
      <icosahedronGeometry args={[size, 6]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={artifactVertexShader}
        fragmentShader={artifactFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        toneMapped={false}
      />
    </mesh>
  );
}
