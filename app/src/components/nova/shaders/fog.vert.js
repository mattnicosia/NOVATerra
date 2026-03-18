// GROUND FOG vertex shader — Atmospheric haze at floor level
// Paul Franklin: "Fog is what separates a 3D scene from a movie set.
// It's how the eye knows the space has depth."

export const fogVertexShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDir = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
