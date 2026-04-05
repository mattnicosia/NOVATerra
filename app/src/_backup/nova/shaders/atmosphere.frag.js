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
  varying vec2 vScreenNDC;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);

    // ── Turbulent edge ──────────────────────────────────────────
    vec3 localDir = normalize(vWorldPosition);
    float angle1 = atan(localDir.x, localDir.z);
    float angle2 = atan(localDir.y, length(localDir.xz));

    // v11.2: Turbulence gated by morph — NOVA: smooth stellar halo, CORE: turbulent
    // NOVA atmosphere should be perfectly smooth (stars don't have bumpy halos)
    float turbAmount = uMorph * uMorph;  // morph² — zero at NOVA, full at CORE
    float edgeTurb = sin(angle1 * 5.0 + uTime * 1.0) * 0.10
                   + sin(angle2 * 7.0 + uTime * 0.8 + 2.0) * 0.07
                   + sin(angle1 * 10.0 + angle2 * 4.0 + uTime * 1.5) * 0.04;

    float turbFresnel = fresnel + edgeTurb * fresnel * turbAmount;
    turbFresnel = clamp(turbFresnel, 0.0, 1.0);

    // v11.4b: Scale 1.04 — tighter hug. Higher Fresnel powers = no inner band.
    // Concentrated at the very rim to avoid visible seam between body and atmosphere.
    float rimTight = pow(turbFresnel, 4.5);    // bright inner accent (was 3.0)
    float rimMedium = pow(turbFresnel, 2.5);   // soft halo (was 1.8)
    float rimOuter = pow(turbFresnel, 1.8);    // faint outer reach (was 1.3)

    // Multi-hue glow — shifts toward CYAN/BLUE only (never pink)
    float hueShift = sin(uTime * 0.15) * 0.05;
    float rimHue = sin(angle1 * 2.0 + uTime * 0.3) * 0.06;
    // rimHue SUBTRACTS from R, ADDS to G+B → cyan shifts, no pink
    vec3 novaShifted = uNovaGlow + vec3(-rimHue * 0.3 + hueShift * 0.1, rimHue * 0.4 + hueShift * 0.1, rimHue * 0.3 + hueShift * 0.2);
    vec3 coreShifted = uCoreGlow + vec3(hueShift * 0.15, hueShift * 0.1, -hueShift * 0.08);
    vec3 glowColor = mix(novaShifted, coreShifted, uMorph);

    // Inner ring — v11.4b: cooler blue-violet matching body palette
    vec3 innerNova = vec3(0.12, 0.10, 0.92);
    vec3 innerCore = vec3(1.0, 0.70, 0.20);
    vec3 innerColor = mix(innerNova, innerCore, uMorph);

    // Outer halo — v11.4b: cooler indigo-blue, not violet
    vec3 outerNova = vec3(0.10, 0.08, 0.42);
    vec3 outerCore = vec3(0.30, 0.15, 0.02);
    vec3 outerColor = mix(outerNova, outerCore, uMorph);

    // Gentle breathing
    float breathe = 0.88 + 0.12 * sin(uTime * 0.6 + 1.0);

    // Pulse/exhale boost
    float boost = 1.0 + uPulse * 0.5 + uExhale * 0.3;

    // v11.4b: NOVA: visible corona (42%), CORE: full volcanic atmosphere.
    float atmosStrength = 0.42 + smoothstep(0.15, 0.5, uMorph) * 0.58;

    // v11.4b: Inner cutoff — atmosphere fades to ZERO where it overlaps the body.
    // At NOVA: only visible where Fresnel > 0.60 (outer edge only → no seam).
    // At CORE: no cutoff (full volcanic atmosphere everywhere).
    // This is the key fix: the atmosphere only appears BEYOND the body edge,
    // never as a visible band ON the body's surface.
    float innerCutoff = mix(0.55, 0.0, uMorph);  // 0.55 at NOVA, 0 at CORE
    float rimFade = smoothstep(innerCutoff, innerCutoff + 0.20, turbFresnel);

    vec3 rimResult = innerColor * rimTight * mix(0.95, 0.70, uMorph) * breathe
                   + glowColor * rimMedium * mix(0.50, 0.30, uMorph)
                   + outerColor * rimOuter * mix(0.12, 0.05, uMorph);
    rimResult *= uIntensity * boost * atmosStrength * rimFade;

    // Subtle organic flicker
    float flicker = 0.93 + 0.07 * sin(uTime * 5.0 + angle1 * 10.0);
    rimResult *= flicker;

    // Alpha — 3-layer with inner cutoff applied
    float glowAmount = rimTight * mix(0.95, 0.70, uMorph)
                     + rimMedium * mix(0.30, 0.18, uMorph)
                     + rimOuter * mix(0.06, 0.02, uMorph);
    glowAmount *= uIntensity * boost * flicker * atmosStrength * rimFade;
    float alpha = clamp(glowAmount * mix(0.68, 0.52, uMorph), 0.0, mix(0.72, 0.58, uMorph));

    // v11.2: Edge fade — prevent atmosphere from clipping at canvas boundary.
    // NDC computed in vertex shader (projectionMatrix not available in fragment).
    float edgeDist = max(abs(vScreenNDC.x), abs(vScreenNDC.y));  // 0 at center, 1 at edge
    float edgeFade = 1.0 - smoothstep(0.82, 1.0, edgeDist);  // fade in outer 18%
    alpha *= edgeFade;
    rimResult *= edgeFade;

    gl_FragColor = vec4(rimResult * mix(1.3, 1.2, uMorph), alpha);
  }
`;
