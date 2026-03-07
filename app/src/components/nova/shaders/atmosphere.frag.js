// Atmosphere fragment shader v8 — TIGHT rim glow, no center wash
// Only visible at the very edge of the sphere — does NOT brighten the interior

export const atmosphereFragmentShader = /* glsl */ `
  uniform float uMorph;
  uniform float uIntensity;
  uniform float uPulse;
  uniform float uExhale;
  uniform float uTime;
  uniform vec3 uNovaGlow;
  uniform vec3 uCoreGlow;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);

    // ── Turbulent edge ──────────────────────────────────────────
    vec3 localDir = normalize(vWorldPosition);
    float angle1 = atan(localDir.x, localDir.z);
    float angle2 = atan(localDir.y, length(localDir.xz));

    // Gentle turbulence — graceful, not chaotic
    float edgeTurb = sin(angle1 * 5.0 + uTime * 1.0) * 0.10
                   + sin(angle2 * 7.0 + uTime * 0.8 + 2.0) * 0.07
                   + sin(angle1 * 10.0 + angle2 * 4.0 + uTime * 1.5) * 0.04;

    float turbFresnel = fresnel + edgeTurb * fresnel;
    turbFresnel = clamp(turbFresnel, 0.0, 1.0);

    // v9: Wider ethereal glow — extends further from sphere edge
    float rimTight = pow(turbFresnel, 4.0);    // narrow bright edge accent
    float rimMedium = pow(turbFresnel, 2.0);   // wider soft glow (was 2.8)

    // Color
    float hueShift = sin(uTime * 0.15) * 0.06;
    vec3 novaShifted = uNovaGlow + vec3(hueShift * 0.2, -hueShift * 0.1, hueShift * 0.3);
    vec3 coreShifted = uCoreGlow + vec3(hueShift * 0.15, hueShift * 0.1, -hueShift * 0.08);
    vec3 glowColor = mix(novaShifted, coreShifted, uMorph);

    // Inner ring color for multi-hue
    vec3 innerNova = vec3(0.20, 0.50, 0.90);
    vec3 innerCore = vec3(1.0, 0.70, 0.20);
    vec3 innerColor = mix(innerNova, innerCore, uMorph);

    // Gentle breathing
    float breathe = 0.88 + 0.12 * sin(uTime * 0.6 + 1.0);

    // Pulse/exhale boost
    float boost = 1.0 + uPulse * 0.5 + uExhale * 0.3;

    // v9: Vivid rim — brighter and more colorful
    vec3 rimResult = innerColor * rimTight * mix(0.90, 0.70, uMorph) * breathe
                   + glowColor * rimMedium * mix(0.45, 0.28, uMorph);
    rimResult *= uIntensity * boost;

    // Subtle organic flicker
    float flicker = 0.92 + 0.08 * sin(uTime * 6.0 + angle1 * 12.0);
    rimResult *= flicker;

    // Alpha — visible rim but no center wash
    float glowAmount = rimTight * mix(0.90, 0.70, uMorph) + rimMedium * mix(0.25, 0.15, uMorph);
    glowAmount *= uIntensity * boost * flicker;
    float alpha = clamp(glowAmount * mix(0.65, 0.50, uMorph), 0.0, mix(0.70, 0.55, uMorph));

    gl_FragColor = vec4(rimResult * mix(1.5, 1.15, uMorph), alpha);
  }
`;
