export default function FactorBar({ label, value, color, C }) {
  const T = C.T;
  const pct = Math.min(Math.max((value - 0.6) / 0.8, 0), 1) * 100;
  const natPct = ((1.0 - 0.6) / 0.8) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: value > 1.05 ? C.orange : value < 0.95 ? C.green : C.text,
            fontFamily: T.font.sans,
          }}
        >
          {value.toFixed(2)}×
        </span>
      </div>
      <div style={{ height: 6, background: C.bg2, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: `${natPct}%`,
            top: 0,
            width: 1,
            height: 6,
            background: `${C.textDim}40`,
            zIndex: 1,
          }}
        />
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            width: `${pct}%`,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}
