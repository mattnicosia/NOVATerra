// PureCSSChart — Reusable div-based chart primitives
// No external chart libraries — everything is CSS + divs

import { useTheme } from "@/hooks/useTheme";

// ── Bar Chart ──
// data: [{ label, value, color? }], height: number, showLabels: bool, animate: bool
export function BarChart({
  data,
  height = 80,
  showLabels = true,
  showValues = false,
  animate = true,
  barColor,
  maxOverride,
}) {
  const C = useTheme();
  const T = C.T;
  if (!data || data.length === 0) return null;
  const maxVal = maxOverride || Math.max(...data.map(d => d.value));
  const minVal = Math.min(...data.map(d => d.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height, padding: "0 1px" }}>
        {data.map((d, i) => {
          const rawPct = maxVal > 0 ? ((d.value - Math.min(0, minVal)) / (maxVal - Math.min(0, minVal))) * 100 : 0;
          const pct = Math.min(100, rawPct);
          const h = Math.max(2, (pct / 100) * height);
          const color = d.color || barColor || C.accent;
          const isLast = i === data.length - 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              {showValues && isLast && (
                <div
                  style={{
                    fontSize: 7,
                    fontWeight: 700,
                    color,
                    fontFamily: T.font.sans,
                    whiteSpace: "nowrap",
                  }}
                >
                  {typeof d.value === "number" ? d.value.toLocaleString() : d.value}
                </div>
              )}
              <div
                style={{
                  width: "100%",
                  maxWidth: 20,
                  borderRadius: "2px 2px 0 0",
                  height: animate ? h : h,
                  background: `linear-gradient(180deg, ${color}, ${color}50)`,
                  transition: animate
                    ? "height 600ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 120ms ease-out"
                    : "filter 120ms ease-out",
                  opacity: isLast ? 1 : 0.7,
                  cursor: "pointer",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.filter = "brightness(1.3)";
                  e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.filter = "brightness(1)";
                  e.currentTarget.style.opacity = isLast ? "1" : "0.7";
                }}
                title={typeof d.value === "number" ? d.value.toLocaleString() : String(d.value)}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display: "flex", gap: 1, padding: "0 1px" }}>
          {data.map((d, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 7,
                fontFamily: T.font.sans,
                color: i === data.length - 1 ? C.text : C.textDim,
                fontWeight: i === data.length - 1 ? 700 : 400,
              }}
            >
              {d.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sparkline ──
// data: [number], height: number, color: string
export function Spark({ data, height = 24, color, width }) {
  const C = useTheme();
  if (!data || data.length === 0) return null;
  const c = color || C.accent;
  const maxVal = Math.max(...data);
  const minVal = Math.min(...data);
  const range = maxVal - minVal || 1;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height, width: width || "100%" }}>
      {data.map((v, i) => {
        const pct = ((v - minVal) / range) * 100;
        const h = Math.max(2, (pct / 100) * height);
        const isLast = i === data.length - 1;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 1,
              height: h,
              background: isLast ? c : `${c}60`,
              maxWidth: 4,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Range Bar ──
// Shows low-mid-high range with optional marker
export function RangeBar({ low, mid, high, marker, color, markerColor, markerLabel, height = 6 }) {
  const C = useTheme();
  const c = color || C.accent;
  const max = high * 1.1; // 10% padding
  const lowPct = (low / max) * 100;
  const highPct = (high / max) * 100;
  const midPct = (mid / max) * 100;
  const markerPct = marker ? (marker / max) * 100 : null;

  return (
    <div style={{ position: "relative", height: height + 12 }}>
      {/* Track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 6,
          height,
          borderRadius: height / 2,
          background: `${C.bg2}`,
        }}
      />
      {/* Range fill */}
      <div
        style={{
          position: "absolute",
          left: `${lowPct}%`,
          width: `${highPct - lowPct}%`,
          top: 6,
          height,
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${c}40, ${c}80)`,
        }}
      />
      {/* Mid marker */}
      <div
        style={{
          position: "absolute",
          left: `${midPct}%`,
          top: 3,
          width: 3,
          height: height + 6,
          background: c,
          borderRadius: 2,
          transform: "translateX(-1px)",
        }}
      />
      {/* External marker (industry) */}
      {markerPct !== null && (
        <>
          <div
            style={{
              position: "absolute",
              left: `${markerPct}%`,
              top: 2,
              width: 2,
              height: height + 8,
              background: markerColor || C.orange,
              borderRadius: 1,
              transform: "translateX(-1px)",
            }}
          />
          {markerLabel && (
            <div
              style={{
                position: "absolute",
                left: `${markerPct}%`,
                top: -8,
                transform: "translateX(-50%)",
                fontSize: 7,
                fontWeight: 600,
                color: markerColor || C.orange,
                whiteSpace: "nowrap",
              }}
            >
              {markerLabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Ring (donut chart) ──
// segments: [{ value, color, label }]
export function Ring({ segments, size = 80, thickness = 8, centerLabel, centerValue }) {
  const C = useTheme();
  const T = C.T;
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  // Build conic-gradient stops
  let stops = [];
  let cumPct = 0;
  segments.forEach(seg => {
    const pct = (seg.value / total) * 100;
    stops.push(`${seg.color} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  });

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(${stops.join(", ")})`,
        }}
      />
      {/* Inner cutout */}
      <div
        style={{
          position: "absolute",
          left: thickness,
          top: thickness,
          width: size - thickness * 2,
          height: size - thickness * 2,
          borderRadius: "50%",
          background: C.bg1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {centerValue && (
          <div style={{ fontSize: size * 0.2, fontWeight: 800, color: C.text, fontFamily: T.font.sans }}>
            {centerValue}
          </div>
        )}
        {centerLabel && <div style={{ fontSize: size * 0.1, color: C.textDim, fontWeight: 600 }}>{centerLabel}</div>}
      </div>
    </div>
  );
}

// ── Gradient Bar (horizontal) ──
export function GradientBar({ pct, color, height = 4, glow }) {
  const C = useTheme();
  return (
    <div style={{ height, borderRadius: height / 2, background: C.bg2, flex: 1, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          borderRadius: height / 2,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          boxShadow: glow ? `0 0 8px ${color}30` : "none",
          transition: "width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </div>
  );
}
