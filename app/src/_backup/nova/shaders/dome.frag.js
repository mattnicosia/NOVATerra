// VAULT DOME fragment shader — subtle architectural ceiling
//
// Paul Franklin: "The ceiling of the tesseract wasn't a flat plane —
// it was suggested through light gradients. You felt enclosed without
// ever seeing a surface."
//
// Technique:
//   - Hemisphere mesh rendered from BackSide (inside looking out)
//   - Very dark gradient — almost invisible, but gives enclosure
//   - Slightly brighter at the base/horizon to suggest reflected floor light
//   - Faint artifact glow at zenith where shaft light would scatter
//   - No noise — clean architectural gradient for contrast with noisy elements

export const domeFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uAwaken;
  uniform float uMorph;
  uniform float uInnerLight;

  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying vec3 vViewDir;    // v14: For Fresnel-driven rim reflection

  void main() {
    // Height in local space: 0 at equator, 1 at zenith
    float h = normalize(vLocalPosition).y;
    h = clamp(h, 0.0, 1.0);

    // ── 1. Base gradient — darker at top, slightly lighter at horizon ──
    // Suggests reflected light from the floor bouncing up
    float horizonGlow = pow(1.0 - h, 4.0) * 0.08;

    // ── 2. Zenith glow — artifact light scattered at ceiling ──────────
    // Very subtle — where the volumetric shaft would hit the ceiling
    float zenithGlow = pow(h, 3.0) * 0.04;

    // ── v14: Fresnel-driven rim reflection ─────────────────────────────
    // At grazing angles, the dome surface catches reflected artifact light.
    // This makes the dome architecture subtly visible at the edges during
    // high awakening — you feel the enclosure without ever seeing a hard surface.
    vec3 viewN = normalize(vViewDir);
    vec3 domeNormal = normalize(vLocalPosition);  // outward-facing normal for dome
    float domeFresnel = 1.0 - abs(dot(viewN, domeNormal));
    domeFresnel = pow(domeFresnel, 3.0);
    float fresnelRim = domeFresnel * uAwaken * uInnerLight * 0.06;

    // ── 3. Color — tinted by artifact state ────────────────────────────
    vec3 novaBase = vec3(0.01, 0.01, 0.03);
    vec3 coreBase = vec3(0.03, 0.015, 0.005);
    vec3 baseColor = mix(novaBase, coreBase, uMorph);

    // Horizon tint — warmer, catching reflected floor light
    vec3 novaHorizon = vec3(0.02, 0.015, 0.06);
    vec3 coreHorizon = vec3(0.06, 0.03, 0.01);
    vec3 horizonColor = mix(novaHorizon, coreHorizon, uMorph);

    // Zenith tint — colored by the shaft light
    vec3 novaZenith = vec3(0.04, 0.02, 0.12);
    vec3 coreZenith = vec3(0.12, 0.06, 0.02);
    vec3 zenithColor = mix(novaZenith, coreZenith, uMorph);

    // Fresnel rim color — tinted by artifact state
    vec3 novaRimColor = vec3(0.06, 0.08, 0.25);
    vec3 coreRimColor = vec3(0.25, 0.12, 0.03);
    vec3 rimColor = mix(novaRimColor, coreRimColor, uMorph);

    // ── 4. Combine ──────────────────────────────────────────────────
    vec3 color = baseColor;
    color += horizonColor * horizonGlow;
    color += zenithColor * zenithGlow * uAwaken * uInnerLight;
    color += rimColor * fresnelRim;

    // Overall brightness scales with artifact activity
    float activity = 0.3 + 0.7 * uAwaken * uInnerLight;
    color *= activity;

    // ── 5. Output — barely visible architectural suggestion ─────────
    // v14: Fresnel increases alpha at grazing angles during high awaken
    float alpha = horizonGlow + zenithGlow * uAwaken * uInnerLight + fresnelRim + 0.02;
    alpha = clamp(alpha, 0.0, 0.20);  // v14: raised cap from 0.15 to 0.20 for rim

    gl_FragColor = vec4(color, alpha);
  }
`;
