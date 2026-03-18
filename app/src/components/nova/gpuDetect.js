// gpuDetect — Lightweight GPU capability detection
// Zero heavy dependencies — safe to import eagerly without pulling in Three.js/R3F
// Tiers: 0 = 2D fallback, 1 = simplified 3D, 2 = full quality

let _gpuTier = null;

export function getGpuTier() {
  if (_gpuTier !== null) return _gpuTier;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      _gpuTier = 0;
      return 0;
    }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "";

    // Check for software renderers / very old GPUs
    const isLowEnd = /swiftshader|llvmpipe|mesa/i.test(renderer);
    const hasRealGPU = /apple|nvidia|amd|radeon|intel|geforce|metal/i.test(renderer);
    const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);

    if (isLowEnd && !hasRealGPU)
      _gpuTier = 0; // Tier 0: 2D fallback (software renderer only)
    else if (isMobile)
      _gpuTier = 1; // Tier 1: simplified 3D
    else _gpuTier = 2; // Tier 2: full quality

    canvas.remove();
  } catch {
    _gpuTier = 0;
  }
  return _gpuTier;
}
