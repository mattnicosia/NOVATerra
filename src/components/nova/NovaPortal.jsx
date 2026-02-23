// NovaPortal — Pixel-shader galaxy renderer for NOVA AI personality
// Ported from Nova-Portal-v3.html reference. Pure Canvas 2D, no libraries.
// Sizes: hero (460px), floating (56px), avatar (42px), mini (30px)
// States: idle, thinking, alert, affirm — smooth 400ms transitions
import { useRef, useEffect, useCallback } from 'react';

// ── Noise functions (exact match to reference) ─────────────────
function hash(x, y, s) {
  let h = s + x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xffff) / 65535;
}

function noise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return hash(ix, iy, s) + (hash(ix + 1, iy, s) - hash(ix, iy, s)) * sx +
    (hash(ix, iy + 1, s) - hash(ix, iy, s)) * sy +
    (hash(ix, iy, s) - hash(ix + 1, iy, s) - hash(ix, iy + 1, s) + hash(ix + 1, iy + 1, s)) * sx * sy;
}

function fbm(x, y, s, o) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) {
    v += a * noise(x * f, y * f, s + i * 100);
    a *= 0.5; f *= 2;
  }
  return v;
}

// ── Size + state configs ───────────────────────────────────────
const SIZE_MAP = {
  hero:     { display: 460, canvas: 200 },
  floating: { display: 56,  canvas: 56 },
  avatar:   { display: 42,  canvas: 42 },
  mini:     { display: 30,  canvas: 30 },
};

const STATE_PARAMS = {
  idle:     { speed: 0.6,  layers: 6, coreIntensity: 0.8, warmShift: 0, brightBoost: 0 },
  thinking: { speed: 2.2,  layers: 6, coreIntensity: 1.3, warmShift: 0, brightBoost: 0 },
  alert:    { speed: 1.0,  layers: 6, coreIntensity: 1.0, warmShift: 0.8, brightBoost: 0 },
  affirm:   { speed: 0.8,  layers: 6, coreIntensity: 1.7, warmShift: 0, brightBoost: 60 },
};

// ── Lerp helper ────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

