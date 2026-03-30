import { useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";

/* ────────────────────────────────────────────────────────
   LiveFeedWidget — scrolling material price ticker
   ──────────────────────────────────────────────────────── */

const TICKERS = [
  ["Lumber 2\u00d74", "$0.42/LF", "up", "\u25b21.2%"],
  ["Copper Wire", "$4.82/lb", "dn", "\u25bc0.9%"],
  ["Concrete 4K", "$188/CY", "up", "\u25b23.2%"],
  ["Rebar #4", "$0.72/lb", "fl", "\u2014"],
  ["Drywall 5/8", "$14.20/sh", "up", "\u25b20.4%"],
  ["Insulation R-19", "$1.08/SF", "dn", "\u25bc1.1%"],
  ['PVC 4"', "$6.40/LF", "fl", "\u2014"],
  ["Steel HSS", "$0.84/lb", "dn", "\u25bc0.8%"],
  ["Glass IG", "$32/SF", "up", "\u25b22.1%"],
  ["Paint Int", "$0.58/SF", "fl", "\u2014"],
];

export default function LiveFeedWidget() {
  const C = useTheme();
  const T = C.T;
  const font = T.font.display;
  const isDk = C.isDark;
  const ov = a => (isDk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    offsetRef.current += 0.15;
    const halfHeight = el.scrollHeight / 2;
    if (offsetRef.current >= halfHeight) offsetRef.current -= halfHeight;
    el.style.transform = `translateY(-${offsetRef.current}px)`;
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  const doubledTickers = [...TICKERS, ...TICKERS];

  const sectionLabelStyle = {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.textDim,
    fontFamily: font,
    margin: 0,
  };

  return (
    <div style={{ fontFamily: font, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ marginBottom: 8 }}>
        <span style={sectionLabelStyle}>LIVE MATERIAL FEED</span>
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Fade overlays removed — were causing black bands on top/bottom */}

        <div ref={scrollRef} style={{ willChange: "transform" }}>
          {doubledTickers.map(([name, price, trend, change], i) => {
            const pillColor = trend === "up" ? C.green : trend === "dn" ? C.red : C.textMuted;
            const pillBg = trend === "up" ? `${C.green}14` : trend === "dn" ? `${C.red}14` : ov(0.04);

            return (
              <div
                key={i}
                style={{
                  height: 33,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  borderBottom: `1px solid ${C.borderLight}`,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: C.textMuted,
                    fontFamily: font,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
                <span style={{ fontSize: 10, fontWeight: 500, color: C.text, fontFamily: font, flexShrink: 0 }}>
                  {price}
                </span>
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    fontFamily: font,
                    color: pillColor,
                    background: pillBg,
                    border: `1px solid ${trend === "up" ? `${C.green}26` : trend === "dn" ? `${C.red}26` : C.borderLight}`,
                    borderRadius: 20,
                    padding: "1px 6px",
                    minWidth: 32,
                    textAlign: "center",
                    lineHeight: "14px",
                    flexShrink: 0,
                  }}
                >
                  {change}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom fade removed */}
      </div>
    </div>
  );
}
