// GROUND FOG fragment shader — Atmospheric haze at floor level
//
// Paul Franklin: "In every Interstellar environment, there's atmospheric
// density. Even in space, the accretion disc had dust. The fog layer is
// what tells your brain this is a real place."
//
// Technique:
//   - Flat disc at floor level, rendered above the caustic floor
//   - Noise-driven opacity creates organic fog patches
//   - Thicker near the artifact (heat creates visible moisture/dust)
//   - Thinner at edges (dissipates into darkness)
//   - Color tinted by artifact light (NOVA blue / CORE amber)
//   - Animated drift — fog moves slowly, creating living atmosphere
//   - Fresnel edge fade — fog looks thicker when viewed at grazing angles

export const fogFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAwaken;
  uniform float uMorph;
  uniform float uInnerLight;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  // ── Value noise (3D) ──────────────────────────────────────────────
  float hash31(vec3 p) {
    vec3 q = fract(p * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  // ── Simple FBM (2 octaves) ────────────────────────────────────────
  float fbm2(vec3 p) {
    float v = 0.0;
    v += vnoise(p) * 0.6;
    v += vnoise(p * 2.1 + vec3(3.2, 1.7, 4.5)) * 0.4;
    return v;
  }

  void main() {
    float dist = length(vWorldPosition.xz);

    // ── 1. Fog density — noise-driven patches ───────────────────────
    // Two drifting noise layers at different speeds (Hodgin temporal)
    // Explicit vec3 construction (avoid vec3(vec2, float) driver issues)
    vec3 fogPos1 = vec3(vWorldPosition.x * 0.3, vWorldPosition.z * 0.3, uTime * 0.02);
    vec3 fogPos2 = vec3(vWorldPosition.x * 0.7 + 5.0, vWorldPosition.z * 0.7 + 3.0, uTime * 0.035);
    float fogNoise = fbm2(fogPos1) * 0.6 + fbm2(fogPos2) * 0.4;

    // Remap to create distinct patches (not uniform haze)
    float fogDensity = smoothstep(0.25, 0.65, fogNoise);

    // ── 2. Radial distribution — thicker near artifact ──────────────
    // Central concentration: thick under the artifact, thins outward
    float centralFog = exp(-dist * dist * 0.04);
    // Mid-ring fog: secondary band of fog at medium distance
    float midDist = dist - 4.0;
    float ringFog = exp(-midDist * midDist * 0.08) * 0.4;
    float radialMask = centralFog + ringFog;

    // ── 3. Edge fade — dissolves into darkness ──────────────────────
    float edgeFade = 1.0 - smoothstep(5.0, 9.0, dist);

    // ── 4. Viewing angle — thicker at grazing angles (Fresnel) ──────
    vec3 viewN = normalize(vViewDir);
    float viewAngle = abs(dot(viewN, vec3(0.0, 1.0, 0.0)));
    // Looking straight down: viewAngle ~ 1, fog thin
    // Looking across: viewAngle ~ 0, fog thick (more atmosphere)
    float angleFade = 0.3 + 0.7 * (1.0 - viewAngle);

    // ── 5. Combine ──────────────────────────────────────────────────
    float density = fogDensity * radialMask * edgeFade * angleFade;
    density *= uAwaken * uInnerLight;

    // ── 6. Color — tinted by artifact light ─────────────────────────
    // Paul Franklin: "Fog isn't grey — it's lit by whatever's in the room.
    // Under the tesseract, every particle of dust was a tiny mirror."
    vec3 novaFog = vec3(0.05, 0.04, 0.15);
    vec3 coreFog = vec3(0.15, 0.08, 0.03);
    vec3 color = mix(novaFog, coreFog, uMorph);

    // Lit fog near center — brighter where the light pool hits
    // Higher saturation for the illuminated zone
    vec3 novaLit = vec3(0.12, 0.10, 0.40);
    vec3 coreLit = vec3(0.40, 0.22, 0.06);
    vec3 litColor = mix(novaLit, coreLit, uMorph);
    float lightFalloff = exp(-dist * dist * 0.06);
    color = mix(color, litColor, lightFalloff);

    // ── 7. Output — visible atmospheric layer ─────────────────────
    // Paul Franklin: "If you can't see the fog, it's costing GPU for nothing."
    float alpha = density * 0.35;

    gl_FragColor = vec4(color, alpha);
  }
`;
