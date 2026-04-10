/**
 * useMeasurementEngine — Pure measurement calculation engine
 *
 * Extracted from TakeoffsPage to isolate scale conversion, distance/area
 * calculations, and formula evaluation into a reusable hook.
 *
 * All functions are deterministic given drawing state — no side effects.
 */
import { useCallback, useMemo } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { PDF_RENDER_DPI, DEFAULT_IMAGE_DPI } from "@/constants/scales";
import { nn } from "@/utils/format";
import { evalFormula } from "@/utils/formula";

export { evalFormula };

// ─── Pure helpers (no store deps) ─────────────

/** Map a takeoff unit to its measurement tool type */
export const unitToTool = unit => {
  const u = (unit || "SF").toUpperCase();
  if (["EA", "SET", "PAIR", "BOX", "ROLL", "PALLET", "BAG"].includes(u)) return "count";
  if (["LF", "VLF"].includes(u)) return "linear";
  return "area";
};

/** Convert an architectural scale code to pixels-per-display-unit */
const scaleCodeToPxPerUnit = (code, dpi) => {
  const archMap = {
    full: 1,
    half: 0.5,
    "3-8": 3 / 8,
    quarter: 1 / 4,
    "3-16": 3 / 16,
    eighth: 1 / 8,
    "3-32": 3 / 32,
    sixteenth: 1 / 16,
  };
  if (archMap[code] !== undefined) return dpi * archMap[code];
  const engMatch = code.match(/^eng(\d+)$/);
  if (engMatch) return dpi / parseInt(engMatch[1]);
  const metricMatch = code.match(/^1:(\d+)$/);
  if (metricMatch) {
    const ratio = parseInt(metricMatch[1]);
    return ((dpi / 25.4) * 1000) / ratio;
  }
  return null;
};

// ─── Hook ─────────────

