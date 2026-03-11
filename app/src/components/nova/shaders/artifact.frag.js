// ARTIFACT HOUSING fragment shader v2 — Film-quality obsidian shell
// "An orb from another planet that has these powers inside of it."
//
// v2 changes (Visual Board session):
//   - Micro-normal perturbation: visible conchoidal obsidian surface grain
//   - Domain-warped Voronoi: breaks spatial regularity, organic fracture paths
//   - Noise-modulated crack width: each segment varies thin↔wide (no uniform lines)
//   - Edge roughness injection: high-freq noise breaks clean Voronoi edges
//   - Sharper glow falloff: power curve concentrates light at crack center
//   - Amplified zone contrast: dramatic active/quiet difference
//   - Crushed blacks: deeper obsidian, wider tonal range
//   - Reduced micro-crack contribution: macro dominates, micro is subtle detail

export const artifactFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAwaken;
  uniform float uMorph;
  uniform float uInnerLight;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vFresnel;
  varying float vThickness;

  // ── 3D hash for Voronoi fractures ──────────────────────────────────
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  // ── Voronoi for fracture network ────────────────────────────────────
  // Returns vec2(F1, F2-F1) — F2-F1 = distance to cell boundary = fracture line
  vec2 voronoiFracture(vec3 p) {
    vec3 ic = floor(p);
    vec3 fc = fract(p);
    float F1 = 8.0, F2 = 8.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 nb = vec3(float(x), float(y), float(z));
      vec3 o = hash3(ic + nb);
      // Very slow drift — fractures shift over minutes
      o += 0.12 * sin(uTime * 0.004 + o * 6.28318);
      vec3 dv = nb + o - fc;
      float dist = dot(dv, dv);
      if (dist < F1) { F2 = F1; F1 = dist; }
      else if (dist < F2) { F2 = dist; }
    }
    return vec2(sqrt(F1), sqrt(F2) - sqrt(F1));
  }

  // ── Simplex noise ──────────────────────────────────────────────────
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

  // 2-octave FBM using proper simplex noise
  float shellFbm(vec3 p) {
    return 0.6 * snoise(p) + 0.4 * snoise(p * 2.1 + vec3(1.7, 2.3, 3.1));
  }

  void main() {
    // ── View direction ────────────────────────────────────────────────
    vec3 viewDir = normalize(vViewDir);

    // ── Patricio: Surface grain — conchoidal fracture micro-texture ──
    // Real obsidian has curved, shell-like fracture at micro scale.
    // Perturb fragment normal with high-frequency noise to create
    // visible surface grain under specular. This is the single biggest
    // change for material authenticity — flat plates → textured glass.
    float grainN1 = snoise(vLocalPos * 22.0 + vec3(3.1, 7.4, 1.9));
    float grainN2 = snoise(vLocalPos * 40.0 + vec3(8.2, 2.6, 5.3));
    // v2.2: reduced perturbation 0.07→0.04 — obsidian is glassy, not rough
    vec3 grainOffset = vec3(grainN1, grainN2, grainN1 * grainN2) * 0.04;
    vec3 perturbedNormal = normalize(vNormal + grainOffset);
    float NdotV = max(dot(perturbedNormal, viewDir), 0.0);

    // ── Obsidian base color ──────────────────────────────────────────
    // v2.2: Lightened from crushed blacks — sphere must read as an object
    // against the dark page background. Still very dark, but visible.
    vec3 obsidianBase = vec3(0.018, 0.016, 0.025);
    // Visible grain: conchoidal ripple shifts reflectance at micro scale
    float grainReflectance = 0.75 + 0.25 * (grainN1 * 0.6 + grainN2 * 0.4 + 0.5);
    // Tighter specular with grain modulation — glassy with texture
    // v2.2: 0.08 — visible glassy highlight without washing out obsidian
    float specular = pow(NdotV, 20.0) * 0.08 * grainReflectance;

    // ── Spatial hierarchy (Anadol) — amplified zone contrast ─────────
    float spatialZone = shellFbm(vLocalPos * 0.7 + uTime * vec3(0.004, 0.003, 0.005));
    spatialZone = spatialZone * 0.5 + 0.5;
    // Tighter smoothstep = sharper boundary = more dramatic contrast
    float zoneActivity = smoothstep(0.25, 0.55, spatialZone);

    // ── Dormant surface variation — visible geological texture ────────
    // Active zones: warmer, glassier. Quiet zones: cooler, more matte (stone).
    // Crushed values: quiet zones nearly invisible, active zones barely visible.
    vec3 warmObsidian = vec3(0.025, 0.022, 0.032);   // neutral — slight violet undertone
    vec3 coolObsidian = vec3(0.010, 0.012, 0.022);    // cool — deep blue-black
    obsidianBase = mix(coolObsidian, warmObsidian, zoneActivity);
    // v2.2: grain only modulates specular, not base color — obsidian is glassy
    obsidianBase *= 0.97 + 0.06 * grainReflectance;
    // Fresnel-based base lightening — edges slightly brighter, sells the sphere shape
    obsidianBase *= 1.0 + pow(vFresnel, 2.5) * 0.4;
    specular *= 0.5 + 0.5 * zoneActivity;

    // ── Stress-concentration detection (Patricio) ─────────────────────
    float dTdx = dFdx(vThickness);
    float dTdy = dFdy(vThickness);
    float thicknessGradient = length(vec2(dTdx, dTdy));
    float stressConcentration = smoothstep(0.02, 0.25, thicknessGradient);

    // ── Domain-warped Voronoi fractures (IQ) ────────────────────────
    // Domain warping breaks Voronoi regularity — organic, asymmetric fracture paths.
    // Without this, cells are too uniform = "hex grid" feel = cartoonish.
    vec3 warp = vec3(
      snoise(vLocalPos * 1.8 + vec3(0.0, 4.0, 8.0)),
      snoise(vLocalPos * 1.8 + vec3(4.0, 8.0, 0.0)),
      snoise(vLocalPos * 1.8 + vec3(8.0, 0.0, 4.0))
    ) * 0.18;
    vec3 warpedPos = vLocalPos + warp;

    // Two scales: macro (tectonic plates) + micro (surface craze, subdued)
    // v2.1: 2.5→1.6 macro = fewer, grander plates. 7.5→4.5 micro = less busy.
    vec2 macroFrac = voronoiFracture(warpedPos * 1.6);
    vec2 microFrac = voronoiFracture(warpedPos * 4.5 + vec3(5.1, 2.3, 8.7));

    // ── Per-plate identity (IQ) ──────────────────────────────────────
    float plateId = fract(macroFrac.x * 7.31);
    float plateEmissionMod = 0.65 + 0.7 * plateId;  // wider range: 0.65–1.35
    float plateAwakenOffset = (plateId - 0.5) * 0.14;  // wider timing spread

    // ── Edge roughness — break clean Voronoi lines (Hodgin) ──────────
    // High-frequency noise injected INTO the distance field before smoothstep.
    // This makes every fracture edge jagged, tapering, organic — never laser-cut.
    float edgeJitter = snoise(vLocalPos * 40.0 + vec3(2.7, 9.1, 4.3)) * 0.02;

    // ── Noise-modulated crack width (IQ) ─────────────────────────────
    // Each crack segment varies between hair-thin and wide.
    // Uniform width = drawn line = cartoonish. Varying width = natural fracture.
    float widthNoise = snoise(vLocalPos * 5.5 + vec3(1.1, 3.3, 5.5)) * 0.5 + 0.5;
    widthNoise = 0.25 + 1.75 * widthNoise;  // range: 0.25× to 2.0× — hair-thin to wide gash

    // Fresnel compensation: fractures thin at glancing angles due to foreshortening
    float fresnelWidth = 0.7 + 0.3 * vFresnel;

    // Macro edge with roughness + variable width + power curve for hot-center falloff
    float macroRaw = macroFrac.y + edgeJitter;
    float macroEdge = 1.0 - smoothstep(0.0, 0.065 * fresnelWidth * widthNoise, macroRaw);
    // v2.2: pow 2.0 — hot center with enough width to read at 260px page scale
    macroEdge = pow(macroEdge, 2.0);

    // Micro edge — much more subtle, barely visible (just texture detail)
    float microRaw = microFrac.y + edgeJitter * 0.4;
    float microEdge = 1.0 - smoothstep(0.0, 0.04 * fresnelWidth, microRaw);
    microEdge = pow(microEdge, 2.5);  // sharp falloff — thin bright core only

    // Combined fracture — macro carries the dormant state entirely.
    // v2.2: micro-cracks GATED behind awakening — they fade in during mid-awakening
    // only in active zones. At dormant (awaken<0.3), surface is pure macro plates.
    float microGate = smoothstep(0.25, 0.55, uAwaken);
    float fracture = macroEdge + microEdge * 0.08 * microGate * (0.1 + 0.9 * zoneActivity);

    // ── Plate interior crystalline detail (Anadol) ───────────────────
    float microDetailPhase = smoothstep(0.15, 0.45, uAwaken) * (1.0 - smoothstep(0.7, 1.0, uAwaken));
    float crystalNoise1 = snoise(vLocalPos * 12.0 + vec3(9.1, 3.7, 6.4) + uTime * vec3(0.008, 0.006, 0.01));
    float crystalNoise2 = snoise(vLocalPos * 18.0 + vec3(2.3, 8.1, 4.9));
    float crystalNoise1Mod = mix(crystalNoise1, fract(crystalNoise1 * 6.0), microDetailPhase * 0.6);
    float crystalNoise2Mod = mix(crystalNoise2, fract(crystalNoise2 * 8.0), microDetailPhase * 0.5);
    float crystalVeins = 1.0 - smoothstep(0.0, 0.15, abs(crystalNoise1Mod));
    float crystalDetail = 1.0 - smoothstep(0.0, 0.1, abs(crystalNoise2Mod));
    float plateInterior = 1.0 - fracture;
    float microDetail = (crystalVeins * 0.6 + crystalDetail * 0.4) * plateInterior * microDetailPhase;

    // ── Thickness-based transmission ─────────────────────────────────
    float thinness = 1.0 - vThickness;

    // ── Transmission color ──────────────────────────────────────────
    vec3 novaTransmit = vec3(0.06, 0.12, 0.60);   // deeper blue — less saturated
    vec3 coreTransmit = vec3(0.50, 0.16, 0.03);    // warm amber-red
    vec3 transmitColor = mix(novaTransmit, coreTransmit, uMorph);

    // SSS rim shift (Patricio)
    vec3 sssWarmShift = transmitColor * vec3(1.3, 0.85, 0.6);
    transmitColor = mix(transmitColor, sssWarmShift, vFresnel * 0.2);

    // ── Awaken-driven transmission ──────────────────────────────────
    float fracGlow = fracture * thinness;
    float fracPhase = smoothstep(0.0, 0.3, uAwaken);

    float thicknessDelay = vThickness * 0.25;
    float zoneDelay = (1.0 - zoneActivity) * 0.15;
    float combinedDelay = thicknessDelay + zoneDelay + plateAwakenOffset;

    float cascadeWidth = 0.3 + vThickness * 0.2;
    float thinPhase = smoothstep(0.2 + combinedDelay, 0.2 + combinedDelay + cascadeWidth, uAwaken);

    float transCascade = 0.4 + vThickness * 0.15;
    float transPhase = smoothstep(0.5 + combinedDelay * 0.5, 0.5 + combinedDelay * 0.5 + transCascade, uAwaken);

    float transmission = 0.0;

    // ── Dormant breathing (Hodgin) ──────────────────────────────────
    float breathPrimary = 0.65 + 0.35 * sin(uTime * 0.42);
    float breathSecondary = 0.85 + 0.15 * sin(uTime * 1.1);
    float dormantBreath = breathPrimary * breathSecondary;
    float breathInfluence = 1.0 - smoothstep(0.0, 0.35, uAwaken);

    float dormantGlow = smoothstep(0.35, 0.75, fracGlow) * 0.07;
    dormantGlow *= mix(1.0, dormantBreath, breathInfluence);
    dormantGlow *= 0.3 + 0.7 * zoneActivity;  // amplified quiet/active contrast
    dormantGlow *= 1.0 + stressConcentration * 0.3;
    transmission += dormantGlow;

    // ── Pre-awakening flicker (Hodgin) ──────────────────────────────
    float flickerEnvelope = smoothstep(0.04, 0.08, uAwaken) * (1.0 - smoothstep(0.12, 0.22, uAwaken));
    float flicker1 = max(sin(uTime * 18.0), 0.0);
    float flicker2 = max(sin(uTime * 25.0 + 1.3), 0.0);
    float flicker3 = max(sin(uTime * 11.0 + 2.7), 0.0);
    float flickerPulse = flicker1 * flicker2 + flicker3 * 0.3;
    flickerPulse = clamp(flickerPulse, 0.0, 1.0);
    float flickerGlow = flickerEnvelope * flickerPulse * fracture * thinness * 0.25;
    transmission += flickerGlow;

    // Fracture phase — amplified zone contrast
    float zonedFracGlow = fracGlow * (0.35 + 0.65 * zoneActivity);
    transmission += zonedFracGlow * fracPhase * 0.55;

    // Thin phase
    transmission += thinness * thinPhase * 0.35;

    // Micro-detail transmission
    transmission += microDetail * thinness * 0.20;

    // Alive phase
    transmission += transPhase * 0.55;

    // ── Spatially-varying inner light (IQ) ──────────────────────────
    vec3 innerSamplePos = normalize(vLocalPos) * 0.8;
    float innerBrightness = snoise(innerSamplePos * 2.0 + uTime * vec3(0.015, 0.012, 0.02));
    innerBrightness = 0.65 + 0.35 * innerBrightness;  // broader variation
    float spatialInnerLight = uInnerLight * innerBrightness;

    transmission *= spatialInnerLight;
    transmission = clamp(transmission, 0.0, 1.0);

    // ── Fresnel rim ─────────────────────────────────────────────────
    float rimDarken = 1.0 - pow(vFresnel, 2.0) * 0.65;
    transmission *= rimDarken;

    float rimPulse = mix(1.0, 0.7 + 0.3 * dormantBreath, breathInfluence);
    // v2.2: dramatically stronger rim — creates visible sphere silhouette at page scale
    // Two-band Fresnel: sharp edge (pow 5) for silhouette + broad haze (pow 2) for volume
    float rimSharp = pow(vFresnel, 5.0) * 0.14;     // bright edge line
    float rimBroad = pow(vFresnel, 2.0) * 0.035;     // subtle volume haze
    float rimLight = (rimSharp + rimBroad) * (1.0 - transPhase * 0.5) * rimPulse;

    // ── Compose ─────────────────────────────────────────────────────
    // v2.1: cool-tinted specular — obsidian reflects blue-violet, not white
    vec3 surfaceColor = obsidianBase + specular * vec3(0.7, 0.75, 1.0);
    surfaceColor += rimLight * vec3(0.4, 0.45, 0.5);

    // Fracture emission — sharper, concentrated at crack center (power curve already applied)
    float fracEmission = fracture * fracPhase * spatialInnerLight * 0.95;
    fracEmission *= 0.3 + 0.7 * zoneActivity;  // more dramatic quiet suppression
    fracEmission *= plateEmissionMod;
    fracEmission *= 1.0 + stressConcentration * 0.6;

    // Stress-shifted color: hotter at stress boundaries → desaturate toward white
    vec3 stressColor = mix(transmitColor, vec3(1.0), stressConcentration * 0.22);
    vec3 fracColor = stressColor * 1.6 * fracEmission;

    vec3 stressTransmitColor = mix(transmitColor, vec3(0.85), stressConcentration * 0.12);
    vec3 transmittedLight2 = stressTransmitColor * transmission * 1.8;

    vec3 finalColor = surfaceColor + transmittedLight2 + fracColor;

    // ── Alpha ───────────────────────────────────────────────────────
    float baseAlpha = 1.0 - transPhase * 0.72;
    float fracAlpha = fracture * fracPhase * 0.25;
    float alpha = clamp(baseAlpha - fracAlpha, 0.08, 1.0);
    float thicknessAlphaBoost = thinness * thinPhase * 0.28;
    float thickResist = vThickness * smoothstep(0.3, 0.7, uAwaken) * (1.0 - transPhase) * 0.08;
    alpha -= thicknessAlphaBoost;
    alpha += thickResist;
    alpha -= microDetail * 0.12;
    alpha -= thinness * transPhase * 0.15;
    alpha = clamp(alpha, 0.06, 1.0);

    // ── Soft energy capping (IQ) ────────────────────────────────────
    finalColor = finalColor / (1.0 + finalColor * 0.3);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
