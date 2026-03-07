// NOVACORE fragment shader v10 — LIGHT SOURCE paradigm
// The sphere IS a light source — it glows everywhere.
// Color varies by HUE, not by darkness. No dark holes.
// NOVA: luminous violet plasma. CORE: amber fusion reactor.

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

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vWorldPosition;
  varying float vDisplacement;
  varying float vFresnel;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

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

  // Domain warp — NOVA: gentle smooth flow, CORE: turbulent volcanic
  // Uses fbmAdaptive: 2 octaves at NOVA (smooth), 4 at CORE (detailed)
  vec3 domainWarp(vec3 p, float time) {
    float speed = mix(0.12, 0.30, uMorph);

    float qx = fbmAdaptive(p + vec3(0.0) + time * speed * 0.8);
    float qy = fbmAdaptive(p + vec3(5.2, 1.3, 2.8) + time * speed * 0.65);
    float qz = fbmAdaptive(p + vec3(2.1, 7.3, 4.2) + time * speed * 0.5);
    vec3 q = vec3(qx, qy, qz);

    // NOVA: low warp = broad smooth gradients. CORE: high warp = volcanic.
    float warpStr = mix(1.2, 4.0, uMorph);
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
    float warpStr = mix(2.0, 3.5, uMorph);
    float pattern = fbm2(p + warpStr * vec3(q, 0.0) + time * speed * 0.25);
    return vec3(pattern, length(q), 0.0);
  }

  void main() {
    // ── Palette interpolation with transition boost ─────────
    float transitionFactor = 1.0 - abs(uMorph * 2.0 - 1.0);
    float ampBoost = 1.0 + transitionFactor * 0.5;

    vec3 palA = mix(uNovaPalA, uCorePalA, uMorph);
    vec3 palB = mix(uNovaPalB, uCorePalB, uMorph) * ampBoost;
    vec3 palC = mix(uNovaPalC, uCorePalC, uMorph);
    vec3 palD = mix(uNovaPalD, uCorePalD, uMorph);

    // ── Domain warp ──────────────────────────────────────────
    // NOVA: lower frequency = broader, smoother flow patterns (light source)
    // CORE: higher frequency = tighter volcanic detail
    float warpFreq = mix(1.1, 1.6, uMorph);
    vec3 warpResult = domainWarp(vPosition * warpFreq, uTime);
    float pattern = warpResult.x * 0.5 + 0.5;
    float qMag = warpResult.y;
    float rMag = warpResult.z;

    // Detail noise — ZERO for NOVA (pure smooth light), textured for CORE
    float detailSpeed = mix(0.8, 1.5, uMorph);
    float detailAmount = uMorph * uMorph;  // morph² — invisible until CORE
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
    vec3 novaBaseGlow = vec3(0.25, 0.18, 0.52);   // luminous deep violet
    vec3 coreBaseGlow = vec3(0.08, 0.04, 0.01);   // dim ember
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

    float blendFlow = smoothstep(0.3, 0.8, qMag);
    vec3 noiseFlowColor = mix(palColor1, palColor2, blendFlow);
    noiseFlowColor = mix(noiseFlowColor, palColor3, smoothstep(0.4, 0.9, rMag) * 0.3);

    // Flow boundary brightening (CORE feature)
    float flowBoundary = 1.0 - smoothstep(0.0, mix(0.18, 0.05, uMorph), abs(qMag - rMag));
    noiseFlowColor += noiseFlowColor * flowBoundary * mix(0.02, 0.50, uMorph);

    // === Position-based smooth gradient (used at low morph) ===
    // Hemisphere-scale hue variation — like how real light sources glow
    vec3 localDir = normalize(vPosition);
    float posAngle = (atan(localDir.z, localDir.x) + 3.14159) / 6.28318;
    float posElev = localDir.y * 0.5 + 0.5;
    // Slow time rotation so the gradient drifts gracefully
    // pattern * 0.30 adds just enough organic flow to feel alive
    float smoothT = posAngle * 0.42 + posElev * 0.28 + pattern * 0.30 + uTime * 0.02;
    vec3 smoothFlowColor = max(iqPalette(smoothT, palA, palB, palC, palDShifted), vec3(0.0));
    // Second sample at phase offset for richer hue variation
    vec3 smoothFlow2 = max(iqPalette(smoothT + 0.35, palA, palB, palC, palDShifted + vec3(0.12, 0.08, 0.05)), vec3(0.0));
    smoothFlowColor = mix(smoothFlowColor, smoothFlow2, posElev * 0.4 + 0.3);

    // === Blend: NOVA=smooth position-based, CORE=noisy flow-based ===
    vec3 flowColor = mix(smoothFlowColor, noiseFlowColor, uMorph);

    // Brightness modulation
    float baseFloor = mix(0.78, 0.12, uMorph);
    float patternBright = pow(pattern, mix(0.3, 2.2, uMorph));
    float flowBright = baseFloor + (1.0 - baseFloor) * smoothstep(0.10, 0.95, patternBright);

    // Luminance equalization for remaining noise contribution
    float flowLuma = dot(flowColor, vec3(0.299, 0.587, 0.114));
    float targetLuma = mix(0.42, flowLuma, uMorph);
    flowColor = flowColor * (targetLuma / max(flowLuma, 0.03));
    flowColor = clamp(flowColor, vec3(0.0), vec3(1.5));

    // Color contribution
    float colorScale = 0.82;
    vec3 flowLight = flowColor * flowBright * colorScale;

    // ── 3. CENTER WHITE HOT-SPOT ─────────────────────────────
    // NOVA: tight concentrated white core. CORE: broader glow.
    float centerPow = mix(12.0, 5.0, uMorph) + transitionFactor * 2.0;
    float centerGlow = pow(centerFactor, centerPow);

    vec3 centerWhite = mix(
      vec3(0.82, 0.84, 1.0),   // cool blue-white for NOVA
      vec3(1.0, 0.90, 0.72),   // warm amber-white for CORE
      uMorph
    );
    vec3 centerPalette = max(iqPalette(0.78, palA, palB, palC, palDShifted), vec3(0.0));
    vec3 centerColor = centerWhite + centerPalette * 0.18;
    float centerBrightness = mix(0.80, 1.05, uMorph) * breathe;
    vec3 centerLight = centerColor * centerGlow * centerBrightness;

    // ── 4. COMPOSE — additive light layers ──────────────────
    // base luminous glow + flow colored light + center white
    // Center slightly dims flow (white dominates at center)
    float flowFade = 1.0 - centerGlow * 0.45;
    vec3 baseColor = baseGlow + flowLight * flowFade + centerLight;

    // Bridge — smooth gradient from center white into color field
    float bridgeGlow = pow(centerFactor, mix(4.0, 3.0, uMorph)) * (1.0 - centerGlow);
    vec3 bridgeColor = mix(
      vec3(0.10, 0.08, 0.22),  // NOVA: violet bridge
      vec3(0.16, 0.10, 0.03),  // CORE: amber bridge
      uMorph
    );
    baseColor += bridgeColor * bridgeGlow * 0.18;

    // ── 5. DISPLACEMENT modulation ──────────────────────────
    // NOVA: light source — displacement barely affects brightness
    // CORE: volcanic — deep cracks reveal darkness
    float dispLow = mix(-0.03, -0.18, uMorph);
    float dispHigh = mix(0.06, 0.26, uMorph);
    float dispFactor = smoothstep(dispLow, dispHigh, vDisplacement);
    float morphLate = smoothstep(0.5, 1.0, uMorph);

    float dispMod = mix(
      mix(0.90, 1.0, pow(dispFactor, 0.25)),    // NOVA: 0.90 floor, very gentle
      mix(0.05, 1.2, pow(dispFactor, 1.5)),      // CORE: 0.05 floor, deep cracks
      morphLate
    );
    // Protect center from displacement darkening
    float dispBlend = smoothstep(0.3, 0.8, centerGlow);
    baseColor *= mix(dispMod, 1.0, dispBlend);

    // ── 6. Volumetric raymarching (Tier 2) ────────────────────
    if (uTier >= 1.5) {
      vec3 rayOrigin = vLocalPos;
      vec3 rayDir = normalize(vViewDir);
      vec4 volAccum = vec4(0.0);
      float stepSize = uSize * 0.065;

      for (int i = 0; i < 24; i++) {
        if (volAccum.a > 0.88) break;
        vec3 marchPos = rayOrigin + rayDir * (float(i + 1) * stepSize);
        float distFromCenter = length(marchPos);
        if (distFromCenter > uSize * 0.92) continue;

        vec3 warpSample = domainWarpLight(marchPos * 0.9, uTime);
        float density = warpSample.x * 0.5 + 0.5;
        float depthRatio = 1.0 - (distFromCenter / uSize);
        depthRatio = pow(depthRatio, mix(1.2, 0.7, uMorph));
        density *= depthRatio;

        float threshold = mix(0.22, 0.18, uMorph);
        if (density < threshold) continue;

        float remapped = (density - threshold) / (1.0 - threshold);
        float volT = mix(remapped * 0.6 + depthRatio * 0.3, remapped * 0.12, uMorph);
        vec3 volColor = iqPalette(volT, palA, palB, palC, palDShifted);
        volColor = max(volColor, vec3(0.0));
        volColor *= 1.0 + depthRatio * mix(1.2, 2.8, uMorph);

        // White-hot inner core
        float coreHeat = smoothstep(0.5, 0.8, depthRatio * remapped);
        volColor += vec3(1.0, 0.92, 0.75) * coreHeat * mix(0.3, 0.6, uMorph);

        float sampleAlpha = remapped * depthRatio * mix(0.10, 0.08, uMorph);
        volAccum += vec4(volColor * sampleAlpha, sampleAlpha) * (1.0 - volAccum.a);
      }

      float surfOp = smoothstep(0.0, 0.4, dispFactor) * 0.35;
      baseColor += volAccum.rgb * (1.0 - surfOp) * mix(0.7, 0.9, uMorph);
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

    // ── 9. Rim glow ──────────────────────────────────────────
    float rimGlow = pow(vFresnel, mix(3.5, 5.5, uMorph));
    vec3 rimColor = max(iqPalette(mix(0.55, 0.05, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += rimColor * rimGlow * mix(0.22, 0.75, uMorph);
    // Soft white edge
    float rimEdge = pow(vFresnel, mix(6.0, 8.0, uMorph));
    baseColor += vec3(1.0, 0.96, 0.92) * rimEdge * mix(0.08, 0.30, uMorph);

    // ── 10. Pulse / Exhale / Voice ──────────────────────────
    vec3 pulseColor = max(iqPalette(mix(0.9, 0.05, uMorph), palA, palB, palC, palDShifted), vec3(0.0));
    baseColor += pulseColor * uPulse * 0.35 + vec3(1.0, 0.95, 0.9) * uPulse * 0.15;
    baseColor += flowColor * uExhale * 0.12;
    baseColor += pulseColor * uVoice * 0.10;

    // ── Final adjustments ─────────────────────────────────────
    // CORE: slightly darker for contrast
    baseColor *= mix(1.0, 0.70, morphLate);

    // Gamma — CORE gets contrast boost, NOVA stays linear (smooth glow)
    baseColor = pow(max(baseColor, vec3(0.0)), vec3(mix(1.0, 1.35, morphLate)));

    // Saturation boost — richer violet for NOVA, fiery for CORE
    float satBoost = mix(1.35, 1.40, uMorph) + transitionFactor * 0.28;
    float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
    baseColor = max(mix(vec3(luma), baseColor, satBoost), vec3(0.0));

    // Transition color injection
    vec3 transitionTint = mix(
      vec3(0.06, 0.03, 0.16),
      vec3(0.16, 0.10, 0.03),
      uMorph
    );
    baseColor += transitionTint * transitionFactor * 0.10 * (1.0 - centerGlow);

    float alpha = mix(0.96, 0.99, uMorph) + pow(vFresnel, 3.0) * 0.03;
    gl_FragColor = vec4(baseColor, clamp(alpha, 0.0, 1.0));
  }
`;