export default function useMeasurementEngine() {
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const selectedDrawingId = useDrawingPipelineStore(s => s.selectedDrawingId);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const drawingDpi = useDrawingPipelineStore(s => s.drawingDpi);
  const tkCalibrations = useDrawingPipelineStore(s => s.tkCalibrations);

  /** Get the DPI for a specific drawing (PDF vs image) */
  const getDrawingDpi = useCallback(
    drawingId => {
      if (drawingDpi[drawingId]) return drawingDpi[drawingId];
      const d = drawings.find(dr => dr.id === drawingId);
      return d?.type === "pdf" ? PDF_RENDER_DPI : DEFAULT_IMAGE_DPI;
    },
    [drawingDpi, drawings],
  );

  /** Get pixels-per-unit for a drawing (calibration takes priority over scale) */
  const getPxPerUnit = useCallback(
    drawingId => {
      const cal = tkCalibrations[drawingId];
      if (cal?.p1 && cal?.p2 && cal?.realDist) {
        const calPxDist = Math.sqrt((cal.p2.x - cal.p1.x) ** 2 + (cal.p2.y - cal.p1.y) ** 2);
        const realDist = nn(cal.realDist);
        if (calPxDist > 0 && realDist > 0) return calPxDist / realDist;
      }
      const scaleCode = drawingScales[drawingId];
      if (scaleCode && scaleCode !== "custom") {
        return scaleCodeToPxPerUnit(scaleCode, getDrawingDpi(drawingId));
      }
      return null;
    },
    [tkCalibrations, drawingScales, getDrawingDpi],
  );

  /** Convert pixel distance to real-world units */
  const pxToReal = useCallback(
    (drawingId, px) => {
      const ppu = getPxPerUnit(drawingId);
      if (!ppu) return null;
      return px / ppu;
    },
    [getPxPerUnit],
  );

  /** Get the display unit for a drawing (ft, m, or px) */
  const getDisplayUnitForDrawing = useCallback(
    drawingId => {
      const cal = tkCalibrations[drawingId];
      if (cal?.unit) return cal.unit;
      const sc = drawingScales[drawingId];
      if (sc && sc !== "custom") {
        if (sc.startsWith("1:")) return "m";
        return "ft";
      }
      return "px";
    },
    [tkCalibrations, drawingScales],
  );

  /** Convert real-world inches to canvas pixels */
  const realToPx = useCallback(
    (drawingId, realInches) => {
      const ppu = getPxPerUnit(drawingId);
      if (!ppu) return null;
      const displayUnit = getDisplayUnitForDrawing(drawingId);
      const realUnits = displayUnit === "m" ? realInches * 0.0254 : realInches / 12;
      return realUnits * ppu;
    },
    [getPxPerUnit, getDisplayUnitForDrawing],
  );

  /** Shorthand: get display unit for the currently selected drawing */
  const getDisplayUnit = useCallback(
    drawingId => getDisplayUnitForDrawing(drawingId || selectedDrawingId),
    [getDisplayUnitForDrawing, selectedDrawingId],
  );

  /** Check if a drawing has a valid scale set */
  const hasScale = useCallback(drawingId => !!getPxPerUnit(drawingId), [getPxPerUnit]);

  /** Calculate total length of a polyline in real-world units */
  const calcPolylineLength = useCallback(
    (points, drawingId) => {
      let totalPx = 0;
      for (let i = 1; i < points.length; i++) {
        totalPx += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
      }
      const real = pxToReal(drawingId, totalPx);
      return real !== null ? real : totalPx;
    },
    [pxToReal],
  );

  /** Calculate polygon area using shoelace formula, in real-world square units */
  const calcPolygonArea = useCallback(
    (points, drawingId) => {
      let areaPx = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        areaPx += points[i].x * points[j].y;
        areaPx -= points[j].x * points[i].y;
      }
      areaPx = Math.abs(areaPx) / 2;
      const ppu = getPxPerUnit(drawingId);
      if (!ppu) return areaPx;
      return areaPx / (ppu * ppu);
    },
    [getPxPerUnit],
  );

  /** Compute value for a single measurement point/region */
  const computeMeasurementValue = useCallback(
    (m, drawingId) => {
      const did = m.sheetId || drawingId;
      if (!hasScale(did) && m.type !== "count") return null;
      if (m.type === "count") return nn(m.value) || 1;
      if (m.type === "linear" && m.points?.length >= 2)
        return Math.round(calcPolylineLength(m.points, did) * 100) / 100;
      if (m.type === "area" && m.points?.length >= 3) return Math.round(calcPolygonArea(m.points, did) * 100) / 100;
      if (m.type === "circle" && m.points?.length === 2) {
        const dx = m.points[1].x - m.points[0].x, dy = m.points[1].y - m.points[0].y;
        const rPx = Math.sqrt(dx * dx + dy * dy);
        const ppu = getPxPerUnit(did);
        if (!ppu) return null;
        const rReal = rPx / ppu;
        return Math.round(Math.PI * rReal * rReal * 100) / 100;
      }
      return null;
    },
    [hasScale, calcPolylineLength, calcPolygonArea, getPxPerUnit],
  );

  /** Aggregate all measurements for a takeoff into a total quantity */
  const getMeasuredQty = useCallback(
    to => {
      if (!to?.measurements?.length) return to?.quantity ? nn(to.quantity) : null;
      const tool = unitToTool(to.unit);
      if (tool === "count") {
        return to.measurements.reduce((s, m) => s + nn(m.value || 1), 0);
      }
      let addTotal = 0, deductTotal = 0;
      let anyNull = false;
      for (const m of to.measurements) {
        const v = computeMeasurementValue(m, selectedDrawingId);
        if (v === null) {
          anyNull = true;
          continue;
        }
        if (m.mode === "deduct") deductTotal += v;
        else addTotal += v;
      }
      if (anyNull && addTotal === 0 && deductTotal === 0) return null;
      return Math.round((addTotal - deductTotal) * 100) / 100;
    },
    [computeMeasurementValue, selectedDrawingId],
  );

  /** Get final computed quantity (measured + formula) */
  const getComputedQty = useCallback(
    to => {
      const measured = getMeasuredQty(to);
      if (measured === null) return null;
      if (!to.formula) return measured;
      return evalFormula(to.formula, to.variables, measured);
    },
    [getMeasuredQty],
  );

  return useMemo(
    () => ({
      getDrawingDpi,
      getPxPerUnit,
      pxToReal,
      realToPx,
      getDisplayUnit,
      hasScale,
      calcPolylineLength,
      calcPolygonArea,
      computeMeasurementValue,
      getMeasuredQty,
      getComputedQty,
    }),
    [
      getDrawingDpi,
      getPxPerUnit,
      pxToReal,
      realToPx,
      getDisplayUnit,
      hasScale,
      calcPolylineLength,
      calcPolygonArea,
      computeMeasurementValue,
      getMeasuredQty,
      getComputedQty,
    ],
  );
}
