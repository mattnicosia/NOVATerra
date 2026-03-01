// Shared measurement calculation functions
// Used by TakeoffsPage (canvas rendering) and useTakeoffSync (quantity sync)
// scaleCtx = { calibrations, scales, dpi, drawings }

import { nn } from '@/utils/format';
import { PDF_RENDER_DPI, DEFAULT_IMAGE_DPI } from '@/constants/scales';

const unitToTool = (unit) => {
  if (!unit) return "area";
  const u = unit.toUpperCase();
  if (["EA", "LS", "CT"].includes(u)) return "count";
  if (["LF", "LM", "FT", "M", "IN", "CM", "YD"].includes(u)) return "linear";
  return "area";
};

export function getDrawingDpiFromCtx(drawingId, scaleCtx) {
  if (scaleCtx.dpi[drawingId]) return scaleCtx.dpi[drawingId];
  const d = scaleCtx.drawings.find(dr => dr.id === drawingId);
  return d?.type === "pdf" ? PDF_RENDER_DPI : DEFAULT_IMAGE_DPI;
}

export function scaleCodeToPxPerUnit(code, dpi) {
  const archMap = { full: 1, half: 0.5, "3-8": 3 / 8, quarter: 1 / 4, "3-16": 3 / 16, eighth: 1 / 8, "3-32": 3 / 32, sixteenth: 1 / 16 };
  if (archMap[code] !== undefined) return dpi * archMap[code];
  const engMatch = code.match(/^eng(\d+)$/);
  if (engMatch) return dpi / parseInt(engMatch[1]);
  const metricMatch = code.match(/^1:(\d+)$/);
  if (metricMatch) {
    const ratio = parseInt(metricMatch[1]);
    return (dpi / 25.4) * 1000 / ratio;
  }
  return null;
}

export function getPxPerUnit(drawingId, scaleCtx) {
  const cal = scaleCtx.calibrations[drawingId];
  if (cal?.p1 && cal?.p2 && cal?.realDist) {
    const calPxDist = Math.sqrt((cal.p2.x - cal.p1.x) ** 2 + (cal.p2.y - cal.p1.y) ** 2);
    if (calPxDist > 0) return calPxDist / nn(cal.realDist);
  }
  const scaleCode = scaleCtx.scales[drawingId];
  if (scaleCode && scaleCode !== "custom") {
    return scaleCodeToPxPerUnit(scaleCode, getDrawingDpiFromCtx(drawingId, scaleCtx));
  }
  return null;
}

export function hasScaleCtx(drawingId, scaleCtx) {
  return !!getPxPerUnit(drawingId, scaleCtx);
}

export function pxToReal(drawingId, px, scaleCtx) {
  const ppu = getPxPerUnit(drawingId, scaleCtx);
  if (!ppu) return null;
  return px / ppu;
}

export function calcPolylineLengthCtx(points, drawingId, scaleCtx) {
  let totalPx = 0;
  for (let i = 1; i < points.length; i++) {
    totalPx += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
  }
  const real = pxToReal(drawingId, totalPx, scaleCtx);
  return real !== null ? real : totalPx;
}

export function calcPolygonAreaCtx(points, drawingId, scaleCtx) {
  let areaPx = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    areaPx += points[i].x * points[j].y;
    areaPx -= points[j].x * points[i].y;
  }
  areaPx = Math.abs(areaPx) / 2;
  const ppu = getPxPerUnit(drawingId, scaleCtx);
  if (!ppu) return areaPx;
  return areaPx / (ppu * ppu);
}

export function computeMeasurementValueCtx(m, scaleCtx) {
  const did = m.sheetId;
  if (!did) return null;
  if (!hasScaleCtx(did, scaleCtx) && m.type !== "count") return null;
  if (m.type === "count") return nn(m.value) || 1;
  if (m.type === "linear" && m.points?.length >= 2) return Math.round(calcPolylineLengthCtx(m.points, did, scaleCtx) * 100) / 100;
  if (m.type === "area" && m.points?.length >= 3) return Math.round(calcPolygonAreaCtx(m.points, did, scaleCtx) * 100) / 100;
  return null;
}

export function getMeasuredQtyCtx(to, scaleCtx) {
  if (!to?.measurements?.length) return to?.quantity ? nn(to.quantity) : null;
  const tool = unitToTool(to.unit);
  if (tool === "count") {
    return to.measurements.reduce((s, m) => s + nn(m.value || 1), 0);
  }
  let total = 0;
  let anyNull = false;
  for (const m of to.measurements) {
    const v = computeMeasurementValueCtx(m, scaleCtx);
    if (v === null) { anyNull = true; continue; }
    total += v;
  }
  if (anyNull && total === 0) return null;
  return Math.round(total * 100) / 100;
}

// Formula evaluation
function evalFormulaLocal(formula, variables, measured) {
  if (!formula || !formula.trim()) return measured;
  try {
    let expr = formula.trim();
    const vars = [{ key: "Measured", value: measured }, { key: "Qty", value: measured }, ...(variables || [])];
    vars.sort((a, b) => (b.key || "").length - (a.key || "").length);
    vars.forEach(v => { if (v.key) { const re = new RegExp(v.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); expr = expr.replace(re, String(nn(v.value))); } });
    const safe = expr.replace(/[^0-9.+\-*/()% ]/g, "");
    if (!safe.trim()) return measured;
    return Function('"use strict";return (' + safe + ")")();
  } catch { return measured; }
}

export function getComputedQtyCtx(to, scaleCtx) {
  const measured = getMeasuredQtyCtx(to, scaleCtx);
  if (measured === null) return null;
  if (!to.formula || !to.formula.trim()) return measured;
  return evalFormulaLocal(to.formula, to.variables, measured);
}
