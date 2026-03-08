// NOVACORE fragment shader v14 — KILL THE SWIRLS
// "NOVACORE's visual identity is not a sphere. It's a phase transition."
// NOVA: a blue star in deep space — dramatic limb darkening, blazing center,
// Voronoi convection cells, deep indigo edges dissolving into corona.
// CORE: amber fusion reactor — volcanic, turbulent, textured.
//
// v14: FRAGMENT-SIDE MOD-NOISE CRYSTALLIZATION
//   crystalize() quantization applied to ALL 7 continuous color systems:
//   domain warp outputs, flow blending, Voronoi drift, organic drift noise,
//   hue oscillation, volumetric interior, and crystal edge specular.
//   At crystal=0: smooth plasma (identical to v13). At crystal=1: fully faceted crystal.
//   Auto range raised to 0.18–0.60 — crystal character always somewhat visible.
//
// v13: VISUAL BOARD REFINEMENTS
//   IQ: Hierarchical fract() — two layers (fine grain + tectonic plates).
//   Anadol: Crystal edge specular modulated by quiet/singing spatial zones.
//   Hodgin: Stochastic frost events — flash-freeze moments at random 45-90s intervals.
//
// v12: MOD NOISE CRYSTALLIZATION (IQ + Patricio)
//   fract(rawNoise * layers) in vertex shader creates terraced strata.
//   Fragment detects facet boundaries via fwidth() → bright specular ridges.
//
// v11.8: Voronoi cells with 2-layer temporal drift (fast ~52s + slow ~3min).
// Spatial quiet/singing zones with deeper contrast (0.45 floor).
// Anti-violet guard ensures true blue, not purple.

