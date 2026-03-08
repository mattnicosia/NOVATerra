// ARTIFACT HOUSING vertex shader — The dark shell containing NOVA/CORE
// Obsidian-like outer surface with subsurface light transmission
// The Artifact: an ancient container, light fights to escape

export const artifactVertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAwaken;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vFresnel;
  varying float vThickness;

  // Simplex noise for shell thickness variation (fracture lines)
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vLocalPos = position;
    vViewDir = cameraPosition - worldPos.xyz;

    // Fresnel for rim effects
    vec3 viewDirN = normalize(vViewDir);
    vFresnel = 1.0 - max(dot(viewDirN, vNormal), 0.0);

    // Shell thickness variation — creates fracture lines where light escapes
    // Low-frequency Voronoi-like pattern: thin regions = fractures
    float thickNoise1 = snoise(position * 2.2 + uTime * vec3(0.008, 0.006, 0.01));
    float thickNoise2 = snoise(position * 4.8 + vec3(3.1, 7.2, 1.4) + uTime * vec3(0.012, 0.009, 0.014));

    // v14: Crystalline intermediate state — fract() terracing during mid-awakening.
    // Peaks at uAwaken 0.3–0.6: obsidian fractures into discrete crystalline plates
    // before dissolving to transparency. The material doesn't just fade — it shatters.
    float crystPhase = smoothstep(0.15, 0.35, uAwaken) * (1.0 - smoothstep(0.55, 0.85, uAwaken));
    float crystLayers = 5.0;
    thickNoise1 = mix(thickNoise1, fract(thickNoise1 * crystLayers) / crystLayers, crystPhase * 0.7);
    thickNoise2 = mix(thickNoise2, fract(thickNoise2 * crystLayers * 1.5) / (crystLayers * 1.5), crystPhase * 0.5);

    // Combine: broad thin regions + finer fracture detail
    float thickBase = 0.5 + 0.35 * thickNoise1 + 0.15 * thickNoise2;
    vThickness = clamp(thickBase, 0.0, 1.0);

    // Organic vertex displacement — breaks perfect sphere silhouette.
    // The Artifact is ancient, weathered. Not a manufactured sphere.
    // Very subtle: ±1.5% of radius. Enough to kill geometric perfection.
    float dispNoise = snoise(position * 3.5 + uTime * vec3(0.004, 0.003, 0.005));
    float dispAmount = dispNoise * 0.015 * (1.0 - uAwaken * 0.5);  // slightly less at alive

    // ── Hodgin: Geometric breathing ──────────────────────────────────
    // The monolith physically swells and contracts on a slow breath cycle.
    // Two overlapping frequencies (matching fragment shader breath):
    //   Primary: ~6.4s cycle (0.42 Hz) — the main breath
    //   Secondary: ~5.7s cycle (1.1 Hz) — subtle flutter
    // ±0.2% of radius. Imperceptible consciously, but the subconscious
    // registers it: "this thing is alive."
    // Fades out as awaken increases — at alive, the shell is static/yielding.
    float breathPrimary = sin(uTime * 0.42);         // -1 to +1
    float breathSecondary = sin(uTime * 1.1) * 0.3;  // smaller flutter
    float breathCombined = breathPrimary + breathSecondary;
    float breathInfluence = 1.0 - smoothstep(0.0, 0.35, uAwaken);
    float geometricBreath = breathCombined * 0.002 * breathInfluence;  // ±0.2% radius

    vec3 displaced = position + normal * (dispAmount + geometricBreath);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
