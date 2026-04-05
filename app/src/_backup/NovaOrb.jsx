import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

/* ────────────────────────────────────────────────────────
   NovaOrb — 160 px animated canvas sphere
   The visual soul of the dashboard. Theme-aware: renders in
   NOVA (purple), Matte (blue), and Light (indigo) schemes.
   ──────────────────────────────────────────────────────── */

const DEFAULT_SIZE = 160;

const LERP = 0.04;
const TICK = 0.008;

// ── color schemes ─────────────────────────────────────────
const SCHEMES = {
  // NOVA — galaxy violet/purple
  nova: {
    base: ['#18063C', '#0A031A', '#060210', '#020108'],
    arms: [
      { rgb: '115,45,235',  op: 0.78, r: 0.88 },
      { rgb: '155,85,255',  op: 0.58, r: 0.74 },
      { rgb: '95,35,210',   op: 0.46, r: 0.60 },
      { rgb: '185,135,255', op: 0.32, r: 0.50 },
    ],
    bloom: [
      { rgb: '215,175,255', op: 0.88 },
      { rgb: '150,78,255',  op: 0.68 },
      { rgb: '90,24,220',   op: 0.36 },
      { rgb: '60,10,160' },
    ],
    core: [
      { rgb: '255,255,255', op: 0.92 },
      { rgb: '200,160,255', op: 0.60 },
      { rgb: '120,60,220' },
    ],
    vig: '2,1,8',
    exhale: ['180,130,255', '100,40,220'],
    ring1:  'rgba(139,92,246,0.13)',
    ring2:  'rgba(167,139,250,0.07)',
    ringEq: 'rgba(167,139,250,0.12)',
    halo:   'radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(109,40,217,0.06) 50%, transparent 72%)',
    shadow:
      'drop-shadow(0 20px 60px rgba(109,40,217,0.35)) ' +
      'drop-shadow(0 8px 24px rgba(0,0,0,0.55)) ' +
      'drop-shadow(0 0 80px rgba(139,92,246,0.15))',
  },

  // MATTE — sleek blue on true black
  matte: {
    base: ['#041020', '#030A18', '#020610', '#010408'],
    arms: [
      { rgb: '10,110,235',  op: 0.68, r: 0.85 },
      { rgb: '60,155,255',  op: 0.48, r: 0.72 },
      { rgb: '0,75,200',    op: 0.38, r: 0.58 },
      { rgb: '100,195,255', op: 0.26, r: 0.48 },
    ],
    bloom: [
      { rgb: '160,215,255', op: 0.80 },
      { rgb: '10,132,255',  op: 0.58 },
      { rgb: '0,68,180',    op: 0.30 },
      { rgb: '0,40,120' },
    ],
    core: [
      { rgb: '255,255,255', op: 0.90 },
      { rgb: '140,205,255', op: 0.55 },
      { rgb: '10,100,220' },
    ],
    vig: '1,4,8',
    exhale: ['100,180,255', '10,80,200'],
    ring1:  'rgba(10,132,255,0.11)',
    ring2:  'rgba(100,210,255,0.06)',
    ringEq: 'rgba(100,210,255,0.10)',
    halo:   'radial-gradient(circle, rgba(10,132,255,0.10) 0%, rgba(0,85,210,0.05) 50%, transparent 72%)',
    shadow:
      'drop-shadow(0 20px 60px rgba(10,132,255,0.22)) ' +
      'drop-shadow(0 8px 24px rgba(0,0,0,0.65)) ' +
      'drop-shadow(0 0 80px rgba(10,132,255,0.08))',
  },

  // LIGHT — deep navy sphere with indigo energy (high contrast on white bg)
  light: {
    base: ['#0C1A38', '#081430', '#061028', '#040A1E'],
    arms: [
      { rgb: '0,90,220',    op: 0.72, r: 0.86 },
      { rgb: '60,130,255',  op: 0.52, r: 0.72 },
      { rgb: '0,65,185',    op: 0.40, r: 0.58 },
      { rgb: '90,165,255',  op: 0.28, r: 0.48 },
    ],
    bloom: [
      { rgb: '130,195,255', op: 0.82 },
      { rgb: '0,122,255',   op: 0.60 },
      { rgb: '0,58,165',    op: 0.32 },
      { rgb: '0,35,110' },
    ],
    core: [
      { rgb: '255,255,255', op: 0.94 },
      { rgb: '120,185,255', op: 0.58 },
      { rgb: '0,90,200' },
    ],
    vig: '4,10,30',
    exhale: ['90,165,255', '0,75,190'],
    ring1:  'rgba(0,122,255,0.15)',
    ring2:  'rgba(90,200,250,0.08)',
    ringEq: 'rgba(90,200,250,0.14)',
    halo:   'radial-gradient(circle, rgba(0,122,255,0.10) 0%, rgba(0,85,210,0.05) 50%, transparent 72%)',
    shadow:
      'drop-shadow(0 12px 40px rgba(0,90,200,0.22)) ' +
      'drop-shadow(0 4px 16px rgba(0,0,0,0.15)) ' +
      'drop-shadow(0 0 60px rgba(0,122,255,0.10))',
  },
};

