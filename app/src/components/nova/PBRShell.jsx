// PBRShell — MeshPhysicalMaterial obsidian sphere
// Replaces ArtifactShellV2's custom shaders with Three.js PBR pipeline.
// Mr.doob: "MeshPhysicalMaterial does in 10 lines what 742 lines of
// custom GLSL fails to do — physically correct light transport."
//
// Dormant: Glassy black obsidian with HDRI reflections. Looks REAL.
// Awakening: Transmission increases — inner energy sphere shows through.
// Alive: Nearly transparent glass shell with bright inner glow.

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const _emissiveTarget = new THREE.Color();

export default function PBRShell({ size = 1.6, awaken = 0, _morph = 0 }) {
  const meshRef = useRef();
  const matRef = useRef();

  useFrame((state, delta) => {
    if (!matRef.current) return;
    const mat = matRef.current;
    const spd = 1.0 - Math.exp(-2.5 * delta);

    // ── Transmission: opaque obsidian → transparent glass ──────────
    // Dormant: 0 (solid obsidian, HDRI reflections only)
    // Fracture: 0.1 (faint inner glow beginning to show)
    // Alive: 0.7 (inner sphere clearly visible through shell)
    // Ascending: 0.92 (nearly transparent, shell is just a glint)
    const targetTransmission = awaken < 0.2 ? 0 : Math.pow((awaken - 0.2) / 0.8, 1.5) * 0.92;
    mat.transmission += (targetTransmission - mat.transmission) * spd;

    // ── Roughness: glassy dormant → slightly diffuse mid-transition ──
    // The shell surface scatters slightly during fracture, then clears
    const targetRoughness = 0.08 + 0.12 * Math.sin(awaken * Math.PI * 0.8);
    mat.roughness += (targetRoughness - mat.roughness) * spd;

    // ── Clearcoat: high at dormant (obsidian gloss) → fades as shell dissolves
    const targetClearcoat = 1.0 - awaken * 0.6;
    mat.clearcoat += (targetClearcoat - mat.clearcoat) * spd;

    // ── Emissive: dark dormant → purple-blue glow at alive ─────────
    // Subtle rim glow that increases with awakening
    _emissiveTarget.setRGB(
      awaken * 0.12, // R: very subtle warmth
      awaken * 0.06, // G: minimal
      awaken * 0.35, // B: dominant blue glow
    );
    mat.emissive.lerp(_emissiveTarget, spd);
    const targetEmissiveIntensity = awaken * awaken * 2.5;
    mat.emissiveIntensity += (targetEmissiveIntensity - mat.emissiveIntensity) * spd;

    // ── Thickness: affects how light transmits through the shell ───
    mat.thickness += (1.5 + awaken * 2.0 - mat.thickness) * spd;

    // ── Environment map intensity: increases with awakening ────────
    // Dormant: subtle reflections (0.8). Alive: bright reflections (2.5)
    const targetEnv = 0.8 + awaken * 1.7;
    mat.envMapIntensity += (targetEnv - mat.envMapIntensity) * spd;
  });

  return (
    <mesh ref={meshRef} renderOrder={10}>
      <sphereGeometry args={[size * 1.06, 128, 128]} />
      <meshPhysicalMaterial
        ref={matRef}
        color="#0c0c18"
        roughness={0.08}
        metalness={0.0}
        clearcoat={1.0}
        clearcoatRoughness={0.03}
        ior={1.52}
        envMapIntensity={0.8}
        reflectivity={0.8}
        transmission={0.0}
        thickness={1.5}
        attenuationColor="#1a0840"
        attenuationDistance={4.0}
        emissive="#000000"
        emissiveIntensity={0}
        transparent
        side={THREE.FrontSide}
        toneMapped={false}
      />
    </mesh>
  );
}
