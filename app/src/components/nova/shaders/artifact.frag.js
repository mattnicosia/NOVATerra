// ARTIFACT HOUSING fragment shader — The dark shell containing NOVA/CORE
// "An orb from another planet that has these powers inside of it."
//
// Material: obsidian — volcanic glass that transmits warm light at thin edges.
// When dormant: dark, dense, nearly opaque. Faint inner glow at thinnest fractures.
// When awakening: light bleeds through Voronoi fracture lines, intensifying.
// When alive: shell becomes semi-transparent, cellular surface visible beneath.
//
// Key uniforms:
//   uAwaken (0→1): dormant → alive transition
//   uMorph (0→1): NOVA blue → CORE amber (tints the transmitted light)
//   uInnerLight (0→1): intensity of the inner sphere (drives transmission brightness)

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

  // ── Simplex noise (IQ: proper continuous noise for spatial zones) ──
  // Ported from vertex shader — isotropic, no grid bias, smooth at all scales
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
    float NdotV = max(dot(normalize(vNormal), viewDir), 0.0);

    // ── Obsidian base color ──────────────────────────────────────────
    // Near-black with faint warm undertone (obsidian = volcanic glass)
    vec3 obsidianBase = vec3(0.012, 0.010, 0.014);  // very dark cool gray
    // Subtle specularity — glassy surface catches light
    float specular = pow(NdotV, 12.0) * 0.08;

    // ── Spatial hierarchy (Anadol) ───────────────────────────────────
    // Low-frequency modulation creates zones of activity:
    // High spatialZone = dense fracture webs (active zones)
    // Low spatialZone  = solid obsidian plates (quiet zones)
    // Drifts very slowly (~4 min cycle) so zones migrate across surface
    // IQ: now using proper simplex noise — smooth, isotropic, no grid artifacts
    float spatialZone = shellFbm(vLocalPos * 0.7 + uTime * vec3(0.004, 0.003, 0.005));
    // Remap: snoise returns [-1, 1], fbm ≈ [-0.6, 0.6], remap to [0, 1]
    spatialZone = spatialZone * 0.5 + 0.5;
    // smoothstep creates sharper boundary between active and quiet zones
    float zoneActivity = smoothstep(0.2, 0.7, spatialZone);

    // ── Anadol: Dormant surface variation ────────────────────────────
    // Even at awaken=0, spatial zones create visible material differences.
    // Active zones: slightly warmer obsidian, higher specular (glass-like)
    // Quiet zones: cooler, more matte (stone-like)
    // This gives the dormant monolith a subtle geological texture.
    vec3 warmObsidian = vec3(0.018, 0.013, 0.012);   // warm dark — slight red undertone
    vec3 coolObsidian = vec3(0.008, 0.009, 0.016);    // cool dark — slight blue undertone
    obsidianBase = mix(coolObsidian, warmObsidian, zoneActivity);
    // Specular varies by zone: active zones are glassier
    specular *= 0.6 + 0.4 * zoneActivity;

    // ── Patricio: Stress-concentration detection ─────────────────────
    // dFdx/dFdy of thickness reveals boundaries between thin and thick regions.
    // Steep gradients = stress concentration = brighter fracture edges.
    // Where thin meets thick, the shell cracks hardest.
    float dTdx = dFdx(vThickness);
    float dTdy = dFdy(vThickness);
    float thicknessGradient = length(vec2(dTdx, dTdy));
    // Normalize: typical gradient is 0.0–0.5, remap to visible range
    float stressConcentration = smoothstep(0.02, 0.25, thicknessGradient);

    // ── Fracture network (Voronoi) ────────────────────────────────────
    // Two scales of fractures: macro (tectonic) + micro (surface craze)
    vec2 macroFrac = voronoiFracture(vLocalPos * 2.5);
    vec2 microFrac = voronoiFracture(vLocalPos * 6.0 + vec3(5.1, 2.3, 8.7));

    // ── IQ: Per-plate identity ──────────────────────────────────────
    // F1 distance = proximity to nearest Voronoi seed = unique per plate.
    // Use as a pseudo-random plate ID to vary each plate's properties:
    //   - Small cells (low F1, near seed): denser, darker, awaken later
    //   - Large cells (high F1, far from seed): thinner, more transmissive, awaken earlier
    // fract(F1 * large_prime) gives a smooth 0-1 plate ID
    float plateId = fract(macroFrac.x * 7.31);  // pseudo-random per plate [0,1]
    // plateId modulates: emission response, awakening timing, base opacity
    float plateEmissionMod = 0.75 + 0.5 * plateId;  // 0.75–1.25 emission range
    float plateAwakenOffset = (plateId - 0.5) * 0.12;  // ±0.06 awakening shift

    // F2-F1 = proximity to cell boundary → fracture line
    // Low F2-F1 = ON the fracture. High = center of a plate.
    // IQ: Fresnel-scaled edge width — fractures thin out at glancing angles
    // due to foreshortening. Compensate by widening smoothstep at edges,
    // narrowing at head-on. Makes fractures read consistently at all angles.
    float fresnelWidth = 0.7 + 0.3 * vFresnel;  // 0.7× at head-on, 1.0× at edge
    float macroEdge = 1.0 - smoothstep(0.0, 0.12 * fresnelWidth, macroFrac.y);
    float microEdge = 1.0 - smoothstep(0.0, 0.08 * fresnelWidth, microFrac.y);

    // Combined fracture intensity (macro dominates, micro adds detail)
    // Anadol: modulate by spatial zone — quiet zones suppress micro fractures
    float fracture = macroEdge * 0.7 + microEdge * 0.3 * (0.3 + 0.7 * zoneActivity);

    // ── Anadol: Plate interior micro-detail ────────────────────────────
    // During awakening, plate interiors develop secondary crystalline patterns —
    // internal fracture networks that appear as the material thins/dissolves.
    // Uses high-frequency snoise to create veiny, crystalline texture WITHIN plates.
    // Only visible during mid-awakening (plates are opaque at dormant, gone at alive).
    float microDetailPhase = smoothstep(0.15, 0.45, uAwaken) * (1.0 - smoothstep(0.7, 1.0, uAwaken));
    // High-frequency crystalline pattern — different seed from main fractures
    float crystalNoise1 = snoise(vLocalPos * 12.0 + vec3(9.1, 3.7, 6.4) + uTime * vec3(0.008, 0.006, 0.01));
    float crystalNoise2 = snoise(vLocalPos * 18.0 + vec3(2.3, 8.1, 4.9));

    // v14: Amplify crystalline patterns with fract() mod-noise.
    // During mid-awakening, the material doesn't dissolve smoothly — it shatters
    // into discrete crystalline strata. Visible terracing within plate interiors.
    float crystalNoise1Mod = mix(crystalNoise1, fract(crystalNoise1 * 6.0), microDetailPhase * 0.6);
    float crystalNoise2Mod = mix(crystalNoise2, fract(crystalNoise2 * 8.0), microDetailPhase * 0.5);

    // Create vein-like patterns: abs(noise) creates ridges at zero-crossings
    float crystalVeins = 1.0 - smoothstep(0.0, 0.15, abs(crystalNoise1Mod));
    float crystalDetail = 1.0 - smoothstep(0.0, 0.1, abs(crystalNoise2Mod));
    // Combined: veins + fine detail, modulated by plate interior (not at edges)
    float plateInterior = 1.0 - fracture;  // 1.0 at plate center, 0.0 at edges
    float microDetail = (crystalVeins * 0.6 + crystalDetail * 0.4) * plateInterior * microDetailPhase;

    // ── Thickness-based transmission ──────────────────────────────────
    // Thin regions (low vThickness) let more light through
    // This simulates real obsidian held to light — red glow at thin edges
    float thinness = 1.0 - vThickness;  // invert: 0 = thick, 1 = thin

    // ── Transmission color (light from inner sphere) ──────────────────
    // NOVA (morph=0): blue light bleeding through dark material
    // CORE (morph=1): amber/red — physically correct for obsidian (warm transmission)
    vec3 novaTransmit = vec3(0.08, 0.15, 0.65);   // deep blue glow
    vec3 coreTransmit = vec3(0.55, 0.18, 0.04);    // warm amber-red (obsidian transmission)
    vec3 transmitColor = mix(novaTransmit, coreTransmit, uMorph);

    // ── Patricio: Subsurface scattering rim shift ────────────────────
    // At grazing angles, light travels a longer path through the shell material.
    // In real obsidian (and all SSS materials), longer paths shift transmission
    // toward red/warm — shorter wavelengths scatter out, longer wavelengths penetrate.
    // This is the same physics that makes your ears glow red when backlit.
    // Subtle warm shift at high Fresnel: 20% shift toward warmer tones at full rim.
    vec3 sssWarmShift = transmitColor * vec3(1.3, 0.85, 0.6);  // warm-shifted version
    transmitColor = mix(transmitColor, sssWarmShift, vFresnel * 0.2);

    // ── Awaken-driven transmission ────────────────────────────────────
    // uAwaken controls how much light escapes:
    //   0.0 = dormant: only the thinnest fractures show faint glow
    //   0.5 = awakening: fracture network lights up, thin regions glow
    //   1.0 = alive: shell is mostly transparent, light pours through

    // Phase 1 (awaken 0.0–0.3): Fracture glow only — the first sign of life
    float fracGlow = fracture * thinness;
    float fracPhase = smoothstep(0.0, 0.3, uAwaken);

    // Phase 2 (awaken 0.2–0.6): Thin regions start transmitting
    // Patricio: thickness drives the awakening wavefront —
    // thin regions open FIRST, thick plates resist longer
    float thicknessDelay = vThickness * 0.25;  // thick regions delay awakening by up to 0.25
    // Anadol: zone-ordered awakening — active zones awaken before quiet zones
    // This creates a wavefront: active zones light up first, quiet zones follow
    float zoneDelay = (1.0 - zoneActivity) * 0.15;  // quiet zones delay by up to 0.15
    // IQ: per-plate identity shifts awakening timing
    float combinedDelay = thicknessDelay + zoneDelay + plateAwakenOffset;

    // ── Hodgin: Cascade awakening speed ─────────────────────────────
    // Once a crack opens, it accelerates. Thin regions transition FASTER
    // (narrow smoothstep range = snappy), thick plates transition SLOWER
    // (wide smoothstep range = grinding). Creates cascade effect:
    // thin regions snap open rapidly, thick plates resist and grind.
    float cascadeWidth = 0.3 + vThickness * 0.2;  // thin: 0.3 range, thick: 0.5 range
    float thinPhase = smoothstep(0.2 + combinedDelay, 0.2 + combinedDelay + cascadeWidth, uAwaken);

    // Phase 3 (awaken 0.5–1.0): Overall shell becomes transparent
    // Patricio: thick plates are the last to yield
    // Anadol: quiet zones are the last to go transparent
    // Hodgin: thick plates also grind slower into transparency
    float transCascade = 0.4 + vThickness * 0.15;
    float transPhase = smoothstep(0.5 + combinedDelay * 0.5, 0.5 + combinedDelay * 0.5 + transCascade, uAwaken);

    // Combined light transmission
    float transmission = 0.0;

    // ── Hodgin: Dormant breathing pulse ──────────────────────────────
    // ~8 BPM heartbeat — the single clue something lives inside.
    // Two overlapping sine waves: primary breath + subtle secondary flutter.
    // When dormant, the entire monolith pulses with barely perceptible life.
    float breathPrimary = 0.65 + 0.35 * sin(uTime * 0.42);    // ~6.4s cycle (~9.4 BPM)
    float breathSecondary = 0.85 + 0.15 * sin(uTime * 1.1);   // ~5.7s cycle, subtle flutter
    float dormantBreath = breathPrimary * breathSecondary;
    // Only affects dormant state — fades out as awaken increases
    float breathInfluence = 1.0 - smoothstep(0.0, 0.35, uAwaken);

    // Dormant: barely perceptible fracture glow — a whisper, not a tell.
    // Only the deepest fractures (fracGlow > 0.5) emit any light.
    // Modulated by breathing pulse (Hodgin) and spatial zone (Anadol).
    float dormantGlow = smoothstep(0.4, 0.8, fracGlow) * 0.035;
    dormantGlow *= mix(1.0, dormantBreath, breathInfluence);
    // Anadol: active zones glow brighter at dormant, quiet zones nearly invisible
    dormantGlow *= 0.4 + 0.6 * zoneActivity;
    // Patricio: stress boundaries glow slightly brighter even at dormant —
    // the first cracks appear where thin meets thick
    dormantGlow *= 1.0 + stressConcentration * 0.3;
    transmission += dormantGlow;

    // ── Hodgin: Pre-awakening flicker ────────────────────────────────
    // At awaken 0.05–0.15, before fractures truly ignite, rapid micro-pulses
    // flash and die — like a fluorescent tube trying to turn on.
    // 3-4 Hz flicker that appears briefly, telegraphing "something is about to happen."
    // Uses smoothstep envelope: fades in at 0.05, peaks at 0.10, fades out by 0.20.
    float flickerEnvelope = smoothstep(0.04, 0.08, uAwaken) * (1.0 - smoothstep(0.12, 0.22, uAwaken));
    // Rapid irregular flicker: multiple sin waves at different frequencies create
    // stuttering, non-periodic pulses
    float flicker1 = max(sin(uTime * 18.0), 0.0);         // ~2.9 Hz, half-wave rectified
    float flicker2 = max(sin(uTime * 25.0 + 1.3), 0.0);   // ~4.0 Hz, offset phase
    float flicker3 = max(sin(uTime * 11.0 + 2.7), 0.0);   // ~1.8 Hz, slower gate
    // Multiply for spiky, irregular pulses (only bright when multiple align)
    float flickerPulse = flicker1 * flicker2 + flicker3 * 0.3;
    flickerPulse = clamp(flickerPulse, 0.0, 1.0);
    // Apply: flicker adds temporary fracture transmission
    float flickerGlow = flickerEnvelope * flickerPulse * fracture * thinness * 0.25;
    transmission += flickerGlow;

    // Fracture phase: fractures light up dramatically
    // Anadol: spatial zones create bright fracture webs vs dim quiet regions
    float zonedFracGlow = fracGlow * (0.5 + 0.5 * zoneActivity);
    transmission += zonedFracGlow * fracPhase * 0.50;

    // Thin phase: broader transmission at thin areas
    // Patricio: thinPhase already delayed by thickness — thin regions lead
    transmission += thinness * thinPhase * 0.35;

    // Anadol: micro-detail adds transmission within plate interiors during awakening
    // Crystalline veins become light channels as the material dissolves
    transmission += microDetail * thinness * 0.20;

    // Alive phase: whole shell transmits
    transmission += transPhase * 0.55;

    // ── IQ: Spatially-varying inner light ──────────────────────────────
    // The inner sphere isn't uniformly bright — it has domain-warped FBM patterns
    // with bright and dark regions. Fractures positioned over a bright inner region
    // should glow more than fractures over a dark region.
    // Approximate the inner sphere's brightness at this shell position by projecting
    // toward center and sampling noise. This is cheaper than render-to-texture
    // and creates convincing spatial light variation.
    vec3 innerSamplePos = normalize(vLocalPos) * 0.8;  // sample slightly inside shell
    float innerBrightness = snoise(innerSamplePos * 2.5 + uTime * vec3(0.02, 0.015, 0.025));
    innerBrightness = 0.7 + 0.3 * innerBrightness;  // 0.4–1.0 range, biased bright
    float spatialInnerLight = uInnerLight * innerBrightness;

    transmission *= spatialInnerLight;
    transmission = clamp(transmission, 0.0, 1.0);

    // ── Fresnel rim ──────────────────────────────────────────────────
    // Glancing angles: more opaque (thicker effective path through shell)
    // Head-on: more transmission (thinner effective path)
    float rimDarken = 1.0 - pow(vFresnel, 2.0) * 0.6;
    transmission *= rimDarken;

    // Faint rim highlight — obsidian catches edge light (glassy)
    // Hodgin: rim pulses faintly with dormant breath
    float rimPulse = mix(1.0, 0.7 + 0.3 * dormantBreath, breathInfluence);
    float rimLight = pow(vFresnel, 4.0) * 0.04 * (1.0 - transPhase * 0.7) * rimPulse;

    // ── Compose ──────────────────────────────────────────────────────
    // Base obsidian + specular + transmitted light
    vec3 surfaceColor = obsidianBase + vec3(specular);
    surfaceColor += rimLight * vec3(0.4, 0.45, 0.5);  // cool rim highlight

    // Fracture line emission (brighter than transmission — concentrated light)
    // Anadol: spatial zone modulates emission intensity
    // IQ: per-plate identity modulates emission — each plate glows differently
    float fracEmission = fracture * fracPhase * spatialInnerLight * 0.6;
    fracEmission *= 0.4 + 0.6 * zoneActivity;  // quiet zones: subdued fracture emission
    fracEmission *= plateEmissionMod;  // IQ: per-plate emission variation (0.75–1.25×)

    // ── Patricio: Stress-concentration glow ──────────────────────────
    // Where thin meets thick, thermal stress is highest → fractures glow hotter.
    // This is physically correct: differential expansion creates concentrated stress
    // at material boundaries, which is exactly where cracks propagate hardest.
    // Stress boosts fracture emission by up to 50% at high-gradient boundaries.
    fracEmission *= 1.0 + stressConcentration * 0.5;

    // ── Patricio + Anadol: White-hot stress seams ─────────────────────
    // At stress boundaries, emission shifts toward white (blackbody curve).
    // Higher-energy points desaturate toward incandescent white.
    // NOVA stress: blue → white-cyan. CORE stress: amber → white-gold.
    // This creates thermal hierarchy: plate interiors glow one color,
    // stress boundaries glow a shifted, hotter color.
    vec3 stressColor = mix(transmitColor, vec3(1.0), stressConcentration * 0.18);
    vec3 fracColor = stressColor * 1.5 * fracEmission;

    // Also apply white-shift to transmitted light at stress boundaries
    vec3 stressTransmitColor = mix(transmitColor, vec3(0.85), stressConcentration * 0.10);
    vec3 transmittedLight2 = stressTransmitColor * transmission * 1.8;

    vec3 finalColor = surfaceColor + transmittedLight2 + fracColor;

    // ── Alpha ────────────────────────────────────────────────────────
    // Dormant: nearly opaque. Alive: semi-transparent (inner sphere shows through)
    // Patricio: thickness drives alpha — thin regions become windows first
    float baseAlpha = 1.0 - transPhase * 0.72;  // alive: 28% shell remains
    float fracAlpha = fracture * fracPhase * 0.25;  // fractures lose alpha during awakening
    float alpha = clamp(baseAlpha - fracAlpha, 0.08, 1.0);

    // Patricio: thin regions lose alpha faster during awakening.
    // At mid-awaken, thin regions are transparent windows while thick plates
    // remain opaque — creating a physically correct reveal sequence.
    float thicknessAlphaBoost = thinness * thinPhase * 0.28;  // increased from 0.18
    // Thick regions get slight alpha BOOST during mid-awaken (resist transparency)
    float thickResist = vThickness * smoothstep(0.3, 0.7, uAwaken) * (1.0 - transPhase) * 0.08;
    alpha -= thicknessAlphaBoost;
    alpha += thickResist;

    // Anadol: micro-detail creates crystalline transparency veins within plates
    // During awakening, plate interiors develop visible internal fracture networks
    alpha -= microDetail * 0.12;

    // At full alive, remaining thin regions more transparent than thick
    alpha -= thinness * transPhase * 0.15;
    alpha = clamp(alpha, 0.06, 1.0);

    // ── IQ: Soft energy capping ─────────────────────────────────────
    // Prevent non-bloom HDR blowout. Our additive composition
    // (surface + transmission + fracture emission) can exceed physical energy bounds.
    // Soft Reinhard tonemap: values below ~1.0 pass through nearly unchanged,
    // values above compress smoothly. Preserves HDR peaks for bloom while
    // preventing harsh clipping in non-bloom channels.
    // Only apply to color, not alpha.
    finalColor = finalColor / (1.0 + finalColor * 0.3);  // soft compression at high values

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