// ── helpers ──────────────────────────────────────────────
function lerp(cur, tgt, k) { return cur + (tgt - cur) * k; }

function mapRange(v, lo, hi, oLo, oHi) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return oLo + t * (oHi - oLo);
}

// ── component ────────────────────────────────────────────
const NovaOrb = forwardRef(function NovaOrb({ onClick, scheme = 'nova', size = DEFAULT_SIZE }, ref) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  // Derived dimensions from size prop
  const RES = size * 2;
  const CX  = RES / 2;
  const CY  = RES / 2;

  // mutable state (no re-renders)
  const s = useRef({
    orbT:            0,
    intensity:       0.62,
    targetIntensity: 0.62,
    speed:           1,
    targetSpeed:     1,
    glow:            0.5,
    targetGlow:      0.5,
    exhaling:        false,
    exhaleProgress:  0,
  });

  // keep scheme and dimensions in refs so draw callback always sees current values
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  const dimsRef = useRef({ RES, CX, CY });
  dimsRef.current = { RES, CX, CY };

  // ── imperative API ─────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exhale() {
      s.current.exhaling = true;
      s.current.exhaleProgress = 0;
    },
    pulse() {
      s.current.targetIntensity += 0.14;
      setTimeout(() => {
        s.current.targetIntensity = Math.max(
          s.current.targetIntensity - 0.14,
          0.62,
        );
      }, 420);
    },
    setValueTarget(v) {
      const lo = 920000;
      const hi = 8750000;
      s.current.targetIntensity = mapRange(v, lo, hi, 0.48, 1);
      s.current.targetSpeed     = mapRange(v, lo, hi, 0.7, 1.6);
      s.current.targetGlow      = mapRange(v, lo, hi, 0.3, 1);
    },
  }));

  // ── render loop ────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const st = s.current;
    const P = SCHEMES[schemeRef.current] || SCHEMES.nova;
    const { RES: R, CX: cx, CY: cy } = dimsRef.current;

    // lerp state
    st.intensity = lerp(st.intensity, st.targetIntensity, LERP);
    st.speed     = lerp(st.speed, st.targetSpeed, LERP);
    st.glow      = lerp(st.glow, st.targetGlow, LERP);
    st.orbT     += TICK * st.speed;

    const I = st.intensity;

    ctx.clearRect(0, 0, R, R);

    // — Layer 1: base radial —
    const base = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    base.addColorStop(0,    P.base[0]);
    base.addColorStop(0.42, P.base[1]);
    base.addColorStop(0.82, P.base[2]);
    base.addColorStop(1,    P.base[3]);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, R, R);

    // — Layer 2: four nebula arms —
    for (const arm of P.arms) {
      const aIdx = P.arms.indexOf(arm);
      const offsets = [0, Math.PI, Math.PI * 0.55, Math.PI * 1.4];
      const angle = st.orbT + offsets[aIdx];
      const ex = cx + Math.cos(angle) * cx * arm.r;
      const ey = cy + Math.sin(angle) * cx * arm.r;
      const g  = ctx.createRadialGradient(cx, cy, 0, ex, ey, cx * arm.r);
      g.addColorStop(0, `rgba(${arm.rgb},${(arm.op * I).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, R, R);
    }

    // — Layer 3: bloom —
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx * 0.58);
    bloom.addColorStop(0,    `rgba(${P.bloom[0].rgb},${(P.bloom[0].op * I).toFixed(3)})`);
    bloom.addColorStop(0.18, `rgba(${P.bloom[1].rgb},${(P.bloom[1].op * I).toFixed(3)})`);
    bloom.addColorStop(0.5,  `rgba(${P.bloom[2].rgb},${(P.bloom[2].op * I).toFixed(3)})`);
    bloom.addColorStop(1,    `rgba(${P.bloom[3].rgb},0)`);
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, R, R);

    // — Layer 4: core —
    const cp    = 0.14 + 0.03 * Math.sin(st.orbT * 1.9);
    const coreR = cx * cp;
    const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0,   `rgba(${P.core[0].rgb},${(P.core[0].op * I).toFixed(3)})`);
    core.addColorStop(0.4, `rgba(${P.core[1].rgb},${(P.core[1].op * I).toFixed(3)})`);
    core.addColorStop(1,   `rgba(${P.core[2].rgb},0)`);
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, R, R);

    // — Layer 5: edge vignette —
    const vig = ctx.createRadialGradient(cx, cy, cx * 0.62, cx, cy, cx);
    vig.addColorStop(0, `rgba(${P.vig},0)`);
    vig.addColorStop(1, `rgba(${P.vig},0.74)`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, R, R);

    // — Layer 6: exhale bloom —
    if (st.exhaling) {
      st.exhaleProgress += 0.012;
      const ep    = st.exhaleProgress;
      const eR    = cx * (1.1 + ep * 1.8);
      const alpha = Math.max(0, 0.45 * (1 - ep));
      const ex    = ctx.createRadialGradient(cx, cy, eR * 0.85, cx, cy, eR);
      ex.addColorStop(0, `rgba(${P.exhale[0]},${alpha.toFixed(3)})`);
      ex.addColorStop(1, `rgba(${P.exhale[1]},0)`);
      ctx.fillStyle = ex;
      ctx.fillRect(0, 0, R, R);

      if (ep >= 1) {
        st.exhaling = false;
        st.exhaleProgress = 0;
      }
    }
  }, []);

  // ── RAF lifecycle ──────────────────────────────────────
  useEffect(() => {
    let active = true;

    function tick() {
      if (!active) return;
      if (!document.hidden) draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── resolve scheme colors for DOM elements ────────────
  const P = SCHEMES[scheme] || SCHEMES.nova;

  // ── render ─────────────────────────────────────────────
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: size,
        height: size,
        cursor: 'pointer',
        flexShrink: 0,
        perspective: 600,
        transformStyle: 'preserve-3d',
        filter: P.shadow,
      }}
    >
      {/* Halo */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          inset: -28 * (size / DEFAULT_SIZE),
          background: P.halo,
          animation: 'breatheOrb 5s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Ring A */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          border: `1px solid ${P.ring1}`,
          animation: 'spinSlow 22s linear infinite',
          inset: -10 * (size / DEFAULT_SIZE),
          pointerEvents: 'none',
        }}
      />

      {/* Ring B */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          border: `1px solid ${P.ring2}`,
          animation: 'spinSlow 15s linear infinite reverse',
          inset: 8 * (size / DEFAULT_SIZE),
          pointerEvents: 'none',
        }}
      />

      {/* Ring C — equatorial */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          inset: -4 * (size / DEFAULT_SIZE),
          animation: 'spinSlow 34s linear infinite',
          transform: 'rotateX(72deg)',
          transformStyle: 'preserve-3d',
          borderTop: '1px solid transparent',
          borderBottom: '1px solid transparent',
          borderLeft: `1px solid ${P.ringEq}`,
          borderRight: `1px solid ${P.ringEq}`,
          pointerEvents: 'none',
        }}
      />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={RES}
        height={RES}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'block',
        }}
      />
    </div>
  );
});

NovaOrb.displayName = 'NovaOrb';

export default NovaOrb;
