// CHAMBER FLOOR fragment shader v2 — Obsidian mirror lit by the Artifact above
//
// v2 enhancements (Visual Board):
//   Hodgin: Temporal hierarchy — geological drift (3min) + atmospheric caustics (30s) + fast shimmer
//   Patricio: Floor Fresnel — obsidian reflects more at grazing angles (physically correct)
//   IQ: Spatial density scaling — caustic detail sharpens near center, blurs at edges
//   Anadol: Perceptual hot zones — caustic intensity varies spatially, creating "singing" spots
//
// Visual layers:
//   1. Base obsidian: nearly black with micro-noise texture + warm/cool zones
//   2. Light pool: gaussian radial glow from artifact above
//   3. Caustics: 3-tier temporal hierarchy (geological + atmospheric + shimmer)
//   4. Fresnel rim: viewing-angle specular on polished obsidian
//   5. Central specular: sharp point of brilliance below artifact
//   6. Color: morphs NOVA blue → CORE amber via uMorph

export const chamberFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAwaken;
  uniform float uMorph;
  uniform float uInnerLight;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  // ── Simplex noise (3D) ─────────────────────────────────────────────
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
    float dist = length(vWorldPosition.xz);

    // ── 1. Base obsidian surface ──────────────────────────────────────
    // Polished volcanic stone with warm/cool micro-variation (Anadol)
    float surfNoise1 = snoise(vec3(vWorldPosition.xz * 3.0, 0.0)) * 0.5 + 0.5;
    float surfNoise2 = snoise(vec3(vWorldPosition.xz * 8.0, 5.0)) * 0.5 + 0.5;
    float surfaceTexture = surfNoise1 * 0.7 + surfNoise2 * 0.3;
    // Warm/cool obsidian zones — same concept as artifact shell
    vec3 warmObsidian = vec3(0.016, 0.012, 0.010);
    vec3 coolObsidian = vec3(0.008, 0.010, 0.015);
    float zoneNoise = snoise(vec3(vWorldPosition.xz * 0.5, 1.0)) * 0.5 + 0.5;
    vec3 baseColor = mix(coolObsidian, warmObsidian, zoneNoise) + vec3(surfaceTexture * 0.006);

    // ── 2. Light pool — gaussian radial glow from artifact ────────────
    float poolIntensity = exp(-dist * dist * 0.12);
    float lightStrength = uAwaken * uInnerLight;
    poolIntensity *= lightStrength;

    // ── 3. Caustics — Hodgin temporal hierarchy ───────────────────────
    // Three time scales creating living, non-repeating light:
    //   Geological: ~3 min cycle — very slow warp of caustic field
    //   Atmospheric: ~30s cycle — the main visible caustic rotation
    //   Shimmer: ~2s cycle — fast, subtle surface flicker

    // ── Geological layer (Hodgin: "the earth beneath is alive") ──
    // Ultra-slow warp field that distorts the caustic patterns over minutes
    float geoTime = uTime * 0.004;  // ~4.2 minute full cycle
    vec2 geoWarp = vec2(
      snoise(vec3(vWorldPosition.xz * 0.3, geoTime)),
      snoise(vec3(vWorldPosition.xz * 0.3 + vec2(7.0, 3.0), geoTime + 5.0))
    ) * 0.6;

    // ── Atmospheric layer (main caustics) ──
    // Two counter-rotating noise fields, warped by geological drift
    float atmoAngle1 = uTime * 0.022;
    float atmoAngle2 = uTime * -0.016;
    float ca1 = cos(atmoAngle1), sa1 = sin(atmoAngle1);
    float ca2 = cos(atmoAngle2), sa2 = sin(atmoAngle2);

    // IQ: Spatial density — detail sharpens near center, blurs at edges
    float detailScale = mix(1.0, 0.6, smoothstep(1.0, 7.0, dist));

    vec2 warpedPos = vWorldPosition.xz + geoWarp;  // geological distortion
    vec2 rotP1 = vec2(
      warpedPos.x * ca1 - warpedPos.y * sa1,
      warpedPos.x * sa1 + warpedPos.y * ca1
    ) * 1.8 * detailScale;
    vec2 rotP2 = vec2(
      warpedPos.x * ca2 - warpedPos.y * sa2,
      warpedPos.x * sa2 + warpedPos.y * ca2
    ) * 2.6 * detailScale;

    float n1 = snoise(vec3(rotP1, uTime * 0.05));
    float n2 = snoise(vec3(rotP2, uTime * 0.035 + 7.0));

    // IQ: Sharper lines near center, softer at edges
    // v14: Caustics sharpen as artifact awakens — more energy = tighter light focus
    float lineWidth = mix(0.08, 0.18, smoothstep(0.0, 6.0, dist)) * mix(1.0, 0.4, uAwaken);
    float line1 = 1.0 - smoothstep(0.0, lineWidth, abs(n1));
    float line2 = 1.0 - smoothstep(0.0, lineWidth, abs(n2));
    float caustic = max(line1, line2) * 0.5 + line1 * line2 * 0.5;

    // Fine detail layer — tighter pattern, faster drift
    float n3 = snoise(vec3((warpedPos + geoWarp * 0.5) * 4.2 * detailScale, uTime * 0.065));
    float fineLine = 1.0 - smoothstep(0.0, lineWidth * 0.7, abs(n3));
    caustic = caustic * 0.7 + fineLine * 0.3;

    // ── Shimmer layer (Hodgin: "fast, nervous energy") ──
    // Rapid flicker that makes the floor feel alive, not static
    float shimmer = snoise(vec3(vWorldPosition.xz * 6.0, uTime * 0.8));
    shimmer = shimmer * 0.5 + 0.5;
    shimmer = 0.85 + shimmer * 0.15;  // ±7.5% modulation
    caustic *= shimmer;

    // Anadol: Perceptual hot zones — some areas of floor "sing" brighter
    float hotZone = snoise(vec3(vWorldPosition.xz * 0.6 + geoWarp * 0.3, geoTime * 2.0));
    hotZone = smoothstep(-0.2, 0.5, hotZone);
    caustic *= 0.6 + hotZone * 0.4;  // hot zones up to 40% brighter

    // Radial fade — caustics dim with distance from light source
    float causticFade = exp(-dist * dist * 0.05);
    caustic *= causticFade;

    // ── 4. Patricio: Floor Fresnel — obsidian glints at grazing angles ─
    // Polished obsidian is partially reflective. At steep viewing angles
    // (looking straight down), it's dark. At grazing angles (looking
    // across the surface), it catches more light — classic Fresnel.
    vec3 viewN = normalize(vViewDir);
    vec3 floorNormal = vec3(0.0, 1.0, 0.0);
    float floorFresnel = 1.0 - max(dot(viewN, floorNormal), 0.0);
    floorFresnel = pow(floorFresnel, 3.5);  // sharp falloff — only at glancing
    // Fresnel reveals the obsidian's reflective character even when dormant
    float fresnelBase = floorFresnel * 0.015;  // very subtle even without light
    float fresnelLit = floorFresnel * lightStrength * 0.12;  // stronger when lit

    // ── 5. Central reflection — concentrated bright glow below artifact ─
    float reflectionGlow = exp(-dist * dist * 0.45);
    reflectionGlow *= lightStrength * 0.3;

    // ── 6. Color — NOVA blue ↔ CORE amber ────────────────────────────
    vec3 novaLight = vec3(0.08, 0.14, 0.82);
    vec3 coreLight = vec3(0.90, 0.52, 0.06);
    vec3 lightColor = mix(novaLight, coreLight, uMorph);

    vec3 novaCausticHot = vec3(0.30, 0.45, 1.0);
    vec3 coreCausticHot = vec3(1.0, 0.72, 0.20);
    vec3 causticColor = mix(novaCausticHot, coreCausticHot, uMorph);

    // ── 6b. Circuit etching — polar-coordinate grid etched into obsidian ─
    // Concentric ring lines + radial spokes with noise-driven breaks
    float circAngle = atan(vWorldPosition.z, vWorldPosition.x);

    // Concentric rings every ~0.8 world units
    float ringPattern = abs(fract(dist * 1.25) - 0.5);
    float ringLine = 1.0 - smoothstep(0.0, 0.025, ringPattern);

    // Radial spokes (24 spokes = every 15 degrees)
    float spokeAngle = mod(circAngle, 3.14159265 / 12.0);
    float spokeDist = abs(spokeAngle - 3.14159265 / 24.0);
    float spokeLine = 1.0 - smoothstep(0.0, 0.012, spokeDist);
    // Fade spokes near center to avoid convergence noise
    spokeLine *= smoothstep(0.5, 1.8, dist);

    // Combine circuit grid
    float circuit = max(ringLine, spokeLine);
    // Noise-driven breaks for organic feel
    float circuitNoise = snoise(vec3(vWorldPosition.xz * 2.0, 0.5));
    circuit *= smoothstep(-0.1, 0.3, circuitNoise);
    // Fade circuit at outer edges
    circuit *= 1.0 - smoothstep(5.0, 9.0, dist);

    // Dormant: subtle dark etch (subtractive)
    float circuitEtch = circuit * 0.018 * (1.0 - lightStrength);
    // Lit: faint glow with artifact color
    vec3 circuitGlow = lightColor * circuit * lightStrength * 0.08 * poolIntensity;

    // ── 7. Compose all layers ─────────────────────────────────────────
    vec3 poolContrib = lightColor * poolIntensity * 0.12;
    vec3 causticContrib = causticColor * caustic * poolIntensity * 0.6;
    vec3 reflectionContrib = lightColor * reflectionGlow;
    vec3 fresnelContrib = lightColor * fresnelLit + vec3(fresnelBase);

    baseColor -= vec3(circuitEtch); // dark etching when dormant
    vec3 finalColor = baseColor + poolContrib + causticContrib + reflectionContrib + fresnelContrib + circuitGlow;

    // Central specular — sharp point of brilliance directly below
    float specular = exp(-dist * dist * 8.0);
    finalColor += vec3(1.0) * specular * lightStrength * 0.15;

    // ── 8. Edge fade — floor dissolves into darkness ──────────────────
    float edgeFade = 1.0 - smoothstep(6.0, 10.0, dist);

    // Soft energy cap (Reinhard, matching artifact shader)
    finalColor = finalColor / (1.0 + finalColor * 0.3);

    // Alpha: fully opaque where lit, fades at edges
    float alpha = edgeFade * (0.85 + poolIntensity * 0.15);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
