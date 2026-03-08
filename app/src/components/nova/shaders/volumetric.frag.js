// VOLUMETRIC LIGHT SHAFT fragment shader — Visible atmospheric column
//
// Paul Franklin: "In Interstellar, the tesseract wasn't just geometry — it was
// light telling you about gravity. Every volumetric element should reveal
// something about the energy source."
//
// Technique:
//   - Render on a cone/frustum mesh (wider at floor, narrow at artifact)
//   - DoubleSide + AdditiveBlending = soft volumetric glow
//   - Volume depth = abs(dot(viewDir, cylinderNormal))
//     → bright where you look through the most volume (center)
//     → dark at the edges (tangent viewing angle)
//   - Noise-driven wisps that drift upward (heat convection)
//   - Color morphs NOVA violet → CORE amber
//   - Intensity scales with uAwaken × uInnerLight (no light when dormant)

export const volumetricFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAwaken;
  uniform float uMorph;
  uniform float uInnerLight;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  // ── Value noise (3D) ────────────────────────────────────────────────
  // Lighter than simplex — sufficient for atmospheric wisps
  float hash31(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    // ── 1. Volume depth approximation ───────────────────────────────
    // Cylinder outward normal (radial direction in XZ plane)
    vec3 cylNormal = normalize(vec3(vLocalPosition.x, 0.0, vLocalPosition.z));
    // View direction: from surface point toward camera
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    // How much volume does this viewing ray traverse?
    // Parallel to normal = looking through full diameter = brightest
    // Perpendicular to normal = tangent = darkest
    float volumeDepth = abs(dot(viewDir, cylNormal));
    volumeDepth = pow(volumeDepth, 0.5); // wider glow, softer falloff

    // ── 2. Vertical fade — soft edges, brighter near artifact ───────
    float h = vUv.y;
    // Gentle bottom fade — light visibly spreads at the floor
    // Paul Franklin: "In Interstellar, you always saw where the light landed."
    float vertFade = smoothstep(0.0, 0.06, h) * smoothstep(1.0, 0.65, h);
    // Height-based brightness: brighter near artifact, dimmer near floor
    float heightBrightness = 0.5 + 0.5 * h;
    // Floor bloom — slight brightness increase where shaft meets ground
    float floorBloom = exp(-h * h * 80.0) * 0.3;
    heightBrightness += floorBloom;

    // ── 3. Noise — slowly drifting wisps of illuminated dust ────────
    // Upward drift: subtract time from Y → wisps rise like heat
    float n1 = vnoise(vWorldPosition * 0.9 + vec3(0.0, -uTime * 0.12, 0.0));
    float n2 = vnoise(vWorldPosition * 2.0 + vec3(uTime * 0.05, -uTime * 0.2, uTime * 0.07));
    // Slower geological variation (Hodgin temporal layer)
    float n3 = vnoise(vWorldPosition * 0.4 + vec3(uTime * 0.01, 0.0, -uTime * 0.015));
    float noiseMod = 0.3 + 0.7 * (n1 * 0.4 + n2 * 0.35 + n3 * 0.25);

    // ── 4. Combine density ──────────────────────────────────────────
    float density = volumeDepth * vertFade * noiseMod * heightBrightness;
    density *= uAwaken * uInnerLight;

    // ── 5. Color — NOVA deep violet → CORE warm amber ───────────────
    vec3 novaColor = vec3(0.14, 0.08, 0.55);
    vec3 coreColor = vec3(0.55, 0.28, 0.05);
    vec3 color = mix(novaColor, coreColor, uMorph);

    // Brighten the core of the shaft — hot center column
    float coreBrightness = pow(volumeDepth, 2.0) * 0.4;
    color += vec3(coreBrightness) * mix(vec3(0.3, 0.2, 0.8), vec3(0.9, 0.5, 0.1), uMorph);

    // HDR hot spot near the artifact (top of shaft)
    float hotSpot = pow(h, 3.0) * pow(volumeDepth, 3.0) * 0.5;
    color += vec3(hotSpot) * mix(vec3(0.5, 0.4, 1.0), vec3(1.0, 0.7, 0.2), uMorph);

    // ── 6. Output — visible atmospheric column ──────────────────────
    // Paul Franklin: "Volumetrics should feel like discovered atmosphere,
    // not painted effects. But they must be VISIBLE — invisible atmosphere
    // is just an invisible GPU cost."
    float alpha = density * 0.18;

    gl_FragColor = vec4(color * density * 2.5, alpha);
  }
`;