export const novacoreFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uMorph;
  uniform float uPulse;
  uniform float uExhale;
  uniform float uIntensity;
  uniform float uVoice;
  uniform float uSize;
  uniform float uTier;

  uniform vec3 uNovaPalA;
  uniform vec3 uNovaPalB;
  uniform vec3 uNovaPalC;
  uniform vec3 uNovaPalD;
  uniform vec3 uCorePalA;
  uniform vec3 uCorePalB;
  uniform vec3 uCorePalC;
  uniform vec3 uCorePalD;

  uniform float uCrystallize;      // phase-transition state
  uniform float uCrystalLayers;    // facet density (v14: used in fragment crystallization)

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying float vDisplacement;
  varying float vFresnel;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  varying float vCrystalRaw;       // crystal value for edge detection (fine grain)
  varying float vCrystalRaw2;      // secondary tectonic-scale crystal (IQ hierarchical)

  // ── Simplex 3D noise ──────────────────────────────────────────
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

  float fbm4(vec3 p) {
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 4; i++) { v += a * snoise(p * f); f *= 2.0; a *= 0.5; }
    return v;
  }

  // Morph-adaptive FBM: 2 octaves at NOVA (smooth), 4 at CORE (detailed)
  // High-frequency octaves fade in with morph — no extra cost
  float fbmAdaptive(vec3 p) {
    float v = 0.5 * snoise(p) + 0.25 * snoise(p * 2.0);
    v += (0.125 * snoise(p * 4.0) + 0.0625 * snoise(p * 8.0)) * uMorph;
    return v;
  }

  float fbm2(vec3 p) {
    return 0.5 * snoise(p) + 0.25 * snoise(p * 2.0);
  }

  vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  // ── Crystallize helpers (v14) ─────────────────────────────────
  // Centered rounding: floor(val * levels + 0.5) / levels
  // Gated by uCrystallize — at 0: smooth pass-through, at 1: fully quantized.
  // Apply to EVERY continuous color pipeline input to kill swirls.
  float crystalize(float val, float levels) {
    float stepped = floor(val * levels + 0.5) / levels;
    return mix(val, stepped, uCrystallize);
  }
  vec3 crystalizeVec3(vec3 val, float levels) {
    vec3 stepped = floor(val * levels + 0.5) / levels;
    return mix(val, stepped, uCrystallize);
  }

  // ── 3D hash (IQ) ──────────────────────────────────────────────
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }

  // ── 3D Voronoi with 2-layer temporal cell evolution (IQ + Hodgin) ──
  // Returns vec3(F1, F2−F1 edge, cell ID [0,1])
  // v11.8: Two temporal layers (Hodgin: "multi-speed = living, single-speed = mechanical"):
  //   Layer 1: ±0.18 fast drift (~52s cycle, 0.12 Hz) — visible cell reshaping
  //   Layer 2: ±0.10 slow drift (~3 min cycle, 0.006 Hz) — geological migration
  // Combined ±0.25 max displacement: cells stretch, merge at boundaries, reform.
  // "Look away for 30 seconds, look back — the constellation has shifted."
  vec3 voronoi3d(vec3 p, float time) {
    vec3 ic = floor(p);
    vec3 fc = fract(p);
    float F1 = 8.0, F2 = 8.0, id = 0.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 nb = vec3(float(x), float(y), float(z));
      vec3 o = hash3(ic + nb);
      // Layer 1: fast convective drift (~52s period)
      // v14: Scale drift by crystallization — frozen constellation at crystal=1
      float driftScale = 1.0 - uCrystallize * 0.85;
      vec3 fastDrift = 0.18 * sin(time * 0.12 + o * 6.28318) * driftScale;
      // Layer 2: slow geological drift (~3 min period, phase-shifted per cell)
      vec3 slowDrift = 0.10 * sin(time * 0.006 + o.yzx * 6.28318 + vec3(1.7, 3.2, 5.1)) * driftScale;
      o += fastDrift + slowDrift;
      vec3 dv = nb + o - fc;
      float dist = dot(dv, dv);
      if (dist < F1) { F2 = F1; F1 = dist; id = dot(ic + nb, vec3(7.0, 157.0, 113.0)); }
      else if (dist < F2) { F2 = dist; }
    }
    float f1 = sqrt(F1);
    return vec3(f1, sqrt(F2) - f1, fract(sin(id) * 43758.5453));
  }

  // Domain warp — NOVA: gentle smooth flow, CORE: turbulent volcanic
  // Uses fbmAdaptive: 2 octaves at NOVA (smooth), 4 at CORE (detailed)
  vec3 domainWarp(vec3 p, float time) {
    float speed = mix(0.12, 0.30, uMorph);

    float qx = fbmAdaptive(p + vec3(0.0) + time * speed * 0.8);
    float qy = fbmAdaptive(p + vec3(5.2, 1.3, 2.8) + time * speed * 0.65);
    float qz = fbmAdaptive(p + vec3(2.1, 7.3, 4.2) + time * speed * 0.5);
    vec3 q = vec3(qx, qy, qz);

    // NOVA: near-zero warp = ultra-broad gradients. CORE: high warp = volcanic.
    float warpStr = mix(0.3, 4.0, uMorph);
    float rx = fbmAdaptive(p + warpStr * q + vec3(1.7, 9.2, 4.1) + time * speed * 0.4);
    float ry = fbmAdaptive(p + warpStr * q + vec3(8.3, 2.8, 7.4) + time * speed * 0.35);
    float rz = fbmAdaptive(p + warpStr * q + vec3(3.9, 6.1, 1.2) + time * speed * 0.45);
    vec3 r = vec3(rx, ry, rz);

    float pattern = fbmAdaptive(p + warpStr * r + time * speed * 0.25);
    return vec3(pattern, length(q), length(r));
  }

  vec3 domainWarpLight(vec3 p, float time) {
    float speed = mix(0.12, 0.30, uMorph);
    float qx = fbm2(p + vec3(0.0) + time * speed * 0.8);
    float qy = fbm2(p + vec3(5.2, 1.3, 2.8) + time * speed * 0.65);
    vec2 q = vec2(qx, qy);
    float warpStr = mix(0.5, 3.5, uMorph);
    float pattern = fbm2(p + warpStr * vec3(q, 0.0) + time * speed * 0.25);
    return vec3(pattern, length(q), 0.0);
  }

  void main() {
    // ── Palette interpolation ──────────────────────────────────
    float transitionFactor = 1.0 - abs(uMorph * 2.0 - 1.0);

    vec3 palA = mix(uNovaPalA, uCorePalA, uMorph);
    vec3 palB = mix(uNovaPalB, uCorePalB, uMorph);
    vec3 palC = mix(uNovaPalC, uCorePalC, uMorph);
    vec3 palD = mix(uNovaPalD, uCorePalD, uMorph);

    // ── Transition magenta guard ─────────────────────────────────
    // Mid-transition: NOVA blue + CORE amber interpolation creates
    // R-dominant peaks → magenta flash. Suppress R, boost B floor.
    palB.x *= (1.0 - transitionFactor * 0.50);  // halve R amp at mid-transition
    palA.z += transitionFactor * 0.10;           // raise B floor → always some blue
    palB.y *= (1.0 + transitionFactor * 0.25);   // boost G for teal transition tint

    // ── Color breathing — hue zones pulse wider/narrower ──────────
    // Slow palette amplitude oscillation → living, shifting saturation
    float colorBreathe = 0.92 + 0.08 * sin(uTime * 0.22);
    palB *= colorBreathe;

    // ── Domain warp ──────────────────────────────────────────
    // v11.5: NOVA: 0.65 creates 3-4 visible convection zones across the sphere face.
    // High enough for visible structure, low enough to stay broad (not "swirly lines").
    // CORE: higher frequency = tighter volcanic detail.
    float warpFreq = mix(0.65, 1.6, uMorph);
    vec3 warpResult = domainWarp(vPosition * warpFreq, uTime);
    float pattern = warpResult.x * 0.5 + 0.5;
    float qMag = warpResult.y;
    float rMag = warpResult.z;

    // v14: Quantize domain warp outputs — highest leverage crystallization.
    // These three values drive the ENTIRE color pipeline downstream.
    // At crystal=0: smooth flow. At crystal=1: terraced color zones.
    pattern = crystalize(pattern, uCrystalLayers * 1.5);
    qMag = crystalize(qMag, uCrystalLayers);
    rMag = crystalize(rMag, uCrystalLayers);

    // Detail noise — mostly CORE, very faint at NOVA
    float detailSpeed = mix(0.8, 1.5, uMorph);
    float detailAmount = uMorph * uMorph;  // morph² — near-zero at NOVA
    pattern += snoise(vPosition * 3.0 + uTime * detailSpeed) * mix(0.0, 0.08, detailAmount);
    pattern += snoise(vPosition * 6.0 + uTime * detailSpeed * 0.6) * 0.04 * detailAmount;
    pattern = clamp(pattern, 0.0, 1.0);

    // Slow hue drift
    float hueShift = sin(uTime * 0.10) * 0.05;
    vec3 palDShifted = palD + vec3(hueShift, hueShift * 0.7, hueShift * 1.3);

    // ══════════════════════════════════════════════════════════
    // v10: LIGHT SOURCE architecture
    // The sphere IS a source of light — it glows EVERYWHERE.
    // Color variation = HUE shifts across a luminous field.
    // NOVA: smooth violet plasma, all-over luminosity.
    // CORE: amber fusion reactor, dark cracks + eruptions OK.
    // ══════════════════════════════════════════════════════════

    // ── Fresnel ──────────────────────────────────────────────
    vec3 viewDirRaw = normalize(cameraPosition - vWorldPosition);
    float rawFresnel = 1.0 - max(dot(viewDirRaw, normalize(vNormal)), 0.0);
    float centerFactor = 1.0 - rawFresnel;

    // ── 1. BASE LUMINOUS GLOW — the sphere IS light ─────────
    // This is the minimum glow — even where flow patterns are at
    // their darkest, this color shines through. Light sources
    // don't have unlit patches.
    vec3 novaBaseGlow = vec3(0.02, 0.03, 0.14);   // v11.5: dimmer base — edges must go DARK
    vec3 coreBaseGlow = vec3(0.06, 0.03, 0.01);   // dim ember
    vec3 baseGlow = mix(novaBaseGlow, coreBaseGlow, uMorph);

    // Transition: inject teal to avoid gray blending
    vec3 transGlow = vec3(0.10, 0.20, 0.32);
    baseGlow += transGlow * transitionFactor * 0.25;

    float breathe = 0.92 + 0.08 * sin(uTime * 0.6 + 0.5);
    baseGlow *= breathe * uIntensity;

    // ── 2. FLOW COLOR — dual approach ─────────────────────────
    // NOVA: POSITION-BASED gradient (hemisphere-scale hue shifts = light source)
    // CORE: NOISE-BASED flow (domain-warped = volcanic texture)

    // === Noise-based flow color (used at high morph) ===
    vec3 palColor1 = max(iqPalette(pattern + hueShift, palA, palB, palC, palDShifted), vec3(0.0));
    vec3 palColor2 = max(iqPalette(qMag * 0.5 + 0.5, palA, palB, palC, palDShifted + vec3(0.18, 0.12, 0.08)), vec3(0.0));
    vec3 palColor3 = max(iqPalette(rMag * 0.4 + 0.2, palA, palB, palC, palDShifted + vec3(-0.10, 0.08, -0.12)), vec3(0.0));

    // v14: Step-approaching blending — smooth at crystal=0, hard at crystal=1
    float blendSmooth = smoothstep(0.3, 0.8, qMag);
    float blendHard = step(0.55, qMag);
    float blendFlow = mix(blendSmooth, blendHard, uCrystallize);
    vec3 noiseFlowColor = mix(palColor1, palColor2, blendFlow);
    float rBlendSmooth = smoothstep(0.4, 0.9, rMag) * 0.3;
    float rBlendHard = step(0.65, rMag) * 0.3;
    noiseFlowColor = mix(noiseFlowColor, palColor3, mix(rBlendSmooth, rBlendHard, uCrystallize));

    // Flow boundary brightening (CORE feature)
    float flowBoundary = 1.0 - smoothstep(0.0, mix(0.18, 0.05, uMorph), abs(qMag - rMag));
    noiseFlowColor += noiseFlowColor * flowBoundary * mix(0.02, 0.50, uMorph);

    // === Position-based smooth gradient (used at low morph) ===
    // Multi-hue light source: different sphere regions = genuinely different colors
    vec3 localDir = normalize(vPosition);
    float posAngle = (atan(localDir.z, localDir.x) + 3.14159) / 6.28318;
    float posElev = localDir.y * 0.5 + 0.5;

    // ── Organic color flow ──────────────────────────────────────
    // World-space angles drift independently as sphere rotates —
    // colors flow THROUGH the sphere like aurora on plasma.
    // Blend local (locked to geometry) + world (flowing) for organic movement.
    vec3 wDir = normalize(vWorldPosition);
    float worldAngle = (atan(wDir.z, wDir.x) + 3.14159) / 6.28318;
    float worldElev = wDir.y * 0.5 + 0.5;

    // NOVA: 35% world-space flow → gentle drift without seams. CORE: 0%
    float flowBlend = (1.0 - uMorph) * 0.35;
    float flowAngle = mix(posAngle, worldAngle, flowBlend);
    float flowElev = mix(posElev, worldElev, flowBlend * 0.7);

    // 2-layer organic noise drift — NOVA: ultra-low freq (broad zones), CORE: tighter
    float driftNoise1 = fbm2(wDir * mix(0.5, 1.5, uMorph) + uTime * vec3(0.038, 0.028, 0.048));
    float driftNoise2 = fbm2(wDir * mix(0.7, 2.2, uMorph) + uTime * vec3(-0.025, 0.042, -0.018) + vec3(3.7, 1.2, 5.8));
    // v14: Quantize drift noise — flowing aurora → discrete color zones that snap
    driftNoise1 = crystalize(driftNoise1, 4.0);
    driftNoise2 = crystalize(driftNoise2, 4.0);
    float organicDrift = (driftNoise1 * 0.28 + driftNoise2 * 0.18) * (1.0 - uMorph);

    // ── Streaming flow — broad directional color sweep ──────────
    // Very low-freq noise creates 1-2 visible color bands across sphere
    // Time drift gives directional movement → coherent streaming (Hodgin)
    float streamNoise = snoise(wDir * 0.5 + uTime * vec3(0.05, 0.018, 0.04));
    float curlStream = streamNoise * mix(0.10, 0.0, uMorph);

    // Position gradient — geometry at NOVA (smooth light), noise at CORE (volcanic)
    float patternInT = pattern * mix(0.01, 0.22, uMorph);  // v11: virtually zero at NOVA
    // Wide position span + organic drift + streaming + displacement→hue
    float dispHue = vDisplacement * mix(0.25, 0.04, uMorph);  // peaks = different hue (Patricio)

    // v11.5: Moderate spherical harmonics — subtle hue drift, NOT visible bands.
    // The noise flow (35% at NOVA) handles visible color zones organically.
    // Harmonics add gentle hemisphere-scale bias without creating edges.
    float angRad = flowAngle * 6.28318;
    float elevRad = flowElev * 3.14159;
    float novaAngBasis = sin(angRad) * 0.14
                       + cos(angRad) * 0.10
                       + sin(angRad * 2.0 + 1.3) * 0.05
                       + cos(angRad * 3.0 + 0.7) * 0.02;
    float novaElevBasis = sin(elevRad) * 0.18
                        + cos(elevRad * 2.0 + 0.9) * 0.08;
    float coreAngBasis = flowAngle * 0.80;
    float coreElevBasis = flowElev * 0.50;
    float angContrib = mix(novaAngBasis, coreAngBasis, uMorph);
    float elevContrib = mix(novaElevBasis, coreElevBasis, uMorph);
    // v11.1: Geological drift — ultra-slow T offset (Hodgin)
    // 2-3 minute cycle. You never see it moving, but look away and look back
    // and the entire sphere's palette position has shifted. "Living, not looping."
    float geologicalDrift = sin(uTime * 0.008) * 0.04
                          + sin(uTime * 0.013 + 2.1) * 0.025;
    geologicalDrift *= (1.0 - uMorph);  // NOVA only

    float smoothT = 0.5 + angContrib + elevContrib + patternInT + uTime * 0.025 + organicDrift + curlStream + dispHue + geologicalDrift;
    vec3 smoothFlowColor = max(iqPalette(smoothT, palA, palB, palC, palDShifted), vec3(0.0));
    // v11: Oscillation KILLED at NOVA (creates visible bands = "swirly lines").
    // CORE: enriches hue variety at fine scale.
    float oscAmount = uMorph * uMorph;  // morph² — zero at NOVA, full at CORE
    // v14: Step hue oscillation — each crystal facet picks a fixed hue
    float hueOscRaw = sin(flowAngle * 3.6 + flowElev * 2.8 + uTime * 0.12);
    float hueOscStepped = floor(hueOscRaw * 2.0 + 0.5) / 2.0;
    float hueOsc = mix(hueOscRaw, hueOscStepped, uCrystallize) * 0.08 * oscAmount;
    vec3 oscColor = max(iqPalette(smoothT + 0.32 + hueOsc, palA, palB, palC, palDShifted + vec3(0.03, 0.06, 0.02)), vec3(0.0));
    smoothFlowColor = mix(smoothFlowColor, oscColor, 0.22 * oscAmount);

    // === Blend: Always SOME noise for organic pattern. ===
    // v11.5: NOVA uses 60% noise flow — organic patterns dominate over angular position.
    // Domain-warped FBM creates irregular blob boundaries, not geometric bands.
    // The remaining 40% position-based adds gentle hemisphere-scale gradient.
    float noiseBlend = 0.60 + 0.40 * uMorph;  // NOVA: 60% noise, CORE: 100% noise
    vec3 flowColor = mix(smoothFlowColor, noiseFlowColor, noiseBlend);

    // Brightness modulation
    // v11.5: Lower floor + wider power → dramatic brightness variation.
    // Floor 0.10 → darkest convection cells reach 10% of center brightness.
    // Combined with aggressive limb darkening, creates genuine depth.
    float baseFloor = mix(0.10, 0.12, uMorph);
    float patternBright = pow(pattern, mix(0.50, 2.2, uMorph));
    float flowBright = baseFloor + (1.0 - baseFloor) * smoothstep(0.10, 0.95, patternBright);

    // Clamp flow color
    flowColor = clamp(flowColor, vec3(0.0), vec3(1.5));

    // ── Spatial saturation hierarchy — quiet zones + singing zones ──
    // Quiet zones: desaturated (calm monochrome blue). Singing: vivid multi-hue.
    // Light source stays BRIGHT everywhere — only COLOR RICHNESS varies (Anadol)
    float focusNoise = fbm2(wDir * mix(0.3, 0.8, uMorph) + uTime * vec3(0.015, 0.012, 0.018));
    // v11.1: Wider saturation contrast (Anadol) — quiet zones genuinely hushed,
    // singing zones intensely chromatic. With only 1-2 zones visible, needs more gap.
    float focusSat = 0.62 + 0.38 * (focusNoise * 0.5 + 0.5);  // 0.62 to 1.0
    focusSat = mix(focusSat, 1.0, uMorph * uMorph);  // CORE: full saturation
    float flowLuma = dot(flowColor, vec3(0.299, 0.587, 0.114));
    flowColor = mix(vec3(flowLuma), flowColor, focusSat);

    // v11.6: Granulation moved to post-volumetric (section 6b below).
    // Applied after volume composition so smooth interior doesn't wash out surface cells.
    flowBright = clamp(flowBright, 0.0, 1.3);

    // v10.5: Palette IS the light — strong expression, no competition
    float colorScale = 1.10;
    vec3 flowLight = flowColor * flowBright * colorScale;

    // ── 3. CENTER GLOW — palette-tinted, not white override ────
    // v11.5: Focused stellar core — hot but not blown-out.
    // pow(4.2) = tight hot spot (~25% of face). Combined with HDR, creates
    // concentrated bloom that shows body color in the mid-radius.
    float centerPow = mix(4.2, 5.0, uMorph) + transitionFactor * 2.0;
    float centerGlow = pow(centerFactor, centerPow);

    vec3 centerWhite = mix(
      vec3(0.60, 0.80, 1.0),   // v11.5b: blue-white for NOVA (minimal R)
      vec3(1.0, 0.90, 0.72),   // warm amber-white for CORE
      uMorph
    );
    vec3 centerPalette = max(iqPalette(0.78 + organicDrift * 0.5, palA, palB, palC, palDShifted), vec3(0.0));
    // v11.5: Center is HOT — mostly blue-white with palette tint.
    // More white = more "star core" impression. Less palette = hotter.
    vec3 centerColor = mix(
      centerPalette * 0.45 + centerWhite * 0.55,   // NOVA: 55% blue-white → HOT center
      centerWhite + centerPalette * 0.18,            // CORE: blazing white-hot
      uMorph
    );
    // v11.5: Maximum stellar center brightness. Combined with HDR boost (0.70),
    // the center pushes well above 1.0 → selective bloom kicks in → visible glow.
    float centerBrightness = mix(1.0, 0.95, uMorph) * breathe;
    vec3 centerLight = centerColor * centerGlow * centerBrightness;

    // ── 4. COMPOSE — additive light layers ──────────────────
    // v11.7: Stochastic limb edge — mod noise perturbs centerFactor before
    // the smoothstep limb darkening. Low scale (~2-3 cells around limb),
    // low amplitude (±0.04). The S-curve amplifies the perturbation into
    // visible brightness variation at the edge. (IQ + Patricio: "whisper, not scream")
    float limbNoise = snoise(vPosition * 2.8 + uTime * vec3(0.035, 0.025, 0.045));
    float limbPerturb = limbNoise * mix(0.04, 0.01, uMorph);  // NOVA: ±0.04, CORE: ±0.01
    float cfPerturbed = clamp(centerFactor + limbPerturb, 0.0, 1.0);

    // v11.5: SMOOTHSTEP limb darkening — stellar-quality center-to-edge falloff.
    // smoothstep gives a sharper S-curve: bright in inner 50%, rapid falloff to dark edge.
    // At cf=0.5: RG=86%, at cf=0.3: RG=44%, at cf=0.1: RG=6%.
    // Stochastic perturbation makes the falloff boundary irregular → alive, not geometric.
    float limbDarkenRG = mix(
      smoothstep(0.0, 0.60, cfPerturbed),              // NOVA: perturbed S-curve falloff
      0.80 + 0.20 * centerFactor,                       // CORE: mild (unperturbed)
      uMorph
    );
    float limbDarkenB = mix(
      0.05 + 0.95 * smoothstep(0.0, 0.50, cfPerturbed), // NOVA: perturbed B falloff
      0.82 + 0.18 * centerFactor,                         // CORE: mild (unperturbed)
      uMorph
    );
    vec3 limbDarkening3 = vec3(limbDarkenRG, limbDarkenRG, limbDarkenB);
    float flowFade = 1.0 - centerGlow * mix(0.15, 0.40, uMorph);
    vec3 baseColor = baseGlow + flowLight * flowFade * limbDarkening3 + centerLight;

    // v11.5: HDR center boost — focused stellar core bloom.
    // pow(cf, 2.2) = concentrated hot zone. 0.85 = strong but not blown-out.
    float hdrCenter = pow(centerFactor, 2.2) * mix(0.85, 0.0, uMorph);  // NOVA only
    baseColor *= 1.0 + hdrCenter;

    // Bridge — 2-layer gradient from center white → cool blue → rich color
    // Inner bridge: cool tinted glow (closer to center)
    float bridgeInner = pow(centerFactor, mix(5.0, 3.5, uMorph)) * (1.0 - centerGlow);
    vec3 innerBridgeColor = mix(
      vec3(0.08, 0.16, 0.50),  // v11.4: NOVA: cooler blue (reduced R from 0.14 → 0.08)
      vec3(0.28, 0.18, 0.06),  // CORE: pale amber
      uMorph
    );
    baseColor += innerBridgeColor * bridgeInner * 0.10;  // v10.5: cut flat light

    // Outer bridge: richer tint (further from center)
    float bridgeOuter = pow(centerFactor, mix(2.8, 2.2, uMorph)) * (1.0 - pow(centerFactor, mix(5.0, 3.5, uMorph)));
    vec3 outerBridgeColor = mix(
      vec3(0.08, 0.10, 0.32),  // NOVA: cool deeper blue (no warm R)
      vec3(0.18, 0.10, 0.02),  // CORE: deeper amber
      uMorph
    );
    baseColor += outerBridgeColor * bridgeOuter * 0.05;  // v10.5: minimal

    // ── 5. DISPLACEMENT modulation ──────────────────────────
    // NOVA: light source — displacement barely affects brightness
    // CORE: volcanic — deep cracks reveal darkness
    float dispLow = mix(-0.03, -0.18, uMorph);
    float dispHigh = mix(0.06, 0.26, uMorph);
    float dispFactor = smoothstep(dispLow, dispHigh, vDisplacement);
    float morphLate = smoothstep(0.5, 1.0, uMorph);

    float dispMod = mix(
      mix(0.95, 1.0, pow(dispFactor, 0.25)),    // NOVA: 0.95 floor, nearly invisible
      mix(0.05, 1.2, pow(dispFactor, 1.5)),      // CORE: 0.05 floor, deep cracks
      morphLate
    );
    // Protect center from displacement darkening
    float dispBlend = smoothstep(0.3, 0.8, centerGlow);
    baseColor *= mix(dispMod, 1.0, dispBlend);

    // ── 6. Volumetric raymarching (Tier 2, all morph) ──────────
    // v11: Enabled at NOVA for subtle depth — celestial bodies have visible depth
    if (uTier >= 1.5) {
      vec3 rayOrigin = vLocalPos;
      vec3 rayDir = normalize(vViewDir);
      vec4 volAccum = vec4(0.0);
      // NOVA: wider steps = broader, smoother interior glow. CORE: tighter = detailed.
      float stepSize = uSize * mix(0.12, 0.065, uMorph);

      for (int i = 0; i < 24; i++) {
        if (volAccum.a > 0.88) break;
        vec3 marchPos = rayOrigin + rayDir * (float(i + 1) * stepSize);
        float distFromCenter = length(marchPos);
        if (distFromCenter > uSize * 0.92) continue;

        // v11: NOVA: ultra-low freq → broad smooth depth glow. CORE: bubbly detail
        float volFreq = mix(0.25, 0.9, uMorph);
        vec3 warpSample = domainWarpLight(marchPos * volFreq, uTime);
        float density = warpSample.x * 0.5 + 0.5;
        float depthRatio = 1.0 - (distFromCenter / uSize);
        depthRatio = pow(depthRatio, mix(1.2, 0.7, uMorph));
        density *= depthRatio;

        float threshold = mix(0.20, 0.16, uMorph);  // NOVA: higher threshold → smoother
        if (density < threshold) continue;

        float remapped = (density - threshold) / (1.0 - threshold);
        // NOVA: depth-driven color (smooth), CORE: density-driven (textured)
        float volT = depthRatio * mix(0.65, 0.3, uMorph) + remapped * mix(0.15, 0.6, uMorph);
        // v14: Quantize volumetric interior — visible internal strata (looking into a geode)
        volT = crystalize(volT, 5.0);
        vec3 volColor = iqPalette(volT, palA, palB, palC, palDShifted);
        volColor = max(volColor, vec3(0.0));
        volColor *= 1.0 + depthRatio * mix(1.5, 2.8, uMorph);

        // White-hot inner core — subtle at NOVA, intense at CORE
        float coreHeat = smoothstep(0.45, 0.75, depthRatio * remapped);
        vec3 heatTint = mix(vec3(0.75, 0.80, 1.0), vec3(1.0, 0.92, 0.75), uMorph);
        volColor += heatTint * coreHeat * mix(0.30, 0.6, uMorph);

        float sampleAlpha = remapped * depthRatio * mix(0.08, 0.09, uMorph);
        volAccum += vec4(volColor * sampleAlpha, sampleAlpha) * (1.0 - volAccum.a);
      }

      float surfOp = smoothstep(0.0, 0.4, dispFactor) * 0.30;
      // v11.4: NOVA: visible subsurface depth (0.62). CORE: strong volcanic interior (0.95)
      // The volumetric interior creates the "look into the star" depth effect.
      // Higher contribution at NOVA makes the interior glow visible against darker limb.
      baseColor += volAccum.rgb * (1.0 - surfOp) * mix(0.62, 0.95, uMorph);
    }

    // ── 6a. Spatial zone hierarchy (Anadol) ─────────────────────────
    // Quiet zones: hushed, subdued. Singing zones: vivid, high-contrast.
    // Hoisted to main scope — used by Voronoi granulation AND crystal edge specular.
    float spatialZone = 0.45 + 0.55 * fbm2(normalize(vWorldPosition) * 0.6 + uTime * vec3(0.012, 0.009, 0.015));

    // ── 6b. POST-VOLUMETRIC VORONOI GRANULATION ──────────────────
    // v11.7: Voronoi cellular noise (IQ + Visual Board recommendation).
    // Real stellar granulation = Voronoi cells with bright upwelling centers
    // and dark intergranular lanes. Two scales: supergranulation (broad zones)
    // + granulation (visible cells). Temporal cell animation (Hodgin).
    {
      float granTime = uTime * mix(1.0, 0.0, uMorph);  // NOVA: animated. CORE: frozen.

      // Ultra-slow position drift — cells migrate across surface (geological, ~2min)
      vec3 driftPos = vPosition + uTime * vec3(0.006, 0.004, 0.008) * (1.0 - uMorph);

      // Supergranulation — 2-3 broad plasma upwelling zones across visible face
      vec3 sVor = voronoi3d(driftPos * 1.8, granTime);
      float sCenter = 1.0 - smoothstep(0.0, 0.48, sVor.x);   // bright centers
      float sEdge = 1.0 - smoothstep(0.0, 0.18, sVor.y);      // soft lane gradient (IQ)

      // Granulation — 6-8 smaller convection cells
      vec3 gVor = voronoi3d(driftPos * 4.5 + vec3(4.1, 2.3, 7.0), granTime);
      float gCenter = 1.0 - smoothstep(0.0, 0.38, gVor.x);   // bright centers
      float gEdge = 1.0 - smoothstep(0.0, 0.13, gVor.y);      // visible but soft lanes

      // Combine: additive blend, not max — avoids harsh intersections (Patricio)
      float cellBright = sCenter * 0.55 + gCenter * 0.45;
      float edgeDark = sEdge * 0.45 + gEdge * 0.35;
      float cellVar = mix(sVor.z, gVor.z, 0.4) * 0.10;  // per-cell variation

      // v11.8: Anadol spatial modulation — quiet vs singing zones.
      // "Some regions whisper, others sing — the contrast IS the drama." (Anadol)
      float granVis = spatialZone;

      // Granulation signal: bright cells vs dark intergranular lanes
      float granulation = ((cellBright * 2.0 - 1.0) * 0.24 + cellVar - edgeDark * 0.16) * (1.0 - uMorph) * granVis;

      // Mask: no granulation at blown-out center (HDR hides it)
      float granMask = smoothstep(0.0, 0.25, 1.0 - centerFactor);
      granulation *= granMask;

      // Brightness modulation
      baseColor *= 1.0 + granulation;

      // Temperature-coded color shift (Patricio: physically correct surface temps)
      // Bright cell centers → blue-white (hotter upwelling plasma)
      // Dark intergranular lanes → deep indigo (cooler sinking plasma)
      float granNorm = clamp(cellBright - edgeDark * 0.4 + 0.5, 0.0, 1.0);
      vec3 hotCell = vec3(0.03, 0.05, 0.06);      // blue-white (hot upwelling)
      vec3 coolLane = vec3(-0.01, -0.02, 0.01);    // deep indigo (cool downflow)
      vec3 granTempShift = mix(coolLane, hotCell, granNorm);
      baseColor += granTempShift * (1.0 - uMorph) * granMask * smoothstep(0.1, 0.5, centerFactor);
    }

    // ── 7. HDR peaks — NOVA: nearly invisible. CORE: explosive ──
    float hdrMask = smoothstep(mix(0.85, 0.76, uMorph), 0.96, pattern);
    vec3 hdrColor = max(iqPalette(mix(pattern * 0.5, pattern * 0.08, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += hdrColor * hdrMask * mix(0.04, 1.6, uMorph);
    // White-hot eruptions — CORE only
    float whiteHot = smoothstep(0.90, 0.98, pattern);
    baseColor += vec3(1.0, 0.96, 0.88) * whiteHot * mix(0.01, 1.2, uMorph);

    // ── 8. Energy veins — CORE only (morph² gating) ──────────
    float veins = abs(qMag - rMag);
    float veinMask = 1.0 - smoothstep(0.0, mix(0.06, 0.03, uMorph), veins);
    veinMask *= 0.7 + 0.3 * sin(uTime * 1.5 + warpResult.x * 6.0);
    vec3 veinColor = max(iqPalette(mix(0.7, 0.05, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += veinColor * veinMask * uMorph * uMorph * 0.65;

    // ── 9. Rim glow — v11.3: ZERO at NOVA, volcanic at CORE ────
    // Real stars have NO bright rim — just limb darkening into space.
    // NOVA: zero rim addition. CORE: volcanic eruption glow at edges.
    float rimGlow = pow(vFresnel, mix(4.0, 5.5, uMorph));
    vec3 rimColor = max(iqPalette(mix(0.55, 0.05, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += rimColor * rimGlow * uMorph * 0.75;  // zero at NOVA, full at CORE
    // Soft white-ish edge — CORE only
    float rimEdge = pow(vFresnel, mix(6.0, 8.0, uMorph));
    baseColor += vec3(1.0, 0.96, 0.92) * rimEdge * uMorph * 0.30;

    // ── 10. Pulse / Exhale / Voice ──────────────────────────
    vec3 pulseColor = max(iqPalette(mix(0.9, 0.05, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += pulseColor * uPulse * 0.35 + vec3(1.0, 0.95, 0.9) * uPulse * 0.15;
    baseColor += flowColor * uExhale * 0.12;
    baseColor += pulseColor * uVoice * 0.10;

    // ── 10b. Crystal edge specular (IQ + Patricio) ────────────
    // fwidth() detects facet boundaries from mod noise crystallization.
    // Bright ridges at terraced strata edges — supercooled plasma catching light.
    //
    // v13 (IQ): Hierarchical edge detection — two layers:
    //   Fine grain edges: sharp, detailed strata boundaries
    //   Tectonic edges: bold, structural plate boundaries (brighter, wider)
    // v13 (Anadol): Spatial zone modulation — quiet zones hushed, singing zones vivid.
    {
      // Fine grain edges (primary layer)
      float crystalVal = fract(vCrystalRaw);
      float fw = fwidth(crystalVal) * 2.0;
      float fineEdge = 1.0 - smoothstep(0.0, fw, min(crystalVal, 1.0 - crystalVal));

      // Tectonic plate edges (secondary layer — bolder, wider ridges)
      float crystalVal2 = fract(vCrystalRaw2);
      float fw2 = fwidth(crystalVal2) * 3.0;  // wider detection → bolder tectonic ridges
      float tectonicEdge = 1.0 - smoothstep(0.0, fw2, min(crystalVal2, 1.0 - crystalVal2));

      // Hierarchical combine: tectonic edges are brighter (0.7) than fine grain (0.4)
      float crystalEdge = max(fineEdge * 0.4, tectonicEdge * 0.7);
      crystalEdge *= uCrystallize;

      // Anadol: spatial zone modulation — quiet zones show 25% crystal, singing zones 100%
      float crystalZoneMod = mix(0.25, 1.0, spatialZone);
      crystalEdge *= crystalZoneMod;

      // Morph-tinted specular: NOVA = cool blue-white, CORE = hot amber-white
      vec3 crystalSpecColor = mix(
        vec3(0.3, 0.45, 1.0),    // NOVA: blue-white crystal edges
        vec3(1.0, 0.7, 0.2),     // CORE: amber crystal edges
        uMorph
      );
      baseColor += crystalSpecColor * crystalEdge * 0.6;
    }

    // ── Final adjustments ─────────────────────────────────────
    // CORE: slightly darker for contrast
    baseColor *= mix(1.0, 0.70, morphLate);

    // Gamma — CORE gets contrast boost, NOVA stays linear (smooth glow)
    baseColor = pow(max(baseColor, vec3(0.0)), vec3(mix(1.0, 1.35, morphLate)));

    // v11.4: Moderate sat boost — enough to separate hue zones visually.
    // With the relaxed anti-pink guard (0.48), this won't push to magenta.
    float satBoost = mix(1.32, 1.40, uMorph) + transitionFactor * 0.28;
    float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
    baseColor = max(mix(vec3(luma), baseColor, satBoost), vec3(0.0));

    // Transition color injection
    vec3 transitionTint = mix(
      vec3(0.04, 0.04, 0.16),  // cooler transition tint
      vec3(0.16, 0.10, 0.03),
      uMorph
    );
    baseColor += transitionTint * transitionFactor * 0.10 * (1.0 - centerGlow);

    // v10.5: Lighter compression — let palette range express fully
    // NOVA: mild compression. CORE: minimal (allow HDR peaks).
    float toneCompress = mix(0.10, 0.04, uMorph);
    baseColor = baseColor / (1.0 + baseColor * toneCompress);

    // v11.5b: Anti-pink guard — hard blue enforcement.
    // R capped at 28% of B at NOVA → reads as BLUE with faint violet undertone.
    // Real blue stars have R/B < 0.25. We allow slightly more for warmth.
    float maxR = baseColor.z * 0.28;
    baseColor.x = mix(min(baseColor.x, maxR), baseColor.x, uMorph);

    // v11.6: Anti-violet guard — ensure enough green for true blue, not violet.
    // Screen blue (R=0, G=0, B=high) perceptually reads as violet/purple.
    // Real blue stars (Rigel, Vega) are genuinely BLUE with slight cyan undertone.
    // G ≥ 18% of B → shifts any violet regions toward genuine blue.
    float minG = baseColor.z * 0.18;
    baseColor.y = mix(max(baseColor.y, minG), baseColor.y, uMorph);

    // v11.2: Solid alpha edge — the rim glow adds visual softness via brightness,
    // NOT via transparency (which creates visible semi-transparent bands).
    float alpha = mix(0.97, 0.99, uMorph) + pow(vFresnel, 3.0) * 0.03;
    gl_FragColor = vec4(baseColor, clamp(alpha, 0.0, 1.0));
  }
`;
