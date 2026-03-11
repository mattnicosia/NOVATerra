import { useRef, useEffect, useMemo } from "react";

/* ── AmbientBackground — star field, nebulas, vignette, grain ── */
export default function AmbientBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const tRef = useRef(0);

  // Generate star data once
  const stars = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 320; i++) {
      const rr = Math.random();
      arr.push({
        x: Math.random(),
        y: Math.random(),
        r: rr < 0.04 ? 1.0 + Math.random() * 0.5 : rr < 0.34 ? 0.5 + Math.random() * 0.4 : 0.2 + Math.random() * 0.35,
        a: 0.06 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
        warm: Math.random() < 0.38,
      });
    }
    return arr;
  }, []);

  // Generate nebula data once
  const nebulas = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 6; i++) {
      arr.push({
        x: 0.1 + Math.random() * 0.8,
        y: 0.1 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.00014,
        vy: (Math.random() - 0.5) * 0.00014,
      });
    }
    return arr;
  }, []);

  // PERF FIX: Removed mousemove listener — 3px parallax was imperceptible
  // but added 1 of 7 simultaneous document mousemove handlers.

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");

    // Debounced resize — canvas reallocation is expensive
    let resizeTimer = null;
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    const debouncedResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 200);
    };
    window.addEventListener("resize", debouncedResize);

    let lastFrame = 0;
    const draw = now => {
      if (document.hidden) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      // Throttle to ~20fps (50ms intervals) — stars/nebulas don't need 60fps
      if (now - lastFrame < 50) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrame = now;
      tRef.current += 0.006;
      const t = tRef.current;
      const W = c.width,
        H = c.height;

      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
      bg.addColorStop(0, "rgba(14,10,26,0.3)");
      bg.addColorStop(1, "#06060C");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Faint grid
      ctx.strokeStyle = "rgba(255,255,255,0.018)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 88) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 88) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Stars (no parallax — removed for perf, effect was imperceptible)
      for (const s of stars) {
        const sx = s.x * W,
          sy = s.y * H;
        const twinkle = 0.42 + 0.58 * Math.sin(t * 0.7 + s.phase);
        const alpha = s.a * twinkle;
        const color = s.warm ? `rgba(238,224,210,${alpha})` : `rgba(218,220,235,${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        // Bright star halo
        if (s.r > 1.0) {
          const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r * 5);
          halo.addColorStop(0, `rgba(200,200,240,${alpha * 0.3})`);
          halo.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(sx, sy, s.r * 5, 0, Math.PI * 2);
          ctx.fillStyle = halo;
          ctx.fill();
        }
      }

      // Nebulas
      for (let ni = 0; ni < nebulas.length; ni++) {
        const n = nebulas[ni];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0.08 || n.x > 0.92) n.vx *= -1;
        if (n.y < 0.08 || n.y > 0.92) n.vy *= -1;
        const nx = n.x * W,
          ny = n.y * H;
        const nr = 220;
        const na = ni < 2 ? 0.025 : 0.015;
        const ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, `rgba(109,40,217,${na})`);
        ng.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(nx, ny, nr, 0, Math.PI * 2);
        ctx.fillStyle = ng;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", debouncedResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [stars, nebulas]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />
      {/* Ambient CSS blobs */}
      <div
        style={{
          position: "fixed",
          width: 580,
          height: 580,
          top: -180,
          right: 60,
          borderRadius: "50%",
          filter: "blur(80px)",
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(ellipse, rgba(90,50,180,0.016) 0%, transparent 70%)",
          animation: "drift 22s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          position: "fixed",
          width: 420,
          height: 420,
          bottom: -100,
          left: 80,
          borderRadius: "50%",
          filter: "blur(80px)",
          pointerEvents: "none",
          zIndex: 0,
          background: "radial-gradient(ellipse, rgba(40,60,120,0.014) 0%, transparent 70%)",
          animation: "drift 28s ease-in-out infinite alternate-reverse",
        }}
      />
      <div
        style={{
          position: "fixed",
          width: 320,
          height: 320,
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
          background: "rgba(139,92,246,0.018)",
          animation: "breatheAmb 8s ease-in-out infinite",
        }}
      />
      {/* Vignette */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 36%, rgba(2,1,10,0.7) 100%)",
        }}
      />
      {/* Grain */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: 0.02,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
}
