// NovaSceneLazy — Lazy-loaded wrapper for the 3D NOVACORE scene
// Dynamically imports Three.js + R3F only when needed.
// Falls back to the existing 2D NovaOrb for unsupported devices.

import { lazy, Suspense, forwardRef, useState, useEffect } from "react";
import { getGpuTier } from "./gpuDetect";

const NovaScene3D = lazy(() => import("./NovaScene"));

// Lightweight loading placeholder — subtle pulse
function LoadingFallback({ width, height }) {
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: Math.min(width, height) * 0.4,
          height: Math.min(width, height) * 0.4,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)",
          animation: "breatheOrb 3s ease-in-out infinite",
        }}
      />
    </div>
  );
}

const NovaSceneLazy = forwardRef(function NovaSceneLazy(props, ref) {
  const { width = 200, height = 200, fallback: Fallback = null, ...rest } = props;
  const [canRender3D, setCanRender3D] = useState(null);

  useEffect(() => {
    // Check GPU capability on mount
    const tier = getGpuTier();
    setCanRender3D(tier >= 1);
  }, []);

  // Still detecting
  if (canRender3D === null) {
    return <LoadingFallback width={width} height={height} />;
  }

  // GPU too weak — render 2D fallback
  if (!canRender3D && Fallback) {
    return <Fallback />;
  }
  if (!canRender3D) {
    return <LoadingFallback width={width} height={height} />;
  }

  // Full 3D
  return (
    <Suspense fallback={<LoadingFallback width={width} height={height} />}>
      <NovaScene3D ref={ref} width={width} height={height} {...rest} />
    </Suspense>
  );
});

export default NovaSceneLazy;
