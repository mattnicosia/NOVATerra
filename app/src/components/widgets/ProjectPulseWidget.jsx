import { useRef, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";

/* ────────────────────────────────────────────────────────
   ProjectPulse — Radial particle field visualization
   Output VST-inspired (Portal/Thermal). Each estimate is a
   particle orbiting a central core. Sized by value, colored
   by status. Subtle Brownian drift + mouse interaction.
   Canvas 2D, 30fps throttled, prefers-reduced-motion aware.
   ──────────────────────────────────────────────────────── */

// Parse hex to {r,g,b}
const hexRgb = hex => {
  const h = (hex || "#8B5CF6").replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  };
};

// Format dollar value
const fmtVal = v => {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  if (v > 0) return `$${v.toLocaleString()}`;
  return "$0";
};

// Draw wide-tracked uppercase text (Canvas has no letterSpacing)
const drawTracked = (ctx, text, x, y, spacing = 1.5) => {
  const chars = text.split("");
  let tw = 0;
  for (const ch of chars) tw += ctx.measureText(ch).width + spacing;
  tw -= spacing; // no trailing space
  let cx = x - tw / 2;
  for (const ch of chars) {
    const cw = ctx.measureText(ch).width;
    ctx.fillText(ch, cx + cw / 2, y);
    cx += cw + spacing;
  }
};