export default function NovaPortal({ size = "floating", state = "idle", style, coreIntensityOverride = null }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const startRef = useRef(null);
  // Current interpolated params (refs for perf — no re-renders)
  const currentRef = useRef({ ...STATE_PARAMS.idle });
  const targetRef = useRef({ ...STATE_PARAMS.idle });
  const transStartRef = useRef(0);
  const transFromRef = useRef({ ...STATE_PARAMS.idle });
  const coreOverrideRef = useRef(null);

  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.floating;
  // Reduce layers for small sizes (perf optimization)
  const maxLayers = size === "mini" ? 3 : size === "avatar" ? 4 : 6;
  // Reduce fbm octaves for small sizes
  const fbmOctaves = size === "hero" ? 3 : 2;

  // Update target when state prop changes
  useEffect(() => {
    const next = STATE_PARAMS[state] || STATE_PARAMS.idle;
    transFromRef.current = { ...currentRef.current };
    targetRef.current = { ...next, layers: Math.min(next.layers, maxLayers) };
    transStartRef.current = performance.now();
  }, [state, maxLayers]);

  // Sync coreIntensityOverride prop to ref (avoids recreating draw callback)
  useEffect(() => {
    coreOverrideRef.current = coreIntensityOverride;
  }, [coreIntensityOverride]);

  // Main render loop
  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!startRef.current) startRef.current = time;

    // Interpolate params over 400ms
    const transElapsed = (time - transStartRef.current) / 400;
    const from = transFromRef.current;
    const to = targetRef.current;
    const cur = currentRef.current;
    cur.speed = lerp(from.speed, to.speed, transElapsed);
    cur.coreIntensity = lerp(from.coreIntensity, to.coreIntensity, transElapsed);
    cur.warmShift = lerp(from.warmShift, to.warmShift, transElapsed);
    cur.brightBoost = lerp(from.brightBoost, to.brightBoost, transElapsed);
    // Apply external coreIntensity override (used by onboarding declaration stage)
    if (coreOverrideRef.current !== null) cur.coreIntensity = coreOverrideRef.current;
    cur.layers = to.layers;

    const w = canvas.width, h = canvas.height;
    const cxC = w / 2, cyC = h / 2;
    const depthLayers = cur.layers;
    const t = (time - startRef.current) * 0.001 * cur.speed;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.4);

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = (px - cxC) / (w * 0.4);
        const dy = (py - cyC) / (h * 0.4);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1.2) continue;

        const angle = Math.atan2(dy, dx);
        let r = 0, g = 0, b = 0;

        for (let layer = 0; layer < depthLayers; layer++) {
          const layerDepth = layer / depthLayers;
          const spiralAngle = angle + dist * (4 + layer * 1.5) - t * (0.15 + layer * 0.08);
          const layerDist = dist * (1 + layerDepth * 0.5);

          const sx = Math.cos(spiralAngle) * layerDist;
          const sy = Math.sin(spiralAngle) * layerDist;

          const n = fbm(sx * 3 + layer * 2, sy * 3, layer * 50, fbmOctaves);

          const layerBright = Math.pow(Math.max(0, 1 - dist), 0.8 + layerDepth * 0.5) * (0.4 - layerDepth * 0.05);
          const armStrength = Math.pow(Math.max(0, n - 0.3), 1.2) * 3;

          if (layer < Math.floor(depthLayers * 0.33)) {
            r += (60 + armStrength * 80) * layerBright;
            g += (20 + armStrength * 40) * layerBright;
            b += (140 + armStrength * 60) * layerBright;
          } else if (layer < Math.floor(depthLayers * 0.66)) {
            r += (80 + armStrength * 60) * layerBright;
            g += (40 + armStrength * 80) * layerBright;
            b += (180 + armStrength * 40) * layerBright;
          } else {
            r += (160 + armStrength * 80) * layerBright;
            g += (80 + armStrength * 60) * layerBright;
            b += (200 + armStrength * 50) * layerBright;
          }
        }

        // Warm shift (alert state — gold core)
        if (cur.warmShift > 0) {
          const wc = Math.pow(Math.max(0, 1 - dist * 1.3), 1.8);
          r += wc * 140 * cur.warmShift;
          g += wc * 90 * cur.warmShift;
          b *= (1 - cur.warmShift * 0.35);
        }

        // Core vortex (white-hot center)
        const coreBright = Math.pow(Math.max(0, 1 - dist * 1.8), 3) * cur.coreIntensity;
        r += coreBright * (255 + cur.brightBoost) * (0.85 + pulse * 0.15);
        g += coreBright * (240 + cur.brightBoost * 0.6) * (0.85 + pulse * 0.15);
        b += coreBright * 255 * (0.85 + pulse * 0.15);

        // Depth rings (3 concentric)
        for (let ring = 1; ring <= 3; ring++) {
          const ringR = ring * 0.22;
          const ringDist = Math.abs(dist - ringR);
          if (ringDist < 0.03) {
            const ringBright = (1 - ringDist / 0.03) * 0.15;
            r += 140 * ringBright;
            g += 120 * ringBright;
            b += 200 * ringBright;
          }
        }

        // Edge alpha fade
        let alpha = 255;
        if (dist > 0.95) alpha = Math.max(0, (1.2 - dist) / 0.25 * 255);

        const idx = (py * w + px) * 4;
        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, g);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = alpha;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    animRef.current = requestAnimationFrame(draw);
  }, [fbmOctaves]);

  // Start/stop animation loop
  useEffect(() => {
    // Initialize target on mount
    const params = STATE_PARAMS[state] || STATE_PARAMS.idle;
    currentRef.current = { ...params, layers: Math.min(params.layers, maxLayers) };
    targetRef.current = { ...currentRef.current };
    transFromRef.current = { ...currentRef.current };
    transStartRef.current = performance.now();
    startRef.current = null;

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, maxLayers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      width={sizeConfig.canvas}
      height={sizeConfig.canvas}
      style={{
        width: sizeConfig.display,
        height: sizeConfig.display,
        imageRendering: "auto",
        display: "block",
        ...style,
      }}
    />
  );
}
