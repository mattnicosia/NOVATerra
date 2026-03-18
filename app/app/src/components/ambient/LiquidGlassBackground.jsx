import { useTheme } from "@/hooks/useTheme";

/* ── LiquidGlassBackground — theme-aware ambient mesh ──
   Four rendering paths:
   1. Nero — pure black void (no mesh)
   2. Texture mode — transparent (bgGradient handles all atmosphere)
   3. Custom mesh (car themes) — reads C.mesh for per-theme atmosphere
   4. Default mesh (original themes) — vivid 6-blob rainbow on dark/light base
*/

// Convert float alpha (0.35) to 2-digit hex string ("59")
function alphaHex(a) {
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, "0");
}

export default function LiquidGlassBackground() {
  const C = useTheme();

  // ── NERO NEMESIS: void atmosphere ──
  if (C.neroMode) {
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "#000000" }} />
      </div>
    );
  }

  // ── TEXTURE MODE: bgGradient handles all atmosphere — no blobs ──
  if (C.textureMode) {
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }} />
      </div>
    );
  }

  // ── CUSTOM MESH (car themes + any palette with mesh defined) ──
  if (C.mesh) {
    return (
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        {/* Base gradient — the car's environment tone */}
        <div style={{ position: "absolute", inset: 0, background: C.mesh.base }} />

        {/* Blobs — large ambient color fields */}
        {C.mesh.blobs.map((b, i) => (
          <div
            key={`b${i}`}
            style={{
              position: "absolute",
              width: b.size,
              height: b.size,
              top: b.y,
              left: b.x,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${b.color}${alphaHex(b.alpha)} 0%, ${b.color}${alphaHex(b.alpha * 0.4)} 40%, transparent 65%)`,
              filter: `blur(${b.blur}px)`,
              animation: `meshFloat${(i % 5) + 1} ${25 + i * 4}s ease-in-out infinite${i % 2 ? " reverse" : ""}`,
              willChange: "transform",
            }}
          />
        ))}

        {/* Caustics — concentrated light points */}
        {C.mesh.caustics.map((c, i) => (
          <div
            key={`c${i}`}
            style={{
              position: "absolute",
              width: c.size,
              height: c.size,
              top: c.y,
              left: c.x,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${c.color}${alphaHex(c.alpha)} 0%, transparent 55%)`,
              filter: `blur(${c.blur}px)`,
              animation: `meshFloat${((i + 2) % 5) + 1} ${18 + i * 3}s ease-in-out infinite reverse`,
              willChange: "transform",
            }}
          />
        ))}
      </div>
    );
  }

  // ── DEFAULT MESH (original themes without custom mesh) ──
  const accent = C.accent || "#007AFF";
  const alt = C.accentAlt || "#5AC8FA";
  const purple = C.purple || "#BF5AF2";
  const cyan = C.cyan || "#64D2FF";
  const green = C.green || "#30D158";

  const dk = C.isDark;
  const o = (lightVal, darkVal) => (dk ? darkVal : lightVal);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {/* ── BASE ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: dk
            ? "linear-gradient(135deg, #08081a 0%, #0a0a1e 20%, #0c0818 40%, #080e1a 60%, #0a0814 80%, #0c0a1e 100%)"
            : "linear-gradient(135deg, #dde4ff 0%, #d4e0ff 20%, #e2d8ff 40%, #d0f0e8 60%, #d4ecff 80%, #e4daff 100%)",
        }}
      />

      {/* Large accent blob — top-left */}
      <div
        style={{
          position: "absolute",
          width: "60vw",
          height: "60vw",
          minWidth: 600,
          minHeight: 600,
          top: "-20%",
          left: "-15%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}${o("99", "99")} 0%, ${accent}${o("55", "55")} 35%, ${accent}${o("22", "22")} 55%, transparent 70%)`,
          filter: `blur(${o("55px", "50px")})`,
          animation: "meshFloat1 25s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Purple blob — top-right */}
      <div
        style={{
          position: "absolute",
          width: "50vw",
          height: "50vw",
          minWidth: 450,
          minHeight: 450,
          top: "-10%",
          right: "-12%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${purple}${o("90", "90")} 0%, ${purple}${o("45", "45")} 35%, ${purple}${o("18", "18")} 55%, transparent 70%)`,
          filter: `blur(${o("58px", "55px")})`,
          animation: "meshFloat2 32s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Cyan wash — bottom-center */}
      <div
        style={{
          position: "absolute",
          width: "65vw",
          height: "55vw",
          minWidth: 600,
          minHeight: 500,
          bottom: "-25%",
          left: "20%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cyan}${o("80", "80")} 0%, ${alt}${o("40", "40")} 35%, transparent 65%)`,
          filter: `blur(${o("60px", "55px")})`,
          animation: "meshFloat3 35s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Warm rose spot — bottom-left */}
      <div
        style={{
          position: "absolute",
          width: "40vw",
          height: "40vw",
          minWidth: 400,
          minHeight: 400,
          bottom: "0%",
          left: "-10%",
          borderRadius: "50%",
          background: dk
            ? "radial-gradient(circle, rgba(255,60,100,0.55) 0%, rgba(255,40,80,0.20) 40%, transparent 65%)"
            : "radial-gradient(circle, rgba(255,80,120,0.52) 0%, rgba(255,55,95,0.22) 40%, transparent 65%)",
          filter: `blur(${o("60px", "50px")})`,
          animation: "meshFloat4 28s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Center bridge */}
      <div
        style={{
          position: "absolute",
          width: "45vw",
          height: "45vw",
          minWidth: 450,
          minHeight: 450,
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}${o("55", "55")} 0%, ${purple}${o("28", "28")} 40%, transparent 65%)`,
          filter: "blur(80px)",
          animation: "meshFloat1 30s ease-in-out infinite reverse",
          willChange: "transform",
        }}
      />

      {/* Terra green blob — mid-right */}
      <div
        style={{
          position: "absolute",
          width: "45vw",
          height: "45vw",
          minWidth: 420,
          minHeight: 420,
          top: "35%",
          right: "-8%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${green}${o("70", "85")} 0%, ${green}${o("30", "40")} 35%, ${green}${o("10", "15")} 55%, transparent 70%)`,
          filter: `blur(${o("62px", "50px")})`,
          animation: "meshFloat5 29s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* ── CAUSTIC SPOTS ── */}
      <div
        style={{
          position: "absolute",
          width: "18vw",
          height: "18vw",
          minWidth: 180,
          minHeight: 180,
          top: "8%",
          left: "35%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}${o("65", "70")} 0%, ${accent}${o("30", "30")} 40%, transparent 60%)`,
          filter: `blur(${o("30px", "25px")})`,
          animation: "meshFloat4 18s ease-in-out infinite reverse",
          willChange: "transform",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: "15vw",
          height: "15vw",
          minWidth: 160,
          minHeight: 160,
          top: "40%",
          right: "10%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${purple}${o("60", "70")} 0%, transparent 55%)`,
          filter: "blur(25px)",
          animation: "meshFloat2 20s ease-in-out infinite reverse",
          willChange: "transform",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: "14vw",
          height: "14vw",
          minWidth: 150,
          minHeight: 150,
          bottom: "15%",
          left: "45%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${cyan}${o("60", "70")} 0%, transparent 55%)`,
          filter: "blur(25px)",
          animation: "meshFloat3 16s ease-in-out infinite reverse",
          willChange: "transform",
        }}
      />

      <div
        style={{
          position: "absolute",
          width: "13vw",
          height: "13vw",
          minWidth: 140,
          minHeight: 140,
          top: "52%",
          right: "18%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${green}${o("50", "65")} 0%, transparent 55%)`,
          filter: "blur(22px)",
          animation: "meshFloat1 19s ease-in-out infinite",
          willChange: "transform",
        }}
      />

      {/* Warm-white specular spot (light mode only) */}
      {!dk && (
        <div
          style={{
            position: "absolute",
            width: "12vw",
            height: "12vw",
            minWidth: 130,
            minHeight: 130,
            top: "15%",
            left: "55%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,252,245,0.75) 0%, rgba(255,252,245,0.28) 30%, transparent 55%)",
            filter: "blur(20px)",
            animation: "meshFloat1 22s ease-in-out infinite",
            willChange: "transform",
          }}
        />
      )}
    </div>
  );
}
