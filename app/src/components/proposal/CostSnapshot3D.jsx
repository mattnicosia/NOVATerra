/**
 * CostSnapshot3D — Offscreen 3D renderer for cost-colored building visualization.
 *
 * Renders a React-Three-Fiber canvas off-screen, colors building elements by cost
 * intensity, captures to PNG, and returns via callback. Auto-unmounts after capture.
 *
 * Usage:
 *   <CostSnapshot3D elements={[...]} onCapture={base64 => ...} />
 */
import { useRef, useEffect, useState, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Red-yellow-green cost heatmap (same as BlueprintTab._costColor) */
function costColor(cost, maxCost) {
  if (!cost || !maxCost) return "#6B7280";
  const ratio = Math.min(cost / maxCost, 1);
  const r = Math.round(ratio > 0.5 ? 255 : ratio * 2 * 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},60)`;
}

/** Inner scene that auto-captures after one render */
function CaptureScene({ elements, maxCost, onCapture }) {
  const { gl, scene, camera } = useThree();
  const captured = useRef(false);

  // Fit camera to bounding box of all elements
  useEffect(() => {
    if (!elements?.length) return;
    const box = new THREE.Box3();
    scene.traverse(obj => {
      if (obj.isMesh) box.expandByObject(obj);
    });
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;

    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.7);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [elements, scene, camera]);

  // Capture after 2 frames (allow geometry + lighting to settle)
  useFrame(() => {
    if (captured.current) return;
    captured.current = true;
    // Render one more frame then capture
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");
    onCapture(dataUrl);
  });

  return null;
}

/** Simple box element renderer */
function CostElement({ position, size, color: col }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={col} roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

/**
 * Renders a simplified building from divTotals as stacked blocks.
 * Each division is a horizontal block, stacked vertically, sized by cost proportion.
 */
function SimplifiedBuilding({ divTotals, grand }) {
  const blocks = useMemo(() => {
    if (!divTotals || !grand) return [];

    const DIV_ORDER = ["31", "03", "04", "05", "06", "07", "08", "09", "10", "22", "23", "26", "21"];
    const entries = Object.entries(divTotals)
      .map(([div, val]) => {
        const amount = typeof val === "number" ? val : val?.total || val?.mid || 0;
        return { div, amount, pct: amount / grand };
      })
      .filter(d => d.amount > 0 && d.pct >= 0.02)
      .sort((a, b) => {
        const ai = DIV_ORDER.indexOf(a.div);
        const bi = DIV_ORDER.indexOf(b.div);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    const maxCost = Math.max(...entries.map(e => e.amount));
    const totalHeight = 20;
    let y = 0;

    return entries.map(entry => {
      const height = Math.max(entry.pct * totalHeight, 0.3);
      const width = 8 + entry.pct * 12;
      const depth = 6 + entry.pct * 8;
      const block = {
        position: [0, y + height / 2, 0],
        size: [width, height, depth],
        color: costColor(entry.amount, maxCost),
        div: entry.div,
      };
      y += height + 0.1;
      return block;
    });
  }, [divTotals, grand]);

  return (
    <group>
      {blocks.map((b, i) => (
        <CostElement key={i} position={b.position} size={b.size} color={b.color} />
      ))}
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.9} />
      </mesh>
    </group>
  );
}

export default function CostSnapshot3D({ divTotals, grand, onCapture, width = 1200, height = 800 }) {
  const [done, setDone] = useState(false);

  const handleCapture = (dataUrl) => {
    setDone(true);
    onCapture?.(dataUrl);
  };

  // Don't render if already captured
  if (done) return null;

  return (
    <div style={{
      position: "fixed", left: -9999, top: -9999,
      width, height, overflow: "hidden", pointerEvents: "none",
    }}>
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 45, near: 0.1, far: 200, position: [20, 15, 20] }}
        style={{ width, height }}
        frameloop="always"
      >
        <ambientLight intensity={0.6} color="#D8D4D0" />
        <directionalLight position={[10, 15, 8]} intensity={1.0} color="#FFE4CC" />
        <directionalLight position={[-8, 10, -5]} intensity={0.3} color="#B0C4D8" />
        <fog attach="fog" args={["#f0f0f0", 30, 80]} />

        <Suspense fallback={null}>
          <SimplifiedBuilding divTotals={divTotals} grand={grand} />
          <CaptureScene
            elements={divTotals}
            maxCost={grand}
            onCapture={handleCapture}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
