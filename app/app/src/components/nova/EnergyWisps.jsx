// EnergyWisps v1 — Billboard sprites between sphere and shell surface
// Visible during mid-awakening (0.3–0.7): energy escaping through shell fractures.
// 8 wisps orbit at varying radii between sphere surface and shell inner wall.
// Noise-driven alpha creates organic appear/drift/fade behavior.
//
// Paul Franklin: "In Interstellar, the light particles near Gargantua
// weren't random — they followed the gravitational field. These wisps
// follow the sphere's energy field."

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const WISP_COUNT = 8;

export default function EnergyWisps({ size = 1.6, awaken = 0.0, morph = 0.0 }) {
  const groupRef = useRef();
  const spritesRef = useRef([]);

  // Per-wisp parameters — deterministic orbits at different radii, speeds, inclinations
  const wispParams = useMemo(
    () =>
      Array.from({ length: WISP_COUNT }, (_, i) => ({
        radius: size * (1.03 + 0.07 * ((i * 0.618) % 1)), // golden ratio spread between sphere and shell
        speed: 0.15 + 0.12 * Math.sin(i * 1.7), // orbital speed variation
        phase: (i / WISP_COUNT) * Math.PI * 2, // evenly spaced start positions
        inclination: (i * 0.37 - 0.5) * 0.8, // ±0.4 radian tilt from equator
        alphaPhase: i * 2.39, // unique alpha oscillation phase
        alphaSpeed: 0.3 + 0.15 * (i % 3), // vary fade speed
        wispSize: 0.04 + 0.03 * ((i * 0.73) % 1), // size variation
      })),
    [size],
  );

  // NOVA blue → CORE amber wisp colors
  const novaColor = useMemo(() => new THREE.Color("#4466FF"), []);
  const coreColor = useMemo(() => new THREE.Color("#FFB84D"), []);

  // Create sprite materials — one per wisp for individual alpha control
  const materials = useMemo(
    () =>
      wispParams.map(
        () =>
          new THREE.SpriteMaterial({
            color: novaColor.clone(),
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame(state => {
    const elapsed = state.clock.elapsedTime;

    // Visibility envelope: peaks at awaken 0.3–0.7, fades at edges
    const wispVisibility = smoothstep(0.2, 0.4, awaken) * (1.0 - smoothstep(0.65, 0.9, awaken));

    // Color morph
    const targetColor = novaColor.clone().lerp(coreColor, morph);

    for (let i = 0; i < WISP_COUNT; i++) {
      const wp = wispParams[i];
      const mat = materials[i];
      const sprite = spritesRef.current[i];
      if (!sprite) continue;

      // Orbital position — circular orbit with inclination
      const angle = elapsed * wp.speed + wp.phase;
      const cosInc = Math.cos(wp.inclination);
      const sinInc = Math.sin(wp.inclination);
      const x = Math.cos(angle) * wp.radius;
      const z = Math.sin(angle) * wp.radius * cosInc;
      const y = Math.sin(angle) * wp.radius * sinInc;
      sprite.position.set(x, y, z);

      // Noise-driven alpha: smooth appear/fade cycles
      // Two overlapping sine waves for organic, non-periodic rhythm
      const alpha1 = Math.sin(elapsed * wp.alphaSpeed + wp.alphaPhase);
      const alpha2 = Math.sin(elapsed * wp.alphaSpeed * 1.7 + wp.alphaPhase + 2.1);
      const rawAlpha = Math.max(0, alpha1 * 0.6 + alpha2 * 0.4);
      mat.opacity = rawAlpha * wispVisibility * 0.45;

      // Color morph
      mat.color.lerp(targetColor, 0.05);

      // Scale pulse — slight size oscillation
      const scale = wp.wispSize * (0.8 + 0.4 * rawAlpha);
      sprite.scale.set(scale, scale, scale);
    }
  });

  return (
    <group ref={groupRef}>
      {wispParams.map((wp, i) => (
        <sprite
          key={i}
          ref={el => {
            spritesRef.current[i] = el;
          }}
          material={materials[i]}
        />
      ))}
    </group>
  );
}

// GLSL-style smoothstep for JS
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
