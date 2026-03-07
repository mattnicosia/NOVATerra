// Atmosphere fragment shader — Fresnel-driven energy halo
// Renders on BackSide with AdditiveBlending for outer glow effect

export const atmosphereFragmentShader = /* glsl */ `
  uniform float uMorph;
  uniform float uIntensity;
  uniform float uPulse;
  uniform float uExhale;
  uniform float uTime;
  uniform vec3 uNovaGlow;   // NOVA atmosphere color
  uniform vec3 uCoreGlow;   // CORE atmosphere color

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);

    // Multi-layer Fresnel: tight rim + wide haze
    float rimTight = pow(fresnel, 3.0);
    float rimWide = pow(fresnel, 1.2);

    // Morph color
    vec3 glowColor = mix(uNovaGlow, uCoreGlow, uMorph);

    // Breathing animation — subtle organic pulse
    float breathe = 0.85 + 0.15 * sin(uTime * 0.7 + 1.5);

    // Pulse and exhale boost
    float boost = 1.0 + uPulse * 0.5 + uExhale * 0.4;

    // Combine layers: tight bright rim + wide soft haze
    // CORE: tighter rim, less haze — fusion reactors have sharp edges
    float rimTightWeight = mix(0.6, 0.45, uMorph);
    float rimWideWeight = mix(0.25, 0.10, uMorph);
    float glowAmount = rimTight * rimTightWeight + rimWide * rimWideWeight;
    glowAmount *= uIntensity * breathe * boost;

    // CORE: less atmospheric glow but still visible as thin rim
    float alphaScale = mix(0.60, 0.40, uMorph);
    float alphaMax = mix(0.65, 0.45, uMorph);
    float alpha = clamp(glowAmount * alphaScale, 0.0, alphaMax);

    float colorBoost = mix(1.2, 0.9, uMorph);
    gl_FragColor = vec4(glowColor * glowAmount * colorBoost, alpha);
  }
`;
