// NovaPresence — The canonical NOVA visual entity.
// Single WebGL fragment shader rendering an SDF sphere with subsurface
// scattering, internal flow currents, halo bloom, and a 5-state machine.
// Same component renders identically at 16px (chat tab) and 400px (hero).
//
// States: dormant | sensing | thinking | speaking | resolved
// All uniforms lerp between states for smooth transitions — no jumps.
//
// Props:
//   size      — pixel diameter (square canvas)
//   state     — current emotional state
//   accent    — base hex color (defaults to theme accent #7C6BF0)
//   live      — true = WebGL, false = lightweight SVG fallback
//   trackCursor — when true (and state="sensing"), orb leans toward pointer

import { useEffect, useRef } from "react";

// ─── Vertex shader — full-screen quad ────────────────────────────
const VS = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

// ─── Fragment shader — volumetric SDF orb with subsurface + halo ──
const FS = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform vec2 u_lean;
uniform float u_inward;
uniform float u_outward;
uniform float u_warmth;
uniform float u_haloSize;
uniform float u_breath;
uniform vec3 u_accent;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0,0.0)), hash21(i + vec2(1.0,0.0)), u.x),
    mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = u_resolution.xy;
  vec2 uv = (gl_FragCoord.xy * 2.0 - res) / min(res.x, res.y);

  // Lean toward pointer (sensing state)
  vec2 puv = uv - u_lean * 0.08;

  float dist = length(puv);
  float radius = 0.55 + u_breath * 0.025 * (0.5 + u_intensity * 0.5);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  // ── Sphere body ──
  float bodyMask = smoothstep(radius + 0.005, radius - 0.025, dist);

  if (bodyMask > 0.0) {
    float z = sqrt(max(0.0, radius * radius - dist * dist));
    vec3 normal = normalize(vec3(puv, z));

    vec3 lightDir = normalize(vec3(-0.4, 0.5, 0.9));
    float ndotl = max(0.0, dot(normal, lightDir));

    // Internal flow — spiral inward (thinking) / outward (speaking)
    vec2 flowCoord = puv * 2.5;
    float ang = atan(puv.y, puv.x);
    vec2 spiral = vec2(cos(ang), sin(ang));
    flowCoord -= spiral * u_inward * 0.5;
    flowCoord += spiral * u_outward * 0.5;
    flowCoord += vec2(u_time * 0.04, u_time * 0.07);

    float flow = fbm(flowCoord);
    float flow2 = fbm(flowCoord * 1.7 - vec2(u_time * 0.03));

    // Subsurface — light through the core
    float subsurface = pow(max(0.0, 1.0 - dist / radius), 1.8);

    // State-shifted color
    vec3 baseColor = u_accent;
    vec3 warmColor = mix(u_accent, vec3(1.0, 0.85, 0.95), 0.6);
    vec3 coolColor = mix(u_accent, vec3(0.4, 0.3, 0.85), 0.65);
    vec3 stateColor = baseColor;
    stateColor = mix(stateColor, warmColor, max(0.0, u_warmth));
    stateColor = mix(stateColor, coolColor, max(0.0, -u_warmth));

    // Layered shading
    col += stateColor * ndotl * 0.4;
    col += stateColor * subsurface * (0.7 + u_intensity * 0.5);
    col += stateColor * flow * 0.25 * u_intensity * subsurface;
    col += vec3(1.0) * flow2 * flow2 * 0.15 * u_intensity * subsurface;

    // Hot core
    float core = pow(max(0.0, 1.0 - dist / (radius * 0.35)), 4.0);
    col += mix(stateColor, vec3(1.0), 0.7) * core * (0.4 + u_intensity * 0.5);

    // Specular highlight
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(0.0, dot(viewDir, reflectDir)), 16.0);
    col += vec3(1.0) * spec * 0.4;

    // Rim shadow
    float rim = pow(1.0 - ndotl, 2.5);
    col *= mix(1.0, 0.55, rim * 0.4);

    alpha = bodyMask;
  }

  // Halo bloom
  float haloRadius = radius * (1.0 + u_haloSize);
  float haloFade = exp(-pow(dist / haloRadius * 1.8, 1.4)) * 0.55 * u_intensity;
  vec3 haloColor = mix(u_accent, vec3(1.0, 0.95, 1.0), 0.2);
  col += haloColor * haloFade * (1.0 - bodyMask);
  alpha = max(alpha, haloFade * 0.7);

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

