// VAULT DOME vertex shader — subtle architectural ceiling
// Paul Franklin: "In every Interstellar environment, there's a ceiling —
// even if you can barely see it. It tells the audience they're inside something."

export const domeVertexShader = /* glsl */ `
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;
  varying vec3 vViewDir;    // v14: For Fresnel-driven rim reflection

  void main() {
    vLocalPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vViewDir = cameraPosition - worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
