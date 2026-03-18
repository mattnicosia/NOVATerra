// VOLUMETRIC LIGHT SHAFT vertex shader — Atmospheric column from artifact to floor
// Passes local position for cylinder normal calculation in fragment shader
// Paul Franklin: "Every beam of light in a scene should have a reason to exist"

export const volumetricVertexShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vLocalPosition;

  void main() {
    vUv = uv;
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
