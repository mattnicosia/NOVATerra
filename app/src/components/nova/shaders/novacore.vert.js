// NOVACORE vertex shader v13 — phase-transition topology
// "NOVACORE's visual identity is not a sphere. It's a phase transition."
//
// Mod noise crystallization (IQ + Patricio):
//   fract(rawNoise * layers) creates terraced strata from smooth FBM.
//   mix(smooth, crystal, uCrystallize) blends between fluid plasma and faceted crystal.
//   The form oscillates perpetually — supercooled plasma on the edge of crystallizing.
//
// v13 (IQ): Hierarchical crystallization — two fract() layers:
//   Primary (uCrystalLayers): fine grain strata (6-12 divisions)
//   Secondary (uCrystalLayers * 0.25): tectonic plates (1-3 large divisions)
//   Two varyings (vCrystalRaw, vCrystalRaw2) drive hierarchical edge detection in fragment.
//
// Temporal layers (Hodgin):
//   1. Geological crystallize drift (2-3 min) — base form slowly evolves
//   2. State-driven crystallize (instant) — thinking adds crystal, idle relaxes
//   3. Crystal grain drift (40-60s) — facet density shifts independently
//   4. Pulse/exhale crystal shatter — momentary dramatic faceting
//   5. Frost event (random 45-90s) — stochastic flash-freeze + slow melt

export const novacoreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uPulse;
  uniform float uExhale;
  uniform float uNoiseScale;
  uniform float uSize;
  uniform float uCrystallize;    // 0 = fluid plasma, 1 = fully crystalline
  uniform float uCrystalLayers;  // facet density: 2 = tectonic plates, 12 = fine grain

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying float vDisplacement;
  varying float vFresnel;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vCrystalRaw;     // raw crystal value for fragment edge detection (fine grain)
  varying float vCrystalRaw2;    // secondary tectonic-scale crystal for hierarchical edges (IQ)

  // ── Simplex 3D noise ──────────────────────────────────────────────
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

  // ── FBM ─────────────────────────────────────────────────────────
  float fbm4(vec3 p) {
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p * f);
      f *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosition = position;

    // ── v11: NOVA = perfect sphere, CORE = volcanic surface ──────
    float speed = mix(0.12, 0.30, uMorph);
    // NOVA: ZERO displacement — perfect sphere. CORE: volcanic topology.
    float amplitude = mix(0.0, 0.18, uMorph);
    amplitude += uPulse * 0.08;
    float exhaleScale = 1.0 + uExhale * 0.15;

    // ── Domain-warped displacement ───────────────────────────────
    vec3 noisePos = position * uNoiseScale;
    float t = uTime * speed;

    // Warp layer q
    float qx = fbm4(noisePos + vec3(0.0) + vec3(t * 0.7));
    float qy = fbm4(noisePos + vec3(5.2, 1.3, 2.8) + vec3(t * 0.55));
    vec2 q = vec2(qx, qy);

    // NOVA: near-zero warp on displacement (perfect sphere). CORE: volcanic.
    float warp = mix(0.3, 3.8, uMorph);
    float rawNoise = fbm4(noisePos + warp * vec3(q, 0.0) + vec3(t * 0.3));

    // ── Mod noise crystallization (IQ + Patricio) ──────────────
    // fract() creates terraced strata from smooth noise — sharp facet boundaries
    // Patricio: "Supercooled plasma on the edge of crystallizing."
    //
    // v13 (IQ): Hierarchical crystallization — two fract() layers:
    //   Primary: uCrystalLayers frequency → fine grain (6-12 strata)
    //   Secondary: uCrystalLayers * 0.25 → tectonic plates (1-3 large divisions)
    //   Large plates with fine grain nested inside. Like real crystal growth.
    float smoothDisp = rawNoise;
    float crystalFine = fract(rawNoise * uCrystalLayers);            // fine grain
    float crystalTectonic = fract(rawNoise * uCrystalLayers * 0.25); // tectonic plates
    float crystalDisp = crystalFine * 0.55 + crystalTectonic * 0.45; // hierarchical blend
    float baseDisp = mix(smoothDisp, crystalDisp, uCrystallize);

    // Crystal also adds subtle displacement even at NOVA (smooth sphere)
    // so the faceting is visible as surface perturbation, not just texture
    float crystalMinAmp = uCrystallize * 0.025;
    float displacement = baseDisp * (amplitude + crystalMinAmp);

    // Pass raw crystal values to fragment for edge specular detection
    vCrystalRaw = rawNoise * uCrystalLayers * uCrystallize;
    vCrystalRaw2 = rawNoise * uCrystalLayers * 0.25 * uCrystallize;

    // CORE: gentle extra turbulence (not chaotic)
    float turb1 = snoise(position * uNoiseScale * 2.0 + vec3(t * 0.6, t * 0.3, t * 0.4));
    displacement += turb1 * 0.04 * uMorph;

    vDisplacement = displacement;

    // ── Apply displacement ───────────────────────────────────────
    vec3 displaced = position + normal * displacement;
    displaced *= exhaleScale;
    vLocalPos = displaced;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPos.xyz;

    // ── View direction in local space (for fragment raymarching) ──
    vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vViewDir = normalize(displaced - camLocal);

    // ── Fresnel ──────────────────────────────────────────────────
    vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
    vFresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
    vFresnel = pow(vFresnel, mix(2.5, 1.6, uMorph));

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;