export default function ProjectPulseWidget() {
  const C = useTheme();
  const T = C.T;
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const mountTimeRef = useRef(performance.now());
  const { sortedEstimates, benchmarks } = useDashboardData();

  // Status → color mapping
  const colorMap = useMemo(
    () => ({
      Won: C.green,
      Bidding: C.blue,
      Submitted: C.blue,
      "On Hold": C.orange,
      Lost: C.textDim,
      Cancelled: C.textDim,
      default: C.accent,
    }),
    [C],
  );

  // Initialize / update particles from estimates
  useEffect(() => {
    const prev = particlesRef.current;
    const count = sortedEstimates.length || 0;
    const particles = sortedEstimates.map((est, i) => {
      const existing = prev.find(p => p.id === est.id);
      const baseAngle = (Math.PI * 2 * i) / Math.max(count, 1);
      const angle = existing?.angle ?? baseAngle + (Math.random() - 0.5) * 0.4;
      const dist = existing?.dist ?? 0.3 + Math.random() * 0.35;
      const maxVal = Math.max(...sortedEstimates.map(e => e.grandTotal || 0), 1);
      const normVal = Math.sqrt((est.grandTotal || 0) / maxVal);
      const size = Math.max(2.5, Math.min(10, 2.5 + normVal * 7.5));
      return {
        id: est.id,
        status: est.status,
        value: est.grandTotal || 0,
        color: colorMap[est.status] || colorMap.default,
        size,
        angle,
        dist,
        targetAngle: baseAngle + (Math.random() - 0.5) * 0.3,
        targetDist: 0.3 + Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 0.002,
        phase: existing?.phase ?? Math.random() * Math.PI * 2,
        ox: existing?.ox ?? 0, // offset for mouse push
        oy: existing?.oy ?? 0,
      };
    });
    particlesRef.current = particles;
  }, [sortedEstimates, colorMap]);

  // Main draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersRM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = 0;
    const interval = 1000 / 30; // 30 fps

    const draw = ts => {
      if (ts - last < interval) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      last = ts;

      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w < 10 || h < 10) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      const midX = w / 2;
      const midY = h / 2;
      const radius = Math.min(w, h) * 0.4;
      const particles = particlesRef.current;
      const { r: ar, g: ag, b: ab } = hexRgb(C.accent);
      const accentRgba = a => `rgba(${ar},${ag},${ab},${a})`;

      // ── Clear ──
      ctx.clearRect(0, 0, w, h);

      // ── Outer ring with glow ──
      ctx.beginPath();
      ctx.arc(midX, midY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = accentRgba(0.1);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner ring
      ctx.beginPath();
      ctx.arc(midX, midY, radius * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = accentRgba(0.05);
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // ── Radial ray lines ──
      const rays = Math.max(8, particles.length);
      for (let i = 0; i < rays; i++) {
        const a = (Math.PI * 2 * i) / rays;
        ctx.beginPath();
        ctx.moveTo(midX + Math.cos(a) * 18, midY + Math.sin(a) * 18);
        ctx.lineTo(midX + Math.cos(a) * radius, midY + Math.sin(a) * radius);
        ctx.strokeStyle = accentRgba(0.035);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ── Particles ──
      const mouse = mouseRef.current;
      for (const p of particles) {
        // Animate
        if (!prefersRM) {
          p.angle += p.drift;
          p.phase += 0.015;
          const wobble = Math.sin(p.phase) * 0.008;
          p.dist += (p.targetDist + wobble - p.dist) * 0.03;
        }

        let px = midX + Math.cos(p.angle) * radius * p.dist;
        let py = midY + Math.sin(p.angle) * radius * p.dist;

        // Mouse repulsion
        if (!prefersRM && mouse.x > 0) {
          const dx = px - mouse.x;
          const dy = py - mouse.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 80 && d > 0) {
            const force = ((80 - d) / 80) * 6;
            p.ox += (dx / d) * force * 0.15;
            p.oy += (dy / d) * force * 0.15;
          }
        }
        // Decay offset
        p.ox *= 0.92;
        p.oy *= 0.92;
        px += p.ox;
        py += p.oy;

        // Connection line to center
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(px, py);
        const lineHex = p.color.replace("#", "");
        const lr = parseInt(lineHex.substring(0, 2), 16) || 128;
        const lg = parseInt(lineHex.substring(2, 4), 16) || 128;
        const lb = parseInt(lineHex.substring(4, 6), 16) || 128;
        ctx.strokeStyle = `rgba(${lr},${lg},${lb},0.08)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Particle glow halo
        const grd = ctx.createRadialGradient(px, py, 0, px, py, p.size * 3.5);
        grd.addColorStop(0, `rgba(${lr},${lg},${lb},0.25)`);
        grd.addColorStop(1, `rgba(${lr},${lg},${lb},0.0)`);
        ctx.beginPath();
        ctx.arc(px, py, p.size * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Particle core
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      // ── Center dot — NOVA 2.0: subtle, no glow gradient ──
      ctx.beginPath();
      ctx.arc(midX, midY, 2, 0, Math.PI * 2);
      ctx.fillStyle = accentRgba(0.35);
      ctx.fill();

      // ── Text labels ──
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Pipeline total (center) — NOVA 2.0: hero 48px
      const pipeline = benchmarks.pipeline || 0;
      const heroSize = Math.min(48, w * 0.1);
      ctx.font = `700 ${heroSize}px 'Switzer', sans-serif`;
      ctx.fillStyle = C.text;
      ctx.fillText(fmtVal(pipeline), midX, midY - 14);

      // "PIPELINE" label — 11px, 0.15em tracking
      ctx.font = `600 11px 'Switzer', sans-serif`;
      ctx.fillStyle = C.textDim;
      drawTracked(ctx, "PIPELINE", midX, midY + heroSize * 0.35, 2.0);

      // Top axis label — estimate count
      ctx.font = `600 ${Math.min(9, w * 0.022)}px 'Switzer', sans-serif`;
      ctx.fillStyle = C.textDim;
      drawTracked(ctx, `${particles.length} ESTIMATES`, midX, midY - radius - 14, 1.2);

      // Bottom axis label — win rate
      const winStr = benchmarks.winRate != null ? `${benchmarks.winRate}% WIN RATE` : "";
      if (winStr) {
        drawTracked(ctx, winStr, midX, midY + radius + 14, 1.2);
      }

      // Left axis — open bids
      if (benchmarks.openBids > 0) {
        ctx.save();
        ctx.translate(midX - radius - 14, midY);
        ctx.rotate(-Math.PI / 2);
        drawTracked(ctx, `${benchmarks.openBids} OPEN BIDS`, 0, 0, 1.2);
        ctx.restore();
      }

      // ── Status bars — NOVA 2.0: 800ms grow animation on mount ──
      const elapsed = ts - mountTimeRef.current;
      const barProgress = Math.min(1, elapsed / 800); // 0→1 over 800ms
      const ease = 1 - Math.pow(1 - barProgress, 3); // cubic ease-out
      const barY = midY + heroSize * 0.35 + 18;
      const barW = Math.min(120, w * 0.25);
      const barH = 3;
      const barGap = 14;
      const barStartX = midX - barW / 2;

      const wonCount = sortedEstimates.filter(e => e.status === "Won").length;
      const biddingCount = sortedEstimates.filter(e => e.status === "Bidding" || e.status === "Submitted").length;
      const lostCount = sortedEstimates.filter(e => e.status === "Lost").length;
      const maxCount = Math.max(wonCount, biddingCount, lostCount, 1);

      const bars = [
        { label: "WON", count: wonCount, color: C.green },
        { label: "BIDDING", count: biddingCount, color: C.blue },
        { label: "LOST", count: lostCount, color: C.textDim },
      ];

      bars.forEach((bar, bi) => {
        const by = barY + bi * barGap;
        // Label
        ctx.font = `600 8px 'Switzer', sans-serif`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.textDim;
        ctx.fillText(bar.label, barStartX - 6, by + barH / 2);
        // Track
        ctx.beginPath();
        ctx.roundRect(barStartX, by, barW, barH, barH / 2);
        ctx.fillStyle = accentRgba(0.06);
        ctx.fill();
        // Fill — animated
        const fillW = (bar.count / maxCount) * barW * ease;
        if (fillW > 0) {
          ctx.beginPath();
          ctx.roundRect(barStartX, by, fillW, barH, barH / 2);
          ctx.fillStyle = bar.color;
          ctx.globalAlpha = 0.8;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // Count
        ctx.font = `600 9px 'Switzer', sans-serif`;
        ctx.textAlign = "left";
        ctx.fillStyle = bar.color;
        ctx.fillText(`${bar.count}`, barStartX + barW + 6, by + barH / 2);
      });
      ctx.textAlign = "center"; // reset

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [C, T, benchmarks, sortedEstimates]);

  // Mouse handlers
  const onMove = useCallback(e => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
  }, []);

  // Empty state
  if (!sortedEstimates.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: T.type.label?.fontSize || 10,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: 1.5,
          }}
        >
          PROJECT PULSE
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
          Create estimates to see your portfolio visualized
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
    />
  );
}
