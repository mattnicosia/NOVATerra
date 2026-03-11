// AmbientParticles — Full-viewport atmospheric particle system
// Renders subtle floating light motes that give the app a living, breathing quality.
// Renders on a low-fps canvas (~20fps) layered behind all content.
// Particle density and color shift based on NOVA state.
import { useRef, useEffect, useCallback } from "react";
import { useNovaStore } from "@/stores/novaStore";

const PARTICLE_COUNT = 60;
const TARGET_FPS = 20;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

function createParticle(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.15,
    vy: -(Math.random() * 0.2 + 0.05),
    size: Math.random() * 1.8 + 0.4,
    opacity: Math.random() * 0.04 + 0.01,
    phase: Math.random() * Math.PI * 2,
    life: Math.random(),
  };
}

export default function AmbientParticles() {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animRef = useRef(null);
  const lastFrameRef = useRef(0);
  const statusRef = useRef("idle");

  // Sync NOVA status via ref to avoid re-render
  useEffect(() => {
    return useNovaStore.subscribe(state => {
      statusRef.current = state.status;
    });
  }, []);

  // PERF FIX: Removed mousemove listener — mouse repulsion at 0.01-0.05 opacity
  // was invisible to users but added 1 of 7 simultaneous document mousemove handlers.

  // Handle resize — debounced to avoid expensive canvas reallocation spam
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let resizeTimer = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1); // render at 1x for perf
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };
    window.addEventListener("resize", debouncedResize);
    return () => {
      window.removeEventListener("resize", debouncedResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, []);

  // Initialize particles
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => createParticle(w, h));
  }, []);

  const draw = useCallback(time => {
    animRef.current = requestAnimationFrame(draw);

    // Throttle to target FPS
    if (time - lastFrameRef.current < FRAME_INTERVAL) return;
    lastFrameRef.current = time;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const particles = particlesRef.current;
    const status = statusRef.current;
    const t = time * 0.001;

    ctx.clearRect(0, 0, w, h);

    // State-dependent color tint
    let baseR = 160,
      baseG = 140,
      baseB = 255; // default: soft purple
    let speedMult = 1;
    if (status === "thinking") {
      baseR = 100;
      baseG = 180;
      baseB = 255; // blue shift
      speedMult = 1.8;
    } else if (status === "alert") {
      baseR = 255;
      baseG = 160;
      baseB = 80; // warm amber
      speedMult = 1.2;
    } else if (status === "affirm") {
      baseR = 140;
      baseG = 255;
      baseB = 180; // green glow
      speedMult = 0.6;
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Drift
      p.x += p.vx * speedMult;
      p.y += p.vy * speedMult;

      // Subtle sine wave horizontal drift
      p.x += Math.sin(t * 0.3 + p.phase) * 0.08;

      // Breathe opacity
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.5 + p.phase);
      const alpha = p.opacity * (0.7 + breathe * 0.3);

      // PERF FIX: Removed mouse repulsion (was running sqrt on 60 particles per frame
      // for an effect invisible at 0.01-0.05 opacity)

      // Reset if off-screen
      if (p.y < -10 || p.x < -10 || p.x > w + 10) {
        p.x = Math.random() * w;
        p.y = h + 10;
        p.life = 0;
      }

      // Draw particle with soft radial gradient
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
      grad.addColorStop(0, `rgba(${baseR},${baseG},${baseB},${alpha})`);
      grad.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.7,
      }}
    />
  );
}
