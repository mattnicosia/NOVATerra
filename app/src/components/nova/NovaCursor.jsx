import { useRef, useEffect } from "react";
import { useTakeoffsStore } from "@/stores/takeoffsStore";

/* ── NovaCursor — NOVA orb cursor ──
   Idle:      teal dot + ring with tiny NOVA orb
   Measuring: vivid purple dot + expanded ring + purple NOVA orb + glow
   Predictions active: ring lerps toward nearest prediction (scout-ahead)
   NO particle canvas — pure DOM + CSS transforms for zero overhead.
   Scoped to drawing canvas only — deactivates in estimate mode and non-takeoff pages. */

export default function NovaCursor() {
  const tkPanelTier = useTakeoffsStore(s => s.tkPanelTier);
  const isDrawingVisible = tkPanelTier !== "estimate";
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const orbRef = useRef(null);
  const rxRef = useRef(0);
  const ryRef = useRef(0);
  const mxRef = useRef(0);
  const myRef = useRef(0);
  const animRef = useRef(null);
  const measuringRef = useRef(false);
  const predsRef = useRef(null); // tkPredictions snapshot

  useEffect(() => {
    if (!isDrawingVisible) {
      document.documentElement.classList.remove("nova-cursor-active");
      return;
    }

    // Hide default cursor (only when drawing is visible)
    document.documentElement.classList.add("nova-cursor-active");

    const dot = dotRef.current;
    const ring = ringRef.current;
    const orb = orbRef.current;
    if (!dot || !ring) return;

    // Mouse move — update dot immediately via transform (GPU-composited, no layout thrash)
    const onMove = e => {
      mxRef.current = e.clientX;
      myRef.current = e.clientY;
      dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    };

    // Click ripple
    const onClick = e => {
      const r = document.createElement("div");
      r.className = "nova-ripple";
      r.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:48px;height:48px;`;
      document.body.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    };

    // Hover detection via delegation
    const onEnter = e => {
      if (!e.target || !e.target.closest) return;
      const target = e.target.closest("[data-interactive], button, a, input, textarea, select");
      if (target) ring.classList.add("nova-ring-hovering");
    };
    const onLeave = e => {
      if (!e.target || !e.target.closest) return;
      const target = e.target.closest("[data-interactive], button, a, input, textarea, select");
      if (target) ring.classList.remove("nova-ring-hovering");
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("click", onClick);
    document.addEventListener("mouseenter", onEnter, true);
    document.addEventListener("mouseleave", onLeave, true);

    // ── Takeoff measuring mode detection ──
    let prevMeasuring = false;
    const unsubTk = useTakeoffsStore.subscribe(state => {
      const measuring = state.tkMeasureState === "measuring";
      if (measuring !== prevMeasuring) {
        prevMeasuring = measuring;
        measuringRef.current = measuring;
        if (dot) {
          dot.style.width = measuring ? "10px" : "6px";
          dot.style.height = measuring ? "10px" : "6px";
          dot.style.background = measuring ? "#A78BFA" : "#10B981";
          dot.style.boxShadow = measuring
            ? "0 0 16px #8B5CF6, 0 0 36px rgba(139,92,246,0.55)"
            : "0 0 8px #10B981, 0 0 18px rgba(16,185,129,0.30)";
        }
        if (ring) {
          ring.style.width = measuring ? "36px" : "28px";
          ring.style.height = measuring ? "36px" : "28px";
          ring.style.borderColor = measuring ? "rgba(167,139,250,0.55)" : "rgba(16,185,129,0.25)";
          ring.style.borderWidth = measuring ? "2px" : "1px";
        }
        if (orb) {
          orb.style.opacity = measuring ? "0.85" : "0.55";
          // Update orb SVG fill via CSS filter — teal→purple
          orb.style.filter = measuring ? "hue-rotate(90deg) saturate(1.4) brightness(1.1)" : "none";
        }
      }
      // Update predictions ref for scout-ahead
      predsRef.current = state.tkPredictions;
    });

    // ── RAF loop — lerp ring (+ optional scout-ahead toward nearest prediction) ──
    // PERF: Uses transform3d instead of left/top (GPU compositor, no layout thrash).
    // Caches nearest prediction to skip recalc when predictions haven't changed.
    // Throttled to ~30fps via frame-skip flag to reduce GPU overhead.
    let frameSkip = false;
    let cachedNearestX = 0;
    let cachedNearestY = 0;
    let cachedNearestDist = Infinity;
    let lastPreds = null;

    const loop = () => {
      // Throttle to ~30fps — skip every other frame
      frameSkip = !frameSkip;
      if (frameSkip) {
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      let targetX = mxRef.current;
      let targetY = myRef.current;

      // Scout-ahead: when predictions are active, bias ring toward nearest prediction
      const preds = predsRef.current;
      if (preds && preds.predictions && preds.predictions.length > 0) {
        const mx = mxRef.current;
        const my = myRef.current;

        // Only recalculate nearest when predictions ref changes
        if (preds !== lastPreds) {
          lastPreds = preds;
          cachedNearestDist = Infinity;
          cachedNearestX = mx;
          cachedNearestY = my;
          for (const pred of preds.predictions) {
            let px, py;
            if (pred.point) {
              px = pred.point.x;
              py = pred.point.y;
            } else if (pred.points && pred.points.length > 0) {
              px = pred.points[0].x;
              py = pred.points[0].y;
            } else {
              continue;
            }
            const dx = px - mx;
            const dy = py - my;
            const d2 = dx * dx + dy * dy; // skip sqrt for comparison
            if (d2 < cachedNearestDist) {
              cachedNearestDist = d2;
              cachedNearestX = px;
              cachedNearestY = py;
            }
          }
          cachedNearestDist = Math.sqrt(cachedNearestDist);
        }

        if (cachedNearestDist < 250) {
          const scoutFactor = Math.max(0, 1 - cachedNearestDist / 250) * 0.35;
          targetX = mx + (cachedNearestX - mx) * scoutFactor;
          targetY = my + (cachedNearestY - my) * scoutFactor;
        }
      } else {
        lastPreds = null;
      }

      // Lerp ring toward target — GPU-composited via transform3d
      rxRef.current += (targetX - rxRef.current) * 0.1;
      ryRef.current += (targetY - ryRef.current) * 0.1;
      ring.style.transform = `translate3d(${rxRef.current}px, ${ryRef.current}px, 0) translate(-50%, -50%)`;

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      document.documentElement.classList.remove("nova-cursor-active");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("click", onClick);
      document.removeEventListener("mouseenter", onEnter, true);
      document.removeEventListener("mouseleave", onLeave, true);
      cancelAnimationFrame(animRef.current);
      unsubTk();
    };
  }, [isDrawingVisible]);

  if (!isDrawingVisible) return null;

  return (
    <>
      {/* Cursor dot — teal idle, purple measuring. Uses transform3d for GPU compositing. */}
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#10B981",
          pointerEvents: "none",
          zIndex: 9999,
          willChange: "transform",
          transform: "translate3d(-50%, -50%, 0)",
          boxShadow: "0 0 8px #10B981, 0 0 18px rgba(16,185,129,0.30)",
          transition: "width 0.25s, height 0.25s, background 0.3s, box-shadow 0.3s",
        }}
      />
      {/* Cursor ring with NOVA orb — teal idle, purple measuring. Uses transform3d for GPU compositing. */}
      <div
        ref={ringRef}
        className="nova-cursor-ring"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "1px solid rgba(16,185,129,0.25)",
          pointerEvents: "none",
          zIndex: 9998,
          willChange: "transform",
          transform: "translate3d(-50%, -50%, 0)",
          transition:
            "width 0.3s cubic-bezier(0.34,1.56,0.64,1), height 0.3s cubic-bezier(0.34,1.56,0.64,1), border-color 0.3s, border-width 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* NOVA orb — tiny abstract diamond/sparkle inside the ring */}
        <svg
          ref={orbRef}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          style={{
            opacity: 0.55,
            transition: "opacity 0.3s, filter 0.3s",
            filter: "none",
          }}
        >
          {/* Abstract NOVA diamond sparkle */}
          <path
            d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z"
            fill="#10B981"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="0.5"
          />
          {/* Inner glow point */}
          <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.4)" />
        </svg>
      </div>
    </>
  );
}
