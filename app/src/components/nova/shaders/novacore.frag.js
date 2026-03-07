// NOVACORE fragment shader v2 — domain-warped volumetric plasma
// Domain-warped FBM + IQ cosine palette + volumetric raymarching
// The visual soul of the NOVACORE sphere

export const novacoreFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uMorph;       // 0.0 = NOVA (violet plasma), 1.0 = CORE (amber fusion)
  uniform float uPulse;
  uniform float uExhale;
  uniform float uIntensity;   // 0.3 dim → 1.0 blazing
  uniform float uVoice;
  uniform float uSize;        // sphere radius
  uniform float uTier;        // GPU tier (1 = no raymarch, 2 = full)

  // IQ cosine palette uniforms: a + b * cos(2π(c*t + d))
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

  // ── Simplex 3D noise ────────────────────────────────────────────
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

  // ── FBM (4 octaves) ─────────────────────────────────────────────
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p * f);
      f *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  // Lightweight FBM (2 octaves — for inner raymarch sampling)
  float fbm2(vec3 p) {
    return 0.5 * snoise(p) + 0.25 * snoise(p * 2.0);
  }

  // ── IQ Cosine Palette ───────────────────────────────────────────
  // a + b * cos(2π(c*t + d)) — infinite smooth gradient from 4 vec3
  vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
  }

  // ── Domain-Warped FBM (Inigo Quilez technique) ──────────────────
  // Returns vec3: .x = final pattern, .y = q magnitude, .z = r magnitude
  // q and r drive independent color channels for multi-hue richness
  vec3 domainWarp(vec3 p, float time) {
    float speed = mix(0.10, 0.28, uMorph);

    // First warp layer: q
    float qx = fbm3(p + vec3(0.0, 0.0, 0.0) + time * speed * 0.7);
    float qy = fbm3(p + vec3(5.2, 1.3, 2.8) + time * speed * 0.6);
    float qz = fbm3(p + vec3(2.1, 7.3, 4.2) + time * speed * 0.5);
    vec3 q = vec3(qx, qy, qz);

    // Second warp layer: r (feeds on q — creates the organic flow)
    float warpStr = mix(3.0, 5.0, uMorph);
    float rx = fbm3(p + warpStr * q + vec3(1.7, 9.2, 4.1) + time * speed * 0.4);
    float ry = fbm3(p + warpStr * q + vec3(8.3, 2.8, 7.4) + time * speed * 0.35);
    float rz = fbm3(p + warpStr * q + vec3(3.9, 6.1, 1.2) + time * speed * 0.45);
    vec3 r = vec3(rx, ry, rz);

    // Final pattern — composed from all layers
    float pattern = fbm3(p + warpStr * r + time * speed * 0.25);

    return vec3(pattern, length(q), length(r));
  }

  // Lightweight domain warp for raymarching (fewer octaves)
  vec3 domainWarpLight(vec3 p, float time) {
    float speed = mix(0.10, 0.28, uMorph);
    float qx = fbm2(p + vec3(0.0) + time * speed * 0.7);
    float qy = fbm2(p + vec3(5.2, 1.3, 2.8) + time * speed * 0.6);
    vec2 q = vec2(qx, qy);
    float warpStr = mix(2.5, 4.0, uMorph);
    float pattern = fbm2(p + warpStr * vec3(q, 0.0) + time * speed * 0.25);
    return vec3(pattern, length(q), 0.0);
  }

  void main() {
    // ── Interpolate palette parameters ─────────────────────────
    vec3 palA = mix(uNovaPalA, uCorePalA, uMorph);
    vec3 palB = mix(uNovaPalB, uCorePalB, uMorph);
    vec3 palC = mix(uNovaPalC, uCorePalC, uMorph);
    vec3 palD = mix(uNovaPalD, uCorePalD, uMorph);

    // ── Surface domain warp ────────────────────────────────────
    vec3 warpResult = domainWarp(vPosition * 1.6, uTime);
    float patternRaw = warpResult.x * 0.5 + 0.5;   // remap to 0–1
    float qMagRaw = warpResult.y * 0.5 + 0.5;
    float rMagRaw = warpResult.z * 0.5 + 0.5;

    // ── Contrast curve — CORE compresses toward t=0.5 (palette dark zone) ──
    // IQ palette: bright at t=0,1 and dark at t=0.5 (cos(π)=-1)
    // Late-onset CORE effects: zero below morph 0.5, ramps up 0.5→1.0
    float morphLate = smoothstep(0.5, 1.0, uMorph);
    float centeredP = 2.0 * patternRaw - 1.0;
    float compressedP = sign(centeredP) * pow(abs(centeredP), mix(1.0, 3.5, morphLate));
    float pattern = compressedP * 0.5 + 0.5;

    float centeredQ = 2.0 * qMagRaw - 1.0;
    float compressedQ = sign(centeredQ) * pow(abs(centeredQ), mix(1.0, 2.0, morphLate));
    float qMag = compressedQ * 0.5 + 0.5;

    float centeredR = 2.0 * rMagRaw - 1.0;
    float compressedR = sign(centeredR) * pow(abs(centeredR), mix(1.0, 2.0, morphLate));
    float rMag = compressedR * 0.5 + 0.5;

    // ── IQ palette — 3 samples at different t values ───────────
    vec3 col1 = iqPalette(pattern, palA, palB, palC, palD);
    vec3 col2 = iqPalette(qMag * 0.8, palA, palB, palC, palD);
    vec3 col3 = iqPalette(rMag + 0.33, palA, palB, palC, palD);

    // ── Build surface color — START NEAR-BLACK, build up extremely selectively ──
    // Wider contrast range for CORE (higher displacement amplitude)
    float dispLow = mix(-0.06, -0.15, uMorph);
    float dispHigh = mix(0.12, 0.22, uMorph);
    float dispFactor = smoothstep(dispLow, dispHigh, vDisplacement);

    // Base: near-black foundation — the palette's lowest values
    vec3 baseColor = col1 * mix(0.10, 0.06, uMorph);

    // Plasma flow: nonlinear — NOVA shows mid-tones, CORE is cubic (very selective)
    float plasmaShape = mix(pattern * 0.85, pattern * pattern * pattern, uMorph);
    baseColor += col2 * plasmaShape * mix(0.40, 0.22, uMorph);

    // Hot spots: extremely selective — only the brightest 10-15%
    float hotLow = mix(0.62, 0.80, uMorph);
    float hotHigh = mix(0.92, 0.98, uMorph);
    float hotSpots = smoothstep(hotLow, hotHigh, pattern);
    baseColor += col3 * hotSpots * mix(0.30, 0.70, uMorph);

    // Displacement contrast: valleys near-BLACK, peaks bright
    baseColor *= mix(0.06, 1.4, dispFactor);
    // Extra valley darkening for CORE
    baseColor *= mix(1.0, smoothstep(-0.05, 0.15, vDisplacement), uMorph * 0.4);

    // ── Volumetric raymarching (Tier 2 only) ───────────────────
    if (uTier >= 1.5) {
      vec3 rayOrigin = vLocalPos;
      vec3 rayDir = normalize(vViewDir);

      vec4 volAccum = vec4(0.0);
      float stepSize = uSize * 0.065;

      for (int i = 0; i < 20; i++) {
        if (volAccum.a > 0.92) break;

        vec3 marchPos = rayOrigin + rayDir * (float(i + 1) * stepSize);

        // Check inside sphere
        float distFromCenter = length(marchPos);
        if (distFromCenter > uSize * 0.95) continue;

        // Sample domain-warped density (lightweight version)
        vec3 warpSample = domainWarpLight(marchPos * 1.0, uTime);
        float density = warpSample.x * 0.5 + 0.5;

        // Depth factor: denser toward center
        float depthRatio = 1.0 - (distFromCenter / uSize);
        depthRatio = pow(depthRatio, mix(1.8, 1.0, uMorph));
        density *= depthRatio;

        // Threshold
        float threshold = mix(0.38, 0.28, uMorph);
        if (density < threshold) continue;

        // Color from palette at this depth
        float remapped = (density - threshold) / (1.0 - threshold);
        vec3 volColor = iqPalette(remapped * 0.7 + depthRatio * 0.3, palA, palB, palC, palD);

        // Brighter toward center
        volColor *= 1.0 + depthRatio * mix(0.8, 2.0, uMorph);

        // Accumulate (front-to-back compositing)
        float sampleAlpha = remapped * depthRatio * mix(0.10, 0.06, uMorph);
        vec4 sampleRGBA = vec4(volColor * sampleAlpha, sampleAlpha);
        volAccum += sampleRGBA * (1.0 - volAccum.a);
      }

      // Blend volume behind surface
      baseColor = baseColor + volAccum.rgb * (1.0 - smoothstep(0.0, 0.5, dispFactor) * 0.5);
    }

    // ── Energy veins (replaces hex pattern) ────────────────────
    float veins = abs(warpResult.y - warpResult.z);
    veins = 1.0 - smoothstep(0.0, 0.06 + 0.04 * uMorph, veins);
    // t=0.75 is dark for CORE palette; morph toward t=0.05 (bright zone)
    float veinT = mix(0.75, 0.05, uMorph);
    vec3 veinColor = iqPalette(veinT, palA, palB, palC, palD);
    baseColor += veinColor * veins * mix(0.06, 0.50, uMorph);

    // ── Fresnel rim glow — thin sharp edge ──────────────────────
    float fresnelGlow = pow(vFresnel, mix(2.8, 3.5, uMorph));
    // NOVA: t=0.55 (violet bright zone), CORE: t=0.05 (orange bright zone)
    float rimT = mix(0.55, 0.05, uMorph);
    vec3 rimColor = iqPalette(rimT, palA, palB, palC, palD);
    baseColor += rimColor * fresnelGlow * mix(0.7, 1.0, uMorph);

    // ── Subsurface scattering ──────────────────────────────────
    float sss = pow(vFresnel, mix(2.5, 3.0, uMorph));
    float sssT = mix(0.3, 0.08, uMorph);
    vec3 sssColor = iqPalette(sssT, palA, palB, palC, palD);
    baseColor += sssColor * sss * mix(0.08, 0.12, uMorph);

    // ── Internal core glow ─────────────────────────────────────
    float coreGlow = 1.0 - vFresnel;
    coreGlow = pow(coreGlow, mix(4.0, 3.0, uMorph));
    vec3 coreColor = iqPalette(0.1, palA, palB, palC, palD);
    baseColor += coreColor * coreGlow * mix(0.08, 0.20, uMorph) * uIntensity;

    // ── HDR hot spots for bloom — selective but BRIGHT ─────────
    // Use raw pattern (pre-contrast-curve) for threshold to catch more peaks
    float hdrThreshLow = mix(0.70, 0.75, uMorph);
    float hdrMask = smoothstep(hdrThreshLow, 0.95, patternRaw);
    // For CORE: sample from bright zone (t near 0) not dark zone
    float hdrT = mix(patternRaw + 0.15, patternRaw * 0.1, uMorph);
    vec3 hdrColor = iqPalette(hdrT, palA, palB, palC, palD);
    // CORE: HDR needs to be very bright to survive gamma
    baseColor += hdrColor * hdrMask * mix(0.4, 1.5, uMorph);

    // ── Pulse / Exhale / Voice ─────────────────────────────────
    float pulseT = mix(0.9, 0.05, uMorph);
    vec3 pulseColor = iqPalette(pulseT, palA, palB, palC, palD);
    baseColor += pulseColor * uPulse * 0.35;
    baseColor += (col1 + col3) * 0.5 * uExhale * 0.2;
    baseColor += pulseColor * uVoice * 0.15;

    // ── Intensity modulation — preserves dark tones ────────────
    // Gamma handles CORE darkness; use morphLate so transition stays bright
    float intMod = mix(0.35, 1.0, uIntensity);
    intMod *= mix(1.0, 0.75, morphLate);
    baseColor *= intMod;

    // ── Minimum glow floor ─────────────────────────────────────
    float floorT = mix(0.5, 0.05, uMorph);
    vec3 floorColor = iqPalette(floorT, palA, palB, palC, palD);
    baseColor = max(baseColor, floorColor * mix(0.025, 0.008, uMorph));

    // ── Gamma contrast curve for CORE ──────────────────────────
    // Squared morph: gamma stays near 1.0 during transition, 2.2 at full CORE
    float gamma = mix(1.0, 2.2, morphLate);
    baseColor = pow(max(baseColor, vec3(0.0)), vec3(gamma));

    // ── Alpha ──────────────────────────────────────────────────
    float alpha = mix(0.93, 0.99, uMorph);
    alpha += fresnelGlow * 0.04;
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(baseColor, alpha);
  }
`;
