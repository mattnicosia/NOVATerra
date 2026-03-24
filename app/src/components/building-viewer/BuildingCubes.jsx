// BuildingCubes.jsx — InstancedMesh cube renderer with assembly animation
// Each cube flies from scattered position to target, with staggered delays per floor.

import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_MATERIALS } from "@/lib/building-types";

const _tempObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _tempVec = new THREE.Vector3();

// Easing: quart out
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// Easing: cubic out for scale
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function BuildingCubes({ cubes, onProgress, onComplete }) {
  const meshRef = useRef();
  const edgeMeshRef = useRef();
  const startTime = useRef(null);
  const prevCubeCount = useRef(0);
  const [assembled, setAssembled] = useState(false);
  const animDuration = 2.5; // seconds for full assembly

  // Reset animation when cubes change (dimension update)
  useEffect(() => {
    if (cubes.length !== prevCubeCount.current) {
      startTime.current = null;
      setAssembled(false);
      prevCubeCount.current = cubes.length;
      onProgress?.(0);
    }
  }, [cubes]);

  // Group cubes by type for coloring
  const cubeTypes = useMemo(() => cubes.map(c => c.type), [cubes]);

  // Pre-compute colors per instance
  const colors = useMemo(() => {
    const arr = new Float32Array(cubes.length * 3);
    cubes.forEach((c, i) => {
      const mat = CUBE_MATERIALS[c.type] || CUBE_MATERIALS.wall;
      _tempColor.set(mat.color);
      arr[i * 3] = _tempColor.r;
      arr[i * 3 + 1] = _tempColor.g;
      arr[i * 3 + 2] = _tempColor.b;
    });
    return arr;
  }, [cubes]);

  // Edge geometry for wireframe overlay
  const edgeGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(0.89, 0.89, 0.89);
    return new THREE.EdgesGeometry(box);
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current || !cubes.length) return;

    if (startTime.current === null) startTime.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startTime.current;

    let allDone = true;
    let progressSum = 0;

    for (let i = 0; i < cubes.length; i++) {
      const cube = cubes[i];
      const t = Math.min(1, Math.max(0, (elapsed - cube.delay) / animDuration));
      const eased = easeOutQuart(t);
      const scaleEased = easeOutCubic(t);

      if (t < 1) allDone = false;
      progressSum += t;

      // Interpolate position
      const sx = cube.start[0];
      const sy = cube.start[1];
      const sz = cube.start[2];
      const tx = cube.target[0];
      const ty = cube.target[1];
      const tz = cube.target[2];

      _tempObj.position.set(
        sx + (tx - sx) * eased,
        sy + (ty - sy) * eased,
        sz + (tz - sz) * eased
      );

      // Scale
      const s = 0.01 + 0.99 * scaleEased;
      _tempObj.scale.set(s, s, s);

      // Rotation dampens during flight
      const rotDamp = 1 - eased;
      _tempObj.rotation.set(
        rotDamp * (cube.start[0] * 0.3),
        rotDamp * (cube.start[1] * 0.2),
        rotDamp * (cube.start[2] * 0.3)
      );

      // Post-assembly: idle breathing
      if (t >= 1 && assembled) {
        const breathe = Math.sin(state.clock.elapsedTime * 0.5 + i * 0.1) * 0.015;
        _tempObj.position.y = ty + breathe;
      }

      _tempObj.updateMatrix();
      meshRef.current.setMatrixAt(i, _tempObj.matrix);

      // Wireframe edge mesh (same transforms)
      if (edgeMeshRef.current) {
        edgeMeshRef.current.setMatrixAt(i, _tempObj.matrix);
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (edgeMeshRef.current) edgeMeshRef.current.instanceMatrix.needsUpdate = true;

    // Progress callback
    const progress = Math.min(100, (progressSum / cubes.length) * 100);
    onProgress?.(Math.round(progress));

    if (allDone && !assembled) {
      setAssembled(true);
      onComplete?.();
    }
  });

  // Window emissive pulse
  useFrame((state) => {
    if (!meshRef.current || !assembled) return;
    const pulse = 0.2 + Math.sin(state.clock.elapsedTime * 1.5) * 0.15;

    // We can't easily change per-instance emissive with InstancedMesh,
    // but we can update the shared material's emissive intensity
    // This affects all cubes equally — a tradeoff for performance.
  });

  if (!cubes.length) return null;

  return (
    <group>
      {/* Main instanced cubes */}
      <instancedMesh ref={meshRef} args={[null, null, cubes.length]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 0.88, 0.88]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </boxGeometry>
        <meshStandardMaterial
          vertexColors
          metalness={0.15}
          roughness={0.7}
        />
      </instancedMesh>

      {/* Wireframe edge overlay */}
      <instancedMesh ref={edgeMeshRef} args={[edgeGeo, null, cubes.length]}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.08} />
      </instancedMesh>
    </group>
  );
}
