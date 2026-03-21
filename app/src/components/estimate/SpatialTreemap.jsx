/**
 * SpatialTreemap — "Estimate as Architecture"
 * Canvas 2D renderer. Divisions are "rooms" sized by cost weight.
 * Three modes: Blueprint (default), Heat (colored by division), Variance (vs benchmark).
 * Cinematic entrance animation. Click room to drill into line items.
 */
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ── CSI Colors (RGB for canvas) ──
const DIV_RGB = {
  "00": [59,63,81],    "01": [74,78,105],   "02": [139,105,20],
  "03": [156,163,175], "04": [194,69,45],   "05": [75,139,190],
  "06": [184,134,11],  "07": [13,148,136],  "08": [217,119,6],
  "09": [139,92,246],  "10": [107,114,128], "11": [112,128,144],
  "12": [147,112,176], "13": [90,90,122],   "14": [70,130,180],
  "21": [208,64,64],   "22": [37,99,235],   "23": [22,163,74],
  "25": [106,90,205],  "26": [234,179,8],   "27": [100,149,237],
  "28": [205,92,92],   "31": [139,115,85],  "32": [107,142,35],
  "33": [85,107,47],   "34": [105,105,105], "35": [30,144,255],
};
const DEF_RGB = [128, 128, 128];

// Generate a unique deterministic color for any division code not in DIV_RGB
const _colorCache = {};
function getRGB(divId) {
  if (!divId) return DEF_RGB;
  const normId = divId.length === 1 ? "0" + divId : divId;
  if (DIV_RGB[normId]) return DIV_RGB[normId];
  if (DIV_RGB[divId]) return DIV_RGB[divId];
  if (_colorCache[divId]) return _colorCache[divId];
  // Hash the string to get a hue, then convert HSL→RGB for good saturation
  let hash = 0;
  for (let i = 0; i < divId.length; i++) hash = divId.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  const s = 0.55, l = 0.55;
  // HSL to RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (hue < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hue < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hue < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hue < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hue < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const rgb = [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
  _colorCache[divId] = rgb;
  return rgb;
}

// Convert RGB (0-255) to approximate hue (0-360)
function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return h;
}

// Convert HSL to RGB (0-255)
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1, g1, b1;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

const DIV_SYM = {
  "02": "\u2B21", "03": "\u25A4", "04": "\u25A6", "05": "\u2336", "06": "\u2338",
  "07": "\u25C8", "08": "\u25AF", "09": "\u25C7", "10": "\u25CE",
  "22": "\u25C9", "23": "\u25EC", "26": "\u26A1",
};

