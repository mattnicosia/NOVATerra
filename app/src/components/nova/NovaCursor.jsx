import { useRef, useEffect, useCallback } from 'react';
import { useTakeoffsStore } from '@/stores/takeoffsStore';

/* ── NovaCursor — color-shifting orb ──
   Idle:      teal/emerald dot + ring + green particles
   Measuring: vivid purple dot + expanded ring + purple particles + glow  */
export default function NovaCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const rxRef = useRef(0);
  const ryRef = useRef(0);
  const mxRef = useRef(0);
  const myRef = useRef(0);
  const pfxRef = useRef([]);
  const animRef = useRef(null);
  const measuringRef = useRef(false);

  useEffect(() => {
    // Hide default cursor
    document.documentElement.classList.add('nova-cursor-active');

    const dot = dotRef.current;
    const ring = ringRef.current;
    const pc = particleCanvasRef.current;
    if (!dot || !ring || !pc) return;

    const pctx = pc.getContext('2d');
    const resize = () => { pc.width = window.innerWidth; pc.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Mouse move
    const onMove = (e) => {
      mxRef.current = e.clientX;
      myRef.current = e.clientY;
      dot.style.left = e.clientX + 'px';
      dot.style.top = e.clientY + 'px';

      // Spawn particle — color depends on mode
      if (Math.random() < 0.22) {
        const m = measuringRef.current;
        pfxRef.current.push({
          x: e.clientX, y: e.clientY,
          vx: (Math.random() - 0.5) * 1.1,
          vy: (Math.random() - 0.5) * 1.1 - 0.25,
          life: 1,
          decay: 0.048 + Math.random() * 0.028,
          r: m ? 1.2 + Math.random() * 1.8 : 0.8 + Math.random() * 1.4,
          hue: m ? 255 + Math.random() * 35 : 155 + Math.random() * 20, // purple vs teal
          sat: m ? 75 : 60,
          lum: m ? 72 : 65,
        });
      }
    };

    // Click ripple
    const onClick = (e) => {
      const r = document.createElement('div');
      r.className = 'nova-ripple';
      r.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:48px;height:48px;`;
      document.body.appendChild(r);
      r.addEventListener('animationend', () => r.remove());
    };

    // Hover detection via delegation
    const onEnter = (e) => {
      const target = e.target.closest('[data-interactive], button, a, input, textarea, select');
      if (target) ring.classList.add('nova-ring-hovering');
    };
    const onLeave = (e) => {
      const target = e.target.closest('[data-interactive], button, a, input, textarea, select');
      if (target) ring.classList.remove('nova-ring-hovering');
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('click', onClick);
    document.addEventListener('mouseenter', onEnter, true);
    document.addEventListener('mouseleave', onLeave, true);

    // ── Takeoff measuring mode detection ──
    let prevMeasuring = false;
    const unsubTk = useTakeoffsStore.subscribe((state) => {
      const measuring = state.tkMeasureState === 'measuring';
      if (measuring === prevMeasuring) return;
      prevMeasuring = measuring;
      measuringRef.current = measuring;
      if (dot) {
        dot.style.width = measuring ? '10px' : '6px';
        dot.style.height = measuring ? '10px' : '6px';
        dot.style.background = measuring ? '#A78BFA' : '#10B981';
        dot.style.boxShadow = measuring
          ? '0 0 16px #8B5CF6, 0 0 36px rgba(139,92,246,0.55)'
          : '0 0 8px #10B981, 0 0 18px rgba(16,185,129,0.30)';
      }
      if (ring) {
        ring.style.width = measuring ? '36px' : '28px';
        ring.style.height = measuring ? '36px' : '28px';
        ring.style.borderColor = measuring ? 'rgba(167,139,250,0.55)' : 'rgba(16,185,129,0.25)';
        ring.style.borderWidth = measuring ? '2px' : '1px';
      }
    });

    // RAF loop — lerp ring + particles
    const loop = () => {
      // Lerp ring
      rxRef.current += (mxRef.current - rxRef.current) * 0.10;
      ryRef.current += (myRef.current - ryRef.current) * 0.10;
      ring.style.left = rxRef.current + 'px';
      ring.style.top = ryRef.current + 'px';

      // Particles
      if (!document.hidden) {
        pctx.clearRect(0, 0, pc.width, pc.height);
        const pfx = pfxRef.current;
        for (let i = pfx.length - 1; i >= 0; i--) {
          const p = pfx[i];
          p.x += p.vx; p.y += p.vy;
          p.vy -= 0.012;
          p.life -= p.decay;
          if (p.life <= 0) { pfx.splice(i, 1); continue; }
          pctx.beginPath();
          pctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
          pctx.fillStyle = `hsla(${p.hue},${p.sat || 75}%,${p.lum || 72}%,${p.life * 0.45})`;
          pctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      document.documentElement.classList.remove('nova-cursor-active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mouseenter', onEnter, true);
      document.removeEventListener('mouseleave', onLeave, true);
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      unsubTk();
    };
  }, []);

  return (
    <>
      {/* Cursor dot — starts teal, shifts to purple when measuring */}
      <div ref={dotRef} style={{
        position: 'fixed', width: 6, height: 6, borderRadius: '50%',
        background: '#10B981', pointerEvents: 'none', zIndex: 9999,
        transform: 'translate(-50%,-50%)',
        boxShadow: '0 0 8px #10B981, 0 0 18px rgba(16,185,129,0.30)',
        transition: 'width 0.25s, height 0.25s, background 0.3s, box-shadow 0.3s',
      }} />
      {/* Cursor ring — teal when idle, vivid purple when measuring */}
      <div ref={ringRef} className="nova-cursor-ring" style={{
        position: 'fixed', width: 28, height: 28, borderRadius: '50%',
        border: '1px solid rgba(16,185,129,0.25)', pointerEvents: 'none', zIndex: 9998,
        transform: 'translate(-50%,-50%)',
        transition: 'width 0.3s cubic-bezier(0.34,1.56,0.64,1), height 0.3s cubic-bezier(0.34,1.56,0.64,1), border-color 0.3s, border-width 0.2s',
      }} />
      {/* Particle canvas */}
      <canvas ref={particleCanvasRef} style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
      }} />
    </>
  );
}