// ─── State → uniform target values ────────────────────────────────
function stateToUniforms(state) {
  switch (state) {
    case "dormant":  return { intensity: 0.42, inward: 0.0,  outward: 0.0,  warmth:  0.0,  haloSize: 0.65 };
    case "sensing":  return { intensity: 0.6,  inward: 0.0,  outward: 0.0,  warmth:  0.1,  haloSize: 0.85 };
    case "thinking": return { intensity: 1.0,  inward: 0.85, outward: 0.0,  warmth: -0.45, haloSize: 1.0 };
    case "speaking": return { intensity: 0.9,  inward: 0.0,  outward: 0.7,  warmth:  0.35, haloSize: 1.35 };
    case "resolved": return { intensity: 1.3,  inward: 0.0,  outward: 1.0,  warmth:  0.55, haloSize: 1.7 };
    default:         return { intensity: 0.42, inward: 0.0,  outward: 0.0,  warmth:  0.0,  haloSize: 0.65 };
  }
}

const lerp = (a, b, t) => a + (b - a) * t;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("[NovaPresence] shader compile:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function hexToRgb(hex) {
  const m = hex.replace("#", "").match(/.{2}/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(h => parseInt(h, 16) / 255) : [0.486, 0.42, 0.94];
}

// ─── SVG fallback — used when live=false or WebGL unavailable ────
function NovaPresenceStatic({ size, accent, state }) {
  const palette = stateToUniforms(state);
  const intensity = palette.intensity;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `radial-gradient(circle at 35% 32%, #ffffff${Math.round(intensity * 80).toString(16).padStart(2, "0")}, ${accent} 38%, ${accent}cc 70%, ${accent}55)`,
      boxShadow: `0 0 ${Math.round(size * 0.4 * intensity)}px ${accent}99, inset 0 0 ${Math.round(size * 0.15)}px ${accent}aa`,
    }} />
  );
}

// ─── Main component ──────────────────────────────────────────────
export default function NovaPresence({
  size = 18,
  state = "dormant",
  accent = "#7C6BF0",
  live = true,
  trackCursor = false,
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const cursorRef = useRef([0, 0]);
  const targetRef = useRef(stateToUniforms(state));
  const currentRef = useRef(stateToUniforms(state));
  const stateRef = useRef(state);
  const rafRef = useRef(0);
  const fallbackRef = useRef(false);

  // Update target when state changes
  useEffect(() => {
    stateRef.current = state;
    targetRef.current = stateToUniforms(state);
  }, [state]);

  // Cursor tracking (only active when sensing + trackCursor)
  useEffect(() => {
    if (!trackCursor) return;
    const onMove = (e) => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / Math.max(window.innerWidth, 1);
      const dy = -(e.clientY - cy) / Math.max(window.innerHeight, 1);
      cursorRef.current = [Math.max(-1, Math.min(1, dx * 5)), Math.max(-1, Math.min(1, dy * 5))];
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [trackCursor]);

  // WebGL setup + render loop
  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: false,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) { fallbackRef.current = true; return; }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { fallbackRef.current = true; return; }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[NovaPresence] program link:", gl.getProgramInfoLog(program));
      fallbackRef.current = true;
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);

    const u = {
      res:       gl.getUniformLocation(program, "u_resolution"),
      time:      gl.getUniformLocation(program, "u_time"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      lean:      gl.getUniformLocation(program, "u_lean"),
      inward:    gl.getUniformLocation(program, "u_inward"),
      outward:   gl.getUniformLocation(program, "u_outward"),
      warmth:    gl.getUniformLocation(program, "u_warmth"),
      haloSize:  gl.getUniformLocation(program, "u_haloSize"),
      breath:    gl.getUniformLocation(program, "u_breath"),
      accent:    gl.getUniformLocation(program, "u_accent"),
    };

    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform3f(u.accent, ...hexToRgb(accent));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const t0 = performance.now();
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const t = (performance.now() - t0) / 1000;

      // Lerp toward target
      const k = 0.08;
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.intensity = lerp(cur.intensity, tgt.intensity, k);
      cur.inward    = lerp(cur.inward,    tgt.inward,    k);
      cur.outward   = lerp(cur.outward,   tgt.outward,   k);
      cur.warmth    = lerp(cur.warmth,    tgt.warmth,    k);
      cur.haloSize  = lerp(cur.haloSize,  tgt.haloSize,  k);

      const breath = Math.sin(t * 0.6) * 0.5 + 0.5;
      const lean = (trackCursor && stateRef.current === "sensing") ? cursorRef.current : [0, 0];

      gl.uniform1f(u.time, t);
      gl.uniform1f(u.intensity, cur.intensity);
      gl.uniform2f(u.lean, lean[0], lean[1]);
      gl.uniform1f(u.inward, cur.inward);
      gl.uniform1f(u.outward, cur.outward);
      gl.uniform1f(u.warmth, cur.warmth);
      gl.uniform1f(u.haloSize, cur.haloSize);
      gl.uniform1f(u.breath, breath);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }, [size, accent, live, trackCursor]);

  if (!live || fallbackRef.current) {
    return (
      <div className={className} style={style}>
        <NovaPresenceStatic size={size} accent={accent} state={state} />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: size,
        height: size,
        display: "block",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