// ── Squarified treemap ──
function squarify(items, bounds, gap = 8) {
  const rects = [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalVal = sorted.reduce((s, i) => s + i.value, 0);
  if (totalVal <= 0) return rects;
  const bArea = bounds.w * bounds.h;
  let { x, y, w, h } = bounds;
  let remaining = [...sorted];

  while (remaining.length > 0 && w > 1 && h > 1) {
    const isWide = w >= h;
    const side = isWide ? h : w;
    const remTotal = remaining.reduce((s, r) => s + r.value, 0);

    const worst = (row) => {
      const rowSum = row.reduce((s, r) => s + r.value, 0);
      const rowArea = (rowSum / totalVal) * bArea;
      if (side < 1) return Infinity;
      const rowSide = rowArea / side;
      if (rowSide < 0.01) return Infinity;
      let mx = 0;
      for (const r of row) {
        const iArea = (r.value / totalVal) * bArea;
        const iSide = iArea / rowSide;
        mx = Math.max(mx, Math.max(iSide / rowSide, rowSide / iSide));
      }
      return mx;
    };

    let row = [remaining[0]];
    for (let i = 1; i < remaining.length; i++) {
      const nr = [...row, remaining[i]];
      if (worst(nr) <= worst(row)) row = nr;
      else break;
    }

    const rowSum = row.reduce((s, r) => s + r.value, 0);
    const rowFrac = rowSum / remTotal;

    if (isWide) {
      const rw = w * rowFrac;
      let cy = y;
      for (const it of row) {
        const ih = (it.value / rowSum) * h;
        rects.push({ ...it, x: x + gap / 2, y: cy + gap / 2, w: rw - gap, h: ih - gap });
        cy += ih;
      }
      x += rw; w -= rw;
    } else {
      const rh = h * rowFrac;
      let cx = x;
      for (const it of row) {
        const iw = (it.value / rowSum) * w;
        rects.push({ ...it, x: cx + gap / 2, y: y + gap / 2, w: iw - gap, h: rh - gap });
        cx += iw;
      }
      y += rh; h -= rh;
    }
    remaining = remaining.filter(r => !row.includes(r));
  }
  return rects;
}

// ── Helpers ──
function divCode(item) {
  const d = item.division || "";
  if (d.includes(" - ")) return d.split(" - ")[0].trim();
  return (item.code || "").split(".")[0] || "00";
}

function fmtDollar(n) {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "K";
  return "$" + n.toLocaleString();
}

function pctStr(v, t) {
  if (!t) return "";
  const p = (v / t) * 100;
  return p >= 1 ? p.toFixed(1) + "%" : "<1%";
}

// ═══════════════════════════════════════════════════════════
export default function SpatialTreemap() {
  const C = useTheme();
  const T = C.T;
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const projectName = useProjectStore(s => s.project?.name || "");
  const projectCompany = useProjectStore(s => s.project?.company || "");
  const estimateName = useEstimatesStore(s => {
    const id = s.activeEstimateId;
    const e = id ? (s.estimatesIndex || []).find(est => est.id === id) : null;
    return e?.name || "";
  });

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);

  const [mode, setMode] = useState("blueprint");
  const [zoomedDiv, setZoomedDiv] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  // Mutable draw state (no re-renders)
  const drawState = useRef({
    rooms: [], hoveredRoom: null,
    entranceStart: 0, entranceDone: false,
  });

  // ── Division-level data ──
  const divData = useMemo(() => {
    const m = {};
    items.forEach(it => {
      const dc = divCode(it), tot = getItemTotal(it);
      if (!m[dc]) {
        const full = it.division || divFromCode(dc) || dc;
        m[dc] = { id: dc, name: full.includes(" - ") ? full.split(" - ")[1] : full, value: 0, cost: 0, count: 0 };
      }
      m[dc].value += tot; m[dc].cost += tot; m[dc].count++;
    });
    const arr = Object.values(m).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    const total = arr.reduce((s, d) => s + d.value, 0);
    arr.forEach(d => { d.pct = ((d.value / total) * 100).toFixed(1); });
    // Debug: log division codes so we can verify color mapping
    if (arr.length) console.log("[SpatialTreemap] divisions:", arr.map(d => `${d.id}=${d.name} rgb=${getRGB(d.id).join(",")}`));
    return arr;
  }, [items, getItemTotal, divFromCode]);

  const grand = useMemo(() => divData.reduce((s, d) => s + d.value, 0), [divData]);

  // ── Line items for drilled division ──
  const lineData = useMemo(() => {
    if (!zoomedDiv) return [];
    return items
      .filter(it => divCode(it) === zoomedDiv)
      .map(it => ({ id: it.id, name: it.description || "(no desc)", value: getItemTotal(it), cost: getItemTotal(it), label: it.description }))
      .filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [items, zoomedDiv, getItemTotal]);

  // Keep refs current for the draw loop (avoids stale closures)
  const dataRef = useRef({ divData, lineData, grand, zoomedDiv, mode, projectName, projectCompany, estimateName, itemCount: items.length, font: "" });
  dataRef.current = { divData, lineData, grand, zoomedDiv, mode, projectName, projectCompany, estimateName, itemCount: items.length, font: T.font?.sans || "Switzer, sans-serif" };

  // ── Single stable draw loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    let alive = true;

    // Reset entrance on mount
    const ds = drawState.current;
    ds.entranceStart = 0;
    ds.entranceDone = false;

    function frame() {
      if (!alive) return;
      const d = dataRef.current;
      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth;
      const H = container.clientHeight;
      if (W < 10 || H < 10) { rafRef.current = requestAnimationFrame(frame); return; }

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Layout
      const pad = 40;
      const tbW = Math.min(180, W * 0.2);
      const bounds = { x: pad, y: pad + 20, w: W - pad * 2 - tbW - 10, h: H - pad * 2 - 40 };
      if (bounds.w < 50 || bounds.h < 50) { rafRef.current = requestAnimationFrame(frame); return; }

      const data = d.zoomedDiv ? d.lineData : d.divData;
      const gap = d.zoomedDiv ? 6 : 8;
      const sourceItems = data.map(dd => ({ ...dd, label: dd.name || dd.label }));
      const rooms = squarify(sourceItems, bounds, gap);
      rooms.forEach((r, i) => {
        if (!d.zoomedDiv) { r.divId = d.divData[i]?.id || r.id; }
        else { r.divId = d.zoomedDiv; r.subIndex = i; r.subTotal = rooms.length; }
        r.isSub = !!d.zoomedDiv;
      });
      ds.rooms = rooms;

      const now = performance.now();
      const font = d.font;

      ctx.clearRect(0, 0, W, H);

      // Entrance animation
      if (!ds.entranceDone) {
        if (!ds.entranceStart) ds.entranceStart = now;
        const t = Math.min(1, (now - ds.entranceStart) / 1800);

        drawGrid(ctx, W, H);

        if (t < 0.25) {
          drawBoundaryPartial(ctx, bounds, t / 0.25);
        } else if (t < 0.8) {
          drawBoundary(ctx, bounds);
          const rp = (t - 0.25) / 0.55;
          const count = Math.floor(rooms.length * rp);
          for (let i = 0; i < count; i++) {
            const age = (rp - i / rooms.length) * rooms.length;
            const alpha = Math.min(1, age * 2);
            drawRoom(ctx, rooms[i], false, d.mode, font, alpha);
          }
        } else {
          drawBoundary(ctx, bounds);
          rooms.forEach(r => drawRoom(ctx, r, r === ds.hoveredRoom, d.mode, font, 1));
          drawTitleBlock(ctx, W, H, pad, tbW, font, d.grand, d.divData.length, d.itemCount, d.projectName || d.estimateName, d.projectCompany);
        }

        if (t >= 1) ds.entranceDone = true;
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Normal
      drawGrid(ctx, W, H);
      drawBoundary(ctx, bounds);
      rooms.forEach(r => drawRoom(ctx, r, r === ds.hoveredRoom, d.mode, font, 1));
      drawTitleBlock(ctx, W, H, pad, tbW, font, d.grand, d.divData.length, d.itemCount, d.projectName || d.estimateName, d.projectCompany);

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { alive = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []); // stable — reads from refs

  // Reset entrance on data/mode/zoom change
  useEffect(() => {
    const ds = drawState.current;
    ds.entranceStart = 0;
    ds.entranceDone = false;
  }, [mode, zoomedDiv, divData]);

  // ── Mouse ──
  const onMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ds = drawState.current;

    let found = null;
    for (const r of ds.rooms) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) found = r;
    }
    ds.hoveredRoom = found;
    canvas.style.cursor = found && !dataRef.current.zoomedDiv ? "pointer" : "default";

    if (found) {
      setHovered({ name: found.name || found.label, id: found.id || found.divId, cost: found.cost || found.value, pct: found.pct, count: found.count });
      setTooltipPos({ x: e.clientX - rect.left + 16, y: e.clientY - rect.top - 10 });
    } else {
      setHovered(null);
    }
  }, []);

  const onClick = useCallback(() => {
    const ds = drawState.current;
    const d = dataRef.current;
    if (!ds.hoveredRoom) {
      if (d.zoomedDiv) {
        setZoomedDiv(null);
        ds.entranceStart = 0; ds.entranceDone = false;
      }
      return;
    }
    if (!ds.hoveredRoom.isSub && !d.zoomedDiv) {
      setZoomedDiv(ds.hoveredRoom.divId || ds.hoveredRoom.id);
      ds.entranceStart = 0; ds.entranceDone = false;
      setHovered(null);
    }
  }, []);

  // Esc
  useEffect(() => {
    const h = e => {
      if (e.key === "Escape") {
        if (zoomedDiv) { setZoomedDiv(null); drawState.current.entranceStart = 0; drawState.current.entranceDone = false; }
        else if (fullscreen) setFullscreen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [zoomedDiv, fullscreen]);

  // ── Empty state ──
  if (!divData.length) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontFamily: T.font?.sans, textAlign: "center", padding: 40 }}>
        <div>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.15 }}>{"\u2302"}</div>
          <div style={{ fontSize: 13, opacity: 0.5, fontWeight: 500 }}>No cost data yet</div>
          <div style={{ fontSize: 11, opacity: 0.35, marginTop: 4 }}>Add priced items to see the spatial view</div>
        </div>
      </div>
    );
  }

  const zoomedDivData = zoomedDiv ? divData.find(d => d.id === zoomedDiv) : null;
  const font = T.font?.sans || "Switzer, sans-serif";

  return (
    <div style={{
      ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 9999, background: "#08090E" } : { flex: 1, minHeight: 0 }),
      display: "flex", flexDirection: "column", overflow: "hidden", position: fullscreen ? "fixed" : "relative",
    }}>

      {/* Header bar */}
      <div style={{
        height: 36, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", borderBottom: "1px solid #25253A", background: "#08090E", flexShrink: 0,
      }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: font }}>
          <span
            style={{ color: zoomedDiv ? "#52525B" : "#FAFAFA", cursor: zoomedDiv ? "pointer" : "default", transition: "color 0.15s" }}
            onClick={() => { if (zoomedDiv) { setZoomedDiv(null); drawState.current.entranceStart = 0; drawState.current.entranceDone = false; } }}
            onMouseEnter={e => { if (zoomedDiv) e.target.style.color = "#A1A1AA"; }}
            onMouseLeave={e => { if (zoomedDiv) e.target.style.color = "#52525B"; }}
          >
            Estimate Overview
          </span>
          {zoomedDiv && (
            <>
              <span style={{ color: "#25253A" }}>{"\u203A"}</span>
              <span style={{ color: "#FAFAFA", fontWeight: 600 }}>{zoomedDiv} {zoomedDivData?.name}</span>
            </>
          )}
        </div>

        {/* Mode toggle + fullscreen */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", gap: 2, background: "#11111B", borderRadius: 6, padding: 2,
            border: "1px solid #25253A",
          }}>
            {["blueprint", "heat", "variance"].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{
                  padding: "4px 10px", fontSize: 10, fontWeight: 500, fontFamily: font,
                  color: mode === m ? "#FAFAFA" : "#52525B",
                  background: mode === m ? "rgba(124,107,240,0.12)" : "transparent",
                  border: "none", borderRadius: 4, cursor: "pointer", transition: "all 0.15s",
                  textTransform: "capitalize",
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => setFullscreen(f => !f)} title={fullscreen ? "Exit (Esc)" : "Fullscreen"}
            style={{
              width: 26, height: 26, borderRadius: 4, background: "#11111B", border: "1px solid #25253A",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#52525B", fontSize: 13, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#FAFAFA"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#52525B"; }}
          >
            {fullscreen ? "\u2715" : "\u26F6"}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0, background: "#08090E" }}>
        <canvas ref={canvasRef} onMouseMove={onMouseMove} onClick={onClick}
          style={{ display: "block", width: "100%", height: "100%" }}
        />

        {/* Tooltip */}
        {hovered && (
          <div style={{
            position: "absolute", left: tooltipPos.x, top: tooltipPos.y,
            background: "#11111B", border: "1px solid #25253A", borderRadius: 8,
            padding: "10px 14px", pointerEvents: "none", zIndex: 100, minWidth: 160,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4, fontFamily: font }}>
              {hovered.id || ""} {hovered.name || ""}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#7C6BF0", marginBottom: 2, fontFamily: font }}>
              {fmtDollar(hovered.cost)}
            </div>
            <div style={{ fontSize: 11, color: "#A1A1AA", fontFamily: font }}>
              {hovered.pct ? hovered.pct + "% of estimate" : pctStr(hovered.cost, grand) + " of division"}
            </div>
            {hovered.count > 0 && (
              <div style={{ fontSize: 11, color: "#52525B", marginTop: 4, paddingTop: 4, borderTop: "1px solid #25253A", fontFamily: font }}>
                {hovered.count} line items
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div style={{
          position: "absolute", bottom: 12, left: 16, fontSize: 11, color: "#52525B",
          fontFamily: font, zIndex: 10,
        }}>
          <span style={{ background: "#11111B", border: "1px solid #25253A", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>Hover</span>
          {" rooms to inspect \u00B7 "}
          <span style={{ background: "#11111B", border: "1px solid #25253A", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>Click</span>
          {" to zoom in \u00B7 "}
          <span style={{ background: "#11111B", border: "1px solid #25253A", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>Esc</span>
          {" to zoom out"}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Canvas draw functions (pure — no React state)
// ═══════════════════════════════════════════════════════════

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = "rgba(255,255,255,0.015)";
  ctx.lineWidth = 0.5;
  const step = 40;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function drawBoundary(ctx, b) {
  const { x, y, w, h } = b;
  ctx.strokeStyle = "#C8C8D0";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#08090E"; ctx.fill();
    ctx.strokeStyle = "#C8C8D0"; ctx.lineWidth = 1.5; ctx.stroke();
  });
}

function drawBoundaryPartial(ctx, b, t) {
  const { x, y, w, h } = b;
  const totalPerim = 2 * (w + h);
  const drawn = totalPerim * t;
  ctx.strokeStyle = "#C8C8D0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let rem = drawn;
  const topLen = Math.min(rem, w);
  ctx.moveTo(x, y); ctx.lineTo(x + topLen, y); rem -= topLen;
  if (rem > 0) { const rl = Math.min(rem, h); ctx.lineTo(x + w, y + rl); rem -= rl; }
  if (rem > 0) { const bl = Math.min(rem, w); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w - bl, y + h); rem -= bl; }
  if (rem > 0) { const ll = Math.min(rem, h); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h - ll); }
  ctx.stroke();
}

function drawRoom(ctx, r, isHovered, mode, font, alpha) {
  if (alpha <= 0 || r.w < 2 || r.h < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  const ext = 1.5;
  const normId = r.divId && r.divId.length === 1 ? "0" + r.divId : r.divId;
  const rgb = getRGB(r.divId);

  // Fill
  if (mode === "heat") {
    let fr, fg, fb;
    if (r.isSub && r.subTotal > 1) {
      // Shift hue per sub-item within the division — spread across ±40° of base color
      const spread = 60;
      const offset = (r.subIndex / (r.subTotal - 1)) * spread - spread / 2;
      // Convert base RGB to approx hue, shift, convert back
      const baseH = rgbToHue(rgb[0], rgb[1], rgb[2]);
      const newH = ((baseH + offset) % 360 + 360) % 360;
      const s = 0.6, l = 0.55;
      [fr, fg, fb] = hslToRgb(newH, s, l);
    } else {
      fr = rgb[0]; fg = rgb[1]; fb = rgb[2];
    }
    const intensity = isHovered ? 0.40 : 0.25;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},${intensity})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (mode === "variance" && !r.isSub && r.benchmark) {
    const ratio = r.cost / r.benchmark;
    let a = isHovered ? 0.15 : 0.08;
    if (ratio <= 1.05) ctx.fillStyle = `rgba(34,197,94,${a})`;
    else if (ratio <= 1.15) ctx.fillStyle = `rgba(245,158,11,${a})`;
    else ctx.fillStyle = `rgba(239,68,68,${a})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else if (isHovered) {
    ctx.fillStyle = "rgba(124,107,240,0.05)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // Wall lines — tint with division color in heat mode (use fill color for sub-items)
  const wRgb = (mode === "heat" && r.isSub && r.subTotal > 1)
    ? hslToRgb(((rgbToHue(rgb[0], rgb[1], rgb[2]) + ((r.subIndex / (r.subTotal - 1)) * 60 - 30)) % 360 + 360) % 360, 0.6, 0.55)
    : rgb;
  const wallClr = mode === "heat"
    ? (isHovered ? `rgb(${Math.min(255, wRgb[0]+80)},${Math.min(255, wRgb[1]+80)},${Math.min(255, wRgb[2]+80)})` : `rgb(${wRgb[0]},${wRgb[1]},${wRgb[2]})`)
    : (isHovered ? "#FAFAFA" : "#C8C8D0");
  ctx.strokeStyle = wallClr;
  ctx.lineWidth = isHovered ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(r.x - ext, r.y); ctx.lineTo(r.x + r.w + ext, r.y);
  ctx.moveTo(r.x + r.w, r.y - ext); ctx.lineTo(r.x + r.w, r.y + r.h + ext);
  ctx.moveTo(r.x - ext, r.y + r.h); ctx.lineTo(r.x + r.w + ext, r.y + r.h);
  ctx.moveTo(r.x, r.y - ext); ctx.lineTo(r.x, r.y + r.h + ext);
  ctx.stroke();

  // Labels
  ctx.textAlign = "center";
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;

  if (r.w > 60 && r.h > 50) {
    const sym = DIV_SYM[normId] || DIV_SYM[r.divId];
    if (!r.isSub && sym) {
      ctx.font = `10px ${font}`;
      ctx.fillStyle = isHovered ? "#A1A1AA" : "#52525B";
      ctx.textAlign = "left";
      ctx.fillText(sym, r.x + 8, r.y + 18);
      ctx.textAlign = "center";
    }
    if (!r.isSub) {
      ctx.font = `500 10px ${font}`;
      ctx.fillStyle = isHovered ? "#A1A1AA" : "#52525B";
      ctx.fillText(r.id || r.divId || "", cx, cy - 22);
    }
    ctx.font = `600 11px ${font}`;
    ctx.fillStyle = isHovered ? "#FAFAFA" : "#A1A1AA";
    let label = (r.name || r.label || "").toUpperCase();
    const maxW = r.w - 16;
    if (ctx.measureText(label).width > maxW) {
      while (label.length > 3 && ctx.measureText(label + "...").width > maxW) label = label.slice(0, -1);
      label += "...";
    }
    ctx.fillText(label, cx, cy - 6);
    ctx.font = `600 14px ${font}`;
    ctx.fillStyle = isHovered ? "#7C6BF0" : "#FAFAFA";
    ctx.fillText(fmtDollar(r.cost || r.value), cx, cy + 14);
    if (r.pct) {
      ctx.font = `400 10px ${font}`;
      ctx.fillStyle = "#52525B";
      ctx.fillText(r.pct + "%", cx, cy + 30);
    }
  } else if (r.w > 40 && r.h > 30) {
    ctx.font = `500 10px ${font}`;
    ctx.fillStyle = isHovered ? "#FAFAFA" : "#A1A1AA";
    ctx.fillText(r.id || r.divId || (r.name || "").substring(0, 6), cx, cy - 2);
    ctx.font = `500 10px ${font}`;
    ctx.fillStyle = isHovered ? "#7C6BF0" : "#52525B";
    ctx.fillText(fmtDollar(r.cost || r.value), cx, cy + 12);
  }

  // Benchmark overlay
  if (mode === "variance" && r.benchmark && !r.isSub) {
    const ratio = r.benchmark / r.cost;
    const bw = r.w * Math.min(ratio, 1.3);
    const bh = r.h * Math.min(ratio, 1.3);
    const bx = r.x + (r.w - bw) / 2;
    const by = r.y + (r.h - bh) / 2;
    ctx.strokeStyle = "rgba(124,107,240,0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawTitleBlock(ctx, W, H, pad, tbW, font, grand, divCount, itemCount, name, company) {
  const x = W - pad - tbW;
  const y = H - pad - 90;

  ctx.strokeStyle = "#25253A";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, tbW, 80);

  ctx.textAlign = "left";

  ctx.font = `600 11px ${font}`;
  ctx.fillStyle = "#A1A1AA";
  const pName = (name || "Untitled").length > 22 ? (name || "Untitled").substring(0, 22) + "..." : (name || "Untitled");
  ctx.fillText(pName, x + 10, y + 18);

  if (company) {
    ctx.font = `400 10px ${font}`;
    ctx.fillStyle = "#52525B";
    ctx.fillText(company.length > 24 ? company.substring(0, 24) + "..." : company, x + 10, y + 32);
  }

  ctx.font = `600 12px ${font}`;
  ctx.fillStyle = "#7C6BF0";
  ctx.fillText(fmtDollar(grand) + " \u00B7 " + itemCount + " items", x + 10, y + 50);

  ctx.font = `400 10px ${font}`;
  ctx.fillStyle = "#52525B";
  ctx.fillText(divCount + " divisions \u00B7 BLDG Estimating", x + 10, y + 66);
}
